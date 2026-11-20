import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const linesFor = (store, n) => Array.from({ length: n }, (_, i) => ({ store, sku: `SKU-${store}-${String(i + 1).padStart(5, '0')}`, units: (i % 4) + 1 }))
// 25,000 rows: store 0102 crosses two batch boundaries when the rows are read 10,000 at a time
const rows = [...linesFor('0101', 9000), ...linesFor('0102', 12000), ...linesFor('0103', 4000)]
const tables = { sales_line: { rows } }
const out = '/inbound/store-sales'

export default {
  id: 'fl-290',
  category: 'flows',
  title: 'One Sales File per Store From Twenty Five Million Rows: Read in Store Order, Group Each Batch by Store, Append to Each Store\'s File With One Header, and Write the Control File Last',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'split-files', 'append', 'streaming', 'sftp', 'control-file', 'planning'],
  estMinutes: 50,
  flowChecks: [
    { label: 'The rows are read in store order with a fetch size', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['sales_line', 'ORDER BY store'] }, fetchSize: { gte: 1 } } } },
    { label: 'A For Each takes the rows in batches of at least 10,000', rule: { type: 'exists', component: 'foreach', where: { batchSize: { gte: 10000 } } } },
    { label: 'A store\'s later lines are appended to its file', rule: { type: 'exists', component: 'sftp-write', where: { mode: 'APPEND' } } },
    { label: 'Each store file is renamed from .tmp after every batch is written', rule: { type: 'before', first: 'sftp-write', firstWhere: { mode: 'APPEND' }, then: 'sftp-rename', outside: true } },
    { label: 'The control file is written after the renames', rule: { type: 'before', first: 'sftp-rename', then: 'sftp-write', thenWhere: { path: '.ctl' }, outside: true } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A day of three stores',
        about: 'Store 0102\'s 12,000 lines arrive across three batches. They all end up in its one file, with one header, and the control file gives each store\'s count.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: {
            [`${out}/SALES_0102_20261113.csv`]: { has: 'store,sku,units\n0102,SKU-0102-00001,1' },
            [`${out}/SALES_0102_*.csv`]: { has: '0102,SKU-0102-12000,4' },
            [`${out}/SALES_0101_20261113.csv`]: { has: '0101,SKU-0101-09000' },
            [`${out}/SALES_*_20261113.csv`]: { count: 3 },
            [`${out}/*.tmp`]: { count: 0 },
            [`${out}/SALES_20261113.ctl`]: { has: '0102|12000' },
          },
        },
      },
      {
        name: 'The SFTP server is down',
        about: 'Nothing can be written, so no control file appears and the platform loads nothing.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'sftp' } } },
        expect: { error: 'SFTP:CONNECTIVITY', files: { [`${out}/*.ctl`]: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('store-sales-split', source('scheduler', { strategy: 'cron', expression: '0 0 3 * * ?' }), [
      step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMdd"}]' }),
      step('set-variable', { variableName: 'parts', value: '#[[]]' }),
      step('db-select', { database: 'SQL Server', sql: 'SELECT store, sku, units FROM dbo.sales_line ORDER BY store, sku', fetchSize: 5000 }),
      scope('foreach', { collection: '#[payload]', batchSize: 10000 }, [
        step('set-variable', { variableName: 'groups', value: '#[(payload groupBy $.store) pluck ((lines, store) -> { store: store as String, lines: lines })]' }),
        scope('foreach', { collection: '#[vars.groups]', batchSize: 1 }, [
          step('set-variable', { variableName: 'store', value: '#[payload.store]' }),
          step('set-variable', { variableName: 'fresh', value: '#[isEmpty(vars.parts filter ($.store == vars.store))]' }),
          step('set-variable', { variableName: 'parts', value: '#[vars.parts ++ [{ store: vars.store, rows: sizeOf(payload.lines) }]]' }),
          step('set-variable', { variableName: 'tmpPath', value: `#["${out}/SALES_" ++ vars.store ++ "_" ++ vars.stamp ++ ".csv.tmp"]` }),
          step('set-payload', { value: '#[(if (vars.fresh) "store,sku,units\\n" else "") ++ ((payload.lines map ($.store ++ "," ++ $.sku ++ "," ++ ($.units as String))) joinBy "\\n") ++ "\\n"]' }),
          router('choice', {}, [route({ expression: '#[vars.fresh]' }, [step('sftp-write', { path: '#[vars.tmpPath]', mode: 'OVERWRITE' })])], {
            otherwise: [step('sftp-write', { path: '#[vars.tmpPath]', mode: 'APPEND' })],
          }),
        ]),
      ]),
      step('set-variable', { variableName: 'totals', value: '#[(vars.parts groupBy $.store) pluck ((v, k) -> { store: k as String, rows: sum(v.rows) })]' }),
      scope('foreach', { collection: '#[vars.totals]', batchSize: 1 }, [
        step('sftp-rename', { path: `#["${out}/SALES_" ++ payload.store ++ "_" ++ vars.stamp ++ ".csv.tmp"]`, to: '#["SALES_" ++ payload.store ++ "_" ++ vars.stamp ++ ".csv"]' }),
      ]),
      step('set-payload', { value: '#[(vars.totals map ($.store ++ "|" ++ ($.rows as String))) joinBy "\\n"]' }),
      step('sftp-write', { path: `#["${out}/SALES_" ++ vars.stamp ++ ".ctl"]`, mode: 'OVERWRITE' }),
    ]),
  ),
  description: `
Thornbury Home & Garden, a fictional garden and DIY retailer, sends yesterday's till lines to the planning platform at 03:00: about **25 million rows** from \`dbo.sales_line\` (\`store\`, \`sku\`, \`units\`) in SQL Server, for 600 stores.

The platform now wants **one file per store** on its **SFTP server**, folder \`/inbound/store-sales\`:
- Named \`SALES_<store>_<yyyyMMdd>.csv\`, with the header \`store,sku,units\` once, at the top.
- Files ending in \`.tmp\` are ignored.
- A control file \`SALES_<yyyyMMdd>.ctl\`, written last, lists \`<store>|<rows>\` for every store sent.

A big store has 400,000 lines, a small one 3,000. The first try read the whole table and ran \`groupBy\` on it: the worker ran out of memory at 6 GB.

**Requirements**
- Read the rows so they stream, in store order, and work through them a batch at a time.
- A store's lines can be split across two or more batches. They must still end up in **one** file, with **one** header.
- Write each store's file under a \`.tmp\` name and rename it when all its lines are in.
- Write the control file last.

**Facts**
- The date in the names is today's date. In the tests today is 2026-11-13.
- Read with a fetch size, and take the rows in a **For Each** with a batch size of at least 10,000.
- Write each store file as \`<file name>.tmp\`, such as \`SALES_0102_20261113.csv.tmp\`. A store's first write uses \`OVERWRITE\` with the header; later writes use \`APPEND\`. End every write with a line break, so appended lines start on a new line.
- Put each \`<store>|<rows>\` entry of the control file on its own line.
- Do not catch an SFTP error. The run fails and no control file is written.

**Design the flow.**
`,
  answerTemplate: `## Streaming in store order

## A batch at a time

## Appending without a second header

## Renaming and the control file
`,
  keyPoints: [
    'ORDER BY store makes each store\'s lines arrive together, so a store spans at most a few batches in a row. groupBy then works on one batch, never the whole day.',
    'For Each with a batch size over a streamed select holds one batch at a time. Memory depends on the batch size, not the 25 million rows.',
    'The first group of a store creates its file with the header; later groups APPEND without it. A small list of { store, rows } tells you which stores have begun.',
    'Rename only after the last batch. A store\'s file is never visible to the platform while lines may still be added to it.',
    'The control file sums the rows per store from the same list. It is written last and is what the platform waits for.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 3 * * ?\`. **Set Variable** \`stamp\` and \`parts\` = \`[]\`.
2. **Database Select** \`... ORDER BY store, sku\`, fetch size 5000.
3. **For Each** (batch size 10,000):
   - **Set Variable** \`groups\` = \`(payload groupBy $.store) pluck ...\`.
   - **For Each** group:
     - **Set Variable** \`store\`, \`fresh\` (no part for this store yet), add \`{ store, rows }\` to \`parts\`, \`tmpPath\`.
     - **Set Payload** the lines, with the header first when \`fresh\`.
     - **Choice**: fresh: **SFTP Write** OVERWRITE; otherwise **SFTP Write** APPEND.
4. **Set Variable** \`totals\` per store. **For Each** store: **SFTP Rename** \`.tmp\` to \`.csv\`.
5. **Set Payload** the control lines, **SFTP Write** the \`.ctl\`.

**Batch size.** Ten thousand rows keep each pass small; larger batches mean fewer appends. Many small appends over a slow link cost time, so measure with a real day before you settle on a size.
`,
  followUps: [
    {
      q: 'The run fails after 300 stores. What does a rerun do?',
      a: 'The failed run renamed nothing, since renames come after the last batch, so it left only .tmp files the platform ignores. The first write of each store uses OVERWRITE, so the rerun starts each .tmp file again from its header, and the control file appears only at the end of the good run.',
    },
    {
      q: 'Why not write each store\'s file with its own query, WHERE store = :store?',
      a: 'That works and reads well, but it is 600 queries, and each must find its rows with an index on store. One ordered scan reads the table once. Pick by what the database handles better.',
    },
  ],
}
