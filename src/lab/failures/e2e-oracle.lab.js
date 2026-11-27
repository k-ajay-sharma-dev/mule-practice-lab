// The end to end lab of Oracle. See platform-labs.js for the shape of a lab.
// The whole life of the product sync: the request, the RAML of its small support API, Exchange, Studio, an Oracle user
// with least privilege, API Manager, the deployment, the first load, one price change followed from Oracle to the web
// shop catalog on SQL Server, a refused product kept and redriven, an alert, and Production.
import {
  addApi, addMonAlert, apiStatus, applyPolicy, at, createClient, createProject, deployApp, finishDeploys, importSpec, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi,
  publish, ramlErrors, requestAccess, runNow, saveProject, setStudio,
} from '../platform.js'
import { app, ask, call, called, creds, OPS } from '../platform-kit.js'
import { loginsOf, newOracle, newSqlServer, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { APP, ASSET, CATALOG, ERRORS, FLOW, ORA, ORA_HOST, ORA_HOST_PRD, ORA_PRD, PKG, PRODUCTS, SHOP_DB, SHOP_DB_PRD, SHOP_HOST, SHOP_HOST_PRD, urlOf } from './e2e-oracle.pkg.js'

const USER = 'MULE_CATALOG'
const PASSWORD = 'Cat-Sbx-2026' // made-up lab values
const PRD_PASSWORD = 'Cat-Prd-5512'
const SHOP_LOGIN = 'mule_catalog'
const SHOP_PASSWORD = 'Cat-Shop-2026'
const SHOP_PRD_PASSWORD = 'Cat-Shop-8820'
const SERVICE = 'BRIGHTMARTPDB'
const URL = `jdbc:oracle:thin:@//${ORA_HOST}:1521/${SERVICE}`
const URL_PRD = `jdbc:oracle:thin:@//${ORA_HOST_PRD}:1521/${SERVICE}`
const CATALOG_DB = 'BrightmartCatalog'
const TEAM = 'ecommerce-ops@brightmart.example'
const DESK = 'Brightmart Support Desk'
const TENT = 'BM-TENT-2P'
const LAMP = 'BM-LAMP-HL4'

const RAML = `#%RAML 1.0
title: Product Sync API
version: v1
mediaType: application/json
types:
  Watermark:
    properties:
      updatedAt: string
      productId: integer
/sync:
  /status:
    get:
      description: The watermark and the last run of the product sync
      responses:
        200:
          body:
            example: |
              { "watermark": { "updatedAt": "2026-11-03 08:45:00", "productId": 7012 }, "lastRun": { "read": 12, "written": 12, "failed": 0 } }
  /watermark:
    put:
      description: Set the watermark back, so the next run reads every product changed since then again
      body:
        type: Watermark
        example: |
          { "updatedAt": "2026-11-03 06:00:00", "productId": 0 }
      responses:
        200:
          body:
            example: |
              { "watermark": { "updatedAt": "2026-11-03 06:00:00", "productId": 0 } }
`
const STUDIO_CODE = `<!-- Global elements. Oracle by the service name of the pluggable database, the catalog on SQL Server. -->
<db:config name="Oracle_Config">
  <db:generic-connection url="\${db.url}" driverClassName="oracle.jdbc.OracleDriver"
                         user="\${db.user}" password="\${db.password}"/>
</db:config>
<db:config name="Catalog_DB">
  <db:mssql-connection host="\${catalog.db.host}" port="\${catalog.db.port}" databaseName="\${catalog.db.database}"
                       user="\${catalog.db.user}" password="\${catalog.db.password}"/>
</db:config>

<!-- product-sync-flow: every 5 minutes, the watermark from a persistent object store -->
<scheduler><scheduling-strategy><fixed-frequency frequency="5" timeUnit="MINUTES"/></scheduling-strategy></scheduler>
<os:retrieve key="productWatermark" objectStore="Sync_Store" target="wm">
  <os:default-value>#[{ at: "1900-01-01 00:00:00", id: 0 }]</os:default-value>
</os:retrieve>

<!-- one page after the watermark; a loop repeats it until a page is not full -->
<db:select config-ref="Oracle_Config" fetchSize="\${sync.pageSize}">
  <db:sql>SELECT PRODUCT_ID, SKU, NAME, PRICE, STATUS, UPDATED_AT FROM BRIGHTMART.PRODUCTS
          WHERE UPDATED_AT > :wmAt OR (UPDATED_AT = :wmAt AND PRODUCT_ID > :wmId)
          ORDER BY UPDATED_AT, PRODUCT_ID FETCH FIRST \${sync.pageSize} ROWS ONLY</db:sql>
  <db:input-parameters>#[{ wmAt: vars.wm.at, wmId: vars.wm.id }]</db:input-parameters>
</db:select>

%dw 2.0
output application/java
---
payload map {
  sku: trim($.SKU),                                  // SKU        -> sku (the key of the catalog)
  name: trim($.NAME),                                // NAME       -> name
  price: $.PRICE,                                    // PRICE      -> price (NOT NULL in the catalog)
  status: { ACTIVE: "live", DISCONTINUED: "hidden" }[$.STATUS] default "hidden",
  updatedAt: $.UPDATED_AT                            // UPDATED_AT -> source_updated_at
}

<!-- per product: db:update by sku, db:insert when no row changed; a refused product goes to
     dbo.catalog_sync_errors. After the page: os:store of the UPDATED_AT and PRODUCT_ID of its last row. -->`

const products = (rows) =>
  rows.map(([id, sku, name, price, status, t]) => `INSERT INTO ${PRODUCTS} (PRODUCT_ID, SKU, NAME, PRICE, STATUS, UPDATED_AT) VALUES (${id}, '${sku}', '${name}', ${price}, '${status}', TIMESTAMP '2026-11-03 ${t}:00');`).join('\n')
const SBX_PRODUCTS = [
  [7001, 'BM-TENT-2P', 'Trailhead 2P Tent', 189.0, 'ACTIVE', '06:05'],
  [7002, 'BM-TENT-4P', 'Trailhead 4P Tent', 279.0, 'ACTIVE', '06:05'],
  [7003, 'BM-BAG-M10', 'Summit Sleeping Bag -10', 149.5, 'ACTIVE', '06:20'],
  [7004, 'BM-MAT-AIR', 'Cloudrest Air Mat', 64.9, 'ACTIVE', '06:41'],
  [7005, 'BM-STOVE-1B', 'Ember One Burner Stove', 39.95, 'ACTIVE', '07:02'],
  [7006, 'BM-POT-SET', 'Ember Cook Set', 29.0, 'ACTIVE', '07:02'],
  [7007, 'BM-PACK-45L', 'Ridgeway Pack 45 L', 129.0, 'ACTIVE', '07:30'],
  [7008, 'BM-PACK-30L', 'Ridgeway Pack 30 L', 99.0, 'DISCONTINUED', '07:48'],
  [7009, 'BM-JKT-RAIN', 'Squall Rain Jacket', 119.0, 'ACTIVE', '08:10'],
  [7010, 'BM-BTL-1L', 'Canteen Bottle 1 L', 14.5, 'ACTIVE', '08:22'],
  [7011, 'BM-CHAIR-LT', 'Basecamp Chair', 54.0, 'ACTIVE', '08:22'],
  [7012, 'BM-LANT-USB', 'Glow Lantern USB', 24.9, 'ACTIVE', '08:45'],
]
const PRD_PRODUCTS = [
  [7001, 'BM-TENT-2P', 'Trailhead 2P Tent', 189.0, 'ACTIVE', '05:40'],
  [7007, 'BM-PACK-45L', 'Ridgeway Pack 45 L', 129.0, 'ACTIVE', '06:15'],
  [7009, 'BM-JKT-RAIN', 'Squall Rain Jacket', 109.0, 'ACTIVE', '07:55'],
]
const ORA_TABLE = `CREATE TABLE ${PRODUCTS} (PRODUCT_ID NUMBER(12) PRIMARY KEY, SKU VARCHAR2(20) NOT NULL, NAME VARCHAR2(120) NOT NULL, PRICE NUMBER(10,2), STATUS VARCHAR2(12) NOT NULL, UPDATED_AT TIMESTAMP NOT NULL);\nCREATE INDEX PRODUCTS_UPDATED_IX ON ${PRODUCTS} (UPDATED_AT, PRODUCT_ID);`
const SHOP_TABLES = (password) =>
  `CREATE TABLE ${CATALOG} (sku varchar(20) NOT NULL PRIMARY KEY, name nvarchar(120) NOT NULL, price decimal(10,2) NOT NULL, status varchar(10) NOT NULL, source_updated_at datetime2 NOT NULL, synced_at datetime2 NOT NULL DEFAULT SYSDATETIME());\nCREATE TABLE ${ERRORS} (sku varchar(20) NOT NULL, error varchar(200) NOT NULL, source_updated_at datetime2 NULL, logged_at datetime2 NOT NULL DEFAULT SYSDATETIME());\nCREATE LOGIN ${SHOP_LOGIN} WITH PASSWORD = '${password}', DEFAULT_DATABASE = ${CATALOG_DB};\nCREATE USER ${SHOP_LOGIN} FOR LOGIN ${SHOP_LOGIN} WITH DEFAULT_SCHEMA = dbo;\nGRANT SELECT, INSERT, UPDATE ON ${CATALOG} TO ${SHOP_LOGIN};\nGRANT INSERT ON ${ERRORS} TO ${SHOP_LOGIN};`
const DBO = [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }]

const srv = (s, name = ORA) => serverOf(s, name)
const loginOf = (s) => (srv(s) ? loginsOf(srv(s)) : []).find((l) => l.name === USER && l.created !== undefined)
const userOf = (s) => (srv(s) ? usersOf(srv(s)) : []).find((u) => u.name === USER)
const rowsOf = (s, name, tk) => (srv(s, name) ? tablesOf(srv(s, name))[tk]?.rows : null) ?? []
const countOf = (s, name, tk) => (srv(s, name) ? (tablesOf(srv(s, name))[tk]?.count ?? 0) : 0)
const a = (s) => app(s, APP)
const prd = (s) => s.apps.find((x) => x.name === APP && x.env === 'Production')
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const project = (s) => s.studio.find((p) => p.assetId === ASSET)
const apiOf = (s, env = 'Sandbox') => s.apis.find((x) => x.assetId === ASSET && x.env === env)
const oraRow = (s, sku) => rowsOf(s, ORA, PRODUCTS).find((r) => r.SKU === sku)
// the query window of SQL Developer has nothing open: its changes are committed
const committed = (s) => {
  const x = srv(s)
  return Boolean(x) && !(x.sessions ?? []).some((y) => y.id === x.console && y.openTran)
}
const seenAfter = (s, key, t) => (s.seen[key] ?? -1) >= t
const syncedAfter = (s, sku, t, env = 'Sandbox') => (store(s).synced ?? []).find((x) => x.sku === sku && x.env === env && x.t >= t)

// CREATE SESSION and SELECT on the one table, nothing more
const leastOk = (s) => {
  const u = userOf(s)
  const l = loginOf(s)
  if (!u || !l) return false
  const g = u.grants ?? {}
  const canLogIn = (l.privs ?? []).includes('CREATE SESSION') || u.roles.includes('CONNECT')
  return canLogIn && (g[PRODUCTS] ?? []).includes('SELECT') && Object.entries(g).every(([tk, ps]) => tk === PRODUCTS && ps.every((p) => p === 'SELECT')) && u.roles.every((r) => r === 'CONNECT') && (l.privs ?? []).every((p) => p === 'CREATE SESSION')
}
const deployedOk = (s) => {
  const x = a(s)
  const p = x?.props ?? {}
  const u = urlOf(p['db.url'])
  return Boolean(x && project(s)?.jar && loginOf(s) && u?.service) && x.jar === project(s).jar && Boolean(x.autodiscovery) && u.host.toLowerCase() === ORA_HOST && u.port === '1521' && u.service.toUpperCase() === SERVICE && String(p['db.user']).toUpperCase() === USER && x.secrets?.['db.password'] === loginOf(s).password && !('db.password' in p) && p['catalog.db.host'] === SHOP_HOST && p['catalog.db.database'] === CATALOG_DB && p['catalog.db.user'] === SHOP_LOGIN && x.secrets?.['catalog.db.password'] === SHOP_PASSWORD && !('catalog.db.password' in p)
}
// the first run that read the whole table
const firstLoad = (s) => (store(s).synced ?? []).filter((x) => x.env === 'Sandbox')[0]

const lab = {
  id: 'p-e2e-oracle',
  group: 'End to end by system',
  title: 'End to end: product changes, Oracle to the web shop catalog',
  minutes: 55,
  scenario: `Product data of Brightmart lives in Oracle, in ${PRODUCTS} of the pluggable database ${SERVICE}. The web shop shows prices from its own catalog database on SQL Server, and today someone copies a spreadsheet each morning. You own ${APP}, from the request to Production. A record takes this path: a merchandiser changes a product in Oracle, which sets UPDATED_AT; every 5 minutes the app reads the products changed since its watermark, page by page; it maps each one and upserts it into ${CATALOG}; it saves the new watermark in its object store. A small Product Sync API lets the support desk see the watermark and set it back. The Inbox has the request.`,
  start() {
    let s = newPlatform({
      clock: at(1, 9),
      studioPkgs: { [ASSET]: PKG },
      databases: {
        created: at(1, 8),
        servers: {
          [ORA]: newOracle(ORA),
          [ORA_PRD]: newOracle(ORA_PRD, { host: ORA_HOST_PRD, tables: {} }),
          [SHOP_DB]: newSqlServer(SHOP_DB, { host: SHOP_HOST, database: CATALOG_DB, dbid: 12, tables: {}, users: DBO }),
          [SHOP_DB_PRD]: newSqlServer(SHOP_DB_PRD, { host: SHOP_HOST_PRD, database: CATALOG_DB, dbid: 12, tables: {}, users: DBO }),
        },
      },
      mail: [
        {
          t: at(1, 8, 20),
          to: OPS,
          subject: 'Product changes from Oracle into the web shop catalog',
          body: `Hello, please replace the morning spreadsheet with a sync.\n\nSource: Oracle 19c, ${ORA_HOST}, port 1521, service ${SERVICE}, table ${PRODUCTS}. UPDATED_AT is set on every change and has an index with PRODUCT_ID. The app may only read that table: user ${USER}, profile APP_USERS.\nTarget: the web shop catalog on SQL Server ${SHOP_HOST}, database ${CATALOG_DB}, table ${CATALOG}, key sku. The web shop team made the login ${SHOP_LOGIN} for you, practice password ${SHOP_PASSWORD}. A product the catalog refuses goes to ${ERRORS} with the reason, and the rest go on.\nEvery 5 minutes is fast enough. Usually a few dozen changes a run, but on Mondays the merchandisers change up to 18,000 prices at once.\nThe support desk (${DESK}) wants to see where the sync stands and set it back after an incident.\nAlerts on errors to ${TEAM}.\nProduction: Oracle ${ORA_HOST_PRD}, same service and user, practice password ${PRD_PASSWORD}. Catalog ${SHOP_HOST_PRD}, login ${SHOP_LOGIN}, practice password ${SHOP_PRD_PASSWORD}. The DBAs set both up (change CHG-5120).\n\nThanks, Brightmart e-commerce`,
          source: 'Brightmart e-commerce',
        },
      ],
    })
    s = runSql(s, ORA, `${ORA_TABLE}\n${products(SBX_PRODUCTS)}\nCOMMIT;`).state
    s = runSql(s, ORA_PRD, `${ORA_TABLE}\n${products(PRD_PRODUCTS)}\nCOMMIT;\nCREATE USER ${USER} IDENTIFIED BY "${PRD_PASSWORD}" PROFILE APP_USERS;\nGRANT CREATE SESSION TO ${USER};\nGRANT SELECT ON ${PRODUCTS} TO ${USER};`).state
    s = runSql(s, SHOP_DB, SHOP_TABLES(SHOP_PASSWORD)).state
    s = runSql(s, SHOP_DB_PRD, SHOP_TABLES(SHOP_PRD_PASSWORD)).state
    return s
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the source table and its index, the target and its key, the error table, the schedule, the Monday volume, the support desk, the users and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: 'Design Center from the menu. Create new, New API Specification, name Product Sync API.', done: (s) => s.projects.some((p) => /product sync api/i.test(p.name)) },
    {
      title: 'Write the RAML',
      how: 'The sync itself has no caller, but the support desk needs GET /sync/status and PUT /sync/watermark. Write them, or paste this one.',
      code: RAML,
      done: (s) => s.projects.some((p) => p.raml && ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'GET', '/sync/status').status === 200 && mockCall(p.raml, 'PUT', '/sync/watermark').status === 200),
    },
    {
      title: 'Try the mock, then publish to Exchange',
      how: `In the Documentation panel turn on the mocking service, choose GET /sync/status, Try it, Send. Then Publish: asset ID ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`,
      done: (s) => Boolean(s.seen.mock) && s.assets.some((x) => x.assetId === ASSET),
    },
    {
      title: 'Import the specification into Studio',
      how: 'Anypoint Studio from the menu, Import a published API, choose Product Sync API. Next to the APIkit flows the team adds product-sync-flow: a Scheduler, the watermark from an object store, a keyset Select on Oracle, the mapping and the upsert into the catalog.',
      code: STUDIO_CODE,
      done: (s) => project(s)?.pkg === PKG,
    },
    {
      title: 'Add API Autodiscovery and export',
      how: `In Studio, Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then Export.`,
      done: (s) => Boolean(project(s)?.jar) && project(s).autodiscovery?.apiId === '${api.id}' && /-main$/.test(project(s).autodiscovery.flowRef ?? ''),
    },
    ask(
      'Choose the watermark',
      'The sync must remember where it stopped. Which watermark is right?',
      [
        'The clock time of the last run, compared with UPDATED_AT',
        'The UPDATED_AT and PRODUCT_ID of the last product written, saved in a persistent object store after its page is written, and read with UPDATED_AT > :at OR (UPDATED_AT = :at AND PRODUCT_ID > :id)',
        'A column SYNCED in the Oracle table that the app sets to Y',
        'None: read every product every 5 minutes',
      ],
      1,
      'The value of the data is the watermark, not the clock of the Mule replica, which can differ from the database clock. Many products share one UPDATED_AT after a mass change, so PRODUCT_ID breaks the tie and a page that ends in the middle of them goes on at the next one. Saved only after the write, a failed run starts again from the last good product. A SYNCED flag needs write rights on the source and an extra update per row. A persistent object store keeps the watermark through a restart and across replicas.',
    ),
    {
      title: 'Create the Oracle user with least privilege',
      how: `Databases from the console menu, connection ${ORA}, SQL Worksheet. Run\nCREATE USER ${USER} IDENTIFIED BY "${PASSWORD}" PROFILE APP_USERS;\nGRANT CREATE SESSION TO ${USER};\nGRANT SELECT ON ${PRODUCTS} TO ${USER};\nNothing else: no BRIGHTMART_RW, no SELECT ANY TABLE. The Users tab shows the grants.`,
      done: leastOk,
    },
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: 'API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), select Product Sync API from Exchange, Save & Deploy. Then Policies, Add policy, Client ID Enforcement. Open Environment information and copy the client ID and secret of Sandbox.',
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    {
      title: 'Deploy the exported jar',
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File the jar you exported. Properties: db.url=${URL}, db.user=${USER}, catalog.db.host=${SHOP_HOST}, catalog.db.port=1433, catalog.db.database=${CATALOG_DB}, catalog.db.user=${SHOP_LOGIN}, sync.pageSize=500, api.id=the API Instance ID, anypoint.platform.client_id. Protect db.password, catalog.db.password and anypoint.platform.client_secret. Deploy Application. The API turns Active.`,
      done: (s) => running(s) && deployedOk(s) && apiStatus(s, apiOf(s)) === 'Active',
    },
    {
      title: 'Let the support desk in',
      how: `Exchange, Product Sync API, Request access for the Sandbox instance. Create a new application named ${DESK}. With no SLA tier the contract is approved at once.`,
      done: (s) => Boolean(apiOf(s)?.contracts.some((c) => c.client === DESK && c.status === 'approved')),
    },
    {
      title: 'Run the first load and check the counts',
      how: `Runtime Manager, ${APP}, Schedules, ${FLOW}, Run (or move the clock 5 minutes). With no watermark the first run reads every product. Databases, ${SHOP_DB}, New Query: SELECT COUNT(*) FROM ${CATALOG}; gives 12, the same as SELECT COUNT(*) FROM ${PRODUCTS} on ${ORA}. Then API client as ${DESK}: GET /sync/status shows the watermark 08:45, product 7012.`,
      done: (s) => {
        const f = firstLoad(s)
        return Boolean(f) && countOf(s, SHOP_DB, CATALOG) >= SBX_PRODUCTS.length && seenAfter(s, `db-select:${SHOP_DB}:${CATALOG}`, f.t) && called(s, APP, 200, 'GET', /^\/sync\/status/)
      },
    },
    ask(
      'Pages on Monday',
      'On Monday 18,000 products change at once. Why pages of 500 with FETCH FIRST after the watermark, and not one SELECT of all changes or OFFSET pages?',
      [
        'One SELECT is faster, pages only make it slower',
        'Each keyset page starts at the index entry after the last row, so every page costs the same, holds 500 rows in memory and is one short unit of work. The watermark is saved after each page, so a failure in page 30 goes on from page 30. OFFSET reads and throws away the skipped rows, and a product changed during the run moves the rows between pages',
        'Oracle refuses more than 500 rows in one query',
        'FETCH FIRST locks the rows so nobody changes them',
      ],
      1,
      'A keyset page is WHERE (key) > (last key) ORDER BY key FETCH FIRST n ROWS ONLY. With the index on (UPDATED_AT, PRODUCT_ID) Oracle reads only the rows of the page. One huge SELECT holds a long read and a large result, and a failure at the end starts from the beginning. The fetch size of the Select sets the rows per round trip, a separate knob.',
    ),
    {
      title: 'Change one product in Oracle',
      how: `Databases, ${ORA}, SQL Worksheet. Run\nUPDATE ${PRODUCTS} SET PRICE = 169.00, UPDATED_AT = SYSTIMESTAMP WHERE SKU = '${TENT}';\nCOMMIT;\nIn Oracle the UPDATE starts a transaction. Until COMMIT nobody else sees the new price, the app included.`,
      done: (s) => Number(oraRow(s, TENT)?.PRICE) === 169 && String(oraRow(s, TENT)?.UPDATED_AT) > '2026-11-03 09:00' && committed(s),
    },
    {
      title: 'Follow the change to the catalog',
      how: `Schedules, ${FLOW}, Run. Logs: the lines of the run share one event: correlation ID. Find Page 1: 1 changed product and Product ${TENT} updated in ${CATALOG}. Then Databases, ${SHOP_DB}, New Query: SELECT * FROM ${CATALOG} WHERE sku = '${TENT}'; shows price 169.00, status live and source_updated_at from Oracle.`,
      done: (s) => {
        const t = syncedAfter(s, TENT, 0)
        const last = (store(s).synced ?? []).findLast((x) => x.sku === TENT && x.env === 'Sandbox' && x.price === 169)
        return Boolean(t && last) && Boolean(s.seen[`logs:${APP}`]) && rowsOf(s, SHOP_DB, CATALOG).some((r) => r.sku === TENT && Number(r.price) === 169 && r.status === 'live') && seenAfter(s, `db-select:${SHOP_DB}:${CATALOG}`, last.t)
      },
    },
    ask(
      'The late commit',
      'A merchandiser runs an UPDATE at 10:02, so UPDATED_AT is 10:02, but commits at 10:07. The run of 10:05 wrote a product changed at 10:04 and saved that as the watermark. What happens to the late change?',
      [
        'The run of 10:10 picks it up',
        'It is never synced. Oracle readers see committed rows only, so the run of 10:05 did not see it, and from 10:10 on the app asks for rows after 10:04. Read only up to a safety margin, such as UPDATED_AT < SYSTIMESTAMP minus a few minutes, or let a trigger or the commit time drive the column',
        'Oracle blocks the run until the commit',
        'The object store notices the gap and reads it again',
      ],
      1,
      'A watermark on a time column assumes that rows appear in the order of that column. A long transaction breaks that. The usual fix is an upper bound a few minutes in the past, wider than the longest transaction, so a row is read only once nothing older can still commit. The app of this lab reads up to now and has this gap; name the margin when you explain the design.',
    ),
    {
      title: 'A product the catalog refuses',
      how: `A merchandiser creates a product without a price. Run\nINSERT INTO ${PRODUCTS} (PRODUCT_ID, SKU, NAME, PRICE, STATUS, UPDATED_AT) VALUES (7013, '${LAMP}', 'Ridge Headlamp 400', NULL, 'ACTIVE', SYSTIMESTAMP);\nCOMMIT;\nRun ${FLOW}. The catalog refuses the row (error 515, price does not allow nulls). The app writes it to ${ERRORS} and moves on; it is not lost and the sync does not stall. Databases, ${SHOP_DB}: SELECT * FROM ${ERRORS};`,
      done: (s) => (store(s).failed ?? []).some((x) => x.sku === LAMP && x.kept && x.env === 'Sandbox') && rowsOf(s, SHOP_DB, ERRORS).some((r) => r.sku === LAMP) && seenAfter(s, `db-select:${SHOP_DB}:${ERRORS}`, (store(s).failed ?? []).find((x) => x.sku === LAMP)?.t ?? Infinity),
    },
    {
      title: 'Fix it at the source and see it arrive',
      how: `The fix belongs in Oracle, where the data is owned. Run\nUPDATE ${PRODUCTS} SET PRICE = 34.90, UPDATED_AT = SYSTIMESTAMP WHERE SKU = '${LAMP}';\nCOMMIT;\nThe new UPDATED_AT is after the watermark, so the next run takes the product again. Run ${FLOW} and check ${CATALOG} for ${LAMP}.`,
      done: (s) => {
        const bad = (store(s).failed ?? []).find((x) => x.sku === LAMP)
        return Boolean(bad && syncedAfter(s, LAMP, bad.t)) && rowsOf(s, SHOP_DB, CATALOG).some((r) => r.sku === LAMP && Number(r.price) === 34.9)
      },
    },
    {
      title: 'Alert the e-commerce team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, recipient ${TEAM}. A run that cannot reach Oracle or the catalog counts as an error. A refused product does not, which is why the error table matters.`,
      done: (s) => s.monAlerts.some((x) => x.resource === 'Application' && x.name_ === APP && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
    {
      title: 'Promote the API and deploy to Production',
      how: `Switch to Production. API Manager, Add API, Promote API from environment, Source Environment Sandbox, with policies. Runtime Manager in Production, Deploy application: name ${APP}, the exported jar. Properties: db.url=${URL_PRD}, db.user=${USER}, catalog.db.host=${SHOP_HOST_PRD}, catalog.db.port=1433, catalog.db.database=${CATALOG_DB}, catalog.db.user=${SHOP_LOGIN}, sync.pageSize=500, api.id=the Production API Instance ID, the client ID of Production. Protect db.password and catalog.db.password with the Production passwords from the mail, and the client secret of Production.`,
      done: (s) => {
        const x = prd(s)
        const api = apiOf(s, 'Production')
        return Boolean(x && api) && x.status === 'Running' && api.policies.some((p) => p.type === 'client-id') && urlOf(x.props['db.url'])?.host === ORA_HOST_PRD && x.secrets?.['db.password'] === PRD_PASSWORD && x.props['catalog.db.host'] === SHOP_HOST_PRD && x.secrets?.['catalog.db.password'] === SHOP_PRD_PASSWORD && apiStatus(s, api) === 'Active'
      },
    },
    {
      title: 'See the products arrive in Production',
      how: `Runtime Manager in Production, ${APP}, Schedules, ${FLOW}, Run. It is the first load of Production. Databases, ${SHOP_DB_PRD}, New Query: SELECT * FROM ${CATALOG}; shows ${TENT} with the Production price.`,
      done: (s) => {
        const x = (prd(s)?.store?.synced ?? []).find((y) => y.sku === TENT && y.env === 'Production')
        return Boolean(x) && rowsOf(s, SHOP_DB_PRD, CATALOG).some((r) => r.sku === TENT) && seenAfter(s, `db-select:${SHOP_DB_PRD}:${CATALOG}`, x.t)
      },
    },
  ],
  why: `The e-commerce team asked to replace a morning spreadsheet: products from Oracle into the catalog of the web shop on SQL Server, every 5 minutes, with refused products kept and the Monday volume in mind. I designed a small Product Sync API for the support desk, published it, and imported it into Studio, where the sync flow sits next to the APIkit flows. The flow keeps a watermark of UPDATED_AT and PRODUCT_ID in a persistent object store, reads keyset pages with FETCH FIRST after it, maps each product and upserts it by sku, and saves the watermark after each page. In Oracle the app got its own user with CREATE SESSION and SELECT on one table, and it connects by the service name of the pluggable database. The API has Client ID Enforcement, and the jar runs with protected passwords for both databases. I checked the first load by counts on both sides, then changed one price in Oracle, committed it, and followed it by the correlation ID of the run to the catalog row. A product with no price was refused by the catalog, went to the error table and did not stop the sync; after the fix in Oracle its new UPDATED_AT brought it across. I know the gap of a time watermark: a transaction that commits late, which a safety margin closes. An alert on errors goes to the e-commerce team, and Production got the promoted instance and the Production users and passwords from the DBAs.`,
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-select',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Product Sync API')
    s = mark(saveProject(s, s.projects.at(-1).id, RAML), 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Product Sync API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = runSql(s, ORA, `CREATE USER ${USER} IDENTIFIED BY "${PASSWORD}" PROFILE APP_USERS;\nGRANT CREATE SESSION TO ${USER};\nGRANT SELECT ON ${PRODUCTS} TO ${USER};`).state
    s = addApi(s, { assetId: ASSET, label: 'product-sync-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = mark(applyPolicy(s, id, 'client-id'), 'env:Sandbox')
    const p = project(s)
    const props = { 'catalog.db.host': SHOP_HOST, 'catalog.db.port': '1433', 'catalog.db.database': CATALOG_DB, 'catalog.db.user': SHOP_LOGIN, 'sync.pageSize': '500' }
    const c = creds(s, 'Sandbox')
    s = finishDeploys(deployApp(s, { name: APP, jar: p.jar, pkg: p.pkg, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1, props: { 'db.url': URL, 'db.user': USER, ...props, 'api.id': id, ...c.props }, secrets: { 'db.password': PASSWORD, 'catalog.db.password': SHOP_PASSWORD, ...c.secrets } }).state)
    s = requestAccess(createClient(s, DESK), id, DESK)
    const desk = s.clients.find((x) => x.name === DESK)
    s = runNow(s, APP, FLOW)
    s = runSql(s, SHOP_DB, `SELECT COUNT(*) FROM ${CATALOG};`).state
    s = call(s, APP, desk, '/sync/status', 'GET').state
    s = runSql(s, ORA, `UPDATE ${PRODUCTS} SET PRICE = 169.00, UPDATED_AT = SYSTIMESTAMP WHERE SKU = '${TENT}';\nCOMMIT;`).state
    s = mark(runNow(s, APP, FLOW), `logs:${APP}`)
    s = runSql(s, SHOP_DB, `SELECT * FROM ${CATALOG} WHERE sku = '${TENT}';`).state
    s = runSql(s, ORA, `INSERT INTO ${PRODUCTS} (PRODUCT_ID, SKU, NAME, PRICE, STATUS, UPDATED_AT) VALUES (7013, '${LAMP}', 'Ridge Headlamp 400', NULL, 'ACTIVE', SYSTIMESTAMP);\nCOMMIT;`).state
    s = runNow(s, APP, FLOW)
    s = runSql(s, SHOP_DB, `SELECT * FROM ${ERRORS};`).state
    s = { ...s, clock: s.clock + MINUTE }
    s = runSql(s, ORA, `UPDATE ${PRODUCTS} SET PRICE = 34.90, UPDATED_AT = SYSTIMESTAMP WHERE SKU = '${LAMP}';\nCOMMIT;`).state
    s = runNow(s, APP, FLOW)
    s = addMonAlert(s, { title: 'Product sync errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    // Production
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: true, alerts: false })
    const pc = creds(s, 'Production')
    s = finishDeploys(deployApp(s, { name: APP, jar: p.jar, pkg: p.pkg, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1, props: { 'db.url': URL_PRD, 'db.user': USER, ...props, 'catalog.db.host': SHOP_HOST_PRD, 'api.id': s.lastApi, ...pc.props }, secrets: { 'db.password': PRD_PASSWORD, 'catalog.db.password': SHOP_PRD_PASSWORD, ...pc.secrets } }).state)
    s = runNow(s, APP, FLOW)
    return runSql(s, SHOP_DB_PRD, `SELECT * FROM ${CATALOG};`).state
  },
  answers: { 6: 1, 12: 1, 15: 1 },
}

export const LABS = [lab]
