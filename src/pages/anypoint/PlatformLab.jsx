import { useCallback, useEffect, useRef, useState } from 'react'
import { labDone, PLATFORM_LABS, stepDone } from '../../lab/platform-labs.js'
import AnypointConsole from './AnypointConsole.jsx'
import { Btn, Copy } from './parts.jsx'
import ExplainAloud, { talkingPoints } from '../lab/ExplainAloud.jsx'
import { setHideHow, useHideHow } from '../lab/lab-prefs.js'
import { labPointsFor, recordDrill } from '../../store/lab-points.js'
import { noteSolve } from '../../store/solves.js'
import { isState, read, useSaved } from './console-save.js'

const LAB_KEY = 'pl.lab.console' // the lab in progress, one at a time, because a state is large
export const platformLabById = new Map(PLATFORM_LABS.map((l) => [l.id, l]))

// On call drill scoring: 100 to start, less for each hint, each wrong answer and each minute past the lab's time
const HINT_COST = [5, 10] // the next step's title, then its how text
const WRONG_COST = 5
const LATE_COST = 2 // per minute past the lab's minutes, at most 40
export function drillScore(lab, { hints, wrong }, seconds) {
  const hinted = Object.values(hints).reduce((sum, level) => sum + HINT_COST.slice(0, level).reduce((a, b) => a + b, 0), 0)
  const late = Math.min(40, Math.max(0, Math.floor(seconds / 60 - (lab.minutes ?? 10))) * LATE_COST)
  return Math.max(0, 100 - hinted - wrong * WRONG_COST - late)
}
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

// `drill` ({ startedAt }) opens the lab as an on call drill: a fresh start, the steps hidden, a timer and paid hints.
export function PlatformLab({ lab, solved, onSolved, drill, onNewDrill }) {
  const [run, setRun] = useState(() => {
    const saved = read(LAB_KEY)
    return !drill && saved?.id === lab.id && isState(saved.state) ? { id: lab.id, state: saved.state, answers: saved.answers ?? {} } : { id: lab.id, state: lab.start(), answers: {} }
  })
  const [round, setRound] = useState(0)
  const [oncall, setOncall] = useState(() => (drill ? { startedAt: drill.startedAt, hints: {}, wrong: 0, gaveUp: false, result: null, view: 'drill' } : null))
  const [explain, setExplain] = useState(false)
  const solvedBefore = useRef(solved)
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
  const drilling = oncall && !oncall.gaveUp && !oncall.result
  const ended = useRef(false)
  useEffect(() => {
    if (!finished || !drilling || ended.current) return
    ended.current = true
    const seconds = (Date.now() - oncall.startedAt) / 1000
    const score = drillScore(lab, oncall, seconds)
    const hints = Object.values(oncall.hints).reduce((a, b) => a + b, 0)
    const bonus = recordDrill({ id: lab.id, title: lab.title, seconds: Math.round(seconds), hints, wrong: oncall.wrong, score, gaveUp: false })
    if (bonus > 0) noteSolve('On call drill solved')
    setOncall((d) => ({ ...d, result: { seconds, score, hints, wrong: d.wrong, bonus, labPoints: solvedBefore.current ? 0 : labPointsFor(lab.id) } }))
  }, [finished, drilling, oncall, lab])
  function giveUp() {
    const seconds = (Date.now() - oncall.startedAt) / 1000
    recordDrill({ id: lab.id, title: lab.title, seconds: Math.round(seconds), hints: Object.values(oncall.hints).reduce((a, b) => a + b, 0), wrong: oncall.wrong, score: 0, gaveUp: true })
    setOncall((d) => ({ ...d, gaveUp: true, view: 'steps' }))
  }
  function restart() {
    setRun({ id: lab.id, state: lab.start(), answers: {} })
    setRound(round + 1)
  }
  function answer(i, value) {
    if (drilling && lab.steps[i].ask && value !== lab.steps[i].right && answers[i] !== value) setOncall((d) => ({ ...d, wrong: d.wrong + 1 }))
    setRun((r) => ({ ...r, answers: { ...r.answers, [i]: value } }))
  }
  const onExplain = () => setExplain(true)
  let guide
  if (oncall && oncall.view === 'drill' && drilling)
    guide = <DrillGuide lab={lab} state={state} answers={answers} drill={oncall} onHint={(i) => setOncall((d) => ({ ...d, hints: { ...d.hints, [i]: (d.hints[i] ?? 0) + 1 } }))} onAnswer={answer} onGiveUp={giveUp} />
  else if (oncall && oncall.view === 'drill' && oncall.result)
    guide = <DrillResult lab={lab} result={oncall.result} onExplain={onExplain} onSteps={() => setOncall((d) => ({ ...d, view: 'steps' }))} onNewDrill={onNewDrill} />
  else
    guide = <Guide lab={lab} state={state} answers={answers} finished={finished} gaveUp={Boolean(oncall?.gaveUp)} onAnswer={answer} onRestart={restart} onExplain={onExplain} />
  return (
    <>
      <AnypointConsole key={round} state={state} onChange={update} title={drilling ? `On call: ${lab.title}` : lab.title} guide={guide} />
      {explain && <ExplainAloud lab={lab} onClose={() => setExplain(false)} />}
    </>
  )
}

function Timer({ since }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])
  return (
    <span className="pl-drill-timer mono" role="timer" aria-label="Time since the incident started">
      {clock((now - since) / 1000)}
    </span>
  )
}

// The drill panel: the scenario and a timer. The steps tick in the background; questions show when they are next.
function DrillGuide({ lab, state, answers, drill, onHint, onAnswer, onGiveUp }) {
  const done = lab.steps.map((step, i) => stepDone(step, i, state, answers))
  const count = done.filter(Boolean).length
  const current = done.indexOf(false)
  const target = lab.steps.findIndex((s, i) => !s.ask && !done[i])
  const level = target < 0 ? 2 : (drill.hints[target] ?? 0)
  const hinted = Object.keys(drill.hints).map(Number).sort((a, b) => a - b)
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="pc-guide-in pl-drill">
      <div className="pc-guide-head">
        <b className="pc-grow">On call drill</b>
        <Timer since={drill.startedAt} />
      </div>
      <p className="pl-drill-page">Incident open. You are on call. Work in the console until the problem is fixed.</p>
      <p>{lab.scenario}</p>
      <div className="pc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={done.length} aria-valuenow={count} aria-label="Steps done">
        <i style={{ width: `${(count / done.length) * 100}%` }} />
      </div>
      <p className="pc-dim">
        {count} of {done.length} steps done. Target time about {lab.minutes} min.
      </p>
      {current >= 0 && lab.steps[current].ask && (
        <div className="pl-drill-ask">
          <b>Question from the incident lead</b>
          <Step step={lab.steps[current]} index={current} answer={answers[current]} onAnswer={(v) => onAnswer(current, v)} />
        </div>
      )}
      {hinted.length > 0 && (
        <ol className="pl-drill-hints">
          {hinted.map((i) => (
            <li key={i} className={done[i] ? 'done' : ''}>
              <b>
                {done[i] ? '✓ ' : ''}
                {lab.steps[i].title}
              </b>
              {drill.hints[i] > 1 && <Step step={lab.steps[i]} index={i} />}
            </li>
          ))}
        </ol>
      )}
      <div className="pl-drill-actions">
        <Btn kind="outline" disabled={level >= 2} onClick={() => onHint(target)}>
          {level === 0 ? `Hint: the next step (${HINT_COST[0]} points)` : level === 1 ? `Hint: how to do it (${HINT_COST[1]} points)` : target < 0 ? 'No hints left' : 'No more hints for this step'}
        </Btn>
        {confirm ? (
          <>
            <Btn kind="danger" onClick={onGiveUp}>
              Yes, show all steps
            </Btn>
            <Btn onClick={() => setConfirm(false)}>Keep going</Btn>
          </>
        ) : (
          <Btn onClick={() => setConfirm(true)}>Give up</Btn>
        )}
      </div>
      <p className="pc-dim">
        Score so far, not counting time: {drillScore(lab, drill, 0)}. Each hint and wrong answer costs points, and so does each minute past the target.
      </p>
    </div>
  )
}

function DrillResult({ lab, result, onExplain, onSteps, onNewDrill }) {
  return (
    <div className="pc-guide-in pl-drill">
      <div className="pc-done pl-drill-result" role="status">
        <b>Incident resolved</b>
        <dl className="pl-drill-stats">
          <div>
            <dt>Time</dt>
            <dd className="mono">{clock(result.seconds)}</dd>
          </div>
          <div>
            <dt>Hints</dt>
            <dd>{result.hints}</dd>
          </div>
          <div>
            <dt>Wrong answers</dt>
            <dd>{result.wrong}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>
              <b>{result.score}</b> of 100
            </dd>
          </div>
        </dl>
        <p className="pc-dim">
          {result.labPoints ? `+${result.labPoints} points for solving the lab. ` : ''}
          {result.bonus ? `+${result.bonus} drill bonus points.` : 'No new bonus points: your best drill score for this lab is the one that counts.'}
        </p>
      </div>
      <b>What to say in the interview</b>
      <dl className="pl-explain-points">
        {talkingPoints(lab).map(([label, text]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <div className="pl-drill-actions">
        <Btn kind="primary" onClick={onExplain}>
          Explain this fix out loud
        </Btn>
        <Btn onClick={onSteps}>Show the steps</Btn>
        {onNewDrill && <Btn onClick={onNewDrill}>Another drill</Btn>}
      </div>
    </div>
  )
}

function Guide({ lab, state, answers, finished, gaveUp, onAnswer, onRestart, onExplain }) {
  const done = lab.steps.map((step, i) => stepDone(step, i, state, answers))
  const current = done.indexOf(false)
  const [open, setOpen] = useState(null)
  const [howShown, setHowShown] = useState({})
  const hideHow = useHideHow()
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
      <div className="pl-guide-bar">
        <p className="pc-dim pc-grow">
          {count} of {done.length} steps
        </p>
        <label className="pc-dim pl-hide-how">
          <input type="checkbox" checked={hideHow} onChange={(e) => setHideHow(e.target.checked)} /> Hide the how text
        </label>
      </div>
      {gaveUp && !finished && <p className="pc-dim">You gave up the drill, so all steps are open. Finish the lab to mark it solved.</p>}
      {finished && (
        <div className="pc-done" role="status">
          <b>Lab solved</b>
          <p>{lab.why}</p>
          <div className="pl-done-actions">
            <Btn kind="primary" onClick={onExplain}>
              Explain this fix out loud
            </Btn>
            <a href={lab.docs} target="_blank" rel="noreferrer">
              Docs
            </a>
          </div>
        </div>
      )}
      <ol className="pc-todo">
        {lab.steps.map((step, i) => (
          <li key={i} className={done[i] ? 'done' : i === current ? 'on' : ''} aria-current={i === current ? 'step' : undefined}>
            <button type="button" aria-expanded={shown === i} onClick={() => setOpen(shown === i ? -1 : i)}>
              <i>{done[i] ? '✓' : i + 1}</i>
              {step.title}
            </button>
            {shown === i &&
              (!step.ask && hideHow && !done[i] && !howShown[i] ? (
                <div className="pc-step">
                  <Btn kind="outline" onClick={() => setHowShown((h) => ({ ...h, [i]: true }))}>
                    Show how
                  </Btn>
                </div>
              ) : (
                <Step step={step} index={i} answer={answers[i]} onAnswer={(v) => onAnswer(i, v)} />
              ))}
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
