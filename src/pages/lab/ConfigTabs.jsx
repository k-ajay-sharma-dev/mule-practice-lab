import { useState } from 'react'
import { effectivePolicies, MAX_NODES, newTopology, nodeNotes, topologyOf } from '../../lab/engine.js'
import { defaultSettings, docsUrl, HTTP_METHODS, LEVEL_DOCS, policyByType, POLICIES } from '../../lab/policies.js'
import Assumed from './Assumed.jsx'

export const uid = () => Math.random().toString(36).slice(2, 10)

const isPinned = (applied) => policyByType.get(applied.type).pinned === true

export function PoliciesTab({ policies, automated = [], onChange, onAutomatedChange }) {
  const [open, setOpen] = useState(null)
  const shown = [...policies.filter(isPinned), ...policies.filter((p) => !isPinned(p))]
  const pinnedCount = shown.filter(isPinned).length
  const { chain, overridden } = effectivePolicies({ policies, automated })
  const position = (id) => chain.findIndex((p) => p.id === id) + 1
  const automatedTypes = new Set(automated.map((p) => p.type))
  const available = POLICIES.filter((p) => !policies.some((a) => a.type === p.type) && !automatedTypes.has(p.type))
  const availableAutomated = POLICIES.filter((p) => !automatedTypes.has(p.type))

  function move(index, by) {
    const next = [...shown]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }

  function add(type) {
    const id = uid()
    onChange([...policies, { id, type, settings: defaultSettings(type) }])
    setOpen(id)
  }

  function addAutomated(type) {
    const id = uid()
    onAutomatedChange([...automated, { id, type, settings: defaultSettings(type) }])
    setOpen(id)
  }

  const patch = (list, save, id, change) => save(list.map((p) => (p.id === id ? { ...p, ...change } : p)))
  const toggle = (id) => setOpen(open === id ? null : id)

  return (
    <>
      <p className="muted small">
        Policies run from top to bottom, and the first one to reject a request stops it. CORS always runs first, then automated policies, then the policies
        applied to this API.{' '}
        <a href={LEVEL_DOCS.reorder} target="_blank" rel="noreferrer">
          Order docs
        </a>
      </p>

      {onAutomatedChange && (
        <>
          <h3 className="small muted lab-history-title">
            Automated policies{' '}
            <a href={LEVEL_DOCS.automated} target="_blank" rel="noreferrer">
              Docs
            </a>
          </h3>
          {automated.length === 0 && <p className="muted small">None. An automated policy applies to every API in the environment.</p>}
          <ol className="lab-list">
            {automated.map((applied) => (
              <PolicyRow
                key={applied.id}
                applied={applied}
                order={position(applied.id)}
                open={open === applied.id}
                onToggle={() => toggle(applied.id)}
                onPatch={(change) => patch(automated, onAutomatedChange, applied.id, change)}
                onRemove={() => onAutomatedChange(automated.filter((p) => p.id !== applied.id))}
                note={isPinned(applied) ? 'Fixed first' : 'Before API level'}
              />
            ))}
          </ol>
          {availableAutomated.length > 0 && <PolicyPicker label="Apply an automated policy" policies={availableAutomated} onPick={addAutomated} />}
          <h3 className="small muted lab-history-title">Policies on this API</h3>
        </>
      )}

      {policies.length === 0 && <div className="empty-row muted">No policies applied to this API.</div>}
      <ol className="lab-list">
        {shown.map((applied, index) => {
          const disabled = overridden.includes(applied)
          return (
            <PolicyRow
              key={applied.id}
              applied={applied}
              order={disabled ? '-' : position(applied.id)}
              open={open === applied.id}
              disabled={disabled}
              onToggle={() => toggle(applied.id)}
              onPatch={(change) => patch(policies, onChange, applied.id, change)}
              onRemove={() => onChange(policies.filter((p) => p.id !== applied.id))}
              onUp={index > pinnedCount ? () => move(index, -1) : null}
              onDown={index >= pinnedCount && index < shown.length - 1 ? () => move(index, 1) : null}
              note={isPinned(applied) ? 'Fixed first' : null}
            />
          )
        })}
      </ol>
      {available.length > 0 && <PolicyPicker label="Apply a policy" policies={available} onPick={add} />}
      <p className="muted small">
        Not simulated: several CORS groups, duplicate policies, the version range and coverage rules of automated policies, disabling outbound policies, several
        limits on one SLA tier, SOAP APIs, token caching, and persistence of quota across restarts. Mule Gateway supports duplicates, but here each policy can be
        applied once at each level.
      </p>
    </>
  )
}

function PolicyPicker({ label, policies, onPick }) {
  return (
    <label className="lab-field">
      <span className="small muted">{label}</span>
      <select className="input" value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
        <option value="">Choose a policy…</option>
        {policies.map((p) => (
          <option key={p.type} value={p.type}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function PolicyRow({ applied, order, open, disabled, note, onToggle, onPatch, onRemove, onUp, onDown }) {
  const policy = policyByType.get(applied.type)
  const setField = (key, value) => onPatch({ settings: { ...applied.settings, [key]: value } })
  const visible = policy.fields.filter((f) => !f.when || (applied.settings[f.when[0]] ?? '') === f.when[1])
  const scoped = (applied.conditions ?? []).length > 0

  return (
    <li className={`lab-row${disabled ? ' lab-row-off' : ''}`}>
      <div className="lab-row-head">
        <span className="lab-order mono">{order}</span>
        <button className="lab-row-title" aria-expanded={open} onClick={onToggle}>
          {policy.name}
          <span className="muted small"> {policy.category}</span>
        </button>
        {scoped && <span className="lab-badge lab-pending">Conditions</span>}
        {note && <span className="muted small">{note}</span>}
        {onUp !== undefined && (
          <>
            <button className="btn btn-sm btn-ghost" disabled={!onUp} onClick={onUp ?? undefined} aria-label={`Move ${policy.name} up`}>
              Up
            </button>
            <button className="btn btn-sm btn-ghost" disabled={!onDown} onClick={onDown ?? undefined} aria-label={`Move ${policy.name} down`}>
              Down
            </button>
          </>
        )}
        <button className="btn btn-sm btn-ghost" onClick={onRemove} aria-label={`Remove ${policy.name}`}>
          Remove
        </button>
      </div>
      {disabled && <p className="muted small lab-row-note">Disabled: an automated policy of this type has priority. It returns if the automated policy is removed.</p>}
      {open && (
        <div className="lab-row-body">
          <p className="muted small">
            {policy.summary}{' '}
            <a href={docsUrl(policy)} target="_blank" rel="noreferrer">
              Policy docs
            </a>
          </p>
          <div className="lab-fields">
            {visible.map((f) =>
              f.type === 'limits' ? (
                <LimitsField key={f.key} field={f} value={applied.settings[f.key] ?? []} onChange={(v) => setField(f.key, v)} />
              ) : (
                <Field key={f.key} field={f} value={applied.settings[f.key]} onChange={(v) => setField(f.key, v)} />
              ),
            )}
          </div>
          {policy.resourceLevel !== false && <Conditions conditions={applied.conditions ?? []} onChange={(conditions) => onPatch({ conditions })} />}
        </div>
      )}
    </li>
  )
}

function Field({ field, value, onChange }) {
  const current = value ?? field.value
  return (
    <label className="lab-field">
      <span className="small muted">{field.label}</span>
      {field.type === 'select' ? (
        <select className="input" value={current} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={field.type}
          value={current}
          placeholder={field.hint}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
    </label>
  )
}

function LimitsField({ field, value, onChange }) {
  const edit = (index, change) => onChange(value.map((limit, i) => (i === index ? { ...limit, ...change } : limit)))
  return (
    <div className="lab-wide lab-subform">
      <span className="small muted">{field.label}. Every limit must have quota left for a request to pass.</span>
      {value.map((limit, index) => (
        <div key={index} className="lab-inline">
          <label className="lab-field">
            <span className="small muted">Number of Reqs</span>
            <input className="input" type="number" value={limit.requests} onChange={(e) => edit(index, { requests: Number(e.target.value) })} />
          </label>
          <label className="lab-field">
            <span className="small muted">Time Period (ms)</span>
            <input className="input" type="number" value={limit.periodMs} onChange={(e) => edit(index, { periodMs: Number(e.target.value) })} />
          </label>
          <button className="btn btn-sm btn-ghost" onClick={() => onChange(value.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => onChange([...value, { requests: 100, periodMs: 60000 }])}>
        Add limit
      </button>
    </div>
  )
}

function Conditions({ conditions, onChange }) {
  const edit = (index, change) => onChange(conditions.map((c, i) => (i === index ? { ...c, ...change } : c)))
  const flip = (index, method) => {
    const { methods } = conditions[index]
    edit(index, { methods: methods.includes(method) ? methods.filter((m) => m !== method) : [...methods, method] })
  }
  return (
    <div className="lab-subform">
      <span className="small muted">
        Method &amp; Resource conditions.{' '}
        <a href={LEVEL_DOCS.conditions} target="_blank" rel="noreferrer">
          Docs
        </a>
      </span>
      <label className="lab-check small">
        <input type="radio" checked={conditions.length === 0} onChange={() => onChange([])} /> Apply to all API methods and resources
      </label>
      <label className="lab-check small">
        <input type="radio" checked={conditions.length > 0} onChange={() => conditions.length === 0 && onChange([{ methods: ['GET'], resource: '/.*' }])} /> Apply to
        specific methods and resources
      </label>
      {conditions.map((condition, index) => (
        <div key={index} className="lab-condition">
          <div className="lab-inline">
            {HTTP_METHODS.map((m) => (
              <label key={m} className="lab-check small">
                <input type="checkbox" checked={condition.methods.includes(m)} onChange={() => flip(index, m)} /> {m}
              </label>
            ))}
          </div>
          <div className="lab-inline">
            <label className="lab-field lab-grow">
              <span className="small muted">
                URI template regex
                <Assumed note="A regular expression is on the docs page, and on a real API it must include the base path unless ignoreBasePath is set. The lab API has no base path. Matching against the whole path, no ticked method meaning every method, and matching any one condition are the simulator's reading." />
              </span>
              <input className="input mono" value={condition.resource} onChange={(e) => edit(index, { resource: e.target.value })} />
            </label>
            <button className="btn btn-sm btn-ghost" onClick={() => onChange(conditions.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      {conditions.length > 0 && (
        <button className="btn btn-sm" onClick={() => onChange([...conditions, { methods: ['GET'], resource: '/.*' }])}>
          Add condition
        </button>
      )}
    </div>
  )
}

export function NodesTab({ config, onChange }) {
  const { nodes, mode } = topologyOf(config)
  const set = (change) => onChange({ ...newTopology(), ...config.topology, ...change })
  const notes = nodeNotes(config)
  return (
    <>
      <p className="muted small">
        Where the API runs. On separate nodes each node counts its own quota. In a Mule HA cluster, a policy with Distributed on shares one quota across the
        nodes. A Mule cluster is available only for Runtime Fabric, hybrid and standalone setups, not on CloudHub.
      </p>
      <div className="lab-fields">
        <label className="lab-field">
          <span className="small muted">
            Nodes running the API
            <Assumed note={`The limit of ${MAX_NODES} nodes is a lab value.`} />
          </span>
          <select className="input" value={nodes} onChange={(e) => set({ nodes: Number(e.target.value) })}>
            {Array.from({ length: MAX_NODES }, (_, i) => i + 1).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="lab-field">
          <span className="small muted">Deployment</span>
          <select className="input" value={mode} onChange={(e) => set({ mode: e.target.value })}>
            <option value="separate">Separate nodes, such as a server group</option>
            <option value="cluster">Mule HA cluster</option>
          </select>
        </label>
      </div>
      <NodeNotes notes={notes} />
    </>
  )
}

export function NodeNotes({ notes }) {
  if (notes.length === 0) return null
  return (
    <ul className="small lab-notes">
      {notes.map((note) => (
        <li key={note.text}>
          {note.text}
          <Assumed basis={note.basis} />
        </li>
      ))}
    </ul>
  )
}

export function AppsTab({ apps, tiers, onChange }) {
  const [name, setName] = useState('')
  const [tier, setTier] = useState(tiers[0]?.name ?? '')
  const edit = (id, patch) => onChange(apps.map((a) => (a.clientId === id ? { ...a, ...patch } : a)))

  function requestAccess(e) {
    e.preventDefault()
    const chosen = tiers.find((t) => t.name === tier)
    if (!name.trim() || !chosen) return
    const contract = chosen.autoApprove ? 'approved' : 'pending'
    onChange([...apps, { name: name.trim(), clientId: `lab-${uid()}`, clientSecret: `lab-${uid()}`, tier, contract }])
    setName('')
  }

  return (
    <>
      <p className="muted small">A client application calls the API through a contract. A tier without automatic approval leaves it pending.</p>
      <ul className="lab-list">
        {apps.map((a) => (
          <li key={a.clientId} className="lab-row lab-row-body">
            <div className="lab-row-head">
              <b className="lab-grow">{a.name}</b>
              <span className={`lab-badge lab-${a.contract}`}>{a.contract}</span>
            </div>
            <p className="muted small mono lab-creds">
              {a.clientId} · {a.clientSecret} · {a.tier}
            </p>
            <div className="lab-actions">
              {a.contract !== 'approved' && (
                <button className="btn btn-sm" onClick={() => edit(a.clientId, { contract: 'approved' })}>
                  {a.contract === 'revoked' ? 'Restore' : 'Approve'}
                </button>
              )}
              {a.contract === 'pending' && (
                <button className="btn btn-sm btn-ghost" onClick={() => edit(a.clientId, { contract: 'rejected' })}>
                  Reject
                </button>
              )}
              {a.contract === 'approved' && (
                <button className="btn btn-sm btn-ghost" onClick={() => edit(a.clientId, { contract: 'revoked' })}>
                  Revoke
                </button>
              )}
              <button className="btn btn-sm btn-ghost" onClick={() => onChange(apps.filter((x) => x.clientId !== a.clientId))}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="lab-fields" onSubmit={requestAccess}>
        <label className="lab-field">
          <span className="small muted">Application name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="lab-field">
          <span className="small muted">SLA tier</span>
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
            {tiers.map((t) => (
              <option key={t.name}>{t.name}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-sm" type="submit">
          Request access
        </button>
      </form>
    </>
  )
}

export function TiersTab({ tiers, onChange }) {
  const [name, setName] = useState('')
  const edit = (index, patch) => onChange(tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)))

  function add(e) {
    e.preventDefault()
    const clean = name.trim()
    if (!clean || tiers.some((t) => t.name === clean)) return
    onChange([...tiers, { name: clean, requests: 10, periodMs: 60000, autoApprove: false }])
    setName('')
  }

  return (
    <>
      <p className="muted small">Tiers set each client's quota, and only take effect through the Rate-Limiting SLA policy.</p>
      <ul className="lab-list">
        {tiers.map((t, i) => (
          <li key={t.name} className="lab-row lab-row-body">
            <div className="lab-row-head">
              <b className="lab-grow">{t.name}</b>
              <button className="btn btn-sm btn-ghost" onClick={() => onChange(tiers.filter((_, x) => x !== i))}>
                Delete
              </button>
            </div>
            <div className="lab-fields">
              <label className="lab-field">
                <span className="small muted">Requests</span>
                <input className="input" type="number" value={t.requests} onChange={(e) => edit(i, { requests: Number(e.target.value) })} />
              </label>
              <label className="lab-field">
                <span className="small muted">Time period (ms)</span>
                <input className="input" type="number" value={t.periodMs} onChange={(e) => edit(i, { periodMs: Number(e.target.value) })} />
              </label>
              <label className="lab-check small">
                <input type="checkbox" checked={t.autoApprove} onChange={(e) => edit(i, { autoApprove: e.target.checked })} /> Approve automatically
              </label>
            </div>
          </li>
        ))}
      </ul>
      <form className="lab-fields" onSubmit={add}>
        <label className="lab-field">
          <span className="small muted">New tier name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-sm" type="submit">
          Add tier
        </button>
      </form>
    </>
  )
}
