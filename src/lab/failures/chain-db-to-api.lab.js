// The guided lab chain-db-to-api. See platform-labs.js for the shape of a lab.
// One root cause, four layers: a price file that came late makes the nightly import run at peak time, its open
// transaction blocks the reads of the prices System API, the pool fills, and the Process and Experience APIs time out.
import { addMonAlert, advance, at, internalOf, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, recent, until } from '../platform-kit.js'
import { LAYER_PROPERTY } from '../platform-led.js'
import { killSession, newSqlServer, serverOf } from '../platform-db.js'
import { fileRec, newServerSys, systemsOf } from '../platform-systems.js'
import { DB, EAPI, fileOf, HOST, IMPORT, PAPI, PRICE_DIR, SAPI, settingsOf } from './chain-db-to-api.pkg.js'

const DB_PROPS = { 'db.host': 'sql.brightmart.lab', 'db.port': '1433', 'db.database': 'BrightmartOrders' }
const CHAIN = [EAPI, PAPI, SAPI]
const ALERT_METRICS = ['Message Error Count', 'Average Response Time']

const csv = (day, rows) => `sku,price,currency,valid_from\n${rows.map(([sku, p]) => `${sku},${p.toFixed(2)},USD,${day}`).join('\n')}\n`
const TODAY = [['SKU-22', 21.4], ['SKU-31', 26.9], ['SKU-48', 18.2], ['SKU-55', 9.75], ['SKU-60', 44]]
const YESTERDAY = [['SKU-22', 19.95], ['SKU-31', 24.5], ['SKU-48', 17.4], ['SKU-55', 9.25], ['SKU-60', 42]]

// dbo.prices: the only table this lab needs, in the shape platform-db.js uses for its tables
const col = (name, type, nullable = true) => ({ name, type, nullable })
const pricesTable = () => ({
  schema: 'dbo', name: 'prices', pk: ['sku'], pkName: 'PK_prices', clustered: true, fks: [], indexes: [], count: 5412, distinct: { currency: 1 }, spread: {}, changed: 0,
  columns: [col('sku', 'varchar(16)', false), col('price', 'decimal(10,2)', false), col('currency', 'char(3)', false), col('valid_from', 'date')],
  rows: YESTERDAY.map(([sku, price]) => ({ sku, price, currency: 'USD', valid_from: '2026-11-02' })),
})

function sftpServer() {
  const yesterday = `${PRICE_DIR}/prices-2026-11-02.csv`
  const today = `${PRICE_DIR}/${fileOf(at(1))}`
  return newServerSys(HOST, {
    ip: '10.20.5.21',
    users: { mule_prices: { password: 'lab', home: '/', readDirs: ['/inbound'] }, pim_export: { password: 'pim-lab', home: '/', writeDirs: ['/inbound/prices'] } },
    dirs: ['/', '/inbound', PRICE_DIR],
    files: {
      [yesterday]: fileRec(csv('2026-11-02', YESTERDAY), { t: at(0, 1, 32), owner: 'pim_export' }),
      [today]: fileRec(csv('2026-11-03', TODAY), { t: at(1, 9, 52), owner: 'pim_export' }),
    },
    log: [
      { t: at(0, 1, 32), who: 'pim_export', op: 'write', path: yesterday, ok: true, text: `pim_export wrote ${yesterday}` },
      { t: at(1, 1, 30), who: 'pim_export', op: 'login', path: '', ok: false, text: 'pim_export did not connect: the nightly export of the pricing system stopped with an error before the upload' },
      { t: at(1, 9, 52), who: 'pim_export', op: 'write', path: today, ok: true, text: `pim_export wrote ${today} (export run again by hand)` },
    ],
  })
}

const set = (s, name) => settingsOf({ ...app(s, name)?.props, ...app(s, name)?.secrets })
const running = (s, ...names) => names.every((n) => app(s, n)?.status === 'Running')
const killed = (s) => (serverOf(s, DB)?.kills ?? []).some((k) => k.app === IMPORT && k.openTran > 0)
const timeoutsOk = (s) => {
  if (!running(s, SAPI, PAPI, EAPI)) return false
  const q = set(s, SAPI).queryTimeout
  const mid = set(s, PAPI).sapiTimeout
  return q >= 1 && q <= 5 && mid > q * 1000 && mid < set(s, EAPI).papiTimeout && set(s, PAPI).fallback === 'last-known'
}
const guarded = (s) => running(s, IMPORT) && set(s, IMPORT).commitSize >= 100 && set(s, IMPORT).commitSize <= 5000 && set(s, IMPORT).notAfter !== null && set(s, IMPORT).notAfter <= 7 * 60
const alerted = (s) => s.monAlerts.some((a) => a.enabled && a.recipients && a.resource === 'Application' && CHAIN.includes(a.name_) && ALERT_METRICS.includes(a.metric))
const allOk = (s, name) => {
  const list = recent(s, name, 10)
  return list.length > 0 && list.every((e) => e.s === 200 || e.s === 201)
}
const proved = (s) => {
  if (!killed(s) || !timeoutsOk(s) || !guarded(s)) return false
  const last = Math.max(...[...CHAIN, IMPORT].map((n) => app(s, n).updated))
  return s.clock >= last + 10 * MINUTE && allOk(s, EAPI) && allOk(s, SAPI) && !(serverOf(s, DB)?.sessions ?? []).some((x) => x.wait)
}

const lab = {
  id: 'p-chain-db-to-api',
  group: 'Chained incidents',
  title: 'Price unavailable at 10:15',
  minutes: 30,
  scenario: `Tuesday 10:15 at Brightmart. The mobile app shows "price unavailable" on product pages and checkout errors climb. Nobody deployed anything today. ${EAPI} calls ${PAPI}, which calls ${SAPI} on SQL Server. ${IMPORT} loads the price file of the pricing system each night. Trace the symptom down to its cause, end it, and make each layer stop the next incident from spreading.`,
  start() {
    const s = newPlatform({
      clock: at(1, 9, 50),
      apps: [
        newApp(EAPI, { props: { [LAYER_PROPERTY]: 'Experience', 'papi.url': internalOf({ name: PAPI, env: 'Sandbox' }), 'papi.timeout': '10000' } }),
        newApp(PAPI, { props: { [LAYER_PROPERTY]: 'Process', 'sapi.url': internalOf({ name: SAPI, env: 'Sandbox' }), 'sapi.timeout': '10000', 'prices.fallback': 'none' }, store: {} }),
        newApp(SAPI, { props: { [LAYER_PROPERTY]: 'System', ...DB_PROPS, 'db.user': 'mule_reports', 'db.pool.max': '5', 'db.pool.maxWait': '0', 'db.queryTimeout': '0' }, secrets: { 'db.password': 'Reports-Lab-2026' }, store: {} }),
        newApp(IMPORT, { props: { 'sftp.host': HOST, 'sftp.user': 'mule_prices', 'sftp.dir': PRICE_DIR, ...DB_PROPS, 'db.user': 'mule_etl', 'import.commitSize': '', 'import.notAfter': '' }, secrets: { 'sftp.password': 'lab', 'db.password': 'Etl-Lab-2026' }, store: {} }),
      ],
      traffic: [
        { app: EAPI, env: 'Sandbox', path: '/products/SKU-22/price', perMinute: 2 },
        { app: EAPI, env: 'Sandbox', path: '/products/SKU-31/price', perMinute: 1 },
        { app: EAPI, env: 'Sandbox', method: 'POST', path: '/checkout', body: '{"sku":"SKU-22","qty":2}', perMinute: 1 },
      ],
      mail: [
        {
          t: at(1, 10, 12),
          to: OPS,
          subject: 'Mobile app: price unavailable, checkout failing',
          body: 'Since about 10:00 the Brightmart app shows "price unavailable" on most product pages and checkout spins for 10 seconds and fails. The morning promotion started at 10:00 and the store teams are calling. Nothing was released today on our side. Brightmart mobile team',
          source: 'Brightmart mobile team',
        },
      ],
      databases: { created: at(1, 9), servers: { [DB]: newSqlServer(DB, { tables: { 'dbo.prices': pricesTable() }, nextSpid: 61 }) } },
      systems: systemsOf({ servers: [sftpServer()] }),
    })
    return until(s, at(1, 10, 15))
  },
  steps: [
    {
      title: 'See the symptom in the Experience layer',
      how: `Monitoring, ${EAPI}. Up to 10:00 every call answers in milliseconds. From 10:00 the failures go up and the response time sits at 10 seconds: the 504s of a call that waited for its full timeout.`,
      done: (s) => Boolean(s.seen[`dash:${EAPI}`]),
    },
    {
      title: 'Follow the calls down the layers',
      how: `Visualizer, Architecture. The red line goes from ${EAPI} to ${PAPI} and on to ${SAPI}. Select ${SAPI}: it answers nothing in time, while the layers above only wait for it.`,
      done: (s) => Boolean(s.seen[`vis:${SAPI}`]),
    },
    {
      title: 'Find and end the head blocker',
      how: `Lab tools, Databases, ${DB}, Activity Monitor. The sessions of ${SAPI} are suspended with LCK_M_S and all name one session in Blocked By. That head blocker is sleeping with 1 open transaction, login mule_etl, host a replica of ${IMPORT}. Kill Process on it (or KILL in a query window). SQL Server rolls its updates back, so the prices of yesterday stay. The import polls every 15 minutes and starts again, so fix it soon.`,
      done: killed,
    },
    {
      title: 'Find why a night job ran at 10:00',
      how: `Console, SFTP and FTP. Quickconnect to ${HOST} as mule_prices with password lab and open ${PRICE_DIR}. The file of yesterday came at 01:32. ${fileOf(at(1))} came at 09:52. The Server tab tells why: the export of the pricing system failed in the night and was run again by hand, so the 10:00 poll of the import loaded it in the middle of the morning traffic.`,
      done: (s) => Boolean(s.seen[`sftp:${HOST}`]),
    },
    ask(
      'Place the timeouts',
      `${EAPI} waits 10 s for ${PAPI}, which waits 10 s for ${SAPI}, whose Select has no queryTimeout. Where should the timeouts be?`,
      [
        'The same 10 s in every layer, so they agree',
        'Shortest at the bottom: a queryTimeout of a few seconds on the Select, a responseTimeout in the Process API a little longer than that, and the longest in the Experience API. Each layer then hears from the layer below in time to answer with a fallback',
        'Only in the Experience API, because it faces the user',
        'No timeouts at all, so that no request fails',
      ],
      1,
      'With equal timeouts every layer gives up at the same moment, so the Process API never gets to use a fallback before its own caller has gone. The layer next to the resource must give up first and free what it holds, here a pool connection. A Select without queryTimeout waits as long as the lock stays, and with maxWait 0 the next callers wait for a connection with no limit too.',
    ),
    {
      title: 'Stop the wait from climbing the layers',
      how: `Runtime Manager, Settings, Properties, Apply Changes on each app. ${SAPI}: db.queryTimeout to 2 (seconds, 1 to 5 passes). ${PAPI}: sapi.timeout to 4000 (milliseconds: above the queryTimeout and below papi.timeout of ${EAPI}, which is 10000), and prices.fallback to last-known, so an error of the System API is answered with the last price served, marked as such. Mule has no circuit breaker built in; this fallback is the part of one the lab models.`,
      done: timeoutsOk,
    },
    {
      title: 'Guard the import',
      how: `Runtime Manager, ${IMPORT}, Settings, Properties. Set import.commitSize to 500, so each commit frees its locks after 500 rows (100 to 5000 passes). Set import.notAfter to 06:00 (07:00 at the latest): a file that comes later is not loaded during the day, and Operations gets a mail to load it in the evening window. Apply Changes.`,
      done: guarded,
    },
    ask(
      'Bulkheads',
      `Product pages and checkout both reach ${SAPI} and share its pool of 5 connections. Product pages are 3 of every 4 calls. What does a bulkhead add?`,
      [
        'A larger pool for every caller',
        'Separate resources for separate uses: a pool, a replica or a rate limit for checkout apart from the product pages, so slow page calls cannot use up what checkout needs',
        'A retry of each failed call three times',
        'A second SQL Server with the same data',
      ],
      1,
      'A bulkhead splits shared capacity so one flood cannot sink everything, like the compartments of a ship. A larger pool fills the same way against a lock, only later, and retries add load to a system that already does not answer. Separate pools, separate System API deployments or a rate limit in API Manager on the less important caller keep checkout alive.',
    ),
    {
      title: 'Alert before the users call',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, one of ${EAPI}, ${PAPI} or ${SAPI}. Metric Message Error Count Above 0, or Average Response Time Above 2000, with ${OPS} as recipient.`,
      done: alerted,
    },
    {
      title: 'Prove the chain is healthy',
      how: `Move the clock at least 10 minutes after your last change. Every call of ${EAPI} and ${SAPI} in the last 10 minutes answers 200 or 201, and Activity Monitor shows no waiting session. The next poll of ${IMPORT} does not load the late file and mails Operations.`,
      done: proved,
    },
  ],
  why: 'One late file turned into a mobile outage because every layer passed the wait up. The import loaded the whole file in one transaction, so the X locks on dbo.prices stayed until the end of the file. That was fine at 02:00 and not at 10:00. The System API had no queryTimeout and a pool with maxWait 0, so each read waited on the lock and kept a connection, and the pool filled. The Process and Experience APIs used the same 10 s, so they gave up together and no layer could answer with a fallback. End the head blocker first: KILL rolls its transaction back. Then contain it in each layer. Put the shortest timeout next to the resource and longer ones above it. Add a fallback, such as the last known price from an Object Store, or a circuit breaker you build with an Object Store. Commit a bulk load in chunks; SQL Server also escalates more than about 5,000 row locks of one statement to a table lock. Keep a job that should run at night from running in the day, and alert on errors and response time. In the lab the file carries the first rows of the real one, the whole file transaction stays open until it is ended, and a chunked load commits at once.',
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-reference',
  solve(start) {
    let s = mark(mark(mark(start, `dash:${EAPI}`), `vis:${SAPI}`), `db-activity:${DB}`)
    const blocker = serverOf(s, DB).sessions.find((x) => x.app === IMPORT && x.openTran)
    s = killSession(s, DB, blocker.id).state
    s = mark(s, `sftp:${HOST}`)
    s = change(s, SAPI, { props: { ...app(s, SAPI).props, 'db.queryTimeout': '2' } })
    s = change(s, PAPI, { props: { ...app(s, PAPI).props, 'sapi.timeout': '4000', 'prices.fallback': 'last-known' } })
    s = change(s, IMPORT, { props: { ...app(s, IMPORT).props, 'import.commitSize': '500', 'import.notAfter': '06:00' } })
    s = addMonAlert(s, { title: 'Price errors', resource: 'Application', name_: PAPI, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    return advance(s, 16 * MINUTE)
  },
  answers: { 4: 1, 7: 1 },
}

export const LABS = [lab]
