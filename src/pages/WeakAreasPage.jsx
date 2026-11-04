import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProblemList from '../components/ProblemList.jsx'
import { weakAreaReport } from '../data/weakAreas.js'
import { loadBoxes } from '../store/flash.js'
import { scheduleReview, useProgress, useReview } from '../store/progress.js'

const SHOWN_PER_TOPIC = 5
const REVIEW_SET = 10

function readMocks() {
  try {
    const list = JSON.parse(localStorage.getItem('pl.mock.history'))
    return Array.isArray(list) ? list.filter((m) => m && Array.isArray(m.results)) : []
  } catch {
    return []
  }
}

export default function WeakAreasPage() {
  const progress = useProgress()
  const review = useReview()
  const [added, setAdded] = useState(null)
  const report = useMemo(() => weakAreaReport({ progress, review, boxes: loadBoxes(), mocks: readMocks() }), [progress, review])

  function addToReview(list) {
    const fresh = list.filter((p) => !review[p.id])
    fresh.forEach((p) => scheduleReview(p.id))
    setAdded(fresh.length)
  }

  const reasons = (p) => <span className="muted small">{[...report.signals.get(p.id).reasons].join(' · ')}</span>

  return (
    <div className="weak-page">
      <p className="eyebrow">// weak areas</p>
      <h1>Weak Areas</h1>
      <p className="muted">
        Topics ranked by what you keep missing: problems marked <b>Revisit</b>, problems on your review schedule, misses
        in mock interviews, and cards you answered <b>Again</b> or <b>Missed</b>. Topics overlap, so one problem can appear
        under several.
      </p>

      {report.needWork.length === 0 ? (
        <div className="empty-row muted problem-table">
          Nothing to report yet. Solve problems, run a <Link to="/mock">mock interview</Link> or try{' '}
          <Link to="/interview">Interview Practice</Link>, and your weak areas will show up here.
        </div>
      ) : (
        <>
          <div className="weak-actions no-print">
            <button className="btn btn-primary" onClick={() => addToReview(report.needWork.slice(0, REVIEW_SET))}>
              Add my {Math.min(REVIEW_SET, report.needWork.length)} weakest to Review
            </button>
            <Link className="btn" to="/review">
              Open Review
            </Link>
          </div>
          {added !== null && (
            <p className="muted small">
              {added ? `${added} added: due tomorrow on the Review page.` : 'Those are already on your review schedule.'}
            </p>
          )}

          <h2 className="section-heading">
            Weakest topics <span className="muted">({report.weak.length})</span>
          </h2>
          {report.weak.map((t) => (
            <section key={t.track.slug} className="weak-topic">
              <div className="weak-head">
                <div>
                  <h3>{t.track.title}</h3>
                  <span className="muted small">
                    {t.problems.length} need work · {t.solved} of {t.total} solved
                  </span>
                </div>
                <div className="weak-actions">
                  <button className="btn btn-sm" onClick={() => addToReview(t.problems.slice(0, SHOWN_PER_TOPIC))}>
                    Add to Review
                  </button>
                  <Link className="btn btn-sm btn-ghost" to={`/tracks/${t.track.slug}`}>
                    Open track
                  </Link>
                </div>
              </div>
              <ProblemList items={t.problems.slice(0, SHOWN_PER_TOPIC)} extra={reasons} />
            </section>
          ))}
        </>
      )}

      {report.untouched.length > 0 && (
        <>
          <h2 className="section-heading">
            Not practised yet <span className="muted">({report.untouched.length})</span>
          </h2>
          <div className="search-examples">
            {report.untouched.map((t) => (
              <Link key={t.track.slug} className="chip-btn" to={`/tracks/${t.track.slug}`}>
                {t.track.title} <span className="muted">{t.total}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
