import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-088',
  category: 'flows',
  title: 'Carrier XML Manifests to JSON and CSV with a Reject File and No Silent Overwrites',
  level: 'ADVANCED',
  tags: ['file', 'xml', 'json', 'csv', 'logistics', 'data-formats', 'error-handling'],
  estMinutes: 35,
  flowChecks: [
    {
      label: 'The listener waits for the manifest to finish arriving (timeBetweenSizeCheck)',
      rule: { type: 'source', component: 'file-listener', where: { timeBetweenSizeCheck: { gte: 1 } } },
    },
    { label: 'The XML is validated against the XSD before it is transformed', rule: { type: 'before', first: 'xml-validate', then: 'transform' } },
    { label: 'Both outputs refuse to replace an existing file (mode CREATE_NEW)', rule: { type: 'exists', component: 'file-write', where: { mode: 'CREATE_NEW' }, min: 2 } },
    { label: 'A CSV output is produced with DataWeave', rule: { type: 'exists', component: 'transform', where: { script: 'application/csv' } } },
    {
      label: 'An output that already exists is handled (FILE:FILE_ALREADY_EXISTS in a Try)',
      rule: { type: 'handler', component: 'on-error-continue', errorType: 'FILE:FILE_ALREADY_EXISTS', within: 'try' },
    },
    { label: 'A reject file is written only when there are rejected rows', rule: { type: 'inside', component: 'file-write', within: 'choice', where: { path: 'reject' } } },
    { label: 'The manifest is archived after the outputs are written', rule: { type: 'before', first: 'file-write', then: 'file-move' } },
    {
      label: 'A manifest that fails the XSD is moved to the rejects folder',
      rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'rejects' } },
    },
  ],
  referenceFlow: design(
    flow(
      'carrier-manifest-converter',
      source('file-listener', { directory: '/data/manifests/in', matcher: '*.xml', postAction: 'none', timeBetweenSizeCheck: 3000, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'baseName', value: '#[attributes.fileName replace /\\.xml$/ with ""]' }),
        step('set-variable', { variableName: 'duplicate', value: '#[false]' }),
        step('xml-validate', { schemas: 'schemas/carrier-manifest-v3.xsd', schemaLanguage: 'W3C' }),
        step('transform', {
          target: 'variable',
          variableName: 'parsed',
          script:
            '%dw 2.0\noutput application/java\nvar doc = read(payload.^raw, "application/xml")\nfun isValid(s) = (not isEmpty(s.TrackingNo)) and ((s.WeightKg as Number default 0) > 0)\nvar shipments = (doc.Manifest.*Shipment default []) map (s) -> {\n  trackingNo: s.TrackingNo,\n  weightKg: s.WeightKg,\n  destination: s.Destination,\n  valid: isValid(s)\n}\n---\n{\n  manifestId: doc.Manifest.@id,\n  valid: (shipments filter $.valid) map ($ - "valid"),\n  invalid: (shipments filter (not $.valid)) map ($ - "valid")\n}',
        }),
        scope(
          'try',
          {},
          [
            step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ manifestId: vars.parsed.manifestId, shipments: vars.parsed.valid }' }),
            step('file-write', { path: '#["/data/manifests/out/json/" ++ vars.baseName ++ ".json"]', mode: 'CREATE_NEW' }),
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\nvars.parsed.valid' }),
            step('file-write', { path: '#["/data/manifests/out/csv/" ++ vars.baseName ++ ".csv"]', mode: 'CREATE_NEW' }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'FILE:FILE_ALREADY_EXISTS' }, [
                step('logger', { level: 'WARN', message: '#["Output already exists for " ++ vars.baseName ++ ", treating as a duplicate manifest"]' }),
                step('set-variable', { variableName: 'duplicate', value: '#[true]' }),
              ]),
            ],
          },
        ),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.duplicate]' }, [
              step('file-move', {
                sourcePath: '#[vars.filePath]',
                targetPath: '/data/manifests/duplicates',
                renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.baseName ++ ".xml"]',
              }),
            ]),
            route({ expression: '#[not isEmpty(vars.parsed.invalid)]' }, [
              step('transform', { script: '%dw 2.0\noutput application/csv\n---\nvars.parsed.invalid' }),
              step('file-write', { path: '#["/data/manifests/out/rejects/" ++ vars.baseName ++ ".rejects.csv"]', mode: 'OVERWRITE' }),
              step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/data/manifests/archive' }),
            ]),
          ],
          { otherwise: [step('file-move', { sourcePath: '#[vars.filePath]', targetPath: '/data/manifests/archive' })] },
        ),
      ],
      [
        handler('on-error-continue', { type: 'XML-MODULE:SCHEMA_NOT_HONOURED, XML-MODULE:INVALID_INPUT_XML' }, [
          step('logger', { level: 'ERROR', message: '#["Manifest failed XSD validation: " ++ vars.baseName ++ ": " ++ error.description]' }),
          step('file-move', {
            sourcePath: '#[vars.filePath]',
            targetPath: '/data/manifests/rejects',
            renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.baseName ++ ".xml"]',
          }),
        ]),
      ],
    ),
  ),
  description: `
A freight forwarder receives shipment manifests from **30 carriers** as XML files in \`/data/manifests/in\`, about **1,500 files a day** of up to 5,000 shipments. Carriers upload through a slow gateway, and large files take over a minute to arrive.

\`\`\`xml
<Manifest id="M-20261103-118">
  <Shipment><TrackingNo>ZX100</TrackingNo><WeightKg>12.4</WeightKg><Destination>NL</Destination></Shipment>
</Manifest>
\`\`\`

Two systems need the data: the tracking portal wants **JSON** in \`out/json\` and the billing system wants **CSV** in \`out/csv\`. Both use the manifest's file name with their own extension.

**Requirements**
- Do not read a manifest until the upload has finished.
- A file that breaks the XSD (\`carrier-manifest-v3.xsd\`) is moved to \`/data/manifests/rejects\` as a whole.
- A shipment with no tracking number or a weight of zero or less must not reach either system. The XSD allows these, so they are checked in the flow. Rejected shipments go to a **reject file**, \`out/rejects/<name>.rejects.csv\`, and the good shipments still go through.
- Billing has already invoiced from some outputs, so **an existing output file must never be replaced**. Carriers sometimes re-send a manifest with the same name. Such a manifest goes to \`/data/manifests/duplicates\` for review.
- Processed manifests go to \`/data/manifests/archive\`.

**Design the flow.** Say what \`timeBetweenSizeCheck\` does, where it can be set, and how the flow reacts when an output already exists.
`,
  answerTemplate: `## Waiting for the upload

## File-level validation

## Record-level validation

## Writing the outputs

## When an output already exists

## Reject file and archive
`,
  keyPoints: [
    'timeBetweenSizeCheck waits between two size comparisons and treats the file as ready when both match. It can be set on the config, listener, read and list operations, and not on the matcher.',
    'If no value is set the check is skipped. It also delays each read, so size it to the slowest pause in an upload, not to the whole transfer time.',
    'There are two levels of rejection: an XSD failure rejects the file, and a business rule failure rejects a row.',
    'Mode CREATE_NEW raises an error if the file already exists, so the protection is in the write step itself. OVERWRITE, the default, would silently replace an invoiced output.',
    'FILE:FILE_ALREADY_EXISTS is caught in a Try around the writes, which sets a flag so the flow can route the manifest to duplicates.',
    'Checking with a File List before writing would leave a gap between the check and the write. CREATE_NEW has no such gap.',
    'The reject file is written only when there are rejected rows, so an empty file does not suggest a problem that does not exist.',
  ],
  solution: `
**Waiting for the upload.** **File Listener** on \`/data/manifests/in\`, \`*.xml\`, with \`timeBetweenSizeCheck\` of 3 seconds. The connector waits that long between two size comparisons and considers the file ready if they match. If they differ, the file is still being written. The File Read page says the read then fails with an error, and the listener documentation covers only the matching case, so test what the listener does with such a file. The time unit can be set alongside it. The setting is available on the config, listener, read and list, and if no value is provided the check is skipped. The reference notes that the check runs only when the content is accessed, which here is the validation step. It is a heuristic: a gateway that pauses for longer than the wait can still deliver a partial file, and the XSD step then catches most of those.

**Flow:**
1. **Set Variables**: \`filePath\`, \`baseName\` and \`duplicate = false\`.
2. **XML Validate Schema** with the XSD. A failure goes to the flow-level **On Error Continue**, which moves the file to \`rejects\`.
3. **Transform** to \`vars.parsed\`: read the XML with \`read(payload.^raw, "application/xml")\` (an \`.xml\` file may already be typed from its extension, and \`read\` accepts only a String or Binary), use \`.*Shipment\` for the repeating element, and split the shipments into \`valid\` and \`invalid\`.
4. **Try** around the two outputs:
   - **Transform** to JSON and **File Write** with mode \`CREATE_NEW\`.
   - **Transform** to CSV and **File Write** with mode \`CREATE_NEW\`.
   - **On Error Continue** for \`FILE:FILE_ALREADY_EXISTS\` logs a warning and sets \`duplicate = true\`.
5. **Choice** after the Try:
   - Duplicate: **File Move** to \`duplicates\` with a timestamped name. No reject file is written, because the manifest was not processed.
   - Rejected rows: **Transform** to CSV, **File Write** the reject file, then **File Move** to \`archive\`.
   - Default: **File Move** to \`archive\`.

**Why CREATE_NEW and not a check first?** File Write in CREATE_NEW mode creates a new file and gives an error if it exists. A File List before writing would add a step and still leave a moment when another process could create the file. The rule is enforced at the point of the write.

**Partial outputs.** If the JSON is new but the CSV already exists, the JSON has been written when the error occurs. This is rare, because the outputs are created together. If it matters, see the follow-up on temporary names.

**Other errors.** A disk failure is not handled here, so the manifest stays in \`in\` for support to look at. The listener documentation describes Auto Delete, Move To Directory and a watermark as the ways a file counts as new, and does not spell out what happens to a file left in place, so confirm in a test whether it is picked up again. On any retry, a JSON output written by the failed attempt would be seen as a duplicate, so a check of the \`duplicates\` folder is part of the runbook.
`,
  followUps: [
    {
      q: 'How would you make the two outputs appear together or not at all?',
      a: 'Write both to temporary names first, then File Rename each to the final name, with Overwrite left false so a clash still raises FILE:FILE_ALREADY_EXISTS. Consumers then only see final names, and the window for a half-finished pair is much smaller.',
    },
    {
      q: 'Why is a check for FILE:FILE_LOCK not part of this flow?',
      a: 'That error belongs to the read operation when locking is used. This flow reads through the listener, and write errors are the concern here. A separate File Read with Lock enabled would need that handling.',
    },
    {
      q: 'What if the same manifest name is legitimately reused each day?',
      a: 'Then the name is not a unique key. Build output names from the manifest id or add the date. CREATE_NEW still protects you, but only if the name identifies the content.',
    },
    {
      q: 'The carrier sends a corrected manifest and billing agrees to replace the old output. How do you support that?',
      a: 'Keep CREATE_NEW as the default and add a controlled path: an operator moves the file from duplicates to a separate folder, and a flow there writes with OVERWRITE, or to a versioned name, and logs who approved it.',
    },
  ],
}
