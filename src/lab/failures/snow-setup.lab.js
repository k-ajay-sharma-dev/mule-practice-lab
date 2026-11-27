// The guided lab snow-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, at, callApi, deployApp, finishDeploys, mark, newPlatform } from '../platform.js'
import { app, ask, called, OPS, until } from '../platform-kit.js'
import { createUser, groupId, INSTANCE, INSTANCE_URL, newServicenow, REST_ROLE, rowsOf, setRole, setUserFields, userOf, WIDE_ROLES } from '../platform-servicenow.js'
import { WMS, WMS_ALERT, WMS_BAD, WMS_JAR } from './snow-setup.pkg.js'

const SVC = 'svc_wms_alerts'
const GROUP = 'Warehouse Systems'
const ONCALL = 'wms-oncall@harbor.example'
const PASSWORD = 'Wms-Bridge-2611'
const y = (s) => s.servicenow
const svc = (s) => userOf(y(s), SVC)
const word = (v) => String(v ?? '').trim()
const a = (s) => app(s, WMS)
const prop = (s, k) => word(a(s)?.props?.[k])
const secret = (s, k) => a(s)?.secrets?.[k]

const userOk = (s) => Boolean(svc(s)?.active) && svc(s).web_service_access_only === true
const rolesOk = (s) => userOk(s) && svc(s).roles.includes(REST_ROLE) && svc(s).roles.includes('sn_incident_write') && !svc(s).roles.some((r) => WIDE_ROLES.includes(r))
const oauthOf = (s) => (y(s)?.oauth ?? []).find((o) => o.active && o.user === SVC)
const credOk = (s) => userOk(s) && (String(svc(s).pw ?? '').length >= 8 || Boolean(oauthOf(s)))
const authOk = (s) => {
  if (word(prop(s, 'snow.auth') || 'basic').toLowerCase() === 'oauth') {
    const reg = (y(s)?.oauth ?? []).find((o) => o.active && o.client_id === prop(s, 'snow.clientId'))
    return Boolean(reg) && reg.user === SVC && secret(s, 'snow.clientSecret') === reg.client_secret && a(s).props['snow.clientSecret'] === undefined
  }
  return prop(s, 'snow.username') === SVC && Boolean(svc(s)?.pw) && secret(s, 'snow.password') === svc(s).pw && a(s).props['snow.password'] === undefined
}
const deployedOk = (s) => a(s)?.status === 'Running' && rolesOk(s) && prop(s, 'snow.instance').toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '') === INSTANCE && prop(s, 'snow.assignmentGroup') === GROUP && authOk(s)
const mine = (s) => rowsOf(y(s), 'incident').filter((r) => r.sys_created_by === SVC)
const tested = (s) => mine(s).find((r) => r.correlation_id && r.assignment_group === groupId(y(s), GROUP))

const MAIL = {
  t: at(1, 8, 45),
  to: OPS,
  subject: 'Warehouse alerts into ServiceNow',
  body: [
    'Hello integration team,',
    `from Monday the alerts of warehouse monitoring must open incidents in ServiceNow (${INSTANCE_URL}) instead of mails to a shared mailbox. The app ${WMS} is built and its jar is in Runtime Manager. Please:`,
    `1. Create the integration user ${SVC} in ServiceNow. Web service access only: nobody logs in to the UI with it.`,
    '2. Give it only what it needs to create and update incidents over REST. Security will not approve admin or itil for an integration user.',
    '3. Basic auth or OAuth is your choice, but the secret goes into a secure property, never a plain one.',
    `4. New incidents go to the group ${GROUP}. One open incident per problem: a repeated alert adds a work note.`,
    `5. An alert without a key must be rejected, not turned into an empty ticket.`,
    `6. Failures of the bridge alert ${ONCALL}.`,
    'Harbor warehouse operations',
  ].join('\n\n'),
  source: 'Harbor warehouse operations',
}

const lab = {
  id: 'p-snow-setup',
  group: 'HR, ITSM and CRM',
  title: 'Set up the ServiceNow integration for warehouse alerts',
  minutes: 35,
  scenario: `It is 09:00. Warehouse operations wants the alerts of its monitoring to become ServiceNow incidents on ${INSTANCE_URL}. The app ${WMS} is built and its jar is in Runtime Manager, but nothing is configured: no integration user, no roles, no credentials, no properties. Done means a test alert opens one incident in the right group, a bad alert is rejected, and failures reach the on call team. The Inbox has the request.`,
  start() {
    const s = newPlatform({ clock: at(1, 8, 30), jars: [{ pkg: WMS, jar: WMS_JAR }], servicenow: newServicenow(at(1, 8, 30)), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of warehouse operations. Note the user, the group, the rule for repeats and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the integration user',
      how: `ServiceNow from the console menu, User Administration, Users, New. User ID ${SVC}, First name Harbor, Last name WMS Alerts, tick Web service access only, and Submit.`,
      done: userOk,
    },
    {
      title: 'Give it the least roles',
      how: `Open ${SVC}, Roles. Add ${REST_ROLE} (REST access) and sn_incident_write (create and update incidents). Nothing else: no admin, no itil.`,
      done: rolesOk,
    },
    ask(
      'Why not admin',
      'Why is admin wrong for the integration user, even in a test instance?',
      [
        'Admin users cannot call the Table API',
        'Admin passes every ACL: a leaked credential opens the whole instance, the app may write fields it should not, and tests as admin hide ACL problems that appear later with the real roles. A role that grants only incident writes keeps the blast radius small',
        'Admin is fine as long as the password is long',
        'Admin needs a fulfiller license',
      ],
      1,
      'An integration user is a service account: web service access only (no UI login), the smallest roles for its job, a credential that lives only in the app, and tests run as that user. In ServiceNow a role on an ACL decides what the user may read, create and write, so a narrow role is the guard rail.',
    ),
    {
      title: 'Give the app a credential',
      how: `Basic: open ${SVC}, Set password, enter a password of at least 8 characters and Save. OAuth: System OAuth, Application Registry, New, Create an OAuth API endpoint for external clients, Name WMS bridge, OAuth application user ${SVC}, Submit, and copy the Client ID and Client Secret it shows once.`,
      done: credOk,
    },
    ask(
      'Basic or OAuth',
      'What does OAuth client credentials give you over basic auth here?',
      [
        'Nothing, both send the password on each call',
        'The app gets a short lived token for the OAuth application user, the client secret can be rotated or the client deactivated in the Application Registry without touching the user, and the password of the user is never sent',
        'OAuth needs no user at all, so no roles apply',
        'OAuth is faster because it skips ACLs',
      ],
      1,
      'With basic auth the user password is sent on every call and rotating it means a change on both sides at once. With an OAuth endpoint for external clients the app trades its client ID and secret for a token; the token carries the roles of the OAuth application user, so least privilege still applies. Either way the secret is a secure property.',
    ),
    {
      title: 'Deploy the app with secure credentials',
      how: `Runtime Manager, Deploy application, name ${WMS}, file ${WMS_JAR}. Properties: snow.instance ${INSTANCE_URL}, snow.assignmentGroup ${GROUP}, and either snow.auth basic with snow.username ${SVC} and snow.password, or snow.auth oauth with snow.clientId and snow.clientSecret. Press Protect on the row of the password or the client secret. Deploy, wait for Running and read the logs.`,
      done: deployedOk,
    },
    {
      title: 'Test the connection',
      how: `API client, application ${WMS}, GET /health. The answer is 200 with "UP". In ServiceNow, System Logs, Transactions (REST) shows GET /api/now/table/incident by ${SVC} with 200.`,
      done: (s) => deployedOk(s) && called(s, WMS, 200, 'GET', /^\/health/) && Boolean(s.seen['snow:tx']),
    },
    {
      title: 'Create a test incident and find it',
      how: `API client, POST /alerts with body ${WMS_ALERT}. The answer is 201 with the incident number. In ServiceNow, Incident, All, filter Correlation ID is WMS-APP-01:pick_queue and open the record: Assignment group ${GROUP}, Created by ${SVC}. Send the same alert again: 200, and the work notes grow instead of a second incident.`,
      done: (s) => deployedOk(s) && Boolean(tested(s)) && Boolean(s.seen[`snow:form:${tested(s).number}`]),
    },
    {
      title: 'Send a bad alert',
      how: `API client, POST /alerts with body ${WMS_BAD}. The answer is 400 with key and summary are required, the log of ${WMS} has a WARN line, and no incident without a correlation ID appears in ServiceNow.`,
      done: (s) => deployedOk(s) && called(s, WMS, 400, 'POST', /^\/alerts/) && !mine(s).some((r) => !r.correlation_id),
    },
    {
      title: 'Alert the on call team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${WMS}, metric Message Error Count, Above 0 for 1 minute, recipient ${ONCALL}. A 401, 403 or 429 from ServiceNow then reaches a person.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === WMS && x.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(x.operator) && Number(x.threshold) <= 1 && String(x.recipients ?? '').includes(ONCALL)),
    },
  ],
  why: 'A ServiceNow integration starts in the instance: an integration user with web service access only, the smallest roles for the job (REST access and an incident writer role, never admin or itil), and a credential, either the user password for basic auth or an OAuth endpoint for external clients whose application user is that integration user. The secret goes into a secure property. Deploy with the instance URL and the group, prove the connection with a health call as that user, then send real data and find it in the list as an admin would: the right group, Created by the integration user, and one open incident per problem through correlation_id. Send a bad alert to see it rejected before it reaches ServiceNow, and alert on errors so a 401 after a password change or a 429 after a rate limit change reaches someone. In the lab the OAuth token call is folded into each request.',
  docs: 'https://docs.mulesoft.com/servicenow-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    // the New user form has no password field: the password is set on the record, as a learner does
    s = createUser(s, { user_name: SVC, first_name: 'Harbor', last_name: 'WMS Alerts', web_service_access_only: true }).state
    s = setRole(s, SVC, REST_ROLE, true).state
    s = setRole(s, SVC, 'sn_incident_write', true).state
    s = setUserFields(s, SVC, { password: PASSWORD }).state
    const form = { name: WMS, pkg: WMS, jar: WMS_JAR, replicas: 1, vCores: 0.1, props: { 'snow.instance': INSTANCE_URL, 'snow.auth': 'basic', 'snow.username': SVC, 'snow.assignmentGroup': GROUP }, secrets: { 'snow.password': PASSWORD } }
    s = finishDeploys(deployApp(s, form).state)
    s = mark(s, `logs:${WMS}`)
    s = callApi(s, { env: 'Sandbox', app: WMS, method: 'GET', path: '/health' }).state
    s = mark(s, 'snow:tx')
    s = callApi(s, { env: 'Sandbox', app: WMS, method: 'POST', path: '/alerts', body: WMS_ALERT }).state
    s = callApi(s, { env: 'Sandbox', app: WMS, method: 'POST', path: '/alerts', body: WMS_ALERT }).state
    s = mark(s, 'snow:list:incident')
    s = mark(s, `snow:form:${tested(s).number}`)
    s = callApi(s, { env: 'Sandbox', app: WMS, method: 'POST', path: '/alerts', body: WMS_BAD }).state
    return addMonAlert(s, { title: 'WMS bridge errors', resource: 'Application', name_: WMS, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ONCALL })
  },
  answers: { 3: 1, 5: 1 },
}

export const LABS = [lab]
