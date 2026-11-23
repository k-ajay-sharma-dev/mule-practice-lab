import { design, flow, source, step } from '../../flow/dsl.js'

const permits = [
  { permit_id: 'PK-55102', plate: 'FH21 KDP', zone: 'B', valid_from: '2026-11-13', valid_to: '2027-11-12' },
  { permit_id: 'PK-55103', plate: 'FH70 TRW', zone: 'C', valid_from: '2026-11-13', valid_to: '2027-05-12' },
]
const filePath = '/permits/exports/permits-latest.csv'
const ok = [{ method: 'PUT', path: filePath, respond: { status: 201, body: null } }]

export default {
  id: 'fl-180',
  category: 'flows',
  title: 'CloudHub Cannot Mount SMB: Write the Daily Permits File to Azure File Share Through the REST API, Create the File First, Then Put the Range',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'rest', 'cloudhub', 'put-range', 'sas', 'public-sector'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The export runs every morning at 05:30', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron', expression: '0 30 5' } } },
    { label: 'The permits issued are read from the permits table', rule: { type: 'exists', component: 'db-select', where: { sql: 'permits' } } },
    {
      label: 'The file is created with a PUT before its content is written',
      rule: { type: 'before', first: 'http-request', firstWhere: { method: 'PUT', path: { not: 'comp=range' } }, then: 'http-request', thenWhere: { method: 'PUT', path: 'comp=range' } },
    },
    { label: 'The content is written with a Put Range call (comp=range)', rule: { type: 'exists', component: 'http-request', where: { method: 'PUT', path: 'comp=range' } } },
  ],
  simulation: {
    systems: { db: { tables: { permits: { key: 'permit_id', rows: permits } } }, http: ok },
    tests: [
      {
        name: 'The morning export',
        about: 'Two calls reach the share: one creates the file at its full size, one writes the bytes.',
        trigger: { schedule: {} },
        expect: { noError: true, calls: [{ method: 'PUT', path: filePath, count: 2 }, { method: 'PUT', path: filePath, has: '~PK-55103' }] },
      },
      {
        name: 'The SAS token has expired',
        about: 'The create call is refused with 403. No range is written, and the run fails so the token is renewed.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ method: 'PUT', path: filePath, respond: { status: 403, body: '<Error><Code>AuthenticationFailed</Code></Error>' } }] } },
        expect: { error: 'HTTP:FORBIDDEN', calls: [{ method: 'PUT', path: filePath, count: 1 }] },
      },
    ],
  },
  referenceFlow: design(
    flow('permits-to-file-share', source('scheduler', { strategy: 'cron', expression: '0 30 5 * * ?' }), [
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT permit_id, plate, zone, valid_from, valid_to FROM permits WHERE valid_to >= CURRENT_DATE ORDER BY permit_id',
      }),
      step('transform', { script: '%dw 2.0\noutput text/plain\n---\nwrite(payload, "application/csv")' }),
      step('set-variable', { variableName: 'body', value: '#[payload]' }),
      step('set-variable', { variableName: 'length', value: '#[sizeOf(payload)]' }),
      step('set-payload', { value: '#[""]' }),
      step('http-request', { method: 'PUT', path: filePath, responseTimeout: 30000 }),
      step('set-payload', { value: '#[vars.body]' }),
      step('http-request', { method: 'PUT', path: `${filePath}?comp=range`, responseTimeout: 60000 }),
      step('logger', { level: 'INFO', message: '#["Permits file written, " ++ (vars.length as String) ++ " bytes"]' }),
    ]),
  ),
  description: `
Fernhill District Council, a fictional council, runs its parking permits system with a Mule app on **CloudHub**. A contractor's enforcement app on a Windows server reads the list of valid permits each morning from an **Azure File Share** \`permits\`, file \`exports/permits-latest.csv\`.

The old job ran on a server with the share mapped as a drive. That server is being switched off, and CloudHub workers cannot mount an SMB share. The app must use the **File Share REST API** on the storage account's file endpoint instead, with a SAS token from secure properties.

How the REST API writes a file:
- **Create File**: \`PUT /permits/exports/permits-latest.csv\` with the header \`x-ms-type: file\` and \`x-ms-content-length\` set to the final size. It makes an empty file of that size, or resets one that exists.
- **Put Range**: \`PUT /permits/exports/permits-latest.csv?comp=range\` with \`x-ms-write: update\` and \`x-ms-range: bytes=0-<size minus 1>\`. It writes the bytes. One call has a size limit of a few MiB, so a bigger file needs several ranges.

The PostgreSQL table \`permits\` has \`permit_id\`, \`plate\`, \`zone\`, \`valid_from\` and \`valid_to\`. Today's file is well under the range limit.

**Requirements**
- Every morning at 05:30, export the permits still valid as CSV.
- Create the file at the right size, then write its content.
- If the create call fails, write nothing and fail the run.

**Facts**
- A permit is still valid when \`valid_to\` is today or later. The CSV has the table's five columns.
- An expired SAS token answers 403, which raises **HTTP:FORBIDDEN**. Do not catch it.

**What each system sends back**
- Database Select gives a list of rows, with the table's lower case column names: \`[ { "permit_id": "PK-55102", "plate": "FH21 KDP", "zone": "B", "valid_from": "2026-11-13", "valid_to": "2027-11-12" } ]\`.
- Both PUT calls answer **201** with an empty body. Nothing in that answer is needed.

**Design the flow.** Say which headers each call needs and where they would be set.
`,
  answerTemplate: `## Why REST, not a mount

## The two calls

## Sizes and ranges

## Tokens and failures
`,
  keyPoints: [
    'Over REST, writing a file is two steps: Create File reserves the size, Put Range fills the bytes. There is no single "upload" call like a blob\'s.',
    'x-ms-content-length on the create must be the byte length of the content. Count bytes, not characters, when the text can hold non ASCII letters.',
    'The range header names the first and last byte, both counted from zero, so the last byte is the size minus one.',
    'A Put Range call has a size limit, so a larger file is written as several ranges in a loop, each with its own offsets.',
    'The SAS token goes in secure properties and on the request query, with write rights on this share only. A 403 means renew it, so let it fail loudly.',
  ],
  solution: `
1. **Scheduler**, cron \`0 30 5 * * ?\`.
2. **Database Select** the valid permits.
3. **Transform** to CSV. **Set Variable** \`body\` and \`length\`.
4. **Set Payload** empty, then **HTTP Request** PUT \`/permits/exports/permits-latest.csv\` with headers \`x-ms-type: file\`, \`x-ms-content-length: #[vars.length]\` and \`x-ms-version\`.
5. **Set Payload** \`vars.body\`, then **HTTP Request** PUT \`...?comp=range\` with \`x-ms-write: update\` and \`x-ms-range: #["bytes=0-" ++ (vars.length - 1)]\`.
6. **Logger** INFO.

Headers are set on each HTTP Request's Headers section. The SAS query parameters can sit on the request config or as query parameters from secure properties.

**The reader sees an empty file.** Between the two calls the file exists at full size but holds zeros. If the contractor's app reads at that moment it gets nonsense. Write to \`permits-latest.csv.tmp\` and rename, if the API version you use offers a rename, or agree a time window with the contractor.
`,
  followUps: [
    {
      q: 'The file grows past the range limit next year. What changes?',
      a: 'Split the content into chunks under the limit, and loop: each Put Range names its own start and end bytes. The create call still sets the full size once.',
    },
    {
      q: 'Could the app use a hybrid worker with the share mounted instead?',
      a: 'Yes. An on premises Mule runtime or a VM in Azure can mount the share and use the File connector. That adds a server to run, so REST is often chosen for small files.',
    },
  ],
}
