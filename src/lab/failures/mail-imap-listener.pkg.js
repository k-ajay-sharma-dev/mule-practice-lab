// The sample application of the mail-imap-listener lab. Imports only platform-log.js and import free modules, so the
// engine can load it without a cycle.
import { info, muleError, needs, warn } from '../platform-log.js'

export const NAME = 'order-mail-intake'
export const FLOW = 'order-mail-flow'
export const BOX = 'orders@harbor.example'
const keep = (list, item, n = 40) => [...(list ?? []), item].slice(-n)
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
const word = (v) => String(v ?? '').trim().toLowerCase()
export const afterSuccess = (props) => word(props['after.success']) // none, seen or move
export const afterError = (props) => word(props['after.error']) // none or move

export const configOf = (props) => ({ protocol: word(props['mail.protocol']) || 'imaps', host: props['mail.host'], port: props['mail.port'], user: props['mail.user'], password: props['mail.password'], tls: yes(props['mail.starttls']) })

// PO: PO-5101 / Item: H-100 / Qty: 12 / Customer: Harbor Bistro
export function readOrder(text) {
  const get = (k) => String(text ?? '').match(new RegExp(`^${k}:\\s*(.+)$`, 'mi'))?.[1]?.trim()
  const po = get('PO')
  const qty = get('Qty')
  if (!po) return { bad: 'Cannot coerce Null (null) to String: the mail has no PO line' }
  if (!qty || Number.isNaN(Number(qty))) return { po, bad: `Cannot coerce ${qty ? `String (${qty})` : 'Null (null)'} to Number: line Qty of ${po}` }
  return { po, item: get('Item'), qty: Number(qty), customer: get('Customer') }
}

const el = {
  source: { at: 0, name: 'Order mailbox', dsl: '<email:listener-imap doc:name="Order mailbox" config-ref="Email_IMAP" folder="${mail.folder}" deleteAfterRetrieve="${listener.deleteAfterRetrieve}">' },
  read: { at: 2, name: 'Read order', dsl: '<ee:transform doc:name="Read order">' },
  seen: { at: 4, name: 'Mark as read', dsl: '<email:mark-as-read config-ref="Email_IMAP" emailId="#[attributes.number]" mailboxFolder="${mail.folder}">' },
  move: { at: 4, name: 'Move to Processed', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="${mail.folder}" targetFolder="Processed">' },
  error: { at: 6, name: 'Move to Error', dsl: '<email:move-to-folder config-ref="Email_IMAP" emailId="#[attributes.number]" sourceFolder="${mail.folder}" targetFolder="Error">' },
}
const block = (where, type, message) => muleError({ flow: FLOW, file: NAME, ...el[where], type, message })

export const PACKAGES = {
  [NAME]: {
    note:
      'Every minute the On New Email source reads the unread mails of mail.folder on the mail server over IMAP (imap-matcher seen EXCLUDE) and creates an order in the order system for each one. listener.deleteAfterRetrieve true deletes each mail when it is retrieved. after.success says what happens to a mail after its order is created: none, seen (mark as read) or move (to Processed). after.error says what the error handler does with a mail that cannot be read: none or move (to Error). idempotency.messageId true keeps the Message-ID of each created order in a persistent Object Store and skips a mail whose Message-ID is there.',
    boot: needs('mail.host', 'mail.port', 'mail.user', 'mail.password', 'mail.folder'),
    schedules: [{ flow: FLOW, type: 'fixed', value: '1', unit: 'minutes', enabled: true }],
    run: {
      [FLOW]: (ctx) => {
        const { props, store, now } = ctx
        const cfg = configOf(props)
        const folder = props['mail.folder']
        const mb = ctx.mailbox
        const polled = mb.poll(cfg, folder, { unreadOnly: true, deleteAfterRetrieve: yes(props['listener.deleteAfterRetrieve']) })
        if (!polled.ok) return { ok: false, ms: 1200, errorType: polled.type, log: [block('source', polled.type, polled.error)] }
        if (!polled.messages.length) return { ok: true, ms: 200, log: [] }
        const log = [info(`On New Email: ${polled.messages.length} unread mail${polled.messages.length > 1 ? 's' : ''} in ${folder} of ${cfg.user}`)]
        const errors = []
        store.created ??= {}
        store.mids ??= []
        for (const m of polled.messages) {
          const o = readOrder(m.text)
          if (o.bad) {
            if (afterError(props) === 'move' && !yes(props['listener.deleteAfterRetrieve'])) {
              const r = mb.move(cfg, folder, m.uid, 'Error')
              if (!r.ok) {
                errors.push(r.type)
                log.push(block('error', r.type, r.error))
              } else {
                log.push(warn(`${m.messageId} "${m.subject}" cannot be read: ${o.bad}. on-error-continue moved it to Error for the order desk.`))
                store.parked = keep(store.parked, { mid: m.messageId, subject: m.subject, t: now })
              }
              continue
            }
            errors.push('MULE:EXPRESSION')
            const gone = yes(props['listener.deleteAfterRetrieve'])
            log.push(block('read', 'MULE:EXPRESSION', `${o.bad}. Mail ${m.messageId} "${m.subject}".${gone ? ' deleteAfterRetrieve already deleted it from the server, so no copy is left.' : ' It stays unread, so the next poll reads it again.'}`))
            if (gone) store.lost = keep(store.lost, { mid: m.messageId, subject: m.subject, from: m.from, t: now }, 10)
            continue
          }
          if (yes(props['idempotency.messageId']) && store.mids.includes(m.messageId)) {
            log.push(info(`${m.messageId} ${o.po}: this Message-ID is in the Object Store already, so no order was created`))
          } else {
            store.created[o.po] = (store.created[o.po] ?? 0) + 1
            const n = store.created[o.po]
            store.creates = keep(store.creates, { po: o.po, mid: m.messageId, t: now }, 60)
            if (yes(props['idempotency.messageId'])) store.mids = [...store.mids, m.messageId].slice(-200)
            log.push((n > 1 ? warn : info)(`Created order ${o.po} for ${o.customer}: ${o.qty} x ${o.item}${n > 1 ? `. This is copy ${n} of ${o.po}` : ''}`))
          }
          // keeps the newest orders only, so the store stays small
          const keys = Object.keys(store.created)
          if (keys.length > 30) for (const k of keys.slice(0, keys.length - 30)) delete store.created[k]
          const after = afterSuccess(props)
          if (yes(props['listener.deleteAfterRetrieve']) || after === 'none' || !after) continue
          const r = after === 'move' ? mb.move(cfg, folder, m.uid, 'Processed') : mb.markSeen(cfg, folder, m.uid)
          if (!r.ok) {
            errors.push(r.type)
            log.push(block(after === 'move' ? 'move' : 'seen', r.type, r.error))
          }
        }
        return { ok: errors.length === 0, ms: 900, errorType: errors[0] ?? null, errors: errors.length, log, store }
      },
    },
  },
}
