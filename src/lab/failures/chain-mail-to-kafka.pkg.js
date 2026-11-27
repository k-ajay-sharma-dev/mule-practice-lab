// The sample applications of the chain-mail-to-kafka lab. Imports only platform-log.js, so the engine can load it without a cycle.
// A supplier mails its advance ship notices (ASN). asn-mail-intake reads the shared mailbox over IMAP (ctx.mailbox) and
// publishes each ASN to Kafka (ctx.kafka). wms-inbound-consumer reads the topic and books the inbound stock in the WMS,
// which the store app shows as stock on its way.
import { info, muleError, needs, warn } from '../platform-log.js'

export const BOX = 'asn@brightmart.example'
export const CLUSTER = 'brightmart-events'
export const TOPIC = 'inbound-asn.v1'
export const GROUP = 'wms-inbound'
export const INTAKE = 'asn-mail-intake'
export const WMS = 'wms-inbound-consumer'
export const INTAKE_FLOW = 'asn-mail-flow'
export const WMS_FLOW = 'wms-booking-flow'
const KAFKA_LOG = 'org.mule.extension.kafka'
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
const word = (v) => String(v ?? '').trim().toLowerCase()

export const afterPublish = (p) => word(p['after.publish']) || 'none' // none, seen or move
const ACKS = { NONE: 'NONE', LEADER_ONLY: 'LEADER_ONLY', ALL: 'ALL', '0': 'NONE', '1': 'LEADER_ONLY', '-1': 'ALL' }
export const acksOf = (p) => ACKS[String(p['kafka.acks'] ?? '').trim().toUpperCase()] ?? 'NONE' // NONE is the default of the connector
export const idempotent = (p) => word(p['idempotency.key']) === 'asnid'

// ASN: ASN-88231 / PO: PO-4410 / SKU: H-300 / Qty: 240 / Warehouse: DUB-1
export function readAsn(text) {
  const get = (k) => String(text ?? '').match(new RegExp(`^${k}:\\s*(.+)$`, 'mi'))?.[1]?.trim()
  const asn = get('ASN')
  const qty = Number(get('Qty'))
  if (!asn || !get('SKU') || !(qty > 0)) return null
  return { asnId: asn, po: get('PO'), sku: get('SKU'), qty, warehouse: get('Warehouse'), eta: get('ETA') ?? null }
}
const mailCfg = (p) => ({ protocol: word(p['mail.protocol']) || 'imaps', host: p['mail.host'], port: p['mail.port'], user: p['mail.user'], password: p['mail.password'] })

// What the WMS has booked as inbound per SKU, and what the ASNs really announce
export const truthOf = (store) => Object.values(store?.asns ?? {}).reduce((m, a) => ({ ...m, [a.sku]: (m[a.sku] ?? 0) + a.qty }), {})

export const PACKAGES = {
  [INTAKE]: {
    note: `Every minute the On New Email source reads the unread mail of ${BOX} over IMAPS and publishes each ASN to kafka.topic, with the ASN number as the key. It remembers the UIDs it published in an in memory Object Store (persistent false), so it skips them on the next polls of the same start. after.publish says what happens to a mail once its publish has returned: none, seen (mark as read) or move (to Processed). kafka.acks is the Acknowledge Mode of the producer: NONE (the default of the connector), LEADER_ONLY or ALL.`,
    boot: needs('mail.host', 'mail.port', 'mail.user', 'mail.password', 'kafka.cluster', 'kafka.topic'),
    schedules: [{ flow: INTAKE_FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [INTAKE_FLOW]: (ctx) => {
        const { app, props, store, now, kafka } = ctx
        const log = []
        const started = app.started ?? null
        if (!store.mem || store.mem.started !== started) {
          if (store.mem) log.push(info(`Object store asn-published (persistent false) is empty after the start of the replica at ${new Date(Date.UTC(2026, 10, 2) + (started ?? now)).toISOString().slice(11, 16)}.`, 'org.mule.runtime.core.internal.store'))
          store.mem = { started, uids: [] }
        }
        const cfg = mailCfg(props)
        const polled = ctx.mailbox.poll(cfg, 'INBOX', { unreadOnly: true })
        if (!polled.ok) return { ok: false, ms: 1200, errorType: polled.type, log: [...log, muleError({ flow: INTAKE_FLOW, file: INTAKE, at: 0, name: 'ASN mailbox', dsl: '<email:listener-imap doc:name="ASN mailbox" config-ref="Email_IMAP" folder="INBOX">', type: polled.type, message: polled.error })], store }
        const fresh = polled.messages.filter((m) => !store.mem.uids.includes(m.uid))
        if (!fresh.length) return { ok: true, ms: 200, log, store }
        log.push(info(`On New Email: ${fresh.length} unread mail${fresh.length > 1 ? 's' : ''} in INBOX of ${cfg.user} that this start of the app has not published`))
        const acks = acksOf(props)
        const after = afterPublish(props)
        const errors = []
        store.published ??= {}
        for (const m of fresh) {
          const a = readAsn(m.text)
          if (!a) {
            log.push(warn(`${m.messageId} "${m.subject}" has no ASN, SKU or Qty line. Skipped.`))
            store.mem.uids = [...store.mem.uids, m.uid].slice(-200)
            continue
          }
          const r = kafka.produce(props['kafka.cluster'], props['kafka.topic'], { key: a.asnId, value: { type: 'AsnReceived', ...a, supplier: 'Tidewell Foods', messageId: m.messageId }, headers: { messageId: m.messageId }, acks })
          if (!r.ok) {
            errors.push(r.muleType)
            log.push(muleError({ flow: INTAKE_FLOW, file: INTAKE, at: 2, name: 'Publish ASN', dsl: '<kafka:publish doc:name="Publish ASN" config-ref="Kafka_Producer_Config" topic="${kafka.topic}" key="#[payload.asnId]">', type: r.muleType, message: r.text }))
            continue
          }
          store.mem.uids = [...store.mem.uids, m.uid].slice(-200)
          store.published[a.asnId] = (store.published[a.asnId] ?? 0) + 1
          store.pubs = keep(store.pubs, { asn: a.asnId, uid: m.uid, t: now, n: store.published[a.asnId] })
          log.push(info(`Published ${a.asnId} (${a.po}, mail uid ${m.uid}) to ${props['kafka.topic']}-${r.partition} at offset ${r.offset}, acks ${acks}`, KAFKA_LOG))
          if (after === 'seen' || after === 'move') {
            const done = after === 'move' ? ctx.mailbox.move(cfg, 'INBOX', m.uid, 'Processed') : ctx.mailbox.markSeen(cfg, 'INBOX', m.uid)
            if (!done.ok) {
              errors.push(done.type)
              log.push(muleError({ flow: INTAKE_FLOW, file: INTAKE, at: 3, name: after === 'move' ? 'Move to Processed' : 'Mark as read', dsl: after === 'move' ? '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Processed">' : '<email:mark-as-read config-ref="Email_IMAP" emailId="#[attributes.number]" mailboxFolder="INBOX">', type: done.type, message: done.error }))
            }
          }
        }
        return { ok: errors.length === 0, ms: 900, errorType: errors[0] ?? null, errors: errors.length, log, store }
      },
    },
  },
  [WMS]: {
    note: `Reads kafka.topic in the group kafka.groupId and books each AsnReceived record in the WMS as inbound stock, which the store app shows as on its way. Each booking is a call to the WMS of about 40 seconds, so it takes one record a minute, and it commits the offset after the WMS answered. A StockAdjustment record ({"type":"StockAdjustment","adjustmentId":"...","sku":"...","qty":-10} or with a lines list of sku and qty) changes the inbound stock. idempotency.key none books every record; asnId keeps the ASN number of each booking (and the adjustmentId of each adjustment) in a persistent Object Store and skips a record whose key is there.`,
    boot: needs('kafka.cluster', 'kafka.topic', 'kafka.groupId'),
    schedules: [{ flow: WMS_FLOW, type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      [WMS_FLOW]: (ctx) => {
        const { props, store, now, kafka } = ctx
        const [c, t, g] = [props['kafka.cluster'], props['kafka.topic'], props['kafka.groupId']]
        const r = kafka.poll(c, t, g, 1, { autoOffsetReset: 'earliest' })
        if (!r.ok) return { ok: false, ms: 300, errorType: r.muleType, log: [muleError({ flow: WMS_FLOW, file: WMS, at: 0, name: 'Message Listener', dsl: '<kafka:message-listener config-ref="Kafka_Consumer_Config">', type: r.muleType, message: r.text })], store }
        if (!r.records.length) return { ok: true, ms: 100, log: [], store }
        const log = []
        store.inbound ??= {}
        store.asns ??= {}
        store.bookings ??= {}
        const idem = idempotent(props)
        for (const x of r.records) {
          const where = `${t}-${x.partition}@${x.offset}`
          let v = null
          try {
            v = JSON.parse(x.value)
          } catch {
            v = null
          }
          if (v?.type === 'AsnReceived' && v.asnId && v.sku && Number(v.qty) > 0) {
            if (idem && store.bookings[v.asnId]) log.push(info(`${v.asnId} (${where}) is in the Object Store wms-booked-asns already, so the WMS was not called`))
            else {
              const n = (store.bookings[v.asnId] ?? 0) + 1
              store.bookings[v.asnId] = n
              store.asns[v.asnId] ??= { sku: v.sku, qty: Number(v.qty), t: now }
              store.inbound[v.sku] = (store.inbound[v.sku] ?? 0) + Number(v.qty)
              store.booked = keep(store.booked, { asn: v.asnId, t: now, n })
              store.receipt = (store.receipt ?? 5000) + 1
              log.push(info(`WMS answered 201 Created: inbound receipt IR-${store.receipt} for ${v.asnId}, ${v.qty} x ${v.sku} to ${v.warehouse} (${where})`))
            }
          } else if (v?.type === 'StockAdjustment') {
            const lines = Array.isArray(v.lines) ? v.lines : [{ sku: v.sku, qty: v.qty }]
            const ok = lines.length > 0 && lines.every((l) => l?.sku && Number.isFinite(Number(l.qty)) && Number(l.qty) !== 0)
            if (!v.adjustmentId || !ok) log.push(warn(`StockAdjustment at ${where} not booked: it needs an adjustmentId and a sku and a qty that is not 0 for each line`))
            else if (idem && (store.adjs ?? []).includes(v.adjustmentId)) log.push(info(`StockAdjustment ${v.adjustmentId} (${where}) is in the Object Store already, so the WMS was not called`))
            else {
              for (const l of lines) store.inbound[l.sku] = (store.inbound[l.sku] ?? 0) + Number(l.qty)
              store.adjs = keep(store.adjs, v.adjustmentId, 60)
              store.adjusted = keep(store.adjusted, { id: v.adjustmentId, t: now }, 20)
              log.push(info(`WMS answered 200 OK: adjustment ${v.adjustmentId} ${lines.map((l) => `${Number(l.qty) > 0 ? '+' : ''}${l.qty} x ${l.sku}`).join(', ')} on inbound stock${v.reason ? `, reason: ${v.reason}` : ''} (${where})`))
            }
          } else log.push(warn(`Record at ${where} is not an AsnReceived or StockAdjustment event. Skipped.`))
          // the offset is committed after the WMS answered (acknowledgement mode MANUAL)
          kafka.commit(c, t, g, x.partition, x.offset + 1)
        }
        return { ok: true, ms: 40000, log, store }
      },
    },
  },
}
