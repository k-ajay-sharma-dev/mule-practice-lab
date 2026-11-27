// The guided lab snow-dedupe. See platform-labs.js for the shape of a lab.
import { advance, at, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { addIncident, addUser, ciId, dt, groupId, INSTANCE_URL, newServicenow, REST_ROLE, rowsOf, updateSelected } from '../platform-servicenow.js'
import { ALERT, ALERT_KEY, BRIDGE, modeOf } from './snow-dedupe.pkg.js'

const SVC = 'svc_brightmart_monitoring'
const SUMMARY = JSON.parse(ALERT).summary
const OPEN = ['1', '2', '3']
const a = (s) => app(s, BRIDGE)
const incidents = (s) => rowsOf(s.servicenow, 'incident')
const coalesced = (s) => (s.servicenow?.transforms ?? []).some((m) => m.active && m.source === 'u_brightmart_alert_import' && m.fields.some((f) => f.target === 'correlation_id' && f.coalesce))
const deduped = (s) => a(s)?.status === 'Running' && (modeOf(a(s).props) === 'correlation_id' || (modeOf(a(s).props) === 'import-set' && coalesced(s)))
const since = (s) => dt(a(s)?.updated ?? 0)
const fresh = (s) => incidents(s).filter((r) => r.correlation_id === ALERT_KEY && r.sys_created_on >= since(s))
const oldDupes = (s) => incidents(s).filter((r) => r.short_description === SUMMARY && !r.correlation_id && OPEN.includes(r.state))

function instance(now) {
  const y = newServicenow(now)
  addUser(y, { user_name: SVC, first_name: 'Brightmart', last_name: 'Monitoring', roles: [REST_ROLE, 'sn_incident_write', 'import_set_loader'], pw: 'Mon-Brightmart-2611', web_service_access_only: true }, now)
  const g = (n) => groupId(y, n)
  for (const [i, [d, ci, grp]] of [
    ['POS terminal does not print receipts', 'STORE-0042-POS', 'Store Systems'],
    ['Router EDGE-RTR-07 reboots at night', 'EDGE-RTR-07', 'Network'],
    ['Pick lists print twice in zone B', 'WMS-APP-01', 'Warehouse Systems'],
    ['Cannot log in to the WMS handheld', 'WMS-APP-01', 'Warehouse Systems'],
    ['Price labels show old prices', 'STORE-0042-POS', 'Store Systems'],
  ].entries())
    addIncident(y, { short_description: d, cmdb_ci: ciId(y, ci), assignment_group: g(grp), state: i % 2 ? '2' : '1', impact: '2', urgency: '2' }, now - (300 - i * 40) * MINUTE, 'beth.okafor')
  return y
}

const lab = {
  id: 'p-snow-dedupe',
  group: 'HR, ITSM and CRM',
  title: 'One disk alert, sixty incidents',
  minutes: 25,
  scenario: `${BRIDGE} turns alerts of Brightmart monitoring into ServiceNow incidents on ${INSTANCE_URL}. Since 08:30 the disk of WMS-DB-01 is nearly full, and monitoring sends the same alert every 30 seconds while the problem lasts. At 09:00 the service desk calls: the queue of Warehouse Systems is full of incidents with the same text, and the real tickets are buried. Make a repeated alert update one incident, and clean up the queue.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8, 30),
      apps: [
        newApp(BRIDGE, {
          props: { 'snow.instance': INSTANCE_URL, 'snow.username': SVC, 'snow.assignmentGroup': 'Warehouse Systems', 'incident.dedupe': 'none' },
          secrets: { 'snow.password': 'Mon-Brightmart-2611' },
          replicas: 2,
          store: {},
        }),
      ],
      traffic: [{ app: BRIDGE, env: 'Sandbox', method: 'POST', path: '/alerts', body: ALERT, perMinute: 2 }],
      servicenow: instance(at(1, 8, 30)),
      mail: [
        {
          t: at(1, 9),
          to: OPS,
          subject: 'Warehouse Systems queue flooded',
          body: `Hello. Our queue in ServiceNow has about 60 new incidents with the text "${SUMMARY}", one every 30 seconds, and the count keeps going up. We cannot see the real tickets any more. Can you stop it and clean up? Brightmart service desk`,
          source: 'Brightmart service desk',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'See the flood in the incident list',
      how: 'ServiceNow from the console menu, Incident, All. Add a filter condition Short description contains WMS-DB-01 and press Run. Note the count, the times and that Correlation ID is empty on each.',
      done: (s) => Boolean(s.seen['snow:list:incident']),
    },
    {
      title: 'Read the REST transactions',
      how: `System Logs, Transactions (REST). Each alert is one POST /api/now/table/incident by ${SVC} with status 201. There is no GET before it.`,
      done: (s) => Boolean(s.seen['snow:tx']),
    },
    ask(
      'Why each alert is a new incident',
      'Why does the Table API create a new incident for each repeat of the alert?',
      [
        'ServiceNow merges duplicates by itself, so this is a bug in the instance',
        'POST on the Table API always inserts a record. It has no idea of the same alert. The app must look up an open incident by a key first, or the instance must coalesce on that key',
        'The app sends PUT, which inserts when the record exists',
        'The rate limit of the user is too high',
      ],
      1,
      'The Table API is plain CRUD: POST inserts, PATCH and PUT update one record by sys_id. Idempotency is the job of the caller. Either query first (GET with sysparm_query on a key, then PATCH or POST), or load through an import set whose transform map coalesces on the key.',
    ),
    {
      title: 'Make a repeated alert update the open incident',
      how: `Runtime Manager, ${BRIDGE}, Settings, Properties. Set incident.dedupe to correlation_id and Apply Changes: the app then sends GET /api/now/table/incident?sysparm_query=correlation_id=<key>^stateIN1,2,3 and a PATCH with a work note when it finds one. The other way: set incident.dedupe to import-set and, in ServiceNow, Transform Maps, Brightmart alert to incident, tick Coalesce on the correlation_id field map.`,
      done: deduped,
    },
    ask(
      'Pick the correlation key',
      'Which value should go into correlation_id?',
      [
        'The alert ID of each firing, which is new every 30 seconds',
        'The time of the alert',
        `A stable key of the problem: the source, the CI and the check, such as ${ALERT_KEY}`,
        'The short description',
      ],
      2,
      'The key must be the same for each repeat of one problem and different for different problems. An ID per firing gives one incident per firing again. Free text changes when someone edits it. correlation_id and correlation_display are fields made for this on the task table.',
    ),
    {
      title: 'Prove a repeat updates one incident',
      how: `Move the clock 3 minutes. In the incident list filter Correlation ID is ${ALERT_KEY}: one incident since your change, its Updates count goes up and its work notes list the repeats. Transactions show GET then PATCH.`,
      done: (s) => deduped(s) && s.clock >= (a(s)?.updated ?? 0) + 3 * MINUTE && fresh(s).length === 1 && fresh(s)[0].sys_mod_count >= 2,
    },
    {
      title: 'Cancel the duplicates',
      how: `Incident list, filter Short description contains WMS-DB-01 and Correlation ID is empty. Tick the select all box, then Update selected with State Canceled and a work note that names the incident that stays open.`,
      done: (s) => deduped(s) && fresh(s).length === 1 && oldDupes(s).length === 0,
    },
    ask(
      'Two alerts at the same moment',
      `${BRIDGE} runs on two replicas. Two repeats arrive in the same second, both GETs find nothing and both POST. What closes that gap?`,
      [
        'Nothing, two incidents are fine',
        'Retry the POST three times',
        'Serialize per key: a lock on the key (an object store lock or a queue grouped by key, such as a FIFO queue or one consumer), or let the instance decide with an import set that coalesces on correlation_id',
        'Add a 30 second sleep before the POST',
      ],
      2,
      'Find then create is a check then act race. It needs one writer per key: process alerts of one key in order on one consumer, take a lock on the key, or move the decision into ServiceNow, where the transform runs on the server. A sleep only makes the window smaller.',
    ),
  ],
  why: 'An alert storm repeats one problem many times, and the Table API inserts on each POST. Give each problem a stable correlation key, look for an open incident with that correlation_id first and PATCH it with a work note, or POST with the key set when none is open. An import set whose transform map coalesces on correlation_id does the same in ServiceNow, but it also updates a resolved incident, so add a condition on the state there. Clean up with a list filter and Update selected, and close the race between two parallel alerts with one writer per key. In the lab the storm is two alerts a minute and both replicas share one sequence.',
  docs: 'https://docs.mulesoft.com/http-connector/latest/',
  solve(start) {
    let s = mark(start, 'snow:list:incident')
    s = mark(s, 'snow:tx')
    s = change(s, BRIDGE, { props: { ...app(s, BRIDGE).props, 'incident.dedupe': 'correlation_id' } })
    s = advance(s, 4 * MINUTE)
    s = updateSelected(
      s,
      'incident',
      oldDupes(s).map((r) => r.sys_id),
      { state: '8', work_notes: `Duplicate of the incident with correlation_id ${ALERT_KEY}` },
    ).state
    return s
  },
  answers: { 2: 1, 4: 2, 7: 2 },
}

export const LABS = [lab]
