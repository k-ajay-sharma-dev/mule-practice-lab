import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const Btn = ({ kind = 'default', className = '', ...props }) => <button type="button" className={`pc-btn pc-btn-${kind} ${className}`} {...props} />
export const Link = (props) => <button type="button" className="pc-link" {...props} />

export function Field({ label, required, hint, wide, children }) {
  return (
    <label className={`pc-field${wide ? ' pc-wide' : ''}`}>
      <span className="pc-label">
        {label}
        {required && <i> *</i>}
      </span>
      {children}
      {hint && <small className="pc-hint">{hint}</small>}
    </label>
  )
}
export const Input = ({ value, onChange, ...props }) => <input className="pc-input" value={value ?? ''} onChange={(e) => onChange(props.type === 'number' ? Number(e.target.value) : e.target.value)} {...props} />
export const Select = ({ value, onChange, options, placeholder, ...props }) => (
  <select className="pc-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...props}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => {
      const [v, label] = Array.isArray(o) ? o : [o, String(o)]
      return (
        <option key={v} value={v}>
          {label}
        </option>
      )
    })}
  </select>
)
export const Check = ({ checked, onChange, children, ...props }) => (
  <label className="pc-check">
    <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} {...props} />
    <span>{children}</span>
  </label>
)
export function RadioCards({ value, onChange, options }) {
  return (
    <div className="pc-cards" role="radiogroup">
      {options.map(([v, title, text, off]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={off} title={off ? 'Not part of the lab' : undefined} className={`pc-card${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>
          <span className="pc-radio" />
          <span>
            <b>{title}</b>
            {text && <small>{text}</small>}
          </span>
        </button>
      ))}
    </div>
  )
}
export function Radios({ value, onChange, options, name }) {
  return (
    <div className="pc-radios">
      {options.map(([v, title, text, off]) => (
        <label key={v} className={`pc-check${off ? ' off' : ''}`} title={off ? 'Not part of the lab' : undefined}>
          <input type="radio" name={name} checked={value === v} disabled={off} onChange={() => onChange(v)} />
          <span>
            {title}
            {text && <small>{text}</small>}
          </span>
        </label>
      ))}
    </div>
  )
}

export function Tabs({ tabs, value, onChange, kind = 'line' }) {
  return (
    <div className={`pc-tabs pc-tabs-${kind}`} role="tablist">
      {tabs.map((t) => (
        <button key={t} type="button" role="tab" aria-selected={value === t} className={value === t ? 'on' : ''} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function Table({ heads, rows, empty = 'Nothing here yet.' }) {
  return (
    <div className="pc-table-box">
      <table className="pc-table">
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="pc-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export const Dot = ({ status }) => {
  const good = ['Running', 'Active', 'Started', 'approved', 'OK', 'Succeeded'].includes(status)
  const bad = ['Failed', 'Alerting', 'rejected', 'revoked'].includes(status)
  const name = status[0].toUpperCase() + status.slice(1)
  return (
    <span className={`pc-status ${good ? 'good' : bad ? 'bad' : 'idle'}`}>
      <i />
      {name}
    </span>
  )
}

export function Modal({ title, onClose, children, foot, wide }) {
  const box = useRef(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const before = document.activeElement
    box.current?.querySelector('input, select, textarea, button')?.focus()
    const key = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      before?.focus?.()
    }
  }, [])
  return createPortal(
    <div className="pc-skin pc-modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`pc-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="pc-modal-head">
          <h3>{title}</h3>
          <button type="button" className="pc-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pc-modal-body">{children}</div>
        {foot && <div className="pc-modal-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  )
}

export const Errors = ({ list }) =>
  list.length > 0 && (
    <ul className="pc-errors" role="alert">
      {list.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )
export const Note = ({ children }) => <p className="pc-note">{children}</p>
export const Copy = ({ text }) => {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="pc-copy"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => setDone(true),
          () => {},
        )
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

// A left menu. Each item is [key, label], null for a line, or { title } for a heading. An item with `off` is shown only.
export function SideNav({ items, value, onPick, env, onEnv, back }) {
  return (
    <nav className="pc-side" aria-label="Section">
      {onEnv && (
        <button type="button" className="pc-env" onClick={onEnv} title="Change environment">
          {env.toUpperCase()}
        </button>
      )}
      {back && (
        <button type="button" className="pc-back" onClick={back[1]}>
          ← {back[0]}
        </button>
      )}
      {items.map((item, i) =>
        item === null ? (
          <hr key={i} />
        ) : item.title ? (
          <b key={i} className="pc-side-title">
            {item.title}
          </b>
        ) : (
          <button key={item[0]} type="button" disabled={item[2]} title={item[2] ? 'Not part of the lab' : undefined} className={value === item[0] ? 'on' : ''} aria-current={value === item[0] ? 'page' : undefined} onClick={() => onPick(item[0])}>
            {item[1]}
          </button>
        ),
      )}
    </nav>
  )
}

const W = 340
const H = 130
const L = 38
const nice = (max) => {
  const step = 10 ** Math.floor(Math.log10(max || 1))
  return [1, 2, 5, 10].map((m) => m * step).find((x) => x >= max) ?? max
}
// series: [{ name, color, points: number[] }], one point per time bucket. null leaves a gap.
export function Chart({ title, series, labels, unit = '', max }) {
  const [at, setAt] = useState(null)
  const top = max ?? nice(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p ?? 0))))
  const n = labels.length
  const x = (i) => L + (i * (W - L - 8)) / Math.max(1, n - 1)
  const y = (v) => 10 + (H - 32) * (1 - v / top)
  const path = (points) => points.map((p, i) => (p === null ? '' : `${i === 0 || points[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`)).join(' ')
  const pick = (e) => {
    const box = e.currentTarget.getBoundingClientRect()
    setAt(Math.max(0, Math.min(n - 1, Math.round((((e.clientX - box.left) / box.width) * W - L) / ((W - L - 8) / Math.max(1, n - 1))))))
  }
  return (
    <figure className="pc-chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${series.map((s) => `${s.name}: ${s.points.at(-1) ?? 'no data'}${unit} at the end, highest ${Math.max(0, ...s.points.map((p) => p ?? 0))}${unit}`).join('. ')}`} onMouseMove={pick} onMouseLeave={() => setAt(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - 8} y1={y(top * f)} y2={y(top * f)} className="pc-grid" />
            <text x={L - 5} y={y(top * f) + 3} textAnchor="end">
              {Math.round(top * f * 10) / 10}
            </text>
          </g>
        ))}
        {[0, Math.floor(n / 2), n - 1].map((i, k) => (
          <text key={k} x={x(i)} y={H - 8} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}>
            {labels[i]}
          </text>
        ))}
        {series.map((s) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
        ))}
        {/* a point with nothing on either side has no line to show it */}
        {series.map((s) => s.points.map((p, i) => p !== null && (s.points[i - 1] ?? null) === null && (s.points[i + 1] ?? null) === null && <circle key={s.name + i} cx={x(i)} cy={y(p)} r="3" fill={s.color} />))}
        {at !== null && (
          <>
            <line x1={x(at)} x2={x(at)} y1={10} y2={H - 22} className="pc-cross" />
            {series.map((s) => s.points[at] !== null && <circle key={s.name} cx={x(at)} cy={y(s.points[at])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />)}
          </>
        )}
      </svg>
      <div className="pc-legend">
        {at !== null && <b>{labels[at]}</b>}
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
            {at !== null && ` ${s.points[at] ?? 'no data'}${s.points[at] === null ? '' : unit}`}
          </span>
        ))}
      </div>
    </figure>
  )
}
