// The guided lab shopify-hmac. See platform-labs.js for the shape of a lab.
import { advance, at, endpointOf, mark, MINUTE, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until } from '../platform-kit.js'
import { labStore, SHOP } from '../platform-shopify.js'
import { RECEIVER, RECEIVER_PATH } from './shopify-hmac.pkg.js'

const APP_NAME = 'Brightmart ERP Connector'
const shopApp = (s) => (s.shopify?.apps ?? []).find((a) => a.name === APP_NAME)
const a = (s) => app(s, RECEIVER)
const running = (s) => a(s)?.status === 'Running'
const rawOk = (s) => running(s) && String(a(s).props?.['webhook.hmacInput'] ?? '').trim() === 'raw'
const secretOk = (s) => running(s) && a(s).secrets?.['shopify.webhookSecret'] === shopApp(s)?.secret && a(s).props?.['shopify.webhookSecret'] === undefined
// the fix counts from when the new config is Running: until then the replicas of the old config answer
const fixedAt = (s) => (a(s)?.status === 'Running' ? Math.max(a(s).updated ?? 0, a(s).started ?? 0) : Infinity)
// deliveries that failed before the fix and came through on a retry after it
const recovered = (s) => (s.shopify?.deliveries ?? []).filter((d) => d.status === 'delivered' && d.results.some((r) => r.code === 401) && d.results.at(-1).t > fixedAt(s))
const cleanSince = (s) => (s.shopify?.deliveries ?? []).every((d) => d.results.every((r) => r.t <= fixedAt(s) || (r.code >= 200 && r.code < 300)))

function start() {
  const now = at(1, 8)
  const receiver = newApp(RECEIVER, {
    props: { 'shopify.shop': SHOP, 'webhook.hmacInput': 'parsed' },
    store: { erp: ['#1001', '#1002', '#1003'] },
  })
  const { y, app: shop } = labStore(now, { app: APP_NAME, scopes: ['read_orders'], subs: [{ topic: 'orders/create', address: `${endpointOf(receiver)}/api${RECEIVER_PATH}` }] })
  y.nextOrder = 1004
  y.traffic = { every: 4, burst: 1 }
  // the release of last night moved the key to a plain property, and took the API key instead of the API secret key
  receiver.props['shopify.webhookSecret'] = shop.apiKey
  const s = newPlatform({
    clock: now,
    apps: [receiver],
    shopify: y,
    mail: [
      {
        t: at(1, 9, 20),
        to: OPS,
        subject: 'No web orders in the ERP since last night',
        body: `Good morning. The ERP has no web shop order after #1003. Shopify shows many new orders this morning. Last night ${RECEIVER} got a new release that moved its settings into properties. Can you look? Brightmart finance`,
        source: 'Brightmart finance',
      },
    ],
  })
  return until(s, at(1, 9, 30))
}

const lab = {
  id: 'p-shopify-hmac',
  group: 'Data and cloud',
  title: 'Shopify webhooks rejected with 401',
  minutes: 25,
  scenario: `${RECEIVER} receives the orders/create webhooks of the Brightmart web store ${SHOP} and books each order in the ERP. Since a release last night every webhook is answered with 401, so Shopify keeps retrying and no web order reaches the ERP. Find why the signature check fails, fix it, and see the retried orders arrive.`,
  start,
  steps: [
    { title: 'Read the mails', how: 'Open the Inbox. Read the mail of Brightmart finance and the warning of Shopify about the failing webhook.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Look at the deliveries',
      how: `Shopify from the console menu, Apps, ${APP_NAME}, Webhooks. The subscription for orders/create points at the app. Under Deliveries every attempt has the response 401 Unauthorized. Open one: the headers X-Shopify-Hmac-Sha256, X-Shopify-Webhook-Id, X-Shopify-Triggered-At and the raw body.`,
      done: (s) => Boolean(s.seen[`shopify:webhooks:${shopApp(s)?.id}`]),
    },
    { ...sawLogs(RECEIVER), how: `Runtime Manager, Applications, ${RECEIVER}, Logs. Each webhook is rejected with HMAC mismatch, and the line says the HMAC was computed over the parsed and written again body.` },
    ask(
      'How Shopify signs a webhook',
      'What does Shopify put in X-Shopify-Hmac-Sha256?',
      [
        'A SHA-256 hash of the order ID',
        'The base64 HMAC-SHA256 of the raw request body, with the API secret key of the app that made the subscription as the key',
        'The Admin API access token of the app',
        'A JWT signed with the private key of the store',
      ],
      1,
      'The receiver must hash the exact bytes it received, before any parsing, with the API secret key (client secret) of the app, and compare the base64 result with the header in a timing safe way. The API key and the access token are other values. Webhooks made by hand in Settings, Notifications are signed with the key shown on that page instead.',
    ),
    {
      title: 'Hash the raw body',
      how: `Runtime Manager, ${RECEIVER}, Settings, Properties. Set webhook.hmacInput to raw and Apply Changes. Parsing the JSON and writing it again changes the bytes: Shopify writes & as \\u0026 in landing_site, a parser gives back &, and the HMAC no longer matches.`,
      done: rawOk,
    },
    {
      title: 'Use the API secret key as a protected property',
      how: `Shopify, Apps, ${APP_NAME}, API credentials. Under API secret key press Reveal and copy the value that starts with shpss_. Runtime Manager, ${RECEIVER}, Settings, Properties: remove the plain shopify.webhookSecret, which holds the API key, add shopify.webhookSecret again with the API secret key and select Protect. Apply Changes.`,
      done: (s) => rawOk(s) && secretOk(s),
    },
    ask(
      'The orders of this morning',
      'About 20 orders were answered with 401 this morning. What happens to them now?',
      [
        'They are lost. Export them from Shopify by hand',
        'Shopify retries a failed delivery with growing waits and the same X-Shopify-Webhook-Id, 8 times over 4 hours. They arrive once the check passes; the webhook ID lets the app skip one it booked before',
        'Shopify sends them again only if you delete and create the subscription',
        'They arrive at once, in the order they were placed',
      ],
      1,
      'A failed delivery is retried with the same webhook ID. That is why the receiver keeps the IDs it booked: a retry of a webhook that was booked but answered too late must not book the order twice. The retries come back in their own time, so they are not in order.',
    ),
    {
      title: 'See the retries come through',
      how: `Move the clock 60 minutes. Shopify, Apps, ${APP_NAME}, Webhooks: the deliveries that had 401 now end with 200 OK on a later attempt, and new orders get 200 at once. The Logs of ${RECEIVER} show Order booked in the ERP.`,
      done: (s) => rawOk(s) && secretOk(s) && s.clock >= fixedAt(s) + 30 * MINUTE && recovered(s).length >= 3 && cleanSince(s),
    },
  ],
  why: 'Shopify signs each webhook with an HMAC-SHA256 of the raw body, keyed with the API secret key of the app that subscribed, and sends it base64 encoded in X-Shopify-Hmac-Sha256. Verify on the bytes you received, before the JSON is parsed: a parser that writes the JSON again changes escapes such as \\u0026, number formats or key order, and the HMAC fails. Use the right key, the API secret key and not the API key or the access token, keep it in a protected property, compare in a timing safe way, and answer 401 to a bad signature. Failed deliveries come back on retries with the same X-Shopify-Webhook-Id, so make booking idempotent on that ID. Shopify retries 8 times over 4 hours; fix a failing receiver within that time or the subscription is removed. In the lab the retry wait doubles from 1 minute up to 2 hours.',
  docs: 'https://shopify.dev/docs/apps/build/webhooks',
  solve(start) {
    let s = mark(start, 'inbox')
    s = mark(s, `shopify:webhooks:${shopApp(s).id}`)
    s = mark(s, `logs:${RECEIVER}`)
    const secret = shopApp(s).secret
    const { 'shopify.webhookSecret': _gone, ...props } = app(s, RECEIVER).props
    s = change(s, RECEIVER, { props: { ...props, 'webhook.hmacInput': 'raw' }, secrets: { ...app(s, RECEIVER).secrets, 'shopify.webhookSecret': secret } })
    return advance(s, 70 * MINUTE)
  },
  answers: { 3: 1, 6: 1 },
}

export const LABS = [lab]
