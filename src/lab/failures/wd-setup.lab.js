// The guided lab wd-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, callApi, deployApp, finishDeploys, mark, MINUTE, newPlatform, runNow } from '../platform.js'
import { app, ask, called, OPS, until } from '../platform-kit.js'
import {
  activatePending, activeCount, addPrompt, changeEmail, createGroup, createIsu, createReport, DOMAINS, editReport, GROUP_TYPE, groupsOf, newWorkday, permsOf, SCREEN_USER, setPasswordRules, setPermissions, TENANT, WD_HOST,
} from '../platform-workday.js'
import { FEED, FEED_FLOW, FEED_JAR } from './wd-setup.pkg.js'

const ISU = 'ISU_BRIGHTMART_FEED'
const GROUP = 'ISSG_Worker_Feed'
const REPORT = 'INT_Worker_Feed'
const TEST_WORKER = '21012'
const ALERT_TO = 'hr-integrations@brightmart.example'
const PASSWORD = 'Feed-Lab-Pass-1103'
const NEED = ['Employee_ID', 'Worker', 'Email', 'Location']
const y = (s) => s.workday ?? {}
const a = (s) => app(s, FEED)
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const store = (s) => a(s)?.store ?? {}

const isuOk = (s) => {
  const u = y(s).isus?.[ISU]
  return Boolean(u && u.noUi && !u.requireNew && (y(s).rules?.exempt ?? []).includes(ISU))
}
// least privilege: Get only, on the three domains the report needs, and in no other group
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
  return NEED.every((f) => r.fields.includes(f)) && !r.fields.includes('Annual_Salary') && !r.fields.includes('Date_of_Birth') && has('Updated_From', 'from') && has('Updated_To', 'to')
}
const deployedOk = (s) => {
  const x = a(s)
  if (x?.status !== 'Running') return false
  const user = prop(s, 'workday.username')
  return (
    prop(s, 'workday.host') === WD_HOST && prop(s, 'workday.tenant') === TENANT && [ISU, `${ISU}@${TENANT}`].includes(user) && prop(s, 'raas.owner') === SCREEN_USER && prop(s, 'raas.report') === REPORT &&
    Boolean(y(s).isus?.[ISU]) && x.secrets?.['workday.password'] === y(s).isus[ISU].password && !x.props?.['workday.password']
  )
}
const loaded = (s) => {
  const f = store(s).first
  return Boolean(deployedOk(s) && f && f.blank === 0 && f.good > 0 && f.good === activeCount(y(s), f.t))
}

const MAIL = {
  t: at(1, 8, 40),
  to: OPS,
  subject: 'New feed: Workday workers to the identity hub',
  body: [
    'Hello integration team,',
    `The identity hub needs every active worker of Workday tenant ${TENANT} with Employee_ID, Worker, Email and Location, first in full and then every 15 minutes the changes. The app ${FEED} is built and waits in Runtime Manager. Please set up:`,
    `1. An integration system user ${ISU}. No browser sessions, and its password must not expire under the tenant rules.`,
    `2. A security group ${GROUP} with ${ISU} as its only member and read access to what the feed needs. Nothing more: no compensation, no personal data, no write access.`,
    `3. A custom report ${REPORT} on All Active Workers with the four fields, prompts Updated_From and Updated_To on Last_Functionally_Updated, enabled as a web service and shared with the group.`,
    '4. The password kept out of plain properties.',
    `5. Test with worker ${TEST_WORKER} Quinn Testa, our test record: a worker without a work email must be rejected, not sent empty.`,
    `6. Failures alert ${ALERT_TO}.`,
    'Brightmart HR systems',
  ].join('\n\n'),
  source: 'Brightmart HR systems',
}

function workday(now) {
  const x = newWorkday(now)
  x.workers[TEST_WORKER] = { name: 'Quinn Testa', job: 'JP_PICKER', loc: 'LOC_DOCK_01', org: 'Integration Test', email: 'quinn.testa@brightmart.example', hire: now - 30 * 86400000, term: null, upd: now - 30 * 86400000 }
  return x
}

const lab = {
  id: 'p-wd-setup',
  group: 'HR, ITSM and CRM',
  title: 'Set up the Workday worker feed to the identity hub',
  minutes: 35,
  scenario: `It is 09:00. HR systems want the active workers of Workday in the new identity hub of Brightmart. The app ${FEED} is built and its jar is in Runtime Manager, but nothing exists for it yet: no integration system user, no security group, no report, no properties. Done means the full load matches the head count of Workday, a worker without an email is rejected, and failures reach the right team. The Inbox has the request.`,
  start() {
    const s = newPlatform({ clock: at(1, 8, 30), jars: [{ pkg: FEED, jar: FEED_JAR }], workday: workday(at(1, 8)), mail: [MAIL] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the top bar and read the mail of HR systems. Note the user, the group, the report, its fields and prompts, the test worker and who gets the alert.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the integration system user',
      how: `Workday from the console menu, Integration system users, Create Integration System User. User Name ${ISU}, a password of at least 8 characters, Require New Password at Next Sign In unticked, Do Not Allow UI Sessions ticked, OK. Then Password rules: tick ${ISU} under System Users exempt from password expiration and Save.`,
      done: isuOk,
    },
    ask(
      'Least privilege',
      `The report reads Employee_ID, Worker, Email and Location of active workers. Which permissions does ${GROUP} need?`,
      [
        'Get and Put on every Worker Data domain, so later feeds work too',
        `Get on Worker Data: Public Worker Reports, Person Data: Work Contact Information and Worker Data: Current Staffing Information. Nothing on compensation or personal data, and no Put: the feed only reads`,
        `Make ${ISU} a member of ISSG_Brightmart_HCM, which works already`,
        'Get on Worker Data: Public Worker Reports only; Workday shows the other fields anyway',
      ],
      1,
      'Each report field is guarded by a domain. The data source and Worker need Public Worker Reports, Email needs Work Contact Information, Location needs Current Staffing Information. A field the ISU cannot see comes back empty without any error, so a missing domain shows up as blank data, not as a failure. The HCM group has Put, which this feed must not have.',
    ),
    {
      title: 'Create the security group',
      how: `Workday, Security groups, Create Security Group: name ${GROUP}, tick ${ISU}, OK. Under Domain security policies of the group tick Get for the three domains of the answer before and Save permissions. The changes wait as pending: enter a comment under Activate Pending Security Policy Changes and press Activate.`,
      done: groupOk,
    },
    {
      title: 'Build the report',
      how: `Workday, Custom reports, Create Custom Report: name ${REPORT}, data source All Active Workers, Create. Tick the fields Employee_ID, Worker, Email, Location and Last_Functionally_Updated, tick Enable As Web Service and share with ${GROUP}, Save. Under Prompts add Updated_From (Last_Functionally_Updated, From) and Updated_To (same field, To). Web service URLs shows the RaaS URL with the owner ${SCREEN_USER}.`,
      done: reportOk,
    },
    {
      title: 'Deploy the app',
      how: `Runtime Manager, Deploy application. Name ${FEED}, file ${FEED_JAR}. Properties: workday.host ${WD_HOST}, workday.tenant ${TENANT}, workday.username ${ISU}, raas.owner ${SCREEN_USER}, raas.report ${REPORT}, workday.responseTimeout 60000. Add workday.password with the password of the ISU and select Protect. Deploy, wait for Running and open the Logs.`,
      done: (s) => deployedOk(s) && Boolean(s.seen[`logs:${FEED}`]),
    },
    {
      title: 'Test the connection',
      how: `API client, application ${FEED}, GET /health. It answers 200 with workday UP and the number of active workers from Get_Workers. Workday, Signons shows a successful web service signon of ${ISU}.`,
      done: (s) => deployedOk(s) && called(s, FEED, 200, 'GET', /^\/health/) && Boolean(s.seen['wd:signons']),
    },
    {
      title: 'Load and check the data',
      how: `Runtime Manager, ${FEED}, Schedules, tick ${FEED_FLOW} and press Run. The log shows the full load. Compare the count with the head count of active workers in Workday, Workers, and check that no row was rejected. If every row lacks Email, the group misses a domain: fix it, delete the key watermark in Object Store and run again.`,
      done: (s) => loaded(s) && Boolean(s.seen['wd:workers']),
    },
    {
      title: 'Reject a worker without email',
      how: `Workday, Workers, ${TEST_WORKER} Quinn Testa, Contact tab. Under Change Contact Information clear Work email and Submit. Run ${FEED_FLOW} again: the delta brings the test worker, the log warns that 21012 has no Email, and the rejected list in Object Store names it. Nothing empty reaches the hub.`,
      done: (s) => loaded(s) && (store(s).rejected ?? []).some((x) => x.id === TEST_WORKER),
    },
    ask(
      'RaaS or Get_Workers',
      'Why does this feed read a custom report over RaaS and not the Get_Workers SOAP operation?',
      [
        'Get_Workers cannot read workers',
        'The report returns exactly the four fields as JSON in one call, filtered by prompts for the delta, and its security is the field domains you granted. Get_Workers returns large worker documents in pages of at most 999 and suits a full profile or a write such as Change_Job',
        'RaaS is the only API Workday has',
        'SOAP needs a second ISU',
      ],
      1,
      'RaaS fits extracts: the report owner shapes the columns and filters in Workday, and the app reads a flat JSON list. SOAP web services fit operations and full objects, with paging and Response_Group to trim the answer. Either way the ISU, its group and the domain policies decide what comes back.',
    ),
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${FEED}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail. A rejected worker counts as an error, so the run of the test worker already counts.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === FEED && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
  ],
  why: 'A Workday feed setup in short: an integration system user with UI sessions off and exempt from password expiry; an integration system security group with that user only, and Get on exactly the domains the report fields need, activated with Activate Pending Security Policy Changes; a custom report on the right data source with only the needed fields, date prompts for the delta, Enable As Web Service and shared with the group. Store the password as a protected property, deploy, prove the login with a health call and the Signons report, compare the full load with the head count, and test a bad record that is rejected, not sent empty. Then alert the owning team.',
  docs: 'https://docs.mulesoft.com/workday-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createIsu(s, { user: ISU, password: PASSWORD, requireNew: false, noUi: true }).state
    s = setPasswordRules(s, { exempt: [...s.workday.rules.exempt, ISU] }).state
    s = createGroup(s, { name: GROUP, members: [ISU] }).state
    for (const d of [DOMAINS.PUBLIC, DOMAINS.STAFFING, DOMAINS.CONTACT]) s = setPermissions(s, GROUP, d, ['Get']).state
    s = activatePending(s, 'Worker feed to the identity hub').state
    s = createReport(s, { name: REPORT, source: 'All Active Workers' }).state
    s = editReport(s, REPORT, { fields: [...NEED, 'Last_Functionally_Updated'], ws: true, share: [GROUP] }).state
    s = addPrompt(s, REPORT, { name: 'Updated_From', field: 'Last_Functionally_Updated', op: 'from' }).state
    s = addPrompt(s, REPORT, { name: 'Updated_To', field: 'Last_Functionally_Updated', op: 'to' }).state
    const props = { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': ISU, 'raas.owner': SCREEN_USER, 'raas.report': REPORT, 'workday.responseTimeout': '60000' }
    s = finishDeploys(deployApp(s, { name: FEED, pkg: FEED, jar: FEED_JAR, replicas: 1, vCores: 0.1, props, secrets: { 'workday.password': PASSWORD } }).state)
    s = mark(s, `logs:${FEED}`)
    s = callApi(s, { env: 'Sandbox', app: FEED, method: 'GET', path: '/health', body: '' }).state
    s = mark(mark(s, 'wd:signons'), 'wd:workers')
    s = runNow(s, FEED, FEED_FLOW)
    s = changeEmail(advance(s, MINUTE), TEST_WORKER, '').state
    s = runNow(advance(s, MINUTE), FEED, FEED_FLOW)
    return addMonAlert(s, { title: 'Worker feed failed', resource: 'Application', name_: FEED, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 1, 9: 1 },
}

export const LABS = [lab]
