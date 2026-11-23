import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

const running = { job_id: 'JOB-77001', message_type: 'SupplierItem', status: 'RUNNING' }
const ask = (type) => ({ http: { method: 'POST', path: `/pdh/outbound/${type}` } })

export default {
  id: 'fl-162',
  category: 'flows',
  title: 'Product Data Hub Outbound: A Nightly Scheduler and an HTTP Trigger per Message Type, a Job Row, and Oracle Generating the Messages in the Background',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'jms', 'outbound', 'scheduler', 'async', 'stored-procedure', 'oracle', 'job-log', 'gs1'],
  estMinutes: 50,
  flowChecks: [
    { label: 'A Scheduler starts the nightly Item run', rule: { type: 'source', component: 'scheduler' } },
    { label: 'Support can start a run for one type with POST /pdh/outbound/{messageType}', rule: { type: 'source', component: 'http-listener', where: { path: '/pdh/outbound/', allowedMethods: 'POST' } } },
    {
      label: 'Both triggers call one shared flow',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'flow-ref', min: 2 }, { type: 'refs' }] },
    },
    { label: 'A type that already has a RUNNING job gets 409', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '409' } } },
    { label: 'The job row is written before the background work starts', rule: { type: 'before', first: 'db-insert', firstWhere: { sql: 'pdh_outbound_jobs' }, then: 'async' } },
    { label: 'Oracle generates the messages in an Async scope', rule: { type: 'inside', component: 'db-stored-procedure', within: 'async' } },
    {
      label: 'A failed generation marks the job FAILED and announces nothing',
      rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: 'FAILED' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: { pdh_outbound_jobs: { key: 'job_id', columns: ['job_id', 'message_type', 'status'], rows: [running] } },
        procedures: { 'PDH_OUTBOUND.GENERATE': () => ({ generated: 1240 }) },
      },
    },
    tests: [
      {
        name: 'Support asks for an Item run',
        about: 'The caller gets 202 with a job ID at once. In the background Oracle generates the messages, the job becomes COMPLETE, and PDH.OUTBOUND.READY announces it.',
        trigger: ask('Item'),
        expect: {
          status: 202,
          bodyHas: { status: 'RUNNING' },
          db: { pdh_outbound_jobs: { count: 2, has: [{ message_type: 'Item', status: 'COMPLETE' }] } },
          sent: [{ destination: 'PDH.OUTBOUND.READY', count: 1, has: { messageType: 'Item' } }],
        },
      },
      {
        name: 'A SupplierItem run is already going',
        about: 'A second request for the same type would make Oracle generate the same messages twice. It gets 409 and no job.',
        trigger: ask('SupplierItem'),
        expect: { status: 409, db: { pdh_outbound_jobs: { count: 1 } }, notSent: ['PDH.OUTBOUND.READY'] },
      },
      {
        name: 'A type the hub does not send',
        about: 'Pricing is not an outbound type. The answer is 400 and nothing is recorded.',
        trigger: ask('Pricing'),
        expect: { status: 400, db: { pdh_outbound_jobs: { count: 1 } } },
      },
      {
        name: 'The nightly run',
        about: 'The Scheduler starts an Item run with no caller. It is recorded and completed like any other.',
        trigger: { schedule: {} },
        expect: { db: { pdh_outbound_jobs: { has: [{ message_type: 'Item', status: 'COMPLETE' }] } }, sent: [{ destination: 'PDH.OUTBOUND.READY', count: 1 }] },
      },
      {
        name: 'Oracle fails to generate',
        about: 'The procedure fails. The caller already has 202, the job is marked FAILED, and nothing is announced.',
        trigger: ask('Barcode'),
        overrides: { systems: { db: { failWhen: [{ match: 'PDH_OUTBOUND.GENERATE', fault: 'QUERY_EXECUTION', description: 'ORA-20001: generation failed' }] } } },
        expect: { status: 202, db: { pdh_outbound_jobs: { has: [{ message_type: 'Barcode', status: 'FAILED' }] } }, notSent: ['PDH.OUTBOUND.READY'], logs: [{ level: 'ERROR' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('pdh-outbound-nightly', source('scheduler', { strategy: 'cron', expression: '0 0 2 * * ?' }), [
      step('set-variable', { variableName: 'messageType', value: 'Item' }),
      step('flow-ref', { name: 'pdh-start-outbound-job' }),
    ]),
    flow('pdh-outbound-on-request', source('http-listener', { path: '/pdh/outbound/{messageType}', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'messageType', value: '#[attributes.uriParams.messageType]' }),
      step('flow-ref', { name: 'pdh-start-outbound-job' }),
    ]),
    subFlow('pdh-start-outbound-job', [
      router(
        'choice',
        {},
        [
          route({ expression: '#[not (["Item", "SupplierItem", "Barcode", "TransferOrder"] contains vars.messageType)]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { message: vars.messageType ++ " is not an outbound message type" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('db-select', {
              database: 'Oracle',
              sql: "SELECT job_id FROM pdh_outbound_jobs WHERE message_type = :messageType AND status = 'RUNNING'",
              inputParameters: '#[{ messageType: vars.messageType }]',
              target: 'busy',
            }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[not isEmpty(vars.busy)]' }, [
                  step('set-variable', { variableName: 'httpStatus', value: '409' }),
                  step('set-payload', { value: '#[output application/json --- { message: "A " ++ vars.messageType ++ " run is already going", jobId: vars.busy[0].JOB_ID }]' }),
                ]),
              ],
              {
                otherwise: [
                  step('set-variable', { variableName: 'jobId', value: '#[uuid()]' }),
                  step('db-insert', {
                    database: 'Oracle',
                    sql: "INSERT INTO pdh_outbound_jobs (job_id, message_type, status) VALUES (:jobId, :messageType, 'RUNNING')",
                    inputParameters: '#[{ jobId: vars.jobId, messageType: vars.messageType }]',
                    target: 'job',
                  }),
                  scope('async', {}, [
                    scope('try', {}, [
                      step('db-stored-procedure', {
                        database: 'Oracle',
                        sql: '{ call PDH_OUTBOUND.GENERATE(:jobId, :messageType) }',
                        inputParameters: '#[{ jobId: vars.jobId, messageType: vars.messageType }]',
                        target: 'generated',
                      }),
                      step('db-update', {
                        database: 'Oracle',
                        sql: "UPDATE pdh_outbound_jobs SET status = 'COMPLETE' WHERE job_id = :jobId",
                        inputParameters: '#[{ jobId: vars.jobId }]',
                        target: 'done',
                      }),
                      step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, messageType: vars.messageType }]' }),
                      step('jms-publish', { destination: 'PDH.OUTBOUND.READY', destinationType: 'QUEUE', persistentDelivery: 'true' }),
                    ], {
                      errorHandlers: [
                        handler('on-error-continue', { type: 'ANY' }, [
                          step('logger', { level: 'ERROR', message: '#["Outbound " ++ vars.messageType ++ " job " ++ vars.jobId ++ " failed: " ++ error.description]' }),
                          step('db-update', {
                            database: 'Oracle',
                            sql: "UPDATE pdh_outbound_jobs SET status = 'FAILED' WHERE job_id = :jobId",
                            inputParameters: '#[{ jobId: vars.jobId }]',
                          }),
                        ]),
                      ],
                    }),
                  ]),
                  step('set-variable', { variableName: 'httpStatus', value: '202' }),
                  step('set-payload', { value: '#[output application/json --- { jobId: vars.jobId, messageType: vars.messageType, status: "RUNNING" }]' }),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
Copperline Home Supply’s product data hub (fictional) also **sends** messages: Item, SupplierItem, Barcode and TransferOrder updates for suppliers and stores. Oracle builds them. The PL/SQL procedure \`PDH_OUTBOUND.GENERATE(job_id, message_type)\` reads the changes since the last run and writes the outbound messages, which can take several minutes.

You build the outbound app.

**Requirements**
- A Scheduler starts an \`Item\` run every night at 02:00.
- Support can start a run for one type with \`POST /pdh/outbound/{messageType}\`. Allowed types: \`Item\`, \`SupplierItem\`, \`Barcode\`, \`TransferOrder\`. Anything else gets **400**.
- Never run two jobs of the same type at once. If the table \`pdh_outbound_jobs\` (\`job_id\`, \`message_type\`, \`status\`) has a \`RUNNING\` job for the type, answer **409**.
- Record each job as \`RUNNING\`, answer **202** \`{ jobId, messageType, status: "RUNNING" }\` at once, and call the procedure in the background.
- When the procedure ends, mark the job \`COMPLETE\` and publish \`{ jobId, messageType }\` to the JMS queue \`PDH.OUTBOUND.READY\`, where the sending flows pick it up. If it fails, mark the job \`FAILED\`, log an ERROR and announce nothing.
- Keep the job steps in one flow that both triggers call with Flow Reference.

**Facts**
- \`job_id\` is a new UUID made in the flow. Call the procedure as \`{ call PDH_OUTBOUND.GENERATE(:jobId, :messageType) }\`.
- Write the statuses \`'RUNNING'\`, \`'COMPLETE'\` and \`'FAILED'\` as literals in the SQL.
- A failed procedure raises **DB:QUERY_EXECUTION** (for example \`ORA-20001: generation failed\`). Inside an Async scope the caller never sees it, so catch it there, mark the job \`FAILED\` and log an ERROR.

**What each system sends back**
- The busy check (Database Select) answers a list of rows: \`[ { "JOB_ID": "JOB-77001" } ]\` when a run is going, or \`[]\`. Oracle returns unquoted column names in upper case, so read \`JOB_ID\`.
- The Stored Procedure answers its output parameters, here \`{ "generated": 1240 }\`. The flow does not need them; it only needs the call to succeed.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flows.**
`,
  answerTemplate: `## Two triggers, one job flow

## Refusing a bad type and a second run

## The job row and the 202

## Generating in the background

## When Oracle fails
`,
  keyPoints: [
    'Put the shared logic in one flow and call it from the Scheduler and from the HTTP trigger. Each trigger only sets the message type.',
    'A job row with a status is the hub\'s memory of what is running. It blocks a second run of the same type and tells support how each run ended.',
    'Write the RUNNING row before starting the background work, so the job exists even if the work fails at once.',
    'An Async scope lets the caller have its 202 while Oracle works for minutes. Errors inside it never reach the caller, so the Async scope needs its own Try.',
    'Only a COMPLETE job is announced on the queue. The sending flows never start from half generated data.',
    'The check for a running job and the insert are two statements. Two requests in the same second could both pass. A unique index on message_type for RUNNING rows closes that gap.',
  ],
  solution: `
**Flow \`pdh-outbound-nightly\`**: **Scheduler** cron \`0 0 2 * * ?\`, \`messageType\` = \`Item\`, **Flow Reference** \`pdh-start-outbound-job\`.

**Flow \`pdh-outbound-on-request\`**: **HTTP Listener** \`POST /pdh/outbound/{messageType}\`, \`messageType\` from the URI, **Flow Reference** \`pdh-start-outbound-job\`.

**Sub-flow \`pdh-start-outbound-job\`**
1. **Choice**: a type not in the list sets 400 and a message.
2. Otherwise **Database Select** RUNNING jobs for the type, Target \`busy\`.
3. **Choice**: \`not isEmpty(vars.busy)\` sets 409. Otherwise:
   - \`jobId\` = \`#[uuid()]\`, **Database Insert** the RUNNING row.
   - **Async** with a **Try** inside: **Stored Procedure** \`{ call PDH_OUTBOUND.GENERATE(:jobId, :messageType) }\`, **Database Update** to \`COMPLETE\`, **JMS Publish** \`{ jobId, messageType }\` to \`PDH.OUTBOUND.READY\`. **On Error Continue**: ERROR log and **Database Update** to \`FAILED\`.
   - \`httpStatus\` = \`202\` and the answer.

**A worker restart during a run.** An Async scope lives in memory, so a restart leaves the job RUNNING for ever and blocks the type. Let a check treat RUNNING jobs older than an hour as stuck, or hand the work to a persistent VM queue instead of Async.

**Which node runs the Scheduler.** In a cluster, a Scheduler runs on the primary node only, so the nightly run starts once.
`,
  followUps: [
    {
      q: 'Why not call the procedure directly and answer when it ends?',
      a: 'It takes minutes. The HTTP caller would time out, and the procedure might still be running when support clicks again. The 202 with a job ID lets the caller come back and look.',
    },
    {
      q: 'How does support see how a job ended?',
      a: 'Add GET /pdh/outbound/jobs/{jobId}, which reads pdh_outbound_jobs. Later add the counts the procedure returns.',
    },
  ],
}
