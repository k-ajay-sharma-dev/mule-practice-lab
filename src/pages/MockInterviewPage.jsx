import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PastRounds, { deleteRounds } from '../components/PastRounds.jsx'
import ProblemWorkspace from '../components/ProblemWorkspace.jsx'
import useRemaining from '../components/useRemaining.js'
import WideToggle from '../components/WideToggle.jsx'
import { categoryBySlug } from '../data/categories.js'
import { EXERCISE_LABELS, exerciseOf } from '../data/exercises.js'
import { loadProblem, problemById, problems } from '../data/problems.js'
import MultiPick from '../components/MultiPick.jsx'
import TimePicker from '../components/TimePicker.jsx'
import Markdown from '../components/Markdown.jsx'
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

// the last time choice is kept for the next round
const PACE_KEY = 'pl.mock.pace'
const readPace = () => (read(PACE_KEY, 'split') === 'full' ? 'full' : 'split')
const savePace = (pace) => {
  try {
    localStorage.setItem(PACE_KEY, JSON.stringify(pace))
  } catch {
    // storage blocked: the choice lasts for this visit
  }
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

// A design round: one flow or architecture problem that fits the time, unsolved first.
function buildDesignRound({ levels, tracks, which, minutes }, progress) {
  const types = which === 'either' ? ['flow', 'diagram'] : [which]
  const ofType = (list) => list.filter((p) => types.includes(exerciseOf(p)) && fitsLevels(levels)(p))
  for (const list of [ofType(evenMix(trackLists(tracks, problems))), ofType(problems)]) {
    if (!list.length) continue
    const fresh = list.filter((p) => statusOf(progress[p.id]) !== 'solved')
    const base = fresh.length ? fresh : list
    // problems estimated to fit the time; with none, the quickest ones
    const fits = base.filter((p) => (p.estMinutes ?? 30) <= minutes)
    const quickest = Math.min(...base.map((p) => p.estMinutes ?? 30))
    return [pickRandom(fits.length ? fits : base.filter((p) => (p.estMinutes ?? 30) === quickest)).id]
  }
  return []
}

// A mixed round: one problem of every kind, top to bottom, as in a real interview. The time is shared out, so a
// short round picks quicker problems: each kind gets one whose estimate fits its fair share when there is one
// (unsolved first), otherwise the quickest of that kind.
const est = (p) => p.estMinutes ?? 15
// With one clock (pace "full") any problem of each kind can come up, as before.
function buildRound({ levels, tracks, skipCode, minutes, pace }, progress) {
  const pool = evenMix(trackLists(tracks, problems))
  const kinds = ROUND.filter((type) => !(skipCode && type === 'code'))
  const share = pace === 'full' ? Infinity : minutes / kinds.length
  return kinds
    .map((type) => {
      const ofType = (list) => list.filter((p) => exerciseOf(p) === type && fitsLevels(levels)(p))
      for (const list of [ofType(pool), ofType(problems)]) {
        if (!list.length) continue
        const fits = list.filter((p) => est(p) <= share)
        const quick = Math.min(...list.map(est))
        const base = fits.length ? fits : list.filter((p) => est(p) === quick)
        const fresh = base.filter((p) => statusOf(progress[p.id]) !== 'solved')
        return pickRandom(fresh.length ? fresh : base).id
      }
      return null
    })
    .filter(Boolean)
}

// How the round's minutes are shared out: in proportion to each problem's estimate, at least 1 minute each.
function shares(session) {
  const ests = session.items.map((id) => est(problemById.get(id) ?? {}))
  const sum = ests.reduce((a, b) => a + b, 0) || 1
  const exact = ests.map((e) => (session.minutes * e) / sum)
  const out = exact.map((x) => Math.max(1, Math.floor(x)))
  // hand the minutes left over to the problems that lost the most in rounding down, so the shares add up
  let left = session.minutes - out.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++
  return out
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
    // the problem open at the end gets the time since it was opened
    const spent = { ...(s.spent ?? {}) }
    const openId = s.items[s.current]
    spent[openId] = (spent[openId] ?? 0) + Math.max(0, Date.parse(finishedIso) - (s.enteredAt ?? Date.parse(s.startedIso)))
    results.filter((r) => !r.solved).forEach((r) => scheduleReview(r.id))
    const done = { ...s, finishedIso, results, spent }
    const nextHistory = [
      { date: done.finishedIso, kind: s.kind ?? 'mixed', score:results.filter((r) => r.solved).length, total: results.length, results },
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

  // design round: each follow-up answered out loud and marked; the count joins the round in the history
  function explained(marks, total) {
    save({ ...session, explain: marks })
    const done = Object.values(marks)
    if (done.length === total) {
      if (done.some((ok) => !ok)) session.items.forEach((id) => scheduleReview(id))
      keepHistory(history.map((h) => (h.date === session.finishedIso ? { ...h, explained: done.filter(Boolean).length, asked: total } : h)))
    }
  }

  if (session.finishedIso) return <Summary session={session} onClose={() => save(null)} onDelete={deleteThis} onExplain={explained} />
  // time on each problem: the one you leave gets the time since you opened it
  function select(i) {
    if (i === session.current) return
    const now = Date.now()
    const id = session.items[session.current]
    const spent = { ...(session.spent ?? {}) }
    spent[id] = (spent[id] ?? 0) + Math.max(0, now - (session.enteredAt ?? Date.parse(session.startedIso)))
    save({ ...session, current: i, spent, enteredAt: now })
  }
  return <Running session={session} progress={progress} onSelect={select} onFinish={() => finish()} />
}

function Setup({ history, onStart, onHistory }) {
  const progress = useProgress()
  const [kind, setKind] = useState('mixed')
  const [which, setWhich] = useState('either')
  const [chosenMinutes, setMinutes] = useState(null)
  const [pace, setPace] = useState(readPace) // 'split': a share of the time per problem; 'full': one clock
  const suggested = kind === 'design' ? 20 : 45
  const minutes = chosenMinutes ?? suggested
  const [levels, setLevels] = useState(DEFAULT_LEVELS)
  const [tracks, setTracks] = useState([])
  const [runner, setRunner] = useState('checking')
  const [empty, setEmpty] = useState(false)

  useEffect(() => {
    checkRunner().then((r) => setRunner(r.ok ? 'online' : 'offline'))
  }, [])

  function start() {
    // a runner still waking up counts as available; only a definite "offline" drops the DataWeave problem
    const items =
      kind === 'design'
        ? buildDesignRound({ levels, tracks, which, minutes }, progress)
        : buildRound({ levels, tracks, skipCode: runner === 'offline', minutes, pace }, progress)
    if (!items.length) return setEmpty(true)
    savePace(pace)
    onStart({ kind, items, current: 0, minutes, pace: kind === 'mixed' ? pace : 'full', startedIso: new Date().toISOString() })
  }

  return (
    <div className="mock-page">
      <p className="eyebrow">// mock interview</p>
      <h1>Mock Interview</h1>
      <p className="muted">
        A timed, mixed round like a real technical interview: DataWeave, flow design, API design, architecture, a
        production incident and a quiz, top to bottom. Then you get a score and your weak areas. Anything unsolved goes
        on your review schedule.
      </p>

      <div className={`mock-setup${kind === 'design' ? ' four-up' : ''}`}>
        <label className="field">
          Round
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="mixed">Mixed: one of each kind</option>
            <option value="design">Design: one flow or architecture, then explain it</option>
          </select>
        </label>
        {kind === 'design' && (
          <label className="field">
            Design
            <select className="input" value={which} onChange={(e) => setWhich(e.target.value)}>
              <option value="either">Flow or architecture</option>
              <option value="flow">Flow design</option>
              <option value="diagram">Architecture diagram</option>
            </select>
          </label>
        )}
        <MultiPick label="Difficulty" options={LEVEL_OPTIONS} value={levels} onChange={setLevels} allLabel="Any level" />
        <MultiPick label="Focus" options={TRACK_OPTIONS} value={tracks} onChange={setTracks} />
        <TimePicker value={minutes} onChange={setMinutes} suggested={suggested} />
        {kind === 'mixed' && (
          <div className="field pace-pick">
            <span>Clock</span>
            <div className="pace-options" role="radiogroup" aria-label="Clock">
              {PACES.map((p) => (
                <button
                  type="button"
                  key={p.key}
                  role="radio"
                  aria-checked={pace === p.key}
                  className={`pace-option${pace === p.key ? ' active' : ''}`}
                  onClick={() => setPace(p.key)}
                >
                  <b>{p.title}</b>
                  <span className="muted small">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {kind === 'design' && (
        <p className="muted small">
          A design round is one problem picked to fit your time, with no plan box, no hints and no reference. When the
          time is up, you answer the interviewer's follow-up questions about your design out loud and mark each one.
        </p>
      )}
      {empty && <p className="warn-text small">No problem matches this choice. Try another focus or difficulty.</p>}
      {runner === 'offline' && kind === 'mixed' && (
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
                {h.asked > 0 && ` · explained ${h.explained} of ${h.asked}`}
              </span>
            </>
          )}
        </PastRounds>
      )}
    </div>
  )
}

const PACES = [
  { key: 'split', title: 'Shared out', hint: 'Each problem gets its share. A short round picks quicker problems.' },
  { key: 'full', title: 'One clock', hint: 'One timer for the whole round. Spend it as you like.' },
]

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
  const split = session.pace !== 'full' && session.kind !== 'design'
  const share = shares(session)
  // time on the open problem: what was spent before, plus since it was opened
  const elapsed = session.minutes * 60000 - remaining
  const sinceOpen = Math.max(0, Date.parse(session.startedIso) + elapsed - (session.enteredAt ?? Date.parse(session.startedIso)))
  const onThis = (session.spent?.[id] ?? 0) + sinceOpen
  const over = onThis > share[session.current] * 60000
  const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

  const clock = (
    <span className={`mock-timer mono${remaining < 5 * 60000 ? ' err-text' : ''}${remaining < BLINK_MS ? ' timer-blink' : ''}`}>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )

  return (
    <div className="mock-page mock-running">
      <div className="mock-bar">
        {clock}
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
                {split && <span className="mock-step-min">~{share[i]}m</span>}
                {solvedNow(itemId) && ' ✓'}
              </button>
            )
          })}
        </div>
        {split && <span className={`mock-on-this small${over ? ' warn-text' : ' muted'}`} title="Time on this problem against its share of the round">
          On this one {fmt(onThis)} of ~{share[session.current]}m{over && session.current < session.items.length - 1 ? ' · time to move on' : ''}
        </span>}
        <button
          className="btn btn-sm"
          onClick={() => {
            if (confirm('Finish the interview now?')) onFinish()
          }}
        >
          Finish
        </button>
        <WideToggle />
      </div>
      {p && (
        <>
          <h2 className="mock-title">
            {p.title} <span className="mono muted small">{p.id.toUpperCase()}</span>
          </h2>
          <p className="muted small">
            Treat the <b>Explain it</b> and reference tabs as off-limits until the round is over — that is the interview.
          </p>
          <ProblemWorkspace id={p.id} guided={false} clock={clock} />
        </>
      )}
    </div>
  )
}

// After a design round: the interviewer's follow-ups on the problem. Answer each out loud, then compare.
function ExplainRound({ id, marks, onMark }) {
  const [problem, setProblem] = useState(null)
  const [shown, setShown] = useState({})
  useEffect(() => {
    let live = true
    loadProblem(id).then((p) => live && setProblem(p), () => live && setProblem(false))
    return () => {
      live = false
    }
  }, [id])
  if (problem === null) return <p className="muted small">Loading the follow-up questions…</p>
  if (!problem) return null
  const questions = (problem.followUps?.length ? problem.followUps : (problem.keyPoints ?? []).map((k) => ({ q: 'Did your design cover this, and can you say why?', a: k }))).slice(0, 3)
  if (!questions.length) return null
  return (
    <section className="explain-round">
      <h2 className="section-heading">
        Explain your design <span className="muted">({Object.keys(marks).length} / {questions.length})</span>
      </h2>
      <p className="muted small">The interviewer asks these next. Answer each one out loud first, then show the answer and mark yourself honestly.</p>
      {questions.map((f, i) => (
        <div key={i} className="explain-q">
          <p>
            <b>{i + 1}.</b> {f.q}
          </p>
          {shown[i] || marks[i] !== undefined ? (
            <>
              <div className="explain-a small">
                <Markdown>{f.a}</Markdown>
              </div>
              <div className="rating">
                <button className={`btn btn-sm${marks[i] === true ? ' active-toggle' : ''}`} onClick={() => onMark({ ...marks, [i]: true }, questions.length)}>
                  I had it
                </button>
                <button className={`btn btn-sm btn-ghost${marks[i] === false ? ' active-toggle' : ''}`} onClick={() => onMark({ ...marks, [i]: false }, questions.length)}>
                  I missed it
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => setShown({ ...shown, [i]: true })}>
              I answered it out loud. Show the answer
            </button>
          )}
        </div>
      ))}
    </section>
  )
}

function Summary({ session, onClose, onDelete, onExplain }) {
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
  // where the time went: each problem's minutes against its share (shared-out rounds), from the time it was open
  const tracked = session.kind !== 'design' && session.spent && Object.keys(session.spent).length > 0
  const split = session.pace !== 'full'
  const share = shares(session)
  const mins = (ms) => Math.round((ms ?? 0) / 60000)
  const overShare = tracked && split ? session.items.map((id, i) => ({ id, i, over: mins(session.spent[id]) - share[i] })).filter((x) => x.over > 0).sort((a, b) => b.over - a.over)[0] : null

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
      {overShare && (
        <p className="small warn-text">
          {EXERCISE_LABELS[problemById.get(overShare.id)?.exercise] ?? 'One problem'} took {mins(session.spent[overShare.id])} of its {share[overShare.i]} minutes.
          In the real interview, move on sooner and come back to it if there is time left.
        </p>
      )}

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
              <span className={`small mono${tracked && split && mins(session.spent[r.id]) > share[session.items.indexOf(r.id)] ? ' warn-text' : ' muted'}`} title="Time on this problem">
                {tracked ? `${mins(session.spent[r.id])}${split ? ` / ${share[session.items.indexOf(r.id)]}` : ''} min` : ''}
              </span>
              <span className="small muted">Review & explain →</span>
            </Link>
          )
        })}
      </div>

      {session.kind === 'design' && (
        <ExplainRound id={session.items[0]} marks={session.explain ?? {}} onMark={onExplain} />
      )}

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
