// The guided lab snow-paging. See platform-labs.js for the shape of a lab.
import { advance, at, DAY, mark, MINUTE, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { addIncident, addUser, ciId, dt, explore, groupId, INSTANCE_URL, newServicenow, parseQuery, REST_ROLE } from '../platform-servicenow.js'
import { pagingOf, SYNC, SYNC_FLOW } from './snow-paging.pkg.js'

const SVC = 'svc_brightmart_dwh'
const QUERY = 'stateIN1,2,3^ORDERBYDESCsys_updated_on'
const a = (s) => app(s, SYNC)
const running = (s) => a(s)?.status === 'Running'
const query = (s) => parseQuery('incident', a(s)?.props?.['sync.query'])
const paged = (s) => running(s) && pagingOf(a(s).props) === 'offset'
// a stable order: a field that does not change while the pages are read
const stable = (s) => {
  const q = query(s)
  return running(s) && q.invalid.length === 0 && q.order.length > 0 && ['sys_created_on', 'sys_id', 'number'].includes(q.order[0].field) && !q.order.some((o) => o.field === 'sys_updated_on') && q.groups.some((g) => g.some((t) => t.field === 'state'))
}
const last = (s) => a(s)?.store?.last

const TEXTS = ['Handheld scanner offline', 'Label printer jams', 'Pick list missing lines', 'POS slow at checkout', 'Wi-Fi drops in aisle', 'Price check shows wrong price', 'Dock door sensor fault', 'Report runs too long', 'Login fails on terminal', 'Fridge sensor alarm']
const GROUPS = ['Store Systems', 'Warehouse Systems', 'Network', 'Service Desk']
const CIS = ['STORE-0042-POS', 'WMS-APP-01', 'EDGE-RTR-07', 'WMS-DB-01']
function instance(now) {
  const y = newServicenow(now)
  addUser(y, { user_name: SVC, first_name: 'Brightmart', last_name: 'Warehouse Sync', roles: [REST_ROLE, 'sn_incident_read'], pw: 'Dwh-Brightmart-2611', web_service_access_only: true }, now)
  for (let i = 0; i < 140; i++) {
    const created = now - 10 * DAY + i * 97 * MINUTE
    const r = addIncident(y, { short_description: `${TEXTS[i % 10]} (${CIS[i % 4]})`, cmdb_ci: ciId(y, CIS[i % 4]), assignment_group: groupId(y, GROUPS[i % 4]), state: i % 7 === 3 ? '6' : String([1, 2, 3, 2][i % 4]), impact: String((i % 3) + 1), urgency: String(((i + 1) % 3) + 1) }, created, i % 2 ? 'beth.okafor' : 'sam.reyes')
    // the work on each ticket happened later, in an order of its own
    r.sys_updated_on = dt(Math.min(now - MINUTE, created + ((i * 7919) % 97) * 60 * MINUTE))
  }
  y.churn = true
  return y
}

const lab = {
  id: 'p-snow-paging',
  group: 'HR, ITSM and CRM',
  title: 'The warehouse sees 50 open incidents, ServiceNow has more',
  minutes: 25,
  scenario: `${SYNC} copies the open ServiceNow incidents of ${INSTANCE_URL} to the Brightmart data warehouse every 15 minutes, and the store managers read their open tickets there. The job is green in Runtime Manager. The reporting team says the warehouse never has more than 50 open incidents, while the incident list in ServiceNow shows many more. Find where the rows get lost and make the copy complete.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [
        newApp(SYNC, {
          props: { 'snow.instance': INSTANCE_URL, 'snow.username': SVC, 'sync.query': QUERY, 'sync.pageSize': '50', 'sync.paging': 'none' },
          secrets: { 'snow.password': 'Dwh-Brightmart-2611' },
          store: {},
        }),
      ],
      servicenow: instance(at(1, 8)),
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Open incidents in the warehouse are wrong',
          body: 'Hello. The store report shows exactly 50 open incidents every morning, while the incident list in ServiceNow shows about 100 open ones. Store managers miss tickets that are open for days. The sync job reports no error. Brightmart reporting team',
          source: 'Brightmart reporting team',
        },
      ],
    })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Count the open incidents in ServiceNow',
      how: 'ServiceNow from the console menu, Incident, Open. The list header gives the count of records that match State is one of New, In Progress, On Hold.',
      done: (s) => Boolean(s.seen['snow:list:incident']),
    },
    sawLogs(SYNC),
    {
      title: 'Run the same query as the sync user',
      how: `ServiceNow, REST API Explorer. Run as ${SVC}, method GET, table incident, sysparm_query ${QUERY}, sysparm_limit 50, and Send. The answer has 50 rows, and the response header X-Total-Count gives all that match. The Link header has a rel next.`,
      done: (s) => (s.servicenow?.tx ?? []).some((e) => e.src === 'REST API Explorer' && e.user === SVC && e.url.startsWith('/api/now/table/incident') && e.tot > 0),
    },
    ask(
      'What sysparm_limit does alone',
      'The app sends sysparm_limit=50 and nothing else for paging. What does ServiceNow return?',
      [
        'All rows, 50 at a time, in one answer',
        'The first 50 rows of the query, and nothing tells the app there are more except X-Total-Count and the Link header',
        'An error, because the result has more than 50 rows',
        'A random 50 rows each time',
      ],
      1,
      'sysparm_limit is the page size. Without sysparm_offset every call returns page one. The client has to loop: add sysparm_offset by the page size until a page comes back short or the offset reaches X-Total-Count, or follow the rel next link.',
    ),
    {
      title: 'Read every page',
      how: `Runtime Manager, ${SYNC}, Settings, Properties. Set sync.paging to offset and Apply Changes. The flow then reads pages with sysparm_offset 0, 50, 100 until the last page.`,
      done: paged,
    },
    ask(
      'Rows that move while you page',
      'Agents work on tickets all the time. The query sorts by sys_updated_on, newest first. What happens to a ticket that someone updates while the app reads page 2?',
      [
        'Nothing, the pages are a snapshot',
        'It jumps to the top, into page 1 that was read already. Every row after it shifts one place, so page 2 starts with a row the app has seen, and the moved ticket is never read',
        'ServiceNow locks the table while a client pages',
        'The ticket comes twice, which is harmless',
      ],
      1,
      'Offset paging counts rows at the moment of each call. If the sort field changes during the read, rows move across page borders: some are read twice and some never. Sort by a field that does not change, such as sys_created_on or sys_id, and for incremental reads filter on sys_updated_on up to a fixed time taken at the start.',
    ),
    {
      title: 'Sort by a field that does not change',
      how: 'Same properties. Set sync.query to stateIN1,2,3^ORDERBYsys_created_on (or ORDERBYsys_id) and Apply Changes. Keep the state filter.',
      done: stable,
    },
    {
      title: 'Prove the copy is complete',
      how: `Runtime Manager, ${SYNC}, Schedules, tick ${SYNC_FLOW} and press Run (or move the clock 15 minutes). The log line counts the incidents written; compare with the count of step 1. Transactions in ServiceNow show one GET per page with sysparm_offset.`,
      done: (s) => paged(s) && stable(s) && last(s)?.t > a(s).updated && last(s).missed === 0 && last(s).dupes === 0 && last(s).total > 50,
    },
  ],
  why: 'The Table API returns one page per call: sysparm_limit is the page size and sysparm_offset the start. A client that sends only a limit reads page one forever, and the job stays green because nothing failed. Read X-Total-Count or follow the Link header, and loop until the last page. Offset paging is also only safe on a stable sort: when the sort field is sys_updated_on and agents update tickets during the read, rows cross page borders, so some come twice and some never. Sort by sys_created_on or sys_id, and for incremental loads use a watermark on sys_updated_on with an upper bound fixed at the start of the run. In the lab an agent updates the oldest open ticket before each page after the first.',
  docs: 'https://docs.mulesoft.com/http-connector/latest/',
  solve(start) {
    let s = mark(start, 'snow:list:incident')
    s = mark(s, `logs:${SYNC}`)
    s = explore(s, { as: SVC, method: 'GET', table: 'incident', params: { sysparm_query: QUERY, sysparm_limit: 50 } }).state
    s = change(s, SYNC, { props: { ...app(s, SYNC).props, 'sync.paging': 'offset', 'sync.query': 'stateIN1,2,3^ORDERBYsys_created_on' } })
    s = runNow(s, SYNC, SYNC_FLOW)
    return advance(s, MINUTE)
  },
  answers: { 3: 1, 5: 1 },
}

export const LABS = [lab]
