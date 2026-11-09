import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Markdown from '../components/Markdown.jsx'
import PastRounds from '../components/PastRounds.jsx'
import QuestionCard, { fitsQuestion, initialResponse } from '../components/quiz/QuestionCard.jsx'
import useRemaining from '../components/useRemaining.js'
import MultiPick from '../components/MultiPick.jsx'
import { loadProblems, problemById, problems } from '../data/problems.js'
import { TRACK_OPTIONS, trackLists, trackProblems, TRACKS, tracksLabel } from '../data/tracks.js'
import {
  chooseQuestions,
  examSummary,
  itemKey,
  LENGTHS,
  MINUTES_PER_QUESTION,
  missedProblems,
  PASS_MARK,
  RETAKE_FOCUS,
  scoreExam,
  seenInHistory,
  shuffled,
  topicScores,
  validSession,
} from '../quiz/exam.js'
import { writeLocal } from '../store/local.js'
import { scheduleReview } from '../store/progress.js'
import { DEFAULT_LEVELS, evenMix, fitsLevels, LEVEL_OPTIONS } from '../study/mix.js'
import { BLINK_MS, LOW_MS } from '../study/timer.js'

// A timed exam across every quiz on the site: one question at a time, no feedback until the end, then a score by topic.
const CURRENT_KEY = 'pl.exam.current'
const HISTORY_KEY = 'pl.exam.history'
const MAX_HISTORY = 20

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => writeLocal(key, value == null ? null : JSON.stringify(value))

const readSession = () => validSession(read(CURRENT_KEY, null), (id) => problemById.has(id))

function readHistory() {
  const h = read(HISTORY_KEY, [])
  return Array.isArray(h) ? h.filter((x) => x && typeof x.date === 'string' && Array.isArray(x.results)) : []
}

// one list of quizzes per chosen topic
const quizLists = (levels, tracks) =>
  trackLists(tracks, problems).map((list) => list.filter((p) => p.exercise === 'quiz' && fitsLevels(levels)(p)))

const newSession = (items, focus) => ({
  items,
  focus,
  current: 0,
  responses: {},
  flagged: [],
  minutes: items.length * MINUTES_PER_QUESTION,
  startedIso: new Date().toISOString(),
})

export default function ExamPage() {
  const [session, setSession] = useState(readSession)
  const [history, setHistory] = useState(readHistory)
  const [loaded, setLoaded] = useState(null) // problem id -> full problem
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const ids = session ? [...new Set(session.items.map((i) => i.id))].join() : ''
  useEffect(() => {
    if (!ids) return
    let live = true
    setLoaded(null)
    setFailed(false)
    loadProblems(ids.split(',')).then(
      (list) => live && setLoaded(new Map(list.filter(Boolean).map((p) => [p.id, p]))),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [ids, attempt])

  function save(next) {
    setSession(next)
    write(CURRENT_KEY, next)
  }

  const questionOf = (item) => loaded?.get(item.id)?.quiz?.[item.q]

  function finish() {
    // if time ran out while you were away, the exam ended at the time limit, not now
    const now = new Date().toISOString()
    const end = new Date(new Date(session.startedIso).getTime() + session.minutes * 60000).toISOString()
    const finishedIso = now < end ? now : end
    const items = session.items.filter(questionOf)
    const results = scoreExam(items, session.responses, questionOf)
    missedProblems(results).forEach((id) => scheduleReview(id))
    const { correct, total, pct, passed } = examSummary(results)
    const entry = { date: finishedIso, focus: session.focus, correct, total, pct, passed, results: results.map(({ id, q, ok, answered }) => ({ id, q, ok, answered })) }
    const next = [entry, ...history].slice(0, MAX_HISTORY)
    setHistory(next)
    write(HISTORY_KEY, next)
    save({ ...session, items, finishedIso, results })
  }

  function keepHistory(kept) {
    setHistory(kept)
    write(HISTORY_KEY, kept)
  }

  if (!session) return <Setup history={history} onStart={save} onHistory={keepHistory} />
  if (failed) {
    return (
      <div className="mock-page">
        <h1>Practice Exam</h1>
        <p className="warn-text">Couldn't load the questions. Check your connection and try again. Your answers are safe.</p>
        <button className="btn btn-primary" onClick={() => setAttempt(attempt + 1)}>
          Try again
        </button>
      </div>
    )
  }
  if (!loaded) return <div className="workspace-loading muted small">Preparing the exam…</div>
  if (session.finishedIso) {
    return (
      <Result
        session={session}
        questionOf={questionOf}
        loaded={loaded}
        onClose={() => save(null)}
        onRetake={(items) => save(newSession(items, RETAKE_FOCUS))}
      />
    )
  }
  return <Running session={session} questionOf={questionOf} loaded={loaded} onChange={save} onFinish={finish} />
}

function Setup({ history, onStart, onHistory }) {
  const [count, setCount] = useState(LENGTHS[0])
  const [levels, setLevels] = useState(DEFAULT_LEVELS)
  const [tracks, setTracks] = useState([])
  const [details, setDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const lists = useMemo(() => quizLists(levels, tracks), [levels, tracks])
  const poolSize = useMemo(() => evenMix(lists).length, [lists])

  async function start() {
    setBusy(true)
    setFailed(false)
    try {
      const loaded = (await loadProblems(evenMix(lists, shuffled).slice(0, count).map((p) => p.id))).filter(Boolean)
      const seen = seenInHistory(history)
      const chosen = chooseQuestions(loaded, count, seen, Math.random, (q) => details || !q.detail)
      // a focus made up only of detail questions still gets an exam
      const items = chosen.length ? chosen : chooseQuestions(loaded, count, seen)
      onStart(newSession(items, tracksLabel(tracks)))
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <div className="mock-page">
      <p className="eyebrow">// practice exam</p>
      <h1>Practice Exam</h1>
      <p className="muted">
        A timed exam drawn from every quiz on the site, with {MINUTES_PER_QUESTION} minutes per question. You see one
        question at a time and no answers until you finish, then a score by topic and a review of each question. Problems
        behind your wrong answers go on your review schedule.
      </p>
      <p className="muted small">
        This is not an official MuleSoft exam. The {PASS_MARK}% pass mark is this site's own target.
      </p>

      <div className="mock-setup">
        <label className="field">
          Length
          <select className="input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {LENGTHS.map((n) => (
              <option key={n} value={n}>
                {n} questions, {n * MINUTES_PER_QUESTION} minutes
              </option>
            ))}
          </select>
        </label>
        <MultiPick label="Difficulty" options={LEVEL_OPTIONS} value={levels} onChange={setLevels} allLabel="Any level" />
        <MultiPick label="Focus" options={TRACK_OPTIONS} value={tracks} onChange={setTracks} />
      </div>

      <label className="exam-details small muted">
        <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
        Include detail questions: exact limits, defaults and names you can only learn by reading the docs
      </label>

      {poolSize === 0 && <p className="warn-text small">No quizzes match this focus and difficulty. Try a wider choice.</p>}
      {failed && <p className="warn-text small">Couldn't load the questions. Check your connection and try again.</p>}
      <button className="btn btn-primary" onClick={start} disabled={busy || poolSize === 0}>
        {busy ? 'Preparing…' : 'Start the exam'}
      </button>

      {history.length > 0 && (
        <PastRounds title="Past exams" noun="exam" kind="exam" history={history} onChange={onHistory}>
          {(h) => (
            <>
              <span className="mono small">{new Date(h.date).toLocaleString()}</span>
              <span className={h.passed ? 'ok-text' : 'err-text'}>{h.pct}%</span>
              <span className="muted small history-detail">
                {h.correct} of {h.total} · {h.focus}
              </span>
            </>
          )}
        </PastRounds>
      )}
    </div>
  )
}

function Running({ session, questionOf, loaded, onChange, onFinish }) {
  const remaining = useRemaining(session)
  const finished = useRef(false)

  const finishOnce = () => {
    if (finished.current) return
    finished.current = true
    onFinish()
  }
  useEffect(() => {
    if (remaining === 0) finishOnce()
  })

  const { items, current, responses, flagged } = session
  const item = items[current]
  const key = itemKey(item)
  const q = questionOf(item)
  const seedOf = (i) => `${session.startedIso}:${itemKey(i)}`
  const isFlagged = flagged.includes(key)
  const answered = items.filter((i) => responses[itemKey(i)] != null).length
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)

  const go = (i) => onChange({ ...session, current: i })
  const toggleFlag = () => onChange({ ...session, flagged: isFlagged ? flagged.filter((k) => k !== key) : [...flagged, key] })

  function confirmFinish() {
    const left = items.length - answered
    const message = left ? `${left} unanswered ${left === 1 ? 'question counts' : 'questions count'} as wrong. Finish the exam?` : 'Finish the exam?'
    if (confirm(message)) finishOnce()
  }

  return (
    <div className="mock-page exam-running">
      <div className="mock-bar">
        <span className={`mock-timer mono${remaining < LOW_MS ? ' err-text' : ''}${remaining < BLINK_MS ? ' timer-blink' : ''}`} role="timer">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
        <span className="exam-count muted small">
          {answered} of {items.length} answered
        </span>
        <button className="btn btn-sm" onClick={confirmFinish}>
          Finish
        </button>
      </div>

      {q ? (
        <>
          <p className="exam-topic small muted">{loaded.get(item.id).title}</p>
          {/* open only where the question can't be read without it, so the rest stay on one screen */}
          <details className="exam-scenario" key={`scenario-${key}`} open={Boolean(q.needsScenario)}>
            <summary className="small">Scenario for this question</summary>
            <Markdown>{loaded.get(item.id).description}</Markdown>
          </details>
          <QuestionCard
            key={key}
            q={q}
            number={current + 1}
            seed={seedOf(item)}
            response={fitsQuestion(q, responses[key]) ? responses[key] : initialResponse(q, seedOf(item))}
            submitted={false}
            onChange={(r) => onChange({ ...session, responses: { ...responses, [key]: r } })}
          />
        </>
      ) : (
        <p className="warn-text small">This question is no longer on the site, so it won't be scored. Move to the next one.</p>
      )}

      <div className="exam-actions">
        <button className="btn" onClick={() => go(current - 1)} disabled={current === 0}>
          Previous
        </button>
        <button className={`btn btn-ghost${isFlagged ? ' exam-flag-on' : ''}`} onClick={toggleFlag} aria-pressed={isFlagged}>
          {isFlagged ? 'Flagged' : 'Flag for later'}
        </button>
        {current < items.length - 1 ? (
          <button className="btn btn-primary" onClick={() => go(current + 1)}>
            Next
          </button>
        ) : (
          <button className="btn btn-primary" onClick={confirmFinish}>
            Finish
          </button>
        )}
      </div>

      <div className="exam-grid" role="group" aria-label="Jump to a question">
        {items.map((i, n) => {
          const k = itemKey(i)
          const done = responses[k] != null
          const flag = flagged.includes(k)
          return (
            <button
              key={k}
              className={`exam-cell mono${n === current ? ' active' : ''}${done ? ' done' : ''}${flag ? ' flagged' : ''}`}
              onClick={() => go(n)}
              aria-label={`Question ${n + 1}${done ? ', answered' : ''}${flag ? ', flagged' : ''}`}
              aria-current={n === current ? 'true' : undefined}
            >
              {n + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Result({ session, questionOf, loaded, onClose, onRetake }) {
  const { results, flagged, responses } = session
  const [show, setShow] = useState(results.some((r) => !r.ok) ? 'wrong' : 'all')
  const { correct, total, pct, passed } = examSummary(results)
  const topics = useMemo(
    () => topicScores(results, TRACKS.map((t) => ({ slug: t.slug, title: t.title, ids: new Set(trackProblems(t).map((p) => p.id)) }))),
    [results],
  )
  const minutesUsed = Math.max(1, Math.round((new Date(session.finishedIso) - new Date(session.startedIso)) / 60000))
  const wrong = results.filter((r) => !r.ok)
  const skipped = results.filter((r) => !r.answered).length
  const filters = {
    wrong: { label: 'Wrong', list: wrong },
    flagged: { label: 'Flagged', list: results.filter((r) => flagged.includes(itemKey(r))) },
    all: { label: 'All', list: results },
  }

  return (
    <div className="mock-page">
      <p className="eyebrow">// exam result</p>
      <h1>{pct}%</h1>
      <div className={`match-banner ${passed ? 'pass' : 'fail'} exam-banner`}>
        {passed ? 'Passed' : 'Not yet'}: {correct} of {total} correct, pass mark {PASS_MARK}%
      </div>
      <p className="muted">
        {minutesUsed} of {session.minutes} minutes used.
        {skipped > 0 && ` ${skipped} left unanswered.`}
        {missedProblems(session.results).length > 0 && ' Problems behind your wrong answers are now on your review schedule.'}
      </p>

      {topics.length > 0 && (
        <>
          <h2 className="section-heading">Score by topic</h2>
          <p className="muted small">Weakest first. A question can count towards several topics.</p>
          <ul className="exam-topics">
            {topics.slice(0, 8).map((t) => (
              <li key={t.slug}>
                <Link to={`/tracks/${t.slug}`}>{t.title}</Link>
                <div className="progress-bar">
                  <div style={{ width: `${t.pct}%` }} />
                </div>
                <span className="mono small muted">
                  {t.correct}/{t.total}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="hero-actions exam-next">
        {wrong.length > 0 && (
          <button className="btn btn-primary" onClick={() => onRetake(shuffled(wrong.map(({ id, q }) => ({ id, q }))))}>
            Retake the {wrong.length} I missed
          </button>
        )}
        <button className={`btn${wrong.length ? '' : ' btn-primary'}`} onClick={onClose}>
          New exam
        </button>
        <Link className="btn btn-ghost" to="/review">
          Open Review
        </Link>
      </div>

      <h2 className="section-heading">Review your answers</h2>
      <div className="search-facets" role="group" aria-label="Filter questions">
        {Object.entries(filters).map(([key, f]) => (
          <button key={key} className={`chip-btn${show === key ? ' active' : ''}`} onClick={() => setShow(key)} aria-pressed={show === key}>
            {f.label} <span className="muted">{f.list.length}</span>
          </button>
        ))}
      </div>
      {filters[show].list.length === 0 && <p className="muted small">Nothing here.</p>}
      {filters[show].list.map((r) => {
        const q = questionOf(r)
        const p = loaded.get(r.id)
        const key = itemKey(r)
        const seed = `${session.startedIso}:${key}`
        return (
          <div key={key} className="exam-review">
            <QuestionCard
              q={q}
              number={results.indexOf(r) + 1}
              seed={seed}
              response={fitsQuestion(q, responses[key]) ? responses[key] : initialResponse(q, seed)}
              submitted
              onChange={() => {}}
            />
            <Link className="small" to={`/${p.category}/${p.id}`}>
              Open the full problem: {p.title} →
            </Link>
          </div>
        )
      })}
    </div>
  )
}
