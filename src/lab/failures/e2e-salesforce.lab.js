// The end to end lab of Salesforce: loyalty members from SQL Server to Salesforce Accounts, from the request mail to
// Production. See platform-labs.js for the shape of a lab.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, saveProject, setStudio } from '../platform.js'
import { ask, creds, OPS } from '../platform-kit.js'
import { accessOf, apiEnabled, assignPermset, createPermset, createUser, newOrg, newSalesforce, objectAccess, orgOf, recordsOf, setApiEnabled, setFieldAccess, setObjectAccess } from '../platform-salesforce.js'
import { newSqlServer, runSql, serverOf, tablesOf } from '../platform-db.js'
import { ASSET, BATCH, DATABASE, DB, DB_PRD, FLOW, MAIN, NAME, TABLE } from './e2e-salesforce.pkg.js'

const TEAM = 'crm-integrations@brightmart.example'
const APP = 'loyalty-sfdc-sync'
const USER = 'mule.loyalty@brightmart.example' // Production
const SBX_USER = `${USER}.uat` // a sandbox appends its name to every username
const PERMSET = 'Loyalty_Account_Sync'
const PROFILE = 'Brightmart Integration User'
const FIELDS = ['Brightmart_Customer_Id__c', 'Loyalty_Tier__c', 'BillingCity', 'BillingCountry', 'Type']
const DB_LOGIN = 'mule_loyalty'
const DB_PASSWORD = 'Loyalty-Sbx-2026' // made-up lab values
const DB_PASSWORD_PRD = 'Loyalty-Prd-2026'
const SF_PASSWORD = 'Loyalty-Sync-26'
const PRD_SF = { password: 'Loyalty-Prd-Sf-26', token: 'labTokenLoyaltyP7' }
const GOOD = { id: 'HC-40001', name: 'Tidewater Grocers', tier: 'Gold', city: 'Saltmere', country: 'Denmark' }
const BAD = { id: 'HC-40002', name: 'Marram Kitchen', tier: 'Platinum', city: 'Brightwater', country: 'Sweden' }
const LIVE = { id: 'HC-40010', name: 'Pebble Lane Bakery', tier: 'Silver', city: 'Harborview', country: 'Norway' }

const RAML = `#%RAML 1.0
title: Loyalty Sync API
version: v1
mediaType: application/json
types:
  SyncStatus:
    properties:
      customerId: string
      syncStatus:
        enum: [PENDING, SYNCED, FAILED]
      salesforceId?: string
      syncError?: string
/members/{customerId}:
  get:
    description: The sync status of one loyalty member
    responses:
      200:
        body:
          type: SyncStatus
          example: |
            { "customerId": "HC-40001", "syncStatus": "SYNCED", "salesforceId": "001Hu000000123AAA" }
      404:
        body:
          example: |
            { "message": "No member HC-49999" }
`
const STUDIO = `<!-- global elements: values come from properties, secrets from protected properties -->
<db:config name="Database_Config">
  <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}"
      user="\${db.user}" password="\${db.password}" />
</db:config>
<salesforce:sfdc-config name="Salesforce_Config">
  <salesforce:basic-connection url="\${salesforce.url}/services/Soap/u/61.0" username="\${salesforce.username}"
      password="\${salesforce.password}" securityToken="\${salesforce.securityToken}" />
</salesforce:sfdc-config>
<api-gateway:autodiscovery apiId="\${api.id}" flowRef="${MAIN}" />

<flow name="${FLOW}">
  <scheduler><scheduling-strategy><fixed-frequency frequency="5" timeUnit="MINUTES" /></scheduling-strategy></scheduler>
  <db:select doc:name="Select pending members" config-ref="Database_Config">
    <db:sql>SELECT TOP ${BATCH} customer_id, name, tier, city, country FROM ${TABLE}
            WHERE sync_status = 'PENDING' ORDER BY customer_id</db:sql>
  </db:select>
  <ee:transform doc:name="Rows to Accounts">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/java
---
payload map {
  Name: $.name,
  Brightmart_Customer_Id__c: $.customer_id,
  Loyalty_Tier__c: $.tier,
  BillingCity: $.city,
  BillingCountry: $.country,
  Type: "Customer"
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <salesforce:upsert doc:name="Upsert accounts" config-ref="Salesforce_Config"
      objectType="Account" externalIdFieldName="Brightmart_Customer_Id__c" />
  <!-- then per result: UPDATE the row to SYNCED with the Account Id, or to FAILED with the error -->
</flow>`

const sfOrg = (s, name = 'Sandbox') => orgOf(s, name)
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === NAME)
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === NAME && a.env === env && a.status === 'Running')
const props = (a) => ({ ...a?.props, ...a?.secrets })
const rowOf = (s, id, db = DB) => (serverOf(s, db) ? tablesOf(serverOf(s, db))[TABLE]?.rows ?? [] : []).find((r) => r.customer_id === id)
const accountOf = (s, id, org = 'Sandbox') => recordsOf(sfOrg(s, org), 'Account').find((r) => r.Brightmart_Customer_Id__c === id)
const sbxUser = (s) => (sfOrg(s)?.users ?? []).find((u) => u.username === SBX_USER)
// the permission set holds API Enabled, Read, Create and Edit on Account and Edit on the mapped fields, and no more
const grants = (o, p) => {
  const h = o?.permsets?.[p]
  if (!h?.apiEnabled || h.modifyAll || h.allObjects) return false
  const fake = { username: '-', profile: '-', permsets: [p] }
  return objectAccess(o, fake, 'Account') === 'CRE' && FIELDS.every((f) => accessOf(o, fake, 'Account', f) === 'edit') && Object.keys(h.objects ?? {}).every((t) => t === 'Account')
}
const userOk = (s) => {
  const u = sbxUser(s)
  return Boolean(u) && u.profile === PROFILE && apiEnabled(sfOrg(s), u) && (u.permsets ?? []).some((p) => grants(sfOrg(s), p))
}
// the deploy: the jar from Studio, the Sandbox values, every secret protected, linked to the Sandbox instance
const deployOk = (s) => {
  const a = appOf(s)
  const api = apiOf(s)
  if (!a || !api) return false
  const p = a.props
  const sec = a.secrets ?? {}
  const u = sbxUser(s)
  const url = String(p['salesforce.url'] ?? '').trim().replace(/\/$/, '')
  return (
    p['db.host'] === 'sql.brightmart.lab' && String(p['db.port']) === '1433' && p['db.database'] === DATABASE && p['db.user'] === DB_LOGIN && sec['db.password'] === DB_PASSWORD &&
    url === 'https://test.salesforce.com' && String(p['salesforce.username'] ?? '').trim().toLowerCase() === SBX_USER && sec['salesforce.password'] === u?.password && sec['salesforce.securityToken'] === u?.token &&
    !['db.password', 'salesforce.password', 'salesforce.securityToken', 'anypoint.platform.client_secret'].some((k) => k in p) &&
    apiStatus(s, api) === 'Active'
  )
}
const synced = (s, m, org = 'Sandbox', db = DB) => {
  const r = accountOf(s, m.id, org)
  return Boolean(r) && r.Name === m.name && r.Loyalty_Tier__c === (m.fixed ?? m.tier) && r.BillingCountry === m.country && rowOf(s, m.id, db)?.sync_status === 'SYNCED' && rowOf(s, m.id, db)?.sf_id === r.Id
}
const insertOf = (m, status = 'PENDING') => `INSERT INTO ${TABLE} (customer_id, name, tier, city, country, sync_status) VALUES ('${m.id}', '${m.name}', '${m.tier}', '${m.city}', '${m.country}', '${status}');`
const TABLE_SQL = `CREATE TABLE ${TABLE} (customer_id varchar(12) NOT NULL PRIMARY KEY, name nvarchar(120) NOT NULL, tier varchar(10) NULL, city nvarchar(40) NULL, country nvarchar(80) NULL, sync_status varchar(10) NOT NULL DEFAULT 'PENDING', sf_id varchar(18) NULL, sync_error nvarchar(200) NULL, updated_at datetime2 NOT NULL DEFAULT SYSDATETIME());`
const setupSql = (password) => [TABLE_SQL, `CREATE LOGIN ${DB_LOGIN} WITH PASSWORD = '${password}', DEFAULT_DATABASE = ${DATABASE};`, `CREATE USER ${DB_LOGIN} FOR LOGIN ${DB_LOGIN} WITH DEFAULT_SCHEMA = dbo;`, `GRANT SELECT, UPDATE ON ${TABLE} TO ${DB_LOGIN};`].join('\n')
const sbxDeploy = (s, u) => {
  const c = creds(s, 'Sandbox')
  return { props: { 'db.host': 'sql.brightmart.lab', 'db.port': '1433', 'db.database': DATABASE, 'db.user': DB_LOGIN, 'salesforce.url': 'https://test.salesforce.com', 'salesforce.username': SBX_USER, 'api.id': apiOf(s).id, ...c.props }, secrets: { 'db.password': DB_PASSWORD, 'salesforce.password': SF_PASSWORD, 'salesforce.securityToken': u.token, ...c.secrets } }
}

function start() {
  const server = (name, host) => newSqlServer(name, { host, database: DATABASE, tables: {}, users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }] })
  // Production: the security team mirrored the integration user with the same permission set before go live
  const prod = newOrg('Production')
  prod.permsets[PERMSET] = { label: 'Loyalty Account Sync', apiEnabled: true, objects: { Account: 'CRE' }, fields: Object.fromEntries(FIELDS.map((f) => [`Account.${f}`, 'edit'])) }
  prod.users.push({ username: USER, name: 'Loyalty Account Sync', profile: PROFILE, license: 'Salesforce Integration', permsets: [PERMSET], password: PRD_SF.password, token: PRD_SF.token, active: true, created: 0 })
  let s = newPlatform({
    clock: at(1, 9),
    studioPkgs: { [ASSET]: NAME },
    salesforce: newSalesforce({ orgs: { Production: prod, Sandbox: newOrg('Sandbox') } }),
    databases: { created: at(1, 8), servers: { [DB]: server(DB, 'sql.brightmart.lab'), [DB_PRD]: server(DB_PRD, 'sql-prd.brightmart.lab') } },
    mail: [
      {
        t: at(1, 8, 30),
        to: OPS,
        subject: 'Loyalty members into Salesforce: request',
        body: `Hello, the loyalty program goes live this week. The store systems write each new or changed member into ${TABLE} of ${DATABASE} (SQL Server) with sync_status PENDING. Sales wants every member in Salesforce as an Account, matched on Brightmart_Customer_Id__c, so a member that changes tier updates the same Account.\n\nFields: customer_id to Brightmart_Customer_Id__c, name to Name, tier to Loyalty_Tier__c, city to BillingCity, country to BillingCountry, Type is Customer.\nVolume: about 3000 members a day, up to 400 in the evening peak. Every 5 minutes is fine.\nErrors: a member Salesforce refuses must not be lost. Keep it with the error so we can fix it and send it again.\nThe service desk wants GET /members/{customerId} to see the status of one member.\nAlerts to ${TEAM}.\n\nThanks, CRM team`,
        source: 'Brightmart CRM team',
      },
      {
        t: at(1, 8, 45),
        to: OPS,
        subject: 'Loyalty sync: database login and Production user',
        body: `The DBA team created ${DATABASE} with table ${TABLE} on sql.brightmart.lab (Sandbox) and sql-prd.brightmart.lab (Production), port 1433. Login ${DB_LOGIN} has SELECT and UPDATE on the table and nothing else. Its practice password is ${DB_PASSWORD} in Sandbox and ${DB_PASSWORD_PRD} in Production.\nIn the Production org the security team created ${USER} with the permission set ${PERMSET}. Its practice password is ${PRD_SF.password} and its security token ${PRD_SF.token}. The Sandbox user is yours to create.`,
        source: 'Brightmart security team',
      },
    ],
  })
  s = runSql(s, DB, `${setupSql(DB_PASSWORD)}\n${insertOf({ id: 'HC-30001', name: 'Gull Rock Coffee', tier: 'Silver', city: 'Harborview', country: 'Norway' }, 'SYNCED')}`).state
  s = runSql(s, DB_PRD, `${setupSql(DB_PASSWORD_PRD)}\n${insertOf(LIVE)}`).state
  return s
}

const lab = {
  id: 'p-e2e-salesforce',
  group: 'End to end by system',
  title: 'End to end: loyalty members, SQL Server to Salesforce',
  minutes: 60,
  scenario: `Brightmart starts a loyalty program. The store systems write members into ${TABLE} in SQL Server, and Sales wants them in Salesforce as Accounts. You build ${APP}, a Mule app on CloudHub 2.0: every 5 minutes it reads the PENDING rows, maps them in DataWeave and upserts them as Accounts on the external ID Brightmart_Customer_Id__c, then marks each row SYNCED or FAILED. It also offers GET /members/{customerId} to the service desk through API Manager. A member travels: row in SQL Server, select, DataWeave, upsert, Account in Salesforce, status back in the row. Take it from the request mail through design, build, Salesforce setup, deployment, a traced member, a failure, an alert and Production.`,
  start,
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Read both mails: the fields, the volume, the schedule, the error rule, the alert address, and what the DBA and security teams prepared.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Design the Loyalty Sync API',
      how: 'Design Center, Create new, New API Specification, name Loyalty Sync API. Write the RAML below: GET /members/{customerId} with a 200 and a 404 example.',
      code: RAML,
      done: (s) => s.projects.some((p) => ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'GET', '/members/HC-40001').status === 200),
    },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the Mocking service, choose GET /members/{customerId}, Try it, Send. The service desk can try the contract before the app exists.', done: (s) => Boolean(s.seen.mock) && s.projects.some((p) => /loyalty/i.test(p.name)) },
    { title: 'Publish it to Exchange', how: `Publish, Publish to Exchange. Asset ID ${ASSET}, version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => Boolean(asset(s)) },
    {
      title: 'Build the flow in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project holds the flows your team wrote on this spec. The important part is below: the two connector configs with \${property} placeholders, the select of PENDING rows, the DataWeave from columns to Account fields, and salesforce:upsert with externalIdFieldName.`,
      code: STUDIO,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Upsert, not create',
      'Why does the flow use salesforce:upsert with externalIdFieldName="Brightmart_Customer_Id__c" and not salesforce:create?',
      ['Create is slower', 'A member who changes tier comes again. Upsert finds the Account by the external ID and updates it, so there is never a second Account for one member, and the app needs no lookup of Salesforce IDs', 'Create needs the Modify All permission', 'Upsert writes to every org at once'],
      1,
      'Create would add a second Account each time a member changes. Upsert matches on a field marked External ID (and Unique): no match creates, one match updates, two matches give DUPLICATE_EXTERNAL_ID. The key comes from the source system, so the app keeps no table of Salesforce IDs.',
    ),
    { title: 'Add Autodiscovery and export the jar', how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${MAIN}. Then choose Export.`, done: (s) => Boolean(project(s)?.jar && project(s).autodiscovery?.apiId === '${api.id}' && project(s).autodiscovery.flowRef === MAIN) },
    {
      title: 'Create the integration user in the Sandbox org',
      how: `Salesforce, Org Sandbox, Users, New User. Last Name Loyalty Account Sync, Username ${SBX_USER} (a sandbox appends .uat to every username), Profile ${PROFILE} (API only, with no object access of its own), Password ${SF_PASSWORD}. Save. The security token arrives in the Inbox.`,
      done: (s) => Boolean(sbxUser(s)),
    },
    {
      title: 'Grant least privilege with a permission set',
      how: `Salesforce, Org Sandbox, Permission Sets, New: Label Loyalty Account Sync, API Name ${PERMSET}. Tick API Enabled. Object Settings: Read, Create and Edit on Account, nothing else. Field permissions on Account: Read Access and Edit Access on ${FIELDS.join(', ')}. Then Users, on ${SBX_USER} choose ${PERMSET} and Add Assignment.`,
      done: userOk,
    },
    { title: 'Create the API instance', how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select ${ASSET} from Exchange, then Save & Deploy. Note the API Instance ID. Open Environment information for the client ID and secret of Sandbox.`, done: (s) => Boolean(apiOf(s)) && Boolean(s.seen['env:Sandbox']) },
    { title: 'Apply Client ID Enforcement', how: 'API instance, Policies, Add policy, Client ID Enforcement, Apply. The service desk tool calls with its own client ID and secret from a contract.', done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) },
    {
      title: 'Deploy the app to Sandbox',
      how: `Runtime Manager, Deploy application. Name ${APP}, choose the exported file ${ASSET}-1.0.0-mule-application.jar. Properties: db.host sql.brightmart.lab, db.port 1433, db.database ${DATABASE}, db.user ${DB_LOGIN}, salesforce.url https://test.salesforce.com, salesforce.username ${SBX_USER}, api.id the API Instance ID, anypoint.platform.client_id of Sandbox. Protect db.password, salesforce.password, salesforce.securityToken (from the mail of Salesforce) and anypoint.platform.client_secret. Deploy Application. The app is Running and the API instance turns Active.`,
      done: deployOk,
    },
    {
      title: 'Put a test member in SQL Server',
      how: `Databases from the console menu, server ${DB}, New Query. Run\n${insertOf(GOOD)}\nand Execute. This is what a store system writes.`,
      done: (s) => Boolean(rowOf(s, GOOD.id)),
    },
    {
      title: 'Follow the member to Salesforce',
      how: `Move the clock 5 minutes. Runtime Manager, ${APP}, Logs: find the correlationId of the run and the line for customer_id=${GOOD.id} with its Account ID. Then Salesforce, Org Sandbox, Accounts: ${GOOD.name} is there with Loyalty Tier ${GOOD.tier} and Billing Country ${GOOD.country}. Back in SQL Server, SELECT * FROM ${TABLE}; shows the row SYNCED with the same sf_id. Two rows in the table, one new Account: the counts match.`,
      done: (s) => synced(s, GOOD) && Boolean(s.seen[`logs:${appOf(s)?.name}`]) && Boolean(s.seen['sf:accounts'] || s.seen['sf:soql']),
    },
    ask(
      'A crash between the two writes',
      'The upsert worked, then the replica restarts before the UPDATE to SYNCED. What happens to that member?',
      ['It is lost', 'The row is still PENDING, so the next run sends it again. Upsert on the external ID updates the same Account, so the repeat does no harm', 'Salesforce gets a duplicate Account', 'The row is marked FAILED'],
      1,
      'The status is written after Salesforce answers, so at worst a member is sent twice and never zero times: at least once delivery. That is safe only because the write is idempotent. Upsert on Brightmart_Customer_Id__c gives the same Account every time. With create the same crash would leave a duplicate.',
    ),
    {
      title: 'Send a member Salesforce refuses',
      how: `Marketing added a Platinum tier in the store system, and Salesforce does not know it yet. Run\n${insertOf(BAD)}\nMove the clock 5 minutes. In the logs the member has INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST, and the row is FAILED with the error in sync_error. It is kept, not lost, and the other members still go through.`,
      // the run keeps its failures in the object store, so the step stays met after the replay
      done: (s) => Boolean(rowOf(s, BAD.id)) && (appOf(s)?.store?.failed ?? []).some((f) => f.id === BAD.id && f.code === 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST'),
    },
    {
      title: 'Fix it and replay',
      how: `The CRM team decides that Platinum members are Gold in Salesforce until the picklist gets the new value. Run\nUPDATE ${TABLE} SET tier = 'Gold', sync_status = 'PENDING' WHERE customer_id = '${BAD.id}';\nMove the clock 5 minutes. ${BAD.name} arrives as Gold and the row is SYNCED.`,
      done: (s) => synced(s, { ...BAD, fixed: 'Gold' }),
    },
    { title: 'Alert the CRM team', how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, severity High, recipient ${TEAM}. A run with failed members counts as errors.`, done: (s) => s.monAlerts.some((a) => a.enabled && a.resource === 'Application' && a.name_ === APP && a.metric === 'Message Error Count' && String(a.recipients ?? '').toLowerCase().includes(TEAM)) },
    ask(
      'The batch size',
      `The select reads TOP ${BATCH} and the evening peak is 400 members. Why ${BATCH}?`,
      ['It is the default of the Database connector', `A SOAP upsert takes at most ${BATCH} records. More in one call gives EXCEEDED_ID_LIMIT. The rest waits 5 minutes for the next run, which is fine for this volume`, 'Salesforce allows 200 API requests a day', 'SQL Server returns at most 200 rows'],
      1,
      `One upsert call takes up to ${BATCH} records, and the whole call costs one API request. 400 members are two runs. For hundreds of thousands of rows the Bulk API 2.0 would be the choice, with its own job and result files.`,
    ),
    { title: 'Promote the API instance to Production', how: 'API Manager, switch to Production. Add API, Promote API from environment, source Sandbox, include the policies. Note the new API Instance ID.', done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')) },
    {
      title: 'Deploy to Production and see the first member arrive',
      how: `Runtime Manager in Production, Deploy application, the same exported file. Production values: db.host sql-prd.brightmart.lab, db.password ${DB_PASSWORD_PRD}, salesforce.url https://login.salesforce.com, salesforce.username ${USER}, the Production password and token from the security mail, api.id the Production API Instance ID, and the Production client ID and secret from Environment information. Move the clock 10 minutes: the first run comes 5 minutes after the start. In Salesforce, Org Production, Accounts shows ${LIVE.name}, the first real member.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        return Boolean(a && apiOf(s, 'Production')) && apiStatus(s, apiOf(s, 'Production')) === 'Active' && Boolean(a.secrets?.['salesforce.securityToken']) && !('salesforce.password' in a.props) && synced(s, LIVE, 'Production', DB_PRD)
      },
    },
  ],
  why: `The CRM team asked for loyalty members from SQL Server in Salesforce, matched on our customer ID, with failures kept and an alert. I designed a small Loyalty Sync API in RAML for the service desk, tried it in the mocking service and published it to Exchange. In Studio I built the flow on that spec: a scheduler every 5 minutes, a select of PENDING rows, a DataWeave map to Account fields and salesforce:upsert on the external ID Brightmart_Customer_Id__c, then an UPDATE of each row to SYNCED with the Account ID or FAILED with the error. Upsert makes a repeat harmless, so a crash between the two writes only sends a member twice. In the Sandbox org I created an API only integration user with a permission set that grants API Enabled and only Account and the mapped fields. I created the API instance with Client ID Enforcement, deployed the jar with every secret protected and the API turned Active. A test row became an Account in 5 minutes, which I followed by its correlation ID in the log. A Platinum member was refused with INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST and stayed FAILED in the table until we fixed it and set it to PENDING again. Monitoring alerts the CRM team on errors. For Production I promoted the instance and deployed the same jar with the Production database, login URL, user, token, API ID and credentials.`,
  docs: 'https://docs.mulesoft.com/salesforce-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = saveProject(createProject(s, 'Loyalty Sync API'), 'p1', RAML)
    s = mark(s, 'mock')
    s = publish(s, 'p1', { assetId: ASSET, name: 'Loyalty Sync API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: MAIN } }), ASSET)
    s = createUser(s, 'Sandbox', { username: SBX_USER, name: 'Loyalty Account Sync', profile: PROFILE, password: SF_PASSWORD }).state
    s = createPermset(s, 'Sandbox', { label: 'Loyalty Account Sync', name: PERMSET }).state
    s = setApiEnabled(s, 'Sandbox', 'permset', PERMSET, true)
    s = setObjectAccess(s, 'Sandbox', 'permset', PERMSET, 'Account', 'RCE')
    for (const f of FIELDS) s = setFieldAccess(s, 'Sandbox', 'permset', PERMSET, 'Account', f, 'edit')
    s = assignPermset(s, 'Sandbox', SBX_USER, PERMSET)
    s = addApi(s, { assetId: ASSET, label: 'loyalty-sbx', upstream: '', consumer: '' })
    s = mark(s, 'env:Sandbox')
    s = applyPolicy(s, apiOf(s).id, 'client-id')
    const jar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, ...sbxDeploy(s, sbxUser(s)) }).state)
    s = runSql(s, DB, insertOf(GOOD)).state
    s = advance(s, 5 * MINUTE)
    s = mark(mark(s, `logs:${APP}`), 'sf:accounts')
    s = runSql(s, DB, insertOf(BAD)).state
    s = advance(s, 5 * MINUTE)
    s = runSql(s, DB, `UPDATE ${TABLE} SET tier = 'Gold', sync_status = 'PENDING' WHERE customer_id = '${BAD.id}';`).state
    s = advance(s, 5 * MINUTE)
    s = addMonAlert(s, { title: 'Loyalty sync errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, apiOf(s, 'Sandbox').id, { policies: true, tiers: true, alerts: false })
    const c = creds(s, 'Production')
    const pjar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...pjar, replicas: 1, vCores: 0.1, props: { 'db.host': 'sql-prd.brightmart.lab', 'db.port': '1433', 'db.database': DATABASE, 'db.user': DB_LOGIN, 'salesforce.url': 'https://login.salesforce.com', 'salesforce.username': USER, 'api.id': apiOf(s, 'Production').id, ...c.props }, secrets: { 'db.password': DB_PASSWORD_PRD, 'salesforce.password': PRD_SF.password, 'salesforce.securityToken': PRD_SF.token, ...c.secrets } }).state)
    return advance(s, 10 * MINUTE)
  },
  answers: { 5: 1, 14: 1, 18: 1 },
}

export const LABS = [lab]
