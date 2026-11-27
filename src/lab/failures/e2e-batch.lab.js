// The end to end lab of batch. See platform-labs.js for the shape of a lab.
// The whole life of the nightly order load: the request, the RAML of its Order Loads API, Exchange, Studio, a SQL
// Server login with least privilege, API Manager, the deployment, the Batch Job finished for real in the Flow editor, a
// test file followed from the POS SFTP server to the table, a volume file of 312,480 orders with failed records kept,
// fixed and replayed, an alert, and Production.
import {
  addApi, addMonAlert, apiStatus, applyPolicy, at, createClient, createProject, deployApp, deployXml, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform,
  packageJar, promoteApi, publish, ramlErrors, requestAccess, runNow, saveProject, setStudio, advance,
} from '../platform.js'
import { app, ask, call, called, creds, OPS } from '../platform-kit.js'
import { granted, loginsOf, newSqlServer, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { fileRec, newLocal, newServerSys, systemsOf, transfer } from '../platform-systems.js'
import { parseMule } from '../platform-xml.js'
import { APP, ARCHIVE, ASSET, DATABASE, DB, DB_PRD, DIR, FIXED_XML, FLOW, HEADER, HOST, HOST_PRD, INSERT_BULK, jobOf, ON_COMPLETE, ORDERS, PKG, PROTO_XML, REJECT_STEP, REJECTS, SFTP, SFTP_PRD, STORES } from './e2e-batch.pkg.js'

const LOGIN = 'mule_orders_load'
const PASSWORD = 'Load-Sbx-2026' // made-up lab values
const PRD_PASSWORD = 'Load-Prd-4410'
const SFTP_USER = 'mule_orders'
const SFTP_PASSWORD = 'Pos-Read-2026'
const SFTP_PRD_PASSWORD = 'Pos-Read-9031'
const TEST_USER = 'pos_test'
const TEST_PASSWORD = 'Pos-Test-2026'
const TEAM = 'sales-ops@brightmart.example'
const PORTAL = 'Brightmart Ops Portal'
const TEST_FILE = 'orders-test-20261103.csv'
const VOLUME_FILE = 'orders-20261102.csv'
const PRD_FILE = 'orders-20261103.csv'
const TOTAL = 312480
const BAD = 37
const ORDER = 'POS-0117-000451'

const TEST_CSV = `${HEADER}\nPOS-0117-000451,ST-117,2026-11-03,3,86.40\nPOS-0117-000452,ST-117,2026-11-03,1,12.99\nPOS-0101-000977,ST-101,2026-11-03,5,142.15\nPOS-0140-000318,ST-140,2026-11-03,2,39.80\nPOS-0140-000319,ST-140,2026-11-03,4,77.25\nTRAILER,5\n`
const VOLUME_CSV = `${HEADER}\nPOS-0101-000901,ST-101,2026-11-02,2,54.10\nPOS-0117-000377,ST-117,2026-11-02,1,9.99\nPOS-0140-000250,ST-140,2026-11-02,6,188.40\nPOS-0155-000122,ST-155,2026-11-02,3,61.00\nPOS-0212-000017,ST-212,2026-11-02,2,24.50\nPOS-0101-000902,ST-101,2026-11-02,1,15.75\nPOS-0212-000018,ST-212,2026-11-02,4,96.20\nPOS-0155-000123,ST-155,2026-11-02,2,33.30\nTRAILER,${TOTAL}\n`
const PRD_CSV = `${HEADER}\nPOS-0212-000101,ST-212,2026-11-03,2,48.60\nPOS-0101-001002,ST-101,2026-11-03,1,19.90\nPOS-0140-000377,ST-140,2026-11-03,3,72.30\nTRAILER,298115\n`

const RAML = `#%RAML 1.0
title: Order Loads API
version: v1
mediaType: application/json
/loads:
  /{loadId}:
    get:
      description: The counts of one load of a store order file
      responses:
        200:
          body:
            example: |
              { "loadId": "orders-20261102", "file": "orders-20261102.csv", "status": "SUCCESSFUL", "total": 312480, "successful": 312443, "failed": 37, "rejected": 37 }
        404:
          body:
            example: |
              { "message": "No load orders-20261199" }
    /replay:
      post:
        description: Load the rejected orders of a load again, after their cause is fixed
        responses:
          200:
            body:
              example: |
                { "loadId": "orders-20261102", "replayed": 37, "stillFailing": 0 }
`
const STUDIO_CODE = `<!-- Global element of the POS SFTP server; every value is a property of the environment -->
<sftp:config name="POS_SFTP">
  <sftp:connection host="\${sftp.host}" port="22" username="\${sftp.user}" password="\${sftp.password}"/>
</sftp:config>

<!-- nightly-orders-flow: the file is read as a stream and never held in the heap as a whole -->
<sftp:list config-ref="POS_SFTP" directoryPath="/out/orders">
  <sftp:matcher filenamePattern="*.csv"/>
</sftp:list>
<sftp:read config-ref="POS_SFTP" path="#[vars.file.attributes.path]"
           outputMimeType="application/csv; streaming=true; header=true">
  <repeatable-file-store-stream inMemorySize="512" bufferUnit="KB"/>
</sftp:read>
<batch:job jobName="nightly-orders-job" blockSize="100" maxFailedRecords="...">  <!-- you finish it in the Flow editor -->

%dw 2.0
output application/java
---
{
  orderId: payload.order_id,               // order_id   -> order_id (primary key)
  storeCode: payload.store_code,           // store_code -> store_code (must be in dbo.stores)
  orderDate: payload.order_date as Date,   // order_date -> order_date
  lineCount: payload.line_count as Number, // line_count -> line_count
  total: payload.total as Number,          // total      -> total
  loadId: vars.loadId                      // the file name without .csv
}`
const XML_LIMITS = `    <batch:job jobName="nightly-orders-job" blockSize="100" maxFailedRecords="-1">
  ...
${INSERT_BULK}`
const XML_REJECTS = `${REJECT_STEP}      </batch:process-records>
${ON_COMPLETE}`

const TABLES = `CREATE TABLE ${STORES} (store_code varchar(8) NOT NULL PRIMARY KEY, name nvarchar(80) NOT NULL, opened date NULL);\nCREATE TABLE ${ORDERS} (order_id varchar(24) NOT NULL PRIMARY KEY, store_code varchar(8) NOT NULL REFERENCES ${STORES} (store_code), order_date date NOT NULL, line_count int NOT NULL, total decimal(12,2) NOT NULL, load_id varchar(40) NOT NULL);\nCREATE TABLE ${REJECTS} (load_id varchar(40) NOT NULL, order_id varchar(24) NOT NULL, store_code varchar(8) NULL, error varchar(200) NOT NULL, raw varchar(400) NOT NULL, status varchar(10) NOT NULL DEFAULT 'NEW', logged_at datetime2 NOT NULL DEFAULT SYSDATETIME());`
const STORE_ROWS = (codes) => codes.map(([c, n]) => `INSERT INTO ${STORES} (store_code, name) VALUES ('${c}', '${n}');`).join('\n')
const SBX_STORES = [['ST-101', 'Brightmart Old Town'], ['ST-117', 'Brightmart Riverside'], ['ST-140', 'Brightmart Northgate'], ['ST-155', 'Brightmart Station Square']]
const GRANTS = (login) => `GRANT SELECT ON ${STORES} TO ${login};\nGRANT INSERT ON ${ORDERS} TO ${login};\nGRANT SELECT, INSERT, UPDATE ON ${REJECTS} TO ${login};`
const DBO = [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }]
const NEED = { [STORES]: ['SELECT'], [ORDERS]: ['INSERT'], [REJECTS]: ['SELECT', 'INSERT', 'UPDATE'] }
const sftpServer = (host, password, files = {}) =>
  newServerSys(host, {
    dirs: ['/', '/out', DIR, ARCHIVE],
    users: {
      [SFTP_USER]: { password, home: DIR, readDirs: [DIR], writeDirs: [DIR] },
      ...(host === SFTP && { [TEST_USER]: { password: TEST_PASSWORD, home: DIR, readDirs: [DIR], writeDirs: [DIR] } }),
      pos_export: { password: 'Pos-Export-Lab', home: DIR, readDirs: [DIR], writeDirs: [DIR] },
    },
    files,
  })

const srv = (s, name = DB) => serverOf(s, name)
const loginOf = (s) => (srv(s) ? loginsOf(srv(s)) : []).find((l) => l.name.toLowerCase() === LOGIN && l.type === 'SQL login')
const userOf = (s) => (srv(s) ? usersOf(srv(s)) : []).find((u) => String(u.login).toLowerCase() === LOGIN)
const tableOf = (s, name, tk) => (srv(s, name) ? tablesOf(srv(s, name))[tk] : null)
const rowsOf = (s, name, tk) => tableOf(s, name, tk)?.rows ?? []
const a = (s) => app(s, APP)
const prd = (s) => s.apps.find((x) => x.name === APP && x.env === 'Production')
const store = (s) => a(s)?.store ?? {}
const project = (s) => s.studio.find((p) => p.assetId === ASSET)
const apiOf = (s, env = 'Sandbox') => s.apis.find((x) => x.assetId === ASSET && x.env === env)
const jobNow = (x) => (x?.status === 'Running' && x.xml && parseMule(x.xml).ok ? jobOf(parseMule(x.xml)) : null)
const loadOf = (s, id) => store(s).loads?.[id]
const instanceOf = (s, load) => (a(s)?.batches ?? []).find((b) => b.id === load?.instance)
const seenAfter = (s, key, t) => (s.seen[key] ?? -1) >= t

const leastOk = (s) => {
  const u = userOf(s)
  if (!u || !loginOf(s) || !Object.entries(NEED).every(([tk, vs]) => vs.every((v) => granted(u, tk, v)))) return false
  const extra = Object.entries(u.grants ?? {}).some(([tk, ps]) => !NEED[tk] || ps.some((p) => !NEED[tk].includes(p)))
  return !extra && u.roles.length === 0 && !loginOf(s).sysadmin
}
const deployedOk = (s) => {
  const x = a(s)
  const p = x?.props ?? {}
  return Boolean(x && project(s)?.jar && loginOf(s)) && x.jar === project(s).jar && Boolean(x.autodiscovery) && p['sftp.host'] === SFTP && p['sftp.user'] === SFTP_USER && x.secrets?.['sftp.password'] === SFTP_PASSWORD && p['db.host'] === HOST && p['db.database'] === DATABASE && p['db.user'] === LOGIN && x.secrets?.['db.password'] === loginOf(s).password && !('db.password' in p) && !('sftp.password' in p) && String(p['report.to'] ?? '').toLowerCase() === TEAM
}
const limitsOk = (x) => {
  const j = jobNow(x)
  return Boolean(j?.insert?.bulk) && (j.max === -1 || j.max >= BAD) && j.insert.size >= 100 && j.insert.size <= 5000
}
const rejectsOk = (x) => {
  const j = jobNow(x)
  return Boolean(j?.rejects && j.onComplete)
}

const lab = {
  id: 'p-e2e-batch',
  group: 'End to end by system',
  title: 'End to end: nightly store orders, SFTP file to SQL Server',
  minutes: 60,
  scenario: `Every night the till system of Brightmart drops one CSV file with the orders of all stores on the POS SFTP server, about 300,000 orders. Finance wants them in ${ORDERS} on SQL Server ${DATABASE} by 06:00, and a report of what failed. You own ${APP}, from the request to Production. A record takes this path: at 02:00 the app lists ${DIR}, streams the oldest new file into a Batch Job, validates each order against ${STORES}, maps it, writes it with a bulk insert, keeps every failed order in ${REJECTS}, mails a report from On Complete and moves the file to ${ARCHIVE}. An Order Loads API lets the operations portal see a load and replay its rejects. A teammate wrote the first cut of the job on your spec. The Inbox has the request.`,
  start() {
    let s = newPlatform({
      clock: at(1, 9),
      studioPkgs: { [ASSET]: PKG },
      studioXml: { [ASSET]: PROTO_XML },
      systems: systemsOf({
        servers: [sftpServer(SFTP, SFTP_PASSWORD), sftpServer(SFTP_PRD, SFTP_PRD_PASSWORD, { [`${DIR}/${PRD_FILE}`]: fileRec(PRD_CSV, { size: 39318420, t: at(1, 1, 40), owner: 'pos_export' }) })],
        local: newLocal({ files: { [TEST_FILE]: fileRec(TEST_CSV, { t: at(1, 8) }), [VOLUME_FILE]: fileRec(VOLUME_CSV, { size: 41236880, t: at(1, 8) }) } }),
      }),
      databases: {
        created: at(1, 8),
        servers: {
          [DB]: newSqlServer(DB, { host: HOST, database: DATABASE, dbid: 14, tables: {}, users: DBO }),
          [DB_PRD]: newSqlServer(DB_PRD, { host: HOST_PRD, database: DATABASE, dbid: 14, tables: {}, users: DBO }),
        },
      },
      mail: [
        {
          t: at(1, 8, 10),
          to: OPS,
          subject: 'Nightly store orders into SQL Server',
          body: `Hello, from next week the till system drops one file a night on the POS SFTP server.\n\nSource: ${SFTP}, folder ${DIR}, one CSV with ${HEADER} and a TRAILER line with the count. About 300,000 orders, 40 MB, at 01:40. Read user ${SFTP_USER}, practice password ${SFTP_PASSWORD}. For tests the POS team gave you ${TEST_FILE} and a copy of Monday's file, ${VOLUME_FILE}, on your computer; upload them as ${TEST_USER}, practice password ${TEST_PASSWORD}.\nTarget: SQL Server ${HOST}, database ${DATABASE}, table ${ORDERS}. Every order needs a store in ${STORES}. Give the load its own login, ${LOGIN}: it reads the stores, inserts orders, and keeps failed orders in ${REJECTS}.\nOne bad order must not stop the night. Keep each failed order with its reason, mail a report to ${TEAM} after each load, and let the operations portal (${PORTAL}) replay the failed orders once their cause is fixed.\nThe load must be done by 06:00.\nProduction: SFTP ${SFTP_PRD}, same user, practice password ${SFTP_PRD_PASSWORD}. SQL Server ${HOST_PRD}, login ${LOGIN}, practice password ${PRD_PASSWORD}. The DBAs ran the grants there (change CHG-6031).\n\nThanks, Brightmart sales operations`,
          source: 'Brightmart sales operations',
        },
      ],
    })
    s = runSql(s, DB, `${TABLES}\n${STORE_ROWS(SBX_STORES)}`).state
    s = runSql(s, DB_PRD, `${TABLES}\n${STORE_ROWS([...SBX_STORES, ['ST-212', 'Brightmart Harbour Mall']])}\nCREATE LOGIN ${LOGIN} WITH PASSWORD = '${PRD_PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\n${GRANTS(LOGIN)}`).state
    return s
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the folder, the file layout and its trailer, the volume, the target tables, the login, the deadline, what happens to a bad order, the report and who replays.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: 'Design Center from the menu. Create new, New API Specification, name Order Loads API.', done: (s) => s.projects.some((p) => /order loads api/i.test(p.name)) },
    {
      title: 'Write the RAML',
      how: 'The load itself runs on a schedule. The operations portal needs GET /loads/{loadId} and POST /loads/{loadId}/replay. Write them, or paste this one.',
      code: RAML,
      done: (s) => s.projects.some((p) => p.raml && ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'GET', '/loads/orders-20261102').status === 200 && mockCall(p.raml, 'POST', '/loads/orders-20261102/replay').status === 200),
    },
    {
      title: 'Try the mock, then publish to Exchange',
      how: `In the Documentation panel turn on the mocking service, choose GET /loads/{loadId}, Try it, Send. Then Publish: asset ID ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`,
      done: (s) => Boolean(s.seen.mock) && s.assets.some((x) => x.assetId === ASSET),
    },
    {
      title: 'Import the specification into Studio',
      how: 'Anypoint Studio from the menu, Import a published API, choose Order Loads API. Next to the APIkit flows the project has nightly-orders-flow: a Scheduler, the SFTP list and read as a stream, and the Batch Job with its mapping. You finish the job once it runs.',
      code: STUDIO_CODE,
      done: (s) => project(s)?.pkg === PKG,
    },
    {
      title: 'Add API Autodiscovery and export',
      how: `In Studio, Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then Export.`,
      done: (s) => Boolean(project(s)?.jar) && project(s).autodiscovery?.apiId === '${api.id}' && /-main$/.test(project(s).autodiscovery.flowRef ?? ''),
    },
    {
      title: 'Give the load its own login with least privilege',
      how: `Databases from the console menu, server ${DB}, New Query. Run\nCREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\n${GRANTS(LOGIN)}\nNo role, no DELETE, nothing on other tables. The tab Logins and users shows the permissions.`,
      done: leastOk,
    },
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: 'API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), select Order Loads API from Exchange, Save & Deploy. Then Policies, Add policy, Client ID Enforcement. Open Environment information and copy the client ID and secret of Sandbox.',
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    {
      title: 'Deploy the exported jar',
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File the jar you exported. Properties: sftp.host=${SFTP}, sftp.user=${SFTP_USER}, db.host=${HOST}, db.port=1433, db.database=${DATABASE}, db.user=${LOGIN}, report.to=${TEAM}, api.id=the API Instance ID, anypoint.platform.client_id. Protect sftp.password, db.password and anypoint.platform.client_secret. Deploy Application. The API turns Active.`,
      done: (s) => a(s)?.status === 'Running' && deployedOk(s) && apiStatus(s, apiOf(s)) === 'Active',
    },
    {
      title: 'Let good orders through and insert in bulk',
      how: `Lab tools, Flow editor, ${APP}. The first cut has maxFailedRecords="0", so the first bad order stops the whole night, and insert-orders sends one INSERT per order. Set maxFailedRecords="-1" on the batch:job and replace the step insert-orders with a Batch Aggregator of 1000 around a db:bulk-insert, as below. Deploy to Sandbox.`,
      code: XML_LIMITS,
      done: (s) => limitsOk(a(s)),
    },
    {
      title: 'Keep the failed orders and report',
      how: `After insert-orders add the step save-rejects with acceptPolicy="ONLY_FAILURES": it takes only the records that failed in an earlier step and inserts each one with its error into ${REJECTS}. After batch:process-records add batch:on-complete with the load report. Deploy to Sandbox; the Problems view names any line the runtime refuses.`,
      code: XML_REJECTS,
      done: (s) => limitsOk(a(s)) && rejectsOk(a(s)),
    },
    ask(
      'Block size and aggregator size',
      'The job has blockSize 100 and the aggregator size 1000. What does each one decide?',
      [
        'Both are the same setting written twice',
        'blockSize is how many records a thread takes from the batch queue at a time, so it sets the memory per thread and the trips to the queue. The aggregator size is how many records go into one db:bulk-insert: one round trip and one statement batch for 1000 orders instead of 1000. A failed bulk insert fails the records of that group, so keep the bad records out before it',
        'blockSize is the number of threads',
        'The aggregator size limits the number of failed records',
      ],
      1,
      'Records move through the steps in blocks of blockSize, and an aggregator collects records of the step until it has its size, then runs its processors once on the list. 312,480 single inserts are 312,480 round trips and commits; 313 bulk inserts finish in minutes. Validation in an earlier step keeps a bad order from failing a whole group of 1000.',
    ),
    {
      title: 'Put the test file on the SFTP server',
      how: `SFTP and FTP from the console menu, under Files and data. Protocol SFTP, Host ${SFTP}, Username ${TEST_USER}, Password ${TEST_PASSWORD}, Quickconnect, and trust the host key. In the Local site select ${TEST_FILE} and press Upload. It lands in ${DIR}, the home folder of the user.`,
      done: (s) => (s.systems?.transfers ?? []).some((t) => t.ok && t.direction === 'upload' && t.host === SFTP && t.local === TEST_FILE),
    },
    {
      title: 'Run the job and open the instance',
      how: `Runtime Manager, ${APP}, Schedules, ${FLOW}, Run. Then Batch jobs from the console menu, pick ${APP} and open the newest instance: 5 records, 5 successful, status SUCCESSFUL.`,
      done: (s) => {
        const l = loadOf(s, TEST_FILE.replace('.csv', ''))
        return l?.status === 'SUCCESSFUL' && l.successful === 5 && Boolean(s.seen[`batch-instance:${l.instance}`])
      },
    },
    {
      title: 'Follow one order to the table',
      how: `Logs of ${APP}: the run reads ${DIR}/${TEST_FILE}, the batch engine creates the instance, the aggregator sends the bulk insert and the file moves to ${ARCHIVE}. Then Databases, ${DB}, New Query: SELECT * FROM ${ORDERS} WHERE order_id = '${ORDER}'; shows store ST-117, 3 lines, total 86.40 and load_id orders-test-20261103.`,
      done: (s) => {
        const l = loadOf(s, TEST_FILE.replace('.csv', ''))
        return Boolean(l) && Boolean(s.seen[`logs:${APP}`]) && seenAfter(s, `db-select:${DB}:${ORDERS}`, l.t) && (l.sample ?? []).includes(ORDER) // the table keeps its newest rows only, so later loads can push the row out of the lab state
      },
    },
    {
      title: "Load Monday's file and check the counts",
      how: `In SFTP and FTP upload ${VOLUME_FILE} (40 MB, ${TOTAL.toLocaleString('en-US')} orders). Schedules, ${FLOW}, Run, then move the clock 10 minutes while the instance is EXECUTING. In Batch jobs the instance ends SUCCESSFUL with ${BAD} failed records, all ${'ORDERS:UNKNOWN_STORE'} for store ST-212. Databases: SELECT COUNT(*) FROM ${ORDERS}; and SELECT * FROM ${REJECTS}; The Inbox has the report of On Complete.`,
      done: (s) => {
        const l = loadOf(s, VOLUME_FILE.replace('.csv', ''))
        const inst = instanceOf(s, l)
        return Boolean(inst) && inst.status === 'SUCCESSFUL' && inst.total === TOTAL && inst.failed === BAD && Boolean(s.seen[`batch-instance:${inst.id}`]) && rowsOf(s, DB, REJECTS).filter((r) => r.load_id === l.loadId).length === BAD && seenAfter(s, `db-select:${DB}:${ORDERS}`, l.t) && seenAfter(s, `db-select:${DB}:${REJECTS}`, l.t) && s.mail.some((m) => m.to === TEAM && m.subject.includes(l.loadId))
      },
    },
    ask(
      'A file larger than the heap',
      'The replica has 0.2 vCores and about 1 GB of heap, and the file grows every year. Why does the load not run out of memory?',
      [
        'SQL Server keeps the rows until the job ends',
        'sftp:read with a repeatable file store stream and the CSV reader in streaming mode hand the records on as they are read. The Load and Dispatch phase writes each record to the persistent batch queues on the local disk, and the steps take blocks of 100 from there. Only a few blocks and one aggregator list are in the heap at a time',
        'The batch job compresses the file in memory',
        'It does run out of memory above 1 GB',
      ],
      1,
      'Streaming means no step needs the whole file at once. A transform that reads all of it before the job, or a variable that holds it, would undo that. The batch queues live on the disk of the replica, so a large input needs free disk, and the history of instances is kept there for 7 days by default.',
    ),
    {
      title: 'Fix the cause and replay the rejects',
      how: `The rejects say store ST-212 is not in ${STORES}: Harbour Mall opened on Monday and master data was late. Add it: INSERT INTO ${STORES} (store_code, name) VALUES ('ST-212', 'Brightmart Harbour Mall'); Then Exchange, Order Loads API, Request access with a new application named ${PORTAL}. API client as ${PORTAL}: POST /loads/orders-20261102/replay. It answers replayed ${BAD}, stillFailing 0, and the rows in ${REJECTS} turn REPLAYED.`,
      done: (s) => {
        const rj = rowsOf(s, DB, REJECTS).filter((r) => r.load_id === 'orders-20261102')
        return rj.length === BAD && rj.every((r) => r.status === 'REPLAYED') && rowsOf(s, DB, STORES).some((r) => r.store_code === 'ST-212') && rowsOf(s, DB, ORDERS).some((r) => r.store_code === 'ST-212') && called(s, APP, 200, 'POST', /\/replay$/) && Boolean(apiOf(s)?.contracts.some((c) => c.client === PORTAL && c.status === 'approved'))
      },
    },
    {
      title: 'Alert sales operations',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, recipient ${TEAM}. A run that cannot reach the SFTP server or the database is an error. Failed records are not, which is why the report and ${REJECTS} matter.`,
      done: (s) => s.monAlerts.some((x) => x.resource === 'Application' && x.name_ === APP && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
    ask(
      'Replay twice',
      'Someone presses replay twice, or the replay fails half way and runs again. What keeps an order from being loaded twice?',
      [
        'Nothing, the portal must make sure it is pressed once',
        'Three things together: the replay reads only rejects with status NEW, it marks each one REPLAYED after its insert, and order_id is the primary key of the orders table, so an order that is there already fails with 2627 and counts as done',
        'The batch job remembers the records it processed',
        'SQL Server ignores a second insert of the same row',
      ],
      1,
      'A replay must be safe to repeat. A status on the reject row says what is still to do, and the primary key is the last line of defence when a run stops between the insert and the update. The same thinking applies to the nightly file: a loaded file moves to the archive, so the next run does not take it again.',
    ),
    {
      title: 'Promote the API and deploy to Production',
      how: `Switch to Production. API Manager, Add API, Promote API from environment, Source Environment Sandbox, with policies. Runtime Manager in Production, Deploy application: name ${APP}, the exported jar, sftp.host=${SFTP_PRD}, sftp.user=${SFTP_USER}, db.host=${HOST_PRD}, db.port=1433, db.database=${DATABASE}, db.user=${LOGIN}, report.to=${TEAM}, api.id=the Production API Instance ID and the client ID of Production. Protect the Production passwords from the mail and the client secret. The jar still holds the first cut of the job, so deploy your fixed mule-config.xml with the Flow editor in Production too; in a real project it is committed in Studio and exported again.`,
      done: (s) => {
        const x = prd(s)
        const api = apiOf(s, 'Production')
        return Boolean(x && api) && x.status === 'Running' && api.policies.some((p) => p.type === 'client-id') && x.props['sftp.host'] === SFTP_PRD && x.secrets?.['sftp.password'] === SFTP_PRD_PASSWORD && x.props['db.host'] === HOST_PRD && x.secrets?.['db.password'] === PRD_PASSWORD && apiStatus(s, api) === 'Active' && limitsOk(x) && rejectsOk(x)
      },
    },
    {
      title: 'See the night file arrive in Production',
      how: `The till system dropped ${PRD_FILE} on ${SFTP_PRD} at 01:40. Runtime Manager in Production, ${APP}, Schedules, ${FLOW}, Run. Databases, ${DB_PRD}, New Query: SELECT * FROM ${ORDERS}; shows POS-0212-000101 of store ST-212, which Production already knows.`,
      done: (s) => {
        const l = prd(s)?.store?.loads?.[PRD_FILE.replace('.csv', '')]
        return Boolean(l) && l.status === 'SUCCESSFUL' && rowsOf(s, DB_PRD, ORDERS).some((r) => r.order_id === 'POS-0212-000101') && seenAfter(s, `db-select:${DB_PRD}:${ORDERS}`, l.t)
      },
    },
  ],
  why: `Sales operations asked for the nightly till file in SQL Server by 06:00, with no lost orders and a report. I designed a small Order Loads API so the operations portal can see a load and replay its failures, published it and imported it into Studio, where the batch flow sits next to the APIkit flows. The flow lists the SFTP folder, reads the file as a repeatable file store stream with the CSV reader streaming, and hands each order to a Batch Job, so a 40 MB file never sits in the heap. The job validates each order against the stores, maps it, and writes it with a Batch Aggregator of 1000 and a bulk insert; a step with acceptPolicy ONLY_FAILURES keeps each failed order with its error, maxFailedRecords -1 lets the good ones through, and On Complete mails the counts. The load has its own SQL Server login with only the grants it needs, and every connection value is a property with protected passwords. I followed one order of a test file from the upload to its row, then loaded a copy of Monday with 312,480 orders and checked the counts against the trailer: 37 failed for a store that master data had not set up yet. After the store was added, the replay loaded them, and it is safe to run twice. An alert on errors covers a load that cannot reach a system. Production got the promoted instance, its own SFTP host, database and passwords, and the same fixed job. In the lab the Flow editor stands for the change in the Studio project, and the sample lines of a large file stand for the rest.`,
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/batch-processing-concept',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Order Loads API')
    s = mark(saveProject(s, s.projects.at(-1).id, RAML), 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Order Loads API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = runSql(s, DB, `CREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\n${GRANTS(LOGIN)}`).state
    s = addApi(s, { assetId: ASSET, label: 'order-loads-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = mark(applyPolicy(s, id, 'client-id'), 'env:Sandbox')
    const jar = jarsOf(s).find((j) => j.project === ASSET)
    const props = { 'sftp.user': SFTP_USER, 'db.port': '1433', 'db.database': DATABASE, 'db.user': LOGIN, 'report.to': TEAM }
    const c = creds(s, 'Sandbox')
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.2, props: { ...props, 'sftp.host': SFTP, 'db.host': HOST, 'api.id': id, ...c.props }, secrets: { 'sftp.password': SFTP_PASSWORD, 'db.password': PASSWORD, ...c.secrets } }).state)
    s = deployXml(s, APP, FIXED_XML).state
    const up = (state, file) => transfer(state, { direction: 'upload', host: SFTP, auth: { user: TEST_USER, password: TEST_PASSWORD }, local: file, remote: `${DIR}/${file}` }).state
    s = runNow(up(s, TEST_FILE), APP, FLOW)
    s = mark(s, `batch-instance:${loadOf(s, 'orders-test-20261103').instance}`)
    s = mark(s, `logs:${APP}`)
    s = runSql(s, DB, `SELECT * FROM ${ORDERS} WHERE order_id = '${ORDER}';`).state
    s = advance(runNow(up(s, VOLUME_FILE), APP, FLOW), 10 * MINUTE)
    s = mark(s, `batch-instance:${loadOf(s, 'orders-20261102').instance}`)
    s = runSql(s, DB, `SELECT COUNT(*) FROM ${ORDERS};\nSELECT * FROM ${REJECTS};`).state
    s = runSql(s, DB, `INSERT INTO ${STORES} (store_code, name) VALUES ('ST-212', 'Brightmart Harbour Mall');`).state
    s = requestAccess(createClient(s, PORTAL), id, PORTAL)
    const portal = s.clients.find((x) => x.name === PORTAL)
    s = call(s, APP, portal, '/loads/orders-20261102/replay', 'POST').state
    s = addMonAlert(s, { title: 'Order load errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    // Production
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: true, alerts: false })
    const pc = creds(s, 'Production')
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.2, props: { ...props, 'sftp.host': SFTP_PRD, 'db.host': HOST_PRD, 'api.id': s.lastApi, ...pc.props }, secrets: { 'sftp.password': SFTP_PRD_PASSWORD, 'db.password': PRD_PASSWORD, ...pc.secrets } }).state)
    s = deployXml(s, APP, FIXED_XML).state
    s = runNow(s, APP, FLOW)
    return runSql(s, DB_PRD, `SELECT * FROM ${ORDERS};`).state
  },
  answers: { 11: 1, 16: 1, 19: 1 },
}

export const LABS = [lab]
