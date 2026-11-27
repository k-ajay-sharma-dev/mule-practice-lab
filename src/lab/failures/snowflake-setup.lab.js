// The guided lab snowflake-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, callApi, deployApp, finishDeploys, mark, newPlatform, runNow } from '../platform.js'
import { app, ask, called, OPS } from '../platform-kit.js'
import { ADMIN_ROLES, ADMIN_USER, countOf, formatAt, harborOrders, newSnowflake, publicKeyOf, runWorksheet, script, stageAt } from '../platform-snowflake.js'
import { HEADER, STOCK_APP, STOCK_FLOW, STOCK_JAR } from './snowflake-setup.pkg.js'

const WH = 'STOCK_WH'
const ROLE = 'STOCK_LOADER'
const USER = 'MULE_STOCK_SVC'
const DB = 'HARBOR_DW'
const SC = 'SUPPLY'
const TABLE = `${DB}.${SC}.STOCK_LEVELS`
const STAGE = `${DB}.${SC}.STOCK_STAGE`
const FORMAT = `${DB}.${SC}.CSV_STOCK`
const PRIVATE_KEY = 'lab-only-private-key-stock-loader'
const PUBLIC_KEY = publicKeyOf(PRIVATE_KEY)
const RECIPIENT = 'supply-data@harbor.example'
const BAD = `${HEADER}\nH-1250,DC-NORTH,40,2026-11-03 10:00:00\nH-1300,DC-NORTH,twelve,2026-11-03 10:00:00\nH-2000,DC-SOUTH,7,2026-11-03 10:00:00`

const y = (s) => s.snowflake
const w = (s) => y(s)?.warehouses?.[WH]
const props = (s) => app(s, STOCK_APP)?.props ?? {}
const secrets = (s) => app(s, STOCK_APP)?.secrets ?? {}
const word = (v) => String(v ?? '').trim().toUpperCase()

const whOk = (s) => Boolean(w(s) && w(s).size === 'XSMALL' && w(s).autoSuspend > 0 && w(s).autoSuspend <= 120 && w(s).autoResume)
const stageOk = (s) => {
  const f = formatAt(y(s), FORMAT)
  const st = stageAt(y(s), STAGE)
  return Boolean(f && f.type === 'CSV' && f.skipHeader === 1 && st && !st.url && st.format === FORMAT)
}
// the grants the loader needs, and the only ones it may have
const NEEDED = [
  ['USAGE', 'WAREHOUSE', WH],
  ['USAGE', 'DATABASE', DB],
  ['USAGE', 'SCHEMA', `${DB}.${SC}`],
  ['SELECT', 'TABLE', TABLE],
  ['INSERT', 'TABLE', TABLE],
  ['READ', 'STAGE', STAGE],
  ['WRITE', 'STAGE', STAGE],
  ['USAGE', 'FILE FORMAT', FORMAT],
]
const ALLOWED = [...NEEDED, ['OPERATE', 'WAREHOUSE', WH], ['MONITOR', 'WAREHOUSE', WH]]
const roleOk = (s) => {
  const r = y(s)?.roles?.[ROLE]
  if (!r) return false
  const is = (g, [p, k, n]) => g.priv === p && g.kind === k && g.name === n
  return NEEDED.every((x) => r.grants.some((g) => is(g, x))) && r.grants.every((g) => ALLOWED.some((x) => is(g, x))) && r.roles.length === 0
}
const userOk = (s) => {
  const u = y(s)?.users?.[USER]
  return Boolean(u && u.type === 'SERVICE' && !u.password && u.rsa === PUBLIC_KEY && u.roles.includes(ROLE) && !u.roles.some((r) => ADMIN_ROLES.includes(r)) && u.defaultRole === ROLE && u.defaultWarehouse === WH)
}
const deployedOk = (s) => {
  const p = props(s)
  return (
    app(s, STOCK_APP)?.status === 'Running' &&
    word(p['snowflake.account']).replace(/\.SNOWFLAKECOMPUTING\.COM$/, '') === 'HARBOR-DW' &&
    word(p['snowflake.user']) === USER &&
    word(p['snowflake.role']) === ROLE &&
    word(p['snowflake.warehouse']) === WH &&
    word(p['snowflake.database']) === DB &&
    word(p['snowflake.schema']) === SC &&
    word(p['snowflake.stage']).replace(/^@/, '').split('.').pop() === 'STOCK_STAGE' &&
    String(secrets(s)['snowflake.privateKey'] ?? '').trim() === PRIVATE_KEY &&
    p['snowflake.privateKey'] === undefined
  )
}
const firstLoad = (s) => (y(s)?.copies ?? []).find((c) => c.table === TABLE && c.user === USER && c.loaded > 0)

function account() {
  const x = harborOrders(newSnowflake(at(0)), at(0))
  script(x, `CREATE SCHEMA ${DB}.${SC}; CREATE TABLE ${TABLE} (SKU VARCHAR(20), WAREHOUSE_CODE VARCHAR(10), QTY NUMBER(10,0), SNAPSHOT_AT TIMESTAMP_NTZ);`, at(0, 15))
  x.ws = { role: 'ACCOUNTADMIN', wh: 'COMPUTE_WH', db: DB, schema: SC, text: '' }
  return x
}

const lab = {
  id: 'p-snowflake-setup',
  group: 'Data and cloud',
  title: 'Set up the Snowflake load of the WMS stock snapshots',
  minutes: 40,
  scenario: `Harbor supply chain wants the stock of its two distribution centres in Snowflake every 15 minutes, for the replenishment dashboards. The app ${STOCK_APP} is built: it PUTs a CSV snapshot to an internal stage and runs COPY INTO ${TABLE}. The data team created the table; nothing else exists for this load, and the jar is in Runtime Manager. Set up Snowflake with the smallest rights, deploy the app with its key kept secret, prove the data arrives with counts, show that a bad file is handled, and add an alert.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      jars: [{ pkg: STOCK_APP, jar: STOCK_JAR }],
      snowflake: account(),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Snowflake setup for the WMS stock loader',
          body: `Hello. Please set up Snowflake account HARBOR-DW (harbor-dw.snowflakecomputing.com) for ${STOCK_APP}:\n1. Warehouse ${WH}, X-Small, auto suspend after 60 seconds, auto resume on.\n2. File format ${FORMAT}: CSV with 1 header line to skip.\n3. Internal stage ${STAGE} that uses that format.\n4. Role ${ROLE} with only what the loader needs on ${WH}, ${DB}, ${SC}, STOCK_LEVELS, the stage and the format. Not SYSADMIN, and not the LOADER role of the orders load.\n5. Service user ${USER}, key pair only, default role ${ROLE}, default warehouse ${WH}. Its public key: ${PUBLIC_KEY}\n6. The private key, from the vault ticket: ${PRIVATE_KEY} (lab value). It goes into the app as a protected property, nowhere else.\nAlerts on load errors go to ${RECIPIENT}. Harbor data platform team`,
          source: 'Harbor data platform team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. The mail has every name, the public key and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Create the warehouse ${WH}`,
      how: `Snowflake from the console menu, Admin, Warehouses, + Warehouse: name ${WH}, size X-Small, Auto suspend 1 minute, Auto resume ticked, Create Warehouse. Or in a Worksheet: CREATE WAREHOUSE ${WH} WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;`,
      done: whOk,
    },
    {
      title: 'Create the file format and the stage',
      how: `Snowflake, Worksheets: CREATE FILE FORMAT ${FORMAT} TYPE = CSV SKIP_HEADER = 1; then CREATE STAGE ${STAGE} FILE_FORMAT = (FORMAT_NAME = '${FORMAT}'); A stage without URL is an internal stage. Databases, ${DB}, ${SC} shows both.`,
      done: stageOk,
    },
    {
      title: `Create the role ${ROLE} with the least grants`,
      how: `In the worksheet: CREATE ROLE ${ROLE}; then GRANT USAGE ON WAREHOUSE ${WH}, USAGE ON DATABASE ${DB}, USAGE ON SCHEMA ${DB}.${SC}, SELECT, INSERT ON TABLE ${TABLE}, READ, WRITE ON STAGE ${STAGE} and USAGE ON FILE FORMAT ${FORMAT}, each TO ROLE ${ROLE}. Admin, Users & Roles, Roles lists the grants. Nothing more: no ALL, no other tables.`,
      done: roleOk,
    },
    ask(
      'The smallest rights',
      `Why a new role ${ROLE} with these eight grants, and not SYSADMIN or the existing LOADER?`,
      [
        'SYSADMIN is fine for a service user, because nobody logs on with it',
        'The app only PUTs to one stage and INSERTs into one table. A leaked key with SYSADMIN could read and drop every table; LOADER would also open the orders tables. Each integration gets its own role: USAGE on the warehouse, database and schema, READ and WRITE on the internal stage, USAGE on the format, SELECT and INSERT on the table',
        'A new role is needed because roles cannot be shared between users',
        'LOADER cannot use a second warehouse',
      ],
      1,
      'Least privilege in Snowflake is a role per job. Without USAGE on the database and schema the table is invisible: Object does not exist or not authorized. PUT to an internal stage needs WRITE (READ for COPY), an external stage needs USAGE. COPY needs INSERT, and SELECT is for the health check. No UPDATE, DELETE, TRUNCATE or OWNERSHIP, and no admin role granted to the user.',
    ),
    {
      title: `Create the key pair user ${USER}`,
      how: `In the worksheet: CREATE USER ${USER} TYPE = SERVICE DEFAULT_ROLE = ${ROLE} DEFAULT_WAREHOUSE = ${WH} RSA_PUBLIC_KEY = 'the public key from the mail'; then GRANT ROLE ${ROLE} TO USER ${USER}; TYPE = SERVICE takes no password, so only the key can log on. Admin, Users & Roles shows Key pair under Authentication.`,
      done: userOk,
    },
    {
      title: 'Deploy the app with the private key protected',
      how: `Runtime Manager, Deploy application, name ${STOCK_APP}, file ${STOCK_JAR}. Properties: snowflake.account harbor-dw, snowflake.user ${USER}, snowflake.role ${ROLE}, snowflake.warehouse ${WH}, snowflake.database ${DB}, snowflake.schema ${SC}, snowflake.stage STOCK_STAGE. Add snowflake.privateKey with the private key from the mail and select Protect. Deploy and read the logs.`,
      done: deployedOk,
    },
    {
      title: 'Test the connection',
      how: `API client from the console menu, application ${STOCK_APP}, GET /health. It answers 200 with the user, role and warehouse of the session. Snowflake, Admin, Users & Roles shows the Last login of ${USER}; a 503 here has the Snowflake error, such as 390144 JWT token is invalid for a wrong key.`,
      done: (s) => deployedOk(s) && called(s, STOCK_APP, 200, 'GET', /^\/health/) && Boolean(y(s)?.users?.[USER]?.lastLogin),
    },
    {
      title: 'Load a snapshot and check the counts',
      how: `Runtime Manager, ${STOCK_APP}, Schedules: tick ${STOCK_FLOW} and Run, or wait 15 minutes. Snowflake, Copy History shows the file Loaded with 12 rows. Then in the worksheet: SELECT COUNT(*) FROM ${TABLE}; and compare it with the rows loaded.`,
      done: (s) => {
        const c = firstLoad(s)
        return Boolean(c) && countOf(y(s), TABLE) >= c.loaded && (y(s).queries ?? []).some((q) => q.ok && q.user === ADMIN_USER && /COUNT/i.test(q.sql) && /STOCK_LEVELS/i.test(q.sql) && q.t >= c.t && Number(q.first) >= c.loaded)
      },
    },
    {
      title: 'Send a bad file and see it handled',
      how: `API client, ${STOCK_APP}, POST /stock/upload with a CSV body: the header line ${HEADER}, then H-1250,DC-NORTH,40,2026-11-03 10:00:00 and H-1300,DC-NORTH,twelve,2026-11-03 10:00:00 and H-2000,DC-SOUTH,7,2026-11-03 10:00:00 on lines of their own. It answers 422: 2 rows loaded, 1 rejected, Numeric value 'twelve' is not recognized. Copy History shows the file Partially loaded; the bad row is kept for VALIDATE, not lost.`,
      done: (s) => called(s, STOCK_APP, 422, 'POST', /^\/stock\/upload/) && (y(s)?.copies ?? []).some((c) => c.table === TABLE && c.user === USER && c.status === 'Partially loaded'),
    },
    {
      title: 'Alert on load errors',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${STOCK_APP}. Metric Message Error Count, Above 0 for each of the last 1 consecutive minutes, recipient ${RECIPIENT}. A rejected row fails the run or answers 422, so it reaches a person.`,
      done: (s) => s.monAlerts.some((a) => a.enabled && a.name_ === STOCK_APP && a.resource === 'Application' && a.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(a.operator) && Number(a.threshold) <= 1 && String(a.recipients ?? '').includes(RECIPIENT)),
    },
  ],
  why: `A Snowflake integration in an interview checklist: a warehouse for the load with a short AUTO_SUSPEND and AUTO_RESUME, so it costs only while it works; a file format and a stage; a role per integration with only USAGE on the warehouse, database and schema, the stage rights (READ and WRITE internal, USAGE external), USAGE on the format and the table rights the statements need; a TYPE = SERVICE user with an RSA public key and no password; the private key in a protected property or a vault, never in the project. Deploy with properties that match, prove the session with a health query, load real data and compare COPY's rows loaded with a COUNT, send a bad file and see it PARTIALLY_LOADED with the rejected row kept, and alert on errors. In the lab the private key is a plain lab string and its public key is derived from it.`,
  docs: 'https://docs.mulesoft.com/snowflake-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    const sql = (q) => (s = runWorksheet(s, q).state)
    sql(`CREATE WAREHOUSE ${WH} WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE`)
    sql(`CREATE FILE FORMAT ${FORMAT} TYPE = CSV SKIP_HEADER = 1; CREATE STAGE ${STAGE} FILE_FORMAT = (FORMAT_NAME = '${FORMAT}')`)
    sql(`CREATE ROLE ${ROLE}; GRANT USAGE ON WAREHOUSE ${WH} TO ROLE ${ROLE}; GRANT USAGE ON DATABASE ${DB} TO ROLE ${ROLE}; GRANT USAGE ON SCHEMA ${DB}.${SC} TO ROLE ${ROLE};
      GRANT SELECT, INSERT ON TABLE ${TABLE} TO ROLE ${ROLE}; GRANT READ, WRITE ON STAGE ${STAGE} TO ROLE ${ROLE}; GRANT USAGE ON FILE FORMAT ${FORMAT} TO ROLE ${ROLE}`)
    sql(`CREATE USER ${USER} TYPE = SERVICE DEFAULT_ROLE = ${ROLE} DEFAULT_WAREHOUSE = ${WH} RSA_PUBLIC_KEY = '${PUBLIC_KEY}'; GRANT ROLE ${ROLE} TO USER ${USER}`)
    const form = {
      name: STOCK_APP,
      pkg: STOCK_APP,
      jar: STOCK_JAR,
      replicas: 1,
      vCores: 0.1,
      props: { 'snowflake.account': 'harbor-dw', 'snowflake.user': USER, 'snowflake.role': ROLE, 'snowflake.warehouse': WH, 'snowflake.database': DB, 'snowflake.schema': SC, 'snowflake.stage': 'STOCK_STAGE' },
      secrets: { 'snowflake.privateKey': PRIVATE_KEY },
    }
    s = finishDeploys(deployApp(s, form).state)
    s = mark(s, `logs:${STOCK_APP}`)
    s = callApi(s, { env: 'Sandbox', app: STOCK_APP, method: 'GET', path: '/health' }).state
    s = runNow(s, STOCK_APP, STOCK_FLOW)
    sql(`SELECT COUNT(*) FROM ${TABLE}`)
    s = callApi(s, { env: 'Sandbox', app: STOCK_APP, method: 'POST', path: '/stock/upload', body: BAD }).state
    return addMonAlert(s, { title: 'Stock load errors', resource: 'Application', name_: STOCK_APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: RECIPIENT })
  },
  answers: { 4: 1 },
}

export const LABS = [lab]
