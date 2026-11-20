import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const name = 'POD_EVENTS_20261113.csv'
const file = `/pod/in/${name}`
const clean = 'event_id,shipment,delivered_at\nE-501,SHP-88001,2026-11-12T09:14:00Z\nE-502,SHP-88002,2026-11-12T10:02:00Z\nE-503,SHP-88003,2026-11-12T11:40:00Z'
const oneBad = 'event_id,shipment,delivered_at\nE-501,SHP-88001,2026-11-12T09:14:00Z\nE-502,SHP-88002,\nE-503,SHP-88003,2026-11-12T11:40:00Z'
const allBad = 'event_id,shipment,delivered_at\nE-501,SHP-88001,\nE-502,SHP-88002,\nE-503,SHP-88003,'
const tables = {
  pod_events: { key: 'event_id', columns: ['event_id', 'shipment', { name: 'delivered_at', notNull: true }, 'job_id'], rows: [] },
  job_log: { key: 'job_id', columns: ['job_id', 'job_name', 'status', 'loaded', 'failed'], rows: [{ job_id: 40, job_name: 'POD_EVENTS_IN', status: 'COMPLETED', loaded: 18220, failed: 0 }] },
}
const procedures = {
  'dbo.usp_job_start': (args, db) => {
    const rows = db.tables.job_log.rows
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, job_name: args.jobName, status: 'STARTED', loaded: null, failed: null })
    return { job_id: id }
  },
}

export default {
  id: 'fl-249',
  category: 'flows',
  title: 'Proof of Delivery Events Through a Batch Job: Close the Job Log Row From On Complete as COMPLETED, COMPLETED_WITH_ERRORS or FAILED, Worked Out From the Counts',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'sql-server', 'job-log', 'on-complete', 'status'],
  estMinutes: 25,
  flowChecks: [
    { label: 'A job log row is started before the Batch Job', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_start' }, then: 'batch-job' } },
    { label: 'Each event is inserted into dbo.pod_events from a batch step', rule: { type: 'inside', component: 'db-insert', within: 'batch-job', where: { sql: 'pod_events' } } },
    { label: 'On Complete writes the status and both counts to the job row', rule: { type: 'inside', component: 'db-update', within: 'batch-job', inSlot: 'onComplete', where: { sql: { all: ['job_log', 'status', 'loaded', 'failed'] } } } },
  ],
  simulation: {
    systems: { files: { [file]: clean }, db: { tables, procedures } },
    tests: [
      {
        name: 'Every event loads',
        about: 'Three events load with job 41. Job 41 is COMPLETED with 3 loaded and 0 failed.',
        trigger: { file: { path: file } },
        expect: { noError: true, db: { pod_events: { count: 3, has: [{ event_id: 'E-503', job_id: 41 }] }, job_log: { has: [{ job_id: 41, status: 'COMPLETED', loaded: 3, failed: 0 }] } } },
      },
      {
        name: 'One event has no delivery time',
        about: 'E-502 is refused and the other two load. Job 41 is COMPLETED_WITH_ERRORS with 2 loaded and 1 failed.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: oneBad } } },
        expect: { db: { pod_events: { count: 2 }, job_log: { has: [{ job_id: 41, status: 'COMPLETED_WITH_ERRORS', loaded: 2, failed: 1 }] } } },
      },
      {
        name: 'Nothing loads',
        about: 'The carrier sent a file with every delivery time empty. Not one event loads, so job 41 is FAILED with 3 failed, and the morning check sees it at once.',
        trigger: { file: { path: file } },
        overrides: { systems: { files: { [file]: allBad } } },
        expect: { db: { pod_events: { count: 0 }, job_log: { has: [{ job_id: 41, status: 'FAILED', loaded: 0, failed: 3 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('pod-events-load', source('sftp-listener', { directory: '/pod/in', matcher: 'POD_EVENTS_*.csv', postAction: 'move', moveTo: '/pod/archive', timeBetweenSizeCheck: 15000 }), [
      step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_start(:jobName) }', inputParameters: '#[{ jobName: "POD_EVENTS_IN" }]', target: 'job' }),
      step('set-variable', { variableName: 'jobId', value: '#[vars.job.job_id]' }),
      router(
        'batch-job',
        { jobName: 'pod-events-load', blockSize: 100, maxFailedRecords: -1 },
        [
          route({ name: 'insert-event', acceptPolicy: 'NO_FAILURES' }, [
            step('db-insert', {
              database: 'SQL Server',
              sql: 'INSERT INTO dbo.pod_events (event_id, shipment, delivered_at, job_id) VALUES (:eventId, :shipment, :deliveredAt, :jobId)',
              inputParameters: '#[{ eventId: payload.event_id, shipment: payload.shipment, deliveredAt: if (isBlank(payload.delivered_at)) null else payload.delivered_at, jobId: vars.jobId }]',
            }),
          ]),
        ],
        {
          onComplete: [
            step('db-update', {
              database: 'SQL Server',
              sql: 'UPDATE dbo.job_log SET status = :status, loaded = :loaded, failed = :failed WHERE job_id = :jobId',
              inputParameters:
                '#[{ jobId: vars.jobId, loaded: payload.successfulRecords, failed: payload.failedRecords, status: if (payload.failedRecords == 0) "COMPLETED" else if (payload.successfulRecords == 0) "FAILED" else "COMPLETED_WITH_ERRORS" }]',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Thornbury Freight, a fictional freight carrier, loads proof of delivery events from its drivers' handheld system. Every hour a file \`POD_EVENTS_<date>.csv\` lands on the **SFTP server**, folder \`/pod/in\`, with up to **200,000 events**:

\`\`\`
event_id,shipment,delivered_at
E-501,SHP-88001,2026-11-12T09:14:00Z
\`\`\`

The events go to the SQL Server table \`dbo.pod_events\` (\`delivered_at\` NOT NULL, plus \`job_id\`). Every load has a row in \`dbo.job_log\` (\`job_id\`, \`job_name\`, \`status\`, \`loaded\`, \`failed\`). \`dbo.usp_job_start(@jobName)\` inserts a \`STARTED\` row and returns its \`job_id\`.

The support team reads \`dbo.job_log\` each morning. Today every row says \`COMPLETED\`, even the night the handheld system sent a file of empty delivery times and nothing loaded.

**Requirements**
- Start a job row named \`POD_EVENTS_IN\` and tag each event with its \`job_id\`.
- Insert each event in a batch step. Let the job run through the whole file.
- When the job ends, write \`loaded\` and \`failed\` and a status:
  - \`COMPLETED\` when nothing failed,
  - \`FAILED\` when nothing loaded,
  - \`COMPLETED_WITH_ERRORS\` otherwise.

**Facts**
- The procedure's result is \`{ job_id }\`.
- A blank \`delivered_at\` goes in as null, so the database refuses that event.
- In On Complete the payload is the job result, with \`successfulRecords\` and \`failedRecords\`.

**Design the flow.**
`,
  answerTemplate: `## The job row

## The batch step

## The status in On Complete
`,
  keyPoints: [
    'The job row is started before the Batch Job, so its ID can tag every record and be updated at the end.',
    'The flow does not wait for the job. Only On Complete knows how the job went, so the final update belongs there.',
    'The status comes from two numbers: failedRecords and successfulRecords. Three outcomes need three statuses, or a FAILED run looks like a partial one.',
    'Max failed records -1 lets every record be tried, so the counts describe the whole file.',
    'A job row that stays STARTED for hours also tells support something: the job or the app died before On Complete.',
  ],
  solution: `
1. **SFTP On New or Updated File** on \`/pod/in\`, size check wait 15 seconds, move to \`/pod/archive\` after reading.
2. **Stored Procedure** \`usp_job_start\` (target \`job\`), **Set Variable** \`jobId\`.
3. **Batch Job** (max failed records -1), step \`insert-event\`: **Database Insert** with \`job_id\`.
4. **On Complete**: **Database Update** of the job row:

\`\`\`
status: if (payload.failedRecords == 0) "COMPLETED"
        else if (payload.successfulRecords == 0) "FAILED"
        else "COMPLETED_WITH_ERRORS"
\`\`\`
`,
  followUps: [
    {
      q: 'The app restarts in the middle of a job. What does the job row show?',
      a: 'It stays STARTED. A check that alerts on STARTED rows older than a few hours catches it. Mule keeps batch job state in its queues, so a restarted app may carry on with the job; check this for your deployment.',
    },
    {
      q: 'Support also wants an email when the status is not COMPLETED. Where does it go?',
      a: 'In On Complete, after the update, behind a Choice on the counts. Put the email in an Async scope or a Try, so a mail outage cannot leave the job row unwritten.',
    },
  ],
}
