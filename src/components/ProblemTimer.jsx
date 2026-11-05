import { useEffect, useState } from 'react'
import { getEntry, setTimer, statusOf, useEntry } from '../store/progress.js'
import { clock, inTime, isStale, remainingMs, resetTimer, startTimer, timerLevel, validTimer } from '../study/timer.js'

const CLOCK_CLASS = { ok: '', low: ' warn-text', last: ' err-text timer-blink', over: ' err-text' }
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function describe(record) {
  const parts = [`${clock(record.seconds * 1000)} of ${record.minutes}:00`]
  if (record.resets) parts.push(`${plural(record.resets, 'reset')}, ${clock(record.totalSeconds * 1000)} in total`)
  return parts.join(' · ')
}

// Counts down from the problem's estimated time. It starts when the problem opens and keeps running if you leave.
// Recording happens in the progress store when the problem is solved, whichever way it is solved.
export default function ProblemTimer({ problem }) {
  const { id, estMinutes } = problem
  const entry = useEntry(id)
  const [now, setNow] = useState(Date.now)
  const timer = validTimer(entry.timer)
  const running = timer && !isStale(timer, now)
  const log = Array.isArray(entry.timeLog) ? entry.timeLog : []
  const last = log.at(-1)

  useEffect(() => {
    const current = getEntry(id)
    const solved = statusOf(current) === 'solved'
    const active = validTimer(current.timer)
    if (active && !isStale(active, Date.now())) return
    if (!solved) setTimer(id, startTimer(estMinutes, new Date().toISOString()))
    else if (active) setTimer(id, null)
  }, [id, estMinutes])

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
    return (
      <div className="problem-timer">
        <span className={`problem-clock mono${CLOCK_CLASS[level]}`} role="timer">
          {level === 'over' && '+'}
          {clock(remaining)}
        </span>
        <span className="small muted problem-timer-note">
          {level === 'over' ? `over the ${timer.minutes} minute target` : `of ${timer.minutes} minutes`}
          {timer.resets > 0 && ` · ${plural(timer.resets, 'reset')}`}
        </span>
        {history}
        <button className="btn btn-ghost btn-sm" onClick={reset}>
          Reset
        </button>
      </div>
    )
  }

  if (statusOf(entry) !== 'solved') return null
  return (
    <div className="problem-timer">
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
