// The guided lab shopify-cost. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { API_VERSION, labStore, SHOP, totalOrders } from '../platform-shopify.js'
import { EXPORT_FLOW, EXPORTER } from './shopify-cost.pkg.js'

const APP_NAME = 'Harbor Data Export'
const shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name === APP_NAME)
const a = (s) => app(s, EXPORTER)
const prop = (s, k) => String(a(s)?.props?.[k] ?? '').trim()
const running = (s) => a(s)?.status === 'Running'
const fixedOk = (s) => running(s) && (prop(s, 'export.mode') === 'bulk' || (prop(s, 'export.mode') === 'paged' && prop(s, 'export.onThrottle') === 'wait' && Number(prop(s, 'export.pageSize')) >= 1 && Number(prop(s, 'export.pageSize')) <= 76))
const last = (s) => a(s)?.schedules.find((x) => x.flow === EXPORT_FLOW)?.last

function start() {
  const now = at(1, 1, 50)
  const { y, app: shop } = labStore(now, { app: APP_NAME, scopes: ['read_orders'], archived: 1240 })
  const exporter = newApp(EXPORTER, {
    props: { 'shopify.shop': SHOP, 'shopify.apiVersion': API_VERSION, 'export.mode': 'paged', 'export.pageSize': '75', 'export.onThrottle': 'fail' },
    secrets: { 'shopify.accessToken': shop.token },
    store: { exported: 410, lastOk: at(0, 2) },
  })
  const s = newPlatform({
    clock: now,
    apps: [exporter],
    shopify: y,
    mail: [
      {
        t: at(1, 8, 15),
        to: OPS,
        subject: 'Order export missing in the warehouse',
        body: `Hello. The data warehouse has no web orders from yesterday. Yesterday was the autumn sale with about 1240 orders, the day before had 410 and those came through. The night job ${EXPORTER} is red. Can it run again this morning? Harbor data team`,
        source: 'Harbor data team',
      },
    ],
  })
  return until(s, at(1, 8, 30))
}

const lab = {
  id: 'p-shopify-cost',
  group: 'Data and cloud',
  title: 'Shopify GraphQL export throttled',
  minutes: 25,
  scenario: `${EXPORTER} reads every order of ${SHOP} through the Admin GraphQL API each night and copies it to the data warehouse. After yesterday's sale the store holds 1240 orders, and the 02:00 run failed with THROTTLED. Read the query cost and the throttle status, change the export so it stays within the limit, and run it again.`,
  start,
  steps: [
    { title: 'Read the mail', how: 'Open the Inbox and read the mail of the Harbor data team.', done: (s) => Boolean(s.seen.inbox) },
    { ...sawLogs(EXPORTER), how: `Runtime Manager, Applications, ${EXPORTER}, Logs. The run of 02:00 read a few pages and then failed with APP:SHOPIFY_THROTTLED. The message has requestedQueryCost, currentlyAvailable and restoreRate.` },
    {
      title: 'Read the cost of each call',
      how: `Shopify from the console menu, Apps, ${APP_NAME}, API calls. Each orders query asked for 977 points and was charged about 377. The throttle status shows a bucket of 2000 points that restores 100 points a second.`,
      done: (s) => Boolean(s.seen[`shopify:calls:${shopApp(s)?.id}`]),
    },
    ask(
      'Why 977',
      'The query asks orders(first: 75) and for each order lineItems(first: 10). Why is the requested cost 977 when the charge is about 377?',
      [
        'Shopify charges 13 points for each order it returns',
        'The requested cost is counted before the query runs: a connection is 2 plus first times the cost of one node, and one order node with its lineItems(first: 10) is 13, so 2 + 75 × 13 = 977. After the run Shopify charges what it really returned and gives the rest back',
        'The cost is the number of bytes divided by 100',
        'Each field costs one point',
      ],
      1,
      'Shopify needs the requested cost free in the bucket before it runs a query, even when the orders have only 2 lines each. A query over 1000 is refused with MAX_COST_EXCEEDED. The actual cost is what is taken from the bucket. The throttle status in extensions.cost shows maximumAvailable, currentlyAvailable and restoreRate.',
    ),
    ask(
      'Smaller pages',
      'A colleague wants to set export.pageSize to 10 and change nothing else. Does that fix the export?',
      [
        'Yes, a small query can never be throttled',
        'No. Each call is cheaper, but the app calls again at once and spends more points a second than the 100 the bucket gets back, so it is throttled later in the run. The app must read throttleStatus and wait, or use a bulk operation',
        'Yes, because Shopify lets every query under 200 points through',
        'No, because the page size must be 250',
      ],
      1,
      'The limit is a rate: a bucket that refills 100 points a second. Any loop that spends faster than that empties the bucket in time. Smaller pages lower the cost of one call, which helps against MAX_COST_EXCEEDED, but only waiting on the throttle status, or moving the read into a bulk operation, keeps a long export within the rate.',
    ),
    {
      title: 'Change the export',
      how: `Runtime Manager, ${EXPORTER}, Settings, Properties. Either set export.mode to bulk, or keep paged with export.onThrottle wait and an export.pageSize of 76 or less, so each query costs at most 1000. Apply Changes.`,
      done: fixedOk,
    },
    {
      title: 'Run the export again',
      how: `Runtime Manager, ${EXPORTER}, Schedules, tick ${EXPORT_FLOW} and press Run. The Logs end with Exported 1240 orders. With bulk you see one bulk operation and its JSONL file, with wait you see the time the app waited for the bucket.`,
      done: (s) => fixedOk(s) && Boolean(last(s)?.ok) && last(s).t >= a(s).updated && a(s).store?.exported === totalOrders(s.shopify),
    },
    ask(
      'The right tool for a full export',
      'The export reads every order each night and the store keeps growing. Which design fits best?',
      [
        'Paged queries with first: 250 and no waits',
        'Many parallel paged queries, one per day of orders',
        'A bulk operation: one bulkOperationRunQuery, poll currentBulkOperation until COMPLETED, then read the JSONL file from its url. Shopify does the paging and the query cost does not apply to the nodes it reads',
        'The REST orders endpoint, because it has no limit',
      ],
      2,
      'Bulk operations are made for large reads. The mutation costs 10 points, the polls 1 or 2, and the result is a JSONL file with each nested object on its own line and a __parentId. Only one bulk query runs at a time for an app. For small reads and for the latest changes, paged queries that respect the throttle status are fine.',
    ),
  ],
  why: 'The Admin GraphQL API limits by cost, not by calls. Before a query runs, Shopify counts its requested cost: 1 for an object, 2 plus first times the node cost for a connection, 10 for a mutation, at most 1000 for one query. The bucket of the store plan, here 2000 points with 100 restored a second, must hold the requested cost, or the answer is THROTTLED with HTTP 200. After the run only the actual cost is charged. A loop that reads page after page spends faster than the bucket restores, so read extensions.cost.throttleStatus and wait for (requested minus available) divided by restoreRate seconds, or use a bulk operation for full exports. The REST Admin API has its own leaky bucket of 40 calls and answers 429 with Retry-After.',
  docs: 'https://shopify.dev/docs/api/usage/rate-limits',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, `logs:${EXPORTER}`)
    s = mark(s, `shopify:calls:${shopApp(s).id}`)
    s = change(s, EXPORTER, { props: { ...app(s, EXPORTER).props, 'export.mode': 'bulk' } })
    return runNow(s, EXPORTER, EXPORT_FLOW)
  },
  answers: { 3: 1, 4: 1, 7: 2 },
}

export const LABS = [lab]
