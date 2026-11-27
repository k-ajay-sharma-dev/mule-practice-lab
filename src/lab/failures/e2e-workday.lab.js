// The end to end lab of Workday. See platform-labs.js for the shape of a lab.
// New hires of Workday become badge holders of the store access database: design, build, Workday and database setup,
// API Manager, deployment, one record traced end to end, a rejected worker fixed at the source, an alert and Production.
import {
  addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createProject, deployApp, finishDeploys, importSpec, mark, mockCall, newPlatform, packageJar, pairing, promoteApi, publish, ramlErrors,
  MINUTE, requestAccess, runNow, saveProject, setStudio,
} from '../platform.js'
import { ask, OPS, until } from '../platform-kit.js'
import { newSqlServer, runSql, tablesOf } from '../platform-db.js'
import {
  activatePending, addPrompt, changeEmail, createGroup, createIsu, createReport, DOMAINS, editReport, GROUP_TYPE, groupsOf, hireWorker, newWorkday, permsOf, SCREEN_USER, setPasswordRules, setPermissions, TENANT, WD_HOST,
} from '../platform-workday.js'
import { WD_DB, WD_FLOW, WD_PKG } from './e2e-workday.pkg.js'

const ASSET = 'badge-sync-api'
const ISU = 'ISU_BRIGHTMART_BADGES'
const GROUP = 'ISSG_Badge_Feed'
const REPORT = 'INT_Badge_Feed'
const FIELDS = ['Employee_ID', 'Worker', 'Email', 'Location', 'Job_Profile', 'Hire_Date', 'Last_Functionally_Updated']
const DB_HOST = 'access-sql.brightmart.lab'
const DB_NAME = 'StoreAccess'
const DB_USER = 'mule_badges'
const TABLE = 'dbo.badge_holders'
const SINCE = '2026-11-03T00:00:00'
const CALLER = { name: 'HR Ops Console', clientId: 'hrops-3d71c0', clientSecret: 'hrops-secret-52' }
const ALERT_TO = 'hr-integrations@brightmart.example'
const PRD = { host: 'wd5-services1.workday.lab', tenant: 'brightmart', isuPassword: 'Badge-Prd-Lab-7731', dbHost: 'access-sql-prd.brightmart.lab', dbPassword: 'Badge-Db-Prd-4410' }
// what the learner chooses: lab values for the solution
const ISU_PASSWORD = 'Badge-Feed-Lab-2026'
const DB_PASSWORD = 'Badge-Db-Lab-2026'
const TEST = { first: 'Nadia', last: 'Brook', job: 'JP_SALES_ASSOCIATE', loc: 'LOC_PIER_02', email: 'nadia.brook@brightmart.example' }
const BAD = { first: 'Ellis', last: 'Varga', job: 'JP_PICKER', loc: 'LOC_DOCK_01', email: '' }

const RAML = `#%RAML 1.0
title: Badge Sync API
version: v1
mediaType: application/json
types:
  SyncRun:
    properties:
      cid: string
      rows: integer
      inserted: integer
      updated: integer
      rejected: integer
/sync:
  /status:
    get:
      description: The watermark, the last run and the workers that were rejected
      responses:
        200:
          body:
            example: |
              { "watermark": "2026-11-03T09:00:00.000+00:00", "sent": 1, "last": { "cid": "wd-badge-202611030900", "rows": 1, "inserted": 1, "updated": 0, "rejected": 0 }, "rejected": [] }
  /replay:
    post:
      description: Sync again from a time, without moving the watermark
      body:
        example: |
          { "from": "2026-11-03T00:00:00" }
      responses:
        200:
          body:
            type: SyncRun
            example: |
              { "cid": "wd-badge-202611031015", "rows": 2, "inserted": 0, "updated": 2, "rejected": 0 }
`

const FLOW_CODE = `<!-- Global elements: every value comes from a property, the secrets from secure properties -->
<http:request-config name="Workday_RaaS_Config">
  <http:request-connection protocol="HTTPS" host="\${workday.host}" port="443">
    <http:authentication>
      <http:basic-authentication username="\${workday.username}" password="\${secure::workday.password}"/>
    </http:authentication>
  </http:request-connection>
</http:request-config>
<db:config name="Badge_Database_Config">
  <db:mssql-connection host="\${db.host}" port="1433" databaseName="\${db.database}"
                       user="\${db.user}" password="\${secure::db.password}"/>
</db:config>

<flow name="${WD_FLOW}">
  <scheduler><scheduling-strategy><fixed-frequency frequency="15" timeUnit="MINUTES"/></scheduling-strategy></scheduler>
  <os:retrieve key="watermark" objectStore="Badge_Store" target="from">
    <os:default-value>#[p('sync.since')]</os:default-value>
  </os:retrieve>
  <set-variable variableName="to" value="#[now()]"/>
  <!-- RaaS: GET /ccx/service/customreport2/{tenant}/{owner}/{report}?format=json&Updated_From=..&Updated_To=.. -->
  <http:request method="GET" config-ref="Workday_RaaS_Config"
                path="/ccx/service/customreport2/\${workday.tenant}/\${raas.owner}/\${raas.report}">
    <http:query-params>#[{ format: "json", Updated_From: vars.from, Updated_To: vars.to }]</http:query-params>
  </http:request>
  <ee:transform doc:name="Workers to badge holders">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/java
var sites = { "Pier 01 store": "S101", "Pier 02 store": "S102", "Dock 01 warehouse": "W01", "Brightmart HQ": "HQ" }
---
payload.Report_Entry map {
  id:     $.Employee_ID,
  name:   $.Worker,
  email:  lower($.Email default ""),
  site:   sites[$.Location],
  job:    $.Job_Profile,
  status: "ACTIVE",
  from:   $.Hire_Date
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <foreach>
    <choice>
      <when expression="#[isEmpty(payload.email) or payload.site == null]">
        <!-- not written: kept in the rejected list, counted as an error -->
        <os:store key="rejected" objectStore="Badge_Store">#[(vars.rejected default []) + payload]</os:store>
      </when>
      <otherwise>
        <db:update config-ref="Badge_Database_Config">
          <db:sql>UPDATE dbo.badge_holders SET full_name = :name, email = :email, site_code = :site,
                  job_title = :job, badge_status = :status, valid_from = :from WHERE employee_id = :id</db:sql>
          <db:input-parameters>#[payload]</db:input-parameters>
        </db:update>
        <choice><when expression="#[payload.affectedRows == 0]">
          <db:insert config-ref="Badge_Database_Config"><db:sql>INSERT INTO dbo.badge_holders (...) VALUES (...)</db:sql></db:insert>
        </when></choice>
      </otherwise>
    </choice>
  </foreach>
  <os:store key="watermark" objectStore="Badge_Store">#[vars.to]</os:store>
</flow>`

const y = (s) => s.workday ?? {}
const word = (v) => String(v ?? '').trim()
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.env === env && a.pkg === WD_PKG && a.status !== 'Stopped')
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const resourcesOk = (raml) => ramlErrors(raml ?? '').length === 0 && mockCall(raml, 'GET', '/sync/status').status < 300 && mockCall(raml, 'POST', '/sync/replay').status < 300
const designed = (s) => s.projects.some((p) => /badge/i.test(p.name) && resourcesOk(p.raml))
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === WD_PKG)
const srv = (s) => s.databases?.servers?.[WD_DB]
const badge = (s, id) => (srv(s) ? tablesOf(srv(s))[TABLE]?.rows.find((r) => r.employee_id === id) : null)
const workerId = (s, first, last) => Object.entries(y(s).workers ?? {}).find(([, x]) => x.name === `${first} ${last}`)?.[0]
const props = (a) => ({ ...a?.props, ...a?.secrets })

const isuOk = (s) => {
  const u = y(s).isus?.[ISU]
  return Boolean(u && u.noUi && !u.requireNew && (y(s).rules?.exempt ?? []).includes(ISU))
}
const groupOk = (s) => {
  const g = y(s).groups?.[GROUP]
  if (!isuOk(s) || !g || g.type !== GROUP_TYPE || !g.members.includes(ISU) || groupsOf(y(s), ISU).length !== 1) return false
  const p = permsOf(y(s), ISU)
  const want = [DOMAINS.PUBLIC, DOMAINS.STAFFING, DOMAINS.CONTACT]
  return Object.keys(p).length === want.length && want.every((d) => p[d]?.length === 1 && p[d][0] === 'Get')
}
const reportOk = (s) => {
  const r = y(s).reports?.[REPORT]
  if (!r || r.source !== 'All Active Workers' || !r.ws || !r.share.includes(GROUP)) return false
  const has = (name, op) => r.prompts.some((x) => x.name === name && x.field === 'Last_Functionally_Updated' && x.op === op)
  return FIELDS.every((f) => r.fields.includes(f)) && !r.fields.includes('Annual_Salary') && !r.fields.includes('Date_of_Birth') && has('Updated_From', 'from') && has('Updated_To', 'to')
}
// the login of the app: SELECT, INSERT and UPDATE on the badge table, nothing else
const dbUserOk = (s) => {
  const x = srv(s)
  const login = x?.logins?.find((l) => l.name.toLowerCase() === DB_USER)
  const user = x?.users?.find((u) => u.login.toLowerCase() === DB_USER)
  const g = user?.grants ?? {}
  return Boolean(login && !login.disabled && user && user.roles.length === 0 && Object.keys(g).length === 1 && ['SELECT', 'INSERT', 'UPDATE'].every((v) => g[TABLE]?.includes(v)) && g[TABLE].length === 3)
}
const apiOk = (s) => {
  const api = apiOf(s)
  return Boolean(api && api.policies.some((p) => p.type === 'client-id') && api.contracts.some((c) => c.client === CALLER.name && c.status === 'approved') && s.seen['env:Sandbox'])
}
const deployedOk = (s) => {
  const a = appOf(s)
  if (a?.status !== 'Running' || !isuOk(s) || !dbUserOk(s)) return false
  const p = props(a)
  const user = word(p['workday.username'])
  return (
    word(p['workday.host']) === WD_HOST && word(p['workday.tenant']) === TENANT && [ISU, `${ISU}@${TENANT}`].includes(user) && word(p['raas.owner']) === SCREEN_USER && word(p['raas.report']) === REPORT &&
    a.secrets['workday.password'] === y(s).isus[ISU].password && a.props['workday.password'] === undefined &&
    word(p['db.host']) === DB_HOST && word(p['db.database']) === DB_NAME && word(p['db.user']).toLowerCase() === DB_USER && a.secrets['db.password'] === srv(s).logins.find((l) => l.name.toLowerCase() === DB_USER).password && a.props['db.password'] === undefined &&
    word(p['sync.since']).startsWith('2026-11-03') && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s)) === 'Active'
  )
}
const testId = (s) => workerId(s, TEST.first, TEST.last)
const badId = (s) => workerId(s, BAD.first, BAD.last)
const testHired = (s) => {
  const x = y(s).workers?.[testId(s)]
  return Boolean(x && x.loc === TEST.loc && word(x.email))
}
// when the flow first set the bad hire aside: its WARN line stays in the log after the fix
const rejectedAt = (s) => (badId(s) ? appOf(s)?.logs.find((l) => l.level === 'WARN' && l.text.includes(`Worker ${badId(s)} `) && /rejected/.test(l.text))?.t : undefined)
const testBadge = (s) => {
  const r = testId(s) && badge(s, testId(s))
  return Boolean(r && r.site_code === 'S102' && r.email === y(s).workers[testId(s)].email.toLowerCase() && r.full_name === `${TEST.first} ${TEST.last}` && r.badge_status === 'ACTIVE')
}
const hiredAt = (s) => (y(s).events ?? []).find((e) => e.type === 'Hire' && e.worker === testId(s))?.done ?? Infinity
const rejected = (s) =>(appOf(s)?.store?.rejected ?? []).some((r) => r.id === badId(s))

const MAIL = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'New hires need their store badge on day one',
  body: [
    'Hello integration team,',
    'New staff wait at the staff door on their first day because their badge is made by hand. HR enters every hire in Workday, so the store access system should get it from there. Please build it:',
    `1. Every 15 minutes, the hires and changed workers of Workday tenant ${TENANT} since the last run go to the badge database ${DB_NAME} on ${DB_HOST}, table ${TABLE}: Employee_ID, Worker, Email, Location as the site code (Pier 01 store S101, Pier 02 store S102, Dock 01 warehouse W01, Brightmart HQ HQ), Job_Profile and Hire_Date. About 30 hires a week. Start from ${SINCE}: the badge team loaded everyone before that.`,
    `2. Read Workday with a custom report ${REPORT} over RaaS, with prompts Updated_From and Updated_To on Last_Functionally_Updated. Integration system user ${ISU} (no UI sessions, password exempt from expiry) in a group ${GROUP} with read access to the report fields only.`,
    `3. A database login ${DB_USER} that may read, insert and update ${TABLE}. Nothing else.`,
    `4. An API for the HR operations console (client app ${CALLER.name}): GET /sync/status and POST /sync/replay. Only known client apps may call it.`,
    '5. A worker without a work email must not get an empty badge record. Keep it aside, tell us, and send it once HR fixes Workday.',
    `6. Failures alert ${ALERT_TO}.`,
    `7. Production after the test: tenant ${PRD.tenant} on ${PRD.host}, the same ISU name with the password ${PRD.isuPassword} from the vault ticket, database host ${PRD.dbHost} with the login ${DB_USER} and the password ${PRD.dbPassword}. All lab values.`,
    'Brightmart HR systems and store security',
  ].join('\n\n'),
  source: 'Brightmart HR systems',
}

function accessServer() {
  const base = newSqlServer()
  const x = newSqlServer(WD_DB, { host: DB_HOST, database: DB_NAME, dbid: 9, tables: {}, logins: base.logins.filter((l) => ['sa', 'BRIGHTMART\\dba'].includes(l.name)), users: base.users.filter((u) => u.name === 'dbo') })
  let s = { clock: at(1, 8), seen: {}, apps: [], databases: { created: 0, servers: { [WD_DB]: x } } }
  s = runSql(
    s,
    WD_DB,
    `CREATE TABLE ${TABLE} (employee_id varchar(12) NOT NULL PRIMARY KEY, full_name nvarchar(120) NOT NULL, email varchar(120) NOT NULL, site_code varchar(8) NOT NULL, job_title nvarchar(80) NULL, badge_status varchar(12) NOT NULL, valid_from date NULL, updated_at datetime2 NULL);
    INSERT INTO ${TABLE} VALUES ('21002', 'Omar Feld', 'omar.feld@brightmart.example', 'S102', 'Store Manager', 'ACTIVE', '2025-09-28', '2026-10-30 08:00:00');
    INSERT INTO ${TABLE} VALUES ('21008', 'Joan Vey', 'joan.vey@brightmart.example', 'S101', 'Sales Associate', 'ACTIVE', '2025-09-28', '2026-10-30 08:00:00');
    INSERT INTO ${TABLE} VALUES ('21010', 'Sana Dorr', 'sana.dorr@brightmart.example', 'S101', 'Cashier', 'ACTIVE', '2025-09-28', '2026-10-30 08:00:00')`,
  ).state
  return s.databases.servers[WD_DB]
}

const lab = {
  id: 'p-e2e-workday',
  group: 'End to end by system',
  title: 'End to end: new hires, Workday to the store badge database',
  minutes: 60,
  scenario: `Brightmart wants every new hire of Workday to have a store badge on day one. You build it end to end: the Badge Sync API in Design Center, the Mule app in Studio on that spec, the Workday side (integration system user, security group, RaaS report) and the database login, API Manager, the deployment, one hire traced from Workday to ${TABLE}, a hire without an email kept aside and sent after the fix, an alert, and Production. The record path: HR hires in Workday, the report ${REPORT} returns the worker, the app ${WD_PKG} maps it with DataWeave and upserts it in the badge database. The Inbox has the request.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8, 30),
      workday: newWorkday(at(1, 8)),
      databases: { created: 0, servers: { [WD_DB]: accessServer() } },
      studioPkgs: { [ASSET]: WD_PKG },
      clients: [CALLER],
      mail: [MAIL],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar. Note the fields, the volume, the schedule, the start time, the rule for a worker without an email, the caller of the API, who gets the alerts and the Production values.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Design the Badge Sync API',
      how: 'Design Center, Create new, New API Specification, name Badge Sync API. Write GET /sync/status and POST /sync/replay with examples. You can use this RAML.',
      code: RAML,
      done: designed,
    },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the mocking service, choose GET /sync/status, Try it, Send. The HR operations team sees the answer before any code exists.', done: (s) => designed(s) && Boolean(s.seen.mock) },
    { title: 'Publish to Exchange', how: `Publish at the top right. Asset id ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => s.assets.some((a) => a.assetId === ASSET) },
    {
      title: 'Build the flow in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project carries the flows of the team: the scheduler, the RaaS request, the DataWeave mapping and the upsert. Read the important part below: every connection value is a property, the secrets are secure properties.`,
      code: FLOW_CODE,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Upsert, not insert',
      'Why does the flow UPDATE by employee_id and INSERT only when no row was updated, instead of a plain INSERT?',
      [
        'An INSERT is slower than an UPDATE',
        'The same worker comes again whenever Workday changes it, and a replay or two overlapping windows send it twice. The upsert by the business key makes every write idempotent: a change updates the badge, a repeat changes nothing, and no duplicate key error stops the run',
        'SQL Server cannot insert from Mule',
        'Workday sends each worker once only',
      ],
      1,
      'A delta by Last_Functionally_Updated brings a worker on every change: email, location, job. Replays and retries send rows again on purpose. With the employee ID as the key, update first and insert when nothing was updated (or a MERGE), the target ends in the same state however often a row arrives.',
    ),
    {
      title: 'Add API Autodiscovery and export the jar',
      how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then choose Export to package the application.`,
      done: (s) => Boolean(project(s)?.autodiscovery?.apiId && project(s).autodiscovery.flowRef === `${ASSET}-main` && project(s).jar),
    },
    {
      title: 'Create the integration system user',
      how: `Workday from the console menu, Integration system users, Create Integration System User. User Name ${ISU}, a password of at least 8 characters, Require New Password at Next Sign In unticked, Do Not Allow UI Sessions ticked, OK. Then Password rules: tick ${ISU} under System Users exempt from password expiration and Save.`,
      done: isuOk,
    },
    {
      title: 'Give it read access to the report fields only',
      how: `Workday, Security groups, Create Security Group: name ${GROUP}, tick ${ISU}, OK. Under Domain security policies tick Get for ${DOMAINS.PUBLIC}, ${DOMAINS.STAFFING} and ${DOMAINS.CONTACT}, Save permissions. Then enter a comment under Activate Pending Security Policy Changes and press Activate.`,
      done: groupOk,
    },
    {
      title: 'Build the RaaS report',
      how: `Workday, Custom reports, Create Custom Report: name ${REPORT}, data source All Active Workers, Create. Tick ${FIELDS.join(', ')}, tick Enable As Web Service, share with ${GROUP}, Save. Under Prompts add Updated_From (Last_Functionally_Updated, From) and Updated_To (same field, To). Web service URLs shows the owner ${SCREEN_USER} for raas.owner.`,
      done: reportOk,
    },
    {
      title: 'Create the database login',
      how: `Database console from the menu, Server ${WD_DB}, New Query: CREATE LOGIN ${DB_USER} WITH PASSWORD = 'a password of yours'; then CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; and GRANT SELECT, INSERT, UPDATE ON ${TABLE} TO ${DB_USER}; Execute. No role such as db_datawriter, no DELETE.`,
      done: dbUserOk,
    },
    {
      title: 'Create the API instance and protect it',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), the API ${ASSET} from Exchange, Save & Deploy. Then Policies, Add policy, Client ID Enforcement. Open Environment information for the Sandbox client ID and secret. Last, Exchange, Badge Sync API, Request access: the Sandbox instance and the application ${CALLER.name}.`,
      done: apiOk,
    },
    {
      title: 'Deploy the app',
      how: `Runtime Manager, Deploy application, name ${WD_PKG}, the exported jar. Properties: workday.host ${WD_HOST}, workday.tenant ${TENANT}, workday.username ${ISU}, raas.owner ${SCREEN_USER}, raas.report ${REPORT}, db.host ${DB_HOST}, db.database ${DB_NAME}, db.user ${DB_USER}, sync.since ${SINCE}, api.id the API Instance ID, anypoint.platform.client_id. Protect workday.password, db.password and anypoint.platform.client_secret. Deploy: the app is Running and the API Active.`,
      done: deployedOk,
    },
    {
      title: 'Hire a test worker in Workday',
      how: `Workday, Business processes, Hire Employee: Legal first name ${TEST.first}, Legal last name ${TEST.last}, Job profile Sales Associate, Location Pier 02 store, Work email ${TEST.email}, Hire date today. Submit. The worker is active today and Last Functionally Updated is now.`,
      done: testHired,
    },
    {
      title: 'Follow the hire into the badge database',
      how: `Runtime Manager, ${WD_PKG}, Schedules, tick ${WD_FLOW}, Run. Logs: the lines with one correlationId show 1 worker read and the badge holder of ${TEST.first} ${TEST.last} inserted with site S102. Database console, ${WD_DB}: SELECT * FROM ${TABLE}; shows the row with the mapped values. Then API client as ${CALLER.name}, GET /sync/status: inserted 1, rejected 0, the counts match.`,
      done: (s) => {
        const a = appOf(s)
        return deployedOk(s) && testBadge(s) && Boolean(a && s.seen[`logs:${a.name}`]) && (s.seen[`db-select:${WD_DB}:${TABLE}`] ?? -1) >= hiredAt(s) && (s.lastCalls ?? []).some((c) => c.app === a.name && c.status === 200 && /^\/sync\/status/.test(c.path))
      },
    },
    ask(
      'The delta window',
      'The flow reads from the watermark to now and stores now as the new watermark only after the window is written. Why this way?',
      [
        'It is the only way RaaS works',
        'Last_Functionally_Updated catches hires and every later change. The window From inclusive and To exclusive leaves no gap and no overlap between runs. If a run fails, the watermark stays, so the next run reads the same window again and the upsert absorbs what was already written. Nothing is lost and nothing doubles',
        'So the report returns every worker each time',
        'Because the scheduler cannot run more often',
      ],
      1,
      'A watermark that moves before the write loses a window when the run fails. One that moves after the write may resend a few rows, which the idempotent upsert absorbs. Use the time the run started as the new watermark, never the time it ended, and mind back dated and future dated hires: the effective date and the moment of the change differ.',
    ),
    {
      title: 'A hire without a work email',
      how: `Workday, Business processes, Hire Employee: ${BAD.first} ${BAD.last}, Picker, Dock 01 warehouse, Work email empty, Submit. Run ${WD_FLOW} again. The log warns that the worker is rejected, the run counts an error, and Runtime Manager, ${WD_PKG}, Object Store shows the worker in the key rejected. No row is written for ${BAD.first} ${BAD.last}.`,
      done: (s) => rejectedAt(s) !== undefined && (s.seen[`os:${appOf(s).name}`] ?? -1) >= rejectedAt(s),
    },
    {
      title: 'Fix it at the source and send it again',
      how: `HR adds the email: Workday, Workers, ${BAD.first} ${BAD.last}, Contact tab, Work email ellis.varga@brightmart.example, Submit. That changes Last Functionally Updated, so the next window brings the worker again. Run ${WD_FLOW} (or POST /sync/replay as ${CALLER.name}). The badge row appears and the rejected list is empty.`,
      done: (s) => Boolean(badId(s) && badge(s, badId(s))?.site_code === 'W01') && !rejected(s),
    },
    {
      title: 'Alert the HR integration team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${WD_PKG}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO} from the mail. A rejected worker and a failed run both reach a person.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === appOf(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    {
      title: 'Promote the API instance to Production',
      how: 'API Manager, switch to Production with the environment button at the top of the left menu. Add API, Promote API from environment, source Sandbox, include Policies. The Production instance gets its own API Instance ID.',
      done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')),
    },
    {
      title: 'Deploy to Production with the Production values',
      how: `Runtime Manager in Production, Deploy application, the same jar. workday.host ${PRD.host}, workday.tenant ${PRD.tenant}, workday.username ${ISU}, the protected workday.password from the mail, db.host ${PRD.dbHost}, db.user ${DB_USER} with the protected db.password from the mail, raas.owner, raas.report, db.database and sync.since as in Sandbox, api.id the Production API Instance ID and the Production client ID and secret from Environment information. The lab has no Production tenant, so the app runs and the API turns Active, but no record moves there.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const p = props(a)
        return a?.status === 'Running' && word(p['workday.host']) === PRD.host && word(p['workday.tenant']) === PRD.tenant && a.secrets['workday.password'] === PRD.isuPassword && word(p['db.host']) === PRD.dbHost && a.secrets['db.password'] === PRD.dbPassword && a.props['db.password'] === undefined && word(p['raas.report']) === REPORT && pairing(s, a).state === 'paired' && apiStatus(s, apiOf(s, 'Production')) === 'Active'
      },
    },
    ask(
      'What changes per environment',
      'What is different between the Sandbox and the Production deployment of this app?',
      [
        'Nothing, the jar decides everything',
        'Only the jar version',
        'The properties: Workday host and tenant, the ISU password of that tenant, the database host and password, api.id of that environment and the client ID and secret of that environment. The jar, the report name, the mapping and the policies stay the same',
        'The DataWeave mapping, because Production has other fields',
      ],
      2,
      'One jar moves through the environments and the configuration changes around it. Implementation and production tenants of Workday have their own users and passwords; the report is migrated to Production with the same name and prompts. The API instance is promoted, so policies match, but its ID and the environment credentials differ. Secrets stay protected in each environment.',
    ),
  ],
  why: `I built a Workday to badge database integration end to end. It started with the request: hires and changes every 15 minutes, the fields, the start time and what to do with a worker without an email. I designed a small Badge Sync API in RAML for status and replay, tried it on the mocking service and published it to Exchange. In Studio the app on that spec has a scheduler, a RaaS call to a custom report with Updated_From and Updated_To prompts on Last_Functionally_Updated, a DataWeave mapping to the badge table and an upsert by employee ID, with a watermark in the object store. In Workday I made an integration system user without UI sessions, a security group with Get on exactly the domains the fields need, activated the policy changes and shared the report; in SQL Server a login with SELECT, INSERT and UPDATE on one table. API Manager got the instance with Client ID Enforcement, and the app was deployed with secure properties and autodiscovery. I hired a test worker and followed the correlation ID from the log to the badge row and the counts. A hire without an email was kept in the rejected list and came through after HR fixed Workday, because the fix moves Last_Functionally_Updated. Then an alert for the team and Production with its own tenant, password, database and API ID. In the lab one Workday tenant exists, so Production is checked by its configuration.`,
  docs: 'https://docs.mulesoft.com/workday-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Badge Sync API')
    s = saveProject(s, s.projects.at(-1).id, RAML)
    s = mark(s, 'mock')
    s = publish(s, s.projects.at(-1).id, { assetId: ASSET, name: 'Badge Sync API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = createIsu(s, { user: ISU, password: ISU_PASSWORD, requireNew: false, noUi: true }).state
    s = setPasswordRules(s, { exempt: [...s.workday.rules.exempt, ISU] }).state
    s = createGroup(s, { name: GROUP, members: [ISU] }).state
    for (const d of [DOMAINS.PUBLIC, DOMAINS.STAFFING, DOMAINS.CONTACT]) s = setPermissions(s, GROUP, d, ['Get']).state
    s = activatePending(s, 'Badge feed to the store access database').state
    s = createReport(s, { name: REPORT, source: 'All Active Workers' }).state
    s = editReport(s, REPORT, { fields: FIELDS, ws: true, share: [GROUP] }).state
    s = addPrompt(s, REPORT, { name: 'Updated_From', field: 'Last_Functionally_Updated', op: 'from' }).state
    s = addPrompt(s, REPORT, { name: 'Updated_To', field: 'Last_Functionally_Updated', op: 'to' }).state
    s = runSql(s, WD_DB, `CREATE LOGIN ${DB_USER} WITH PASSWORD = '${DB_PASSWORD}'; CREATE USER ${DB_USER} FOR LOGIN ${DB_USER}; GRANT SELECT, INSERT, UPDATE ON ${TABLE} TO ${DB_USER}`).state
    s = addApi(s, { assetId: ASSET, label: 'badge-sync-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = requestAccess(mark(s, 'env:Sandbox'), id, CALLER.name)
    const p = project(s)
    const base = { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': ISU, 'raas.owner': SCREEN_USER, 'raas.report': REPORT, 'db.host': DB_HOST, 'db.database': DB_NAME, 'db.user': DB_USER, 'sync.since': SINCE }
    s = finishDeploys(deployApp(s, { name: WD_PKG, pkg: p.pkg, jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1, props: { ...base, 'api.id': id, 'anypoint.platform.client_id': s.creds.Sandbox.id }, secrets: { 'workday.password': ISU_PASSWORD, 'db.password': DB_PASSWORD, 'anypoint.platform.client_secret': s.creds.Sandbox.secret } }).state)
    s = hireWorker(s, { ...TEST, hireDate: '2026-11-03' }).state
    s = runNow(advance(s, MINUTE), WD_PKG, WD_FLOW)
    s = mark(s, `logs:${WD_PKG}`)
    s = runSql(s, WD_DB, `SELECT * FROM ${TABLE}`).state
    s = callApi(s, { env: 'Sandbox', app: WD_PKG, method: 'GET', path: '/sync/status', body: '', client: CALLER.name, clientId: CALLER.clientId, clientSecret: CALLER.clientSecret }).state
    s = hireWorker(s, { ...BAD, hireDate: '2026-11-03' }).state
    s = runNow(advance(s, MINUTE), WD_PKG, WD_FLOW)
    s = mark(s, `os:${WD_PKG}`)
    s = changeEmail(s, badId(s), 'ellis.varga@brightmart.example').state
    s = runNow(advance(s, MINUTE), WD_PKG, WD_FLOW)
    s = addMonAlert(s, { title: 'Badge sync errors', resource: 'Application', name_: WD_PKG, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: false, alerts: false })
    s = mark(s, 'env:Production')
    s = finishDeploys(deployApp(s, { name: WD_PKG, pkg: p.pkg, jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1, props: { ...base, 'workday.host': PRD.host, 'workday.tenant': PRD.tenant, 'db.host': PRD.dbHost, 'api.id': s.lastApi, 'anypoint.platform.client_id': s.creds.Production.id }, secrets: { 'workday.password': PRD.isuPassword, 'db.password': PRD.dbPassword, 'anypoint.platform.client_secret': s.creds.Production.secret } }).state)
    return s
  },
  answers: { 5: 1, 15: 1, 21: 2 },
}

export const LABS = [lab]
