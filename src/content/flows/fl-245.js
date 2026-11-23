import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const req = (requestId, to, deliveryCount = 1) => ({
  message: { kind: 'jms', destination: 'EMAIL.REQUESTS', deliveryCount, payload: { requestId, template: 'delivery-slot', to, data: { orderId: 'SO-77120', slot: 'Thursday 08:00 to 10:00' } } },
})
const tables = (log = []) => ({
  email_log: { columns: ['request_id', 'to_addr', 'status'], rows: log },
  email_suppression: { key: 'address', rows: [{ address: 'left.company@mail.example', reason: 'UNSUBSCRIBED' }] },
})
const templates = { 'delivery-slot.html': '<p>Your order #[vars.req.data.orderId] will arrive on #[vars.req.data.slot].</p>' }

export default {
  id: 'fl-245',
  category: 'flows',
  title: 'A Shared Email Service on a JMS Queue: Template, Suppression List and Send Log in Oracle, a Repeat Sent Once, a Busy Relay Retried by Redelivery, and a Poison Request Parked',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'smtp', 'jms', 'oracle', 'redelivery', 'idempotency', 'templates', 'dlq'],
  estMinutes: 55,
  flowChecks: [
    { label: 'Requests are read from EMAIL.REQUESTS in a transaction, so a failure sends them back', rule: { type: 'source', component: 'jms-listener', where: { destination: 'EMAIL.REQUESTS', transactionalAction: 'ALWAYS_BEGIN' } } },
    { label: 'A request already SENT is not sent again', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['email_log', 'request_id', 'SENT'] } } } },
    { label: 'The address is checked against email_suppression before sending', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'email_suppression' }, then: 'email-send' } },
    { label: 'The body is built from the delivery-slot template', rule: { type: 'before', first: 'parse-template', firstWhere: { location: 'delivery-slot.html' }, then: 'email-send' } },
    { label: 'A sent email is logged as SENT', rule: { type: 'before', first: 'email-send', then: 'db-insert', thenWhere: { sql: { all: ['email_log', 'SENT'] } } } },
    { label: 'A bad address is logged as REJECTED and not retried', rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', where: { sql: 'REJECTED' } } },
    { label: 'After five deliveries the request is parked on EMAIL.REQUESTS.DLQ', rule: { type: 'inside', component: 'jms-publish', within: 'choice', where: { destination: 'EMAIL.REQUESTS.DLQ' }, routeWhere: { expression: 'JMSXDeliveryCount' } } },
  ],
  simulation: {
    systems: { db: { tables: tables() }, templates },
    tests: [
      {
        name: 'A normal request',
        about: 'The address is not suppressed. The email is built from the template, sent, and logged as SENT.',
        trigger: req('ER-90001', 'r.hale@mail.example'),
        expect: { noError: true, ack: 'acked', emails: [{ to: 'r.hale@mail.example', count: 1, has: 'Thursday 08:00 to 10:00' }], db: { email_log: { count: 1, has: [{ request_id: 'ER-90001', status: 'SENT' }] } } },
      },
      {
        name: 'The same request again',
        about: 'The calling app retried ER-90001 after a timeout of its own. It is in the log as SENT, so the customer does not get it twice.',
        trigger: req('ER-90001', 'r.hale@mail.example'),
        overrides: { systems: { db: { tables: tables([{ request_id: 'ER-90001', to_addr: 'r.hale@mail.example', status: 'SENT' }]) } } },
        expect: { ack: 'acked', noEmails: true, db: { email_log: { count: 1 } } },
      },
      {
        name: 'An unsubscribed address',
        about: 'The address is on the suppression list. Nothing is sent, and the log says SUPPRESSED.',
        trigger: req('ER-90002', 'left.company@mail.example'),
        expect: { ack: 'acked', noEmails: true, db: { email_log: { has: [{ request_id: 'ER-90002', status: 'SUPPRESSED' }] } } },
      },
      {
        name: 'An address that is not an address',
        about: 'The request has "r.hale at mail" as the address. It can never work, so it is logged as REJECTED and acknowledged, not retried.',
        trigger: req('ER-90003', 'r.hale at mail'),
        expect: { ack: 'acked', noEmails: true, db: { email_log: { has: [{ request_id: 'ER-90003', status: 'REJECTED' }] } } },
      },
      {
        name: 'The relay is busy',
        about: 'The send fails. The transaction rolls back and the request goes back on the queue for redelivery, with no log row, so the next try starts clean.',
        trigger: req('ER-90004', 'r.hale@mail.example'),
        overrides: { systems: { email: { fault: true } } },
        expect: { ack: 'returned', db: { email_log: { count: 0 } } },
      },
      {
        name: 'The sixth delivery',
        about: 'The relay has refused this request five times. It is parked on EMAIL.REQUESTS.DLQ, logged as GAVE_UP, and acknowledged.',
        trigger: req('ER-90004', 'r.hale@mail.example', 6),
        overrides: { systems: { email: { fault: true } } },
        expect: { ack: 'acked', sent: [{ destination: 'EMAIL.REQUESTS.DLQ', count: 1, has: { requestId: 'ER-90004' } }], db: { email_log: { has: [{ request_id: 'ER-90004', status: 'GAVE_UP' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'email-service',
      source('jms-listener', { destination: 'EMAIL.REQUESTS', ackMode: 'IMMEDIATE', transactionalAction: 'ALWAYS_BEGIN', transactionType: 'LOCAL', numberOfConsumers: 2 }),
      [
        step('set-variable', { variableName: 'req', value: '#[payload]' }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[(attributes.properties.jmsxProperties.JMSXDeliveryCount default 1) > 5]' }, [
              step('logger', { level: 'WARN', message: '#["Email request " ++ vars.req.requestId ++ " parked after five tries"]' }),
              step('db-insert', { database: 'Oracle', sql: "INSERT INTO email_log (request_id, to_addr, status) VALUES (:id, :to, 'GAVE_UP')", inputParameters: '#[{ id: vars.req.requestId, to: vars.req.to }]', target: 'logged' }),
              step('jms-publish', { destination: 'EMAIL.REQUESTS.DLQ', persistentDelivery: 'true' }),
            ]),
          ],
          {
            otherwise: [
              step('db-select', { database: 'Oracle', sql: "SELECT request_id FROM email_log WHERE request_id = :id AND status = 'SENT'", inputParameters: '#[{ id: vars.req.requestId }]', target: 'sent' }),
              step('db-select', { database: 'Oracle', sql: 'SELECT address FROM email_suppression WHERE address = :to', inputParameters: '#[{ to: lower(vars.req.to) }]', target: 'suppressed' }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[not isEmpty(vars.sent)]' }, [step('logger', { level: 'INFO', message: '#["Email request " ++ vars.req.requestId ++ " was sent before"]' })]),
                  route({ expression: '#[not isEmpty(vars.suppressed)]' }, [
                    step('db-insert', { database: 'Oracle', sql: "INSERT INTO email_log (request_id, to_addr, status) VALUES (:id, :to, 'SUPPRESSED')", inputParameters: '#[{ id: vars.req.requestId, to: vars.req.to }]' }),
                  ]),
                ],
                {
                  otherwise: [
                    step('validation', { check: 'is-email', expression: '#[vars.req.to]', message: 'Not an email address' }),
                    step('parse-template', { location: 'templates/delivery-slot.html' }),
                    step('email-send', { toAddresses: '#[vars.req.to]', subject: '#["Your delivery slot for " ++ vars.req.data.orderId]', content: '#[payload]', contentType: 'text/html' }),
                    step('db-insert', { database: 'Oracle', sql: "INSERT INTO email_log (request_id, to_addr, status) VALUES (:id, :to, 'SENT')", inputParameters: '#[{ id: vars.req.requestId, to: vars.req.to }]' }),
                  ],
                },
              ),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'VALIDATION:INVALID_EMAIL' }, [
          step('db-insert', { database: 'Oracle', sql: "INSERT INTO email_log (request_id, to_addr, status) VALUES (:id, :to, 'REJECTED')", inputParameters: '#[{ id: vars.req.requestId, to: vars.req.to }]' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'WARN', message: '#["Email request " ++ vars.req.requestId ++ " will be retried: " ++ error.description]' })]),
      ],
    ),
  ),
  optionalSteps: [{ type: 'on-error-propagate', why: 'It only logs. Without it the error still rolls back the transaction and the request is redelivered.' }],
  description: `
Larkfield Grocers, a fictional grocery chain, has many apps that need to email customers. Instead of each one talking to the mail relay, they put a request on the JMS queue \`EMAIL.REQUESTS\`:

\`\`\`json
{ "requestId": "ER-90001", "template": "delivery-slot", "to": "r.hale@mail.example",
  "data": { "orderId": "SO-77120", "slot": "Thursday 08:00 to 10:00" } }
\`\`\`

You build the email service that reads them. The HTML body comes from the template file \`templates/delivery-slot.html\`, which reads \`vars.req.data\`.

Oracle tables:
- \`email_suppression\` (\`address\`, \`reason\`): customers who unsubscribed. They must never get mail.
- \`email_log\` (\`request_id\`, \`to_addr\`, \`status\`): one row per request handled, status \`SENT\`, \`SUPPRESSED\`, \`REJECTED\` or \`GAVE_UP\`.

**Requirements**
- A request already logged as \`SENT\` is not sent again.
- A suppressed address gets nothing; log \`SUPPRESSED\`.
- An address that is not a valid email can never work: log \`REJECTED\` and acknowledge it.
- Otherwise build the body from the template, send it as HTML, and log \`SENT\`.
- When the relay fails, the request must come back later, with no log row written. Read the queue in a transaction for that.
- A request delivered more than five times: log \`GAVE_UP\`, put it on \`EMAIL.REQUESTS.DLQ\`, and acknowledge it, with a WARN.

**Facts**
- The broker's delivery count is in \`attributes.properties.jmsxProperties.JMSXDeliveryCount\` (1 on the first delivery).
- Check the address with the Validation module's Is Email. A bad one raises \`VALIDATION:INVALID_EMAIL\`.
- \`email_suppression\` holds addresses in lower case. Put the request on the DLQ as it arrived.

**What each system sends back**
- **Database Select** on \`email_log\`: \`[ { "request_id": "ER-90001" } ]\` when the request was sent before, or an empty list.
- **Database Select** on \`email_suppression\`: \`[ { "address": "left.company@mail.example" } ]\` for a suppressed address, or an empty list.
- **Parse Template** returns the HTML body as the payload, with \`#[...]\` replaced: \`<p>Your order SO-77120 will arrive on Thursday 08:00 to 10:00.</p>\`.

**What failures look like**
- A bad address such as \`r.hale at mail\`: Is Email raises \`VALIDATION:INVALID_EMAIL\`. Catch it, log \`REJECTED\`, and the receive commits.
- The relay is busy: Email Send raises an \`EMAIL\` error. Let it reach the listener so the transaction rolls back and the broker redelivers.

**Design the flow.**
`,
  answerTemplate: `## One service for every app

## Sent once

## Suppression and bad addresses

## The relay fails

## Giving up
`,
  keyPoints: [
    'One email service gives one place for templates, the suppression list, the relay settings and the send log. Apps only publish a request.',
    'The request ID makes the service safe to call twice. The log row says it was sent.',
    'Check the suppression list on every send. It is a legal duty in many places, not a nice to have.',
    'Sort failures by what a retry can fix. A bad address never gets better: log and acknowledge. A busy relay usually does: roll back and let the broker redeliver.',
    'The transacted listener ties the acknowledgement to the outcome: success commits the receive and the log row, an error rolls both back.',
    'The send itself cannot be rolled back. If the log insert fails after a send, the redelivery sends again. At least once is the honest promise for email.',
  ],
  solution: `
1. **JMS On New Message** on \`EMAIL.REQUESTS\`, Transactional action **ALWAYS_BEGIN** (local). **Set Variable** \`req\`.
2. **Choice** \`JMSXDeliveryCount > 5\`: WARN, **Database Insert** \`GAVE_UP\`, **JMS Publish** to \`EMAIL.REQUESTS.DLQ\`.
3. Otherwise:
   - **Database Select** a \`SENT\` row for the request, Target \`sent\`. **Database Select** the address in \`email_suppression\`, Target \`suppressed\`.
   - **Choice**: sent, INFO. Suppressed, **Database Insert** \`SUPPRESSED\`. Otherwise: **Validate** is-email, **Parse Template** \`templates/delivery-slot.html\`, **Email Send** as \`text/html\`, **Database Insert** \`SENT\`.
4. Handlers: **On Error Continue** \`VALIDATION:INVALID_EMAIL\`: **Database Insert** \`REJECTED\`. **On Error Propagate** ANY: WARN, so the transaction rolls back and the broker redelivers.

**Redelivery delay.** Most brokers can wait between redeliveries (ActiveMQ has a redelivery policy with a growing delay). Set it, or five tries can be spent in a few seconds.
`,
  followUps: [
    {
      q: 'Where does the template choice go when there are twenty templates?',
      a: 'Keep templates in a table or a folder keyed by name, and check the name against a list first. An unknown template is a bad request: log it and acknowledge it, like a bad address.',
    },
    {
      q: 'The marketing team wants to use the service for a campaign to 200,000 customers. What do you say?',
      a: 'Not on the same queue. A campaign would delay password resets and delivery slots for hours. Give it its own queue and a lower rate, or a bulk email provider.',
    },
  ],
}
