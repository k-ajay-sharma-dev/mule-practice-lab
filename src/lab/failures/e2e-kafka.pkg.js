// The sample applications of the end to end lab of Kafka. Imports only platform-log.js, so the engine can load it
// without a cycle.
//
// e2e-order-events-api is the Order Events API the team built in Studio on the spec of Exchange: POST /order-events
// maps an order to an order event in DataWeave and publishes it to Kafka, keyed by orderId. e2e-wms-order-consumer
// reads the topic in a consumer group, routes each order to a warehouse by its region and writes it into the warehouse
// database on SQL Server through ctx.db (platform-db.js), so the record shows in the Databases screen. An event it
// cannot route goes to a dead letter topic; replay-dlt-flow, started by hand, reads that topic again after a fix.
import { info, muleError, needs, warn } from '../platform-log.js'

export const API_PKG = 'e2e-order-events-api'
export const CONSUMER_PKG = 'wms-order-consumer'
export const ASSET = 'order-events-api'
export const CLUSTER = 'brightmart-events'
export const CLUSTER_PRD = 'brightmart-events-prd'
export const bootstrapOf = (cluster) => [1, 2, 3].map((i) => `kafka-${i}.${cluster}.lab:9092`).join(',')
export const TOPIC = 'order-events.v1'
export const DLT = 'order-events.v1.DLT'
export const GROUP = 'warehouse-orders'
export const REPLAY_GROUP = 'warehouse-orders-replay'
export const API_USER = 'svc-order-api'
export const WMS_USER = 'svc-warehouse'
// lab passwords of the SCRAM users and the database login, handed over in the mail of the lab
export const PW = { api: 'oa-lab-26', wms: 'wh-lab-26', apiPrd: 'oa-prd-lab-26', wmsPrd: 'wh-prd-lab-26', db: 'Wms-Lab-2026', dbPrd: 'Wms-Prd-Lab-2026' }
export const DB = 'brightmart-sql' // Sandbox: sql.brightmart.lab
export const DB_PRD = 'brightmart-sql-prd' // Production: sql-prd.brightmart.lab
export const DATABASE = 'BrightmartWms'
export const DB_USER = 'svc_wms_mule'
export const TABLE = 'dbo.wms_orders'
export const ROUTES = 'east:WH-E1,west:WH-W2'
export const ORDER = '{"orderId":"O-50017","customerId":"C-2231","shipTo":{"region":"east","city":"Port Elm"},"lines":[{"sku":"FL-20","qty":2},{"sku":"LM-31","qty":1}],"total":84.5}'
export const NORTH = '{"orderId":"O-50018","customerId":"C-3107","shipTo":{"region":"north","city":"Pine Ridge"},"lines":[{"sku":"FL-20","qty":1}],"total":39.9}'
const API_FLOW = 'post:\\order-events:application\\json:order-events-api-config'
const FLOW = 'order-events-flow'
const REPLAY = 'replay-dlt-flow'
const KAFKA_LOG = 'org.apache.kafka.clients.consumer.internals.ConsumerCoordinator'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 200) => [...(list ?? []), item].slice(-n)
// The cluster behind bootstrap.servers: kafka-1.<cluster>.lab:9092. Anything else does not resolve.
export const clusterOf = (props) => (clean(props['kafka.bootstrapServers']).split(',')[0].trim().match(/^kafka-\d\.([a-z0-9-]+)\.lab:9092$/) ?? [])[1] ?? clean(props['kafka.bootstrapServers'])
const authOf = (props) => ({ user: clean(props['kafka.username']), password: clean(props['kafka.password']) })
// the Database config of the consumer. The lab has one server per environment, picked by the host.
export const serverFor = (props) => (/^sql-prd\./i.test(clean(props['db.host'])) ? DB_PRD : /^sql\./i.test(clean(props['db.host'])) ? DB : clean(props['db.host']) || DB)
const cfgOf = (p) => ({ host: p['db.host'], database: p['db.database'], user: p['db.user'], password: p['db.password'], maxPoolSize: '2', maxWait: '10', queryTimeout: '10' })
// wms.warehouses: region:warehouse pairs, such as east:WH-E1,west:WH-W2
export const routesOf = (props) => Object.fromEntries(clean(props['wms.warehouses']).split(',').map((x) => x.split(':').map((y) => y.trim().toLowerCase())).filter(([r, w]) => r && w).map(([r, w]) => [r, w.toUpperCase()]))
const TABLE_DEF = {
  columns: [['order_id', 'varchar(20)'], ['customer_id', 'varchar(20)'], ['region', 'varchar(12)'], ['warehouse', 'varchar(8)'], ['line_count', 'int'], ['total', 'decimal(12,2)'], ['status', 'varchar(16)'], ['kafka_offset', 'varchar(40)', true], ['correlation_id', 'varchar(64)', true]],
  pk: ['order_id'],
}

// The DataWeave of the API: an order of the shop as the order event of the topic
export function toEvent(order, now) {
  return { orderId: order.orderId, customerId: order.customerId, region: String(order.shipTo?.region ?? '').toLowerCase(), lineCount: order.lines.length, total: Number(order.total), status: 'CREATED', occurredAt: now }
}
export function readOrder(body) {
  try {
    const o = JSON.parse(body)
    return o && typeof o.orderId === 'string' && o.orderId && Array.isArray(o.lines) && o.lines.length && o.shipTo?.region ? o : null
  } catch {
    return null
  }
}
export function readEvent(value) {
  try {
    const e = JSON.parse(value)
    return e && typeof e.orderId === 'string' && e.orderId && typeof e.region === 'string' ? e : null
  } catch {
    return null
  }
}

const publishDsl = '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.topic}" key="#[vars.orderId]">'
const listenDsl = '<kafka:message-listener config-ref="Kafka_Consumer_Config" ackMode="MANUAL">'
const insertDsl = `<db:insert config-ref="Wms_Database_Config" doc:name="Insert order"> INSERT INTO ${TABLE}`

// One event into the warehouse database: route it, skip an order that is stored already, insert it.
// Returns { ok } or { ok: false, kind: 'route' | 'db', type, text }.
function store(ctx, e, rec, cid) {
  const p = ctx.props
  const warehouse = routesOf(p)[e.region]
  if (!warehouse) return { ok: false, kind: 'route', type: 'MULE:EXPRESSION', text: `No warehouse for region '${e.region}' in wms.warehouses (${clean(p['wms.warehouses']) || 'empty'}). The order cannot be routed.` }
  const db = serverFor(p)
  const cfg = cfgOf(p)
  const made = ctx.db.ensureTable(db, TABLE, TABLE_DEF)
  if (!made.ok) return { ok: false, kind: 'db', type: made.errorType ?? 'DB:CONNECTIVITY', text: made.text }
  const had = ctx.db.select(db, cfg, `SELECT order_id FROM ${TABLE} WHERE order_id = :id`, { id: e.orderId })
  if (!had.ok) return { ok: false, kind: 'db', type: had.errorType, text: had.text }
  if (had.rows.length) return { ok: true, warehouse, again: true }
  const r = ctx.db.insert(db, cfg, `INSERT INTO ${TABLE} (order_id, customer_id, region, warehouse, line_count, total, status, kafka_offset, correlation_id) VALUES (:id, :customer, :region, :warehouse, :lines, :total, 'RECEIVED', :offset, :cid)`, {
    id: e.orderId, customer: String(e.customerId ?? ''), region: e.region, warehouse, lines: Number(e.lineCount ?? 0), total: Number(e.total ?? 0), offset: `${rec.topic}-${rec.partition}@${rec.offset}`, cid,
  })
  return r.ok ? { ok: true, warehouse } : { ok: false, kind: 'db', type: r.errorType, text: r.text }
}

export const PACKAGES = {
  [API_PKG]: {
    note: `Order Events API, built in Studio on the spec of Exchange. POST /order-events maps the order to an order event in DataWeave and publishes it to kafka.topic with the orderId as the key and acks ALL, then answers 202 with the partition and offset. GET /order-events/{orderId} answers where an event went. Properties: kafka.bootstrapServers, kafka.topic, kafka.username, kafka.password (SASL/SCRAM-SHA-512, protected), api.id and the environment client ID and secret.`,
    traced: true,
    sample: { method: 'POST', path: '/order-events', body: ORDER },
    boot: needs('kafka.bootstrapServers', 'kafka.topic', 'kafka.username', 'kafka.password'),
    handle({ app, props, now, kafka }, req) {
      const st = (app.store ??= {})
      const path = req.path.split('?')[0].replace(/\/+$/, '')
      const one = path.match(/^\/order-events\/([\w-]+)$/)
      if (req.method === 'GET' && one) {
        const x = st.published?.[one[1]]
        return x ? { status: 200, ms: 6, flow: 'get:\\order-events\\(orderId):order-events-api-config', body: JSON.stringify({ orderId: one[1], ...x }) } : { status: 404, ms: 4, flow: 'get:\\order-events\\(orderId):order-events-api-config', body: JSON.stringify({ message: `No event was published for ${one[1]}` }) }
      }
      if (path !== '/order-events') return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', body: '{"message":"Resource not found"}' }
      if (req.method !== 'POST') return { status: 405, ms: 3, error: 'APIKIT:METHOD_NOT_ALLOWED', body: '{"message":"Method not allowed"}' }
      const order = readOrder(req.body)
      if (!order) return { status: 400, ms: 5, flow: API_FLOW, error: 'APIKIT:BAD_REQUEST', body: '{"message":"Invalid order: orderId, shipTo.region and at least one line are required"}' }
      const cid = clean(req.cid) || order.orderId
      const event = toEvent(order, now)
      const topic = clean(props['kafka.topic'])
      const r = kafka.produce(clusterOf(props), topic, { key: order.orderId, value: event, headers: { correlationId: cid, source: 'order-events-api', 'content-type': 'application/json' }, acks: 'all', auth: authOf(props) })
      if (!r.ok) return { status: 503, ms: 900, flow: API_FLOW, error: r.muleType ?? 'KAFKA:CONNECTIVITY', body: JSON.stringify({ message: 'The order event could not be published', error: r.text }), log: [muleError({ flow: API_FLOW, file: 'order-events-api', at: 2, name: 'Publish order event', dsl: publishDsl, type: r.muleType ?? 'KAFKA:CONNECTIVITY', message: r.text })] }
      st.published = Object.fromEntries(Object.entries({ ...st.published, [order.orderId]: { topic, partition: r.partition, offset: r.offset, correlationId: cid, t: now } }).slice(-100))
      return {
        status: 202, ms: 35, flow: API_FLOW,
        body: JSON.stringify({ orderId: order.orderId, topic, partition: r.partition, offset: r.offset }),
        log: [info(`correlationId=${cid} Published order event ${order.orderId} to ${topic}-${r.partition} at offset ${r.offset}, key ${order.orderId}, acks ALL. region=${event.region}, lineCount=${event.lineCount}, total=${event.total}`)],
      }
    },
  },
  [CONSUMER_PKG]: {
    note: `Warehouse order consumer. A Kafka Message Listener in the group kafka.groupId (ackMode MANUAL) reads kafka.topic, routes each order to a warehouse by its region with wms.warehouses (region:warehouse pairs), and inserts it into ${TABLE} of the warehouse database, skipping an order that is there already. It commits the offset once the row is written. An event it cannot route or read goes to kafka.dlt with the original topic, partition, offset and error in its headers. ${REPLAY} is disabled and run by hand: it reads kafka.dlt in the group ${REPLAY_GROUP} and stores what it can now route. Properties: kafka.bootstrapServers, kafka.topic, kafka.dlt, kafka.groupId, kafka.username, kafka.password (protected), db.host, db.database, db.user, db.password (protected), wms.warehouses.`,
    boot: needs('kafka.bootstrapServers', 'kafka.topic', 'kafka.dlt', 'kafka.groupId', 'kafka.username', 'kafka.password', 'db.host', 'db.database', 'db.user', 'db.password', 'wms.warehouses'),
    schedules: [
      { flow: FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true },
      { flow: REPLAY, type: 'fixed', value: '60', unit: 'minutes', enabled: false },
    ],
    run: {
      [FLOW]: (ctx) => {
        const { props, store: st, kafka } = ctx
        const cluster = clusterOf(props)
        const [topic, group, dlt] = [clean(props['kafka.topic']), clean(props['kafka.groupId']), clean(props['kafka.dlt'])]
        const auth = authOf(props)
        const r = kafka.poll(cluster, topic, group, 200, { autoOffsetReset: 'earliest', auth })
        if (!r.ok) return { ok: false, ms: 500, errorType: r.muleType, log: [muleError({ flow: FLOW, file: 'wms-order-consumer', at: 0, name: 'Message listener', dsl: listenDsl, type: r.muleType ?? 'KAFKA:CONNECTIVITY', message: r.text })], store: st }
        const log = []
        if (r.rebalanced) for (const m of r.members) log.push(info(`[Consumer clientId=${m}, groupId=${group}] Adding newly assigned partitions: ${r.assigned.filter((a) => a.member === m).map((a) => `${topic}-${a.partition}`).join(', ') || '(none)'}`, KAFKA_LOG))
        let errorType = null
        let stored = 0
        const stuck = new Set()
        for (const rec of [...r.records].sort((a, b) => a.partition - b.partition || a.offset - b.offset)) {
          if (stuck.has(rec.partition)) continue
          const cid = rec.headers?.correlationId ?? rec.key ?? `${rec.partition}-${rec.offset}`
          const e = readEvent(rec.value)
          const x = e ? store(ctx, e, rec, cid) : { ok: false, kind: 'route', type: 'MULE:EXPRESSION', text: 'The value is not an order event (JSON with orderId and region).' }
          if (x.ok) {
            stored++
            st.done = keep(st.done, e.orderId)
            log.push(x.again ? warn(`correlationId=${cid} Order ${e.orderId} is in ${TABLE} already (${topic}-${rec.partition} offset ${rec.offset}). Skipped, offset committed.`) : info(`correlationId=${cid} Order ${e.orderId} from ${topic}-${rec.partition} offset ${rec.offset} stored in ${TABLE}: warehouse=${x.warehouse}, region=${e.region}, line_count=${e.lineCount}, total=${e.total}. Offset committed.`))
          } else if (x.kind === 'db') {
            // the database is the outage case: the offset stays, so the event comes again once the database answers
            errorType = x.type
            log.push(muleError({ flow: FLOW, file: 'wms-order-consumer', at: 3, name: 'Insert order', dsl: insertDsl, type: x.type ?? 'DB:CONNECTIVITY', message: x.text }))
            stuck.add(rec.partition)
            continue
          } else {
            errorType = x.type
            log.push(muleError({ flow: FLOW, file: 'wms-order-consumer', at: 2, name: 'Route to warehouse', dsl: '<ee:transform doc:name="Route to warehouse">', type: x.type, message: x.text }))
            const d = kafka.produce(cluster, dlt, { key: rec.key, value: rec.value, headers: { ...rec.headers, 'x-original-topic': topic, 'x-original-partition': String(rec.partition), 'x-original-offset': String(rec.offset), 'x-exception': x.text }, acks: 'all', auth })
            if (!d.ok) {
              log.push(muleError({ flow: FLOW, file: 'wms-order-consumer', at: 4, name: 'Publish to dead letter topic', dsl: '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.dlt}">', type: d.muleType ?? 'KAFKA:CONNECTIVITY', message: d.text }))
              stuck.add(rec.partition)
              continue
            }
            st.dlt = keep(st.dlt, { key: rec.key, partition: rec.partition, offset: rec.offset }, 30)
            log.push(warn(`correlationId=${cid} ${topic}-${rec.partition} offset ${rec.offset} sent to ${dlt} partition ${d.partition} offset ${d.offset}. The offset is committed, so the partition goes on.`))
          }
          kafka.commit(cluster, rec.topic, group, rec.partition, rec.offset + 1, auth)
        }
        if (stuck.size) kafka.close(cluster, group)
        // a partition with nothing to read yet gets its first committed offset
        const lag = kafka.lag(cluster, topic, group)
        const mine = new Set(r.members)
        if (lag.ok && !stuck.size) for (const p of lag.partitions) if (p.committed === null && mine.has(p.member)) kafka.commit(cluster, topic, group, p.partition, p.end, auth)
        const after = kafka.lag(cluster, topic, group)
        if (r.records.length) log.push(info(`${stored} of ${r.records.length} events stored. Lag of ${group} on ${topic}: ${after.ok ? after.total : 'unknown'}.`))
        return { ok: !errorType, ms: 1500, errorType, log, store: st }
      },
      [REPLAY]: (ctx) => {
        const { props, store: st, kafka } = ctx
        const cluster = clusterOf(props)
        const dlt = clean(props['kafka.dlt'])
        const auth = authOf(props)
        const r = kafka.poll(cluster, dlt, REPLAY_GROUP, 100, { autoOffsetReset: 'earliest', auth })
        if (!r.ok) return { ok: false, ms: 400, errorType: r.muleType, log: [muleError({ flow: REPLAY, file: 'wms-order-consumer', at: 0, name: 'Read dead letter topic', dsl: `<kafka:consume config-ref="Kafka_Consumer_Config" topic="\${kafka.dlt}" groupId="${REPLAY_GROUP}">`, type: r.muleType ?? 'KAFKA:CONNECTIVITY', message: r.text })], store: st }
        const log = [info(`Replay of ${dlt}: ${r.records.length} event${r.records.length === 1 ? '' : 's'} to try again.`)]
        let left = 0
        let done = 0
        for (const rec of [...r.records].sort((a, b) => a.offset - b.offset)) {
          const cid = rec.headers?.correlationId ?? rec.key
          const e = readEvent(rec.value)
          const x = e ? store(ctx, e, rec, cid) : { ok: false, type: 'MULE:EXPRESSION', text: 'The value is not an order event.' }
          if (!x.ok) {
            left++
            log.push(warn(`correlationId=${cid} ${dlt} offset ${rec.offset} still fails: ${x.text} It stays on the dead letter topic.`))
            break
          }
          done++
          st.done = keep(st.done, e.orderId)
          st.replayed = keep(st.replayed, e.orderId, 50)
          log.push(info(`correlationId=${cid} Replayed order ${e.orderId} from ${dlt} offset ${rec.offset} into ${TABLE}: warehouse=${x.warehouse}.`))
          kafka.commit(cluster, dlt, REPLAY_GROUP, rec.partition, rec.offset + 1, auth)
        }
        // the replay consumer leaves its group, so the next run starts again from the committed offset
        kafka.close(cluster, REPLAY_GROUP)
        log.push(info(`Replay finished: ${done} stored, ${left ? 'stopped at an event that still fails' : 'nothing left'}.`))
        return { ok: !left, ms: 800, ...(left && { errorType: 'MULE:EXPRESSION' }), log, store: st }
      },
    },
  },
}
