// The guided lab shopify-oversell. See platform-labs.js for the shape of a lab.
import { advance, at, callApi, endpointOf, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, called, change, OPS, sawLogs, until } from '../platform-kit.js'
import { API_VERSION, labStore, levelOf, SHOP, variants, WAREHOUSE } from '../platform-shopify.js'
import { STOCK, STOCK_PATH } from './shopify-oversell.pkg.js'

const APP_NAME = 'Harbor Stock Sync'
const shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name === APP_NAME)
const a = (s) => app(s, STOCK)
const running = (s) => a(s)?.status === 'Running'
const checkOn = (s) => running(s) && String(a(s).props?.['stock.staleCheck'] ?? '').trim() === 'updated_at'
const stock = (s) => a(s)?.store?.stock ?? {}
// items with a webhook still on its way are left out: the app has not had it yet
const waiting = (s) => new Set((s.shopify?.deliveries ?? []).filter((d) => d.status === 'pending').map((d) => JSON.parse(d.body).inventory_item_id))
const matches = (s) => variants(s.shopify).every((v) => waiting(s).has(v.itemId) || stock(s)[v.itemId]?.available === levelOf(s.shopify, v.itemId, WAREHOUSE)?.available)
const reconciled = (s) => checkOn(s) && (a(s).store?.reconciledAt ?? -1) >= a(s).updated
const deliveredSince = (s, t) => (s.shopify?.deliveries ?? []).filter((d) => d.status === 'delivered' && d.results.at(-1).t >= t).length

function start() {
  const now = at(1, 8)
  const probe = newApp(STOCK)
  const { y, app: shop } = labStore(now, { app: APP_NAME, scopes: ['read_inventory'], subs: [{ topic: 'inventory_levels/update', address: `${endpointOf(probe)}/api${STOCK_PATH}` }] })
  y.traffic = { every: 3, burst: 2, skus: ['H-2000', 'H-1250', 'H-2100', 'H-2000', 'H-1300'] }
  // lab-made: the store hands the deliveries of one poll newest first, so a burst arrives out of order
  y.order = 'reverse'
  const stockNow = Object.fromEntries(variants(y).map((v) => [v.itemId, { sku: v.sku, available: levelOf(y, v.itemId).available, at: levelOf(y, v.itemId).updatedAt }]))
  const s = newPlatform({
    clock: now,
    apps: [
      newApp(STOCK, {
        props: { 'shopify.shop': SHOP, 'shopify.apiVersion': API_VERSION, 'stock.staleCheck': 'none' },
        secrets: { 'shopify.accessToken': shop.token, 'shopify.apiSecret': shop.secret },
        store: { stock: stockNow, reconciledAt: at(1, 2) },
      }),
    ],
    shopify: y,
    mail: [
      {
        t: at(1, 9, 15),
        to: OPS,
        subject: 'Marketplace sold rope lanterns we do not have',
        body: `Hello. The marketplace channel kept selling the rope lantern H-2000 this morning, and now we have marketplace orders we cannot ship. The web shop says it is sold out at Harbor Warehouse. The marketplace reads its stock from ${STOCK}. Harbor ecommerce team`,
        source: 'Harbor ecommerce team',
      },
    ],
  })
  return until(s, at(1, 9, 20))
}

const lab = {
  id: 'p-shopify-oversell',
  group: 'Data and cloud',
  title: 'Oversold after out of order Shopify webhooks',
  minutes: 25,
  scenario: `${STOCK} keeps the warehouse stock that the marketplace channel sells from. It takes the inventory_levels/update webhooks of ${SHOP} and writes the available quantity of each item. On busy mornings two orders for the same product come seconds apart. Today the marketplace sold rope lanterns that Shopify had at 0. Find why the stock is wrong, fix the app and put the stock right.`,
  start,
  steps: [
    { title: 'Read the mail', how: 'Open the Inbox and read the mail of the Harbor ecommerce team.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Compare Shopify and the app',
      how: `Shopify from the console menu, Products: H-2000 has 0 available at Harbor Warehouse. API client, application ${STOCK}, GET /stock/H-2000: the app still has some.`,
      done: (s) => Boolean(s.seen['shopify:products']) && called(s, STOCK, 200, 'GET', /^\/stock\/H-2000/),
    },
    {
      title: 'Look at the deliveries',
      how: `Shopify, Apps, ${APP_NAME}, Webhooks, Deliveries. Two inventory_levels/update webhooks for the same item come 20 seconds apart. Compare X-Shopify-Triggered-At and updated_at in the bodies with the time each one was delivered: the newer one was delivered first.`,
      done: (s) => Boolean(s.seen[`shopify:webhooks:${shopApp(s)?.id}`]),
    },
    { ...sawLogs(STOCK), how: `Runtime Manager, Applications, ${STOCK}, Logs. Stock of H-2000 set to 0, then right after it set to a higher number from an update with an older updated_at.` },
    ask(
      'Why the order changed',
      'Why can an older inventory_levels/update arrive after a newer one?',
      [
        'Shopify has a bug that will be fixed',
        'Shopify does not promise the order of webhooks. Deliveries run in parallel and a failed one is retried later, so the app must decide by the data, such as updated_at, not by the time a webhook arrives',
        'The app polls too slowly',
        'The clock of the CloudHub replica is wrong',
      ],
      1,
      'Each delivery is its own HTTPS request. Two events seconds apart can be delivered in any order, and a retry after a timeout or a 5xx comes minutes or hours later. An inventory level carries updated_at, so the receiver keeps the newest value and drops anything older.',
    ),
    {
      title: 'Drop older updates',
      how: `Runtime Manager, ${STOCK}, Settings, Properties. Set stock.staleCheck to updated_at and Apply Changes. The app then compares updated_at of each webhook with the value it stored and drops an older one.`,
      done: checkOn,
    },
    ask(
      'When the webhook ID matters',
      'X-Shopify-Webhook-Id stays the same when Shopify retries a delivery. When must the app keep the IDs it processed?',
      [
        'Never, Shopify sends each webhook once',
        'When it applies changes, such as taking the quantity of each orders/create off a counter. A retry of a webhook that was processed but answered too late would count twice. For an absolute value with the updated_at check a repeat changes nothing',
        'Only for inventory_levels/update',
        'Only when the HMAC check fails',
      ],
      1,
      'Webhooks are at least once. A receiver that answers after 5 seconds gets the same webhook again even though it did the work. Idempotency on X-Shopify-Webhook-Id, kept for some days in an object store, stops a double booking. Absolute values with a version or a timestamp are idempotent by nature.',
    ),
    {
      title: 'Put the stock right',
      how: `API client, application ${STOCK}, POST /stock/reconcile. The app reads every inventory level with the Admin GraphQL API and writes the stock again. Then GET /stock/H-2000 answers 0.`,
      done: (s) => reconciled(s) && called(s, STOCK, 200, 'POST', /^\/stock\/reconcile/),
    },
    {
      title: 'Prove it holds',
      how: `Move the clock 10 minutes. More bursts of two orders come in and arrive out of order, and the Logs of ${STOCK} show Dropped an older update. Shopify, Products and GET /stock answer the same numbers.`,
      done: (s) => reconciled(s) && s.clock >= a(s).store.reconciledAt + 10 * MINUTE && deliveredSince(s, a(s).store.reconciledAt) >= 4 && matches(s),
    },
  ],
  why: 'Shopify webhooks come at least once and in no promised order: deliveries run in parallel and retries come later. A receiver that writes whatever arrives last can go back to an old value, here a stock above 0 for an item that was sold out, and a channel that reads it oversells. Decide by the data: inventory_levels/update carries updated_at, so keep the newest and drop anything older. Make changes that add or subtract idempotent on X-Shopify-Webhook-Id. And because webhooks can be lost or removed, reconcile from the Admin API on a schedule and after a fix. In the lab the store hands the deliveries of one minute newest first, to show the effect every time.',
  docs: 'https://shopify.dev/docs/apps/build/webhooks',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, 'shopify:products')
    s = callApi(s, { env: 'Sandbox', app: STOCK, method: 'GET', path: '/stock/H-2000' }).state
    s = mark(s, `shopify:webhooks:${shopApp(s).id}`)
    s = mark(s, `logs:${STOCK}`)
    s = change(s, STOCK, { props: { ...app(s, STOCK).props, 'stock.staleCheck': 'updated_at' } })
    s = callApi(s, { env: 'Sandbox', app: STOCK, method: 'POST', path: '/stock/reconcile' }).state
    return advance(s, 11 * MINUTE)
  },
  answers: { 4: 1, 6: 1 },
}

export const LABS = [lab]
