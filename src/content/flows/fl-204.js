import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const change = (change_id, store, sku, on_hand, changed_at_utc) => ({ change_id, store, sku, on_hand, changed_at_utc })
const rows = [
  change(7001, '0412', '4410021', 96, '2026-11-13T05:40:00'),
  change(7002, '0412', '4410187', 12, '2026-11-13T08:10:00'),
  change(7003, '0415', '4410021', 55, '2026-11-13T09:30:00'),
  change(7004, '0415', '4410300', 30, '2026-11-13T10:20:00'),
]
const tables = {
  inventory_changes: { key: 'change_id', rows },
  extract_watermark: { key: 'extract_name', rows: [{ extract_name: 'INVENTORY_DELTA', last_until_utc: '2026-11-13T06:00:00' }] },
}

export default {
  id: 'fl-204',
  category: 'flows',
  title: 'Inventory Changes to the Planning Platform Over FTP With a UTC Watermark: Fix the Window Before the Query, and Move the Watermark Only After the File Is Written',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'watermark', 'delta', 'time-zones', 'sql-server', 'outbound', 'planning'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The last watermark is read from dbo.extract_watermark', rule: { type: 'exists', component: 'db-select', where: { sql: 'extract_watermark' } } },
    { label: 'Changes are selected between the watermark and an upper bound fixed before the query', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['inventory_changes', ':since', ':until'] } } } },
    { label: 'The delta file is written to /inbound/inventory', rule: { type: 'exists', component: 'ftp-write', where: { path: '/inbound/inventory/' } } },
    { label: 'The watermark moves only after the file is written', rule: { type: 'before', first: 'ftp-write', then: 'db-update', thenWhere: { sql: 'extract_watermark' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A normal half hour',
        about: 'The run starts at 10:00 UTC. Changes after 06:00 and up to 10:00 go out. The 10:20 change is for the next run, and the watermark becomes 10:00, not the time of the newest row.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          files: { '/inbound/inventory/INV_DELTA_*.csv': { count: 1, has: '4410187' } },
          db: { extract_watermark: { has: [{ extract_name: 'INVENTORY_DELTA', last_until_utc: '2026-11-13T10:00:00' }] } },
        },
      },
      {
        name: 'The FTP server is down',
        about: 'No file can be written, so the watermark stays at 06:00 and the next run sends the same changes.',
        trigger: { schedule: {} },
        overrides: { systems: { files: { fault: true, faultOn: 'ftp' } } },
        expect: { error: 'FTP:CONNECTIVITY', db: { extract_watermark: { has: [{ last_until_utc: '2026-11-13T06:00:00' }] } } },
      },
      {
        name: 'Nothing changed',
        about: 'No change falls in the window. No file is written, and the watermark still moves to 10:00 so the window does not grow for ever.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: { inventory_changes: { key: 'change_id', rows: [rows[0], rows[3]] } } } } },
        expect: { files: { '/inbound/inventory/*': { count: 0 } }, db: { extract_watermark: { has: [{ last_until_utc: '2026-11-13T10:00:00' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('inventory-delta-to-planning', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'MINUTES' }), [
      step('set-variable', { variableName: 'until', value: '#[(now() >> "UTC") as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('db-select', { database: 'SQL Server', sql: "SELECT last_until_utc FROM dbo.extract_watermark WHERE extract_name = 'INVENTORY_DELTA'", target: 'wm' }),
      step('set-variable', { variableName: 'since', value: '#[vars.wm[0].last_until_utc]' }),
      step('db-select', {
        database: 'SQL Server',
        sql: 'SELECT change_id, store, sku, on_hand, changed_at_utc FROM dbo.inventory_changes WHERE changed_at_utc > :since AND changed_at_utc <= :until ORDER BY change_id',
        inputParameters: '#[{ since: vars.since, until: vars.until }]',
      }),
      router('choice', {}, [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: '#["No inventory changes up to " ++ vars.until]' })])], {
        otherwise: [
          step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload map ((c) -> c - "change_id")' }),
          step('ftp-write', { path: '#["/inbound/inventory/INV_DELTA_" ++ (vars.until replace ":" with "") ++ ".csv"]', mode: 'OVERWRITE' }),
        ],
      }),
      step('db-update', {
        database: 'SQL Server',
        sql: "UPDATE dbo.extract_watermark SET last_until_utc = :until WHERE extract_name = 'INVENTORY_DELTA'",
        inputParameters: '#[{ until: vars.until }]',
      }),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, sends stock changes to the planning platform every half hour. Each change is a row in the SQL Server table \`dbo.inventory_changes\` (\`change_id\`, \`store\`, \`sku\`, \`on_hand\`, \`changed_at_utc\`). The column is in **UTC**. The stores span two time zones, and the Mule runtime runs in UTC as well.

The last point sent is kept in \`dbo.extract_watermark\` (\`extract_name\` = \`INVENTORY_DELTA\`, \`last_until_utc\`). The platform reads files from its **FTP server**, folder \`/inbound/inventory\`, named \`INV_DELTA_<time>.csv\`.

The old job took "changes since the watermark", then set the watermark to the newest \`changed_at_utc\` it saw. Support found changes that were never sent.

**Requirements**
- Fix the end of the window (now, in UTC) before the query, and send changes after the watermark and up to that point.
- Write the file only when there are changes.
- Move the watermark to the end of the window, and only after the file is written.

**Design the flow.** Explain how the old job lost changes.
`,
  answerTemplate: `## The window

## Why the old job lost changes

## Writing the file and moving the watermark

## Time zones
`,
  keyPoints: [
    'A window has two ends. The upper bound is taken once, before the query, and becomes the next watermark.',
    'Setting the watermark to the newest row seen can skip a row that committed later with an earlier timestamp, from a transaction still open during the query.',
    'Move the watermark after the write. A failed write then means the next run resends, not loses.',
    'Keep everything in UTC: the column, the bound and the watermark. Store local times only for people to read.',
    'An empty window still moves the watermark, so the next query does not scan an ever longer range.',
  ],
  solution: `
1. **Scheduler** every 30 minutes.
2. **Set Variable** \`until\` = now in UTC, as text in the column's format.
3. **Database Select** the watermark into \`vars.wm\`; **Set Variable** \`since\`.
4. **Database Select** \`changed_at_utc > :since AND changed_at_utc <= :until\`.
5. **Choice**: nothing found, log. Otherwise **Transform** to CSV and **FTP Write** \`INV_DELTA_<until>.csv\`.
6. **Database Update** the watermark to \`until\`.

**Late commits.** A transaction that started at 09:59 and commits at 10:01 carries 09:59 but was not visible at 10:00. A small overlap (send from since minus 5 minutes) catches it, and the platform must accept a change twice. A rowversion column avoids clock times altogether.
`,
  followUps: [
    {
      q: 'Daylight saving ends tonight. What happens to a job whose watermark is in local time?',
      a: 'The clock goes back an hour, so an hour of local times repeats. A watermark in local time can then skip or resend an hour. In UTC nothing repeats.',
    },
    {
      q: 'Why send the file under a name built from the window end?',
      a: 'A rerun of the same window writes the same name, so the platform sees a replacement, not a second file with the same changes.',
    },
  ],
}
