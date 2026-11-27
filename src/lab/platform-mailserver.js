// A mail server for the Email connector: Postfix style SMTP and Dovecot style IMAP and POP3 on one lab host.
// Pure and import free. Lives in state.mailServer.
//
// State shape (state.mailServer):
//   host, up, domains: ['harbor.example'], maxSize (bytes, the Postfix message_size_limit),
//   ports: { '25': { proto, tls: 'STARTTLS' | 'Implicit TLS', tlsRequired, enabled, use }, ... },
//   accounts: { 'orders@harbor.example': { name, password, appPasswords: [{ name, value }], appOnly, quota, uidNext,
//     folders: { INBOX: [message], Sent, Junk, Processed, Error } } },
//   outbound: [mail relayed to other domains], feeds: [mail that arrives from outside on a timer], log: [protocol lines], n
// A message: { uid, messageId, from, to: [], cc: [], subject, date, flags: ['\\Seen', ...], size, text, html, attachments:
//   [{ name, contentType, size, content, encoding }] }
//
// ctx.mailbox (see mailboxCtx) gives an app send, list, poll, markSeen, setFlag, move, delete, expunge and getAttachments.
// Each takes the connection config of the Email connector: { protocol: smtp | smtps | imap | imaps | pop3 | pop3s, host,
// port, user, password, tls }. tls on smtp, imap or pop3 means STARTTLS (mail.smtp.starttls.enable=true).
// A failure returns { ok: false, type: 'EMAIL:...', error, reply } with the Mule error type and the server reply.

export const MAIL_HOST = 'mail.harbor.lab'
export const LOCAL_DOMAIN = 'harbor.example'
export const MB = 1048576
export const DEFAULT_SIZE_LIMIT = 10240000 // the Postfix default of message_size_limit, for mail that apps and users send
export const SYSTEM_FOLDERS = ['INBOX', 'Sent', 'Junk', 'Processed', 'Error']
export const FLAG_NAMES = ['\\Seen', '\\Flagged', '\\Deleted', '\\Answered']
const MAX_LOG = 220
const MAX_OUT = 30
// lab made: a folder keeps its newest messages only, so a long lab stays small when saved
const MAX_FOLDER = 80
const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const defaultPorts = () => ({
  25: { proto: 'SMTP', tls: 'STARTTLS', tlsRequired: false, auth: false, enabled: true, use: 'Incoming mail from other servers (MX)' },
  587: { proto: 'SMTP', auth: true, tls: 'STARTTLS', tlsRequired: true, enabled: true, use: 'Submission' },
  465: { proto: 'SMTP', auth: true, tls: 'Implicit TLS', tlsRequired: true, enabled: true, use: 'Submission over TLS (SMTPS)' },
  143: { proto: 'IMAP', tls: 'STARTTLS', tlsRequired: true, enabled: true, use: 'IMAP' },
  993: { proto: 'IMAP', tls: 'Implicit TLS', tlsRequired: true, enabled: true, use: 'IMAP over TLS (IMAPS)' },
  110: { proto: 'POP3', tls: 'STARTTLS', tlsRequired: true, enabled: true, use: 'POP3' },
  995: { proto: 'POP3', tls: 'Implicit TLS', tlsRequired: true, enabled: true, use: 'POP3 over TLS (POP3S)' },
})

// ---------- builders ----------

export const newAccount = (name, password, extra = {}) => ({
  name,
  password,
  appPasswords: [],
  appOnly: false,
  quota: 50 * MB,
  uidNext: 1,
  folders: Object.fromEntries(SYSTEM_FOLDERS.map((f) => [f, []])),
  ...extra,
})
export const newMailServer = (extra = {}) => ({
  host: MAIL_HOST,
  up: true,
  domains: [LOCAL_DOMAIN],
  maxSize: DEFAULT_SIZE_LIMIT,
  // lab made: mail from other servers on port 25 has its own, larger limit (a per service -o message_size_limit in master.cf)
  maxInbound: 25 * MB,
  ports: defaultPorts(),
  accounts: {},
  outbound: [],
  feeds: [],
  log: [],
  n: 1,
  ...extra,
})
const SERVER_KEYS = Object.keys(newMailServer())
const TEXT_TYPE = /^(text\/|application\/(json|xml|csv))/i
export const attachment = (name, contentType, size, content = '') => ({ name, contentType, size, content, encoding: TEXT_TYPE.test(contentType) ? 'quoted-printable' : 'base64' })
// The size on the wire: base64 turns 3 bytes into 4 characters and adds a line break every 76, so a binary
// attachment grows by about 37 percent. Headers and MIME parts add a little more.
export const encodedSize = (a) => (a.encoding === 'base64' ? Math.ceil(Math.ceil(a.size / 3) * 4 * (78 / 76)) : Math.ceil(a.size * 1.02))
export const mimeSize = (m) => 720 + String(m.text ?? '').length + String(m.html ?? '').length + (m.attachments ?? []).reduce((n, a) => n + encodedSize(a) + 180, 0)
// a draft message, before the server gives it a uid
export const mailMsg = ({ from, to = [], cc = [], subject = '', text = '', html = '', attachments = [], date = 0, flags = [], messageId } = {}) => {
  const m = { messageId, from, to: [].concat(to).filter(Boolean), cc: [].concat(cc).filter(Boolean), subject, date, flags: [...flags], text, html, attachments: attachments.map((a) => ({ ...a })) }
  m.size = mimeSize(m)
  return m
}

// ---------- small helpers ----------

const addrOf = (v) => String(v ?? '').match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() ?? String(v ?? '').trim().toLowerCase()
const domainOf = (v) => addrOf(v).split('@')[1] ?? ''
export const fill = (y) => {
  if (!y) return newMailServer()
  // a console saved while this module was a placeholder has only { created }: it gets the accounts of the lab
  if (!y.host && !y.accounts) Object.assign(y, defaultMailServer(y.created ?? 0), y)
  else if (SERVER_KEYS.some((k) => y[k] === undefined || y[k] === null)) {
    const base = newMailServer()
    for (const k of Object.keys(base)) y[k] ??= base[k]
  }
  for (const acc of Object.values(y.accounts)) {
    acc.folders ??= {}
    acc.folders.INBOX ??= []
    acc.appPasswords ??= []
    acc.uidNext ??= 1
  }
  return y
}
const hex = (seed, n = 8) => {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  let out = ''
  for (let i = 0; out.length < n; i++) {
    h = Math.imul(h ^ (i + 0x9e37), 16777619) >>> 0
    out += ((h ^ (h >>> 13)) >>> 0).toString(16).padStart(8, '0')
  }
  return out.slice(0, n)
}
const next = (y) => (y.n = (y.n ?? 1) + 1)
const push = (list, entry, max) => {
  list.push(entry)
  if (list.length > max) list.splice(0, list.length - max)
}
// one line of the server log. dir C is the client, S the server, '' a note of the server itself (like a maillog line)
const logLine = (y, now, proto, client, dir, text, ok = true) => push(y.log, { t: now, proto, client, dir, text, ok }, MAX_LOG)
const fail = (type, error, reply) => ({ ok: false, type, error, reply })
export const usedOf = (acc) => Object.values(acc?.folders ?? {}).reduce((n, list) => n + list.reduce((k, m) => k + (m.size ?? 0), 0), 0)
export const unreadOf = (list) => (list ?? []).filter((m) => !m.flags.includes('\\Seen') && !m.flags.includes('\\Deleted')).length
const summary = (m) => ({ ...m, flags: [...m.flags], attachments: m.attachments.map(({ content, ...a }) => a) }) // eslint-disable-line no-unused-vars
const full = (m) => structuredClone(m)
const passwordOk = (acc, password) => Boolean(acc) && ((!acc.appOnly && password === acc.password) || acc.appPasswords.some((a) => a.value === password))
const baseProto = (protocol) => String(protocol ?? '').toLowerCase().replace(/s$/, '').toUpperCase() // smtps -> SMTP, pop3s -> POP3
const implicit = (protocol) => /s$/i.test(String(protocol ?? '')) && String(protocol).toLowerCase() !== 'pop3' // smtps, imaps, pop3s

function store(y, acc, folder, m, now) {
  const msg = { ...m, uid: acc.uidNext++, date: m.date || now, flags: [...(m.flags ?? [])] }
  msg.messageId ||= `<${hex(`${msg.subject}${next(y)}`)}.${y.n}@${y.host}>`
  acc.folders[folder] ??= []
  push(acc.folders[folder], msg, MAX_FOLDER)
  return msg
}

// ---------- connections ----------

// Opens a connection the way JavaMail does: TCP, greeting, TLS, login. Returns { ok, acc, tls } or a failure.
function open(y, cfg, want, client, now) {
  const host = String(cfg.host ?? '').trim()
  const port = String(cfg.port ?? '').trim()
  const proto = baseProto(cfg.protocol)
  const wrap = (msg) => (want === 'SMTP' ? `Error while sending email: ${msg}` : `Error while connecting to the ${proto} server: ${msg}`)
  const noConnect = (why) => fail('EMAIL:CONNECTIVITY', wrap(want === 'SMTP' ? `Could not connect to SMTP host: ${host}, port: ${port}${why}` : `Couldn't connect to host, port: ${host}, ${port}; timeout -1${why}`))
  if (proto !== want) return fail('EMAIL:CONNECTIVITY', wrap(`the connection is ${cfg.protocol}, this operation needs ${want}`))
  if (host.toLowerCase() !== y.host) return fail('EMAIL:CONNECTIVITY', wrap(want === 'SMTP' ? `Unknown SMTP host: ${host}` : `Couldn't connect to host, port: ${host}, ${port}; timeout -1. java.net.UnknownHostException: ${host}`))
  const p = y.ports[port]
  if (!y.up || !p?.enabled) {
    if (y.up) logLine(y, now, want, client, '', `connect from ${client} to port ${port} refused: nothing listens on that port`, false)
    return noConnect('; nested exception is: java.net.ConnectException: Connection refused')
  }
  if (p.proto !== want) {
    logLine(y, now, p.proto, client, '', `${client} sent a ${want} command on port ${port}, where the server speaks ${p.proto}`, false)
    return noConnect(', response: -1')
  }
  const tlsFirst = implicit(cfg.protocol)
  if (p.tls === 'Implicit TLS' && !tlsFirst) {
    logLine(y, now, want, client, '', `connect from ${client} on port ${port}: no TLS handshake, the client waits for a greeting. Timed out.`, false)
    return noConnect(', response: -1. Read timed out')
  }
  if (p.tls === 'STARTTLS' && tlsFirst) {
    logLine(y, now, want, client, '', `connect from ${client} on port ${port}: the client sent a TLS handshake where the server sends a plain greeting`, false)
    return noConnect('; nested exception is: javax.net.ssl.SSLException: Unsupported or unrecognized SSL message')
  }
  const say = (dir, text, ok) => logLine(y, now, want, client, dir, text, ok)
  if (tlsFirst) say('', `TLS connection established on port ${port}: TLSv1.3 with cipher TLS_AES_256_GCM_SHA384`)
  if (want === 'SMTP') say('S', `220 ${y.host} ESMTP Postfix`), say('C', `EHLO ${client}`)
  else if (want === 'IMAP') say('S', '* OK [CAPABILITY IMAP4rev1 SASL-IR LOGIN-REFERRALS ID ENABLE IDLE LITERAL+ STARTTLS AUTH=PLAIN] Dovecot ready.')
  else say('S', '+OK Dovecot ready.')
  let tls = tlsFirst
  if (!tls && p.tls === 'STARTTLS' && cfg.tls) {
    say('C', want === 'POP3' ? 'STLS' : want === 'IMAP' ? 'a0 STARTTLS' : 'STARTTLS')
    say('S', want === 'SMTP' ? '220 2.0.0 Ready to start TLS' : want === 'IMAP' ? 'a0 OK Begin TLS negotiation now.' : '+OK Begin TLS negotiation now.')
    tls = true
  }
  if (want === 'SMTP') say('S', `250-${y.host}, 250-PIPELINING, 250-SIZE ${p.auth === false ? (y.maxInbound ?? y.maxSize) : y.maxSize}${!tls && p.tls === 'STARTTLS' ? ', 250-STARTTLS' : ''}${p.auth !== false && (tls || !p.tlsRequired) ? ', 250-AUTH PLAIN LOGIN' : ''}, 250-ENHANCEDSTATUSCODES, 250 8BITMIME`)
  const user = String(cfg.user ?? '').trim().toLowerCase()
  if (p.tlsRequired && !tls) {
    // Postfix with smtpd_tls_auth_only offers no AUTH before STARTTLS; Dovecot refuses a plain text login
    if (want === 'SMTP') return { ok: true, acc: null, user: '', tls, plainOnRequired: true, say }
    if (want === 'IMAP') {
      say('C', `a1 LOGIN ${user} ****`)
      say('S', 'a1 NO [PRIVACYREQUIRED] Plaintext authentication disallowed on non-secure (SSL/TLS) connections.', false)
      return fail('EMAIL:CONNECTIVITY', wrap('[PRIVACYREQUIRED] Plaintext authentication disallowed on non-secure (SSL/TLS) connections.'), 'NO [PRIVACYREQUIRED]')
    }
    say('C', `USER ${user}`)
    say('S', '-ERR [AUTH] Plaintext authentication disallowed on non-secure (SSL/TLS) connections.', false)
    return fail('EMAIL:CONNECTIVITY', wrap('-ERR [AUTH] Plaintext authentication disallowed on non-secure (SSL/TLS) connections.'), '-ERR [AUTH]')
  }
  if (want === 'SMTP' && !user) return { ok: true, acc: null, user: '', tls, say } // a plain relay client on port 25
  if (want === 'SMTP' && p.auth === false) {
    say('C', 'AUTH LOGIN')
    say('S', '503 5.5.1 Error: authentication not enabled', false)
    return fail('EMAIL:SEND', wrap('503 5.5.1 Error: authentication not enabled'), '503 5.5.1')
  }
  const acc = y.accounts[user]
  const good = passwordOk(acc, cfg.password)
  if (want === 'SMTP') {
    say('C', 'AUTH LOGIN')
    say('S', good ? '235 2.7.0 Authentication successful' : '535 5.7.8 Error: authentication failed: authentication failure', good)
    if (!good) {
      logLine(y, now, 'SMTP', client, '', `warning: ${client}: SASL LOGIN authentication failed for ${user || 'an empty user'}${acc?.appOnly ? ': this account accepts app passwords only' : ''}`, false)
      return fail('EMAIL:SEND', wrap(`535 5.7.8 Error: authentication failed: authentication failure${acc?.appOnly ? '. This account accepts app passwords only.' : ''}`), '535 5.7.8')
    }
  } else if (want === 'IMAP') {
    say('C', `a1 LOGIN ${user} ****`)
    say('S', good ? 'a1 OK Logged in' : 'a1 NO [AUTHENTICATIONFAILED] Authentication failed.', good)
    if (!good) return fail('EMAIL:CONNECTIVITY', wrap('[AUTHENTICATIONFAILED] Authentication failed.'), 'NO [AUTHENTICATIONFAILED]')
  } else {
    say('C', `USER ${user}`), say('S', '+OK'), say('C', 'PASS ****')
    say('S', good ? '+OK Logged in.' : '-ERR [AUTH] Authentication failed.', good)
    if (!good) return fail('EMAIL:CONNECTIVITY', wrap('-ERR [AUTH] Authentication failed.'), '-ERR [AUTH]')
  }
  return { ok: true, acc, user, tls, say }
}

// ---------- SMTP ----------

function deliver(y, to, msg, now, client) {
  const acc = y.accounts[addrOf(to)]
  if (!acc) return { ok: false, reply: `550 5.1.1 <${addrOf(to)}>: Recipient address rejected: User unknown in virtual mailbox table` }
  if (usedOf(acc) + msg.size > acc.quota) return { ok: false, reply: `552 5.2.2 <${addrOf(to)}>: Mailbox full: quota exceeded (mailbox for user is full)` }
  const m = store(y, acc, 'INBOX', { ...structuredClone(msg), flags: [] }, now)
  logLine(y, now, 'LMTP', client, '', `${m.messageId}: to=<${addrOf(to)}>, size=${m.size}, status=sent (250 2.0.0 Saved in INBOX)`)
  return { ok: true, msg: m }
}

// The SMTP dialogue of one send. `auth` is the connection config; `message` has from, to, cc, bcc, subject, text, html,
// attachments ({ name, contentType, size, content }).
function sendMail(y, cfg, message, now, client) {
  const c = open(y, cfg, 'SMTP', client, now)
  if (!c.ok) return c
  const { say } = c
  const from = addrOf(message.from)
  const msg = mailMsg({ ...message, date: now, attachments: (message.attachments ?? []).map((a) => ({ ...a, encoding: a.encoding ?? attachment(a.name, a.contentType, a.size).encoding })) })
  say('C', `MAIL FROM:<${from}> SIZE=${msg.size}`)
  if (c.plainOnRequired) {
    say('S', '530 5.7.0 Must issue a STARTTLS command first', false)
    return fail('EMAIL:SEND', 'Error while sending email: 530 5.7.0 Must issue a STARTTLS command first', '530 5.7.0')
  }
  if (c.acc && !y.domains.includes(domainOf(from))) {
    say('S', `553 5.7.1 <${from}>: Sender address rejected: not owned by user ${c.user}`, false)
    return fail('EMAIL:SEND', `Error while sending email: 553 5.7.1 <${from}>: Sender address rejected: not owned by user ${c.user}`, '553 5.7.1')
  }
  const limit = c.acc ? y.maxSize : (y.maxInbound ?? y.maxSize)
  if (msg.size > limit) {
    say('S', '552 5.3.4 Message size exceeds fixed limit', false)
    logLine(y, now, 'SMTP', client, '', `NOQUEUE: reject: MAIL from ${client}: 552 5.3.4 Message size exceeds fixed limit; from=<${from}> size=${msg.size}, limit ${limit}`, false)
    return fail('EMAIL:SEND', `Error while sending email: 552 5.3.4 Message size exceeds fixed limit (message ${msg.size} bytes, limit ${limit} bytes)`, '552 5.3.4')
  }
  say('S', '250 2.1.0 Ok')
  const rcpts = [...msg.to, ...msg.cc, ...[].concat(message.bcc ?? [])].map(addrOf).filter(Boolean)
  if (!rcpts.length) return fail('EMAIL:SEND', 'Error while sending email: No recipient addresses')
  const bad = []
  for (const r of rcpts) {
    say('C', `RCPT TO:<${r}>`)
    const local = y.domains.includes(domainOf(r))
    if (!local && !c.acc) {
      say('S', `554 5.7.1 <${r}>: Relay access denied`, false)
      bad.push(`554 5.7.1 <${r}>: Relay access denied`)
    } else if (local && !y.accounts[r]) {
      say('S', `550 5.1.1 <${r}>: Recipient address rejected: User unknown in virtual mailbox table`, false)
      bad.push(`550 5.1.1 <${r}>: Recipient address rejected: User unknown in virtual mailbox table`)
    } else if (local && usedOf(y.accounts[r]) + msg.size > y.accounts[r].quota) {
      say('S', `552 5.2.2 <${r}>: Mailbox full: quota exceeded`, false)
      bad.push(`552 5.2.2 <${r}>: Mailbox full: quota exceeded`)
    } else say('S', '250 2.1.5 Ok')
  }
  // JavaMail sends nothing when one address is refused (mail.smtp.sendpartial is false by default)
  if (bad.length) return fail('EMAIL:SEND', `Error while sending email: Invalid Addresses; nested exception is: ${bad[0]}`, bad[0].slice(0, 9))
  say('C', 'DATA'), say('S', '354 End data with <CR><LF>.<CR><LF>')
  const queueId = hex(`${from}${next(y)}`, 10).toUpperCase()
  msg.messageId = message.messageId ?? `<${hex(`${queueId}m`)}.${y.n}@${y.host}>`
  say('S', `250 2.0.0 Ok: queued as ${queueId}`)
  say('C', 'QUIT'), say('S', '221 2.0.0 Bye')
  logLine(y, now, 'SMTP', client, '', `${queueId}: from=<${from}>, size=${msg.size}, nrcpt=${rcpts.length}${c.tls ? ', TLS' : ', no TLS'}`)
  for (const r of rcpts) {
    if (y.domains.includes(domainOf(r))) deliver(y, r, msg, now, client)
    else {
      push(y.outbound, { t: now, queueId, from, to: r, subject: msg.subject, size: msg.size, attachments: msg.attachments.map(({ content, ...a }) => a), client }, MAX_OUT) // eslint-disable-line no-unused-vars
      logLine(y, now, 'SMTP', client, '', `${queueId}: to=<${r}>, relay=mx.${domainOf(r)}[192.0.2.40]:25, status=sent (250 2.0.0 Ok)`)
    }
  }
  return { ok: true, queueId, messageId: msg.messageId, size: msg.size, reply: `250 2.0.0 Ok: queued as ${queueId}` }
}

// ---------- IMAP and POP3 ----------

function folderOf(c, y, folder, now) {
  const name = String(folder ?? 'INBOX').trim() || 'INBOX'
  const pop = c.proto === 'POP3'
  if (pop && name.toUpperCase() !== 'INBOX') return fail('EMAIL:ACCESSING_FOLDER', `Error while opening folder ${name}: POP3 has one folder only, INBOX. Folders need IMAP.`)
  const key = name.toUpperCase() === 'INBOX' ? 'INBOX' : name
  if (!pop) c.say('C', `a2 SELECT ${key}`)
  if (!c.acc.folders[key]) {
    c.say('S', `a2 NO Mailbox doesn't exist: ${key}`, false)
    return fail('EMAIL:ACCESSING_FOLDER', `Error while opening folder ${key}: Mailbox doesn't exist: ${key}`, "NO Mailbox doesn't exist")
  }
  const list = c.acc.folders[key]
  if (pop) c.say('C', 'STAT'), c.say('S', `+OK ${list.length} ${list.reduce((n, m) => n + m.size, 0)}`)
  else c.say('S', `* ${list.length} EXISTS, * OK [UIDNEXT ${c.acc.uidNext}], a2 OK [READ-WRITE] Select completed.`)
  return { ok: true, key, list }
}
function session(y, cfg, client, now) {
  const proto = baseProto(cfg.protocol)
  const c = open(y, cfg, proto === 'POP3' ? 'POP3' : 'IMAP', client, now)
  return c.ok ? { ...c, proto: proto === 'POP3' ? 'POP3' : 'IMAP' } : c
}
const imapOnly = (c, what) => (c.proto === 'POP3' ? fail('EMAIL:ACCESSING_FOLDER', `Error while executing ${what}: POP3 keeps no flags and no folders. ${what} needs an IMAP connection.`) : null)
const byUid = (list, uid) => list.find((m) => m.uid === Number(uid))

function expungeList(c, list) {
  const gone = list.filter((m) => m.flags.includes('\\Deleted'))
  for (const m of gone) list.splice(list.indexOf(m), 1)
  if (c.proto === 'IMAP') c.say('C', 'a5 EXPUNGE'), c.say('S', `${gone.map((m) => `* ${m.uid} EXPUNGE`).join(', ') || 'nothing to expunge'}, a5 OK Expunge completed.`)
  return gone.length
}

// The client side of the mail server for one app: what the Email connector does on its behalf
function client(s, who) {
  const y = () => (s.mailServer ? fill(s.mailServer) : null)
  const none = (cfg, smtp) => fail('EMAIL:CONNECTIVITY', smtp ? `Error while sending email: Unknown SMTP host: ${cfg?.host}` : `Couldn't connect to host, port: ${cfg?.host}, ${cfg?.port}; timeout -1. java.net.UnknownHostException: ${cfg?.host}`)
  const now = () => s.clock ?? 0
  // runs fn on an open folder
  const inFolder = (cfg, folder, fn) => {
    const x = y()
    if (!x) return none(cfg)
    const c = session(x, cfg, who, now())
    if (!c.ok) return c
    const f = folderOf(c, x, folder, now())
    if (!f.ok) return f
    const r = fn(c, f, x)
    c.say('C', c.proto === 'POP3' ? 'QUIT' : 'a9 LOGOUT')
    return r
  }
  return {
    send: (cfg, message) => (y() ? sendMail(y(), cfg, message, now(), who) : none(cfg, true)),
    // the messages of a folder, without the content of the attachments
    list: (cfg, folder = 'INBOX', { unreadOnly = false } = {}) =>
      inFolder(cfg, folder, (c, f) => {
        const pick = f.list.filter((m) => !m.flags.includes('\\Deleted') && (!unreadOnly || c.proto === 'POP3' || !m.flags.includes('\\Seen')))
        c.say('C', c.proto === 'POP3' ? 'LIST' : `a3 UID SEARCH ${unreadOnly ? 'UNSEEN' : 'ALL'}`)
        c.say('S', c.proto === 'POP3' ? `+OK ${pick.length} messages` : `* SEARCH ${pick.map((m) => m.uid).join(' ')}, a3 OK Search completed.`)
        return { ok: true, messages: pick.map(summary) }
      }),
    // The On New Email source: one poll of the folder. IMAP: { unreadOnly, deleteAfterRetrieve, watermark }. With
    // unreadOnly (the imap-matcher seen EXCLUDE) a mail the flow never marks \Seen is read again on every poll.
    // watermark is the highest uid of the last poll: only newer mails come, and the result has the new watermark.
    // The lab fetches with BODY.PEEK[], so reading a mail sets no flag; only markSeen or a move does.
    // POP3 has no flags: every mail on the server comes on every poll unless deleteAfterRetrieve removes it.
    // Lab made: deleteAfterRetrieve removes a mail when it is retrieved, before the flow has finished with it.
    poll: (cfg, folder = 'INBOX', { unreadOnly = true, deleteAfterRetrieve = false, watermark = null, limit = 50 } = {}) =>
      inFolder(cfg, folder, (c, f) => {
        const pop = c.proto === 'POP3'
        const pick = f.list.filter((m) => !m.flags.includes('\\Deleted') && (pop || !unreadOnly || !m.flags.includes('\\Seen')) && (pop || watermark === null || m.uid > watermark)).slice(0, limit)
        c.say('C', pop ? 'UIDL' : `a3 UID SEARCH ${[unreadOnly && 'UNSEEN', watermark !== null && `UID ${watermark + 1}:*`].filter(Boolean).join(' ') || 'ALL'}`)
        c.say('S', pop ? `+OK ${pick.length} messages` : `* SEARCH ${pick.map((m) => m.uid).join(' ')}, a3 OK Search completed.`)
        if (pick.length) c.say('C', pop ? `RETR 1..${pick.length}` : `a4 UID FETCH ${pick.map((m) => m.uid).join(',')} (UID FLAGS RFC822.SIZE BODY.PEEK[])`)
        const out = pick.map(full)
        if (deleteAfterRetrieve && pick.length) {
          for (const m of pick) m.flags.includes('\\Deleted') || m.flags.push('\\Deleted')
          if (pop) c.say('C', `DELE 1..${pick.length}`), c.say('S', '+OK Marked to be deleted.')
          else c.say('C', `a6 UID STORE ${pick.map((m) => m.uid).join(',')} +FLAGS (\\Deleted)`), c.say('S', 'a6 OK Store completed.')
          expungeList(c, f.list)
        }
        const top = Math.max(watermark ?? 0, ...f.list.map((m) => m.uid), ...pick.map((m) => m.uid))
        return { ok: true, messages: out, watermark: pop ? null : top }
      }),
    markSeen: (cfg, folder, uid) => flag(cfg, folder, uid, '\\Seen', true),
    setFlag: (cfg, folder, uid, name, on = true) => flag(cfg, folder, uid, name, on),
    move: (cfg, folder, uid, to) =>
      inFolder(cfg, folder, (c, f) => {
        const no = imapOnly(c, 'move-to-folder')
        if (no) return no
        const m = byUid(f.list, uid)
        c.say('C', `a7 UID MOVE ${uid} ${to}`)
        if (!m) return c.say('S', 'a7 NO Message not found', false), fail('EMAIL:FETCHING_ATTRIBUTES', `Error while fetching email attributes: message ${uid} was not found in ${f.key}`)
        if (!c.acc.folders[to]) return c.say('S', `a7 NO [TRYCREATE] Mailbox doesn't exist: ${to}`, false), fail('EMAIL:ACCESSING_FOLDER', `Error while opening folder ${to}: [TRYCREATE] Mailbox doesn't exist: ${to}`, 'NO [TRYCREATE]')
        f.list.splice(f.list.indexOf(m), 1)
        const moved = store(y(), c.acc, to, m, m.date)
        c.say('S', `* OK [COPYUID ${moved.uid}], a7 OK Move completed.`)
        return { ok: true, uid: moved.uid }
      }),
    // email:delete: marks the mail \Deleted and, unless expunge is false, removes it
    delete: (cfg, folder, uid, { expunge = true } = {}) =>
      inFolder(cfg, folder, (c, f) => {
        const m = byUid(f.list, uid)
        if (!m) return fail('EMAIL:FETCHING_ATTRIBUTES', `Error while fetching email attributes: message ${uid} was not found in ${f.key}`)
        m.flags.includes('\\Deleted') || m.flags.push('\\Deleted')
        if (c.proto === 'POP3') c.say('C', `DELE ${uid}`), c.say('S', '+OK Marked to be deleted.'), expungeList(c, f.list)
        else {
          c.say('C', `a6 UID STORE ${uid} +FLAGS (\\Deleted)`), c.say('S', 'a6 OK Store completed.')
          if (expunge) expungeList(c, f.list)
        }
        return { ok: true }
      }),
    expunge: (cfg, folder) => inFolder(cfg, folder, (c, f) => imapOnly(c, 'expunge-folder') ?? { ok: true, removed: expungeList(c, f.list) }),
    getAttachments: (cfg, folder, uid) =>
      inFolder(cfg, folder, (c, f) => {
        const m = byUid(f.list, uid)
        c.say('C', `a4 UID FETCH ${uid} (BODYSTRUCTURE BODY.PEEK[2])`)
        if (!m) return c.say('S', 'a4 NO Message not found', false), fail('EMAIL:FETCHING_ATTRIBUTES', `Error while fetching email attributes: message ${uid} was not found in ${f.key}`)
        c.say('S', `* ${m.uid} FETCH (BODYSTRUCTURE (${m.attachments.map((a) => `"${a.contentType}" "${a.encoding}" ${encodedSize(a)}`).join(' ')})), a4 OK Fetch completed.`)
        return { ok: true, attachments: structuredClone(m.attachments) }
      }),
  }
  function flag(cfg, folder, uid, name, on) {
    return inFolder(cfg, folder, (c, f) => {
      const no = imapOnly(c, on && name === '\\Seen' ? 'mark-as-read' : 'store flags')
      if (no) return no
      const m = byUid(f.list, uid)
      c.say('C', `a6 UID STORE ${uid} ${on ? '+' : '-'}FLAGS (${name})`)
      if (!m) return c.say('S', 'a6 NO Message not found', false), fail('EMAIL:FETCHING_ATTRIBUTES', `Error while fetching email attributes: message ${uid} was not found in ${f.key}`)
      m.flags = on ? [...new Set([...m.flags, name])] : m.flags.filter((x) => x !== name)
      c.say('S', `* ${m.uid} FETCH (FLAGS (${m.flags.join(' ')})), a6 OK Store completed.`)
      return { ok: true }
    })
  }
}

// How an attachment comes out of a DataWeave read. 'binary' keeps the bytes. 'text' decodes them as UTF-8, as a
// transform with output text/plain or a set payload with mimeType text/plain does: every byte that is no valid UTF-8 becomes
// U+FFFD, which takes 3 bytes, so a PDF grows by about 80 percent and no reader can open it. Lab made: the content
// string is a sample of the file, the size field is the real size.
export function readAttachment(a, as = 'binary') {
  if (as !== 'text' || TEXT_TYPE.test(a.contentType)) return { ...a, damaged: false }
  return { ...a, contentType: 'text/plain; charset=UTF-8', encoding: 'quoted-printable', size: Math.round(a.size * 1.8), content: String(a.content ?? '').replace(/[^\x20-\x7e\n]/g, '\uFFFD'), damaged: true }
}
export const isDamaged = (a) => Boolean(a?.damaged) || (/\.pdf$/i.test(a?.name ?? '') && !/^application\/pdf/i.test(a?.contentType ?? ''))

// ---------- seed ----------

const PDF = (id) => `%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n1 0 obj << /Type /Catalog >> invoice ${id}\nstream \u0089\u00f1\u00a7\u00d2 endstream\n%%EOF`
export const samplePdf = (name, size) => attachment(name, 'application/pdf', size, PDF(name))

export function defaultMailServer(now = 0) {
  const y = newMailServer({
    accounts: {
      'orders@harbor.example': newAccount('Order desk', 'Orders-Desk-2611', { appPasswords: [{ name: 'order-mail-intake', value: 'ordr-mule-7c41' }] }),
      'invoices@harbor.example': newAccount('Supplier invoices', 'Invoices-2611', { appPasswords: [{ name: 'invoice-mail-intake', value: 'invc-mule-52d8' }], quota: 200 * MB }),
      'ap-team@harbor.example': newAccount('Accounts payable', 'Ap-Team-2611', { quota: 200 * MB }),
      'no-reply@harbor.example': newAccount('Harbor no reply', 'No-Reply-2611', { appOnly: true, appPasswords: [{ name: 'apps', value: 'nrpl-mule-0b93' }] }),
      'ops@harbor.example': newAccount('Operations', 'Ops-2611'),
    },
  })
  const put = (to, m, flags = []) => store(y, y.accounts[to], 'INBOX', mailMsg({ ...m, to, flags, date: m.date ?? now - 40 * MINUTE }), now)
  put('orders@harbor.example', { from: 'Harbor Bistro <buyer@harbor-bistro.example>', subject: 'Order PO-5101', text: 'PO: PO-5101\nItem: H-100\nQty: 12\nCustomer: Harbor Bistro' }, ['\\Seen'])
  put('orders@harbor.example', { from: 'Quay Deli <orders@quay-deli.example>', subject: 'Order PO-5102', text: 'PO: PO-5102\nItem: H-300\nQty: 4\nCustomer: Quay Deli', date: now - 10 * MINUTE })
  put('invoices@harbor.example', { from: 'Quayside Paper <billing@quayside-paper.example>', subject: 'Invoice INV-20931', text: 'Please find our invoice INV-20931 attached.', attachments: [samplePdf('INV-20931.pdf', 421888)] })
  put('ops@harbor.example', { from: 'Mail team <postmaster@harbor.example>', subject: 'Port 25 is for incoming mail only', text: 'Apps send on port 587 with STARTTLS or on 465 with SMTPS. Port 25 is for mail between servers.', date: now - 2 * HOUR }, ['\\Seen', '\\Flagged'])
  return y
}

// ---------- the ctx hook and the tick ----------

// The engine calls this for each run of an app with its draft state: calls change `s` in place.
export const mailboxCtx = (s, app) => client(s, app?.name ?? 'app')

// Mail from outside: a feed delivers one mail of its list every `every` minutes, in turn. `hours` [from, to] limits it to
// office hours. In subject, text and attachment names {n} is the running number of the feed.
const fillIn = (v, n) => (typeof v === 'string' ? v.replaceAll('{n}', String(n)) : v)
export function mailServerTick(s) {
  const y = s.mailServer
  if (!y) return s
  fill(y)
  if (!y.up) return s
  const now = s.clock ?? 0
  for (const f of y.feeds) {
    f.n ??= 1
    f.at ??= now
    if (now < f.at) continue
    f.at = now + (f.every ?? 5) * MINUTE
    const hour = Math.floor((now % DAY) / HOUR)
    if (f.hours && (hour < f.hours[0] || hour >= f.hours[1])) continue
    const t = f.mails[(f.n - 1) % f.mails.length]
    const n = f.n++
    const m = mailMsg({ ...t, from: fillIn(t.from, n), subject: fillIn(t.subject, n), text: fillIn(t.text, n), to: f.to, date: now, attachments: (t.attachments ?? []).map((a) => ({ ...a, name: fillIn(a.name, n), content: fillIn(a.content, n) })) })
    const from = addrOf(m.from)
    if (m.size > (y.maxInbound ?? y.maxSize)) {
      logLine(y, now, 'SMTP', `mx.${domainOf(from)}`, '', `NOQUEUE: reject: MAIL from mx.${domainOf(from)}: 552 5.3.4 Message size exceeds fixed limit; from=<${from}> to=<${f.to}> size=${m.size}`, false)
      continue
    }
    const r = deliver(y, f.to, m, now, `mx.${domainOf(from)}`)
    if (!r.ok) logLine(y, now, 'SMTP', `mx.${domainOf(from)}`, '', `NOQUEUE: reject: RCPT from mx.${domainOf(from)}: ${r.reply}; from=<${from}>`, false)
  }
  return s
}

// ---------- UI actions (pure: state in, new state out) ----------

const edit = (state, fn) => {
  const s = structuredClone(state)
  s.mailServer = fill(s.mailServer)
  fn(s, s.mailServer, s.clock ?? 0)
  return s
}
const WEB = 'Roundcube'
function webFolder(state, account, folder, fn) {
  return edit(state, (s, y, now) => {
    const acc = y.accounts[account]
    const list = acc?.folders[folder]
    if (list) fn(list, acc, y, now)
  })
}
// Roundcube marks a mail \Seen when it is opened
export const webOpen = (state, account, folder, uid) =>
  webFolder(state, account, folder, (list, acc, y, now) => {
    const m = byUid(list, uid)
    if (!m || m.flags.includes('\\Seen')) return
    m.flags.push('\\Seen')
    logLine(y, now, 'IMAP', WEB, 'C', `a4 UID FETCH ${uid} (BODY[]) as ${account}, which sets \\Seen`)
  })
export const webFlag = (state, account, folder, uid, name, on) =>
  webFolder(state, account, folder, (list, acc, y, now) => {
    const m = byUid(list, uid)
    if (!m) return
    m.flags = on ? [...new Set([...m.flags, name])] : m.flags.filter((x) => x !== name)
    logLine(y, now, 'IMAP', WEB, 'C', `a6 UID STORE ${uid} ${on ? '+' : '-'}FLAGS (${name}) in ${folder} of ${account}`)
  })
export const webMove = (state, account, folder, uid, to) =>
  webFolder(state, account, folder, (list, acc, y, now) => {
    const m = byUid(list, uid)
    if (!m || !acc.folders[to] || to === folder) return
    list.splice(list.indexOf(m), 1)
    const moved = store(y, acc, to, { ...m, flags: m.flags.filter((x) => x !== '\\Deleted') }, m.date)
    logLine(y, now, 'IMAP', WEB, 'C', `a7 UID MOVE ${uid} ${to} as ${account}: new uid ${moved.uid}`)
  })
// Delete in the webmail marks the mail \Deleted; Compact (expunge) removes it
export const webDelete = (state, account, folder, uid) => webFlag(state, account, folder, uid, '\\Deleted', true)
export const webExpunge = (state, account, folder) =>
  webFolder(state, account, folder, (list, acc, y, now) => {
    const n = list.filter((m) => m.flags.includes('\\Deleted')).length
    acc.folders[folder] = list.filter((m) => !m.flags.includes('\\Deleted'))
    logLine(y, now, 'IMAP', WEB, 'C', `a5 EXPUNGE in ${folder} of ${account}: ${n} removed`)
  })
export const webAddFolder = (state, account, name) =>
  edit(state, (s, y, now) => {
    const acc = y.accounts[account]
    const n = String(name ?? '').trim()
    if (!acc || !n || acc.folders[n] || /[%*"\\]/.test(n)) return
    acc.folders[n] = []
    logLine(y, now, 'IMAP', WEB, 'C', `a8 CREATE "${n}" as ${account}`)
  })
// Compose in the webmail: submission on 587 with STARTTLS as the account, and a copy in Sent
export function webSend(state, account, message) {
  let result = null
  const next = edit(state, (s, y, now) => {
    const acc = y.accounts[account]
    if (!acc) return void (result = fail('EMAIL:SEND', 'No such account'))
    const pass = acc.appPasswords[0]?.value ?? acc.password
    result = sendMail(y, { protocol: 'smtp', host: y.host, port: 587, tls: true, user: account, password: pass }, { ...message, from: message.from ?? `${acc.name} <${account}>` }, now, WEB)
    if (result.ok) store(y, acc, 'Sent', mailMsg({ ...message, from: `${acc.name} <${account}>`, date: now, flags: ['\\Seen'], messageId: result.messageId }), now)
  })
  return { state: next, result }
}
export const setMailServer = (state, patch) =>
  edit(state, (s, y, now) => {
    Object.assign(y, patch)
    logLine(y, now, 'ADMIN', 'you', '', `settings changed: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  })
export const setMailPort = (state, port, patch) =>
  edit(state, (s, y, now) => {
    if (!y.ports[port]) return
    Object.assign(y.ports[port], patch)
    logLine(y, now, 'ADMIN', 'you', '', `port ${port}: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  })
export const setMailAccount = (state, address, patch) =>
  edit(state, (s, y, now) => {
    if (!y.accounts[address]) return
    Object.assign(y.accounts[address], patch)
    logLine(y, now, 'ADMIN', 'you', '', `account ${address}: ${Object.keys(patch).join(', ')} changed`)
  })
// a new app password, shown once in the admin page. Lab made: the value is derived from a counter, so labs replay.
export const addAppPassword = (state, address, name) =>
  edit(state, (s, y, now) => {
    const acc = y.accounts[address]
    if (!acc || !String(name ?? '').trim()) return
    const h = hex(`${address}${name}${next(y)}`, 12)
    acc.appPasswords.push({ name: String(name).trim(), value: `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8)}` })
    logLine(y, now, 'ADMIN', 'you', '', `account ${address}: app password "${name}" created`)
  })
export const removeAppPassword = (state, address, name) =>
  edit(state, (s, y, now) => {
    const acc = y.accounts[address]
    if (!acc) return
    acc.appPasswords = acc.appPasswords.filter((a) => a.name !== name)
    logLine(y, now, 'ADMIN', 'you', '', `account ${address}: app password "${name}" revoked`)
  })
