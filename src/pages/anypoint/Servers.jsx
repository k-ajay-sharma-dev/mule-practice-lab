import { useEffect, useRef, useState } from 'react'
import {
  addToServerSet, CONTROL_PLANE, createServerSet, deleteServerSet, hybridServers, hybridTargets, liveNodes, mark, nodesOf, REG_TOKENS, removeFromServerSet, removeServer, serverNamed, serverStatus, serversOf, setOutbound,
} from '../../lab/platform.js'
import { BUILDS, fileText, HELP, listing, run } from '../../lab/platform-server.js'
import { Btn, Check, Copy, Dot, Errors, Field, Input, Link, Modal, Note, Select, Table } from './parts.jsx'

const appsOn = (state, server) => Object.keys(server.apps)
const typeOf = (t) => (t === 'Server Group' ? 'Server group' : t)

// ---------- Runtime Manager, Servers ----------

export function ServersPage({ state, update, go }) {
  const [adding, setAdding] = useState(false)
  const [making, setMaking] = useState(null)
  const [joining, setJoining] = useState(null)
  const [errors, setErrors] = useState([])
  const targets = hybridTargets(state)
  const used = (name) => state.apps.some((a) => a.env === state.env && a.target === name && a.targetType)
  const leave = (set, name) => {
    const r = removeFromServerSet(state, set, name)
    setErrors(r.errors)
    if (!r.errors.length) update(() => r.state)
  }
  const row = (server, inside) => {
    const status = serverStatus(server)
    return (
      <tr key={`${inside ?? ''}-${server.agent.name}`}>
        <td className={inside ? 'pc-indent' : undefined}>{server.agent.name}</td>
        <td>{inside ? 'Server in the set' : 'Server'}</td>
        <td>
          <Dot status={status} />
        </td>
        <td>{server.runtime}</td>
        <td>{server.agentVersion}</td>
        <td>{appsOn(state, server).join(', ') || 'None'}</td>
        <td>
          {inside ? (
            <Link onClick={() => leave(inside, server.agent.name)}>Remove from {inside}</Link>
          ) : (
            <Link disabled={used(server.agent.name)} title={used(server.agent.name) ? 'Delete its applications first' : undefined} onClick={() => update((s) => removeServer(s, server.agent.name))}>
              Remove
            </Link>
          )}
        </td>
      </tr>
    )
  }
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => setAdding(true)}>
          Add Server
        </Btn>
        <Btn onClick={() => setMaking('Server Group')}>Create Group</Btn>
        <Btn onClick={() => setMaking('Cluster')}>Create Cluster</Btn>
        <span className="pc-grow" />
        <Btn onClick={() => go({ product: 'Data center' })}>Open the servers in the data center</Btn>
      </div>
      <p className="pc-dim">Servers run the Mule runtime in your own data center. Anypoint is the control plane: the Runtime Manager agent on each server opens an outbound connection to it, and you deploy from here.</p>
      <Table
        heads={['Name', 'Type', 'Status', 'Runtime', 'Agent', 'Applications', '']}
        empty={`No servers in ${state.env}. Add Server shows the command that registers one.`}
        rows={targets.flatMap((t) => {
          if (t.type === 'Server') return [row(serversOf(state, t)[0])]
          const servers = serversOf(state, t)
          const states = servers.map(serverStatus)
          return [
            <tr key={t.name} className="pc-group-row">
              <td>
                <b>{t.name}</b>
              </td>
              <td>{typeOf(t.type)}</td>
              <td>
                <Dot status={states.length && states.every((x) => x === 'Running') ? 'Running' : states.some((x) => x === 'Running') ? 'Partly running' : 'Disconnected'} />
              </td>
              <td>{[...new Set(servers.map((x) => x.runtime))].join(', ')}</td>
              <td>{[...new Set(servers.map((x) => x.agentVersion))].join(', ')}</td>
              <td>{state.apps.filter((a) => a.env === state.env && a.target === t.name && a.targetType === t.type).map((a) => a.name).join(', ') || 'None'}</td>
              <td className="pc-actions">
                <Link onClick={() => { setErrors([]); setJoining(t) }}>Add server</Link>
                <Link disabled={used(t.name)} title={used(t.name) ? 'Delete its applications first' : undefined} onClick={() => update((s) => deleteServerSet(s, t.name))}>
                  Delete
                </Link>
              </td>
            </tr>,
            ...servers.map((x) => row(x, t.name)),
          ]
        })}
      />
      <Errors list={errors} />
      <p className="pc-dim">A server that joins a group or a cluster gets the applications of the set. A server that leaves it has them undeployed. A cluster keeps at least two servers.</p>
      {adding && <AddServer env={state.env} onClose={() => setAdding(false)} go={go} />}
      {joining && <JoinSet set={joining} state={state} onClose={() => setJoining(null)} onSave={(next) => { update(() => next); setJoining(null) }} />}
      {making && <MakeSet type={making} state={state} onClose={() => setMaking(null)} onSave={(next) => { update(() => next); setMaking(null) }} />}
    </>
  )
}

function AddServer({ env, onClose, go }) {
  const command = `.\\amc_setup.bat -H ${REG_TOKENS[env]} server-name`
  return (
    <Modal title="Add Server" onClose={onClose} foot={<Btn onClick={onClose}>Close</Btn>}>
      <ol className="pc-steps">
        <li>Install the Mule runtime on the server. In the lab it is already in C:\mule.</li>
        <li>
          In PowerShell on the server, go to <code>%MULE_HOME%\bin</code> and run this command. Change server-name to the name Runtime Manager shows.
          <div className="pc-cmd">
            <code>{command}</code>
            <Copy text={command} />
          </div>
        </li>
        <li>The registration token belongs to {env}. A server registered with it appears in {env} only.</li>
        <li>If the runtime was running, restart it. The agent then connects out to the control plane on port 443.</li>
      </ol>
      <Note>The server needs outbound HTTPS on port 443 to {CONTROL_PLANE.replace(/^wss:\/\//, '').replace(/:443\/mule$/, '')}. Nothing has to reach the server from outside.</Note>
      <Link onClick={() => { onClose(); go({ product: 'Data center' }) }}>Open the servers in the data center</Link>
    </Modal>
  )
}

function MakeSet({ type, state, onClose, onSave }) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState([])
  const [errors, setErrors] = useState([])
  const free = hybridTargets(state).filter((t) => t.type === 'Server')
  const save = () => {
    const r = createServerSet(state, { name: name.trim(), servers: picked, type })
    setErrors(r.errors)
    if (!r.errors.length) onSave(r.state)
  }
  return (
    <Modal
      title={type === 'Cluster' ? 'Create Cluster' : 'Create Server Group'}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={save}>
            Create
          </Btn>
        </>
      }
    >
      <Field label="Name" required>
        <Input value={name} onChange={setName} />
      </Field>
      <span className="pc-label">Servers</span>
      {free.length === 0 && <p className="pc-dim">No free servers. A server in a group or a cluster cannot join another one.</p>}
      {free.map((t) => {
        const x = serverNamed(state, state.env, t.name)
        return (
          <Check key={t.name} checked={picked.includes(t.name)} onChange={(on) => setPicked(on ? [...picked, t.name] : picked.filter((n) => n !== t.name))}>
            {t.name}, Mule {x.runtime}, agent {x.agentVersion}, Java {x.java}, {serverStatus(x)}
            {Object.keys(x.apps).length > 0 && `, has ${Object.keys(x.apps).join(', ')}`}
          </Check>
        )
      })}
      <p className="pc-dim">
        {type === 'Cluster'
          ? 'Nodes of a cluster share object store and VM queue data, and only the primary node runs the schedulers. The lab picks the first running node as primary.'
          : 'A server group lets you deploy an application to every server at once. Each server runs its own copy, with its own schedulers.'}
      </p>
      <Errors list={errors} />
    </Modal>
  )
}

// Add a server to a group or a cluster that exists
function JoinSet({ set, state, onClose, onSave }) {
  const free = hybridTargets(state).filter((t) => t.type === 'Server')
  const [picked, setPicked] = useState(free[0]?.name ?? '')
  const [errors, setErrors] = useState([])
  const first = serversOf(state, set)[0]
  const apps = state.apps.filter((a) => a.env === state.env && a.target === set.name && a.targetType === set.type)
  const save = () => {
    const r = addToServerSet(state, set.name, picked)
    setErrors(r.errors)
    if (!r.errors.length) onSave(r.state)
  }
  return (
    <Modal
      title={`Add server to ${set.name}`}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!picked} onClick={save}>
            Add
          </Btn>
        </>
      }
    >
      {first && (
        <p className="pc-dim">
          The servers of {set.name} run Mule {first.runtime}, agent {first.agentVersion} and Java {first.java}. A new server needs the same versions and no applications.
        </p>
      )}
      {free.length === 0 ? (
        <p className="pc-dim">No free servers. A server in a group or a cluster cannot join another one.</p>
      ) : (
        <Field label="Server">
          <Select
            value={picked}
            onChange={setPicked}
            options={free.map((t) => {
              const x = serverNamed(state, state.env, t.name)
              return [t.name, `${t.name}, Mule ${x.runtime}, agent ${x.agentVersion}, Java ${x.java}, ${serverStatus(x)}${Object.keys(x.apps).length ? `, has ${Object.keys(x.apps).join(', ')}` : ''}`]
            })}
          />
        </Field>
      )}
      {apps.length > 0 && <Note>The server gets {apps.map((a) => a.name).join(', ')} when it joins. A server that is not connected gets them when its agent connects.</Note>}
      <Errors list={errors} />
    </Modal>
  )
}

// The servers an application of Runtime Manager runs on, for its Dashboard
export function NodeTable({ state, app }) {
  const live = new Set(liveNodes(state, app).map((x) => x.agent.name))
  const nodes = nodesOf(state, app)
  return (
    <Table
      heads={['Server', 'Server status', 'Application on this server', 'Gets traffic']}
      empty="The target has no servers."
      rows={nodes.map((x) => (
        <tr key={x.agent.name}>
          <td>{x.agent.name}</td>
          <td>
            <Dot status={serverStatus(x)} />
          </td>
          <td>
            <Dot status={x.service !== 'Running' && app.nodes?.[x.agent.name] === 'Started' ? 'Stopped' : (app.nodes?.[x.agent.name] ?? 'Not deployed')} />
          </td>
          <td>{live.has(x.agent.name) ? (app.behind?.[x.agent.name] ? 'Yes, with the old version. The new one waits for the agent.' : 'Yes') : 'No'}</td>
        </tr>
      ))}
    />
  )
}

// ---------- the data center: the company's Windows servers ----------

export function DataCenter({ state, update, go }) {
  const servers = hybridServers(state)
  const [host, setHost] = useState(servers[0]?.host)
  const server = servers.find((x) => x.host === host) ?? servers[0]
  useEffect(() => {
    if (server) update((s) => mark(s, `server:${server.host}`))
  }, [server?.host, update]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!server)
    return (
      <main className="pc-main">
        <h2>Data center</h2>
        <p className="pc-empty pc-boxed">This lab has no servers of its own. Every application runs on CloudHub 2.0.</p>
      </main>
    )
  return (
    <main className="pc-main dc">
      <div className="pc-title">
        <h2>Data center</h2>
        <span className="pc-grow" />
        <Btn onClick={() => go({ product: 'Runtime Manager', page: 'Servers' })}>Runtime Manager, Servers</Btn>
      </div>
      <p className="pc-dim">The Windows servers of Harbor in its own data center, as you see them over Remote Desktop. It is a lab tool and not part of Anypoint.</p>
      <div className="dc-hosts" role="tablist" aria-label="Servers">
        {servers.map((x) => (
          <button key={x.host} type="button" role="tab" aria-selected={x === server} className={x === server ? 'on' : ''} onClick={() => setHost(x.host)}>
            <b>{x.host}</b>
            <small>
              {x.ip}, Mule {x.runtime}, {x.service === 'Running' ? 'running' : x.service === 'Stopped' ? 'stopped' : 'no service'}
            </small>
          </button>
        ))}
      </div>
      <Link3 state={state} server={server} />
      <div className="dc-facts">
        <dl className="pc-facts">
          <dt>Host</dt>
          <dd>
            {server.host}, {server.ip}, {server.os}
          </dd>
          <dt>MULE_HOME</dt>
          <dd className="pc-mono">{server.home}</dd>
          <dt>Mule runtime</dt>
          <dd>
            {server.runtime}, Java {server.java}, agent {server.agentVersion}
          </dd>
          <dt>Windows service</dt>
          <dd>{server.service}</dd>
          <dt>Runtime Manager</dt>
          <dd>{server.agent ? `${serverStatus(server)} as ${server.agent.name} in ${server.agent.env}` : server.agentFiles ? 'Removed in Runtime Manager. The agent files are still in conf.' : 'Not registered'}</dd>
        </dl>
        <div className="dc-firewall">
          <b>Data center firewall</b>
          <Check checked={server.outbound} onChange={(on) => update((s) => setOutbound(s, server.host, on))}>
            Allow outbound HTTPS on port 443 from {server.host}
          </Check>
          <small className="pc-dim">The agent needs this rule. No inbound rule is needed for Runtime Manager.</small>
        </div>
      </div>
      <div className="dc-work">
        <Explorer key={`x-${server.host}`} state={state} server={server} />
        <Terminal key={`t-${server.host}`} state={state} update={update} server={server} />
      </div>
    </main>
  )
}

// The chain from Anypoint to the applications, coloured by what works now
function Link3({ state, server }) {
  const status = serverStatus(server)
  const reg = Boolean(server.agent)
  const up = server.service === 'Running'
  const apps = Object.entries(server.apps)
  const hop = (ok, text) => <span className={`dc-hop ${ok ? 'ok' : 'off'}`}>{text}</span>
  return (
    <div className="dc-chain" aria-label="How Anypoint and this server connect">
      <div className="dc-node">
        <b>Anypoint control plane</b>
        <small>Runtime Manager, {server.agent?.env ?? state.env}</small>
      </div>
      {hop(status === 'Running', status === 'Running' ? '⇠ WebSocket, outbound 443 ⇠' : reg ? (!server.outbound ? '✕ blocked by the firewall' : !up ? '✕ runtime stopped' : '✕ restart to connect') : '✕ not registered')}
      <div className="dc-node">
        <b>Runtime Manager agent</b>
        <small>conf\mule-agent.yml {server.agentFiles ? 'present' : 'missing'}</small>
      </div>
      {hop(up, up ? '→' : '✕')}
      <div className="dc-node">
        <b>Mule runtime {server.runtime}</b>
        <small>Windows service {server.service.toLowerCase()}</small>
      </div>
      {hop(up && apps.length > 0, '→')}
      <div className="dc-node">
        <b>apps folder</b>
        <small>{apps.length ? apps.map(([n, a]) => `${n} (${a.status})`).join(', ') : 'empty'}</small>
      </div>
    </div>
  )
}

function Explorer({ state, server }) {
  const [path, setPath] = useState(server.home)
  const [open, setOpen] = useState(null)
  const list = listing(state, server, path) ?? []
  const up = path.includes('\\') && !/^[a-z]:\\?$/i.test(path) ? path.slice(0, path.lastIndexOf('\\')) || 'C:' : null
  const text = open ? fileText(state, server, open) : null
  return (
    <section className="dc-explorer" aria-label="File Explorer">
      <div className="dc-pane-head">File Explorer</div>
      <div className="dc-path">
        <Btn disabled={!up} onClick={() => { setPath(/^[a-z]:$/i.test(up ?? '') ? `${up}\\` : up); setOpen(null) }} aria-label="Up one folder">
          ↑
        </Btn>
        <code>{path}</code>
      </div>
      <div className="dc-quick">
        {[['C:\\', 'C:'], [server.home, 'MULE_HOME'], [`${server.home}\\apps`, 'apps'], [`${server.home}\\conf`, 'conf'], [`${server.home}\\logs`, 'logs'], [BUILDS, 'builds']].map(([p, label]) => (
          <Link key={label} onClick={() => { setPath(p); setOpen(null) }}>
            {label}
          </Link>
        ))}
      </div>
      <ul className="dc-files">
        {list.length === 0 && <li className="pc-dim">This folder is empty.</li>}
        {list.map((f) => (
          <li key={f.name}>
            <button type="button" onClick={() => (f.dir ? (setPath(`${path.replace(/\\$/, '')}\\${f.name}`), setOpen(null)) : setOpen(`${path.replace(/\\$/, '')}\\${f.name}`))}>
              <span aria-hidden="true">{f.dir ? '📁' : f.name.endsWith('.jar') ? '📦' : '📄'}</span> {f.name}
              {!f.dir && <small>{f.size}</small>}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="dc-open">
          <div className="dc-pane-head">
            {open.split('\\').pop()} <span className="pc-grow" />
            <Link onClick={() => setOpen(null)}>Close</Link>
          </div>
          <pre className="pc-pre">{text ?? 'This file cannot be shown.'}</pre>
        </div>
      )}
    </section>
  )
}

function Terminal({ state, update, server }) {
  const [cwd, setCwd] = useState(`${server.home}\\bin`)
  const [lines, setLines] = useState(() => ['Windows PowerShell', `Lab server ${server.host}. Type help for the commands.`, ''])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [back, setBack] = useState(-1)
  const box = useRef(null)
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [lines])
  const submit = (e) => {
    e.preventDefault()
    const r = run(state, server.host, cwd, input)
    const prompt = `PS ${cwd}> ${input}`
    setLines(r.out === null ? [] : [...lines, prompt, ...r.out].slice(-400))
    if (r.state !== state) update(() => r.state)
    setCwd(r.cwd)
    if (input.trim()) setHistory([input, ...history].slice(0, 30))
    setBack(-1)
    setInput('')
  }
  const key = (e) => {
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault()
      const i = Math.min(back + 1, history.length - 1)
      setBack(i)
      setInput(history[i])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const i = back - 1
      setBack(i)
      setInput(i < 0 ? '' : history[i])
    }
  }
  return (
    <section className="dc-term" aria-label="PowerShell">
      <div className="dc-pane-head dc-term-head">
        Administrator: Windows PowerShell <span className="pc-grow" />
        <button type="button" onClick={() => setLines([...lines, ...HELP])}>
          help
        </button>
      </div>
      <pre ref={box} className="dc-out" tabIndex={0}>
        {lines.join('\n')}
      </pre>
      <form className="dc-in" onSubmit={submit}>
        <label htmlFor={`ps-${server.host}`}>PS {cwd}&gt;</label>
        <input id={`ps-${server.host}`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={key} autoComplete="off" spellCheck="false" aria-label="Command" />
      </form>
    </section>
  )
}
