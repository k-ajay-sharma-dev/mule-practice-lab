// The sample applications of the kafka-rebalance lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs } from '../platform-log.js'

export const CLUSTER = 'brightmart-events'
export const TOPIC = 'store-orders.v1'
export const GROUP = 'erp-invoicing'
// orders the stores send in each import, every 10 minutes
export const IMPORT = 12
// invoices the ERP takes in a minute: each call takes about 20 seconds
export const PER_MINUTE = 3
const MINUTE = 60000
const KAFKA_LOG = 'org.apache.kafka.clients.consumer.internals.ConsumerCoordinator'
const ACK_MODES = ['AUTO', 'MANUAL', 'IMMEDIATE', 'DUPS_OK']

const clean = (v) => String(v ?? '').trim()
export const ackMode = (props) => (ACK_MODES.includes(clean(props['kafka.ackMode']).toUpperCase()) ? clean(props['kafka.ackMode']).toUpperCase() : 'AUTO')
export const listener = (props) => (clean(props['kafka.listener']).toLowerCase() === 'record' ? 'record' : 'batch')
// the offset is committed after each record the ERP accepted
export const perRecord = (props) => listener(props) === 'record' && ['AUTO', 'MANUAL'].includes(ackMode(props))
export const skipsExisting = (props) => clean(props['invoice.skipExisting']).toLowerCase() === 'true'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)

export const PACKAGES = {
  'store-orders-import': {
    note: 'Every 10 minutes it publishes the orders of the stores to kafka.topic, 12 at a time, with the order ID as the key and acks ALL.',
    boot: needs('kafka.cluster', 'kafka.topic'),
    schedules: [{ flow: 'import-orders-flow', type: 'cron', value: '0 0/10 * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'import-orders-flow': ({ props, store, kafka }) => {
        const from = store.next ?? 7001
        for (let i = 0; i < IMPORT; i++) {
          const id = `O-${from + i}`
          const r = kafka.produce(props['kafka.cluster'], props['kafka.topic'], { key: id, value: { orderId: id, store: `S-${10 + (i % 4)}`, total: 20 + i * 4.5 }, acks: 'ALL' })
          if (!r.ok) return { ok: false, ms: 300, errorType: r.muleType, log: [muleError({ flow: 'import-orders-flow', file: 'store-orders-import', at: 2, name: 'Publish order', dsl: '<kafka:publish config-ref="Kafka_Producer_Config" topic="${kafka.topic}">', type: r.muleType, message: r.text })], store: { next: from + i } }
        }
        return { ok: true, ms: 900, log: [info(`Published orders O-${from} to O-${from + IMPORT - 1} to ${props['kafka.topic']}`)], store: { next: from + IMPORT } }
      },
    },
  },
  'erp-invoice-consumer': {
    note: 'Reads store orders from kafka.topic in the group kafka.groupId and posts one invoice for each order to the ERP, about 3 a minute. kafka.listener is batch (Batch Message Listener: one flow run for all records of a poll) or record (Message Listener: one flow run per record). kafka.ackMode is AUTO (commit when the flow run ends with success), MANUAL (the flow calls Commit after the ERP accepts the invoice), IMMEDIATE (commit when the records arrive, before the flow) or DUPS_OK (like MANUAL, but the commits run asynchronously, so a commit can lag behind and records can come again). invoice.skipExisting true makes the flow look up the order in the ERP first and skip an order that has an invoice.',
    boot: needs('kafka.cluster', 'kafka.topic', 'kafka.groupId', 'erp.host'),
    schedules: [{ flow: 'erp-invoice-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'erp-invoice-flow': ({ app, props, store, now, kafka }) => {
        const [c, t, g] = [props['kafka.cluster'], props['kafka.topic'], props['kafka.groupId']]
        const client = `${app.name}-replica-1`
        const mode = ackMode(props)
        const log = []
        store.invoices ??= {}
        // A deployment starts new replicas and stops the old ones. The records the old replica held in memory are gone,
        // its consumer leaves the group, and the new consumer starts from the committed offsets.
        // a run that was missed means the application was stopped, which also ends the old replica
        const restarted = (store.config !== undefined && store.config !== app.config) || (store.ran !== undefined && now - store.ran > MINUTE)
        store.ran = now
        if (restarted) {
          const held = store.batch ?? []
          for (const x of held.filter((r) => !r.done && r.committed)) store.lost = keep(store.lost, { key: x.key, t: now })
          log.push(info(`[Consumer clientId=${client}, groupId=${g}] Member sending LeaveGroup request to coordinator due to the consumer is being closed`, KAFKA_LOG))
          kafka.close(c, g)
          store.batch = []
        }
        store.config = app.config
        let batch = store.batch ?? []
        if (!batch.some((x) => !x.done)) {
          const r = kafka.poll(c, t, g, 500, { autoOffsetReset: 'earliest' })
          if (!r.ok) return { ok: false, ms: 300, errorType: r.muleType, log: [...log, muleError({ flow: 'erp-invoice-flow', file: 'erp-invoice-consumer', at: 1, name: 'Message Listener', dsl: '<kafka:message-listener config-ref="Kafka_Consumer_Config">', type: r.muleType, message: r.text })], store }
          if (r.rebalanced) {
            log.push(info(`[Consumer clientId=${client}, groupId=${g}] Adding newly assigned partitions: ${r.assigned.map((a) => `${t}-${a.partition}`).join(', ')}`, KAFKA_LOG))
            const first = {}
            for (const x of r.records) first[x.partition] ??= x.offset
            for (const [p, o] of Object.entries(first)) log.push(info(`[Consumer clientId=${client}, groupId=${g}] Setting offset for partition ${t}-${p} to the committed offset FetchPosition{offset=${o}}`, KAFKA_LOG))
          }
          batch = r.records.map((x) => ({ topic: t, partition: x.partition, offset: x.offset, key: x.key, done: false, committed: false }))
          if (batch.length) log.push(info(`Received ${batch.length} records from ${t}${listener(props) === 'batch' ? ' in one batch' : ''}`))
          if (mode === 'IMMEDIATE' && batch.length) {
            kafka.commitRecords(c, g, batch)
            for (const x of batch) x.committed = true
          }
        }
        let n = 0
        let lazy = 0
        for (const x of batch) {
          if (x.done || n >= PER_MINUTE) continue
          n++
          x.done = true
          if (skipsExisting(props) && store.invoices[x.key]) log.push(info(`Order ${x.key} has an invoice in the ERP already. Skipped.`))
          else {
            store.invoices[x.key] = (store.invoices[x.key] ?? 0) + 1
            const number = `INV-${x.key.slice(2)}-${store.invoices[x.key]}`
            log.push(info(`Invoice ${number} for order ${x.key} posted to the ERP`))
            store.posted = keep(store.posted, { key: x.key, t: now })
            if (store.invoices[x.key] > 1) store.dupes = keep(store.dupes, { key: x.key, t: now })
          }
          if (perRecord(props)) {
            kafka.commit(c, t, g, x.partition, x.offset + 1)
            x.committed = true
          } else if (mode === 'DUPS_OK' && ++lazy % 5 === 0) {
            kafka.commitRecords(c, g, batch.filter((y) => y.done && !y.committed))
            for (const y of batch) if (y.done) y.committed = true
          }
        }
        // the flow run of the batch ends: AUTO and the Commit at the end of the flow commit every record of the poll
        if (batch.length && batch.every((x) => x.done)) {
          const open = batch.filter((x) => !x.committed)
          if (open.length) kafka.commitRecords(c, g, open)
          batch = []
        }
        store.batch = batch
        return { ok: true, ms: n * 20000, log, store }
      },
    },
  },
}
