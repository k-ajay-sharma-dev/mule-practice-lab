// The sample applications of the setup-kafka lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
//
// order-api-kafka-producer publishes an event for each new order to a Kafka topic. warehouse-kafka-consumer reads the
// events in a consumer group, stores each order in the warehouse system, and puts an event it cannot read on a dead
// letter topic. Both log in with SASL/SCRAM, and the cluster enforces ACLs.
import { info, muleError, needs, warn } from '../platform-log.js'

export const CLUSTER = 'harbor-events'
export const BOOTSTRAP = 'kafka-1.harbor-events.lab:9092,kafka-2.harbor-events.lab:9092,kafka-3.harbor-events.lab:9092'
export const TOPIC = 'order-events.v1'
export const DLT = 'order-events.v1.DLT'
export const GROUP = 'warehouse-orders'
export const PRODUCER = 'order-api-kafka-producer'
export const CONSUMER = 'warehouse-kafka-consumer'
export const PRODUCER_USER = 'svc-order-api'
export const CONSUMER_USER = 'svc-warehouse'
// lab passwords of the SCRAM users, handed over in the mail of the lab
export const PRODUCER_PW = 'oa-lab-26'
export const CONSUMER_PW = 'wh-lab-26'
const KAFKA_LOG = 'org.apache.kafka.clients.consumer.internals.ConsumerCoordinator'

const clean = (v) => String(v ?? '').trim()
const keep = (list, item, n = 300) => [...(list ?? []), item].slice(-n)
// The cluster behind bootstrap.servers: kafka-1.<cluster>.lab:9092. Anything else does not resolve.
export const clusterOf = (props) => (clean(props['kafka.bootstrapServers']).split(',')[0].trim().match(/^kafka-\d\.([a-z0-9-]+)\.lab:9092$/) ?? [])[1] ?? clean(props['kafka.bootstrapServers'])
const authOf = (props) => ({ user: clean(props['kafka.username']), password: clean(props['kafka.password']) })
// The Acknowledge Mode of the producer: NONE (the connector default), LEADER_ONLY or ALL
export const acksOf = (props) => {
  const v = clean(props['kafka.acks']).toUpperCase()
  return ['ALL', 'LEADER_ONLY', 'NONE'].includes(v) ? v : 'NONE'
}
export const keyed = (props) => /orderId/.test(clean(props['kafka.key']))
export const ackModeOf = (props) => {
  const v = clean(props['kafka.ackMode']).toUpperCase()
  return ['AUTO', 'MANUAL', 'IMMEDIATE', 'DUPS_OK'].includes(v) ? v : 'AUTO'
}
export const resetOf = (props) => {
  const v = clean(props['kafka.autoOffsetReset']).toUpperCase()
  return ['EARLIEST', 'LATEST', 'ERROR'].includes(v) ? v : 'LATEST'
}
// the order events the warehouse can store: JSON with an orderId and a status
export function readEvent(value) {
  try {
    const e = JSON.parse(value)
    return e && typeof e.orderId === 'string' && e.orderId && typeof e.status === 'string' ? e : null
  } catch {
    return null
  }
}
const countOf = (path) => {
  const n = Number((path.match(/[?&]count=(\d+)/) ?? [])[1] ?? 20)
  return Math.max(1, Math.min(100, n))
}

const publishDsl = '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.topic}" key="${kafka.key}">'
const listenDsl = '<kafka:message-listener config-ref="Kafka_Consumer_Config" ackMode="${kafka.ackMode}">'
const failed = (flow, file, at, name, dsl, r) => muleError({ flow, file, at, name, dsl, type: r.muleType ?? 'KAFKA:CONNECTIVITY', message: r.text })

export const PACKAGES = {
  [PRODUCER]: {
    note: 'The event side of the order API. POST /orders/test-events?count=20 publishes that many sample order events, a smoke test the team built for the go-live. GET /health reads the metadata of the topic. kafka.bootstrapServers, kafka.topic, kafka.username and kafka.password (SASL/SCRAM-SHA-512) set the connection. kafka.acks is the Acknowledge Mode of the producer (NONE by default, LEADER_ONLY or ALL) and kafka.key the record key, for example #[payload.orderId]. Without a key the records spread over the partitions.',
    boot: needs('kafka.bootstrapServers', 'kafka.topic', 'kafka.username', 'kafka.password'),
    handle({ app, props, now, kafka }, req) {
      // a deployed app starts with no object store; the handler keeps its counters there
      const store = (app.store ??= {})
      const cluster = clusterOf(props)
      const topic = clean(props['kafka.topic'])
      if (req.method === 'GET' && req.path === '/health') {
        const d = kafka.describe(cluster, topic, { auth: authOf(props) })
        if (!d.ok) return { status: 503, ms: 900, body: JSON.stringify({ status: 'DOWN', kafka: d.text }), log: [failed('health-flow', PRODUCER, 1, 'Describe topic', '<kafka:get-topic-metadata config-ref="Kafka_Producer_Config">', d)] }
        return { status: 200, ms: 40, body: JSON.stringify({ status: 'UP', kafka: { cluster, topic: d.topic, partitions: d.partitions, replicationFactor: d.replicationFactor, partitionsWithLeader: d.leaders, minInsyncReplicas: d.minIsr, user: authOf(props).user, acks: acksOf(props) } }), log: [info(`Health check: ${topic} has ${d.partitions} partitions, all with a leader: ${d.leaders === d.partitions}`)] }
      }
      if (req.method === 'POST' && req.path.startsWith('/orders/test-events')) {
        const count = countOf(req.path)
        const acks = acksOf(props)
        const byPartition = {}
        const log = []
        let next = store.next ?? 9001
        let sent = 0
        for (let i = 0; i < count; i++, next++) {
          const orderId = `T-${next}`
          const value = { orderId, customerId: `C-${(next % 40) + 1}`, status: 'CREATED', lines: 1 + (next % 3), total: 10 + (next % 9) * 4.25, createdAt: now }
          const r = kafka.produce(cluster, topic, { key: keyed(props) ? orderId : null, value, headers: { source: PRODUCER, 'content-type': 'application/json' }, acks: acks === 'ALL' ? 'all' : acks === 'LEADER_ONLY' ? '1' : '0', auth: authOf(props) })
          if (!r.ok) {
            log.push(failed('publish-test-events-flow', PRODUCER, 2, 'Publish order event', publishDsl, r))
            store.next = next
            return { status: 500, ms: 600, body: JSON.stringify({ published: sent, error: r.text }), log }
          }
          byPartition[r.partition] = (byPartition[r.partition] ?? 0) + 1
          store.test = keep(store.test, orderId)
          sent++
        }
        store.next = next
        log.push(info(`Published ${sent} test order events to ${topic} with acks ${acks}${keyed(props) ? ', key orderId' : ', no key'}. Partitions: ${Object.entries(byPartition).map(([p, n]) => `${p}:${n}`).join(' ')}`))
        if (acks !== 'ALL') log.push(warn(`Acknowledge Mode ${acks}: the producer does not wait for the in-sync replicas, so an event can be lost when a leader fails.`))
        return { status: 201, ms: 30 * sent, body: JSON.stringify({ published: sent, topic, partitions: byPartition }), log }
      }
      return { status: 404, ms: 3, body: '' }
    },
  },
  [CONSUMER]: {
    note: 'A Kafka Message Listener in the consumer group kafka.groupId. Each replica is one member. It stores each order event in the warehouse system. kafka.ackMode is AUTO (the default, commit when the flow ends well) or MANUAL (the flow commits the offset after the order is stored). kafka.autoOffsetReset is LATEST by default, EARLIEST or ERROR. An event it cannot read goes to the dead letter topic in kafka.dlt with the original topic, partition, offset and error in its headers, and the offset is committed.',
    boot: needs('kafka.bootstrapServers', 'kafka.topic', 'kafka.groupId', 'kafka.username', 'kafka.password', 'kafka.dlt'),
    schedules: [{ flow: 'order-events-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'order-events-flow': ({ props, store, now, kafka }) => {
        const cluster = clusterOf(props)
        const [topic, group, dlt] = [clean(props['kafka.topic']), clean(props['kafka.groupId']), clean(props['kafka.dlt'])]
        const auth = authOf(props)
        const manual = ackModeOf(props) === 'MANUAL'
        const r = kafka.poll(cluster, topic, group, 500, { autoOffsetReset: resetOf(props) === 'ERROR' ? 'none' : resetOf(props).toLowerCase(), auth })
        if (!r.ok) return { ok: false, ms: 500, errorType: r.muleType, log: [failed('order-events-flow', CONSUMER, 0, 'Message listener', listenDsl, r)], store }
        const log = []
        if (r.rebalanced)
          for (const m of r.members) {
            const parts = r.assigned.filter((a) => a.member === m).map((a) => `${topic}-${a.partition}`)
            log.push((parts.length ? info : warn)(`[Consumer clientId=${m}, groupId=${group}] Adding newly assigned partitions: ${parts.join(', ') || '(none)'}`, KAFKA_LOG))
          }
        for (const n of r.notes ?? []) log.push(info(n, 'org.apache.kafka.clients.consumer.internals.SubscriptionState'))
        let stored = 0
        let dead = 0
        let errorType = null
        const handled = []
        const stuck = new Set()
        for (const rec of [...r.records].sort((a, b) => a.partition - b.partition || a.offset - b.offset)) {
          if (stuck.has(rec.partition)) continue
          const e = readEvent(rec.value)
          if (e) {
            store.done = keep(store.done, e.orderId)
            stored++
          } else {
            const why = 'MULE:EXPRESSION: the value is not an order event (JSON with orderId and status)'
            const d = kafka.produce(cluster, dlt, { key: rec.key, value: rec.value, headers: { ...rec.headers, 'x-original-topic': topic, 'x-original-partition': String(rec.partition), 'x-original-offset': String(rec.offset), 'x-exception': why }, acks: 'all', auth })
            if (!d.ok) {
              // lab-made: after the error the consumer seeks back to its committed offset, so the event comes again
              errorType = d.muleType ?? 'KAFKA:CONNECTIVITY'
              log.push(failed('order-events-flow', CONSUMER, 4, 'Publish to dead letter topic', '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.dlt}">', d))
              stuck.add(rec.partition)
              continue
            }
            store.dlt = keep(store.dlt, { partition: rec.partition, offset: rec.offset, t: now }, 50)
            log.push(warn(`${topic}-${rec.partition} offset ${rec.offset}: ${why}. Sent to ${dlt} partition ${d.partition} offset ${d.offset}, and the offset is committed.`))
            dead++
          }
          handled.push(rec)
          // MANUAL: the flow commits each event once the order is stored
          if (manual) kafka.commit(cluster, rec.topic, group, rec.partition, rec.offset + 1, auth)
        }
        // AUTO: the connector commits what the flow handled when it ends well
        if (!manual && !errorType) kafka.commitRecords(cluster, group, handled, auth)
        if (stuck.size) kafka.close(cluster, group)
        // a partition with nothing to read yet gets its first committed offset
        const lag = kafka.lag(cluster, topic, group)
        const mine = new Set(r.members)
        if (lag.ok && !stuck.size) for (const p of lag.partitions) if (p.committed === null && mine.has(p.member)) kafka.commit(cluster, topic, group, p.partition, p.end, auth)
        const after = kafka.lag(cluster, topic, group)
        if (stored || dead || r.rebalanced) log.push(info(`Stored ${stored} orders in the warehouse system${dead ? `, ${dead} sent to ${dlt}` : ''}. ${r.members.length} consumers in ${group}. Lag of ${topic}: ${after.ok ? after.total : 'unknown'}.`))
        return { ok: !errorType, ms: 40000, errorType, log, store }
      },
    },
  },
}
