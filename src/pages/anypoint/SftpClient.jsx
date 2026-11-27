// A desktop SFTP and FTP client in the style of FileZilla, on the lab servers of platform-systems.js.
// It is a lab tool: the client part looks like a file transfer client, and the server part (users, stop and start,
// server log) is what an administrator of the server would see.
import { useEffect, useMemo, useRef, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import { clientDo, entriesOf, finishWrite, loginError, norm, PORTS, putFile, putLocal, removeLocal, setSystemUp, systemsCtx, transfer } from '../../lab/platform-systems.js'
import { Btn, Check, Input, Note, Select, Tabs } from './parts.jsx'

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)
const typeOf = (name, dir) => (dir ? 'File folder' : name.includes('.') ? `${name.split('.').pop().toUpperCase()} file` : 'File')
const up = (p) => (p === '/' ? '/' : norm(p.slice(0, p.lastIndexOf('/'))))
// a read that changes nothing: the client draws its lists from a copy of the systems
const peek = (state, host, auth, fn) => fn(systemsCtx({ clock: state.clock, systems: structuredClone(state.systems) }, { name: 'FileZilla' }).files(host, auth))

export default function SftpClient({ state, update }) {
  const servers = Object.values(state.systems?.servers ?? {})
  const [form, setForm] = useState(() => ({ host: servers[0]?.host ?? '', user: Object.keys(servers[0]?.users ?? {})[0] ?? '', password: '', key: '', port: String(servers[0]?.port ?? 22), protocol: servers[0]?.protocol ?? 'SFTP' }))
  const [session, setSession] = useState(null) // { host, auth, dir }
  const [msgs, setMsgs] = useState(['Status: Ready. Enter a host and a user, then select Quickconnect.'])
  const [pickLocal, setPickLocal] = useState(null)
  const [pickRemote, setPickRemote] = useState(null)
  const [bottom, setBottom] = useState('Successful transfers')
  const [slow, setSlow] = useState(false)
  const [moveTo, setMoveTo] = useState(null)
  const [folder, setFolder] = useState(null)
  const [newLocal, setNewLocal] = useState(null)
  const logBox = useRef(null)
  const host = session?.host ?? form.host
  const server = state.systems?.servers?.[host]

  useEffect(() => {
    if (server) update((s) => mark(s, `sftp:${server.host}`))
  }, [server?.host, update]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight
  }, [msgs])

  const say = (...lines) => setMsgs((m) => [...m, ...lines].slice(-200))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const pickHost = (h) => {
    const x = state.systems.servers[h]
    set({ host: h, ...(x && { port: String(x.port), protocol: x.protocol, user: Object.keys(x.users)[0] ?? '' }) })
  }

  if (!servers.length)
    return (
      <main className="pc-main">
        <h2>SFTP and FTP</h2>
        <p className="pc-empty pc-boxed">This lab has no file servers.</p>
      </main>
    )

  const connect = () => {
    const x = state.systems.servers[form.host]
    const auth = { user: form.user.trim(), port: Number(form.port), ...(form.password && { password: form.password }), ...(form.key && { key: form.key }) }
    const ftp = form.protocol !== 'SFTP'
    say(`Status: Connecting to ${form.host}:${form.port}...`)
    if (x && x.up && Number(form.port) === x.port && form.protocol !== x.protocol) {
      say(form.protocol === 'SFTP' ? `Error: Server sent an unexpected greeting: ${x.banner}` : `Response: ${x.banner}`, 'Error: The server does not speak this protocol. Could not connect to server')
      return
    }
    const e = loginError(state, form.host, auth)
    if (e?.kind === 'unknown-system') return say(`Error: Could not resolve ${form.host}: host not found`, 'Error: Could not connect to server')
    if (e?.kind === 'connection-refused') return say(ftp ? 'Error: Connection attempt failed with "ECONNREFUSED: Connection refused by server".' : 'Error: Network error: Connection refused', 'Error: Could not connect to server')
    if (ftp) say('Status: Connection established, waiting for welcome message...', `Response: ${x.banner}`, `Command: USER ${auth.user}`, 'Response: 331 Password required', 'Command: PASS ****')
    else say(`Status: Using username "${auth.user}".`, auth.key ? `Status: Authenticating with public key "${auth.key}"` : 'Status: Authenticating with password')
    if (e) {
      update((s) => clientDo(s, form.host, auth, (f) => f.list()).state)
      return say(ftp ? 'Response: 530 Login incorrect.' : 'Error: Authentication failed.', 'Error: Critical error: Could not connect to server')
    }
    const home = norm(x.users[auth.user].home ?? '/')
    if (ftp) say('Response: 230 Logged on')
    say(`Status: Connected to ${form.host}`, 'Status: Retrieving directory listing...', `Status: Directory listing of "${home}" successful`)
    update((s) => clientDo(s, form.host, auth, (f) => f.list(home)).state)
    setSession({ host: form.host, auth, dir: home, protocol: x.protocol })
    setPickRemote(null)
  }
  const disconnect = () => {
    say(`Status: Disconnected from ${session.host}`)
    setSession(null)
  }
  const open = (dir) => {
    say(`Status: Retrieving directory listing of "${dir}"...`)
    const r = clientDo(state, session.host, session.auth, (f) => f.list(dir))
    update(() => r.state)
    if (!r.result.ok) return say(`Error: ${r.result.error}`, r.result.kind === 'permission-denied' ? 'Error: Failed to retrieve directory listing' : 'Error: Could not connect to server')
    say(`Status: Directory listing of "${dir}" successful`)
    setSession({ ...session, dir })
    setPickRemote(null)
  }
  const act = (fn, okText) => {
    const r = clientDo(state, session.host, session.auth, fn)
    update(() => r.state)
    say(r.result.ok ? `Status: ${okText}` : `Error: ${r.result.error}`)
    return r.result.ok
  }

  const listing = session ? peek(state, session.host, session.auth, (f) => f.list(session.dir)) : null
  const remote = listing?.ok ? listing.files : []
  const local = Object.entries(state.systems.local.files).map(([name, f]) => ({ name, ...f }))
  const target = remote.find((f) => f.path === pickRemote)
  const remotePath = (name) => norm(`${session.dir}/${name}`)

  const uploadNow = () => {
    const f = state.systems.local.files[pickLocal]
    const to = remotePath(pickLocal)
    say(`Status: Starting upload of ${state.systems.local.home}\\${pickLocal}`)
    const r = transfer(state, { direction: 'upload', host: session.host, auth: session.auth, local: pickLocal, remote: to })
    let next = r.state
    if (!r.error && slow) next = putFile(next, session.host, to, f.content ?? '', { writing: true, owner: session.auth.user, size: f.size })
    update(() => next)
    say(r.error ? `Error: ${r.error}` : slow ? `Status: Upload of ${to} is still running. Its size grows until you finish it.` : `Status: File transfer successful, transferred ${size(f.size)}`)
    setBottom(r.error ? 'Failed transfers' : 'Successful transfers')
  }
  const downloadNow = () => {
    say(`Status: Starting download of ${target.path}`)
    const r = transfer(state, { direction: 'download', host: session.host, auth: session.auth, local: target.name, remote: target.path })
    update(() => r.state)
    say(r.error ? `Error: ${r.error}` : `Status: File transfer successful, transferred ${size(target.size)}${target.writing ? '. The file was still being written, so the copy is not complete.' : ''}`)
    setBottom(r.error ? 'Failed transfers' : 'Successful transfers')
  }

  const transfers = state.systems.transfers ?? []
  const appsHere = state.apps.filter((a) => Object.values({ ...a.props }).includes(host))

  return (
    <main className="pc-main sy-fz">
      <div className="sy-fz-head">
        <b>{session ? `${session.auth.user}@${session.host}` : 'Not connected'}</b>
        <span className="pc-dim">File transfer client. A lab tool in the style of FileZilla.</span>
      </div>
      <form className="sy-fz-quick" onSubmit={(e) => { e.preventDefault(); connect() }} aria-label="Quickconnect">
        <label>
          Protocol
          <Select value={form.protocol} onChange={(v) => set({ protocol: v, port: String(PORTS[v]) })} options={['SFTP', 'FTP', 'FTPS']} />
        </label>
        <label>
          Host
          <Select value={form.host} onChange={pickHost} options={servers.map((x) => x.host)} />
        </label>
        <label>
          Username
          <Input value={form.user} onChange={(v) => set({ user: v })} autoComplete="off" />
        </label>
        <label>
          Password
          <Input type="password" value={form.password} onChange={(v) => set({ password: v })} autoComplete="off" />
        </label>
        <label>
          Key file
          <Select value={form.key} onChange={(v) => set({ key: v })} placeholder="None" options={Object.keys(state.systems.local.files).filter((n) => n.endsWith('.pem') || n.endsWith('.ppk'))} />
        </label>
        <label className="sy-fz-port">
          Port
          <Input value={form.port} onChange={(v) => set({ port: v.replace(/\D/g, '') })} inputMode="numeric" />
        </label>
        <div className="sy-fz-go">
          <Btn kind="primary" type="submit">
            Quickconnect
          </Btn>
          {session && <Btn onClick={disconnect}>Disconnect</Btn>}
        </div>
      </form>
      <pre ref={logBox} className="sy-fz-log" aria-label="Message log" tabIndex={0}>
        {msgs.map((m, i) => (
          <span key={i} className={m.startsWith('Error') ? 'e' : m.startsWith('Command') ? 'c' : m.startsWith('Response') ? 'r' : ''}>
            {m}
            {'\n'}
          </span>
        ))}
      </pre>

      <div className="sy-fz-sites">
        <section className="sy-fz-site" aria-label="Local site">
          <div className="sy-fz-bar">
            <span>Local site:</span>
            <code>{state.systems.local.home}\</code>
          </div>
          <div className="sy-fz-table">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Filesize</th>
                  <th>Filetype</th>
                  <th>Last modified</th>
                </tr>
              </thead>
              <tbody>
                {local.map((f) => (
                  <tr key={f.name} className={pickLocal === f.name ? 'on' : ''} onClick={() => setPickLocal(f.name)}>
                    <td>
                      <button type="button" className="sy-fz-name" onClick={() => setPickLocal(f.name)}>
                        <span aria-hidden="true">{f.name.endsWith('.pem') ? '🔑' : '📄'}</span> {f.name}
                      </button>
                    </td>
                    <td>{size(f.size)}</td>
                    <td>{typeOf(f.name)}</td>
                    <td>{stamp(f.t)}</td>
                  </tr>
                ))}
                {local.length === 0 && (
                  <tr>
                    <td colSpan={4} className="pc-dim">
                      Empty folder
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="sy-fz-cmds">
            <Btn kind="primary" disabled={!session || !pickLocal} onClick={uploadNow}>
              Upload →
            </Btn>
            <Check checked={slow} onChange={setSlow}>
              Slow link: leave the upload running
            </Check>
            <Btn onClick={() => setNewLocal({ name: 'stock-2026-11-05.csv', content: 'sku,warehouse,available\nH-100,DUB-1,30\n' })}>New file</Btn>
            <Btn disabled={!pickLocal} onClick={() => { update((s) => removeLocal(s, pickLocal)); setPickLocal(null) }}>
              Delete
            </Btn>
          </div>
          {newLocal && (
            <div className="sy-fz-form">
              <label>
                Name
                <Input value={newLocal.name} onChange={(v) => setNewLocal({ ...newLocal, name: v })} />
              </label>
              <label>
                Content
                <textarea className="pc-input pc-mono" rows={3} value={newLocal.content} onChange={(e) => setNewLocal({ ...newLocal, content: e.target.value })} />
              </label>
              <div>
                <Btn kind="primary" disabled={!newLocal.name.trim()} onClick={() => { update((s) => putLocal(s, newLocal.name.trim(), newLocal.content)); setPickLocal(newLocal.name.trim()); setNewLocal(null) }}>
                  Save on this computer
                </Btn>
                <Btn onClick={() => setNewLocal(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </section>

        <section className="sy-fz-site" aria-label="Remote site">
          <div className="sy-fz-bar">
            <span>Remote site:</span>
            <code>{session ? session.dir : ''}</code>
          </div>
          {!session && <p className="sy-fz-empty">Not connected to any server</p>}
          {session && (
            <>
              <Tree state={state} session={session} onOpen={open} />
              <div className="sy-fz-table">
                <table>
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Filesize</th>
                      <th>Filetype</th>
                      <th>Last modified</th>
                      <th>Permissions</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {session.dir !== '/' && (
                      <tr onDoubleClick={() => open(up(session.dir))}>
                        <td colSpan={6}>
                          <button type="button" className="sy-fz-name" onClick={() => open(up(session.dir))}>
                            <span aria-hidden="true">📁</span> ..
                          </button>
                        </td>
                      </tr>
                    )}
                    {!listing.ok && (
                      <tr>
                        <td colSpan={6} className="pc-bad">
                          {listing.error}
                        </td>
                      </tr>
                    )}
                    {remote.map((f) => (
                      <tr key={f.path} className={pickRemote === f.path ? 'on' : ''} onClick={() => setPickRemote(f.path)} onDoubleClick={() => f.dir && open(f.path)}>
                        <td>
                          <button type="button" className="sy-fz-name" onClick={() => (f.dir ? open(f.path) : setPickRemote(f.path))}>
                            <span aria-hidden="true">{f.dir ? '📁' : '📄'}</span> {f.name}
                          </button>
                          {f.writing && <span className="sy-tag warn">being written</span>}
                        </td>
                        <td>{f.dir ? '' : size(f.size)}</td>
                        <td>{typeOf(f.name, f.dir)}</td>
                        <td>{f.dir ? '' : stamp(f.t)}</td>
                        <td className="pc-mono">{f.dir ? 'drwxr-xr-x' : (f.mode ?? '-rw-r--r--')}</td>
                        <td>{f.dir ? '' : f.owner}</td>
                      </tr>
                    ))}
                    {listing.ok && remote.length === 0 && (
                      <tr>
                        <td colSpan={6} className="pc-dim">
                          Empty directory listing
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="sy-fz-cmds">
                <Btn kind="primary" disabled={!target || target.dir} onClick={downloadNow}>
                  ← Download
                </Btn>
                <Btn disabled={!target || target.dir} onClick={() => act((f) => f.remove(target.path), `Deleted ${target.path}`) && setPickRemote(null)}>
                  Delete
                </Btn>
                <Btn disabled={!target || target.dir} onClick={() => setMoveTo(target.path)}>
                  Rename or move
                </Btn>
                <Btn onClick={() => setFolder(`${session.dir === '/' ? '' : session.dir}/new-folder`)}>Create directory</Btn>
                <Btn disabled={!target?.writing} title="Lab tool: the sender finishes writing the file" onClick={() => { update((s) => finishWrite(s, session.host, target.path)); say(`Status: The sender finished writing ${target.path}`) }}>
                  Finish the upload
                </Btn>
                <Btn onClick={() => open(session.dir)}>Refresh</Btn>
              </div>
              {target?.content !== undefined && !target.dir && <pre className="pc-pre sy-fz-view">{target.content || '(binary or empty)'}</pre>}
              {moveTo && (
                <div className="sy-fz-form">
                  <label>
                    New path or folder
                    <Input value={moveTo} onChange={setMoveTo} />
                  </label>
                  <div>
                    <Btn kind="primary" onClick={() => act((f) => f.move(target.path, moveTo), `Moved ${target.path} to ${moveTo}`) && (setMoveTo(null), setPickRemote(null))}>
                      Move
                    </Btn>
                    <Btn onClick={() => setMoveTo(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
              {folder && (
                <div className="sy-fz-form">
                  <label>
                    Directory name
                    <Input value={folder} onChange={setFolder} />
                  </label>
                  <div>
                    <Btn kind="primary" onClick={() => act((f) => f.mkdir(folder), `Created directory ${folder}`) && setFolder(null)}>
                      Create
                    </Btn>
                    <Btn onClick={() => setFolder(null)}>Cancel</Btn>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="sy-fz-bottom" aria-label="Transfer queue and server">
        <Tabs tabs={['Queued files', 'Failed transfers', 'Successful transfers', 'Server', 'In the Mule app']} value={bottom} onChange={setBottom} />
        {bottom === 'Queued files' && <p className="pc-dim">No files in the queue. A lab transfer ends at once.</p>}
        {(bottom === 'Failed transfers' || bottom === 'Successful transfers') && (
          <div className="sy-fz-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Server/Local file</th>
                  <th>Direction</th>
                  <th>Remote file</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {transfers
                  .filter((x) => x.ok === (bottom === 'Successful transfers'))
                  .slice()
                  .reverse()
                  .map((x) => (
                    <tr key={x.id}>
                      <td>{stamp(x.t)}</td>
                      <td>
                        {x.host}
                        <br />
                        <small>{x.local}</small>
                      </td>
                      <td>{x.direction === 'upload' ? '→→' : '←←'}</td>
                      <td>{x.remote}</td>
                      <td>{x.error ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {bottom === 'Server' && server && <ServerAdmin state={state} update={update} server={server} />}
        {bottom === 'In the Mule app' && server && <MuleMap server={server} form={session ? { ...form, ...session.auth, host: session.host, dir: session.dir } : { ...form, dir: norm(server.users[form.user]?.home ?? '/') }} apps={appsHere} />}
      </section>
    </main>
  )
}

// The folders the user may see, as a tree
function Tree({ state, session, onOpen }) {
  const x = state.systems.servers[session.host]
  const home = norm(x.users[session.auth.user]?.home ?? '/')
  const dirs = useMemo(() => {
    const all = new Set([home])
    const walk = (d) => entriesOf(x.files, x.dirs, d, norm).filter((f) => f.dir).forEach((f) => (all.add(f.path), walk(f.path)))
    walk(home)
    return [...all].sort()
  }, [x, home])
  return (
    <ul className="sy-fz-tree" aria-label="Remote folders">
      {dirs.map((d) => (
        <li key={d} style={{ paddingLeft: 8 + 14 * (d === '/' ? 0 : d.split('/').length - 1) }}>
          <button type="button" className={d === session.dir ? 'on' : ''} onClick={() => onOpen(d)}>
            <span aria-hidden="true">{d === session.dir ? '📂' : '📁'}</span> {d === '/' ? '/' : d.split('/').pop()}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ServerAdmin({ state, update, server }) {
  return (
    <div className="sy-fz-admin">
      <div className="sy-fz-admin-head">
        <span className={`sy-dot ${server.up ? 'up' : 'down'}`} />
        <b>{server.host}</b>
        <span>
          {server.protocol} on port {server.port}, {server.ip}, {server.up ? 'running' : 'stopped'}
        </span>
        <span className="pc-grow" />
        <Btn onClick={() => update((s) => setSystemUp(s, 'server', server.host, !server.up))}>{server.up ? 'Stop the server' : 'Start the server'}</Btn>
      </div>
      <p className="pc-dim">What the administrator of the server sees. A lab tool, not part of the client.</p>
      <div className="sy-fz-table">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Logs in with</th>
              <th>Home folder</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(server.users).map(([name, u]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{[u.password !== undefined && 'Password', u.key && `Public key (matches ${u.key})`].filter(Boolean).join(' or ')}</td>
                <td className="pc-mono">{u.home ?? '/'}</td>
                <td>{u.readOnly ? 'Read only' : u.home && u.home !== '/' ? 'Read and write, locked to the home folder' : 'Read and write'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <b className="sy-sub">Server log</b>
      <pre className="sy-fz-slog" tabIndex={0}>
        {server.log.length === 0 ? 'No entries yet.' : server.log.slice().reverse().map((l) => `${stamp(l.t)}  ${l.ok ? 'OK  ' : 'FAIL'}  [${l.who}] ${l.text}`).join('\n')}
      </pre>
    </div>
  )
}

// How the fields of the client match the connection of the Mule connector
function MuleMap({ server, form, apps }) {
  const p = server.protocol.toLowerCase()
  const key = Boolean(form.key)
  const auth = key ? `identityFile="\${sftp.identityFile}" passphrase="\${secure::sftp.passphrase}"` : `password="\${secure::${p}.password}"`
  const xml = `<${p}:config name="${server.protocol}_Config">
  <${p}:connection host="\${${p}.host}" port="${server.port}" username="\${${p}.user}"
      ${auth}
      workingDir="${form.dir}"${p === 'ftp' ? '\n      passive="true"' : ''} />
</${p}:config>

<${p}:matcher name="csvFiles" filenamePattern="*.csv" />
<${p}:listener config-ref="${server.protocol}_Config" directory="in" matcher="csvFiles"
    moveToDirectory="archive" timeBetweenSizeCheck="2" timeBetweenSizeCheckUnit="SECONDS">
  <scheduling-strategy><fixed-frequency frequency="60000" /></scheduling-strategy>
</${p}:listener>`
  const rows = [
    ['Protocol', server.protocol, `the ${server.protocol} connector (${p}:config)`],
    ['Host', server.host, 'host'],
    ['Port', String(server.port), 'port'],
    ['Username', form.user || '(empty)', 'username'],
    [key ? 'Key file' : 'Password', key ? form.key : form.password ? '(hidden)' : '(empty)', key ? 'identityFile, a PEM private key, with passphrase if it has one' : 'password, kept as a secure property'],
    ['Remote site after login', form.dir, 'workingDir: relative paths start here'],
  ]
  return (
    <div className="sy-fz-map">
      <div className="sy-fz-table">
        <table>
          <thead>
            <tr>
              <th>In the client</th>
              <th>Value</th>
              <th>In the Mule connection</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td className="pc-mono">{b}</td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="pc-pre">{xml}</pre>
      <Note>
        timeBetweenSizeCheck makes the connector read the size twice and skip a file whose size changed, so it does not pick up a file that is still being written.{' '}
        {server.protocol === 'FTP' ? 'FTP sends the password in clear text. FTPS adds TLS.' : server.protocol === 'SFTP' ? 'SFTP runs over SSH, so the login and the data are encrypted.' : ''}
      </Note>
      <p className="pc-dim">Apps of this console that use {server.host}: {apps.length ? apps.map((a) => `${a.name} (${a.env})`).join(', ') : 'none'}.</p>
    </div>
  )
}
