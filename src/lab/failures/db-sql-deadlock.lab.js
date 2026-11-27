// The guided lab db-sql-deadlock. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, recent, until } from '../platform-kit.js'
import { settingsOf } from './db-sql-deadlock.pkg.js'

const NAME = 'order-payments-sapi'
const PROPS = { 'db.host': 'sql03.harbor.lab', 'db.lockOrder.reservations': 'stock-then-orders', 'tx.scope': 'whole-flow', 'retry.on': 'none', 'retry.max': '0', 'retry.waitMs': '60000' }
const load = () => [
  { app: NAME, env: 'Sandbox', method: 'POST', path: '/payments/O-5001', perMinute: 12 },
  { app: NAME, env: 'Sandbox', method: 'POST', path: '/reservations/O-5001', perMinute: 12 },
  { app: NAME, env: 'Sandbox', method: 'POST', path: '/payments/O-9001', perMinute: 1 },
]
const running = (s) => app(s, NAME)?.status === 'Running'
const set = (s) => settingsOf({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const bad = (e) => /\/O-9/.test(e.p ?? '')

const lab = {
  id: 'p-db-sql-deadlock',
  group: 'Databases and queues',
  title: 'Deadlock victims on SQL Server',
  minutes: 15,
  scenario:
    'Harbor Outdoor added stock reservations to order-payments-sapi on Monday. Since then a few payments and reservations a minute fail with 500, always on the same busy orders. The database team says SQL Server is healthy. One more thing: a partner keeps paying for an order that does not exist, O-9001.',
  start() {
    const s = newPlatform({ clock: at(1, 8, 30), apps: [newApp(NAME, { props: { ...PROPS } })], traffic: load() })
    return until(s, at(1, 9, 30))
  },
  steps: [
    { title: 'Read the dashboard', how: `Monitoring, Built-in dashboards, ${NAME}, View. The errors come every minute, at a steady rate, while the CPU stays low.`, done: (s) => Boolean(s.seen[`dash:${NAME}`]) },
    { title: 'Find the error in the logs', how: `Runtime Manager, Applications, ${NAME}, Logs, or Monitoring, Log Search with log-level: ERROR AND appId: ${NAME}.`, done: (s) => Boolean(s.seen[`logs:${NAME}`] || s.seen.logsearch) },
    ask(
      'Read the error',
      'What does the error block say?',
      ['DB:CONNECTIVITY, the pool has no free connection', 'DB:QUERY_EXECUTION, SQL Server error 1205: the transaction was chosen as the deadlock victim', 'DB:QUERY_EXECUTION, the query has timed out', 'HTTP:TIMEOUT from the payment provider'],
      1,
      'SQL Server found two transactions that waited for each other. It rolled one of them back, the victim, and raised error 1205 with the text Rerun the transaction. The Mule app has no handler for it, so the caller gets 500.',
    ),
    ask(
      'Find the cause',
      'A payment locks the orders row, then the stock row. A reservation locks the stock row, then the orders row. Why does that deadlock?',
      ['SQL Server has too few connections', 'Each one holds the row the other needs next, so both would wait forever until SQL Server ends one', 'Two replicas share one pool', 'The stock table has no index'],
      1,
      'A payment holds orders and waits for stock. A reservation holds stock and waits for orders. Neither can go on. The same order of locks in every flow turns this into a short wait instead of a deadlock.',
    ),
    {
      title: 'Lock the rows in the same order',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set db.lockOrder.reservations to orders-then-stock, so both flows update orders first and stock second, then Apply Changes. In a real app you change the order of the two Database operations in the flow.`,
      done: (s) => running(s) && set(s).order === 'same',
    },
    {
      title: 'Keep the transaction short',
      how: 'The payment flow starts its transaction, updates the order, calls the payment provider for about 0.9 seconds, then updates the stock. The locks are held all that time. Set tx.scope to db-only, so the provider is called before the transaction, and Apply Changes.',
      done: (s) => running(s) && set(s).short,
    },
    ask(
      'A teammate wants a retry',
      'A teammate wraps both updates in Until Successful with maxRetries 10 and retries on every error. What goes wrong?',
      ['Nothing, a retry fixes every database error', 'Errors that never get better, such as a foreign key violation, are tried 11 times, so the call is slow and still fails, and the locks are held longer', 'Until Successful cannot hold a Database operation', 'SQL Server blocks the account after 10 errors'],
      1,
      'A deadlock is worth one more try: the other transaction has finished by then. A foreign key violation, a bad SQL statement or a wrong password fail the same way every time. Retrying them only adds load. Retry the errors that can go away, and few times.',
    ),
    {
      title: 'See the blind retry',
      how: 'Try the idea of the teammate so you see it. Set retry.on to all, retry.max to 10 and retry.waitMs to 1000, Apply Changes, and move the clock 2 minutes. In the logs, the calls for O-9001 now fail after 11 attempts and about 11 seconds instead of answering 422 at once.',
      done: (s) => (app(s, NAME)?.logs ?? []).some((l) => /retries exhausted\. 11 attempts .*FOREIGN KEY/.test(l.text)),
    },
    {
      title: 'Retry only the deadlock',
      how: 'Set retry.on to deadlock, retry.max to 3 and retry.waitMs to 200, then Apply Changes. This app models a common pattern: Until Successful holds a Try. Its On Error Propagate only takes the error when the SQL Server error code is 1205, so only a deadlock leaves the Try and makes the scope try again. An On Error Continue in the same Try takes every other error, so the scope ends at once and the flow answers. Set millisBetweenRetries yourself: the default is 60000, one minute.',
      done: (s) => running(s) && set(s).on === 'deadlock' && set(s).max >= 1 && set(s).max <= 5 && set(s).wait <= 2000,
    },
    ask(
      'Why only a few attempts',
      'Why keep retry.max small, such as 3, and not 50?',
      ['50 attempts give a better success rate at no cost', 'A deadlock that comes back each time points at a design fault; many attempts hide it, keep the caller waiting and keep adding load to the database', 'Until Successful allows at most 3 retries'],
      1,
      'With the same lock order and short transactions a deadlock is rare, and one retry almost always commits. If attempts keep failing, MULE:RETRY_EXHAUSTED should reach the error handler and the logs fast, so somebody looks.',
    ),
    {
      title: 'Prove it under the same load',
      how: 'Move the clock 5 minutes with the traffic still on. Every payment and reservation answers 201, and O-9001 answers 422 in about a second.',
      done: (s) => {
        const list = recent(s, NAME, 3)
        const x = set(s)
        return x.order === 'same' && x.short && x.on === 'deadlock' && list.some(bad) && list.some((e) => !bad(e)) && list.every((e) => (bad(e) ? e.s === 422 && e.ms < 2000 : e.s === 201))
      },
    },
  ],
  why: 'SQL Server ends a deadlock by rolling back one transaction, the victim, with error 1205. Prevent it: every flow locks shared rows in the same order, and a transaction holds only database work, never a call to another system. Then keep a small retry for error 1205 alone, because the victim can run again once the other transaction has committed. A retry on every error repeats failures that never go away. A lower isolation level or READ_COMMITTED_SNAPSHOT does not help here: both flows write the rows, and a write waits for a write at every isolation level. Snapshot isolation helps when readers and writers block each other. The lab picks the victims with a fixed chance per attempt; on a real server the chance grows with load and with how long locks are held.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/until-successful-scope',
  solve(start) {
    let s = mark(mark(start, `dash:${NAME}`), `logs:${NAME}`)
    const props = () => app(s, NAME).props
    s = change(s, NAME, { props: { ...props(), 'db.lockOrder.reservations': 'orders-then-stock', 'tx.scope': 'db-only' } })
    s = change(s, NAME, { props: { ...props(), 'retry.on': 'all', 'retry.max': '10', 'retry.waitMs': '1000' } })
    s = advance(s, 2 * MINUTE)
    s = change(s, NAME, { props: { ...props(), 'retry.on': 'deadlock', 'retry.max': '3', 'retry.waitMs': '200' } })
    return advance(s, 5 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 6: 1, 9: 1 },
}

export const LABS = [lab]
