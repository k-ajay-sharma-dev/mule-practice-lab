import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const order = (orderId) => ({
  message: {
    kind: 'jms',
    destination: 'WEB.ORDERS',
    payload: { orderId, customer: { name: 'Jo Bloggs', email: 'jo.bloggs@mail.example', address: '14 Fen Lane, Ely' }, total: 129.0, lines: [{ sku: 'TENT-2P-OLV', qty: 1 }] },
  },
})
const tables = () => ({ web_orders: { key: 'order_id', columns: ['order_id', 'customer_name', 'customer_email', 'total'], rows: [] } })

export default {
  id: 'fl-236',
  category: 'flows',
  title: 'A Failure Alert by Email That Carries No Customer Data: the Order ID, the Error Type and the Correlation ID, and Nothing More',
  level: 'BEGINNER',
  tags: ['myproject', 'email', 'smtp', 'alerts', 'privacy', 'oracle', 'jms'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Web orders are read from WEB.ORDERS and inserted into web_orders', rule: { type: 'all', rules: [{ type: 'source', component: 'jms-listener', where: { destination: 'WEB.ORDERS' } }, { type: 'exists', component: 'db-insert', where: { sql: 'web_orders' } }] } },
    { label: 'A failed order is kept on WEB.ORDERS.FAILED', rule: { type: 'inside', component: 'jms-publish', within: 'on-error-continue', where: { destination: 'WEB.ORDERS.FAILED' } } },
    { label: 'The error handler emails integration support', rule: { type: 'inside', component: 'email-send', within: 'on-error-continue', where: { toAddresses: 'integration-support@brindle.example' } } },
    { label: 'The alert body names the order and the correlation ID, and no customer field', rule: { type: 'exists', component: 'email-send', where: { content: { all: ['orderId', 'correlationId'], not: 'customer' } } } },
  ],
  simulation: {
    systems: { db: { tables: tables() } },
    tests: [
      {
        name: 'A normal order',
        about: 'The order is inserted. Nobody is emailed.',
        trigger: order('WO-55119'),
        expect: { noError: true, db: { web_orders: { count: 1 } }, noEmails: true },
      },
      {
        name: 'Oracle refuses the order',
        about: 'The insert fails. The order waits on WEB.ORDERS.FAILED, and support gets an alert with the order ID and the error type. The customer\'s name, email and address are not in it.',
        trigger: order('WO-55120'),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO web_orders', fault: 'QUERY_EXECUTION', description: 'ORA-12899: value too large for column CUSTOMER_EMAIL' }] } } },
        expect: {
          ack: 'acked',
          sent: [{ destination: 'WEB.ORDERS.FAILED', count: 1 }],
          emails: [
            { to: 'integration-support@brindle.example', count: 1, has: 'WO-55120' },
            { has: 'DB:QUERY_EXECUTION', count: 1 },
            { has: 'jo.bloggs', count: 0 },
            { has: 'Fen Lane', count: 0 },
          ],
        },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'web-orders-to-oracle',
      source('jms-listener', { destination: 'WEB.ORDERS', ackMode: 'AUTO' }),
      [
        step('set-variable', { variableName: 'orderId', value: '#[payload.orderId]' }),
        step('db-insert', {
          database: 'Oracle',
          sql: 'INSERT INTO web_orders (order_id, customer_name, customer_email, total) VALUES (:orderId, :name, :email, :total)',
          inputParameters: '#[{ orderId: payload.orderId, name: payload.customer.name, email: payload.customer.email, total: payload.total }]',
        }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('jms-publish', { destination: 'WEB.ORDERS.FAILED', persistentDelivery: 'true' }),
          step('set-variable', { variableName: 'errorType', value: '#[error.errorType.namespace ++ ":" ++ error.errorType.identifier]' }),
          scope('async', {}, [
            step('email-send', {
              toAddresses: 'integration-support@brindle.example',
              subject: '#["Web order " ++ vars.orderId ++ " not loaded"]',
              content: '#["orderId: " ++ vars.orderId ++ "\\nerror: " ++ vars.errorType ++ "\\ncorrelationId: " ++ correlationId ++ "\\nThe order is on WEB.ORDERS.FAILED."]',
            }),
          ]),
        ]),
      ],
    ),
  ),
  description: `
Brindle Outdoor, a fictional outdoor gear retailer, loads web orders from the JMS queue \`WEB.ORDERS\` into the Oracle table \`web_orders\`:

\`\`\`json
{ "orderId": "WO-55120",
  "customer": { "name": "Jo Bloggs", "email": "jo.bloggs@mail.example", "address": "14 Fen Lane, Ely" },
  "total": 129.0, "lines": [ { "sku": "TENT-2P-OLV", "qty": 1 } ] }
\`\`\`

When a load failed, the old flow emailed support the whole message. The privacy team found customer names, emails and home addresses in a shared mailbox that 40 people can read, and in its backups.

**Requirements**
- Insert each order into \`web_orders\`.
- When it fails, put the order on \`WEB.ORDERS.FAILED\`, where support can replay it.
- Email \`integration-support@brindle.example\` an alert with the order ID, the error type and the correlation ID. No customer data at all.
- A mail problem must not change what happens to the order.

**Design the flow.**
`,
  answerTemplate: `## Loading the order

## Keeping the failed order

## What the alert may contain
`,
  keyPoints: [
    'An alert says that something failed and where to look. The data itself stays in the systems that are allowed to hold it.',
    'The order ID and the correlation ID are enough for support to find the message on the failure queue and the lines in the logs.',
    'Build the alert from chosen fields, never from the whole payload. A new field added to the order later would leak into the email without anyone noticing.',
    'Error descriptions can quote data too (Oracle may echo a value). The error type is safe; the full description belongs in the logs, which have access rules.',
    'Send the alert in an Async scope, so a mail outage does not fail the handler and lose the order.',
  ],
  solution: `
1. **JMS On New Message** on \`WEB.ORDERS\`. **Set Variable** \`orderId\`.
2. **Database Insert** into \`web_orders\`.
3. **On Error Continue** (ANY):
   - **JMS Publish** the order to \`WEB.ORDERS.FAILED\`.
   - **Set Variable** \`errorType\` = \`namespace:identifier\`.
   - **Async**: **Email Send** to \`integration-support@brindle.example\`: order ID, error type, correlation ID, and where the order is.

**Who can read WEB.ORDERS.FAILED?** It holds customer data, so the queue needs the same access rules as the order system, and a retention limit.
`,
  followUps: [
    {
      q: 'Support says the order ID is not enough to fix the problem. What do you offer?',
      a: 'A link to a support screen, or the log search for the correlation ID, both behind a login. The details stay where access is controlled and recorded.',
    },
    {
      q: 'Is the customer email in the logs a problem too?',
      a: 'Yes. Log IDs, not personal fields. If a field must be logged for debugging, mask it, and keep debug logging off in production.',
    },
  ],
}
