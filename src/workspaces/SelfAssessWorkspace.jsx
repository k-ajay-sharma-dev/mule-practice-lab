import { useState } from 'react'
import FollowUps from '../components/FollowUps.jsx'
import Markdown from '../components/Markdown.jsx'
import { updateEntry, useEntry, workedStatus } from '../store/progress.js'
import { rate } from '../store/rating.js'
import { useAutosave } from './useAutosave.js'

const RATINGS = [
  { status: 'solved', label: 'Solved', hint: 'Covered the key points' },
  { status: 'attempted', label: 'Partial', hint: 'Missed some points' },
  { status: 'revisit', label: 'Revisit', hint: 'Come back to this' },
]

export default function SelfAssessWorkspace({ problem }) {
  const entry = useEntry(problem.id)
  const [answer, setAnswer] = useState(typeof entry.answer === 'string' ? entry.answer : (problem.answerTemplate ?? ''))
  const [mode, setMode] = useState('write')

  useAutosave(answer, (value) => updateEntry(problem.id, { answer: value, status: workedStatus(problem.id) }))

  const checked = (Array.isArray(entry.checkedPoints) ? entry.checkedPoints : [])
  const keyPoints = problem.keyPoints || []

  function togglePoint(i) {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i]
    updateEntry(problem.id, { checkedPoints: next })
  }

  return (
    <div className="workspace">
      <section className="panel left-panel">
        <div className="panel-tabs">
          <span className="panel-tab active">Scenario</span>
        </div>
        <div className="panel-body">
          <Markdown>{problem.description}</Markdown>
        </div>
      </section>

      <section className="panel right-panel self-panel">
        <div className="panel-tabs">
          <button className={`panel-tab ${mode === 'write' ? 'active' : ''}`} onClick={() => setMode('write')}>
            Your answer
          </button>
          <button className={`panel-tab ${mode === 'preview' ? 'active' : ''}`} onClick={() => setMode('preview')}>
            Preview
          </button>
          <span className="panel-tab-note muted small">Markdown · autosaved</span>
        </div>
        <div className="panel-body">
          {mode === 'write' ? (
            <textarea
              className="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your solution…"
            />
          ) : (
            <div className="answer-preview">
              <Markdown>{answer || '_Nothing written yet._'}</Markdown>
            </div>
          )}

          {!entry.revealed ? (
            <div className="reveal-gate">
              <p className="muted">Done? Compare your answer with the reference and check off what you covered.</p>
              <button className="btn btn-primary" onClick={() => updateEntry(problem.id, { revealed: true })}>
                Reveal reference answer
              </button>
            </div>
          ) : (
            <div className="reference">
              {keyPoints.length > 0 && (
                <div className="key-points">
                  <div className="section-title">
                    Key points <span className="muted">({checked.length} / {keyPoints.length} covered)</span>
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
          )}

          <div className="section-title">Notes</div>
          <textarea
            className="notes"
            placeholder="Anything to remember…"
            value={entry.notes || ''}
            onChange={(e) => updateEntry(problem.id, { notes: e.target.value })}
          />
        </div>
      </section>
    </div>
  )
}
