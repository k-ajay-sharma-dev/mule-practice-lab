import { useState } from 'react'
import { defaultSettings, docsUrl, policyByType, POLICIES } from '../../lab/policies.js'

export const uid = () => Math.random().toString(36).slice(2, 10)

export function PoliciesTab({ policies, onChange }) {
  const [open, setOpen] = useState(null)
  const available = POLICIES.filter((p) => !policies.some((a) => a.type === p.type))

  function move(index, by) {
    const next = [...policies]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }

  function add(type) {
    const id = uid()
    onChange([...policies, { id, type, settings: defaultSettings(type) }])
    setOpen(id)
  }

  const setField = (id, key, value) => onChange(policies.map((p) => (p.id === id ? { ...p, settings: { ...p.settings, [key]: value } } : p)))

  return (
    <>
      <p className="muted small">Policies run from top to bottom. The first one to reject a request stops it.</p>
      {policies.length === 0 && <div className="empty-row muted">No policies applied, so every request reaches the backend.</div>}
      <ol className="lab-list">
        {policies.map((applied, index) => {
          const policy = policyByType.get(applied.type)
          return (
            <li key={applied.id} className="lab-row">
              <div className="lab-row-head">
                <span className="lab-order mono">{index + 1}</span>
                <button className="lab-row-title" aria-expanded={open === applied.id} onClick={() => setOpen(open === applied.id ? null : applied.id)}>
                  {policy.name}
                  <span className="muted small"> {policy.category}</span>
                </button>
                <button className="btn btn-sm btn-ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${policy.name} up`}>
                  Up
                </button>
                <button className="btn btn-sm btn-ghost" disabled={index === policies.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${policy.name} down`}>
                  Down
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => onChange(policies.filter((p) => p.id !== applied.id))} aria-label={`Remove ${policy.name}`}>
                  Remove
                </button>
              </div>
              {open === applied.id && (
                <div className="lab-row-body">
                  <p className="muted small">
                    {policy.summary}{' '}
                    <a href={docsUrl(policy)} target="_blank" rel="noreferrer">
                      Policy docs
                    </a>
                  </p>
                  <div className="lab-fields">
                    {policy.fields.map((f) => (
                      <Field key={f.key} field={f} value={applied.settings[f.key]} onChange={(v) => setField(applied.id, f.key, v)} />
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {available.length > 0 && (
        <label className="lab-field">
          <span className="small muted">Apply a policy</span>
          <select className="input" value="" onChange={(e) => e.target.value && add(e.target.value)}>
            <option value="">Choose a policy…</option>
            {available.map((p) => (
              <option key={p.type} value={p.type}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted small">
        Not simulated: CORS, automated policies (which always run before these) and policies applied to selected methods
        or resources. Each policy can be applied once here.
      </p>
    </>
  )
}

function Field({ field, value, onChange }) {
  return (
    <label className="lab-field">
      <span className="small muted">{field.label}</span>
      {field.type === 'select' ? (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          type={field.type}
          value={value}
          placeholder={field.hint}
          onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
    </label>
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
                  Approve
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
      <p className="muted small">Tiers set each client's quota, and only take effect through the Rate Limiting SLA policy.</p>
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
