// The sample application of the hl7-sequence lab. Imports only platform-log.js and the import free HL7 engine.
// An MLLP listener for the ADT of Epic that feeds the Bayview LIS. With hl7.ackMode ON_RECEIPT it ACKs each message AA as
// soon as it has read it and processes the messages of a poll afterwards, processing.maxConcurrency at a time. With
// AFTER_PROCESSING it sends each message to the LIS first and ACKs Epic with the code of the LIS.
import { info, line, muleError, needs } from '../platform-log.js'
import { mrnOf, setFields } from '../platform-hl7.js'

export const FEED = 'bvh-adt-lis-feed'
export const FLOW = 'adt-intake-flow'
const el = {
  listen: { flow: FLOW, at: 0, name: 'MLLP listener', dsl: '<mllp:mllp-listener doc:name="MLLP listener" config-ref="MLLP_Listener_config">' },
  send: { flow: 'adt-to-lis-flow', at: 2, name: 'Send to LIS', dsl: '<mllp:send doc:name="Send to LIS" config-ref="MLLP_LIS_config">' },
}
export const modeOf = (props) => (String(props['hl7.ackMode'] ?? '').trim().toUpperCase() === 'AFTER_PROCESSING' ? 'AFTER_PROCESSING' : 'ON_RECEIPT')
export const concurrencyOf = (props) => Math.max(1, Math.floor(Number(props['processing.maxConcurrency'])) || 1)
// lab-made: with more than one message in work at once, the one that finishes first goes to the LIS first, and a
// message takes time in proportion to its length
const finishOrder = (list, n) => {
  if (n <= 1) return list
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(...list.slice(i, i + n).map((m, k) => ({ m, k })).sort((a, b) => a.m.raw.length - b.m.raw.length || a.k - b.k).map((x) => x.m))
  return out
}

export const PACKAGES = {
  [FEED]: {
    note: `Feeds the Bayview LIS with the ADT of Epic. ${FLOW} is an MLLP listener on mllp.host and mllp.port. hl7.ackMode ON_RECEIPT answers Epic AA as soon as a message is read and hands it to adt-to-lis-flow, which has maxConcurrency processing.maxConcurrency. AFTER_PROCESSING sends to the LIS at lis.host and lis.port inside the listener flow and ACKs Epic with the code of the LIS.`,
    boot: needs('mllp.port', 'lis.host', 'lis.port'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, app, now } = ctx
        const log = []
        if (store.listening !== app.config) {
          log.push(info(`MLLP listener started on ${props['mllp.host'] || '0.0.0.0'}:${props['mllp.port']}`, 'org.mule.extension.mllp'))
          store.listening = app.config
        }
        const mode = modeOf(props)
        let errors = 0
        const toLis = (m) => {
          const res = ctx.hl7.send({ host: props['lis.host'], port: props['lis.port'] }, setFields(m.raw, { 'MSH-3': 'MULESOFT', 'MSH-5': 'LIS' }))
          if (!res.ok) {
            errors++
            log.push(muleError({ ...el.send, file: FEED, type: res.type, message: res.error }))
            return { code: 'AR', text: 'The LIS cannot be reached', errCode: 207 }
          }
          if (res.ack.code !== 'AA') {
            errors++
            log.push(line('ERROR', `${m.type} ${m.controlId}: the LIS answered ${res.ack.code} ${res.ack.errCode} ${res.ack.text}`))
          } else log.push(info(`${m.type} ${m.controlId} MRN ${mrnOf(m.parsed)}: LIS ACK AA`))
          return res.ack
        }
        const got = []
        const r = ctx.hl7.listen({ host: props['mllp.host'], port: props['mllp.port'] }, (m) => {
          if (mode === 'AFTER_PROCESSING') {
            got.push(m)
            const a = toLis(m)
            return ctx.hl7.ack(m, a.code, a.text, { code: a.errCode, loc: a.errLoc })
          }
          got.push(m)
          return ctx.hl7.ack(m, 'AA')
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...el.listen, file: FEED, type: r.type, message: r.error })], store }
        let order = got
        if (mode === 'ON_RECEIPT' && got.length) {
          const n = concurrencyOf(props)
          order = finishOrder(got, n)
          if (got.length > 1) log.push(info(`${got.length} messages ACKed on receipt, processing ${Math.min(n, got.length)} at a time`))
          for (const m of order) toLis(m)
        }
        if (got.length >= 4) {
          const inOrder = order.every((m, i) => m === got[i])
          // the lab keeps the order of each larger poll, so a check can compare it with the order Epic sent
          store.bursts = [...(store.bursts ?? []), { t: now, n: got.length, inOrder, config: app.config }].slice(-10)
        }
        return { ok: errors === 0, ms: Math.max(10, r.ms), errorType: errors ? 'HL7:NACK' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
