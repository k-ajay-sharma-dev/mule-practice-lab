import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const jobsWith = (rows) => ({ job_log: { key: 'job_id', columns: ['job_id', 'message_type', 'status', 'messages', 'detail'], rows } })
const done = { job_id: 39, message_type: 'ITEM', status: 'COMPLETED', messages: 1180, detail: null }
const procedures = {
  'dbo.usp_job_claim': (args, db) => {
    const rows = db.tables.job_log.rows
    const running = rows.find((r) => r.message_type === args.messageType && r.status === 'RUNNING')
    if (running) return { job_id: null, running_job_id: running.job_id }
    const id = Math.max(0, ...rows.map((r) => r.job_id)) + 1
    rows.push({ job_id: id, message_type: args.messageType, status: 'RUNNING', messages: null, detail: null })
    return { job_id: id, running_job_id: null }
  },
  'dbo.usp_generate_outbound': () => ({ message_count: 1200 }),
}
const post = (type) => ({ http: { method: 'POST', path: `/api/outbound/${type}` } })
const status = (id) => ({ http: { method: 'GET', path: `/api/outbound/jobs/${id}` } })

export default {
  id: 'fl-282',
  category: 'flows',
  title: 'Outbound Runs Started by an API on SQL Server: Claim a Job Row Atomically, Answer 202 at Once, Generate the Messages in an Async Scope, Refuse a Second Run of the Same Type With 409, and Report the State on a Status Endpoint',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'job-log', 'async', 'api', 'stored-procedure', 'concurrency', '202-accepted'],
  estMinutes: 60,
  flowChecks: [
    { label: 'POST /api/outbound/{messageType} starts a run', rule: { type: 'source', component: 'http-listener', where: { path: '/api/outbound/{messageType}' } } },
    { label: 'The job row is claimed before the run starts', rule: { type: 'before', first: 'db-stored-procedure', firstWhere: { sql: 'usp_job_claim' }, then: 'async' } },
    { label: 'The messages are generated inside an Async scope', rule: { type: 'inside', component: 'db-stored-procedure', within: 'async', where: { sql: 'usp_generate_outbound' } } },
    { label: 'A failed run marks the job FAILED from an On Error Continue', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['job_log', 'FAILED'] } } } },
    { label: 'A second run of the same type answers 409', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'APP:ALREADY_RUNNING' } },
    { label: 'GET /api/outbound/jobs/{jobId} reports a job', rule: { type: 'source', component: 'http-listener', where: { path: 'jobs/{jobId}' } } },
  ],
  simulation: {
    systems: { db: { tables: jobsWith([done]), procedures } },
    tests: [
      {
        name: 'Start an item run',
        about: 'No item run is going. Job 40 is claimed, the caller gets 202 with the job ID at once, and the run completes with 1,200 messages.',
        trigger: post('ITEM'),
        expect: { status: 202, bodyHas: { jobId: 40, status: 'RUNNING', statusUrl: '/api/outbound/jobs/40' }, db: { job_log: { has: [{ job_id: 40, message_type: 'ITEM', status: 'COMPLETED', messages: 1200 }] } } },
      },
      {
        name: 'An item run is already going',
        about: 'Job 40 is still RUNNING for ITEM. A second request answers 409 with the running job, and no new row is made.',
        trigger: post('ITEM'),
        overrides: { systems: { db: { tables: jobsWith([done, { job_id: 40, message_type: 'ITEM', status: 'RUNNING', messages: null, detail: null }]) } } },
        expect: { status: 409, bodyHas: { error: 'ALREADY_RUNNING', runningJobId: 40 }, db: { job_log: { count: 2 } } },
      },
      {
        name: 'Another type while items run',
        about: 'An ITEM run is going, but a LOCATION run is a different job and starts.',
        trigger: post('LOCATION'),
        overrides: { systems: { db: { tables: jobsWith([done, { job_id: 40, message_type: 'ITEM', status: 'RUNNING', messages: null, detail: null }]) } } },
        expect: { status: 202, bodyHas: { jobId: 41 }, db: { job_log: { has: [{ job_id: 41, message_type: 'LOCATION', status: 'COMPLETED' }] } } },
      },
      {
        name: 'The generation fails',
        about: 'The procedure fails after the caller got 202. Job 40 is marked FAILED with the reason, so the status endpoint tells the truth.',
        trigger: post('ITEM'),
        overrides: { systems: { db: { failWhen: [{ match: 'usp_generate_outbound', fault: 'QUERY_EXECUTION', description: 'Arithmetic overflow in item pack size' }] } } },
        expect: { status: 202, db: { job_log: { has: [{ job_id: 40, status: 'FAILED', detail: 'Arithmetic overflow in item pack size' }] } } },
      },
      {
        name: 'Ask for a job\'s state',
        about: 'Job 39 finished last night. The status endpoint returns its row.',
        trigger: status(39),
        expect: { status: 200, bodyHas: { jobId: 39, status: 'COMPLETED', messages: 1180 } },
      },
      {
        name: 'An unknown job',
        about: 'There is no job 999. The status endpoint answers 404.',
        trigger: status(999),
        expect: { status: 404, bodyHas: { error: 'NOT_FOUND' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'start-outbound-run',
      source('http-listener', { path: '/api/outbound/{messageType}', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'messageType', value: '#[upper(attributes.uriParams.messageType)]' }),
        step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_job_claim(:messageType) }', inputParameters: '#[{ messageType: vars.messageType }]', target: 'claim' }),
        router('choice', {}, [route({ expression: '#[vars.claim.job_id == null]' }, [step('raise-error', { type: 'APP:ALREADY_RUNNING', description: 'A run of this type is already going' })])], {
          otherwise: [step('set-variable', { variableName: 'jobId', value: '#[vars.claim.job_id]' })],
        }),
        scope('async', {}, [
          scope(
            'try',
            { transactionalAction: 'INDIFFERENT' },
            [
              step('db-stored-procedure', { database: 'SQL Server', sql: '{ call dbo.usp_generate_outbound(:jobId, :messageType) }', inputParameters: '#[{ jobId: vars.jobId, messageType: vars.messageType }]' }),
              step('db-update', {
                database: 'SQL Server',
                sql: "UPDATE dbo.job_log SET status = 'COMPLETED', messages = :messages WHERE job_id = :jobId",
                inputParameters: '#[{ jobId: vars.jobId, messages: payload.message_count }]',
              }),
            ],
            {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  step('db-update', { database: 'SQL Server', sql: "UPDATE dbo.job_log SET status = 'FAILED', detail = :detail WHERE job_id = :jobId", inputParameters: '#[{ jobId: vars.jobId, detail: error.description }]' }),
                ]),
              ],
            },
          ),
        ]),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, messageType: vars.messageType, status: "RUNNING", statusUrl: "/api/outbound/jobs/" ++ (vars.jobId as String) }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:ALREADY_RUNNING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { error: "ALREADY_RUNNING", runningJobId: vars.claim.running_job_id }]' }),
        ]),
      ],
    ),
    flow('get-outbound-job', source('http-listener', { path: '/api/outbound/jobs/{jobId}', allowedMethods: 'GET' }), [
      step('db-select', { database: 'SQL Server', sql: 'SELECT job_id, message_type, status, messages, detail FROM dbo.job_log WHERE job_id = :jobId', inputParameters: '#[{ jobId: attributes.uriParams.jobId as Number }]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(payload)]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '404' }),
            step('set-payload', { value: '#[output application/json --- { error: "NOT_FOUND" }]' }),
          ]),
        ],
        { otherwise: [step('set-payload', { value: '#[output application/json --- { jobId: payload[0].job_id, messageType: payload[0].message_type, status: payload[0].status, messages: payload[0].messages, detail: payload[0].detail }]' })] },
      ),
    ]),
  ),
  description: `
Ashcombe Pharmacy, a fictional pharmacy chain, sends master data to its warehouse partner as outbound messages: ITEM, LOCATION, SUPPLIER. SQL Server generates them. A nightly scheduler starts the runs, and support needs to start one by hand after a fix.

The DBA team provides:
- \`dbo.job_log\` (\`job_id\`, \`message_type\`, \`status\`, \`messages\`, \`detail\`).
- \`dbo.usp_job_claim(@messageType)\`: under a lock, checks for a \`RUNNING\` row of that type. If there is one it returns \`job_id\` null and \`running_job_id\`; otherwise it inserts a \`RUNNING\` row and returns its \`job_id\`.
- \`dbo.usp_generate_outbound(@jobId, @messageType)\`: writes the messages and returns \`message_count\`. It takes **10 to 40 minutes**.

The support console calls \`POST /api/outbound/{messageType}\`. Today the API waits for the procedure, the console times out after 60 seconds, support clicks again, and two ITEM runs send the partner every item twice.

**Requirements**
- Claim a job row through \`usp_job_claim\`. If a run of that type is going, answer **409** \`{ "error": "ALREADY_RUNNING", "runningJobId": 40 }\`.
- Otherwise answer **202** at once: \`{ "jobId": 40, "messageType": "ITEM", "status": "RUNNING", "statusUrl": "/api/outbound/jobs/40" }\`.
- Run the procedure **after** answering. Mark the job \`COMPLETED\` with the message count, or \`FAILED\` with the reason in \`detail\`.
- \`GET /api/outbound/jobs/{jobId}\` returns the job (\`jobId\`, \`status\`, \`messages\`, ...), or **404**.

**Design the flows.**
`,
  answerTemplate: `## Claiming the job

## 202 and the Async scope

## Completing or failing the job

## The status endpoint
`,
  keyPoints: [
    'A long job behind an API answers 202 with a way to follow it. The caller polls the status URL instead of holding a connection for 40 minutes.',
    'The claim must be atomic. A select then an insert lets two clicks pass the select together; a procedure that checks and inserts under a lock, or a unique filtered index on RUNNING rows, does not.',
    'The Async scope runs after the answer is sent. Errors inside it never reach the caller, so the Try inside it must record them in the job row.',
    'Variables set before the Async scope are copied into it, so the job ID is there when the procedure ends.',
    'A RUNNING row left by a crash would block that type for ever. Pair this with a sweep that fails RUNNING rows older than the longest run.',
  ],
  solution: `
**start-outbound-run**
1. **HTTP Listener** \`POST /api/outbound/{messageType}\`. **Set Variable** \`messageType\` in capitals.
2. **Stored Procedure** \`usp_job_claim\` (target \`claim\`).
3. **Choice**: \`job_id == null\`: **Raise Error** \`APP:ALREADY_RUNNING\`; otherwise **Set Variable** \`jobId\`.
4. **Async** { **Try** { **Stored Procedure** \`usp_generate_outbound\`, **Update** COMPLETED with the count } **On Error Continue** { **Update** FAILED with \`error.description\` } }.
5. **Set Variable** \`httpStatus\` 202, **Set Payload** the answer.
6. **On Error Propagate** (\`APP:ALREADY_RUNNING\`): 409 with \`runningJobId\`.

**get-outbound-job**
1. **HTTP Listener** \`GET /api/outbound/jobs/{jobId}\`. **Database Select** the row.
2. **Choice**: empty: 404; otherwise the row as JSON.

**Where Async runs.** It uses the app's own threads. On CloudHub a restart in the middle loses the run, which is why the sweep for stale RUNNING rows matters.
`,
  followUps: [
    {
      q: 'Why not use a VM queue instead of an Async scope?',
      a: 'A persistent VM queue keeps the request if the app restarts before the run begins, and caps how many runs go at once. For runs that last 40 minutes either way, a restart in the middle still needs the stale row sweep.',
    },
    {
      q: 'The nightly scheduler and support start an ITEM run in the same second. What happens?',
      a: 'Both call usp_job_claim. The lock inside it lets one insert the row; the other sees it and gets job_id null. The scheduler should log that and skip, the API answers 409.',
    },
  ],
}
