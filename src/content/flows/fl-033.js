import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-033',
  category: 'flows',
  title: 'Splitting a Large XML File into Per-Region Files',
  level: 'ADVANCED',
  tags: ['file', 'xml', 'streaming', 'splitter', 'foreach', 'memory'],
  estMinutes: 35,
  flowChecks: [
    { label: 'The flow is triggered by the arrival of the XML file', rule: { type: 'source', component: ['file-listener', 'sftp-listener'] } },
    {
      label: 'Sales records are iterated in chunks instead of being grouped all at once',
      rule: { type: 'exists', component: ['foreach', 'batch-job'] },
    },
    {
      label: 'Region files are written inside the iteration',
      rule: { type: 'inside', component: ['file-write', 'sftp-write'], within: ['foreach', 'batch-job'] },
    },
    {
      label: 'Chunks are appended to per-region part files',
      rule: { type: 'exists', component: ['file-write', 'sftp-write'], where: { mode: 'APPEND' } },
    },
    {
      label: 'The output file path is derived from the region',
      rule: { type: 'exists', component: ['file-write', 'sftp-write'], where: { path: 'region' } },
    },
    {
      label: 'The input file is archived only after all region files are written',
      rule: { type: 'before', first: ['file-write', 'sftp-write'], then: ['file-move', 'sftp-move'] },
    },
    {
      label: 'On failure the input file is moved to an error folder',
      rule: { type: 'inside', component: ['file-move', 'sftp-move'], within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'split-sales-by-region',
      source('file-listener', { directory: '/data/sales/in', matcher: 'sales_*.xml' }),
      [
        step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
        step('set-variable', { variableName: 'runDir', value: '#["/data/sales/work/" ++ (attributes.fileName replace ".xml" with "")]' }),
        step('set-variable', { variableName: 'regions', value: '#[[]]' }),
        scope('foreach', { collection: '#[payload.sales.*sale]', batchSize: 2000 }, [
          step('transform', {
            script:
              '%dw 2.0\noutput application/java\n---\npayload groupBy ((s) -> s.@region default "UNKNOWN") pluck ((sales, region) -> { region: region as String, fragment: (sales map (s) -> write({ sale @((s.@)): s }, "application/xml", { writeDeclaration: false })) joinBy "\\n" })',
          }),
          scope('foreach', { collection: '#[payload]', batchSize: 1 }, [
            step('set-variable', { variableName: 'region', value: '#[payload.region]' }),
            step('set-variable', { variableName: 'regions', value: '#[(vars.regions ++ [payload.region]) distinctBy $]' }),
            step('set-payload', { value: '#[payload.fragment ++ "\\n"]' }),
            step('file-write', { path: '#[vars.runDir ++ "/" ++ vars.region ++ ".part"]', mode: 'APPEND' }),
          ]),
        ]),
        scope('foreach', { collection: '#[vars.regions]', batchSize: 1 }, [
          step('set-variable', { variableName: 'region', value: '#[payload]' }),
          step('transform', {
            script:
              '%dw 2.0\noutput text/plain\n---\n"<?xml version=\'1.0\' encoding=\'UTF-8\'?>\\n<sales>\\n" ++ readUrl("file://" ++ vars.runDir ++ "/" ++ vars.region ++ ".part", "text/plain") ++ "</sales>"',
          }),
          step('file-write', { path: '#["/data/sales/out/" ++ vars.region ++ "/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
          step('file-move', {
            sourcePath: '#["/data/sales/out/" ++ vars.region ++ "/" ++ vars.fileName ++ ".tmp"]',
            targetPath: '#["/data/sales/out/" ++ vars.region]',
            renameTo: '#[vars.fileName]',
          }),
        ]),
        step('file-move', { sourcePath: '#["/data/sales/in/" ++ vars.fileName]', targetPath: '/data/sales/archive' }),
        step('logger', { level: 'INFO', message: '#["Split " ++ vars.fileName ++ " into " ++ (sizeOf(vars.regions) as String) ++ " region files"]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Split of " ++ vars.fileName ++ " failed: " ++ error.description]' }),
          step('file-move', { sourcePath: '#["/data/sales/in/" ++ vars.fileName]', targetPath: '/data/sales/error' }),
        ]),
      ],
    ),
  ),
  description: `
Every night the ERP drops one XML file \`sales_YYYYMMDD.xml\` into \`/data/sales/in\`:

\`\`\`xml
<sales>
  <sale region="EMEA" id="..."> ... </sale>
  <sale region="APAC" id="..."> ... </sale>
  ...
</sales>
\`\`\`

- The file is **1.2 GB** with about **3 million** \`<sale>\` elements, from **14 regions**. Records are **not sorted** by region.
- Each regional team needs **its own valid XML file** in \`/data/sales/out/<REGION>/\` by 06:00 (the file arrives around 01:00).
- The Mule worker has **2 GB heap**. Loading the file into memory is not an option.
- The original file is archived after a successful split; on failure it goes to \`/data/sales/error\` and nothing half-written may be published.

**Design the flow(s):**
- How do you read the file without loading 1.2 GB into memory?
- How do you split unsorted records by region when you cannot \`groupBy\` the whole file?
- How do you produce valid XML (one root element) per region file?
- How do you make sure regional teams never pick up a partial file?
`,
  answerTemplate: `## Reading the file

## Splitting by region

## Writing valid region files

## Publishing atomically

## Error handling and archiving
`,
  keyPoints: [
    'Read the file as a repeatable file-store (or non-repeatable) stream and iterate payload.sales.*sale with For Each and a batchSize, so only one chunk is in memory at a time.',
    'Group each chunk by region with DataWeave (small groupBy) and append the fragments to per-region .part files in a work directory.',
    'Write the XML root/declaration around the fragments when the region file is finalised, so each output is valid XML.',
    'Build the parts in a work directory and only move/write to the out directory at the end, so consumers never see partial files.',
    'Archive the input after success and move it to an error folder on failure; the work directory for the run is cleaned up or overwritten on retry.',
  ],
  solution: `
**Flow \`split-sales-by-region\`**
1. **File On New or Updated File** \`/data/sales/in/sales_*.xml\` with a **file-store repeatable stream** (or non-repeatable). Set the XML reader to streaming so DataWeave can iterate \`<sale>\` elements lazily: XML needs both \`streaming=true\` and \`collectionPath=sales.sale\` on the MIME type.
2. Variables: \`fileName\`, \`runDir = /data/sales/work/<file>\`, and \`regions\` (the set of regions seen so far).
3. **For Each** over \`payload.sales.*sale\` with **batchSize 2000**. Each iteration holds 2,000 records, not 3 million:
   - **Transform** \`groupBy region\` on just this chunk → list of \`{ region, fragment }\`.
   - Inner **For Each** → **File Write** \`<runDir>/<region>.part\` mode **APPEND** (and add the region to \`vars.regions\`).
4. **Finalise:** For Each region → write \`/data/sales/out/<REGION>/<file>\`: \`<?xml ...?><sales>\` + the part contents (streamed) + \`</sales>\`. Write to a temporary name and rename, so consumers never see a half-written file.
5. **File Move** the input to \`/data/sales/archive\`, then log a summary.
6. **Error handler:** log, move the input to \`/data/sales/error\`, delete \`runDir\`. A failure during the split publishes nothing to \`out\`, because finalising is the last step. If finalising itself can fail half-way, write every \`.tmp\` file first and do all the renames at the end.

Do **not** use Parallel For Each for the append step: two threads appending to the same region file would interleave bytes. If more speed is needed, process regions in parallel instead, one writer per file.
`,
  followUps: [
    {
      q: 'Why not just groupBy the whole payload?',
      a: 'groupBy needs every record in memory to build the groups. 3 million parsed XML elements would need several GB of heap and cause an OutOfMemoryError. Chunked iteration keeps memory flat.',
    },
    {
      q: 'Could a Batch Job do this?',
      a: 'Yes. Batch streams records into persistent queues and a Batch Aggregator can append per-region chunks. It adds restartability and record-level error tracking, at the cost of disk I/O. For a pure split with no per-record logic, a streaming For Each is simpler.',
    },
    {
      q: 'How would you make the job restartable halfway?',
      a: 'Use the run ID as the work directory name and record progress (last processed chunk) in an Object Store. On restart either resume from that chunk or wipe the work directory and start over, which is simpler and safe because nothing was published.',
    },
  ],
}
