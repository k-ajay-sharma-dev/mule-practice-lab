// The guided lab xml-transaction. See platform-labs.js for the shape of a lab.
import { advance, at, deployXml, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import { handlerFor, inOneTx, parseMule, stepsOf, txOf } from '../platform-xml.js'
import { FIXED_XML, FLOW, NAME, ORDER_BODY, START_XML, TX_RETRY_XML } from './xml-transaction.pkg.js'

const api = (s) => app(s, NAME)
const model = (s) => parseMule(api(s)?.xml ?? '')
const live = (s) => api(s)?.status === 'Running' && model(s).ok
// both inserts in one transaction on one database config, and no on-error-continue in the try that commits a half order
const atomic = (s) => {
  if (!live(s) || !inOneTx(model(s), FLOW, ['db:insert']) || stepsOf(model(s), FLOW, 'db:insert').length < 2) return false
  const { scopes, ops } = txOf(model(s), FLOW)
  const scope = scopes[ops.find((o) => o.kind === 'db:insert').scope]
  return handlerFor(scope.errorHandler, 'DB:QUERY_EXECUTION')?.kind !== 'continue'
}
const callOutside = (s) => {
  if (!atomic(s)) return false
  const { scopes } = txOf(model(s), FLOW)
  const call = stepsOf(model(s), FLOW, 'http:request')
  return call.length > 0 && scopes.every((x) => x.requests.length === 0 && x.retries.length === 0)
}
const since = (s, list) => (list ?? []).filter((x) => x.t > api(s).updated)

const lab = {
  id: 'p-xml-transaction',
  group: 'Mule XML',
  title: 'Order headers without lines',
  minutes: 25,
  scenario: `${NAME} saves the orders of the shop in the ORDERS database on SQL Server: one row in ORDER_HEADER, then one row per line in ORDER_LINE, and it reserves the stock at the warehouse. Finance finds orders with a header and no lines, and cannot invoice them. Fix the flow in the Mule XML so an order is saved whole or not at all, without slowing down the warehouse dashboard that reads the same table.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      nextId: 10,
      apps: [newApp(NAME, { props: { 'http.port': '8081', 'db.host': 'sql-orders.brightmart.lab', 'db.user': 'orders_app', 'warehouse.host': 'wms.brightmart.lab' }, secrets: { 'db.password': 'lab-only-pass' }, xml: START_XML, store: {} })],
      traffic: [
        { app: NAME, env: 'Sandbox', method: 'POST', path: '/orders', body: ORDER_BODY, perMinute: 3 },
        { app: NAME, env: 'Sandbox', method: 'GET', path: '/orders', perMinute: 2 },
      ],
      mail: [
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Orders with no lines',
          body: 'The invoice run found orders in ORDER_HEADER that have no rows in ORDER_LINE. The shop got an error for them, and the customer often ordered again, so we now have empty orders and duplicates. It happens a few times an hour. Can you make sure an order is saved whole or not at all?',
          source: 'Brightmart Finance',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Open the configuration of ${NAME}`,
      how: `Lab tools, Flow editor, pick ${NAME}. The Message Flow tab draws save-order-flow: Insert order header, Retry warehouse, For each line with Insert order line. GET /orders in the API client lists the last orders with their number of lines.`,
      done: (s) => Boolean(s.seen[`xml:${NAME}`]),
    },
    ask(
      'Why a header stays without lines',
      'A line with no quantity fails with DB:QUERY_EXECUTION in Insert order line. Why is the header row of that order still in the table?',
      [
        'The error handler inserts the header again',
        'Without a transaction each db:insert takes its own connection and commits at once, so the header was committed before the line failed',
        'SQL Server ignores the failed line',
        'The foreach skips the failed line and goes on',
      ],
      1,
      'Outside a transaction the Database connector runs each operation in auto commit mode. The header insert is final the moment it returns. Nothing ties it to the inserts that come after it, so a failure later in the flow cannot undo it.',
    ),
    {
      title: 'Save the header and the lines in one transaction',
      how: 'In the Flow editor, wrap Insert order header and For each line in <try transactionalAction="ALWAYS_BEGIN" doc:name="Save order">. Both inserts use config-ref Orders_DB and keep the default transactionalAction JOIN_IF_POSSIBLE. Let the error leave the try, so the transaction rolls back. Deploy.',
      done: atomic,
    },
    ask(
      'Local transaction or XA',
      'The try uses the default transactionType LOCAL. When would you need XA?',
      [
        'Always, LOCAL does not roll back',
        'When the work spans more than one transactional resource, such as this database and a JMS queue, or two databases. LOCAL is bound to one connection of one config. XA runs a two phase commit across them and is slower',
        'When the flow has more than two inserts',
        'XA makes HTTP calls roll back too',
      ],
      1,
      'A local transaction lives on one connection of one connector config, here Orders_DB, and every operation that joins it must use that config. XA coordinates several resources with a two phase commit. It needs XA capable drivers or brokers and costs time on each commit. An HTTP call is never part of either, so a reservation made inside the try is not undone by a rollback.',
    ),
    {
      title: 'Take the warehouse call out of the transaction',
      how: 'If Retry warehouse is now inside the try, look at the logs of GET /orders: the dashboard query waits while a transaction is open. The until-successful waits 10 seconds between retries and the transaction holds the new header row the whole time. Move Retry warehouse after the try, so the order is committed first. Deploy.',
      done: callOutside,
    },
    ask(
      'Retries inside a transaction',
      'What does an until-successful with maxRetries 5 and millisBetweenRetries 10000 hold when it runs inside the try?',
      [
        'Nothing, the transaction pauses during the wait',
        'The open transaction: its database connection from the pool and the locks on the rows it wrote, for up to 50 seconds, while other sessions that read those rows wait',
        'Only the HTTP connection',
        'A new transaction for each retry',
      ],
      1,
      'A transaction keeps its connection and its locks until it commits or rolls back. Every wait of the retry scope makes it longer. Other sessions block on the locked rows, the pool loses a connection for that time, and a long transaction can hit a timeout and roll back an order that was fine. Keep transactions short and do slow or remote calls before or after them.',
    ),
    {
      title: 'Watch whole orders and a fast dashboard',
      how: 'Move the clock 5 minutes after your last deploy. Orders with a bad line now roll back whole and answer 400, the rest answer 201 with all their lines, and GET /orders is no longer blocked.',
      done: (s) => {
        if (!callOutside(s) || s.clock < api(s).updated + 5 * MINUTE) return false
        const list = since(s, api(s).store?.outcomes)
        return list.some((x) => x.rolledBack) && list.some((x) => x.ok) && !list.some((x) => x.orphan) && since(s, api(s).store?.blocked).length === 0
      },
    },
  ],
  why: 'Without a transaction each Database operation commits on its own, so a failure after the first insert leaves half an order behind. A try scope with transactionalAction ALWAYS_BEGIN starts a local transaction, the inserts inside join it on the same config, and an error that leaves the try rolls both back. An on-error-continue inside the try would commit instead. LOCAL covers one resource; XA is for work across several transactional resources, at the cost of a two phase commit. HTTP calls never join a transaction, and a retry scope inside one keeps the connection and the row locks open during every wait, which blocks readers. Keep the transaction to the database work and call other systems after the commit. In the lab the ORDERS tables live inside the app, and a blocked read is modelled from the time a transaction stays open.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/transaction-management',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `xml:${NAME}`)
    s = deployXml(s, NAME, TX_RETRY_XML).state
    s = advance(s, 3 * MINUTE)
    s = deployXml(s, NAME, FIXED_XML).state
    return advance(s, 6 * MINUTE)
  },
  answers: { 2: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
