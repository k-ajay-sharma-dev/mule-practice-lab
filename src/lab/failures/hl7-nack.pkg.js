// The sample application of the hl7-nack lab. Imports only platform-log.js and the import free HL7 engine.
// An ADT router: an MLLP listener takes ADT from Epic, the HL7 EDI connector reads and validates it, the router keeps
// the Bayview MRN in PID-3 and MRG-1, sends the message on to the Bayview LIS over MLLP, and gives Epic the ACK code the
// LIS gave it.
import { info, line, muleError, needs, warn } from '../platform-log.js'
import { pickIds, setFields } from '../platform-hl7.js'

export const ROUTER = 'bvh-adt-to-lis'
export const FLOW = 'mllp-listener-flow'
const el = {
  listen: { flow: FLOW, at: 0, name: 'MLLP listener', dsl: '<mllp:mllp-listener doc:name="MLLP listener" config-ref="MLLP_Listener_config">' },
  send: { flow: FLOW, at: 4, name: 'Send to LIS', dsl: '<mllp:send doc:name="Send to LIS" config-ref="MLLP_LIS_config">' },
}

export const PACKAGES = {
  [ROUTER]: {
    note: `The ADT router of Bayview Health. ${FLOW} is an MLLP listener on mllp.host and mllp.port for the ADT interface of Epic. Each message goes through Read and Validate of the HL7 EDI connector. The router then sets MSH-3 to MULESOFT and MSH-5 to LIS, keeps in PID-3 and MRG-1 only the identifier whose type is mrn.identifierType and whose assigning authority is mrn.assigningAuthority (both empty: the list goes on as Epic sent it), sends it to the LIS at lis.host and lis.port, and answers Epic with the ACK code of the LIS.`,
    boot: needs('mllp.port', 'lis.host', 'lis.port'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, app } = ctx
        const log = []
        if (store.listening !== app.config) {
          log.push(info(`MLLP listener started on ${props['mllp.host'] || '0.0.0.0'}:${props['mllp.port']}`, 'org.mule.extension.mllp'))
          store.listening = app.config
        }
        let errors = 0
        const r = ctx.hl7.listen({ host: props['mllp.host'], port: props['mllp.port'] }, (m) => {
          const bad = ctx.hl7.validate(m.parsed)
          if (bad.length) {
            errors++
            log.push(warn(`${m.type} ${m.controlId}: ${bad[0].text}. ACK ${bad[0].reject ? 'AR' : 'AE'} sent to Epic.`))
            return ctx.hl7.ack(m, bad[0].reject ? 'AR' : 'AE', bad[0].text, bad[0])
          }
          const out = setFields(pickIds(m.raw, { type: props['mrn.identifierType'], authority: props['mrn.assigningAuthority'] }), { 'MSH-3': 'MULESOFT', 'MSH-5': 'LIS' })
          const res = ctx.hl7.send({ host: props['lis.host'], port: props['lis.port'] }, out)
          if (!res.ok) {
            errors++
            log.push(muleError({ ...el.send, file: ROUTER, type: res.type, message: res.error }))
            return ctx.hl7.ack(m, 'AR', 'The LIS cannot be reached', { code: 207 })
          }
          if (res.ack.code !== 'AA') {
            errors++
            log.push(line('ERROR', `${m.type} ${m.controlId}: the LIS answered ${res.ack.code} ${res.ack.errCode} ${res.ack.text}. ACK ${res.ack.code} sent to Epic.`))
          } else log.push(info(`${m.type} ${m.controlId}: LIS ACK AA`))
          return ctx.hl7.ack(m, res.ack.code, res.ack.text, { code: res.ack.errCode, loc: res.ack.errLoc })
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...el.listen, file: ROUTER, type: r.type, message: r.error })], store }
        return { ok: errors === 0, ms: Math.max(10, r.ms), errorType: errors ? 'HL7:NACK' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
