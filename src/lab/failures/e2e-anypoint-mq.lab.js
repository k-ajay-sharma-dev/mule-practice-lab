// The end to end lab of Anypoint MQ. See platform-labs.js for the shape of a lab.
//
// One integration from the request mail to Production: the Returns Experience API is designed, published, built in
// Studio (state.studioPkgs), protected in API Manager and deployed. It puts each return request on an Anypoint MQ queue,
// and the Returns Process API of the returns team writes it into the returns database. A request of a store the database
// does not know yet fails three times and waits in the dead letter queue until the store is added and it is moved back.
// lab: Anypoint MQ of the lab keeps one list of queues for every environment, so Production ends with the deployment
// and its client app; in Anypoint MQ each environment and region has its own destinations.
import { addMonAlert, advance, at, mark, MINUTE, newPlatform } from '../platform.js'
import { ask, call, called, OPS, until } from '../platform-kit.js'
import { addClientApp, clientApps, createQueue, DEFAULT_LOCK_TTL, DEFAULT_TTL, isFifo, moveBack } from '../platform-mq.js'
import { runSql } from '../platform-db.js'
import { alerted, appOf, contracted, e2e, isSecret, linked, propsOf, PRD, rowsOf, SBX, sqlServer } from '../platform-e2e-kit.js'
import { ASSET, DATABASE, DB, DB_PRD, DB_PW, DB_USER, DLQ, EAPI_PKG, MQ_URL, NEW_STORE, PAPI_PKG, QUEUE, RETURN, STORES, TABLE } from './e2e-anypoint-mq.pkg.js'

const ALERTS = 'returns-support@brightmart.example'
const NAME = 'Returns Experience API'
const CLIENT = 'Brightmart Returns Portal'
const ATTEMPTS = 3
const HOST = 'sql.brightmart.lab'
const MQ_CLIENTS = { eapi: 'returns-eapi-sbx', papi: 'returns-papi-sbx', eapiPrd: 'returns-eapi-prd' }

const RAML = `#%RAML 1.0
title: Returns Experience API
version: v1
mediaType: application/json
types:
  ReturnRequest:
    properties:
      returnId: string
      orderId: string
      storeId: string
      sku: string
      qty: integer
      amount: number
      reason: string
  Accepted:
    properties:
      returnId: string
      status: string
/returns:
  post:
    description: Take a return request of the returns portal. It is queued and booked later.
    body:
      type: ReturnRequest
    responses:
      202:
        body:
          type: Accepted
          example: |
            { "returnId": "R-77012", "status": "QUEUED" }
  /{returnId}:
    get:
      description: Whether a return request was taken
      responses:
        200:
          body:
            type: Accepted
            example: |
              { "returnId": "R-77012", "status": "QUEUED" }
        404:
          body:
            example: |
              { "message": "No return request R-77012" }
`

const CODE = `<!-- global element: the client app of this API, one per environment -->
<anypoint-mq:config name="Anypoint_MQ_Config">
  <anypoint-mq:connection url="\${mq.url}" clientId="\${mq.clientId}" clientSecret="\${mq.clientSecret}"/>
</anypoint-mq:config>

<!-- post:\\returns: map the request of the portal, queue it, answer 202 -->
<ee:transform doc:name="Return to message">
  <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  returnId:     payload.returnId,
  orderId:      payload.orderId,
  storeId:      payload.storeId,
  sku:          payload.sku,
  qty:          payload.qty,
  refundAmount: payload.amount,
  reasonCode:   upper(payload.reason replace " " with "_"),
  channel:      "PORTAL"
}]]></ee:set-payload></ee:message>
</ee:transform>
<anypoint-mq:publish config-ref="Anypoint_MQ_Config" destination="\${mq.queue}" doc:name="Queue return request">
  <anypoint-mq:properties>#[{ correlationId: correlationId, storeId: payload.storeId }]</anypoint-mq:properties>
</anypoint-mq:publish>
<set-variable variableName="httpStatus" value="202"/>

<!-- in returns-process-papi: the Subscriber acknowledges when the flow ends well, and nacks on an error -->
<anypoint-mq:subscriber config-ref="Anypoint_MQ_Config" destination="\${mq.queue}" acknowledgementMode="AUTO"/>
<db:insert config-ref="Returns_Database_Config" doc:name="Insert return">
  <db:sql>INSERT INTO dbo.return_requests (return_id, order_id, store_id, sku, qty, refund_amount, reason_code, status)
          VALUES (:returnId, :orderId, :storeId, :sku, :qty, :refundAmount, :reasonCode, 'RECEIVED')</db:sql>
</db:insert>`

const queue = (s, name) => s.queues.find((q) => q.name === name)
const queuesOk = (s) => {
  const q = queue(s, QUEUE)
  const d = queue(s, DLQ)
  return Boolean(q && d) && !isFifo(q) && !isFifo(d) && q.dlq === DLQ && q.attempts === ATTEMPTS
}
const made = (s, env, name) => (s.mqClients ?? []).some((c) => c.env === env && c.name === name) ? clientApps(s, env).find((c) => c.name === name) : null
const mqCreds = (s, a, env, name) => {
  const c = made(s, env, name)
  return Boolean(c) && isSecret(a, 'mq.clientId', c.clientId) && isSecret(a, 'mq.clientSecret', c.clientSecret)
}
const eapi = (s, env = SBX) => appOf(s, EAPI_PKG, env)
const papi = (s) => appOf(s, PAPI_PKG)
const eapiOk = (s, env = SBX) => {
  const a = eapi(s, env)
  return linked(s, ASSET, EAPI_PKG, env) && propsOf(a)['mq.url'] === MQ_URL && propsOf(a)['mq.queue'] === QUEUE && mqCreds(s, a, env, env === SBX ? MQ_CLIENTS.eapi : MQ_CLIENTS.eapiPrd)
}
const papiOk = (s) => {
  const a = papi(s)
  const p = propsOf(a)
  return Boolean(a) && p['mq.url'] === MQ_URL && p['mq.queue'] === QUEUE && mqCreds(s, a, SBX, MQ_CLIENTS.papi) && String(p['db.host']).trim() === HOST && p['db.database'] === DATABASE && p['db.user'] === DB_USER && isSecret(a, 'db.password', DB_PW.sbx)
}
const rows = (s) => rowsOf(s, DB, TABLE)
const queued = (s) => Object.keys(eapi(s)?.store?.queued ?? {})
const followed = (s) => {
  const ids = new Set(queued(s))
  return rows(s).some((r) => ids.has(r.return_id) && r.store_id !== 'S-31') && Boolean(s.seen[`logs:${papi(s)?.name}`]) && Boolean(s.seen['mq-usage']) && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= 0
}
// in the dead letter queue now, or it reached it before it was moved back: the Process API failed it on each attempt
const deadS31 = (s) => (queue(s, DLQ)?.messages ?? []).some((m) => m.from === QUEUE && m.deliveries >= ATTEMPTS && /"storeId":"S-31"/.test(m.body)) || ((papi(s)?.store?.failed?.['R-77013'] ?? 0) >= ATTEMPTS && (queue(s, DLQ)?.messages ?? []).every((m) => !/"storeId":"S-31"/.test(m.body)) && rows(s).some((r) => r.return_id === 'R-77013'))

const lab = {
  id: 'p-e2e-anypoint-mq',
  group: 'End to end by system',
  title: 'End to end: return requests, the returns portal to the returns database over Anypoint MQ',
  minutes: 55,
  scenario: `Brightmart lets customers start a return in the returns portal. The portal must answer at once, even when the returns database is busy or down for patching, and no request may be lost. The path: the portal calls the ${NAME} (a Mule app you design and build), which puts the request on the Anypoint MQ queue ${QUEUE}. The ${PAPI_PKG} app of the returns team takes each message and writes it into ${TABLE} on SQL Server. A request that keeps failing waits in ${DLQ}. You take it from the request mail to Production.`,
  start() {
    const clock = at(1, 10, 20)
    const s = newPlatform({
      clock,
      jars: [PAPI_PKG],
      studioPkgs: { [ASSET]: EAPI_PKG },
      databases: { created: clock, servers: { [DB]: sqlServer(DB, HOST, DATABASE, DB_USER, DB_PW.sbx), [DB_PRD]: sqlServer(DB_PRD, 'sql-prd.brightmart.lab', DATABASE, DB_USER, DB_PW.prd) } },
      mail: [
        {
          t: at(1, 10, 10),
          to: OPS,
          subject: 'Returns portal to the returns database: Anypoint MQ',
          body: `Hello, this is the returns flow we need.\n\nTrigger: a customer submits a return in the portal, about 1500 a day, more in January. The portal calls a new ${NAME} (POST /returns) and must get 202 within a second, whatever the state of the returns database. Each request goes through Anypoint MQ, US East (${MQ_URL}), queue ${QUEUE}.\n\nFields: returnId, orderId, storeId, sku, qty, amount, reason. The database stores return_id, order_id, store_id, sku, qty, refund_amount and reason_code (the reason in capitals).\n\nErrors: a request that fails is tried ${ATTEMPTS} times in all, then kept in ${DLQ} for us. Never dropped. The order between two returns does not matter, and the returnId is unique.\n\nThe Process API jar of my team is in Runtime Manager: ${PAPI_PKG}. Each app gets its own client app in Anypoint MQ: ${MQ_CLIENTS.eapi} and ${MQ_CLIENTS.papi}. Returns database: ${HOST}, database ${DATABASE}, login ${DB_USER}, password ${DB_PW.sbx}.\n\nThe portal must use a client ID. Alerts for failed returns to ${ALERTS}.\n\nProduction: client app ${MQ_CLIENTS.eapiPrd} for the API, the Production instance and credentials.\n\nMarta, Returns team`,
          source: 'Brightmart Returns',
        },
      ],
    })
    return until(s, at(1, 10, 30))
  },
  steps: [
    e2e.read('the trigger, the fields, the queue and the number of tries, the client apps, the database login and who gets the alerts'),
    ...e2e.design({ name: NAME, assetId: ASSET, raml: RAML, routes: [['POST', '/returns'], ['GET', '/returns/R-77012']], tryIt: 'POST /returns', why: 'POST answers 202 Accepted: the request is taken now and booked later.' }),
    e2e.studio({ name: NAME, assetId: ASSET, code: CODE, how: 'The MQ config holds the client app as placeholders, the DataWeave maps the request, and the publish sends it with the correlation ID as a property.' }),
    ask(
      'Why a queue between the two APIs',
      `Why does the ${NAME} queue the request instead of calling the Process API over HTTP?`,
      [
        'A queue is faster than HTTP for every call',
        'The queue decouples them: the portal gets 202 even while the Process API or its database is down or slow, the messages wait safely, and a failure is retried and parked in a dead letter queue instead of lost or returned to the customer',
        'API-led connectivity forbids HTTP between layers',
        'Anypoint MQ sends each message exactly once, HTTP does not',
      ],
      1,
      'A synchronous call ties the portal to the slowest system behind it. With a queue the Experience API only needs the broker, and the Process API takes the work at its own pace. The price is eventual consistency: the portal shows QUEUED, not BOOKED, and the consumer must be idempotent because delivery is at least once.',
    ),
    {
      title: 'Create the dead letter queue and the queue',
      how: `MQ, Destinations, + Add, Queue. First ${DLQ}, Standard queue, Create Queue. Then + Add, Queue: ${QUEUE}, Standard queue, check Assign a Dead Letter Queue, Dead Letter Queue Name ${DLQ}, Delivery attempts before reroute ${ATTEMPTS}. Create Queue.`,
      done: queuesOk,
    },
    {
      title: 'Create a client app for each app',
      how: `MQ, Client Apps, + Add. App Name ${MQ_CLIENTS.eapi}, Save. + Add again: ${MQ_CLIENTS.papi}. Each has its own Client ID and Client Secret in Sandbox, so one secret can be regenerated without touching the other app.`,
      done: (s) => Boolean(made(s, SBX, MQ_CLIENTS.eapi) && made(s, SBX, MQ_CLIENTS.papi)) && Boolean(s.seen['mq-clients']),
    },
    e2e.manage({ name: NAME, assetId: ASSET, label: 'returns-sbx' }),
    e2e.export({ assetId: ASSET }),
    {
      title: `Deploy the ${NAME} and see the instance Active`,
      how: `Runtime Manager, Deploy application. Name returns-eapi, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: mq.url=${MQ_URL}, mq.queue=${QUEUE}, api.id=the API Instance ID, anypoint.platform.client_id, and as protected properties mq.clientId and mq.clientSecret of ${MQ_CLIENTS.eapi} and anypoint.platform.client_secret. Deploy. API Manager shows the instance Active.`,
      done: (s) => eapiOk(s),
    },
    {
      title: `Deploy ${PAPI_PKG}`,
      how: `Deploy application: Name returns-papi, Application File ${PAPI_PKG}-1.0.0-mule-application.jar. Properties: mq.url, mq.queue=${QUEUE}, db.host=${HOST}, db.database=${DATABASE}, db.user=${DB_USER}, and as protected properties mq.clientId and mq.clientSecret of ${MQ_CLIENTS.papi} and db.password. Deploy and read its Logs: the Subscriber starts on ${QUEUE}.`,
      done: (s) => papiOk(s),
    },
    {
      title: 'Send one return through the API',
      how: `Exchange, ${NAME}, Request access: the Sandbox instance, Create a new application named ${CLIENT}. Then API client: application returns-eapi, Send as ${CLIENT}, POST /returns with ${RETURN} and an X-Correlation-ID of your own such as rt-test-1. You get 202 and status QUEUED.`,
      done: (s) => contracted(s, ASSET) && Boolean(eapi(s)) && called(s, eapi(s).name, 202, 'POST', /^\/returns$/),
    },
    {
      title: 'Follow the return to the returns database',
      how: `Move the clock a minute. Logs of returns-eapi: the publish line with your correlation ID. Logs of returns-papi: the same correlation ID, stored in ${TABLE}, message acknowledged. MQ, Usage counts it as acknowledged, and ${QUEUE} shows 0 messages. Databases, ${DB}, New Query: SELECT * FROM ${TABLE} WHERE return_id = 'R-77012'; and Execute. refund_amount 42.25 and reason_code DAMAGED are the mapped values.`,
      done: followed,
    },
    ask(
      'Acknowledgement and repeats',
      'The Subscriber uses acknowledgementMode AUTO, and the Process API looks up the returnId before it inserts. Why the lookup?',
      [
        'AUTO deletes the message before the flow runs',
        'AUTO acknowledges when the flow ends well and nacks on an error, so the message comes again after a failure. A failure after the insert but before the ack, or a lock that ends while the flow still works, delivers the same message twice. Standard queues are at least once, so the write must be idempotent',
        'The lookup makes the queue a FIFO queue',
        'Without it the dead letter queue gets every message',
      ],
      1,
      'Anypoint MQ standard queues deliver at least once. AUTO ack or a MANUAL ack after the write both leave a window where the work is done and the ack is not, and the message returns when the acknowledgement timeout ends. An idempotent consumer, keyed here by returnId, makes the repeat harmless.',
    ),
    {
      title: 'Send a return of a store the database does not know',
      how: `Store S-31 opened this week and is not in ${STORES} yet. API client: POST /returns as ${CLIENT} with ${NEW_STORE}. It still answers 202: the portal is not held up. Move the clock a minute. The log of returns-papi shows DB:QUERY_EXECUTION, a FOREIGN KEY conflict on store_id, on delivery 1 and ${ATTEMPTS}, and the message moves to ${DLQ}. Open ${DLQ}, Message Browser, Get Messages: it is there with ${ATTEMPTS} deliveries.`,
      done: (s) => deadS31(s) && Boolean(s.seen[`mq:${DLQ}`]),
    },
    {
      title: 'Add the store and move the return back',
      how: `Fix the cause first. Databases, ${DB}, New Query: INSERT INTO ${STORES} (store_id, name, region) VALUES ('S-31', 'Brightmart Harbourside', 'north'); Execute. Then MQ, ${DLQ}, Message Browser, Move messages back: Source queue ${QUEUE}, Move all. Move the clock a minute. The return is stored, and SELECT * FROM ${TABLE} WHERE store_id = 'S-31'; shows it.`,
      done: (s) => rows(s).some((r) => r.return_id === 'R-77013' && r.store_id === 'S-31') && (queue(s, DLQ)?.messages.length ?? 1) === 0,
    },
    {
      title: 'Alert the returns team on failures',
      how: `Monitoring, Alerts, Create Alert: Resource type Application, returns-papi, Metric Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: (s) => alerted(s, PAPI_PKG, ALERTS),
    },
    e2e.promote({ name: NAME, assetId: ASSET }),
    {
      title: 'Deploy the API to Production with its own client app',
      how: `MQ, switch the environment to Production, Client Apps, + Add: ${MQ_CLIENTS.eapiPrd}. Runtime Manager in Production, Deploy application: returns-eapi from the same jar, mq.url and mq.queue as before, mq.clientId and mq.clientSecret of ${MQ_CLIENTS.eapiPrd}, api.id = the Production instance ID, and the Production client ID and secret. The Production instance turns Active. A Sandbox client app does not work in Production: the token call answers 401 invalid_client.`,
      done: (s) => eapiOk(s, PRD),
    },
    ask(
      'What changes per environment',
      'What did you change for Production, and what would the Production Process API need?',
      [
        'Nothing: Anypoint MQ client apps work in every environment',
        'Same jar, other properties: the client app of Production (client apps belong to one environment), api.id of the Production instance and the Production client ID and secret. The Process API needs its own Production client app and the Production database host and password, and the queue and dead letter queue are made in Production too',
        'Only the broker URL changes',
        'Production needs a FIFO queue',
      ],
      1,
      'Anypoint MQ destinations and client apps belong to an environment and a region, so Production gets its own queue, dead letter queue and client apps of the same names, and the apps take the values from properties. In the lab MQ keeps one list of queues for both environments, so the lab stops at the deployment of the API.',
    ),
  ],
  why: `The returns portal had to answer at once and lose nothing, so I put Anypoint MQ between a Returns Experience API and the Returns Process API. I designed the Experience API in Design Center with POST /returns answering 202, tried it on the mock and published it to Exchange, then built it in Studio: DataWeave maps the request and the MQ publish puts it on the queue with the correlation ID as a property. In Anypoint MQ I made the dead letter queue first, then the standard queue with 3 delivery attempts before reroute, and one client app per app per environment. In API Manager the instance has Client ID Enforcement, and the app is linked by API Autodiscovery with the secrets in protected properties. I followed one return by its correlation ID from the API log to the Process API log, MQ Usage and the row in the database. The Subscriber acknowledges on success and the insert looks up the returnId first, because delivery is at least once. A return of a new store failed on the foreign key three times and waited in the dead letter queue; once the store was added I moved it back and it was stored. An alert on errors goes to the returns team, and Production gets the same jar with its own client app, instance ID and credentials. In the lab the Subscriber takes messages once a lab minute and one list of queues serves both environments.`,
  docs: 'https://docs.mulesoft.com/mq/mq-queues',
  solve(start) {
    let s = mark(start, 'inbox')
    s = e2e.designSolve(s, { name: NAME, assetId: ASSET, raml: RAML })
    s = createQueue(s, { name: DLQ, fifo: false, ttl: DEFAULT_TTL, lockTtl: DEFAULT_LOCK_TTL })
    s = createQueue(s, { name: QUEUE, fifo: false, ttl: DEFAULT_TTL, lockTtl: DEFAULT_LOCK_TTL, dlq: DLQ, attempts: ATTEMPTS })
    s = mark(addClientApp(addClientApp(s, SBX, MQ_CLIENTS.eapi), SBX, MQ_CLIENTS.papi), 'mq-clients')
    s = e2e.manageSolve(s, ASSET, 'returns-sbx')
    s = e2e.exportSolve(s, ASSET)
    const mqOf = (env, name) => {
      const c = clientApps(s, env).find((x) => x.name === name)
      return { 'mq.clientId': c.clientId, 'mq.clientSecret': c.clientSecret }
    }
    s = e2e.deployStudio(s, { name: 'returns-eapi', assetId: ASSET, props: { 'mq.url': MQ_URL, 'mq.queue': QUEUE }, secrets: mqOf(SBX, MQ_CLIENTS.eapi) })
    s = e2e.deployJar(s, { name: 'returns-papi', pkg: PAPI_PKG, props: { 'mq.url': MQ_URL, 'mq.queue': QUEUE, 'db.host': HOST, 'db.database': DATABASE, 'db.user': DB_USER }, secrets: { ...mqOf(SBX, MQ_CLIENTS.papi), 'db.password': DB_PW.sbx } })
    s = e2e.accessSolve(s, ASSET, CLIENT)
    const client = () => s.clients.find((c) => c.name === CLIENT)
    s = advance(call(s, 'returns-eapi', client(), '/returns', 'POST', RETURN).state, MINUTE)
    s = mark(mark(mark(s, 'logs:returns-eapi'), 'logs:returns-papi'), 'mq-usage')
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE return_id = 'R-77012';`).state
    s = advance(call(s, 'returns-eapi', client(), '/returns', 'POST', NEW_STORE).state, MINUTE)
    s = mark(s, `mq:${DLQ}`)
    s = runSql(s, DB, `INSERT INTO ${STORES} (store_id, name, region) VALUES ('S-31', 'Brightmart Harbourside', 'north');`).state
    s = advance(moveBack(s, DLQ, QUEUE), MINUTE)
    s = addMonAlert(s, { title: 'Return failed', resource: 'Application', name_: 'returns-papi', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
    s = e2e.promoteSolve(s, ASSET)
    s = addClientApp(s, PRD, MQ_CLIENTS.eapiPrd)
    return e2e.deployStudio(s, { name: 'returns-eapi', assetId: ASSET, props: { 'mq.url': MQ_URL, 'mq.queue': QUEUE }, secrets: mqOf(PRD, MQ_CLIENTS.eapiPrd) })
  },
  answers: { 5: 1, 14: 1, 20: 1 },
}

export const LABS = [lab]
