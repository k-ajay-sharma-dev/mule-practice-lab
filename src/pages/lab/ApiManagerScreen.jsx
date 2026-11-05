import { useEffect, useMemo, useState } from 'react'
import { newRuntime, newTopology, nodeNotes, quotaView, send, topologyOf } from '../../lab/engine.js'
import { AUTH_SERVER_STATES, defaultSettings, policyByType, TOKENS } from '../../lab/policies.js'
import { AppsTab, NodeNotes, NodesTab, PoliciesTab, TiersTab, uid } from './ConfigTabs.jsx'
import Assumed from './Assumed.jsx'

const CONFIG_KEY = 'pl.lab.apim'
const STEP_MS = 100 // virtual time between two requests
const HISTORY = 12

const STARTER = {
  policies: [{ id: 'p1', type: 'client-id', settings: defaultSettings('client-id') }],
  automated: [],
  topology: newTopology(),
  tiers: [
    { name: 'Gold', requests: 5, periodMs: 10000, autoApprove: true },
    { name: 'Silver', requests: 2, periodMs: 10000, autoApprove: false },
  ],
  apps: [
    { name: 'Mobile App', clientId: 'lab-mobile-id', clientSecret: 'lab-mobile-secret', tier: 'Gold', contract: 'approved' },
    { name: 'Partner Portal', clientId: 'lab-partner-id', clientSecret: 'lab-partner-secret', tier: 'Silver', contract: 'pending' },
  ],
}

const NEW_REQUEST = {
  method: 'GET',
  path: '/orders',
  node: 'auto',
  origin: '',
  ip: '10.1.2.3',
  clientId: 'lab-mobile-id',
  clientSecret: 'lab-mobile-secret',
  basicUser: '',
  basicPassword: '',
  token: 'none',
  scopes: '',
  authServer: 'ok',
  headerText: '',
  body: '',
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY))
    const applied = [...(saved?.policies ?? []), ...(saved?.automated ?? [])]
    const valid = Array.isArray(saved?.apps) && Array.isArray(saved?.tiers) && Array.isArray(saved?.policies) && applied.every((p) => policyByType.has(p?.type))
    // setups saved by an older version have no automated policies or nodes
    return valid ? { automated: [], topology: newTopology(), ...saved } : STARTER
  } catch {
    return STARTER
  }
}

function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // storage blocked: the setup lasts for this visit
  }
}

const parseHeaderLines = (text) =>
  text.split('\n').flatMap((line) => {
    const at = line.indexOf(':')
    return at > 0 ? [[line.slice(0, at).trim(), line.slice(at + 1).trim()]] : []
  })

const toRequest = ({ origin, headerText, node, ...fields }) => ({
  ...fields,
  node: node === 'auto' ? undefined : Number(node),
  headers: [...(origin.trim() ? [['Origin', origin.trim()]] : []), ...parseHeaderLines(headerText)],
})

export default function ApiManagerScreen() {
  const [config, setConfig] = useState(loadConfig)
  const [tab, setTab] = useState('policies')
  const [runtime, setRuntime] = useState(newRuntime)
  const [clock, setClock] = useState(0)
  const [request, setRequest] = useState(NEW_REQUEST)
  const [history, setHistory] = useState([])

  // any change to the setup is a new deployment of it: quotas and windows start again
  useEffect(() => {
    saveConfig(config)
    setRuntime(newRuntime())
  }, [config])

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))
  const { nodes } = topologyOf(config)

  function fire(times) {
    let state = runtime
    let at = clock
    const results = []
    for (let i = 0; i < times; i++) {
      const outcome = send(config, state, toRequest(request), at)
      results.unshift({ ...outcome, at, key: uid(), nodes })
      state = outcome.runtime
      at += STEP_MS
    }
    setRuntime(state)
    setClock(at)
    setHistory((h) => [...results, ...h].slice(0, HISTORY))
  }

  function reset() {
    setConfig(structuredClone(STARTER))
    setRequest(NEW_REQUEST)
    setHistory([])
    setClock(0)
  }

  return (
    <div className="lab-grid">
      <section className="lab-panel" aria-label="API Manager">
        <div className="lab-panel-head">
          <h2>API Manager</h2>
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            Reset lab
          </button>
        </div>
        <div className="lab-tabs" role="tablist">
          {[
            ['policies', `Policies (${config.policies.length})`],
            ['apps', `Client Applications (${config.apps.length})`],
            ['tiers', `SLA Tiers (${config.tiers.length})`],
            ['nodes', `Nodes (${nodes})`],
          ].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`lab-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'policies' && (
          <PoliciesTab
            policies={config.policies}
            automated={config.automated}
            onChange={(policies) => update({ policies })}
            onAutomatedChange={(automated) => update({ automated })}
          />
        )}
        {tab === 'apps' && <AppsTab apps={config.apps} tiers={config.tiers} onChange={(apps) => update({ apps })} />}
        {tab === 'tiers' && <TiersTab tiers={config.tiers} onChange={(tiers) => update({ tiers })} />}
        {tab === 'nodes' && <NodesTab config={config} onChange={(topology) => update({ topology })} />}
      </section>

      <section className="lab-panel" aria-label="Test Console">
        <div className="lab-panel-head">
          <h2>Test Console</h2>
          <span className="muted small mono">clock {(clock / 1000).toFixed(1)} s</span>
        </div>
        <RequestForm request={request} apps={config.apps} nodes={nodes} onChange={setRequest} />
        <div className="lab-actions">
          <button className="btn btn-primary" onClick={() => fire(1)}>
            Send request
          </button>
          <button className="btn" onClick={() => fire(5)}>
            Send 5
          </button>
          <button className="btn" onClick={() => fire(12)}>
            Send 12
          </button>
          <button className="btn btn-ghost" onClick={() => setClock((c) => c + 1000)}>
            Wait 1 s
          </button>
          <button className="btn btn-ghost" onClick={() => setClock((c) => c + 10000)}>
            Wait 10 s
          </button>
        </div>
        {nodes > 1 && <QuotaByNode config={config} runtime={runtime} clock={clock} />}
        <Results history={history} />
      </section>
    </div>
  )
}

function RequestForm({ request, apps, nodes, onChange }) {
  const set = (patch) => onChange({ ...request, ...patch })
  const input = (key, label, props) => (
    <label className="lab-field">
      <span className="small muted">{label}</span>
      <input className="input" value={request[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </label>
  )
  const selected = useMemo(() => apps.find((a) => a.clientId === request.clientId)?.clientId ?? '', [apps, request.clientId])

  return (
    <div className="lab-fields">
      <label className="lab-field">
        <span className="small muted">Send as</span>
        <select
          className="input"
          value={selected}
          onChange={(e) => {
            const app = apps.find((a) => a.clientId === e.target.value)
            set({ clientId: app?.clientId ?? '', clientSecret: app?.clientSecret ?? '' })
          }}
        >
          <option value="">No client application</option>
          {apps.map((a) => (
            <option key={a.clientId} value={a.clientId}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="lab-field">
        <span className="small muted">Method</span>
        <select className="input" value={request.method} onChange={(e) => set({ method: e.target.value })}>
          {['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      {input('path', 'Resource path')}
      {nodes > 1 && (
        <label className="lab-field">
          <span className="small muted">Node</span>
          <select className="input" value={request.node} onChange={(e) => set({ node: e.target.value })}>
            <option value="auto">Load balancer, round robin</option>
            {Array.from({ length: nodes }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Node {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {input('clientId', 'client_id header')}
      {input('clientSecret', 'client_secret header')}
      {input('ip', 'Source IP')}
      <label className="lab-field">
        <span className="small muted">Bearer token</span>
        <select className="input" value={request.token} onChange={(e) => set({ token: e.target.value })}>
          {TOKENS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {input('scopes', 'Token scopes, space separated')}
      <label className="lab-field">
        <span className="small muted">Authorization server</span>
        <select className="input" value={request.authServer} onChange={(e) => set({ authServer: e.target.value })}>
          {AUTH_SERVER_STATES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {input('origin', 'Origin header (a browser sends this)')}
      {input('basicUser', 'Basic auth user')}
      {input('basicPassword', 'Basic auth password')}
      <label className="lab-field lab-wide">
        <span className="small muted">Other headers, one per line (name: value)</span>
        <textarea className="input mono" rows={2} value={request.headerText} onChange={(e) => set({ headerText: e.target.value })} />
      </label>
      <label className="lab-field lab-wide">
        <span className="small muted">Body</span>
        <textarea className="input mono" rows={2} value={request.body} onChange={(e) => set({ body: e.target.value })} />
      </label>
    </div>
  )
}

function Results({ history }) {
  if (history.length === 0) return <div className="empty-row muted">Send a request to see which policy decides it.</div>
  const [latest, ...older] = history
  return (
    <>
      <div className="lab-result" aria-live="polite">
        <div className="lab-row-head">
          <span className={`lab-status lab-s${String(latest.status)[0]}`}>{latest.status}</span>
          {latest.statusBasis === 'assumed' && <Assumed note="The CORS page lists no status codes, so the status of a preflight answer is the simulator's assumption." />}
          <span className="lab-grow small">{latest.reachedBackend ? 'Reached the backend' : 'Stopped at the gateway'}</span>
          {latest.latency > 0 && <span className="muted small mono">+{latest.latency} ms queued</span>}
          {latest.nodes > 1 && <span className="muted small mono">node {latest.node}</span>}
        </div>
        {latest.browser && (
          <p className={`small lab-browser lab-browser-${latest.browser}`}>
            {latest.browser === 'allowed' ? 'A browser would accept this response.' : 'A browser would block this response from reaching the page.'}
          </p>
        )}
        {latest.trace.length === 0 && <p className="muted small">No policies ran.</p>}
        <ol className="lab-trace">
          {latest.trace.map((step, i) => (
            <li key={i} className={`lab-${step.outcome}`}>
              <b>{step.policy}</b> {step.level === 'automated' && <span className="lab-badge lab-pending">Automated</span>} {step.detail}
              <Assumed basis={step.basis} />
              {step.assumption && (
                <span className="muted">
                  {' '}
                  {step.assumption}
                  <Assumed />
                </span>
              )}
            </li>
          ))}
        </ol>
        <HeaderBlock title="Headers the backend received" headers={latest.backendHeaders} />
        <HeaderBlock title="Response headers" headers={latest.responseHeaders} />
        {latest.appLog.length > 0 && (
          <div className="lab-headers">
            <span className="small muted">
              Application log
              <Assumed note="The layout follows the Mule format on the Message Logging page. The date and thread name are left out." />
            </span>
            <pre className="mono small">{latest.appLog.map((l) => `${l.phase}: ${l.text}`).join('\n')}</pre>
          </div>
        )}
      </div>
      {older.length > 0 && (
        <>
          <h3 className="small muted lab-history-title">Earlier requests</h3>
          <ul className="lab-history mono small">
            {older.map((r) => (
              <li key={r.key}>
                <span className="muted">{(r.at / 1000).toFixed(1)} s</span> <span className={`lab-text-s${String(r.status)[0]}`}>{r.status}</span>{' '}
                <span className="muted">{r.reachedBackend ? 'backend' : r.trace.at(-1).policy}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function QuotaByNode({ config, runtime, clock }) {
  const views = quotaView(config, runtime, clock)
  const notes = nodeNotes(config)
  if (views.length === 0 && notes.length === 0) return null
  return (
    <div className="lab-quota">
      <h3 className="small muted lab-history-title">Quota by node</h3>
      {views.map((view) => (
        <table key={view.id} className="lab-table small">
          <caption>
            {view.policy}: {view.shared ? 'one quota shared by the cluster' : 'each node has its own quota'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Limit</th>
              {view.scopes.map((node) => (
                <th key={node ?? 'shared'} scope="col">
                  {node ? `Node ${node}` : 'Cluster'}
                </th>
              ))}
              <th scope="col">Accepted, most possible</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={`${row.group}-${row.requests}-${row.periodMs}`}>
                <td>
                  {row.requests} per {row.periodMs} ms{row.group ? `, ${row.group}` : ''}
                </td>
                {row.used.map((used, i) => (
                  <td key={i} className="mono">
                    {used} of {row.requests}
                  </td>
                ))}
                <td className="mono">
                  {row.total} of {row.ceiling}
                </td>
              </tr>
            ))}
            {view.rows.length === 0 && (
              <tr>
                <td colSpan={view.scopes.length + 2} className="muted">
                  No requests counted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ))}
      <NodeNotes notes={notes} />
    </div>
  )
}

function HeaderBlock({ title, headers }) {
  if (headers.length === 0) return null
  return (
    <div className="lab-headers">
      <span className="small muted">{title}</span>
      <pre className="mono small">{headers.map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
    </div>
  )
}
