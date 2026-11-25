import { useEffect, useState } from 'react'
import { assetGroups, callApi, dayText, endpointOf, importSpec, mark, packageJar, purge, sendMessage, setStudio, stamp, studioFlows, viewMessages } from '../../lab/platform.js'
import { packageOf } from '../../lab/platform-packages.js'
import { Btn, Check, Field, Input, Link, Modal, Note, Select, SideNav, Table } from './parts.jsx'

// ---------- Anypoint MQ ----------

export function Mq({ state, update, place, go, openEnv }) {
  const queue = state.queues.find((q) => q.name === place.queue)
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} back={queue ? ['Destinations', () => go({})] : undefined} items={queue ? [['Message Browser', 'Message Browser'], ['Message Sender', 'Message Sender'], ['Settings', 'Settings']] : [['Destinations', 'Destinations'], ['Client Apps', 'Client Apps', true], ['Usage', 'Usage', true]]} value={queue ? (place.tab ?? 'Settings') : 'Destinations'} onPick={(tab) => (queue ? go({ queue: queue.name, tab }) : go({}))} />
      <main className="pc-main">
        {!queue && (
          <>
            <h2>Destinations</h2>
            <p className="pc-dim">Region US East (Ohio)</p>
            <Table
              heads={['Name', 'Type', 'Messages', 'Dead Letter Queue']}
              empty="No queues in this environment."
              rows={state.queues.map((q) => (
                <tr key={q.name}>
                  <td>
                    <Link onClick={() => go({ queue: q.name, tab: 'Message Browser' })}>{q.name}</Link>
                  </td>
                  <td>{q.type}</td>
                  <td>{q.messages.length}</td>
                  <td>{q.dlq || 'None'}</td>
                </tr>
              ))}
            />
          </>
        )}
        {queue && <Queue key={queue.name} queue={queue} tab={place.tab ?? 'Settings'} update={update} />}
      </main>
    </>
  )
}

function Queue({ queue, tab, update }) {
  const [shown, setShown] = useState(null)
  const [open, setOpen] = useState(null)
  const [body, setBody] = useState('{ "order": "O-2001", "total": 10 }')
  return (
    <>
      <h2>{queue.name}</h2>
      {tab === 'Settings' && (
        <dl className="pc-facts one">
          <dt>Type</dt>
          <dd>{queue.type}</dd>
          <dt>Messages</dt>
          <dd>{queue.messages.length}</dd>
          <dt>Assign a Dead Letter Queue</dt>
          <dd>{queue.dlq ? `On, ${queue.dlq}` : 'Off'}</dd>
          <dt>Delivery attempts before reroute</dt>
          <dd>{queue.dlq ? queue.attempts : 'Not used'}</dd>
        </dl>
      )}
      {tab === 'Message Sender' && (
        <>
          <Field label="Type">
            <Select value="JSON" onChange={() => {}} options={['JSON']} />
          </Field>
          <Field label="Payload">
            <textarea className="pc-input pc-mono" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Btn kind="primary" onClick={() => update((s) => sendMessage(s, queue.name, body))}>
            Send
          </Btn>
        </>
      )}
      {tab === 'Message Browser' && (
        <>
          <div className="pc-bar">
            <Btn kind="primary" onClick={() => { setShown(queue.messages); update((s) => viewMessages(s, queue.name)) }}>
              Get Messages
            </Btn>
            <Btn disabled={!shown} onClick={() => { setShown(null); setOpen(null) }}>
              Return Messages
            </Btn>
            <Btn disabled={queue.messages.length === 0} onClick={() => { update((s) => purge(s, queue.name)); setShown(null); setOpen(null) }}>
              Purge Messages
            </Btn>
          </div>
          <Note>Purge deletes the messages for good. In a real queue, returning a message counts as a failed delivery.</Note>
          {shown && (
            <Table
              heads={['Message ID', 'Received', 'Deliveries', 'From']}
              empty="The queue is empty."
              rows={shown.map((m) => (
                <tr key={m.id} className={open?.id === m.id ? 'on' : ''}>
                  <td>
                    <Link onClick={() => setOpen(m)}>{m.id}</Link>
                  </td>
                  <td>{stamp(m.t)}</td>
                  <td>{m.deliveries}</td>
                  <td>{m.from ?? ''}</td>
                </tr>
              ))}
            />
          )}
          {open && <pre className="pc-pre">{open.body}</pre>}
        </>
      )}
    </>
  )
}

// ---------- Anypoint Studio, the part of it that links an application to an API ----------

export function Studio({ state, update, place, go }) {
  const project = state.studio.find((p) => p.name === place.project) ?? state.studio.at(-1)
  const [picking, setPicking] = useState(false)
  const [element, setElement] = useState(null)
  const groups = assetGroups(state)
  return (
    <>
      <nav className="pc-side" aria-label="Package Explorer">
        <b className="pc-side-title">Package Explorer</b>
        {state.studio.map((p) => (
          <button key={p.name} type="button" className={p === project ? 'on' : ''} onClick={() => go({ project: p.name })}>
            {p.name}
          </button>
        ))}
        <Btn onClick={() => setPicking(true)}>Import a published API</Btn>
      </nav>
      <main className="pc-main">
        <Note>Studio is a desktop program. This page has only the steps that connect a Mule application with Exchange and API Manager.</Note>
        {!project && <p className="pc-empty">No project yet. Import a published API to create one.</p>}
        {project && (
          <>
            <div className="pc-title">
              <h2>{project.name}</h2>
              <span className="pc-version">{project.version}</span>
              <span className="pc-grow" />
              <Btn kind="primary" onClick={() => update((s) => packageJar(s, project.name))}>
                Export
              </Btn>
            </div>
            {project.jar && <p className="pc-good">Exported {project.jar}. Runtime Manager can deploy it.</p>}
            <h3 className="pc-h3">Flows made by APIkit</h3>
            <ul className="pc-flows">
              {studioFlows(project).map((f) => (
                <li key={f} className="pc-mono">
                  {f}
                </li>
              ))}
            </ul>
            <h3 className="pc-h3">Global Elements</h3>
            <Table heads={['Type', 'Name', 'Values']} rows={[['HTTP Listener config', 'httpListenerConfig', '0.0.0.0:${http.port}'], ['Router', `${project.name}-config`, project.assetId], ['Database Config', 'Database_Config', '${db.host}'], ...(project.autodiscovery ? [['API Autodiscovery', '', `${project.autodiscovery.apiId}, ${project.autodiscovery.flowRef}`]] : [])].map((r) => <tr key={r[0]}>{r.map((x, i) => <td key={i}>{x}</td>)}</tr>)} />
            <div className="pc-bar">
              <Btn onClick={() => setElement(project.autodiscovery ?? { apiId: '${api.id}', flowRef: '' })}>{project.autodiscovery ? 'Edit API Autodiscovery' : 'Create API Autodiscovery'}</Btn>
            </div>
            {project.autodiscovery && <pre className="pc-pre">{`<api-gateway:autodiscovery apiId="${project.autodiscovery.apiId}" flowRef="${project.autodiscovery.flowRef}" />`}</pre>}
          </>
        )}
      </main>
      {picking && (
        <Modal title="Import a published API" onClose={() => setPicking(false)}>
          {groups.length === 0 && <Note>There are no APIs in Exchange yet.</Note>}
          <div className="pc-list">
            {groups.map((g) => (
              <button key={g[0].assetId} type="button" onClick={() => { update((s) => importSpec(s, g[0].assetId)); setPicking(false); go({ project: g[0].assetId }) }}>
                <span>
                  {g[0].name}
                  <small>{g[0].version}. Scaffold flows from this API specification.</small>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {element && (
        <Modal
          title="API Autodiscovery"
          onClose={() => setElement(null)}
          foot={
            <>
              <Btn onClick={() => setElement(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!element.apiId || !element.flowRef} onClick={() => { update((s) => setStudio(s, project.name, { autodiscovery: element })); setElement(null) }}>
                OK
              </Btn>
            </>
          }
        >
          <Field label="API ID" required hint="A property such as ${api.id}, because every environment has another ID.">
            <Input value={element.apiId} onChange={(apiId) => setElement({ ...element, apiId })} />
          </Field>
          <Field label="Flow Name" required hint="The flow with the HTTP Listener of the API.">
            <Select value={element.flowRef} onChange={(flowRef) => setElement({ ...element, flowRef })} placeholder="Choose a flow" options={studioFlows(project)} />
          </Field>
        </Modal>
      )}
    </>
  )
}

// ---------- API client ----------

export function ApiClient({ state, update }) {
  const apps = state.apps.filter((a) => a.env === state.env && packageOf(a.pkg).handle)
  const [f, setF] = useState({ app: apps[0]?.name ?? '', method: 'GET', path: apps[0]?.pkg === 'search-eapi' ? '/search' : apps[0]?.pkg === 'shipments-eapi' ? '/shipments' : '/orders', client: '', clientId: '', clientSecret: '', body: '' })
  const [history, setHistory] = useState([])
  const set = (patch) => setF({ ...f, ...patch })
  const app = apps.find((a) => a.name === f.app)
  function send(times) {
    let s = state
    const results = []
    for (let i = 0; i < times; i++) {
      const r = callApi(s, { env: state.env, app: f.app, method: f.method, path: f.path, body: f.body, client: f.client, clientId: f.clientId, clientSecret: f.clientSecret })
      s = r.state
      results.unshift({ ...r.response, key: s.clock })
    }
    update(() => s)
    setHistory((h) => [...results, ...h].slice(0, 20))
  }
  const last = history[0]
  return (
    <main className="pc-main">
      <h2>API client</h2>
      <p className="pc-dim">A client that calls your applications. It is a lab tool, like Postman, and not part of the platform.</p>
      {apps.length === 0 && <Note>No application with an HTTP endpoint is deployed in {state.env}.</Note>}
      <div className="pc-pair">
        <Field label="Application">
          <Select value={f.app} onChange={(name) => set({ app: name })} options={apps.map((a) => a.name)} placeholder="Choose an application" />
        </Field>
        <Field label="Send as">
          <Select value={f.client} onChange={(name) => { const c = state.clients.find((x) => x.name === name); set({ client: name, clientId: c?.clientId ?? '', clientSecret: c?.clientSecret ?? '' }) }} placeholder="No client application" options={state.clients.map((c) => c.name)} />
        </Field>
      </div>
      <div className="pc-bar">
        <Select value={f.method} onChange={(method) => set({ method })} options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']} aria-label="Method" />
        <span className="pc-mono pc-dim">{app ? `${endpointOf(app)}/api` : ''}</span>
        <Input value={f.path} onChange={(path) => set({ path })} aria-label="Path" />
      </div>
      <div className="pc-pair">
        <Field label="client_id header">
          <Input value={f.clientId} onChange={(clientId) => set({ clientId })} />
        </Field>
        <Field label="client_secret header">
          <Input value={f.clientSecret} onChange={(clientSecret) => set({ clientSecret })} autoComplete="off" />
        </Field>
      </div>
      {f.method !== 'GET' && f.method !== 'DELETE' && (
        <Field label="Body (JSON)">
          <textarea className="pc-input pc-mono" rows={3} value={f.body} onChange={(e) => set({ body: e.target.value })} />
        </Field>
      )}
      <div className="pc-bar">
        <Btn kind="primary" disabled={!app} onClick={() => send(1)}>
          Send
        </Btn>
        <Btn disabled={!app} onClick={() => send(10)}>
          Send 10
        </Btn>
      </div>
      {last && (
        <div className="pc-sheet" aria-live="polite">
          <p>
            <b className={last.status < 300 ? 'pc-good' : 'pc-bad'}>{last.status}</b> <span className="pc-dim">{last.ms} ms</span> {last.policy && <span>Answered by the policy {last.policy}</span>}
          </p>
          <pre className="pc-pre">{last.body || '(empty body)'}</pre>
          {last.headers.length > 0 && <pre className="pc-pre">{last.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>}
          <p className="pc-dim">Last calls: {history.map((h) => h.status).join(', ')}</p>
        </div>
      )}
    </main>
  )
}

// ---------- Inbox ----------

export function Inbox({ state, update }) {
  useEffect(() => update((s) => mark(s, 'inbox')), [update])
  const [onlyAlerts, setOnlyAlerts] = useState(false)
  const list = state.mail.filter((m) => !onlyAlerts || /Manager|Monitoring/.test(m.source)).toReversed()
  return (
    <main className="pc-main">
      <div className="pc-title">
        <h2>Inbox</h2>
        <span className="pc-grow" />
        <Check checked={onlyAlerts} onChange={setOnlyAlerts}>
          Alerts only
        </Check>
      </div>
      <p className="pc-dim">The mail of the operations team. It is a lab tool, so you can see what an alert sends.</p>
      {list.length === 0 && <p className="pc-empty pc-boxed">No mail.</p>}
      <ul className="pc-mail">
        {list.map((m, i) => (
          <li key={`${m.t}-${i}`}>
            <b>{m.subject}</b>
            <span className="pc-dim">
              From {m.source} to {m.to}, {dayText(m.t)}
            </span>
            <p>{m.body}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
