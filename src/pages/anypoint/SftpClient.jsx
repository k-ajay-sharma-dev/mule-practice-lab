// A desktop SFTP and FTP client in the style of FileZilla, on the lab servers of platform-systems.js.
// It is a lab tool: the client part looks like a file transfer client, and the server part (users, rights, keys,
// passive ports, host key, stop and start, server log) is what an administrator of the server would see.
import { useEffect, useMemo, useRef, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  addServerUser, ASCII_EXT, clientDo, entriesOf, finishWrite, fingerprint, isBinary, knownHostsLine, lockServerUser, loginError, newUserKey, norm, parseError, pasvReply, PORTS, putFile, putLocal,
  regenerateHostKey, removeLocal, setServerSettings, setServerUser, setSystemUp, setUserKey, setUserPassword, systemsCtx, transfer, trustHostKey,
} from '../../lab/platform-systems.js'
import { Btn, Check, Copy, Input, Note, Radios, Select, Tabs } from './parts.jsx'

const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`)
const typeOf = (name, dir) => (dir ? 'File folder' : name.includes('.') ? `${name.split('.').pop().toUpperCase()} file` : 'File')
const up = (p) => (p === '/' ? '/' : norm(p.slice(0, p.lastIndexOf('/'))))
// a read that changes nothing: the client draws its lists from a copy of the systems
const peek = (state, host, auth, fn) => fn(systemsCtx({ clock: state.clock, systems: structuredClone(state.systems) }, { name: 'FileZilla', desktop: true }).files(host, auth))
const MODES = ['Default', 'Active', 'Passive']
const TYPES = ['Auto', 'ASCII', 'Binary']
// FileZilla's Default transfer mode is passive
const ftpOpts = (form) => ({ passive: form.mode !== 'Active', transferMode: { Auto: 'AUTO', ASCII: 'ASCII', Binary: 'BINARY' }[form.type] ?? 'AUTO' })
const keyFiles = (state) => Object.keys(state.systems.local.files).filter((n) => n.endsWith('.pem') || n.endsWith('.ppk'))
const endings = (text) => (/\r\n/.test(text) ? 'CR LF (Windows)' : /\n/.test(text) ? 'LF (Unix)' : 'none')

export default function SftpClient({ state, update }) {
  const servers = Object.values(state.systems?.servers ?? {})
  const [form, setForm] = useState(() => ({ host: servers[0]?.host ?? '', user: Object.keys(servers[0]?.users ?? {})[0] ?? '', password: '', key: '', port: String(servers[0]?.port ?? 22), protocol: servers[0]?.protocol ?? 'SFTP', mode: 'Default', type: 'Auto' }))
  const [session, setSession] = useState(null) // { host, auth, dir, protocol }
  const [msgs, setMsgs] = useState(['Status: Ready. Enter a host and a user, then select Quickconnect.'])
  const [pickLocal, setPickLocal] = useState(null)
  const [pickRemote, setPickRemote] = useState(null)
  const [bottom, setBottom] = useState('Successful transfers')
  const [slow, setSlow] = useState(false)
  const [moveTo, setMoveTo] = useState(null)
  const [folder, setFolder] = useState(null)
  const [newLocal, setNewLocal] = useState(null)
  const [siteManager, setSiteManager] = useState(false)
  const [prompt, setPrompt] = useState(null) // the host key dialog: { kind, host, port, pub, old, always }
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

  const isFtp = (protocol) => protocol !== 'SFTP'
  // the auth of the session with the transfer settings of now: FileZilla applies a new transfer type at once
  const authNow = () => (session && isFtp(session.protocol) ? { ...session.auth, ...ftpOpts(form) } : session?.auth)
  // what FileZilla logs around a data connection of FTP, and the answer when it fails
  const dataLines = (x, auth, command, path, result) => {
    if (!isFtp(x.protocol)) return []
    const a = auth.transferMode === 'ASCII' || (auth.transferMode === 'AUTO' && Boolean(result?.ascii))
    const lines = [`Command: TYPE ${a ? 'A' : 'I'}`, `Response: 200 Switching to ${a ? 'ASCII' : 'Binary'} mode.`]
    if (auth.passive === false) lines.push('Command: PORT 192,168,10,23,201,14', 'Response: 200 PORT command successful. Consider using PASV.')
    else lines.push('Command: PASV', `Response: ${pasvReply(x, x.passive?.from ?? 50000)}`)
    lines.push(`Command: ${command} ${path}`)
    if (result?.kind === 'data-timeout') return [...lines, 'Error: Connection timed out after 20 seconds of inactivity']
    if (result?.ok) lines.push(`Response: 150 ${command === 'LIST' ? 'Here comes the directory listing.' : 'Opening data connection.'}`, `Response: 226 ${command === 'LIST' ? 'Directory send OK.' : 'Transfer complete.'}`)
    return lines
  }

  const connect = (trust = null) => {
    const x = state.systems.servers[form.host]
    const ftp = isFtp(form.protocol)
    const auth = { user: form.user.trim(), port: Number(form.port), ...(form.password && { password: form.password }), ...(form.key && { key: form.key }), ...(ftp && ftpOpts(form)) }
    if (!trust) say(`Status: Connecting to ${form.host}:${form.port}...`)
    if (x && x.up && Number(form.port) === x.port && form.protocol !== x.protocol) {
      say(form.protocol === 'SFTP' ? `Error: Server sent an unexpected greeting: ${x.banner}` : `Response: ${x.banner}`, 'Error: The server does not speak this protocol. Could not connect to server')
      return
    }
    const e = loginError(state, form.host, auth)
    if (e?.kind === 'unknown-system') return say(`Error: Could not resolve ${form.host}: host not found`, 'Error: Could not connect to server')
    if (e?.kind === 'connection-refused') return say(ftp ? 'Error: Connection attempt failed with "ECONNREFUSED: Connection refused by server".' : 'Error: Network error: Connection refused', 'Error: Could not connect to server')
    // SSH: the client checks the host key against its cache before it sends the user
    if (!ftp && x.hostKey && !trust) {
      const known = state.systems.local.knownHosts?.[form.host]
      if (known !== x.hostKey.pub) {
        say(known ? 'Status: The host key does not match the cached key. Waiting for your decision...' : 'Status: The host key is unknown. Waiting for your decision...')
        setPrompt({ kind: known ? 'changed' : 'unknown', host: form.host, port: form.port, pub: x.hostKey.pub, type: x.hostKey.type, old: known ?? null, always: true })
        return
      }
    }
    let base = state
    if (trust?.store) {
      base = trustHostKey(state, form.host, trust.pub)
      say(`Status: Added the host key of ${form.host} to the cache`)
    }
    if (ftp) say('Status: Connection established, waiting for welcome message...', `Response: ${x.banner}`, `Command: USER ${auth.user}`, 'Response: 331 Password required', 'Command: PASS ****')
    else say(`Status: Using username "${auth.user}".`, auth.key ? `Status: Authenticating with public key "${auth.key}"` : 'Status: Authenticating with password')
    if (e) {
      update(() => clientDo(base, form.host, auth, (f) => f.list()).state)
      return say(ftp ? 'Response: 530 Login incorrect.' : 'Error: Authentication failed.', 'Error: Critical error: Could not connect to server')
    }
    const home = norm(x.users[auth.user].home ?? '/')
    if (ftp) say('Response: 230 Logged on')
    say(`Status: Connected to ${form.host}`, 'Status: Retrieving directory listing...')
    const r = clientDo(base, form.host, auth, (f) => f.list(home))
    update(() => r.state)
    say(...dataLines(x, auth, 'LIST', home, r.result), r.result.ok ? `Status: Directory listing of "${home}" successful` : r.result.kind === 'data-timeout' ? 'Error: Failed to retrieve directory listing' : `Error: ${r.result.error}`)
    setSession({ host: form.host, auth, dir: home, protocol: x.protocol })
    setPickRemote(null)
  }
  const answerPrompt = (ok) => {
    const p = prompt
    setPrompt(null)
    if (!ok) return say('Error: Host key not trusted. Could not connect to server')
    connect({ pub: p.pub, store: p.kind === 'changed' || p.always })
  }
  const disconnect = () => {
    say(`Status: Disconnected from ${session.host}`)
    setSession(null)
  }
  const open = (dir) => {
    say(`Status: Retrieving directory listing of "${dir}"...`)
    const auth = authNow()
    const r = clientDo(state, session.host, auth, (f) => f.list(dir))
    update(() => r.state)
    say(...dataLines(state.systems.servers[session.host], auth, 'LIST', dir, r.result))
    if (!r.result.ok) return say(`Error: ${r.result.error}`, r.result.kind === 'permission-denied' || r.result.kind === 'data-timeout' ? 'Error: Failed to retrieve directory listing' : 'Error: Could not connect to server')
    say(`Status: Directory listing of "${dir}" successful`)
    setSession({ ...session, dir })
    setPickRemote(null)
  }
  const act = (fn, okText) => {
    const r = clientDo(state, session.host, authNow(), fn)
    update(() => r.state)
    say(r.result.ok ? `Status: ${okText}` : `Error: ${r.result.error}`)
    return r.result.ok
  }

  const listing = session ? peek(state, session.host, authNow(), (f) => f.list(session.dir)) : null
  const remote = listing?.ok ? listing.files : []
  const local = Object.entries(state.systems.local.files).map(([name, f]) => ({ name, ...f }))
  const target = remote.find((f) => f.path === pickRemote)
  const localPicked = pickLocal ? state.systems.local.files[pickLocal] : null
  const remotePath = (name) => norm(`${session.dir}/${name}`)
  const sx = session ? state.systems.servers[session.host] : null
  const asciiFor = (auth, name) => auth.transferMode === 'ASCII' || (auth.transferMode === 'AUTO' && ASCII_EXT.includes(name.split('.').pop().toLowerCase()))

  const uploadNow = () => {
    const f = state.systems.local.files[pickLocal]
    const to = remotePath(pickLocal)
    const auth = authNow()
    say(`Status: Starting upload of ${state.systems.local.home}\\${pickLocal}`)
    const r = transfer(state, { direction: 'upload', host: session.host, auth, local: pickLocal, remote: to })
    let next = r.state
    if (!r.error && slow) next = putFile(next, session.host, to, f.content ?? '', { writing: true, owner: session.auth.user, size: f.size })
    update(() => next)
    say(...dataLines(sx, auth, 'STOR', to, { ...r.result, ascii: asciiFor(auth, pickLocal) }))
    if (r.error) say(r.result?.kind === 'permission-denied' ? `Error: ${to}: open for write: permission denied` : `Error: ${r.error}`, 'Error: File transfer failed')
    else say(slow ? `Status: Upload of ${to} is still running. Its size grows until you finish it.` : `Status: File transfer successful, transferred ${size(f.size)}${r.result.size !== f.size ? `. The server has ${size(r.result.size)}` : ''}`)
    setBottom(r.error ? 'Failed transfers' : 'Successful transfers')
  }
  const downloadNow = () => {
    const auth = authNow()
    say(`Status: Starting download of ${target.path}`)
    const r = transfer(state, { direction: 'download', host: session.host, auth, local: target.name, remote: target.path })
    update(() => r.state)
    say(...dataLines(sx, auth, 'RETR', target.path, { ...r.result, ascii: asciiFor(auth, target.name) }))
    if (r.error) say(r.result?.kind === 'permission-denied' ? `Error: ${target.path}: open for read: permission denied` : `Error: ${r.error}`, 'Error: File transfer failed')
    else say(`Status: File transfer successful, transferred ${size(r.result.size)}${r.result.size !== target.size ? ` (${size(target.size)} on the server)` : ''}${target.writing ? '. The file was still being written, so the copy is not complete.' : ''}`)
    setBottom(r.error ? 'Failed transfers' : 'Successful transfers')
  }

  const transfers = state.systems.transfers ?? []
  const appsHere = state.apps.filter((a) => Object.values({ ...a.props }).includes(host))
  const known = state.systems.local.knownHosts ?? {}

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
          <Select value={form.key} onChange={(v) => set({ key: v })} placeholder="None" options={keyFiles(state)} />
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
          <Btn aria-expanded={siteManager} onClick={() => setSiteManager(!siteManager)}>
            Site Manager
          </Btn>
        </div>
      </form>
      {siteManager && (
        <section className="sy-fz-sm" aria-label="Site Manager">
          <div>
            <b className="sy-sub">Transfer settings</b>
            <span className="pc-dim">For FTP and FTPS. SFTP has one connection and always copies bytes as they are.</span>
            <div className="sy-fz-sm-row">
              <span>Transfer mode</span>
              <Radios name="fz-mode" value={form.mode} onChange={(v) => set({ mode: v })} options={MODES.map((m) => [m, m, m === 'Default' ? 'Passive, the default of FileZilla' : m === 'Active' ? 'The server connects back to this computer' : 'This computer opens the data connection'])} />
            </div>
            <div className="sy-fz-sm-row">
              <span>Transfer type</span>
              <Radios name="fz-type" value={form.type} onChange={(v) => set({ type: v })} options={TYPES.map((m) => [m, m, m === 'Auto' ? 'ASCII for known text files such as .txt and .xml, Binary for the rest' : m === 'ASCII' ? 'Converts line endings' : 'Copies every byte'])} />
            </div>
          </div>
          <div>
            <b className="sy-sub">Trusted host keys</b>
            <span className="pc-dim">The keys of SFTP servers this computer trusts, like known_hosts.</span>
            <div className="sy-fz-table">
              <table>
                <thead>
                  <tr>
                    <th>Host</th>
                    <th>Fingerprint</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(known).map(([h, pub]) => (
                    <tr key={h}>
                      <td>{h}</td>
                      <td className="pc-mono">ssh-ed25519 {fingerprint(pub)}</td>
                      <td>
                        <Btn onClick={() => update((s) => trustHostKey(s, h, null))}>Remove</Btn>
                      </td>
                    </tr>
                  ))}
                  {Object.keys(known).length === 0 && (
                    <tr>
                      <td colSpan={3} className="pc-dim">
                        No trusted keys yet. The client asks the first time it meets a server.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
      {prompt && (
        <section className={`sy-fz-dlg${prompt.kind === 'changed' ? ' bad' : ''}`} role="alertdialog" aria-label={prompt.kind === 'changed' ? 'Host key mismatch' : 'Unknown host key'}>
          <b>{prompt.kind === 'changed' ? 'Warning: Potential security breach!' : 'Unknown host key'}</b>
          <p>
            {prompt.kind === 'changed'
              ? 'The host key of this server does not match the key the client has cached. Either the administrator changed the key, or someone is trying to intercept the connection.'
              : 'The host key of this server is not known. There is no guarantee that the server is the computer you think it is.'}
          </p>
          <dl>
            <dt>Host</dt>
            <dd className="pc-mono">
              {prompt.host}:{prompt.port}
            </dd>
            {prompt.old && (
              <>
                <dt>Cached fingerprint</dt>
                <dd className="pc-mono">ssh-ed25519 {fingerprint(prompt.old)}</dd>
              </>
            )}
            <dt>{prompt.old ? 'New fingerprint' : 'Fingerprint'}</dt>
            <dd className="pc-mono">
              {prompt.type} {fingerprint(prompt.pub)}
            </dd>
          </dl>
          <p className="pc-dim">Compare the fingerprint with one the owner of the server gave you through another channel before you trust it.</p>
          {prompt.kind === 'unknown' && (
            <Check checked={prompt.always} onChange={(v) => setPrompt({ ...prompt, always: v })}>
              Always trust this host, add this key to the cache
            </Check>
          )}
          <div className="sy-fz-go">
            <Btn kind="primary" onClick={() => answerPrompt(true)}>
              {prompt.kind === 'changed' ? 'Update the cached key and connect' : 'OK'}
            </Btn>
            <Btn onClick={() => answerPrompt(false)}>Cancel</Btn>
          </div>
        </section>
      )}
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
          {localPicked && !newLocal && <FileView name={pickLocal} f={localPicked} />}
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
              {target && !target.dir && <FileView name={target.name} f={target} />}
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
                  <th>Size</th>
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
                        {x.user ? `${x.user}@` : ''}
                        {x.host}
                        <br />
                        <small>{x.local}</small>
                      </td>
                      <td>{x.direction === 'upload' ? '→→' : '←←'}</td>
                      <td>{x.remote}</td>
                      <td>{x.size !== undefined ? size(x.size) : ''}</td>
                      <td>{x.error ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {bottom === 'Server' && server && <ServerAdmin key={server.host} state={state} update={update} server={server} />}
        {bottom === 'In the Mule app' && server && <MuleMap server={server} form={session ? { ...form, ...session.auth, host: session.host, dir: session.dir } : { ...form, dir: norm(server.users[form.user]?.home ?? '/') }} apps={appsHere} />}
      </section>
    </main>
  )
}

// What opening a file shows: the text and its line endings, or for a binary file its size and whether it opens
function FileView({ name, f }) {
  if (isBinary(name, f))
    return (
      <div className="sy-fz-view sy-fz-fileinfo">
        <span>
          {name}: binary file, {size(f.size)}.
        </span>{' '}
        {f.corrupt ? <span className="pc-bad">Opening it fails: {parseError(name, f)}</span> : <span className="pc-dim">It opens without errors.</span>}
      </div>
    )
  if (f.content === undefined) return null
  return (
    <>
      <div className="sy-fz-fileinfo pc-dim">Line endings: {endings(f.content)}</div>
      <pre className="pc-pre sy-fz-view">{f.content || '(empty)'}</pre>
    </>
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

const rightsText = (u) => {
  if (u.readOnly) return 'Read only'
  const r = u.readDirs ? `read ${u.readDirs.join(', ') || 'nothing'}` : 'read all'
  const w = u.writeDirs ? `write ${u.writeDirs.join(', ') || 'nothing'}` : 'write all'
  return `${r}; ${w}${u.home && u.home !== '/' ? '; locked to the home folder' : ''}`
}
// u is the user being edited, or null for a new one. A user without a home folder has the root, as the table shows.
const draftOf = (name, u = null) => ({
  name, isNew: !u, home: u ? (u.home ?? '/') : `/${name || 'new-user'}`, password: '', key: u?.key ?? '', readOnly: Boolean(u?.readOnly),
  readAll: !u?.readDirs, writeAll: !u?.writeDirs, read: u?.readDirs ?? [], write: u?.writeDirs ?? [],
})

function ServerAdmin({ state, update, server }) {
  const [draft, setDraft] = useState(null)
  const [passive, setPassive] = useState(() => ({ ...(server.passive ?? { from: 50000, to: 50100, open: true }) }))
  const ftp = server.protocol !== 'SFTP'
  const users = Object.entries(server.users)

  const save = () => {
    const d = draft
    const name = d.name.trim()
    const rights = { home: d.home, readOnly: d.readOnly || undefined, readDirs: d.readAll ? undefined : d.read, writeDirs: d.writeAll ? undefined : d.write }
    update((s) => {
      let n = s
      if (d.isNew) n = addServerUser(n, server.host, name, { home: d.home, ...(d.password && { password: d.password }), ...(d.key && { key: d.key }) })
      n = setServerUser(n, server.host, name, rights, { who: 'admin' })
      if (!d.isNew && d.password) n = setUserPassword(n, server.host, name, d.password)
      if (!d.isNew && d.key !== (server.users[name]?.key ?? '')) n = setUserKey(n, server.host, name, d.key)
      return n
    })
    setDraft(null)
  }
  const newKey = () => {
    const r = newUserKey(state, server.host, draft.name)
    if (!r.file) return
    update(() => r.state)
    setDraft({ ...draft, key: r.file })
  }
  // the folders a user can get rights on: the home folder and what is under it
  const folders = draft ? server.dirs.filter((p) => norm(draft.home) === '/' || p === norm(draft.home) || p.startsWith(`${norm(draft.home)}/`)).sort() : []
  const tick = (list, p, on) => (on ? [...new Set([...list, p])] : list.filter((x) => x !== p))

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

      {!ftp && server.hostKey && (
        <div className="sy-fz-set">
          <b className="sy-sub">Host key</b>
          <div className="pc-mono">
            {server.hostKey.type} {fingerprint(server.hostKey.pub)}
          </div>
          <div className="sy-fz-line">
            <code>{knownHostsLine(server.host, server)}</code>
            <Copy text={knownHostsLine(server.host, server)} />
          </div>
          <span className="pc-dim">The known_hosts line for clients and Mule apps. A rebuilt server gets a new key, and every client that pinned the old one refuses to connect.</span>
          <div>
            <Btn onClick={() => update((s) => regenerateHostKey(s, server.host))}>Rebuild the server (new host key)</Btn>
          </div>
        </div>
      )}
      {ftp && (
        <div className="sy-fz-set">
          <b className="sy-sub">Data connections</b>
          <div className="sy-fz-sm-row">
            <label>
              Passive ports from
              <Input value={passive.from} onChange={(v) => setPassive({ ...passive, from: v.replace(/\D/g, '') })} inputMode="numeric" />
            </label>
            <label>
              to
              <Input value={passive.to} onChange={(v) => setPassive({ ...passive, to: v.replace(/\D/g, '') })} inputMode="numeric" />
            </label>
            <Check checked={passive.open} onChange={(v) => setPassive({ ...passive, open: v })}>
              The firewall of the server lets these ports in
            </Check>
            <Btn disabled={String(passive.from).trim() === '' || String(passive.to).trim() === ''} onClick={() => update((s) => setServerSettings(s, server.host, { passive: { from: Number(passive.from), to: Number(passive.to), open: passive.open } }))}>Save</Btn>
          </div>
          <span className="pc-dim">
            Passive mode: the server answers PASV with a port from this range and the client connects to it. Active mode: the server connects back to the client
            {server.activeBlocked !== false ? ', which cannot reach CloudHub apps behind their NAT. Clients in the office and on the own servers of the company can take it.' : '.'}
          </span>
        </div>
      )}

      <div className="sy-fz-cmds sy-fz-flat">
        <b className="sy-sub">Users</b>
        <span className="pc-grow" />
        <Btn onClick={() => setDraft(draftOf(''))}>Add user</Btn>
      </div>
      <div className="sy-fz-table">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Logs in with</th>
              <th>Home folder</th>
              <th>Rights</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map(([name, u]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{[u.password !== undefined && 'Password', u.key && `Public key (matches ${u.key})`].filter(Boolean).join(' or ') || 'Nothing set'}</td>
                <td className="pc-mono">{u.home ?? '/'}</td>
                <td>{rightsText(u)}</td>
                <td>{u.locked ? <span className="sy-tag warn">Locked</span> : 'Active'}</td>
                <td className="sy-fz-acts">
                  <Btn onClick={() => setDraft(draftOf(name, u))}>Edit</Btn>
                  <Btn onClick={() => update((s) => lockServerUser(s, server.host, name, !u.locked))}>{u.locked ? 'Unlock' : 'Lock'}</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <div className="sy-fz-form sy-fz-user" aria-label={draft.isNew ? 'New user' : `Edit ${draft.name}`}>
          <b>{draft.isNew ? 'New user' : `Edit ${draft.name}`}</b>
          {draft.isNew && (
            <label>
              User name
              <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v.replace(/[^\w.-]/g, '') })} autoComplete="off" />
            </label>
          )}
          <label>
            Home folder
            <Input value={draft.home} onChange={(v) => setDraft({ ...draft, home: v })} />
          </label>
          <label>
            {draft.isNew ? 'Password' : 'New password (empty keeps the old one)'}
            <Input type="password" value={draft.password} onChange={(v) => setDraft({ ...draft, password: v })} autoComplete="new-password" />
          </label>
          {!ftp && (
            <div className="sy-fz-sm-row">
              <label>
                Public key from
                <Select value={draft.key} onChange={(v) => setDraft({ ...draft, key: v })} placeholder="No key" options={keyFiles(state)} />
              </label>
              {!draft.isNew && <Btn onClick={newKey}>Make a new key pair</Btn>}
            </div>
          )}
          <Check checked={draft.readOnly} onChange={(v) => setDraft({ ...draft, readOnly: v })}>
            Read only everywhere
          </Check>
          <div className="sy-fz-rights">
            <div>
              <span>Read</span>
              <Radios name="fz-read" value={draft.readAll ? 'all' : 'some'} onChange={(v) => setDraft({ ...draft, readAll: v === 'all' })} options={[['all', 'Everywhere in the home folder'], ['some', 'Only the folders ticked']]} />
            </div>
            <div>
              <span>Write</span>
              <Radios name="fz-write" value={draft.writeAll ? 'all' : 'some'} onChange={(v) => setDraft({ ...draft, writeAll: v === 'all' })} options={[['all', 'Everywhere in the home folder'], ['some', 'Only the folders ticked']]} />
            </div>
          </div>
          {(!draft.readAll || !draft.writeAll) && (
            <div className="sy-fz-table">
              <table>
                <thead>
                  <tr>
                    <th>Folder</th>
                    <th>Read</th>
                    <th>Write</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((p) => (
                    <tr key={p}>
                      <td className="pc-mono">{p}</td>
                      <td>
                        <input type="checkbox" aria-label={`Read ${p}`} disabled={draft.readAll} checked={draft.readAll || draft.read.includes(p)} onChange={(e) => setDraft({ ...draft, read: tick(draft.read, p, e.target.checked) })} />
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`Write ${p}`} disabled={draft.writeAll || draft.readOnly} checked={draft.writeAll || draft.write.includes(p)} onChange={(e) => setDraft({ ...draft, write: tick(draft.write, p, e.target.checked) })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="pc-dim">A ticked folder covers what is under it. A write right on a folder lets the user upload, rename, delete and make folders inside it.</span>
          <div>
            <Btn kind="primary" disabled={!draft.name.trim() || (draft.isNew && Boolean(server.users[draft.name.trim()]))} onClick={save}>
              Save
            </Btn>
            <Btn onClick={() => setDraft(null)}>Cancel</Btn>
          </div>
        </div>
      )}
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
  const ftp = server.protocol !== 'SFTP'
  const passive = form.mode !== 'Active'
  const mode = form.type === 'ASCII' ? 'ASCII' : 'BINARY'
  const auth = key ? `identityFile="\${sftp.identityFile}" passphrase="\${secure::sftp.passphrase}"` : `password="\${secure::${p}.password}"`
  const xml = `<${p}:config name="${server.protocol}_Config">
  <${p}:connection host="\${${p}.host}" port="${server.port}" username="\${${p}.user}"
      ${auth}
      workingDir="${form.dir}"${ftp ? `\n      passive="${passive}" transferMode="${mode}"` : '\n      knownHostsFile="known_hosts"'} />
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
    ...(ftp
      ? [
          ['Transfer mode', form.mode, `passive="${passive}". Keep it true from CloudHub: the server cannot connect back to the app`],
          ['Transfer type', form.type, `transferMode="${mode}". The connector has no Auto; BINARY copies every file as it is`],
        ]
      : [['Trusted host key', server.hostKey ? fingerprint(server.hostKey.pub) : '', 'knownHostsFile: a known_hosts file with the line of the Server tab. Without it the connector does not check the key']]),
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
