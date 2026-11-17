import { useEffect, useState } from 'react'
import { currentStep } from '../study/steps.js'

const KEY = 'pl.stepGuide'
const readOn = () => {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

const OPEN_KEY = 'pl.stepGuideOpen'
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === 'yes'
  } catch {
    return false
  }
}

// Sits above a designer and shows one small step at a time, ticking each requirement as the design meets it.
// steps come from study/steps.js, results are live, and hintFor(index) says what a failing check still needs.
// ladder(index) gives the three hints for a failing check ({ scenario, missing, piece }), and onHint(index, level)
// records each one used.
// onFind(index) opens Find it for a failing check (where it is and how it differs from the reference).
export default function StepGuide({ steps, checks, results, hintFor, finish, ladder, onHint, onFind }) {
  const [on, setOn] = useState(readOn)
  const [showHints, setShowHints] = useState(false)
  const [hint, setHint] = useState({ item: null, level: 0 })
  const [open, setOpen] = useState(readOpen)
  const at = currentStep(steps, results)

  useEffect(() => setShowHints(false), [at])

  function toggle() {
    try {
      localStorage.setItem(KEY, on ? 'off' : 'on')
    } catch {
      // storage blocked: the choice lasts for this visit
    }
    setOn(!on)
  }

  if (!steps.length) return null
  if (!on) {
    return (
      <div className="step-guide off">
        <button className="link-btn small" onClick={toggle}>
          Build step by step
        </button>
      </div>
    )
  }

  const step = steps[at]
  const nextItem = step?.items.find((n) => !results[n]?.pass)
  const level = hint.item === nextItem ? hint.level : 0
  const hidden = hint.item === nextItem && hint.hidden
  const rung = ladder && nextItem !== undefined ? ladder(nextItem) : null
  function nextHint() {
    const next = level + 1
    setHint({ item: nextItem, level: next, hidden: false })
    onHint?.(nextItem, next)
  }
  // closing the hints keeps how far you went, so opening them again shows the same ones without counting another
  const setHidden = (h) => setHint({ item: nextItem, level, hidden: h })
  function toggleOpen() {
    try {
      localStorage.setItem(OPEN_KEY, open ? 'no' : 'yes')
    } catch {
      // storage blocked: the choice lasts for this visit
    }
    setOpen(!open)
  }
  return (
    <div className={`step-guide${open ? '' : ' slim'}`}>
      <div className="step-guide-head">
        <span className="step-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i < at ? 'done' : i === at ? 'now' : ''} />
          ))}
        </span>
        <b className="small">{step ? `Step ${at + 1}/${steps.length}: ${step.title}` : 'All steps are done'}</b>
        {step && !open && nextItem !== undefined && (
          <span className="small muted step-guide-next" title={checks[nextItem].label}>
            Next: {checks[nextItem].label}
          </span>
        )}
        <span className="step-guide-actions">
          {rung && level > 0 && hidden && (
            <button className="link-btn small hint-btn" onClick={() => setHidden(false)}>
              💡 Show hints ({level})
            </button>
          )}
          {rung && level < 3 && !hidden && (
            <button className="link-btn small hint-btn" onClick={nextHint} title="Hints go one small step at a time, so you still do the thinking">
              {['💡 Hint', '💡 Hint 2 of 3', '💡 Show this piece of the answer'][level]}
            </button>
          )}
          {rung && level > 0 && !hidden && (
            <button className="link-btn small" onClick={() => setHidden(true)} title="Close the hints">
              ✕ Close hint
            </button>
          )}
          {onFind && nextItem !== undefined && (
            <button className="link-btn small find-it-btn" onClick={() => onFind(nextItem)} title="Show what is wrong, where on your canvas, and how the reference differs, for this check only">
              🔎 Find it
            </button>
          )}
          {step && (
            <button className="link-btn small" onClick={toggleOpen} aria-expanded={open}>
              {open ? 'Less ▴' : 'All checks ▾'}
            </button>
          )}
          {step && open && (
            <button className="link-btn small" onClick={() => setShowHints(!showHints)}>
              {showHints ? 'Hide help' : "What's missing?"}
            </button>
          )}
          {!step && finish}
          <button className="link-btn small muted step-guide-off" onClick={toggle} title="Hide the step guide">
            Turn off
          </button>
        </span>
      </div>
      {rung && level > 0 && !hidden && (
        <ol className="hint-ladder small">
          <li>
            <b>Think.</b> Which part of the scenario asks for “{checks[nextItem].label}”? What would go wrong without it?
            {rung.scenario && <q className="hint-quote">{rung.scenario}</q>}
          </li>
          {level > 1 && (
            <li>
              <b>What is missing.</b> {rung.missing}
            </li>
          )}
          {level > 2 && (
            <li>
              <b>This piece of the model answer.</b>{' '}
              {rung.piece ?? 'The model answer does not cover this in one place. Open the reference for this step only, then close it and build it yourself.'}
            </li>
          )}
        </ol>
      )}
      {step ? (
        open && <ul className="check-list step-guide-list">
          {step.items.map((n) => {
            const pass = results[n]?.pass
            return (
              <li key={n} className={pass ? 'pass' : ''}>
                <span className="mark">{pass ? '✓' : '○'}</span>
                <span>
                  {checks[n].label}
                  {showHints && !pass && <span className="check-hint muted small">{hintFor(n)}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
