import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const dir = '/outbound/alloc'
const alloc = (seq) => `${dir}/ALLOC_${seq}.csv`
const csv = (seq) => `alloc_id,store,sku,qty\nA${seq}-1,S014,LAMP-OAK-01,6\nA${seq}-2,S022,LAMP-OAK-01,4`
const wms = [{ method: 'POST', path: '/wms/v1/allocations', respond: { status: 202, body: { status: 'QUEUED' } } }]
const seqTable = (last) => ({ alloc_sequence: { key: 'feed', rows: [{ feed: 'ALLOC', last_seq: last }] } })

export default {
  id: 'fl-195',
  category: 'flows',
  title: 'Allocations From the Planning Platform Must Reach the Warehouse in Order: Apply SFTP Files by Sequence Number, Stop at a Gap, and Set Aside Replays',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'ordering', 'sequence', 'plans', 'wms', 'planning'],
  estMinutes: 45,
  flowChecks: [
    { label: 'The allocation folder is listed on a schedule', rule: { type: 'all', rules: [{ type: 'source', component: 'scheduler' }, { type: 'exists', component: 'sftp-list', where: { directoryPath: dir } }] } },
    { label: 'The last sequence applied is read from alloc_sequence', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'alloc_sequence' }, then: 'foreach' } },
    { label: 'Files are sorted by their sequence number before the loop', rule: { type: 'exists', component: 'transform', where: { script: { all: ['orderBy', 'seq'] } } } },
    { label: 'Only the next number in line is applied', rule: { type: 'routes', component: 'choice', routeWhere: { expression: '+ 1' } } },
    { label: 'After the WMS accepts a file, the sequence moves on and the file is archived', rule: { type: 'all', rules: [{ type: 'before', first: 'http-request', then: 'db-update', thenWhere: { sql: 'alloc_sequence' } }, { type: 'before', first: 'db-update', then: 'sftp-move', thenWhere: { targetPath: 'archive' } }] } },
    { label: 'A file already applied is moved to replayed', rule: { type: 'inside', component: 'sftp-move', within: 'choice', where: { targetPath: 'replayed' } } },
  ],
  simulation: {
    systems: { files: { [alloc(41)]: csv(41), [alloc(42)]: csv(42) }, http: wms, db: { tables: seqTable(40) } },
    tests: [
      {
        name: 'Two files in order',
        about: 'The last applied is 40. Files 41 and 42 are posted in that order, the sequence ends at 42, and both are archived.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/wms/v1/allocations', count: 2 }],
          db: { alloc_sequence: { has: [{ feed: 'ALLOC', last_seq: 42 }] } },
          files: { '/outbound/alloc/archive/ALLOC_41.csv': { exists: true }, '/outbound/alloc/archive/ALLOC_42.csv': { exists: true } },
        },
      },
      {
        name: 'A gap in the numbers',
        about: 'File 42 has not arrived, but 43 has. File 41 is applied. File 43 waits on the server, because applying it before 42 would undo part of 42.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [alloc(42)]: null, [alloc(43)]: csv(43) } } },
        expect: {
          calls: [{ method: 'POST', path: '/wms/v1/allocations', count: 1 }],
          db: { alloc_sequence: { has: [{ feed: 'ALLOC', last_seq: 41 }] } },
          files: { [alloc(43)]: { exists: true } },
          logs: [{ level: 'WARN', has: '43' }],
        },
      },
      {
        name: 'An old file is sent again',
        about: 'The platform resends 39, which was applied long ago. It is not posted, and goes to the replayed folder.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { [alloc(41)]: null, [alloc(42)]: null, [alloc(39)]: csv(39) } } },
        expect: { calls: [{ method: 'POST', path: '/wms/v1/allocations', count: 0 }], files: { '/outbound/alloc/replayed/ALLOC_39.csv': { exists: true } } },
      },
    ],
  },
  referenceFlow: design(
    flow('allocations-in-sequence', source('scheduler', { strategy: 'fixed-frequency', frequency: 10, timeUnit: 'MINUTES' }), [
      step('sftp-list', { directoryPath: dir, matcher: 'ALLOC_*.csv', recursive: 'false' }),
      step('transform', {
        script:
          '%dw 2.0\noutput application/java\n---\n(payload map ((f) -> { path: f.attributes.path, fileName: f.attributes.fileName, seq: ((f.attributes.fileName splitBy "_")[1] replace ".csv" with "") as Number, rows: read(f.payload as String, "application/csv") })) orderBy ((f) -> f.seq)',
      }),
      step('set-variable', { variableName: 'files', value: '#[payload]' }),
      step('db-select', { database: 'SQL Server', sql: "SELECT last_seq FROM alloc_sequence WHERE feed = 'ALLOC'" }),
      step('set-variable', { variableName: 'lastSeq', value: '#[payload[0].last_seq]' }),
      scope('foreach', { collection: '#[vars.files]' }, [
        step('set-variable', { variableName: 'file', value: '#[payload]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.file.seq == vars.lastSeq + 1]' }, [
              step('set-payload', { value: '#[{ sequence: vars.file.seq, allocations: vars.file.rows }]' }),
              step('http-request', { method: 'POST', path: '/wms/v1/allocations', responseTimeout: 30000 }),
              step('db-update', { database: 'SQL Server', sql: "UPDATE alloc_sequence SET last_seq = :seq WHERE feed = 'ALLOC'", inputParameters: '#[{ seq: vars.file.seq }]' }),
              step('sftp-move', { sourcePath: '#[vars.file.path]', targetPath: '/outbound/alloc/archive' }),
              step('set-variable', { variableName: 'lastSeq', value: '#[vars.file.seq]' }),
            ]),
            route({ expression: '#[vars.file.seq <= vars.lastSeq]' }, [
              step('logger', { level: 'WARN', message: '#[vars.file.fileName ++ " was applied before, moved to replayed"]' }),
              step('sftp-move', { sourcePath: '#[vars.file.path]', targetPath: '/outbound/alloc/replayed' }),
            ]),
          ],
          {
            otherwise: [step('logger', { level: 'WARN', message: '#["Waiting for allocation " ++ ((vars.lastSeq + 1) as String) ++ " before " ++ vars.file.fileName]' })],
          },
        ),
      ]),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional homewares retailer, gets store allocations back from the planning platform: how many of each item the warehouse should pick for each store. The platform writes numbered files to Marrow & Pine's **SFTP server**, folder \`/outbound/alloc\`: \`ALLOC_41.csv\`, \`ALLOC_42.csv\` and so on.

\`\`\`
alloc_id,store,sku,qty
A41-1,S014,LAMP-OAK-01,6
\`\`\`

A later file can change an earlier one, so the warehouse system must apply them **in number order**. Mule posts each file to \`POST /wms/v1/allocations\` as \`{ "sequence": 41, "allocations": [ ... ] }\`.

The SQL Server table \`alloc_sequence\` (\`feed\`, \`last_seq\`) holds the last number applied, under \`feed = 'ALLOC'\`. Folders \`archive\` and \`replayed\` exist under \`/outbound/alloc\`.

What happens in practice:
- Uploads can arrive out of order: 43 before 42.
- After an outage on its side, the platform sometimes resends files it sent days ago.

**Requirements**
- Every 10 minutes, list the files and work through them in number order.
- Apply only the next number after \`last_seq\`. After the WMS accepts it, store the new number and archive the file.
- If the next number is missing, stop there and log a warning. Later files wait on the server.
- A file whose number is already applied goes to \`replayed\` without being posted.

**Design the flow.**
`,
  answerTemplate: `## Where the order comes from

## Sorting and the next number

## A gap

## Replays

## Failures in the middle
`,
  keyPoints: [
    'Arrival order is not business order. The sequence number in the name is the order, so sort by it, not by time or name.',
    'Keep the last number applied in a table. It survives restarts and tells support exactly where the feed stands.',
    'Apply only last + 1. When the next file is missing, everything after it waits, because applying 43 before 42 would leave the warehouse with 42\'s older numbers on top.',
    'Update the stored number in the loop after each file, so the next file in the same run sees it.',
    'A number at or below the last applied is a replay. Set it aside, so it is seen once and never applied twice.',
  ],
  solution: `
1. **Scheduler** every 10 minutes.
2. **SFTP List** \`/outbound/alloc\`, \`ALLOC_*.csv\`.
3. **Transform**: for each file its path, name, \`seq\` from the name, and its rows; order by \`seq\`. **Set Variable** \`files\`.
4. **Database Select** \`last_seq\`, **Set Variable** \`lastSeq\`.
5. **For Each** file, **Choice**:
   - \`seq == lastSeq + 1\`: **Set Payload**, **HTTP Request** POST, **Database Update** \`last_seq\`, **SFTP Move** to \`archive\`, **Set Variable** \`lastSeq\`.
   - \`seq <= lastSeq\`: WARN, **SFTP Move** to \`replayed\`.
   - Otherwise: WARN naming the missing number.

**The WMS fails on 41.** The error ends the run. \`last_seq\` is still 40, so the next run starts again at 41. Nothing after 41 is applied in the meantime.

**A gap that never fills.** Alert when the same number has been missing for an hour. Support asks the platform to resend it, or, with the planners' agreement, moves \`last_seq\` on by hand.
`,
  followUps: [
    {
      q: 'The WMS accepts 41, then Mule stops before the update. What happens?',
      a: 'The next run posts 41 again. Ask the WMS to ignore a sequence it has already applied, or keep its own last sequence and answer "already applied".',
    },
    {
      q: 'Why not use the SFTP listener here?',
      a: 'The listener hands over one file at a time in no promised order. Ordering needs to see every waiting file at once, which a List gives.',
    },
  ],
}
