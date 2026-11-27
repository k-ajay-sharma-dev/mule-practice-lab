// The end to end lab of SFTP. See platform-labs.js for the shape of a lab.
// The file also holds e2eKit: the steps and solve moves that the four file labs share (SFTP, FTP, Azure Blob and
// Azure Files): the spec in Design Center, Exchange, Studio with the package of the lab (state.studioPkgs), the API
// instance with Client ID Enforcement, the deployment from the exported jar and the promotion to Production.
import {
  addApi, addMonAlert, advance, apiStatus, appNamed, applyPolicy, at, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, pairing,
  projectRaml, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio, createProject,
} from '../platform.js'
import { ask, call, called, creds, until } from '../platform-kit.js'
import { newSqlServer, runSql, serverOf, tablesOf } from '../platform-db.js'
import { addServerUser, fileRec, knownHostsLine, knownKeys, newServerSys, newUserKey, putLocal, setServerUser, systemsOf, transfer } from '../platform-systems.js'
import { HEADER, PKG, TABLE } from './e2e-sftp.pkg.js'

import { e2eKit, rowsIn, labTable } from '../platform-e2e-kit.js'

// ---------- the lab ----------

const NAME = PKG
const ASSET = 'supplier-stock-files-system-api'
const TITLE = 'Supplier Stock Files System API'
const SBX = 'sftp-sbx.brightmart.lab'
const PRD = 'sftp.brightmart.lab'
const USER = 'mule_glenmore'
const PARTNER = 'glenmore_upload'
const HOME = '/suppliers/glenmore'
const IN = `${HOME}/in`
const ARCHIVE = `${HOME}/archive`
const ERROR = `${HOME}/error`
const PRD_KEY = 'mule_glenmore-prd.pem'
const DB_SBX = 'stock-sql-sbx'
const DB_PRD = 'stock-sql-prd'
const DB_HOST = { [DB_SBX]: 'sql-sbx.brightmart.lab', [DB_PRD]: 'sql-prd.brightmart.lab' }
const DB_USER = 'mule_stock_sync'
const DB_PASS = { [DB_SBX]: 'Stock-Sbx-Lab-1', [DB_PRD]: 'Stock-Prd-Lab-7' } // practice values of the lab
const ALERT_TO = 'supply-integration@brightmart.example'
const CLIENT = { name: 'Supply Ops Portal', clientId: 'sop-3a71c0', clientSecret: 'sop-secret-58e1' }
const GOOD = 'stock-glenmore-20261103.csv'
const BAD = 'stock-glenmore-20261103-2.csv'
const LIVE = 'stock-glenmore-20261104.csv'
const GOOD_CSV = `${HEADER}\n1001;D1;240\n1002;D1;0\n1003;R2;75\n1004;R2;310\n`
const BAD_CSV = `${HEADER}\n2001;D1;12\n2002;D1;many\n2003;R2;8\n`
const FIXED_CSV = `${HEADER}\n2001;D1;12\n2002;D1;120\n2003;R2;8\n`
const LIVE_CSV = `${HEADER}\n1001;D1;228\n1005;R2;40\n`

const RAML = `#%RAML 1.0
title: ${TITLE}
version: v1
mediaType: application/json
types:
  StockFile:
    properties:
      name: string
      status:
        enum: [waiting, loaded, rejected, replayed]
      rows: integer
      problem?: string
      correlationId?: string
/stock-files:
  get:
    description: The stock files of the last days and what happened to each
    responses:
      200:
        body:
          type: StockFile[]
          example: |
            [ { "name": "${GOOD}", "status": "loaded", "rows": 4, "correlationId": "5f2c81aa-c7a1-11f1" } ]
  /{name}:
    get:
      description: One stock file, with the correlation ID of the run that handled it
      responses:
        200:
          body:
            type: StockFile
            example: |
              { "name": "${GOOD}", "status": "loaded", "rows": 4, "correlationId": "5f2c81aa-c7a1-11f1" }
        404:
          body:
            example: |
              { "message": "No such stock file" }
    /replay:
      post:
        description: Move a fixed file from the error folder back to the inbox, so the listener loads it again
        responses:
          202:
            body:
              example: |
                { "name": "${BAD}", "status": "replayed" }
          404:
            body:
              example: |
                { "message": "The file is not in the error folder" }
`

const FLOW_XML = `<sftp:config name="SFTP_Config">
  <sftp:connection host="\${sftp.host}" port="\${sftp.port}" username="\${sftp.user}"
      identityFile="\${secure::sftp.identityFile}" knownHostsFile="\${sftp.knownHosts}" />
</sftp:config>
<db:config name="Stock_DB_Config">
  <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}"
      user="\${db.user}" password="\${secure::db.password}" />
</db:config>

<flow name="stock-file-listener">
  <sftp:listener config-ref="SFTP_Config" directory="\${sftp.inDir}" autoDelete="false"
      timeBetweenSizeCheck="\${sftp.timeBetweenSizeCheck}" timeBetweenSizeCheckUnit="SECONDS">
    <scheduling-strategy><fixed-frequency frequency="60000" /></scheduling-strategy>
    <sftp:matcher filenamePattern="*.csv" />
  </sftp:listener>
  <ee:transform doc:name="Stock lines to rows">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
input payload application/csv separator=";"
output application/java
var sites = { "D1": "DUB-1", "R2": "ROT-2" }
---
payload map (line) -> {
  sku: "GLM-" ++ line.item_code,
  warehouse: sites[line.site] default fail("Unknown site " ++ line.site),
  available: line.on_hand as Number,
  supplier: "GLENMORE",
  file_name: attributes.fileName
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <foreach>
    <!-- upsert on the key of the table: UPDATE, and INSERT when no row was updated -->
    <db:update config-ref="Stock_DB_Config"><db:sql>UPDATE dbo.supplier_stock SET available = :available,
      supplier = :supplier, file_name = :file_name, updated_at = SYSDATETIME()
      WHERE sku = :sku AND warehouse = :warehouse</db:sql><db:input-parameters>#[payload]</db:input-parameters></db:update>
    <choice><when expression="#[payload.affectedRows == 0]">
      <db:insert config-ref="Stock_DB_Config"><db:sql>INSERT INTO dbo.supplier_stock (...) VALUES (...)</db:sql></db:insert>
    </when></choice>
  </foreach>
  <sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="\${sftp.archiveDir}" overwrite="true" />
  <error-handler>
    <on-error-continue type="EXPRESSION, CSV:PARSE">
      <sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]" targetPath="\${sftp.errorDir}" overwrite="true" />
    </on-error-continue>
  </error-handler>
</flow>`

const kit = e2eKit({ title: TITLE, assetId: ASSET, raml: RAML, calls: [['GET', '/stock-files'], ['GET', `/stock-files/${GOOD}`], ['POST', `/stock-files/${BAD}/replay`]], mock: 'GET /stock-files', pkg: PKG, name: NAME, client: CLIENT, label: 'supplier-stock-sbx' })
const { check } = kit

const srvOf = (s, host) => s.systems?.servers?.[host]
const user = (s) => srvOf(s, SBX)?.users?.[USER]
const store = (s, env = 'Sandbox') => check.appIn(s, env)?.store ?? {}
const fileIn = (s, name, env = 'Sandbox') => (store(s, env).files ?? []).find((x) => x.name === name)
const row = (s, db, sku, wh) => rowsIn(s, db, TABLE).find((r) => r.sku === sku && r.warehouse === wh)
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((d) => list.includes(d))

const userOk = (s) => Boolean(user(s)) && user(s).home === HOME && user(s).password === undefined && Boolean(user(s).key) && user(s).key !== 'glenmore-upload.pem' && Boolean(s.systems.local.files[user(s).key])
const rightsOk = (s) => {
  const u = user(s)
  if (!userOk(s) || u.readOnly || u.locked) return false
  const reads = !u.readDirs || (u.readDirs.includes(IN) && u.readDirs.every((d) => [IN, ARCHIVE, ERROR].includes(d)))
  return sameSet(u.writeDirs, [IN, ARCHIVE, ERROR]) && reads
}
// the properties of one environment: the SFTP server, its pinned host key, the key file, and the database
const propsOk = (s, env) => {
  const a = check.appIn(s, env)
  const p = (k) => check.prop(a, k)
  const host = env === 'Production' ? PRD : SBX
  const db = env === 'Production' ? DB_PRD : DB_SBX
  const key = env === 'Production' ? PRD_KEY : user(s)?.key
  const wait = Number(p('sftp.timeBetweenSizeCheck'))
  return (
    Boolean(a) && p('sftp.host') === host && p('sftp.port') === '22' && p('sftp.user') === USER && p('sftp.inDir') === IN && p('sftp.archiveDir') === ARCHIVE && p('sftp.errorDir') === ERROR && wait >= 2 && wait <= 60 &&
    knownKeys(p('sftp.knownHosts'), host, 22).includes(srvOf(s, host).hostKey.pub) && a.secrets['sftp.identityFile'] === key && !a.props['sftp.identityFile'] &&
    p('db.host') === DB_HOST[db] && p('db.port') === '1433' && p('db.database') === 'BrightmartStock' && p('db.user') === DB_USER && a.secrets['db.password'] === DB_PASS[db] && !a.props['db.password']
  )
}
const deployedOk = (s) => rightsOk(s) && check.linked(s) && propsOk(s, 'Sandbox')
const loadedOk = (s) => deployedOk(s) && Boolean(srvOf(s, SBX).files[`${ARCHIVE}/${GOOD}`]) && !srvOf(s, SBX).files[`${IN}/${GOOD}`] && fileIn(s, GOOD)?.status === 'loaded' && row(s, DB_SBX, 'GLM-1003', 'ROT-2')?.available === 75
const tracedOk = (s) => loadedOk(s) && called(s, NAME, 200, 'GET', new RegExp(`^/stock-files/${GOOD.replace(/\./g, '\\.')}`)) && (s.seen[`db-select:${DB_SBX}:${TABLE}`] ?? -1) >= fileIn(s, GOOD).t
const rejectedOk = (s) => deployedOk(s) && Boolean(fileIn(s, BAD)?.rejected) && Boolean(srvOf(s, SBX).files[`${ERROR}/${BAD}`] || fileIn(s, BAD).replayed) && !row(s, DB_SBX, 'GLM-2001', 'DUB-1') === !fileIn(s, BAD).replayed
const replayedOk = (s) => deployedOk(s) && fileIn(s, BAD)?.status === 'loaded' && Boolean(fileIn(s, BAD).replayed) && row(s, DB_SBX, 'GLM-2002', 'DUB-1')?.available === 120 && called(s, NAME, 202, 'POST', /\/replay$/)
const prodOk = (s) => check.linked(s, 'Production') && propsOk(s, 'Production') && row(s, DB_PRD, 'GLM-1005', 'ROT-2')?.available === 40 && fileIn(s, LIVE, 'Production')?.status === 'loaded'

const MAIL = {
  t: at(1, 8, 40),
  to: 'ops@brightmart.example',
  subject: 'Glenmore Supplies stock feed over SFTP: please build it',
  body: [
    'Hello integration team,',
    `Glenmore Supplies, our new supplier of paper goods, sends its stock as a CSV file over SFTP whenever its stock changes, about 30 files a day of up to 5 MB, more at month end. Supply planning wants every line in the stock database within a few minutes, so the planners see what Glenmore can deliver.`,
    `The file has the columns item_code;site;on_hand, separated by semicolons. Our SKU is GLM- and the item code. Site D1 is our warehouse DUB-1 and R2 is ROT-2. on_hand is the available quantity. Glenmore sends its whole list again on each change, so the same item comes many times: keep one row per SKU and warehouse.`,
    `SFTP: Sandbox server ${SBX}. Glenmore uploads as ${PARTNER} to ${IN}. Please give the app its own user ${USER}, home ${HOME}, key login only, with rights on ${IN}, ${ARCHIVE} and ${ERROR} and nothing else. Loaded files go to ${ARCHIVE}. A file that does not parse goes to ${ERROR}, whole, so Glenmore can see it, and no line of it may reach the database. The link of Glenmore is slow: wait 5 seconds between the two size checks.`,
    `Database: the DBA made the table ${TABLE} in BrightmartStock on ${DB_HOST[DB_SBX]}, port 1433, with the login ${DB_USER} (SELECT, INSERT and UPDATE on that table only). Practice password for Sandbox: ${DB_PASS[DB_SBX]}.`,
    `Supply Ops Portal needs an API to see what happened to each file and to replay a file once it is fixed. Failures go to ${ALERT_TO}.`,
    `Production: server ${PRD}, where the platform team made ${USER} with the same folders; its key file is ${PRD_KEY} on your computer. Database ${DB_HOST[DB_PRD]}, same login, practice password ${DB_PASS[DB_PRD]}. Glenmore has put its first live file there already.`,
    'Supply planning',
  ].join('\n\n'),
  source: 'Supply planning',
}

function start() {
  const partner = { [PARTNER]: { key: 'glenmore-upload.pem', home: HOME, readDirs: [IN], writeDirs: [IN] } }
  const dirs = ['/', '/suppliers', HOME, IN, ARCHIVE, ERROR, '/suppliers/tidewell', '/suppliers/tidewell/in']
  const sbx = newServerSys(SBX, { ip: '10.20.5.31', users: { ...partner, tidewell_upload: { key: 'tidewell-upload.pem', home: '/suppliers/tidewell' } }, dirs })
  const prd = newServerSys(PRD, {
    ip: '10.20.6.21',
    users: { ...partner, [USER]: { key: PRD_KEY, home: HOME, writeDirs: [IN, ARCHIVE, ERROR] } },
    dirs,
    files: { [`${IN}/${LIVE}`]: fileRec(LIVE_CSV, { t: at(1, 7, 55), owner: PARTNER }) },
  })
  const local = { home: 'C:\\Users\\you\\brightmart', files: { [GOOD]: fileRec(GOOD_CSV, { t: at(1, 8, 30) }), [BAD]: fileRec(BAD_CSV, { t: at(1, 8, 35) }), [PRD_KEY]: fileRec('-----BEGIN LAB KEY FILE-----\n(practice key file, not a real key)\n-----END LAB KEY FILE-----\n', { t: at(1, 7) }) } }
  const table = labTable('dbo', 'supplier_stock', [['sku', 'varchar(16)'], ['warehouse', 'varchar(8)'], ['available', 'int'], ['supplier', 'varchar(16)'], ['file_name', 'varchar(80)', true], ['updated_at', 'datetime2', true]], ['sku', 'warehouse'])
  const db = (name) =>
    newSqlServer(name, {
      host: DB_HOST[name], database: 'BrightmartStock', dbid: 8, tables: { [TABLE]: structuredClone(table) },
      logins: [{ name: 'BRIGHTMART\\dba', type: 'Windows login', password: null, disabled: false, defaultDb: 'BrightmartStock', policy: false, failed: 0, sysadmin: true }, { name: DB_USER, type: 'SQL login', password: DB_PASS[name], disabled: false, defaultDb: 'BrightmartStock', policy: true, failed: 0 }],
      users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }, { name: DB_USER, login: DB_USER, schema: 'dbo', roles: [], grants: { [TABLE]: ['SELECT', 'INSERT', 'UPDATE'] } }],
    })
  const s = newPlatform({
    clock: at(1, 8), mail: [MAIL], clients: [structuredClone(CLIENT)], studioPkgs: { [ASSET]: PKG },
    systems: systemsOf({ servers: [sbx, prd], local }),
    databases: { created: at(1, 8), servers: { [DB_SBX]: db(DB_SBX), [DB_PRD]: db(DB_PRD) } },
  })
  return until(s, at(1, 9))
}

const sbxProps = (s) => ({
  'sftp.host': SBX, 'sftp.port': '22', 'sftp.user': USER, 'sftp.inDir': IN, 'sftp.archiveDir': ARCHIVE, 'sftp.errorDir': ERROR, 'sftp.timeBetweenSizeCheck': '5', 'sftp.knownHosts': knownHostsLine(SBX, srvOf(s, SBX)),
  'db.host': DB_HOST[DB_SBX], 'db.port': '1433', 'db.database': 'BrightmartStock', 'db.user': DB_USER,
})

const lab = {
  id: 'p-e2e-sftp',
  group: 'End to end by system',
  title: 'End to end: supplier stock files, SFTP to SQL Server',
  minutes: 60,
  scenario: `Supply planning signed Glenmore Supplies, which sends its stock as CSV files over SFTP. You build the whole integration: the Supplier Stock Files System API in Design Center, the Studio project from Exchange, the SFTP user and its rights, the API instance, the deployment, and Production. A record goes from a file in ${IN} on ${SBX}, through the listener of ${NAME} and its DataWeave mapping, into ${TABLE} on the stock database. A bad file goes to the error folder and comes back through the replay of the API. The Inbox has the request.`,
  start,
  steps: [
    kit.steps.inbox('supply planning', 'the file layout, the mapping, the folders, the database and who gets the alerts'),
    kit.steps.spec(),
    kit.steps.mock(),
    kit.steps.publish(),
    kit.steps.studio(),
    ask(
      'Insert or upsert',
      'Glenmore sends its whole list again on every change, and a fixed file can be replayed. How does the flow write a line?',
      [
        'INSERT each line. The newest row wins when the planners read',
        `UPDATE the row of that SKU and warehouse, and INSERT it when no row was updated. The key of ${TABLE} is sku and warehouse, so a line that comes twice changes one row and a replay is safe`,
        'Delete the table and insert the whole file each time',
        'Keep the names of the files in an Object Store and never read a file twice',
      ],
      1,
      'An upsert on the business key makes the load idempotent: the same file twice, or a replay, gives the same table. A plain INSERT fails on the primary key with error 2627, or makes duplicates where there is no key. Deleting and reloading leaves the table empty for the planners while it runs. A list of names does not help when Glenmore sends a changed file with the same name.',
    ),
    kit.steps.export(FLOW_XML, 'The listener, the mapping and the upsert are written already. '),
    {
      title: 'Create the SFTP user with a key',
      how: `SFTP and FTP from the console menu, host ${SBX}, Server tab, Add user. User name ${USER}, Home folder ${HOME}, Password empty. Save. Then ${USER}, Edit, Make a new key pair, Save. The private key file lands on the local site of the client.`,
      done: userOk,
    },
    {
      title: 'Give the user its folders only',
      how: `Server tab, ${USER}, Edit. Under Write pick Only the folders ticked and tick ${IN}, ${ARCHIVE} and ${ERROR}. A move is a write on the folder it leaves and the one it enters. Save.`,
      done: rightsOk,
    },
    kit.steps.instance(),
    kit.steps.access(),
    {
      title: 'Deploy from the exported jar',
      how: `Runtime Manager, Deploy application. Application Name ${NAME}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties tab, Text view: sftp.host ${SBX}, sftp.port 22, sftp.user ${USER}, sftp.inDir ${IN}, sftp.archiveDir ${ARCHIVE}, sftp.errorDir ${ERROR}, sftp.timeBetweenSizeCheck 5, sftp.knownHosts with the known_hosts line of the Server tab, db.host ${DB_HOST[DB_SBX]}, db.port 1433, db.database BrightmartStock, db.user ${DB_USER}, api.id with the API Instance ID, anypoint.platform.client_id. Then in the Table view add sftp.identityFile (the name of the key file), db.password and anypoint.platform.client_secret, each with Protect. Deploy, wait for Running, and check that the API instance is Active.`,
      done: deployedOk,
    },
    ask(
      'Large files',
      'At month end Glenmore sends one file of 400 MB. What keeps the app healthy?',
      [
        'Give the app more vCores',
        'Read the file as a stream and write the rows in blocks, for example with a batch job or foreach with a batch size, so the whole file is never in memory. Keep the size check, so a file that is still uploading is skipped',
        'Ask Glenmore to send smaller files and change nothing',
        'Set the poll to once a day',
      ],
      1,
      'The SFTP connector gives the content as a repeatable stream that buffers to disk after a limit, and DataWeave reads CSV as a stream when the script uses each line once. Writing in blocks keeps the memory flat and the number of database round trips low. A bigger replica only moves the point where the app runs out of memory.',
    ),
    {
      title: 'Drop the first stock file',
      how: `SFTP and FTP, Quickconnect to ${SBX} as ${USER} with its key file and trust the host key. Open ${IN}, pick ${GOOD} on the local site and Upload. Move the clock a minute. The listener loads 4 lines and the file is in ${ARCHIVE}.`,
      done: loadedOk,
    },
    {
      title: 'Follow one record',
      how: `Lab tools, API client. Application ${NAME}, Send as ${CLIENT.name}, GET /stock-files/${GOOD}: the answer has the correlationId of the run. Runtime Manager, ${NAME}, Logs: search that ID to see the pickup, the mapping and the upsert. Then Databases, ${DB_SBX}, New Query: SELECT * FROM ${TABLE} WHERE sku = 'GLM-1003' and Execute. Item 1003 of site R2 is GLM-1003 in ROT-2 with 75 available. The table has 4 rows.`,
      done: tracedOk,
    },
    {
      title: 'Send a file that does not parse',
      how: `Upload ${BAD} to ${IN} the same way and move the clock a minute. The log warns that line 3 has on_hand 'many', and the file is in ${ERROR}. No line of it reached the table.`,
      done: rejectedOk,
    },
    {
      title: 'Fix the file and replay it',
      how: `Glenmore confirms that item 2002 has 120. In the client, local site, New file: Name ${BAD}, the same lines with 120 in place of many. Save on this computer. Open ${ERROR} and Upload it over the bad copy. Then API client, POST /stock-files/${BAD}/replay as ${CLIENT.name}: 202. Move the clock a minute. GLM-2002 in DUB-1 has 120 available.`,
      done: replayedOk,
    },
    kit.steps.alert(ALERT_TO),
    ask(
      'What changes in Production',
      'What is different in the Production deployment?',
      [
        'Nothing, the same properties work everywhere',
        `The jar is the same. The properties change: the SFTP host and its known_hosts line, the key file, the database host and password, api.id of the Production instance, and the client ID and secret of Production`,
        'A new jar built with Production values inside',
        'Only api.id',
      ],
      1,
      'One build moves through the environments and the configuration changes around it. Keep the values per environment in the properties of Runtime Manager or in a secure properties file per environment, with the secrets protected. The host key is pinned per server, so a new server needs its own line.',
    ),
    kit.steps.promote(),
    {
      title: 'Deploy to Production and see one record arrive',
      how: `Runtime Manager in Production, Deploy application, ${NAME} from the same jar. The same properties with the Production values: sftp.host ${PRD} and its known_hosts line from the Server tab of ${PRD}, sftp.identityFile ${PRD_KEY}, db.host ${DB_HOST[DB_PRD]} and its password, api.id of the Production instance, and the credentials of Production from Environment information. Move the clock a minute. The live file of Glenmore loads, and Databases, ${DB_PRD} shows GLM-1005 in ROT-2 with 40 available.`,
      done: prodOk,
    },
  ],
  why: 'Supply planning needed the stock of Glenmore in the stock database. I designed the Supplier Stock Files System API in Design Center, tried it in the mocking service and published it to Exchange. In Studio I imported the spec, wrote the SFTP listener with a size check, a DataWeave mapping from item_code and site to our SKU and warehouse, and an upsert on sku and warehouse, so a repeated or replayed file is safe. On the SFTP server the app got its own user with a key and write rights on its inbox, archive and error folders only, and the host key is pinned. In API Manager the instance has Client ID Enforcement and the portal has a contract. I deployed the exported jar with the properties of Sandbox and protected secrets, dropped a file, and followed one line from the correlation ID in the log to the row in SQL Server. A bad file went whole to the error folder, and after the fix the replay operation put it back for the listener. An alert reaches the supply team, and Production uses the same jar with its own host, key, database and API instance.',
  docs: 'https://docs.mulesoft.com/sftp-connector/latest/',
  solve(s0) {
    let s = mark(s0, 'inbox')
    s = kit.solve.studio(kit.solve.design(s))
    s = addServerUser(s, SBX, USER, { home: HOME })
    const k = newUserKey(s, SBX, USER)
    s = setServerUser(k.state, SBX, USER, { writeDirs: [IN, ARCHIVE, ERROR] }, { who: 'admin' })
    s = kit.solve.api(s)
    const props = sbxProps(s)
    s = mark(kit.solve.deploy(s, props, { 'sftp.identityFile': k.file, 'db.password': DB_PASS[DB_SBX] }), `logs:${NAME}`)
    const auth = { user: USER, key: k.file }
    s = advance(transfer(s, { direction: 'upload', host: SBX, auth, local: GOOD, remote: `${IN}/${GOOD}` }).state, 2 * MINUTE)
    s = call(s, NAME, CLIENT, `/stock-files/${GOOD}`).state
    s = runSql(s, DB_SBX, `SELECT * FROM ${TABLE} WHERE sku = 'GLM-1003'`).state
    s = advance(transfer(s, { direction: 'upload', host: SBX, auth, local: BAD, remote: `${IN}/${BAD}` }).state, 2 * MINUTE)
    s = putLocal(s, BAD, FIXED_CSV)
    s = transfer(s, { direction: 'upload', host: SBX, auth, local: BAD, remote: `${ERROR}/${BAD}` }).state
    s = advance(call(s, NAME, CLIENT, `/stock-files/${BAD}/replay`, 'POST').state, 2 * MINUTE)
    s = addMonAlert(s, { title: 'Glenmore stock feed failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = kit.solve.promote(s)
    const prd = { ...props, 'sftp.host': PRD, 'sftp.knownHosts': knownHostsLine(PRD, srvOf(s, PRD)), 'db.host': DB_HOST[DB_PRD] }
    s = kit.solve.deploy(s, prd, { 'sftp.identityFile': PRD_KEY, 'db.password': DB_PASS[DB_PRD] })
    return advance(s, 2 * MINUTE)
  },
  answers: { 5: 1, 12: 1, 18: 1 },
}

export const LABS = [lab]
