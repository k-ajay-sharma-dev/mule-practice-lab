// The guided lab setup-mail. See platform-labs.js for the shape of a lab.
// The whole setup of a mail integration: the mailbox and its folders, an app password, SMTP on 587 with STARTTLS and
// IMAPS on 993, the deployment, a connection test, a confirmation end to end, inbound mail moved, a bad mail parked.
import { addMonAlert, advance, at, deployApp, finishDeploys, mark, MINUTE, newPlatform } from '../platform.js'
import { app, ask, call, called, OPS } from '../platform-kit.js'
import { addAppPassword, addMailAccount, defaultMailServer, MAIL_HOST, mailboxCtx, newAccount, setMailAccount, webAddFolder, webOpen } from '../platform-mailserver.js'
import { BOX, imapOf, JAR, NAME, smtpOf } from './setup-mail.pkg.js'

const TEST = 'qa-shop@harbor.example'
const TEAM = 'service-desk@harbor.example'
const PASSWORD = 'Webshop-Mailbox-2611' // a made-up lab value
const BODY = `{"email":"${TEST}","name":"QA shop"}`

const acc = (s) => s.mailServer?.accounts?.[BOX]
const a = (s) => app(s, NAME)
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const appPasswords = (s) => (acc(s)?.appPasswords ?? []).map((x) => x.value)
const folder = (s, name) => acc(s)?.folders?.[name] ?? []
const configOk = (s) => {
  const x = a(s)
  if (!x || !acc(s)) return false
  const p = x.props
  const sec = x.secrets ?? {}
  const pass = (k) => appPasswords(s).includes(sec[k]) && sec[k] !== acc(s).password && !(k in p)
  return (
    p['smtp.host'] === MAIL_HOST && String(p['smtp.port']) === '587' && String(p['smtp.starttls']).toLowerCase() === 'true' && (p['smtp.protocol'] ?? 'smtp') === 'smtp' && p['smtp.user'] === BOX && pass('smtp.password') &&
    p['imap.host'] === MAIL_HOST && String(p['imap.port']) === '993' && (p['imap.protocol'] ?? 'imaps') === 'imaps' && p['imap.user'] === BOX && pass('imap.password')
  )
}

function mailServer(now) {
  const y = defaultMailServer(now)
  // the mailbox the testers read; customers write to the web shop from outside, one mail every 5 minutes
  y.accounts[TEST] = newAccount('QA shop', 'Qa-Shop-Lab-2611')
  y.feeds = [
    {
      to: BOX,
      every: 5,
      at: now + 5 * MINUTE,
      n: 1,
      mails: [
        { from: 'Mia Jansen <mia@tidewater-mail.example>', subject: 'Return for my order', text: 'Hello,\nOrder: O-1005\nReason: The jacket is too small.\nMia' },
        { from: 'Tom Berg <tom.berg@quaymail.example>', subject: 'Return request', text: 'Order: O-1002\nReason: It arrived damaged.' },
        { from: 'Sara Lind <sara@northpost.example>', subject: 'Where is my parcel?', text: 'Hello, I ordered last week and nothing came yet. Can you look?\nSara' },
      ],
    },
  ]
  return y
}

const lab = {
  id: 'p-setup-mail',
  group: 'Email',
  title: 'Set up the order confirmation mailer and the web shop mailbox',
  minutes: 30,
  scenario: `The service desk of Harbor wants two things before the spring sale: each web order gets a confirmation mail from ${BOX}, and customers who write to ${BOX} about a return get a return request without a person typing it. ${NAME} is built for both and its jar waits in Runtime Manager. The mailbox does not exist yet, so mail to it bounces today. Done means: confirmations go out over SMTP with STARTTLS, inbound mail is handled and moved, mail the app cannot read is kept for a person, and the service desk hears about errors. The Inbox has the request.`,
  start() {
    return newPlatform({
      clock: at(1, 9),
      jars: [NAME],
      mailServer: mailServer(at(1, 9)),
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Web shop mailbox and order confirmations',
          body: `Hello, please set up ${NAME}.\n\nMailbox ${BOX}, display name Harbor Webshop, on ${MAIL_HOST}. Only the app uses it, so it should take app passwords only.\nConfirmations: SMTP submission on port 587 with STARTTLS. Test them to ${TEST}, the mailbox of the QA team.\nInbound: IMAP over TLS on port 993. A handled mail goes to the folder Processed. A mail the app cannot read goes to Error, where we answer it by hand. Nothing may be deleted.\nAlerts on errors to ${TEAM}.\n\nThanks, Harbor service desk`,
          source: 'Harbor service desk',
        },
      ],
    })
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the mailbox, the ports, the folders, the test mailbox and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Create the mailbox and its folders',
      how: `Mail server from the console menu, tab Accounts, New account. Address ${BOX}, Display name Harbor Webshop, a password of at least 10 characters, Create account. Then tab Mail, Mailbox ${BOX}, and under the folder list create the folders Processed and Error. A move to a folder that does not exist fails with [TRYCREATE].`,
      done: (s) => Boolean(acc(s)) && ['Processed', 'Error'].every((f) => Array.isArray(acc(s).folders[f])),
    },
    {
      title: 'Give the app its own app password',
      how: `Tab Accounts, row ${BOX}. Under App passwords type ${NAME} and Create, and copy the value. Clear Main password works, so the main password no longer opens SMTP or IMAP. The app holds a password that opens this mailbox only, and you can revoke it without touching anything else.`,
      done: (s) => Boolean(acc(s)?.appOnly) && appPasswords(s).length > 0,
    },
    {
      title: 'Set SMTP on 587 with STARTTLS and IMAPS on 993',
      how: `Runtime Manager, Deploy application. Name ${NAME}, Application File ${JAR}. Properties: smtp.host=${MAIL_HOST}, smtp.port=587, smtp.starttls=true, smtp.user=${BOX}, imap.host=${MAIL_HOST}, imap.port=993, imap.protocol=imaps, imap.user=${BOX}. Add smtp.password and imap.password with the app password and choose Protect for each.`,
      done: configOk,
    },
    {
      title: 'Deploy and read the startup logs',
      how: `Deploy. When ${NAME} shows Running, open Runtime Manager, Applications, ${NAME}, Logs and read the start of the app.`,
      done: (s) => running(s) && Boolean(s.seen[`logs:${NAME}`]),
    },
    {
      title: 'Test both connections',
      how: `Mail server, tab In the Mule app. Under ${NAME} choose Test connection for the smtp and the imap config. Both must say Test connection successful. A 530 5.7.0 means STARTTLS is off, 535 5.7.8 a wrong password, [AUTHENTICATIONFAILED] the same on IMAP. The Server log shows each command.`,
      done: (s) => Boolean(s.seen[`mail-test:${NAME}:smtp`] && s.seen[`mail-test:${NAME}:imap`]),
    },
    {
      title: 'Send a test confirmation and read it in the webmail',
      how: `Lab tools, API client. Application ${NAME}, POST /orders/O-1007/confirmation with the body ${BODY}. It answers 202. Then Mail server, tab Mail, Mailbox ${TEST}: open the mail Your Harbor order O-1007 from ${BOX}.`,
      done: (s) => {
        const sent = store(s).sent ?? []
        const inbox = s.mailServer?.accounts?.[TEST]?.folders?.INBOX ?? []
        return called(s, NAME, 202, 'POST', /\/confirmation$/) && sent.some((x) => x.to === TEST && inbox.some((m) => m.messageId === x.messageId && m.flags.includes('\\Seen')))
      },
    },
    {
      title: 'See a customer mail handled and moved',
      how: `Customers write to ${BOX} every 5 minutes. Move the clock 15 minutes. Each minute the app reads the unread mail of INBOX. A return request is logged and moved to Processed. Open Processed in the webmail of ${BOX} and find it there, not in INBOX.`,
      done: (s) => (store(s).returns ?? []).some((r) => folder(s, 'Processed').some((m) => m.messageId === r.mid) && !folder(s, 'INBOX').some((m) => m.messageId === r.mid)),
    },
    {
      title: 'See a mail the app cannot read kept in Error',
      how: `One customer asks where a parcel is and writes no order line. The app cannot make a return request from it, so it moves the mail to Error, where the service desk answers it. Find it in Error. Nothing was deleted and nothing stays unread in INBOX to be read again.`,
      done: (s) => (store(s).parked ?? []).some((p) => folder(s, 'Error').some((m) => m.messageId === p.mid)),
    },
    ask(
      'Why port 587',
      'A teammate asks why the app does not send on port 25, which is open on the server too. What is the answer?',
      [
        'Port 25 is slower',
        'Port 25 is for mail between servers: it offers no login for clients here and many clouds block it outbound. Port 587 is submission: the app logs in with AUTH after STARTTLS, so the server knows who sends and the password never crosses in plain text',
        'Port 25 cannot carry attachments',
        'Port 587 skips the spam filter',
      ],
      1,
      'SMTP on 25 is the MX path from server to server. Submission on 587 requires AUTH and, on this server, STARTTLS before AUTH: without mail.smtp.starttls.enable the server answers 530 5.7.0 Must issue a STARTTLS command first. Port 465 is the same submission with TLS from the first byte, the smtps connection of the Email connector. Inbound, IMAPS on 993 keeps folders and flags, which the move to Processed and Error needs.',
    ),
    {
      title: 'Alert the service desk on errors',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${NAME}, metric Message Error Count, Above 0, with ${TEAM} as recipient.`,
      done: (s) => s.monAlerts.some((x) => x.enabled && x.resource === 'Application' && x.name_ === NAME && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
  ],
  why: 'The setup checklist for mail: create the mailbox and the folders the flow moves mail into. Give the app an app password and turn off the main password for SMTP and IMAP, so a leak is closed by revoking one value. Send on 587 with STARTTLS and AUTH, read on IMAPS 993, keep both passwords protected. Deploy, read the startup logs and test both connections. Then send a real confirmation and open it in the receiving mailbox, watch an inbound mail move to Processed, watch an unreadable one move to Error instead of being lost or read again, and alert on errors. In the lab the webmail opens any mailbox as the admin, the connection test runs on a copy of the server, and customer mail arrives from a timer.',
  docs: 'https://docs.mulesoft.com/email-connector/latest/',
  solve(start) {
    let s = mark(start, 'inbox')
    s = addMailAccount(s, BOX, 'Harbor Webshop', PASSWORD)
    s = webAddFolder(webAddFolder(s, BOX, 'Processed'), BOX, 'Error')
    s = addAppPassword(s, BOX, NAME)
    s = setMailAccount(s, BOX, { appOnly: true })
    const key = s.mailServer.accounts[BOX].appPasswords[0].value
    const props = { 'smtp.host': MAIL_HOST, 'smtp.port': '587', 'smtp.starttls': 'true', 'smtp.user': BOX, 'imap.host': MAIL_HOST, 'imap.port': '993', 'imap.protocol': 'imaps', 'imap.user': BOX }
    s = finishDeploys(deployApp(s, { name: NAME, pkg: NAME, jar: JAR, replicas: 1, vCores: 0.1, props, secrets: { 'smtp.password': key, 'imap.password': key } }).state)
    s = mark(s, `logs:${NAME}`)
    // Test connection as the tab In the Mule app runs it: on a copy of the server, marked when it passes
    const copy = () => mailboxCtx({ clock: s.clock, mailServer: structuredClone(s.mailServer) }, { name: `${NAME} (test)` })
    if (copy().send({ ...smtpOf(props), password: key }, { from: BOX, to: BOX, subject: 'Test connection', text: 'Test' }).ok) s = mark(s, `mail-test:${NAME}:smtp`)
    if (copy().list({ ...imapOf(props), password: key }, 'INBOX').ok) s = mark(s, `mail-test:${NAME}:imap`)
    s = call(s, NAME, null, '/orders/O-1007/confirmation', 'POST', BODY).state
    const mid = store(s).sent.at(-1).messageId
    const uid = s.mailServer.accounts[TEST].folders.INBOX.find((m) => m.messageId === mid).uid
    s = webOpen(s, TEST, 'INBOX', uid)
    s = advance(s, 16 * MINUTE)
    return addMonAlert(s, { title: 'Order mailer errors', resource: 'Application', name_: NAME, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
  },
  answers: { 9: 1 },
}

export const LABS = [lab]
