import { useEffect, useId, useRef, useState } from 'react'
import { choiceLabel } from '../study/mix.js'

// A dropdown of checkboxes. An empty value means no limit, shown as allLabel.
export default function MultiPick({ label, options, value, onChange, allLabel = 'Everything' }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false)
    }
    const escape = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const chosen = options.filter((o) => value.includes(o.value))
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const groups = [...new Set(options.map((o) => o.group))]

  return (
    <div className="field multi-pick" ref={box}>
      <span id={`${panelId}-label`}>{label}</span>
      <button
        type="button"
        className="input multi-pick-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${panelId}-label`}
        onClick={() => setOpen(!open)}
      >
        <span className="multi-pick-summary">{choiceLabel(chosen.map((o) => o.label), allLabel)}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multi-pick-panel" id={panelId} role="group" aria-labelledby={`${panelId}-label`}>
          <div className="multi-pick-head">
            <span className="muted small">{chosen.length ? `${chosen.length} chosen` : 'Choose one or more'}</span>
            <button type="button" className="link-btn small" onClick={() => onChange([])} disabled={chosen.length === 0}>
              Clear
            </button>
          </div>
          {groups.map((group) => (
            <div key={group ?? 'all'}>
              {group && <p className="multi-pick-group">{group}</p>}
              {options
                .filter((o) => o.group === group)
                .map((o) => (
                  <label key={o.value} className="multi-pick-option">
                    <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                    {o.label}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
