import { useEffect, useState } from 'react'
import { assetGroups, callApi, dayText, endpointOf, importSpec, mark, packageJar, setBackend, setStudio, studioFlows } from '../../lab/platform.js'
import { BACKENDS } from '../../lab/platform-led.js'
import { ENTERPRISE_BACKENDS } from '../../lab/platform-enterprise-packages.js'
import { packageOf } from '../../lab/platform-packages.js'
import { TOKENS } from '../../lab/policies.js'
import { Btn, Check, Field, Input, Modal, Note, Select, Table } from './parts.jsx'

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
  const sampleOf = (a) => (a && packageOf(a.pkg).sample) ?? { method: 'GET', path: '/orders' }
  const [f, setF] = useState({ app: apps[0]?.name ?? '', ...sampleOf(apps[0]), client: '', clientId: '', clientSecret: '', body: '', cid: '', token: 'none', scopes: '', ip: '', headers: [] })
  const [history, setHistory] = useState([])
  const set = (patch) => setF({ ...f, ...patch })
  const app = apps.find((a) => a.name === f.app)
  function send(times) {
    let s = state
    const results = []
    for (let i = 0; i < times; i++) {
      const r = callApi(s, { env: state.env, app: f.app, method: f.method, path: f.path, body: f.body, client: f.client, clientId: f.clientId, clientSecret: f.clientSecret, cid: f.cid.trim(), token: f.token, scopes: f.scopes.trim(), ...(f.ip.trim() && { ip: f.ip.trim() }), headers: f.headers.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v]) })
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
          <Select value={f.app} onChange={(name) => set({ app: name, ...sampleOf(apps.find((a) => a.name === name)) })} options={apps.map((a) => a.name)} placeholder="Choose an application" />
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
      <Field label="X-Correlation-ID header (optional)">
        <Input value={f.cid} onChange={(cid) => set({ cid })} placeholder="The runtime makes one" />
      </Field>
      <div className="pc-pair">
        <Field label="Authorization: Bearer token (optional)" hint="The lab plays the token by its kind. JWT Validation and OpenID Connect policies read it.">
          <Select value={f.token} onChange={(token) => set({ token })} options={TOKENS} />
        </Field>
        <Field label="Token scopes (optional)" hint="Separated by spaces, such as read write">
          <Input value={f.scopes} onChange={(scopes) => set({ scopes })} disabled={f.token === 'none'} />
        </Field>
        <Field label="Source IP (optional)" hint="The address the request comes from. Empty means 10.1.2.3.">
          <Input value={f.ip} onChange={(ip) => set({ ip })} placeholder="10.1.2.3" />
        </Field>
      </div>
      <div className="pc-field">
        <span className="pc-label">Extra headers (optional)</span>
        {f.headers.map(([k, v], i) => (
          <div key={i} className="pc-prop pc-header-row">
            <Input aria-label="Header name" placeholder="X-Forwarded-For" value={k} onChange={(name) => set({ headers: f.headers.map((h, j) => (j === i ? [name, h[1]] : h)) })} />
            <Input aria-label="Header value" placeholder="Value" value={v} onChange={(value) => set({ headers: f.headers.map((h, j) => (j === i ? [h[0], value] : h)) })} />
            <button type="button" className="pc-x" aria-label={`Remove header ${k || i + 1}`} onClick={() => set({ headers: f.headers.filter((_, j) => j !== i) })}>
              ×
            </button>
          </div>
        ))}
        <div>
          <Btn onClick={() => set({ headers: [...f.headers, ['', '']] })}>Add header</Btn>
        </div>
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
            <b className={last.status >= 200 && last.status < 300 ? 'pc-good' : 'pc-bad'}>{last.status || 'No answer'}</b> {last.status > 0 && <span className="pc-dim">{last.ms} ms</span>} {last.policy && <span>Answered by the policy {last.policy}</span>}
          </p>
          <pre className="pc-pre">{last.body || '(empty body)'}</pre>
          {last.headers.length > 0 && <pre className="pc-pre">{last.headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>}
          <p className="pc-dim">Last calls: {history.map((h) => h.status || 'no answer').join(', ')}</p>
        </div>
      )}
    </main>
  )
}

// ---------- Backends ----------

const SPEEDS = [['', 'Normal'], ['3000', 'Slow, 3 seconds'], ['8000', 'Very slow, 8 seconds']]

export function Backends({ state, update }) {
  // the systems of the enterprise estate show only where an app uses them (the open console) or a lab changed them,
  // so a guided lab does not list fifteen systems used by nothing
  const usedAnywhere = (id) => state.apps.some((a) => packageOf(a.pkg).backend === id) || Boolean(state.backends?.[id])
  const shown = Object.entries(BACKENDS).filter(([id]) => !(id in ENTERPRISE_BACKENDS) || usedAnywhere(id))
  return (
    <main className="pc-main">
      <h2>Backends</h2>
      <p className="pc-dim">The systems behind the System APIs. Stop one or slow it down, move the clock, and see in Visualizer and Monitoring what happens in the layers above. It is a lab tool and not part of the platform.</p>
      <Table
        heads={['System', 'Used by', 'State', 'Speed', '']}
        rows={shown.map(([id, b]) => {
          const now = { up: true, ms: b.ms, ...state.backends?.[id] }
          const users = state.apps.filter((a) => a.env === state.env && packageOf(a.pkg).backend === id).map((a) => a.name)
          return (
            <tr key={id}>
              <td>{b.name}</td>
              <td>{users.join(', ') || 'Nothing'}</td>
              <td className={now.up ? 'pc-good' : 'pc-bad'}>{now.up ? `Up, ${now.ms} ms` : 'Down'}</td>
              <td>
                <Select aria-label={`Speed of ${b.name}`} value={now.ms === b.ms ? '' : String(now.ms)} onChange={(ms) => update((s) => setBackend(s, id, { ms: Number(ms) || b.ms }))} options={SPEEDS} />
              </td>
              <td>
                <Btn onClick={() => update((s) => setBackend(s, id, { up: !now.up }))}>{now.up ? 'Stop' : 'Start'}</Btn>
              </td>
            </tr>
          )
        })}
      />
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
