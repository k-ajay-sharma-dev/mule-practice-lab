// The guided lab shopify-setup. See platform-labs.js for the shape of a lab.
import { addMonAlert, advance, at, callApi, deployApp, endpointOf, finishDeploys, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, called, OPS, until } from '../platform-kit.js'
import { addressOf, API_VERSION, createApp, createSubscription, createTestOrder, installApp, newShopifyStore, revealToken, saveScopes, SHOP } from '../platform-shopify.js'
import { BRIDGE, BRIDGE_JAR, BRIDGE_PATH, ORDER_API } from './shopify-setup.pkg.js'

const APP_NAME = 'Harbor Order Bridge'
const QUEUE = 'shopify-orders'
const ALERT_TO = 'ecommerce-integration@harbor.example'
const shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name.toLowerCase() === APP_NAME.toLowerCase())
const b = (s) => app(s, BRIDGE)
const running = (s) => b(s)?.status === 'Running'
const prop = (s, k) => String(b(s)?.props?.[k] ?? '').trim()
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((x) => list.includes(x))
const installed = (s) => Boolean(shopApp(s)?.installed) && sameSet(shopApp(s).granted, ['read_orders'])
const deployedOk = (s) => {
  const x = shopApp(s)
  const sec = b(s)?.secrets ?? {}
  return (
    installed(s) &&
    running(s) &&
    prop(s, 'shopify.shop') === SHOP &&
    prop(s, 'shopify.apiVersion') === API_VERSION &&
    prop(s, 'orders.queue') === QUEUE &&
    sec['shopify.accessToken'] === x.token &&
    sec['shopify.apiSecret'] === x.secret &&
    b(s).props['shopify.accessToken'] === undefined &&
    b(s).props['shopify.apiSecret'] === undefined
  )
}
const sub = (s) =>
  (s.shopify?.webhooks ?? []).find((w) => {
    const to = addressOf(w.address)
    return w.app === shopApp(s)?.id && w.topic === 'orders/create' && to?.app === BRIDGE && to.env === 'Sandbox' && !to.internal && to.path === BRIDGE_PATH
  })
const arrived = (s) => {
  const got = new Set((app(s, ORDER_API)?.store?.orders ?? []).map((o) => o.order))
  return Boolean(sub(s)) && (s.shopify?.orders ?? []).some((o) => o.t >= sub(s).created && got.has(o.name))
}

const MAIL = {
  t: at(1, 8, 45),
  to: OPS,
  subject: 'Web orders into the order API, in real time',
  body: [
    'Hello integration team,',
    `From next week the warehouse wants each web order of our Shopify store ${SHOP} in the Harbor order API within a minute, instead of the export at night. The app ${BRIDGE} is built and waits in Runtime Manager.`,
    `1. A custom app in Shopify named ${APP_NAME}. It only reads orders, so give it that and nothing more.`,
    `2. The Admin API access token and the API secret key are secrets. They never go in a plain property.`,
    `3. A webhook subscription for orders/create to the app, JSON, API version ${API_VERSION}. The app listens on /api${BRIDGE_PATH} and puts each order on the queue ${QUEUE}, which ${ORDER_API} reads.`,
    '4. Prove it with a test order, and prove that a forged webhook is refused.',
    `5. Failures alert ${ALERT_TO}.`,
    'Harbor ecommerce team',
  ].join('\n\n'),
  source: 'Harbor ecommerce team',
}

const lab = {
  id: 'p-shopify-setup',
  group: 'Data and cloud',
  title: 'Set up the Shopify order webhooks into the order API',
  minutes: 35,
  scenario: `Harbor wants each web order of ${SHOP} in its order API within a minute. ${BRIDGE} is built and its jar is in Runtime Manager, and ${ORDER_API} already reads the queue ${QUEUE}. Nothing is set up on the Shopify side: no custom app, no token, no webhook. Done means a test order reaches the order API, a forged webhook gets 401, and failures raise an alert. The Inbox has the request.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8, 50),
      jars: [{ pkg: BRIDGE, jar: BRIDGE_JAR }],
      apps: [newApp(ORDER_API, { props: { 'mq.queue': QUEUE }, store: { orders: [] } })],
      queues: [{ name: QUEUE, type: 'Standard queue', dlq: '', messages: [] }],
      shopify: newShopifyStore(at(1, 8, 50), { nextOrder: 2101 }),
      mail: [MAIL],
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox and read the mail of the Harbor ecommerce team. Note the app name, the scope, the topic, the path, the queue and who gets the alerts.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the custom app',
      how: `Shopify from the console menu, Apps, Develop apps, Create an app. App name ${APP_NAME}, App developer ${OPS}. Create app.`,
      done: (s) => Boolean(shopApp(s)),
    },
    ask(
      'Least privilege',
      'Which Admin API access scopes does the bridge need?',
      [
        'All of them, so later features work without a new install',
        'write_orders, because write includes read',
        'read_orders only. The bridge reads orders with the Admin API and orders/create needs read_orders. A leaked token can then read orders and nothing else',
        'read_orders and read_customers, because orders have an email',
      ],
      2,
      'Each scope is something a leaked token can do. The orders/create topic needs read_orders, and the health check reads the shop, which every app may. write_orders would let the token change and cancel orders. Ask for more scopes when a feature needs them; the app is installed again to grant them.',
    ),
    {
      title: 'Grant read_orders and install',
      how: `Apps, ${APP_NAME}, Configuration. Under Admin API access scopes tick read_orders only and Save. Then API credentials, Install app. The store grants the scopes and makes the Admin API access token.`,
      done: installed,
    },
    {
      title: 'Deploy with the secrets protected',
      how: `Apps, ${APP_NAME}, API credentials: press Reveal token once and copy the shpat_ token, it is shown a single time. Copy the API secret key too. Runtime Manager, Deploy application, name ${BRIDGE}, file ${BRIDGE_JAR}. Properties: shopify.shop ${SHOP}, shopify.apiVersion ${API_VERSION}, orders.queue ${QUEUE}. Add shopify.accessToken and shopify.apiSecret and select Protect for both. Deploy and wait for Running.`,
      done: deployedOk,
    },
    {
      title: 'Test the connection',
      how: `API client, application ${BRIDGE}, GET /health. The app runs { shop { name } } against the Admin GraphQL API with the token and answers UP with ${SHOP}. A 502 names the problem: a wrong shop, token or version.`,
      done: (s) => deployedOk(s) && called(s, BRIDGE, 200, 'GET', /^\/health/) && (s.lastCalls ?? []).some((c) => c.app === BRIDGE && c.status === 200 && c.path.startsWith('/health') && c.t >= b(s).updated),
    },
    {
      title: 'Subscribe to orders/create',
      how: `Shopify, Apps, ${APP_NAME}, Webhooks, Create subscription. Topic orders/create, Format JSON, API version ${API_VERSION}, URL the public endpoint of ${BRIDGE} from Runtime Manager followed by /api${BRIDGE_PATH}. Create. The store signs these webhooks with the API secret key of the app.`,
      done: (s) => deployedOk(s) && Boolean(sub(s)),
    },
    {
      title: 'Send a test order end to end',
      how: `Shopify, Orders, Create test order, for example H-1250 quantity 1. Move the clock 2 minutes. Apps, ${APP_NAME}, Webhooks, Deliveries shows 200 OK. API client, application ${ORDER_API}, GET /orders lists the order.`,
      done: (s) => deployedOk(s) && arrived(s),
    },
    {
      title: 'Refuse a forged webhook',
      how: `API client, application ${BRIDGE}, POST ${BRIDGE_PATH} with a body such as {"name":"#9999"} and Add header X-Shopify-Hmac-Sha256 with any value, such as forged. The app answers 401 and nothing goes on the queue.`,
      done: (s) => deployedOk(s) && called(s, BRIDGE, 401, 'POST', /^\/webhooks\/shopify/),
    },
    {
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${BRIDGE}, metric Message Error Count, Above 0 for 1 minute, recipient ${ALERT_TO}. A run that rejects or fails a webhook counts as an error.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.name_ === BRIDGE && x.metric === 'Message Error Count' && ['Above', 'Above or equal to'].includes(x.operator) && Number(x.threshold) <= 1 && String(x.recipients ?? '').includes(ALERT_TO)),
    },
    ask(
      'Answer fast',
      'Why does the bridge put the order on a queue and answer 200 at once, instead of calling the order API before it answers?',
      [
        'Queues are cheaper than HTTP calls',
        'Shopify waits 5 seconds for a 2xx. A slow order API would make deliveries time out, Shopify would retry them, and after 8 failures in a row over 4 hours it removes the subscription. Answer after the HMAC check, do the work behind a queue, and keep a reconcile for anything missed',
        'Shopify needs the answer 202',
        'The order API cannot take JSON',
      ],
      1,
      'A webhook receiver checks the signature, stores the event and answers. The queue gives retries and a dead letter queue on the Mule side, and the order API can be down for a while without Shopify seeing failures. A timeout that did the work still gets a retry, so the order API skips an order it has.',
    ),
  ],
  why: 'A Shopify integration starts with a custom app: Develop apps, Create an app, only the scopes it needs (read_orders here), Install app. The Admin API access token is shown once and the API secret key signs the webhooks: both go into protected properties. Deploy, test the connection with a cheap Admin API query, then create the webhook subscription for orders/create to the public HTTPS endpoint of the app, in JSON and a pinned API version. Prove it end to end with a test order that reaches the order API, and prove the HMAC check with a forged webhook that gets 401. Answer within 5 seconds and do the work behind a queue, alert on errors, and plan a reconcile from the Admin API for what webhooks miss. In the lab the app takes its webhooks once a lab minute.',
  docs: 'https://help.shopify.com/en/manual/apps/app-types/custom-apps',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createApp(s, { name: APP_NAME, developer: OPS }).state
    const id = shopApp(s).id
    s = saveScopes(s, id, ['read_orders']).state
    s = installApp(s, id).state
    const r = revealToken(s, id)
    s = r.state
    const form = { name: BRIDGE, pkg: BRIDGE, jar: BRIDGE_JAR, replicas: 1, vCores: 0.1, props: { 'shopify.shop': SHOP, 'shopify.apiVersion': API_VERSION, 'orders.queue': QUEUE }, secrets: { 'shopify.accessToken': r.result, 'shopify.apiSecret': shopApp(s).secret } }
    s = finishDeploys(deployApp(s, form).state)
    s = callApi(s, { env: 'Sandbox', app: BRIDGE, method: 'GET', path: '/health' }).state
    s = createSubscription(s, id, { topic: 'orders/create', address: `${endpointOf(app(s, BRIDGE))}/api${BRIDGE_PATH}`, format: 'json', apiVersion: API_VERSION }).state
    s = createTestOrder(s, { sku: 'H-1250', qty: 1 }).state
    s = advance(s, 2 * MINUTE)
    s = callApi(s, { env: 'Sandbox', app: BRIDGE, method: 'POST', path: BRIDGE_PATH, body: '{"name":"#9999"}', headers: [['X-Shopify-Hmac-Sha256', 'forged']] }).state
    return addMonAlert(s, { title: 'Shopify bridge errors', resource: 'Application', name_: BRIDGE, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERT_TO })
  },
  answers: { 2: 2, 10: 1 },
}

export const LABS = [lab]
