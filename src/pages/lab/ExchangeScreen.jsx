import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  advanceDays,
  ageOf,
  ASSET_TYPES,
  assets,
  clearUsage,
  deleteKind,
  deleteVersion,
  dependentsOf,
  gav,
  hardDeleteReserved,
  isSnapshot,
  LIFECYCLE_STATES,
  newState,
  nextAvailableVersion,
  nextVersionNote,
  parseDependencies,
  publish,
  PUBLISH_METHODS,
  ROLES,
  setGavReuse,
  setLifecycle,
  typeOf,
  VERSION_ORDERS,
  visibility,
} from '../../lab/exchange.js'
import Assumed from './Assumed.jsx'
import './exchange.css'

const STATE_KEY = 'pl.lab.exchange'

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY))
    return Number.isFinite(saved?.day) && Array.isArray(saved?.versions) && Array.isArray(saved?.reserved) ? saved : newState()
  } catch {
    return newState()
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // storage blocked: the catalogue lasts for this visit
  }
}

const newForm = () => ({
  assetId: 'shipping-api',
  name: 'Shipping API',
  typeId: 'rest-api',
  version: '1.0.0',
  apiVersion: 'v1',
  method: 'api',
  facade: 3,
  lifecycle: 'stable',
  dependenciesText: '',
  file: 'shipping-api.zip',
  keywords: '',
  tags: '',
})

export function LabOutcome({ outcome }) {
  const success = outcome.ok === true || outcome.severity === 'success'
  const warned = outcome.severity === 'warning' || outcome.warning
  const tone = success ? 'good' : warned ? 'warn' : 'bad'
  return (
    <div className={`lab-outcome lx-outcome lx-outcome-${tone} small`} role="status">
      <b>{outcome.title}</b>
      <Assumed basis={outcome.basis} />
      <p>{outcome.cause}</p>
      {outcome.fix && (
        <p>
          <b>Fix:</b> {outcome.fix}
        </p>
      )}
      {outcome.assumption && (
        <p className="muted">
          {outcome.assumption}
          <Assumed />
        </p>
      )}
      {(outcome.docs || outcome.incident) && (
        <p className="lx-links">
          {outcome.docs && (
            <a href={outcome.docs} target="_blank" rel="noreferrer">
              Docs
            </a>
          )}
          {outcome.incident && <Link to={`/incidents/${outcome.incident}`}>Practice incident {outcome.incident}</Link>}
        </p>
      )}
    </div>
  )
}

export default function ExchangeScreen() {
  const [state, setState] = useState(loadState)
  const [form, setForm] = useState(newForm)
  const [role, setRole] = useState('admin')
  const [outcome, setOutcome] = useState(null)

  useEffect(() => saveState(state), [state])

  function apply(result) {
    setState(result.state)
    setOutcome(result.outcome)
  }

  function submit(e) {
    e.preventDefault()
    const { dependenciesText, ...fields } = form
    apply(publish(state, { ...fields, role, dependencies: parseDependencies(dependenciesText) }))
  }

  function reset() {
    setState(newState())
    setForm(newForm())
    setOutcome(null)
  }

  const fill = (version) =>
    setForm({
      ...form,
      assetId: version.assetId,
      name: version.name,
      typeId: version.typeId,
      version: version.version,
      apiVersion: version.apiVersion,
      method: version.method,
      dependenciesText: version.dependencies.join(' '),
      file: version.file,
      keywords: version.keywords.join(', '),
      tags: version.tags.join(', '),
    })

  return (
    <>
      <section className="lab-panel lx-toolbar" aria-label="Exchange settings">
        <label className="lab-field">
          <span className="small muted">Acting as</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <div className="lx-clock">
          <span className="small muted">Lab calendar</span>
          <div className="lx-clock-row">
            <b className="mono">Day {state.day}</b>
            <button className="btn btn-sm btn-ghost" onClick={() => setState(advanceDays(state, 1))}>
              +1 day
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setState(advanceDays(state, 7))}>
              +7 days
            </button>
          </div>
        </div>
        <label className="lab-check small">
          <input type="checkbox" checked={state.gavReuse} onChange={(e) => apply(setGavReuse(state, e.target.checked, role))} /> Asset deletion: allow GAV reuse
        </label>
        <button className="btn btn-sm btn-ghost lx-push" onClick={reset}>
          Reset lab
        </button>
      </section>

      {outcome && <LabOutcome outcome={outcome} />}

      <div className="lab-grid">
        <section className="lab-panel" aria-label="Publish asset">
          <div className="lab-panel-head">
            <h2>Publish asset</h2>
          </div>
          <PublishForm state={state} form={form} onChange={setForm} onSubmit={submit} />
          <Reserved state={state} onFree={(r) => apply(hardDeleteReserved(state, r.assetId, r.version, role))} />
          <Activity state={state} />
        </section>

        <section className="lab-panel" aria-label="Catalogue">
          <div className="lab-panel-head">
            <h2>Catalogue</h2>
            <span className="muted small mono">{state.versions.length} versions</span>
          </div>
          <p className="muted small lab-note">
            Sample assets
            <Assumed />
          </p>
          {assets(state).length === 0 && <div className="empty-row muted">No assets. Publish one to begin.</div>}
          {assets(state).map((asset) => (
            <AssetCard
              key={asset.assetId}
              asset={asset}
              state={state}
              onFill={fill}
              onPromote={(v, target) => apply(setLifecycle(state, v.assetId, v.version, target, role))}
              onDelete={(v, allowReuse) => apply(deleteVersion(state, v.assetId, v.version, { role, allowReuse }))}
              onClear={(v) => apply(clearUsage(state, v.assetId, v.version))}
            />
          ))}
        </section>
      </div>
    </>
  )
}

function PublishForm({ state, form, onChange, onSubmit }) {
  const set = (patch) => onChange({ ...form, ...patch })
  const type = typeOf(form.typeId)
  const maven = form.method === 'maven'

  return (
    <form onSubmit={onSubmit}>
      <div className="lab-fields">
        <label className="lab-field">
          <span className="small muted">Asset ID</span>
          <input className="input mono" value={form.assetId} onChange={(e) => set({ assetId: e.target.value })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Name</span>
          <input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Asset type</span>
          <select className="input" value={form.typeId} onChange={(e) => set({ typeId: e.target.value })}>
            {ASSET_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">Publish with</span>
          <select className="input" value={form.method} onChange={(e) => set({ method: e.target.value })}>
            {PUBLISH_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">Version</span>
          <input className="input mono" value={form.version} onChange={(e) => set({ version: e.target.value })} />
        </label>
        {type.api && (
          <label className="lab-field">
            <span className="small muted">API version</span>
            <input className="input mono" value={form.apiVersion} onChange={(e) => set({ apiVersion: e.target.value })} />
          </label>
        )}
        <div className="lab-wide lx-next">
          <span className="small muted">nextAvailableVersion:</span>
          {VERSION_ORDERS.map((order) => (
            <button key={order} type="button" className="btn btn-sm btn-ghost" onClick={() => set({ version: nextAvailableVersion(state, form.assetId, order) })}>
              {order}
            </button>
          ))}
          <span className="muted small">
            {nextVersionNote}
            <Assumed />
          </span>
        </div>
        {maven ? (
          <label className="lab-field">
            <span className="small muted">Maven Facade API version</span>
            <select className="input" value={form.facade} onChange={(e) => set({ facade: Number(e.target.value) })}>
              <option value={3}>3</option>
              <option value={2}>2</option>
              <option value={1}>1</option>
            </select>
          </label>
        ) : (
          <label className="lab-field">
            <span className="small muted">Lifecycle state</span>
            <select className="input" value={form.lifecycle} onChange={(e) => set({ lifecycle: e.target.value })}>
              <option value="stable">Stable</option>
              <option value="development">Development</option>
            </select>
          </label>
        )}
        <label className="lab-field">
          <span className="small muted">File</span>
          <input className="input mono" value={form.file} onChange={(e) => set({ file: e.target.value })} />
        </label>
        {maven && <p className="muted small lab-wide lab-note">With Maven, a version ending in -SNAPSHOT on Facade API 3 is development. Every other version is stable.</p>}
        <label className="lab-field lab-wide">
          <span className="small muted">Dependencies, as assetId:version separated by spaces</span>
          <input className="input mono" value={form.dependenciesText} onChange={(e) => set({ dependenciesText: e.target.value })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Keywords, comma separated</span>
          <input className="input" value={form.keywords} onChange={(e) => set({ keywords: e.target.value })} />
        </label>
        <label className="lab-field">
          <span className="small muted">Tags, comma separated</span>
          <input className="input" value={form.tags} onChange={(e) => set({ tags: e.target.value })} />
        </label>
      </div>
      <div className="lab-actions">
        <button className="btn btn-primary" type="submit">
          Publish
        </button>
      </div>
    </form>
  )
}

function AssetCard({ asset, state, onFill, onPromote, onDelete, onClear }) {
  const [open, setOpen] = useState(null)
  const type = typeOf(asset.typeId)

  return (
    <article className="lx-asset">
      <header className="lab-row-head">
        <b className="lab-grow">
          {asset.name} <span className="muted small mono">{asset.assetId}</span>
        </b>
        <span className="lab-badge">{type.name}</span>
      </header>
      {type.hidden && <p className="muted small lab-note">Not displayed in the Exchange catalog. Shown here so the exercise can use it.</p>}
      <ul className="lx-versions">
        {asset.versions.map((v) => (
          <li key={v.version}>
            <button className="lx-version" aria-expanded={open === v.version} onClick={() => setOpen(open === v.version ? null : v.version)}>
              <span className="mono">{v.version}</span>
              <span className={`lx-chip lx-chip-${v.lifecycle}`}>{v.lifecycle}</span>
              {v.stale && <span className="lx-chip lx-chip-stale">needs republish</span>}
              <span className="muted small lx-push">{ageOf(state, v)} days old</span>
            </button>
            {open === v.version && <VersionDetail version={v} state={state} onFill={onFill} onPromote={onPromote} onDelete={onDelete} onClear={onClear} />}
          </li>
        ))}
      </ul>
    </article>
  )
}

function VersionDetail({ version, state, onFill, onPromote, onDelete, onClear }) {
  const [target, setTarget] = useState('stable')
  const [allowReuse, setAllowReuse] = useState(false)
  const dependents = dependentsOf(state, version.assetId, version.version)
  const kind = deleteKind(state, version, allowReuse)

  return (
    <div className="lx-detail small">
      <p className="mono lx-gav">{gav(version.assetId, version.version)}</p>
      {isSnapshot(version.version) && <p className="muted lab-note">SNAPSHOT: overwritten by each publish.</p>}
      <ul className="lx-reach">
        {visibility(version).map((v) => (
          <li key={v.where} className={v.shown ? 'lx-yes' : 'lx-no'}>
            <b>{v.shown ? 'Yes' : 'No'}</b> {v.where}
            <span className="muted"> {v.why}</span>
          </li>
        ))}
      </ul>
      <dl className="lx-facts">
        <dt>File</dt>
        <dd className="mono">{version.file}</dd>
        <dt>Depends on</dt>
        <dd className="mono">{version.dependencies.join(', ') || 'Nothing'}</dd>
        <dt>Used by</dt>
        <dd className="mono">{dependents.map((d) => `${d.assetId}:${d.version}`).join(', ') || 'No assets'}</dd>
        {version.instances > 0 && (
          <>
            <dt>API instances</dt>
            <dd>{version.instances}</dd>
          </>
        )}
        {version.appliedPolicies > 0 && (
          <>
            <dt>Applied to</dt>
            <dd>{version.appliedPolicies} API instance(s)</dd>
          </>
        )}
      </dl>
      <div className="lab-actions">
        <select className="input lx-inline" aria-label="New lifecycle state" value={target} onChange={(e) => setTarget(e.target.value)}>
          {LIFECYCLE_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn btn-sm" onClick={() => onPromote(version, target)}>
          Change state
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => onFill(version)}>
          Use in form
        </button>
        {(version.instances > 0 || version.appliedPolicies > 0) && (
          <button className="btn btn-sm btn-ghost" onClick={() => onClear(version)}>
            Remove API Manager usage
            <Assumed />
          </button>
        )}
      </div>
      <div className="lab-actions">
        {state.gavReuse && (
          <label className="lab-check small lx-tight">
            <input type="checkbox" checked={allowReuse} onChange={(e) => setAllowReuse(e.target.checked)} /> Allow this GAV to be reused
          </label>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => onDelete(version, allowReuse)}>
          Delete version
        </button>
        <span className="muted">Today this would be a {kind} delete. Nothing can be restored.</span>
      </div>
    </div>
  )
}

function Reserved({ state, onFree }) {
  return (
    <>
      <h3 className="small muted lab-history-title">Reserved version numbers (soft deleted)</h3>
      {state.reserved.length === 0 && <p className="muted small lab-note">None. A stable version deleted after its first seven days appears here.</p>}
      <ul className="lab-history mono small">
        {state.reserved.map((r) => (
          <li key={`${r.assetId}:${r.version}`} className="lab-history-row">
            <span className="lab-grow">
              {r.assetId} {r.version} <span className="muted">deleted on day {r.deletedDay}</span>
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => onFree(r)}>
              Hard-delete
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function Activity({ state }) {
  if (state.activity.length === 0) return null
  return (
    <>
      <h3 className="small muted lab-history-title">Activity</h3>
      <ol className="lab-log mono small">
        {state.activity.map((a, i) => (
          <li key={i}>
            <span className="muted">Day {a.day}</span> {a.text}
            <Assumed basis={a.basis} />
          </li>
        ))}
      </ol>
    </>
  )
}
