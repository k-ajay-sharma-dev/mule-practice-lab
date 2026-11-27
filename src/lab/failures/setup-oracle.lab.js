// The guided lab setup-oracle. See platform-labs.js for the shape of a lab.
// The whole setup of a new Oracle integration: the user, CREATE SESSION and the table grants, the JDBC URL with the
// service name of the pluggable database, the deployment, a connection test, data end to end, a rejected event, an alert.
import { addMonAlert, at, deployApp, finishDeploys, mark, newPlatform } from '../platform.js'
import { app, ask, call, called, OPS } from '../platform-kit.js'
import { loginsOf, newOracle, poolsOf, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { DB, EVENTS, JAR, NAME, SHIPMENTS, urlOf } from './setup-oracle.pkg.js'

const USER = 'MULE_TRACK'
const TEAM = 'logistics-it@brightmart.example'
const HOST = 'ora.brightmart.lab'
const SERVICE = 'BRIGHTMARTPDB'
const URL = `jdbc:oracle:thin:@//${HOST}:1521/${SERVICE}`
const PASSWORD = 'Track-Lab-2026' // a made-up lab value
const EVENT = '{"shipmentId":500103,"status":"PICKED_UP","location":"Rotterdam"}'
const UNKNOWN = '{"shipmentId":599999,"status":"PICKED_UP","location":"Antwerp"}'

const srv = (s) => serverOf(s, DB)
const loginOf = (s) => (srv(s) ? loginsOf(srv(s)) : []).find((l) => l.name === USER && l.created !== undefined)
const userOf = (s) => (srv(s) ? usersOf(srv(s)) : []).find((u) => u.name === USER)
const rowsOf = (s, tk) => (srv(s) ? tablesOf(srv(s))[tk]?.rows : null) ?? []
const a = (s) => app(s, NAME)
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
const has = (list, want) => want.every((x) => (list ?? []).includes(x))

// CREATE SESSION (or the CONNECT role), SELECT and INSERT on the events, SELECT and UPDATE on the shipments, nothing more
const leastOk = (s) => {
  const u = userOf(s)
  const l = loginOf(s)
  if (!u || !l) return false
  const canLogIn = (l.privs ?? []).includes('CREATE SESSION') || u.roles.includes('CONNECT')
  const g = u.grants ?? {}
  const exact = Object.keys(g).every((tk) => (tk === EVENTS ? g[tk].every((p) => ['SELECT', 'INSERT'].includes(p)) : tk === SHIPMENTS ? g[tk].every((p) => ['SELECT', 'UPDATE'].includes(p)) : false))
  return canLogIn && has(g[EVENTS], ['SELECT', 'INSERT']) && has(g[SHIPMENTS], ['SELECT', 'UPDATE']) && exact && u.roles.every((r) => r === 'CONNECT') && (l.privs ?? []).every((p) => p === 'CREATE SESSION')
}
const configOk = (s) => {
  const x = a(s)
  const l = loginOf(s)
  if (!x || !l) return false
  const p = x.props
  const u = urlOf(p['db.url'])
  const pool = num(p['db.pool.max'])
  const timeout = num(p['db.queryTimeout'])
  return Boolean(u?.service) && u.host.toLowerCase() === HOST && u.port === '1521' && u.service.toUpperCase() === SERVICE && String(p['db.user'] ?? '').toUpperCase() === USER && pool >= 2 && pool <= 10 && timeout >= 1 && timeout <= 30 && x.secrets?.['db.password'] === l.password && !('db.password' in p)
}
const poolOpen = (s) => (srv(s) ? poolsOf(srv(s)) : []).some((p) => p.app === NAME && p.open > 0 && String(p.cfg?.user).toUpperCase() === USER)

const lab = {
  id: 'p-setup-oracle',
  group: 'Databases and queues',
  title: 'Set up the Oracle integration for carrier tracking events',
  minutes: 30,
  scenario: `Brightmart logistics wants the tracking events of its carriers in Oracle, so the shipment pages show where a parcel is. ${NAME} takes each event and writes it into ${EVENTS} and updates the status in ${SHIPMENTS}. The DBA team created the table in the pluggable database ${SERVICE} on ${HOST} and gave you the DBA account for the setup. The app is built and its jar waits in Runtime Manager. Done means: the app logs in as its own user with only the grants it needs, a test event is stored, an event for an unknown shipment is refused, and logistics IT gets an alert on errors. The Inbox has the request.`,
  start() {
    let s = newPlatform({
      clock: at(1, 13),
      jars: [NAME],
      databases: { created: at(1, 8), servers: { [DB]: newOracle(DB) } },
      mail: [
        {
          t: at(1, 12, 30),
          to: OPS,
          subject: 'Carrier tracking events into Oracle: please set up',
          body: `Hello, please set up ${NAME} (the jar is in Runtime Manager).\n\nOracle 19c on ${HOST}, listener port 1521. The tables are in the pluggable database: service name ${SERVICE}. The old batch jobs still use the SID BRIGHTMARTCDB of the container database; do not copy that.\nUser: ${USER}, profile APP_USERS. The app inserts and reads ${EVENTS} and reads and updates the STATUS of ${SHIPMENTS}. Nothing else.\nThe carriers send about 300 events a minute at peak. Each transaction takes about 10 ms. The app runs on 1 replica. Query timeout 5 seconds.\nAlerts on errors to ${TEAM}.\n\nThanks, Brightmart logistics`,
          source: 'Brightmart logistics',
        },
      ],
    })
    // the DBA team made the table before the request (the change ticket of last week)
    s = runSql(s, DB, `CREATE TABLE ${EVENTS} (EVENT_ID NUMBER(12) PRIMARY KEY, SHIPMENT_ID NUMBER(12) NOT NULL REFERENCES ${SHIPMENTS} (SHIPMENT_ID), STATUS VARCHAR2(16) NOT NULL, EVENT_AT TIMESTAMP WITH TIME ZONE, LOCATION VARCHAR2(80))`).state
    return s
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the service name, the user, the two tables and what the app does with each, the load and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the user',
      how: `Databases from the console menu, connection ${DB}, SQL Worksheet. Type CREATE USER ${USER} IDENTIFIED BY "${PASSWORD}" PROFILE APP_USERS; and Run Script. Quote a password with dashes, or Oracle answers ORA-00922. In Oracle a user is also a schema, and a new user can do nothing yet, not even log in.`,
      done: (s) => Boolean(loginOf(s) && userOf(s)),
    },
    {
      title: 'Grant the session and the two tables, nothing more',
      how: `Run\nGRANT CREATE SESSION TO ${USER};\nGRANT SELECT, INSERT ON ${EVENTS} TO ${USER};\nGRANT SELECT, UPDATE ON ${SHIPMENTS} TO ${USER};\nNot DBA, not BRIGHTMART_RW, not an ANY TABLE privilege. Without CREATE SESSION the app gets ORA-01045. The Users tab, or SELECT * FROM DBA_TAB_PRIVS WHERE GRANTEE = '${USER}', shows the grants. REVOKE takes back what is too much.`,
      done: leastOk,
    },
    ask(
      'Service name or SID',
      `The old jobs connect with jdbc:oracle:thin:@${HOST}:1521:BRIGHTMARTCDB. Why should the new app use ${URL}?`,
      [
        'They are the same, the colon form is only older',
        `A SID names one instance. The tables live in the pluggable database ${SERVICE}, which the listener knows as a service, not as a SID. With the SID BRIGHTMARTCDB the session lands in the root container, where ${USER} does not exist (ORA-01017), and another SID gets ORA-12505. A service name also survives a move to RAC or a standby`,
        'The SID form does not support passwords',
        'The service form is faster',
      ],
      1,
      `//host:port/service asks the listener for a service. host:port:SID asks for an instance. Since Oracle 12c the data sits in pluggable databases that are reached by service only. In the Mule Database connector the Oracle connection has a serviceName field, or the URL of a generic connection carries it. ORA-12514 means the service name is wrong, ORA-12505 the SID.`,
    ),
    {
      title: 'Set the connection with the service name and protect the password',
      how: `Runtime Manager, Deploy application. Name ${NAME}, Application File ${JAR}. Properties: db.url=${URL}, db.user=${USER}, db.pool.max=5, db.queryTimeout=5. Add db.password with the password of the user and choose Protect.`,
      done: configOk,
    },
    {
      title: 'Deploy and read the startup logs',
      how: `Deploy. When ${NAME} shows Running, open Runtime Manager, Applications, ${NAME}, Logs and read the start of the app.`,
      done: (s) => running(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'Test the connection and see the session',
      how: `Lab tools, API client. Application ${NAME}, GET /health. It answers 200 when the SELECT runs as ${USER}. Then Databases, ${DB}, Sessions: the session of ${USER} from JDBC Thin Client, and under Connections by application its pool. A 503 names the cause: ORA-01017 user or password, ORA-01045 no CREATE SESSION, ORA-12514 or ORA-12505 the URL, ORA-01031 a missing grant.`,
      done: (s) => called(s, NAME, 200, 'GET', /^\/health/) && Boolean(s.seen[`db-activity:${DB}`]) && poolOpen(s),
    },
    {
      title: 'Send a test event and find it in the table',
      how: `API client: POST /tracking-events with the body ${EVENT}. It answers 201. Then in the worksheet SELECT * FROM ${EVENTS} WHERE SHIPMENT_ID = 500103; shows the event, and ${SHIPMENTS} shows STATUS PICKED_UP for 500103.`,
      done: (s) => {
        const first = (store(s).created ?? [])[0]
        return called(s, NAME, 201, 'POST', /^\/tracking-events$/) && Boolean(first) && rowsOf(s, EVENTS).some((r) => r.EVENT_ID === first.id) && rowsOf(s, SHIPMENTS).some((r) => r.SHIPMENT_ID === first.ship && r.STATUS === first.status) && (s.seen[`db-select:${DB}:${EVENTS}`] ?? -1) >= first.t
      },
    },
    {
      title: 'Send an event for an unknown shipment',
      how: `POST /tracking-events with ${UNKNOWN}. Shipment 599999 does not exist, so the insert fails on the foreign key with ORA-02291. The transaction is rolled back, nothing is half written, and the app answers 422 so the carrier knows. The logs keep the body for the carrier desk.`,
      done: (s) => called(s, NAME, 422, 'POST', /^\/tracking-events$/) && (store(s).rejected ?? []).length > 0 && !rowsOf(s, EVENTS).some((r) => r.SHIPMENT_ID === 599999),
    },
    ask(
      'Size the pool',
      'At peak 300 events a minute arrive and each transaction holds a connection for about 10 ms. What pool size fits?',
      [
        '300, one connection per event of a minute',
        'About 5. Busy connections are the rate times the time: 5 events a second times 0.01 s is 0.05 connections. A few spare cover bursts. Each connection is a session on the server, and pool size times replicas must stay within what the DBA allows for the user',
        '1, because the load is low',
        '100, so the pool never runs out',
      ],
      1,
      'Little\'s law: connections in use = arrival rate x time held. A pool of 5 per replica leaves room for bursts and slow moments. A huge pool moves the queue into the database, where hundreds of sessions compete for CPU and locks. One connection makes every burst wait. With maxWait set, a full pool gives DB:CONNECTIVITY after that wait instead of hanging.',
    ),
    {
      title: 'Alert logistics IT on errors',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0, with ${TEAM} as recipient.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.resource === 'Application' && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
  ],
  why: `The setup checklist for Oracle: create a user for the app with a profile, grant CREATE SESSION so it can log in, and grant object privileges on the exact tables it uses, never DBA or an ANY privilege. Connect to the pluggable database by its service name, //host:port/service, not by the SID of the container. Size the pool from rate times time held, set a queryTimeout, and keep the password protected. Deploy, read the startup logs, test the connection and see the session on the server. Send a real event and read it back, send a bad one and see it refused by the constraint and rolled back, and alert on errors. In the lab the worksheet runs as the DBA account, and the app uses a generic connection whose URL is a property.`,
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-connect',
  solve(start) {
    let s = mark(start, 'inbox')
    s = runSql(s, DB, `CREATE USER ${USER} IDENTIFIED BY "${PASSWORD}" PROFILE APP_USERS;`).state
    s = runSql(s, DB, `GRANT CREATE SESSION TO ${USER};\nGRANT SELECT, INSERT ON ${EVENTS} TO ${USER};\nGRANT SELECT, UPDATE ON ${SHIPMENTS} TO ${USER};`).state
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: JAR, replicas: 1, vCores: 0.1, props: { 'db.url': URL, 'db.user': USER, 'db.pool.max': '5', 'db.queryTimeout': '5' }, secrets: { 'db.password': PASSWORD } }).state)
    s = mark(s, `logs:${NAME}`)
    s = call(s, NAME, null, '/health', 'GET').state
    s = mark(s, `db-activity:${DB}`)
    s = call(s, NAME, null, '/tracking-events', 'POST', EVENT).state
    s = runSql(s, DB, `SELECT * FROM ${EVENTS} WHERE SHIPMENT_ID = 500103;`).state
    s = call(s, NAME, null, '/tracking-events', 'POST', UNKNOWN).state
    return addMonAlert(s, { title: 'Carrier event errors', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
  },
  answers: { 3: 1, 9: 1 },
}

export const LABS = [lab]
