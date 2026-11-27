// The guided lab shopify-webhooks-removed. See platform-labs.js for the shape of a lab.
import { advance, at, callApi, endpointOf, finishDeploys, mark, MINUTE, newApp, newPlatform, setSchedule, startApp, stopApp } from '../platform.js'
import { app, ask, OPS, until } from '../platform-kit.js'
import { addressOf, API_VERSION, createSubscription, createTestOrder, labStore, SHOP } from '../platform-shopify.js'
import { RECONCILE_FLOW, SYNC, SYNC_PATH } from './shopify-webhooks-removed.pkg.js'

const APP_NAME = 'Brightmart Orders Sync'
const START = at(7, 8, 30)
const shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name === APP_NAME)
const a = (s) => app(s, SYNC)
const running = (s) => a(s)?.status === 'Running'
const sub = (s) =>
  (s.shopify?.webhooks ?? []).find((w) => {
    const to = addressOf(w.address)
    return w.app === shopApp(s)?.id && w.topic === 'orders/create' && to?.app === SYNC && to.env === 'Sandbox' && !to.internal && to.path === SYNC_PATH
  })
const have = (s) => new Set(a(s)?.store?.orders ?? [])
// orders of the store that the hub lacks, leaving out the last 2 minutes, which may still be on their way
const missing = (s) => (s.shopify?.orders ?? []).filter((o) => !o.test && o.t < s.clock - 2 * MINUTE && !have(s).has(o.name))
const reconciled = (s) => running(s) && (a(s).store?.reconciled ?? -1) >= START && missing(s).length === 0
const hourly = (s) => Boolean(a(s)?.schedules.find((x) => x.flow === RECONCILE_FLOW)?.enabled)
const proved = (s) => Boolean(sub(s)) && (s.shopify?.orders ?? []).some((o) => o.test && o.t >= sub(s).created && (a(s)?.store?.byWebhook ?? []).includes(o.name))

function start() {
  const now = at(4, 17)
  const probe = newApp(SYNC)
  const { y } = labStore(now, { app: APP_NAME, scopes: ['read_orders'], subs: [{ topic: 'orders/create', address: `${endpointOf(probe)}/api${SYNC_PATH}`, apiVersion: API_VERSION }] })
  y.traffic = { every: 30, burst: 1 }
  let s = newPlatform({
    clock: now,
    apps: [
      newApp(SYNC, {
        props: { 'shopify.shop': SHOP, 'shopify.apiVersion': API_VERSION },
        secrets: { 'shopify.accessToken': y.apps[0].token, 'shopify.apiSecret': y.apps[0].secret },
        store: { orders: [], watermark: at(4, 6) },
      }),
    ],
    shopify: y,
  })
  s = until(s, at(4, 18, 5))
  // Friday evening a change stopped the app for a weekend maintenance of the order hub, and nobody started it again
  s = stopApp(s, SYNC)
  s = until(s, at(7, 8, 10))
  s = { ...s, mail: [...s.mail, { t: at(7, 8, 10), to: OPS, subject: 'Weekend web orders missing in the order hub', body: `Good morning. The order hub has no web order since Friday 18:00, but Shopify shows orders all weekend. Warehouse picking starts at 10:00. The maintenance of the hub ended on Saturday. Brightmart fulfilment team`, source: 'Brightmart fulfilment team' }] }
  return until(s, START)
}

const lab = {
  id: 'p-shopify-webhooks-removed',
  group: 'Data and cloud',
  title: 'Shopify removed the webhooks over the weekend',
  minutes: 30,
  scenario: `${SYNC} copies each web order of ${SHOP} to the order hub as it comes in with an orders/create webhook. On Friday at 18:00 the app was stopped for a maintenance and stayed stopped. It is Monday 08:30. Shopify retried for about 4 hours and then removed the subscription. Bring the app back, subscribe again, catch up on the weekend orders, and make sure a gap like this closes by itself next time.`,
  start,
  steps: [
    { title: 'Read the mails', how: 'Open the Inbox. Shopify warned that the webhook for orders/create was failing and then that it was removed. The fulfilment team misses the weekend orders.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Find what Shopify did',
      how: `Shopify from the console menu, Apps, ${APP_NAME}, Webhooks. There is no subscription any more. Removed subscriptions names the one for orders/create, and the Deliveries end with 503 Service Unavailable.`,
      done: (s) => Boolean(s.seen[`shopify:webhooks:${shopApp(s)?.id}`]),
    },
    { title: 'Start the app', how: `Runtime Manager, Applications, ${SYNC}, Start. Wait until it is Running.`, done: running },
    {
      title: 'Subscribe again',
      how: `Shopify, Apps, ${APP_NAME}, Webhooks, Create subscription. Topic orders/create, Format JSON, API version ${API_VERSION}, and as URL the public endpoint of ${SYNC} from Runtime Manager followed by /api${SYNC_PATH}. Create.`,
      done: (s) => running(s) && Boolean(sub(s)),
    },
    ask(
      'The weekend orders',
      'Now the subscription is back. Will Shopify send the orders of the weekend?',
      [
        'Yes, Shopify keeps all failed webhooks and sends them to a new subscription',
        'No. The deliveries ended with the old subscription, and events after its removal were never queued. The app must read what it missed from the Admin API',
        'Yes, if you create the subscription with the same URL',
        'Only the last 10',
      ],
      1,
      'Webhooks are a push of what happens now. After a removal nothing is kept for later. That is why every webhook integration needs a reconciliation: read the orders updated since a watermark from the Admin API and add what is missing, using a key such as the order name or ID so nothing is booked twice.',
    ),
    {
      title: 'Catch up on the weekend',
      how: `API client, application ${SYNC}, POST /reconcile. The app reads GET orders.json with updated_at_min from its watermark, follows the Link header page by page and reads the transactions of each order it lacks. GET /orders/count then matches the orders in Shopify, Orders.`,
      done: reconciled,
    },
    ask(
      'Too many requests',
      `The Logs of ${SYNC} show that Shopify answered 429 Too Many Requests during the reconcile. What happened and what is right?`,
      [
        'Shopify blocked the app. Ask Shopify support to unblock it',
        'The REST Admin API is a leaky bucket of 40 requests that empties at 2 a second. One call per order filled it. The app waits for the seconds in Retry-After and goes on; X-Shopify-Shop-Api-Call-Limit shows how full the bucket is',
        'The access token expired',
        'The app must switch to a new API version',
      ],
      1,
      'A burst of 40 calls is fine, then the app gets 429 until the bucket leaks. Wait for Retry-After, or read X-Shopify-Shop-Api-Call-Limit and slow down before the limit. Fewer calls help most: ask for more per page, or read the transactions in the same GraphQL query.',
    ),
    {
      title: 'Turn on the hourly reconcile',
      how: `Runtime Manager, ${SYNC}, Schedules. Open the schedule of ${RECONCILE_FLOW}, which runs every 60 minutes, tick Enabled and press Update. A missed or removed webhook is then caught within an hour, without a person.`,
      done: hourly,
    },
    {
      title: 'Prove the webhook path',
      how: `Shopify, Orders, Create test order. Move the clock 2 minutes. In Apps, ${APP_NAME}, Webhooks, Deliveries the new orders/create has 200 OK, and the Logs of ${SYNC} show the order sent to the order hub.`,
      done: (s) => running(s) && proved(s),
    },
  ],
  why: 'Shopify retries a failed webhook 8 times over 4 hours. After 8 failures in a row it removes a subscription made with the Admin API, after mails to the app developer. Nothing is kept for later, so events after the removal are gone. Monitor the endpoint, create the subscription again once it answers 200, and always run a reconciliation beside the webhooks: read the orders updated since a watermark from the Admin API on a schedule and add what is missing, idempotent on the order. The REST Admin API is a leaky bucket of 40 requests, leaking 2 a second; on 429 wait for Retry-After. In the lab the retry wait doubles from 1 minute up to 2 hours.',
  docs: 'https://shopify.dev/docs/apps/build/webhooks',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, `shopify:webhooks:${shopApp(s).id}`)
    s = finishDeploys(startApp(s, SYNC))
    s = createSubscription(s, shopApp(s).id, { topic: 'orders/create', address: `${endpointOf(app(s, SYNC))}/api${SYNC_PATH}`, format: 'json', apiVersion: API_VERSION }).state
    s = callApi(s, { env: 'Sandbox', app: SYNC, method: 'POST', path: '/reconcile' }).state
    s = setSchedule(s, SYNC, RECONCILE_FLOW, { enabled: true })
    s = createTestOrder(s, { sku: 'H-2100', qty: 1 }).state
    return advance(s, 2 * MINUTE)
  },
  answers: { 4: 1, 6: 1 },
}

export const LABS = [lab]
