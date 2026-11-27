// The sample application of the mq-poison lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const POISON_ID = 'm-1'
export const POISON_BODY = '{"order":"O-7731","total":42,"address":{"street":"Quay Road 4","city":'
// delivery attempts the lab queue makes in one go before it gives a failed message up
export const LAB_ATTEMPTS = 3
// how often the lab redelivers the bad message while nothing stops it: every 5 seconds
const PER_MINUTE = 12
const MINUTE = 60000

const whole = (value) => (String(value ?? '').trim() !== '' && Number.isInteger(Number(value)) ? Number(value) : null)
// maxRedeliveryCount of the redelivery policy on the Subscriber. Empty: no redelivery policy.
export const maxRedelivery = (props) => {
  const n = whole(props['mq.maxRedeliveryCount'])
  return n !== null && n >= 0 ? n : null
}
export const handles = (props, key) => String(props[key] ?? '').trim().toLowerCase() === 'continue'
const badData = (props) => handles(props, 'onError.badData')
const temporary = (props) => handles(props, 'onError.temporary')

const read = (body) => {
  try {
    const e = JSON.parse(body)
    return e?.order ? e : null
  } catch {
    return null
  }
}
const parseError = (id) => ({
  flow: 'shipment-label-flow',
  file: 'shipment-label-consumer',
  at: 1,
  name: 'Read shipment request',
  dsl: '<ee:transform doc:name="Read shipment request">',
  type: 'MULE:EXPRESSION',
  message: `Unexpected end of input at payload@[1:71], expected a value. Message Id ${id}`,
})
const carrierError = (host, order) => ({
  flow: 'shipment-label-flow',
  file: 'shipment-label-consumer',
  at: 3,
  name: 'Create label',
  dsl: '<http:request method="POST" path="/labels" config-ref="Carrier_Config" doc:name="Create label">',
  type: 'HTTP:SERVICE_UNAVAILABLE',
  message: `HTTP POST on resource 'https://${host}/labels' failed: service unavailable (503). Order ${order}.`,
})
const keep = (list, item) => [...(list ?? []), item].slice(-20)

export const PACKAGES = {
  'shipment-label-consumer': {
    note: 'Takes shipment requests from the queue in queue.name (Subscriber, AUTO) and creates a shipping label at the parcel carrier. mq.maxRedeliveryCount is the redelivery policy of the Subscriber; empty means none. onError.badData and onError.temporary choose the error handler for a payload that cannot be read (MULE:EXPRESSION) and for a carrier that is down (HTTP:SERVICE_UNAVAILABLE): propagate nacks the message for redelivery, continue logs it and acknowledges it.',
    boot: needs('carrier.host', 'queue.name', 'onError.badData', 'onError.temporary'),
    consumes: 'queue.name',
    consume(ctx, message) {
      const { props, store, now } = ctx
      const minute = Math.floor(now / MINUTE)
      const max = maxRedelivery(props)
      const log = []
      // The bad message that nothing stops is redelivered every few seconds. It holds most of the consumer threads.
      let busy = false
      const st = store.stuck
      if (st) {
        const count = st.deliveries + Math.max(0, minute - st.minute) * PER_MINUTE
        if (badData(props)) {
          log.push(warn(`Message ${st.id}, Delivery Count ${count}: the payload cannot be read (MULE:EXPRESSION). on-error-continue logged it and the message was acknowledged. Payload: ${st.body}`))
          store.rejected = keep(store.rejected, { id: st.id, t: now, why: 'bad data' })
          store.stuck = null
        } else if (max !== null && count > max) {
          log.push(warn(`Message ${st.id}, Delivery Count ${count}: MULE:REDELIVERY_EXHAUSTED, more than maxRedeliveryCount ${max}. on-error-continue logged it and the message was acknowledged. Payload: ${st.body}`))
          store.rejected = keep(store.rejected, { id: st.id, t: now, why: 'redelivery exhausted' })
          store.stuck = null
        } else {
          busy = true
          if (st.minute !== minute) {
            log.push(warn(`Message ${st.id}, delivery attempt ${count}`), muleError(parseError(st.id)))
            Object.assign(st, { deliveries: count, minute })
          }
        }
      }
      const e = read(message.body)
      if (!e) {
        if (badData(props)) {
          log.push(warn(`Message ${message.id}, Delivery Count ${message.deliveries}: the payload cannot be read (MULE:EXPRESSION). on-error-continue logged it and the message was acknowledged. Payload: ${message.body}`))
          store.rejected = keep(store.rejected, { id: message.id, t: now, why: 'bad data' })
          return { ok: true, flow: 'shipment-label-flow', log }
        }
        if (max !== null && message.deliveries > max) {
          log.push(warn(`Message ${message.id}, Delivery Count ${message.deliveries}: MULE:REDELIVERY_EXHAUSTED, more than maxRedeliveryCount ${max}. on-error-continue logged it and the message was acknowledged. Payload: ${message.body}`))
          store.rejected = keep(store.rejected, { id: message.id, t: now, why: 'redelivery exhausted' })
          return { ok: true, flow: 'shipment-label-flow', log }
        }
        // the lab queue gives up after its attempts in one go, and the lab keeps the message in flight from then on
        if (message.deliveries >= LAB_ATTEMPTS && !store.stuck) store.stuck = { id: message.id, body: message.body, deliveries: message.deliveries, minute }
        return { ok: false, flow: 'shipment-label-flow', errorType: 'MULE:EXPRESSION', error: parseError(message.id) }
      }
      if (message.deliveries === 1) {
        store.count = (store.count ?? 0) + 1
        // the carrier answers 503 now and then and works again a moment later
        if (store.count % 5 === 0) {
          if (temporary(props)) {
            log.push(warn(`Order ${e.order}: HTTP:SERVICE_UNAVAILABLE from the carrier. on-error-continue logged it and the message was acknowledged. No label was created.`))
            store.lost = keep(store.lost, { id: message.id, order: e.order, t: now })
            return { ok: true, flow: 'shipment-label-flow', log }
          }
          return { ok: false, flow: 'shipment-label-flow', errorType: 'HTTP:SERVICE_UNAVAILABLE', error: carrierError(props['carrier.host'], e.order) }
        }
      } else store.recovered = keep(store.recovered, { id: message.id, order: e.order, t: now })
      const seconds = busy ? 7.2 : 0.4
      log.push(info(`Label for ${e.order} created in ${seconds} s, Delivery Count ${message.deliveries}${busy ? `. Normal is 0.4 s. Most consumer threads are busy with the redeliveries of ${st.id}` : ''}`))
      return { ok: true, flow: 'shipment-label-flow', log }
    },
  },
}
