import { Link, useParams } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { problemById, problemsFor } from '../data/problems.js'
import { removeReview, scheduleReview, statusOf, useEntry, useReview } from '../store/progress.js'
import { LevelBadge, StatusBadge, Tags } from '../components/Badges.jsx'
import ProblemTimer from '../components/ProblemTimer.jsx'
import ProblemWorkspace from '../components/ProblemWorkspace.jsx'
import ReadOnlyLock from '../components/ReadOnlyLock.jsx'
import { validTimer } from '../study/timer.js'
import NotFound from './NotFound.jsx'

export default function ProblemPage() {
  const { category, problemId } = useParams()
  const entry = useEntry(problemId)
  const inReview = Boolean(useReview()[problemId])

  const problem = problemById.get(problemId)
  const cat = categoryBySlug.get(category)
  if (!problem || !cat || problem.category !== category) return <NotFound />

  const siblings = problemsFor(category)
  const idx = siblings.findIndex((p) => p.id === problem.id)
  const prev = siblings[idx - 1]
  const next = siblings[idx + 1]

  return (
    <div className="problem-page">
      <header className="problem-head">
        <div className="problem-head-main">
          <Link to={`/${category}`} className="back-link">
            ← {cat.label}
          </Link>
          <h1>{problem.title}</h1>
          <div className="problem-meta">
            <span className="mono muted">{problem.id.toUpperCase()}</span>
            <LevelBadge level={problem.level} />
            <span className="mono muted">~{problem.estMinutes}m</span>
            <Tags tags={problem.tags} />
            <StatusBadge status={statusOf(entry)} />
          </div>
        </div>
        <div className="prev-next">
          <button
            className={`btn btn-ghost${inReview ? ' active-toggle' : ''}`}
            onClick={() => (inReview ? removeReview(problem.id) : scheduleReview(problem.id))}
            title={inReview ? 'Remove from spaced review' : 'Bring this back for spaced review'}
          >
            {inReview ? '✓ In review' : '＋ Review'}
          </button>
          {prev ? (
            <Link className="btn btn-ghost" to={`/${category}/${prev.id}`} title={prev.title}>
              ← Prev
            </Link>
          ) : (
            <span className="btn btn-ghost disabled">← Prev</span>
          )}
          {next ? (
            <Link className="btn btn-ghost" to={`/${category}/${next.id}`} title={next.title}>
              Next →
            </Link>
          ) : (
            <span className="btn btn-ghost disabled">Next →</span>
          )}
        </div>
      </header>

      <ProblemTimer key={problem.id} problem={problem} />
      {/* a pause from the button stops the work too, so nothing can be solved off the clock */}
      <ReadOnlyLock locked={Boolean(validTimer(entry.timer)?.held)}>
        <ProblemWorkspace id={problem.id} />
      </ReadOnlyLock>
    </div>
  )
}
