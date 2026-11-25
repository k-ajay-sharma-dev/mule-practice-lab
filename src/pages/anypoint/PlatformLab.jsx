import { useCallback, useEffect, useRef, useState } from 'react'
import { labDone, openConsole, PLATFORM_LABS, stepDone } from '../../lab/platform-labs.js'
import AnypointConsole from './AnypointConsole.jsx'
import { Btn, Copy } from './parts.jsx'

const OPEN_KEY = 'pl.lab.anypoint2'
const OLD_KEY = 'pl.lab.anypoint' // the console before it had the API-led project
const LAB_KEY = 'pl.lab.console' // the lab in progress, one at a time, because a state is large
export const platformLabById = new Map(PLATFORM_LABS.map((l) => [l.id, l]))

const isState = (s) => Number.isFinite(s?.clock) && ['apps', 'apis', 'projects', 'assets', 'studio', 'queues', 'mail', 'events', 'traffic', 'clients', 'monAlerts', 'rmAlerts'].every((k) => Array.isArray(s[k])) && typeof s.seen === 'object' && typeof s.creds === 'object'
function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked or full: the console lasts for this visit
  }
}
// a save after each click would write a large text many times, so it waits until the clicks pause
function useSaved(key, value) {
  const latest = useRef(value)
  latest.current = value
  const changed = useRef(false)
  useEffect(() => {
    if (!changed.current) {
      changed.current = true
      return undefined
    }
    const timer = setTimeout(() => write(key, value), 500)
    return () => clearTimeout(timer)
  }, [key, value])
  useEffect(() => () => void (changed.current && write(key, latest.current)), [key])
}

export function OpenConsole() {
  const [state, setState] = useState(() => {
    const saved = read(OPEN_KEY)
    return isState(saved) ? saved : openConsole()
  })
  useSaved(OPEN_KEY, state)
  useEffect(() => {
    try {
      localStorage.removeItem(OLD_KEY)
    } catch {
      // storage blocked
    }
  }, [])
  return (
    <div className="pc-wrap">
      <div className="lab-row-head">
        <p className="muted small lab-grow">A working practice environment with the pages and steps of Anypoint Platform. The order project of Harbor Foods runs in it with three API layers: open Visualizer to see it. Change anything, break anything, then reset it.</p>
        <button className="btn btn-sm btn-ghost" onClick={() => setState(openConsole())}>
          Reset the console
        </button>
      </div>
      <AnypointConsole state={state} onChange={setState} title="Practice console" />
    </div>
  )
}

export function PlatformLab({ lab, solved, onSolved }) {
  const [run, setRun] = useState(() => {
    const saved = read(LAB_KEY)
    return saved?.id === lab.id && isState(saved.state) ? { id: lab.id, state: saved.state, answers: saved.answers ?? {} } : { id: lab.id, state: lab.start(), answers: {} }
  })
  const [round, setRound] = useState(0)
  useSaved(LAB_KEY, run)
  const { state, answers } = run
  const update = useCallback((fn) => setRun((r) => {
    const next = fn(r.state)
    return next === r.state ? r : { ...r, state: next }
  }), [])
  const finished = labDone(lab, state, answers)
  useEffect(() => {
    if (finished && !solved) onSolved()
  }, [finished, solved, onSolved])
  function restart() {
    setRun({ id: lab.id, state: lab.start(), answers: {} })
    setRound(round + 1)
  }
  return (
    <AnypointConsole
      key={round}
      state={state}
      onChange={update}
      title={lab.title}
      guide={<Guide lab={lab} state={state} answers={answers} finished={finished} onAnswer={(i, value) => setRun((r) => ({ ...r, answers: { ...r.answers, [i]: value } }))} onRestart={restart} />}
    />
  )
}

function Guide({ lab, state, answers, finished, onAnswer, onRestart }) {
  const done = lab.steps.map((step, i) => stepDone(step, i, state, answers))
  const current = done.indexOf(false)
  const [open, setOpen] = useState(null)
  const shown = open ?? current
  const count = done.filter(Boolean).length
  const box = useRef(null)
  useEffect(() => {
    setOpen(null)
    const aside = box.current?.parentElement
    const step = box.current?.querySelector('[aria-current="step"]')
    // only the guide scrolls, never the page around it
    if (aside) aside.scrollTop = step && current > 0 ? step.offsetTop - 60 : 0
  }, [current])
  return (
    <div ref={box} className="pc-guide-in">
      <div className="pc-guide-head">
        <b className="pc-grow">{lab.title}</b>
        <Btn onClick={onRestart}>Restart</Btn>
      </div>
      <p>{lab.scenario}</p>
      <div className="pc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={done.length} aria-valuenow={count} aria-label="Steps done">
        <i style={{ width: `${(count / done.length) * 100}%` }} />
      </div>
      <p className="pc-dim">
        {count} of {done.length} steps
      </p>
      {finished && (
        <div className="pc-done" role="status">
          <b>Lab solved</b>
          <p>{lab.why}</p>
          <a href={lab.docs} target="_blank" rel="noreferrer">
            Docs
          </a>
        </div>
      )}
      <ol className="pc-todo">
        {lab.steps.map((step, i) => (
          <li key={i} className={done[i] ? 'done' : i === current ? 'on' : ''} aria-current={i === current ? 'step' : undefined}>
            <button type="button" aria-expanded={shown === i} onClick={() => setOpen(shown === i ? -1 : i)}>
              <i>{done[i] ? '✓' : i + 1}</i>
              {step.title}
            </button>
            {shown === i && <Step step={step} index={i} answer={answers[i]} onAnswer={(v) => onAnswer(i, v)} />}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Step({ step, index, answer, onAnswer }) {
  if (step.ask)
    return (
      <div className="pc-step">
        <p>{step.ask}</p>
        {step.options.map((o, i) => (
          <label key={o} className={`pc-check${answer === i ? (i === step.right ? ' right' : ' wrong') : ''}`}>
            <input type="radio" name={`q${index}`} checked={answer === i} onChange={() => onAnswer(i)} />
            <span>{o}</span>
          </label>
        ))}
        {answer !== undefined && <p className={answer === step.right ? 'pc-good' : 'pc-bad'}>{answer === step.right ? step.reason : 'Not this one. Look again and choose another.'}</p>}
      </div>
    )
  return (
    <div className="pc-step">
      <p>{step.how}</p>
      {step.code && (
        <div className="pc-code">
          <Copy text={step.code} />
          <pre className="pc-pre">{step.code}</pre>
        </div>
      )}
    </div>
  )
}
