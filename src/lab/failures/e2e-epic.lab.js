// The guided lab e2e-epic. See platform-labs.js for the shape of a lab.
// The whole life of an Epic integration: the request, the RAML, Studio, the Epic backend app, API Manager, the deploy,
// one patient traced from Epic to the care database, an unknown MRN fixed and replayed, an alert and Production.
import { addApi, addMonAlert, applyPolicy, apiStatus, at, callApi, createClient, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, runNow, saveProject, setStudio } from '../platform.js'
import { ask, creds, until } from '../platform-kit.js'
import { dbCtx, newSqlServer, runSql } from '../platform-db.js'
import { addPublicKey, BASE, createBackendApp, generateKeyPair, KEYSTORE_PASSWORD, keyOf, newEpic, PROD_BASE, PROD_TOKEN_URL, publicKeysOf, setAppScopes, TOKEN_URL } from '../platform-epic.js'
import { ASSET, FLOW, ROSTER } from './e2e-epic.pkg.js'

const PROJECT = 'Care Roster System API'
const APP = 'care-roster-sapi'
const EPIC_APP = 'Brightmart Care Roster Sync'
const ALIAS = 'care-roster-2026-11'
const LEAST = ['system/Patient.read', 'system/Observation.read']
const ALERT_TO = 'care-integrations@brightmart.example'
const CONSOLE = 'Care Ops Console'
const NEW_MRN = '203714'
const TYPO = '203751'
const FIXED = '203715'
const SBX = { host: 'care-sql.brightmart.lab', password: 'Care-Sync-Sbx-26' }
const PRD = { host: 'care-sql-prd.brightmart.lab', password: 'Care-Sync-Prd-26' } // made-up lab values
const word = (v) => String(v ?? '').trim()

const RAML = `#%RAML 1.0
title: Care Roster System API
version: v1
mediaType: application/json
types:
  CarePatient:
    properties:
      mrn: string
      family_name: string
      given_name: string
      birth_date: string
      sex: string
      vital_signs: integer
/patients/{mrn}:
  get:
    description: One patient of the care roster, as the last sync wrote it
    responses:
      200:
        body:
          type: CarePatient
          example: |
            { "mrn": "203711", "family_name": "Tallon", "given_name": "Mira", "birth_date": "1958-03-14", "sex": "F", "vital_signs": 48 }
      404:
        body:
          example: |
            { "message": "No care patient with MRN 203799" }
/sync:
  post:
    description: Run the roster sync now, for every enrolled MRN
    responses:
      200:
        body:
          example: |
            { "upserted": ["203711"], "notFound": [] }
`
const FLOW_CODE = `<!-- global elements: every value that changes per environment is a property -->
<http:request-config name="Epic_FHIR_Config" responseTimeout="30000" />
<db:config name="Care_Database_Config">
  <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}"
                       user="\${db.user}" password="\${secure::db.password}" />
</db:config>

<!-- roster-sync-flow: scheduler, token (JWT signed with \${epic.jwt.keyAlias}), enrollments, then per MRN: -->
<http:request config-ref="Epic_FHIR_Config" method="GET" url="\${epic.fhirBase}/Patient">
  <http:headers>#[{ Authorization: "Bearer " ++ vars.accessToken, Accept: "application/fhir+json" }]</http:headers>
  <http:query-params>#[{ identifier: "MRN|" ++ vars.mrn }]</http:query-params>
</http:request>
<!-- Observation?patient=..&category=vital-signs&_count=\${sync.pageSize}, then follow link next until there is none -->

<ee:transform doc:name="FHIR to care row">
  <ee:set-payload><![CDATA[%dw 2.0
output application/java
var pt = vars.patient
var hr = (vars.vitals filter ($.code.coding[0].code == "8867-4") orderBy $.effectiveDateTime)[-1]
---
{
  mrn: vars.mrn,
  epic_id: pt.id,
  family_name: pt.name[0].family,
  given_name: pt.name[0].given joinBy " ",
  birth_date: pt.birthDate,
  sex: { female: "F", male: "M", other: "O" }[pt.gender] default "U",
  vital_signs: sizeOf(vars.vitals),
  last_heart_rate: hr.valueQuantity.value,
  synced_at: now()
}]]></ee:set-payload>
</ee:transform>
<!-- upsert by the natural key: UPDATE ... WHERE mrn = :mrn, and INSERT when no row was updated -->
<db:update config-ref="Care_Database_Config">
  <db:sql>UPDATE dbo.care_patients SET family_name = :family_name, ... WHERE mrn = :mrn</db:sql>
  <db:input-parameters>#[payload]</db:input-parameters>
</db:update>`

const MAIL = {
  t: at(1, 8, 30),
  to: 'integration-team@brightmart.example',
  subject: 'Care roster from Epic into the care database',
  body: [
    'Hello integration team,',
    'Brightmart Care monitors heart failure patients of Bayview Health. Our nurses work from the care database, so we need each enrolled patient there with name, birth date, sex, the number of vital signs and the latest heart rate.',
    'Source: Epic at Bayview over FHIR R4, as a SMART backend app. Bayview approved demographics (Patient) and vital signs (Observation) only. Make a new signing key for it, alias care-roster-2026-11, kid the same. The key store password is the lab value in the vault, keep it protected.',
    `Target: dbo.care_patients in database BrightmartCare. Sandbox server ${SBX.host}, login care_sync, password ${SBX.password}. Production server ${PRD.host}, login care_sync, password ${PRD.password}. Both are lab values.`,
    'Trigger: every 15 minutes, and on demand from our ops console (POST /sync). The list of patients is dbo.care_enrollments: a nurse adds a row, the next run picks it up. About 400 patients, a few dozen vital signs each, so read every page.',
    `Errors: an MRN that Bayview does not know must not stop the others and must not get lost. Mark it, so we fix it. Alerts to ${ALERT_TO}.`,
    'Brightmart Care program lead',
  ].join('\n\n'),
  source: 'Brightmart Care program lead',
}

const careServer = (name, host, password, enrolled) => {
  const srv = newSqlServer(name, {
    host,
    database: 'BrightmartCare',
    tables: {},
    logins: [
      { name: 'BRIGHTMART\\dba', type: 'Windows login', password: null, disabled: false, defaultDb: 'BrightmartCare', policy: false, failed: 0, sysadmin: true },
      { name: 'care_sync', type: 'SQL login', password, disabled: false, defaultDb: 'BrightmartCare', policy: true, failed: 0 },
    ],
    users: [
      { name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] },
      { name: 'care_sync', login: 'care_sync', schema: 'dbo', roles: ['db_datareader', 'db_datawriter'] },
    ],
  })
  const s = { clock: 0, databases: { servers: { [name]: srv } } }
  const db = dbCtx(s, null)
  db.ensureTable(name, 'dbo.care_enrollments', { columns: [['mrn', 'varchar(12)'], ['program', 'nvarchar(40)', true], ['status', 'varchar(12)'], ['note', 'nvarchar(200)', true]], pk: ['mrn'], rows: enrolled.map(([mrn, program]) => ({ mrn, program, status: 'ENROLLED', note: null })) })
  db.ensureTable(name, 'dbo.care_patients', {
    columns: [['mrn', 'varchar(12)'], ['epic_id', 'varchar(40)'], ['family_name', 'nvarchar(60)'], ['given_name', 'nvarchar(60)'], ['birth_date', 'date', true], ['sex', 'char(1)'], ['vital_signs', 'int'], ['last_heart_rate', 'int', true], ['synced_at', 'datetime2']],
    pk: ['mrn'],
  })
  return srv
}
const table = (s, server, key) => s.databases?.servers?.[server]?.tables?.[key]?.rows ?? []
const careRow = (s, server, mrn) => table(s, server, 'dbo.care_patients').find((r) => r.mrn === mrn)
const enrollment = (s, server, mrn) => table(s, server, 'dbo.care_enrollments').find((r) => r.mrn === mrn)

const y = (s) => s.epic ?? {}
const reg = (s) => (y(s).apps ?? []).find((a) => a.name.toLowerCase() === EPIC_APP.toLowerCase())
const project = (s) => s.projects.find((p) => /care roster/i.test(p.name))
const resources = (raml) => ramlErrors(raml).length === 0 && [['GET', '/patients/203711'], ['POST', '/sync']].every(([m, path]) => mockCall(raml, m, path).status < 300)
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const studio = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === ROSTER)
const api = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const app = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === ROSTER && a.env === env && a.status !== 'Stopped')
const props = (a) => ({ ...a?.props, ...a?.secrets })
const ownKey = (s) => {
  const r = reg(s)
  const others = (y(s).apps ?? []).filter((x) => x !== r).flatMap((x) => x.keys.map((k) => k.kid))
  return (y(s).keystore ?? []).find((k) => !others.includes(k.kid) && publicKeysOf(y(s), r).some((p) => p.kid === k.kid && p.thumb === k.thumb))
}
const leastOk = (s) => {
  const sc = reg(s)?.scopes ?? []
  return sc.length === LEAST.length && LEAST.every((x) => sc.includes(x))
}
// the deploy settings of one environment: Epic side, care database, key store and API Manager
const configOk = (s, env) => {
  const a = app(s, env)
  const r = reg(s)
  if (a?.status !== 'Running' || !r) return false
  const p = a.props ?? {}
  const sec = a.secrets ?? {}
  const prod = env === 'Production'
  const key = keyOf(y(s), p['epic.jwt.keyAlias'])
  const db = prod ? PRD : SBX
  return (
    word(p['epic.tokenUrl']) === (prod ? PROD_TOKEN_URL : TOKEN_URL) &&
    word(p['epic.fhirBase']) === (prod ? PROD_BASE : BASE) &&
    word(p['epic.clientId']) === (prod ? r.prodId : r.clientId) &&
    Boolean(key) && word(p['epic.jwt.kid']) === key.kid &&
    word(p['db.host']).toLowerCase() === db.host && word(p['db.database']) === 'BrightmartCare' && word(p['db.user']) === 'care_sync' &&
    sec['db.password'] === db.password && !('db.password' in p) &&
    sec['epic.keystore.password'] === KEYSTORE_PASSWORD && !('epic.keystore.password' in p) &&
    word(props(a)['epic.scopes']).split(/\s+/).filter(Boolean).every((x) => LEAST.includes(x))
  )
}
const activeIn = (s, env) => Boolean(api(s, env)) && apiStatus(s, api(s, env)) === 'Active'
const calledOk = (s, method, path) => (s.lastCalls ?? []).some((c) => c.app === app(s)?.name && c.env === 'Sandbox' && c.status === 200 && c.method === method && path.test(c.path))

const lab = {
  id: 'p-e2e-epic',
  group: 'End to end by system',
  title: 'End to end: care roster, Epic FHIR to the care database',
  minutes: 60,
  scenario: `Brightmart Care nurses watch heart failure patients of Bayview Health from their care database. A nurse enrolls a patient with one row in dbo.care_enrollments. The System API ${PROJECT}, deployed as ${APP}, then gets a SMART backend token from Epic, finds the patient over FHIR R4, reads every page of the vital signs, maps them in DataWeave and upserts one row of dbo.care_patients. You take it from the request mail to Production: the RAML, Studio, the Epic backend app with its key, API Manager, the deploy, one patient traced end to end, an unknown MRN fixed and replayed, an alert and the Production deploy.`,
  start() {
    const clock = at(1, 8)
    const s = newPlatform({
      clock,
      epic: newEpic(clock),
      databases: {
        created: clock,
        servers: {
          'care-sql': careServer('care-sql', SBX.host, SBX.password, [['203711', 'Heart failure'], [TYPO, 'Heart failure']]),
          'care-sql-prd': careServer('care-sql-prd', PRD.host, PRD.password, [['203716', 'Heart failure'], ['203712', 'Heart failure']]),
        },
      },
      studioPkgs: { [ASSET]: ROSTER },
      mail: [MAIL],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the data Bayview allows, the target table, the trigger, the volumes, what happens to an unknown MRN and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: `Design Center, Create new, New API Specification. Project Name ${PROJECT}, so the asset ID becomes ${ASSET}.`, done: (s) => Boolean(project(s)) },
    { title: 'Write the RAML', how: 'Add GET /patients/{mrn} with a 200 and a 404 example, and POST /sync with a 200 example. You can paste this one.', code: RAML, done: (s) => Boolean(project(s)) && resources(project(s).raml) },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on Mocking service, open GET of /patients/{mrn}, Try it, Send. The nurses can build against the example before any flow exists.', done: (s) => Boolean(s.seen.mock) && Boolean(project(s)) },
    { title: 'Publish to Exchange', how: 'Publish, Asset version 1.0.0, API version v1, LifeCycle State Stable, Publish to Exchange.', done: (s) => Boolean(asset(s)) },
    {
      title: 'Import the spec into Studio',
      how: `Anypoint Studio from the menu, Import a published API, ${PROJECT}. APIkit makes the flows from the RAML and the team adds ${FLOW}. The important part of it is below: the configs read every host and password from properties, the request searches Patient by MRN, and the DataWeave maps FHIR to the columns of dbo.care_patients.`,
      code: FLOW_CODE,
      done: (s) => Boolean(studio(s)),
    },
    ask(
      'Insert or upsert',
      'The sync runs every 15 minutes and reads every enrolled patient each time. How should it write dbo.care_patients?',
      [
        'INSERT each time, so the history is kept',
        'Upsert on the natural key mrn: UPDATE where mrn matches and INSERT when no row was updated. A second run, a replay or a retry then changes the row and never makes a duplicate',
        'DELETE the table and INSERT everything again each run',
        'INSERT and ignore the primary key error',
      ],
      1,
      'A sync that runs again must be idempotent. The MRN is the key both systems share, so the upsert keeps one row per patient however often it runs. Delete and reload leaves the nurses an empty table during the run and loses the rows when the run fails half way. Swallowing a key error hides the changed values.',
    ),
    {
      title: 'Register the Epic backend app with the least scopes',
      how: `Epic (FHIR), Backend apps, Create. Application name ${EPIC_APP}, Application audience Backend Systems, Create app. Open it and under Incoming APIs tick only system/Patient.read and system/Observation.read, then Save APIs.`,
      done: (s) => Boolean(reg(s)) && leastOk(s),
    },
    {
      title: 'Make the key pair and give Epic the public key',
      how: `Epic (FHIR), Brightmart keys, Generate key pair with Alias ${ALIAS} and Key ID (kid) ${ALIAS}. Then Backend apps, ${EPIC_APP}, Public keys: pick ${ALIAS} and Add public key. The private key stays in the key store of the app.`,
      done: (s) => Boolean(ownKey(s)),
    },
    {
      title: 'Create the API instance',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), ${PROJECT} from Exchange, instance label care-roster-sbx, Save & Deploy. Then open Environment information and note the client ID and client secret of Sandbox.`,
      done: (s) => Boolean(api(s)) && Boolean(s.seen['env:Sandbox']),
    },
    {
      title: 'Apply Client ID Enforcement',
      how: 'API instance, Policies, Add policy, Client ID Enforcement. Only a client application with a contract may start a sync or read a patient.',
      done: (s) => Boolean(api(s)?.policies.some((p) => p.type === 'client-id')),
    },
    {
      title: 'Add API Autodiscovery and export',
      how: `Anypoint Studio, ${ASSET}, Create API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. OK, then Export.`,
      done: (s) => Boolean(studio(s)?.autodiscovery?.apiId) && /-main$/.test(studio(s)?.autodiscovery?.flowRef ?? '') && Boolean(studio(s)?.jar),
    },
    {
      title: 'Deploy to Sandbox',
      how: `Runtime Manager, Deploy application, name ${APP}, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: api.id the instance ID, anypoint.platform.client_id, epic.tokenUrl ${TOKEN_URL}, epic.fhirBase ${BASE}, epic.clientId the non-production client ID of ${EPIC_APP}, epic.jwt.keyAlias and epic.jwt.kid ${ALIAS}, epic.scopes system/Patient.read system/Observation.read, db.host ${SBX.host}, db.port 1433, db.database BrightmartCare, db.user care_sync. Protect anypoint.platform.client_secret, epic.keystore.password and db.password. Deploy, wait for Running, and see the API become Active in API Manager.`,
      done: (s) => configOk(s, 'Sandbox') && activeIn(s, 'Sandbox'),
    },
    ask(
      'Paging the vital signs',
      'Mira Tallon has 48 vital signs and Bayview gives at most 10 per page. How does the flow read them all?',
      [
        'Ask for _count=1000 so one page holds everything',
        'Read the first page, then call the url of link next while the Bundle has one, and compare the entries with total. Keep the page size modest and wait the Retry-After of a 429',
        'Count the pages from total and call _getpagesoffset=10, 20, 30 itself',
        'Read the first page only, the latest vital signs are enough',
      ],
      1,
      'The server decides the page size, so a large _count is cut down. The link next URL carries the cursor of the search, and building offsets yourself breaks when the server changes how it pages. Following link next with the same token, and comparing with total, proves nothing was missed. A burst of pages can hit the rate limit, so the flow waits Retry-After and tries again.',
    ),
    {
      title: 'Give the ops console a contract',
      how: `Exchange, ${PROJECT}, Request access. API Instance Sandbox, care-roster-sbx, Application Create a new application named ${CONSOLE}, Request access. Copy its client ID and secret.`,
      done: (s) => Boolean(api(s)?.contracts.some((c) => c.client === CONSOLE && c.status === 'approved')),
    },
    {
      title: 'Enroll a patient and sync',
      how: `Databases, Server care-sql, New Query: INSERT INTO dbo.care_enrollments (mrn, program, status) VALUES ('${NEW_MRN}', 'Heart failure', 'ENROLLED') and Execute. Then API client, application ${APP}, client application ${CONSOLE}, POST /sync. It answers 200 with the upserted MRNs.`,
      done: (s) => Boolean(enrollment(s, 'care-sql', NEW_MRN)) && calledOk(s, 'POST', /^\/sync/) && Boolean(careRow(s, 'care-sql', NEW_MRN)),
    },
    {
      title: 'Follow the patient end to end',
      how: `Runtime Manager, ${APP}, Logs. Find Patient ${NEW_MRN} and the event ID in front of it: it is the X-Correlation-ID of your call, and every line of that sync carries it. Epic (FHIR), Audit log shows the Patient search and the Observation pages. Then Databases, care-sql: SELECT * FROM dbo.care_patients. Elias Quint is there with sex M, birth_date 1949-06-30 and 36 vital signs, the same total the FHIR browser gives.`,
      done: (s) => Boolean(s.seen[`logs:${app(s)?.name}`]) && Boolean(s.seen['db-select:care-sql:dbo.care_patients']) && careRow(s, 'care-sql', NEW_MRN)?.vital_signs === 36 && careRow(s, 'care-sql', NEW_MRN)?.sex === 'M',
    },
    {
      title: 'Fix the unknown MRN and replay it',
      how: `The same sync logged a WARN for MRN ${TYPO} and marked it NOT_FOUND in dbo.care_enrollments: the nurse typed ${TYPO} for Rosa Abernath, whose MRN is ${FIXED}. The other patients went through. Fix the row: UPDATE dbo.care_enrollments SET mrn = '${FIXED}', status = 'ENROLLED', note = NULL WHERE mrn = '${TYPO}'. Then POST /sync again, or Runtime Manager, Schedules, ${FLOW}, Run. Rosa Abernath arrives in dbo.care_patients and the enrollment shows SYNCED.`,
      done: (s) => !enrollment(s, 'care-sql', TYPO) && enrollment(s, 'care-sql', FIXED)?.status === 'SYNCED' && careRow(s, 'care-sql', FIXED)?.family_name === 'Abernath',
    },
    {
      title: 'Alert the care integrations team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0, recipient ${ALERT_TO} from the mail. A run with an unknown MRN counts as an error, so the team hears about it.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === app(s)?.name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    ask(
      'What changes in Production',
      'You deploy the same jar to Production. Which values change?',
      [
        'None, the jar holds everything',
        'Only api.id',
        `Every property: the Epic side (${PROD_TOKEN_URL.replace('/interconnect-fhir-oauth/oauth2/token', '')} with the production client ID of the same backend app), the database host and password, api.id of the Production instance and the client ID and secret of Production. The code, the scopes and the mapping stay the same`,
        'Only the database, because Epic has one endpoint',
      ],
      2,
      'One jar moves through the environments and the properties say where it runs. Epic gives a backend app a non-production and a production client ID, and Bayview has a production endpoint of its own. API Manager gives each instance its own ID, and each environment has its own credentials. Secrets stay protected in every environment.',
    ),
    {
      title: 'Promote and deploy to Production',
      how: `Switch to Production. API Manager, Add API, Promote API from environment, source Sandbox, include Policies. Runtime Manager in Production, Deploy application ${APP} from the same jar: api.id the Production instance, the Production client ID and secret, epic.tokenUrl ${PROD_TOKEN_URL}, epic.fhirBase ${PROD_BASE}, epic.clientId Client ID (production) of ${EPIC_APP}, db.host ${PRD.host} and the Production db.password, protected. The API must show Active.`,
      done: (s) => configOk(s, 'Production') && activeIn(s, 'Production') && Boolean(api(s, 'Production')?.policies.some((p) => p.type === 'client-id')),
    },
    {
      title: 'See a patient arrive in Production',
      how: `Runtime Manager in Production, ${APP}, Schedules, ${FLOW}, Run. Epic (FHIR), Token requests shows a Production token for ${EPIC_APP}. Databases, care-sql-prd: SELECT * FROM dbo.care_patients shows Theo Lindqvar (203716) and Jonah Ferreby (203712).`,
      done: (s) => configOk(s, 'Production') && ['203716', '203712'].every((m) => careRow(s, 'care-sql-prd', m)) && (y(s).tokenLog ?? []).some((t) => t.env === 'Production' && t.st === 200),
    },
  ],
  why: `I built a care roster sync from Epic to a SQL Server care database. It started with the request: which data the hospital allows, the target table, the trigger and who gets alerts. I designed a small System API in RAML, POST /sync and GET /patients/{mrn}, mocked it and published it to Exchange, then built the flows in Studio on that spec with every host and secret as a property. On the Epic side I registered a SMART backend app with only Patient.read and Observation.read and gave Epic the public key of a new key pair; the private key stayed in the key store of the app. In API Manager I created the instance with Client ID Enforcement and linked the app with API Autodiscovery. The flow gets a token with a signed JWT, finds each MRN, follows link next through every page of vital signs, maps them in DataWeave and upserts on the MRN, so a rerun never makes duplicates. I traced one patient by its correlation ID from the log to the row in the database. An unknown MRN does not stop the run: it is marked NOT_FOUND, the error count fires the alert, and after the fix the replay brings the patient in. Production is the same jar with the production client ID, the Production endpoint of Bayview, its own database and its own API instance. In the lab the Production side of Bayview shares the data and keys of the non-production side, and the database console stands for SSMS.`,
  docs: 'https://docs.mulesoft.com/db-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, PROJECT)
    const pid = s.projects.at(-1).id
    s = mark(saveProject(s, pid, RAML), 'mock')
    s = publish(s, pid, { assetId: ASSET, name: PROJECT, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    const made = createBackendApp(s, { name: EPIC_APP })
    s = made.state
    const r = s.epic.apps.at(-1)
    s = setAppScopes(s, made.result.clientId, LEAST).state
    s = generateKeyPair(s, { alias: ALIAS, kid: ALIAS }).state
    s = addPublicKey(s, made.result.clientId, ALIAS).state
    s = addApi(s, { assetId: ASSET, label: 'care-roster-sbx', upstream: '', consumer: '' })
    const sbxApi = s.lastApi
    s = mark(s, 'env:Sandbox')
    s = applyPolicy(s, sbxApi, 'client-id')
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    const jar = jarsOf(s).find((j) => j.project === ASSET)
    const form = (env, apiId, epic, db) => {
      const c = creds(s, env)
      return {
        name: APP, ...jar, replicas: 1, vCores: 0.1,
        props: { 'api.id': apiId, ...c.props, ...epic, 'epic.jwt.keyAlias': ALIAS, 'epic.jwt.kid': ALIAS, 'epic.jwt.alg': 'RS384', 'epic.jwt.expSeconds': '300', 'epic.scopes': LEAST.join(' '), 'db.host': db.host, 'db.port': '1433', 'db.database': 'BrightmartCare', 'db.user': 'care_sync', 'sync.pageSize': '10' },
        secrets: { ...c.secrets, 'epic.keystore.password': KEYSTORE_PASSWORD, 'db.password': db.password },
      }
    }
    s = finishDeploys(deployApp(s, form('Sandbox', sbxApi, { 'epic.tokenUrl': TOKEN_URL, 'epic.fhirBase': BASE, 'epic.clientId': r.clientId }, SBX)).state)
    s = createClient(s, CONSOLE)
    s = requestAccess(s, sbxApi, CONSOLE)
    const client = s.clients.find((c) => c.name === CONSOLE)
    s = runSql(s, 'care-sql', `INSERT INTO dbo.care_enrollments (mrn, program, status) VALUES ('${NEW_MRN}', 'Heart failure', 'ENROLLED')`).state
    const sync = (x) => callApi(x, { env: 'Sandbox', app: APP, method: 'POST', path: '/sync', body: '', client: client.name, clientId: client.clientId, clientSecret: client.clientSecret }).state
    s = sync(s)
    s = mark(s, `logs:${APP}`)
    s = runSql(s, 'care-sql', 'SELECT * FROM dbo.care_patients').state
    s = runSql(s, 'care-sql', `UPDATE dbo.care_enrollments SET mrn = '${FIXED}', status = 'ENROLLED', note = NULL WHERE mrn = '${TYPO}'`).state
    s = sync(s)
    s = addMonAlert(s, { title: 'Care roster sync errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, sbxApi, { policies: true, tiers: true, alerts: false })
    s = finishDeploys(deployApp(s, form('Production', s.lastApi, { 'epic.tokenUrl': PROD_TOKEN_URL, 'epic.fhirBase': PROD_BASE, 'epic.clientId': r.prodId }, PRD)).state)
    s = runNow(s, APP, FLOW)
    return runSql(s, 'care-sql-prd', 'SELECT * FROM dbo.care_patients').state
  },
  answers: { 6: 1, 13: 1, 19: 2 },
}

export const LABS = [lab]
