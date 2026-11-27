// The sample application of the e2e-hl7 lab. Imports only platform-log.js and the import free HL7 engine.
// The ADT feed of Bayview Health from Epic to the Bayview LIS: an MLLP listener over TLS takes each message, sets the
// correlation ID to MSH-10, reads and validates it, skips a control ID it delivered before, maps the message for the LIS
// and sends it on over MLLP. Epic gets the ACK of the LIS (ACK after processing). A message the LIS refuses goes to the
// error store with its reason, so it can be resent from Epic once the cause is fixed.
import { info, line, muleError, warn } from '../platform-log.js'
import { mrnOf, setFields } from '../platform-hl7.js'

export const FEED = 'bvh-adt-feed-e2e'
export const ASSET = 'adt-feed-system-api'
export const FLOW = 'adt-intake-flow'
// lab-made: the key stores in the jar, one per environment, with made-up lab passwords
export const KEYSTORES = { 'bayview-mllp-sbx.p12': 'Bvh-Mllp-Sbx-26', 'bayview-mllp-prd.p12': 'Bvh-Mllp-Prd-26' }
const API = `${ASSET}-config`
const KEEP = 60
const word = (v) => String(v ?? '').trim()
const json = (x) => JSON.stringify(x)
const keep = (list, item) => [...(list ?? []), item].slice(-KEEP)
const el = {
  listen: { flow: FLOW, at: 0, name: 'MLLP listener', dsl: '<mllp:mllp-listener doc:name="MLLP listener" config-ref="MLLP_TLS_Listener_config">' },
  validate: { flow: FLOW, at: 3, name: 'Validate', dsl: '<hl7:validate doc:name="Validate" config-ref="HL7_EDI_Config">' },
  send: { flow: FLOW, at: 6, name: 'Send to LIS', dsl: '<mllp:send doc:name="Send to LIS" config-ref="MLLP_LIS_config">' },
}
const missing = (p, names) => names.find((n) => !word(p[n]))

export const PACKAGES = {
  [FEED]: {
    note: `The ADT feed of Bayview Health, built on ${ASSET}. ${FLOW} listens with MLLP over TLS on mllp.port (key store mllp.tls.keystore in the jar, opened with the secure mllp.tls.keystorePassword). Each message runs with MSH-10 as its correlation ID, goes through Read and Validate, and is sent to the LIS at lis.host and lis.port; Epic gets the ACK of the LIS. A control ID that was delivered before is acknowledged AA and not sent again. A message the LIS refuses goes to the error store. GET /status gives the counts, GET /messages/{controlId} what happened to one message.`,
    sample: { method: 'GET', path: '/status' },
    traced: true,
    boot: ({ props: p }) => {
      const gone = missing(p, ['mllp.port', 'mllp.tls.keystore', 'mllp.tls.keystorePassword', 'lis.host', 'lis.port'])
      if (gone) return `Couldn't find configuration property value for key \${${gone}} from properties provider "Environment properties"`
      const store = KEYSTORES[word(p['mllp.tls.keystore'])]
      if (!store) return `Could not initialise the TLS context of MLLP_TLS_Listener_config: java.io.FileNotFoundException: ${word(p['mllp.tls.keystore'])} (resource not found in the application)`
      if (p['mllp.tls.keystorePassword'] !== store) return 'Could not initialise the TLS context of MLLP_TLS_Listener_config: java.io.IOException: keystore password was incorrect' // lab-made wording around the Java message
      return null
    },
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const st = ctx.store
      if (req.method === 'GET' && path === '/status') return { status: 200, ms: 6, flow: `get:\\status:${API}`, body: json({ listener: `0.0.0.0:${word(ctx.props['mllp.port'])}`, ...(st.n ?? { received: 0, delivered: 0, duplicates: 0, parked: 0 }) }) }
      const m = path.match(/^\/messages\/([^/]+)$/)
      if (req.method === 'GET' && m) {
        const flow = `get:\\messages\\(controlId):${API}`
        const x = [...(st.messages ?? [])].reverse().find((y) => y.ctl === m[1])
        return x ? { status: 200, ms: 5, flow, body: json(x) } : { status: 404, ms: 4, flow, body: json({ message: `No message with control ID ${m[1]}` }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${ASSET}-main`, body: json({ message: 'Resource not found' }) }
    },
    run: {
      [FLOW]: (ctx) => {
        const { props: p, store, app } = ctx
        const log = []
        if (store.listening !== app.config) {
          log.push(info(`MLLP listener started on 0.0.0.0:${word(p['mllp.port'])} with TLS, key store ${word(p['mllp.tls.keystore'])}`, 'org.mule.extension.mllp'))
          store.listening = app.config
        }
        const n = { received: 0, delivered: 0, duplicates: 0, parked: 0, ...store.n }
        let errors = 0
        const note = (msg, result, extra = {}) => (store.messages = keep(store.messages, { ctl: msg.controlId, type: msg.type, mrn: msg.parsed ? mrnOf(msg.parsed) : '', result, t: ctx.now, ...extra }))
        const r = ctx.hl7.listen({ host: '0.0.0.0', port: p['mllp.port'], tls: true }, (msg) => {
          const cid = `correlationId=${msg.controlId}`
          n.received++
          // idempotent on MSH-10: a message the LIS has taken is not sent again, Epic gets AA again
          if ((store.done ?? []).includes(msg.controlId)) {
            n.duplicates++
            log.push(info(`${cid} ${msg.type}: MSH-10 ${msg.controlId} was delivered to the LIS before. ACK AA, not sent again (duplicate)`))
            note(msg, 'duplicate')
            return ctx.hl7.ack(msg, 'AA')
          }
          const bad = ctx.hl7.validate(msg.parsed)
          if (bad.length) {
            errors++
            n.parked++
            ctx.hl7.park(msg, `${bad[0].code} ${bad[0].text}`)
            log.push(muleError({ ...el.validate, file: FEED, type: 'HL7:VALIDATION', message: `${cid} ${msg.type}: ${bad[0].text} (${bad[0].loc}). Written to the error store.` })) // lab-made error type
            note(msg, 'parked', { reason: bad[0].text })
            return ctx.hl7.ack(msg, bad[0].reject ? 'AR' : 'AE', bad[0].text, { code: bad[0].code, loc: bad[0].loc })
          }
          // the DataWeave of the lab: the LIS is the receiving application, and Epic stays the source in EVN
          const out = setFields(msg.raw, { 'MSH-3': 'MULESOFT', 'MSH-5': 'LIS' })
          const res = ctx.hl7.send({ host: p['lis.host'], port: p['lis.port'] }, out)
          if (!res.ok) {
            errors++
            n.parked++
            ctx.hl7.park(msg, res.error)
            log.push(muleError({ ...el.send, file: FEED, type: res.type, message: `${cid} ${res.error}` }))
            note(msg, 'parked', { reason: 'The LIS cannot be reached' })
            return ctx.hl7.ack(msg, 'AR', 'The LIS cannot be reached', { code: 207 })
          }
          if (res.ack.code !== 'AA') {
            errors++
            n.parked++
            ctx.hl7.park(msg, `LIS ${res.ack.code} ${res.ack.errCode} ${res.ack.text}`)
            log.push(line('ERROR', `${cid} ${msg.type}: the LIS answered ${res.ack.code} ${res.ack.errCode} ${res.ack.text}. Written to the error store, Epic gets ${res.ack.code}.`))
            note(msg, 'parked', { reason: res.ack.text })
            return ctx.hl7.ack(msg, res.ack.code, res.ack.text, { code: res.ack.errCode, loc: res.ack.errLoc })
          }
          n.delivered++
          store.done = keep(store.done, msg.controlId)
          log.push(info(`${cid} ${msg.type}: sent to the LIS at ${word(p['lis.host'])}:${word(p['lis.port'])}, LIS ACK AA, ACK AA to Epic`))
          note(msg, 'delivered')
          return ctx.hl7.ack(msg, 'AA')
        })
        if (!r.ok) return { ok: false, ms: r.ms, errorType: r.type, log: [...log, muleError({ ...el.listen, file: FEED, type: r.type, message: r.error })], store }
        if (r.results.some((x) => x.late)) log.push(warn(`An ACK came after the ACK timeout of Epic. Epic sends that message again with the same MSH-10.`))
        store.n = n
        return { ok: errors === 0, ms: Math.max(10, r.ms), errorType: errors ? 'HL7:NACK' : null, errors, log, store } // lab-made error type
      },
    },
  },
}
