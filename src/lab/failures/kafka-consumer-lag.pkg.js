// The sample applications of the kafka-consumer-lag lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const CLUSTER = 'harbor-events'
export const TOPIC = 'orders.v1'
export const GROUP = 'warehouse-pick'
export const PARTITIONS = 6
// orders one consumer hands to the pick system in a minute: each order takes about 10 seconds there
export const PER_CONSUMER = 6
const MINUTE = 60000
const HOUR = 60 * MINUTE
// the autumn sale starts at 08:30 on the lab day, and orders go from 4 to 12 a minute
export const SALE = 24 * HOUR + 8 * HOUR + 30 * MINUTE
const ordersAt = (now) => (now >= SALE ? 12 : 4)
const KAFKA_LOG = 'org.apache.kafka.clients.consumer.internals.ConsumerCoordinator'

const failed = (flow, file, r, op) => ({
  ok: false,
  ms: 300,
  errorType: r.muleType,
  log: [muleError({ flow, file, at: 1, name: op === 'publish' ? 'Publish order' : 'Consume orders', dsl: `<kafka:${op} config-ref="Kafka_${op === 'publish' ? 'Producer' : 'Consumer'}_Config">`, type: r.muleType, message: r.text })],
})

export const PACKAGES = {
  'sale-orders-publisher': {
    note: 'Publishes each new web shop order to the Kafka topic in kafka.topic, with the order ID as the key and acks ALL. Before the sale it is about 4 orders a minute, during the sale 12.',
    boot: needs('kafka.cluster', 'kafka.topic'),
    schedules: [{ flow: 'publish-orders-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-orders-flow': ({ props, store, now, kafka }) => {
        for (let i = 0; i < ordersAt(now); i++) {
          const id = `O-${store.next ?? 5001}`
          const r = kafka.produce(props['kafka.cluster'], props['kafka.topic'], { key: id, value: { orderId: id, lines: 1 + (i % 4) }, acks: 'ALL' })
          if (!r.ok) return { ...failed('publish-orders-flow', 'sale-orders-publisher', r, 'publish'), store }
          store.next = (store.next ?? 5001) + 1
        }
        return { ok: true, ms: 30 * ordersAt(now), log: [], store }
      },
    },
  },
  'warehouse-pick-consumer': {
    note: 'Reads the orders of kafka.topic in the consumer group kafka.groupId and hands each one to the pick system of the warehouse, which takes about 10 seconds an order. Each replica is one member of the group, and one member hands over about 6 orders a minute. The offset is committed after each order.',
    boot: needs('kafka.cluster', 'kafka.topic', 'kafka.groupId'),
    schedules: [{ flow: 'pick-orders-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'pick-orders-flow': ({ props, store, kafka }) => {
        const [c, t, g] = [props['kafka.cluster'], props['kafka.topic'], props['kafka.groupId']]
        const r = kafka.poll(c, t, g, 500, { autoOffsetReset: 'earliest' })
        if (!r.ok) return failed('pick-orders-flow', 'warehouse-pick-consumer', r, 'consume')
        const log = []
        if (r.rebalanced)
          for (const m of r.members) {
            const parts = r.assigned.filter((a) => a.member === m).map((a) => `${t}-${a.partition}`)
            log.push(parts.length ? info(`[Consumer clientId=${m}, groupId=${g}] Adding newly assigned partitions: ${parts.join(', ')}`, KAFKA_LOG) : warn(`[Consumer clientId=${m}, groupId=${g}] Adding newly assigned partitions: (none). This consumer has no partition and stays idle.`, KAFKA_LOG))
          }
        // lab-made: the pick system takes the orders from the committed offset on, so the lab reads the lag and commits
        // what each member got through in this minute
        const lag = kafka.lag(c, t, g)
        const mine = new Set(r.members)
        const byMember = {}
        for (const p of lag.partitions) if (mine.has(p.member)) (byMember[p.member] ??= []).push({ p, from: p.committed ?? p.start, n: 0 })
        let handed = 0
        for (const todo of Object.values(byMember)) {
          let left = PER_CONSUMER
          let moved = true
          while (left > 0 && moved) {
            moved = false
            for (const x of todo)
              if (left > 0 && x.from + x.n < x.p.end) {
                x.n++
                left--
                moved = true
              }
          }
          for (const x of todo)
            if (x.n || x.p.committed === null) {
              kafka.commit(c, t, g, x.p.partition, x.from + x.n)
              handed += x.n
            }
        }
        const after = kafka.lag(c, t, g)
        const busy = Object.keys(byMember).length
        log.push(info(`Handed ${handed} orders to the pick system. ${r.members.length} consumer${r.members.length === 1 ? '' : 's'} in group ${g}, ${busy} with partitions. Lag of ${t}: ${after.ok ? after.total : 'unknown'}.`))
        store.lastLag = after.ok ? after.total : null
        return { ok: true, ms: 50000, log, store }
      },
    },
  },
}
