import { useEffect, useState } from 'react'
import {
  advance,
  appStatus,
  DEPLOY_MODELS,
  deploy,
  deploymentStatus,
  formatProperties,
  keepProtected,
  maskProtected,
  MAX_REPLICAS,
  newConfig,
  newState,
  PACKAGES,
  parseProperties,
  remove,
  REPLICA_SIZES,
  rollback,
  rollingNeed,
  RUNTIME_VERSIONS,
  RUNTIME_VERSIONS_BASIS,
  settle,
  start,
  stop,
  TARGETS,
  usedVCores,
} from '../../lab/runtime.js'
import Assumed from './Assumed.jsx'

const STATE_KEY = 'pl.lab.runtime'
const TICK_MS = 500 // real time between two virtual seconds while a deployment runs
const LOG_LEVELS = ['ALL', 'INFO', 'WARN', 'ERROR']

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY))
    return Number.isFinite(saved?.clock) && Array.isArray(saved?.apps) ? saved : newState()
  } catch {
    return newState()
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // storage blocked: the deployments last for this visit
  }
}

const toForm = (config) => ({
  ...config,
  propertiesText: formatProperties(config.properties),
  protectedText: formatProperties(maskProtected(config.protectedProperties)),
})

const newForm = () => toForm(newConfig())
export const formFor = (config) => toForm(config ?? newConfig())

export default function RuntimeManagerScreen() {
  const [state, setState] = useState(loadState)

  useEffect(() => saveState(state), [state])

  return <RuntimeWorkbench state={state} onChange={setState} onReset={() => setState(newState())} />
}

// The deploy form and application list. Guided labs reuse it with their own state, so `onChange` takes a state or an updater.
export function RuntimeWorkbench({ state, onChange: setState, onReset, resetLabel = 'Reset lab', startForm = newForm, focus = null }) {
  const [form, setForm] = useState(startForm)
  const [errors, setErrors] = useState([])
  const [selected, setSelected] = useState(focus)
  const busy = state.apps.some((a) => a.queue.length > 0)
  const app = state.apps.find((a) => a.name === selected) ?? state.apps[0]

  useEffect(() => {
    if (!busy) return undefined
    const timer = setInterval(() => setState((s) => advance(s, 1000)), TICK_MS)
    return () => clearInterval(timer)
  }, [busy, setState])

  function submit(e) {
    e.preventDefault()
    const { propertiesText, protectedText, ...fields } = form
    const previous = state.apps.find((a) => a.name === form.name)?.config.protectedProperties
    const config = {
      ...fields,
      properties: parseProperties(propertiesText),
      protectedProperties: keepProtected(parseProperties(protectedText), previous),
    }
    const result = deploy(state, config)
    setErrors(result.errors)
    setState(result.state)
    if (result.errors.length === 0) setSelected(config.name)
  }

  function restore(configId) {
    const result = rollback(state, app.name, configId)
    setErrors(result.errors)
    setState(result.state)
  }

  function reset() {
    onReset()
    setForm(startForm())
    setErrors([])
    setSelected(null)
  }

  return (
    <div className="lab-grid">
      <section className="lab-panel" aria-label="Deploy Application">
        <div className="lab-panel-head">
          <h2>Deploy Application</h2>
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            {resetLabel}
          </button>
        </div>
        <DeployForm form={form} errors={errors} state={state} onChange={setForm} onSubmit={submit} />
        <Capacity state={state} />
      </section>

      <section className="lab-panel" aria-label="Applications">
        <div className="lab-panel-head">
          <h2>Applications</h2>
          <span className="muted small mono">clock {(state.clock / 1000).toFixed(1)} s</span>
        </div>
        {state.apps.length === 0 && <div className="empty-row muted">Nothing deployed yet. Deploy an application to watch its replicas change status.</div>}
        {state.apps.length > 0 && (
          <div className="lab-tabs" role="tablist">
            {state.apps.map((a) => (
              <button key={a.name} role="tab" aria-selected={a === app} className={`lab-tab${a === app ? ' active' : ''}`} onClick={() => setSelected(a.name)}>
                {a.name}
              </button>
            ))}
          </div>
        )}
        {app && (
          <AppDetail
            app={app}
            onEdit={() => setForm(toForm(app.config))}
            onRestore={restore}
            onStop={() => setState(stop(state, app.name))}
            onStart={() => setState(start(state, app.name))}
            onDelete={() => setState(remove(state, app.name))}
            onSkip={() => setState(settle(state))}
          />
        )}
      </section>
    </div>
  )
}

function DeployForm({ form, errors, state, onChange, onSubmit }) {
  const set = (patch) => onChange({ ...form, ...patch })
  const pkg = PACKAGES.find((p) => p.id === form.packageId)
  const size = REPLICA_SIZES.find((s) => s.vCores === form.vCores)
  const rolling = size && Number.isInteger(form.replicas) && form.replicas > 0 ? rollingNeed(state, form) : null

  return (
    <form onSubmit={onSubmit}>
      <div className="lab-fields">
        <label className="lab-field">
          <span className="small muted">Application name</span>
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Application file</span>
          <select className="input" value={form.packageId} onChange={(e) => set({ packageId: e.target.value })}>
            {PACKAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small lab-wide lab-note">
          {pkg.note}
          <Assumed basis={pkg.basis} note="This is a sample application made for the lab, and its needs are lab values." />
        </p>
        <label className="lab-field">
          <span className="small muted">Deployment target</span>
          <select className="input" value={form.target} onChange={(e) => set({ target: e.target.value })}>
            {TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">
            Runtime version
            <Assumed basis={RUNTIME_VERSIONS_BASIS} note="Sample versions, not the current support list." />
          </span>
          <select className="input" value={form.runtime} onChange={(e) => set({ runtime: e.target.value })}>
            {RUNTIME_VERSIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">Replica count (1 to {MAX_REPLICAS})</span>
          <input className="input" type="number" value={form.replicas} onChange={(e) => set({ replicas: Number(e.target.value) })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Replica size (vCores)</span>
          <select className="input" value={form.vCores} onChange={(e) => set({ vCores: Number(e.target.value) })}>
            {REPLICA_SIZES.map((s) => (
              <option key={s.vCores} value={s.vCores}>
                {s.vCores}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small lab-wide lab-note">
          {size.memory} memory, {size.heap} heap, {size.storage} storage per replica.
        </p>
        <label className="lab-field">
          <span className="small muted">Deployment model</span>
          <select className="input" value={form.model} onChange={(e) => set({ model: e.target.value })}>
            {DEPLOY_MODELS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        {rolling && (
          <p className="muted small lab-wide lab-note">
            A rolling update needs one additional replica of resources: this one peaks at {rolling.peak} vCores, {rolling.extra} above the {rolling.steady} it uses when
            finished. Recreate needs none, but has downtime.
          </p>
        )}
        <label className="lab-check small">
          <input type="checkbox" checked={form.clustered} onChange={(e) => set({ clustered: e.target.checked })} /> Clustering
        </label>
        <label className="lab-field lab-wide">
          <span className="small muted">Properties, one per line (key=value)</span>
          <textarea className="input mono" rows={3} value={form.propertiesText} onChange={(e) => set({ propertiesText: e.target.value })} />
        </label>
        <label className="lab-field lab-wide">
          <span className="small muted">Protected properties, one per line (key=value). Values are hidden after deployment.</span>
          <textarea className="input mono" rows={2} value={form.protectedText} onChange={(e) => set({ protectedText: e.target.value })} />
        </label>
      </div>
      {errors.length > 0 && (
        <ul className="lab-errors small" role="alert">
          {errors.map((error) => (
            <li key={error.message}>
              {error.message}
              {error.basis === 'assumed' && <Assumed />}
            </li>
          ))}
        </ul>
      )}
      <div className="lab-actions">
        <button className="btn btn-primary" type="submit">
          Deploy application
        </button>
      </div>
    </form>
  )
}

function Capacity({ state }) {
  return (
    <p className="muted small">
      vCores in use:{' '}
      {TARGETS.map((t) => `${t.name} ${usedVCores(state, t.id)} of ${t.capacity}`).join(', ')}. These allocations are lab values
      <Assumed />
    </p>
  )
}

function AppDetail({ app, onEdit, onRestore, onStop, onStart, onDelete, onSkip }) {
  const busy = app.queue.length > 0
  const status = appStatus(app)
  const deployment = deploymentStatus(app)
  const halted = app.stopped || app.replicas.length === 0

  return (
    <>
      <div className="lab-row-head">
        <span className={`lab-state lab-state-${status === 'Running' ? 'good' : 'idle'}`}>{status}</span>
        <span className="small lab-grow">
          Deployment: <b>{deployment}</b>
        </span>
        <span className="muted small mono">
          {app.config.replicas} x {app.config.vCores} vCore
        </span>
      </div>
      <ul className="lab-replicas" aria-live="polite">
        {app.replicas.map((r) => (
          <li key={r.id} className={`lab-replica lab-replica-${r.status.toLowerCase()}`}>
            <span className="mono small">{r.id}</span>
            <b className="small">{r.status}</b>
            <span className="muted small">{r.configId}</span>
          </li>
        ))}
      </ul>
      {app.outcome && <Outcome outcome={app.outcome} />}
      <div className="lab-actions">
        <button className="btn btn-sm" onClick={onEdit} disabled={busy}>
          Edit in form
        </button>
        {busy && (
          <button className="btn btn-sm" onClick={onSkip}>
            Skip to result
          </button>
        )}
        {!halted && (
          <button className="btn btn-sm btn-ghost" onClick={onStop} disabled={busy}>
            Stop
          </button>
        )}
        {halted && (
          <button className="btn btn-sm btn-ghost" onClick={onStart} disabled={busy}>
            Start
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
      <ConfigHistory app={app} busy={busy} onRestore={onRestore} />
      <Logs key={app.name} logs={app.logs} />
    </>
  )
}

function Outcome({ outcome }) {
  return (
    <div className="lab-outcome small" role="status">
      <b>{outcome.title}</b>
      {outcome.basis === 'assumed' && <Assumed />}
      <p>{outcome.cause}</p>
      {outcome.assumption && (
        <p>
          {outcome.assumption}
          <Assumed />
        </p>
      )}
      <p>
        <b>Fix:</b> {outcome.fix}
        {outcome.docs && (
          <>
            {' '}
            <a href={outcome.docs} target="_blank" rel="noreferrer">
              Docs
            </a>
          </>
        )}
      </p>
    </div>
  )
}

function ConfigHistory({ app, busy, onRestore }) {
  if (app.history.length === 0) return null
  return (
    <>
      <h3 className="small muted lab-history-title">Configuration history (last 10)</h3>
      <ul className="lab-history mono small">
        {app.history.map((h) => (
          <li key={h.id} className="lab-history-row">
            <span className="lab-grow">
              {h.id} <span className="muted">{h.status}, deployed at {(h.at / 1000).toFixed(1)} s</span> {h.id === app.applied && <span className="lab-approved">current</span>}
            </span>
            {h.status === 'Applied' && h.id !== app.applied && (
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onRestore(h.id)}>
                Roll back
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Logs({ logs }) {
  const [level, setLevel] = useState('ALL')
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const shown = logs.filter((l) => (level === 'ALL' || l.level === level) && (!term || l.text.toLowerCase().includes(term)))

  return (
    <>
      <h3 className="small muted lab-history-title">
        Logs
        <Assumed note="Log wording is written for the lab. It is not copied from CloudHub 2.0, although the events it reports may be documented." />
      </h3>
      <div className="lab-fields">
        <label className="lab-field">
          <span className="small muted">Level</span>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LOG_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">Search</span>
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <ol className="lab-log mono small">
        {shown.length === 0 && <li className="muted">No log lines match.</li>}
        {shown.map((l, i) => (
          <li key={i} className={`lab-log-${l.level.toLowerCase()}`}>
            <span className="muted">{(l.at / 1000).toFixed(1)} s</span> <b>{l.level}</b> {l.text}
          </li>
        ))}
      </ol>
    </>
  )
}
