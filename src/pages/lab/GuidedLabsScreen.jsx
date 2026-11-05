import { useCallback, useEffect, useState } from 'react'
import { GUIDED_LABS, labById, runCheck } from '../../lab/labs.js'
import { policyByType } from '../../lab/policies.js'
import Assumed from './Assumed.jsx'
import { AppsTab, NodesTab, PoliciesTab, TiersTab } from './ConfigTabs.jsx'
import { formFor, RuntimeWorkbench } from './RuntimeManagerScreen.jsx'
import { topologyOf } from '../../lab/engine.js'

const PROGRESS_KEY = 'pl.lab.guided'

const isConfig = (c) =>
  Array.isArray(c?.apps) && Array.isArray(c?.tiers) && Array.isArray(c?.policies) && [...c.policies, ...(c.automated ?? [])].every((p) => policyByType.has(p?.type))
const isRuntimeState = (s) => Number.isFinite(s?.clock) && Array.isArray(s?.apps)
const isSaved = (lab, config) => (lab.kind === 'runtime' ? isRuntimeState(config) : isConfig(config))

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY))
    const configs = Object.fromEntries(Object.entries(saved?.configs ?? {}).filter(([id, config]) => labById.has(id) && isSaved(labById.get(id), config)))
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

  // takes a value or an updater, because a running deployment advances its state on a timer
  const setConfig = useCallback(
    (next) =>
      setProgress((p) => {
        const value = typeof next === 'function' ? next(p.configs[labId] ?? labById.get(labId).start()) : next
        return { ...p, configs: { ...p.configs, [labId]: value } }
      }),
    [labId],
  )
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
                <span className="muted small">{l.kind === 'runtime' ? 'Runtime' : 'API'}</span>
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
  const [attempt, setAttempt] = useState(0)
  const isRuntime = lab.kind === 'runtime'

  const update = (patch) => {
    onChange({ ...config, ...patch })
    setResult(null)
  }

  const updateState = useCallback(
    (next) => {
      onChange(next)
      setResult(null)
    },
    [onChange],
  )

  function check() {
    const outcome = runCheck(lab, config)
    setResult(outcome)
    if (outcome.passed) onSolved()
  }

  function restart() {
    onRestart()
    setAttempt((a) => a + 1)
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

      {isRuntime ? (
        <RuntimeWorkbench
          key={attempt}
          state={config}
          onChange={updateState}
          onReset={restart}
          resetLabel="Restart this lab"
          focus={lab.focus}
          startForm={() => formFor((config.apps.find((a) => a.name === lab.focus) ?? config.apps[0])?.config)}
        />
      ) : (
        <>
          <div className="lab-tabs" role="tablist">
            {[
              ['policies', `Policies (${config.policies.length + (config.automated?.length ?? 0)})`],
              ['apps', `Client Applications (${config.apps.length})`],
              ['tiers', `SLA Tiers (${config.tiers.length})`],
              ['nodes', `Nodes (${topologyOf(config).nodes})`],
            ].map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} className={`lab-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'policies' && (
            <PoliciesTab
              policies={config.policies}
              automated={config.automated}
              onChange={(policies) => update({ policies })}
              onAutomatedChange={(automated) => update({ automated })}
            />
          )}
          {tab === 'apps' && <AppsTab apps={config.apps} tiers={config.tiers} onChange={(apps) => update({ apps })} />}
          {tab === 'tiers' && <TiersTab tiers={config.tiers} onChange={(tiers) => update({ tiers })} />}
          {tab === 'nodes' && <NodesTab config={config} onChange={(topology) => update({ topology })} />}
        </>
      )}

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
      {result && <CheckResult lab={lab} result={result} isRuntime={isRuntime} />}
      {!result && solved && <p className="muted small">You have solved this lab. Restart it to practise again.</p>}
    </section>
  )
}

function CheckResult({ lab, result, isRuntime }) {
  return (
    <div className="lab-result" aria-live="polite">
      <div className="lab-row-head">
        <span className={`lab-status ${result.passed ? 'lab-s2' : 'lab-s4'}`}>{result.passed ? 'Passed' : 'Not yet'}</span>
        <span className="lab-grow small">{isRuntime ? 'Every deployment was played to its end in the simulator.' : 'Real requests were sent through the simulator.'}</span>
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
            {isRuntime ? 'Docs' : 'Policy docs'}
          </a>
        </p>
      )}
    </div>
  )
}
