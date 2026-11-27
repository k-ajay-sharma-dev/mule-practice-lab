// The guided lab snow-rate-limit. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addIncident, addUser, ciId, explore, groupId, INSTANCE_URL, newServicenow, REST_ROLE } from '../platform-servicenow.js'
import { GROUP, modeOf, on429Of, PORTAL, PORTAL_FLOW } from './snow-rate-limit.pkg.js'

const SVC = 'svc_store_portal'
const LIMIT = 1000
const a = (s) => app(s, PORTAL)
const running = (s) => a(s)?.status === 'Running'
const fewer = (s) => running(s) && modeOf(a(s).props) === 'changed-since'
const waits = (s) => running(s) && on429Of(a(s).props) === 'wait'
const lastRun = (s) => a(s)?.schedules.find((x) => x.flow === PORTAL_FLOW)?.last

function instance(now) {
  const y = newServicenow(now)
  addUser(y, { user_name: SVC, first_name: 'Harbor', last_name: 'Store Portal', roles: [REST_ROLE, 'sn_incident_read'], pw: 'Portal-Harbor-2611', web_service_access_only: true }, now)
  for (let i = 0; i < 34; i++)
    addIncident(y, { short_description: `Store ${String(40 + (i % 9)).padStart(4, '0')}: ${['till freezes', 'card reader offline', 'shelf label printer down', 'scale reads wrong'][i % 4]}`, cmdb_ci: ciId(y, 'STORE-0042-POS'), assignment_group: groupId(y, i < 30 ? GROUP : 'Network'), state: String([1, 2, 3][i % 3]), impact: '3', urgency: '2' }, now - (2000 - i * 50) * MINUTE, 'sam.reyes')
  y.rateRules.push({ sys_id: 'b1e5c0de5a7e11ab9c0d00000000a001', name: 'Store portal sync', resource: 'Table API', type: 'User', who: SVC, limit: LIMIT, active: true })
  return y
}

const lab = {
  id: 'p-snow-rate-limit',
  group: 'HR, ITSM and CRM',
  title: 'The store portal stops at half past every hour',
  minutes: 25,
  scenario: `${PORTAL} keeps the ticket list of the Harbor store portal up to date from ServiceNow ${INSTANCE_URL}, every minute. Since the store network rollout added tickets, store managers see the list freeze for the last half of every hour and come back on the hour. ServiceNow admins added a rate limit rule for the sync user last month. Find out what the instance answers and make the sync fit the limit without asking for more.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(PORTAL, {
          props: { 'snow.instance': INSTANCE_URL, 'snow.username': SVC, 'sync.mode': 'per-record', 'snow.on429': 'fail' },
          secrets: { 'snow.password': 'Portal-Harbor-2611' },
          store: {},
        }),
      ],
      servicenow: instance(at(1, 8)),
      mail: [
        {
          t: at(1, 9, 40),
          to: OPS,
          subject: 'Store portal ticket list frozen again',
          body: 'Hello. Since 09:33 the ticket list in the store portal does not change. Yesterday it was the same from about half past each hour until the full hour. Store 0042 closed a ticket at 09:35 and still sees it open. Harbor store operations',
          source: 'Harbor store operations',
        },
      ],
    })
    return until(s, at(1, 9, 45))
  },
  steps: [
    sawLogs(PORTAL),
    {
      title: 'See the 429 in ServiceNow',
      how: `ServiceNow from the console menu, System Logs, Transactions (REST). The calls of ${SVC} turn from 200 to 429 at the same time each hour. System Log, All has the line Rate limit exceeded.`,
      done: (s) => Boolean(s.seen['snow:tx']),
    },
    {
      title: 'Read the rate limit rule',
      how: `System Web Services, Rate Limit Rules. The rule Store portal sync allows ${LIMIT} requests per hour to user ${SVC}. Compare that with the calls of one run times 60.`,
      done: (s) => Boolean(s.seen['snow:rate']),
    },
    {
      title: 'Read the rate headers as the sync user',
      how: `REST API Explorer. Run as ${SVC}, GET incident with sysparm_limit 1, Send. Read the response headers X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset (seconds since 1970), and Retry-After on a 429.`,
      done: (s) => (s.servicenow?.tx ?? []).some((e) => e.src === 'REST API Explorer' && e.user === SVC),
    },
    ask(
      'Count the calls',
      `About 30 open incidents belong to ${GROUP}. How many calls does one per-record run make, and when is the limit of ${LIMIT} used up?`,
      [
        'One call per run, so the limit is never reached',
        `About 31: one list call and one GET per incident. 31 calls a minute is about 1860 an hour, so ${LIMIT} is gone after about 32 minutes, and every call gets 429 until the hour resets`,
        'About 1000 per run, so the first run fails',
        'The limit counts only failed calls',
      ],
      1,
      'A ServiceNow rate limit rule counts the requests of a user (or a role, or all users) per hour. Once the count is reached, each request gets 429 Too Many Requests until the hour ends. Calls that read one record each add up with the number of records.',
    ),
    ask(
      'Raise the limit or change the client',
      'What is the right first move?',
      [
        'Ask the ServiceNow admins to raise the limit to 5000',
        'Give the sync user admin so no rule applies',
        'Make fewer calls: one query for what changed since a watermark, with sysparm_fields. Then treat 429 as wait and retry at X-RateLimit-Reset, keeping the watermark, instead of failing the run',
        'Retry each 429 at once until it works',
      ],
      2,
      'The rule protects the instance that agents use. A per record loop grows with the data, so the next store rollout breaks a higher limit too. One query per run with sys_updated_on >= watermark returns only what changed. A 429 is not a failure of the data: wait until the reset time and start again from the same watermark. Retrying at once only burns more of the limit.',
    ),
    {
      title: 'Read only what changed',
      how: `Runtime Manager, ${PORTAL}, Settings, Properties. Set sync.mode to changed-since and Apply Changes. The flow sends one GET with sysparm_query assignment_group=${GROUP}^sys_updated_on>=<watermark>^ORDERBYsys_updated_on and sysparm_fields.`,
      done: fewer,
    },
    {
      title: 'Wait on 429 instead of failing',
      how: 'Same properties. Set snow.on429 to wait and Apply Changes. On a 429 the flow keeps its watermark and makes no call until X-RateLimit-Reset.',
      done: waits,
    },
    {
      title: 'Prove the portal keeps up',
      how: `Move the clock past the next full hour and 10 minutes more. The runs of ${PORTAL} are green, Transactions show one call a minute with 200, and X-RateLimit-Remaining stays high.`,
      done: (s) => fewer(s) && waits(s) && (a(s)?.store?.lastSync ?? 0) > a(s).updated + 5 * MINUTE && Boolean(lastRun(s)?.ok) && lastRun(s).t > a(s).updated,
    },
  ],
  why: 'ServiceNow rate limit rules count the REST requests of a user, a role or all users per hour and answer 429 Too Many Requests once the count is reached, with X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset on each answer. A sync that reads one record per call grows with the data and hits the rule. Read in bulk: one query on sys_updated_on since a watermark, only the fields you need. Then handle 429 as back pressure, not as a failure: keep the watermark and wait until the reset time. Ask for a higher limit only when the cheapest client still needs it. In the lab the hour of the rule starts on the full hour of the clock.',
  docs: 'https://docs.mulesoft.com/http-connector/latest/',
  solve(start) {
    let s = mark(start, `logs:${PORTAL}`)
    s = mark(s, 'snow:tx')
    s = mark(s, 'snow:rate')
    s = explore(s, { as: SVC, method: 'GET', table: 'incident', params: { sysparm_limit: 1 } }).state
    s = change(s, PORTAL, { props: { ...app(s, PORTAL).props, 'sync.mode': 'changed-since', 'snow.on429': 'wait' } })
    return advance(s, 26 * MINUTE)
  },
  answers: { 4: 1, 5: 2 },
}

export const LABS = [lab]
