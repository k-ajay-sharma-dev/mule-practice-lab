// The sample applications of the kafka-min-isr lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const CLUSTER = 'brightmart-events'
export const ORDERS = 'orders.v1'
export const STOCK = 'stock.v1'
const ORDERS_PER_MINUTE = 3
const SKUS = ['SKU-1001', 'SKU-1002', 'SKU-1003', 'SKU-1004', 'SKU-1005', 'SKU-1006', 'SKU-1007', 'SKU-1008', 'SKU-1009', 'SKU-1010', 'SKU-1011', 'SKU-1012']
const UPDATES_PER_MINUTE = 4
const ACKS = ['NONE', 'LEADER_ONLY', 'ALL']
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)

// The Acknowledge Mode of the producer. An empty value is the default of the Kafka connector, NONE.
export const acksOf = (props) => {
  const v = String(props['kafka.acks'] ?? '').trim().toUpperCase()
  return ACKS.includes(v) ? v : 'NONE'
}
const publishError = (flow, file, name, r) =>
  muleError({ flow, file, at: 2, name, dsl: '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.topic}">', type: r.muleType, message: r.text })

export const PACKAGES = {
  'order-events-publisher': {
    note: 'Each minute 3 new orders are saved in the order database with a row in an outbox table. The flow publishes the outbox rows to kafka.topic in order, with the order ID as the key and the Acknowledge Mode in kafka.acks (NONE, LEADER_ONLY or ALL; empty is the connector default NONE). A row leaves the outbox only when the publish succeeds, so a failed publish is tried again the next minute.',
    boot: needs('kafka.cluster', 'kafka.topic'),
    schedules: [{ flow: 'publish-outbox-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-outbox-flow': ({ props, store, now, kafka }) => {
        const acks = acksOf(props)
        let from = store.from ?? 9001
        const to = (store.to ?? from) + ORDERS_PER_MINUTE
        const start = from
        while (from < to) {
          const id = `O-${from}`
          const r = kafka.produce(props['kafka.cluster'], props['kafka.topic'], { key: id, value: { orderId: id, status: 'CREATED' }, acks })
          if (!r.ok && acks !== 'NONE') {
            const log = [publishError('publish-outbox-flow', 'order-events-publisher', 'Publish order event', r), warn(`${to - from} orders wait in the outbox, the oldest is ${id}. They are tried again in a minute.`)]
            return { ok: false, ms: 120000, errorType: r.muleType, log, store: { ...store, from, to, waiting: to - from } }
          }
          // NONE does not wait for the broker, so the app never sees an error and the row leaves the outbox
          if (!r.ok) store.lost = keep(store.lost, { key: id, t: now })
          from++
        }
        return { ok: true, ms: 40 * (to - start), log: [info(`Published ${to - start} order events to ${props['kafka.topic']} with acks ${acks}. The outbox is empty.`)], store: { ...store, from, to, waiting: 0 } }
      },
    },
  },
  'stock-updates-publisher': {
    note: 'Each minute it sends the stock counts that changed in the warehouse to kafka.topic, with the SKU as the key and the Acknowledge Mode in kafka.acks (empty is the connector default NONE). With NONE the flow does not wait for any answer of the broker. With LEADER_ONLY or ALL a failed publish raises an error and the update is sent again the next minute.',
    boot: needs('kafka.cluster', 'kafka.topic'),
    schedules: [{ flow: 'publish-stock-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'publish-stock-flow': ({ props, store, now, kafka }) => {
        const acks = acksOf(props)
        const turn = store.turn ?? 0
        const fresh = Array.from({ length: UPDATES_PER_MINUTE }, (_, i) => SKUS[(turn * UPDATES_PER_MINUTE + i) % SKUS.length])
        const todo = [...new Set([...(store.retry ?? []), ...fresh])]
        const retry = []
        let error = null
        let sent = 0
        for (const sku of todo) {
          const r = kafka.produce(props['kafka.cluster'], props['kafka.topic'], { key: sku, value: { sku, onHand: 40 + ((turn * 7 + sku.length) % 30) }, acks })
          if (r.ok) {
            sent++
            store.sent = keep(store.sent, { key: sku, t: now })
          } else if (acks === 'NONE') {
            // the record never reached a broker, and nothing tells the flow
            sent++
            store.lost = keep(store.lost, { key: sku, t: now })
            store.lostCount = (store.lostCount ?? 0) + 1
          } else {
            error ??= r
            retry.push(sku)
          }
        }
        const log = [info(`Sent ${sent} stock updates to ${props['kafka.topic']} with acks ${acks}`)]
        if (error) {
          log.push(publishError('publish-stock-flow', 'stock-updates-publisher', 'Publish stock update', error), warn(`${retry.length} stock updates are sent again in a minute: ${retry.join(', ')}`))
          return { ok: false, ms: 120000, errorType: error.muleType, log, store: { ...store, turn: turn + 1, retry } }
        }
        return { ok: true, ms: 30 * todo.length, log, store: { ...store, turn: turn + 1, retry } }
      },
    },
  },
}
