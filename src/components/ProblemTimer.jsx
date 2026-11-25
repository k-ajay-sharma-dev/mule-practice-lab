import { useEffect, useRef, useState } from 'react'
import { getEntry, setTimer, statusOf, useEntry } from '../store/progress.js'
import { clock, idleTimer, inTime, isStale, pauseTimer, remainingMs, resetTimer, resumeTimer, retargetTimer, startTimer, timerLevel, validTimer } from '../study/timer.js'

const CLOCK_CLASS = { ok: '', low: ' warn-text', last: ' err-text timer-blink', over: ' err-text' }
// a key, the mouse, a touch or a drag: any of these means you are here
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchmove', 'dragover']
// speaking an answer or listening to one needs no mouse
const speaking = () => Boolean(document.querySelector('.voice-live')) || [...document.querySelectorAll('audio')].some((a) => !a.paused)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function describe(record) {
  const parts = [`${clock(record.seconds * 1000)} of ${record.minutes}:00`]
  if (record.resets) parts.push(`${plural(record.resets, 'reset')}, ${clock(record.totalSeconds * 1000)} in total`)
  if (record.pauses) parts.push(plural(record.pauses, 'pause'))
  return parts.join(' · ')
}

// A small button that opens a panel under it; a click outside or Esc closes it.
function Menu({ label, title, className = '', children }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const away = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="timer-menu" ref={box}>
      <button className={`timer-chip ${className}`} onClick={() => setOpen(!open)} aria-expanded={open} title={title}>
        {label}
        <span className="timer-caret" aria-hidden="true">▾</span>
      </button>
      {open && <div className="timer-pop">{children}</div>}
    </div>
  )
}

function HistoryList({ log }) {
  return (
    <ul className="timer-pop-list">
      {[...log].reverse().map((r) => (
        <li key={r.at} className="small">
          <span className={`mono ${inTime(r) ? 'ok-text' : 'err-text'}`}>{inTime(r) ? 'In time' : 'Over'}</span>
          <span>{describe(r)}</span>
          <span className="muted">{new Date(r.at).toLocaleDateString()}</span>
        </li>
      ))}
    </ul>
  )
}

// Counts down from the problem's estimated time while the problem is open and on screen. Leaving the page, switching to
// another tab or minimising the window pauses it, and coming back resumes it. A minute without activity stops it too, at
// the last activity, until the next one.
// Recording happens in the progress store when the problem is solved, whichever way it is solved.
export default function ProblemTimer({ problem, compact = false }) {
  const { id, estMinutes } = problem
  const entry = useEntry(id)
  const [now, setNow] = useState(Date.now)
  const timer = validTimer(entry.timer)
  const running = timer && !isStale(timer, now)
  const log = Array.isArray(entry.timeLog) ? entry.timeLog : []
  const last = log.at(-1)
  const lastActive = useRef(Date.now())

  function stopIfIdle() {
    if (speaking()) lastActive.current = Date.now()
    const active = validTimer(getEntry(id).timer)
    const next = active && idleTimer(active, lastActive.current, Date.now())
    if (next !== active) setTimer(id, next)
  }

  function pause() {
    stopIfIdle() // a laptop that slept ran no interval, so the time asleep is taken off here
    const active = validTimer(getEntry(id).timer)
    if (active && !active.pausedAt) setTimer(id, pauseTimer(active, new Date().toISOString()))
  }

  function resume() {
    lastActive.current = Date.now()
    setNow(Date.now())
    const active = validTimer(getEntry(id).timer)
    if (active?.pausedAt && !active.held) setTimer(id, resumeTimer(active, new Date().toISOString()))
  }

  function togglePause() {
    lastActive.current = Date.now()
    setNow(Date.now())
    const now = new Date().toISOString()
    const active = validTimer(getEntry(id).timer)
    setTimer(id, active.pausedAt ? resumeTimer(active, now) : pauseTimer(active, now, true))
  }

  useEffect(() => {
    const current = getEntry(id)
    const solved = statusOf(current) === 'solved'
    const active = validTimer(current.timer)
    if (active && !isStale(active, Date.now())) {
      // an attempt saved before the estimate changed moves to the new target
      if (retargetTimer(active, estMinutes) !== active) setTimer(id, retargetTimer(active, estMinutes))
      resume()
    }
    else if (!solved) setTimer(id, startTimer(estMinutes, new Date().toISOString()))
    else if (active) setTimer(id, null)

    // closing the tab never unmounts this, and a page restored from the back/forward cache never mounts it again
    const restored = (event) => event.persisted && resume()
    // another tab in front, or the window minimised, is time away from the problem
    const seen = () => (document.visibilityState === 'hidden' ? pause() : resume())
    window.addEventListener('pagehide', pause)
    window.addEventListener('pageshow', restored)
    document.addEventListener('visibilitychange', seen)
    return () => {
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pageshow', restored)
      document.removeEventListener('visibilitychange', seen)
      pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, estMinutes])

  useEffect(() => {
    if (!running) return
    lastActive.current = Date.now()
    let spot = ''
    const onActivity = (event) => {
      // the browser also reports a move when the page changes under a still mouse
      if (event.type === 'pointermove') {
        const at = `${event.screenX},${event.screenY}`
        if (at === spot) return
        const first = !spot
        spot = at
        if (first) return
      }
      stopIfIdle()
      lastActive.current = Date.now()
      if (validTimer(getEntry(id).timer)?.idle) resume()
    }
    const check = setInterval(stopIfIdle, 1000)
    ACTIVITY.forEach((name) => window.addEventListener(name, onActivity, { capture: true, passive: true }))
    return () => {
      clearInterval(check)
      ACTIVITY.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, running])

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [running])

  function reset() {
    if (confirm(`Restart the clock from ${timer.minutes}:00? The reset and your total time stay on record.`)) {
      setTimer(id, resetTimer(timer, new Date().toISOString()))
    }
  }

  const history = log.length > 0 && (
    <details className="timer-history">
      <summary className="small muted">History ({log.length})</summary>
      <ul>
        {[...log].reverse().map((r) => (
          <li key={r.at} className="small">
            <span className={`mono ${inTime(r) ? 'ok-text' : 'err-text'}`}>{inTime(r) ? 'In time' : 'Over'}</span>
            <span>{describe(r)}</span>
            <span className="muted">{new Date(r.at).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
    </details>
  )

  if (running) {
    const remaining = remainingMs(timer, now)
    const level = timerLevel(remaining)
    const idle = Boolean(timer.idle)
    const paused = Boolean(timer.pausedAt) && !idle
    const label = paused ? 'Resume timer' : 'Pause timer'
    const note = [
      paused && 'Paused, read only',
      idle && 'Stopped, no activity for a minute, and that minute was given back',
      level === 'over' ? `over the ${timer.minutes} minute target` : `of ${timer.minutes} minutes`,
      timer.resets > 0 && plural(timer.resets, 'reset'),
      timer.pauses > 0 && plural(timer.pauses, 'pause'),
    ].filter(Boolean).join(' · ')
    return (
      <div className={`problem-timer${compact ? ' compact' : ''}`}>
        <span className={`problem-clock mono${paused || idle ? ' muted' : CLOCK_CLASS[level]}`} role="timer" title={note}>
          {level === 'over' && '+'}
          {clock(remaining)}
        </span>
        {(!compact || paused || idle) && (
          <span className="small muted problem-timer-note" title={note}>
            {compact ? (idle ? 'No activity' : 'Paused') : note}
          </span>
        )}
        {!compact && history}
        <button className="icon-btn timer-pause" onClick={togglePause} aria-label={label} title={label}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            {paused ? <path d="M7 4.5v15l13-7.5z" /> : <path d="M6 4h4v16H6zM14 4h4v16h-4z" />}
          </svg>
        </button>
        {!paused && !idle &&
          (compact ? (
            <button className="icon-btn timer-pause" onClick={reset} aria-label="Reset timer" title="Reset timer">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />
              </svg>
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Reset
            </button>
          ))}
        {compact && log.length > 0 && (
          <Menu label={<span className="small">History</span>} title="Earlier times for this problem" className="ghost">
            <div className="timer-pop-title small">Earlier times</div>
            <HistoryList log={log} />
          </Menu>
        )}
      </div>
    )
  }

  if (statusOf(entry) !== 'solved') return null
  const again = () => setTimer(id, startTimer(estMinutes, new Date().toISOString()))
  // compact: one chip with the result; the details, the history and "Time it again" open under it
  if (compact) {
    const ok = last && inTime(last)
    return (
      <div className="problem-timer compact">
        <Menu
          className={last ? (ok ? 'good' : 'bad') : ''}
          title="Your time for this problem"
          label={
            <span className="mono small">
              {last ? `${ok ? '✓' : '⏱'} ${clock(last.seconds * 1000)} / ${last.minutes}:00` : '✓ Solved'}
            </span>
          }
        >
          <div className="timer-pop-title small">
            {last ? (
              <>
                <span className={ok ? 'ok-text' : 'err-text'}>{ok ? 'Solved in time' : 'Solved over time'}</span>: {describe(last)}
              </>
            ) : (
              'Solved, with no time recorded'
            )}
          </div>
          {log.length > 1 && <HistoryList log={log} />}
          <button className="btn btn-primary btn-sm" onClick={again}>
            Time it again
          </button>
        </Menu>
      </div>
    )
  }
  return (
    <div className={`problem-timer${compact ? ' compact' : ''}`}>
      <span className="small problem-timer-note result">
        {last ? (
          <>
            <span className={inTime(last) ? 'ok-text' : 'err-text'}>{inTime(last) ? 'Solved in time' : 'Solved over time'}:</span>{' '}
            {describe(last)}
          </>
        ) : (
          <span className="muted">Solved, with no time recorded</span>
        )}
      </span>
      {history}
      <button className="btn btn-ghost btn-sm" onClick={() => setTimer(id, startTimer(estMinutes, new Date().toISOString()))}>
        Time it again
      </button>
    </div>
  )
}
