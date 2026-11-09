import { design, flow, handler, route, router, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-086',
  category: 'flows',
  title: 'Mixed Inbound Folder: JSON, CSV and XML to One Order Shape, Unknown Files to Quarantine',
  level: 'INTERMEDIATE',
  tags: ['file', 'json', 'csv', 'xml', 'data-formats', 'choice', 'archive'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The File Listener waits for files to finish arriving (size check)',
      rule: { type: 'source', component: 'file-listener', where: { timeBetweenSizeCheck: { gte: 1 } } },
    },
    { label: 'A Choice has a route for each known format (three conditions)', rule: { type: 'routes', component: 'choice', min: 3 } },
    { label: 'Each format is normalised with DataWeave inside the Choice', rule: { type: 'inside', component: 'transform', within: 'choice' } },
    {
      label: 'The CSV route reads the content as CSV with the semicolon separator',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'transform', where: { script: 'application/csv' } },
          { type: 'exists', component: 'transform', where: { script: 'separator' } },
        ],
      },
    },
    { label: 'The XML route reads the content as XML', rule: { type: 'exists', component: 'transform', where: { script: 'application/xml' } } },
    {
      label: 'Unknown file types go to the quarantine folder',
      rule: { type: 'inside', component: ['file-move', 'file-copy'], within: 'choice', where: { targetPath: 'quarantine' } },
    },
    {
      label: 'Each input file gets its own output in /data/normalised, not appended to a shared file',
      rule: { type: 'exists', component: 'file-write', where: { path: 'normalised', mode: { not: 'APPEND' } } },
    },
    {
      label: 'The source file is archived after the output is written',
      rule: { type: 'before', first: 'file-write', then: ['file-move', 'file-copy'], thenWhere: { targetPath: 'archive' } },
    },
    {
      label: 'Archived files get a unique name, so a same-named file next week does not collide',
      rule: {
        type: 'exists',
        component: ['file-move', 'file-copy'],
        where: { targetPath: 'archive', renameTo: { oneOf: ['now()', 'uuid', 'timestamp', 'correlationId'] } },
      },
    },
    {
      label: 'A file that cannot be parsed is moved out by the error handler',
      rule: { type: 'inside', component: 'file-move', within: 'on-error-continue', where: { targetPath: 'quarantine' } },
    },
  ],
  referenceFlow: design(
    flow(
      'partner-order-intake',
      // The listener has no post action: the sub-flow and the handler decide where each file goes.
      source('file-listener', { directory: '/data/inbound', matcher: '*.*', postAction: 'none', timeBetweenSizeCheck: 2000, watermarkMode: 'DISABLED' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
        step('set-variable', { variableName: 'ext', value: '#[lower((attributes.fileName splitBy ".")[-1])]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.ext == "json"]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar doc = read(payload.^raw, "application/json")\n---\n{\n  sourceFile: vars.fileName,\n  sourceFormat: "JSON",\n  orders: doc.orders map (o) -> {\n    orderId: o.id,\n    customerId: o.customer,\n    amount: o.total as Number,\n    currency: o.ccy\n  }\n}',
              }),
              step('flow-ref', { name: 'write-and-archive' }),
            ]),
            route({ expression: '#[vars.ext == "csv"]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar rows = read(payload.^raw, "application/csv", {separator: ";"})\n---\n{\n  sourceFile: vars.fileName,\n  sourceFormat: "CSV",\n  orders: rows map (r) -> {\n    orderId: r.order_no,\n    customerId: r.cust_id,\n    amount: r.net_amount as Number,\n    currency: r.currency\n  }\n}',
              }),
              step('flow-ref', { name: 'write-and-archive' }),
            ]),
            route({ expression: '#[vars.ext == "xml"]' }, [
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\nvar doc = read(payload.^raw, "application/xml")\n---\n{\n  sourceFile: vars.fileName,\n  sourceFormat: "XML",\n  orders: (doc.Orders.*Order default []) map (o) -> {\n    orderId: o.@id,\n    customerId: o.Customer,\n    amount: o.Total as Number,\n    currency: o.Total.@currency\n  }\n}',
              }),
              step('flow-ref', { name: 'write-and-archive' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', { level: 'WARN', message: '#["Unknown file type, quarantined: " ++ vars.fileName]' }),
              step('file-move', {
                sourcePath: '#[vars.filePath]',
                targetPath: '/data/quarantine',
                renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Could not process " ++ vars.fileName ++ ": " ++ error.description]' }),
          step('file-move', {
            sourcePath: '#[vars.filePath]',
            targetPath: '/data/quarantine',
            renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]',
          }),
        ]),
      ],
    ),
    subFlow('write-and-archive', [
      step('file-write', { path: '#["/data/normalised/" ++ vars.fileName ++ ".json"]', mode: 'OVERWRITE' }),
      step('file-move', {
        sourcePath: '#[vars.filePath]',
        targetPath: '/data/archive',
        renameTo: '#[(now() as String {format: "yyyyMMddHHmmss"}) ++ "-" ++ vars.fileName]',
      }),
    ]),
  ),
  description: `
A wholesale distributor receives orders from about **60 trading partners** into one shared folder, \`/data/inbound\`. Partners never agreed on a format, so the folder holds a mix of about **2,000 files a day**:

- \`.json\`: \`{ "orders": [{ "id": "...", "customer": "...", "total": 120.50, "ccy": "EUR" }] }\`
- \`.csv\`: semicolon separated, with the header \`order_no;cust_id;net_amount;currency\`
- \`.xml\`: \`<Orders><Order id="..."><Customer>...</Customer><Total currency="EUR">120.50</Total></Order></Orders>\`

Now and then a \`.pdf\`, \`.xlsx\` or \`.tmp\` file turns up as well. Some partners upload slowly over a network share, so a file can appear before it is complete.

The order system only wants **one JSON shape**:

\`\`\`json
{ "sourceFile": "...", "sourceFormat": "CSV", "orders": [{ "orderId": "...", "customerId": "...", "amount": 120.5, "currency": "EUR" }] }
\`\`\`

**Requirements**
- Write the normalised JSON to \`/data/normalised\`, one output per input file.
- Keep every processed source file in \`/data/archive\`.
- Unknown types, and files that cannot be parsed, go to \`/data/quarantine\` for a person to review.
- A same-named file from a partner next week must not collide in the archive.

**Design the flow.**
`,
  answerTemplate: `## Picking up files safely

## Deciding the format

## Normalising each format

## Writing and archiving

## Unknown and broken files
`,
  keyPoints: [
    'timeBetweenSizeCheck makes the connector compare the file size twice before reading, which protects against partial files.',
    'The file attributes hold the file name and path, so the extension is taken from attributes.fileName and lower-cased. .CSV and .csv must take the same route.',
    'A Choice has one route per format, and the default route handles unknown types. Nothing is silently ignored.',
    'Each route uses read() on payload.^raw with the right format and its reader properties (a semicolon separator for CSV), then maps to the same shape. read() only takes a String or Binary, and the connector types the payload from the file extension, so read(payload, ...) fails on a payload already parsed as JSON, CSV or XML.',
    'Common write-and-archive logic sits in one sub-flow, so all three routes behave the same.',
    'Archive only after the write. Without a post action the file stays in the folder until the flow moves it, which is what makes the order of the steps meaningful.',
    'Keep archive and quarantine outside the watched folder, because the listener is recursive by default.',
    'A timestamp in the Rename To value avoids FILE:FILE_ALREADY_EXISTS when the same name returns, since Overwrite is false by default.',
  ],
  solution: `
1. **File Listener** on \`/data/inbound\` with \`timeBetweenSizeCheck\` of 2 seconds. Recursive is true by default, so \`archive\` and \`quarantine\` are siblings of \`inbound\`, not subfolders. No post action on the listener: moving the file is part of the flow.
2. **Set Variables** \`fileName\`, \`filePath\` and a lower-case \`ext\`.
3. **Choice** on \`ext\`:
   - \`json\`: \`read(payload.^raw, "application/json")\` and map \`id\`, \`customer\`, \`total\`, \`ccy\`. The connector tries to set the MIME type from the file extension, so \`payload\` itself may already be parsed, and \`read\` accepts only a String or Binary. \`.^raw\` gives it the underlying content.
   - \`csv\`: \`read(payload.^raw, "application/csv", {separator: ";"})\`. The default separator is a comma, so without this every row would be one column. The header is present by default.
   - \`xml\`: \`read(payload.^raw, "application/xml")\`, using \`.*Order\` for the repeating element and \`.@id\` for attributes. The \`.*\` selector returns an array even if there is one order.
   - default: **File Move** to \`/data/quarantine\`.
4. Each known route calls the **sub-flow** \`write-and-archive\`: **File Write** to \`/data/normalised\`, then **File Move** to \`/data/archive\` with a timestamped name.
5. **On Error Continue** at flow level moves the file to quarantine. A malformed JSON file with the right extension ends up here, as does a CSV with a value that is not a number.

**Extension or MIME type?** The extension is the simplest reliable signal here. The file attributes hold the name and path, and they have no separate content type field. If partners mislabel files, a parse failure in a known route still lands in quarantine, so the outcome is safe. You could also check the first bytes of the file (\`{\`, \`<\`) to detect the format.

**Why not use Move To Directory on the listener?** Apply Post Action When Failed defaults to true, so the file would go to the archive even after a failure, which is the wrong folder here. The explicit moves also let one file go to two different places, depending on the outcome.

**Why does \`.tmp\` go to quarantine rather than being ignored?** It is a design choice that keeps every file accounted for. If partners always upload as \`.tmp\` and rename, the matcher can exclude those names, which is cleaner.
`,
  followUps: [
    {
      q: 'What happens if the write succeeds and the archive move fails?',
      a: 'The error handler tries to move the file to quarantine. If that also fails, the file stays in inbound. The write mode is OVERWRITE, so processing it again rewrites the same output and does not duplicate it. Test whether the listener picks up a file left in place, because the documentation does not state it.',
    },
    {
      q: 'A fourth format arrives: fixed width from an old system. What changes?',
      a: 'One more Choice route with a Transform that reads application/flatfile with a schema definition, mapped to the same shape. The sub-flow and the consumers do not change, which is the benefit of normalising early.',
    },
    {
      q: 'Why not use watermarks so files are read only once?',
      a: 'The flow removes every file from the folder, which already makes each file in the next poll a new one. A watermark only picks files created or updated after the last poll, so it would pass over a file that was left behind by a failure. Watermarks suit folders where files must stay in place.',
    },
    {
      q: 'How would several workers share this folder?',
      a: 'The listener should run on one node (Primary Node Only in a cluster), otherwise two workers can pick up the same file. If throughput becomes a problem, hand the work to a queue after pick-up.',
    },
  ],
}
