// The API-led project of Harbor Foods: what is designed, published, managed and deployed. The open console starts with all
// of it, and each lab starts with a part of it missing or broken.
import { addMonAlert, at, newApi, newApp, newPlatform, newHybrid, newServer } from './platform.js'
import { asset, CLIENTS, creds, OPS, policy, until } from './platform-kit.js'
import { LAYER_PROPERTY } from './platform-led.js'

export const PRIVATE_SPACE = 'harbor-ps'
export const internal = (name, env = 'Sandbox') => `https://${name}-lab1a2.internal-${env === 'Sandbox' ? 'sbx' : 'prd'}.usa-e2.cloudhub.example/api`

const spec = (title, body) => `#%RAML 1.0
title: ${title}
version: v1
mediaType: application/json
${body}`
const getOne = (path, id, example, what) => `${path}:
  /{${id}}:
    get:
      description: ${what}
      responses:
        200:
          body:
            example: |
              ${JSON.stringify(example)}
        404:
          body:
            example: |
              { "message": "Not found" }
`
const postOne = (example) => `  post:
    description: Create an order
    responses:
      201:
        body:
          example: |
            ${JSON.stringify(example)}
`
export const LED = {
  mobile: {
    app: 'mobile-orders-eapi', id: '19500101', layer: 'Experience', name: 'Mobile Orders Experience API',
    raml: spec('Mobile Orders Experience API', getOne('/my-orders', 'orderId', { id: 'O-1001', status: 'PACKED', inStock: true }, 'The status of one order, short') + postOne({ id: 'O-1050' })),
    contracts: [['Mobile App', '']],
    client: { name: 'Mobile Orders API', clientId: 'moe-2b71', clientSecret: 'moe-secret-07' },
  },
  partner: {
    app: 'partner-orders-eapi', id: '19500102', layer: 'Experience', name: 'Partner Orders Experience API',
    raml: spec('Partner Orders Experience API', getOne('/partner-orders', 'orderId', { orderId: 'O-1001', status: 'PACKED', customer: { id: 'C-7', name: 'Harbor Deli' }, stock: 24 }, 'The status of one order with its customer and stock') + postOne({ orderId: 'O-1050' })),
    policies: ['rate-limit-sla'],
    tiers: [{ name: 'Gold', requests: 60, periodMs: 60000, autoApprove: false }, { name: 'Silver', requests: 10, periodMs: 60000, autoApprove: true }],
    contracts: [['Partner Portal', 'Silver']],
    client: { name: 'Partner Orders API', clientId: 'poe-88d3', clientSecret: 'poe-secret-21' },
  },
  process: {
    app: 'order-fulfilment-papi', id: '19500201', layer: 'Process', name: 'Order Fulfilment Process API',
    raml: spec('Order Fulfilment Process API', `/orders:
  post:
    description: Check the customer and the stock, create the order and send an event
    responses:
      201:
        body:
          example: |
            {"orderId":"O-1050"}
  /{orderId}/status:
    get:
      description: Join the order, the customer and the stock
      responses:
        200:
          body:
            example: |
              {"orderId":"O-1001","status":"PACKED","customer":{"id":"C-7"},"stock":24}
`),
    contracts: [['Mobile Orders API', ''], ['Partner Orders API', '']],
    client: { name: 'Order Fulfilment API', clientId: 'ofp-4c19', clientSecret: 'ofp-secret-63' },
  },
  customers: {
    app: 'customers-sapi', id: '19500301', layer: 'System', name: 'Customers System API',
    raml: spec('Customers System API', getOne('/customers', 'customerId', { id: 'C-7', name: 'Harbor Deli', email: 'orders@harbordeli.example' }, 'One customer')),
    contracts: [['Order Fulfilment API', '']],
  },
  orders: {
    app: 'orders-sapi', id: '19500302', layer: 'System', name: 'Orders System API',
    raml: spec('Orders System API', getOne('/orders', 'orderId', { orderId: 'O-1001', status: 'PACKED', customerId: 'C-7' }, 'One order') + postOne({ orderId: 'O-1050' })),
    tiers: [{ name: 'Internal', requests: 1000, periodMs: 60000, autoApprove: false }],
    contracts: [['Order Fulfilment API', 'Internal']],
  },
  inventory: {
    app: 'inventory-sapi', id: '19500303', layer: 'System', name: 'Inventory System API',
    raml: spec('Inventory System API', getOne('/inventory', 'sku', { sku: 'H-100', available: 24 }, 'The stock of one product')),
    contracts: [['Order Fulfilment API', '']],
  },
}
const KEYS = Object.keys(LED)
const assetId = (d) => d.name.toLowerCase().replace(/ /g, '-')
export const ledClient = (key) => LED[key].client
const prodId = (d) => d.id.replace('195', '196')

// The properties of each application that are its own. The rest is the layer, the API ID and the platform credentials.
export function ownProps(key, env = 'Sandbox') {
  if (key === 'mobile' || key === 'partner') return { props: { 'papi.url': internal(LED.process.app, env), 'papi.client_id': LED[key].client.clientId, 'http.timeout': '5000' }, secrets: { 'papi.client_secret': LED[key].client.clientSecret } }
  if (key === 'process')
    return {
      props: { 'customers.url': internal(LED.customers.app, env), 'orders.url': internal(LED.orders.app, env), 'inventory.url': internal(LED.inventory.app, env), 'sapi.client_id': LED.process.client.clientId, 'http.timeout': '10000', 'events.queue': 'order-events' },
      secrets: { 'sapi.client_secret': LED.process.client.clientSecret },
    }
  return { props: { customers: { 'db.host': 'sql01.harbor.lab' }, orders: { 'db.host': 'ora01.harbor.lab' }, inventory: { 'sftp.host': 'sftp.harbor.lab' } }[key], secrets: {} }
}
// The whole property list, as lines for the Text view of the Properties tab
export function propText(s, key, env = 'Sandbox', apiId) {
  const all = { [LAYER_PROPERTY]: LED[key].layer, ...ownProps(key, env).props, 'api.id': apiId ?? '(the API Instance ID)', ...creds(s, env).props }
  return Object.entries(all).map(([k, v]) => `${k}=${v}`).join('\n')
}
// Everything a deployment of one application of the project needs
export function ledForm(s, key, apiId, env = 'Sandbox') {
  const d = LED[key]
  const own = ownProps(key, env)
  const c = creds(s, env)
  return { name: d.app, ...jarOf(key), replicas: 1, vCores: 0.1, target: PRIVATE_SPACE, publicEndpoint: d.layer === 'Experience', props: { [LAYER_PROPERTY]: d.layer, ...own.props, 'api.id': apiId, ...c.props }, secrets: { ...own.secrets, ...c.secrets } }
}
export const jarOf = (key) => ({ pkg: LED[key].app, autodiscovery: { apiId: '${api.id}', flowRef: `${LED[key].app}-main` }, jar: `${LED[key].app}-1.0.0-mule-application.jar` })

export const ledApi = (key, env = 'Sandbox') => {
  const d = LED[key]
  return newApi(env === 'Sandbox' ? d.id : prodId(d), {
    name: d.name, assetId: assetId(d), env, label: `${d.app}-${env === 'Sandbox' ? 'sbx' : 'prd'}`, seen: true,
    policies: (d.policies ?? ['client-id']).map((p) => policy(p)), tiers: structuredClone(d.tiers ?? []),
    contracts: d.contracts.map(([client, tier]) => ({ client, tier, status: 'approved', t: 0 })),
  })
}
export const ledApp = (s, key, env = 'Sandbox') => {
  const { name, ...form } = ledForm(s, key, env === 'Sandbox' ? LED[key].id : prodId(LED[key]), env)
  return newApp(name, { ...form, env })
}

const MOBILE_TRAFFIC = { app: LED.mobile.app, env: 'Sandbox', client: 'Mobile App', path: '/my-orders/O-1001', perMinute: 1 }
const PARTNER_TRAFFIC = { app: LED.partner.app, env: 'Sandbox', client: 'Partner Portal', path: '/partner-orders/O-1002', perMinute: 1, every: 2 }

// `skip` leaves out the API instance and the application of some keys. `traffic` is the callers that run with the clock.
export function ledProject({ skip = [], traffic = [MOBILE_TRAFFIC, PARTNER_TRAFFIC], ...extra } = {}) {
  const s = newPlatform({
    clock: at(1, 8, 30),
    clients: structuredClone([...CLIENTS, LED.mobile.client, LED.partner.client, LED.process.client]),
    assets: KEYS.map((k) => asset(assetId(LED[k]), LED[k].name, LED[k].raml)),
    projects: KEYS.map((k, i) => ({ id: `led${i}`, name: LED[k].name, raml: LED[k].raml, updated: at(0, 10), published: '1.0.0' })),
    jars: [...KEYS.map(jarOf), 'warehouse-consumer'],
    queues: [
      { name: 'order-events', type: 'Standard queue', dlq: 'order-events-dlq', attempts: 5, messages: [] },
      { name: 'order-events-dlq', type: 'Standard queue', dlq: '', attempts: 5, messages: [] },
    ],
    ...extra,
  })
  const keys = KEYS.filter((k) => !skip.includes(k))
  s.apis = keys.map((k) => ledApi(k))
  s.apps = keys.map((k) => ledApp(s, k))
  s.apps.push(newApp('warehouse-consumer', { target: PRIVATE_SPACE, publicEndpoint: false, props: { [LAYER_PROPERTY]: 'Process', 'queue.name': 'order-events' } }))
  s.traffic = structuredClone(traffic)
  return s
}
export const patchApp = (s, key, patch) => {
  const a = s.apps.find((x) => x.name === LED[key].app && x.env === 'Sandbox')
  Object.assign(a, patch, { props: { ...a.props, ...patch.props }, secrets: { ...a.secrets, ...patch.secrets } })
  return s
}

// Two Windows servers in the data center of Harbor, with the Mule runtime installed and not registered yet
export const defaultHybrid = () => newHybrid([newServer('HBR-MULE-01', { ip: '10.20.1.11' }), newServer('HBR-MULE-02', { ip: '10.20.1.12' })])

// The open console: the whole project, and the scheduled jobs of the same company
export function openConsole() {
  let s = ledProject({ clock: at(0, 12), traffic: [{ ...MOBILE_TRAFFIC, every: 5 }, { ...PARTNER_TRAFFIC, every: 10 }, { ...MOBILE_TRAFFIC, method: 'POST', path: '/my-orders', every: 30 }] })
  s.apps.push(
    newApp('orders-nightly-load', { props: { 'db.host': 'sql01.harbor.lab', 'db.port': '1433', 'db.user': 'mule_etl' }, secrets: { 'db.password': 'Nightly-2026' } }),
    newApp('customer-export', { props: { 'blob.account': 'harborstore', 'blob.container': 'customer-exports' } }),
    newApp('stock-file-poll', { props: { 'sftp.host': 'sftp.harbor.lab' }, secrets: { 'sftp.password': 'lab' } }),
  )
  s.hybrid = defaultHybrid()
  s.jars.push({ pkg: 'orders-sapi-v2', autodiscovery: jarOf('orders').autodiscovery, jar: 'orders-sapi-2.0.0-mule-application.jar' }, 'orders-nightly-load', 'customer-export', 'stock-file-poll', 'search-eapi')
  const alert = { resource: 'Application', severity: 'High', operator: 'Above', recipients: OPS, minutes: 1 }
  s = addMonAlert(s, { ...alert, title: 'Errors in the process layer', name_: LED.process.app, metric: 'Message Error Count', threshold: 0 })
  s = addMonAlert(s, { ...alert, title: 'Mobile API is slow', name_: LED.mobile.app, metric: 'Average Response Time', threshold: 2000, minutes: 2 })
  s = addMonAlert(s, { ...alert, title: 'Customer export failed', name_: 'customer-export', metric: 'Message Error Count', threshold: 0 })
  for (const key of ['mobile', 'partner']) s.apis.find((a) => a.id === LED[key].id).alerts.push({ id: `led-al-${key}`, enabled: true, state: 'OK', name: 'Policy violations', severity: 'Warning', type: 'Policy Violation', policy: 'Any', atLeast: 3, periods: 1, period: 5, recipients: OPS })
  return until(s, at(1, 9))
}
