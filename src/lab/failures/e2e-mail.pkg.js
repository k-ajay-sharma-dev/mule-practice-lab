// The sample application of the e2e-mail lab. Imports only platform-log.js, so the engine can load it without a cycle.
// The purchase order mail intake of Brightmart: every minute it reads the unread mail of the intake mailbox over IMAPS,
// takes the CSV attachment of a known customer, parses the order lines, sends a confirmation over SMTP with STARTTLS
// and moves the mail to Processed. A mail it cannot take is moved to Error with the reason in the log, so a person can
// fix the cause and move it back to INBOX.
import { info, muleError, needs, warn } from '../platform-log.js'

export const INTAKE = 'brightmart-po-mail-intake'
export const ASSET = 'po-mail-system-api'
export const FLOW = 'po-mail-flow'
// the price list the lab uses for the confirmation (made-up items)
export const ITEMS = { 'H-100': ['Hand soap 500 ml', 3.2], 'H-300': ['Paper towels, 6 rolls', 5.9], 'H-410': ['Dish cloths, 10 pack', 4.5], 'K-220': ['Coffee beans 1 kg', 14.8] }
const API = `${ASSET}-config`
const KEEP = 40
const word = (v) => String(v ?? '').trim()
const low = (v) => word(v).toLowerCase()
const json = (x) => JSON.stringify(x)
const keep = (list, item) => [...(list ?? []), item].slice(-KEEP)
export const addrOf = (v) => low(String(v ?? '').match(/<([^>]+)>/)?.[1] ?? v)
const hash = (text) => {
  let h = 2166136261
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h.toString(16).padStart(8, '0')
}
// the correlation ID of the Mule event that one mail starts
export const cidOf = (messageId) => `${hash(messageId)}-e3b0-11f1`
export const imapOf = (p) => ({ protocol: low(p['imap.protocol']) || 'imaps', host: p['imap.host'], port: p['imap.port'], user: p['imap.user'], password: p['imap.password'] })
export const smtpOf = (p) => ({ protocol: low(p['smtp.protocol']) || 'smtp', host: p['smtp.host'], port: p['smtp.port'], user: p['smtp.user'], password: p['smtp.password'], tls: low(p['smtp.starttls']) === 'true' })
const sendersOf = (p) => low(p['orders.senders']).split(',').map(word).filter(Boolean)
const el = {
  source: { at: 0, name: 'On New Email', dsl: '<email:listener-imap doc:name="On New Email" config-ref="Email_IMAP" folder="INBOX">' },
  send: { at: 4, name: 'Send confirmation', dsl: '<email:send doc:name="Send confirmation" config-ref="Email_SMTP" fromAddress="${smtp.user}">' },
  move: { at: 5, name: 'Move to Processed', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="INBOX" targetFolder="Processed">' },
}

// the DataWeave of the lab: the CSV attachment to an order. Gives { order } or { bad }.
export function readOrder(msg) {
  const csv = (msg.attachments ?? []).find((a) => /^text\/csv/i.test(a.contentType ?? '') || /\.csv$/i.test(a.name ?? ''))
  if (!csv) return { bad: `no CSV attachment (${(msg.attachments ?? []).map((a) => a.name).join(', ') || 'no attachment at all'})` }
  const rows = String(csv.content ?? '').split(/\r?\n/).map(word).filter(Boolean)
  const head = rows.shift()?.split(',').map(low) ?? []
  const at = (k) => head.indexOf(k)
  if (at('po') < 0 || at('item') < 0 || at('qty') < 0) return { bad: `${csv.name}: the header must be po,item,qty` }
  const lines = []
  for (const [i, r] of rows.entries()) {
    const c = r.split(',').map(word)
    const qty = Number(c[at('qty')])
    const item = ITEMS[c[at('item')]]
    if (!Number.isInteger(qty) || qty < 1) return { bad: `${csv.name} line ${i + 2}: qty ${c[at('qty')] || '(empty)'} is not a whole number` }
    if (!item) return { bad: `${csv.name} line ${i + 2}: item ${c[at('item')] || '(empty)'} is not in the catalog` }
    lines.push({ po: c[at('po')], item: c[at('item')], description: item[0], qty, price: item[1], amount: Math.round(qty * item[1] * 100) / 100 })
  }
  if (!lines.length) return { bad: `${csv.name} has no order lines` }
  const po = lines[0].po
  return { order: { po, lines, total: Math.round(lines.reduce((n, x) => n + x.amount, 0) * 100) / 100 } }
}
const money = (n) => n.toFixed(2)
const confirmation = (o, from) => ({
  from: `Brightmart Orders <${from}>`,
  subject: `Brightmart order confirmation ${o.po}`,
  text: [`Thank you for your order ${o.po}.`, '', ...o.lines.map((x) => `${x.qty} x ${x.item} ${x.description} at ${money(x.price)} = ${money(x.amount)}`), '', `Total ${money(o.total)} EUR. We deliver within 2 working days.`, '', 'Brightmart Orders'].join('\n'),
})

export const PACKAGES = {
  [INTAKE]: {
    note: `The purchase order mail intake of Brightmart, built on ${ASSET}. Every minute ${FLOW} reads the unread mail of INBOX over IMAP (imap.* properties, imaps by default). A mail from an address in orders.senders with a CSV attachment po,item,qty becomes an order: a confirmation goes back over SMTP (smtp.* properties, smtp.starttls) and the mail moves to Processed. Any other mail moves to Error with the reason in the log. A Message-ID that was handled once is not handled again. GET /orders/{po} and GET /status read what was handled.`,
    sample: { method: 'GET', path: '/status' },
    traced: true,
    boot: needs('imap.host', 'imap.port', 'imap.user', 'imap.password', 'smtp.host', 'smtp.port', 'smtp.user', 'smtp.password', 'orders.senders'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    handle(ctx, req) {
      const path = req.path.split('?')[0]
      const st = ctx.store
      if (req.method === 'GET' && path === '/status') return { status: 200, ms: 5, flow: `get:\\status:${API}`, body: json({ mailbox: word(ctx.props['imap.user']), processed: (st.orders ?? []).length, parked: (st.parked ?? []).length, lastPoll: st.lastPoll ?? null }) }
      const m = path.match(/^\/orders\/([^/]+)$/)
      if (req.method === 'GET' && m) {
        const flow = `get:\\orders\\(po):${API}`
        const o = [...(st.orders ?? [])].reverse().find((x) => x.po === m[1])
        return o ? { status: 200, ms: 6, flow, body: json(o) } : { status: 404, ms: 4, flow, body: json({ message: `No order ${m[1]} was received by mail` }) }
      }
      return { status: 404, ms: 3, error: 'APIKIT:NOT_FOUND', flow: `${ASSET}-main`, body: json({ message: 'Resource not found' }) }
    },
    run: {
      [FLOW]: (ctx) => {
        const { props: p, store, now } = ctx
        const imap = imapOf(p)
        const smtp = smtpOf(p)
        const mb = ctx.mailbox
        const polled = mb.poll(imap, 'INBOX', { unreadOnly: true })
        if (!polled.ok) return { ok: false, ms: 1200, errorType: polled.type, log: [muleError({ flow: FLOW, file: INTAKE, ...el.source, type: polled.type, message: polled.error })] }
        const out = { lastPoll: now }
        if (!polled.messages.length) return { ok: true, ms: 150, log: [], store: out }
        const log = [info(`On New Email: ${polled.messages.length} unread mail${polled.messages.length > 1 ? 's' : ''} in INBOX of ${imap.user}`)]
        const errors = []
        const allowed = sendersOf(p)
        for (const msg of polled.messages) {
          const cid = cidOf(msg.messageId)
          const say = (t) => `event:${cid} ${t}`
          const from = addrOf(msg.from)
          const park = (reason) => {
            const r = mb.move(imap, 'INBOX', msg.uid, 'Error')
            if (!r.ok) {
              errors.push(r.type)
              log.push(muleError({ flow: FLOW, file: INTAKE, ...el.move, name: 'Move to Error', type: r.type, message: say(r.error) }))
              return
            }
            errors.push('APP:ORDER_REJECTED') // lab-made error type, so Message Error Count shows a parked mail
            store.parked = keep(store.parked, { mid: msg.messageId, from, subject: msg.subject, reason, t: now })
            log.push(warn(say(`${msg.messageId} "${msg.subject}" from ${from} moved to Error: ${reason}`)))
          }
          if ((store.done ?? []).includes(msg.messageId)) {
            mb.move(imap, 'INBOX', msg.uid, 'Processed')
            log.push(info(say(`${msg.messageId} was handled before. No second confirmation, moved to Processed`)))
            continue
          }
          log.push(info(say(`Mail ${msg.messageId} "${msg.subject}" from ${from}, ${msg.attachments.length} attachment${msg.attachments.length === 1 ? '' : 's'}`)))
          if (!allowed.includes(from)) {
            park(`${from} is not a known customer (orders.senders)`)
            continue
          }
          const x = readOrder(msg)
          if (x.bad) {
            park(x.bad)
            continue
          }
          const o = x.order
          const sent = mb.send(smtp, { ...confirmation(o, smtp.user), to: from })
          if (!sent.ok) {
            // the mail stays unread in INBOX, so the next poll tries again
            errors.push(sent.type)
            log.push(muleError({ flow: FLOW, file: INTAKE, ...el.send, type: sent.type, message: say(sent.error) }))
            continue
          }
          store.done = keep(store.done, msg.messageId)
          store.orders = keep(store.orders, { po: o.po, from, lines: o.lines.length, total: o.total, mid: msg.messageId, confirmation: sent.messageId, cid, t: now })
          log.push(info(say(`Order ${o.po}: ${o.lines.length} line${o.lines.length === 1 ? '' : 's'}, total ${money(o.total)}. Confirmation ${sent.messageId} sent to ${from}: ${sent.reply}`)))
          const moved = mb.move(imap, 'INBOX', msg.uid, 'Processed')
          if (!moved.ok) {
            errors.push(moved.type)
            log.push(muleError({ flow: FLOW, file: INTAKE, ...el.move, type: moved.type, message: say(moved.error) }))
          } else log.push(info(say(`Moved to Processed`)))
        }
        return { ok: errors.length === 0, ms: 900, errorType: errors[0] ?? null, errors: errors.length, log, store: { ...out, done: store.done, orders: store.orders, parked: store.parked } }
      },
    },
  },
}
