// The sample applications of the sb-sessions lab. Imports only platform-log.js and platform-led.js, so the engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const SENDER = 'sb-invoice-line-sender'
export const WORKER = 'sb-invoice-totals-worker'
export const OLD_QUEUE = 'invoice-lines'
// invoices the billing system sends in each run, every 2 minutes, with 3 lines and a closing message each
export const PER_RUN = 2
export const LINES = 3
// how many messages each replica takes in one lab minute
const STEPS = 6
const SB_LOG = 'com.azure.messaging.servicebus.ServiceBusReceiverAsyncClient'

const clean = (v) => String(v ?? '').trim()
const money = (n) => (Math.round(n * 100) / 100).toFixed(2)
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
// sb.sessionId is the Session id field of the Send operation. An expression that names invoiceId sets the invoice ID.
export const sessionIdOf = (props, invoiceId) => {
  const v = clean(props['sb.sessionId'])
  if (!v) return null
  return /invoiceId/i.test(v) ? invoiceId : v.replace(/^#\[|\]$/g, '')
}
export const sessionReceiver = (props) => clean(props['sb.sessions']).toLowerCase() === 'true'
const fail = (flow, file, name, dsl, r) => ({ ok: false, ms: 400, errorType: r.muleType, log: [muleError({ flow, file, at: 1, name, dsl, type: r.muleType, message: r.text })] })

// the ERP total of one invoice is right when it is the sum of its lines as the sender sent them
export const postedOk = (sent, p) => sent?.[p.invoice] !== undefined && money(sent[p.invoice]) === money(p.total)

export const PACKAGES = {
  [SENDER]: {
    note: 'Every 2 minutes it sends the lines of 2 invoices from billing to the Service Bus queue in sb.queue: 3 InvoiceLine messages and an InvoiceClosed message for each invoice, mixed in one batch. sb.connectionString is a SAS connection string with Send. sb.sessionId is the Session id of the Send operation; empty means no session.',
    boot: needs('sb.connectionString', 'sb.queue'),
    schedules: [{ flow: 'send-invoice-lines-flow', type: 'cron', value: '0 0/2 * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'send-invoice-lines-flow': ({ props, store, serviceBus }) => {
        const from = store.next ?? 4101
        const invoices = Array.from({ length: PER_RUN }, (_, i) => `INV-${from + i}`)
        const amounts = Object.fromEntries(invoices.map((id, i) => [id, Array.from({ length: LINES }, (_, k) => 12.5 + ((from + i) % 7) * 3 + k * 8.25)]))
        const messages = []
        for (let k = 0; k <= LINES; k++)
          for (const id of invoices) {
            const body = k < LINES ? { invoiceId: id, type: 'InvoiceLine', line: k + 1, amount: amounts[id][k] } : { invoiceId: id, type: 'InvoiceClosed', lines: LINES }
            messages.push({ body: JSON.stringify(body), contentType: 'application/json', messageId: `${id}-${k < LINES ? `L${k + 1}` : 'CLOSE'}`, sessionId: sessionIdOf(props, id), subject: body.type, properties: { invoiceId: id, type: body.type } })
          }
        const r = serviceBus.send(props['sb.connectionString'], props['sb.queue'], messages)
        if (!r.ok) return { ...fail('send-invoice-lines-flow', SENDER, 'Send invoice lines', '<azure-service-bus:send config-ref="Service_Bus_Config" destinationName="${sb.queue}" sessionId="${sb.sessionId}">', r), store: { next: from } }
        const sent = { ...store.sent }
        for (const id of invoices) sent[id] = amounts[id].reduce((a, b) => a + b, 0)
        const keys = Object.keys(sent).slice(-40)
        return {
          ok: true,
          ms: 600,
          log: [info(`Sent ${messages.length} messages for ${invoices.join(', ')} to ${props['sb.queue']}${!sessionIdOf(props, invoices[0]) ? ', no SessionId' : sessionIdOf(props, invoices[0]) === invoices[0] ? ', SessionId set to the invoice ID' : `, SessionId ${sessionIdOf(props, invoices[0])}`}`)],
          store: { next: from + PER_RUN, sent: Object.fromEntries(keys.map((k) => [k, sent[k]])) },
        }
      },
    },
  },
  [WORKER]: {
    note: 'Takes the invoice lines from the queue in sb.queue with PeekLock, adds each line to the running total of its invoice in the ERP, and posts the invoice when its InvoiceClosed message comes. It runs on 3 replicas that take messages at the same time. sb.sessions true makes it a session receiver (the listener accepts the next free session and reads it in order); false is a plain receiver. sb.connectionString needs Listen.',
    boot: needs('sb.connectionString', 'sb.queue'),
    schedules: [{ flow: 'invoice-totals-flow', type: 'cron', value: '0 * * * * ?', tz: 'UTC', enabled: true }],
    run: {
      'invoice-totals-flow': ({ app, props, store, now, serviceBus }) => {
        const conn = props['sb.connectionString']
        const queue = props['sb.queue']
        const sessions = sessionReceiver(props)
        const replicas = Math.max(1, app.replicas ?? 1)
        const totals = { ...store.totals }
        let posted = store.posted ?? []
        const log = []
        const held = {}
        const dsl = `<azure-service-bus:message-listener config-ref="Service_Bus_Config" destinationName="\${sb.queue}">`
        for (let step = 0; step < STEPS; step++) {
          // every replica takes one message in this step, then they all work at the same time
          const taken = []
          for (let r = 1; r <= replicas; r++) {
            const receiver = `${app.name}-replica-${r}`
            if (sessions && !held[r]) {
              const a = serviceBus.acceptSession(conn, queue, { receiver })
              if (!a.ok && a.reason !== 'ServiceTimeout') return { ...fail('invoice-totals-flow', WORKER, 'Message listener', dsl, a), store: { totals, posted } }
              if (!a.ok) continue
              held[r] = a.sessionId
              log.push(info(`[${receiver}] Accepted session ${a.sessionId}`, SB_LOG))
            }
            const got = serviceBus.receive(conn, queue, { max: 1, receiver, ...(sessions && { sessionId: held[r] }) })
            if (!got.ok) return { ...fail('invoice-totals-flow', WORKER, 'Message listener', dsl, got), store: { totals, posted } }
            if (!got.messages.length) {
              if (sessions) {
                serviceBus.releaseSession(conn, queue, held[r], receiver)
                held[r] = null
              }
              continue
            }
            taken.push({ r, receiver, m: got.messages[0] })
          }
          if (!taken.length) break
          // each replica reads the running total first, then writes it: two replicas on one invoice lose a line
          const reads = taken.map((x) => {
            const b = JSON.parse(x.m.body)
            return { ...x, b, seen: totals[b.invoiceId] ?? { sum: 0, count: 0 } }
          })
          for (const x of reads) {
            const id = x.b.invoiceId
            if (x.b.type === 'InvoiceLine') {
              totals[id] = { sum: x.seen.sum + x.b.amount, count: x.seen.count + 1 }
              log.push(info(`[${x.receiver}] Line ${x.b.line} of ${id}, ${money(x.b.amount)}: read running total ${money(x.seen.sum)}, wrote ${money(totals[id].sum)}`))
              if (posted.some((p) => p.invoice === id)) log.push(warn(`[${x.receiver}] Line ${x.b.line} of ${id} came after the invoice was posted. It is not on the invoice.`))
            } else {
              delete totals[id]
              posted = keep(posted, { invoice: id, total: Math.round(x.seen.sum * 100) / 100, lines: x.seen.count, t: now })
              const short = x.seen.count !== x.b.lines
              log.push((short ? warn : info)(`[${x.receiver}] Invoice ${id} posted to the ERP with total ${money(x.seen.sum)}, ${x.seen.count} of ${x.b.lines} lines counted${short ? '. The total is missing lines' : ''}`))
            }
            const c = serviceBus.complete(conn, queue, x.m.lockToken)
            if (!c.ok) log.push(warn(`[${x.receiver}] Complete failed for ${x.m.messageId}: ${c.text}`, SB_LOG))
          }
        }
        for (const [r, sid] of Object.entries(held)) if (sid) serviceBus.releaseSession(conn, queue, sid, `${app.name}-replica-${r}`)
        // lab: the running totals of the ERP live in the application store
        const open = Object.keys(totals).slice(-20)
        return { ok: true, ms: 2000, log, store: { totals: Object.fromEntries(open.map((k) => [k, totals[k]])), posted } }
      },
    },
  },
}
