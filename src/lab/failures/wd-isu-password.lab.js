// The guided lab wd-isu-password. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, DAY, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { DOMAINS, editIsu, GROUP_TYPE, newWorkday, setPasswordRules, TENANT, WD_HOST } from '../platform-workday.js'
import { BADGE, BADGE_FLOW } from './wd-isu-password.pkg.js'

const ISU = 'ISU_BRIGHTMART_BADGE'
const REPORT = 'INT_Badge_Changes'
const ALERT_TO = 'facilities-it@brightmart.example'
const NEW_PASSWORD = 'Badge-Lab-Pass-1103'
const START = at(1, 9, 20)
const a = (s) => app(s, BADGE)
const isu = (s) => s.workday?.isus?.[ISU]
const reset = (s) => Boolean(isu(s)) && isu(s).set > START - DAY && !isu(s).requireNew
const exempt = (s) => (s.workday?.rules?.exempt ?? []).includes(ISU)
const stored = (s) => {
  const x = a(s)
  return Boolean(reset(s) && x?.status === 'Running' && x.secrets?.['workday.password'] === isu(s).password && !x.props?.['workday.password'])
}
const lastRun = (s) => a(s)?.schedules.find((y) => y.flow === BADGE_FLOW)?.last

function workday(now) {
  const y = newWorkday(now)
  // the password of the badge ISU was set 90 days before 06:00 today; the tenant expires passwords after 90 days
  y.isus[ISU] = { password: 'Badge-Lab-Pass-0805', set: at(1, 6) - 90 * DAY, requireNew: false, noUi: true, timeout: 0 }
  y.groups.ISSG_Brightmart_Badge = { type: GROUP_TYPE, members: [ISU], domains: { [DOMAINS.PUBLIC]: ['Get'], [DOMAINS.STAFFING]: ['Get'] } }
  y.reports[REPORT] = {
    name: REPORT,
    owner: 'lhart',
    source: 'All Active Workers',
    fields: ['Employee_ID', 'Worker', 'Location', 'Last_Functionally_Updated'],
    prompts: [
      { name: 'Updated_From', field: 'Last_Functionally_Updated', op: 'from' },
      { name: 'Updated_To', field: 'Last_Functionally_Updated', op: 'to' },
    ],
    ws: true,
    share: ['ISSG_Brightmart_Badge'],
  }
  y.workers['21006'].upd = at(1, 7, 30)
  return y
}

const lab = {
  id: 'p-wd-isu-password',
  group: 'HR, ITSM and CRM',
  title: 'Every Workday call fails at once',
  minutes: 20,
  scenario: `${BADGE} logs in to Workday as the integration system user ${ISU}. It sends changed workers to the badge system every 15 minutes and answers the lookups of the badge desk with Get_Workers. Since about 06:00 every call fails, the report and the SOAP call alike. Nothing was deployed and the network team sees no problem. Get it working and make sure it does not happen again.`,
  start() {
    const s = newPlatform({
      clock: at(1, 5, 40),
      apps: [
        newApp(BADGE, {
          props: { 'workday.host': WD_HOST, 'workday.tenant': TENANT, 'workday.username': `${ISU}@${TENANT}`, 'raas.owner': 'lhart', 'raas.report': REPORT },
          secrets: { 'workday.password': 'Badge-Lab-Pass-0805' },
          store: {},
        }),
      ],
      traffic: [{ app: BADGE, env: 'Sandbox', method: 'GET', path: '/workers/21004', perMinute: 1, every: 5 }],
      workday: workday(at(1, 5)),
      mail: [
        {
          t: at(1, 9, 10),
          to: OPS,
          subject: 'Badge desk cannot look up anyone',
          body: `Hello. Since about 6 this morning the badge desk gets "Workday is not available" for every lookup, and the new badges of today were not printed. Please send failures of the badge sync to ${ALERT_TO} in the future. Brightmart facilities`,
          source: 'Brightmart facilities',
        },
      ],
    })
    return until(s, START)
  },
  steps: [
    { ...sawLogs(BADGE), title: 'Read the errors', how: `Runtime Manager, Applications, ${BADGE}, Logs. The lookups fail with WSC:SOAP_FAULT invalid username or password, and the report call with HTTP:UNAUTHORIZED. Both since 06:00.` },
    {
      title: 'Find the reason in Workday',
      how: `Workday from the console menu, Signons. Every web service signon of ${ISU} since 06:00 failed with the reason Password Expired. Integration system users then shows when its password was set and when it expired.`,
      done: (s) => Boolean(s.seen['wd:signons']),
    },
    ask(
      'Why nobody saw it coming',
      `Why did the password of ${ISU} expire without anyone noticing?`,
      [
        'Workday expires integration users after 90 days of no use',
        `The tenant password rules expire passwords after 90 days, and ${ISU} is not on the list of system users exempt from expiry. The user has Do Not Allow UI Sessions, so no person ever saw a change password page, and Workday answers a web service with the same invalid username or password for every failed logon`,
        'Someone changed the password by mistake',
        'The badge desk locked the user with too many lookups',
      ],
      1,
      'Workday does not tell the caller why a logon failed. The reason is in Signons and Attempted Signons. An ISU is a machine account: exempt it from password expiry in Maintain Password Rules, keep its UI sessions off, and rotate the password on your own schedule, with the new value stored in one place the app reads.',
    ),
    {
      title: 'Set a new password',
      how: `Workday, Integration system users, ${ISU}, Edit. Enter a new password of at least 8 characters. Leave Require New Password at Next Sign In unticked: an ISU cannot change its own password, so with it ticked every call fails again. OK.`,
      done: reset,
    },
    {
      title: 'Exempt the ISU from expiry',
      how: `Workday, Password rules. Under System Users exempt from password expiration tick ${ISU}, the way ISU_BRIGHTMART_HCM already is, and Save.`,
      done: exempt,
    },
    {
      title: 'Give the app the new password',
      how: `Runtime Manager, ${BADGE}, Settings, Properties. Change workday.password to the new password and keep it protected, then Apply Changes. Do not add it as a plain property.`,
      done: stored,
    },
    {
      title: 'See the calls work',
      how: `Move the clock 15 minutes. The next run of ${BADGE_FLOW} sends the changed workers, Signons shows a successful signon of ${ISU}, and the badge desk lookups answer 200 again.`,
      done: (s) => stored(s) && Boolean(lastRun(s)?.ok) && lastRun(s).t >= a(s).updated && (s.workday?.signons ?? []).at(-1)?.ok === true,
    },
    {
      title: 'Alert the right team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${BADGE}, metric Message Error Count, Above 0. Recipients ${ALERT_TO}, from the mail.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === BADGE && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    ask(
      'Keep UI sessions off',
      `A colleague wants to untick Do Not Allow UI Sessions on ${ISU}, so someone can log in and change the password when it expires. What do you say?`,
      [
        'Good idea, then the next expiry is quick to fix',
        'No. A login with UI access turns the machine account into a person account that anyone with the password can use in the browser. Keep UI sessions off, exempt the ISU from expiry, and rotate the password on purpose: new value in Workday and in the secure property in one change',
        'Only during office hours',
        'Make the ISU a member of the HR administrator group instead',
      ],
      1,
      'Integration system users are for web services only. Do Not Allow UI Sessions closes the browser door, and least privilege on its security group keeps the damage small if the password leaks. A planned rotation, with the password kept in protected properties or a vault, replaces the forced expiry.',
    ),
  ],
  why: `When every call to Workday fails at the same moment and nothing was deployed, look at the account first. Workday answers a failed web service logon only with invalid username or password; Signons and Attempted Signons gives the reason, here Password Expired. Set a new password without Require New Password at Next Sign In, exempt the ISU from expiry in Maintain Password Rules, store the new value as a protected property, and watch the next run sign on. Keep Do Not Allow UI Sessions on, rotate on your own schedule, and alert on errors so a failed night does not wait for the morning call.`,
  docs: 'https://docs.mulesoft.com/workday-connector/latest/',
  solve(start) {
    let s = mark(mark(start, `logs:${BADGE}`), 'wd:signons')
    s = editIsu(s, ISU, { password: NEW_PASSWORD, requireNew: false }).state
    s = setPasswordRules(s, { exempt: [...s.workday.rules.exempt, ISU] }).state
    s = change(s, BADGE, { secrets: { ...a(s).secrets, 'workday.password': NEW_PASSWORD } })
    s = advance(s, 16 * MINUTE)
    return addMonAlert(s, { title: 'Badge sync failed', resource: 'Application', name_: BADGE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 1, 8: 1 },
}

export const LABS = [lab]
