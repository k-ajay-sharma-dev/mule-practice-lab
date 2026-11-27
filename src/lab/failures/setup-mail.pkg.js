// The sample application of the setup-mail lab. Imports only platform-log.js, so the engine can load it without a
// cycle. The app reaches the mail server through ctx.mailbox (src/lab/platform-mailserver.js): it sends over SMTP and
// reads the mailbox over IMAP, so every command shows in the server log.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'brightmart-order-mailer'
export const JAR = `${NAME}-1.0.0-mule-application.jar`
export const BOX = 'webshop@brightmart.example'
export const FLOW = 'customer-mail-flow'
const SEND_FLOW = 'post:\\orders\\(orderId)\\confirmation:application\\json:order-mailer-config'
const keep = (list, item, n = 30) => [...(list ?? []), item].slice(-n)
const json = (x) => JSON.stringify(x)
const word = (v) => String(v ?? '').trim().toLowerCase()

// the two Email connector configs of the app, read from its properties
export const smtpOf = (p) => ({ protocol: word(p['smtp.protocol']) || 'smtp', host: p['smtp.host'], port: p['smtp.port'], user: p['smtp.user'], password: p['smtp.password'], tls: word(p['smtp.starttls']) === 'true' })
export const imapOf = (p) => ({ protocol: word(p['imap.protocol']) || 'imaps', host: p['imap.host'], port: p['imap.port'], user: p['imap.user'], password: p['imap.password'], tls: word(p['imap.starttls']) === 'true' })

// Order: O-1005 / Reason: too small
export function readReturn(text) {
  const get = (k) => String(text ?? '').match(new RegExp(`^${k}:\\s*(.+)$`, 'mi'))?.[1]?.trim()
  const order = get('Order')
  if (!order || !/^O-\d+$/.test(order)) return { bad: `Cannot coerce Null (null) to String: the mail has no line Order: O-number` }
  return { order, reason: get('Reason') ?? '' }
}

const el = {
  send: { at: 2, name: 'Send confirmation', dsl: '<email:send doc:name="Send confirmation" config-ref="Email_SMTP" fromAddress="${smtp.user}" subject="#[\'Your Brightmart order \' ++ vars.orderId]">' },
  source: { at: 0, name: 'Customer mailbox', dsl: '<email:listener-imap doc:name="Customer mailbox" config-ref="Email_IMAP" folder="INBOX">' },
  move: { at: 4, name: 'Move to Processed', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Processed">' },
  error: { at: 6, name: 'Move to Error', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Error">' },
}
const block = (flow, where, type, message) => muleError({ flow, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note: `Order mail of the web shop on the mail server. POST /orders/{orderId}/confirmation with {"email","name"} sends the confirmation over SMTP (smtp.* properties; smtp.starttls true sets mail.smtp.starttls.enable). Every minute ${FLOW} reads the unread mail of INBOX over IMAP (imap.* properties, imap.protocol imaps by default). A mail with a line Order: O-number becomes a return request and is moved to Processed; any other mail is moved to Error for the service desk. A Message-ID that was handled once is not handled again.`,
    sample: { method: 'POST', path: '/orders/O-1007/confirmation' },
    boot: needs('smtp.host', 'smtp.port', 'smtp.user', 'smtp.password', 'imap.host', 'imap.port', 'imap.user', 'imap.password'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const store = (ctx.app.store ??= {})
      const m = req.path.split('?')[0].match(/^\/orders\/(O-\d+)\/confirmation$/)
      if (!m || req.method !== 'POST') return { status: 404, ms: 4, error: 'APIKIT:NOT_FOUND', body: json({ message: 'Resource not found' }) }
      let b = null
      try {
        b = JSON.parse(req.body || 'null')
      } catch {
        b = null
      }
      if (!b || !/@/.test(String(b.email ?? ''))) return { status: 400, ms: 5, error: 'APIKIT:BAD_REQUEST', log: [warn('APIKIT:BAD_REQUEST: the body needs the email of the customer')], body: json({ message: 'Bad request: email is required' }) }
      const cfg = smtpOf(ctx.props)
      const r = ctx.mailbox.send(cfg, { from: `Brightmart Webshop <${cfg.user}>`, to: String(b.email).trim(), subject: `Your Brightmart order ${m[1]}`, text: `Hello ${b.name ?? 'customer'},\n\nthank you for your order ${m[1]}. We are packing it now and send a tracking link when it ships.\n\nBrightmart Webshop` })
      if (!r.ok) return { status: 500, ms: 900, error: r.type, log: [block(SEND_FLOW, 'send', r.type, r.error)], body: json({ message: 'The confirmation could not be sent' }) }
      store.sent = keep(store.sent, { order: m[1], to: String(b.email).trim().toLowerCase(), messageId: r.messageId, t: ctx.now })
      return { status: 202, ms: 420, log: [info(`Confirmation for ${m[1]} to ${b.email}: ${r.reply}`)], body: json({ orderId: m[1], sent: true }) }
    },
    run: {
      [FLOW]: (ctx) => {
        const { store, now } = ctx
        const cfg = imapOf(ctx.props)
        const mb = ctx.mailbox
        const polled = mb.poll(cfg, 'INBOX', { unreadOnly: true })
        if (!polled.ok) return { ok: false, ms: 1200, errorType: polled.type, log: [block(FLOW, 'source', polled.type, polled.error)] }
        if (!polled.messages.length) return { ok: true, ms: 200, log: [] }
        const log = [info(`On New Email: ${polled.messages.length} unread mail${polled.messages.length > 1 ? 's' : ''} in INBOX of ${cfg.user}`)]
        const errors = []
        for (const msg of polled.messages) {
          const x = readReturn(msg.text)
          const seen = (store.returns ?? []).some((y) => y.mid === msg.messageId)
          if (!x.bad && !seen) {
            store.returns = keep(store.returns, { order: x.order, reason: x.reason, mid: msg.messageId, from: msg.from, t: now })
            log.push(info(`Return request for ${x.order} from ${msg.from}: ${x.reason}`))
          }
          if (x.bad) log.push(warn(`${msg.messageId} "${msg.subject}" is no return request: ${x.bad}. on-error-continue moves it to Error for the service desk.`))
          const r = mb.move(cfg, 'INBOX', msg.uid, x.bad ? 'Error' : 'Processed')
          if (!r.ok) {
            errors.push(r.type)
            log.push(block(FLOW, x.bad ? 'error' : 'move', r.type, r.error))
            continue
          }
          if (x.bad) store.parked = keep(store.parked, { mid: msg.messageId, subject: msg.subject, t: now })
        }
        return { ok: errors.length === 0, ms: 900, errorType: errors[0] ?? null, errors: errors.length, log, store }
      },
    },
  },
}
