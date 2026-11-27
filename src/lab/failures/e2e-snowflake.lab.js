// The end to end lab of Snowflake. See platform-labs.js for the shape of a lab.
// The daily sales of the order database go to Snowflake: design, build, SQL Server and Snowflake setup, API Manager,
// deployment, one order traced from SQL Server to DAILY_SALES, a rejected row fixed and loaded again, an alert and
// Production, which in the lab has its own order database and its own Snowflake database.
import {
  addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createProject, deployApp, finishDeploys, importSpec, mark, MINUTE, mockCall, newPlatform, packageJar, pairing, promoteApi, publish, ramlErrors,
  requestAccess, runNow, saveProject, setStudio,
} from '../platform.js'
import { ask, OPS } from '../platform-kit.js'
import { newSqlServer, runSql, tablesOf } from '../platform-db.js'
import { ADMIN_ROLES, ADMIN_USER, brightmartOrders, newSnowflake, publicKeyOf, rowsOf, runWorksheet, script, tableAt } from '../platform-snowflake.js'
import { SF_FLOW, SF_PKG } from './e2e-snowflake.pkg.js'

const ASSET = 'sales-load-api'
const DB = 'BRIGHTMART_DW'
const SC = 'SALES'
const WH = 'SALES_WH'
const ROLE = 'SALES_LOADER'
const USER = 'MULE_SALES_SVC'
const STG = `${DB}.${SC}.SALES_STG`
const TABLE = `${DB}.${SC}.DAILY_SALES`
const STAGE = `${DB}.${SC}.SALES_STAGE`
const FORMAT = `${DB}.${SC}.CSV_SALES`
const KEY = 'lab-only-private-key-sales-loader'
const SRC = 'brightmart-sql'
const SRC_PRD = 'brightmart-sql-prd'
const DB_USER = 'mule_sales_etl'
const DB_PASSWORD = 'Sales-Etl-Lab-2026'
const DATE = '2026-11-02'
const CALLER = { name: 'Data Ops Console', clientId: 'dataops-6b20e1', clientSecret: 'dataops-secret-81' }
const ALERT_TO = 'data-platform@brightmart.example'
const PRD = { db: 'BRIGHTMART_PRD', wh: 'SALES_PRD_WH', role: 'SALES_LOADER_PRD', user: 'MULE_SALES_PRD', key: 'lab-only-private-key-sales-prd', dbHost: 'sql-prd.brightmart.lab', dbPassword: 'Sales-Etl-Prd-5521' }
const TEST_ORDER = `INSERT INTO dbo.orders (order_id, customer_id, status, total, created_at, shipped_at) VALUES ('O-1008', 'C-103', 'PAID', 96.40, '2026-11-02 21:15:00', NULL)`

const RAML = `#%RAML 1.0
title: Sales Load API
version: v1
mediaType: application/json
types:
  Load:
    properties:
      date: date-only
      source: integer
      loaded: integer
      rejected: integer
      inserted: integer
      updated: integer
      status: string
/loads:
  post:
    description: Load one business date again. MERGE makes a repeat safe.
    body:
      example: |
        { "date": "2026-11-02" }
    responses:
      200:
        body:
          type: Load
          example: |
            { "date": "2026-11-02", "source": 6, "loaded": 6, "rejected": 0, "inserted": 0, "updated": 6, "status": "COMPLETE" }
  /{date}:
    get:
      description: The last load of a business date
      responses:
        200:
          body:
            type: Load
            example: |
              { "date": "2026-11-02", "source": 6, "loaded": 6, "rejected": 0, "inserted": 6, "updated": 0, "status": "COMPLETE" }
`
const FLOW_CODE = `<!-- Global elements: connection values are properties, secrets are secure properties -->
<db:config name="Orders_Database_Config">
  <db:mssql-connection host="\${db.host}" port="1433" databaseName="\${db.database}"
                       user="\${db.user}" password="\${secure::db.password}"/>
</db:config>
<snowflake:snowflake-config name="Snowflake_Config">
  <!-- key pair authentication: no password for the service user -->
  <snowflake:snowflake-keypair-connection accountName="\${snowflake.account}" user="\${snowflake.user}"
      privateKey="\${secure::snowflake.privateKey}" role="\${snowflake.role}" warehouse="\${snowflake.warehouse}"
      database="\${snowflake.database}" schema="\${snowflake.schema}"/>
</snowflake:snowflake-config>

<flow name="${SF_FLOW}">
  <scheduler><scheduling-strategy><cron expression="0 30 2 * * ?" timeZone="UTC"/></scheduling-strategy></scheduler>
  <set-variable variableName="date" value="#[(now() - |P1D|) as Date]"/>
  <db:select config-ref="Orders_Database_Config">
    <db:sql>SELECT order_id, customer_id, status, total, created_at FROM dbo.orders
            WHERE created_at &gt;= :from AND created_at &lt; :to</db:sql>
    <db:input-parameters>#[{ from: vars.date as DateTime, to: (vars.date + |P1D|) as DateTime }]</db:input-parameters>
  </db:select>
  <ee:transform doc:name="Orders to CSV">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/csv header=true
---
payload map {
  ORDER_ID:      $.order_id,
  CUSTOMER_ID:   $.customer_id,
  STATUS:        $.status,
  TOTAL:         $.total as String { format: "0.00" },
  ORDER_TS:      $.created_at as String { format: "yyyy-MM-dd HH:mm:ss" },
  BUSINESS_DATE: vars.date
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <!-- one file per run: the name holds the date and the run time, so COPY never skips a new extract -->
  <snowflake:execute-script config-ref="Snowflake_Config"><![CDATA[
    TRUNCATE TABLE SALES_STG;
    PUT file:///tmp/#[vars.file] @\${snowflake.stage};
    COPY INTO SALES_STG FROM @\${snowflake.stage} FILES = ('#[vars.file].gz') ON_ERROR = CONTINUE;
    MERGE INTO DAILY_SALES t USING SALES_STG s ON t.ORDER_ID = s.ORDER_ID
      WHEN MATCHED THEN UPDATE SET STATUS = s.STATUS, TOTAL = s.TOTAL, LOADED_AT = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (ORDER_ID, CUSTOMER_ID, STATUS, TOTAL, ORDER_TS, BUSINESS_DATE, LOADED_AT)
        VALUES (s.ORDER_ID, s.CUSTOMER_ID, s.STATUS, s.TOTAL, s.ORDER_TS, s.BUSINESS_DATE, CURRENT_TIMESTAMP());
  ]]></snowflake:execute-script>
</flow>`

const y = (s) => s.snowflake
const word = (v) => String(v ?? '').trim()
const up = (v) => word(v).toUpperCase()
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.env === env && a.pkg === SF_PKG && a.status !== 'Stopped')
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const resourcesOk = (raml) => ramlErrors(raml ?? '').length === 0 && mockCall(raml, 'POST', '/loads').status < 300 && mockCall(raml, 'GET', `/loads/${DATE}`).status < 300
const designed = (s) => s.projects.some((p) => /sales/i.test(p.name) && resourcesOk(p.raml))
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === SF_PKG)
const props = (a) => ({ ...a?.props, ...a?.secrets })
const srcOrders = (s, name = SRC) => (s.databases?.servers?.[name] ? tablesOf(s.databases.servers[name])['dbo.orders'].rows : [])
const ofDate = (rows, col) => rows.filter((r) => String(r[col] ?? '').startsWith(DATE))
const dw = (s, fq = TABLE) => rowsOf(y(s), fq)
const dwOrder = (s, id, fq = TABLE) => dw(s, fq).find((r) => r.ORDER_ID === id)

const srcLoginOk = (s) => {
  const x = s.databases?.servers?.[SRC]
  const login = x?.logins?.find((l) => l.name.toLowerCase() === DB_USER)
  const user = x?.users?.find((u) => u.login.toLowerCase() === DB_USER)
  const g = user?.grants ?? {}
  return Boolean(login && !login.disabled && user && user.roles.length === 0 && Object.keys(g).length === 1 && g['dbo.orders']?.length === 1 && g['dbo.orders'][0] === 'SELECT')
}
const NEEDED = [
  ['USAGE', 'WAREHOUSE', WH],
  ['USAGE', 'DATABASE', DB],
  ['USAGE', 'SCHEMA', `${DB}.${SC}`],
  ['READ', 'STAGE', STAGE],
  ['WRITE', 'STAGE', STAGE],
  ['USAGE', 'FILE FORMAT', FORMAT],
  ['SELECT', 'TABLE', STG],
  ['INSERT', 'TABLE', STG],
  ['TRUNCATE', 'TABLE', STG],
  ['SELECT', 'TABLE', TABLE],
  ['INSERT', 'TABLE', TABLE],
  ['UPDATE', 'TABLE', TABLE],
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
  return Boolean(roleOk(s) && u && u.type === 'SERVICE' && !u.password && u.rsa === publicKeyOf(KEY) && u.roles.includes(ROLE) && !u.roles.some((r) => ADMIN_ROLES.includes(r)) && u.defaultRole === ROLE && u.defaultWarehouse === WH)
}
const apiOk = (s) => {
  const api = apiOf(s)
  return Boolean(api && api.policies.some((p) => p.type === 'client-id') && api.contracts.some((c) => c.client === CALLER.name && c.status === 'approved') && s.seen['env:Sandbox'])
}
const sfPropsOk = (p, { user, role, wh, db, key }) =>
  up(p['snowflake.account']).replace(/\.SNOWFLAKECOMPUTING\.COM$/, '') === 'BRIGHTMART-DW' && up(p['snowflake.user']) === user && up(p['snowflake.role']) === role && up(p['snowflake.warehouse']) === wh && up(p['snowflake.database']) === db && up(p['snowflake.schema']) === SC && up(p['snowflake.stage']).replace(/^@/, '').split('.').pop() === 'SALES_STAGE' && word(p['snowflake.privateKey']) === key
const deployedOk = (s) => {
  const a = appOf(s)
  if (a?.status !== 'Running' || !srcLoginOk(s) || !userOk(s)) return false
  const p = props(a)
  return (
    sfPropsOk(p, { user: USER, role: ROLE, wh: WH, db: DB, key: KEY }) && a.props['snowflake.privateKey'] === undefined &&
    word(p['db.host']) === 'sql.brightmart.lab' && word(p['db.database']) === 'BrightmartOrders' && word(p['db.user']).toLowerCase() === DB_USER && a.secrets['db.password'] === s.databases.servers[SRC].logins.find((l) => l.name.toLowerCase() === DB_USER).password && a.props['db.password'] === undefined &&
    pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s)) === 'Active'
  )
}
const loadOf = (s) => appOf(s)?.store?.loads?.[DATE]
const sourceCount = (s) => ofDate(srcOrders(s), 'created_at').length
const dwCount = (s, fq = TABLE) => ofDate(dw(s, fq), 'BUSINESS_DATE').length
const loadedAt = (s) => (y(s)?.copies ?? []).find((c) => c.table === STG && c.user === USER && c.loaded > 0)?.t
const adminAsked = (s, re, since) => (y(s)?.queries ?? []).some((q) => q.ok && q.user === ADMIN_USER && re.test(q.sql) && q.t >= since)
const statusWide = (s) => [STG, TABLE].every((fq) => Number(String(tableAt(y(s), fq)?.cols.find((c) => c.name === 'STATUS')?.type ?? '').match(/\((\d+)\)/)?.[1] ?? 0) >= 18)

const MAIL = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'Daily sales into Snowflake',
  body: [
    'Hello integration team,',
    'Finance and the store managers want yesterday\'s sales in Snowflake every morning, for the dashboards at 07:00. The orders live in SQL Server BrightmartOrders on sql.brightmart.lab, table dbo.orders. About 3,000 orders a day. Please build:',
    `1. Every day at 02:30 UTC, the orders created on the day before go to ${TABLE}: ORDER_ID, CUSTOMER_ID, STATUS, TOTAL, ORDER_TS and the BUSINESS_DATE. Stage them through ${STAGE} (format ${FORMAT}) and ${STG}. A day loaded twice must not double anything.`,
    `2. We created the warehouse ${WH}, the tables, the stage and the format. Please create a role ${ROLE} with only what the load needs, and a service user ${USER} with key pair authentication, default role ${ROLE} and default warehouse ${WH}. Its public key: ${publicKeyOf(KEY)}. The private key from the vault ticket: ${KEY} (lab value).`,
    `3. A SQL Server login ${DB_USER} that may read dbo.orders and nothing else.`,
    `4. An API for our tool (client app ${CALLER.name}): GET /loads/{date} and POST /loads to load a date again. Only known client apps.`,
    '5. A row Snowflake cannot take must not vanish. We want to see it, fix it and load the day again.',
    `6. Load errors alert ${ALERT_TO}.`,
    `7. Production is ready: database ${PRD.db}, schema ${SC}, the same table and stage names, warehouse ${PRD.wh}, role ${PRD.role}, user ${PRD.user} with the private key ${PRD.key}. The source is ${PRD.dbHost}, login ${DB_USER} with the password ${PRD.dbPassword}. All lab values.`,
    'Brightmart data platform team',
  ].join('\n\n'),
  source: 'Brightmart data platform team',
}

const salesObjects = (db, wh) => `CREATE SCHEMA ${db}.${SC};
  CREATE WAREHOUSE ${wh} WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;
  CREATE TABLE ${db}.${SC}.SALES_STG (ORDER_ID VARCHAR(12), CUSTOMER_ID VARCHAR(12), STATUS VARCHAR(10), TOTAL NUMBER(12,2), ORDER_TS TIMESTAMP_NTZ, BUSINESS_DATE DATE);
  CREATE TABLE ${db}.${SC}.DAILY_SALES (ORDER_ID VARCHAR(12), CUSTOMER_ID VARCHAR(12), STATUS VARCHAR(10), TOTAL NUMBER(12,2), ORDER_TS TIMESTAMP_NTZ, BUSINESS_DATE DATE, LOADED_AT TIMESTAMP_NTZ);
  CREATE FILE FORMAT ${db}.${SC}.CSV_SALES TYPE = CSV SKIP_HEADER = 1;
  CREATE STAGE ${db}.${SC}.SALES_STAGE FILE_FORMAT = (FORMAT_NAME = '${db}.${SC}.CSV_SALES');`
function account() {
  const x = brightmartOrders(newSnowflake(at(0)), at(0))
  script(x, salesObjects(DB, WH), at(0, 15))
  // Production, in the same account: its own database, warehouse, role and user, made by the data platform team
  const P = `${PRD.db}.${SC}`
  script(
    x,
    `CREATE DATABASE ${PRD.db}; ${salesObjects(PRD.db, PRD.wh)}
    CREATE ROLE ${PRD.role}; GRANT USAGE ON WAREHOUSE ${PRD.wh} TO ROLE ${PRD.role}; GRANT USAGE ON DATABASE ${PRD.db} TO ROLE ${PRD.role}; GRANT USAGE ON SCHEMA ${P} TO ROLE ${PRD.role};
    GRANT READ, WRITE ON STAGE ${P}.SALES_STAGE TO ROLE ${PRD.role}; GRANT USAGE ON FILE FORMAT ${P}.CSV_SALES TO ROLE ${PRD.role};
    GRANT SELECT, INSERT, TRUNCATE ON TABLE ${P}.SALES_STG TO ROLE ${PRD.role}; GRANT SELECT, INSERT, UPDATE ON TABLE ${P}.DAILY_SALES TO ROLE ${PRD.role};
    ALTER TABLE ${P}.SALES_STG ALTER COLUMN STATUS SET DATA TYPE VARCHAR(20); ALTER TABLE ${P}.DAILY_SALES ALTER COLUMN STATUS SET DATA TYPE VARCHAR(20);
    CREATE USER ${PRD.user} TYPE = SERVICE DEFAULT_ROLE = ${PRD.role} DEFAULT_WAREHOUSE = ${PRD.wh} RSA_PUBLIC_KEY = '${publicKeyOf(PRD.key)}'; GRANT ROLE ${PRD.role} TO USER ${PRD.user};`,
    at(0, 16),
  )
  x.ws = { role: 'ACCOUNTADMIN', wh: 'COMPUTE_WH', db: DB, schema: SC, text: '' }
  return x
}
function databases() {
  let s = { clock: at(0, 12), seen: {}, apps: [], databases: { created: 0, servers: { [SRC]: newSqlServer(), [SRC_PRD]: newSqlServer(SRC_PRD, { host: PRD.dbHost }) } } }
  s = runSql(s, SRC_PRD, `CREATE LOGIN ${DB_USER} WITH PASSWORD = '${PRD.dbPassword}'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT ON dbo.orders TO ${DB_USER}`).state
  return s.databases
}

const lab = {
  id: 'p-e2e-snowflake',
  group: 'End to end by system',
  title: 'End to end: daily sales, SQL Server to Snowflake',
  minutes: 60,
  scenario: `Finance wants yesterday's sales in Snowflake every morning. You build it end to end: the Sales Load API in Design Center, the Mule app in Studio on that spec, a read only login in SQL Server, the role and the key pair user in Snowflake, API Manager, the deployment, one order traced from dbo.orders to ${TABLE}, a row Snowflake rejects that you fix and load again, an alert, and Production. The record path: dbo.orders, a SELECT for the business date, DataWeave to CSV, PUT to ${STAGE}, COPY INTO SALES_STG, MERGE INTO DAILY_SALES. The Inbox has the request.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      snowflake: account(),
      databases: databases(),
      studioPkgs: { [ASSET]: SF_PKG },
      clients: [CALLER],
      mail: [MAIL],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar. Note the source, the target tables, the schedule, the volume, the rule for a day loaded twice, the caller of the API, the alert recipient and the Production values.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Design the Sales Load API', how: 'Design Center, Create new, New API Specification, name Sales Load API. Write POST /loads and GET /loads/{date} with examples. You can use this RAML.', code: RAML, done: designed },
    { title: 'Try it in the mocking service', how: `In the Documentation panel turn on the mocking service, choose GET /loads/{date} with ${DATE}, Try it, Send.`, done: (s) => designed(s) && Boolean(s.seen.mock) },
    { title: 'Publish to Exchange', how: `Publish at the top right. Asset id ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => s.assets.some((a) => a.assetId === ASSET) },
    {
      title: 'Build the flow in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project carries the flows of the team: the cron scheduler, the Database select, the DataWeave mapping to CSV and the Snowflake script. Read the important part below.`,
      code: FLOW_CODE,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'A staging table and MERGE',
      'Why does the flow COPY into SALES_STG and MERGE into DAILY_SALES, instead of COPY straight into DAILY_SALES?',
      [
        'COPY cannot write to a table that has rows',
        'A day is loaded again after a fix or a late change. COPY only appends, so a second load would double every order. The staging table holds this run only, and MERGE on ORDER_ID updates the orders that are there and inserts the new ones, so any number of reloads ends in the same state',
        'MERGE is faster than COPY for 3,000 rows',
        'Snowflake does not allow COPY into a table that dashboards read',
      ],
      1,
      'COPY INTO is a bulk append. Idempotency comes from the key: stage the batch, then MERGE (or DELETE the date and INSERT) inside Snowflake. Truncate the staging table first, so it only ever holds this run. Note that TRUNCATE also clears the load metadata of the staging table, while DELETE keeps it.',
    ),
    {
      title: 'Add API Autodiscovery and export the jar',
      how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then choose Export.`,
      done: (s) => Boolean(project(s)?.autodiscovery?.apiId && project(s).autodiscovery.flowRef === `${ASSET}-main` && project(s).jar),
    },
    {
      title: 'Create the read only login in SQL Server',
      how: `Database console from the menu, Server ${SRC}, New Query: CREATE LOGIN ${DB_USER} WITH PASSWORD = 'a password of yours'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT ON dbo.orders TO ${DB_USER}; Execute. No db_datareader: it would read every table.`,
      done: srcLoginOk,
    },
    {
      title: `Create the role ${ROLE}`,
      how: `Snowflake from the console menu, Worksheets. CREATE ROLE ${ROLE}; then GRANT USAGE ON WAREHOUSE ${WH}, USAGE ON DATABASE ${DB}, USAGE ON SCHEMA ${DB}.${SC}, READ, WRITE ON STAGE ${STAGE}, USAGE ON FILE FORMAT ${FORMAT}, SELECT, INSERT, TRUNCATE ON TABLE ${STG} and SELECT, INSERT, UPDATE ON TABLE ${TABLE}, each TO ROLE ${ROLE}. Admin, Users & Roles lists the grants.`,
      done: roleOk,
    },
    {
      title: `Create the key pair user ${USER}`,
      how: `In the worksheet: CREATE USER ${USER} TYPE = SERVICE DEFAULT_ROLE = ${ROLE} DEFAULT_WAREHOUSE = ${WH} RSA_PUBLIC_KEY = 'the public key from the mail'; then GRANT ROLE ${ROLE} TO USER ${USER};`,
      done: userOk,
    },
    {
      title: 'Create the API instance and protect it',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), the API ${ASSET}, Save & Deploy. Policies, Add policy, Client ID Enforcement. Open Environment information. Then Exchange, Sales Load API, Request access: the Sandbox instance and the application ${CALLER.name}.`,
      done: apiOk,
    },
    {
      title: 'Deploy the app',
      how: `Runtime Manager, Deploy application, name ${SF_PKG}, the exported jar. Properties: db.host sql.brightmart.lab, db.database BrightmartOrders, db.user ${DB_USER}, snowflake.account brightmart-dw, snowflake.user ${USER}, snowflake.role ${ROLE}, snowflake.warehouse ${WH}, snowflake.database ${DB}, snowflake.schema ${SC}, snowflake.stage SALES_STAGE, api.id, anypoint.platform.client_id. Protect db.password, snowflake.privateKey and anypoint.platform.client_secret. The app is Running and the API Active.`,
      done: deployedOk,
    },
    {
      title: 'Put a test order in the source',
      how: `Database console, ${SRC}, New Query: ${TEST_ORDER}; Execute. The day ${DATE} now has ${6} orders in dbo.orders.`,
      done: (s) => srcOrders(s).some((r) => r.order_id === 'O-1008' && String(r.created_at).startsWith(DATE)),
    },
    {
      title: 'Load the day and follow the order',
      how: `Runtime Manager, ${SF_PKG}, Schedules, tick ${SF_FLOW}, Run: it loads the day before, ${DATE}. Logs: the lines of one correlationId show the orders read, the file, COPY and MERGE. Snowflake, Copy History shows the file Loaded. In a worksheet: SELECT * FROM ${TABLE} WHERE ORDER_ID = 'O-1008'; shows the mapped values, and SELECT COUNT(*) FROM ${TABLE} WHERE BUSINESS_DATE = '${DATE}'; matches the 6 orders of the source.`,
      done: (s) => {
        const t = loadedAt(s)
        return deployedOk(s) && t !== undefined && Boolean(dwOrder(s, 'O-1008')) && dwOrder(s, 'O-1008').TOTAL === 96.4 && dwCount(s) === sourceCount(s) && Boolean(s.seen[`logs:${appOf(s).name}`]) && Boolean(s.seen['snf:copy-history']) && adminAsked(s, /O-1008/, t) && adminAsked(s, /COUNT/i, t)
      },
    },
    ask(
      'Load metadata',
      'Snowflake skips a file it has loaded in the last 64 days. Why does the app give each extract a new name with the date and the run time, and name it in FILES = ( )?',
      [
        'Snowflake needs unique names for every file in a stage',
        'A reload of the same date with the same name would be skipped as already loaded, even though the content is new. A name per run makes each extract a new file, and FILES = (that name) loads only this run instead of every file that sits in the stage',
        'The run time makes the file smaller',
        'FILES is needed for key pair authentication',
      ],
      1,
      'COPY keeps load metadata per table and file for 64 days and skips files it has seen, which protects against double loads of the same file. A reload needs a new file, or FORCE = TRUE, which loads a file again whatever happened before. Naming the file in FILES = ( ) or a PATTERN keeps old files in the stage out of this load.',
    ),
    {
      title: 'A row Snowflake rejects',
      how: `The order system has a new status. Database console, ${SRC}: UPDATE dbo.orders SET status = 'PARTIALLY_REFUNDED' WHERE order_id = 'O-1006'; Then API client as ${CALLER.name}, POST /loads with {"date":"${DATE}"}. The answer is 422: 1 row rejected, String 'PARTIALLY_REFUNDED' is too long and would be truncated. Copy History shows the file Partially loaded. The good rows were merged; O-1006 keeps its old status and is not lost: the log names it and Snowflake keeps the row for VALIDATE.`,
      done: (s) => (s.lastCalls ?? []).some((c) => c.app === appOf(s)?.name && c.status === 422 && /^\/loads/.test(c.path)) && (y(s)?.copies ?? []).some((c) => c.table === STG && c.user === USER && c.status === 'Partially loaded'),
    },
    {
      title: 'Fix the column and load the day again',
      how: `In a worksheet: ALTER TABLE ${STG} ALTER COLUMN STATUS SET DATA TYPE VARCHAR(20); and the same for ${TABLE}. Snowflake can make a VARCHAR longer, never shorter. Then POST /loads with {"date":"${DATE}"} again: 200, 0 rejected. O-1006 shows PARTIALLY_REFUNDED in ${TABLE} and the count of the day is still 6: MERGE updated, nothing doubled.`,
      done: (s) => statusWide(s) && dwOrder(s, 'O-1006')?.STATUS === 'PARTIALLY_REFUNDED' && dwCount(s) === sourceCount(s) && loadOf(s)?.rejected === 0,
    },
    ask(
      'Changes after the day',
      'The extract reads the orders created on the business date. An order of last week is refunded today. What happens to it, and what would you change?',
      [
        'Nothing, MERGE finds it anyway',
        'It is never read again, because its created_at is outside the window. Extract by a last modified column (an updated_at watermark or change tracking) or reload a rolling window of the last days; MERGE keeps either safe',
        'Snowflake updates it on its own',
        'Run the load every hour instead',
      ],
      1,
      'A window on the creation date only sees new rows. Changes to old rows need a column that moves with every change, such as updated_at with an index, or SQL Server change tracking or CDC. Keep the watermark of the last successful run and let MERGE absorb overlaps.',
    ),
    {
      title: 'Alert the data platform team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${SF_PKG}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO} from the mail. A failed load or a rejected row reaches a person before 07:00.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === appOf(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    {
      title: 'Promote the API instance to Production',
      how: 'API Manager, switch to Production with the environment button at the top of the left menu. Add API, Promote API from environment, source Sandbox, include Policies.',
      done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')),
    },
    {
      title: 'Deploy to Production and load one day',
      how: `Runtime Manager in Production, Deploy application, the same jar. db.host ${PRD.dbHost}, db.database BrightmartOrders, db.user ${DB_USER} and the protected db.password from the mail; snowflake.account brightmart-dw, snowflake.user ${PRD.user}, snowflake.role ${PRD.role}, snowflake.warehouse ${PRD.wh}, snowflake.database ${PRD.db}, snowflake.schema ${SC}, snowflake.stage SALES_STAGE and the protected snowflake.privateKey from the mail; api.id of the Production instance and the Production client ID and secret. Then Schedules, ${SF_FLOW}, Run. ${PRD.db}.${SC}.DAILY_SALES has the orders of ${DATE}.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const p = props(a)
        return a?.status === 'Running' && sfPropsOk(p, { user: PRD.user, role: PRD.role, wh: PRD.wh, db: PRD.db, key: PRD.key }) && a.props['snowflake.privateKey'] === undefined && word(p['db.host']) === PRD.dbHost && a.secrets['db.password'] === PRD.dbPassword && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s, 'Production')) === 'Active' && dwCount(s, `${PRD.db}.${SC}.DAILY_SALES`) > 0
      },
    },
  ],
  why: `I built the daily sales load from SQL Server to Snowflake end to end. The request gave the source, the target, the 02:30 schedule, the volume and two rules: a day loaded twice must not double, and a rejected row must not vanish. I designed a small Sales Load API for status and reload, mocked it and published it to Exchange. In Studio the app selects the orders of the business date, maps them to CSV with DataWeave, PUTs one file per run to an internal stage, COPYs it into a truncated staging table with ON_ERROR = CONTINUE and MERGEs on ORDER_ID into DAILY_SALES. In SQL Server the app has a login with SELECT on one table; in Snowflake a role with only the grants the statements need and a TYPE = SERVICE user with an RSA key, the private key a secure property. API Manager got the instance with Client ID Enforcement, then the deploy with autodiscovery. I inserted a test order, ran the load, followed its correlation ID in the log, Copy History and a SELECT, and matched the counts. A new status longer than the column was rejected by COPY: the good rows merged, the bad row stayed visible; I widened the column and reloaded the day, and MERGE kept the count right. Last, an alert and Production with its own source, database, role, user and key, where the load ran for real. In the lab Production lives in the same Snowflake account as its own database.`,
  docs: 'https://docs.mulesoft.com/snowflake-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    const sql = (q) => (s = runWorksheet(s, q).state)
    s = createProject(s, 'Sales Load API')
    s = saveProject(s, s.projects.at(-1).id, RAML)
    s = mark(s, 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Sales Load API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = runSql(s, SRC, `CREATE LOGIN ${DB_USER} WITH PASSWORD = '${DB_PASSWORD}'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT ON dbo.orders TO ${DB_USER}`).state
    sql(`CREATE ROLE ${ROLE}; GRANT USAGE ON WAREHOUSE ${WH} TO ROLE ${ROLE}; GRANT USAGE ON DATABASE ${DB} TO ROLE ${ROLE}; GRANT USAGE ON SCHEMA ${DB}.${SC} TO ROLE ${ROLE};
      GRANT READ, WRITE ON STAGE ${STAGE} TO ROLE ${ROLE}; GRANT USAGE ON FILE FORMAT ${FORMAT} TO ROLE ${ROLE};
      GRANT SELECT, INSERT, TRUNCATE ON TABLE ${STG} TO ROLE ${ROLE}; GRANT SELECT, INSERT, UPDATE ON TABLE ${TABLE} TO ROLE ${ROLE}`)
    sql(`CREATE USER ${USER} TYPE = SERVICE DEFAULT_ROLE = ${ROLE} DEFAULT_WAREHOUSE = ${WH} RSA_PUBLIC_KEY = '${publicKeyOf(KEY)}'; GRANT ROLE ${ROLE} TO USER ${USER}`)
    s = addApi(s, { assetId: ASSET, label: 'sales-load-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = requestAccess(mark(s, 'env:Sandbox'), id, CALLER.name)
    const p = project(s)
    const jar = { pkg: p.pkg, jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1 }
    const sf = (x) => ({ 'snowflake.account': 'brightmart-dw', 'snowflake.user': x.user, 'snowflake.role': x.role, 'snowflake.warehouse': x.wh, 'snowflake.database': x.db, 'snowflake.schema': SC, 'snowflake.stage': 'SALES_STAGE' })
    s = finishDeploys(deployApp(s, { name: SF_PKG, ...jar, props: { 'db.host': 'sql.brightmart.lab', 'db.database': 'BrightmartOrders', 'db.user': DB_USER, ...sf({ user: USER, role: ROLE, wh: WH, db: DB }), 'api.id': id, 'anypoint.platform.client_id': s.creds.Sandbox.id }, secrets: { 'db.password': DB_PASSWORD, 'snowflake.privateKey': KEY, 'anypoint.platform.client_secret': s.creds.Sandbox.secret } }).state)
    s = runSql(s, SRC, TEST_ORDER).state
    s = runNow(advance(s, MINUTE), SF_PKG, SF_FLOW)
    s = mark(mark(s, `logs:${SF_PKG}`), 'snf:copy-history')
    sql(`SELECT * FROM ${TABLE} WHERE ORDER_ID = 'O-1008'`)
    sql(`SELECT COUNT(*) FROM ${TABLE} WHERE BUSINESS_DATE = '${DATE}'`)
    s = runSql(s, SRC, "UPDATE dbo.orders SET status = 'PARTIALLY_REFUNDED' WHERE order_id = 'O-1006'").state
    const reload = (x) => callApi(x, { env: 'Sandbox', app: SF_PKG, method: 'POST', path: '/loads', body: `{"date":"${DATE}"}`, client: CALLER.name, clientId: CALLER.clientId, clientSecret: CALLER.clientSecret }).state
    s = reload(advance(s, MINUTE))
    sql(`ALTER TABLE ${STG} ALTER COLUMN STATUS SET DATA TYPE VARCHAR(20); ALTER TABLE ${TABLE} ALTER COLUMN STATUS SET DATA TYPE VARCHAR(20)`)
    s = reload(advance(s, MINUTE))
    s = addMonAlert(s, { title: 'Sales load errors', resource: 'Application', name_: SF_PKG, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: false, alerts: false })
    s = mark(s, 'env:Production')
    s = finishDeploys(deployApp(s, { name: SF_PKG, ...jar, props: { 'db.host': PRD.dbHost, 'db.database': 'BrightmartOrders', 'db.user': DB_USER, ...sf(PRD), 'api.id': s.lastApi, 'anypoint.platform.client_id': s.creds.Production.id }, secrets: { 'db.password': PRD.dbPassword, 'snowflake.privateKey': PRD.key, 'anypoint.platform.client_secret': s.creds.Production.secret } }).state)
    return runNow(advance(s, MINUTE), SF_PKG, SF_FLOW)
  },
  answers: { 5: 1, 14: 1, 17: 1 },
}

export const LABS = [lab]
