import FollowUps from './FollowUps.jsx'
import Markdown from './Markdown.jsx'
import { updateEntry, useEntry } from '../store/progress.js'
import { rate } from '../store/rating.js'

const RATINGS = [
  { status: 'solved', label: 'Solved', hint: 'Covered the key points' },
  { status: 'attempted', label: 'Partial', hint: 'Missed some points' },
  { status: 'revisit', label: 'Revisit', hint: 'Come back to this' },
]

// "Explain it" tab: interviews are spoken, so after the exercise the learner practises explaining
// the answer out loud, then compares with key points, the reference answer and follow-up questions.
export default function ExplainPanel({ problem, children }) {
  const entry = useEntry(problem.id)
  const checked = (Array.isArray(entry.checkedPoints) ? entry.checkedPoints : [])
  const keyPoints = problem.keyPoints || []

  function togglePoint(i) {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    updateEntry(problem.id, { checkedPoints: next })
  }

  if (!entry.revealed) {
    return (
      <div className="reveal-gate">
        <p className="muted">
          Interviewers ask you to <b>explain</b> it. Say your answer out loud first
          {problem.answerTemplate ? ', covering these points:' : '.'}
        </p>
        {problem.answerTemplate && (
          <ul className="explain-prompts">
            {[...problem.answerTemplate.matchAll(/^#+\s*(.+)$/gm)].map((m) => (
              <li key={m[1]}>{m[1]}</li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary" onClick={() => updateEntry(problem.id, { revealed: true })}>
          Reveal reference answer
        </button>
      </div>
    )
  }

  return (
    <div className="reference">
      {children}
      {keyPoints.length > 0 && (
        <div className="key-points">
          <div className="section-title">
            Key points{' '}
            <span className="muted">
              ({checked.length} / {keyPoints.length} covered)
            </span>
          </div>
          {keyPoints.map((kp, i) => (
            <label key={i} className="key-point">
              <input type="checkbox" checked={checked.includes(i)} onChange={() => togglePoint(i)} />
              <span>{kp}</span>
            </label>
          ))}
        </div>
      )}
      <div className="section-title">Reference answer</div>
      <Markdown>{problem.solution}</Markdown>
      <FollowUps items={problem.followUps} />
      <div className="section-title">How did you do?</div>
      <div className="rating">
        {RATINGS.map((r) => (
          <button
            key={r.status}
            className={`btn rating-btn rating-${r.status} ${entry.status === r.status ? 'active' : ''}`}
            onClick={() => rate(problem.id, r.status)}
            title={r.hint}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
