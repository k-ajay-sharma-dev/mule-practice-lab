import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const order = { http: { method: 'POST', path: '/click-collect-orders', body: { orderId: 'CC-30881', storeId: '0101', email: 'r.hale@mail.example', items: 3 } } }
const relay = { schedule: { flow: 'confirmation-relay' } }
const tables = () => ({
  cc_orders: { key: 'order_id', columns: ['order_id', 'store_id', 'item_count', 'status'], rows: [] },
  email_outbox: { key: 'id', columns: ['id', 'order_id', 'to_addr', 'subject', 'status'], rows: [] },
})

export default {
  id: 'fl-241',
  category: 'flows',
  title: 'Click and Collect Confirmations Through an Oracle Outbox: Write the Order and Its Email Row in One Transaction, and Let a Relay Send After the Commit',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'smtp', 'outbox', 'transaction', 'oracle', 'http', 'scheduler'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Orders are taken on POST /click-collect-orders', rule: { type: 'source', component: 'http-listener', where: { path: '/click-collect-orders', allowedMethods: 'POST' } } },
    {
      label: 'The order and its outbox row are written in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'cc_orders' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: { all: ['email_outbox', 'PENDING'] } } },
        ],
      },
    },
    { label: 'The order API never sends mail itself', rule: { type: 'all', rules: [{ type: 'exists', component: 'email-send' }, { type: 'absent', component: 'email-send', inFlowWith: { component: 'http-listener' } }] } },
    { label: 'A failed send is caught inside the loop, so the next email still goes', rule: { type: 'handler', component: 'on-error-continue', within: 'foreach' } },
    { label: 'A scheduled relay reads PENDING rows, sends them and marks them SENT', rule: { type: 'all', rules: [{ type: 'source', component: 'scheduler' }, { type: 'exists', component: 'db-select', where: { sql: { all: ['email_outbox', 'PENDING'] } } }, { type: 'before', first: 'email-send', then: 'db-update', thenWhere: { sql: 'SENT' } }] } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'An order, then the relay runs',
        about: 'The order and a PENDING email row commit together and the shopper gets 201. The relay then sends the confirmation and marks the row SENT.',
        triggers: [order, relay],
        expect: {
          db: { cc_orders: { count: 1, has: [{ order_id: 'CC-30881' }] }, email_outbox: { count: 1, has: [{ order_id: 'CC-30881', status: 'SENT' }] } },
          emails: [{ to: 'r.hale@mail.example', count: 1, subject: 'CC-30881' }],
        },
      },
      {
        name: 'The outbox insert fails',
        about: 'The email row cannot be written, so the order is rolled back too and the shopper gets 500. No confirmation is ever sent for an order that does not exist.',
        triggers: [order, relay],
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO email_outbox', fault: 'QUERY_EXECUTION', description: 'ORA-01653: unable to extend table' }] } } },
        expect: { status: 500, db: { cc_orders: { count: 0 }, email_outbox: { count: 0 } }, noEmails: true },
      },
      {
        name: 'The mail relay is down',
        about: 'The order is safe and answered with 201. The relay cannot send, so the row stays PENDING for the next run.',
        triggers: [order, relay],
        overrides: { systems: { email: { fault: true } } },
        expect: { db: { cc_orders: { count: 1 }, email_outbox: { has: [{ order_id: 'CC-30881', status: 'PENDING' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('click-collect-orders-api', source('http-listener', { path: '/click-collect-orders', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'o', value: '#[payload]' }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO cc_orders (order_id, store_id, item_count, status) VALUES (:orderId, :storeId, :items, 'PLACED')",
          inputParameters: '#[{ orderId: vars.o.orderId, storeId: vars.o.storeId, items: vars.o.items }]',
        }),
        step('db-insert', {
          database: 'Oracle',
          sql: "INSERT INTO email_outbox (id, order_id, to_addr, subject, status) VALUES (:id, :orderId, :toAddr, :subject, 'PENDING')",
          inputParameters: '#[{ id: uuid(), orderId: vars.o.orderId, toAddr: vars.o.email, subject: "Your order " ++ vars.o.orderId ++ " is being picked" }]',
        }),
      ]),
      step('set-variable', { variableName: 'httpStatus', value: '201' }),
      step('set-payload', { value: '#[output application/json --- { orderId: vars.o.orderId, status: "PLACED" }]' }),
    ]),
    flow('confirmation-relay', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'SECONDS' }), [
      step('db-select', { database: 'Oracle', sql: "SELECT id, order_id, to_addr, subject FROM email_outbox WHERE status = 'PENDING' ORDER BY id FETCH FIRST 50 ROWS ONLY" }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'row', value: '#[payload]' }),
        scope('try', {}, [
          step('email-send', { toAddresses: '#[vars.row.to_addr]', subject: '#[vars.row.subject]', content: '#["We have your order " ++ vars.row.order_id ++ ". We will email you again when it is ready to collect."]' }),
          step('db-update', { database: 'Oracle', sql: "UPDATE email_outbox SET status = 'SENT' WHERE id = :id", inputParameters: '#[{ id: vars.row.id }]' }),
        ], {
          errorHandlers: [handler('on-error-continue', { type: 'ANY' }, [step('logger', { level: 'WARN', message: '#["Confirmation for " ++ vars.row.order_id ++ " not sent yet: " ++ error.description]' })])],
        }),
      ]),
    ]),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, takes click and collect orders through \`POST /click-collect-orders\`:

\`\`\`json
{ "orderId": "CC-30881", "storeId": "0101", "email": "r.hale@mail.example", "items": 3 }
\`\`\`

Orders go into the Oracle table \`cc_orders\` (\`order_id\`, \`store_id\`, \`item_count\`, \`status\`). The shopper must get a confirmation email.

Two things went wrong with the first version, which sent the email right after the insert:
- The insert later rolled back, and the shopper got a confirmation for an order that did not exist.
- The mail relay was slow one evening, and checkout waited 30 seconds for it.

The team added \`email_outbox\` (\`id\`, \`order_id\`, \`to_addr\`, \`subject\`, \`status\`).

**Requirements**
- Insert the order (status \`PLACED\`) and a \`PENDING\` outbox row for its confirmation together, or neither. Answer **201** \`{ orderId, status }\`.
- The order API never talks to the mail relay.
- A relay flow runs every 30 seconds, sends up to 50 \`PENDING\` emails one by one, and marks each \`SENT\`. A failed send stays \`PENDING\` for the next run, with a WARN.

**Facts**
- Name the relay flow \`confirmation-relay\`.
- Make the outbox \`id\` with \`uuid()\`. The subject carries the order ID, such as \`Your order CC-30881 is being picked\`.
- Put the status code in the variable \`httpStatus\`. The listener answers with it. A failed insert must not be caught, so the shopper gets 500.

**Design the flows.**
`,
  answerTemplate: `## Writing the order and the email row

## The relay

## When the relay is down
`,
  keyPoints: [
    'The outbox row commits with the order, so an email exists if and only if the order does. That is the whole point of the pattern.',
    'Checkout no longer waits for SMTP. The relay takes the time the relay needs.',
    'The relay gives at least once delivery: a crash after the send but before the SENT update sends the email again. Shoppers rarely mind a second confirmation; they mind a confirmation for nothing.',
    'Each email has its own Try, so one bad address does not hold up the others.',
    'Keep the body out of the outbox if it is built from data you can read again later. Less personal data stored, and a template change applies to emails not yet sent.',
  ],
  solution: `
**Flow \`click-collect-orders-api\`**
1. **HTTP Listener** \`POST /click-collect-orders\`. **Set Variable** \`o\`.
2. **Try** ALWAYS_BEGIN: **Database Insert** into \`cc_orders\`, **Database Insert** into \`email_outbox\` with \`PENDING\`.
3. \`httpStatus\` 201 and \`{ orderId, status: "PLACED" }\`.

**Flow \`confirmation-relay\`**
1. **Scheduler** every 30 seconds.
2. **Database Select** \`PENDING\` rows, first 50.
3. **For Each**: \`row\`, a **Try** with **Email Send** and **Database Update** \`SENT\`. **On Error Continue**: WARN.

**Faster than 30 seconds.** If shoppers expect the email at once, the API can also put the outbox ID on a queue after the commit. The relay then reacts at once, and the scheduled poll only catches what the queue missed.
`,
  followUps: [
    {
      q: 'The relay runs on two workers. What can go wrong?',
      a: 'Both read the same PENDING rows and each sends them. Run the Scheduler on the primary node only, or claim rows with FOR UPDATE SKIP LOCKED and a SENDING status.',
    },
    {
      q: 'How do you clean the outbox?',
      a: 'A nightly job deletes SENT rows older than a set time, such as 30 days, and alerts on rows PENDING for more than an hour.',
    },
  ],
}
