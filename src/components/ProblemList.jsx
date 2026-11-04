import { Link } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { EXERCISE_LABELS, exerciseOf } from '../data/exercises.js'
import { statusOf, useProgress } from '../store/progress.js'
import { LevelBadge, StatusBadge, Tags } from './Badges.jsx'

// Compact cross-category problem rows, used by search, tracks, review and mock-interview results.
export default function ProblemList({ items, start = 0, numbered = false, extra, empty = 'Nothing here yet.' }) {
  const progress = useProgress()
  if (!items.length) return <div className="problem-table"><div className="empty-row muted">{empty}</div></div>
  return (
    <div className="problem-table">
      {items.map((p, i) => (
        <Link key={p.id} to={`/${p.category}/${p.id}`} className="problem-row list-row">
          <span className="row-num">{numbered ? String(start + i + 1).padStart(2, '0') : ''}</span>
          <span className="row-title">
            <span className="title">{p.title}</span>
            <span className="row-meta">
              <span className="mono muted">{p.id.toUpperCase()}</span>
              <span className="muted small">{categoryBySlug.get(p.category)?.label}</span>
              <span className={`mode-chip mode-${exerciseOf(p)}`}>{EXERCISE_LABELS[exerciseOf(p)]}</span>
              <Tags tags={p.tags} />
            </span>
            {extra?.(p)}
          </span>
          <span>
            <LevelBadge level={p.level} />
          </span>
          <span className="mono muted">{p.estMinutes}m</span>
          <span>
            <StatusBadge status={statusOf(progress[p.id])} />
          </span>
        </Link>
      ))}
    </div>
  )
}
