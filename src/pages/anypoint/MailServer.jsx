// The mail server of the lab: a webmail in the style of Roundcube on top, and the admin pages of the server
// (accounts, ports and limits, the protocol log) beside it. The tab "In the Mule app" maps the server to the Email
// connector configuration of each app that uses it. A lab tool: the admin view opens any mailbox without its password.
import { useEffect, useMemo, useState } from 'react'
import { mark, stamp, timeText } from '../../lab/platform.js'
import {
  accountError, addAppPassword, addMailAccount, DEFAULT_SIZE_LIMIT, defaultMailServer, encodedSize, isDamaged, mailboxCtx, MB, removeAppPassword, samplePdf, attachment, setMailAccount, setMailPort, setMailServer, SYSTEM_FOLDERS, unreadOf, usedOf,
  webAddFolder, webDelete, webExpunge, webFlag, webMove, webOpen, webSend,
} from '../../lab/platform-mailserver.js'
import { Btn, Check, Field, Input, Note, Select, Tabs } from './parts.jsx'

const TABS = ['Mail', 'Compose', 'Server log', 'Accounts', 'Settings', 'In the Mule app']
const size = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)
const has = (m, f) => m.flags.includes(f)
const folderOrder = (names) => [...SYSTEM_FOLDERS.filter((f) => names.includes(f)), ...names.filter((f) => !SYSTEM_FOLDERS.includes(f)).sort()]
const nameOf = (from) => String(from ?? '').replace(/<.*>/, '').trim() || String(from ?? '')
// sample files the compose page can attach
const SAMPLES = [
  samplePdf('INV-sample.pdf', 421888),
  samplePdf('delivery-scan.pdf', 8283750),
  attachment('orders.csv', 'text/csv', 2140, 'po,item,qty\nPO-9001,H-100,4\n'),
]

export default function MailServer({ state, update }) {
  const y = state.mailServer
  const [tab, setTab] = useState('Mail')
  const accounts = Object.keys(y?.accounts ?? {})
  const [account, setAccount] = useState(accounts[0] ?? '')
  const acc = y?.accounts?.[account]

  // a save from before the mail server was built holds a placeholder: seed the server of Harbor
  useEffect(() => {
    if (y && !y.host) update((s) => ({ ...s, mailServer: defaultMailServer(s.clock) }))
  }, [y, update])
  useEffect(() => {
    if (!account && accounts[0]) setAccount(accounts[0])
  }, [account, accounts])
  useEffect(() => {
    if (tab === 'Mail' && acc) update((s) => mark(s, `mail:${account}`))
    if (tab === 'Server log' && y) update((s) => mark(s, 'mail-log'))
  }, [tab, account, update]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y || !y.host)
    return (
      <main className="pc-main">
        <h2>Mail server</h2>
        <p className="pc-empty pc-boxed">This lab has no mail server.</p>
      </main>
    )

  return (
    <main className="pc-main ms-app">
      <header className="ms-head">
        <div className="ms-brand">
          <b>Harbor Webmail</b>
          <span>{y.host}</span>
          <span className={`ms-up ${y.up ? 'on' : 'off'}`}>{y.up ? 'Postfix and Dovecot running' : 'Server stopped'}</span>
        </div>
        <label className="ms-who">
          <span>Mailbox</span>
          <Select value={account} onChange={setAccount} options={accounts} aria-label="Mailbox" />
        </label>
      </header>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'Mail' && acc && <MailView state={state} update={update} account={account} acc={acc} />}
      {tab === 'Compose' && acc && <Compose state={state} update={update} account={account} acc={acc} done={() => setTab('Mail')} />}
      {tab === 'Server log' && <ServerLog y={y} />}
      {tab === 'Accounts' && <Accounts state={state} update={update} open={(a) => (setAccount(a), setTab('Mail'))} />}
      {tab === 'Settings' && <Settings state={state} update={update} />}
      {tab === 'In the Mule app' && <InMule state={state} update={update} />}
    </main>
  )
}

// ---------- the webmail ----------

function MailView({ state, update, account, acc }) {
  const [folder, setFolder] = useState('INBOX')
  const [pick, setPick] = useState(null)
  const [source, setSource] = useState(false)
  const [newFolder, setNewFolder] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const names = folderOrder(Object.keys(acc.folders))
  const here = acc.folders[folder] ? folder : 'INBOX'
  const list = useMemo(() => [...(acc.folders[here] ?? [])].sort((a, b) => b.date - a.date || b.uid - a.uid), [acc, here])
  const msg = list.find((m) => m.uid === pick)
  const used = usedOf(acc)

  useEffect(() => {
    setPick(null)
  }, [account, here])

  const open = (m) => {
    setPick(m.uid)
    setSource(false)
    if (!has(m, '\\Seen')) update((s) => webOpen(s, account, here, m.uid))
  }
  const flag = (name, on) => msg && update((s) => webFlag(s, account, here, msg.uid, name, on))

  return (
    <div className="ms-mail">
      <nav className="ms-folders" aria-label="Folders">
        <ul>
          {names.map((f) => {
            const n = unreadOf(acc.folders[f])
            return (
              <li key={f}>
                <button type="button" className={f === here ? 'on' : ''} onClick={() => setFolder(f)}>
                  <span>{f}</span>
                  {n > 0 && <b>{n}</b>}
                </button>
              </li>
            )
          })}
        </ul>
        <form className="ms-newfolder" onSubmit={(e) => (e.preventDefault(), update((s) => webAddFolder(s, account, newFolder)), setNewFolder(''))}>
          <Input value={newFolder} onChange={setNewFolder} placeholder="New folder" aria-label="New folder name" />
          <Btn type="submit" disabled={!newFolder.trim()}>
            Create
          </Btn>
        </form>
        <div className="ms-quota" title={`${used} of ${acc.quota} bytes`}>
          <span>
            Quota {size(used)} of {size(acc.quota)}
          </span>
          <i style={{ width: `${Math.min(100, (used / acc.quota) * 100)}%` }} className={used / acc.quota > 0.9 ? 'full' : ''} />
        </div>
      </nav>

      <section className="ms-list" aria-label={`Messages in ${here}`}>
        <div className="ms-toolbar">
          <Btn disabled={!msg} onClick={() => flag('\\Seen', !has(msg, '\\Seen'))}>
            {msg && has(msg, '\\Seen') ? 'Mark as unread' : 'Mark as read'}
          </Btn>
          <Btn disabled={!msg} onClick={() => flag('\\Flagged', !has(msg, '\\Flagged'))}>
            {msg && has(msg, '\\Flagged') ? 'Unflag' : 'Flag'}
          </Btn>
          <span className="ms-move">
            <Select value={moveTo} onChange={setMoveTo} placeholder="Move to..." options={names.filter((f) => f !== here)} aria-label="Move to folder" />
            <Btn disabled={!msg || !moveTo} onClick={() => (update((s) => webMove(s, account, here, msg.uid, moveTo)), setPick(null), setMoveTo(''))}>
              Move
            </Btn>
          </span>
          <Btn disabled={!msg} onClick={() => update((s) => webDelete(s, account, here, msg.uid))}>
            Delete
          </Btn>
          <Btn disabled={!list.some((m) => has(m, '\\Deleted'))} onClick={() => update((s) => webExpunge(s, account, here))} title="Expunge: remove the mails marked \Deleted">
            Compact
          </Btn>
        </div>
        <div className="ms-table">
          <table>
            <thead>
              <tr>
                <th scope="col" aria-label="Flags" />
                <th scope="col">From</th>
                <th scope="col">Subject</th>
                <th scope="col">Date</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.uid} className={`${pick === m.uid ? 'on' : ''}${has(m, '\\Seen') ? '' : ' unread'}${has(m, '\\Deleted') ? ' deleted' : ''}`} onClick={() => open(m)}>
                  <td className="ms-flags">
                    <span title={has(m, '\\Seen') ? 'Read' : 'Unread'} className={has(m, '\\Seen') ? 'dot' : 'dot new'} />
                    {has(m, '\\Flagged') && <span title="Flagged">★</span>}
                    {m.attachments.length > 0 && <span title="Has attachments">📎</span>}
                    {has(m, '\\Deleted') && <span title="Marked \Deleted">🗑</span>}
                  </td>
                  <td>
                    <button type="button" className="ms-open" onClick={(e) => (e.stopPropagation(), open(m))}>
                      {nameOf(m.from)}
                    </button>
                  </td>
                  <td>{m.subject || '(no subject)'}</td>
                  <td>{stamp(m.date).slice(5, 16)}</td>
                  <td>{size(m.size)}</td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={5} className="pc-empty">
                    The folder is empty.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Note>Opening a mail sets \Seen, as Roundcube does. An app that reads unread mail then skips it.</Note>
      </section>

      <article className="ms-view" aria-label="Message">
        {!msg && <p className="pc-empty">Select a mail to read it.</p>}
        {msg && (
          <>
            <h3>{msg.subject || '(no subject)'}</h3>
            <dl className="ms-headers">
              <dt>From</dt>
              <dd>{msg.from}</dd>
              <dt>To</dt>
              <dd>{msg.to.join(', ')}</dd>
              {msg.cc.length > 0 && (
                <>
                  <dt>Cc</dt>
                  <dd>{msg.cc.join(', ')}</dd>
                </>
              )}
              <dt>Date</dt>
              <dd>{stamp(msg.date)}</dd>
              <dt>Message-ID</dt>
              <dd>
                <code>{msg.messageId}</code>
              </dd>
              <dt>Flags</dt>
              <dd>{msg.flags.length ? msg.flags.join(' ') : 'none'}</dd>
              <dt>Size</dt>
              <dd>
                {size(msg.size)} ({msg.size} bytes, UID {msg.uid})
              </dd>
            </dl>
            {msg.attachments.length > 0 && (
              <ul className="ms-atts" aria-label="Attachments">
                {msg.attachments.map((a, i) => (
                  <li key={i} className={isDamaged(a) ? 'bad' : ''}>
                    <b>{a.name}</b>
                    <span>{a.contentType}</span>
                    <span>
                      {size(a.size)}, {a.encoding} {size(encodedSize(a))} on the wire
                    </span>
                    {isDamaged(a) && <em>Cannot be opened: the file is not a valid PDF</em>}
                  </li>
                ))}
              </ul>
            )}
            <div className="ms-viewbar">
              <Check checked={source} onChange={setSource}>
                Show source
              </Check>
            </div>
            {source ? <pre className="ms-source">{sourceOf(msg)}</pre> : <pre className="ms-body">{msg.text || stripTags(msg.html) || '(no text)'}</pre>}
          </>
        )}
      </article>
    </div>
  )
}
const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
// the raw message, as a mail client shows it. Lab made: the base64 lines are a short sample.
function sourceOf(m) {
  const boundary = `----=_Part_${m.uid}_harbor`
  const head = [`Message-ID: ${m.messageId}`, `Date: ${stamp(m.date)} +0000`, `From: ${m.from}`, `To: ${m.to.join(', ')}`, ...(m.cc.length ? [`Cc: ${m.cc.join(', ')}`] : []), `Subject: ${m.subject}`, 'MIME-Version: 1.0']
  if (!m.attachments.length) return [...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: quoted-printable', '', m.text].join('\n')
  const parts = m.attachments.map((a) =>
    [`--${boundary}`, `Content-Type: ${a.contentType}; name="${a.name}"`, `Content-Transfer-Encoding: ${a.encoding}`, `Content-Disposition: attachment; filename="${a.name}"`, '', a.encoding === 'base64' ? `${b64(a.content)}\n... ${encodedSize(a)} characters in all` : String(a.content ?? '').slice(0, 300)].join('\n'),
  )
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', m.text, ...parts, `--${boundary}--`].join('\n')
}
function b64(text) {
  try {
    const bytes = new TextEncoder().encode(String(text ?? ''))
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).match(/.{1,76}/g)?.join('\n') ?? ''
  } catch {
    return ''
  }
}

function Compose({ state, update, account, acc, done }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', text: '' })
  const [files, setFiles] = useState([])
  const [reply, setReply] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const split = (v) => v.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
  const send = () => {
    const { state: next, result } = webSend(state, account, { to: split(form.to), cc: split(form.cc), subject: form.subject, text: form.text, attachments: SAMPLES.filter((a) => files.includes(a.name)) })
    update(() => next)
    setReply(result)
    if (result?.ok) {
      setForm({ to: '', cc: '', subject: '', text: '' })
      setFiles([])
    }
  }
  return (
    <form className="ms-compose" onSubmit={(e) => (e.preventDefault(), send())}>
      <Field label="From">
        <Input value={`${acc.name} <${account}>`} onChange={() => {}} readOnly />
      </Field>
      <Field label="To" required hint="Separate addresses with a comma.">
        <Input value={form.to} onChange={(v) => set({ to: v })} autoComplete="off" />
      </Field>
      <Field label="Cc">
        <Input value={form.cc} onChange={(v) => set({ cc: v })} autoComplete="off" />
      </Field>
      <Field label="Subject">
        <Input value={form.subject} onChange={(v) => set({ subject: v })} />
      </Field>
      <Field label="Message" wide>
        <textarea className="pc-input ms-text" value={form.text} onChange={(e) => set({ text: e.target.value })} rows={7} />
      </Field>
      <fieldset className="ms-attach">
        <legend>Attach a sample file</legend>
        {SAMPLES.map((a) => (
          <Check key={a.name} checked={files.includes(a.name)} onChange={(on) => setFiles((f) => (on ? [...f, a.name] : f.filter((x) => x !== a.name)))}>
            {a.name}, {a.contentType}, {size(a.size)} ({size(encodedSize(a))} in {a.encoding})
          </Check>
        ))}
      </fieldset>
      <div className="ms-send">
        <Btn kind="primary" type="submit" disabled={!form.to.trim()}>
          Send
        </Btn>
        <Btn onClick={done}>Back to mail</Btn>
        <span className="pc-dim">The webmail sends on port 587 with STARTTLS as {account}.</span>
      </div>
      {reply && <p className={`ms-reply ${reply.ok ? 'ok' : 'bad'}`}>{reply.ok ? `Sent. ${reply.reply}` : `${reply.type}: ${reply.error}`}</p>}
    </form>
  )
}

// ---------- the admin pages ----------

function ServerLog({ y }) {
  const [who, setWho] = useState('')
  const [proto, setProto] = useState('')
  const [bad, setBad] = useState(false)
  const clients = [...new Set(y.log.map((l) => l.client))].sort()
  const rows = y.log.filter((l) => (!who || l.client === who) && (!proto || l.proto === proto) && (!bad || !l.ok)).slice(-200).reverse()
  return (
    <section className="ms-log" aria-label="Server log">
      <div className="ms-filter">
        <label>
          Client
          <Select value={who} onChange={setWho} placeholder="All" options={clients} />
        </label>
        <label>
          Protocol
          <Select value={proto} onChange={setProto} placeholder="All" options={['SMTP', 'IMAP', 'POP3', 'LMTP', 'ADMIN']} />
        </label>
        <Check checked={bad} onChange={setBad}>
          Refusals only
        </Check>
        <span className="pc-dim">C: is the client, S: the server. Newest first. The server keeps the last {y.log.length} lines.</span>
      </div>
      <div className="ms-logbox" tabIndex={0}>
        {rows.map((l, i) => (
          <div key={i} className={`ms-line${l.ok ? '' : ' bad'}${l.dir === 'C' ? ' c' : l.dir === 'S' ? ' s' : ''}`}>
            <span>{timeText(l.t)}</span>
            <span>{l.proto}</span>
            <span>{l.client}</span>
            <code>
              {l.dir ? `${l.dir}: ` : ''}
              {l.text}
            </code>
          </div>
        ))}
        {!rows.length && <p className="pc-empty">No lines yet.</p>}
      </div>
    </section>
  )
}

function NewAccount({ y, update }) {
  const [f, setF] = useState({ address: '', name: '', password: '' })
  const [error, setError] = useState('')
  const create = () => {
    const bad = accountError(y, f.address, f.password)
    setError(bad ?? '')
    if (bad) return
    update((s) => addMailAccount(s, f.address, f.name, f.password))
    setF({ address: '', name: '', password: '' })
  }
  return (
    <form className="ms-newaccount" onSubmit={(e) => (e.preventDefault(), create())} aria-label="New account">
      <h3>New account</h3>
      <Field label="Address" hint={`A local domain: ${y.domains.join(', ')}`}>
        <Input value={f.address} onChange={(address) => setF({ ...f, address })} placeholder="name@harbor.example" autoComplete="off" />
      </Field>
      <Field label="Display name">
        <Input value={f.name} onChange={(name) => setF({ ...f, name })} />
      </Field>
      <Field label="Password" hint="At least 10 characters. People sign in to the webmail with it.">
        <Input value={f.password} onChange={(password) => setF({ ...f, password })} type="password" autoComplete="new-password" />
      </Field>
      <Btn kind="primary" type="submit" disabled={!f.address.trim()}>
        Create account
      </Btn>
      {error && <p className="ms-reply bad">{error}</p>}
      <p className="pc-dim">A new mailbox has INBOX, Sent and Junk. Create other folders in the webmail, under the folder list.</p>
    </form>
  )
}

function Accounts({ state, update, open }) {
  const y = state.mailServer
  const [names, setNames] = useState({})
  return (
    <section className="ms-accounts" aria-label="Accounts">
      <NewAccount y={y} update={update} />
      <div className="pc-table-box">
        <table className="pc-table">
          <thead>
            <tr>
              <th scope="col">Address</th>
              <th scope="col">Used of quota</th>
              <th scope="col">Unread in INBOX</th>
              <th scope="col">Sign in</th>
              <th scope="col">App passwords</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(y.accounts).map(([address, a]) => (
              <tr key={address}>
                <td>
                  <button type="button" className="pc-link" onClick={() => open(address)}>
                    {address}
                  </button>
                  <small className="ms-sub">{a.name}</small>
                </td>
                <td>
                  {size(usedOf(a))} of
                  <Select
                    value={String(a.quota / MB)}
                    onChange={(v) => update((s) => setMailAccount(s, address, { quota: Number(v) * MB }))}
                    options={[...new Set(['10', '50', '200', '1024', String(a.quota / MB)])].map((v) => [v, `${v} MB`])}
                    aria-label={`Quota of ${address}`}
                  />
                </td>
                <td>{unreadOf(a.folders.INBOX)}</td>
                <td>
                  <Check checked={!a.appOnly} onChange={(on) => update((s) => setMailAccount(s, address, { appOnly: !on }))}>
                    Main password works
                  </Check>
                </td>
                <td>
                  <ul className="ms-apps">
                    {a.appPasswords.map((p) => (
                      <li key={p.name}>
                        <span>{p.name}</span>
                        <code>{p.value}</code>
                        <Btn onClick={() => update((s) => removeAppPassword(s, address, p.name))}>Revoke</Btn>
                      </li>
                    ))}
                  </ul>
                  <form className="ms-newapp" onSubmit={(e) => (e.preventDefault(), update((s) => addAppPassword(s, address, names[address])), setNames({ ...names, [address]: '' }))}>
                    <Input value={names[address]} onChange={(v) => setNames({ ...names, [address]: v })} placeholder="Name, such as an app" aria-label={`New app password for ${address}`} />
                    <Btn type="submit" disabled={!String(names[address] ?? '').trim()}>
                      Create
                    </Btn>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>An app password is a second password for one app. Revoke it and only that app stops. With Main password works off, the account takes app passwords only, and SMTP answers 535 5.7.8 to the main password.</Note>
    </section>
  )
}

function Settings({ state, update }) {
  const y = state.mailServer
  const [limit, setLimit] = useState(String((y.maxSize / MB).toFixed(2)))
  const [inbound, setInbound] = useState(String((y.maxInbound / MB).toFixed(0)))
  const save = () => update((s) => setMailServer(s, { maxSize: Math.round(Number(limit) * MB), maxInbound: Math.round(Number(inbound) * MB) }))
  const okNumber = (v) => Number(v) > 0 && Number(v) <= 200
  return (
    <section className="ms-settings" aria-label="Settings">
      <div className="ms-cards">
        <div>
          <h3>Server</h3>
          <dl className="ms-headers">
            <dt>Host</dt>
            <dd>{y.host}</dd>
            <dt>Local domains</dt>
            <dd>{y.domains.join(', ')}</dd>
            <dt>Status</dt>
            <dd>
              <Check checked={y.up} onChange={(on) => update((s) => setMailServer(s, { up: on }))}>
                Running
              </Check>
            </dd>
          </dl>
        </div>
        <form onSubmit={(e) => (e.preventDefault(), save())}>
          <h3>Message size</h3>
          <Field label="Limit for mail that apps and users send (MB)" hint={`message_size_limit, now ${y.maxSize} bytes. The server compares the encoded size, with base64.`}>
            <Input value={limit} onChange={setLimit} inputMode="decimal" />
          </Field>
          <Field label="Limit for mail from other servers on port 25 (MB)" hint="Lab made: a second limit for incoming mail.">
            <Input value={inbound} onChange={setInbound} inputMode="decimal" />
          </Field>
          <Btn kind="primary" type="submit" disabled={!okNumber(limit) || !okNumber(inbound)}>
            Save
          </Btn>
        </form>
      </div>
      <h3>Ports</h3>
      <div className="pc-table-box">
        <table className="pc-table">
          <thead>
            <tr>
              <th scope="col">Port</th>
              <th scope="col">Service</th>
              <th scope="col">TLS</th>
              <th scope="col">Open</th>
              <th scope="col">TLS required for login</th>
              <th scope="col">Login (AUTH)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(y.ports).map(([port, p]) => (
              <tr key={port}>
                <td>{port}</td>
                <td>
                  {p.proto}
                  <small className="ms-sub">{p.use}</small>
                </td>
                <td>{p.tls}</td>
                <td>
                  <Check checked={p.enabled} onChange={(on) => update((s) => setMailPort(s, port, { enabled: on }))}>
                    {p.enabled ? 'Open' : 'Closed'}
                  </Check>
                </td>
                <td>
                  {p.tls === 'STARTTLS' ? (
                    <Check checked={p.tlsRequired} onChange={(on) => update((s) => setMailPort(s, port, { tlsRequired: on }))}>
                      Required
                    </Check>
                  ) : (
                    'Always TLS'
                  )}
                </td>
                <td>
                  {p.proto === 'SMTP' ? (
                    <Check checked={p.auth !== false} onChange={(on) => update((s) => setMailPort(s, port, { auth: on }))}>
                      Offered
                    </Check>
                  ) : (
                    'Always'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>587 starts in plain text and moves to TLS with STARTTLS. 465, 993 and 995 speak TLS from the first byte. A client on the wrong kind of port gets no greeting or a TLS error before it can log in.</Note>
    </section>
  )
}

// ---------- the Email connector view ----------

const P = (k) => '${' + k + '}'
const SECURE = (k) => '${secure::' + k + '}'
const MAP = [
  ['SMTP connection, port 587', '<email:smtp-connection>', 'Plain start, then STARTTLS. Add the property mail.smtp.starttls.enable = true, or the server answers 530 5.7.0.'],
  ['SMTPS connection, port 465', '<email:smtps-connection>', 'TLS from the first byte. Needs a TLS context, or the default trust store of the JVM.'],
  ['IMAPS connection, port 993', '<email:imaps-connection>', 'TLS from the first byte. Folders and flags: mark as read, move to folder.'],
  ['IMAP connection, port 143', '<email:imap-connection>', 'Needs mail.imap.starttls.enable = true. A plain login gets [PRIVACYREQUIRED].'],
  ['POP3S connection, port 995', '<email:pop3s-connection>', 'One folder, INBOX, and no flags on the server.'],
  ['user and password', 'user, password', 'The mail address, and its password or an app password. A failed login is 535 5.7.8 on SMTP and [AUTHENTICATIONFAILED] on IMAP.'],
  ['Message size', 'no connector field', `The server limit is ${size(DEFAULT_SIZE_LIMIT)}. Base64 makes an attachment about 37 percent larger.`],
]
function configsOf(app, host) {
  const props = { ...app.props, ...app.secrets }
  return Object.keys(props)
    .filter((k) => k.endsWith('.host') && String(props[k]).trim().toLowerCase() === host)
    .map((k) => {
      const p = k.slice(0, -5)
      const get = (x) => props[`${p}.${x}`]
      return { prefix: p, protocol: String(get('protocol') ?? (p.includes('smtp') ? 'smtp' : 'imaps')).toLowerCase(), host: get('host'), port: get('port'), user: get('user'), password: get('password'), tls: String(get('starttls')).toLowerCase() === 'true' }
    })
}
function xmlOf(c, app) {
  const p = (x) => P(`${c.prefix}.${x}`)
  const base = c.protocol.startsWith('smtp') ? 'smtp' : c.protocol.startsWith('pop3') ? 'pop3' : 'imap'
  const conn = `${c.protocol}-connection`
  const attrs = `host="${p('host')}" port="${p('port')}" user="${p('user')}" password="${SECURE(`${c.prefix}.password`)}"`
  const tlsCtx = c.protocol.endsWith('s') && c.protocol !== 'pop3' ? ['    <tls:context>', '      <tls:trust-store path="truststore.jks" password="' + SECURE('truststore.password') + '" type="jks"/>', '    </tls:context>'] : []
  const starttls = !c.protocol.endsWith('s') || c.protocol === 'pop3' ? [`    <email:properties>`, `      <email:property key="mail.${base}.starttls.enable" value="${c.tls ? 'true' : 'false'}"/>`, '    </email:properties>'] : []
  const out = [`<email:${base}-config name="Email_${base.toUpperCase()}">`, `  <email:${conn} ${attrs}>`, ...starttls, ...tlsCtx, `  </email:${conn}>`, `</email:${base}-config>`]
  const props = { ...app.props }
  if (base !== 'smtp' && props['listener.deleteAfterRetrieve'] !== undefined)
    out.push(
      '',
      `<email:listener-imap config-ref="Email_IMAP" folder="${P('mail.folder')}" deleteAfterRetrieve="${P('listener.deleteAfterRetrieve')}">`,
      '  <scheduling-strategy><fixed-frequency frequency="1" timeUnit="MINUTES"/></scheduling-strategy>',
      '  <email:imap-matcher seen="EXCLUDE"/>',
      '</email:listener-imap>',
    )
  return out.join('\n')
}
function InMule({ state, update }) {
  const y = state.mailServer
  const [tests, setTests] = useState({})
  const apps = state.apps.filter((a) => configsOf(a, y.host).length)
  // Test connection, as in Studio: on a copy of the state, so the real server log does not change
  const test = (app, c) => {
    const s = { clock: state.clock, mailServer: structuredClone(y) }
    const mb = mailboxCtx(s, { name: `${app.name} (test)` })
    const r = c.protocol.startsWith('smtp') ? mb.send(c, { from: c.user, to: c.user, subject: 'Test connection', text: 'Test' }) : mb.list(c, 'INBOX')
    setTests((t) => ({ ...t, [`${app.name}|${c.prefix}`]: r.ok ? 'Test connection successful' : `${r.type}: ${r.error}` }))
    // a passed test is what a lab step can see; the test itself leaves the server untouched
    if (r.ok) update((s) => mark(s, `mail-test:${app.name}:${c.prefix}`))
  }
  return (
    <section className="ms-mule" aria-label="In the Mule app">
      <h3>From the server to the Email connector</h3>
      <div className="pc-table-box">
        <table className="pc-table">
          <thead>
            <tr>
              <th scope="col">On the server</th>
              <th scope="col">In the connector</th>
              <th scope="col">What to know</th>
            </tr>
          </thead>
          <tbody>
            {MAP.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>
                  <code>{b}</code>
                </td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Apps that use {y.host}</h3>
      {!apps.length && <p className="pc-empty pc-boxed">No app of this lab has a property with the host {y.host}.</p>}
      {apps.map((app) => (
        <div key={app.name} className="ms-muleapp">
          <h4>{app.name}</h4>
          {configsOf(app, y.host).map((c) => (
            <div key={c.prefix} className="ms-conf">
              <dl className="ms-headers">
                <dt>Connection</dt>
                <dd>{c.protocol}</dd>
                <dt>Port</dt>
                <dd>
                  {c.port}
                  {y.ports[String(c.port)] ? ` (${y.ports[String(c.port)].proto}, ${y.ports[String(c.port)].tls})` : ' (not a port of this server)'}
                </dd>
                <dt>User</dt>
                <dd>{c.user}</dd>
                {c.protocol === 'smtp' && (
                  <>
                    <dt>STARTTLS</dt>
                    <dd>{c.tls ? 'mail.smtp.starttls.enable = true' : 'not set'}</dd>
                  </>
                )}
              </dl>
              <pre className="ms-xml">{xmlOf(c, app)}</pre>
              <div className="ms-send">
                <Btn onClick={() => test(app, c)}>Test connection</Btn>
                {tests[`${app.name}|${c.prefix}`] && <span className={tests[`${app.name}|${c.prefix}`].startsWith('Test') ? 'ms-ok' : 'ms-bad'}>{tests[`${app.name}|${c.prefix}`]}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}
      <Note>The XML is a sketch built from the properties of the app. Port numbers are text in the properties, as they are in a real properties file.</Note>
    </section>
  )
}
