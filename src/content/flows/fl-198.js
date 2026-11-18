import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const order = (id, status, sentAt = null, sentFile = null) => ({ order_id: id, customer: 'PHARM-ROWAN-12', sku: 'OPP-AMOX-500', qty: 40, status, sent_at: sentAt, sent_file: sentFile })
const ready = [order('OPP-5001', 'READY'), order('OPP-5002', 'READY')]
const sent = [order('OPP-4990', 'SENT', '2026-11-13T07:10:00', 'ORD_20261113071000.csv'), order('OPP-4995', 'SENT', '2026-11-13T09:30:00', 'ORD_20261113093000.csv'), order('OPP-4970', 'ACKED', '2026-11-13T06:00:00', 'ORD_20261113060000.csv')]
const ackPath = '/from3pl/acks/ACK_20261113093000.csv'
const tables = (rows) => ({ orders: { key: 'order_id', rows } })

export default {
  id: 'fl-198',
  category: 'flows',
  title: 'Orders to a 3PL Over SFTP and Acknowledgements Back: Send Under a Temporary Name, Match Each ACK File to Its Orders, and Alert on Orders Left Unanswered for Two Hours',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'ack-file', 'temp-file', 'reconciliation', 'alerting', 'pharma'],
  estMinutes: 60,
  flowChecks: [
    { label: 'Three flows: send, receive ACKs, check for overdue orders', rule: { type: 'flows', kind: 'flow', min: 3 } },
    { label: 'Orders are written under a .tmp name and renamed when complete', rule: { type: 'before', first: 'sftp-write', firstWhere: { path: '.tmp' }, then: 'sftp-rename' } },
    { label: 'Orders are marked SENT only after the rename', rule: { type: 'before', first: 'sftp-rename', then: ['db-update', 'db-bulk-update'], thenWhere: { sql: 'SENT' } } },
    { label: 'ACK files from /from3pl/acks mark the matching orders ACKED', rule: { type: 'all', rules: [{ type: 'source', component: 'sftp-listener', where: { directory: '/from3pl/acks' } }, { type: 'exists', component: ['db-update', 'db-bulk-update'], where: { sql: 'ACKED' } }] } },
    { label: 'Only orders still SENT are moved to ACKED', rule: { type: 'exists', component: ['db-update', 'db-bulk-update'], where: { sql: { all: ['ACKED', "status = 'SENT'"] } } } },
    { label: 'Orders SENT more than two hours ago trigger an email to the DC team', rule: { type: 'all', rules: [{ type: 'exists', component: 'db-select', where: { sql: { all: ['SENT', 'sent_at'] } } }, { type: 'inside', component: 'email-send', within: 'choice' }] } },
  ],
  simulation: {
    systems: { db: { tables: tables([...ready, ...sent]) }, files: { [ackPath]: 'order_id,result\nOPP-4995,RECEIVED\nOPP-4970,RECEIVED' } },
    tests: [
      {
        name: 'Ready orders are sent',
        about: 'Both READY orders go out in one file under its final name, with no .tmp left. They are marked SENT with the file name.',
        trigger: { schedule: { flow: 'send-orders' } },
        expect: {
          noError: true,
          files: { '/to3pl/orders/ORD_*.csv': { count: 1, has: 'OPP-5002' }, '/to3pl/orders/*.tmp': { count: 0 } },
          db: { orders: { has: [{ order_id: 'OPP-5001', status: 'SENT' }, { order_id: 'OPP-5002', status: 'SENT' }] } },
        },
      },
      {
        name: 'The 3PL acknowledges',
        about: 'The ACK file names OPP-4995 and OPP-4970. OPP-4995 becomes ACKED. OPP-4970 was already ACKED and is left as it is. The ACK file is archived.',
        trigger: { file: { path: ackPath } },
        expect: {
          db: { orders: { has: [{ order_id: 'OPP-4995', status: 'ACKED' }, { order_id: 'OPP-4990', status: 'SENT' }] } },
          files: { '/from3pl/acks/archive/ACK_20261113093000.csv': { exists: true } },
        },
      },
      {
        name: 'An order is left unanswered',
        about: 'At 10:00, OPP-4990 has waited since 07:10 for its ACK. The DC team gets one email naming it. OPP-4995, sent at 09:30, is not overdue yet.',
        trigger: { schedule: { flow: 'overdue-check' } },
        expect: { emails: [{ to: 'dc-ops@orchardpoint.example', count: 1, has: 'OPP-4990' }] },
      },
      {
        name: 'Nothing is overdue',
        about: 'Every order sent more than two hours ago has its ACK. No email is sent.',
        trigger: { schedule: { flow: 'overdue-check' } },
        overrides: { systems: { db: { tables: tables([sent[1], sent[2]]) } } },
        expect: { noEmails: true },
      },
    ],
  },
  referenceFlow: design(
    flow('send-orders', source('scheduler', { strategy: 'fixed-frequency', frequency: 15, timeUnit: 'MINUTES' }), [
      step('db-select', { database: 'PostgreSQL', sql: "SELECT order_id, customer, sku, qty FROM orders WHERE status = 'READY' ORDER BY order_id" }),
      router('choice', {}, [
        route({ expression: '#[not isEmpty(payload)]' }, [
          step('set-variable', { variableName: 'stamp', value: '#[now() as String {format: "yyyyMMddHHmmss"}]' }),
          step('set-variable', { variableName: 'sentAt', value: '#[now() as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
          step('set-variable', { variableName: 'rows', value: '#[payload map ($ ++ { sent_file: "ORD_" ++ vars.stamp ++ ".csv", sent_at: vars.sentAt })]' }),
          step('transform', { script: '%dw 2.0\noutput application/csv\n---\npayload' }),
          step('sftp-write', { path: '#["/to3pl/orders/ORD_" ++ vars.stamp ++ ".csv.tmp"]', mode: 'CREATE_NEW' }),
          step('sftp-rename', { path: '#["/to3pl/orders/ORD_" ++ vars.stamp ++ ".csv.tmp"]', to: '#["ORD_" ++ vars.stamp ++ ".csv"]' }),
          step('set-payload', { value: '#[vars.rows]' }),
          step('db-bulk-update', { database: 'PostgreSQL', sql: "UPDATE orders SET status = 'SENT', sent_file = :sent_file, sent_at = :sent_at WHERE order_id = :order_id AND status = 'READY'" }),
        ]),
      ]),
    ]),
    flow('receive-acks', source('sftp-listener', { directory: '/from3pl/acks', matcher: 'ACK_*.csv', postAction: 'none', timeBetweenSizeCheck: 5000 }), [
      step('set-variable', { variableName: 'filePath', value: '#[attributes.path]' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('db-update', { database: 'PostgreSQL', sql: "UPDATE orders SET status = 'ACKED' WHERE order_id = :orderId AND status = 'SENT'", inputParameters: '#[{ orderId: payload.order_id }]' }),
      ]),
      step('sftp-move', { sourcePath: '#[vars.filePath]', targetPath: '/from3pl/acks/archive' }),
    ]),
    flow('overdue-check', source('scheduler', { strategy: 'fixed-frequency', frequency: 30, timeUnit: 'MINUTES' }), [
      step('set-variable', { variableName: 'cutoff', value: '#[((now() >> "UTC") as LocalDateTime - |PT2H|) as String {format: "yyyy-MM-dd\'T\'HH:mm:ss"}]' }),
      step('db-select', { database: 'PostgreSQL', sql: "SELECT order_id, sent_file, sent_at FROM orders WHERE status = 'SENT' AND sent_at < :cutoff ORDER BY sent_at", inputParameters: '#[{ cutoff: vars.cutoff }]' }),
      router('choice', {}, [
        route({ expression: '#[not isEmpty(payload)]' }, [
          step('email-send', {
            toAddresses: 'dc-ops@orchardpoint.example',
            subject: '#["3PL has not acknowledged " ++ (sizeOf(payload) as String) ++ " order(s)"]',
            content: '#[(payload map ($.order_id ++ " sent " ++ $.sent_at ++ " in " ++ $.sent_file)) joinBy "\\n"]',
            contentType: 'text/plain',
          }),
        ]),
      ]),
    ]),
  ),
  description: `
Orchard Point Pharma, a fictional medicines wholesaler, uses a third party logistics provider (3PL) to ship orders to pharmacies. The two exchange files over the 3PL's **SFTP server**:

- Orchard Point puts order files in \`/to3pl/orders\`. The 3PL's system takes any \`*.csv\` there the moment it appears.
- The 3PL puts acknowledgement files in \`/from3pl/acks\`, \`ACK_<time>.csv\`, with \`order_id\` and \`result\`. An \`archive\` folder exists under it.

The PostgreSQL table \`orders\` has \`order_id\`, \`customer\`, \`sku\`, \`qty\`, \`status\` (\`READY\`, \`SENT\`, \`ACKED\`), \`sent_at\` and \`sent_file\`.

Medicines have tight delivery promises. Last month an order file was never picked up, and nobody noticed for a day.

**Requirements**
- Every 15 minutes, send all \`READY\` orders in one file, \`ORD_<yyyyMMddHHmmss>.csv\`. The 3PL must never take a half written file. Mark the orders \`SENT\` with the time and file name only when the file is in place.
- When an ACK file arrives, mark each order it names \`ACKED\`, but only if it is \`SENT\`. Archive the ACK file.
- Every 30 minutes, find orders still \`SENT\` after two hours, and email \`dc-ops@orchardpoint.example\` listing them. No email when there are none.

**Design the flows.**
`,
  answerTemplate: `## Sending orders

## Matching acknowledgements

## Finding what is overdue

## What each flow promises
`,
  keyPoints: [
    'Three flows, three jobs: send, match, watch. Each one is short, and each can fail without stopping the others.',
    'The 3PL takes *.csv at once, so write ORD_<time>.csv.tmp and rename. CREATE_NEW on the write stops a rerun in the same second from overwriting a file.',
    'Mark SENT only after the rename, with the file name, so every SENT order can be traced to a file on the server.',
    '"AND status = \'SENT\'" on the ACK update makes repeats harmless: an ACK for an order already ACKED, or for one never sent, changes nothing.',
    'The overdue check turns silence into an alert. Without it, a file the 3PL never took looks the same as one it took.',
  ],
  solution: `
**send-orders** (every 15 minutes):
1. **Database Select** READY orders. **Choice** not empty:
2. **Set Variable** \`stamp\`, \`sentAt\` and \`rows\` (each order with \`sent_file\` and \`sent_at\`).
3. **Transform** to CSV, **SFTP Write** \`ORD_<stamp>.csv.tmp\` (CREATE_NEW), **SFTP Rename** to \`ORD_<stamp>.csv\`.
4. **Set Payload** \`vars.rows\`, **Database Bulk Update** \`SET status = 'SENT', sent_file, sent_at WHERE order_id = :order_id AND status = 'READY'\`.

**receive-acks** (SFTP listener on \`/from3pl/acks\`, \`ACK_*.csv\`):
1. **For Each** row: **Database Update** \`SET status = 'ACKED' WHERE order_id = :orderId AND status = 'SENT'\`.
2. **SFTP Move** to \`/from3pl/acks/archive\`.

**overdue-check** (every 30 minutes):
1. **Set Variable** \`cutoff\` = now minus 2 hours, in the same format and zone as \`sent_at\`.
2. **Database Select** SENT orders with \`sent_at < :cutoff\`.
3. **Choice** not empty: **Email** to the DC team with each order, its time and its file.

**A crash between the rename and the update.** The file is with the 3PL, but the orders are still READY and go out again in the next file. Ask the 3PL to ignore a repeated order_id, or write the file name to the orders first with a SENDING status.

**Repeated alerts.** The same overdue order is emailed every 30 minutes. Record when an order was alerted, or accept the repeats as a reminder; agree which with the DC team.
`,
  followUps: [
    {
      q: 'An ACK arrives for an order Orchard Point never sent. What should happen?',
      a: 'The update changes nothing. Log it as a warning with the ACK file name: it may be a mistake on the 3PL side worth raising.',
    },
    {
      q: 'Why compare sent_at as text?',
      a: 'Here sent_at is stored as an ISO string in UTC, which sorts in time order. With a timestamp column, pass the cutoff as a timestamp instead.',
    },
  ],
}
