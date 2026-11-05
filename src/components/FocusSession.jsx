import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CATEGORIES } from '../data/categories.js'
import { problemById, problemsFor } from '../data/problems.js'
import { closeFocus, finishFocus, readFocusGoal, readFocusHistory, updateFocus } from '../store/focus.js'
import { statusOf, todayKey, useProgress } from '../store/progress.js'
import {
  BREAK_MINUTES,
  comeBack,
  countsToGoal,
  coverageGains,
  currentId,
  isLastItem,
  minutesToCount,
  moveOn,
  NEXT_DELAY_SECONDS,
  sessionLeftMs,
  sessionsOn,
  solvedInSession,
  stepAway,
} from '../study/focus.js'
import { BLINK_MS, clock } from '../study/timer.js'

const pathOf = (id) => `/${problemById.get(id).category}/${id}`
const nowIso = () => new Date().toISOString()
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

// Solved counts per category, the base for the progress shown at the end of a session.
export function solvedByCategory(progress) {
  const counts = {}
  for (const c of CATEGORIES) counts[c.slug] = problemsFor(c.slug).filter((p) => statusOf(progress[p.id]) === 'solved').length
  return counts
}

// Takes the place of the header during a session, so the only things left on screen are the problem and this bar.
// Keyed by position in the queue: each problem starts with a clean bar.
export function FocusBar({ session }) {
  const progress = useProgress()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const now = useNow()
  const [nextAt, setNextAt] = useState(null)
  const [stayed, setStayed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const id = currentId(session)
  const path = pathOf(id)
  const onProblem = pathname === path
  const solved = solvedInSession(id, session, progress)
  const left = sessionLeftMs(session, now)

  // leaving is the tab going out of sight, or wandering off the problem through a link or the back button
  useEffect(() => {
    const check = () =>
      updateFocus((s) => (onProblem && document.visibilityState === 'visible' ? comeBack(s, nowIso()) : stepAway(s, nowIso())))
    const closing = () => updateFocus((s) => stepAway(s, nowIso()))
    check()
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pagehide', closing)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pagehide', closing)
    }
  }, [onProblem])

  useEffect(() => {
    if (left <= 0) finishFocus(progress, 'time')
  }, [left, progress])

  useEffect(() => {
    setNextAt(solved ? Date.now() + NEXT_DELAY_SECONDS * 1000 : null)
  }, [solved])

  function next() {
    if (isLastItem(session)) return finishFocus(progress, 'plan')
    updateFocus(moveOn)
    navigate(pathOf(session.queue[session.at + 1]))
  }

  const counting = nextAt !== null && !stayed && onProblem
  const secondsToNext = counting ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : null
  useEffect(() => {
    if (secondsToNext === 0) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsToNext])

  const last = isLastItem(session)
  const position = `Problem ${session.at + 1} of ${session.queue.length}`

  return (
    <header className="topbar focus-bar">
      <div className="focus-where small" aria-live="polite">
        {counting ? (
          <span className="ok-text">
            Solved. {last ? 'Finishing' : 'Next'} in {secondsToNext}s
          </span>
        ) : solved ? (
          <span className="ok-text">Solved</span>
        ) : (
          <span className="muted">{position}</span>
        )}
      </div>

      <div className={`focus-clock mono${left < BLINK_MS ? ' err-text' : ''}`} role="timer" aria-label="Time left in this session">
        {clock(Math.max(0, left))}
      </div>

      <div className="focus-actions">
        {confirming ? (
          <>
            <span className="small muted focus-ask">End now?</span>
            <button className="btn btn-sm" onClick={() => finishFocus(progress, 'ended')}>
              End
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>
              Keep going
            </button>
          </>
        ) : (
          <>
            {!onProblem && (
              <Link className="btn btn-sm btn-primary" to={path}>
                Back to problem
              </Link>
            )}
            {counting && (
              <button className="btn btn-sm btn-ghost" onClick={() => setStayed(true)}>
                Stay here
              </button>
            )}
            {onProblem && (
              <button className="btn btn-sm" onClick={next}>
                {last ? 'Finish' : 'Next'}
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(true)}>
              End session
            </button>
          </>
        )}
      </div>
    </header>
  )
}

const TITLES = { time: "Time's up", plan: 'Plan finished', ended: 'Session ended' }

function goalNote(record) {
  const goal = readFocusGoal()
  const done = sessionsOn(readFocusHistory(), record.day).length
  if (!countsToGoal(record)) {
    return `This one was too short to count towards your goal: a ${record.minutes} minute session counts after ${minutesToCount(record.minutes)} minutes.`
  }
  return done >= goal ? `Daily goal reached: ${plural(done, 'session')} today.` : `Daily goal: ${done} of ${goal} sessions today.`
}

function BreakClock({ onDone }) {
  const [end] = useState(() => Date.now() + BREAK_MINUTES * 60000)
  const left = end - useNow()
  if (left <= 0) return <p className="ok-text">Break over. Ready when you are.</p>
  return (
    <div className="focus-break">
      <span className="focus-clock mono" role="timer" aria-label="Time left in this break">
        {clock(left)}
      </span>
      <button className="btn btn-sm btn-ghost" onClick={onDone}>
        End break
      </button>
    </div>
  )
}

export function FocusSummary({ session }) {
  const { record } = session
  const progress = useProgress()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [onBreak, setOnBreak] = useState(false)
  const heading = useRef(null)
  useEffect(() => heading.current?.focus(), [])

  const counts = solvedByCategory(progress)
  const gains = coverageGains(
    CATEGORIES.map((c) => ({ slug: c.slug, label: c.label, solved: counts[c.slug], total: problemsFor(c.slug).length })),
    session.solved,
  )
  const openProblem = record.reason !== 'plan' && pathname === pathOf(currentId(session)) && !record.finished.includes(currentId(session))
  const minutes = Math.round(record.seconds / 60)
  const earnedBreak = countsToGoal(record) // a session stopped after a minute hasn't earned one

  function backToPlan() {
    closeFocus()
    navigate('/')
  }

  return (
    <div className="focus-summary-wrap">
      <section className="focus-summary" role="dialog" aria-modal="true" aria-labelledby="focus-summary-title">
        <h2 id="focus-summary-title" ref={heading} tabIndex={-1}>
          {TITLES[record.reason]}
        </h2>
        <p className="muted small">{goalNote(record)}</p>

        <dl className="focus-stats">
          <div>
            <dt className="muted small">Finished</dt>
            <dd>{record.finished.length}</dd>
          </div>
          <div>
            <dt className="muted small">Time on task</dt>
            <dd>{minutes} min</dd>
          </div>
          <div>
            <dt className="muted small">Times you left</dt>
            <dd>{record.leaves}</dd>
          </div>
        </dl>

        {record.finished.length > 0 && (
          <ul className="focus-finished small">
            {record.finished.map((id) => (
              <li key={id}>{problemById.get(id)?.title ?? id}</li>
            ))}
          </ul>
        )}
        {record.passed > 0 && <p className="muted small">Moved past {plural(record.passed, 'problem')} without solving. They stay on your plan.</p>}

        {gains.map((g) => (
          <p key={g.slug} className="small">
            You've now covered <strong>{g.percent}%</strong> of {g.label}: {g.solved} of {g.total} solved, {g.gained} more than when you started.
          </p>
        ))}

        {onBreak && <BreakClock onDone={() => setOnBreak(false)} />}
        {earnedBreak && !onBreak && <p className="muted small">Take {BREAK_MINUTES} minutes away from the screen before the next session.</p>}

        <div className="focus-summary-actions">
          {earnedBreak && !onBreak && (
            <button className="btn btn-primary" onClick={() => setOnBreak(true)}>
              Start {BREAK_MINUTES} minute break
            </button>
          )}
          {openProblem && (
            <button className="btn" onClick={closeFocus}>
              Keep working on this problem
            </button>
          )}
          <button className="btn btn-ghost" onClick={backToPlan}>
            Back to today's plan
          </button>
        </div>
      </section>
    </div>
  )
}
