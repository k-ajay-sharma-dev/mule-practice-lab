// Shopify: the Brightmart web store brightmart-goods.myshopify.com. Products and variants, inventory items and levels per location,
// orders and fulfillments, custom apps (Admin API access token, access scopes, API key and API secret key), webhook
// subscriptions and their deliveries, the Admin GraphQL API with query cost and throttling, and the REST Admin API with
// its leaky bucket. Pure and import free. Lives in state.shopify.
//
// State shape (state.shopify, once filled; the open console seeds only { created } and fillShopify builds the rest):
//   shop, name, apiVersion, notifyKey (signs the webhooks made in Settings, Notifications),
//   locations: [{ id, name }],
//   products: [{ id, title, handle, status, variants: [{ id, sku, title, price, itemId }] }],
//   levels: [{ itemId, locationId, available, updatedAt }],
//   orders: [{ id, name, email, t, updatedAt, financial, fulfillment, total, test, lines: [{ id, sku, title, qty, price, variantId }], fulfillments: [{ id, t, status }] }],
//   archived: { count, from, to } (older orders kept as a count; their records are made on demand, lab-made)
//   apps: [{ id, name, developer, created, scopes, granted, installed, token, tokenShown, apiKey, secret }],
//   webhooks: [{ id, app (an app id, or 'admin'), topic, address, format, apiVersion, created, fails, failingSince, warned }],
//   deliveries: [{ id, sub, app, topic, address, body, hmac, at, due, attempts, status, results: [{ t, code, ms, text }] }],
//   buckets: { [appId]: { gql: [available, t], rest: [used, t] } },
//   bulk: { [appId]: { id, status, query, root, created, done, count, url } },
//   calls: [{ t, app, kind, text, status, cost }], traffic: null or { every, burst, skus }, order: 'time' or 'reverse',
//   n (counter), nextOrder
//
// ctx.shopify (see shopifyCtx). cfg is { shop, accessToken, apiVersion }.
//   graphql(cfg, query, vars)      Admin GraphQL API. Returns { ok, status, ms, body: { data, errors, extensions: { cost } } }.
//                                  THROTTLED and MAX_COST_EXCEEDED come back with HTTP 200 and an errors list, as in Shopify.
//   rest(cfg, method, path, body)  REST Admin API, such as GET /admin/api/2026-10/orders.json?limit=50. Returns
//                                  { ok, status, ms, body, headers } with X-Shopify-Shop-Api-Call-Limit, or 429 with Retry-After.
//   download(url)                  the JSONL file of a finished bulk operation.
//   webhooks(listener, receive)    the deliveries Shopify has for the app's HTTPS listener, { paths: ['/webhooks/orders'] }.
//                                  receive({ id, topic, headers, body, attempt }) answers { status, ms } as the listener would.
//   wait(ms), elapsed()            time inside one run of a flow: calls and waits move it, the bucket restores with it.
// Lab-made: Shopify pushes each webhook as an HTTPS POST. In the lab the app's flow takes its deliveries once a lab
// minute through ctx.shopify.webhooks and answers each one as its HTTP listener would. The HMAC is a real HMAC-SHA256.

export const SHOP = 'brightmart-goods.myshopify.com'
export const SHOP_NAME = 'Brightmart Goods'
export const API_VERSION = '2026-10'
export const API_VERSIONS = ['2026-01', '2026-04', '2026-07', '2026-10']
export const OWNER = 'ops@brightmart.example'
export const WAREHOUSE = 71001
export const PIER = 71002
export const SCOPES = ['read_orders', 'write_orders', 'read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_fulfillments', 'write_fulfillments', 'read_customers', 'write_customers', 'read_locations']
// the scope a webhook topic needs
export const TOPICS = { 'orders/create': 'read_orders', 'orders/updated': 'read_orders', 'orders/fulfilled': 'read_orders', 'inventory_levels/update': 'read_inventory', 'products/update': 'read_products' }
export const topicEnum = (t) => String(t).toUpperCase().replace(/\//g, '_')
const topicOf = (v) => Object.keys(TOPICS).find((t) => t === String(v ?? '').trim().toLowerCase() || topicEnum(t) === String(v ?? '').trim()) ?? null
// Shopify waits 5 seconds for a 2xx answer
export const WEBHOOK_TIMEOUT = 5000
// The GraphQL bucket of the Standard plan: 2000 points, 100 restored each second, at most 1000 for one query
export const GQL = { max: 2000, restore: 100, single: 1000 }
// The REST bucket: 40 requests, 2 leak out each second
export const REST = { size: 40, leak: 2 }
const MINUTE = 60000
const HOUR = 60 * MINUTE
// Shopify retries a failed delivery 8 times over the next 4 hours. After 8 consecutive failures it deletes a
// subscription made with the Admin API (the rule before 2024 was 19 tries over 48 hours). Lab-made: the subscription
// goes once it has failed for 4 hours with at least 8 tries, and the retry waits double from 1 minute up to 2 hours,
// so 8 retries take about 4 hours. A delivery with no try left is dropped.
export const REMOVE_AFTER = 4 * HOUR
const REMOVE_TRIES = 8
const BACKOFF = (n) => Math.min(2 ** (n - 1), 120) * MINUTE
// lab-made limits, so a saved console stays small
const MAX_DELIVERIES = 60
const MAX_ORDERS = 220
const MAX_CALLS = 30
// lab-made latency of one Admin API call
const GQL_MS = 350
const THROTTLED_MS = 80
const REST_MS = 120

// ---------- time and ids ----------

// the lab clock starts on Monday 2 November 2026, as in platform.js
const BASE = Date.UTC(2026, 10, 2)
export const iso = (t) => new Date(BASE + t).toISOString().replace(/\.\d{3}Z$/, '+00:00')
export const fromIso = (text) => {
  const v = Date.parse(String(text ?? ''))
  return Number.isNaN(v) ? null : v - BASE
}
const hexOf = (seed, n = 32) => {
  let h = 2166136261
  let out = ''
  for (let i = 0; out.length < n; i++) {
    for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
    out += h.toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
const uuid = (seed) => {
  const h = hexOf(seed, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const next = (y) => (y.n = (y.n ?? 1) + 1)
export const gid = (type, id) => `gid://shopify/${type}/${id}`
const idOfGid = (v) => Number(String(v ?? '').split('/').pop().split('?')[0])
const push = (list, item, max) => {
  list.push(item)
  if (list.length > max) list.splice(0, list.length - max)
}
const word = (v) => String(v ?? '').trim()
const money = (n) => (Math.round(n * 100) / 100).toFixed(2)

// ---------- SHA-256, HMAC and base64 ----------

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
const utf8 = (text) => new TextEncoder().encode(String(text ?? ''))
function sha256(bytes) {
  const len = bytes.length
  const total = Math.ceil((len + 9) / 64) * 64
  const m = new Uint8Array(total)
  m.set(bytes)
  m[len] = 0x80
  const bits = len * 8
  const view = new DataView(m.buffer)
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32))
  view.setUint32(total - 4, bits >>> 0)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Uint32Array(64)
  const rot = (x, n) => (x >>> n) | (x << (32 - n))
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, k] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      k = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    ;[a, b, c, d, e, f, g, k].forEach((x, i) => (h[i] = (h[i] + x) >>> 0))
  }
  const out = new Uint8Array(32)
  const ov = new DataView(out.buffer)
  h.forEach((x, i) => ov.setUint32(i * 4, x))
  return out
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function base64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}
// HMAC-SHA256 of a text with a key, as base64: the value of X-Shopify-Hmac-Sha256
export function hmacBase64(key, text) {
  let k = utf8(key)
  if (k.length > 64) k = sha256(k)
  const ipad = new Uint8Array(64)
  const opad = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    ipad[i] = (k[i] ?? 0) ^ 0x36
    opad[i] = (k[i] ?? 0) ^ 0x5c
  }
  const msg = utf8(text)
  const inner = new Uint8Array(64 + msg.length)
  inner.set(ipad)
  inner.set(msg, 64)
  const outer = new Uint8Array(96)
  outer.set(opad)
  outer.set(sha256(inner), 64)
  return base64(sha256(outer))
}
// compares two texts in a time that does not depend on where they differ
export function safeEqual(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0)
  return diff === 0
}
// What a webhook receiver checks: the HMAC of the raw body with the secret, against the header
export const verifyWebhook = (secret, rawBody, header) => Boolean(secret) && safeEqual(hmacBase64(secret, rawBody), header)
export const headerOf = (headers, name) => (headers ?? []).find(([k]) => String(k).toLowerCase() === name.toLowerCase())?.[1] ?? ''
// Shopify writes its JSON with &, < and > escaped as &, < and >. Parsing and writing it again gives other bytes.
export const shopifyJson = (v) => JSON.stringify(v).replace(/[&<>]/g, (c) => `\\u00${c.charCodeAt(0).toString(16)}`)

// ---------- the store ----------

const PRODUCTS = [
  ['H-1250', 'Brightmart deck chair', 89, 240, 6],
  ['H-1300', 'Brightmart folding table', 129, 85, 2],
  ['H-2000', 'Rope lantern', 19.5, 12, 4],
  ['H-2100', 'Canvas tote', 24, 160, 20],
]
export function newShopifyStore(now = 0, extra = {}) {
  return {
    created: now,
    shop: SHOP,
    name: SHOP_NAME,
    apiVersion: API_VERSION,
    notifyKey: hexOf('brightmart-notify-lab', 64),
    locations: [
      { id: WAREHOUSE, name: 'Brightmart Warehouse' },
      { id: PIER, name: 'Pier Store' },
    ],
    products: PRODUCTS.map(([sku, title, price], i) => ({ id: 8800100 + i, title, handle: title.toLowerCase().replace(/\s+/g, '-'), status: 'active', variants: [{ id: 45001000 + i, sku, title: 'Default Title', price, itemId: 47002000 + i }] })),
    levels: PRODUCTS.flatMap(([, , , wh, pier], i) => [
      { itemId: 47002000 + i, locationId: WAREHOUSE, available: wh, updatedAt: now - 10 * HOUR },
      { itemId: 47002000 + i, locationId: PIER, available: pier, updatedAt: now - 10 * HOUR },
    ]),
    orders: [],
    archived: { count: 0, from: now, to: now },
    apps: [],
    webhooks: [],
    deliveries: [],
    buckets: {},
    bulk: {},
    calls: [],
    traffic: null,
    order: 'time',
    n: 1,
    nextOrder: 1001,
    ...extra,
  }
}
const STORE_KEYS = Object.keys(newShopifyStore())
export const isFilled = (y) => Boolean(y?.shop)
export function fillShopify(y) {
  if (!y) return newShopifyStore(0)
  if (!y.shop) {
    const base = newShopifyStore(y.created ?? 0)
    for (const k of Object.keys(base)) y[k] ??= base[k]
    return y
  }
  if (STORE_KEYS.some((k) => y[k] === undefined)) {
    const base = newShopifyStore(y.created ?? 0)
    for (const k of STORE_KEYS) y[k] ??= base[k]
  }
  return y
}

// ---------- lookups ----------

export const variants = (y) => (y?.products ?? []).flatMap((p) => p.variants.map((v) => ({ ...v, product: p })))
export const variantOfSku = (y, sku) => variants(y).find((v) => v.sku === sku)
export const variantOfItem = (y, itemId) => variants(y).find((v) => v.itemId === Number(itemId))
export const levelOf = (y, itemId, locationId = WAREHOUSE) => (y?.levels ?? []).find((l) => l.itemId === Number(itemId) && l.locationId === Number(locationId))
export const availableOf = (y, sku, locationId = WAREHOUSE) => levelOf(y, variantOfSku(y, sku)?.itemId, locationId)?.available ?? 0
export const appOf = (y, id) => (y?.apps ?? []).find((a) => a.id === id || a.name === id)
export const subsOf = (y, appId) => (y?.webhooks ?? []).filter((w) => w.app === appId)
export const orderNamed = (y, name) => (y?.orders ?? []).find((o) => o.name === name || o.id === Number(name))
export const secretOfSub = (y, sub) => (sub.app === 'admin' ? y.notifyKey : appOf(y, sub.app)?.secret ?? '')
export const totalOrders = (y) => (y?.archived?.count ?? 0) + (y?.orders?.length ?? 0)

// The orders before the lab, kept as a count. Their records are made on demand from their number (lab-made).
export function archivedOrder(y, i) {
  const a = y.archived
  const t = a.from + Math.floor(((a.to - a.from) * i) / Math.max(1, a.count))
  const lines = Array.from({ length: (i % 3) + 1 }, (_, j) => {
    const [sku, title, price] = PRODUCTS[(i + j) % PRODUCTS.length]
    return { id: 13900000 + i * 4 + j, sku, title, qty: 1 + ((i + j) % 2), price, variantId: variantOfSku(y, sku)?.id }
  })
  return { id: 5801000000 + i, name: `#${1001 + i}`, email: `customer${(i * 37) % 900}@mail.example`, t, updatedAt: t, financial: 'paid', fulfillment: 'fulfilled', total: lines.reduce((n, l) => n + l.qty * l.price, 0), test: false, lines, fulfillments: [] }
}
const ordersAll = (y) => [...Array.from({ length: y.archived?.count ?? 0 }, (_, i) => i), ...y.orders]
const orderRec = (y, x) => (typeof x === 'number' ? archivedOrder(y, x) : x)

// ---------- payloads ----------

const orderPayload = (y, o) => ({
  id: o.id,
  admin_graphql_api_id: gid('Order', o.id),
  name: o.name,
  order_number: Number(o.name.slice(1)),
  email: o.email,
  created_at: iso(o.t),
  updated_at: iso(o.updatedAt),
  currency: 'EUR',
  total_price: money(o.total),
  financial_status: o.financial,
  fulfillment_status: o.fulfillment,
  test: o.test,
  source_name: 'web',
  landing_site: '/products/rope-lantern?utm_source=newsletter&utm_medium=email',
  note: o.note ?? null,
  line_items: o.lines.map((l) => ({ id: l.id, variant_id: l.variantId, sku: l.sku, title: l.title, quantity: l.qty, price: money(l.price) })),
  fulfillments: o.fulfillments.map((f) => ({ id: f.id, status: f.status, created_at: iso(f.t) })),
})
const levelPayload = (l) => ({ inventory_item_id: l.itemId, location_id: l.locationId, available: l.available, updated_at: iso(l.updatedAt), admin_graphql_api_id: `${gid('InventoryLevel', l.locationId * 1000 + (l.itemId % 1000))}?inventory_item_id=${l.itemId}` })
export const restOrder = (y, o) => orderPayload(y, o)

// ---------- webhooks: subscriptions and deliveries ----------

// The app and environment an address points at: https://<app>-lab1a2.<sbx|prd>.<region>.cloudhub.example/api/<path>
export function addressOf(address) {
  const m = String(address ?? '').match(/^https:\/\/([a-z0-9-]+)-lab1a2\.(internal-)?(sbx|prd)\.[a-z0-9.-]+?(\/[^?#]*)?(?:[?#].*)?$/i)
  if (!m) return null
  return { app: m[1], internal: Boolean(m[2]), env: m[3] === 'prd' ? 'Production' : 'Sandbox', path: (m[4] ?? '/').replace(/^\/api(?=\/)/, '') }
}
export function subscriptionError(y, appId, { topic, address, format = 'json' }) {
  const t = topicOf(topic)
  const url = word(address)
  if (!t) return `Topic ${word(topic) || '(empty)'} is not a valid webhook topic` // lab-made wording
  if (!url) return "Address can't be blank"
  if (/^http:\/\//i.test(url)) return 'Address protocol http:// is not supported'
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url)) return 'Address is invalid'
  if (String(format).toLowerCase() !== 'json') return 'The lab sends JSON webhooks only' // lab-made
  if (appId !== 'admin') {
    const a = appOf(y, appId)
    if (!a?.installed) return 'The app is not installed on this store' // lab-made wording
    if (!a.granted.includes(TOPICS[t]) && !(TOPICS[t].startsWith('read_') && a.granted.includes(TOPICS[t].replace('read_', 'write_')))) return `Access denied for topic ${t}. Required access: ${TOPICS[t]} access scope.` // lab-made wording
  }
  if (y.webhooks.some((w) => w.app === appId && w.topic === t && w.address === url)) return 'Address for this topic has already been taken'
  return null
}
function addSubscription(y, appId, { topic, address, apiVersion }, now) {
  const w = { id: 1300100 + next(y), app: appId, topic: topicOf(topic), address: word(address), format: 'json', apiVersion: API_VERSIONS.includes(apiVersion) ? apiVersion : API_VERSION, created: now, fails: 0, failingSince: null, warned: false }
  y.webhooks.push(w)
  return w
}
const deliveryHeaders = (y, d) => [
  ['Content-Type', 'application/json'],
  ['X-Shopify-Topic', d.topic],
  ['X-Shopify-Hmac-Sha256', d.hmac],
  ['X-Shopify-Shop-Domain', y.shop],
  ['X-Shopify-API-Version', y.webhooks.find((w) => w.id === d.sub)?.apiVersion ?? API_VERSION],
  ['X-Shopify-Webhook-Id', d.id],
  ['X-Shopify-Triggered-At', iso(d.at)],
]
export const headersOf = deliveryHeaders
function trimDeliveries(y) {
  while (y.deliveries.length > MAX_DELIVERIES) {
    const i = y.deliveries.findIndex((d) => d.status !== 'pending')
    y.deliveries.splice(i < 0 ? 0 : i, 1)
  }
}
// an event happened in the store: one delivery for each subscription to its topic
function emit(y, topic, payload, now) {
  const body = shopifyJson(payload)
  for (const w of y.webhooks.filter((x) => x.topic === topic)) {
    const id = uuid(`${w.id}:${next(y)}:${now}`)
    y.deliveries.push({ id, sub: w.id, app: w.app, topic, address: w.address, body, hmac: hmacBase64(secretOfSub(y, w), body), at: now, due: now, attempts: 0, status: 'pending', results: [] })
  }
  trimDeliveries(y)
}
const mailTo = (s, to, subject, body) => {
  if (!s?.mail || !to) return
  s.mail.push({ t: s.clock ?? 0, to, subject, body, source: 'Shopify' })
  if (s.mail.length > 40) s.mail.shift()
}
// one try of a delivery ended. A failure counts for its subscription; after 4 hours of failures Shopify removes it.
function settle(s, y, d, code, ms, text, now) {
  d.attempts++
  d.results = [...d.results, { t: now, code, ms, text }].slice(-4)
  const w = y.webhooks.find((x) => x.id === d.sub)
  if (code >= 200 && code < 300) {
    d.status = 'delivered'
    if (w) Object.assign(w, { fails: 0, failingSince: null, warned: false })
    return
  }
  d.due = now + BACKOFF(d.attempts)
  // the first try and 8 retries: then Shopify stops trying this delivery
  if (!w || d.attempts > REMOVE_TRIES) d.status = 'removed'
  if (!w) return
  w.fails++
  w.failingSince ??= now
  const contact = w.app === 'admin' ? OWNER : appOf(y, w.app)?.developer
  if (!w.warned && w.fails >= 3) {
    w.warned = true
    mailTo(s, contact, `Your webhook for ${w.topic} is failing`, `Shopify could not deliver webhooks for ${w.topic} to ${w.address} on ${y.shop}. The last answer was: ${text}. Shopify retries a failed delivery 8 times over 4 hours. If deliveries keep failing, the webhook subscription is removed. Shopify`)
  }
  if (now - w.failingSince >= REMOVE_AFTER && w.fails >= REMOVE_TRIES) {
    y.webhooks = y.webhooks.filter((x) => x !== w)
    for (const x of y.deliveries.filter((z) => z.sub === w.id && z.status === 'pending')) x.status = 'removed'
    y.removed = [...(y.removed ?? []), { id: w.id, app: w.app, topic: w.topic, address: w.address, t: now, fails: w.fails }].slice(-6)
    mailTo(s, contact, `Webhook subscription for ${w.topic} removed`, `Shopify removed the webhook subscription for ${w.topic} to ${w.address} on ${y.shop} after 8 consecutive failed deliveries over 4 hours. Events since then were not sent. Create the subscription again once the endpoint answers with 200, and read what you missed from the Admin API. Shopify`)
  }
}

// ---------- store actions ----------

function webOrder(y, lines, now, { email, test = false, note } = {}) {
  const ok = []
  for (const l of lines) {
    const v = variantOfSku(y, l.sku)
    const lv = v && levelOf(y, v.itemId, WAREHOUSE)
    const qty = Math.max(1, Math.floor(Number(l.qty) || 1))
    // the products deny selling when out of stock
    if (!v || !lv || lv.available < qty) continue
    ok.push({ v, lv, qty })
  }
  if (!ok.length) return null
  const n = y.nextOrder++
  const o = {
    id: 5801000000 + n - 1001 + 50000,
    name: `#${n}`,
    email: email || `customer${(n * 37) % 900}@mail.example`,
    t: now,
    updatedAt: now,
    financial: 'paid',
    fulfillment: null,
    total: ok.reduce((k, x) => k + x.qty * x.v.price, 0),
    test,
    ...(note && { note }),
    lines: ok.map((x, j) => ({ id: 13950000 + n * 4 + j, sku: x.v.sku, title: x.v.product.title, qty: x.qty, price: x.v.price, variantId: x.v.id })),
    fulfillments: [],
  }
  y.orders.push(o)
  if (y.orders.length > MAX_ORDERS) y.orders.splice(0, y.orders.length - MAX_ORDERS)
  emit(y, 'orders/create', orderPayload(y, o), now)
  for (const x of ok) {
    x.lv.available -= x.qty
    x.lv.updatedAt = now
    emit(y, 'inventory_levels/update', levelPayload(x.lv), now)
  }
  return o
}

// ---------- the Admin API: auth, scopes, buckets ----------

const callLog = (y, now, app, kind, text, status, cost) => push(y.calls, { t: now, app, kind, text: String(text).slice(0, 160), status, ...(cost !== undefined && { cost }) }, MAX_CALLS)
const shopOk = (cfg) => word(cfg?.shop).replace(/^https:\/\//, '').replace(/\/$/, '').toLowerCase() === SHOP
const appByToken = (y, token) => (word(token) ? y.apps.find((a) => a.installed && a.token === word(token)) : null)
const hasScope = (a, scope) => a.granted.includes(scope) || (scope.startsWith('read_') && a.granted.includes(scope.replace('read_', 'write_')))
const INVALID_TOKEN = '[API] Invalid API key or access token (unrecognized login or wrong password)'
function gqlBucket(y, a, t) {
  const b = (y.buckets[a.id] ??= {})
  const [avail, at] = b.gql ?? [GQL.max, t]
  const now = Math.min(GQL.max, avail + ((t - at) / 1000) * GQL.restore)
  return { avail: now, set: (v) => (b.gql = [Math.round(v * 10) / 10, t]) }
}
function restBucket(y, a, t) {
  const b = (y.buckets[a.id] ??= {})
  const [used, at] = b.rest ?? [0, t]
  const now = Math.max(0, used - ((t - at) / 1000) * REST.leak)
  return { used: now, set: (v) => (b.rest = [Math.round(v * 100) / 100, t]) }
}
// the throttle status of an app now, for the screen
export const throttleOf = (y, appId, t) => {
  const a = appOf(y, appId)
  if (!a) return null
  const [avail, at] = y.buckets?.[a.id]?.gql ?? [GQL.max, t]
  return { maximumAvailable: GQL.max, currentlyAvailable: Math.floor(Math.min(GQL.max, avail + ((t - at) / 1000) * GQL.restore)), restoreRate: GQL.restore }
}

// ---------- GraphQL: a small parser ----------

class GqlError extends Error {}
export function parseGraphql(src, vars = {}) {
  const s = String(src ?? '')
  let i = 0
  const ws = () => {
    while (i < s.length) {
      const c = s[i]
      if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === ',' || c === '﻿') i++
      else if (c === '#') while (i < s.length && s[i] !== '\n') i++
      else break
    }
  }
  const fail = () => {
    throw new GqlError(`Parse error on "${s.slice(i, i + 12).split('\n')[0] || 'end of input'}" (${i < s.length ? 'unexpected' : 'END'}) at [${s.slice(0, i).split('\n').length}, ${i - s.lastIndexOf('\n', i - 1)}]`)
  }
  const name = () => {
    ws()
    const m = /^[_A-Za-z][_0-9A-Za-z]*/.exec(s.slice(i))
    if (!m) fail()
    i += m[0].length
    return m[0]
  }
  const peek = (c) => (ws(), s.startsWith(c, i))
  const eat = (c) => {
    if (!peek(c)) fail()
    i += c.length
  }
  const value = () => {
    ws()
    const c = s[i]
    if (c === '$') {
      i++
      return vars?.[name()]
    }
    if (s.startsWith('"""', i)) {
      const end = s.indexOf('"""', i + 3)
      if (end < 0) fail()
      const v = s.slice(i + 3, end)
      i = end + 3
      return v
    }
    if (c === '"') {
      let j = i + 1
      while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1
      if (j >= s.length) fail()
      const v = JSON.parse(s.slice(i, j + 1))
      i = j + 1
      return v
    }
    if (c === '[') {
      i++
      const out = []
      while (!peek(']')) out.push(value())
      eat(']')
      return out
    }
    if (c === '{') {
      i++
      const out = {}
      while (!peek('}')) {
        const k = name()
        eat(':')
        out[k] = value()
      }
      eat('}')
      return out
    }
    const num = /^-?\d+(\.\d+)?/.exec(s.slice(i))
    if (num) {
      i += num[0].length
      return Number(num[0])
    }
    const n = name()
    return n === 'true' ? true : n === 'false' ? false : n === 'null' ? null : n
  }
  const args = () => {
    const out = {}
    if (!peek('(')) return out
    eat('(')
    while (!peek(')')) {
      const k = name()
      eat(':')
      out[k] = value()
    }
    eat(')')
    return out
  }
  const selection = () => {
    eat('{')
    const out = []
    while (!peek('}')) {
      if (s.startsWith('...', i)) throw new GqlError('Fragments are not supported in the lab') // lab-made
      let n = name()
      let alias = null
      if (peek(':')) {
        eat(':')
        alias = n
        n = name()
      }
      const a = args()
      out.push({ name: n, alias, args: a, sel: peek('{') ? selection() : null })
    }
    eat('}')
    return out
  }
  ws()
  let op = 'query'
  if (!peek('{')) {
    op = name()
    if (op !== 'query' && op !== 'mutation') {
      i -= op.length
      fail()
    }
    if (!peek('{') && !peek('(')) name()
    if (peek('(')) {
      let depth = 0
      do {
        if (s[i] === '(') depth++
        if (s[i] === ')') depth--
        i++
      } while (depth > 0 && i < s.length)
    }
  }
  const sel = selection()
  ws()
  if (i < s.length) fail()
  return { op, sel }
}

// The requested cost, the way Shopify counts it: an object is 1, a scalar 0, a connection 2 plus first times the cost
// of one node, a mutation 10.
const nodeSel = (sel) => sel?.find((f) => f.name === 'edges')?.sel?.find((f) => f.name === 'node')?.sel ?? sel?.find((f) => f.name === 'nodes')?.sel ?? []
const isConn = (f) => f.args.first !== undefined || f.args.last !== undefined
function fieldCost(f) {
  if (!f.sel) return 0
  if (['pageInfo', 'edges', 'node', 'nodes'].includes(f.name)) return 0
  if (isConn(f)) return 2 + Number(f.args.first ?? f.args.last) * (1 + selCost(nodeSel(f.sel)))
  return 1 + selCost(f.sel)
}
const selCost = (sel) => (sel ?? []).reduce((n, f) => n + fieldCost(f), 0)
export const queryCost = (doc) => (doc.op === 'mutation' ? 10 : selCost(doc.sel))

// ---------- GraphQL: the data ----------

const conn = (list, view, filter) => ({ __conn: true, list, view, filter })
const moneyBag = (n) => ({ shopMoney: { amount: money(n), currencyCode: 'EUR' } })
function orderNode(y, x) {
  const o = orderRec(y, x)
  return {
    id: gid('Order', o.id),
    name: o.name,
    email: o.email,
    createdAt: iso(o.t),
    updatedAt: iso(o.updatedAt),
    test: o.test,
    displayFinancialStatus: String(o.financial).toUpperCase(),
    displayFulfillmentStatus: String(o.fulfillment ?? 'unfulfilled').toUpperCase(),
    totalPriceSet: moneyBag(o.total),
    lineItems: conn(o.lines, (l) => ({ id: gid('LineItem', l.id), sku: l.sku, title: l.title, quantity: l.qty, originalUnitPriceSet: moneyBag(l.price) })),
  }
}
const levelNode = (y, l) => ({ id: `${gid('InventoryLevel', l.locationId * 1000 + (l.itemId % 1000))}?inventory_item_id=${l.itemId}`, location: { id: gid('Location', l.locationId), name: y.locations.find((x) => x.id === l.locationId)?.name }, updatedAt: iso(l.updatedAt), quantities: (a) => (a.names ?? ['available']).map((n) => ({ name: n, quantity: n === 'available' || n === 'on_hand' ? l.available : 0 })) })
const itemNode = (y, v) => ({ id: gid('InventoryItem', v.itemId), sku: v.sku, tracked: true, inventoryLevels: conn(y.levels.filter((l) => l.itemId === v.itemId), (l) => levelNode(y, l)) })
const variantNode = (y, v) => ({ id: gid('ProductVariant', v.id), sku: v.sku, title: v.title, price: money(v.price), inventoryQuantity: y.levels.filter((l) => l.itemId === v.itemId).reduce((n, l) => n + l.available, 0), inventoryItem: itemNode(y, v) })
// search syntax, a small part of it: updated_at:>=2026-11-03 or created_at:>X, sku:H-2000, test:false
function matches(q, rec) {
  for (const part of String(q ?? '').split(/\s+(?:AND\s+)?/i).filter(Boolean)) {
    const m = part.match(/^(\w+):(>=|<=|>|<)?['"]?([^'"]*)['"]?$/)
    if (!m) continue
    const [, key, op = '', raw] = m
    const v = rec[key]
    if (v === undefined) continue
    if (op) {
      const a = typeof v === 'number' ? v : fromIso(v)
      const b = fromIso(raw)
      if (b === null || a === null) continue
      if ((op === '>=' && !(a >= b)) || (op === '>' && !(a > b)) || (op === '<=' && !(a <= b)) || (op === '<' && !(a < b))) return false
    } else if (String(v).toLowerCase() !== raw.toLowerCase()) return false
  }
  return true
}
const orderMatches = (y, x, q) => {
  const o = orderRec(y, x)
  return matches(q, { updated_at: o.updatedAt, created_at: o.t, test: String(o.test), name: o.name })
}
// a bulk query reads every node of the connection and of its nested connections, so it has no first
const bulkSel = (x) => ({ ...x, bulk: true, args: { ...x.args, first: undefined }, sel: x.sel?.map((g) => (g.sel ? bulkSel(g) : g)) })
function queryRoot(y, appRec, t) {
  return {
    shop: { __scope: null, name: y.name, myshopifyDomain: y.shop, currencyCode: 'EUR', ianaTimezone: 'Europe/London', plan: { displayName: 'Shopify', shopifyPlus: false } },
    orders: { __scope: 'read_orders', value: conn(ordersAll(y), (x) => orderNode(y, x), (x, q) => orderMatches(y, x, q)) },
    products: { __scope: 'read_products', value: conn(y.products, (p) => ({ id: gid('Product', p.id), title: p.title, handle: p.handle, status: p.status.toUpperCase(), variants: conn(p.variants, (v) => variantNode(y, { ...v, product: p })) })) },
    inventoryItems: { __scope: 'read_inventory', value: conn(variants(y), (v) => itemNode(y, v), (v, q) => matches(q, { sku: v.sku })) },
    locations: { __scope: 'read_inventory', value: conn(y.locations, (l) => ({ id: gid('Location', l.id), name: l.name, isActive: true })) },
    webhookSubscriptions: { __scope: null, value: conn(subsOf(y, appRec.id), (w) => ({ id: gid('WebhookSubscription', w.id), topic: topicEnum(w.topic), format: 'JSON', createdAt: iso(w.created), endpoint: { __typename: 'WebhookHttpEndpoint', callbackUrl: w.address } })) },
    currentBulkOperation: { __scope: null, value: bulkView(y, appRec, t) },
  }
}
function bulkView(y, a, t) {
  const b = y.bulk[a.id]
  if (!b) return null
  const done = t >= b.done
  return { id: b.id, status: done ? 'COMPLETED' : 'RUNNING', errorCode: null, createdAt: iso(b.created), completedAt: done ? iso(b.done) : null, objectCount: String(done ? b.count : Math.floor((b.count * (t - b.created)) / Math.max(1, b.done - b.created))), rootObjectCount: String(done ? b.roots : 0), fileSize: done ? String(b.count * 160) : null, url: done ? b.url : null, partialDataUrl: null, query: b.query }
}

// resolves a selection against a value. Returns [data, actualCost].
function resolve(sel, val, path) {
  const out = {}
  let cost = 0
  for (const f of sel) {
    const key = f.alias ?? f.name
    if (f.name === '__typename') {
      out[key] = val?.__typename ?? path
      continue
    }
    let v = val?.[f.name]
    if (typeof v === 'function') v = v(f.args)
    if (v === undefined) throw new GqlError(`Field '${f.name}' doesn't exist on type '${path}'`)
    if (v && v.__conn) {
      const [r, c] = resolveConn(f, v, `${path}.${f.name}`)
      out[key] = r
      cost += c
    } else if (f.sel && v !== null) {
      if (Array.isArray(v)) {
        const rs = v.map((x) => resolve(f.sel, x, f.name))
        out[key] = rs.map((r) => r[0])
        cost += rs.reduce((n, r) => n + 1 + r[1], 0)
      } else {
        const [r, c] = resolve(f.sel, v, f.name)
        out[key] = r
        cost += 1 + c
      }
    } else out[key] = f.sel ? null : v
  }
  return [out, cost]
}
const cursorOf = (i) => base64(utf8(JSON.stringify({ last_id: i })))
const indexOfCursor = (c) => {
  try {
    return JSON.parse(atob(String(c))).last_id
  } catch {
    return null
  }
}
function resolveConn(f, v, path) {
  const first = f.args.first ?? f.args.last
  if (first === undefined && !f.bulk) throw new GqlError(`you must provide one of first or last`)
  if (Number(first) > 250) throw new GqlError(`The first argument on ${path} exceeds the maximum of 250`) // lab-made wording
  let idx = v.list.map((_, i) => i)
  if (f.args.query && v.filter) idx = idx.filter((i) => v.filter(v.list[i], f.args.query))
  if (f.args.reverse) idx.reverse()
  if (f.args.after !== undefined && f.args.after !== null) {
    const at = indexOfCursor(f.args.after)
    if (at === null) throw new GqlError(`Invalid cursor for current pagination sort.`)
    idx = idx.slice(idx.indexOf(at) + 1)
  }
  const page = f.bulk ? idx : idx.slice(0, Number(first))
  const nodeS = nodeSel(f.sel)
  let cost = 2
  const nodes = page.map((i) => {
    const [r, c] = resolve(nodeS, v.view(v.list[i]), f.name)
    cost += 1 + c
    return { i, r }
  })
  const out = {}
  for (const g of f.sel) {
    const key = g.alias ?? g.name
    if (g.name === 'edges') out[key] = nodes.map(({ i, r }) => Object.fromEntries((g.sel ?? []).map((h) => [h.alias ?? h.name, h.name === 'cursor' ? cursorOf(i) : h.name === 'node' ? r : null])))
    else if (g.name === 'nodes') out[key] = nodes.map((n) => n.r)
    else if (g.name === 'pageInfo') {
      const info = { hasNextPage: page.length < idx.length, hasPreviousPage: f.args.after !== undefined, endCursor: page.length ? cursorOf(page.at(-1)) : null, startCursor: page.length ? cursorOf(page[0]) : null }
      out[key] = Object.fromEntries((g.sel ?? []).map((h) => [h.alias ?? h.name, info[h.name] ?? null]))
    } else throw new GqlError(`Field '${g.name}' doesn't exist on type '${path}Connection'`)
  }
  return [out, cost, nodes]
}

// mutations, and the scope a mutation needs beyond an installed app
const MUTATION_SCOPES = { inventorySetQuantities: 'write_inventory' }
function mutate(s, y, a, f, t) {
  const sel = f.sel ?? []
  const pick = (obj) => resolve(sel, obj, f.name)[0]
  if (f.name === 'bulkOperationRunQuery') {
    const running = y.bulk[a.id] && t < y.bulk[a.id].done
    if (running) return pick({ bulkOperation: null, userErrors: [{ field: null, message: `A bulk query operation for this app and shop is already in progress: ${y.bulk[a.id].id}.` }] })
    let doc
    try {
      doc = parseGraphql(f.args.query)
    } catch (e) {
      return pick({ bulkOperation: null, userErrors: [{ field: ['query'], message: `Invalid bulk query: ${e.message}` }] })
    }
    const top = doc.sel.filter((x) => x.sel)
    const root = queryRoot(y, a, t)[top[0]?.name]
    if (doc.op !== 'query' || top.length !== 1 || !root?.value?.__conn) return pick({ bulkOperation: null, userErrors: [{ field: ['query'], message: 'Bulk queries must contain at least one connection.' }] })
    if (root.__scope && !hasScope(a, root.__scope)) return pick({ bulkOperation: null, userErrors: [{ field: ['query'], message: `Access denied for ${top[0].name} field. Required access: \`${root.__scope}\` access scope.` }] })
    let count = 0
    let roots = 0
    try {
      const [, , nodes] = resolveConn(bulkSel(top[0]), root.value, top[0].name)
      roots = nodes.length
      count = roots + nodes.reduce((n, x) => n + Object.values(x.r).filter((v) => v && (v.edges || v.nodes)).reduce((k, v) => k + (v.edges ?? v.nodes).length, 0), 0)
    } catch (e) {
      return pick({ bulkOperation: null, userErrors: [{ field: ['query'], message: `Invalid bulk query: ${e.message}` }] })
    }
    const id = gid('BulkOperation', 3200100 + next(y))
    // lab-made: Shopify takes about a second for each 100 objects, at least 3 seconds
    y.bulk[a.id] = { id, query: f.args.query, created: t, done: t + Math.max(3000, count * 10), count, roots, url: `https://storage.shopifycloud.example/bulk-operation-outputs/${hexOf(id, 12)}/bulk-${idOfGid(id)}.jsonl` }
    return pick({ bulkOperation: { id, status: 'CREATED', createdAt: iso(t), query: f.args.query }, userErrors: [] })
  }
  if (f.name === 'webhookSubscriptionCreate') {
    const t2 = topicOf(f.args.topic)
    const input = f.args.webhookSubscription ?? {}
    const err = subscriptionError(y, a.id, { topic: t2 ?? f.args.topic, address: input.callbackUrl, format: String(input.format ?? 'JSON') })
    if (err) return pick({ webhookSubscription: null, userErrors: [{ field: ['webhookSubscription', 'callbackUrl'], message: err }] })
    const w = addSubscription(y, a.id, { topic: t2, address: input.callbackUrl, apiVersion: y.apiVersion }, t)
    return pick({ webhookSubscription: { id: gid('WebhookSubscription', w.id), topic: topicEnum(w.topic), endpoint: { __typename: 'WebhookHttpEndpoint', callbackUrl: w.address } }, userErrors: [] })
  }
  // inventorySetQuantities: the absolute quantity of inventory items at locations, all or none. compareQuantity must
  // match the stored quantity unless ignoreCompareQuantity is true. Lab: on_hand is treated as available, as the lab
  // keeps no committed or reserved quantities.
  if (f.name === 'inventorySetQuantities') {
    const input = f.args.input ?? {}
    const name = word(input.name)
    const rows = [].concat(input.quantities ?? [])
    const errs = []
    if (!['available', 'on_hand'].includes(name)) errs.push({ field: ['input', 'name'], message: "The quantity name must be either 'available' or 'on_hand'.", code: 'INVALID_NAME' })
    if (!rows.length) errs.push({ field: ['input', 'quantities'], message: 'At least one quantity is required.', code: 'INVALID_QUANTITY' }) // lab-made wording
    const found = rows.map((q, i) => {
      const at = (k) => ['input', 'quantities', String(i), k]
      const v = variantOfItem(y, idOfGid(q?.inventoryItemId))
      const lv = v && levelOf(y, v.itemId, idOfGid(q?.locationId))
      if (!v) errs.push({ field: at('inventoryItemId'), message: 'The specified inventory item could not be found.', code: 'INVALID_INVENTORY_ITEM' })
      else if (!lv) errs.push({ field: at('locationId'), message: 'The specified location could not be found.', code: 'INVALID_LOCATION' })
      else if (!Number.isInteger(q.quantity) || Math.abs(q.quantity) > 1000000000) errs.push({ field: at('quantity'), message: 'The quantity is not valid.', code: 'INVALID_QUANTITY' }) // lab-made wording
      else if (!input.ignoreCompareQuantity && q.compareQuantity !== lv.available) errs.push({ field: at('compareQuantity'), message: 'The compareQuantity argument no longer matches the persisted quantity.', code: 'COMPARE_QUANTITY_STALE' })
      return { lv, qty: q?.quantity }
    })
    if (errs.length) return pick({ inventoryAdjustmentGroup: null, userErrors: errs })
    const changes = found.map(({ lv, qty }) => {
      const delta = qty - lv.available
      lv.available = qty
      lv.updatedAt = t
      emit(y, 'inventory_levels/update', levelPayload(lv), t)
      return { name, delta, quantityAfterChange: qty, item: { id: gid('InventoryItem', lv.itemId), sku: variantOfItem(y, lv.itemId)?.sku ?? null }, location: { id: gid('Location', lv.locationId), name: y.locations.find((l) => l.id === lv.locationId)?.name ?? null } }
    })
    return pick({ inventoryAdjustmentGroup: { createdAt: iso(t), reason: word(input.reason) || 'correction', referenceDocumentUri: input.referenceDocumentUri ?? null, changes }, userErrors: [] })
  }
  throw new GqlError(`Field '${f.name}' doesn't exist on type 'Mutation'`)
}

function runGraphql(s, y, cfg, query, vars, t, who) {
  const a = appByToken(y, cfg?.accessToken)
  if (!shopOk(cfg)) return { ok: false, status: 0, ms: 3000, type: 'HTTP:CONNECTIVITY', body: null, error: `Couldn't connect. The host ${word(cfg?.shop) || '(empty)'} cannot be resolved` }
  if (!a) {
    callLog(y, t, who, 'GraphQL', '401 Invalid API key or access token', 401)
    return { ok: false, status: 401, ms: 120, type: 'HTTP:UNAUTHORIZED', body: { errors: INVALID_TOKEN } }
  }
  let doc
  try {
    doc = parseGraphql(query, vars)
  } catch (e) {
    return { ok: false, status: 200, ms: 90, body: { errors: [{ message: e.message, extensions: { code: 'PARSE_ERROR' } }] } }
  }
  const requested = queryCost(doc)
  const bucket = gqlBucket(y, a, t)
  const status = (avail) => ({ maximumAvailable: GQL.max, currentlyAvailable: Math.floor(avail), restoreRate: GQL.restore })
  if (requested > GQL.single) {
    callLog(y, t, a.name, 'GraphQL', `MAX_COST_EXCEEDED: cost ${requested}`, 200, requested)
    return { ok: false, status: 200, ms: THROTTLED_MS, body: { errors: [{ message: `Query cost is ${requested}, which exceeds the single query max cost limit (${GQL.single}).`, extensions: { code: 'MAX_COST_EXCEEDED', cost: requested, maxCost: GQL.single } }], extensions: { cost: { requestedQueryCost: requested, actualQueryCost: null, throttleStatus: status(bucket.avail) } } } }
  }
  if (requested > bucket.avail) {
    bucket.set(bucket.avail)
    callLog(y, t, a.name, 'GraphQL', `THROTTLED: requested ${requested}, available ${Math.floor(bucket.avail)}`, 200, requested)
    return { ok: false, status: 200, ms: THROTTLED_MS, body: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED', documentation: 'https://shopify.dev/api/usage/rate-limits' } }], extensions: { cost: { requestedQueryCost: requested, actualQueryCost: null, throttleStatus: status(bucket.avail) } } } }
  }
  const root = doc.op === 'mutation' ? null : queryRoot(y, a, t)
  const data = {}
  let actual = doc.op === 'mutation' ? 10 : 0
  try {
    for (const f of doc.sel) {
      if (doc.op === 'mutation') {
        // a mutation that writes store data needs its write scope
        const need = MUTATION_SCOPES[f.name]
        if (need && !a.granted.includes(need)) {
          bucket.set(bucket.avail - 1)
          callLog(y, t, a.name, 'GraphQL', `ACCESS_DENIED on ${f.name}`, 200, requested)
          return { ok: false, status: 200, ms: GQL_MS, body: { data: null, errors: [{ message: `Access denied for ${f.name} field. Required access: \`${need}\` access scope.`, extensions: { code: 'ACCESS_DENIED', documentation: 'https://shopify.dev/api/usage/access-scopes' }, path: [f.name] }], extensions: { cost: { requestedQueryCost: requested, actualQueryCost: 1, throttleStatus: status(bucket.avail - 1) } } } }
        }
        data[f.alias ?? f.name] = mutate(s, y, a, f, t)
        continue
      }
      const r = root[f.name]
      if (!r) throw new GqlError(`Field '${f.name}' doesn't exist on type 'QueryRoot'`)
      if (r.__scope && !hasScope(a, r.__scope)) {
        bucket.set(bucket.avail - 1)
        callLog(y, t, a.name, 'GraphQL', `ACCESS_DENIED on ${f.name}`, 200, requested)
        return { ok: false, status: 200, ms: GQL_MS, body: { data: null, errors: [{ message: `Access denied for ${f.name} field. Required access: \`${r.__scope}\` access scope.`, extensions: { code: 'ACCESS_DENIED', documentation: 'https://shopify.dev/api/usage/access-scopes' }, path: [f.name] }], extensions: { cost: { requestedQueryCost: requested, actualQueryCost: 1, throttleStatus: status(bucket.avail - 1) } } } }
      }
      const value = r.value !== undefined ? r.value : r
      const [part, c] = resolve([f], { [f.name]: value }, 'QueryRoot')
      data[f.alias ?? f.name] = part[f.alias ?? f.name]
      actual += c
    }
  } catch (e) {
    if (!(e instanceof GqlError)) throw e
    return { ok: false, status: 200, ms: 90, body: { errors: [{ message: e.message, extensions: { code: 'undefinedField' } }] } }
  }
  actual = Math.min(actual, requested)
  bucket.set(bucket.avail - actual)
  callLog(y, t, a.name, 'GraphQL', `${doc.op} ${doc.sel.map((f) => f.name).join(', ')}: cost ${actual} of ${requested}`, 200, actual)
  return { ok: true, status: 200, ms: GQL_MS, body: { data, extensions: { cost: { requestedQueryCost: requested, actualQueryCost: actual, throttleStatus: status(bucket.avail - actual) } } } }
}

// ---------- REST ----------

const queryParams = (path) => Object.fromEntries(new URLSearchParams(String(path).split('?')[1] ?? ''))
function runRest(s, y, cfg, method, path, body, t, who) {
  if (!shopOk(cfg)) return { ok: false, status: 0, ms: 3000, type: 'HTTP:CONNECTIVITY', error: `Couldn't connect. The host ${word(cfg?.shop) || '(empty)'} cannot be resolved`, headers: {} }
  const a = appByToken(y, cfg?.accessToken)
  if (!a) {
    callLog(y, t, who, 'REST', `${method} ${path.split('?')[0]}: 401`, 401)
    return { ok: false, status: 401, ms: REST_MS, body: { errors: INVALID_TOKEN }, headers: {} }
  }
  const bucket = restBucket(y, a, t)
  if (bucket.used + 1 > REST.size) {
    bucket.set(bucket.used)
    callLog(y, t, a.name, 'REST', `${method} ${path.split('?')[0]}: 429 Too Many Requests`, 429)
    return { ok: false, status: 429, ms: 60, body: { errors: 'Exceeded 2 calls per second for api client. Reduce request rates to resume uninterrupted service.' }, headers: { 'Retry-After': '2.0', 'X-Shopify-Shop-Api-Call-Limit': `${REST.size}/${REST.size}` } }
  }
  bucket.set(bucket.used + 1)
  const headers = { 'X-Shopify-Shop-Api-Call-Limit': `${Math.ceil(bucket.used + 1)}/${REST.size}`, 'X-Shopify-API-Version': y.apiVersion }
  const m = String(path).split('?')[0].match(/^\/admin\/api\/([\d-]+)\/(.+)\.json$/)
  const done = (status, out, extra = {}) => {
    callLog(y, t, a.name, 'REST', `${method} ${String(path).split('?')[0]}: ${status}`, status)
    return { ok: status < 400, status, ms: REST_MS, body: out, headers: { ...headers, ...extra } }
  }
  if (!m) return done(404, { errors: 'Not Found' })
  const res = m[2]
  const q = queryParams(path)
  const need = (scope) => (hasScope(a, scope) ? null : done(403, { errors: `[API] This action requires merchant approval for ${scope} scope.` }))
  if (method === 'GET' && res === 'shop') return done(200, { shop: { name: y.name, myshopify_domain: y.shop, currency: 'EUR', iana_timezone: 'Europe/London' } })
  if (method === 'GET' && res === 'orders/count') return need('read_orders') ?? done(200, { count: totalOrders(y) })
  if (method === 'GET' && res === 'orders') {
    const denied = need('read_orders')
    if (denied) return denied
    const limit = Math.min(250, Math.max(1, Number(q.limit ?? 50)))
    let state = { i: -1, min: q.updated_at_min ?? null }
    if (q.page_info) {
      try {
        state = JSON.parse(atob(q.page_info))
      } catch {
        return done(400, { errors: { page_info: ['Invalid value.'] } })
      }
      if (Object.keys(q).some((k) => !['page_info', 'limit', 'fields'].includes(k))) return done(400, { errors: { page_info: ['Invalid value.'] } }) // only limit and fields may come with page_info
    }
    const min = state.min ? fromIso(state.min) : null
    const all = ordersAll(y).map((x, i) => [i, orderRec(y, x)]).filter(([i, o]) => i > state.i && (min === null || o.updatedAt >= min))
    const page = all.slice(0, limit)
    const more = all.length > limit
    const link = more ? { Link: `<https://${y.shop}/admin/api/${m[1]}/orders.json?limit=${limit}&page_info=${btoa(JSON.stringify({ i: page.at(-1)[0], min: state.min }))}>; rel="next"` } : {}
    return done(200, { orders: page.map(([, o]) => orderPayload(y, o)) }, link)
  }
  const tx = res.match(/^orders\/(\d+)\/transactions$/)
  if (method === 'GET' && tx) {
    const denied = need('read_orders')
    if (denied) return denied
    const o = ordersAll(y).map((x) => orderRec(y, x)).find((x) => x.id === Number(tx[1]))
    if (!o) return done(404, { errors: 'Not Found' })
    return done(200, { transactions: [{ id: o.id + 7000000, order_id: o.id, kind: 'sale', status: 'success', gateway: 'shopify_payments', amount: money(o.total), currency: 'EUR', created_at: iso(o.t) }] })
  }
  if (method === 'GET' && res === 'inventory_levels') {
    const denied = need('read_inventory')
    if (denied) return denied
    const ids = String(q.inventory_item_ids ?? '').split(',').map(Number).filter(Boolean)
    return done(200, { inventory_levels: y.levels.filter((l) => !ids.length || ids.includes(l.itemId)).map(levelPayload) })
  }
  if (method === 'GET' && res === 'webhooks') return done(200, { webhooks: subsOf(y, a.id).map((w) => ({ id: w.id, address: w.address, topic: w.topic, format: 'json', api_version: w.apiVersion, created_at: iso(w.created) })) })
  if (method === 'POST' && res === 'webhooks') {
    let input
    try {
      input = JSON.parse(body || '{}').webhook ?? {}
    } catch {
      return done(400, { errors: 'Bad Request' })
    }
    const err = subscriptionError(y, a.id, input)
    if (err) return done(422, { errors: { address: [err] } })
    const w = addSubscription(y, a.id, { ...input, apiVersion: m[1] }, t)
    return done(201, { webhook: { id: w.id, address: w.address, topic: w.topic, format: 'json', api_version: w.apiVersion } })
  }
  return done(404, { errors: 'Not Found' })
}

// ---------- the ctx hook ----------

// The engine calls this for each run of an app with its draft state: the calls change `s` in place.
export function shopifyCtx(s, app) {
  const who = app?.name ?? 'app'
  let offset = 0
  const sys = () => (s.shopify = fillShopify(s.shopify))
  const now = () => (s.clock ?? 0) + offset
  const took = (r) => {
    offset += r.ms ?? 0
    return r
  }
  return {
    graphql: (cfg, query, vars = {}) => took(runGraphql(s, sys(), cfg, query, vars, now(), who)),
    rest: (cfg, method, path, body = '') => took(runRest(s, sys(), cfg, String(method ?? 'GET').toUpperCase(), String(path ?? ''), body, now(), who)),
    download(url) {
      const y = sys()
      const b = Object.values(y.bulk).find((x) => x.url === url && now() >= x.done)
      if (!b) return took({ ok: false, status: 403, ms: 200, body: 'AccessDenied: Request has expired' })
      const doc = parseGraphql(b.query)
      const top = doc.sel.find((x) => x.sel)
      const a = y.apps.find((x) => y.bulk[x.id] === b)
      const root = queryRoot(y, a, now())[top.name].value
      const [, , nodes] = resolveConn(bulkSel(top), root, top.name)
      const rows = []
      for (const { r } of nodes) {
        const flat = {}
        const kids = []
        for (const [k, v] of Object.entries(r)) {
          if (v && (v.edges || v.nodes)) kids.push(...(v.edges ?? v.nodes).map((e) => e.node ?? e))
          else flat[k] = v
        }
        rows.push(JSON.stringify(flat))
        for (const k of kids) rows.push(JSON.stringify({ ...k, __parentId: flat.id }))
      }
      return took({ ok: true, status: 200, ms: 300 + rows.length, body: rows.join('\n') })
    },
    webhooks(listener, receive) {
      const y = sys()
      const t0 = now()
      const paths = (listener?.paths ?? []).map((p) => word(p))
      const mine = y.deliveries.filter((d) => {
        if (d.status !== 'pending' || d.due > t0) return false
        const a = addressOf(d.address)
        return a && !a.internal && a.app === who && a.env === (app?.env ?? 'Sandbox')
      })
      mine.sort((p, q) => p.at - q.at || p.due - q.due)
      // lab-made: with order 'reverse' the store hands the deliveries of one poll newest first. Shopify does not
      // promise any order, and retries come later than newer events.
      if (y.order === 'reverse') mine.reverse()
      const results = []
      for (const d of mine) {
        const path = addressOf(d.address).path
        if (!paths.includes(path)) {
          settle(s, y, d, 404, 20, '404 Not Found', t0)
          results.push({ id: d.id, code: 404 })
          continue
        }
        const r = receive({ id: d.id, topic: d.topic, headers: deliveryHeaders(y, d), body: d.body, attempt: d.attempts + 1 }) ?? { status: 500, ms: 10 }
        const ms = Math.max(1, Number(r.ms) || 1)
        offset += Math.min(ms, WEBHOOK_TIMEOUT)
        // the attempt is recorded at the minute of the poll, the time the lab shows for the run
        if (ms > WEBHOOK_TIMEOUT) settle(s, y, d, 0, WEBHOOK_TIMEOUT, 'Timeout: no answer within 5 seconds', t0)
        else settle(s, y, d, Number(r.status) || 500, ms, `${r.status} ${r.status === 200 ? 'OK' : r.status === 401 ? 'Unauthorized' : ''}`.trim(), t0)
        results.push({ id: d.id, code: ms > WEBHOOK_TIMEOUT ? 0 : r.status })
      }
      return { ok: true, count: results.length, results }
    },
    wait(ms) {
      offset += Math.max(0, Number(ms) || 0)
    },
    elapsed: () => offset,
  }
}

// ---------- the tick ----------

const appRunning = (s, name, env) => (s?.apps ?? []).some((a) => a.name === name && a.env === env && a.status === 'Running')
const appExists = (s, name, env) => (s?.apps ?? []).find((a) => a.name === name && a.env === env)
// runs once a lab minute while state.shopify exists. Changes `s` in place.
export function shopifyTick(s) {
  const y = s?.shopify
  if (!isFilled(y)) return s
  const now = s.clock ?? 0
  // lab-made store traffic: web orders every few minutes, a burst of `burst` orders seconds apart
  const tr = y.traffic
  if (tr && (now / MINUTE) % (tr.every ?? 5) === 0) {
    const skus = tr.skus ?? PRODUCTS.map((p) => p[0])
    // the orders of one burst buy the same product
    const sku = skus[Math.floor(now / MINUTE / (tr.every ?? 5)) % skus.length]
    for (let k = 0; k < (tr.burst ?? 1); k++) webOrder(y, [{ sku, qty: 1 + (y.nextOrder % 2) }], now + k * 20000)
  }
  // deliveries no app took: the endpoint did not answer
  for (const d of y.deliveries) {
    if (d.status !== 'pending' || d.due > now) continue
    const a = addressOf(d.address)
    const target = a && !a.internal && appExists(s, a.app, a.env)
    if (!a || a.internal || !target) settle(s, y, d, 0, 30, `Could not resolve host ${String(d.address).split('/')[2] ?? ''}`, now)
    else if (!target.publicEndpoint) settle(s, y, d, 0, 30, 'Connection refused', now)
    // an app that is being deployed: the replicas of the last config answer, so the delivery waits for its next poll
    else if (target.status === 'Starting') continue
    else if (!appRunning(s, a.app, a.env)) settle(s, y, d, 503, 40, '503 Service Unavailable', now)
    // a running app had a poll for it and did not take it: no listener answers that path
    else if (now - d.due >= MINUTE) settle(s, y, d, 404, 20, '404 Not Found', now)
  }
  return s
}

// ---------- screen actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.shopify = fillShopify(s.shopify)
  const result = fn(s, s.shopify, s.clock ?? 0)
  return { state: s, result }
}
export const upgradeShopify = (state) => (isFilled(state?.shopify) ? state : edit(state, () => null).state)

// Settings, Apps and sales channels, Develop apps, Create an app
export const createApp = (state, { name, developer }) =>
  edit(state, (s, y, now) => {
    const n = word(name)
    if (!n) return { ok: false, text: "App name can't be blank" }
    if (n.length > 30) return { ok: false, text: 'App name is too long (maximum is 30 characters)' }
    if (y.apps.some((a) => a.name.toLowerCase() === n.toLowerCase())) return { ok: false, text: 'App name has already been taken' }
    const id = `app-${1000 + next(y)}`
    y.apps.push({ id, name: n, developer: word(developer) || 'ops@brightmart.example', created: now, scopes: [], granted: [], installed: null, token: null, tokenShown: false, apiKey: hexOf(`${id}:key`, 32), secret: `shpss_lab${hexOf(`${id}:secret`, 28)}` })
    return { ok: true, id, text: `${n} was created` }
  })
// Configuration, Admin API integration, Admin API access scopes, Save
export const saveScopes = (state, appId, scopes) =>
  edit(state, (s, y) => {
    const a = appOf(y, appId)
    if (!a) return { ok: false, text: 'App not found' }
    a.scopes = SCOPES.filter((x) => (scopes ?? []).includes(x))
    return { ok: true, text: a.installed ? 'Scopes saved. Install the app again to grant them' : 'Admin API integration saved' }
  })
// API credentials, Install app: grants the configured scopes. The first install makes the Admin API access token.
export const installApp = (state, appId) =>
  edit(state, (s, y, now) => {
    const a = appOf(y, appId)
    if (!a) return { ok: false, text: 'App not found' }
    if (!a.scopes.length) return { ok: false, text: 'Configure Admin API scopes before you install the app' }
    if (!a.installed) Object.assign(a, { token: `shpat_lab${hexOf(`${a.id}:token:${now}`, 28)}`, tokenShown: false })
    a.installed ??= now
    a.granted = [...a.scopes]
    return { ok: true, text: `${a.name} is installed with ${a.granted.join(', ')}` }
  })
// Uninstall app: the token stops working and the app's webhook subscriptions are deleted
export const uninstallApp = (state, appId) =>
  edit(state, (s, y) => {
    const a = appOf(y, appId)
    if (!a?.installed) return { ok: false, text: 'The app is not installed' }
    Object.assign(a, { installed: null, granted: [], token: null, tokenShown: false })
    y.webhooks = y.webhooks.filter((w) => w.app !== a.id)
    return { ok: true, text: `${a.name} was uninstalled. Its access token no longer works` }
  })
// Reveal token once: the Admin API access token is shown a single time
export const revealToken = (state, appId) =>
  edit(state, (s, y) => {
    const a = appOf(y, appId)
    if (!a?.installed || a.tokenShown) return null
    a.tokenShown = true
    s.seen[`shopify:token:${a.id}`] = s.clock
    return a.token
  })
// a webhook subscription: for an app it is what webhookSubscriptionCreate does with the app's token; for 'admin' it is
// Settings, Notifications, Webhooks, Create webhook
export const createSubscription = (state, appId, form) =>
  edit(state, (s, y, now) => {
    const err = subscriptionError(y, appId, form)
    if (err) return { ok: false, text: err }
    const w = addSubscription(y, appId, form, now)
    return { ok: true, id: w.id, text: `Webhook subscription created for ${w.topic}` }
  })
export const deleteSubscription = (state, id) =>
  edit(state, (s, y) => {
    y.webhooks = y.webhooks.filter((w) => w.id !== id)
    for (const d of y.deliveries.filter((x) => x.sub === id && x.status === 'pending')) d.status = 'removed'
    return true
  })
// Settings, Notifications, Webhooks, Send test notification (for the webhooks made in Settings)
export const sendTestNotification = (state, id) =>
  edit(state, (s, y, now) => {
    const w = y.webhooks.find((x) => x.id === id)
    if (!w) return false
    const body = shopifyJson(w.topic.startsWith('orders/') ? { ...orderPayload(y, archivedOrder({ ...y, archived: { count: 1, from: now, to: now } }, 0)), id: 820982911946154508, name: '#9999', test: true } : levelPayload({ itemId: 47002000, locationId: WAREHOUSE, available: 1, updatedAt: now }))
    y.deliveries.push({ id: uuid(`test:${w.id}:${next(y)}`), sub: w.id, app: w.app, topic: w.topic, address: w.address, body, hmac: hmacBase64(secretOfSub(y, w), body), at: now, due: now, attempts: 0, status: 'pending', results: [] })
    trimDeliveries(y)
    return true
  })
// Orders, Create test order (lab-made: a web order placed and paid at once)
export const createTestOrder = (state, { sku, qty = 1, email }) =>
  edit(state, (s, y, now) => {
    const o = webOrder(y, [{ sku, qty }], now, { email: word(email) || 'test.buyer@mail.example', test: true })
    return o ? { ok: true, name: o.name, text: `Order ${o.name} was created` } : { ok: false, text: `${sku} has not enough stock at Brightmart Warehouse` }
  })
// an order, Fulfill items: a fulfillment, and the order is updated
export const fulfillOrder = (state, name) =>
  edit(state, (s, y, now) => {
    const o = orderNamed(y, name)
    if (!o || o.fulfillment === 'fulfilled') return false
    o.fulfillments.push({ id: 6100100 + next(y), t: now, status: 'success' })
    o.fulfillment = 'fulfilled'
    o.updatedAt = now
    emit(y, 'orders/updated', orderPayload(y, o), now)
    emit(y, 'orders/fulfilled', orderPayload(y, o), now)
    return true
  })
// Products, Inventory: set the available quantity at a location
export const setAvailable = (state, itemId, locationId, available) =>
  edit(state, (s, y, now) => {
    const l = levelOf(y, itemId, locationId)
    const n = Math.floor(Number(available))
    if (!l || !Number.isFinite(n) || n < 0) return false
    l.available = n
    l.updatedAt = now
    emit(y, 'inventory_levels/update', levelPayload(l), now)
    return true
  })

// ---------- for labs ----------

// a store with an installed app, for a lab start. Returns the store and the app.
export function labStore(now, { app, scopes = ['read_orders'], developer = 'ops@brightmart.example', archived = 0, subs = [], ...extra } = {}) {
  const y = newShopifyStore(now, extra)
  const id = 'app-1001'
  const a = { id, name: app, developer, created: now - 30 * 24 * HOUR, scopes: [...scopes], granted: [...scopes], installed: now - 30 * 24 * HOUR, token: `shpat_lab${hexOf(`${id}:token`, 28)}`, tokenShown: true, apiKey: hexOf(`${id}:key`, 32), secret: `shpss_lab${hexOf(`${id}:secret`, 28)}` }
  if (app) y.apps.push(a)
  if (archived) y.archived = { count: archived, from: now - 22 * HOUR, to: now - 8 * HOUR }
  y.nextOrder = 1001 + archived
  for (const sub of subs) addSubscription(y, sub.app ?? id, sub, now - 20 * 24 * HOUR)
  return { y, app: app ? a : null }
}
export const webOrderFor = webOrder

// the placeholder the open console seeds: tiny; fillShopify builds the store on first use
export const defaultShopify = (now) => ({ created: now })
