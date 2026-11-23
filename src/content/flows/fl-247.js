import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'LOYALTY_MEMBERS_20261113.csv'
const file = `/loyalty/in/${name}`
const clean = 'member_id,email,store,points\nM-1001,ana@mail.example,0101,120\nM-1002,ben@mail.example,0102,40\nM-1003,cleo@mail.example,0101,310'
const oneBad = 'member_id,email,store,points\nM-1001,ana@mail.example,0101,120\nM-1002,,0102,40\nM-1003,cleo@mail.example,0101,310'
const tables = {
  loyalty_members: { key: 'member_id', columns: ['member_id', { name: 'email', notNull: true }, 'store', 'points'], rows: [] },
}

export default {
  id: 'fl-247',
  category: 'flows',
  title: 'Loyalty Members Into SQL Server Through a Batch Job: Set Max Failed Records So One Bad Row Does Not Stop the Whole Load, and Log the Counts From On Complete',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'sql-server', 'max-failed-records', 'on-complete', 'sftp'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Member files are picked up from /loyalty/in once their size is stable', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/loyalty/in', timeBetweenSizeCheck: { gte: 1 } } } },
    { label: 'Each member is inserted into dbo.loyalty_members from a batch step', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', where: { sql: 'loyalty_members' } } },
    { label: 'On Complete logs the successful and failed counts', rule: { type: 'inside', component: 'logger', within: 'batch-job', inSlot: 'onComplete', where: { message: { all: ['successfulRecords', 'failedRecords'] } } } },
    { label: 'The file is moved to /loyalty/done after the job is started', rule: { type: 'before', first: 'batch-job', then: 'sftp-move', thenWhere: { targetPath: '/loyalty/done' }, outside: true } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables } },
    tests: [
      {
        name: 'A clean file',
        about: 'All three members load, the log says loaded=3 failed=0, and the file moves to done.',
        trigger: { file: { path: file } },
        expect: {
          noError: true,
          db: { loyalty_members: { count: 3 } },
          logs: [{ level: 'INFO', has: 'loaded=3 failed=0' }],
          files: { [`/loyalty/done/${name}`]: { exists: true } },
        },
      },
      {
        name: 'A file with one bad row',
        about: 'Member M-1002 has no email, so the database refuses it. The job carries on: M-1001 and M-1003 load and the log says failed=1.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: {
          db: { loyalty_members: { count: 2, has: [{ member_id: 'M-1001' }, { member_id: 'M-1003' }] } },
          logs: [{ level: 'INFO', has: 'loaded=2 failed=1' }],
        },
      },
    ],
  },
  referenceFlow: design(
    flow('loyalty-members-load', source('sftp-listener', { directory: '/loyalty/in', matcher: 'LOYALTY_MEMBERS_*.csv', postAction: 'none', timeBetweenSizeCheck: 20000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      router(
        'batch-job',
        { jobName: 'loyalty-members-load', blockSize: 100, maxFailedRecords: -1 },
        [
          route({ name: 'insert-member', acceptPolicy: 'NO_FAILURES' }, [
            step('transform', { script: '%dw 2.0\noutput application/java\n---\n{ member_id: payload.member_id, email: if (isBlank(payload.email)) null else payload.email, store: payload.store, points: payload.points as Number }' }),
            step('db-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.loyalty_members (member_id, email, store, points) VALUES (:member_id, :email, :store, :points)', inputParameters: '#[payload]' }),
          ]),
        ],
        {
          onComplete: [step('logger', { level: 'INFO', message: '#["Loyalty load done: loaded=" ++ (payload.successfulRecords as String) ++ " failed=" ++ (payload.failedRecords as String)]' })],
        },
      ),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/loyalty/done', overwrite: 'true' }),
    ]),
  ),
  description: `
Marrow & Pine Home, a fictional home furnishings retailer, gets its loyalty members from a loyalty vendor every night. The vendor drops \`LOYALTY_MEMBERS_<date>.csv\` on Marrow & Pine's **SFTP server**, folder \`/loyalty/in\`. A file holds about **800,000 rows**:

\`\`\`
member_id,email,store,points
M-1001,ana@mail.example,0101,120
\`\`\`

The rows go to the SQL Server table \`dbo.loyalty_members\` (key \`member_id\`, \`email\` NOT NULL, \`store\`, \`points\`). A Batch Job inserts each member.

Last Tuesday row 212 had no email. The database refused it, and the whole job stopped there. The other 799,000 members were not loaded, and nobody knew until the store tills showed old points.

**Requirements**
- Pick up the file once the vendor has finished writing it.
- Insert each member in a batch step. A blank email goes in as null, so the database refuses that row.
- A bad row must fail on its own. The job must carry on with the rest of the file.
- When the job ends, log \`loaded=<n> failed=<n>\`.
- Move the file to \`/loyalty/done\`.

**Facts**
- Files match \`LOYALTY_MEMBERS_*.csv\`.
- In On Complete the payload is the job result. Its fields \`successfulRecords\` and \`failedRecords\` give the two counts.

**What each system sends back**
- The SFTP listener gives the CSV content as the payload, read as \`application/csv\`, so the Batch Job splits it into one record per row. Inside a step each record is \`{ "member_id": "M-1001", "email": "ana@mail.example", "store": "0101", "points": "120" }\`, with every value as text. The full path is in \`attributes.path\` and the name in \`attributes.fileName\`.

**What failures look like**
- A row with no email: SQL Server refuses the null, and the Database Insert raises \`DB:QUERY_EXECUTION\` for that record only. The record counts as failed and the job goes on.

**Design the flow.**
`,
  answerTemplate: `## Picking up the file

## The Batch Job settings

## The batch step

## On Complete
`,
  keyPoints: [
    'Max failed records decides how many records may fail before the job stops. In Mule the default is 0, so the first failure stops the job.',
    '-1 means no limit: every record is tried, and failed records are counted.',
    'A failed record does not fail the flow that started the job. The job runs on its own after the flow moves on.',
    'On Complete gets the job result: successfulRecords, failedRecords and totalRecords. Log or store them there.',
    'A size check wait on the listener stops Mule reading a file the vendor is still uploading.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/loyalty/in\`, \`LOYALTY_MEMBERS_*.csv\`, size check wait 20 seconds.
2. **Set Variable** \`filePath\`.
3. **Batch Job** (max failed records -1), step \`insert-member\`:
   - **Transform**: blank email becomes null, points become a number.
   - **Database Insert** into \`dbo.loyalty_members\`.
   - **On Complete**: **Logger** with \`loaded\` and \`failed\` from the job result.
4. **SFTP Move** to \`/loyalty/done\`.

**Why -1 and not 100.** A limit is right when many failures mean the file is broken (see the follow-up). For a member list a few bad rows are normal, so the team wants every good row.
`,
  followUps: [
    {
      q: 'When would you set a limit such as 1,000 instead of -1?',
      a: 'When many failures mean the whole file is wrong, such as a changed column order. Stopping early saves hours of failed inserts and makes the problem loud.',
    },
    {
      q: 'The log says failed=1, but which member was it?',
      a: 'Add a second step with accept policy ONLY_FAILURES that writes the member ID to a reject table. Failed records reach only that step.',
    },
  ],
}
