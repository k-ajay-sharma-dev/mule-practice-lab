import { useState } from 'react'
import { scheduleReview, updateEntry } from '../store/progress.js'
import { answerPiece, scenarioLine } from '../study/hints.js'
import { useAutosave } from '../workspaces/useAutosave.js'

// Helps for the design problems (flows and architecture), where a blank canvas makes it tempting to open the
// reference too early: a plan to fill in before drawing, a hint ladder, and rebuilding from memory.

const PLANS = {
  flow: [
    'What starts the flow? (HTTP call, schedule, queue message, file)',
    'What comes in, and what must go out?',
    'What could be wrong with the input, and how do you check it?',
    'Which systems does it call, and in what order?',
    'What happens when each call fails? (error handler, retry, DLQ)',
  ],
  arch: [
    'Who calls, and which system owns the data?',
    'Sync or async: does the caller need the answer now?',
    'What is slow, limited or often down? (that needs a queue, cache or timeout)',
    'Which layer does each API belong to? (Experience, Process, System)',
    'What happens when one piece fails, and is anything lost?',
  ],
}

export function PlanBox({ problemId, kind, saved, started }) {
  const questions = PLANS[kind]
  const [plan, setPlan] = useState(() => questions.map((_, i) => (Array.isArray(saved) ? saved[i] ?? '' : '')))
  useAutosave(plan, (value) => updateEntry(problemId, { plan: value }))
  const filled = plan.filter((a) => a.trim()).length
  return (
    <details className="plan-box" open={!started || undefined}>
      <summary>
        <b>Plan before you draw</b>{' '}
        <span className="muted small">
          {filled} of {questions.length} answered. Most of the design comes out of these answers.
        </span>
      </summary>
      <ol>
        {questions.map((q, i) => (
          <li key={q}>
            <label className="small">{q}</label>
            <textarea
              className="input"
              rows={2}
              value={plan[i]}
              onChange={(e) => setPlan(plan.map((a, j) => (j === i ? e.target.value : a)))}
            />
          </li>
        ))}
      </ol>
    </details>
  )
}

// The three hints for a failing check: the scenario line, what is missing, then one piece of the model answer
export function ladderFor(description, solution, checks, missing) {
  return (index) => ({
    scenario: scenarioLine(description, checks[index].label),
    missing: missing(index),
    piece: answerPiece(solution, checks[index].label),
  })
}

export function recordHint(problemId, entry, index, level) {
  recordHints(problemId, entry, [index], level)
}

export function recordHints(problemId, entry, indices, level) {
  const hints = { ...(entry.hints && typeof entry.hints === 'object' ? entry.hints : {}) }
  let changed = false
  for (const i of indices) {
    if ((hints[i] ?? 0) >= level) continue
    hints[i] = level
    changed = true
  }
  if (changed) updateEntry(problemId, { hints })
}

export const hintsUsed = (entry) => Object.values(entry.hints && typeof entry.hints === 'object' ? entry.hints : {}).reduce((a, b) => a + b, 0)

// Seeing the answer is fine. It only sticks once you rebuild it yourself, so the problem comes back for review.
export function revealReference(problemId) {
  updateEntry(problemId, { revealed: true, revealedAt: new Date().toISOString() })
  scheduleReview(problemId, false)
}

// The reference one step at a time: each step of the build shows only its own piece of the model answer, and
// opening one counts as the last hint for those checks. The full reference stays closed.
// parts: { steps, checks, ladder, onPart(indices) }
function RevealParts({ parts }) {
  const [shown, setShown] = useState([])
  const { steps, checks, ladder, onPart } = parts
  if (!steps?.length) return null
  function show(si) {
    setShown([...shown, si])
    onPart(steps[si].items)
  }
  return (
    <div className="reveal-parts">
      <div className="section-title">Open one part only</div>
      <ol>
        {steps.map((s, si) => {
          const open = shown.includes(si)
          const pieces = open
            ? [...new Set(s.items.map((i) => ladder(i).piece ?? `${checks[i].label}. ${ladder(i).missing ?? ''}`))]
            : []
          return (
            <li key={s.title} className={open ? 'open' : ''}>
              <span className="reveal-part-head">
                <b className="small">{s.title}</b>
                {!open && (
                  <button className="link-btn small" onClick={() => show(si)}>
                    Show this part
                  </button>
                )}
              </span>
              {open && (
                <ul className="small">
                  {pieces.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function RevealGate({ entry, onReveal, children, parts }) {
  const used = hintsUsed(entry)
  if (entry.rebuilding) {
    return (
      <div className="reveal-gate">
        <p className="small">
          <b>You are rebuilding this from memory.</b> The reference stays hidden until your design passes its checks.
          Use the 💡 Hint above the canvas if you are stuck.
        </p>
        <button className="btn btn-ghost" onClick={() => confirm('Open the reference before you finish the rebuild?') && onReveal()}>
          Open it anyway
        </button>
      </div>
    )
  }
  return (
    <div className="reveal-gate">
      {children}
      <p className="muted small">
        Stuck? Try the 💡 Hint above the canvas first ({used ? `${used} used so far` : 'none used yet'}). Each hint
        shows one small step. Opening the reference puts this problem on your review list, to rebuild from memory.
      </p>
      {parts && <RevealParts parts={parts} />}
      <button className="btn btn-primary" onClick={onReveal}>
        Reveal the whole reference
      </button>
    </div>
  )
}

export function RebuildBanner({ entry, onRebuild }) {
  if (entry.rebuilding) {
    return (
      <div className="rebuild-banner small">
        <b>Rebuilding from memory.</b> The reference is hidden until your design passes. Plan first, then build.
      </div>
    )
  }
  if (!entry.revealed) return null
  return (
    <div className="rebuild-banner small">
      <span>
        <b>You have seen the reference.</b> It sticks when you build it again without looking.
        {entry.rebuilds > 0 && ` Rebuilt ${entry.rebuilds} time${entry.rebuilds === 1 ? '' : 's'} so far.`}
      </span>
      <button className="btn btn-sm btn-primary" onClick={onRebuild} title="Clears the canvas and hides the reference until your design passes">
        Rebuild from memory
      </button>
    </div>
  )
}

export function startRebuild(problemId, entry, clear) {
  if (!confirm('Clear the canvas and hide the reference until your design passes its checks? Undo brings the design back.')) return
  clear()
  updateEntry(problemId, { revealed: false, rebuilding: true, rebuilds: (entry.rebuilds ?? 0) + 1 })
}
