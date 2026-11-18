import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const csv = 'date,reference,amount\n2026-11-17,TRX-80011,120.00\n2026-11-17,TRX-80012,-45.10\n2026-11-17,TRX-80013,980.55'
const corrected = 'date,reference,amount\n2026-11-17,TRX-80011,120.00\n2026-11-17,TRX-80012,-45.10\n2026-11-17,TRX-80013,890.55'
const file = (name, content) => ({ file: { path: `/inbound/statements/${name}`, content } })
const tables = { received_files: { key: 'checksum', rows: [] }, statement_lines: { rows: [] } }

export default {
  id: 'fl-147',
  category: 'flows',
  title: 'A Bank Statement File Sent Twice Under Two Names: Know Each File by a Checksum of Its Content, Skip a Repeat, and Load a Corrected File',
  level: 'ADVANCED',
  tags: ['sftp', 'checksum', 'idempotency', 'database', 'bulk-insert', 'transactions', 'banking'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Statement files are picked up from /inbound/statements', rule: { type: 'source', component: 'sftp-listener', where: { directory: '/inbound/statements' } } },
    {
      label: 'A checksum is worked out from the file content',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'set-variable', where: { value: { oneOf: ['SHA1', 'MD5', 'hashWith'] } } },
          { type: 'exists', component: 'transform', where: { script: { oneOf: ['SHA1', 'MD5', 'hashWith'] } } },
        ],
      },
    },
    {
      label: 'The checksum is looked up in received_files before any line is written',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['received_files', ':checksum'] } }, then: 'db-bulk-insert' },
    },
    {
      label: 'The file is recorded and its lines are saved in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'received_files' } },
          { type: 'inside', component: 'db-bulk-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'statement_lines' } },
        ],
      },
    },
    { label: 'A repeat is logged as a WARN on its own Choice route', rule: { type: 'inside', component: 'logger', within: 'choice', where: { level: 'WARN' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A new statement file',
        about: 'The bank drops statement-20261117.csv with three lines. All three are loaded, and the file is recorded.',
        trigger: file('statement-20261117.csv', csv),
        expect: { noError: true, db: { statement_lines: { count: 3, has: [{ reference: 'TRX-80013', amount: 980.55 }] }, received_files: { count: 1, has: [{ file_name: 'statement-20261117.csv' }] } } },
      },
      {
        name: 'The same file again under a new name',
        about: 'An hour later the bank sends the same content as statement-20261117-resend.csv. Nothing is loaded twice, and a WARN names the file.',
        triggers: [file('statement-20261117.csv', csv), { ...file('statement-20261117-resend.csv', csv), afterMs: 3600000 }],
        expect: { db: { statement_lines: { count: 3 }, received_files: { count: 1 } }, logs: [{ level: 'WARN', has: 'statement-20261117-resend.csv' }] },
      },
      {
        name: 'A corrected file under the same name',
        about: 'The bank finds an error and sends a corrected file with the same name. The content is different, so it is a new file and it is loaded.',
        triggers: [file('statement-20261117.csv', csv), { ...file('statement-20261117.csv', corrected), afterMs: 3600000 }],
        expect: { db: { received_files: { count: 2 }, statement_lines: { count: 6, has: [{ reference: 'TRX-80013', amount: 890.55 }] } } },
      },
      {
        name: 'Saving the lines fails',
        about: 'The database drops the connection while the lines are written. The file is not recorded either, so the next attempt loads it in full.',
        trigger: file('statement-20261117.csv', csv),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO statement_lines', fault: 'CONNECTIVITY' }] } } },
        expect: { error: 'DB:CONNECTIVITY', db: { received_files: { count: 0 }, statement_lines: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('load-bank-statements', source('sftp-listener', { directory: '/inbound/statements', matcher: '*.csv', postAction: 'move', moveTo: '/archive/statements' }), [
      step('set-variable', { variableName: 'fileName', value: '#[attributes.fileName]' }),
      step('set-variable', { variableName: 'checksum', value: '#[dw::Crypto::SHA1(payload.^raw)]' }),
      step('db-select', { database: 'PostgreSQL', sql: 'SELECT file_name, received_at FROM received_files WHERE checksum = :checksum', inputParameters: '#[{ checksum: vars.checksum }]', target: 'seen' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[not isEmpty(vars.seen)]' }, [
            step('logger', { level: 'WARN', message: '#["File " ++ vars.fileName ++ " has the same content as " ++ vars.seen[0].file_name ++ ", not loaded again"]' }),
          ]),
        ],
        {
          otherwise: [
            scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
              step('db-insert', {
                database: 'PostgreSQL',
                sql: 'INSERT INTO received_files (checksum, file_name, received_at) VALUES (:checksum, :fileName, CURRENT_TIMESTAMP)',
                inputParameters: '#[{ checksum: vars.checksum, fileName: vars.fileName }]',
                target: 'recorded',
              }),
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\npayload map { reference: $.reference, bookedOn: $.date, amount: $.amount as Number, checksum: vars.checksum }',
              }),
              step('db-bulk-insert', {
                database: 'PostgreSQL',
                sql: 'INSERT INTO statement_lines (reference, booked_on, amount, file_checksum) VALUES (:reference, :bookedOn, :amount, :checksum)',
              }),
            ]),
            step('logger', { level: 'INFO', message: '#["Loaded " ++ vars.fileName]' }),
          ],
        },
      ),
    ], [handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#["Statement file " ++ vars.fileName ++ " not loaded: " ++ error.description]' })])]),
  ),
  optionalSteps: [{ type: 'on-error-propagate', why: 'Mule logs an unhandled error on its own and the transaction is rolled back either way. The handler only adds the file name to the log line.' }],
  description: `
A housing association receives a daily **bank statement file** from its bank on its SFTP server, in \`/inbound/statements\`:

\`\`\`
date,reference,amount
2026-11-17,TRX-80011,120.00
2026-11-17,TRX-80012,-45.10
\`\`\`

A Mule flow loads the lines into a PostgreSQL table \`statement_lines\`, where the finance team matches rent payments.

Twice this year the bank's system sent the **same file again under a new name**, and every payment was loaded twice. Tenants were shown as having paid double. Once the bank sent a **corrected file with the same name** as the first, and a fix based on file names would have skipped it.

You may use a table \`received_files\` (\`checksum\` primary key, \`file_name\`, \`received_at\`).

**Requirements**
- Load each file's lines into \`statement_lines\` (\`reference\`, \`booked_on\`, \`amount\`, \`file_checksum\`).
- A file whose **content** was loaded before is not loaded again, whatever its name. Log a WARN with its name.
- A file with new content is loaded, even if its name was seen before.
- If loading fails part way, nothing of that file stays in the database, and a later attempt loads it in full.

**Design the flow.**
`,
  answerTemplate: `## Why the file name is not enough

## The checksum

## Loading a file once

## When loading fails
`,
  keyPoints: [
    'Know a file by what is in it, not by what it is called. A hash of the content, such as SHA-1, is the same for the same bytes under any name, and different after any correction.',
    'dw::Crypto::SHA1(payload.^raw) hashes the bytes as they arrived, before any parsing.',
    'Look the checksum up before writing anything. A repeat takes its own route with a WARN, and nothing is written.',
    'Record the checksum and load the lines in one transactional Try. A failure rolls back both, so the file is not marked as received when it was not loaded.',
    'The primary key on checksum is the last guard: two workers loading the same file at once cannot both record it.',
    'A checksum spots a repeated file. It does not spot one payment sent in two different files, which needs a check on the bank\'s own references.',
  ],
  solution: `
1. **SFTP On New or Updated File** in \`/inbound/statements\`, matcher \`*.csv\`, moved to \`/archive/statements\` once the flow is done.
2. **Set Variable** \`fileName\` = \`#[attributes.fileName]\` and \`checksum\` = \`#[dw::Crypto::SHA1(payload.^raw)]\`.
3. **Database Select**, Target \`seen\`: \`SELECT file_name, received_at FROM received_files WHERE checksum = :checksum\`.
4. **Choice**:
   - \`#[not isEmpty(vars.seen)]\`: **Logger** WARN with both file names.
   - Otherwise: **Try**, \`ALWAYS_BEGIN\`:
     - **Database Insert** into \`received_files\`.
     - **Transform Message** to one record per line, with the checksum on each.
     - **Database Bulk Insert** into \`statement_lines\`.

**Why SHA-1 is fine here.** It is a checksum against accidents, not a security control. Nobody gains by making two statement files with the same hash. If a policy asks for SHA-256, use \`dw::Crypto::hashWith\` with \`"SHA-256"\` and turn the bytes into hex.

**A corrected file.** It is loaded as a new file, so the first version's lines are still there. The finance team needs a rule for that: either the bank's correction replaces the earlier file, which the flow can do by deleting lines of the same statement date in the same transaction, or both stay and the team reverses one by hand.
`,
  followUps: [
    {
      q: 'The bank sends the same file but with a new timestamp in a header line. Is it still caught?',
      a: 'No. Any changed byte gives a new checksum. Hash only the part that matters, such as the lines without the header, or check the bank\'s statement number in the file against those already loaded.',
    },
    {
      q: 'How long should received_files keep its rows?',
      a: 'At least as long as the bank could resend a file, for example 90 days. A scheduled job can delete older rows.',
    },
  ],
}
