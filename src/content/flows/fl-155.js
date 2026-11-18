import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const payment = (paymentId, deliveryCount = 1) => ({
  message: { kind: 'jms', destination: 'PAYMENTS.RECEIVED', deliveryCount, payload: { paymentId, accountNo: 'WA-3381270', amount: 64.2, receivedAt: '2026-11-13T07:02:11Z' } },
})
const posted = { payment_id: 'BP-7700418', account_no: 'WA-3381270', amount: 64.2 }

export default {
  id: 'fl-155',
  category: 'flows',
  title: 'A Payment Redelivered After a Crash: Credit the Account Once, Even When JMS Delivers the Message Twice',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'jms', 'idempotency', 'redelivery', 'database', 'utilities'],
  estMinutes: 25,
  flowChecks: [
    { label: 'Payments are read from PAYMENTS.RECEIVED', rule: { type: 'source', component: 'jms-listener', where: { destination: 'PAYMENTS.RECEIVED' } } },
    {
      label: 'The payment ID is looked up in posted_payments before the billing call',
      rule: { type: 'before', first: 'db-select', firstWhere: { sql: { all: ['posted_payments', ':paymentId'] } }, then: 'http-request' },
    },
    { label: 'The billing call is made only for a payment not seen before', rule: { type: 'inside', component: 'http-request', within: 'choice' } },
    { label: 'The payment is recorded after billing accepted it', rule: { type: 'before', first: 'http-request', then: 'db-insert', thenWhere: { sql: 'posted_payments' }, outside: true } },
  ],
  simulation: {
    systems: {
      db: { tables: { posted_payments: { key: 'payment_id', rows: [posted] } } },
      http: [{ method: 'POST', path: '/billing/v1/accounts/{accountNo}/credits', respond: { status: 201, body: { creditId: 'CR-55120' } } }],
    },
    tests: [
      {
        name: 'A new payment',
        about: 'The account is credited once and the payment is recorded.',
        trigger: payment('BP-7700420'),
        expect: { ack: 'acked', calls: [{ method: 'POST', path: '/billing/v1/accounts/WA-3381270/credits', count: 1 }], db: { posted_payments: { count: 2, has: [{ payment_id: 'BP-7700420' }] } } },
      },
      {
        name: 'The same payment delivered again',
        about: 'Mule stopped after the last run before the broker heard the acknowledgement, so BP-7700418 comes again. Billing is not called, and the message is acknowledged.',
        trigger: payment('BP-7700418', 2),
        expect: { ack: 'acked', calls: [{ method: 'POST', path: '/billing/v1/accounts/{accountNo}/credits', count: 0 }], db: { posted_payments: { count: 1 } }, logs: [{ level: ['INFO', 'WARN'] }] },
      },
      {
        name: 'Billing is down',
        about: 'Billing answers 503. Nothing is recorded, so the payment goes back to the queue and is credited when billing is back.',
        trigger: payment('BP-7700421'),
        overrides: { systems: { http: [{ method: 'POST', path: '/billing/v1/accounts/{accountNo}/credits', respond: { status: 503, body: { message: 'maintenance' } } }] } },
        expect: { ack: 'returned', db: { posted_payments: { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('post-received-payments', source('jms-listener', { destination: 'PAYMENTS.RECEIVED', ackMode: 'AUTO' }), [
      step('set-variable', { variableName: 'payment', value: '#[payload]' }),
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT payment_id FROM posted_payments WHERE payment_id = :paymentId',
        inputParameters: '#[{ paymentId: vars.payment.paymentId }]',
        target: 'seen',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(vars.seen)]' }, [
            step('set-payload', { value: '#[output application/json --- { paymentId: vars.payment.paymentId, amount: vars.payment.amount, receivedAt: vars.payment.receivedAt }]' }),
            step('http-request', { method: 'POST', path: '#["/billing/v1/accounts/" ++ vars.payment.accountNo ++ "/credits"]' }),
            step('db-insert', {
              database: 'PostgreSQL',
              sql: 'INSERT INTO posted_payments (payment_id, account_no, amount) VALUES (:paymentId, :accountNo, :amount)',
              inputParameters: '#[{ paymentId: vars.payment.paymentId, accountNo: vars.payment.accountNo, amount: vars.payment.amount }]',
            }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'INFO', message: '#["Payment " ++ vars.payment.paymentId ++ " was posted before, redelivery skipped"]' })] },
      ),
    ]),
  ),
  description: `
Pellow Water, a fictional utility, receives customer payments from its bank. A bank adapter puts each payment on the ActiveMQ queue \`PAYMENTS.RECEIVED\`:

\`{ "paymentId": "BP-7700420", "accountNo": "WA-3381270", "amount": 64.2, "receivedAt": "..." }\`

Your flow credits the account in the billing system with \`POST /billing/v1/accounts/{accountNo}/credits\`. Billing does not check for repeats: two calls make two credits.

Last week a Mule worker was restarted during a deploy. Messages it had processed but not yet acknowledged were delivered again, and 31 customers were credited twice.

The table \`posted_payments\` (\`payment_id\`, \`account_no\`, \`amount\`) is yours to use.

**Requirements**
- Credit each payment once, however many times it is delivered.
- A repeat is acknowledged and logged, not treated as an error.
- If billing fails, record nothing, so the payment is delivered again and credited later.

**Design the flow.**
`,
  answerTemplate: `## Why repeats happen

## Spotting a repeat

## Crediting and recording

## When billing fails
`,
  keyPoints: [
    'JMS and Anypoint MQ deliver at least once. A message can arrive again after a crash, a timeout or a rebalance, so the consumer must make a repeat harmless.',
    'An idempotent consumer remembers what it has done, keyed on a business ID from the message, not on the broker\'s message ID, which can change when a message is resent.',
    'Check first, act, then record. If billing fails, nothing is recorded and the redelivery does the work.',
    'There is still a small gap: a crash after the billing call and before the insert. Close it by sending billing an idempotency key it honours, or by recording the payment as PENDING first and checking billing on a retry.',
    'With AUTO acknowledgement a failed flow returns the message to the broker, so no extra step is needed to retry.',
  ],
  solution: `
1. **JMS On New Message** on \`PAYMENTS.RECEIVED\`.
2. **Set Variable** \`payment\` = \`#[payload]\`.
3. **Database Select**, Target \`seen\`: \`SELECT payment_id FROM posted_payments WHERE payment_id = :paymentId\`.
4. **Choice**:
   - \`#[isEmpty(vars.seen)]\`: build the credit, **HTTP Request** \`POST /billing/v1/accounts/{accountNo}/credits\`, then **Database Insert** into \`posted_payments\`.
   - Otherwise: **Logger** INFO "posted before, redelivery skipped".

**The remaining gap.** Ask the billing team for an idempotency key header. Then a repeat that slips through the gap is refused by billing too.

**Why not the Idempotent Message Validator?** It keeps IDs in an Object Store with a time to live. A database row is kept as long as the payment matters and can be checked by finance.
`,
  followUps: [
    {
      q: 'Why not use the JMS message ID as the key?',
      a: 'If the bank adapter resends a payment, it gets a new JMS message ID. The paymentId stays the same, so it catches both kinds of repeat.',
    },
    {
      q: 'How could you tell a redelivery from a new message without a database?',
      a: 'JMS sets the JMSRedelivered header and JMSXDeliveryCount. They show a redelivery, but not whether the first try got as far as billing, so they cannot replace the record.',
    },
  ],
}
