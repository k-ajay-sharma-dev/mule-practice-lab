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

// small line icons for the step guide buttons, drawn in the text colour
const PATHS = {
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 1v4M12 19v4M1 12h4M19 12h4',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
}
function Icon({ name, className = '' }) {
  return (
    <svg className={`sg-svg ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
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
          {!step && finish}
          {(rung || (onFind && nextItem !== undefined) || (step && open)) && (
            <span className="sg-group" role="group" aria-label="Help with this step">
              {rung && level > 0 && hidden && (
                <button className="sg-btn" onClick={() => setHidden(false)} title="Open the hints you already used">
                  <Icon name="bulb" className="sg-hint-icon" />
                  Hints ({level})
                </button>
              )}
              {rung && level < 3 && !hidden && (
                <button className="sg-btn" onClick={nextHint} title="Hints go one small step at a time, so you still do the thinking">
                  <Icon name="bulb" className="sg-hint-icon" />
                  {['Hint', 'Hint 2 of 3', 'Answer piece'][level]}
                </button>
              )}
              {rung && level > 0 && !hidden && (
                <button className="sg-btn" onClick={() => setHidden(true)} title="Close the hints">
                  Hide hint
                </button>
              )}
              {onFind && nextItem !== undefined && (
                <button className="sg-btn" onClick={() => onFind(nextItem)} title="Show what is wrong, where on your canvas, and how the reference differs, for this check only">
                  <Icon name="target" />
                  Find it
                </button>
              )}
              {step && open && (
                <button
                  className={`sg-btn${showHints ? ' on' : ''}`}
                  onClick={() => setShowHints(!showHints)}
                  aria-pressed={showHints}
                  title="Show under each open check what is still missing"
                >
                  <Icon name="list" />
                  What's missing
                </button>
              )}
            </span>
          )}
          {step && (
            <button
              className="sg-icon"
              onClick={toggleOpen}
              aria-expanded={open}
              aria-label={open ? 'Hide the checks of this step' : 'Show the checks of this step'}
              title={open ? 'Hide the checks of this step' : 'Show the checks of this step'}
            >
              <Icon name={open ? 'up' : 'down'} />
            </button>
          )}
          <button className="sg-icon" onClick={toggle} aria-label="Turn off the step guide" title="Turn off the step guide">
            <Icon name="close" />
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
