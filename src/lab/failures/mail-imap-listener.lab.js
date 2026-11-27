// The guided lab mail-imap-listener. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until, withProp } from '../platform-kit.js'
import { defaultMailServer, mailMsg } from '../platform-mailserver.js'
import { afterError, afterSuccess, BOX, FLOW, NAME } from './mail-imap-listener.pkg.js'

const APP_PASSWORD = 'ordr-mule-7c41'
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const yes = (v) => String(v ?? '').trim().toLowerCase() === 'true'
const store = (s) => app(s, NAME)?.store ?? {}
const since = (list, s) => (list ?? []).filter((x) => x.t > app(s, NAME).updated)

const successOk = (s) => running(s) && !yes(props(s)['listener.deleteAfterRetrieve']) && ['seen', 'move'].includes(afterSuccess(props(s)))
const errorOk = (s) => running(s) && afterError(props(s)) === 'move' && yes(props(s)['idempotency.messageId'])

const order = (po, customer, item, qty) => ({ from: `${customer} <orders@${customer.toLowerCase().replace(/\s+/g, '-')}.example>`, subject: `Order ${po}`, text: `PO: ${po}\nItem: ${item}\nQty: ${qty}\nCustomer: ${customer}` })

function mailServer(now) {
  const y = defaultMailServer(now)
  const box = y.accounts[BOX]
  box.folders.INBOX = []
  box.uidNext = 4100
  // orders from the night, not read yet
  for (const [i, o] of [order('PO-5201', 'Quay Deli', 'H-300', '4'), order('PO-5202', 'Pier Cafe', 'H-100', '10')].entries()) {
    const m = mailMsg({ ...o, to: BOX, date: now - (50 - i * 10) * MINUTE })
    box.folders.INBOX.push({ ...m, uid: box.uidNext++, messageId: `<night-${i + 1}.4f20@mx.harbor-partners.example>` })
  }
  // the shops send their orders by mail, one every 4 minutes; a person typed the fourth one
  y.feeds = [
    {
      to: BOX,
      every: 4,
      at: now,
      n: 301,
      mails: [
        { from: 'Quay Deli <orders@quay-deli.example>', subject: 'Order PO-5{n}', text: 'PO: PO-5{n}\nItem: H-300\nQty: 6\nCustomer: Quay Deli' },
        { from: 'Pier Cafe <orders@pier-cafe.example>', subject: 'Order PO-5{n}', text: 'PO: PO-5{n}\nItem: H-100\nQty: 8\nCustomer: Pier Cafe' },
        { from: 'Dock Bakery <orders@dock-bakery.example>', subject: 'Order PO-5{n}', text: 'PO: PO-5{n}\nItem: H-200\nQty: 20\nCustomer: Dock Bakery' },
        { from: 'Harbor Bistro <buyer@harbor-bistro.example>', subject: 'Order for Thursday', text: 'Hello, please send us\nPO: PO-5{n}\nItem: H-100\nQty: 12 cases\nCustomer: Harbor Bistro\nThanks, Mia' },
      ],
    },
  ]
  return y
}

const lab = {
  id: 'p-mail-imap-listener',
  group: 'Email',
  title: 'Every order twice, then not at all',
  minutes: 20,
  scenario:
    `${NAME} reads the shared mailbox ${BOX} over IMAP once a minute and creates an order for each new mail. It is Tuesday 09:00. Since 07:00 shops got the same order confirmation again and again. At 08:40 a developer set deleteAfterRetrieve to true. The repeats stopped, but now Harbor Bistro says its order never arrived, and the mail is not in the mailbox either. The Inbox has the mail of the order desk.`,
  start() {
    let s = newPlatform({
      clock: at(1, 7),
      apps: [
        newApp(NAME, {
          props: { 'mail.protocol': 'imaps', 'mail.host': 'mail.harbor.lab', 'mail.port': '993', 'mail.user': BOX, 'mail.folder': 'INBOX', 'listener.deleteAfterRetrieve': 'false', 'after.success': 'none', 'after.error': 'none', 'idempotency.messageId': 'false' },
          secrets: { 'mail.password': APP_PASSWORD },
          store: {},
        }),
      ],
      mailServer: mailServer(at(1, 7)),
      mail: [
        {
          t: at(1, 8, 50),
          to: OPS,
          subject: 'Orders from the order mailbox',
          body: `From 07:00 every order that came in by mail was created again each minute. Quay Deli got more than 100 confirmations of one order. At 08:40 we set deleteAfterRetrieve to true in ${NAME} and the copies stopped. Now Harbor Bistro called: they sent an order this morning and it never arrived, and we cannot find their mail in ${BOX}. Harbor order desk`,
          source: 'Harbor order desk',
        },
      ],
    })
    s = until(s, at(1, 8, 40))
    s = withProp(s, NAME, 'listener.deleteAfterRetrieve', 'true')
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Before 08:40 each poll creates the same orders again. After 08:40 an order that cannot be read fails, and the log says deleteAfterRetrieve already deleted it.` },
    {
      title: 'Look at the mailbox and the server log',
      how: `Mail server from the console menu. Open the mailbox ${BOX}: the INBOX is almost empty and the Error folder too. Then open the tab Server log: each poll is a UID FETCH with BODY.PEEK, then UID STORE +FLAGS (\\Deleted) and EXPUNGE. Opening a mail in the webmail sets \\Seen, so do not open the INBOX mails before the fix.`,
      done: (s) => Boolean(s.seen[`mail:${BOX}`] && s.seen['mail-log']),
    },
    ask(
      'Why every order came again',
      'Before 08:40 the source read only unread mail. Why did it create the same order every minute?',
      [
        'The mail server sent each mail again',
        'The IMAP fetch peeks, and the flow never marked a mail \\Seen or moved it. An unread mail stays unread, so each poll finds it again',
        'The polling frequency was too short',
        'The shops sent each order many times',
      ],
      1,
      'An IMAP poll asks the server for the mails that match now, here UNSEEN. Nothing in the flow changed the mail, so it matched on every poll. The fix is an action on the mail after the order is created: mark it as read, or move it to a Processed folder. A watermark also stops the repeat, because it reads only uids above the last one, but then a mail whose flow failed is never read again.',
    ),
    ask(
      'Why the Bistro order is gone',
      'With deleteAfterRetrieve true the copies stopped. Why was the Harbor Bistro order lost?',
      [
        'The mailbox is full',
        'Harbor Bistro sent it to the wrong address',
        'The mail was deleted when the source retrieved it. Its flow then failed on Qty: 12 cases, and no copy was left on the server to read again or to look at',
        'IMAP cannot read a mail with more than four lines',
      ],
      2,
      'deleteAfterRetrieve removes the mail from the folder as part of the retrieve. The flow decides nothing about it, so a failure in the flow loses the mail. Delete or move a mail only after the flow has handled it: on success to Processed, on failure to an Error folder that a person checks.',
    ),
    {
      title: 'Act on the mail after success',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set listener.deleteAfterRetrieve to false, and after.success to seen (mark as read) or move (move to Processed). Apply Changes.`,
      done: successOk,
    },
    {
      title: 'Park failures and check the Message-ID',
      how: 'Set after.error to move, so the error handler moves a mail that cannot be read to Error and the order desk can fix it. Set idempotency.messageId to true, so an order is created once per Message-ID even if a mail is read twice. Apply Changes.',
      done: errorOk,
    },
    ask(
      'IMAP or POP3',
      'A colleague asks why the app does not use POP3, which many servers also offer. What is the main difference for this flow?',
      [
        'POP3 is faster for one mailbox',
        'POP3 has one folder and keeps no flags. The app cannot mark a mail as read or move it to Processed or Error, so it can only read everything each time or delete after retrieve',
        'POP3 cannot use TLS',
        'There is no difference for an app',
      ],
      1,
      'POP3 downloads the mails of INBOX and can delete them. It has no \\Seen flag that stays on the server and no folders. For a shared mailbox where a flow must mark, move or keep failed mails, use IMAP, ideally IMAPS on port 993.',
    ),
    ask(
      'Why the Message-ID as well',
      'The flow now marks each mail after its order is created. Why also keep the Message-ID?',
      [
        'Mark as read is slow',
        'A crash or a failed mark between the create and the mark leaves the mail unread, and the next poll creates the order again. A check on the Message-ID in a persistent Object Store makes the second read a no op',
        'The Message-ID is the order number',
        'IMAP needs it to log in',
      ],
      1,
      'Creating the order and marking the mail are two systems, with no transaction around both. Any failure between them repeats the order. The Message-ID header is the same on every read of the same mail, so it is a good idempotency key. The order system can also refuse a second PO with the same number.',
    ),
    {
      title: 'Watch the next polls',
      how: 'Move the clock 15 minutes after the last change. New orders are created once each, the Harbor Bistro mail that comes next lands in Error, nothing is lost, and the last poll has no error.',
      done: (s) => {
        if (!successOk(s) || !errorOk(s) || s.clock < app(s, NAME).updated + 15 * MINUTE) return false
        const st = store(s)
        const made = since(st.creates, s)
        const before = new Set((st.creates ?? []).filter((x) => x.t <= app(s, NAME).updated).map((x) => x.po))
        const pos = made.map((x) => x.po)
        const last = app(s, NAME).schedules.find((x) => x.flow === FLOW)?.last
        return made.length > 0 && new Set(pos).size === pos.length && pos.every((p) => !before.has(p)) && since(st.parked, s).length > 0 && since(st.lost, s).length === 0 && Boolean(last?.ok) && last.t > app(s, NAME).updated
      },
    },
  ],
  why: 'An IMAP poll returns what matches now. A flow that reads unread mail must change the mail after it has handled it, or it reads it again on every poll: mark it as read or move it to a Processed folder. deleteAfterRetrieve stops the repeat by removing the mail at retrieval, so a failed flow loses it. Move failed mails to an Error folder instead, and make the create idempotent with the Message-ID, because the create and the mark can never be one transaction. POP3 has no flags and no folders, so for this pattern use IMAP. In the lab the listener options and the error handler are properties, the fetch never sets \\Seen by itself, and the delete happens at retrieval.',
  docs: 'https://docs.mulesoft.com/email-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(start, `logs:${NAME}`), `mail:${BOX}`), 'mail-log')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'listener.deleteAfterRetrieve': 'false', 'after.success': 'move', 'after.error': 'move', 'idempotency.messageId': 'true' } })
    return advance(s, 16 * MINUTE)
  },
  answers: { 2: 1, 3: 2, 6: 1, 7: 1 },
}

export const LABS = [lab]
