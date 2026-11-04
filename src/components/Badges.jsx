import { STATUSES } from '../data/categories.js'

export function LevelBadge({ level }) {
  return <span className={`level level-${level.toLowerCase()}`}>{level}</span>
}

const STATUS_ICON = { 'not-started': '○', attempted: '◐', solved: '●', revisit: '↻' }

export function StatusBadge({ status }) {
  const label = STATUSES.find((s) => s.value === status)?.label ?? status
  return (
    <span className={`status status-${status}`}>
      <span aria-hidden="true">{STATUS_ICON[status]}</span> {label}
    </span>
  )
}

export function Tags({ tags }) {
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          #{t}
        </span>
      ))}
    </span>
  )
}
