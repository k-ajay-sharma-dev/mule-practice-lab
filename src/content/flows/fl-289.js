import { design, flow, handler, source, step } from '../../flow/dsl.js'

const csv = 'consignment,delivered_at,signed_by\nQF-118204,2026-11-12T09:14:00Z,R. Patel\nQF-118205,2026-11-12T09:41:00Z,L. Moreau\nQF-118207,2026-11-12T10:02:00Z,J. Okafor'
const tables = {
  upload_log: { key: 'upload_id', columns: ['upload_id', 'status', 'rows'], rows: [] },
  pod_staging: { columns: ['upload_id', 'consignment', 'delivered_at', 'signed_by'], rows: [] },
}
const upload = (body) => ({ http: { method: 'POST', path: '/api/pod-uploads', body, headers: { 'content-type': 'text/csv' } } })

export default {
  id: 'fl-289',
  category: 'flows',
  title: 'Large Proof of Delivery Uploads Over HTTP: Land the Body on Disk, Answer 202 With an Upload ID, and Load the File From a VM Queue So a Slow Database Never Holds the Carrier\'s Connection',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'http', '202-accepted', 'vm-queue', 'landing-folder', 'sql-server'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Carriers post to /api/pod-uploads', rule: { type: 'source', component: 'http-listener', where: { path: '/api/pod-uploads' } } },
    { label: 'The body is written to the landing folder before the hand-off', rule: { type: 'before', first: 'file-write', firstWhere: { path: '/data/landing' }, then: 'vm-publish' } },
    { label: 'A second flow takes the hand-off from the same VM queue', rule: { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } } },
    { label: 'The loading flow reads the landed file and bulk inserts it into pod_staging', rule: { type: 'before', first: 'file-read', then: 'db-bulk-insert', thenWhere: { sql: 'pod_staging' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'A large upload',
        about: 'The carrier gets 202 with an upload ID at once. The second flow loads the three deliveries, marks the upload LOADED and moves the file to done.',
        trigger: upload(csv),
        expect: {
          status: 202,
          bodyHas: { status: 'RECEIVED' },
          db: { pod_staging: { count: 3, has: [{ consignment: 'QF-118207', signed_by: 'J. Okafor' }] }, upload_log: { count: 1, has: [{ status: 'LOADED', rows: 3 }] } },
          files: { '/data/landing/done/*.csv': { count: 1 }, '/data/landing/*.csv': { count: 0 } },
        },
      },
      {
        name: 'SQL Server is down while loading',
        about: 'The carrier still gets 202: the file is safe on disk and logged as RECEIVED. The load fails and the file stays in the landing folder for a retry.',
        trigger: upload(csv),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO dbo.pod_staging', fault: 'CONNECTIVITY' }] } } },
        expect: { status: 202, db: { upload_log: { has: [{ status: 'RECEIVED' }] }, pod_staging: { count: 0 } }, files: { '/data/landing/*.csv': { count: 1 } } },
      },
      {
        name: 'An empty upload',
        about: 'A carrier\'s script posts nothing. The API answers 400 and nothing is landed or logged.',
        trigger: upload(''),
        expect: { status: 400, bodyHas: { error: 'EMPTY_UPLOAD' }, db: { upload_log: { count: 0 } }, files: { '/data/landing/*': { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pod-upload-api',
      source('http-listener', { path: '/api/pod-uploads', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-true', expression: '#[not isEmpty(payload)]', message: 'EMPTY_UPLOAD' }),
        step('set-variable', { variableName: 'uploadId', value: '#[uuid()]' }),
        step('file-write', { path: '#["/data/landing/" ++ vars.uploadId ++ ".csv"]', mode: 'CREATE_NEW' }),
        step('db-insert', { database: 'SQL Server', sql: "INSERT INTO dbo.upload_log (upload_id, status) VALUES (:uploadId, 'RECEIVED')", inputParameters: '#[{ uploadId: vars.uploadId }]', target: 'logged' }),
        step('set-payload', { value: '#[{ uploadId: vars.uploadId }]' }),
        step('vm-publish', { queueName: 'pod-uploads' }),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { uploadId: vars.uploadId, status: "RECEIVED" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { error: "EMPTY_UPLOAD" }]' }),
        ]),
      ],
    ),
    flow('pod-upload-loader', source('vm-listener', { queueName: 'pod-uploads', transactionalAction: 'NONE' }), [
      step('set-variable', { variableName: 'uploadId', value: '#[payload.uploadId]' }),
      step('set-variable', { variableName: 'path', value: '#["/data/landing/" ++ payload.uploadId ++ ".csv"]' }),
      step('file-read', { path: '#[vars.path]', outputMimeType: 'application/csv' }),
      step('transform', { script: '%dw 2.0\noutput application/java\n---\npayload map { upload_id: vars.uploadId, consignment: $.consignment, delivered_at: $.delivered_at, signed_by: $.signed_by }' }),
      step('set-variable', { variableName: 'rows', value: '#[sizeOf(payload)]' }),
      step('db-bulk-insert', { database: 'SQL Server', sql: 'INSERT INTO dbo.pod_staging (upload_id, consignment, delivered_at, signed_by) VALUES (:upload_id, :consignment, :delivered_at, :signed_by)' }),
      step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.upload_log SET status = 'LOADED', rows = :rows WHERE upload_id = :uploadId", inputParameters: '#[{ uploadId: vars.uploadId, rows: vars.rows }]' }),
      step('file-move', { sourcePath: '#[vars.path]', targetPath: '/data/landing/done' }),
    ]),
  ),
  description: `
Quayle Freight, a fictional haulier, receives proof of delivery files from subcontracted carriers through an API: \`POST /api/pod-uploads\` with a CSV body:

\`\`\`
consignment,delivered_at,signed_by
QF-118204,2026-11-12T09:14:00Z,R. Patel
\`\`\`

A carrier's daily file can be **800 MB**. Today the API parses the body and inserts the rows into SQL Server before it answers. A big file takes eight minutes, the carriers' clients time out at two, they post again, and Quayle gets the same deliveries three times.

The runtime runs **on premises** with a local disk for landing files, \`/data/landing\`. SQL Server has:
- \`dbo.upload_log\` (\`upload_id\`, \`status\`, \`rows\`).
- \`dbo.pod_staging\` (\`upload_id\`, \`consignment\`, \`delivered_at\`, \`signed_by\`).

**Requirements**
- Answer **202** \`{ "uploadId": "...", "status": "RECEIVED" }\` as soon as the body is safely on disk and logged as \`RECEIVED\`. The carrier keeps the ID.
- Load the file **after** answering, in another flow: stage the rows with the upload ID, mark the upload \`LOADED\` with the row count, move the file to \`/data/landing/done\`.
- A failed load leaves the file in the landing folder.
- An empty body answers **400** \`{ "error": "EMPTY_UPLOAD" }\`.

**Facts**
- The upload ID is \`uuid()\`. Land the body as \`/data/landing/<uploadId>.csv\` without parsing it.
- Hand off \`{ uploadId }\` on a VM queue. The loader reads the file with **File Read** as \`application/csv\`; every value stays text.
- Check the body with a **Validate** is-true. A false check raises \`VALIDATION:INVALID_BOOLEAN\`; answer 400 from an **On Error Propagate** for that type.
- Do not catch a failure in the loader. The file stays and \`upload_log\` keeps \`RECEIVED\`.
- **How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, for a success and for an error.

**What each system sends back**
- The VM listener gives the hand-off \`{ "uploadId": "..." }\` as the payload.
- File Read as \`application/csv\` gives a list of rows: \`[ { "consignment": "QF-118204", "delivered_at": "2026-11-12T09:14:00Z", "signed_by": "R. Patel" } ]\`.

**What failures look like**
- SQL Server is down while loading: the Bulk Insert in the loader raises \`DB:CONNECTIVITY\`. The carrier already has 202, \`upload_log\` stays \`RECEIVED\`, and the file stays in \`/data/landing\`.

**Design the flows.**
`,
  answerTemplate: `## Landing the body

## The 202 and the hand-off

## Loading the file

## Failures
`,
  keyPoints: [
    'Write the body straight to disk without parsing it. With the default repeatable streams, Mule can pass it from the request to the file while keeping only part of it in memory (a larger body goes to a temporary file). A step that parses the CSV first would build all 800 MB as data.',
    'Hand off only the upload ID on the VM queue, not the content. The file on disk is the claim check.',
    'Log RECEIVED before answering 202. The ID the carrier holds then always points at a row support can find.',
    'The loader can take its time. A slow SQL Server costs minutes in the second flow, not a timed out carrier and a repeated upload.',
    'A VM queue lives inside one app. Make it persistent, or a restart between the 202 and the load leaves a landed file nobody loads; a sweep of RECEIVED uploads older than an hour covers that.',
  ],
  solution: `
**pod-upload-api**
1. **HTTP Listener** \`POST /api/pod-uploads\`. **Validate** the body is not empty.
2. **Set Variable** \`uploadId\` = \`uuid()\`. **File Write** \`/data/landing/<id>.csv\` (CREATE_NEW).
3. **Database Insert** \`upload_log\` RECEIVED.
4. **Set Payload** \`{ uploadId }\`, **VM Publish** to \`pod-uploads\`.
5. **Set Variable** \`httpStatus\` 202, **Set Payload** the answer.
6. **On Error Propagate** for the validation error: 400 \`EMPTY_UPLOAD\`.

**pod-upload-loader**
1. **VM Listener** \`pod-uploads\`. **Set Variable** \`uploadId\`, \`path\`.
2. **File Read** the CSV, **Transform** with the upload ID, **Bulk Insert** into \`dbo.pod_staging\`.
3. **Update** \`upload_log\` LOADED with the count. **File Move** to \`done\`.

**800 MB through a bulk insert.** One bulk insert of the whole file is still heavy. For files that size, load through a Batch Job or For Each in groups of a few thousand rows.
`,
  followUps: [
    {
      q: 'The carrier asks "did my upload load?". What do you give them?',
      a: 'A GET /api/pod-uploads/{uploadId} that reads upload_log: RECEIVED, LOADED with the row count, or FAILED with a reason. That is the pair to a 202.',
    },
    {
      q: 'The same file is still posted twice by an impatient carrier. How can you spot it?',
      a: 'Hash the content as it lands and keep the hash in upload_log. A second upload with the same hash within a day can be answered with the first upload ID.',
    },
  ],
}
