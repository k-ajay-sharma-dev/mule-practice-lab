import { Link, useParams } from 'react-router-dom'
import { categoryBySlug } from '../data/categories.js'
import { problemById, problemsFor } from '../data/problems.js'
import { useFocusSession } from '../store/focus.js'
import { readOrigin } from '../store/origin.js'
import { removeReview, scheduleReview, statusOf, useEntry, useProgress, useReview } from '../store/progress.js'
import { LevelBadge, StatusBadge, Tags } from '../components/Badges.jsx'
import ProblemTimer from '../components/ProblemTimer.jsx'
import ProblemWorkspace from '../components/ProblemWorkspace.jsx'
import ReadOnlyLock from '../components/ReadOnlyLock.jsx'
import WideToggle from '../components/WideToggle.jsx'
import { useScrollMemory } from '../store/view.js'
import { validTimer } from '../study/timer.js'
import NotFound from './NotFound.jsx'

export default function ProblemPage() {
  const { category, problemId } = useParams()
  const entry = useEntry(problemId)
  const progress = useProgress()
  useScrollMemory(problemId)
  const inReview = Boolean(useReview()[problemId])
  const focus = useFocusSession()
  const focusing = Boolean(focus && !focus.endedAt) // the session picks the next problem, so these ways out are hidden

  const problem = problemById.get(problemId)
  const cat = categoryBySlug.get(category)
  if (!problem || !cat || problem.category !== category) return <NotFound />

  // back to the page you opened it from, such as the Learning Path or Review; otherwise its category
  const origin = readOrigin()
  const back = origin ?? { path: `/${category}`, label: cat.label }

  const siblings = problemsFor(category)
  const idx = siblings.findIndex((p) => p.id === problem.id)
  const prev = siblings[idx - 1]
  const next = siblings[idx + 1]
  // the first unsolved problem after this one, going round to the start; hidden when it is the plain Next
  let nextOpen = null
  for (let k = 1; k < siblings.length; k++) {
    const s = siblings[(idx + k) % siblings.length]
    if (statusOf(progress[s.id]) !== 'solved') {
      nextOpen = s
      break
    }
  }

  return (
    <div className="problem-page">
      <header className="problem-head">
        <div className="problem-head-main">
          <div className="problem-title-row">
            {!focusing && (
              // back to the exact page this was opened from, with its filters and scroll position (see Layout)
              <Link to={back.path} state={{ back: true }} className="head-back" title={`Back to ${back.label}`} aria-label={`Back to ${back.label}`}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </Link>
            )}
            <h1>{problem.title}</h1>
          </div>
          <div className="problem-meta">
            <span className="mono muted">{problem.id.toUpperCase()}</span>
            <LevelBadge level={problem.level} />
            <span className="mono muted">~{problem.estMinutes}m</span>
            <Tags tags={problem.tags} />
            <StatusBadge status={statusOf(entry)} />
          </div>
        </div>
        <div className="prev-next">
          <ProblemTimer key={problem.id} problem={problem} compact />
          <button
            className={`btn btn-ghost head-btn${inReview ? ' active-toggle' : ''}`}
            onClick={() => (inReview ? removeReview(problem.id) : scheduleReview(problem.id))}
            title={inReview ? 'Remove from spaced review' : 'Bring this back for spaced review'}
          >
            {inReview ? '✓ In review' : '＋ Review'}
          </button>
          {!focusing && (
            <nav className="head-nav" aria-label="Other problems">
              {prev ? (
                <Link className="btn btn-ghost head-btn" to={`/${category}/${prev.id}`} title={`Previous: ${prev.title}`}>
                  ← Prev
                </Link>
              ) : (
                <span className="btn btn-ghost head-btn disabled">← Prev</span>
              )}
              {next ? (
                <Link className="btn btn-ghost head-btn" to={`/${category}/${next.id}`} title={`Next: ${next.title}`}>
                  Next →
                </Link>
              ) : (
                <span className="btn btn-ghost head-btn disabled">Next →</span>
              )}
              {nextOpen && nextOpen.id !== next?.id && (
                <Link className="btn btn-ghost head-btn" to={`/${category}/${nextOpen.id}`} title={`Next unsolved: ${nextOpen.title}`}>
                  Unsolved →
                </Link>
              )}
            </nav>
          )}
          {!focusing && <WideToggle />}
        </div>
      </header>

      {/* a pause from the button stops the work too, so nothing can be solved off the clock */}
      <ReadOnlyLock locked={Boolean(validTimer(entry.timer)?.held)}>
        <ProblemWorkspace id={problem.id} />
      </ReadOnlyLock>
    </div>
  )
}
