// The end to end lab of FTP. See platform-labs.js for the shape of a lab, and e2eKit in e2e-sftp.lab.js for the steps
// the four file labs share.
import { addMonAlert, advance, at, mark, MINUTE, newPlatform } from '../platform.js'
import { ask, call, called, until } from '../platform-kit.js'
import { newOracle, runSql } from '../platform-db.js'
import { addServerUser, fileRec, newServerSys, setServerSettings, systemsOf, transfer } from '../platform-systems.js'
import { e2eKit, labTable, rowsIn } from '../platform-e2e-kit.js'
import { HEADER, PKG, TABLE } from './e2e-ftp.pkg.js'

const NAME = PKG
const ASSET = 'partner-price-files-system-api'
const TITLE = 'Partner Price Files System API'
const SBX = 'ftp-sbx.brightmart.lab'
const PRD = 'ftp.brightmart.lab'
const USER = 'mule_kestrel'
const PARTNER = 'kestrel_ftp'
const HOME = '/partners/kestrel'
const IN = `${HOME}/prices`
const DONE = `${HOME}/done`
const ERROR = `${HOME}/error`
const PASSWORD = 'lab-practice-ftp-7' // the practice password of the solution; the learner picks any
const PRD_PASSWORD = 'lab-practice-ftp-prd-2' // set by the platform team, a practice value
const DB_SBX = 'pricing-ora-sbx'
const DB_PRD = 'pricing-ora-prd'
const DB_HOST = { [DB_SBX]: 'ora-sbx.brightmart.lab', [DB_PRD]: 'ora-prd.brightmart.lab' }
const DB_USER = 'MULE_PRICES'
const DB_PASS = { [DB_SBX]: 'Prices-Sbx-Lab-3', [DB_PRD]: 'Prices-Prd-Lab-5' } // practice values of the lab
const ALERT_TO = 'pricing-team@brightmart.example'
const CLIENT = { name: 'Pricing Desk', clientId: 'prc-6d02f1', clientSecret: 'prc-secret-93a4' }
const GOOD = 'prices-kestrel-20261103.zip'
const BAD = 'prices-kestrel-20261103-b.zip'
const LIVE = 'prices-kestrel-20261104.zip'
// Lab made: a zip holds one price list; the lab keeps that text as the content of the zip
const GOOD_CSV = `${HEADER}\n40011|249|EUR|20261104\n40012|1890|EUR|20261104\n40013|375|EUR|20261104\n`
const BAD_CSV = `${HEADER}\n40021|512|EUR|20261104\n40022|99|EUR|20261104\n`
const LIVE_CSV = `${HEADER}\n40011|259|EUR|20261105\n40031|1450|EUR|20261105\n`

const RAML = `#%RAML 1.0
title: ${TITLE}
version: v1
mediaType: application/json
types:
  PriceFile:
    properties:
      name: string
      status:
        enum: [waiting, loaded, rejected, replayed]
      rows: integer
      problem?: string
      correlationId?: string
/price-files:
  get:
    description: The price files of Kestrel Foods and what happened to each
    responses:
      200:
        body:
          type: PriceFile[]
          example: |
            [ { "name": "${GOOD}", "status": "loaded", "rows": 3, "correlationId": "0b7d33e1-c7a1-11f1" } ]
  /{name}:
    get:
      description: One price file, with the correlation ID of the run that handled it
      responses:
        200:
          body:
            type: PriceFile
            example: |
              { "name": "${GOOD}", "status": "loaded", "rows": 3, "correlationId": "0b7d33e1-c7a1-11f1" }
        404:
          body:
            example: |
              { "message": "No such price file" }
    /replay:
      post:
        description: Move a file from the error folder back to the price folder, so the listener reads it again
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

const FLOW_XML = `<ftp:config name="FTP_Config">
  <ftp:connection host="\${ftp.host}" port="\${ftp.port}" username="\${ftp.user}" password="\${secure::ftp.password}"
      passive="\${ftp.passive}" transferMode="\${ftp.transferMode}" />
</ftp:config>
<db:config name="Pricing_DB_Config">
  <db:oracle-connection host="\${db.host}" port="\${db.port}" serviceName="\${db.service}"
      user="\${db.user}" password="\${secure::db.password}" />
</db:config>

<flow name="price-file-listener">
  <ftp:listener config-ref="FTP_Config" directory="\${ftp.inDir}" timeBetweenSizeCheck="2" timeBetweenSizeCheckUnit="SECONDS">
    <scheduling-strategy><fixed-frequency frequency="300000" /></scheduling-strategy>
    <ftp:matcher filenamePattern="*.zip" />
  </ftp:listener>
  <set-variable variableName="fileName" value="#[attributes.fileName]" />
  <compression:extract><compression:compressed>#[payload]</compression:compressed>
    <compression:extractor><compression:zip-extractor /></compression:extractor></compression:extract>
  <ee:transform doc:name="Price list to rows">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/java
var prices = read(valuesOf(payload)[0], "application/csv", { separator: "|" })
---
prices map (p) -> {
  sku: "KF-" ++ p.ART_NO,
  price: (p.NET_PRICE_CT as Number) / 100,
  currency: p.CURR,
  validFrom: p.VALID_FROM as Date { format: "yyyyMMdd" },
  file: vars.fileName
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <foreach>
    <!-- never let an older price win: update only when the stored price is not newer -->
    <db:update config-ref="Pricing_DB_Config"><db:sql>UPDATE BRIGHTMART.SUPPLIER_PRICES
      SET PRICE = :price, CURRENCY = :currency, VALID_FROM = :validFrom, FILE_NAME = :file
      WHERE SKU = :sku AND VALID_FROM &lt;= :validFrom</db:sql><db:input-parameters>#[payload]</db:input-parameters></db:update>
    <!-- 0 rows: INSERT when the SKU is new, skip when the table holds a newer price -->
  </foreach>
  <ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="\${ftp.doneDir}" overwrite="true" />
  <error-handler>
    <on-error-continue type="COMPRESSION:INVALID_ARCHIVE, EXPRESSION">
      <ftp:move config-ref="FTP_Config" sourcePath="#[attributes.path]" targetPath="\${ftp.errorDir}" overwrite="true" />
    </on-error-continue>
  </error-handler>
</flow>`

const kit = e2eKit({ title: TITLE, assetId: ASSET, raml: RAML, calls: [['GET', '/price-files'], ['GET', `/price-files/${GOOD}`], ['POST', `/price-files/${BAD}/replay`]], mock: 'GET /price-files', pkg: PKG, name: NAME, client: CLIENT, label: 'partner-prices-sbx' })
const { check } = kit

const srvOf = (s, host) => s.systems?.servers?.[host]
const user = (s) => srvOf(s, SBX)?.users?.[USER]
const store = (s, env = 'Sandbox') => check.appIn(s, env)?.store ?? {}
const fileIn = (s, name, env = 'Sandbox') => (store(s, env).files ?? []).find((x) => x.name === name)
const row = (s, db, sku) => rowsIn(s, db, TABLE).find((r) => r.SKU === sku)
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((d) => list.includes(d))

const userOk = (s) => Boolean(user(s)) && user(s).home === HOME && Boolean(String(user(s).password ?? '')) && !user(s).locked
const rightsOk = (s) => {
  const u = user(s)
  if (!userOk(s) || u.readOnly) return false
  const reads = !u.readDirs || (u.readDirs.includes(IN) && u.readDirs.every((d) => [IN, DONE, ERROR].includes(d)))
  return sameSet(u.writeDirs, [IN, DONE, ERROR]) && reads
}
const passiveOk = (s) => srvOf(s, SBX)?.passive?.open === true
const propsOk = (s, env) => {
  const a = check.appIn(s, env)
  const p = (k) => check.prop(a, k)
  const prd = env === 'Production'
  const db = prd ? DB_PRD : DB_SBX
  return (
    Boolean(a) && p('ftp.host') === (prd ? PRD : SBX) && p('ftp.port') === '21' && p('ftp.user') === USER && p('ftp.passive').toLowerCase() === 'true' && p('ftp.transferMode').toUpperCase() === 'BINARY' &&
    p('ftp.inDir') === IN && p('ftp.doneDir') === DONE && p('ftp.errorDir') === ERROR && a.secrets['ftp.password'] === (prd ? PRD_PASSWORD : user(s)?.password) && !a.props['ftp.password'] &&
    p('db.host') === DB_HOST[db] && p('db.port') === '1521' && p('db.service') === 'PRICINGPDB' && p('db.user') === DB_USER && a.secrets['db.password'] === DB_PASS[db] && !a.props['db.password']
  )
}
const deployedOk = (s) => rightsOk(s) && passiveOk(s) && check.linked(s) && propsOk(s, 'Sandbox')
const loadedOk = (s) => deployedOk(s) && Boolean(srvOf(s, SBX).files[`${DONE}/${GOOD}`]) && !srvOf(s, SBX).files[`${DONE}/${GOOD}`].corrupt && fileIn(s, GOOD)?.status === 'loaded' && row(s, DB_SBX, 'KF-40013')?.PRICE === 3.75
const tracedOk = (s) => loadedOk(s) && called(s, NAME, 200, 'GET', new RegExp(`^/price-files/${GOOD.replace(/\./g, '\\.')}`)) && (s.seen[`db-select:${DB_SBX}:${TABLE}`] ?? -1) >= fileIn(s, GOOD).t
const rejectedOk = (s) => deployedOk(s) && Boolean(fileIn(s, BAD)?.rejected) && Boolean(srvOf(s, SBX).files[`${ERROR}/${BAD}`] || fileIn(s, BAD).replayed) && (Boolean(fileIn(s, BAD).replayed) || !row(s, DB_SBX, 'KF-40021'))
const replayedOk = (s) => deployedOk(s) && fileIn(s, BAD)?.status === 'loaded' && Boolean(fileIn(s, BAD).replayed) && row(s, DB_SBX, 'KF-40021')?.PRICE === 5.12 && called(s, NAME, 202, 'POST', /\/replay$/)
const prodOk = (s) => check.linked(s, 'Production') && propsOk(s, 'Production') && row(s, DB_PRD, 'KF-40031')?.PRICE === 14.5 && fileIn(s, LIVE, 'Production')?.status === 'loaded'

const MAIL = {
  t: at(1, 8, 35),
  to: 'ops@brightmart.example',
  subject: 'Kestrel Foods price files: please take them over',
  body: [
    'Hello integration team,',
    `Kestrel Foods sends us its new purchase prices every evening, and today a buyer types them in by hand. Their system is old and speaks only plain FTP. It uploads one zip per day, about 2 MB with 8000 prices, as ${PARTNER} to ${IN} on our FTP server. Please load the prices into the pricing database.`,
    `The zip holds one list with the columns ART_NO|NET_PRICE_CT|CURR|VALID_FROM. Our SKU is KF- and the ART_NO. The price is in cents, the database wants euros. VALID_FROM is yyyyMMdd. Kestrel sometimes sends an older file again: an older price must never overwrite a newer one.`,
    `FTP: Sandbox server ${SBX}, port 21. The app needs its own user ${USER} with home ${HOME} and rights on ${IN}, ${DONE} and ${ERROR} only. The server is behind a firewall whose passive ports 50000 to 50100 are not open yet. Loaded zips go to ${DONE}. A zip that does not open goes to ${ERROR}, whole. Kestrel's client has been known to send in ASCII mode by mistake. Poll every 5 minutes.`,
    `Database: Oracle on ${DB_HOST[DB_SBX]}, port 1521, service PRICINGPDB, table ${TABLE}, login ${DB_USER} (practice password ${DB_PASS[DB_SBX]}).`,
    `The Pricing Desk wants an API to see each file and to replay one after a fix. Failures go to ${ALERT_TO}.`,
    `Production: server ${PRD}. The platform team made ${USER} there with the same folders and the practice password ${PRD_PASSWORD}, and its passive ports are open. Database ${DB_HOST[DB_PRD]}, same service and login, practice password ${DB_PASS[DB_PRD]}. Kestrel has put its first live zip there already.`,
    'Pricing team',
  ].join('\n\n'),
  source: 'Pricing team',
}

function start() {
  const partner = { [PARTNER]: { password: 'lab-kestrel-legacy', home: HOME, readDirs: [IN], writeDirs: [IN] } }
  const dirs = ['/', '/partners', HOME, IN, DONE, ERROR, '/backup']
  const zip = (csv, t, owner) => fileRec(csv, { size: 18432, t, owner, binary: true })
  const sbx = newServerSys(SBX, { protocol: 'FTP', ip: '10.20.5.44', passive: { from: 50000, to: 50100, open: false }, users: partner, dirs, files: { '/backup/pos-backup-20261102.bak': fileRec('', { size: 902144, t: at(1, 2), owner: 'root', binary: true }) } })
  const prd = newServerSys(PRD, {
    protocol: 'FTP', ip: '10.20.6.44', passive: { from: 50000, to: 50100, open: true },
    users: { ...partner, [USER]: { password: PRD_PASSWORD, home: HOME, writeDirs: [IN, DONE, ERROR] } },
    dirs, files: { [`${IN}/${LIVE}`]: zip(LIVE_CSV, at(1, 7, 50), PARTNER) },
  })
  const local = { home: 'C:\\Users\\you\\brightmart', files: { [GOOD]: zip(GOOD_CSV, at(1, 8, 20)), [BAD]: fileRec(BAD_CSV, { size: 16384, t: at(1, 8, 25), binary: true }) } }
  const table = labTable('BRIGHTMART', 'SUPPLIER_PRICES', [['SKU', 'VARCHAR2(16)'], ['PRICE', 'NUMBER(10,2)'], ['CURRENCY', 'VARCHAR2(3)'], ['VALID_FROM', 'DATE'], ['FILE_NAME', 'VARCHAR2(80)', true]], ['SKU'])
  table.rows = [{ SKU: 'KF-40011', PRICE: 2.39, CURRENCY: 'EUR', VALID_FROM: '2026-10-01', FILE_NAME: 'typed by hand' }]
  table.count = 1
  const db = (name) =>
    newOracle(name, {
      host: DB_HOST[name], service: 'PRICINGPDB', database: 'PRICINGPDB', tables: { [TABLE]: structuredClone(table) },
      logins: [{ name: 'BRIGHTMART_DBA', type: 'DBA', password: null, status: 'OPEN', profile: 'DEFAULT', failed: 0, sysadmin: true }, { name: DB_USER, type: 'App user', password: DB_PASS[name], status: 'OPEN', profile: 'APP_USERS', failed: 0 }],
      users: [{ name: 'BRIGHTMART_DBA', login: 'BRIGHTMART_DBA', schema: 'BRIGHTMART', roles: ['DBA'] }, { name: DB_USER, login: DB_USER, schema: 'BRIGHTMART', roles: ['BRIGHTMART_RW'] }],
    })
  const s = newPlatform({
    clock: at(1, 8), mail: [MAIL], clients: [structuredClone(CLIENT)], studioPkgs: { [ASSET]: PKG },
    systems: systemsOf({ servers: [sbx, prd], local }),
    databases: { created: at(1, 8), servers: { [DB_SBX]: db(DB_SBX), [DB_PRD]: db(DB_PRD) } },
  })
  return until(s, at(1, 9))
}

const PROPS = { 'ftp.host': SBX, 'ftp.port': '21', 'ftp.user': USER, 'ftp.passive': 'true', 'ftp.transferMode': 'BINARY', 'ftp.inDir': IN, 'ftp.doneDir': DONE, 'ftp.errorDir': ERROR, 'db.host': DB_HOST[DB_SBX], 'db.port': '1521', 'db.service': 'PRICINGPDB', 'db.user': DB_USER }

const lab = {
  id: 'p-e2e-ftp',
  group: 'End to end by system',
  title: 'End to end: partner price files, FTP to Oracle',
  minutes: 60,
  scenario: `Kestrel Foods, a legacy partner, sends its purchase prices as a zip over plain FTP, and a buyer still types them in. You build the integration from the request to Production: the Partner Price Files System API in Design Center, the Studio project from Exchange, the FTP user, its folders and the passive ports, the API instance, the deployment and the promotion. A price goes from a zip in ${IN} on ${SBX}, through the FTP listener of ${NAME} in binary mode and its DataWeave mapping, into ${TABLE} on Oracle. A zip damaged by an ASCII transfer goes to the error folder and comes back through the replay of the API. The Inbox has the request.`,
  start,
  steps: [
    kit.steps.inbox('the pricing team', 'the columns and the mapping, the folders, the ports, the database and who gets the alerts'),
    kit.steps.spec(),
    kit.steps.mock(),
    kit.steps.publish(),
    kit.steps.studio(),
    ask(
      'Passive and binary',
      `Which FTP settings does ${NAME} use, and why?`,
      [
        'Active mode and ASCII, because the price list inside is text',
        'passive="true" and transferMode="BINARY". In active mode the server opens the data connection back to the app, which it cannot reach on CloudHub, so the listing times out. A zip is binary: ASCII mode changes its line ending bytes and the zip no longer opens',
        'Passive mode, because it encrypts the password',
        'Either mode works, FTP picks the right one',
      ],
      1,
      'FTP has a control connection on port 21 and a data connection for each listing and transfer. Passive lets the app open both, through the passive ports the server firewall allows. BINARY copies every byte and is the default of the connector; ASCII is only for plain text between systems with different line endings. Neither fixes the clear text password of FTP: plan FTPS or SFTP with the partner.',
    ),
    kit.steps.export(FLOW_XML, 'The listener, the extract, the mapping and the guarded update are written already. '),
    {
      title: 'Create the FTP user',
      how: `SFTP and FTP from the console menu, host ${SBX}, Server tab, Add user. User name ${USER}, Home folder ${HOME}, and a password. Save.`,
      done: userOk,
    },
    {
      title: 'Give the user its folders only',
      how: `Server tab, ${USER}, Edit. Under Write pick Only the folders ticked and tick ${IN}, ${DONE} and ${ERROR}. Leave Read only everywhere off. Save. The backups on the server stay out of reach.`,
      done: rightsOk,
    },
    {
      title: 'Open the passive ports',
      how: 'Server tab, Data connections. Keep passive ports from 50000 to 50100 and tick The firewall of the server lets these ports in. Save.',
      done: passiveOk,
    },
    kit.steps.instance(),
    kit.steps.access(),
    {
      title: 'Deploy from the exported jar',
      how: `Runtime Manager, Deploy application. Application Name ${NAME}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties tab, Text view: ftp.host ${SBX}, ftp.port 21, ftp.user ${USER}, ftp.passive true, ftp.transferMode BINARY, ftp.inDir ${IN}, ftp.doneDir ${DONE}, ftp.errorDir ${ERROR}, db.host ${DB_HOST[DB_SBX]}, db.port 1521, db.service PRICINGPDB, db.user ${DB_USER}, api.id with the API Instance ID, anypoint.platform.client_id. Then in the Table view add ftp.password, db.password and anypoint.platform.client_secret, each with Protect. Deploy, wait for Running, and check that the API instance is Active.`,
      done: deployedOk,
    },
    ask(
      'A late file',
      'Kestrel sends the file of Monday again on Wednesday, after the file of Tuesday was loaded. What keeps the prices right?',
      [
        'Nothing is needed, the last file wins',
        'The update has WHERE VALID_FROM <= :validFrom, so a row with a newer price is left alone and the line counts as skipped. An insert only happens for a SKU that has no row',
        'Delete all prices of Kestrel before each load',
        'Load files only in the order of their names',
      ],
      1,
      'A file feed is not ordered: retries, replays and manual uploads bring old data late. Compare a business date or version in the write itself, so the database decides in one statement and two runs cannot race. The same idea is a watermark: keep the newest point you have loaded and ignore what is older.',
    ),
    {
      title: 'Drop the first price file in binary',
      how: `SFTP and FTP, Protocol FTP, Quickconnect to ${SBX} as ${USER} with its password. Site Manager: Transfer type Binary. Open ${IN}, pick ${GOOD} on the local site and Upload. Move the clock 5 minutes. The listener writes 3 prices and the zip is in ${DONE} with the same size, 18 KB.`,
      done: loadedOk,
    },
    {
      title: 'Follow one record',
      how: `Lab tools, API client. Application ${NAME}, Send as ${CLIENT.name}, GET /price-files/${GOOD}: the answer has the correlationId of the run. Runtime Manager, ${NAME}, Logs: search that ID to see the pickup, the mapping and the write. Then Databases, ${DB_SBX}, SQL Worksheet: SELECT * FROM ${TABLE} WHERE SKU = 'KF-40013' and Run Script. ART_NO 40013 at 375 cents is KF-40013 at 3.75 EUR from 2026-11-04. KF-40011 now has 2.49, no longer the typed 2.39.`,
      done: tracedOk,
    },
    {
      title: 'Receive a zip sent in ASCII',
      how: `Play the old client of Kestrel: Site Manager, Transfer type ASCII, and Upload ${BAD} to ${IN}. Move the clock 5 minutes. The log warns COMPRESSION:INVALID_ARCHIVE and the zip is in ${ERROR}, not lost, with no price of it in the table.`,
      done: rejectedOk,
    },
    {
      title: 'Send it again in binary and replay it',
      how: `Site Manager, Transfer type Binary. Open ${ERROR} and Upload ${BAD} over the damaged copy. Then API client, POST /price-files/${BAD}/replay as ${CLIENT.name}: 202. Move the clock 5 minutes. KF-40021 has 5.12 EUR.`,
      done: replayedOk,
    },
    kit.steps.alert(ALERT_TO),
    ask(
      'What changes in Production',
      'What is different in the Production deployment?',
      [
        'A new jar with the Production server inside',
        `The same jar with other properties: ftp.host ${PRD} and its password, the Oracle host and password, api.id of the Production instance, and the client ID and secret of Production. passive and BINARY stay, and the firewall of the Production server must have its passive ports open too`,
        'Only the password',
        'Nothing, Runtime Manager copies the properties of Sandbox',
      ],
      1,
      'Build once and configure per environment. Every network rule a Sandbox server needed, such as the passive range, is needed again in front of the Production server. Keep the passwords protected and different in each environment.',
    ),
    kit.steps.promote(),
    {
      title: 'Deploy to Production and see one record arrive',
      how: `Runtime Manager in Production, Deploy application, ${NAME} from the same jar. The same properties with the Production values: ftp.host ${PRD}, ftp.password from the mail, db.host ${DB_HOST[DB_PRD]} and its password, api.id of the Production instance, and the credentials of Production from Environment information. Move the clock 5 minutes. The live zip of Kestrel loads, and Databases, ${DB_PRD} shows KF-40031 at 14.50 EUR.`,
      done: prodOk,
    },
  ],
  why: 'The pricing team wanted the daily price zips of Kestrel Foods in the pricing database instead of typing them. I designed the Partner Price Files System API, mocked it and published it to Exchange, and imported it in Studio. The flow is an FTP listener in passive mode with transferMode BINARY, a Compression extract, a DataWeave mapping from ART_NO and cents to our SKU in euros, and an Oracle update guarded by VALID_FROM so an older file never overwrites a newer price. On the FTP server the app has its own user with write rights on its three folders only, and the passive ports are open on the firewall. In API Manager the instance has Client ID Enforcement and the Pricing Desk has a contract. I deployed the exported jar with protected passwords, dropped a zip in binary and followed one price from the correlation ID in the log to the row in Oracle. A zip sent in ASCII mode landed whole in the error folder; after it was sent again in binary, the replay operation put it back and it loaded. Failures alert the pricing team, and Production runs the same jar with its own server, database and API instance.',
  docs: 'https://docs.mulesoft.com/ftp-connector/latest/',
  solve(s0) {
    let s = mark(s0, 'inbox')
    s = kit.solve.studio(kit.solve.design(s))
    s = addServerUser(s, SBX, USER, { home: HOME, password: PASSWORD, writeDirs: [IN, DONE, ERROR] })
    s = setServerSettings(s, SBX, { passive: { from: 50000, to: 50100, open: true } })
    s = kit.solve.api(s)
    s = mark(kit.solve.deploy(s, PROPS, { 'ftp.password': PASSWORD, 'db.password': DB_PASS[DB_SBX] }), `logs:${NAME}`)
    const auth = { user: USER, password: PASSWORD, port: 21, passive: true }
    s = advance(transfer(s, { direction: 'upload', host: SBX, auth: { ...auth, transferMode: 'BINARY' }, local: GOOD, remote: `${IN}/${GOOD}` }).state, 6 * MINUTE)
    s = call(s, NAME, CLIENT, `/price-files/${GOOD}`).state
    s = runSql(s, DB_SBX, `SELECT * FROM ${TABLE} WHERE SKU = 'KF-40013'`).state
    s = advance(transfer(s, { direction: 'upload', host: SBX, auth: { ...auth, transferMode: 'ASCII' }, local: BAD, remote: `${IN}/${BAD}` }).state, 6 * MINUTE)
    s = transfer(s, { direction: 'upload', host: SBX, auth: { ...auth, transferMode: 'BINARY' }, local: BAD, remote: `${ERROR}/${BAD}` }).state
    s = advance(call(s, NAME, CLIENT, `/price-files/${BAD}/replay`, 'POST').state, 6 * MINUTE)
    s = addMonAlert(s, { title: 'Kestrel price feed failed', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = kit.solve.promote(s)
    s = kit.solve.deploy(s, { ...PROPS, 'ftp.host': PRD, 'db.host': DB_HOST[DB_PRD] }, { 'ftp.password': PRD_PASSWORD, 'db.password': DB_PASS[DB_PRD] })
    return advance(s, 6 * MINUTE)
  },
  answers: { 5: 1, 13: 1, 19: 1 },
}

export const LABS = [lab]
