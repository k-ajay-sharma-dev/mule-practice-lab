// The guided lab setup-sqlserver. See platform-labs.js for the shape of a lab.
// The whole setup of a new SQL Server integration: login, user, table, index, grants, the Mule Database config with a
// protected password, the deployment, a connection test, data end to end, a duplicate and an alert.
import { addMonAlert, at, deployApp, finishDeploys, mark, newPlatform } from '../platform.js'
import { app, ask, call, called, OPS } from '../platform-kit.js'
import { granted, loginsOf, newSqlServer, poolsOf, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { DATABASE, DB, JAR, NAME, TABLE } from './setup-sqlserver.pkg.js'

const LOGIN = 'mule_mkt'
const TEAM = 'marketplace-team@brightmart.example'
const HOST = 'sql.brightmart.lab'
const PASSWORD = 'Mkt-Orders-2026' // a made-up lab value
const ORDER = '{"marketplaceRef":"TM-50001","customerId":"C-101","total":89.5}'

const srv = (s) => serverOf(s, DB)
const loginOf = (s) => (srv(s) ? loginsOf(srv(s)) : []).find((l) => l.name.toLowerCase() === LOGIN && l.type === 'SQL login')
const userOf = (s) => (srv(s) ? usersOf(srv(s)) : []).find((u) => u.login.toLowerCase() === LOGIN)
const tableOf = (s) => (srv(s) ? tablesOf(srv(s))[TABLE] : null)
const a = (s) => app(s, NAME)
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
const rowsWith = (s, ref) => (tableOf(s)?.rows ?? []).filter((r) => r.marketplace_ref === ref).length

const tableOk = (s) => {
  const t = tableOf(s)
  const col = (n) => t?.columns.find((c) => c.name.toLowerCase() === n)
  return Boolean(t && t.pk.map((c) => c.toLowerCase()).join() === 'order_id' && ['marketplace_ref', 'customer_id', 'status', 'total', 'created_at'].every(col) && col('marketplace_ref').nullable === false)
}
const indexOk = (s) => (tableOf(s)?.indexes ?? []).some((x) => x.unique && x.columns.length === 1 && x.columns[0].toLowerCase() === 'marketplace_ref')
// least privilege: SELECT, INSERT and UPDATE on the one table, and nothing that reaches further
const leastOk = (s) => {
  const u = userOf(s)
  if (!u || !['SELECT', 'INSERT', 'UPDATE'].every((v) => granted(u, TABLE, v))) return false
  const extra = Object.entries(u.grants ?? {}).some(([tk, ps]) => tk !== TABLE || ps.some((p) => !['SELECT', 'INSERT', 'UPDATE'].includes(p)))
  return !extra && u.roles.length === 0 && !loginOf(s)?.sysadmin
}
const configOk = (s) => {
  const x = a(s)
  if (!x || !loginOf(s)) return false
  const p = x.props
  const pool = num(p['db.pool.max'])
  const timeout = num(p['db.queryTimeout'])
  return p['db.host'] === HOST && String(p['db.port']) === '1433' && p['db.database'] === DATABASE && p['db.user'] === LOGIN && pool >= 2 && pool <= 10 && timeout >= 1 && timeout <= 30 && x.secrets?.['db.password'] === loginOf(s).password && !('db.password' in p)
}
const poolOpen = (s) => (srv(s) ? poolsOf(srv(s)) : []).some((p) => p.app === NAME && p.open > 0 && String(p.cfg?.user).toLowerCase() === LOGIN)
const firstStored = (s) => (store(s).created ?? [])[0]

const lab = {
  id: 'p-setup-sqlserver',
  group: 'Databases and queues',
  title: 'Set up the SQL Server integration for marketplace orders',
  minutes: 35,
  scenario: `Brightmart starts selling on Tidemark Marketplace next Monday. The marketplace team asked for ${NAME}: it takes each marketplace order and writes it into a new SQL Server database, ${DATABASE}, on ${HOST}. The DBA team created the empty database and gave you sysadmin for the setup. The app is built and its jar waits in Runtime Manager. Done means: the app runs with its own login and only the rights it needs, a test order is in the table, a repeated order is stored once, and the team gets an alert on errors. The Inbox has the request.`,
  start() {
    const server = newSqlServer(DB, {
      database: DATABASE,
      dbid: 9,
      tables: {},
      // a new database has only dbo; the logins of the server stay
      users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }],
    })
    return newPlatform({
      clock: at(1, 9),
      jars: [NAME],
      databases: { created: at(1, 8), servers: { [DB]: server } },
      mail: [
        {
          t: at(1, 8, 40),
          to: OPS,
          subject: 'Marketplace orders into SQL Server: please set up',
          body: `Hello, we go live on Tidemark Marketplace on Monday. Please set up ${NAME} (the jar is in Runtime Manager).\n\nServer ${HOST}, port 1433, database ${DATABASE}. It is new and empty.\nLogin and user: ${LOGIN}. The app reads, inserts and updates orders. It never deletes and never changes the schema.\nTable ${TABLE}: order_id (our key), marketplace_ref, customer_id, status, total, created_at. The app looks orders up by marketplace_ref.\nThe marketplace sends a webhook again when it gets no 2xx, so the same order can come twice. It must be stored once.\nLoad: about 20 orders a minute at peak, each insert takes a few milliseconds. Query timeout 5 seconds.\nAlerts on errors to ${TEAM}.\n\nThanks, Marketplace team`,
          source: 'Brightmart marketplace team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the server, database, login, table, lookup key, load and alert address.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the login and the database user',
      how: `Databases from the console menu, server ${DB}, New Query. Type\nCREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\nand Execute. The login lets the app connect to the server. The user maps the login into ${DATABASE}: a login with no user there gets error 4060. CHECK_POLICY is on, so a weak password gets error 15118.`,
      done: (s) => Boolean(loginOf(s) && userOf(s)),
    },
    {
      title: 'Create the table and the index for the lookup key',
      how: `In the query window run\nCREATE TABLE ${TABLE} (order_id varchar(20) NOT NULL PRIMARY KEY, marketplace_ref varchar(30) NOT NULL, customer_id varchar(12) NOT NULL, status varchar(20) NOT NULL DEFAULT 'NEW', total decimal(12,2) NULL, created_at datetime2 NOT NULL DEFAULT SYSDATETIME());\nCREATE UNIQUE INDEX UX_orders_marketplace_ref ON ${TABLE} (marketplace_ref);\nThe unique index makes the lookup by marketplace_ref a seek, and it makes SQL Server refuse a second row for the same marketplace order.`,
      done: (s) => tableOk(s) && indexOk(s),
    },
    {
      title: 'Grant only what the app needs',
      how: `Run GRANT SELECT, INSERT, UPDATE ON ${TABLE} TO ${LOGIN}; Do not add the user to db_owner, db_datawriter or db_ddladmin, and do not grant DELETE. Databases, Logins and users shows the permissions. If you granted too much, REVOKE DELETE ON ${TABLE} FROM ${LOGIN} or ALTER ROLE db_owner DROP MEMBER ${LOGIN} takes it back.`,
      done: leastOk,
    },
    {
      title: 'Set the Database config and protect the password',
      how: `Runtime Manager, Deploy application. Name ${NAME}, Application File ${JAR}. Properties: db.host=${HOST}, db.port=1433, db.database=${DATABASE}, db.user=${LOGIN}, db.pool.max=5, db.queryTimeout=5. Add db.password with the password of the login and choose Protect, so it is hidden after the deployment. Pool size: 20 orders a minute of a few milliseconds each keep less than one connection busy, so 5 is ample (2 to 10 passes). A pool far larger only holds sessions on the server.`,
      done: configOk,
    },
    {
      title: 'Deploy and read the startup logs',
      how: `Deploy. When ${NAME} shows Running, open Runtime Manager, Applications, ${NAME}, Logs and read the start of the app. A missing property stops the start with a ConfigurationPropertiesException.`,
      done: (s) => running(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'Test the connection and see it on the server',
      how: `Lab tools, API client. Application ${NAME}, GET /health. It answers 200 when the SELECT runs as ${LOGIN}. Then Databases, ${DB}, Activity Monitor: under Connections by application ${NAME} has an open connection with login ${LOGIN}. A 503 says why in the body and in the logs: 18456 is the password, 4060 the user or the database, 229 a missing grant.`,
      done: (s) => called(s, NAME, 200, 'GET', /^\/health/) && Boolean(s.seen[`db-activity:${DB}`]) && poolOpen(s),
    },
    {
      title: 'Write a test order and read it back',
      how: `API client: POST /orders with the body ${ORDER}. It answers 201 with a new order_id. Then in a query window SELECT * FROM ${TABLE} WHERE marketplace_ref = 'TM-50001'; shows the row, status NEW and created_at filled by the default.`,
      done: (s) => {
        const first = firstStored(s)
        return called(s, NAME, 201, 'POST', /^\/orders$/) && Boolean(first) && rowsWith(s, first.ref) === 1 && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= first.t
      },
    },
    {
      title: 'Send the same order again',
      how: `POST the same body again, as the marketplace does when it gets no answer in time. SQL Server refuses the second row with error 2601 on the unique index. The app catches the error and answers 409 with the order_id it stored the first time. The table still has one row for TM-50001.`,
      done: (s) => called(s, NAME, 409, 'POST', /^\/orders$/) && (store(s).duplicates ?? []).length > 0 && (store(s).duplicates ?? []).every((d) => rowsWith(s, d.ref) === 1),
    },
    ask(
      'Why the database decides',
      'A teammate wants to drop the unique index and run a SELECT before each INSERT to skip orders the app has seen. What is wrong with that?',
      [
        'Nothing, a SELECT first is the same and needs no index',
        'Two copies of a webhook can arrive at the same moment on two connections. Both SELECTs find nothing, and both INSERTs succeed. Only a unique constraint makes the check and the write one step, so the second insert fails with 2601 and the app answers 409',
        'A SELECT first is not allowed with only SELECT, INSERT and UPDATE granted',
        'SQL Server cannot run a SELECT and an INSERT in one flow',
      ],
      1,
      'Check then insert is a race: under READ COMMITTED neither SELECT sees the row the other one is about to write. The unique index puts the rule where every writer must pass it. The app still reads first in some designs to answer faster, but the index is what keeps the data right. It also turns the lookup by marketplace_ref into an Index Seek.',
    ),
    {
      title: 'Alert the marketplace team on errors',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0, with ${TEAM} as recipient.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.resource === 'Application' && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
  ],
  why: `The setup checklist for a database integration: read the request for names, keys and load. On the server make a login for the app and a user for it in the database, create the table with its primary key and a unique index on the business key, and grant SELECT, INSERT and UPDATE on that table only, never db_owner. In the app set host, port, databaseName, user, a pooling profile sized to the load and a queryTimeout, and keep the password in a protected property or a secure properties file. Deploy, read the startup logs, test the connection and see the session on the server. Then send real data and read it back, send a duplicate and see it refused by the constraint and answered as 409, and alert on errors. In the lab the query window runs as sysadmin, and the 409 handling is part of the app's on-error-continue.`,
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-connect',
  solve(start) {
    let s = mark(start, 'inbox')
    s = runSql(s, DB, `CREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;`).state
    s = runSql(s, DB, `CREATE TABLE ${TABLE} (order_id varchar(20) NOT NULL PRIMARY KEY, marketplace_ref varchar(30) NOT NULL, customer_id varchar(12) NOT NULL, status varchar(20) NOT NULL DEFAULT 'NEW', total decimal(12,2) NULL, created_at datetime2 NOT NULL DEFAULT SYSDATETIME());\nCREATE UNIQUE INDEX UX_orders_marketplace_ref ON ${TABLE} (marketplace_ref);`).state
    s = runSql(s, DB, `GRANT SELECT, INSERT, UPDATE ON ${TABLE} TO ${LOGIN};`).state
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: JAR, replicas: 1, vCores: 0.1, props: { 'db.host': HOST, 'db.port': '1433', 'db.database': DATABASE, 'db.user': LOGIN, 'db.pool.max': '5', 'db.queryTimeout': '5' }, secrets: { 'db.password': PASSWORD } }).state)
    s = mark(s, `logs:${NAME}`)
    s = call(s, NAME, null, '/health', 'GET').state
    s = mark(s, `db-activity:${DB}`)
    s = call(s, NAME, null, '/orders', 'POST', ORDER).state
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE marketplace_ref = 'TM-50001';`).state
    s = call(s, NAME, null, '/orders', 'POST', ORDER).state
    return addMonAlert(s, { title: 'Marketplace order errors', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
  },
  answers: { 9: 1 },
}

export const LABS = [lab]
