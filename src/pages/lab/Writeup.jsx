import { useId, useMemo, useState } from 'react'
import { keyPointsOf, modelWriteup, readWriteups, saveWriteup, scoreWriteup, WRITEUP_BONUS, WRITEUP_FIELDS, WRITEUP_PASS } from '../../store/lab-writeups.js'
import StarOutline from './StarOutline.jsx'

const HELP = {
  rootCause: 'What broke and why. Name the setting, the error type or the component.',
  impact: 'Who or what was hurt, and for how long.',
  fix: 'What you changed, and how you proved it worked.',
  prevention: 'What stops it from coming back, or catches it sooner.',
}
const empty = () => Object.fromEntries(WRITEUP_FIELDS.map(([k]) => [k, '']))
const pct = (r) => `${Math.round(r * 100)}%`

// After a lab is solved: a short post-incident write-up, checked against the key points of the lab, and the STAR
// outline that fills in from it. Saved in this browser only (pl.lab.writeups).
export default function PostIncident({ lab }) {
  const saved = useMemo(() => readWriteups()[lab.id], [lab.id])
  const [fields, setFields] = useState(() => (saved ? Object.fromEntries(WRITEUP_FIELDS.map(([k]) => [k, saved[k]])) : empty()))
  const [result, setResult] = useState(null) // { points, covered, total, ratio, bonus }
  const [error, setError] = useState('')
  const [showModel, setShowModel] = useState(false)
  const [best, setBest] = useState(saved?.best ?? 0)
  const id = useId()
  const total = useMemo(() => keyPointsOf(lab).length, [lab])

  function check(e) {
    e.preventDefault()
    if (!fields.rootCause.trim() || !fields.fix.trim()) {
      setError('Write at least the root cause and the fix.')
      return
    }
    setError('')
    const scored = scoreWriteup(lab, fields)
    const bonus = saveWriteup(lab.id, fields, scored)
    setBest((b) => Math.max(b, scored.ratio))
    setResult({ ...scored, bonus })
  }

  const model = showModel ? modelWriteup(lab) : null
  return (
    <section className="lab-writeup" aria-label="Post-incident write-up">
      <div className="lab-panel-head">
        <h2>Post-incident write-up</h2>
        <span className="muted small">{best > 0 ? `Best so far ${pct(best)} of the key points` : `${total} key points to cover`}</span>
      </div>
      <p className="muted small">
        Write it as you would for your team after the incident. It is checked against the key points of this lab. Cover {pct(WRITEUP_PASS)} of them for {WRITEUP_BONUS} bonus points, once per lab. Kept in this browser only.
      </p>
      <form className="lab-writeup-form" onSubmit={check} noValidate>
        {WRITEUP_FIELDS.map(([key, label]) => (
          <div key={key} className="lab-writeup-field">
            <label htmlFor={`${id}-${key}`}>
              {label}
              {(key === 'rootCause' || key === 'fix') && <span className="muted"> (needed)</span>}
            </label>
            <span id={`${id}-${key}-help`} className="muted small">
              {HELP[key]}
            </span>
            <textarea
              id={`${id}-${key}`}
              rows={3}
              value={fields[key]}
              aria-describedby={`${id}-${key}-help`}
              aria-invalid={Boolean(error) && (key === 'rootCause' || key === 'fix') && !fields[key].trim()}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
        {error && (
          <p className="lab-writeup-error small" role="alert">
            {error}
          </p>
        )}
        <div className="lab-actions">
          <button type="submit" className="btn btn-primary btn-sm">
            Check my write-up
          </button>
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showModel} onClick={() => setShowModel(!showModel)}>
            {showModel ? 'Hide the model write-up' : 'Show a model write-up'}
          </button>
        </div>
      </form>

      {result && (
        <div className="lab-result" aria-live="polite">
          <div className="lab-row-head">
            <span className={`lab-status ${result.ratio >= WRITEUP_PASS ? 'lab-s2' : 'lab-s4'}`}>
              {result.covered} of {result.total} key points
            </span>
            <span className="lab-grow small">
              {result.bonus
                ? `+${result.bonus} bonus points for this write-up.`
                : result.ratio >= WRITEUP_PASS
                  ? 'Covered. The bonus for this lab was already given.'
                  : `Cover ${Math.ceil(result.total * WRITEUP_PASS)} of them for the bonus.`}
            </span>
          </div>
          <ul className="lab-checks small">
            {result.points.map((p) => (
              <li key={p.label} className={p.hit ? 'lab-pass' : 'lab-reject'}>
                <b>{p.hit ? 'Covered' : 'Missed'}</b> {p.label}
                {p.hit && <span className="muted mono"> found "{p.hit}"</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {model && (
        <div className="lab-writeup-model small">
          <b>Model write-up</b>
          <dl>
            {WRITEUP_FIELDS.map(([key, label]) =>
              model[key] ? (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{model[key]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </div>
      )}

      <StarOutline lab={lab} writeup={fields} />
    </section>
  )
}
