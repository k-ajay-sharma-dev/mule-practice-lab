import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '../components/Badges.jsx'
import Markdown from '../components/Markdown.jsx'
import Pagination, { PAGE_SIZES, paginate } from '../components/Pagination.jsx'
import { EXERCISES, GUIDE, KINDS, LEVELS } from '../logging/exercises.js'
import { grade } from '../logging/grade.js'
import { recordAttempt, resetLogging, useLoggingProgress } from '../store/logging.js'
import NotFound from './NotFound.jsx'

const SIZE_KEY = 'pl.pageSize'
const STATUS_FILTERS = [
  ['not-started', 'Not started'],
  ['attempted', 'Attempted'],
  ['solved', 'Solved'],
]

function loadPageSize() {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY))
    return PAGE_SIZES.includes(n) ? n : 20
  } catch {
    return 20
  }
}

const statusOf = (p) => (p?.solved ? 'solved' : p ? 'attempted' : 'not-started')
const numberOf = (e) => EXERCISES.indexOf(e) + 1

// Logging Lab: practice for the Mule Logger only. Pick the level, pick the best wording, spot what is wrong in a
// logger, and write your own logger message, checked against the rules in the guide. /logging lists every exercise
// like the other sections do; /logging/log-001 opens one.
export default function LoggingPage() {
  const { exerciseId } = useParams()
  const progress = useLoggingProgress()
  const solved = EXERCISES.filter((e) => progress[e.id]?.solved).length

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

      {exerciseId ? <OneExercise id={exerciseId} progress={progress} /> : <ExerciseList progress={progress} solved={solved} />}

      {!exerciseId && solved > 0 && (
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

// The list of every exercise, with search, type and status filters, in the same table the other sections use.
function ExerciseList({ progress, solved }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [pageSize, setPageSize] = useState(loadPageSize)
  const q = params.get('q') || ''
  const kind = params.get('kind') || ''
  const status = params.get('status') || ''

  const filtered = EXERCISES.filter(
    (e) =>
      (!kind || e.kind === kind) &&
      (!status || statusOf(progress[e.id]) === status) &&
      (!q || `${e.id} ${e.situation} ${e.code ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  )
  const paged = paginate(filtered, Number(params.get('page')) || 1, pageSize)
  const hasFilters = q || kind || status

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page') // a new filter starts again from page 1
    setParams(next, { replace: true })
  }

  function goToPage(page) {
    const next = new URLSearchParams(params)
    if (page > 1) next.set('page', String(page))
    else next.delete('page')
    setParams(next)
    window.scrollTo({ top: 0 })
  }

  function changePageSize(size) {
    setPageSize(size)
    try {
      localStorage.setItem(SIZE_KEY, String(size))
    } catch {
      // storage unavailable: keep the size for this visit only
    }
    goToPage(1)
  }

  function openRandomUnsolved() {
    const pool = EXERCISES.filter((e) => !progress[e.id]?.solved)
    if (pool.length) navigate(`/logging/${pool[Math.floor(Math.random() * pool.length)].id}`)
  }

  return (
    <>
      <div className="logging-bar">
        <span className="small">
          <b>{solved}</b> of {EXERCISES.length} solved
        </span>
      </div>

      <section className="filters">
        <input className="input search" type="search" placeholder="Search exercises…" value={q} onChange={(e) => setParam('q', e.target.value)} />
        <select className="input" value={kind} onChange={(e) => setParam('kind', e.target.value)}>
          <option value="">All exercise types</option>
          {Object.entries(KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
          <option value="">Any status</option>
          {STATUS_FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={openRandomUnsolved} disabled={solved === EXERCISES.length}>
          Random unsolved
        </button>
        {hasFilters && (
          <button className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>
            Clear
          </button>
        )}
      </section>

      <div className="problem-table" role="table">
        <div className="problem-row head" role="row">
          <span>#</span>
          <span>Exercise</span>
          <span>Type</span>
          <span>Tries</span>
          <span>Status</span>
        </div>
        {paged.items.map((e) => (
          <Link key={e.id} to={`/logging/${e.id}`} state={{ list: params.toString() }} className="problem-row" role="row">
            <span className="row-num">{String(numberOf(e)).padStart(2, '0')}</span>
            <span className="row-title">
              <span className="title logging-row-title">{e.situation}</span>
              <span className="row-meta">
                <span className="mono muted">{e.id.toUpperCase()}</span>
              </span>
            </span>
            <span>
              <span className={`mode-chip logging-kind-${e.kind}`}>{KINDS[e.kind]}</span>
            </span>
            <span className="mono muted">{progress[e.id]?.tries ?? 0}</span>
            <span>
              <StatusBadge status={statusOf(progress[e.id])} />
            </span>
          </Link>
        ))}
        {filtered.length === 0 && <div className="empty-row muted">No exercises match these filters.</div>}
      </div>
      <Pagination
        page={paged.page}
        pageCount={paged.pageCount}
        total={filtered.length}
        start={paged.start}
        shown={paged.items.length}
        onPage={goToPage}
        size={pageSize}
        onSize={changePageSize}
      />
    </>
  )
}

// One exercise on its own page, with a way back to the list and on to the next one.
function OneExercise({ id, progress }) {
  const navigate = useNavigate()
  const { state } = useLocation()
  const exercise = EXERCISES.find((e) => e.id === id)
  if (!exercise) return <NotFound />
  const i = EXERCISES.indexOf(exercise)
  const back = `/logging${state?.list ? `?${state.list}` : ''}`
  const go = (e) => navigate(`/logging/${e.id}`, { state })

  return (
    <>
      <div className="logging-nav">
        <Link to={back} className="btn btn-ghost btn-sm">
          ← All exercises
        </Link>
        <span className="small muted">
          {i + 1} of {EXERCISES.length}
        </span>
        <span className="logging-nav-steps">
          <button className="btn btn-sm" disabled={i === 0} onClick={() => go(EXERCISES[i - 1])}>
            ← Previous
          </button>
          <button className="btn btn-sm" disabled={i === EXERCISES.length - 1} onClick={() => go(EXERCISES[i + 1])}>
            Next →
          </button>
        </span>
      </div>
      <Exercise
        key={exercise.id}
        exercise={exercise}
        number={i + 1}
        solvedBefore={Boolean(progress[exercise.id]?.solved)}
        onNext={i < EXERCISES.length - 1 ? () => go(EXERCISES[i + 1]) : null}
      />
    </>
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
