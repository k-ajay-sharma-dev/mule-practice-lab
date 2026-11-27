// The end to end lab of Azure Files. See platform-labs.js for the shape of a lab, and e2eKit in e2e-sftp.lab.js for
// the steps the four file labs share.
import { addMonAlert, advance, appNamed, at, deployXml, mark, MINUTE, newPlatform } from '../platform.js'
import { ask, call, called, until } from '../platform-kit.js'
import { newSqlServer, runSql } from '../platform-db.js'
import { addShare, createSas, fileRec, makeDir, newShare, newStorage, putFile, sasState, systemsOf } from '../platform-systems.js'
import { e2eKit, labTable, rowsIn } from '../platform-e2e-kit.js'
import { FIXED_XML, FLOW, HEADER, PKG, rejectsToErrors, START_XML, TABLE } from './e2e-azure-files.pkg.js'

const NAME = PKG
const ASSET = 'store-reports-system-api'
const TITLE = 'Store Reports System API'
const SBX = 'brightmartstoressbx'
const PRD = 'brightmartstoresprd'
const SHARE = 'store-reports'
const QUOTA = 20
const DIRS = ['inbox', 'processed', 'errors']
const DB_SBX = 'reports-sql-sbx'
const DB_PRD = 'reports-sql-prd'
const DB_HOST = { [DB_SBX]: 'sql-reports-sbx.brightmart.lab', [DB_PRD]: 'sql-reports-prd.brightmart.lab' }
const DB_USER = 'mule_store_reports'
const DB_PASS = { [DB_SBX]: 'Reports-Sbx-Lab-4', [DB_PRD]: 'Reports-Prd-Lab-9' } // practice values of the lab
const ALERT_TO = 'retail-finance@brightmart.example'
const CLIENT = { name: 'Store Ops Dashboard', clientId: 'sod-90b3a7', clientSecret: 'sod-secret-2f61' }
const DAY = 24 * 60 * MINUTE
const GOOD = 'sales-S014-20261103.csv'
const BAD = 'sales-S022-20261103.csv'
const LIVE = 'sales-S031-20261104.csv'
const GOOD_CSV = `${HEADER}\nS014;03.11.2026;1;1840.50;12.00\nS014;03.11.2026;2;922.10;0.00\nS014;03.11.2026;3;410.00;5.50\n`
const BAD_CSV = `${HEADER}\nS022;03.11.2026;1;1.204,50;0.00\nS022;03.11.2026;2;730.00;0.00\n`
const FIXED_CSV = `${HEADER}\nS022;03.11.2026;1;1204.50;0.00\nS022;03.11.2026;2;730.00;0.00\n`
const LIVE_CSV = `${HEADER}\nS031;04.11.2026;1;2210.00;40.00\nS031;04.11.2026;2;1190.40;0.00\n`

const RAML = `#%RAML 1.0
title: ${TITLE}
version: v1
mediaType: application/json
types:
  Report:
    properties:
      name: string
      status:
        enum: [waiting, loaded, rejected, replayed]
      rows: integer
      problem?: string
      correlationId?: string
/reports:
  get:
    description: The end of day reports of the stores and what happened to each
    responses:
      200:
        body:
          type: Report[]
          example: |
            [ { "name": "${GOOD}", "status": "loaded", "rows": 1, "correlationId": "2be0915c-c7a1-11f1" } ]
  /{name}:
    get:
      description: One report, with the correlation ID of the run that handled it
      responses:
        200:
          body:
            type: Report
            example: |
              { "name": "${GOOD}", "status": "loaded", "rows": 1, "correlationId": "2be0915c-c7a1-11f1" }
        404:
          body:
            example: |
              { "message": "No such report" }
    /replay:
      post:
        description: Move a fixed report from errors back to the inbox
        responses:
          202:
            body:
              example: |
                { "name": "${BAD}", "status": "replayed" }
          404:
            body:
              example: |
                { "message": "The report is not in the error directory" }
`

// the handler the learner adds in the Flow editor, before the on-error-propagate of the try scope
const HANDLER = FIXED_XML.slice(FIXED_XML.indexOf('          <on-error-continue'), FIXED_XML.indexOf('          <on-error-propagate'))

const kit = e2eKit({ title: TITLE, assetId: ASSET, raml: RAML, calls: [['GET', '/reports'], ['GET', `/reports/${GOOD}`], ['POST', `/reports/${BAD}/replay`]], mock: 'GET /reports', pkg: PKG, name: NAME, client: CLIENT, label: 'store-reports-sbx' })
const { check } = kit

const acc = (s, a = SBX) => s.systems?.storage?.[a]
const sh = (s, a = SBX) => acc(s, a)?.shares?.[SHARE]
const store = (s, env = 'Sandbox') => check.appIn(s, env)?.store ?? {}
const rep = (s, name, env = 'Sandbox') => (store(s, env).reports ?? []).find((x) => x.name === name)
const row = (s, db, id, date) => rowsIn(s, db, TABLE).find((r) => r.store_id === id && r.sales_date === date)
const clean = (v) => String(v ?? '').trim().replace(/^\?/, '')
const perms = (x) => [...String(x?.perms ?? '')].sort().join('')

const shareOk = (s) => sh(s)?.quota === QUOTA
const dirsOk = (s) => shareOk(s) && DIRS.every((d) => sh(s).dirs.includes(d))
// read, list, create, write and delete (a rename is a copy and a delete) on this share only, a week or more
const goodSas = (s, x) => Boolean(x) && x.box === SHARE && x.services === 'f' && perms(x) === 'cdlrw' && sasState(s, SBX, x) === 'Active' && x.expires - x.created >= 7 * DAY
const sasOk = (s) => dirsOk(s) && (acc(s)?.sas ?? []).some((x) => goodSas(s, x))
const propsOk = (s, env) => {
  const a = check.appIn(s, env)
  const p = (k) => check.prop(a, k).replace(/^\/+|\/+$/g, '')
  const prd = env === 'Production'
  const db = prd ? DB_PRD : DB_SBX
  const sas = (acc(s, prd ? PRD : SBX)?.sas ?? []).find((x) => x.token === clean(a?.secrets?.['share.sas']))
  return (
    Boolean(a) && p('share.account') === (prd ? PRD : SBX) && p('share.name') === SHARE && p('share.inboxDir') === 'inbox' && p('share.processedDir') === 'processed' && p('share.errorDir') === 'errors' && !a.props['share.sas'] &&
    (prd ? sas?.name === 'store-reports-app-prd' : goodSas(s, sas)) &&
    p('db.host') === DB_HOST[db] && p('db.port') === '1433' && p('db.database') === 'BrightmartReporting' && p('db.user') === DB_USER && a.secrets['db.password'] === DB_PASS[db] && !a.props['db.password']
  )
}
const deployedOk = (s) => dirsOk(s) && check.linked(s) && propsOk(s, 'Sandbox')
const loadedOk = (s) => deployedOk(s) && Boolean(sh(s).files[`processed/${GOOD}`]) && !sh(s).files[`inbox/${GOOD}`] && rep(s, GOOD)?.status === 'loaded' && row(s, DB_SBX, 'S014', '2026-11-03')?.net === 3155.1
const tracedOk = (s) => loadedOk(s) && called(s, NAME, 200, 'GET', new RegExp(`^/reports/${GOOD.replace(/\./g, '\\.')}`)) && (s.seen[`db-select:${DB_SBX}:${TABLE}`] ?? -1) >= rep(s, GOOD).t
const xmlOf = (s, env = 'Sandbox') => appNamed(s, NAME, env)?.xml
const failingOk = (s) => deployedOk(s) && Boolean(rep(s, BAD)?.failing) && !row(s, DB_SBX, 'S022', '2026-11-03') === !rep(s, BAD).replayed
const rejectedOk = (s) => failingOk(s) && rejectsToErrors(xmlOf(s)) && Boolean(xmlOf(s)) && rejected0(s)
const rejected0 = (s) => deployedOk(s) && Boolean(rep(s, BAD)?.rejected) && Boolean(sh(s).files[`errors/${BAD}`] || rep(s, BAD).replayed) && (Boolean(rep(s, BAD).replayed) || !row(s, DB_SBX, 'S022', '2026-11-03'))
const replayedOk = (s) => deployedOk(s) && rep(s, BAD)?.status === 'loaded' && Boolean(rep(s, BAD).replayed) && row(s, DB_SBX, 'S022', '2026-11-03')?.gross === 1934.5 && called(s, NAME, 202, 'POST', /\/replay$/)
const prodOk = (s) => check.linked(s, 'Production') && Boolean(xmlOf(s, 'Production')) && rejectsToErrors(xmlOf(s, 'Production')) && propsOk(s, 'Production') && row(s, DB_PRD, 'S031', '2026-11-04')?.net === 3360.4 && rep(s, LIVE, 'Production')?.status === 'loaded'

const MAIL = {
  t: at(1, 8, 25),
  to: 'ops@brightmart.example',
  subject: 'End of day store reports into the reporting database',
  body: [
    'Hello integration team,',
    `our 40 stores close the day on their back office servers, which mount an Azure file share over SMB and drop one report per store each night between 22:00 and 23:30, a few KB each. Retail finance wants the takings of each store and day in the reporting database by midnight. Today someone copies them into a spreadsheet.`,
    `The report has the columns ${HEADER}, one line per till, separated by semicolons, with the date as dd.MM.yyyy. Finance wants one row per store and day: the number of tills, gross, refunds, and net (gross minus refunds). A store can send its report again after a correction: keep one row per store and day.`,
    `Storage: account ${SBX}. Please make the share ${SHARE} with a quota of ${QUOTA} GiB and the directories ${DIRS.join(', ')}. The stores write to inbox. A loaded report moves to processed, a report that does not parse to errors, whole, so the store manager sees it. The app gets a SAS for this share only, 30 days.`,
    `Database: ${TABLE} in BrightmartReporting on ${DB_HOST[DB_SBX]}, port 1433, login ${DB_USER} (SELECT, INSERT and UPDATE on that table), practice password ${DB_PASS[DB_SBX]}.`,
    `The Store Ops Dashboard wants an API to see each report and to replay one after a fix. Failures go to ${ALERT_TO}.`,
    `Production: account ${PRD}, where the cloud team made the share with its directories and the SAS store-reports-app-prd; copy its token from the Shared access signature blade. Database ${DB_HOST[DB_PRD]}, same login, practice password ${DB_PASS[DB_PRD]}. Store S031 has dropped its first live report there.`,
    'Retail finance',
  ].join('\n\n'),
  source: 'Retail finance',
}

function start() {
  const sbx = newStorage(SBX, { shares: { 'label-printers': newShare({ 'out/labels-0901.zpl': fileRec('^XA^FDH-100^FS^XZ', { t: at(1, 7) }) }, { dirs: ['', 'out'], quota: 10 }) } })
  const prd = newStorage(PRD, { shares: { [SHARE]: newShare({ [`inbox/${LIVE}`]: fileRec(LIVE_CSV, { t: at(1, 7, 40), owner: 'S031-BOS' }) }, { dirs: ['', ...DIRS], quota: QUOTA }) } })
  const local = { home: 'C:\\Users\\you\\brightmart', files: { [GOOD]: fileRec(GOOD_CSV, { t: at(1, 8) }), [BAD]: fileRec(BAD_CSV, { t: at(1, 8, 5) }) } }
  const table = labTable('dbo', 'store_daily_sales', [['store_id', 'varchar(8)'], ['sales_date', 'date'], ['tills', 'int'], ['gross', 'decimal(12,2)'], ['refunds', 'decimal(12,2)'], ['net', 'decimal(12,2)'], ['file_name', 'varchar(80)', true], ['loaded_at', 'datetime2', true]], ['store_id', 'sales_date'])
  const db = (name) =>
    newSqlServer(name, {
      host: DB_HOST[name], database: 'BrightmartReporting', dbid: 11, tables: { [TABLE]: structuredClone(table) },
      logins: [{ name: 'BRIGHTMART\\dba', type: 'Windows login', password: null, disabled: false, defaultDb: 'BrightmartReporting', policy: false, failed: 0, sysadmin: true }, { name: DB_USER, type: 'SQL login', password: DB_PASS[name], disabled: false, defaultDb: 'BrightmartReporting', policy: true, failed: 0 }],
      users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }, { name: DB_USER, login: DB_USER, schema: 'dbo', roles: [], grants: { [TABLE]: ['SELECT', 'INSERT', 'UPDATE'] } }],
    })
  let s = newPlatform({
    clock: at(1, 8), mail: [MAIL], clients: [structuredClone(CLIENT)], studioPkgs: { [ASSET]: PKG }, studioXml: { [ASSET]: START_XML },
    systems: systemsOf({ storage: [sbx, prd], local }),
    databases: { created: at(1, 8), servers: { [DB_SBX]: db(DB_SBX), [DB_PRD]: db(DB_PRD) } },
  })
  s = createSas(s, PRD, { services: 'f', box: SHARE, perms: 'rwdlc', expires: s.clock + 30 * DAY, key: 'key1', name: 'store-reports-app-prd' }).state
  return until(s, at(1, 9))
}

const PROPS = { 'share.account': SBX, 'share.name': SHARE, 'share.inboxDir': 'inbox', 'share.processedDir': 'processed', 'share.errorDir': 'errors', 'db.host': DB_HOST[DB_SBX], 'db.port': '1433', 'db.database': 'BrightmartReporting', 'db.user': DB_USER }
const target = (a = SBX) => `share:${a}/${SHARE}`

const lab = {
  id: 'p-e2e-azure-files',
  group: 'End to end by system',
  title: 'End to end: store reports, Azure Files to SQL Server',
  minutes: 60,
  scenario: `The stores of Brightmart drop their end of day reports on an Azure file share, and retail finance copies them by hand. You build the Store Reports System API from the request to Production: the spec in Design Center, the Studio project from Exchange, the share, its directories and a SAS, the API instance, the deployment and the promotion. A report goes from inbox on ${SHARE}, through the poll of ${NAME} over the File REST API and a DataWeave groupBy, into one row per store and day in ${TABLE}. A report that does not parse first blocks the poll; you fix the error handler of the deployed mule-config.xml in the Flow editor, so it goes to errors and comes back through the replay of the API. The Inbox has the request.`,
  start,
  steps: [
    kit.steps.inbox('retail finance', 'the report layout, the row finance wants, the share and its directories, the database and who gets the alerts'),
    kit.steps.spec(),
    kit.steps.mock(),
    kit.steps.publish(),
    kit.steps.studio(),
    ask(
      'Mount or REST',
      `The store servers mount ${SHARE} as a drive. How does ${NAME} on CloudHub reach it?`,
      [
        'It mounts the share too, with the File connector',
        'It calls the Azure Files REST API over HTTPS with a SAS: List Directories and Files, Get File, Rename File. A CloudHub app has no mounted drives, and SMB on port 445 is not open from the cloud. A Mule runtime on an own server in the store network could mount it and use the File connector',
        'Through SFTP, which every Azure share offers',
        'It asks the stores to send the reports by mail instead',
      ],
      1,
      'Azure Files serves the same files over SMB and over REST. Pick the protocol by where the runtime runs. Over REST the SAS sets what the app may do on that one share, and the Activity log of the account shows each call.',
    ),
    kit.steps.export(START_XML, 'The project has the mule-config.xml below: the poll, the groupBy, the upsert and the rename into processed. '),
    {
      title: 'Create the file share',
      how: `Azure Files from the console menu, ${SBX}, File shares, + File share. Name ${SHARE}, Quota (GiB) ${QUOTA}. Create.`,
      done: shareOk,
    },
    {
      title: 'Create the directories',
      how: `Open ${SHARE}, Add directory, and make ${DIRS.join(', ')} at the top of the share.`,
      done: dirsOk,
    },
    {
      title: 'Generate the SAS of the app',
      how: `${SBX}, Shared access signature. Scope: File share ${SHARE}. Permissions Read, Write, Delete, List and Create: a rename into processed is a copy and a delete. No Add. Expiry after 30 days, signing key key1. Generate SAS and connection string, and keep the SAS token for the deployment.`,
      done: sasOk,
    },
    kit.steps.instance(),
    kit.steps.access(),
    {
      title: 'Deploy from the exported jar',
      how: `Runtime Manager, Deploy application. Application Name ${NAME}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties tab, Text view: share.account ${SBX}, share.name ${SHARE}, share.inboxDir inbox, share.processedDir processed, share.errorDir errors, db.host ${DB_HOST[DB_SBX]}, db.port 1433, db.database BrightmartReporting, db.user ${DB_USER}, api.id with the API Instance ID, anypoint.platform.client_id. Then in the Table view add share.sas, db.password and anypoint.platform.client_secret, each with Protect. Deploy, wait for Running, and check that the API instance is Active.`,
      done: deployedOk,
    },
    ask(
      'A report still being written',
      'A store server on a slow line is still writing its report when the poll lists inbox. What keeps the app from loading half a report?',
      [
        'Nothing, a share only shows finished files',
        'A file on a share is visible while it is written. The poll reads the size twice, a little apart, and skips a file whose size still changes; the next poll takes it. A writer that uses a temporary name and renames at the end solves it at the source',
        'A bigger quota',
        'Polling once a night after midnight',
      ],
      1,
      'Unlike a blob, which is committed in one step, a file on SMB grows while it is written. A size check or a naming rule with a rename at the end is the usual answer for file shares, SFTP and FTP alike.',
    ),
    {
      title: 'Drop the first store report',
      how: `Azure Files, ${SBX}, File shares, ${SHARE}, inbox, Upload, Browse for files ${GOOD}. Upload. Move the clock a minute. The log shows 3 tills of S014 grouped into one row, and the report is in processed.`,
      done: loadedOk,
    },
    {
      title: 'Follow one record',
      how: `Lab tools, API client. Application ${NAME}, Send as ${CLIENT.name}, GET /reports/${GOOD}: the answer has the correlationId of the run. Runtime Manager, ${NAME}, Logs: search that ID to see the pickup, the grouping and the upsert. Then Databases, ${DB_SBX}, New Query: SELECT * FROM ${TABLE} WHERE store_id = 'S014' and Execute. One row for 2026-11-03 with 3 tills, gross 3172.60, refunds 17.50, net 3155.10.`,
      done: tracedOk,
    },
    {
      title: 'Receive a report that does not parse',
      how: `Upload ${BAD} to inbox the same way and move the clock a minute. The poll fails with MULE:EXPRESSION: GROSS '1.204,50' is not an amount. The on-error-propagate of the try scope fails the whole poll, so the report stays in inbox, fails again every minute, and reports behind it wait. No row of S022 reached the table.`,
      done: failingOk,
    },
    {
      title: 'Fix the error handler in the Flow editor',
      how: `Lab tools, Flow editor, pick ${NAME}. In the error-handler of the try scope One report, add the on-error-continue below in front of the on-error-propagate, so a report that does not parse is renamed into errors and the poll goes on. Read the Problems view, then Deploy. Move the clock a minute: the report is in errors and the log says why. Lab made: the fix lives in the deployed app; in a project it goes into Studio too, before the next export.`,
      code: HANDLER,
      done: rejectedOk,
    },
    {
      title: 'Fix the report and replay it',
      how: `The store manager confirms 1204.50. In ${SHARE}, open errors, Upload with File name ${BAD} and the content of the report with 1204.50 in place of 1.204,50, which replaces the bad copy. Then API client, POST /reports/${BAD}/replay as ${CLIENT.name}: 202. Move the clock a minute. S022 has gross 1934.50.`,
      done: replayedOk,
    },
    kit.steps.alert(ALERT_TO),
    kit.steps.promote(),
    {
      title: 'Deploy to Production and see one record arrive',
      how: `Runtime Manager in Production, Deploy application, ${NAME} from the same jar. share.account ${PRD}, share.sas with the token of store-reports-app-prd (Shared access signature of ${PRD}, Token column), db.host ${DB_HOST[DB_PRD]} and its password, api.id of the Production instance, and the credentials of Production from Environment information. The jar still has the old error handler, so open the Production app in the Flow editor and deploy the same fix. Move the clock a minute. The live report of S031 loads, and Databases, ${DB_PRD} shows S031 on 2026-11-04 with net 3360.40.`,
      done: prodOk,
    },
  ],
  why: 'Retail finance needed the end of day reports of the stores, which land on an Azure file share, in the reporting database. I designed the Store Reports System API, mocked it, published it and imported it in Studio. Because CloudHub cannot mount SMB, the flow polls the share over the File REST API with a SAS, reads with a size check so a report that is still written is skipped, groups the tills per store and day with DataWeave and upserts on store and date, so a corrected report replaces its row. On the storage side the share has a quota and three directories, and the SAS covers that share only with the permissions the flow uses. In API Manager the instance has Client ID Enforcement and the dashboard has a contract. I deployed with the SAS and the database password protected, dropped a report and followed it from the correlation ID in the log to the row in SQL Server. A report with a German decimal first failed the whole poll, because the try scope propagated every error; I added an on-error-continue for EXPRESSION that renames the report into errors and redeployed the config. Then after the fix the replay operation renamed it back and it loaded. An alert goes to retail finance, and Production uses the same jar with its own account, SAS, database and API instance.',
  docs: 'https://learn.microsoft.com/en-us/azure/storage/files/storage-files-introduction',
  solve(s0) {
    let s = mark(s0, 'inbox')
    s = kit.solve.studio(kit.solve.design(s))
    s = addShare(s, SBX, SHARE, QUOTA)
    for (const d of DIRS) s = makeDir(s, target(), d)
    const made = createSas(s, SBX, { services: 'f', box: SHARE, perms: 'rwdlc', expires: s.clock + 30 * DAY, key: 'key1' })
    s = kit.solve.api(made.state)
    s = mark(kit.solve.deploy(s, PROPS, { 'share.sas': `?${made.token}`, 'db.password': DB_PASS[DB_SBX] }), `logs:${NAME}`)
    s = advance(putFile(s, target(), `inbox/${GOOD}`, GOOD_CSV), 2 * MINUTE)
    s = call(s, NAME, CLIENT, `/reports/${GOOD}`).state
    s = runSql(s, DB_SBX, `SELECT * FROM ${TABLE} WHERE store_id = 'S014'`).state
    s = advance(putFile(s, target(), `inbox/${BAD}`, BAD_CSV), 2 * MINUTE)
    s = advance(deployXml(s, NAME, FIXED_XML).state, 2 * MINUTE)
    s = putFile(s, target(), `errors/${BAD}`, FIXED_CSV)
    s = advance(call(s, NAME, CLIENT, `/reports/${BAD}/replay`, 'POST').state, 2 * MINUTE)
    s = addMonAlert(s, { title: 'Store reports failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = kit.solve.promote(s)
    const token = acc(s, PRD).sas.find((x) => x.name === 'store-reports-app-prd').token
    s = kit.solve.deploy(s, { ...PROPS, 'share.account': PRD, 'db.host': DB_HOST[DB_PRD] }, { 'share.sas': `?${token}`, 'db.password': DB_PASS[DB_PRD] })
    s = deployXml(s, NAME, FIXED_XML).state
    return advance(s, 2 * MINUTE)
  },
  answers: { 5: 1, 13: 1 },
}

export const LABS = [lab]
