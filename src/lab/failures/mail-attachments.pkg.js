// The sample application of the mail-attachments lab. Imports only platform-log.js and the import free mail server
// engine, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'
import { readAttachment } from '../platform-mailserver.js'

export const NAME = 'invoice-mail-intake'
export const FLOW = 'invoice-mail-flow'
export const BOX = 'invoices@harbor.example'
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
const word = (v) => String(v ?? '').trim().toLowerCase()
export const readAs = (props) => (word(props['invoice.readAs']) === 'binary' ? 'binary' : 'text')
export const forwardMode = (props) => (word(props['ap.forward']) === 'link' ? 'link' : 'attach')
const cfgOf = (props, p) => ({ protocol: word(props[`${p}.protocol`]) || (p === 'smtp' ? 'smtp' : 'imaps'), host: props[`${p}.host`], port: props[`${p}.port`], user: props[`${p}.user`], password: props[`${p}.password`], tls: yes(props[`${p}.starttls`]) })
export const smtpOf = (props) => cfgOf(props, 'smtp')
const isPdf = (a) => /^application\/pdf/i.test(a.contentType) || /\.pdf$/i.test(a.name)
const supplierOf = (from) => String(from ?? '').replace(/<.*>/, '').trim() || String(from ?? '')

const el = {
  source: { at: 0, name: 'Invoice mailbox', dsl: '<email:listener-imap doc:name="Invoice mailbox" config-ref="Email_IMAP" folder="INBOX" deleteAfterRetrieve="false">' },
  read: { at: 2, name: 'Read invoice PDF', dsl: '<ee:transform doc:name="Read invoice PDF"> output ${invoice.readAs == "text" ? "text/plain" : "application/java"}' },
  forward: { at: 4, name: 'Forward to AP', dsl: '<email:send doc:name="Forward to AP" config-ref="Email_SMTP" toAddresses="#[[p(\'ap.to\')]]" subject="#[vars.subject]">' },
  confirm: { at: 5, name: 'Confirm to supplier', dsl: '<email:send doc:name="Confirm to supplier" config-ref="Email_SMTP" toAddresses="#[[attributes.fromAddresses[0]]]" subject="#[\'Received: \' ++ attributes.subject]">' },
  park: { at: 7, name: 'Move to Error', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Error">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every 2 minutes it reads the unread mails of the supplier invoice mailbox over IMAPS, reads each PDF attachment, forwards it to the accounts payable team (ap.to) and sends the supplier a confirmation, both through the SMTP connection smtp.*. smtp.starttls true sets mail.smtp.starttls.enable. invoice.readAs text or binary is how the transform reads the attachment. ap.forward attach sends the PDF along, link sends a link to the archive copy instead. A mail that fails goes to Error, a handled one to Processed.',
    boot: needs('imap.host', 'imap.port', 'imap.user', 'imap.password', 'smtp.host', 'smtp.port', 'smtp.user', 'smtp.password', 'ap.to'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '2', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const mb = ctx.mailbox
        const imap = cfgOf(props, 'imap')
        const smtp = smtpOf(props)
        const polled = mb.poll(imap, 'INBOX', { unreadOnly: true })
        if (!polled.ok) return { ok: false, ms: 1200, errorType: polled.type, log: [block('source', polled.type, polled.error)] }
        if (!polled.messages.length) return { ok: true, ms: 200, log: [] }
        const log = [info(`${polled.messages.length} new invoice mail${polled.messages.length > 1 ? 's' : ''} in ${imap.user}`)]
        const errors = []
        const park = (m, where, r) => {
          errors.push(r.type)
          log.push(block(where, r.type, `${r.error}. Mail "${m.subject}" from ${m.from}`))
          const p = mb.move(imap, 'INBOX', m.uid, 'Error')
          if (p.ok) log.push(warn(`on-error-continue moved "${m.subject}" to Error`))
          else log.push(block('park', p.type, p.error))
          store.failed = keep(store.failed, { subject: m.subject, type: r.type, t: now })
        }
        for (const m of polled.messages) {
          const pdfs = m.attachments.filter(isPdf)
          if (!pdfs.length) {
            park(m, 'read', { type: 'MULE:EXPRESSION', error: 'The mail has no PDF attachment' })
            continue
          }
          const parts = pdfs.map((a) => readAttachment(a, readAs(props)))
          const files = parts.map((a) => `${a.name} (${a.contentType}, ${a.size} bytes)`).join(', ')
          log.push(info(`Read ${files} from "${m.subject}"`))
          const link = forwardMode(props) === 'link'
          const fwd = mb.send(smtp, {
            from: `Invoice intake <${smtp.user}>`,
            to: props['ap.to'],
            subject: `Invoice from ${supplierOf(m.from)}: ${m.subject}`,
            text: link ? `New invoice from ${supplierOf(m.from)}.\n${parts.map((a) => `https://docs.harbor.lab/ap/invoices/${a.name}`).join('\n')}` : `New invoice from ${supplierOf(m.from)}. The PDF is attached.`,
            attachments: link ? [] : parts.map(({ damaged, ...a }) => a), // eslint-disable-line no-unused-vars
          })
          if (!fwd.ok) {
            park(m, 'forward', fwd)
            continue
          }
          const ok = mb.send(smtp, { from: `Harbor accounts payable <${smtp.user}>`, to: m.from, subject: `Received: ${m.subject}`, text: 'Thank you. We received your invoice and will pay it on the agreed terms.' })
          if (!ok.ok) {
            park(m, 'confirm', ok)
            continue
          }
          mb.move(imap, 'INBOX', m.uid, 'Processed')
          store.done = keep(store.done, { subject: m.subject, t: now, files: parts.map((a) => ({ name: a.name, contentType: a.contentType, size: a.size, damaged: a.damaged })), link })
          log.push(info(`Forwarded "${m.subject}" to ${props['ap.to']}${link ? ' as a link' : ''} and confirmed it to ${m.from}`))
        }
        return { ok: errors.length === 0, ms: 1800, errorType: errors[0] ?? null, errors: errors.length, log, store }
      },
    },
  },
}
