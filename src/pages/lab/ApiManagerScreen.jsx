import { useEffect, useMemo, useState } from 'react'
import { newRuntime, send } from '../../lab/engine.js'
import { defaultSettings, policyByType, TOKENS } from '../../lab/policies.js'
import { AppsTab, PoliciesTab, TiersTab, uid } from './ConfigTabs.jsx'
import Assumed from './Assumed.jsx'

const CONFIG_KEY = 'pl.lab.apim'
const STEP_MS = 100 // virtual time between two requests
const HISTORY = 12

const STARTER = {
  policies: [{ id: 'p1', type: 'client-id', settings: defaultSettings('client-id') }],
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
  ip: '10.1.2.3',
  clientId: 'lab-mobile-id',
  clientSecret: 'lab-mobile-secret',
  basicUser: '',
  basicPassword: '',
  token: 'none',
  headerText: '',
  body: '',
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY))
    const valid =
      Array.isArray(saved?.apps) && Array.isArray(saved?.tiers) && Array.isArray(saved?.policies) && saved.policies.every((p) => policyByType.has(p?.type))
    return valid ? saved : STARTER
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

  function fire(times) {
    let state = runtime
    let at = clock
    const results = []
    for (let i = 0; i < times; i++) {
      const outcome = send(config, state, { ...request, headers: parseHeaderLines(request.headerText) }, at)
      results.unshift({ ...outcome, at, key: uid() })
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
          ].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`lab-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'policies' && <PoliciesTab policies={config.policies} onChange={(policies) => update({ policies })} />}
        {tab === 'apps' && <AppsTab apps={config.apps} tiers={config.tiers} onChange={(apps) => update({ apps })} />}
        {tab === 'tiers' && <TiersTab tiers={config.tiers} onChange={(tiers) => update({ tiers })} />}
      </section>

      <section className="lab-panel" aria-label="Test Console">
        <div className="lab-panel-head">
          <h2>Test Console</h2>
          <span className="muted small mono">clock {(clock / 1000).toFixed(1)} s</span>
        </div>
        <RequestForm request={request} apps={config.apps} onChange={setRequest} />
        <div className="lab-actions">
          <button className="btn btn-primary" onClick={() => fire(1)}>
            Send request
          </button>
          <button className="btn" onClick={() => fire(5)}>
            Send 5
          </button>
          <button className="btn btn-ghost" onClick={() => setClock((c) => c + 1000)}>
            Wait 1 s
          </button>
          <button className="btn btn-ghost" onClick={() => setClock((c) => c + 10000)}>
            Wait 10 s
          </button>
        </div>
        <Results history={history} />
      </section>
    </div>
  )
}

function RequestForm({ request, apps, onChange }) {
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
          {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
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
          <span className="lab-grow small">{latest.reachedBackend ? 'Reached the backend' : 'Stopped at the gateway'}</span>
          {latest.latency > 0 && <span className="muted small mono">+{latest.latency} ms queued</span>}
        </div>
        {latest.trace.length === 0 && <p className="muted small">No policies ran.</p>}
        <ol className="lab-trace">
          {latest.trace.map((step, i) => (
            <li key={i} className={`lab-${step.outcome}`}>
              <b>{step.policy}</b> {step.detail}
              <Assumed basis={step.basis} />
            </li>
          ))}
        </ol>
        <HeaderBlock title="Headers the backend received" headers={latest.backendHeaders} />
        <HeaderBlock title="Response headers" headers={latest.responseHeaders} />
      </div>
      {older.length > 0 && (
        <>
          <h3 className="small muted lab-history-title">Earlier requests</h3>
          <ul className="lab-history mono small">
            {older.map((r) => (
              <li key={r.key}>
                <span className="muted">{(r.at / 1000).toFixed(1)} s</span> <span className={`lab-text-s${String(r.status)[0]}`}>{r.status}</span>{' '}
                <span className="muted">{r.trace.find((s) => s.outcome === 'reject')?.policy ?? 'backend'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
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
