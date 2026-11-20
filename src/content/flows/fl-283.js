import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const tablesWith = (mode, busy = 0) => ({
  apply_ctl: { columns: ['mode', 'busy_left', 'calls'], rows: [{ mode, busy_left: busy, calls: 0 }] },
  batch_log: { key: 'batch_id', columns: ['batch_id', 'status', 'applied', 'reason'], rows: [{ batch_id: 7310, status: 'STAGED', applied: null, reason: null }] },
  apply_reject: { columns: ['batch_id', 'message'], rows: [] },
})
// The DBA team's procedure, as the scenario sees it: busy while another apply holds the lock, then the answer for the batch
const procedures = {
  APPLY_STAGED_ITEMS: (args, db) => {
    const ctl = db.tables.apply_ctl.rows[0]
    ctl.calls += 1
    if (ctl.busy_left > 0) {
      ctl.busy_left -= 1
      return { p_status: 2, p_message: 'Another apply holds the item lock', p_applied: 0 }
    }
    if (ctl.mode === 'partial') return { p_status: 1, p_message: '3 rows refused: unknown department', p_applied: 117 }
    if (ctl.mode === 'error') return { p_status: 9, p_message: 'ORA-01403: no data found in ITEM_DEPT_MAP', p_applied: 0 }
    return { p_status: 0, p_message: 'OK', p_applied: 120 }
  },
}
const trigger = { message: { kind: 'jms', destination: 'pdh.apply.request', payload: { batchId: 7310 } } }

export default {
  id: 'fl-283',
  category: 'flows',
  title: 'Apply Staged Items With an Oracle Procedure That Answers With a Status Code: Retry While It Is Busy, Log a Partial Apply\'s Rejects, Stop at Once on a Real Error, and Close the Batch Row Every Time',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'stored-procedure', 'out-parameters', 'until-successful', 'staging', 'batch-log', 'jms'],
  estMinutes: 45,
  flowChecks: [
    { label: 'Apply requests arrive on the JMS queue pdh.apply.request', rule: { type: 'source', component: 'jms-listener', where: { destination: 'pdh.apply.request' } } },
    { label: 'APPLY_STAGED_ITEMS is called inside an Until Successful', rule: { type: 'inside', component: 'db-stored-procedure', within: 'until-successful', where: { sql: 'APPLY_STAGED_ITEMS' } } },
    { label: 'A busy answer raises an error inside the Until Successful, so it is tried again', rule: { type: 'inside', component: 'raise-error', within: 'until-successful' } },
    { label: 'A partial apply writes its message to apply_reject', rule: { type: 'exists', component: 'db-insert', where: { sql: 'apply_reject' } } },
    { label: 'A failed apply closes the batch row as FAILED from an On Error Continue', rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', where: { sql: { all: ['batch_log', 'FAILED'] } } } },
  ],
  simulation: {
    systems: { db: { tables: tablesWith('ok'), procedures } },
    tests: [
      {
        name: 'A clean apply',
        about: 'The procedure answers 0. Batch 7310 is APPLIED with 120 items.',
        trigger,
        expect: { noError: true, db: { batch_log: { has: [{ batch_id: 7310, status: 'APPLIED', applied: 120 }] }, apply_reject: { count: 0 } }, ack: 'acked' },
      },
      {
        name: 'Busy twice, then free',
        about: 'The nightly price apply holds the lock. The first two calls answer 2, the third works, and the batch is APPLIED.',
        trigger,
        overrides: { systems: { db: { tables: tablesWith('ok', 2) } } },
        expect: { noError: true, db: { batch_log: { has: [{ batch_id: 7310, status: 'APPLIED' }] }, apply_ctl: { has: [{ calls: 3 }] } } },
      },
      {
        name: 'Some rows refused',
        about: 'The procedure answers 1: 117 items applied and 3 refused. The batch is PARTIAL and the message goes to apply_reject for the data team.',
        trigger,
        overrides: { systems: { db: { tables: tablesWith('partial') } } },
        expect: { noError: true, db: { batch_log: { has: [{ batch_id: 7310, status: 'PARTIAL', applied: 117 }] }, apply_reject: { count: 1, has: [{ batch_id: 7310, message: '3 rows refused: unknown department' }] } } },
      },
      {
        name: 'Busy the whole time',
        about: 'The lock is held for longer than the retries last. The batch is FAILED with the reason, and the request is acknowledged: support starts it again.',
        trigger,
        overrides: { systems: { db: { tables: tablesWith('ok', 10) } } },
        expect: { noError: true, db: { batch_log: { has: [{ batch_id: 7310, status: 'FAILED', reason: 'MULE:RETRY_EXHAUSTED' }] } }, ack: 'acked' },
      },
      {
        name: 'A real error',
        about: 'The procedure answers 9 with an Oracle error. Trying again cannot help, so it is called once and the batch is FAILED.',
        trigger,
        overrides: { systems: { db: { tables: tablesWith('error') } } },
        expect: { noError: true, db: { batch_log: { has: [{ batch_id: 7310, status: 'FAILED', reason: 'APP:APPLY_FAILED' }] }, apply_ctl: { has: [{ calls: 1 }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'apply-staged-items',
      source('jms-listener', { destination: 'pdh.apply.request', ackMode: 'AUTO', numberOfConsumers: 1 }),
      [
        step('set-variable', { variableName: 'batchId', value: '#[payload.batchId]' }),
        scope('until-successful', { maxRetries: 4, millisBetweenRetries: 30000 }, [
          step('db-stored-procedure', { database: 'Oracle', sql: '{ call APPLY_STAGED_ITEMS(:batchId, :p_status, :p_message, :p_applied) }', inputParameters: '#[{ batchId: vars.batchId }]', target: 'result' }),
          router('choice', {}, [route({ expression: '#[vars.result.p_status == 2]' }, [step('raise-error', { type: 'APP:BUSY', description: '#[vars.result.p_message]' })])], {
            otherwise: [step('logger', { level: 'DEBUG', message: '#["Apply answered " ++ (vars.result.p_status as String)]' })],
          }),
        ]),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.result.p_status == 0]' }, [
              step('db-update', { database: 'Oracle', sql: "UPDATE batch_log SET status = 'APPLIED', applied = :applied WHERE batch_id = :batchId", inputParameters: '#[{ batchId: vars.batchId, applied: vars.result.p_applied }]' }),
            ]),
            route({ expression: '#[vars.result.p_status == 1]' }, [
              step('db-update', { database: 'Oracle', sql: "UPDATE batch_log SET status = 'PARTIAL', applied = :applied WHERE batch_id = :batchId", inputParameters: '#[{ batchId: vars.batchId, applied: vars.result.p_applied }]' }),
              step('db-insert', { database: 'Oracle', sql: 'INSERT INTO apply_reject (batch_id, message) VALUES (:batchId, :message)', inputParameters: '#[{ batchId: vars.batchId, message: vars.result.p_message }]' }),
            ]),
          ],
          { otherwise: [step('raise-error', { type: 'APP:APPLY_FAILED', description: '#[vars.result.p_message]' })] },
        ),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Batch " ++ (vars.batchId as String) ++ " failed: " ++ error.description]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE batch_log SET status = 'FAILED', reason = :reason WHERE batch_id = :batchId", inputParameters: '#[{ batchId: vars.batchId, reason: error.errorType.asString }]' }),
        ]),
      ],
    ),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, stages item data in Oracle before it reaches the merchandising tables. When a batch is staged, a request arrives on the **JMS** queue \`pdh.apply.request\`: \`{ "batchId": 7310 }\`.

The DBA team owns the procedure that moves a batch from staging into the base tables:

\`\`\`sql
APPLY_STAGED_ITEMS(p_batch_id IN NUMBER, p_status OUT NUMBER, p_message OUT VARCHAR2, p_applied OUT NUMBER)
\`\`\`

It does not raise errors. It answers with \`p_status\`:
- \`0\`: everything applied; \`p_applied\` holds the count.
- \`1\`: applied in part; \`p_message\` says what was refused.
- \`2\`: busy: another apply (often the nightly price job) holds the item lock. It is free again within a minute or two.
- anything else: a real error, in \`p_message\`.

\`batch_log\` (\`batch_id\`, \`status\`, \`applied\`, \`reason\`) shows each batch's state; it starts as \`STAGED\`. \`apply_reject\` (\`batch_id\`, \`message\`) is what the data team reads each morning.

The first version called the procedure once and logged "done". Busy answers were taken as success, and 30 batches sat in staging for a week.

**Requirements**
- Call the procedure again while it answers busy, about every 30 seconds, for up to two minutes.
- \`0\`: mark the batch \`APPLIED\` with the count. \`1\`: mark it \`PARTIAL\` with the count and write the message to \`apply_reject\`.
- A real error must not be tried again.
- Any failure, including busy for too long, marks the batch \`FAILED\` with the error type, and the request is acknowledged.

**Facts**
- Call the procedure with a target variable. The OUT parameters come back by name: \`{ p_status, p_message, p_applied }\`.
- Retry with an **Until Successful**. It retries only on an error, so raise \`APP:BUSY\` inside it for status 2. When the retries run out, Mule raises \`MULE:RETRY_EXHAUSTED\`.
- For a real error, raise \`APP:APPLY_FAILED\` outside the Until Successful.
- \`reason\` holds the error type as text, such as \`APP:APPLY_FAILED\` or \`MULE:RETRY_EXHAUSTED\`.
- The listener uses the ack mode \`AUTO\`. A flow handler **On Error Continue** closes the row, so the message is acknowledged.

**Design the flow.**
`,
  answerTemplate: `## Reading the OUT parameters

## Retrying busy

## Applied, partial, failed

## Closing the batch row
`,
  keyPoints: [
    'A procedure that answers with a status code never fails on its own. Turn the codes into flow behaviour yourself, or every answer looks like success.',
    'Until Successful retries only on an error. Raise one for the busy code inside the scope, so the retry is about the lock and nothing else.',
    'Keep the real error outside the Until Successful. Calling again cannot fix missing reference data, and four more calls only delay the alert.',
    'The OUT parameters come back by name in the result. With a target variable the payload stays the request, and the result sits in vars.result.',
    'The handler closes the row for every failure, including MULE:RETRY_EXHAUSTED, so no batch is left saying STAGED.',
  ],
  solution: `
1. **JMS On New Message** on \`pdh.apply.request\`, one consumer. **Set Variable** \`batchId\`.
2. **Until Successful** (4 retries, 30,000 ms):
   - **Stored Procedure** \`APPLY_STAGED_ITEMS\` (target \`result\`).
   - **Choice**: \`p_status == 2\`: **Raise Error** \`APP:BUSY\`.
3. **Choice**:
   - 0: **Update** \`batch_log\` APPLIED.
   - 1: **Update** PARTIAL, **Insert** into \`apply_reject\`.
   - otherwise: **Raise Error** \`APP:APPLY_FAILED\` with \`p_message\`.
4. **On Error Continue** (ANY): **Logger** ERROR, **Update** \`batch_log\` FAILED with \`error.errorType.asString\`.

**Why one consumer.** Two applies at once would only fight over the same lock. One consumer keeps the batches in turn.
`,
  followUps: [
    {
      q: 'The retry holds the JMS message and a thread for two minutes. Is that a problem?',
      a: 'With one consumer and a few batches an hour it is fine. With many requests, send a busy batch to a wait queue with a delay instead, as a claim check notice waits for its blob.',
    },
    {
      q: 'Why acknowledge the request when the apply failed?',
      a: 'The batch row now says FAILED with the reason, and support starts it again after the fix. Redelivering it would repeat the same failure and hide new requests behind it.',
    },
  ],
}
