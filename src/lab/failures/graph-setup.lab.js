// The guided lab graph-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, callApi, deployApp, finishDeploys, mark, newPlatform } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import {
  addPermission, addSecret, createAppUser, DAY, grantConsent, grantSite, isGranted, newMsgraph, ORG_URL, privsOf, regNamed, registerApp, rowsOf, saveRole, siteNamed, SP_HOST, SYSTEM_ROLES, TENANT, TENANT_ID,
} from '../platform-msgraph.js'
import { BRIDGE, BRIDGE_JAR } from './graph-setup.pkg.js'

const REG = 'brightmart-customer-bridge'
const ROLE = 'Brightmart Customer Bridge'
const ALERT_TO = 'crm-integration@brightmart.example'
const SITE = 'Sales'
const LIB = 'Contracts'
const TEST = 'C-2001'
const BAD = 'C-2002-BRIGHTMART-NORTH-WEST'
const m = (s) => s.msgraph
const reg = (s) => regNamed(m(s), REG)
const word = (v) => String(v ?? '').trim()
const validSecret = (s) => (reg(s)?.secrets ?? []).filter((x) => x.end > s.clock + 30 * DAY)
const registered = (s) => validSecret(s).length > 0
// least privilege: of the application permissions only Sites.Selected, consented, and write on the Sales site alone
const graphLeast = (s) => {
  const r = reg(s)
  if (!r) return false
  const app = r.perms.filter((p) => p.type === 'Application')
  const sel = app.find((p) => p.api === 'Microsoft Graph' && p.name === 'Sites.Selected')
  const sites = m(s).sites.filter((x) => x.grants[r.appId])
  return app.length === 1 && Boolean(sel) && isGranted(r, sel) && sites.length === 1 && sites[0].name === SITE && sites[0].grants[r.appId] === 'write'
}
const userOk = (s) => {
  const r = reg(s)
  const u = r && m(s).dv.users.find((x) => x.appId === r.appId)
  if (!u || !u.roles.length || u.roles.some((x) => SYSTEM_ROLES[x])) return false
  const p = privsOf(m(s), u)
  return ['Create', 'Read', 'Write'].every((x) => (p.account ?? []).includes(x)) && Object.keys(p).every((t) => t === 'account') && !(p.account ?? []).includes('Delete')
}
const a = (s) => app(s, BRIDGE)
const prop = (s, k) => word(a(s)?.props?.[k])
const deployedOk = (s) => {
  const x = a(s)
  if (x?.status !== 'Running' || !reg(s)) return false
  const tenant = prop(s, 'azure.tenantId').toLowerCase()
  return (
    (tenant === TENANT_ID || tenant === TENANT) &&
    prop(s, 'azure.clientId') === reg(s).appId &&
    prop(s, 'dataverse.url').replace(/\/+$/, '') === ORG_URL &&
    prop(s, 'sharepoint.hostname').toLowerCase() === SP_HOST &&
    prop(s, 'sharepoint.sitePath') === `/sites/${SITE}` &&
    prop(s, 'sharepoint.library') === LIB &&
    !x.props['azure.clientSecret'] &&
    validSecret(s).some((y) => y.value === x.secrets?.['azure.clientSecret'])
  )
}
const since = (s) => a(s)?.updated ?? 0
const calledOk = (s, status, method, re) => (s.lastCalls ?? []).some((c) => c.app === BRIDGE && c.status === status && c.method === method && re.test(c.path) && c.t >= since(s))
const upserted = (s) => {
  const log = m(s).log.filter((e) => e.who === BRIDGE && e.api === 'dataverse' && e.m === 'PATCH' && e.st === 204 && e.t >= since(s))
  const counts = {}
  for (const e of log) {
    const no = (e.p.match(/accountnumber='([^']+)'/) ?? [])[1]
    if (no) counts[no] = (counts[no] ?? 0) + 1
  }
  return Object.entries(counts).some(([no, n]) => n >= 2 && rowsOf(m(s), 'account').filter((r) => r.accountnumber === no).length === 1)
}
const filed = (s) => (siteNamed(m(s), SITE)?.drives.find((d) => d.name === LIB)?.items ?? []).some((i) => i.by === BRIDGE)
const rejected = (s) => deployedOk(s) && (a(s)?.store?.rejected ?? []).some((x) => x.code && x.t >= since(s)) && calledOk(s, 400, 'POST', /^\/customers$/)

function graph(now) {
  const g = newMsgraph(now)
  // the CRM team made the alternate key on the account number already
  g.dv.tables.account.keys.push({ name: 'brightmart_accountnumberkey', cols: ['accountnumber'], status: 'Active', t: now - 30 * DAY })
  return g
}
const MAIL = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'Customer bridge to Dynamics and SharePoint',
  body: [
    'Hello integration team,',
    `the new customer bridge ${BRIDGE} is built and its jar waits in Runtime Manager. It keeps the accounts of Dynamics 365 in step with the web shop and files each signed contract in SharePoint. Please set it up:`,
    `1. An app registration ${REG} in Entra ID, with a client secret for 6 months.`,
    `2. In SharePoint it may only write to the ${LIB} library of the ${SITE} site, nothing tenant wide.`,
    `3. In Dataverse an application user for it with its own security role ${ROLE}: create, read and write on Account. Nothing else, and not System Administrator.`,
    `4. Properties: dataverse.url ${ORG_URL}, sharepoint.hostname ${SP_HOST}, sharepoint.sitePath /sites/${SITE}, sharepoint.library ${LIB}. Our alternate key on accountnumber is active.`,
    `5. Failures and rejected records alert ${ALERT_TO}.`,
    'Brightmart CRM team',
  ].join('\n\n'),
  source: 'Brightmart CRM team',
}

const lab = {
  id: 'p-graph-setup',
  group: 'HR, ITSM and CRM',
  title: 'Set up the Dynamics 365 and SharePoint customer bridge',
  minutes: 40,
  scenario: `It is 09:00 at Brightmart. The CRM team wants the customers of the web shop in Dynamics 365 and their contracts in SharePoint. The app ${BRIDGE} is built and its jar is ready, but nothing exists for it yet: no app registration, no Dataverse user, no properties. Done means a test customer is written once however often it is sent, a contract lands in the library, a bad record is rejected and kept, and failures raise an alert. The Inbox has the request.`,
  start() {
    const s = newPlatform({ clock: at(1, 8, 30), jars: [{ pkg: BRIDGE, jar: BRIDGE_JAR }], msgraph: graph(at(1, 8)), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of the CRM team. Note the registration name, the site and library, the role and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Register the app and add a client secret',
      how: `Dynamics and SharePoint from the console menu, App registrations, New registration. Name ${REG}, Register. Open it, Certificates & secrets, New client secret, expiry 180 days, Add. Copy the Value now: it shows only once.`,
      done: registered,
    },
    ask(
      'The smallest Graph permission',
      `The app writes files to one library of one site. Which permission do you give it?`,
      [
        'Sites.ReadWrite.All as an application permission, so it works on any site',
        'Sites.FullControl.All, so it can also make the library if it is missing',
        `Sites.Selected as an application permission with admin consent, and then write access on the ${SITE} site only`,
        'Sites.ReadWrite.All as a delegated permission',
      ],
      2,
      'An application permission with .All reaches every site of the tenant, so a leaked secret exposes all of SharePoint. Sites.Selected alone grants nothing: an admin adds the app to each site it needs, with read, write or full control (POST /sites/{id}/permissions). A delegated permission needs a signed in user and does not fit a background app.',
    ),
    {
      title: 'Give it Sites.Selected and the Sales site',
      how: `${REG}, API permissions, Add a permission: Microsoft Graph, Application permissions, Sites.Selected. Press Grant admin consent for Brightmart Retail. Then the SharePoint tab, site ${SITE}, Site permissions: app ${REG}, role write, Grant. User.Read (delegated) can stay; no other application permission.`,
      done: graphLeast,
    },
    {
      title: 'Create the application user with a custom role',
      how: `Dataverse tab, Security roles, New role ${ROLE}: tick Create, Read and Write on Account only, Save. Then Application users, New app user: pick ${REG}, tick the role ${ROLE}, Create. Dataverse needs no API permission for an app; it trusts the application user and its roles.`,
      done: userOk,
    },
    ask(
      'Tokens',
      'A token of the client credentials grant is valid for about an hour. How should the app use it?',
      [
        'Get a new token for each request, so it is always fresh',
        'Get one token at start up and use it until the app restarts',
        'Cache one token for each resource (Dataverse and Graph have their own audience) and get a new one shortly before it expires or after a 401',
        'Share one token for Dataverse and Graph, it is the same tenant',
      ],
      2,
      'The audience of a token is the resource of the scope: https://brightmart.crm.dynamics.com/.default for Dataverse, https://graph.microsoft.com/.default for Graph. A token for one is refused by the other. A token per request loads the token endpoint for nothing; a token kept forever fails after an hour. The OAuth client credentials of the HTTP connector cache it for you.',
    ),
    {
      title: 'Deploy with the secret protected',
      how: `Runtime Manager, Deploy application, name ${BRIDGE}, file ${BRIDGE_JAR}. Properties: azure.tenantId ${TENANT_ID} (or ${TENANT}), azure.clientId the Application (client) ID of ${REG}, dataverse.url, sharepoint.hostname, sharepoint.sitePath and sharepoint.library from the mail. Add azure.clientSecret with the secret Value and select Protect. Deploy and wait for Running.`,
      done: deployedOk,
    },
    {
      title: 'Test the connection',
      how: `API client from the console menu, application ${BRIDGE}, GET /health. 200 with dataverse UP and sharepoint UP means both tokens, the application user and the site access work. A 503 names the failing side; the Request log of Dynamics and SharePoint shows the call.`,
      done: (s) => deployedOk(s) && calledOk(s, 200, 'GET', /^\/health$/),
    },
    {
      title: 'Verify the upsert and file a contract',
      how: `API client, POST /customers with {"accountNumber":"${TEST}","name":"Brightmart Test Customer","city":"Leeds"}. Send it a second time. The Dataverse tab, table Account, has ${TEST} once. Then POST /customers/${TEST}/contract with {"file":"contract-2026.pdf","size":850000} and find it in the SharePoint tab, ${SITE}, ${LIB}.`,
      done: (s) => deployedOk(s) && upserted(s) && filed(s),
    },
    {
      title: 'Send a bad record',
      how: `API client, POST /customers with {"accountNumber":"${BAD}","name":"Northwest Depot"}. The account number is longer than the 20 characters of the column, so Dataverse refuses it with 0x80044331. The app answers 400 and keeps the record in its reject store; the logs of ${BRIDGE} say so.`,
      done: rejected,
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${BRIDGE}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO}. Rejected records count as errors too, so the CRM team hears of them.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === BRIDGE && x.resource === 'Application' && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(ALERT_TO)),
    },
  ],
  why: `The checklist for a Dynamics 365 and SharePoint integration: one app registration per app, with a client secret (or better a certificate) whose value lives in a protected property or a vault, and an owner who knows its expiry. For SharePoint the smallest application permission is Sites.Selected with admin consent plus a grant on the one site. For Dataverse no API permission is needed: create an application user for the registration and give it a custom security role with only the privileges it needs, never System Administrator. Cache one token per resource. Write with PATCH on an alternate key so a resend changes nothing, prove it with the same record twice, send a bad record and see it rejected and kept, and alert on errors. In the lab the site grant is a button on the SharePoint tab; in a tenant an admin calls POST /sites/{id}/permissions.`,
  docs: 'https://learn.microsoft.com/en-us/power-platform/admin/manage-application-users',
  solve(start) {
    let s = mark(start, 'inbox')
    const reged = (st) => regNamed(st.msgraph, REG)
    s = registerApp(s, REG).state
    const id = reged(s).appId
    const secret = addSecret(s, id, { desc: 'mule-sandbox', days: 180 })
    s = secret.state
    s = addPermission(s, id, { api: 'Microsoft Graph', name: 'Sites.Selected', type: 'Application' }).state
    s = grantConsent(s, id).state
    s = grantSite(s, siteNamed(s.msgraph, SITE).id, id, 'write').state
    s = saveRole(s, ROLE, { account: ['Create', 'Read', 'Write'] }).state
    s = createAppUser(s, id, [ROLE]).state
    const form = {
      name: BRIDGE,
      pkg: BRIDGE,
      jar: BRIDGE_JAR,
      replicas: 1,
      vCores: 0.1,
      props: { 'azure.tenantId': TENANT_ID, 'azure.clientId': id, 'dataverse.url': ORG_URL, 'sharepoint.hostname': SP_HOST, 'sharepoint.sitePath': `/sites/${SITE}`, 'sharepoint.library': LIB },
      secrets: { 'azure.clientSecret': secret.result.value },
    }
    s = finishDeploys(deployApp(s, form).state)
    const call = (st, method, path, body = '') => callApi(st, { env: 'Sandbox', app: BRIDGE, method, path, body }).state
    s = call(s, 'GET', '/health')
    s = call(s, 'POST', '/customers', `{"accountNumber":"${TEST}","name":"Brightmart Test Customer","city":"Leeds"}`)
    s = call(s, 'POST', '/customers', `{"accountNumber":"${TEST}","name":"Brightmart Test Customer","city":"Leeds"}`)
    s = call(s, 'POST', `/customers/${TEST}/contract`, '{"file":"contract-2026.pdf","size":850000}')
    s = call(s, 'POST', '/customers', `{"accountNumber":"${BAD}","name":"Northwest Depot"}`)
    return addMonAlert(s, { title: 'Customer bridge errors', resource: 'Application', name_: BRIDGE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 2, 5: 2 },
}

export const LABS = [lab]
