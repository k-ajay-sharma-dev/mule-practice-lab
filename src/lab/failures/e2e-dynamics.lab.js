// The end to end lab of Dynamics 365: customers of the web shop into Dataverse contacts by upsert on an alternate key,
// from the request mail to Production. See platform-labs.js for the shape of a lab.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio } from '../platform.js'
import { ask, call, called, creds, OPS } from '../platform-kit.js'
import { addKey, addSecret, createAppUser, DAY, guidOf, keyOn, newMsgraph, newRegistration, ORG_URL, privsOf, regNamed, registerApp, rowsOf, saveRole, SYSTEM_ROLES, TENANT_ID } from '../platform-msgraph.js'
import { ASSET, MAIN, NAME } from './e2e-dynamics.pkg.js'

const TEAM = 'crm-integrations@brightmart.example'
const APP = 'contact-dataverse-sync'
const REG = 'brightmart-contact-sync'
const ROLE = 'Brightmart Contact Sync'
const PRD = { reg: 'brightmart-contact-sync-prd', appId: guidOf('lab:contact-sync-prd'), secret: 'prdLabQ~contactSyncPracticeValue26', role: 'Brightmart Contact Sync Prd' } // made-up lab values
const STORE = { name: 'Brightmart Store App', clientId: 'sto-8e14c2', clientSecret: 'sto-secret-27d9' }
const GOOD = { no: 'C-30001', body: { firstName: 'Ines', lastName: 'Varga', email: 'ines.varga@mail.example', phone: '+44 113 496 0101' } }
const BAD = { no: 'C-30002', body: { firstName: 'Tomas', lastName: 'Reyes', email: 'tomas.reyes@mail.example', phone: '+44 113 496 0202 extension 31, ask for the store manager on duty' } }
const FIXED = { ...BAD.body, phone: '+44 113 496 0202' }
const LIVE = { no: 'C-30010', body: { firstName: 'Odile', lastName: 'Marchetti', email: 'odile.marchetti@mail.example', phone: '+44 113 496 0310' } }
const body = (x) => JSON.stringify(x)

const RAML = `#%RAML 1.0
title: Customer Sync API
version: v1
mediaType: application/json
types:
  Customer:
    properties:
      firstName?: string
      lastName: string
      email?: string
      phone?: string
/customers/{customerNo}:
  put:
    description: Create or update the customer as a Dataverse contact. Sending it again changes nothing.
    body:
      type: Customer
    responses:
      200:
        body:
          example: |
            { "customerNo": "C-30001", "status": "UPSERTED" }
      400:
        body:
          example: |
            { "message": "Dataverse refused the record", "kept": "GET /rejects" }
/rejects:
  get:
    description: The records Dataverse refused and that wait for a fix
    responses:
      200:
        body:
          example: |
            [ { "customerNo": "C-30002", "code": "0x80044331" } ]
`
const STUDIO = `<!-- OAuth 2.0 client credentials against Entra ID; the token is cached and renewed by the connector -->
<http:request-config name="Dataverse_Config">
  <http:request-connection protocol="HTTPS" host="brightmart.crm.dynamics.com" port="443">
    <http:authentication>
      <oauth:client-credentials-grant-type clientId="\${azure.clientId}" clientSecret="\${azure.clientSecret}"
          tokenUrl="https://login.microsoftonline.com/\${azure.tenantId}/oauth2/v2.0/token"
          scopes="\${dataverse.url}/.default" />
    </http:authentication>
  </http:request-connection>
  <http:default-headers>
    <http:default-header key="OData-Version" value="4.0" />
  </http:default-headers>
</http:request-config>
<api-gateway:autodiscovery apiId="\${api.id}" flowRef="${MAIN}" />

<flow name="put:\\customers\\(customerNo):application\\json:customer-sync-api-config">
  <ee:transform doc:name="Customer to contact">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  firstname: payload.firstName,
  lastname: payload.lastName,
  emailaddress1: payload.email,
  telephone1: payload.phone
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <!-- PATCH on the alternate key is an upsert: it updates the contact or creates it -->
  <http:request doc:name="Upsert contact" method="PATCH" config-ref="Dataverse_Config"
      path="/api/data/v9.2/contacts(brightmart_customerno='#[attributes.uriParams.customerNo]')" />
  <error-handler>
    <!-- 400 and 412 from Dataverse: answer 400 and keep the record in the reject store -->
    <on-error-continue type="HTTP:BAD_REQUEST, HTTP:PRECONDITION_FAILED"> ... </on-error-continue>
  </error-handler>
</flow>`

const m = (s) => s.msgraph
const reg = (s) => regNamed(m(s), REG)
const word = (v) => String(v ?? '').trim()
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === NAME)
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === NAME && a.env === env && a.status === 'Running')
const contract = (s, env = 'Sandbox') => apiOf(s, env)?.contracts.some((c) => c.client === STORE.name && c.status === 'approved')
const contacts = (s, no) => rowsOf(m(s), 'contact').filter((r) => word(r.brightmart_customerno).toLowerCase() === no.toLowerCase())
const validSecret = (s) => (reg(s)?.secrets ?? []).filter((x) => x.end > s.clock + 30 * DAY)
const keyOk = (s) => keyOn(m(s), 'contact', ['brightmart_customerno'])?.status === 'Active'
const userOk = (s) => {
  const r = reg(s)
  const u = r && m(s).dv.users.find((x) => x.appId === r.appId)
  if (!u || !u.roles.length || u.roles.some((x) => SYSTEM_ROLES[x])) return false
  const p = privsOf(m(s), u)
  return ['Create', 'Read', 'Write'].every((x) => (p.contact ?? []).includes(x)) && Object.keys(p).every((t) => t === 'contact') && !(p.contact ?? []).includes('Delete')
}
const deployOk = (s) => {
  const a = appOf(s)
  const api = apiOf(s)
  if (!a || !api || !reg(s)) return false
  const p = a.props
  return (
    word(p['azure.tenantId']).toLowerCase() === TENANT_ID && word(p['azure.clientId']) === reg(s).appId && word(p['dataverse.url']).replace(/\/+$/, '') === ORG_URL &&
    validSecret(s).some((x) => x.value === a.secrets?.['azure.clientSecret']) && !('azure.clientSecret' in p) && !('anypoint.platform.client_secret' in p) &&
    apiStatus(s, api) === 'Active'
  )
}
const rejectOf = (s, no) => (appOf(s)?.store?.rejected ?? []).find((x) => x.customerNo === no && x.code === '0x80044331')

function graph(now) {
  const g = newMsgraph(now)
  // Production: the security team registered the Production app and its application user before go live
  newRegistration(g, { name: PRD.reg, appId: PRD.appId, t: now - 2 * DAY, secrets: [{ desc: 'mule-production', value: PRD.secret, start: now - 2 * DAY, end: now + 178 * DAY }] })
  g.dv.roles[PRD.role] = { system: false, privs: { contact: ['Create', 'Read', 'Write'] } }
  g.dv.users.push({ id: guidOf(`user:${PRD.appId}`), appId: PRD.appId, name: PRD.reg, roles: [PRD.role], t: now - 2 * DAY })
  return g
}

const lab = {
  id: 'p-e2e-dynamics',
  group: 'End to end by system',
  title: 'End to end: customers, web shop to Dynamics 365 contacts',
  minutes: 55,
  scenario: `Brightmart wants every customer of the web shop and the store app as a Contact in Dynamics 365, so the service team sees one record per customer. You build ${APP}, a Mule app on CloudHub 2.0 with the Customer Sync API: PUT /customers/{customerNo} maps the customer in DataWeave and sends PATCH /contacts(brightmart_customerno='...') to the Dataverse Web API, an upsert on an alternate key, with an OAuth token from Entra ID. A record Dataverse refuses is kept and listed by GET /rejects. A customer travels: store app, API Manager, flow, token, PATCH, contact row, and back as 200. Take it from the request mail through design, build, Entra ID and Dataverse setup, deployment, a traced customer, a failure, an alert and Production.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      studioPkgs: { [ASSET]: NAME },
      clients: [STORE],
      msgraph: graph(at(1, 8)),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Customers into Dynamics 365: request',
          body: `Hello, the service team wants each customer of the web shop and the store app as a Contact in Dynamics 365. Our customer number (C-...) identifies a customer and goes to brightmart_customerno; it must stay one contact per number, however often a customer is sent.\nFields: firstName to firstname, lastName to lastname, email to emailaddress1, phone to telephone1.\nThe store app sends each change at once, about 4000 a day.\nA customer Dataverse refuses must not be lost: keep it with the reason so we can fix it and send it again.\nAlerts to ${TEAM}.\n\nThanks, CRM team`,
          source: 'Brightmart CRM team',
        },
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Contact sync: Entra ID and Dataverse',
          body: `For Sandbox please register ${REG} in Entra ID yourself, with a client secret for 180 days, and give it an application user in Dataverse with its own role ${ROLE}: Create, Read and Write on Contact only. Contact has no alternate key yet; add one on Customer No.\nFor Production we registered ${PRD.reg} (Application ID ${PRD.appId}) with its application user and role. Its practice secret is ${PRD.secret}. Tenant ${TENANT_ID}, Dataverse ${ORG_URL}.\nBrightmart security team`,
          source: 'Brightmart security team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Read both mails: the key, the fields, the volume, the error rule, the alert address and what the security team prepared.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Design the Customer Sync API',
      how: 'Design Center, Create new, New API Specification, name Customer Sync API. Write the RAML below: PUT /customers/{customerNo} and GET /rejects.',
      code: RAML,
      done: (s) => s.projects.some((p) => ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'PUT', '/customers/C-30001').status === 200 && mockCall(p.raml, 'GET', '/rejects').status === 200),
    },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the Mocking service, choose GET /rejects, Try it, Send.', done: (s) => Boolean(s.seen.mock) && s.projects.some((p) => /customer/i.test(p.name)) },
    { title: 'Publish it to Exchange', how: `Publish, Publish to Exchange. Asset ID ${ASSET}, version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => Boolean(asset(s)) },
    {
      title: 'Build the flow in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project holds the flows your team wrote on this spec. The important part is below: the HTTP request config with the client credentials grant and \${property} placeholders, the DataWeave to contact columns, and the PATCH on the alternate key with its error handler.`,
      code: STUDIO,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Why PATCH on an alternate key',
      `Why does the flow send PATCH /contacts(brightmart_customerno='C-30001') and not POST /contacts?`,
      [
        'POST is not allowed in Dataverse',
        'PATCH on an alternate key is an upsert: it updates the contact with that customer number or creates it. A customer sent twice stays one contact, and the app needs no lookup of the contactid first',
        'PATCH is faster than POST',
        'POST needs the Delete privilege',
      ],
      1,
      'POST always creates, so a resend makes a duplicate. PATCH addressed by the alternate key is an upsert, and the key also makes Dataverse refuse a second row with the same number. If-Match: * would allow only an update, If-None-Match: * only a create.',
    ),
    { title: 'Add Autodiscovery and export the jar', how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${MAIN}. Then choose Export.`, done: (s) => Boolean(project(s)?.jar && project(s).autodiscovery?.apiId === '${api.id}' && project(s).autodiscovery.flowRef === MAIN) },
    {
      title: 'Register the app in Entra ID',
      how: `Dynamics and SharePoint from the console menu, App registrations, New registration: display name ${REG}, Register. Open it, Certificates & secrets, New client secret, expiry 180 days, Add. Copy the Value now: it shows only once.`,
      done: (s) => validSecret(s).length > 0,
    },
    {
      title: 'Add the alternate key on Contact',
      how: 'Dataverse tab, Tables, Contact, Keys. New key: display name Customer No Key, Column Customer No, Save. Dataverse builds the index in the background: move the clock a minute until it is Active.',
      done: keyOk,
    },
    {
      title: 'Create the application user with its own role',
      how: `Dataverse tab, Security roles, New role ${ROLE}: tick Create, Read and Write on Contact only, Save. Then Application users, New app user: pick ${REG}, tick the role ${ROLE}, Create. No Delete, no other table, not System Administrator.`,
      done: userOk,
    },
    ask(
      'No API permission for Dataverse',
      `${REG} has no API permission for Dynamics CRM, yet its token works for the Web API. Why?`,
      [
        'Dataverse does not check tokens',
        'For the client credentials grant Dataverse trusts the application user of the registration: the token proves who the app is, and the security roles of the application user decide what it may do. The user_impersonation permission is for delegated calls with a signed in user',
        'The secret grants every API',
        'Entra ID adds the permission on the first call',
      ],
      1,
      'A token for the scope https://brightmart.crm.dynamics.com/.default only says which app is calling. Without an application user Dataverse answers 403, The user is not a member of the organization. With one, every call is checked against its roles, so least privilege lives in the security role, not in Entra ID.',
    ),
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select ${ASSET}, Save & Deploy, and note the API Instance ID. Then Policies, Add policy, Client ID Enforcement, Apply. Open Environment information for the client ID and secret of Sandbox.`,
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    { title: 'Give the store app a contract', how: `Exchange, Customer Sync API, Request access. Pick the API instance of Sandbox and the application ${STORE.name}, then Request access.`, done: (s) => Boolean(contract(s)) },
    {
      title: 'Deploy the app to Sandbox',
      how: `Runtime Manager, Deploy application. Name ${APP}, choose the exported file ${ASSET}-1.0.0-mule-application.jar. Properties: azure.tenantId ${TENANT_ID}, azure.clientId the Application (client) ID of ${REG}, dataverse.url ${ORG_URL}, api.id the API Instance ID, anypoint.platform.client_id of Sandbox. Protect azure.clientSecret (the secret Value) and anypoint.platform.client_secret. Deploy Application. The app is Running and the API instance Active.`,
      done: deployOk,
    },
    {
      title: 'Send a customer and follow it into Dataverse',
      how: `Lab tools, API client. Application ${APP}, PUT /customers/${GOOD.no} as ${STORE.name} with ${body(GOOD.body)}. You get 200. Send it a second time. Runtime Manager, ${APP}, Logs: each request has its correlation ID (event:...). Then Dataverse tab, Tables, Contact: ${GOOD.no} is there once, with the mapped name, email and phone. Two requests, one contact: the counts match.`,
      done: (s) => contacts(s, GOOD.no).length === 1 && contacts(s, GOOD.no)[0].telephone1 === GOOD.body.phone && (s.lastCalls ?? []).filter((c) => c.app === APP && c.method === 'PUT' && c.status === 200 && c.path === `/customers/${GOOD.no}`).length >= 2 && Boolean(s.seen[`logs:${APP}`]) && Boolean(s.seen['msgraph:table:contact']),
    },
    {
      title: 'Send a customer Dataverse refuses',
      how: `PUT /customers/${BAD.no} with ${body(BAD.body)}. The phone is longer than the 50 characters of telephone1, so Dataverse answers 400 with 0x80044331. The app answers 400 and keeps the record: GET /rejects lists ${BAD.no} with the code. Nothing is lost.`,
      done: (s) => Boolean(rejectOf(s, BAD.no)) && called(s, APP, 200, 'GET', /^\/rejects/),
    },
    {
      title: 'Fix it and send it again',
      how: `The store team shortens the phone to ${FIXED.phone}. PUT /customers/${BAD.no} with ${body(FIXED)}. The contact is created, and GET /rejects is empty again.`,
      done: (s) => contacts(s, BAD.no).length === 1 && contacts(s, BAD.no)[0].telephone1 === FIXED.phone && Boolean(rejectOf(s, BAD.no)?.closed),
    },
    { title: 'Alert the CRM team', how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, severity High, recipient ${TEAM}. A refused record is an error of the flow, so it counts.`, done: (s) => s.monAlerts.some((a) => a.enabled && a.resource === 'Application' && a.name_ === APP && a.metric === 'Message Error Count' && String(a.recipients ?? '').toLowerCase().includes(TEAM)) },
    ask(
      'Throttling',
      'On sale days the store app sends 300 customers a minute and Dataverse starts to answer 429 with Retry-After. What should the app do?',
      ['Retry at once until it works', 'Wait for the seconds in Retry-After before the next call (Until Successful or a reconnection strategy that reads it), and send fewer calls in parallel. Retrying at once makes the wait longer', 'Get a new token', 'Answer 200 and drop the customer'],
      1,
      'The service protection limits of Dataverse count requests, execution time and concurrent calls per user over a sliding window. A 429 carries Retry-After; calls that ignore it extend the throttling. Honour it, limit concurrency, and use $batch for bulk loads.',
    ),
    { title: 'Promote the API instance to Production', how: `API Manager, switch to Production. Add API, Promote API from environment, source Sandbox, include the policies. Note the new API Instance ID. Then Exchange, Request access for the Production instance for ${STORE.name}.`, done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')) && Boolean(contract(s, 'Production')) },
    {
      title: 'Deploy to Production and send the first customer',
      how: `Runtime Manager in Production, Deploy application, the same exported file. azure.clientId ${PRD.appId} and the protected azure.clientSecret from the security mail, azure.tenantId and dataverse.url as before, api.id the Production API Instance ID, and the Production client ID and secret from Environment information. Then API client in Production: PUT /customers/${LIVE.no} as ${STORE.name} with ${body(LIVE.body)}. The contact appears in Dataverse. The lab has one Dataverse environment; in a tenant, Production has its own URL.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const api = apiOf(s, 'Production')
        if (!a || !api) return false
        return apiStatus(s, api) === 'Active' && word(a.props['azure.clientId']) === PRD.appId && a.secrets?.['azure.clientSecret'] === PRD.secret && !('azure.clientSecret' in a.props) && contacts(s, LIVE.no).length === 1 && (s.lastCalls ?? []).some((c) => c.env === 'Production' && c.app === APP && c.method === 'PUT' && c.status === 200)
      },
    },
  ],
  why: `The CRM team wanted every customer as one Dynamics 365 contact, keyed on our customer number, with refused records kept and an alert. I designed a Customer Sync API in RAML with PUT /customers/{customerNo} and GET /rejects, tried it in the mocking service and published it to Exchange. In Studio the flow maps the customer to contact columns in DataWeave and sends PATCH /contacts(brightmart_customerno='...'), an upsert on an alternate key, through an HTTP request config with the OAuth client credentials grant, so the token is cached and renewed. In Entra ID I registered the app with a 180 day secret; in Dataverse I added the alternate key on Customer No and an application user with a custom role that has only Create, Read and Write on Contact. Dataverse needs no API permission for that: the application user and its role decide. API Manager has Client ID Enforcement and the store app a contract, and the jar deployed with the secret protected. A customer sent twice was one contact, and I followed each call by its correlation ID. A phone longer than the column came back 400 with 0x80044331, was kept in the reject store, and after the fix the same PUT created it. Monitoring alerts the CRM team, and for Production I promoted the instance and deployed with the Production registration and secret.`,
  docs: 'https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/update-delete-entities-using-web-api',
  solve(start) {
    let s = mark(start, 'inbox')
    s = saveProject(createProject(s, 'Customer Sync API'), 'p1', RAML)
    s = mark(s, 'mock')
    s = publish(s, 'p1', { assetId: ASSET, name: 'Customer Sync API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: MAIN } }), ASSET)
    s = registerApp(s, REG).state
    const id = reg(s).appId
    const secret = addSecret(s, id, { desc: 'mule-sandbox', days: 180 })
    s = secret.state
    s = addKey(s, 'contact', { name: 'brightmart_customernokey', cols: ['brightmart_customerno'] }).state
    s = advance(s, 2 * MINUTE)
    s = saveRole(s, ROLE, { contact: ['Create', 'Read', 'Write'] }).state
    s = createAppUser(s, id, [ROLE]).state
    s = addApi(s, { assetId: ASSET, label: 'customer-sync-sbx', upstream: '', consumer: '' })
    s = applyPolicy(s, apiOf(s).id, 'client-id')
    s = mark(s, 'env:Sandbox')
    s = requestAccess(s, apiOf(s).id, STORE.name)
    const c = creds(s, 'Sandbox')
    const jar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': id, 'dataverse.url': ORG_URL, 'api.id': apiOf(s).id, ...c.props }, secrets: { 'azure.clientSecret': secret.result.value, ...c.secrets } }).state)
    s = call(s, APP, STORE, `/customers/${GOOD.no}`, 'PUT', body(GOOD.body)).state
    s = call(s, APP, STORE, `/customers/${GOOD.no}`, 'PUT', body(GOOD.body)).state
    s = mark(mark(s, `logs:${APP}`), 'msgraph:table:contact')
    s = call(s, APP, STORE, `/customers/${BAD.no}`, 'PUT', body(BAD.body)).state
    s = call(s, APP, STORE, '/rejects').state
    s = call(s, APP, STORE, `/customers/${BAD.no}`, 'PUT', body(FIXED)).state
    s = addMonAlert(s, { title: 'Contact sync errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, apiOf(s, 'Sandbox').id, { policies: true, tiers: true, alerts: false })
    s = requestAccess(s, apiOf(s, 'Production').id, STORE.name)
    const pc = creds(s, 'Production')
    const pjar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...pjar, replicas: 1, vCores: 0.1, props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': PRD.appId, 'dataverse.url': ORG_URL, 'api.id': apiOf(s, 'Production').id, ...pc.props }, secrets: { 'azure.clientSecret': PRD.secret, ...pc.secrets } }).state)
    return call(s, APP, STORE, `/customers/${LIVE.no}`, 'PUT', body(LIVE.body)).state
  },
  answers: { 5: 1, 10: 1, 18: 1 },
}

export const LABS = [lab]
