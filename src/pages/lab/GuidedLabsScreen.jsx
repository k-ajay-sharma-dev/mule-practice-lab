import { useEffect, useState } from 'react'
import { GUIDED_LABS, labById, runCheck } from '../../lab/labs.js'
import { policyByType } from '../../lab/policies.js'
import Assumed from './Assumed.jsx'
import { AppsTab, PoliciesTab, TiersTab } from './ConfigTabs.jsx'

const PROGRESS_KEY = 'pl.lab.guided'

const isConfig = (c) => Array.isArray(c?.apps) && Array.isArray(c?.tiers) && Array.isArray(c?.policies) && c.policies.every((p) => policyByType.has(p?.type))

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY))
    const configs = Object.fromEntries(Object.entries(saved?.configs ?? {}).filter(([id, config]) => labById.has(id) && isConfig(config)))
    return { solved: saved?.solved ?? {}, configs }
  } catch {
    return { solved: {}, configs: {} }
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
  } catch {
    // storage blocked: progress lasts for this visit
  }
}

export default function GuidedLabsScreen() {
  const [progress, setProgress] = useState(loadProgress)
  const [labId, setLabId] = useState(GUIDED_LABS[0].id)
  const lab = labById.get(labId)
  const solvedCount = GUIDED_LABS.filter((l) => progress.solved[l.id]).length

  useEffect(() => saveProgress(progress), [progress])

  const setConfig = (config) => setProgress((p) => ({ ...p, configs: { ...p.configs, [labId]: config } }))
  const markSolved = () => setProgress((p) => ({ ...p, solved: { ...p.solved, [labId]: true } }))

  function restart() {
    setProgress((p) => ({ ...p, configs: Object.fromEntries(Object.entries(p.configs).filter(([id]) => id !== labId)) }))
  }

  return (
    <div className="lab-guided">
      <section className="lab-panel" aria-label="Guided Labs">
        <div className="lab-panel-head">
          <h2>Guided Labs</h2>
          <span className="muted small">
            {solvedCount} of {GUIDED_LABS.length} solved
          </span>
        </div>
        <ol className="lab-list">
          {GUIDED_LABS.map((l, index) => (
            <li key={l.id}>
              <button className={`lab-pick${l.id === labId ? ' active' : ''}`} aria-current={l.id === labId} onClick={() => setLabId(l.id)}>
                <span className="lab-order mono">{index + 1}</span>
                <span className="lab-grow">{l.title}</span>
                {progress.solved[l.id] && <span className="lab-badge lab-approved">solved</span>}
              </button>
            </li>
          ))}
        </ol>
      </section>
      <LabWorkspace
        key={labId}
        lab={lab}
        config={progress.configs[labId] ?? lab.start()}
        solved={Boolean(progress.solved[labId])}
        onChange={setConfig}
        onSolved={markSolved}
        onRestart={restart}
      />
    </div>
  )
}

function LabWorkspace({ lab, config, solved, onChange, onSolved, onRestart }) {
  const [tab, setTab] = useState('policies')
  const [result, setResult] = useState(null)
  const [hints, setHints] = useState(0)
  const [showSolution, setShowSolution] = useState(false)

  const update = (patch) => {
    onChange({ ...config, ...patch })
    setResult(null)
  }

  function check() {
    const outcome = runCheck(lab, config)
    setResult(outcome)
    if (outcome.passed) onSolved()
  }

  function restart() {
    onRestart()
    setResult(null)
    setHints(0)
    setShowSolution(false)
  }

  return (
    <section className="lab-panel" aria-label={lab.title}>
      <div className="lab-panel-head">
        <h2>{lab.title}</h2>
        <button className="btn btn-sm btn-ghost" onClick={restart}>
          Restart this lab
        </button>
      </div>
      <p className="small">{lab.scenario}</p>
      <p className="small lab-goal">
        <b>Goal:</b> {lab.goal}
      </p>

      <div className="lab-tabs" role="tablist">
        {[
          ['policies', `Policies (${config.policies.length})`],
          ['apps', `Client Applications (${config.apps.length})`],
          ['tiers', `SLA Tiers (${config.tiers.length})`],
        ].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`lab-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'policies' && <PoliciesTab policies={config.policies} onChange={(policies) => update({ policies })} />}
      {tab === 'apps' && <AppsTab apps={config.apps} tiers={config.tiers} onChange={(apps) => update({ apps })} />}
      {tab === 'tiers' && <TiersTab tiers={config.tiers} onChange={(tiers) => update({ tiers })} />}

      <div className="lab-actions">
        <button className="btn btn-primary" onClick={check}>
          Check my work
        </button>
        {hints < lab.hints.length && (
          <button className="btn btn-ghost" onClick={() => setHints(hints + 1)}>
            Show a hint
          </button>
        )}
        {hints === lab.hints.length && !showSolution && (
          <button className="btn btn-ghost" onClick={() => setShowSolution(true)}>
            Show the solution
          </button>
        )}
      </div>
      {hints > 0 && (
        <ul className="muted small">
          {lab.hints.slice(0, hints).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
      {showSolution && (
        <p className="small">
          <b>Solution:</b> {lab.solution}
        </p>
      )}
      {result && <CheckResult lab={lab} result={result} />}
      {!result && solved && <p className="muted small">You have solved this lab. Restart it to practise again.</p>}
    </section>
  )
}

function CheckResult({ lab, result }) {
  return (
    <div className="lab-result" aria-live="polite">
      <div className="lab-row-head">
        <span className={`lab-status ${result.passed ? 'lab-s2' : 'lab-s4'}`}>{result.passed ? 'Passed' : 'Not yet'}</span>
        <span className="lab-grow small">Real requests were sent through the simulator.</span>
      </div>
      <ul className="lab-checks small">
        {result.items.map((item) => (
          <li key={item.label} className={item.ok ? 'lab-pass' : 'lab-reject'}>
            <b>{item.ok ? 'Met' : 'Not met'}</b> {item.label}
            <span className="muted mono"> saw {item.seen}</span>
            {item.basis === 'assumed' && <Assumed />}
          </li>
        ))}
      </ul>
      {result.passed && (
        <p className="small">
          {lab.why}{' '}
          <a href={lab.docs} target="_blank" rel="noreferrer">
            Policy docs
          </a>
        </p>
      )}
    </div>
  )
}
