import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const item = (id, description, dept, cost, updated) => ({ item_id: id, description, dept, unit_cost: cost, updated_at: updated })
const rows = [
  item('TENT-2P-OLV', 'Two person tent, olive', 'CAMPING', 64.2, '2026-11-09T08:12:00'),
  item('STOVE-GAS-1', 'Single burner gas stove', 'CAMPING', 18.75, '2026-11-12T11:05:00'),
  item('BOOT-HIKE-W38', 'Walking boot, women, size 38', 'FOOTWEAR', 41.0, '2026-11-12T16:40:00'),
]
const marks = { 'plan-watermarks': { 'items-watermark': '2026-11-10T00:00:00' } }

export default {
  id: 'fl-178',
  category: 'flows',
  title: 'Changed Items to the Planning Platform Through an Azure File Share: Write Under a Temporary Name, Rename When Complete, Then Move the Watermark',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'smb', 'master-data', 'watermark', 'object-store', 'temp-file', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The export runs every night at 22:00', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: '0 0 22' } } },
    { label: 'The last watermark is read before the items are selected', rule: { type: 'before', first: 'os-retrieve', then: 'db-select', thenWhere: { sql: 'items' } } },
    { label: 'Only items changed since the watermark are selected', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['updated_at', ':'] } } } },
    { label: 'The file is written under a .tmp name and renamed after the write', rule: { type: 'before', first: 'file-write', firstWhere: { path: '.tmp' }, then: 'file-rename' } },
    { label: 'The watermark moves only after the rename', rule: { type: 'before', first: 'file-rename', then: 'os-store', outside: true } },
  ],
  simulation: {
    systems: { db: { tables: { items: { key: 'item_id', rows } } }, objectStore: marks },
    tests: [
      {
        name: 'Two items changed since the last run',
        about: 'One file with the two changed items appears under its final name. No .tmp file is left, and the watermark moves to the newest change.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/mnt/plan-share/outbound/items/ITEM_*.csv': { count: 1, has: 'BOOT-HIKE-W38' }, '/mnt/plan-share/outbound/items/*.tmp': { count: 0 } },
          stored: [{ store: 'plan-watermarks', key: 'items-watermark', value: '2026-11-12T16:40:00' }],
        },
      },
      {
        name: 'Nothing changed',
        about: 'No item changed since the watermark. No file is written, because an empty file would tell the platform every item was deleted.',
        trigger: { schedule: {} },
        overrides: { systems: { objectStore: { 'plan-watermarks': { 'items-watermark': '2026-11-13T00:00:00' } } } },
        expect: { files: { '/mnt/plan-share/outbound/items/*': { count: 0 } }, stored: [{ store: 'plan-watermarks', key: 'items-watermark', value: '2026-11-13T00:00:00' }] },
      },
      {
        name: 'The share cannot be written',
        about: 'The mount has dropped. The run fails, and the watermark stays where it was, so tomorrow\'s run sends these items again.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: 'CONNECTIVITY' } } },
        expect: { error: 'FILE:CONNECTIVITY', stored: [{ store: 'plan-watermarks', key: 'items-watermark', value: '2026-11-10T00:00:00' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('items-to-planning-share', source('scheduler', { strategy: 'cron', expression: '0 0 22 * * ?' }), [
      step('os-retrieve', { key: 'items-watermark', defaultValue: '2000-01-01T00:00:00', objectStore: 'plan-watermarks' }),
      step('set-variable', { variableName: 'since', value: '#[payload]' }),
      step('db-select', {
        database: 'SQL Server',
        sql: 'SELECT item_id, description, dept, unit_cost, updated_at FROM items WHERE updated_at > :since ORDER BY updated_at',
        inputParameters: '#[{ since: vars.since }]',
      }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No item changes since the last export' })])],
        {
          otherwise: [
            step('set-variable', { variableName: 'newMark', value: '#[payload[-1].updated_at]' }),
            step('set-variable', { variableName: 'fileName', value: '#["ITEM_" ++ (now() as String {format: "yyyyMMddHHmmss"}) ++ ".csv"]' }),
            step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload map ((i) -> { ITEM_ID: i.item_id, DESCRIPTION: i.description, DEPT: i.dept, UNIT_COST: i.unit_cost })' }),
            step('file-write', { path: '#["/mnt/plan-share/outbound/items/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
            step('file-rename', { path: '#["/mnt/plan-share/outbound/items/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
            step('os-store', { key: 'items-watermark', value: '#[vars.newMark]', objectStore: 'plan-watermarks' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, sends item master data to the planning platform: every item that changed, every night. The SQL Server table \`items\` has \`item_id\`, \`description\`, \`dept\`, \`unit_cost\` and \`updated_at\`.

The platform collects files from an **Azure File Share**, folder \`outbound/items\`. On the integration host the share is mounted over SMB at \`/mnt/plan-share\`. The platform polls the folder every few minutes and takes any file that matches \`ITEM_*.csv\`.

Two problems with the old job:
- The platform once took a file while it was still being written and loaded half the items.
- After a failed night, the job had already moved its "last run" time forward, and a day of changes never reached the platform.

**Requirements**
- Every night at 22:00, select the items changed since the last successful export. Keep that time in the Object Store \`plan-watermarks\` under \`items-watermark\`.
- Write the file so the platform can never see it half written. Its final name is \`ITEM_<yyyyMMddHHmmss>.csv\`.
- When nothing changed, write no file.
- Move the watermark only when the file is in place under its final name.

**Design the flow.**
`,
  answerTemplate: `## Picking the changed items

## Writing so the platform never sees half a file

## Moving the watermark

## Nothing changed, and failures
`,
  keyPoints: [
    'A watermark is the newest change already sent. Read it first, select what is newer, and store the newest updated_at you sent.',
    'Write to a name the platform ignores (.tmp), then rename. On one share a rename is a quick metadata change, so the final name appears only when the content is complete.',
    'Store the watermark last. If anything before it fails, the next run selects the same items again: a repeat, never a gap.',
    'Use the newest updated_at from the rows, not now(). A change saved while the job ran would be newer than the select but older than now() and would be skipped.',
    'No file when nothing changed. Some planning loads treat a missing item as a deleted item.',
  ],
  solution: `
1. **Scheduler**, cron \`0 0 22 * * ?\`.
2. **Retrieve** \`items-watermark\` from \`plan-watermarks\`, with an old default for the first run. **Set Variable** \`since\`.
3. **Database Select** \`... WHERE updated_at > :since ORDER BY updated_at\`.
4. **Choice**: no rows, log INFO and stop. Otherwise:
   - **Set Variable** \`newMark\` = the last row's \`updated_at\`, and \`fileName\`.
   - **Transform** to CSV.
   - **File Write** \`/mnt/plan-share/outbound/items/<fileName>.tmp\`.
   - **File Rename** to \`<fileName>\`.
   - **Store** \`newMark\` as \`items-watermark\`.

**Same second changes.** With \`>\` a row saved in the same second as the watermark, after the select, is missed. Some teams use \`>=\` and let the platform ignore a repeated item, which is safer.

**Persistence.** Use a persistent Object Store, so a restart or a redeploy does not reset the watermark and resend every item.
`,
  followUps: [
    {
      q: 'The platform also polls for *.csv in lower case, and Windows does not care about case. Does .tmp still protect you?',
      a: 'Yes, as long as the pattern cannot match .tmp. Agree the pattern with the platform team in writing, because a pattern of * would take the .tmp file too.',
    },
    {
      q: 'Why not keep the watermark in a database table?',
      a: 'That works well, and support can read and reset it with SQL. The Object Store is used here because the app has no table of its own. Either way, it must survive restarts.',
    },
  ],
}
