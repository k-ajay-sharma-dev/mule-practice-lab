// The end to end lab of Azure Service Bus. See platform-labs.js for the shape of a lab.
//
// One integration from the request mail to Production: the Store Pickups API is designed, published, built in Studio
// (state.studioPkgs), protected in API Manager and deployed. It sends each ready order to a Service Bus topic, and the
// sync app of the stores team receives it from its subscription and writes it into the store system on Oracle. A test
// outage of the store system abandons the message until the subscription dead letters it; after the store system is
// back, the message is re-sent from the dead letter queue. Production has its own namespace and database.
import { addMonAlert, advance, at, mark, MINUTE, newPlatform } from '../platform.js'
import { ask, call, called, OPS, until } from '../platform-kit.js'
import { addEntityPolicy, createSubscription, createTopic, entityConnectionString, entityPoliciesOf, namespaceOf, newNamespace, resendDeadLetters, SB_TIME } from '../platform-servicebus.js'
import { newOracle, runSql } from '../platform-db.js'
import { alerted, appOf, contracted, e2e, isSecret, linked, propsOf, PRD, rowsOf, SBX } from '../platform-e2e-kit.js'
import { API_PKG, ASSET, DB, DB_PRD, DB_PW, DB_USER, LISTEN_POLICY, NS, NS_PRD, PICKUP, SECOND, SEND_POLICY, SERVICE, SUB, SUB_PATH, SYNC_PKG, TABLE, TOPIC } from './e2e-service-bus.pkg.js'

const ALERTS = 'stores-oncall@brightmart.example'
const NAME = 'Store Pickups API'
const CLIENT = 'Brightmart Order Service'
const HOST = 'ora.brightmart.lab'
const HOST_PRD = 'ora-prd.brightmart.lab'
const MAX_DELIVERY = 5
const DUP_WINDOW = 10 * MINUTE

const RAML = `#%RAML 1.0
title: Store Pickups API
version: v1
mediaType: application/json
types:
  Item:
    properties:
      sku: string
      qty: integer
  Pickup:
    properties:
      pickupId: string
      orderId: string
      storeId: string
      items: Item[]
      customer:
        properties:
          phone: string
  Sent:
    properties:
      pickupId: string
      status: string
/pickups:
  post:
    description: An order is ready for pickup at a store. The store system gets it through Service Bus.
    body:
      type: Pickup
    responses:
      202:
        body:
          type: Sent
          example: |
            { "pickupId": "PU-61001", "status": "SENT" }
  /{pickupId}:
    get:
      description: Whether a pickup was sent
      responses:
        200:
          body:
            type: Sent
            example: |
              { "pickupId": "PU-61001", "status": "SENT" }
        404:
          body:
            example: |
              { "message": "No pickup PU-61001" }
`

const CODE = `<!-- global element: a connection string with only the Send claim, on the topic only -->
<azure-service-bus:config name="Send_Config">
  <azure-service-bus:connection-string-connection connectionString="\${sb.sendConnectionString}"/>
</azure-service-bus:config>

<!-- post:\\pickups: map the ready order, send it with the pickupId as MessageId -->
<ee:transform doc:name="Order to pickup">
  <ee:message><ee:set-payload><![CDATA[%dw 2.0
output application/json
---
{
  pickupId:  payload.pickupId,
  orderId:   payload.orderId,
  storeId:   payload.storeId,
  itemCount: sum(payload.items.qty),
  phone:     payload.customer.phone,
  status:    "READY"
}]]></ee:set-payload></ee:message>
</ee:transform>
<azure-service-bus:send config-ref="Send_Config" destinationName="\${sb.topic}" doc:name="Send pickup">
  <azure-service-bus:message messageId="#[payload.pickupId]" correlationId="#[correlationId]"
      label="PickupReady" contentType="application/json">
    <azure-service-bus:properties>#[{ storeId: payload.storeId }]</azure-service-bus:properties>
  </azure-service-bus:message>
</azure-service-bus:send>

<!-- in store-pickup-sync: PeekLock on the subscription, complete after the write, abandon on a database error -->
<azure-service-bus:message-listener config-ref="Listen_Config" destinationName="\${sb.topic}"
    subscriptionName="\${sb.subscription}" receiveMode="PEEK_LOCK"/>`

const oracle = (name, host, password) => {
  const srv = newOracle(name, { host })
  srv.logins.push({ name: DB_USER, type: 'App user', password, status: 'OPEN', profile: 'APP_USERS', failed: 0 })
  srv.users.push({ name: DB_USER, login: DB_USER, schema: 'BRIGHTMART', roles: ['BRIGHTMART_RW'] })
  return srv
}
const ns = (s, env = SBX) => namespaceOf(s, env === SBX ? NS : NS_PRD)
const topicOf = (s, env) => ns(s, env)?.topics?.[TOPIC]
const subOf = (s, env) => topicOf(s, env)?.subscriptions?.[SUB]
const entitiesOk = (s) => {
  const t = topicOf(s)
  const sub = subOf(s)
  return Boolean(t && sub) && t.dupDetect && t.dupWindowMs >= DUP_WINDOW && sub.maxDelivery === MAX_DELIVERY && sub.lockMs >= 30 * SB_TIME.SECOND && !sub.sessions
}
const policy = (s, name, env) => entityPoliciesOf(topicOf(s, env)).find((p) => p.name === name)
const policiesOk = (s) => policy(s, SEND_POLICY)?.claims.join() === 'Send' && policy(s, LISTEN_POLICY)?.claims.join() === 'Listen'
const stringOf = (s, name, env) => ['primary', 'secondary'].map((w) => entityConnectionString(s, env === SBX ? NS : NS_PRD, TOPIC, name, w))
const api = (s, env = SBX) => appOf(s, API_PKG, env)
const sync = (s, env = SBX) => appOf(s, SYNC_PKG, env)
const apiOk = (s, env = SBX) => {
  const a = api(s, env)
  return linked(s, ASSET, API_PKG, env) && propsOf(a)['sb.topic'] === TOPIC && stringOf(s, SEND_POLICY, env).some((v) => v && isSecret(a, 'sb.sendConnectionString', v))
}
const syncOk = (s, env = SBX) => {
  const a = sync(s, env)
  const p = propsOf(a)
  return Boolean(a) && p['sb.topic'] === TOPIC && p['sb.subscription'] === SUB && stringOf(s, LISTEN_POLICY, env).some((v) => v && isSecret(a, 'sb.listenConnectionString', v)) && String(p['db.host']).trim() === (env === SBX ? HOST : HOST_PRD) && p['db.service'] === SERVICE && p['db.user'] === DB_USER && isSecret(a, 'db.password', env === SBX ? DB_PW.sbx : DB_PW.prd)
}
const rows = (s, server = DB) => rowsOf(s, server, TABLE)
const sent = (s, env = SBX) => Object.keys(api(s, env)?.store?.sent ?? {})
const dead = (s) => (subOf(s)?.dlq ?? []).some((m) => m.messageId === 'PU-61002' && m.deadLetterReason === 'MaxDeliveryCountExceeded')
const secondStored = (s) => rows(s).some((r) => r.PICKUP_ID === 'PU-61002')

const lab = {
  id: 'p-e2e-service-bus',
  group: 'End to end by system',
  title: 'End to end: store pickups, the order service to the store system over Service Bus',
  minutes: 55,
  scenario: `Brightmart stores hand out click and collect orders. When an order is packed, the store system on Oracle must show it at the pickup desk within a minute, and later the SMS and analytics teams will read the same events. The path: the order service calls the ${NAME} (a Mule app you design and build), which sends one message per pickup to the Azure Service Bus topic ${TOPIC} on ${NS}. The ${SYNC_PKG} app of the stores team receives it from the subscription ${SUB} and writes it into ${TABLE}. You take it from the request mail to Production, and you prove what happens when the store system is down.`,
  start() {
    const clock = at(2, 9, 50)
    let s = newPlatform({
      clock,
      jars: [SYNC_PKG],
      studioPkgs: { [ASSET]: API_PKG },
      serviceBus: { created: clock, namespaces: { [NS]: newNamespace(NS, clock), [NS_PRD]: newNamespace(NS_PRD, clock) } },
      databases: { created: clock, servers: { [DB]: oracle(DB, HOST, DB_PW.sbx), [DB_PRD]: oracle(DB_PRD, HOST_PRD, DB_PW.prd) } },
      mail: [
        {
          t: at(2, 9, 40),
          to: OPS,
          subject: 'Click and collect: pickups to the store system over Service Bus',
          body: `Hello, here is the pickup flow for Sandbox.\n\nTrigger: the order service calls a new ${NAME} (POST /pickups) when an order is packed, about 2500 a day. It may call twice for the same pickup within 10 minutes when it retries, and a pickup must show once at the desk.\n\nService Bus namespace ${NS}: a topic ${TOPIC} with duplicate detection over 10 minutes, and a subscription ${SUB} for the store system. Writing a pickup takes about a second. A pickup that keeps failing is tried ${MAX_DELIVERY} times, then kept in the dead letter queue for us. The SMS and analytics teams add their own subscriptions later.\n\nKeys: a policy ${SEND_POLICY} with only Send and ${LISTEN_POLICY} with only Listen, both on the topic. Never the RootManageSharedAccessKey.\n\nFields: pickupId, orderId, storeId, the items and the customer phone. The store system stores PICKUP_ID, ORDER_ID, STORE_ID, ITEM_COUNT (the sum of the quantities) and STATUS READY.\n\nThe sync jar of my team is in Runtime Manager: ${SYNC_PKG}. Store system: Oracle ${HOST}, service ${SERVICE}, user ${DB_USER}, password ${DB_PW.sbx}.\n\nThe order service must use a client ID. Alerts to ${ALERTS}.\n\nProduction: namespace ${NS_PRD}, made by the cloud team with the same topic, subscription and policies; take the connection strings from the portal. Oracle ${HOST_PRD}, ${DB_USER} ${DB_PW.prd}.\n\nLena, Brightmart Stores`,
          source: 'Brightmart Stores',
        },
      ],
    })
    // Production: the cloud team made the topic, the subscription and the policies
    s = createTopic(s, NS_PRD, { name: TOPIC, ttlMs: 14 * SB_TIME.DAY, dupDetect: true, dupWindowMs: DUP_WINDOW, maxSizeMb: 1024 })
    s = createSubscription(s, NS_PRD, TOPIC, { name: SUB, lockMs: MINUTE, maxDelivery: MAX_DELIVERY, ttlMs: 14 * SB_TIME.DAY })
    s = addEntityPolicy(addEntityPolicy(s, NS_PRD, TOPIC, SEND_POLICY, ['Send']), NS_PRD, TOPIC, LISTEN_POLICY, ['Listen'])
    return until(s, at(2, 10))
  },
  steps: [
    e2e.read('the trigger, the resend window, the topic and subscription settings, the two policies, the fields, the Oracle login and who gets the alerts'),
    ...e2e.design({ name: NAME, assetId: ASSET, raml: RAML, routes: [['POST', '/pickups'], ['GET', '/pickups/PU-61001']], tryIt: 'POST /pickups', why: 'POST answers 202: the pickup is sent now and shows at the desk a moment later.' }),
    e2e.studio({ name: NAME, assetId: ASSET, code: CODE, how: 'The send uses a connection string from a protected property, the DataWeave sums the quantities, and the pickupId becomes the MessageId so duplicate detection has a key.' }),
    ask(
      'Topic or queue',
      'Only the store system reads the pickups today. Why a topic with a subscription and not a queue?',
      [
        'A topic is cheaper than a queue',
        'A topic gives every subscription its own copy of each message. The SMS and analytics teams add their subscriptions later, with their own filters, lock duration, max delivery count and dead letter queue, and the API and the store system do not change',
        'A queue cannot have a dead letter queue',
        'Only topics support duplicate detection',
      ],
      1,
      'A queue has competing consumers: each message goes to one receiver. A topic is publish and subscribe: each subscription is a queue of its own fed by the topic, and SQL filters on application properties such as storeId decide which messages it takes. Duplicate detection is set on the topic, delivery settings on each subscription.',
    ),
    {
      title: 'Create the topic and the subscription',
      how: `Azure Service Bus, ${NS}, Topics, + Topic. Name ${TOPIC}, check Enable duplicate detection with a window of 10 minutes, Create (duplicate detection cannot change later). Open ${TOPIC}, Subscriptions, + Subscription: Name ${SUB}, Max delivery count ${MAX_DELIVERY}, Lock duration 1 minute, no sessions and no filter, so the $Default rule takes every message. Create.`,
      done: entitiesOk,
    },
    {
      title: 'Add a Send policy and a Listen policy on the topic',
      how: `Open ${TOPIC}, Shared access policies, Add. ${SEND_POLICY} with only Send, Create. Add again: ${LISTEN_POLICY} with only Listen. Open each to copy its Primary connection string: it ends with EntityPath=${TOPIC}, and the Listen key reaches the subscriptions of this topic and nothing else.`,
      done: (s) => entitiesOk(s) && policiesOk(s),
    },
    e2e.manage({ name: NAME, assetId: ASSET, label: 'pickups-sbx' }),
    e2e.export({ assetId: ASSET }),
    {
      title: `Deploy the ${NAME} and see the instance Active`,
      how: `Runtime Manager, Deploy application. Name store-pickups-api, Application File ${ASSET}-1.0.0-mule-application.jar. Properties: sb.topic=${TOPIC}, api.id=the API Instance ID, anypoint.platform.client_id, and as protected properties sb.sendConnectionString (the string of ${SEND_POLICY}) and anypoint.platform.client_secret. Deploy. API Manager shows the instance Active.`,
      done: (s) => apiOk(s),
    },
    {
      title: `Deploy ${SYNC_PKG}`,
      how: `Deploy application: Name store-pickup-sync, Application File ${SYNC_PKG}-1.0.0-mule-application.jar. Properties: sb.topic=${TOPIC}, sb.subscription=${SUB}, db.host=${HOST}, db.service=${SERVICE}, db.user=${DB_USER}, and as protected properties sb.listenConnectionString (the string of ${LISTEN_POLICY}) and db.password. Deploy.`,
      done: (s) => syncOk(s),
    },
    {
      title: 'Send one pickup through the API',
      how: `Exchange, ${NAME}, Request access: the Sandbox instance, Create a new application named ${CLIENT}. API client: store-pickups-api, Send as ${CLIENT}, POST /pickups with ${PICKUP} and an X-Correlation-ID such as pu-test-1: 202. Send it a second time: still 202, and the log says Service Bus dropped the copy as a duplicate.`,
      done: (s) => contracted(s, ASSET) && Boolean(api(s)) && called(s, api(s).name, 202, 'POST', /^\/pickups$/),
    },
    {
      title: 'Follow the pickup to the store system',
      how: `Move the clock a minute. Logs of store-pickups-api: sent with your correlation ID and a sequence number. Logs of store-pickup-sync: the same ID, written to ${TABLE}, message completed. Service Bus, ${TOPIC}, Subscriptions, ${SUB}: 0 active and 0 dead-letter messages. Databases, ${DB}, SQL Worksheet: SELECT * FROM ${TABLE} WHERE PICKUP_ID = 'PU-61001'; Run Script. ITEM_COUNT is 3, the sum of the quantities, and there is one row although you sent twice.`,
      done: (s) => rows(s).some((r) => r.PICKUP_ID === 'PU-61001' && sent(s).includes('PU-61001')) && Boolean(s.seen[`logs:${sync(s)?.name}`]) && Boolean(s.seen[`sb-entity:${SUB_PATH}`]) && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= 0,
    },
    ask(
      'Duplicates and PeekLock',
      'Duplicate detection drops the second send. Why does the sync app still look up the PICKUP_ID before it inserts?',
      [
        'It does not need to: Service Bus delivers exactly once now',
        'Duplicate detection works on the send side, by MessageId, inside the window. In PeekLock the receiver completes after the write, so a crash or a lost lock between the write and the complete delivers the same message again. Delivery is at least once, so the write must be idempotent',
        'The lookup makes the lock last longer',
        'Oracle rejects a second insert on its own, so the lookup only adds speed',
      ],
      1,
      'PeekLock locks the message for the lock duration; complete removes it, abandon gives it back and counts a delivery. ReceiveAndDelete would lose a message on a crash. Duplicate detection cannot see a redelivery of the same message, so the consumer stays idempotent, keyed by a business ID.',
    ),
    {
      title: 'Take the store system down and send a pickup',
      how: `Test the failure path in Sandbox. Databases, ${DB}, SQL Worksheet: ALTER USER ${DB_USER} ACCOUNT LOCK; Run Script. API client: POST /pickups as ${CLIENT} with ${SECOND}: the API still answers 202. Move the clock a minute. The sync log shows the Oracle error and the message abandoned on each delivery; after ${MAX_DELIVERY} the subscription moves it to its dead letter queue. ${SUB}, Service Bus Explorer, Dead-letter, Peek from start: DeadLetterReason MaxDeliveryCountExceeded.`,
      done: (s) => Boolean(s.seen[`sb-dlq:${SUB_PATH}`]) && (sync(s)?.store?.failed?.['PU-61002'] ?? 0) >= MAX_DELIVERY && (dead(s) || secondStored(s)),
    },
    {
      title: 'Bring it back and re-send the dead letter',
      how: `ALTER USER ${DB_USER} ACCOUNT UNLOCK; Run Script. Then ${SUB}, Service Bus Explorer, Dead-letter, Peek from start, select the message, Re-send selected messages. Move the clock a minute. The sync log writes PU-61002, and SELECT * FROM ${TABLE} WHERE PICKUP_ID = 'PU-61002'; shows it.`,
      done: (s) => secondStored(s) && !dead(s),
    },
    {
      title: 'Alert the stores on failures',
      how: `Monitoring, Alerts, Create Alert: Resource type Application, store-pickup-sync, Metric Message Error Count, Above 0 for 1 minute, recipient ${ALERTS}.`,
      done: (s) => alerted(s, SYNC_PKG, ALERTS),
    },
    e2e.promote({ name: NAME, assetId: ASSET }),
    {
      title: 'Deploy both apps to Production',
      how: `Azure Service Bus, ${NS_PRD}, ${TOPIC}, Shared access policies: copy the connection strings of ${SEND_POLICY} and ${LISTEN_POLICY}. They differ from Sandbox: each namespace has its own keys. Runtime Manager in Production: store-pickups-api from the same jar with the Production send string, api.id = the Production instance ID and the Production client ID and secret; store-pickup-sync with the Production listen string, db.host=${HOST_PRD} and the Production db.password. The Production instance turns Active.`,
      done: (s) => apiOk(s, PRD) && syncOk(s, PRD),
    },
    {
      title: 'See one pickup arrive in Production',
      how: `Exchange, Request access for ${CLIENT} on the Production instance. API client in Production: POST /pickups as ${CLIENT} with ${PICKUP}. Move the clock a minute. Databases, ${DB_PRD}: SELECT * FROM ${TABLE}; shows it.`,
      done: (s) => contracted(s, ASSET, PRD) && rows(s, DB_PRD).some((r) => sent(s, PRD).includes(r.PICKUP_ID)),
    },
    ask(
      'What changes per environment',
      'What changed between Sandbox and Production?',
      [
        'Nothing, the connection strings work in every namespace',
        'Same jars, other properties: the connection strings of the Production namespace (other host, other keys), the Oracle host and password, api.id of the Production instance and the Production client ID and secret. The entities have the same names and settings, made by the cloud team, and contracts are asked for again',
        'Only api.id',
        'Production needs a queue instead of a topic',
      ],
      1,
      'A SAS key belongs to one policy of one namespace or entity, so a Sandbox string in Production fails with InvalidSignature or an unknown host. Keeping the entity names the same and the values in protected properties lets one build move through the environments.',
    ),
  ],
  why: `Stores needed packed orders at the pickup desk within a minute, so I designed a Store Pickups API in Design Center with POST /pickups answering 202, tried it on the mock and published it to Exchange. In Studio the API maps the order in DataWeave and sends it to a Service Bus topic with the pickupId as MessageId. On the namespace I made the topic with duplicate detection over the resend window, a subscription for the store system with a lock duration above the work and a max delivery count of 5, and two policies on the topic, one with only Send and one with only Listen. In API Manager the instance has Client ID Enforcement and the app is linked by API Autodiscovery, with the connection strings as protected properties. I followed one pickup by its correlation ID from the API log to the subscription counts, the sync log and the row in Oracle, and a second send was dropped as a duplicate. The sync app completes after the write and looks up the pickup first, because PeekLock is at least once. With the store system locked the message was abandoned five times and dead lettered with MaxDeliveryCountExceeded; once the account was open again I re-sent it and it arrived. An alert on errors goes to the stores, and Production runs the same jars with its own namespace keys, database, instance ID and credentials. In the lab the listener receives once a lab minute.`,
  docs: 'https://docs.mulesoft.com/azure-service-bus-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = e2e.designSolve(s, { name: NAME, assetId: ASSET, raml: RAML })
    s = createTopic(s, NS, { name: TOPIC, ttlMs: 14 * SB_TIME.DAY, dupDetect: true, dupWindowMs: DUP_WINDOW, maxSizeMb: 1024 })
    s = createSubscription(s, NS, TOPIC, { name: SUB, lockMs: MINUTE, maxDelivery: MAX_DELIVERY, ttlMs: 14 * SB_TIME.DAY })
    s = addEntityPolicy(addEntityPolicy(s, NS, TOPIC, SEND_POLICY, ['Send']), NS, TOPIC, LISTEN_POLICY, ['Listen'])
    s = e2e.manageSolve(s, ASSET, 'pickups-sbx')
    s = e2e.exportSolve(s, ASSET)
    const deploy = (n, env) => {
      const name = env === SBX ? NS : NS_PRD
      let x = e2e.deployStudio(n, { name: 'store-pickups-api', assetId: ASSET, props: { 'sb.topic': TOPIC }, secrets: { 'sb.sendConnectionString': entityConnectionString(n, name, TOPIC, SEND_POLICY) } })
      x = e2e.deployJar(x, { name: 'store-pickup-sync', pkg: SYNC_PKG, props: { 'sb.topic': TOPIC, 'sb.subscription': SUB, 'db.host': env === SBX ? HOST : HOST_PRD, 'db.service': SERVICE, 'db.user': DB_USER }, secrets: { 'sb.listenConnectionString': entityConnectionString(x, name, TOPIC, LISTEN_POLICY), 'db.password': env === SBX ? DB_PW.sbx : DB_PW.prd } })
      return x
    }
    s = deploy(s, SBX)
    s = e2e.accessSolve(s, ASSET, CLIENT)
    const client = () => s.clients.find((c) => c.name === CLIENT)
    s = call(s, 'store-pickups-api', client(), '/pickups', 'POST', PICKUP).state
    s = advance(call(s, 'store-pickups-api', client(), '/pickups', 'POST', PICKUP).state, MINUTE)
    s = mark(mark(mark(s, 'logs:store-pickups-api'), 'logs:store-pickup-sync'), `sb-entity:${SUB_PATH}`)
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE PICKUP_ID = 'PU-61001';`).state
    s = runSql(s, DB, `ALTER USER ${DB_USER} ACCOUNT LOCK;`).state
    s = advance(call(s, 'store-pickups-api', client(), '/pickups', 'POST', SECOND).state, MINUTE)
    s = mark(s, `sb-dlq:${SUB_PATH}`)
    s = runSql(s, DB, `ALTER USER ${DB_USER} ACCOUNT UNLOCK;`).state
    s = advance(resendDeadLetters(s, NS, SUB_PATH, subOf(s).dlq.map((m) => m.seq)).state, MINUTE)
    s = addMonAlert(s, { title: 'Pickup sync failed', resource: 'Application', name_: 'store-pickup-sync', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: ALERTS })
    s = e2e.promoteSolve(s, ASSET)
    s = deploy(s, PRD)
    s = e2e.accessSolve(s, ASSET, CLIENT)
    return advance(call(s, 'store-pickups-api', client(), '/pickups', 'POST', PICKUP).state, MINUTE)
  },
  answers: { 5: 1, 14: 1, 21: 1 },
}

export const LABS = [lab]
