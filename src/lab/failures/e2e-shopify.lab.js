// The end to end lab of Shopify: order webhooks from Shopify into the order system through Anypoint MQ, and stock
// levels back to Shopify with the Admin GraphQL API, from the request mail to Production. See platform-labs.js for the
// shape of a lab.
import { addApi, addMonAlert, advance, apiStatus, applyPolicy, at, callApi, createProject, deployApp, endpointOf, finishDeploys, importSpec, jarsOf, mark, MINUTE, mockCall, newApp, newPlatform, packageJar, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio, viewMessages } from '../platform.js'
import { ask, call, creds, OPS } from '../platform-kit.js'
import { createQueue, moveBack } from '../platform-mq.js'
import { addressOf, API_VERSION, availableOf, createApp, createSubscription, createTestOrder, installApp, newShopifyStore, revealToken, saveScopes, SHOP, WAREHOUSE } from '../platform-shopify.js'
import { ASSET, MAIN, NAME, OMS, WEBHOOK_PATH } from './e2e-shopify.pkg.js'

const TEAM = 'ecommerce-integration@brightmart.example'
const APP = 'shopify-order-sync'
const SHOP_APP = 'Brightmart Order Stock Sync'
const QUEUE = 'shopify-orders'
const DLQ = 'shopify-orders-dlq'
const ATTEMPTS = 3
const SCOPES = ['read_orders', 'write_inventory']
const WAREHOUSE_CLIENT = { name: 'Brightmart Warehouse', clientId: 'whs-31a9e0', clientSecret: 'whs-secret-5b72' }
const STOCK = { sku: 'H-1250', available: 236 }
const LIVE = { shop: 'brightmart-live.myshopify.com', token: 'shpat_labLiveStorePracticeValue', secret: 'shpss_labLiveStorePracticeValue', queue: 'shopify-orders-prd' } // made-up lab values
const body = (x) => JSON.stringify(x)

const RAML = `#%RAML 1.0
title: Store Stock API
version: v1
mediaType: application/json
types:
  Stock:
    properties:
      available:
        type: integer
        minimum: 0
/stock/{sku}:
  put:
    description: Set the available quantity of one SKU at the Brightmart Warehouse location in Shopify
    body:
      type: Stock
    responses:
      200:
        body:
          example: |
            { "sku": "H-1250", "available": 236, "delta": -4 }
      404:
        body:
          example: |
            { "message": "No product variant in Shopify has SKU H-9999" }
`
const STUDIO = `<http:request-config name="Shopify_Admin_API">
  <http:request-connection protocol="HTTPS" host="\${shopify.shop}" port="443" />
  <http:default-headers>
    <http:default-header key="X-Shopify-Access-Token" value="\${shopify.accessToken}" />
  </http:default-headers>
</http:request-config>
<anypoint-mq:config name="MQ_Config">
  <anypoint-mq:connection url="\${mq.url}" clientId="\${mq.clientId}" clientSecret="\${mq.clientSecret}" />
</anypoint-mq:config>
<api-gateway:autodiscovery apiId="\${api.id}" flowRef="${MAIN}" />

<!-- in: orders/create webhooks. Check the HMAC on the raw body, answer fast, do the work behind a queue -->
<flow name="shopify-order-webhook-flow">
  <http:listener config-ref="HTTPS_Listener" path="/api${WEBHOOK_PATH}" />
  <set-variable variableName="valid" value="#[%dw 2.0 import * from dw::Crypto
    output application/java ---
    toBase64(HMACBinary(p('shopify.apiSecret') as Binary, payload.^raw, 'HmacSHA256'))
      == attributes.headers.'x-shopify-hmac-sha256']" />
  <validation:is-true expression="#[vars.valid]" doc:name="Reject webhook" />
  <ee:transform doc:name="Shopify order to OMS order">
    <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  source: "shopify", orderRef: payload.name, shopifyId: payload.id,
  email: payload.email, total: payload.total_price as Number, currency: payload.currency,
  lines: payload.line_items map { sku: $.sku, qty: $.quantity, price: $.price as Number }
}]]></ee:set-payload></ee:message>
  </ee:transform>
  <anypoint-mq:publish config-ref="MQ_Config" destination="\${oms.queue}" />
</flow>

<!-- out: PUT /stock/{sku} -> inventorySetQuantities on the Admin GraphQL API -->
<flow name="put:\\stock\\(sku):application\\json:store-stock-api-config">
  <http:request config-ref="Shopify_Admin_API" method="POST" path="/admin/api/\${shopify.apiVersion}/graphql.json">
    <http:body>#[{ query: "mutation setStock($input: InventorySetQuantitiesInput!) { ... }",
      variables: { input: { name: "available", reason: "correction", ignoreCompareQuantity: true,
        quantities: [{ inventoryItemId: vars.itemId, locationId: "gid://shopify/Location/" ++ p('shopify.locationId'),
                       quantity: payload.available }] } } }]</http:body>
  </http:request>
</flow>`

const y = (s) => s.shopify
const asset = (s) => s.assets.find((a) => a.assetId === ASSET)
const project = (s) => s.studio.find((p) => p.assetId === ASSET && p.pkg === NAME)
const apiOf = (s, env = 'Sandbox') => s.apis.find((a) => a.assetId === ASSET && a.env === env)
const appOf = (s, env = 'Sandbox') => s.apps.find((a) => a.pkg === NAME && a.env === env && a.status === 'Running')
const oms = (s) => s.apps.find((a) => a.name === OMS && a.env === 'Sandbox')
const omsOrders = (s) => oms(s)?.store?.orders ?? []
const shopApp = (s) => (y(s)?.apps ?? []).find((a) => a.name.toLowerCase() === SHOP_APP.toLowerCase())
const sameSet = (list, want) => Array.isArray(list) && list.length === want.length && want.every((x) => list.includes(x))
const queueOf = (s, name) => s.queues.find((q) => q.name === name)
const contract = (s, env = 'Sandbox') => apiOf(s, env)?.contracts.some((c) => c.client === WAREHOUSE_CLIENT.name && c.status === 'approved')
const queuesOk = (s) => Boolean(queueOf(s, DLQ)) && queueOf(s, QUEUE)?.dlq === DLQ && Number(queueOf(s, QUEUE).attempts) >= 2 && Number(queueOf(s, QUEUE).attempts) <= 5
const deployOk = (s) => {
  const a = appOf(s)
  const api = apiOf(s)
  const x = shopApp(s)
  if (!a || !api || !x?.installed) return false
  const p = a.props
  return (
    p['shopify.shop'] === SHOP && p['shopify.apiVersion'] === API_VERSION && String(p['shopify.locationId']) === String(WAREHOUSE) && p['oms.queue'] === QUEUE &&
    a.secrets?.['shopify.accessToken'] === x.token && a.secrets?.['shopify.apiSecret'] === x.secret && !('shopify.accessToken' in p) && !('shopify.apiSecret' in p) && !('anypoint.platform.client_secret' in p) &&
    apiStatus(s, api) === 'Active'
  )
}
const sub = (s) =>
  (y(s)?.webhooks ?? []).find((w) => {
    const to = addressOf(w.address)
    return w.app === shopApp(s)?.id && w.topic === 'orders/create' && to?.app === APP && to.env === 'Sandbox' && !to.internal && to.path === WEBHOOK_PATH
  })
// an order of the store, made after the subscription, with this SKU, that reached the order system
const arrived = (s, sku) => Boolean(sub(s)) && (y(s)?.orders ?? []).some((o) => o.t >= sub(s).created && o.lines.some((l) => l.sku === sku) && omsOrders(s).some((x) => x.orderRef === o.name))

const lab = {
  id: 'p-e2e-shopify',
  group: 'End to end by system',
  title: 'End to end: web orders and stock, Shopify to the order system and back',
  minutes: 60,
  scenario: `Brightmart sells through its Shopify store ${SHOP}. The order system ${OMS} must get each web order within a minute, and Shopify must show the stock the warehouse counts. You build ${APP}, a Mule app on CloudHub 2.0: it takes the orders/create webhooks, checks their HMAC, maps the order in DataWeave and puts it on the Anypoint MQ queue ${QUEUE}, which the order system reads; and its Store Stock API (PUT /stock/{sku}) sets the available quantity in Shopify with the GraphQL mutation inventorySetQuantities. An order travels: Shopify, webhook, HMAC check, DataWeave, queue, order system. Stock travels back: warehouse, API Manager, flow, GraphQL, Shopify. Take it from the request mail through design, build, Shopify and MQ setup, deployment, a traced order, a failure, an alert and Production.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      studioPkgs: { [ASSET]: NAME },
      clients: [WAREHOUSE_CLIENT],
      apps: [newApp(OMS, { props: { 'oms.queue': QUEUE }, store: { items: ['H-1250', 'H-1300', 'H-2100'], orders: [] } })],
      shopify: newShopifyStore(at(1, 9), { nextOrder: 3101 }),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Shopify orders in, stock out: request',
          body: `Hello, the order system ${OMS} should get each web order of ${SHOP} within a minute, instead of the export at night. It reads Anypoint MQ queue ${QUEUE}; please create it with a dead letter queue ${DLQ} and ${ATTEMPTS} delivery attempts.\nThe other way: the warehouse system counts stock several times a day and must set the available quantity in Shopify for the location Brightmart Warehouse (${WAREHOUSE}) with PUT /stock/{sku}, so the store stops selling what we do not have.\nShopify custom app ${SHOP_APP}: it reads orders and writes inventory, nothing more. Webhooks in JSON, API version ${API_VERSION}.\nAn order the order system cannot take must not be lost. Alerts to ${TEAM}.\nAbout 900 orders a day, 30 a minute at peak.\n\nThanks, Ecommerce team`,
          source: 'Brightmart ecommerce team',
        },
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Shopify live store: the Production values',
          body: `The live store is ${LIVE.shop}. We installed ${SHOP_APP} there with the same two scopes. Its practice Admin API access token is ${LIVE.token} and its API secret key ${LIVE.secret}. The order system reads ${LIVE.queue} in Production.\nBrightmart ecommerce team`,
          source: 'Brightmart ecommerce team',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Read both mails: both directions, the queue and its dead letter queue, the scopes, the error rule, the alert address and the live store.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Design the Store Stock API',
      how: 'Design Center, Create new, New API Specification, name Store Stock API. Write the RAML below: PUT /stock/{sku} with the available quantity.',
      code: RAML,
      done: (s) => s.projects.some((p) => ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'PUT', '/stock/H-1250').status === 200),
    },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the Mocking service, choose PUT /stock/{sku}, Try it, Send. The warehouse team builds against the example.', done: (s) => Boolean(s.seen.mock) && s.projects.some((p) => /stock/i.test(p.name)) },
    { title: 'Publish it to Exchange', how: `Publish, Publish to Exchange. Asset ID ${ASSET}, version 1.0.0, API version v1, LifeCycle State Stable.`, done: (s) => Boolean(asset(s)) },
    {
      title: 'Build the flows in Studio',
      how: `Open Anypoint Studio from the menu and choose Import a published API, ${ASSET}. The project holds the flows your team wrote on this spec. The important part is below: the Shopify and MQ configs with \${property} placeholders, the webhook flow with the HMAC check, the DataWeave to the order of the order system and anypoint-mq:publish, and the stock flow with inventorySetQuantities.`,
      code: STUDIO,
      done: (s) => Boolean(project(s)),
    },
    ask(
      'Answer fast',
      'Why does the webhook flow publish to a queue and answer 200 at once, instead of calling the order system before it answers?',
      [
        'Queues are cheaper than HTTP',
        'Shopify waits 5 seconds for a 2xx. A slow or down order system would make deliveries fail, Shopify would retry, and after 8 failures in a row over 4 hours it removes the subscription. Behind a queue the order system can be slow or down, and the dead letter queue keeps what it refuses',
        'Shopify only accepts 202',
        'The order system cannot read JSON',
      ],
      1,
      'A webhook receiver checks the signature, stores the event and answers. The work happens behind the queue with its own redelivery and dead letter queue, so a problem in the order system never reaches Shopify. A reconcile with the Admin API catches anything a webhook missed.',
    ),
    { title: 'Add Autodiscovery and export the jar', how: `In Studio open Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${MAIN}. Then choose Export.`, done: (s) => Boolean(project(s)?.jar && project(s).autodiscovery?.apiId === '${api.id}' && project(s).autodiscovery.flowRef === MAIN) },
    {
      title: 'Create the Shopify custom app with two scopes',
      how: `Shopify from the console menu, Apps and sales channels, Develop apps, Create an app: App name ${SHOP_APP}, App developer ${OPS}, Create app. Configuration, Admin API access scopes: tick read_orders and write_inventory only (write includes read), Save. API credentials, Install app. Then Reveal token once and copy the shpat_ token, and copy the API secret key: it signs the webhooks.`,
      done: (s) => Boolean(shopApp(s)?.installed) && sameSet(shopApp(s).granted, SCOPES) && Boolean(shopApp(s).tokenShown),
    },
    {
      title: 'Create the queue and its dead letter queue',
      how: `MQ, Destinations, + Add, Queue. First ${DLQ}, Standard queue, Create Queue. Then + Add, Queue: ${QUEUE}, Standard queue, check Assign a Dead Letter Queue, Dead Letter Queue Name ${DLQ}, Delivery attempts before reroute ${ATTEMPTS}. Create Queue.`,
      done: queuesOk,
    },
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select ${ASSET}, Save & Deploy, and note the API Instance ID. Then Policies, Add policy, Client ID Enforcement, Apply. Open Environment information for the client ID and secret of Sandbox. Shopify does not send a client ID: the webhook listener is a flow of its own and checks the HMAC instead.`,
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    { title: 'Give the warehouse a contract', how: `Exchange, Store Stock API, Request access. Pick the API instance of Sandbox and the application ${WAREHOUSE_CLIENT.name}, then Request access.`, done: (s) => Boolean(contract(s)) },
    {
      title: 'Deploy the app to Sandbox',
      how: `Runtime Manager, Deploy application. Name ${APP}, choose the exported file ${ASSET}-1.0.0-mule-application.jar. Properties: shopify.shop ${SHOP}, shopify.apiVersion ${API_VERSION}, shopify.locationId ${WAREHOUSE}, oms.queue ${QUEUE}, api.id the API Instance ID, anypoint.platform.client_id of Sandbox. Protect shopify.accessToken, shopify.apiSecret and anypoint.platform.client_secret. Deploy Application. The app is Running and the API instance Active.`,
      done: deployOk,
    },
    {
      title: 'Subscribe to orders/create',
      how: `Shopify, Apps, ${SHOP_APP}, Webhooks, Create subscription. Topic orders/create, Format JSON, API version ${API_VERSION}, URL the public endpoint of ${APP} from Runtime Manager followed by /api${WEBHOOK_PATH}. Create.`,
      done: (s) => deployOk(s) && Boolean(sub(s)),
    },
    {
      title: 'Follow a web order into the order system',
      how: `Shopify, Orders, Create test order: H-1250, quantity 1. Move the clock 2 minutes. Apps, ${SHOP_APP}, Webhooks, Deliveries shows 200 OK. Runtime Manager, ${APP}, Logs: the webhook ID and the order number put on ${QUEUE}. Then API client, application ${OMS}, GET /orders lists the order with its lines. One order in Shopify, one in the order system.`,
      done: (s) => arrived(s, 'H-1250') && Boolean(s.seen[`logs:${APP}`]),
    },
    ask(
      'The same webhook twice',
      'Shopify sends a webhook again when it got no 200 in time, even if the app had already taken it. How does the app keep the order from being stored twice?',
      ['It cannot', 'It keeps the X-Shopify-Webhook-Id of each webhook it took and skips one it has seen, and the order system also skips an orderRef it has. Each step is idempotent, so a retry does no harm', 'It answers 500 to every second webhook', 'Shopify never sends a webhook twice'],
      1,
      'Delivery is at least once: a timeout, a deploy or a network glitch makes Shopify try again. X-Shopify-Webhook-Id is the same on every retry of one event, so it is the key to skip duplicates; the order number is the business key the order system checks. In the lab both checks are in the apps.',
    ),
    {
      title: 'Send stock back to Shopify',
      how: `API client, application ${APP}, PUT /stock/${STOCK.sku} as ${WAREHOUSE_CLIENT.name} with ${body({ available: STOCK.available })}. The flow finds the inventory item of the SKU and runs inventorySetQuantities; the log shows the delta. Shopify, Products: ${STOCK.sku} shows ${STOCK.available} available at Brightmart Warehouse.`,
      done: (s) => availableOf(y(s), STOCK.sku, WAREHOUSE) === STOCK.available && Boolean(s.seen['shopify:products']) && (s.lastCalls ?? []).some((c) => c.app === APP && c.method === 'PUT' && c.status === 200),
    },
    {
      title: 'Send an order the order system refuses',
      how: `Shopify, Orders, Create test order: H-2000 (Rope lantern), quantity 1. Move the clock 2 minutes. The webhook is taken, but the order system does not know H-2000 and fails with OMS:UNKNOWN_ITEM. After ${ATTEMPTS} delivery attempts the message goes to ${DLQ}: MQ, ${DLQ}, Message Browser, Get Messages. Nothing is lost.`,
      done: (s) => (oms(s)?.store?.failed ?? []).length > 0 && Boolean(s.seen[`mq:${DLQ}`]),
    },
    {
      title: 'Fix it and replay from the dead letter queue',
      how: `Fix the cause first: API client, application ${OMS}, POST /items with ${body({ sku: 'H-2000' })}, as the order system team does for a new product. Then MQ, ${DLQ}, Message Browser, Move messages back: Source queue ${QUEUE}, Move all. Move the clock a minute. GET /orders of ${OMS} lists the order.`,
      done: (s) => arrived(s, 'H-2000') && (queueOf(s, DLQ)?.messages.length ?? 1) === 0,
    },
    { title: 'Alert the ecommerce team', how: `Monitoring, Alerts, Create Alert. Resource type Application, ${OMS}, metric Message Error Count, Above 0 for 1 minute, severity High, recipient ${TEAM}. A refused order and a forged webhook both count as errors; add the same alert for ${APP} if you like.`, done: (s) => s.monAlerts.some((a) => a.enabled && a.resource === 'Application' && [OMS, APP].includes(a.name_) && a.metric === 'Message Error Count' && String(a.recipients ?? '').toLowerCase().includes(TEAM)) },
    { title: 'Promote the API instance to Production', how: `API Manager, switch to Production. Add API, Promote API from environment, source Sandbox, include the policies. Note the new API Instance ID. Then Exchange, Request access for the Production instance for ${WAREHOUSE_CLIENT.name}.`, done: (s) => Boolean(apiOf(s, 'Production')?.policies.some((p) => p.type === 'client-id')) && Boolean(contract(s, 'Production')) },
    {
      title: 'Deploy to Production with the live store values',
      how: `Runtime Manager in Production, Deploy application, the same exported file. shopify.shop ${LIVE.shop}, shopify.apiVersion ${API_VERSION}, shopify.locationId ${WAREHOUSE}, oms.queue ${LIVE.queue}, the live token and API secret key from the mail as protected properties, api.id the Production API Instance ID, and the Production client ID and secret from Environment information. The app is Running and the Production instance Active. Then subscribe the live store to the Production endpoint. The lab has no live store, so the listener in Production only logs what it would do.`,
      done: (s) => {
        const a = appOf(s, 'Production')
        const api = apiOf(s, 'Production')
        if (!a || !api) return false
        const p = a.props
        return apiStatus(s, api) === 'Active' && p['shopify.shop'] === LIVE.shop && p['oms.queue'] === LIVE.queue && a.secrets?.['shopify.accessToken'] === LIVE.token && a.secrets?.['shopify.apiSecret'] === LIVE.secret && !('shopify.accessToken' in p) && !('shopify.apiSecret' in p)
      },
    },
  ],
  why: `The ecommerce team wanted each Shopify order in the order system within a minute and the warehouse stock in Shopify. I designed a Store Stock API in RAML for the warehouse, tried it in the mocking service and published it to Exchange. In Studio one flow is the HTTPS listener for orders/create: it checks X-Shopify-Hmac-Sha256 with the API secret key, skips a webhook ID it has seen, maps the order in DataWeave and publishes it to Anypoint MQ, then answers 200 well inside the 5 seconds Shopify waits. The other flow takes PUT /stock/{sku}, finds the inventory item and runs inventorySetQuantities on the Admin GraphQL API. In Shopify I created a custom app with read_orders and write_inventory only, installed it, kept the token and secret in protected properties and subscribed orders/create to the app. In MQ the queue has a dead letter queue after 3 attempts. API Manager has Client ID Enforcement for the warehouse; the webhook path relies on the HMAC instead. A test order went webhook, queue, order system, which I followed by the webhook ID and order number in the logs, and a stock count showed up in Shopify Products. An order with a SKU the order system did not know went to the dead letter queue; after the item was added I moved it back and it was stored. Monitoring alerts the team, and for Production I promoted the instance and deployed with the live store values.`,
  docs: 'https://shopify.dev/docs/api/admin-graphql/latest/mutations/inventorySetQuantities',
  solve(start) {
    let s = mark(start, 'inbox')
    s = saveProject(createProject(s, 'Store Stock API'), 'p1', RAML)
    s = mark(s, 'mock')
    s = publish(s, 'p1', { assetId: ASSET, name: 'Store Stock API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: MAIN } }), ASSET)
    s = createApp(s, { name: SHOP_APP, developer: OPS }).state
    const id = shopApp(s).id
    s = saveScopes(s, id, SCOPES).state
    s = installApp(s, id).state
    const tok = revealToken(s, id)
    s = tok.state
    s = createQueue(s, { name: DLQ })
    s = createQueue(s, { name: QUEUE, dlq: DLQ, attempts: ATTEMPTS })
    s = addApi(s, { assetId: ASSET, label: 'store-stock-sbx', upstream: '', consumer: '' })
    s = applyPolicy(s, apiOf(s).id, 'client-id')
    s = mark(s, 'env:Sandbox')
    s = requestAccess(s, apiOf(s).id, WAREHOUSE_CLIENT.name)
    const c = creds(s, 'Sandbox')
    const jar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'shopify.shop': SHOP, 'shopify.apiVersion': API_VERSION, 'shopify.locationId': String(WAREHOUSE), 'oms.queue': QUEUE, 'api.id': apiOf(s).id, ...c.props }, secrets: { 'shopify.accessToken': tok.result, 'shopify.apiSecret': shopApp(s).secret, ...c.secrets } }).state)
    s = createSubscription(s, id, { topic: 'orders/create', address: `${endpointOf(appOf(s))}/api${WEBHOOK_PATH}`, format: 'json', apiVersion: API_VERSION }).state
    s = createTestOrder(s, { sku: 'H-1250', qty: 1 }).state
    s = advance(s, 2 * MINUTE)
    s = mark(s, `logs:${APP}`)
    s = call(s, APP, WAREHOUSE_CLIENT, `/stock/${STOCK.sku}`, 'PUT', body({ available: STOCK.available })).state
    s = mark(s, 'shopify:products')
    s = createTestOrder(s, { sku: 'H-2000', qty: 1 }).state
    s = advance(s, 2 * MINUTE)
    s = viewMessages(s, DLQ)
    s = callApi(s, { env: 'Sandbox', app: OMS, method: 'POST', path: '/items', body: body({ sku: 'H-2000' }) }).state
    s = moveBack(s, DLQ, QUEUE)
    s = advance(s, MINUTE)
    s = addMonAlert(s, { title: 'Order system errors', resource: 'Application', name_: OMS, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    s = { ...s, env: 'Production' }
    s = promoteApi(s, apiOf(s, 'Sandbox').id, { policies: true, tiers: true, alerts: false })
    s = requestAccess(s, apiOf(s, 'Production').id, WAREHOUSE_CLIENT.name)
    const pc = creds(s, 'Production')
    const pjar = jarsOf(s).find((j) => j.pkg === NAME)
    s = finishDeploys(deployApp(s, { name: APP, ...pjar, replicas: 1, vCores: 0.1, props: { 'shopify.shop': LIVE.shop, 'shopify.apiVersion': API_VERSION, 'shopify.locationId': String(WAREHOUSE), 'oms.queue': LIVE.queue, 'api.id': apiOf(s, 'Production').id, ...pc.props }, secrets: { 'shopify.accessToken': LIVE.token, 'shopify.apiSecret': LIVE.secret, ...pc.secrets } }).state)
    return advance(s, 2 * MINUTE)
  },
  answers: { 5: 1, 14: 1 },
}

export const LABS = [lab]
