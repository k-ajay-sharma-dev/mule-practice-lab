// The sample applications of the end to end lab of Azure Service Bus. Imports only platform-log.js, so the engine can
// load it without a cycle.
//
// e2e-store-pickups-api is the Store Pickups API the team built in Studio on the spec of Exchange: POST /pickups sends
// one message per ready order to a Service Bus topic, with the pickupId as MessageId. store-pickup-sync is the app of
// the stores team: it receives from its subscription in PeekLock and writes the pickup into the store system on Oracle
// through ctx.db (platform-db.js), so the record shows in the Databases screen. A database error abandons the message,
// so it comes again until the max delivery count of the subscription moves it to the dead letter queue; a message it
// cannot read is dead lettered at once.
import { info, muleError, needs, warn } from '../platform-log.js'

export const API_PKG = 'e2e-store-pickups-api'
export const SYNC_PKG = 'store-pickup-sync'
export const ASSET = 'store-pickups-api'
export const NS = 'brightmart-bus'
export const NS_PRD = 'brightmart-bus-prd'
export const TOPIC = 'store-pickups'
export const SUB = 'store-system'
export const SUB_PATH = `${TOPIC}/subscriptions/${SUB}`
export const SEND_POLICY = 'pickups-send'
export const LISTEN_POLICY = 'pickups-listen'
export const DB = 'brightmart-ora' // Sandbox: ora.brightmart.lab
export const DB_PRD = 'brightmart-ora-prd' // Production: ora-prd.brightmart.lab
export const SERVICE = 'BRIGHTMARTPDB'
export const DB_USER = 'MULE_STORES'
export const DB_PW = { sbx: 'Stores-Lab-2026', prd: 'Stores-Prd-Lab-2026' }
export const TABLE = 'BRIGHTMART.STORE_PICKUPS'
export const PICKUP = '{"pickupId":"PU-61001","orderId":"O-50017","storeId":"S-12","items":[{"sku":"FL-20","qty":2},{"sku":"LM-31","qty":1}],"customer":{"phone":"+1 555 0100"}}'
export const SECOND = '{"pickupId":"PU-61002","orderId":"O-50052","storeId":"S-13","items":[{"sku":"FL-20","qty":1}],"customer":{"phone":"+1 555 0101"}}'
const API_FLOW = 'post:\\pickups:application\\json:store-pickups-api-config'
const FLOW = 'pickup-sync-flow'
const SB_LOG = 'com.azure.messaging.servicebus.ServiceBusReceiverAsyncClient'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
export const serverFor = (props) => (/^ora-prd\./i.test(clean(props['db.host'])) ? DB_PRD : /^ora\./i.test(clean(props['db.host'])) ? DB : clean(props['db.host']) || DB)
const cfgOf = (p) => ({ host: p['db.host'], port: '1521', service: p['db.service'], user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
const TABLE_DEF = {
  columns: [['PICKUP_ID', 'VARCHAR2(20)'], ['ORDER_ID', 'VARCHAR2(20)'], ['STORE_ID', 'VARCHAR2(8)'], ['ITEM_COUNT', 'NUMBER(6)'], ['STATUS', 'VARCHAR2(12)'], ['CORRELATION_ID', 'VARCHAR2(64)', true]],
  pk: ['PICKUP_ID'],
}
export function readPickup(body) {
  try {
    const p = JSON.parse(body)
    return p && typeof p.pickupId === 'string' && p.pickupId && typeof p.storeId === 'string' && p.storeId && Array.isArray(p.items) && p.items.length ? p : null
  } catch {
    return null
  }
}
// The DataWeave of the API: the order that is ready as the message body
export const toMessage = (p) => ({ pickupId: p.pickupId, orderId: p.orderId, storeId: p.storeId, itemCount: p.items.reduce((n, i) => n + Number(i.qty ?? 1), 0), phone: p.customer?.phone ?? null, status: 'READY' })

const sendDsl = '<azure-service-bus:send config-ref="Send_Config" destinationName="${sb.topic}">'
const listenDsl = '<azure-service-bus:message-listener config-ref="Listen_Config" destinationName="${sb.topic}" subscriptionName="${sb.subscription}" receiveMode="PEEK_LOCK">'
const fail = (flow, file, at, name, dsl, type, message) => muleError({ flow, file, at, name, dsl, type, message })

export const PACKAGES = {
  [API_PKG]: {
    note: 'Store Pickups API, built in Studio on the spec of Exchange. POST /pickups maps the ready order in DataWeave and sends it to the topic in sb.topic with the pickupId as MessageId and storeId as an application property, then answers 202. A second send of the same pickupId inside the duplicate detection window is dropped by Service Bus. GET /pickups/{pickupId} answers when a pickup was sent. Properties: sb.topic, sb.sendConnectionString (protected), api.id and the environment client ID and secret.',
    traced: true,
    sample: { method: 'POST', path: '/pickups', body: PICKUP },
    boot: needs('sb.topic', 'sb.sendConnectionString'),
    handle({ app, props, now, serviceBus }, req) {
      const st = (app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const one = path.match(/^\/pickups\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const x = st.sent?.[one[1]]
        return x ? { status: 200, ms: 5, flow: 'get:\\pickups\\(pickupId):store-pickups-api-config', body: JSON.stringify({ pickupId: one[1], status: 'SENT', ...x }) } : { status: 404, ms: 4, flow: 'get:\\pickups\\(pickupId):store-pickups-api-config', body: JSON.stringify({ message: `No pickup ${one[1]}` }) }
      }
      if (path !== '/pickups') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}' }
      if (req.method !== 'POST') return { status: 405, ms: 3, error: 'APIKIT:METHOD_NOT_ALLOWED', body: '{"message":"Method not allowed"}' }
      const p = readPickup(req.body)
      if (!p) return { status: 400, ms: 5, flow: API_FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid pickup: pickupId, storeId and at least one item are required"}' }
      const cid = clean(req.cid) || p.pickupId
      const topic = clean(props['sb.topic'])
      const m = toMessage(p)
      const r = serviceBus.send(props['sb.sendConnectionString'], topic, { body: JSON.stringify(m), messageId: p.pickupId, correlationId: cid, contentType: 'application/json', subject: 'PickupReady', properties: { storeId: p.storeId } })
      if (!r.ok) return { status: 503, ms: 700, flow: API_FLOW, error: r.muleType, body: JSON.stringify({ message: 'The pickup could not be sent', error: r.text }), log: [fail(API_FLOW, 'store-pickups-api', 2, 'Send pickup', sendDsl, r.muleType ?? 'AZURE-SERVICE-BUS:CONNECTIVITY', r.text)] }
      st.sent = Object.fromEntries(Object.entries({ ...st.sent, [p.pickupId]: { topic, sequenceNumber: r.sequenceNumber ?? null, correlationId: cid, t: now } }).slice(-100))
      return {
        status: 202, ms: 45, flow: API_FLOW,
        body: JSON.stringify({ pickupId: p.pickupId, status: 'SENT', ...(r.duplicate && { droppedAsDuplicate: true }) }),
        log: [r.duplicate ? warn(`correlationId=${cid} Pickup ${p.pickupId} was sent before inside the duplicate detection window of ${topic}. Service Bus dropped this copy.`) : info(`correlationId=${cid} Pickup ${p.pickupId} sent to topic ${topic}, MessageId ${p.pickupId}, sequence number ${r.sequenceNumber}: storeId=${p.storeId}, itemCount=${m.itemCount}`)],
      }
    },
  },
  [SYNC_PKG]: {
    note: `Store pickup sync of the stores team. Its listener receives from sb.topic/subscriptions/sb.subscription in PeekLock with sb.listenConnectionString and writes each pickup into ${TABLE} of the store system on Oracle, skipping a pickup that is there already, then completes the message. A database error abandons the message, so it comes again until the max delivery count of the subscription dead letters it. A message it cannot read is dead lettered at once with the reason InvalidPickup. Properties: sb.topic, sb.subscription, sb.listenConnectionString (protected), db.host, db.service, db.user, db.password (protected).`,
    boot: needs('sb.topic', 'sb.subscription', 'sb.listenConnectionString', 'db.host', 'db.service', 'db.user', 'db.password'),
    schedules: [{ flow: FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { app, props, store: st, serviceBus } = ctx
        const conn = props['sb.listenConnectionString']
        const path = `${clean(props['sb.topic'])}/subscriptions/${clean(props['sb.subscription'])}`
        const db = serverFor(props)
        const cfg = cfgOf(props)
        const log = []
        let errorType = null
        for (let i = 0; i < 30; i++) {
          const got = serviceBus.receive(conn, path, { max: 1, mode: 'PeekLock', receiver: `${app.name}-1` })
          if (!got.ok) {
            errorType = got.muleType
            log.push(fail(FLOW, 'store-pickup-sync', 0, 'Message listener', listenDsl, got.muleType, got.text))
            break
          }
          const m = got.messages[0]
          if (!m) break
          const cid = m.correlationId || m.messageId
          const p = (() => {
            try {
              const x = JSON.parse(m.body)
              return x?.pickupId && x.storeId ? x : null
            } catch {
              return null
            }
          })()
          if (!p) {
            // a message that can never work is dead lettered at once, not retried
            errorType = 'MULE:EXPRESSION'
            serviceBus.deadLetter(conn, path, m.lockToken, { reason: 'InvalidPickup', description: 'The body is not a pickup: JSON with a pickupId and a storeId.' })
            log.push(warn(`correlationId=${cid} Message ${m.messageId} is not a pickup. Dead lettered with the reason InvalidPickup.`, SB_LOG))
            continue
          }
          const made = ctx.db.ensureTable(db, TABLE, TABLE_DEF)
          const had = made.ok ? ctx.db.select(db, cfg, `SELECT PICKUP_ID FROM ${TABLE} WHERE PICKUP_ID = :id`, { id: p.pickupId }) : made
          const r = !had.ok
            ? had
            : had.rows.length
              ? { ok: true, again: true }
              : ctx.db.insert(db, cfg, `INSERT INTO ${TABLE} (PICKUP_ID, ORDER_ID, STORE_ID, ITEM_COUNT, STATUS, CORRELATION_ID) VALUES (:id, :ord, :store, :items, 'READY', :cid)`, { id: p.pickupId, ord: String(p.orderId ?? ''), store: p.storeId, items: Number(p.itemCount ?? 0), cid })
          if (!r.ok) {
            // the store system does not answer: give the message back, it comes again until the max delivery count
            errorType = r.errorType ?? 'DB:CONNECTIVITY'
            st.failed = { ...st.failed, [p.pickupId]: Math.max(st.failed?.[p.pickupId] ?? 0, m.deliveryCount) }
            if (m.deliveryCount === 1) log.push(fail(FLOW, 'store-pickup-sync', 2, 'Insert pickup', `<db:insert config-ref="Stores_Database_Config" doc:name="Insert pickup"> INSERT INTO ${TABLE}`, errorType, r.text))
            serviceBus.abandon(conn, path, m.lockToken, { elapsedMs: 300 })
            log.push(warn(`correlationId=${cid} Message ${m.messageId} abandoned, delivery count ${m.deliveryCount}.`, SB_LOG))
            continue
          }
          const c = serviceBus.complete(conn, path, m.lockToken, { elapsedMs: 800 })
          if (!c.ok) {
            errorType = c.muleType
            log.push(warn(`correlationId=${cid} Complete of ${p.pickupId} failed: ${c.text}`, SB_LOG))
            continue
          }
          st.done = keep(st.done, p.pickupId)
          log.push(r.again ? warn(`correlationId=${cid} Pickup ${p.pickupId} is in ${TABLE} already. Completed without a second row, delivery count ${m.deliveryCount}.`) : info(`correlationId=${cid} Pickup ${p.pickupId} written to ${TABLE}: STORE_ID=${p.storeId}, ITEM_COUNT=${p.itemCount}, STATUS=READY. Message completed, delivery count ${m.deliveryCount}.`))
        }
        return { ok: !errorType, ms: 1200, ...(errorType && { errorType }), log, store: st }
      },
    },
  },
}
