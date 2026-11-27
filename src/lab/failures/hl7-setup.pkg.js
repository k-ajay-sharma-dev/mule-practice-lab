// The sample application of the hl7-setup lab. Imports only platform-log.js and the import free HL7 engine.
// The new ADT intake of Bayview Health: an MLLP listener over TLS for an Epic outbound interface. Each message goes
// through Read and Validate of the HL7 EDI connector. A valid one goes to the Bayview LIS over MLLP; a bad one goes to
// the error store with an AE (or AR for an MSH error) and its ERR segment.
import { info, line, muleError } from '../platform-log.js'
import { setFields } from '../platform-hl7.js'

export const INTAKE = 'bvh-adt-intake'
export const INTAKE_JAR = `${INTAKE}-1.0.0-mule-application.jar`
export const FLOW = 'mllp-intake-flow'
// lab-made: the password of the keystore bayview-mllp.p12 inside the jar, a lab value
export const KEYSTORE_PASSWORD = 'bvh-mllp-store-26'
const el = {
  listen: { flow: FLOW, at: 0, name: 'MLLP listener', dsl: '<mllp:mllp-listener doc:name="MLLP listener" config-ref="MLLP_TLS_Listener_config">' },
  validate: { flow: FLOW, at: 2, name: 'Validate', dsl: '<hl7:validate doc:name="Validate" config-ref="HL7_EDI_Config">' },
  send: { flow: FLOW, at: 4, name: 'Send to LIS', dsl: '<mllp:send doc:name="Send to LIS" config-ref="MLLP_LIS_config">' },
}
const tlsOn = (p) => String(p['mllp.tls.enabled'] ?? '').trim().toLowerCase() === 'true'
export const ackModeOf = (p) => String(p['hl7.ackMode'] ?? '').trim().toUpperCase()
const missing = (p, names) => names.find((n) => !String(p[n] ?? '').trim())

export const PACKAGES = {
  [INTAKE]: {
    note: `The ADT intake of Bayview Health. ${FLOW} is an MLLP listener on mllp.host and mllp.port; with mllp.tls.enabled true it uses the keystore bayview-mllp.p12 in the jar, opened with the secure property mllp.tls.keystorePassword. Read and Validate of the HL7 EDI connector check each message against HL7 v2.5.1. hl7.ackMode AFTER_PROCESSING sends a valid message to the LIS at lis.host and lis.port and ACKs Epic with the code of the LIS; ON_RECEIPT ACKs AA first. A message that fails Validate or that the LIS refuses goes to the error store with its reason, and Epic gets AE or AR with an ERR segment.`,
    boot: ({ props }) => {
      const gone = missing(props, ['mllp.port', 'lis.host', 'lis.port', 'hl7.ackMode', ...(tlsOn(props) ? ['mllp.tls.keystorePassword'] : [])])
      if (gone) return `Couldn't find configuration property value for key \${${gone}} from properties provider "Environment properties"`
      if (tlsOn(props) && props['mllp.tls.keystorePassword'] !== KEYSTORE_PASSWORD) return 'Could not initialise the TLS context of MLLP_TLS_Listener_config: java.io.IOException: keystore password was incorrect' // lab-made wording around the Java message
      if (!['AFTER_PROCESSING', 'ON_RECEIPT'].includes(ackModeOf(props))) return `hl7.ackMode is ${props['hl7.ackMode']}. Use AFTER_PROCESSING or ON_RECEIPT`
      return null
    },
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, app } = ctx
        const log = []
        if (store.listening !== app.config) {
          log.push(info(`MLLP listener started on ${props['mllp.host'] || '0.0.0.0'}:${props['mllp.port']}${tlsOn(props) ? ' with TLS, keystore bayview-mllp.p12' : ''}`, 'org.mule.extension.mllp'))
          store.listening = app.config
        }
        let errors = 0
        const early = ackModeOf(props) === 'ON_RECEIPT'
        const work = (m) => {
          const bad = ctx.hl7.validate(m.parsed)
          if (bad.length) {
            errors++
            ctx.hl7.park(m, `${bad[0].code} ${bad[0].text}`)
            log.push(muleError({ ...el.validate, file: INTAKE, type: 'HL7:VALIDATION', message: `${m.type} ${m.controlId}: ${bad[0].text} (${bad[0].loc}). Written to the error store.` })) // lab-made error type
            return { code: bad[0].reject ? 'AR' : 'AE', text: bad[0].text, errCode: bad[0].code, errLoc: bad[0].loc }
          }
          const res = ctx.hl7.send({ host: props['lis.host'], port: props['lis.port'] }, setFields(m.raw, { 'MSH-3': 'MULESOFT', 'MSH-5': 'LIS' }))
          if (!res.ok) {
            errors++
            ctx.hl7.park(m, res.error)
            log.push(muleError({ ...el.send, file: INTAKE, type: res.type, message: res.error }))
            return { code: 'AR', text: 'The LIS cannot be reached', errCode: 207 }
          }
          if (res.ack.code !== 'AA') {
            errors++
            ctx.hl7.park(m, `LIS ${res.ack.code} ${res.ack.errCode} ${res.ack.text}`)
            log.push(line('ERROR', `${m.type} ${m.controlId}: the LIS answered ${res.ack.code} ${res.ack.errCode} ${res.ack.text}. Written to the error store.`))
          } else log.push(info(`${m.type} ${m.controlId}: LIS ACK AA`))
          return res.ack
        }
        const later = []
        const r = ctx.hl7.listen({ host: props['mllp.host'], port: props['mllp.port'], tls: tlsOn(props) }, (m) => {
          if (early) {
            later.push(m)
            return ctx.hl7.ack(m, 'AA')
          }
          const a = work(m)
          return ctx.hl7.ack(m, a.code, a.text, { code: a.errCode, loc: a.errLoc })
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...el.listen, file: INTAKE, type: r.type, message: r.error })], store }
        for (const m of later) work(m)
        return { ok: errors === 0, ms: Math.max(10, r.ms), errorType: errors ? 'HL7:NACK' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
