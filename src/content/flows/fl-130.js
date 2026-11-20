import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const payment = { paymentId: 'PAY-7001', amount: 1250.0, currency: 'EUR', creditorIban: 'XX00TEST0000000001', creditorName: 'Brightline Supplies' }
const submit = (body = payment) => ({ http: { method: 'POST', path: '/payments', body } })
const bankPost = (respond, latencyMs = 900) => ({ method: 'POST', path: '/bank/payments', latencyMs, respond })
const accepted = (req) => ({ status: 201, body: { endToEndId: req.body?.endToEndId, status: 'ACCEPTED', bankReference: `BNK-${String(req.body?.endToEndId).slice(-4)}` } })
// the bank's status service: it has PAY-6990, it never received PAY-6991
const bankGet = { method: 'GET', path: '/bank/payments/{paymentId}', latencyMs: 400, respond: (req) => (req.params.paymentId === 'PAY-6990' ? { status: 200, body: { endToEndId: 'PAY-6990', status: 'ACCEPTED', bankReference: 'BNK-6990' } } : { status: 404, body: { error: 'NOT_FOUND' } }) }
const unknownRows = [
  { payment_id: 'PAY-6990', amount: 310.0, currency: 'EUR', creditor_iban: 'XX00TEST0000000090', status: 'UNKNOWN', bank_reference: null },
  { payment_id: 'PAY-6991', amount: 78.5, currency: 'EUR', creditor_iban: 'XX00TEST0000000091', status: 'UNKNOWN', bank_reference: null },
  { payment_id: 'PAY-6992', amount: 940.0, currency: 'EUR', creditor_iban: 'XX00TEST0000000092', status: 'ACCEPTED', bank_reference: 'BNK-6992' },
]

export default {
  id: 'fl-130',
  category: 'flows',
  title: 'A Bank Payment That Timed Out Is Not a Failed Payment: Record UNKNOWN, Ask the Bank, Then Decide',
  level: 'EXPERT',
  tags: ['payments', 'timeouts', 'unknown-outcome', 'reconciliation', 'scheduler', 'banking', 'idempotency'],
  estMinutes: 50,
  flowChecks: [
    { label: 'The ERP sends payments to a POST on /payments', rule: { type: 'source', component: 'http-listener', where: { path: '/payments', allowedMethods: 'POST' } } },
    {
      label: 'The payment is saved as PENDING before the bank is called',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: { all: ['payments', 'PENDING'] } }, then: 'http-request', thenWhere: { method: 'POST' } },
    },
    {
      label: 'A timeout is not a failure: the payment is marked UNKNOWN and the ERP gets 202',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-update', within: ['on-error-continue', 'on-error-propagate'], withinWhere: { type: 'TIMEOUT' }, where: { sql: 'UNKNOWN' } },
          { type: 'inside', component: 'set-variable', within: ['on-error-continue', 'on-error-propagate'], withinWhere: { type: 'TIMEOUT' }, where: { variableName: 'httpStatus', value: '202' } },
        ],
      },
    },
    {
      label: 'The request never sends a payment twice: no retry around the POST to the bank',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request', where: { method: 'POST', path: '/bank/payments' } },
          { type: 'absent', component: 'http-request', within: 'until-successful', where: { method: 'POST' } },
        ],
      },
    },
    {
      label: 'A scheduled job reads the UNKNOWN payments',
      rule: { type: 'all', rules: [{ type: 'source', component: 'scheduler' }, { type: 'exists', component: 'db-select', where: { sql: { all: ['payments', 'UNKNOWN'] } } }] },
    },
    {
      label: 'The job asks the bank about a payment before it sends anything again',
      rule: { type: 'before', first: 'http-request', firstWhere: { method: 'GET', path: '/bank/payments/' }, then: 'http-request', thenWhere: { method: 'POST' } },
    },
    {
      label: 'Only a payment the bank never received is sent again',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'http-request', within: 'choice', where: { method: 'POST' }, routeWhere: { expression: '404' } },
          { type: 'inside', component: 'http-request', within: 'choice', where: { method: 'POST' }, inSlot: 'otherwise' },
        ],
      },
    },
    {
      label: 'Each payment in the job has its own Try, so one the bank cannot answer does not stop the others',
      rule: { type: 'all', rules: [{ type: 'inside', component: 'http-request', within: 'try', where: { method: 'GET' } }, { type: 'inside', component: 'try', within: 'foreach' }] },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { payments: { key: 'payment_id', rows: [unknownRows[2]] } } },
      http: [bankPost(accepted), bankGet],
    },
    tests: [
      {
        name: 'The bank accepts the payment',
        about: 'The bank answers 201 within a second. The payment is ACCEPTED with the bank reference, and the ERP gets 201.',
        trigger: submit(),
        expect: {
          status: 201,
          bodyHas: { paymentId: 'PAY-7001', status: 'ACCEPTED', bankReference: 'BNK-7001' },
          calls: [{ method: 'POST', path: '/bank/payments', has: { endToEndId: 'PAY-7001' }, count: 1 }],
          db: { payments: { has: [{ payment_id: 'PAY-7001', status: 'ACCEPTED', bank_reference: 'BNK-7001' }] } },
        },
      },
      {
        name: 'The bank does not answer within 15 seconds',
        about: 'The bank takes 40 seconds. The payment may or may not have gone through. It is marked UNKNOWN, the ERP gets 202, and the request does not send it again.',
        trigger: submit(),
        overrides: { systems: { http: [bankPost(accepted, 40000)] } },
        expect: {
          status: 202,
          bodyHas: { paymentId: 'PAY-7001', status: 'UNKNOWN' },
          maxMs: 16000,
          calls: [{ method: 'POST', path: '/bank/payments', count: 1 }],
          db: { payments: { has: [{ payment_id: 'PAY-7001', status: 'UNKNOWN' }] } },
        },
      },
      {
        name: 'The bank rejects the payment',
        about: 'The creditor account is closed and the bank answers 400. The payment is REJECTED and the ERP gets 422, so a person can look at it.',
        trigger: submit(),
        overrides: { systems: { http: [bankPost(() => ({ status: 400, body: { reason: 'ACCOUNT_CLOSED' } }))] } },
        expect: { status: 422, bodyHas: { status: 'REJECTED' }, db: { payments: { has: [{ payment_id: 'PAY-7001', status: 'REJECTED' }] } } },
      },
      {
        name: 'The job settles two unknown payments',
        about: 'The bank has PAY-6990, so it becomes ACCEPTED with no new submission. The bank never received PAY-6991, so it is sent once and becomes ACCEPTED. PAY-6992 is not touched.',
        trigger: { schedule: {} },
        overrides: { systems: { db: { tables: { payments: { key: 'payment_id', rows: unknownRows } } } } },
        expect: {
          noError: true,
          calls: [
            { method: 'GET', path: '/bank/payments/{paymentId}', count: 2 },
            { method: 'POST', path: '/bank/payments', count: 1 },
            { method: 'POST', path: '/bank/payments', has: { endToEndId: 'PAY-6991' }, count: 1 },
          ],
          db: {
            payments: {
              has: [
                { payment_id: 'PAY-6990', status: 'ACCEPTED', bank_reference: 'BNK-6990' },
                { payment_id: 'PAY-6991', status: 'ACCEPTED' },
                { payment_id: 'PAY-6992', status: 'ACCEPTED', bank_reference: 'BNK-6992' },
              ],
            },
          },
        },
      },
      {
        name: 'The bank status service is down during the job',
        about: 'Every status call fails to connect. Nothing is sent again, both payments stay UNKNOWN for the next run, and the job ends without an error.',
        trigger: { schedule: {} },
        overrides: {
          systems: {
            db: { tables: { payments: { key: 'payment_id', rows: unknownRows } } },
            http: [{ method: 'GET', path: '/bank/payments/{paymentId}', respond: { fault: 'CONNECTIVITY' } }],
          },
        },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/bank/payments', count: 0 }],
          db: { payments: { has: [{ payment_id: 'PAY-6990', status: 'UNKNOWN' }, { payment_id: 'PAY-6991', status: 'UNKNOWN' }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'submit-payment',
      source('http-listener', { path: '/payments', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'paymentId', value: '#[payload.paymentId]' }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO payments (payment_id, amount, currency, creditor_iban, status) VALUES (:paymentId, :amount, :currency, :creditorIban, 'PENDING')",
          inputParameters: '#[{ paymentId: payload.paymentId, amount: payload.amount, currency: payload.currency, creditorIban: payload.creditorIban }]',
          target: 'saved',
        }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ endToEndId: payload.paymentId, amount: payload.amount, currency: payload.currency, creditor: { iban: payload.creditorIban, name: payload.creditorName } }',
        }),
        step('http-request', { method: 'POST', path: '/bank/payments', responseTimeout: 15000 }),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE payments SET status = 'ACCEPTED', bank_reference = :bankReference WHERE payment_id = :paymentId",
          inputParameters: '#[{ bankReference: payload.bankReference, paymentId: vars.paymentId }]',
          target: 'updated',
        }),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
        step('set-payload', { value: '#[output application/json --- { paymentId: vars.paymentId, status: "ACCEPTED", bankReference: payload.bankReference }]' }),
      ],
      [
        handler('on-error-continue', { type: 'HTTP:TIMEOUT, HTTP:CONNECTIVITY' }, [
          step('db-update', {
            database: 'Oracle',
            sql: "UPDATE payments SET status = 'UNKNOWN' WHERE payment_id = :paymentId",
            inputParameters: '#[{ paymentId: vars.paymentId }]',
          }),
          step('set-variable', { variableName: 'httpStatus', value: '202' }),
          step('set-payload', { value: '#[output application/json --- { paymentId: vars.paymentId, status: "UNKNOWN", message: "The bank has not confirmed this payment yet. Its status will be settled within the hour." }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:BAD_REQUEST' }, [
          step('db-update', {
            database: 'Oracle',
            sql: "UPDATE payments SET status = 'REJECTED' WHERE payment_id = :paymentId",
            inputParameters: '#[{ paymentId: vars.paymentId }]',
          }),
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[output application/json --- { paymentId: vars.paymentId, status: "REJECTED", reason: error.errorMessage.payload.reason default "REJECTED_BY_BANK" }]' }),
        ]),
      ],
    ),
    flow('settle-unknown-payments', source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }), [
      step('db-select', {
        database: 'Oracle',
        sql: "SELECT payment_id, amount, currency, creditor_iban FROM payments WHERE status = 'UNKNOWN'",
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'payment', value: '#[payload]' }),
        step('set-variable', { variableName: 'paymentId', value: '#[payload.payment_id]' }),
        scope(
          'try',
          {},
          [
            step('http-request', { method: 'GET', path: '/bank/payments/{paymentId}', responseTimeout: 10000, successStatusCodes: '200,404' }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[attributes.statusCode == 200]' }, [
                  step('db-update', {
                    database: 'Oracle',
                    sql: 'UPDATE payments SET status = :status, bank_reference = :bankReference WHERE payment_id = :paymentId',
                    inputParameters: '#[{ status: payload.status, bankReference: payload.bankReference, paymentId: vars.paymentId }]',
                  }),
                ]),
              ],
              {
                otherwise: [
                  step('logger', { level: 'INFO', message: '#["The bank never received " ++ vars.paymentId ++ ". Sending it now."]' }),
                  step('transform', {
                    script: '%dw 2.0\noutput application/json\n---\n{ endToEndId: vars.payment.payment_id, amount: vars.payment.amount, currency: vars.payment.currency, creditor: { iban: vars.payment.creditor_iban } }',
                  }),
                  step('http-request', { method: 'POST', path: '/bank/payments', responseTimeout: 15000 }),
                  step('db-update', {
                    database: 'Oracle',
                    sql: "UPDATE payments SET status = 'ACCEPTED', bank_reference = :bankReference WHERE payment_id = :paymentId",
                    inputParameters: '#[{ bankReference: payload.bankReference, paymentId: vars.paymentId }]',
                  }),
                ],
              },
            ),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [
                step('logger', { level: 'WARN', message: '#["Payment " ++ vars.paymentId ++ " is still UNKNOWN, next run will ask again: " ++ error.description]' }),
              ]),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
A payroll bureau pays suppliers for its clients through a bank's payments API. The ERP calls a Mule API for each payment:

\`POST /payments\` with \`{ "paymentId": "PAY-7001", "amount": 1250.00, "currency": "EUR", "creditorIban": "...", "creditorName": "..." }\`

Mule sends it to the bank: \`POST /bank/payments\`, with the bureau's \`paymentId\` as the \`endToEndId\`. The bank answers:
- **201** \`{ "endToEndId", "status": "ACCEPTED", "bankReference" }\` when it takes the payment;
- **400** \`{ "reason": "ACCOUNT_CLOSED" }\` (or another reason) when it refuses it.

The bank also has a status service: \`GET /bank/payments/{paymentId}\` answers **200** with the same body as the 201 when it has the payment, and **404** when it never received it. **The bank does not check for duplicates**: two POSTs with the same \`endToEndId\` are two payments.

Payments are kept in the Oracle table \`payments\` (\`payment_id\`, \`amount\`, \`currency\`, \`creditor_iban\`, \`status\`, \`bank_reference\`).

Last month the bank took 40 seconds to answer for half an hour. The old flow had a 15 second timeout, answered 500, and the ERP sent each payment again. **38 suppliers were paid twice.**

**Requirements**
- Save each payment as **PENDING** before calling the bank.
- On 201, mark it **ACCEPTED** with the bank reference and answer **201**.
- On 400, mark it **REJECTED** and answer **422**.
- On a timeout or a lost connection, nobody knows if the bank has the payment. Mark it **UNKNOWN** and answer **202**, so the ERP does not send it again. Never retry the POST inside the request.
- Every 5 minutes, settle the UNKNOWN payments: ask the bank, record its answer if it has the payment, and send the payment only if the bank never received it.
- A payment the bank cannot answer about stays UNKNOWN for the next run, and must not stop the job settling the others.

**Facts**
- Give the POST to the bank a response timeout of **15 seconds**. The ERP must have its answer within that time.
- The bank's body is \`{ "endToEndId", "amount", "currency", "creditor": { "iban", "name" } }\`.
- The answers to the ERP: 201 \`{ "paymentId", "status": "ACCEPTED", "bankReference" }\`, 202 \`{ "paymentId", "status": "UNKNOWN" }\`, 422 \`{ "paymentId", "status": "REJECTED", "reason" }\`.
- When the status service answers 200, copy its \`status\` and \`bankReference\` to the row.

**How the status gets out:** the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, also when an error handler built the answer.

**Design the flows.** Explain why a timeout must not be treated as a failure.
`,
  answerTemplate: `## What a timeout means

## Submitting a payment

## The answers the ERP gets

## Settling UNKNOWN payments

## Why no payment is sent twice
`,
  keyPoints: [
    'A timeout tells you nothing about the other side. The bank may have the payment, may be about to process it, or may never have received it.',
    'Treat it as UNKNOWN, not FAILED. FAILED invites a resend, and the bank does not check for duplicates.',
    'Never put a retry around a call that moves money unless the other side can spot a repeat.',
    'Answer 202 for UNKNOWN, so the caller knows the request was taken and should not send it again.',
    'Settle UNKNOWN payments by asking first. Send again only on a definite "never received".',
    'Accept the 404 from the status service as an answer with Success status codes, so it reaches the Choice instead of raising an error.',
    'Give each payment in the job its own Try, so one the bank cannot answer about waits for the next run and the others go on.',
  ],
  solution: `
**Flow 1: submit-payment**
1. **HTTP Listener** \`POST /payments\`.
2. **Set Variable** \`paymentId\`.
3. **Database Insert** with status \`'PENDING'\`, Target \`saved\`.
4. **Transform** to the bank's body, with \`endToEndId: payload.paymentId\`.
5. **HTTP Request** \`POST /bank/payments\`, Response timeout 15000 ms, no retry.
6. **Database Update** \`SET status = 'ACCEPTED', bank_reference = :bankReference\`, then \`httpStatus\` = \`201\` and the answer.
7. Error handling:
   - **On Error Continue** for \`HTTP:TIMEOUT, HTTP:CONNECTIVITY\`: **Database Update** \`SET status = 'UNKNOWN'\`, \`httpStatus\` = \`202\`, body \`{ paymentId, status: "UNKNOWN" }\`.
   - **On Error Propagate** for \`HTTP:BAD_REQUEST\`: **Database Update** \`SET status = 'REJECTED'\`, \`httpStatus\` = \`422\`.

**Flow 2: settle-unknown-payments**
1. **Scheduler**, every 5 minutes.
2. **Database Select** \`WHERE status = 'UNKNOWN'\`.
3. **For Each** payment: keep the row and its ID in variables, then a **Try**:
   - **HTTP Request** \`GET /bank/payments/{paymentId}\`, Success status codes \`200,404\`.
   - **Choice**: on \`attributes.statusCode == 200\`, **Database Update** with the bank's status and reference. Otherwise (404): **Transform** the row to the bank's body, **POST** it once, and mark it ACCEPTED.
   - **On Error Continue** for \`ANY\`: log a WARN. The row stays UNKNOWN.

**Why a timeout is not a failure.** The bank may have received the request and be slow to answer, or the answer may have been lost on the way back. In both cases the money moves. A flow that answers 500, or retries, invites a second payment. UNKNOWN says what is true: nobody knows yet.

**Why no payment is sent twice.** The request sends each payment once. The job sends again only after the bank says 404, never received. If that second POST also times out, the Try leaves the row UNKNOWN and the next run asks again before doing anything.

**One gap to name.** If the bank's status service is behind its payments service, a payment received a second ago could still answer 404. Ask the bank how quickly a payment shows in the status service, and only settle UNKNOWN rows older than that, for example rows last changed more than 10 minutes ago.
`,
  followUps: [
    {
      q: 'What would change if the bank rejected a repeated endToEndId?',
      a: 'Then a resend is safe, because the bank turns a repeat into a duplicate error. You could retry the POST on a timeout and treat the duplicate error as "you already have it". Without that guarantee, ask first.',
    },
    {
      q: 'Why 202 and not 504 for an UNKNOWN payment?',
      a: '504 tells the ERP the request failed, and most callers resend on a 5xx. 202 says the request was taken and is still being settled, which is the truth.',
    },
    {
      q: 'Should the ERP be told when an UNKNOWN payment is settled?',
      a: 'Yes. Publish an event or call the ERP back when the job changes a status, or let the ERP poll GET /payments/{id}.',
    },
    {
      q: 'What if the job runs on two servers at once?',
      a: 'Both could find PAY-6991 missing and both send it. Run the job on one node, or claim each row first with an UPDATE from UNKNOWN to SETTLING that only one server can win.',
    },
  ],
}
