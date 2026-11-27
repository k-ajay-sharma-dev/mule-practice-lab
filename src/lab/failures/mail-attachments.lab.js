// The guided lab mail-attachments. See platform-labs.js for the shape of a lab.
import { advance, at, MINUTE, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, sawLogs, until, withProp } from '../platform-kit.js'
import { defaultMailServer, MB, samplePdf, setMailPort } from '../platform-mailserver.js'
import { BOX, FLOW, forwardMode, NAME, readAs, smtpOf } from './mail-attachments.pkg.js'

const AP = 'ap-team@harbor.example'
const APP_PASSWORD = 'invc-mule-52d8'
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const since = (list, s) => (list ?? []).filter((x) => x.t > app(s, NAME).updated)

const tlsOk = (s) => {
  if (!running(s)) return false
  const c = smtpOf(props(s))
  return (String(c.port).trim() === '587' && c.protocol === 'smtp' && c.tls) || (String(c.port).trim() === '465' && c.protocol === 'smtps')
}
const binaryOk = (s) => running(s) && readAs(props(s)) === 'binary'
// the scan of 7.9 MB is about 10.8 MB on the wire: a link, or a limit above that, lets it through
const sizeOk = (s) => running(s) && (forwardMode(props(s)) === 'link' || (s.mailServer?.maxSize ?? 0) >= 12 * MB)

function mailServer(now) {
  const y = defaultMailServer(now)
  y.accounts[BOX].folders.INBOX = []
  y.accounts[BOX].uidNext = 7000
  // until Tuesday 06:00 port 25 also took logins from apps
  y.ports['25'].auth = true
  y.feeds = [
    {
      to: BOX,
      every: 20,
      hours: [8, 18],
      at: now,
      n: 931,
      mails: [
        { from: 'Quayside Paper <billing@quayside-paper.example>', subject: 'Invoice INV-20{n}', text: 'Dear customer, please find invoice INV-20{n} attached.', attachments: [samplePdf('INV-20{n}.pdf', 421888)] },
        { from: 'Bluefin Supplies <ar@bluefin-supplies.example>', subject: 'Invoice BF-77{n} with delivery scans', text: 'Invoice and signed delivery notes, scanned.', attachments: [samplePdf('BF-77{n}-scan.pdf', 8283750)] },
        { from: 'Tidewater Tools <invoices@tidewater-tools.example>', subject: 'TT invoice {n}', text: 'Invoice {n} for the October tools order.', attachments: [samplePdf('TT-{n}.pdf', 286720)] },
      ],
    },
  ]
  return y
}

const lab = {
  id: 'p-mail-attachments',
  group: 'Email',
  title: 'Invoices that nobody can open',
  minutes: 22,
  scenario: `${NAME} reads supplier invoices from ${BOX}, forwards each PDF to the accounts payable team at ${AP} and sends the supplier a confirmation. It is Tuesday 09:00. The AP team says the PDFs from yesterday cannot be opened, the big scans of Bluefin Supplies never arrive, and since last evening suppliers get no confirmation. The Inbox has the mails.`,
  start() {
    let s = newPlatform({
      clock: at(0, 8),
      apps: [
        newApp(NAME, {
          props: {
            'imap.protocol': 'imaps', 'imap.host': 'mail.harbor.lab', 'imap.port': '993', 'imap.user': BOX,
            'smtp.protocol': 'smtp', 'smtp.host': 'mail.harbor.lab', 'smtp.port': '25', 'smtp.starttls': 'false', 'smtp.user': BOX,
            'invoice.readAs': 'text', 'ap.forward': 'attach', 'ap.to': AP,
          },
          secrets: { 'imap.password': APP_PASSWORD, 'smtp.password': APP_PASSWORD },
          store: {},
        }),
      ],
      mailServer: mailServer(at(0, 8)),
      mail: [
        {
          t: at(0, 16, 30),
          to: OPS,
          subject: 'Port 25 is for server to server mail from Tuesday',
          body: 'From Tuesday 06:00, port 25 of mail.harbor.lab takes mail from other mail servers only and offers no login. Apps send on port 587 with STARTTLS, or on port 465 with SMTPS. The limit for mail you send stays at 10240000 bytes. Mail team',
          source: 'Mail team',
        },
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Invoice PDFs are damaged',
          body: `Every invoice PDF that the intake forwarded to ${AP} yesterday is damaged: the reader cannot open it. The originals that suppliers send open fine. The large scans from Bluefin Supplies do not reach us at all. And since yesterday evening suppliers write that they get no confirmation. Harbor accounts payable`,
          source: 'Harbor accounts payable',
        },
      ],
    })
    s = until(s, at(0, 17))
    // the developer moved the app to the submission port before the change, and left the rest as it was
    s = withProp(s, NAME, 'smtp.port', '587')
    s = until(s, at(1, 6))
    s = setMailPort(s, '25', { auth: false })
    return until(s, at(1, 9))
  },
  steps: [
    { ...sawLogs(NAME), how: `Runtime Manager, Applications, ${NAME}, Logs. Yesterday a big scan failed on Forward to AP. Since 17:00 every mail fails with EMAIL:SEND.` },
    {
      title: 'Read the SMTP dialogue',
      how: `Mail server from the console menu, tab Server log. Look at the lines of ${NAME} on port 587: the server offers STARTTLS and no AUTH, the app sends MAIL FROM in plain text, and the server answers 530 5.7.0 Must issue a STARTTLS command first.`,
      done: (s) => Boolean(s.seen['mail-log']),
    },
    {
      title: 'Send with TLS',
      how: `Runtime Manager, ${NAME}, Settings, Properties. On port 587 keep smtp.protocol smtp and set smtp.starttls to true, which is mail.smtp.starttls.enable in the SMTP connection. Port 465 with smtp.protocol smtps also works. Apply Changes.`,
      done: tlsOk,
    },
    {
      title: 'Compare the PDFs',
      how: `Mail server, open the mailbox ${AP} and a forwarded invoice. Its PDF is text/plain and almost twice the size. Then open ${BOX}, folder Processed: the original is application/pdf.`,
      done: (s) => Boolean(s.seen[`mail:${AP}`]),
    },
    ask(
      'Why the PDF is damaged',
      'The original is application/pdf of 412 KB. The forwarded copy is text/plain of 742 KB and cannot be opened. What did the app do?',
      [
        'The mail server compressed it',
        'The transform read the attachment as text: the bytes were decoded as UTF-8, every byte that is not valid UTF-8 became a replacement character of 3 bytes, and the PDF was sent on as text',
        'The supplier sent a damaged file',
        'IMAP cannot carry files larger than 400 KB',
      ],
      1,
      'A PDF is binary. Reading it with output text/plain, or a set payload with mimeType text/plain, decodes the bytes with a charset, and bytes that are not valid characters are replaced. That is lossy, so the file can never be repaired. Keep an attachment as binary from the source to the target and pass its content type, application/pdf, to the attachment of email:send.',
    ),
    {
      title: 'Keep the attachment binary',
      how: 'Properties: set invoice.readAs to binary. The transform then passes the attachment as it came, and the forward carries it as application/pdf. Apply Changes.',
      done: binaryOk,
    },
    ask(
      'A 7.9 MB scan over a 10 MB limit',
      'The Bluefin scan is 7.9 MB and the limit for mail you send is 10240000 bytes, about 9.8 MB. Why does the forward fail with 552 5.3.4 Message size exceeds fixed limit?',
      [
        'The limit counts in bits',
        'The headers are 2 MB',
        'Mail is text, so a binary attachment is sent in base64: 3 bytes become 4 characters plus line breaks, so 7.9 MB becomes about 10.8 MB on the wire',
        'The server counts the attachment twice',
      ],
      2,
      'MIME encodes binary parts in base64, which adds about 37 percent with the line breaks. The SIZE that the server compares is the encoded message. Plan for an attachment of about 7 MB under a 10 MB limit. For large files send a link to a store such as a file share or blob storage, or ask the mail team for a larger limit.',
    ),
    {
      title: 'Get the large scans through',
      how: 'Properties: set ap.forward to link, so the AP mail carries a link to the archive copy and no attachment. Or raise the limit in Mail server, tab Settings, to at least 12 MB if the mail team agrees. Apply Changes.',
      done: sizeOk,
    },
    {
      title: 'Watch the next invoices',
      how: `Move the clock 20 minutes after the last change. A new invoice is forwarded as application/pdf or as a link, the supplier gets a confirmation, and the last run has no error. To process the invoices that failed, move them from Error back to INBOX in ${BOX}.`,
      done: (s) => {
        if (!tlsOk(s) || !binaryOk(s) || !sizeOk(s) || s.clock < app(s, NAME).updated + 20 * MINUTE) return false
        const done = since(app(s, NAME).store?.done, s)
        const last = app(s, NAME).schedules.find((x) => x.flow === FLOW)?.last
        const out = (s.mailServer?.outbound ?? []).filter((x) => x.t > app(s, NAME).updated && x.client === NAME)
        return done.length > 0 && done.every((d) => d.files.every((f) => !f.damaged)) && out.length > 0 && Boolean(last?.ok) && last.t > app(s, NAME).updated
      },
    },
  ],
  why: 'Three failures sat on one flow. Port 587 is submission with STARTTLS: without mail.smtp.starttls.enable the server offers no login and answers 530 5.7.0, while 465 is SMTPS with TLS from the first byte. An attachment is binary: read it as text and the bytes are decoded and replaced, so the file is damaged for good; keep it binary with its content type. A binary attachment travels in base64, which adds about 37 percent, so check the size limit against the encoded size, and send large files as a link. In the lab the transform and the forward mode are properties, the content of a PDF is a short sample, and port 25 has its own larger limit for mail from other servers.',
  docs: 'https://docs.mulesoft.com/email-connector/latest/',
  solve(start) {
    let s = mark(mark(mark(mark(start, `logs:${NAME}`), 'mail-log'), `mail:${AP}`), 'inbox')
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'smtp.starttls': 'true', 'invoice.readAs': 'binary', 'ap.forward': 'link' } })
    return advance(s, 21 * MINUTE)
  },
  answers: { 4: 1, 6: 2 },
}

export const LABS = [lab]
