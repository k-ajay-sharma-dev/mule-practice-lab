import { design, flow, scope, route, router, source, step } from '../../flow/dsl.js'

const dir = '/mnt/planning/outbound/grades'
const snapshots = {
  [`${dir}/STORE_GRADES_20261111.csv`]: 'store,grade\n0101,B\n0102,B\n0103,C',
  [`${dir}/STORE_GRADES_20261112.csv`]: 'store,grade\n0101,B\n0102,A\n0103,C',
  [`${dir}/STORE_GRADES_20261113.csv`]: 'store,grade\n0101,A\n0102,A\n0103,C',
}
const tables = { store_grade: { key: 'store', columns: ['store', 'grade'], rows: [{ store: '0101', grade: 'B' }, { store: '0102', grade: 'B' }] } }

export default {
  id: 'fl-275',
  category: 'flows',
  title: 'Store Grades From a Mounted Azure File Share: Load Only the Newest of Several Daily Snapshots, Replace the Table in One Transaction, Then Archive Every Snapshot',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'file', 'snapshot', 'sql-server', 'transaction', 'planning'],
  estMinutes: 25,
  flowChecks: [
    { label: 'The snapshots in the grades folder are listed', rule: { type: 'exists', component: 'file-list', where: { directoryPath: 'grades' } } },
    { label: 'The old grades are deleted and the new ones inserted inside one transaction', rule: { type: 'all', rules: [{ type: 'inside', component: 'db-delete', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'store_grade' } }, { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'store_grade' } }] } },
    { label: 'The snapshots are archived after the load', rule: { type: 'before', first: 'db-bulk-insert', then: 'file-move' } },
  ],
  simulation: {
    systems: { db: { tables }, files: snapshots },
    tests: [
      {
        name: 'Three snapshots waiting',
        about: 'The platform wrote a snapshot on each of the last three days. Only the newest is loaded, and all three go to the archive.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          db: { store_grade: { count: 3, has: [{ store: '0101', grade: 'A' }, { store: '0103', grade: 'C' }], lacks: [{ store: '0101', grade: 'B' }] } },
          files: { [`${dir}/*.csv`]: { count: 0 }, [`${dir}/archive/STORE_GRADES_*.csv`]: { count: 3 } },
        },
      },
      {
        name: 'Nothing new',
        about: 'The folder is empty. The table keeps yesterday\'s grades and nothing fails.',
        trigger: { schedule: {} },
        overrides: { systems: { files: Object.fromEntries(Object.keys(snapshots).map((k) => [k, null])) } },
        expect: { noError: true, db: { store_grade: { count: 2, has: [{ store: '0101', grade: 'B' }] } } },
      },
      {
        name: 'SQL Server refuses the load',
        about: 'The insert fails after the delete. The delete is rolled back, so the stores keep yesterday\'s grades, and the snapshots stay for the next run.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.store_grade', fault: 'QUERY_EXECUTION' }] } } },
        expect: { error: 'DB:QUERY_EXECUTION', db: { store_grade: { count: 2 } }, files: { [`${dir}/*.csv`]: { count: 3 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('store-grades-in', source('scheduler', { strategy: 'cron', expression: '0 0 6 * * ?' }), [
      step('file-list', { directoryPath: dir, matcher: 'STORE_GRADES_*.csv', recursive: 'false' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(payload)]' }, [step('logger', { level: 'INFO', message: 'No store grade snapshot today' })])],
        {
          otherwise: [
            step('set-variable', { variableName: 'files', value: '#[payload orderBy $.attributes.fileName]' }),
            step('file-read', { path: '#[vars.files[-1].attributes.path]', outputMimeType: 'application/csv' }),
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              step('db-delete', { database: 'SQL Server', sql: 'DELETE FROM dbo.store_grade', target: 'cleared' }),
              step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.store_grade (store, grade) VALUES (:store, :grade)' }),
            ]),
            scope('foreach', { collection: '#[vars.files]', batchSize: 1 }, [step('file-move', { sourcePath: '#[payload.attributes.path]', targetPath: `${dir}/archive` })]),
            step('logger', { level: 'INFO', message: '#["Loaded " ++ vars.files[-1].attributes.fileName ++ ", archived " ++ (sizeOf(vars.files) as String) ++ " file(s)"]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, gets a **store grade** for each store from the planning platform (A, B or C, used to size the shelves). The platform writes a full snapshot to an **Azure File Share** each night, folder \`outbound/grades\`, named \`STORE_GRADES_<yyyyMMdd>.csv\`:

\`\`\`
store,grade
0101,A
0102,A
\`\`\`

Brindle's Mule runtime for this job runs **on premises** on a Linux host that mounts the share over SMB at \`/mnt/planning\`. CloudHub cannot mount SMB shares, which is why this job runs on that host.

The grades go to \`dbo.store_grade\` (\`store\`, \`grade\`) in SQL Server. The job runs at 06:00. After a long weekend outage, three snapshots were waiting. The old job loaded them one by one, in the order the file system listed them, and Tuesday ended with Saturday's grades.

**Requirements**
- Each snapshot is a **full** picture. Load only the **newest** one; older ones are out of date.
- Replace the table so it is never half loaded: if the load fails, the stores keep the old grades.
- Move **every** snapshot found to \`outbound/grades/archive\` after a good load, so the folder does not fill up.
- An empty folder is normal.

**Facts**
- If the load fails, let the error end the run and leave every snapshot in the folder.

**What each system sends back**
- File List on \`/mnt/planning/outbound/grades\` gives a list of messages, one per file, in no set order. Each has \`attributes.fileName\` (\`STORE_GRADES_20261113.csv\`) and \`attributes.path\` (the full path). An empty folder gives \`[]\`.
- File Read with output type \`application/csv\` gives a list of rows: \`[ { "store": "0101", "grade": "A" } ]\`.

**What failures look like**
- SQL Server refuses the insert: the Bulk Insert raises \`DB:QUERY_EXECUTION\`. The transaction rolls back the delete, no file is moved, and the run ends with that error.

**Design the flow.**
`,
  answerTemplate: `## Finding the newest snapshot

## Replacing the grades

## Archiving
`,
  keyPoints: [
    'A full snapshot makes older ones worthless. Pick the newest by the date in its name, not by the order the listing returns.',
    'yyyyMMdd in the name sorts the same as a string and as a date, so orderBy on the file name is enough.',
    'Delete and insert in one transaction. If the insert fails, the delete is rolled back and the table keeps yesterday\'s grades.',
    'Archive after the load. A failed run leaves the snapshots where they were, and the next run picks the newest again.',
    'An SMB mount needs a host that can mount it, such as an on premises runtime. On CloudHub the share is reached through its REST API instead.',
  ],
  solution: `
1. **Scheduler** cron \`0 0 6 * * ?\`.
2. **File List** \`/mnt/planning/outbound/grades\`, pattern \`STORE_GRADES_*.csv\`.
3. **Choice**:
   - empty: **Logger** INFO.
   - otherwise:
     - **Set Variable** \`files\` = \`payload orderBy $.attributes.fileName\`.
     - **File Read** \`vars.files[-1].attributes.path\` as CSV.
     - **Try** (ALWAYS_BEGIN): **Database Delete** \`dbo.store_grade\`, **Bulk Insert** the rows.
     - **For Each** file in \`vars.files\`: **File Move** to \`archive\`.

**Large tables.** For a few hundred stores a delete and insert is fine. For millions of rows, load a second table and swap it in, or MERGE, so readers are not blocked for long.
`,
  followUps: [
    {
      q: 'Why not trust the modified time of the files instead of the name?',
      a: 'Copying or restoring files on the share can change the modified time. The date in the name is what the platform meant. Use the time only when names carry no date.',
    },
    {
      q: 'The platform is still writing tonight\'s snapshot at 06:00. What happens?',
      a: 'The job could read half a file. Ask the platform to write under a temporary name and rename it, or check that the size stays the same over a short wait before reading.',
    },
  ],
}
