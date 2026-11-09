import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PastRounds, { deleteRounds } from '../components/PastRounds.jsx'
import ProblemWorkspace from '../components/ProblemWorkspace.jsx'
import useRemaining from '../components/useRemaining.js'
import { categoryBySlug } from '../data/categories.js'
import { EXERCISE_LABELS, exerciseOf } from '../data/exercises.js'
import { problemById, problems } from '../data/problems.js'
import MultiPick from '../components/MultiPick.jsx'
import { TRACK_OPTIONS, TRACKS, trackLists } from '../data/tracks.js'
import { DEFAULT_LEVELS, evenMix, fitsLevels, LEVEL_OPTIONS } from '../study/mix.js'
import { checkRunner } from '../runner/client.js'
import { writeLocal } from '../store/local.js'
import { scheduleReview, statusOf, useProgress } from '../store/progress.js'
import { BLINK_MS } from '../study/timer.js'

// A timed, mixed round: one problem of each exercise type, scored on what is solved before time runs out.
const CURRENT_KEY = 'pl.mock.current'
const HISTORY_KEY = 'pl.mock.history'
const ROUND = ['code', 'flow', 'raml', 'diagram', 'investigation', 'quiz']

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const write = (key, value) => {
  writeLocal(key, value == null ? null : JSON.stringify(value))
}

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)]

// Stored sessions are checked before use: an old or corrupt one (or one whose problems were removed) is dropped.
function readSession() {
  const s = read(CURRENT_KEY, null)
  if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null
  const items = s.items.filter((id) => problemById.has(id))
  if (!items.length || typeof s.startedIso !== 'string' || isNaN(Date.parse(s.startedIso))) return null
  if (!Number.isFinite(s.minutes) || s.minutes <= 0) return null
  if (s.finishedIso && !Array.isArray(s.results)) return null
  const results = s.results?.filter((r) => r && problemById.has(r.id))
  return { ...s, items, results, current: Math.min(Math.max(0, Number(s.current) || 0), items.length - 1) }
}

function readHistory() {
  const h = read(HISTORY_KEY, [])
  return Array.isArray(h) ? h.filter((x) => x && typeof x.date === 'string' && Array.isArray(x.results)) : []
}

// Solved during the round = a graded solve after the start and before the time limit.
const solvedInRound = (entry, startIso, endIso) => {
  const at = entry?.solvedAt
  return typeof at === 'string' && at > startIso && at <= endIso
}
const roundEnd = (s) => new Date(new Date(s.startedIso).getTime() + s.minutes * 60000).toISOString()

function buildRound({ levels, tracks, skipCode }, progress) {
  const pool = evenMix(trackLists(tracks, problems))
  return ROUND.filter((type) => !(skipCode && type === 'code'))
    .map((type) => {
      const ofType = (list) => list.filter((p) => exerciseOf(p) === type && fitsLevels(levels)(p))
      // prefer unsolved problems in the chosen focus, then anything of that type
      const candidates = [ofType(pool), ofType(problems)]
      for (const list of candidates) {
        const fresh = list.filter((p) => statusOf(progress[p.id]) !== 'solved')
        if (fresh.length) return pickRandom(fresh).id
        if (list.length) return pickRandom(list).id
      }
      return null
    })
    .filter(Boolean)
}

export default function MockInterviewPage() {
  const progress = useProgress()
  const [session, setSession] = useState(readSession)
  const [history, setHistory] = useState(readHistory)

  function save(next) {
    setSession(next)
    write(CURRENT_KEY, next)
  }

  function finish(s = session) {
    // if the time ran out while you were on another page, the round ends at the time limit, not now
    const now = new Date().toISOString()
    const end = roundEnd(s)
    const finishedIso = now < end ? now : end
    const results = s.items.map((id) => ({ id, solved: solvedInRound(progress[id], s.startedIso, finishedIso) }))
    results.filter((r) => !r.solved).forEach((r) => scheduleReview(r.id))
    const done = { ...s, finishedIso, results }
    const nextHistory = [
      { date: done.finishedIso, score: results.filter((r) => r.solved).length, total: results.length, results },
      ...history,
    ].slice(0, 20)
    setHistory(nextHistory)
    write(HISTORY_KEY, nextHistory)
    save(done)
  }

  function keepHistory(kept) {
    setHistory(kept)
    write(HISTORY_KEY, kept)
  }

  if (!session) return <Setup history={history} onStart={(s) => save(s)} onHistory={keepHistory} />
  function deleteThis() {
    const kept = deleteRounds('mock', history, [session.finishedIso], 'Delete this round?')
    if (!kept) return
    keepHistory(kept)
    save(null)
  }

  if (session.finishedIso) return <Summary session={session} onClose={() => save(null)} onDelete={deleteThis} />
  return <Running session={session} progress={progress} onSelect={(i) => save({ ...session, current: i })} onFinish={() => finish()} />
}

function Setup({ history, onStart, onHistory }) {
  const progress = useProgress()
  const [minutes, setMinutes] = useState(45)
  const [levels, setLevels] = useState(DEFAULT_LEVELS)
  const [tracks, setTracks] = useState([])
  const [runner, setRunner] = useState('checking')

  useEffect(() => {
    checkRunner().then((r) => setRunner(r.ok ? 'online' : 'offline'))
  }, [])

  function start() {
    // a runner still waking up counts as available; only a definite "offline" drops the DataWeave problem
    const items = buildRound({ levels, tracks, skipCode: runner === 'offline' }, progress)
    onStart({ items, current: 0, minutes, startedIso: new Date().toISOString() })
  }

  return (
    <div className="mock-page">
      <p className="eyebrow">// mock interview</p>
      <h1>Mock Interview</h1>
      <p className="muted">
        A timed, mixed round like a real technical interview: one DataWeave problem, one flow design, one architecture
        diagram, one production incident and one quiz. Solve as many as you can before time runs out, then get a score
        and your weak areas. Anything unsolved goes on your review schedule.
      </p>

      <div className="mock-setup">
        <label className="field">
          Duration
          <select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[30, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <MultiPick label="Difficulty" options={LEVEL_OPTIONS} value={levels} onChange={setLevels} allLabel="Any level" />
        <MultiPick label="Focus" options={TRACK_OPTIONS} value={tracks} onChange={setTracks} />
      </div>
      {runner === 'offline' && (
        <p className="warn-text small">
          The DataWeave runner is offline, so this round skips the DataWeave problem. Start the runner (see Settings) to
          include it.
        </p>
      )}
      <button className="btn btn-primary" onClick={start}>
        Start the interview
      </button>

      {history.length > 0 && (
        <PastRounds title="Past rounds" noun="round" kind="mock" history={history} onChange={onHistory}>
          {(h) => (
            <>
              <span className="mono small">{new Date(h.date).toLocaleString()}</span>
              <span className={h.score === h.total ? 'ok-text' : h.score === 0 ? 'err-text' : ''}>
                {h.score} / {h.total}
              </span>
              <span className="muted small history-detail">
                {h.results
                  .map((r) => `${r.solved ? '✓' : '✗'} ${EXERCISE_LABELS[problemById.get(r.id)?.exercise] ?? r.id}`)
                  .join('  ')}
              </span>
            </>
          )}
        </PastRounds>
      )}
    </div>
  )
}

function Running({ session, progress, onSelect, onFinish }) {
  const remaining = useRemaining(session)
  const solvedNow = (id) => solvedInRound(progress[id], session.startedIso, roundEnd(session))
  const finished = useRef(false)

  // time's up: finish once, even if the page re-renders before the summary replaces it
  useEffect(() => {
    if (remaining === 0 && !finished.current) {
      finished.current = true
      onFinish()
    }
  }, [remaining, onFinish])

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const id = session.items[session.current]
  const p = problemById.get(id)

  return (
    <div className="mock-page mock-running">
      <div className="mock-bar">
        <span className={`mock-timer mono${remaining < 5 * 60000 ? ' err-text' : ''}${remaining < BLINK_MS ? ' timer-blink' : ''}`}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
        <div className="mock-steps">
          {session.items.map((itemId, i) => {
            const item = problemById.get(itemId)
            return (
              <button
                key={itemId}
                className={`mock-step${i === session.current ? ' active' : ''}${solvedNow(itemId) ? ' done' : ''}`}
                onClick={() => onSelect(i)}
              >
                <span className="mono">{i + 1}</span> {EXERCISE_LABELS[item?.exercise]}
                {solvedNow(itemId) && ' ✓'}
              </button>
            )
          })}
        </div>
        <button
          className="btn btn-sm"
          onClick={() => {
            if (confirm('Finish the interview now?')) onFinish()
          }}
        >
          Finish
        </button>
      </div>
      {p && (
        <>
          <h2 className="mock-title">
            {p.title} <span className="mono muted small">{p.id.toUpperCase()}</span>
          </h2>
          <p className="muted small">
            Treat the <b>Explain it</b> and reference tabs as off-limits until the round is over — that is the interview.
          </p>
          <ProblemWorkspace id={p.id} guided={false} />
        </>
      )}
    </div>
  )
}

function Summary({ session, onClose, onDelete }) {
  const results = session.results
  const score = results.filter((r) => r.solved).length
  const missed = results.filter((r) => !r.solved).map((r) => problemById.get(r.id)).filter(Boolean)
  const tagCounts = {}
  missed.forEach((p) => p.tags.forEach((t) => (tagCounts[t] = (tagCounts[t] ?? 0) + 1)))
  const weakTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t)
  const suggested = TRACKS.filter((t) => t.tags?.some((tag) => weakTags.includes(tag))).slice(0, 3)
  const minutesUsed = Math.round((new Date(session.finishedIso) - new Date(session.startedIso)) / 60000)

  return (
    <div className="mock-page">
      <p className="eyebrow">// mock interview result</p>
      <h1>
        {score} / {results.length} solved
      </h1>
      <p className="muted">
        {minutesUsed} of {session.minutes} minutes used.{' '}
        {score === results.length
          ? 'A clean round — try a harder difficulty next time.'
          : 'Unsolved problems are now on your review schedule.'}
      </p>

      <div className="problem-table">
        {results.map((r) => {
          const p = problemById.get(r.id)
          if (!p) return null
          return (
            <Link key={r.id} to={`/${p.category}/${p.id}`} className="problem-row list-row mock-result-row">
              <span className={`row-num ${r.solved ? 'ok-text' : 'err-text'}`}>{r.solved ? '✓' : '✗'}</span>
              <span className="row-title">
                <span className="title">{p.title}</span>
                <span className="row-meta">
                  <span className="mono muted">{p.id.toUpperCase()}</span>
                  <span className="muted small">{categoryBySlug.get(p.category)?.label}</span>
                  <span className={`mode-chip mode-${p.exercise}`}>{EXERCISE_LABELS[p.exercise]}</span>
                </span>
              </span>
              <span className="small">{r.solved ? 'Solved' : 'Not solved'}</span>
              <span />
              <span className="small muted">Review & explain →</span>
            </Link>
          )
        })}
      </div>

      {missed.length > 0 && (
        <>
          <h2 className="section-heading">Weak areas</h2>
          <div className="search-facets">
            {weakTags.map((t) => (
              <Link key={t} className="chip-btn" to={`/search?q=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </div>
          {suggested.length > 0 && (
            <p className="small">
              Suggested tracks:{' '}
              {suggested.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && ', '}
                  <Link to={`/tracks/${t.slug}`}>{t.title}</Link>
                </span>
              ))}
            </p>
          )}
        </>
      )}

      <div className="hero-actions">
        <button className="btn btn-primary" onClick={onClose}>
          New interview
        </button>
        <Link className="btn btn-ghost" to="/review">
          Open review
        </Link>
        <button className="btn btn-ghost" onClick={onDelete}>
          Delete this round
        </button>
      </div>
    </div>
  )
}
