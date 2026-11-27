// The guided lab db-pool. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, propsValue, recent, until } from '../platform-kit.js'

const NAME = 'orders-sapi-sql'
const SALE = 90 // lab calls a minute during the sale, each one stands for 10 real requests
const PROPS = { 'db.host': 'sql02.brightmart.lab', 'db.pool.max': '5', 'db.pool.maxWait': '10', 'db.query.timeout': '0' }
const load = (perMinute) => [{ app: NAME, env: 'Sandbox', path: '/orders', perMinute }]
const running = (s) => app(s, NAME)?.status === 'Running'
const num = (s, key) => Number(propsValue(app(s, NAME), key))

const lab = {
  id: 'p-fail-db-pool',
  group: 'More production failures',
  title: 'The connection pool runs dry in the sale',
  minutes: 12,
  scenario:
    'Brightmart started its winter sale at 08:50. orders-sapi-sql reads orders from SQL Server. Since the sale, calls take seconds and some return 500. The database team says SQL Server is healthy and lightly used. Each call in the lab stands for 10 real requests, so the traffic you see is the sale at a smaller scale.',
  start() {
    let s = newPlatform({ clock: at(1, 8, 40), apps: [newApp(NAME, { props: { ...PROPS } })], traffic: load(30) })
    s = until(s, at(1, 8, 48))
    s.traffic = load(60)
    s = until(s, at(1, 8, 52))
    s.traffic = load(SALE)
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the dashboard', how: `Monitoring, Built-in dashboards, ${NAME}, View. The response time climbed first, then the errors came. Look at the Infrastructure tab too: the CPU is low.`, done: (s) => Boolean(s.seen[`dash:${NAME}`]) },
    { title: 'Find the error in the logs', how: `Runtime Manager, Applications, ${NAME}, Logs, or Monitoring, Log Search with log-level: ERROR AND appId: ${NAME}.`, done: (s) => Boolean(s.seen[`logs:${NAME}`] || s.seen.logsearch) },
    ask(
      'Read the error',
      'What does the error block say?',
      ['DB:QUERY_EXECUTION, the query has timed out', 'DB:CONNECTIVITY, no connection could be checked out of the pool in time', 'HTTP:TIMEOUT from a backend', 'DB:CONNECTIVITY, login failed for the user'],
      1,
      'The Select never reached SQL Server. It waited for a free connection of the pool, gave up after maxWait (db.pool.maxWait, 10 seconds) and raised DB:CONNECTIVITY.',
    ),
    ask(
      'Why only in the sale',
      'Each query holds a connection for about 0.4 seconds. In the sale one replica gets about 15 requests a second. What is the limit?',
      ['SQL Server is overloaded', 'About 6 queries need a connection at the same time, and the pool has 5', 'The replica has no CPU left', 'The HTTP listener has too few threads'],
      1,
      'Requests a second times the seconds each one holds a connection gives the connections in use: 15 times 0.4 is 6. maxPoolSize is 5, so calls queue for a connection. The response time climbs, and past maxWait the calls fail.',
    ),
    ask(
      'The tempting fix',
      'A teammate wants to raise the replica size from 0.1 to 1 vCore. Does that fix it?',
      ['Yes, more CPU makes the queries faster', 'No, the replica still has a pool of 5 connections and the CPU is not the limit', 'Yes, a larger replica gets a larger pool'],
      1,
      'The pool size is a setting of the Database config. It does not grow with vCores, and the CPU was low all along. More vCores cost more and change nothing here.',
    ),
    { title: 'Raise the pool size', how: `Runtime Manager, ${NAME}, Settings, Properties. Set db.pool.max to 20, then Apply Changes. 20 fits the 6 connections of the sale with room for the next peak.`, done: (s) => running(s) && num(s, 'db.pool.max') >= 15 && num(s, 'db.pool.max') <= 40 },
    { title: 'Add a query timeout', how: 'Set db.query.timeout to 5 (seconds) and Apply Changes. 0 means no timeout. With a timeout, a stuck query is cancelled and its connection goes back to the pool instead of being held for minutes.', done: (s) => running(s) && num(s, 'db.query.timeout') >= 2 && num(s, 'db.query.timeout') <= 30 },
    ask(
      'Replicas and the database',
      'Next year you run 4 replicas, each with db.pool.max 20. The database team allows this service account 60 connections. What can happen?',
      ['Up to 80 connections are asked for, more than the 60 allowed, so some are refused', 'The 4 replicas share one pool of 20', 'Nothing, the pool size is a total for the application'],
      0,
      'Each replica has its own pool. The total is replicas times maxPoolSize, and it must fit the connection limit of the database. Size the pool per replica with that in mind.',
    ),
    { title: 'Prove it under the same load', how: 'Move the clock 5 minutes. The sale traffic is still there. Every call answers 200 and the average is under 1000 ms.', done: (s) => {
      const list = recent(s, NAME, 3)
      return (s.traffic.find((t) => t.app === NAME)?.perMinute ?? 0) >= SALE && list.length > 0 && list.every((e) => e.s === 200) && list.reduce((n, e) => n + e.ms, 0) / list.length < 1000
    } },
  ],
  why: 'The Database connector holds a pool of connections per replica, 5 by default. When more queries run at once than the pool holds, the others wait, and with maxWait set they fail with DB:CONNECTIVITY. Size maxPoolSize from requests a second times query time, keep replicas times pool size under the database limit, and set a query timeout so one slow query cannot hold a connection forever. The lab uses one fixed query time; a real pool also opens connections step by step (acquireIncrement).',
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-connection',
  solve(start) {
    let s = mark(mark(start, `dash:${NAME}`), `logs:${NAME}`)
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'db.pool.max': '20', 'db.query.timeout': '5' } })
    return advance(s, 5 * MINUTE)
  },
  answers: { 2: 1, 3: 1, 4: 1, 7: 0 },
}

export const LABS = [lab]
