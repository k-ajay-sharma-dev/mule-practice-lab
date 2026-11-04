import { Link } from 'react-router-dom'
import { problemById } from '../data/problems.js'
import { REVIEW_INTERVALS, removeReview, reviewOutcome, todayKey, useReview } from '../store/progress.js'
import ProblemList from '../components/ProblemList.jsx'

function dueLabel(due) {
  const days = Math.round((new Date(`${due}T00:00:00`) - new Date(`${todayKey()}T00:00:00`)) / 86400000)
  if (days < 0) return `overdue ${-days}d`
  if (days === 0) return 'due today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

export default function ReviewPage() {
  const review = useReview()
  const today = todayKey()
  const items = Object.entries(review)
    .map(([id, r]) => ({ ...r, problem: problemById.get(id) }))
    .filter((r) => r.problem)
    .sort((a, b) => a.due.localeCompare(b.due))
  const due = items.filter((r) => r.due <= today)
  const upcoming = items.filter((r) => r.due > today)
  const byId = new Map(items.map((r) => [r.problem.id, r]))

  const stage = (p) => {
    const r = byId.get(p.id)
    return (
      <span className="review-meta small">
        <span className={r.due <= today ? 'warn-text' : 'muted'}>{dueLabel(r.due)}</span>
        <span className="muted">
          · step {r.step + 1} of {REVIEW_INTERVALS.length}
        </span>
      </span>
    )
  }

  return (
    <div className="review-page">
      <p className="eyebrow">// spaced review</p>
      <h1>Review</h1>
      <p className="muted">
        Problems you missed, rated <b>Partial</b> or marked <b>Revisit</b> come back after{' '}
        {REVIEW_INTERVALS.join(', ')} days. Solve one again when it is due — or explain it out loud and mark it below —
        to push it further out. After the last step it leaves the list.
      </p>

      <h2 className="section-heading">
        Due now <span className="muted">({due.length})</span>
      </h2>
      {due.length ? (
        <div className="review-due">
          {due.map((r) => (
            <div key={r.problem.id} className="review-card">
              <ProblemList items={[r.problem]} extra={stage} />
              <div className="review-actions">
                <span className="muted small">Explained it without looking?</span>
                <button className="btn btn-sm" onClick={() => reviewOutcome(r.problem.id, true)}>
                  Got it
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => reviewOutcome(r.problem.id, false)}>
                  Again
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-row muted problem-table">Nothing due. Nice work — keep solving new problems.</div>
      )}

      <h2 className="section-heading">
        Coming up <span className="muted">({upcoming.length})</span>
      </h2>
      <ProblemList
        items={upcoming.map((r) => r.problem)}
        extra={(p) => (
          <span className="review-meta small">
            {stage(p)}
            <button
              className="link-btn small"
              onClick={(e) => {
                e.preventDefault()
                removeReview(p.id)
              }}
            >
              remove
            </button>
          </span>
        )}
        empty="Nothing scheduled yet. Missed answers, Partial and Revisit ratings land here."
      />
      <p className="muted small">
        Tip: use <Link to="/flashcards">Flashcards</Link> for a quick daily warm-up on interview follow-ups.
      </p>
    </div>
  )
}
