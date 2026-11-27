// The sample application of the hl7-duplicates lab. Imports only platform-log.js and the import free HL7 engine.
// An MLLP listener for the ADT interface of Epic that sends each message to the Bayview LIS and only then ACKs Epic.
// With idempotency.key set, an idempotent message validator drops a message whose key it has seen and ACKs it AA.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { setFields, valueOf } from '../platform-hl7.js'

export const SYNC = 'bvh-adt-encounter-sync'
export const FLOW = 'adt-listener-flow'
const KEEP = 300
const el = {
  listen: { flow: FLOW, at: 0, name: 'MLLP listener', dsl: '<mllp:mllp-listener doc:name="MLLP listener" config-ref="MLLP_Listener_config">' },
  send: { flow: FLOW, at: 3, name: 'Send to LIS', dsl: '<mllp:send doc:name="Send to LIS" config-ref="MLLP_LIS_config">' },
}
// the HL7 field the validator takes as the ID, such as MSH-10. Empty: no validator.
export const keyOf = (props) => String(props['idempotency.key'] ?? '').trim().toUpperCase()

export const PACKAGES = {
  [SYNC]: {
    note: `Keeps the encounters of the Bayview LIS in step with Epic. ${FLOW} is an MLLP listener on mllp.host and mllp.port. For each ADT it sends the message to the LIS at lis.host and lis.port and waits for the ACK of the LIS, then ACKs Epic with the same code. idempotency.key names the HL7 field that an idempotent message validator checks, for example MSH-10; empty means no validator. The validator keeps the IDs in a persistent object store and ACKs a message it has seen AA without sending it again.`,
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
        const key = keyOf(props)
        let errors = 0
        const r = ctx.hl7.listen({ host: props['mllp.host'], port: props['mllp.port'] }, (m) => {
          const id = key ? valueOf(m.parsed, key) : ''
          if (key && id && store.seen?.[id]) {
            store.dups = (store.dups ?? 0) + 1
            log.push(warn(`MULE:DUPLICATE_MESSAGE ${m.type} with ${key} ${id} was already processed at try ${store.seen[id].n}. ACK AA sent to Epic, nothing sent to the LIS.`, 'org.mule.runtime.core.internal.routing.IdempotentMessageValidator'))
            return ctx.hl7.ack(m, 'AA')
          }
          const res = ctx.hl7.send({ host: props['lis.host'], port: props['lis.port'] }, setFields(m.raw, { 'MSH-3': 'MULESOFT', 'MSH-5': 'LIS' }))
          if (!res.ok) {
            errors++
            log.push(muleError({ ...el.send, file: SYNC, type: res.type, message: res.error }))
            return ctx.hl7.ack(m, 'AR', 'The LIS cannot be reached', { code: 207 })
          }
          // lab-made: the validator writes the ID once the LIS has taken the message, so a failed one can come again
          if (key && id && res.ack.code === 'AA') store.seen = Object.fromEntries([...Object.entries(store.seen ?? {}), [id, { t: now, n: m.tries }]].slice(-KEEP))
          if (res.ack.code !== 'AA') {
            errors++
            log.push(line('ERROR', `${m.type} ${m.controlId}: the LIS answered ${res.ack.code} ${res.ack.errCode} ${res.ack.text}`))
          } else log.push(info(`${m.type} ${m.controlId}${m.tries > 1 ? ` (try ${m.tries})` : ''}: sent to the LIS in ${Math.round(res.ms / 100) / 10} s, ACK AA`))
          return ctx.hl7.ack(m, res.ack.code, res.ack.text, { code: res.ack.errCode, loc: res.ack.errLoc })
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...el.listen, file: SYNC, type: r.type, message: r.error })], store }
        for (const x of r.results.filter((y) => y.late)) log.push(warn(`ACK for ${x.controlId} could not be written: java.net.SocketException: Broken pipe. Epic closed the connection before the ACK came.`, 'org.mule.extension.mllp'))
        return { ok: errors === 0, ms: Math.max(10, r.ms), errorType: errors ? 'HL7:NACK' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
