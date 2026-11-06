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

// Sits above a designer and shows one small step at a time, ticking each requirement as the design meets it.
// steps come from study/steps.js, results are live, and hintFor(index) says what a failing check still needs.
export default function StepGuide({ steps, checks, results, hintFor, finish }) {
  const [on, setOn] = useState(readOn)
  const [showHints, setShowHints] = useState(false)
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
  return (
    <div className="step-guide">
      <div className="step-guide-head">
        <span className="step-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.title} className={i < at ? 'done' : i === at ? 'now' : ''} />
          ))}
        </span>
        <b className="small">{step ? `Step ${at + 1} of ${steps.length}: ${step.title}` : 'All steps are done'}</b>
        <span className="step-guide-actions">
          {step && (
            <button className="link-btn small" onClick={() => setShowHints(!showHints)}>
              {showHints ? 'Hide help' : "What's missing?"}
            </button>
          )}
          <button className="link-btn small" onClick={toggle}>
            Turn off
          </button>
        </span>
      </div>
      {step ? (
        <ul className="check-list step-guide-list">
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
      ) : (
        finish
      )}
    </div>
  )
}
