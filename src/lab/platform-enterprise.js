// The enterprise estate of Harbor in the open console. Harbor sells online and in stores and runs its own supply
// chain. 37 APIs over the three API-led layers, each with an Exchange asset, an API instance and an application in
// Sandbox, and the 13 of phase 1 also in Production. Five planned APIs are only in Exchange. The definitions and the packages are in platform-enterprise-packages.js.
//
// What a learner finds on the first morning (the welcome mail lists it):
// - Pelican Wholesale waits for approval of its contract on partner-b2b-exp-api in Sandbox.
// - Northwind Supplies is on the Bronze tier of supplier-exp-api and gets 429 answers. It asked for Silver.
// - products-sys-api runs v1 and v2 side by side. store-ops-prc-api still calls v1.
// - customers-sys-api v1 is deprecated and retires on 31 January 2027. returns-prc-api still calls it.
// - catalog-prc-api 2.2.0 runs in Sandbox, Production still runs 2.1.0.
// - carriers-sys-api in Production has an expired carrier key, so its API alert fires. The new key is in harbor-kv.
// - promotions-sys-api failed its last deploy in Sandbox, loyalty-sys-api is stopped in Sandbox.
// - five APIs of phase 3 are designed and published in Exchange as development versions, and not deployed yet.
// - replenishment-nightly-job runs every night at 02:30.
import { at, callApi, newApi, newApp } from './platform.js'
import { change, creds, OPS, policy } from './platform-kit.js'
import { LAYER_PROPERTY } from './platform-led.js'
import { callsOf, DEPLOYED, ESTATE, SAMPLE, secretOf, urlKey } from './platform-enterprise-packages.js'

const SPACE = 'harbor-ps' // the private space of Harbor, the same as PRIVATE_SPACE of platform-project.js
const short = (env) => (env === 'Sandbox' ? 'sbx' : 'prd')
const internal = (name, env) => `https://${name}-lab1a2.internal-${short(env)}.usa-e2.cloudhub.example/api`
const apiIdOf = (i, env) => `${env === 'Sandbox' ? 188 : 189}00${String(100 + i)}`
const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(8, '0')

// ---------- Exchange ----------

const fill = (value) => JSON.stringify(value).replace(/\{(\w+)\}/g, (all, k) => SAMPLE[k] ?? all)
const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'nil' : typeof v)
export function ramlOf(def) {
  const props = Object.entries(def.routes[0].out).map(([k, v]) => `      ${k}: ${typeOf(v)}`)
  const paths = [...new Set(def.routes.map((x) => x.p))]
  const resources = paths.map((p) => {
    const methods = def.routes.filter((x) => x.p === p).map((x) => {
      const typed = x === def.routes[0] ? `          type: ${def.type}\n` : ''
      return `  ${x.m.toLowerCase()}:\n    responses:\n      ${x.status}:\n        body:\n${typed}          example: ${fill(x.out)}\n`
    })
    return `${p}:\n${methods.join('')}`
  })
  return `#%RAML 1.0\ntitle: ${def.title}\nversion: ${def.apiVersion ?? 'v1'}\ndescription: ${JSON.stringify(def.who)}\nmediaType: application/json\ntypes:\n  ${def.type}:\n    properties:\n${props.join('\n')}\n${resources.join('')}`
}
const versionOf = (def) => def.version ?? def.build
const assetOf = (def, i) => ({
  assetId: def.asset ?? def.name, name: def.title, version: versionOf(def), apiVersion: def.apiVersion ?? 'v1', lifecycle: def.planned ? 'development' : (def.lifecycle ?? 'stable'), raml: ramlOf(def),
  t: at(-(def.apiVersion === 'v1' && def.asset ? 120 : 20 + ((i * 11) % 60)), 10), team: def.team, tags: [def.layer, def.domain],
})

// ---------- API Manager ----------

const TIERS = [
  { name: 'Gold', requests: 120, periodMs: 60000, autoApprove: false },
  { name: 'Silver', requests: 30, periodMs: 60000, autoApprove: true },
  { name: 'Bronze', requests: 3, periodMs: 60000, autoApprove: true },
]
const PARTNER = ['partner-b2b-exp-api', 'supplier-exp-api']
function policiesOf(def) {
  if (PARTNER.includes(def.name)) return [policy('jwt'), policy('rate-limit-sla')]
  if (def.name === 'web-shop-exp-api') return [policy('client-id'), policy('header-inject', { inbound: 'x-harbor-channel: web', outbound: '' })]
  if (def.layer === 'Experience') return [policy('client-id')]
  const list = [policy('client-id'), policy('ip-allow', { list: '10.0.0.0/8' })]
  // the promotion engine is fragile, so a spike control protects it. It has no steady traffic, so its window stays small.
  return def.name === 'promotions-sys-api' ? [...list, policy('spike', { requests: 10, periodMs: 1000 })] : list
}
// the client applications of the channels and partners, and who holds a contract on which Experience API
export const CHANNELS = [
  { name: 'Harbor Web Shop', clientId: 'hws-41a7', clientSecret: 'hws-secret-58' },
  { name: 'Harbor Mobile App', clientId: 'hma-90c3', clientSecret: 'hma-secret-12' },
  { name: 'Store Tablet', clientId: 'stt-27e1', clientSecret: 'stt-secret-36' },
  { name: 'Driftwood Cafes', clientId: 'dwc-6b52', clientSecret: 'dwc-secret-71' },
  { name: 'Pelican Wholesale', clientId: 'pel-3d08', clientSecret: 'pel-secret-94' },
  { name: 'Northwind Supplies', clientId: 'nws-b419', clientSecret: 'nws-secret-27' },
  { name: 'Marlow Paper Goods', clientId: 'mpg-5f60', clientSecret: 'mpg-secret-43' },
  { name: 'Bayline Logistics', clientId: 'byl-8e25', clientSecret: 'byl-secret-65' },
  { name: 'Kestrel Parcel', clientId: 'kst-1c94', clientSecret: 'kst-secret-08' },
]
const ok = (client, tier = '', extra = {}) => ({ client, tier, status: 'approved', ...extra })
const CHANNEL_CONTRACTS = {
  'web-shop-exp-api': () => [ok('Harbor Web Shop')],
  'mobile-app-exp-api': () => [ok('Harbor Mobile App')],
  'store-tablet-exp-api': () => [ok('Store Tablet')],
  'carrier-exp-api': () => [ok('Bayline Logistics'), ok('Kestrel Parcel')],
  // a new partner is waiting in Sandbox: Gold needs a manual approval
  'partner-b2b-exp-api': (env) => [ok('Driftwood Cafes', 'Gold'), ...(env === 'Sandbox' ? [{ client: 'Pelican Wholesale', tier: 'Gold', status: 'pending', t: at(0, 16, 20) }] : [])],
  // Northwind asked to move from Bronze to Silver. Silver approves itself, so the lab shows it as a request to look at.
  'supplier-exp-api': (env) => [ok('Northwind Supplies', 'Bronze', env === 'Sandbox' ? { wanted: 'Silver', change: true } : {}), ok('Marlow Paper Goods', 'Silver')],
}
const clientOf = (def) => {
  const h = hash(def.name)
  return { name: def.name, clientId: `${h.slice(0, 4)}-${h.slice(4, 8)}`, clientSecret: `${h.slice(2, 6)}-secret-${parseInt(h.slice(6), 16) % 90 + 10}` }
}
const callers = DEPLOYED.filter((d) => callsOf(d).length)
function apiOf(def, i, env) {
  const contracts = [...(CHANNEL_CONTRACTS[def.name]?.(env) ?? []), ...callers.filter((c) => callsOf(c).includes(def.name)).map((c) => ok(c.name))]
  return newApi(apiIdOf(i, env), {
    name: def.title, assetId: def.asset ?? def.name, version: versionOf(def), apiVersion: def.apiVersion ?? 'v1', env, label: `${def.name}-${short(env)}`, seen: true, t: at(-30 + (i % 20), 11),
    policies: policiesOf(def), tiers: PARTNER.includes(def.name) ? structuredClone(TIERS) : [], contracts,
  })
}

// ---------- Runtime Manager ----------

const TIMEOUT = { Experience: '8000', Process: '6000', System: '4000' }
function appOf(s, def, i, env, build = def.build) {
  const sbx = env === 'Sandbox'
  const [replicas, vCores] = sbx ? [1, 0.1] : (def.prd ?? [1, 0.2])
  const c = creds(s, env)
  const calls = callsOf(def)
  const client = calls.length ? clientOf(def) : null
  const b = def.backend
  return newApp(def.name, {
    env, replicas, vCores, target: SPACE, publicEndpoint: def.layer === 'Experience', jar: `${def.name}-${build}-mule-application.jar`, updated: at(-1 - ((i * 7) % 25), 9 + (i % 8)),
    autodiscovery: { apiId: '${api.id}', flowRef: `${def.name}-main` },
    props: {
      [LAYER_PROPERTY]: def.layer, 'api.id': apiIdOf(i, env), ...(calls.length && { 'http.timeout': TIMEOUT[def.layer] }),
      ...Object.fromEntries(calls.map((t) => [urlKey(t), internal(t, env)])), ...(client && { 'client.id': client.clientId }), ...(b && { [b.key]: sbx ? b.sbx : b.prd }), ...c.props,
    },
    // the carrier key of Production was rotated by Bayline, and the app still has the old one
    secrets: { ...(client && { 'client.secret': client.clientSecret }), ...(b && { [b.secret]: def.name === 'carriers-sys-api' && !sbx ? 'carriers-prd-2025' : secretOf(def, env) }), ...c.secrets },
  })
}

// ---------- traffic and alerts ----------

// Few flows at a low rate, so a week of the console stays small. Each one runs a main path end to end.
export const ENTERPRISE_TRAFFIC = [
  { app: 'web-shop-exp-api', env: 'Sandbox', client: 'Harbor Web Shop', method: 'POST', path: '/checkout', body: '{"cartId":"K-55","payment":"card"}', perMinute: 1, every: 30 },
  { app: 'store-tablet-exp-api', env: 'Sandbox', client: 'Store Tablet', path: '/returns/R-310', perMinute: 1, every: 30 },
  // four calls in one minute on a tier of three: one of them gets 429
  { app: 'supplier-exp-api', env: 'Sandbox', client: 'Northwind Supplies', token: 'valid', path: '/purchase-orders/PO-7781', perMinute: 4, every: 30 },
  { app: 'mobile-app-exp-api', env: 'Production', client: 'Harbor Mobile App', path: '/products/H-100', perMinute: 1, every: 30 },
]

const MAIL = [
  'Welcome to the integration team. Our estate has 37 APIs in three layers. All of them run in Sandbox. Phase 1, the mobile app with every API it reaches, is live in Production. The web shop, stores, B2B, suppliers, carriers, finance and planning follow in phase 2. Start in Exchange to see the APIs by domain, then open API Manager and Runtime Manager. Here is what waits for you this week.',
  '1. Pelican Wholesale is a new partner. It asked for the Gold tier on partner-b2b-exp-api in Sandbox. Approve the contract in API Manager and send them the client ID of their application.',
  '2. Northwind Supplies is on the Bronze tier of supplier-exp-api. Monitoring shows 429 answers for them. They asked for Silver.',
  '3. products-sys-api runs v1 and v2 side by side. The API instances page of the asset in Exchange shows who still uses v1. It is store-ops-prc-api.',
  '4. customers-sys-api v1 is deprecated and retires on 31 January 2027. returns-prc-api is the last consumer.',
  '5. catalog-prc-api 2.2.0 passed its tests in Sandbox. Production still runs 2.1.0. Promote it. Compare the properties of both environments first, because the hosts and the keys differ.',
  '6. The carrier alert fired in Production. carriers-sys-api gets 401 from Bayline. Bayline rotated the key. The new one is in the key vault harbor-kv as carrier-apikey-prd. Update the secure property carrier.apikey.',
  '7. promotions-sys-api failed its last deploy in Sandbox. Read the logs and fix the property. loyalty-sys-api is stopped in Sandbox while the loyalty platform gets an upgrade.',
  '8. replenishment-nightly-job runs at 02:30 every night. Check its last run in the Schedules tab.',
  '9. Send POST /checkout to web-shop-exp-api with the API client, then open Visualizer. Follow the order from the web shop through orders-prc-api to payment, stock, warehouse, carrier and the customer mail.',
  'Lena Dorsey, integration lead',
].join(' ')

// Phase 1 of the program is live in Production: the mobile app, with every API it reaches. The web shop, stores, B2B,
// suppliers, carriers, finance and planning run in Sandbox and go live in phase 2. It also keeps a week of the console small.
const closure = (names) => {
  const seen = new Set()
  const visit = (n) => !seen.has(n) && (seen.add(n), callsOf(ESTATE.find((d) => d.name === n)).forEach(visit))
  names.forEach(visit)
  return seen
}
export const LIVE = closure(['mobile-app-exp-api'])
// catalog-prc-api 2.2.0 passed its tests in Sandbox. Production still runs 2.1.0.
const PROMOTE = 'catalog-prc-api'
const jarOf = (name, build) => ({ pkg: name, autodiscovery: { apiId: '${api.id}', flowRef: `${name}-main` }, jar: `${name}-${build}-mule-application.jar` })

// Adds the estate to the open console. The guided labs do not use it.
export function addEnterprise(state) {
  let s = structuredClone(state)
  // v1 before v2, so Exchange shows the newest version of each asset first
  const order = ESTATE.map((d, i) => ({ d, i })).sort((a, b) => (a.d.asset && a.d.asset === b.d.asset ? (a.d.apiVersion < b.d.apiVersion ? -1 : 1) : a.i - b.i))
  s.assets.push(...order.map(({ d, i }) => assetOf(d, i)))
  s.clients.push(...structuredClone(CHANNELS), ...callers.map(clientOf))
  for (const env of ['Sandbox', 'Production']) {
    ESTATE.forEach((d, i) => {
      if (d.planned || (env === 'Production' && !LIVE.has(d.name))) return
      s.apis.push(apiOf(d, i, env))
      s.apps.push(appOf(s, d, i, env, d.name === PROMOTE ? '2.1.0' : d.build))
    })
  }
  // the nightly job of the supply chain, next to the APIs in Sandbox
  s.apps.push(newApp('replenishment-nightly-job', { target: SPACE, publicEndpoint: false, updated: at(-9, 15), props: { [LAYER_PROPERTY]: 'Process', 'sftp.host': 'sftp.harbor.lab', 'forecast.folder': '/planning/outbound' }, secrets: { 'sftp.password': 'lab' } }))
  s.jars.push(jarOf(PROMOTE, '2.1.0'), jarOf(PROMOTE, '2.2.0'), 'replenishment-nightly-job')
  s.traffic.push(...structuredClone(ENTERPRISE_TRAFFIC))
  // the Production API instance of carriers-sys-api has an alert for server errors
  s.apis.find((a) => a.env === 'Production' && a.label === 'carriers-sys-api-prd').alerts.push({ id: 'ent-al-carriers', enabled: true, state: 'OK', name: 'Carrier errors', severity: 'Critical', type: 'Response Code', codes: [500], atLeast: 1, periods: 1, period: 60, recipients: OPS })
  s.monAlerts.push({ id: 'ent-al-checkout', enabled: true, created: at(-5), state: 'No data', env: 'Sandbox', title: 'Checkout errors', resource: 'Application', name_: 'orders-prc-api', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, recipients: OPS, minutes: 1 })
  // the new carrier key next to the old one, in the key vault of Harbor
  const kv = s.systems?.vaults?.['harbor-kv']
  if (kv) kv.secrets['carrier-apikey-prd'] = { versions: [
    { id: hash('carrier-old') + hash('carrier-old-2') + hash('a') + hash('b'), value: 'carriers-prd-2025', created: at(-300), enabled: true, expires: at(0, 6), contentType: 'API key' },
    { id: hash('carrier-new') + hash('carrier-new-2') + hash('c') + hash('d'), value: 'carriers-prd-2026', created: at(-2, 14), enabled: true, contentType: 'API key' },
  ] }
  // a few deployments, so the configuration history has something to show
  s = change(s, PROMOTE, { jar: `${PROMOTE}-2.2.0-mule-application.jar`, props: { ...s.apps.find((a) => a.name === PROMOTE && a.env === 'Sandbox').props, 'http.timeout': '5000' } })
  // a rename of a property that the app still needs: the deploy fails
  const promo = s.apps.find((a) => a.name === 'promotions-sys-api' && a.env === 'Sandbox')
  const { 'promo.engine.url': url, ...rest } = promo.props
  s = change(s, 'promotions-sys-api', { model: 'Recreate', props: { ...rest, 'promo.engine.endpoint': url } })
  // the loyalty platform gets an upgrade, so its System API is stopped in Sandbox
  s.apps.find((a) => a.name === 'loyalty-sys-api' && a.env === 'Sandbox').status = 'Stopped'
  return s
}

// The morning the learner arrives: a customer opens the tracking of their order in the mobile app, the carrier
// lookup fails in Production and the carrier alert fires. Then the integration lead sends the welcome mail. The calls run
// here and not as steady traffic, so a week of failing calls does not fill the log of carriers-sys-api.
export function welcomeMail(state) {
  const c = CHANNELS.find((x) => x.name === 'Harbor Mobile App')
  let s = state
  for (const path of ['/orders/O-2001/tracking']) s = callApi(s, { env: 'Production', app: 'mobile-app-exp-api', method: 'GET', path, client: c.name, clientId: c.clientId, clientSecret: c.clientSecret }).state
  return { ...s, lastCalls: state.lastCalls ?? [], mail: [...s.mail, { t: s.clock, to: 'you@harbor.example', subject: 'Your first week at Harbor', body: MAIL, source: 'Lena Dorsey' }] }
}
