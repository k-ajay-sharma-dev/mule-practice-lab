import { useMemo, useState } from 'react'
import Markdown from '../components/Markdown.jsx'
import { EXERCISES, GUIDE, KINDS, LEVELS } from '../logging/exercises.js'
import { grade } from '../logging/grade.js'
import { recordAttempt, resetLogging, useLoggingProgress } from '../store/logging.js'

const FILTERS = [['all', 'All'], ...Object.entries(KINDS)]

// Logging Lab: practice for the Mule Logger only. Pick the level, pick the best wording, spot what is wrong in a
// logger, and write your own logger message, checked against the rules in the guide.
export default function LoggingPage() {
  const progress = useLoggingProgress()
  const [filter, setFilter] = useState('all')
  const list = useMemo(() => EXERCISES.filter((e) => filter === 'all' || e.kind === filter), [filter])
  const firstOpen = (items) => Math.max(0, items.findIndex((e) => !progress[e.id]?.solved))
  const [at, setAt] = useState(() => firstOpen(EXERCISES))
  const exercise = list[Math.min(at, list.length - 1)]
  const solved = EXERCISES.filter((e) => progress[e.id]?.solved).length

  function choose(key) {
    const next = EXERCISES.filter((e) => key === 'all' || e.kind === key)
    setFilter(key)
    setAt(firstOpen(next))
  }

  return (
    <div className="logging-page">
      <p className="eyebrow">// logging lab</p>
      <h1>Logging Lab</h1>
      <p className="muted">
        Practice the Mule Logger: which level, what to write, and what never to write. Every answer is checked here, and
        your progress is saved like the rest of your study.
      </p>

      <details className="logging-guide">
        <summary>The rules for good log lines (read this first)</summary>
        <Markdown>{GUIDE}</Markdown>
      </details>

      <div className="logging-bar">
        <span className="small">
          <b>{solved}</b> of {EXERCISES.length} solved
        </span>
        <div className="logging-filters" role="tablist">
          {FILTERS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={filter === key} className={`chip${filter === key ? ' active' : ''}`} onClick={() => choose(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <nav className="logging-dots" aria-label="Exercises">
        {list.map((e, i) => (
          <button
            key={e.id}
            className={`logging-dot${e === exercise ? ' current' : ''}${progress[e.id]?.solved ? ' solved' : progress[e.id] ? ' tried' : ''}`}
            onClick={() => setAt(i)}
            title={`${i + 1}. ${KINDS[e.kind]}${progress[e.id]?.solved ? ' (solved)' : ''}`}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      {exercise && (
        <Exercise
          key={exercise.id}
          exercise={exercise}
          number={list.indexOf(exercise) + 1}
          solvedBefore={Boolean(progress[exercise.id]?.solved)}
          onNext={list.indexOf(exercise) < list.length - 1 ? () => setAt(list.indexOf(exercise) + 1) : null}
        />
      )}

      {solved > 0 && (
        <p className="muted small logging-reset">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => confirm('Clear which Logging Lab exercises you have solved?') && resetLogging()}
          >
            Start the lab again
          </button>
        </p>
      )}
    </div>
  )
}

function Exercise({ exercise, number, solvedBefore, onNext }) {
  const [answer, setAnswer] = useState(exercise.kind === 'multi' ? [] : exercise.kind === 'write' ? { level: '', message: '' } : null)
  const [result, setResult] = useState(null)
  const [showModel, setShowModel] = useState(false) // after a wrong try, the good answer waits until asked for
  const checked = Boolean(result)

  function check() {
    const r = grade(exercise, answer)
    setResult(r)
    recordAttempt(exercise.id, r.correct)
  }

  const ready =
    exercise.kind === 'multi' ? answer.length > 0 : exercise.kind === 'write' ? answer.level && answer.message.trim() : answer != null

  return (
    <section className="logging-card">
      <div className="logging-card-head">
        <span className="mono small muted">
          {number}. {KINDS[exercise.kind]}
        </span>
        {solvedBefore && <span className="small logging-solved">✓ Solved before</span>}
      </div>
      <p className="logging-situation">{exercise.situation}</p>
      {exercise.code && <pre className="code-block logging-code">{exercise.code}</pre>}

      {exercise.kind === 'level' && (
        <div className="logging-levels">
          {LEVELS.map((l) => (
            <button
              key={l}
              className={`btn${answer === l ? ' btn-primary' : ''}${checked && exercise.answer.includes(l) ? ' logging-right' : ''}`}
              onClick={() => !checked && setAnswer(l)}
              disabled={checked && answer !== l && !exercise.answer.includes(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {(exercise.kind === 'choice' || exercise.kind === 'multi') && (
        <ul className="logging-options">
          {exercise.options.map((o, i) => {
            const picked = exercise.kind === 'multi' ? answer.includes(i) : answer === i
            const right = exercise.kind === 'multi' ? exercise.answers.includes(i) : exercise.answer === i
            const mark = checked ? (right ? 'right' : picked ? 'wrong' : '') : ''
            return (
              <li key={i}>
                <label className={`logging-option${picked ? ' picked' : ''}${mark ? ` ${mark}` : ''}`}>
                  <input
                    type={exercise.kind === 'multi' ? 'checkbox' : 'radio'}
                    name={exercise.id}
                    checked={picked}
                    disabled={checked}
                    onChange={() =>
                      setAnswer((a) => (exercise.kind === 'multi' ? (a.includes(i) ? a.filter((x) => x !== i) : [...a, i]) : i))
                    }
                  />
                  <span className={exercise.kind === 'choice' ? 'mono small' : ''}>{o}</span>
                  {checked && right && <span className="logging-tag">{exercise.kind === 'multi' ? 'applies' : 'best'}</span>}
                </label>
              </li>
            )
          })}
        </ul>
      )}

      {exercise.kind === 'write' && (
        <div className="logging-write">
          <div className="small muted logging-available">
            You can use:
            {exercise.available.map((a) => (
              <code key={a}>{a}</code>
            ))}
          </div>
          <div className="logging-field">
            <span className="small">Level</span>
            <div className="seg">
              {LEVELS.map((l) => (
                <button key={l} className={answer.level === l ? 'active' : ''} onClick={() => setAnswer((a) => ({ ...a, level: l }))} disabled={checked}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <label className="logging-field">
            <span className="small">Message (the message attribute of the Logger)</span>
            <textarea
              className="input mono logging-message"
              rows={3}
              spellCheck={false}
              placeholder={'#["Order received orderId=$(vars.orderId) correlationId=$(correlationId)"]'}
              value={answer.message}
              readOnly={checked}
              onChange={(e) => {
                const message = e.target.value
                setAnswer((a) => ({ ...a, message }))
              }}
            />
          </label>
        </div>
      )}

      <div className="settings-actions">
        {!checked ? (
          <button className="btn btn-primary" onClick={check} disabled={!ready}>
            Check
          </button>
        ) : (
          <>
            {!result.correct && (
              <button className="btn" onClick={() => setResult(null)}>
                Try again
              </button>
            )}
            {onNext && (
              <button className={`btn${result.correct ? ' btn-primary' : ''}`} onClick={onNext}>
                Next →
              </button>
            )}
          </>
        )}
      </div>

      {checked && (
        <div className={`logging-result ${result.correct ? 'pass' : 'fail'}`}>
          <div className="logging-verdict">{result.correct ? '✓ Correct' : '✗ Not yet'}</div>
          <ul className="logging-notes">
            {result.notes.map((n, i) => (
              <li key={i} className={n.ok ? 'ok' : 'bad'}>
                <span>{n.ok ? '✓' : '✗'}</span> {n.text}
              </li>
            ))}
          </ul>
          {exercise.kind === 'write' &&
            (result.correct || showModel ? (
              <div className="logging-model">
                <div className="small muted">A good answer ({exercise.model.level})</div>
                <pre className="code-block">{exercise.model.message}</pre>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModel(true)}>
                Show a good answer
              </button>
            ))}
          {(exercise.kind !== 'write' || result.correct || showModel) && <p className="small">{exercise.explain}</p>}
        </div>
      )}
    </section>
  )
}
