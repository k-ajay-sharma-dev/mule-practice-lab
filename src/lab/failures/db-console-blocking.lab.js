// The guided lab db-console-blocking. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, recent, until } from '../platform-kit.js'
import { defaultDatabases, killSession, serverOf } from '../platform-db.js'
import { DB, REFUND, settingsOf, STATUS, STOCK } from './db-console-blocking.pkg.js'

const BLOCKER = 57
const DB_PROPS = { 'db.host': 'sql.brightmart.lab', 'db.port': '1433', 'db.database': 'BrightmartOrders' }
const refundApp = () =>
  newApp(REFUND, {
    props: { ...DB_PROPS, 'db.user': 'mule_orders', 'db.pool.max': '5', 'db.pool.maxWait': '10', 'db.queryTimeout': '0', 'tx.timeout': '', 'tx.remoteCall': 'inside', 'provider.url': 'https://api.brightmartpay.lab/v2' },
    secrets: { 'db.password': 'Orders-Lab-2026' },
    store: {},
  })
const readApp = (name) => newApp(name, { props: { ...DB_PROPS, 'db.user': 'mule_reports', 'db.pool.max': '5', 'db.pool.maxWait': '10', 'db.queryTimeout': '0' }, secrets: { 'db.password': 'Reports-Lab-2026' }, store: {} })
const set = (s) => settingsOf({ ...app(s, REFUND)?.props, ...app(s, REFUND)?.secrets })
const running = (s) => app(s, REFUND)?.status === 'Running'
const srv = (s) => serverOf(s, DB)
const allOk = (s, name) => {
  const list = recent(s, name, 10)
  return list.length > 0 && list.every((e) => e.s === 200)
}

const lab = {
  id: 'p-db-console-blocking',
  group: 'Databases and queues',
  title: 'One open transaction blocks every API',
  minutes: 20,
  scenario:
    'Since 08:40 the order status API and the stock API of Brightmart Retail time out, and their logs fill with DB:CONNECTIVITY. CPU on SQL Server is low and nothing failed over. The only change this week: brightmart-refund-sapi now calls the payment provider inside its refund flow. Find what holds the database, free it, and change the refund app so this cannot happen again.',
  start() {
    const databases = defaultDatabases(at(1, 8, 39))
    databases.servers[DB].nextSpid = BLOCKER
    const s = newPlatform({
      clock: at(1, 8, 39),
      apps: [refundApp(), readApp(STATUS), readApp(STOCK)],
      // the refund comes first in each minute, so it opens session 57
      traffic: [
        { app: REFUND, env: 'Sandbox', method: 'POST', path: '/refunds/O-1007', perMinute: 1, every: 20 },
        { app: STATUS, env: 'Sandbox', path: '/customers/C-101/orders', perMinute: 3 },
        { app: STOCK, env: 'Sandbox', path: '/stock?warehouse=W1', perMinute: 3 },
      ],
      mail: [
        {
          t: at(1, 9, 5),
          to: OPS,
          subject: 'Order status and stock pages hang',
          body: 'Since about 08:40 the shop cannot show order status or stock. Pages spin for 30 seconds and then fail. The database team sees low CPU and no errors on SQL Server. Please look at it now, the morning sale starts at 10:00.',
          source: 'Brightmart Retail Service Desk',
        },
      ],
      databases,
    })
    return until(s, at(1, 9, 30))
  },
  steps: [
    {
      title: 'Open Activity Monitor',
      how: `Databases from the console menu, under Systems. Pick ${DB} in Object Explorer and open Activity Monitor. Read the Processes grid: Task State, Wait Type, Blocked By, Head Blocker and Open Transactions.`,
      done: (s) => Boolean(s.seen[`db-activity:${DB}`]),
    },
    ask(
      'Find the head blocker',
      'Many sessions are suspended with LCK_M_S or LCK_M_X. Which session is the head blocker?',
      [
        `Session 58 of ${STATUS}, the oldest suspended session`,
        `Session ${BLOCKER} of ${REFUND}: Task State sleeping, 1 open transaction, nothing in Blocked By, and the waiting sessions name it as their blocker`,
        'The session with the longest Wait Time',
        'Session 51, the query window of the DBA',
      ],
      1,
      `Follow Blocked By to the end of the chain. The session at the end blocks others and waits for nothing itself. Session ${BLOCKER} runs no statement at all. It is sleeping with an open transaction, so its X locks on dbo.orders and dbo.stock stay.`,
    ),
    ask(
      'Why a sleeping session blocks',
      `How can session ${BLOCKER} block others while it runs nothing?`,
      [
        'A sleeping session holds no locks, so it cannot be the cause',
        'The refund flow updated the rows, then called the payment provider inside the same transaction. The provider never answers, so the flow never commits and the locks stay until the transaction ends',
        'SQL Server keeps the locks of every session for 30 minutes',
        'The pool of the refund app is too small',
      ],
      1,
      'Locks belong to the transaction, not to the statement. The UPDATE finished in milliseconds, but its X locks stay to COMMIT or ROLLBACK. The read APIs scan dbo.orders and dbo.stock under READ COMMITTED, reach a locked row and wait. Each wait keeps a pool connection, so the pools fill and later calls get DB:CONNECTIVITY.',
    ),
    {
      title: 'Kill the head blocker',
      how: `Activity Monitor, Processes, Kill Process on session ${BLOCKER}. In a query window KILL ${BLOCKER} does the same. Do this first: in production this is the fast way to give the database back.`,
      done: (s) => (srv(s)?.kills ?? []).some((k) => k.app === REFUND && k.openTran > 0),
    },
    ask(
      'What KILL does to the refund',
      `What happens to the refund of O-1007 when you kill session ${BLOCKER}?`,
      [
        'SQL Server commits it, so the refund is done',
        'SQL Server rolls the open transaction back: O-1007 is PAID again and the stock goes back. The provider may still have the request, so the app must be able to send the refund again without paying twice',
        'Nothing changes until the app restarts',
        'The rows stay locked until the next checkpoint',
      ],
      1,
      'KILL ends the connection and SQL Server rolls back the transaction of the session. The waiting sessions get their locks a moment later. A refund call that reached the provider may still be processed there, which is why calls to a provider carry an idempotency key.',
    ),
    {
      title: 'Call the provider outside the transaction',
      how: `Runtime Manager, ${REFUND}, Settings, Properties. Set tx.remoteCall to outside and Apply Changes. The flow then commits the two updates in a short transaction and calls the provider after the commit, so a slow provider holds no lock.`,
      done: (s) => running(s) && set(s).outside,
    },
    {
      title: 'Add a query timeout and a transaction timeout',
      how: `Same app. Set db.queryTimeout to a few seconds, such as 5, so a statement that meets a lock gives up and the connection goes back to the pool. Set tx.timeout to about 30, so a transaction that stays open longer is rolled back. Apply Changes. The read APIs should get a queryTimeout as well, so a wait never fills their pools.`,
      done: (s) => running(s) && set(s).queryTimeout >= 1 && set(s).queryTimeout <= 60 && set(s).txTimeout >= 1 && set(s).txTimeout <= 120,
    },
    ask(
      'NOLOCK as a quick fix',
      'A teammate wants WITH (NOLOCK) on the two read queries, so they never wait again. What is the risk?',
      [
        'None, NOLOCK only makes the read faster',
        'The reads see changes that are not committed, such as REFUND_PENDING for a refund that is rolled back later, and a scan can skip or repeat rows. READ_COMMITTED_SNAPSHOT gives readers the last committed version without that risk',
        'NOLOCK blocks the writers instead',
        'SQL Server ignores NOLOCK on a table with a primary key',
      ],
      1,
      'NOLOCK is READ UNCOMMITTED: dirty reads, and rows missed or read twice while pages move. With READ_COMMITTED_SNAPSHOT on, a reader takes the committed version from the version store and does not wait for a writer. Writers still wait for writers, so the long transaction stays the real fault.',
    ),
    {
      title: 'Prove it with the next refunds',
      how: `Move the clock 25 minutes after your last change, so a refund runs with the new settings. The refund answers 202, both read APIs answer 200 in the last 10 minutes, and Activity Monitor shows no waiting session.`,
      done: (s) => {
        const a = app(s, REFUND)
        if (!a || !set(s).outside || s.clock < a.updated + 20 * MINUTE || !((a.store?.lastOk ?? 0) > a.updated)) return false
        return allOk(s, STATUS) && allOk(s, STOCK) && !(srv(s)?.sessions ?? []).some((x) => x.wait)
      },
    },
  ],
  why: 'A transaction should hold only database work. Locks stay until COMMIT or ROLLBACK, so a remote call inside a transaction turns a slow partner into locks that block every reader and writer of those rows. Under READ COMMITTED a scan that reaches a locked row waits, each wait holds a pool connection, and the pools fill. Find the head blocker in Activity Monitor or with blocking_session_id in sys.dm_exec_requests: a sleeping session with an open transaction is the classic sign. KILL frees the database at once and rolls the work back. Then fix the design: call the remote system after the commit, set a queryTimeout so a statement gives up, and a transaction timeout so nothing stays open for long. In the lab the transaction timeout is a property that the lab enforces at the next lab minute, the provider never answers, and a waiting call answers 504 after 30 seconds from the side of the caller.',
  docs: 'https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/performance/understand-resolve-blocking',
  solve(start) {
    let s = mark(start, `db-activity:${DB}`)
    s = killSession(s, DB, BLOCKER).state
    s = change(s, REFUND, { props: { ...app(s, REFUND).props, 'tx.remoteCall': 'outside', 'db.queryTimeout': '5', 'tx.timeout': '30' } })
    return advance(s, 25 * MINUTE)
  },
  answers: { 1: 1, 2: 1, 4: 1, 7: 1 },
}

export const LABS = [lab]
