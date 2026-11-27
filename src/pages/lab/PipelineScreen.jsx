import { useCallback, useEffect, useRef, useState } from 'react'
import { pipelineLabDone, pipelineStepDone } from '../../lab/pipeline-labs.js'
import { isSnapshot, versionsOf } from '../../lab/exchange.js'
import {
  allowOutbound,
  ASSET_ID,
  DEPLOY_COMMANDS,
  DEPLOY_TARGETS,
  ENVIRONMENTS,
  freeReserved,
  hybridTargets,
  isFeatureBuild,
  newConfig,
  newPromotion,
  newState,
  overwriteSnapshot,
  pairing,
  pomPreview,
  promoteInstance,
  PROPERTY_MODES,
  REQUIRED_KEYS,
  rollback,
  RUNNER_TYPES,
  running,
  SCENARIOS,
  settle,
  stagesFor,
  startRedeploy,
  startRun,
  step,
  TARGET_TYPES,
  targetFor,
  typeName,
  undeploy,
  updateBinding,
} from '../../lab/pipeline.js'
import { APP, coverageSettings, createTestFor, flowPath, flowXml, fmt, munitProject, revertFile, setFile, templateNote, testsByFlow, workflowCommands, WORKFLOW } from '../../lab/pipeline-munit.js'
import { CodeBlock } from '../../components/CopyButton.jsx'
import Assumed from './Assumed.jsx'
import { LabOutcome } from './ExchangeScreen.jsx'
import './exchange.css'
import ExplainAloud from './ExplainAloud.jsx'
import { setHideHow, useHideHow } from './lab-prefs.js'

const STATE_KEY = 'pl.lab.pipeline'
const GUIDED_KEY = 'pl.lab.cicd' // the guided lab in progress, one at a time
const TICK_MS = 900 // real time between two stages while a run plays
const STATUS_TEXT = { pending: 'Waiting', passed: 'Passed', warned: 'Passed, check this', failed: 'Failed', skipped: 'Skipped' }

const emptySeen = () => ({ views: [], jobs: [] })
// the patch is cloned, so edits to a lab's MUnit files never reach the lab definition
const freshFor = (guided) => ({ lab: newState(), config: { ...newConfig(), ...structuredClone(guided?.patch ?? {}) }, seen: emptySeen(), answers: {} })

// The open pipeline and a guided lab keep separate saves, so a lab never changes the pipeline you built yourself.
function loadSaved(guided) {
  const fresh = freshFor(guided)
  try {
    const saved = JSON.parse(localStorage.getItem(guided ? GUIDED_KEY : STATE_KEY))
    const valid = saved?.lab?.envs?.Sandbox && saved.lab.envs.Production && Array.isArray(saved.lab.runs) && saved.lab.exchange && saved.config && (!guided || saved.id === guided.id)
    if (!valid) return fresh
    // saves from before the hybrid targets existed get the sample servers
    for (const name of ENVIRONMENTS) saved.lab.envs[name].targets ??= hybridTargets(name)
    const seen = Array.isArray(saved.seen?.views) && Array.isArray(saved.seen?.jobs) ? saved.seen : emptySeen()
    return { lab: saved.lab, config: { ...newConfig(), ...saved.config }, seen, answers: saved.answers ?? {} }
  } catch {
    return fresh
  }
}

function save(guided, value) {
  try {
    localStorage.setItem(guided ? GUIDED_KEY : STATE_KEY, JSON.stringify(guided ? { id: guided.id, ...value } : { lab: value.lab, config: value.config }))
  } catch {
    // storage blocked: the pipeline lasts for this visit
  }
}

// The release pipeline, laid out like a GitHub Actions page: a repository header, a sidebar, the workflow's runs and
// one run with its job graph and logs. The lab is the same as before; only the way it is shown changed.
const SIDE = [
  ['runs', 'Release pipeline', 'workflow'],
  ['options', 'Workflow options', 'gear'],
  ['munit', 'MUnit tests', 'beaker'],
  ['environments', 'Environments', 'rocket'],
  ['exchange', 'Exchange versions', 'package'],
  ['promote', 'Promote API instance', 'arrow'],
]

// `guided` is a lab from pipeline-labs.js: the screen then shows its steps beside the page.
export default function PipelineScreen({ guided, solved, onSolved }) {
  const [saved] = useState(() => loadSaved(guided))
  const [state, setState] = useState(saved.lab)
  const [config, setConfig] = useState(saved.config)
  const [seen, setSeen] = useState(saved.seen)
  const [answers, setAnswers] = useState(saved.answers)
  const [scenarioId, setScenarioId] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [view, setView] = useState('runs')
  const [openRun, setOpenRun] = useState(null)
  const active = Boolean(running(state))
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  const run = openRun === null ? null : state.runs.find((r) => r.id === openRun)
  const ctx = { state, config, seen, answers }
  const finished = Boolean(guided) && pipelineLabDone(guided, ctx)

  useEffect(() => save(guided, { lab: state, config, seen, answers }), [guided, state, config, seen, answers])

  useEffect(() => {
    if (finished && !solved) onSolved?.()
  }, [finished, solved, onSolved])

  const note = useCallback((kind, key) => setSeen((s) => (s[kind].includes(key) ? s : { ...s, [kind]: [...s[kind], key] })), [])

  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setState((s) => step(s)), TICK_MS)
    return () => clearInterval(timer)
  }, [active])

  function chooseScenario(id) {
    setScenarioId(id)
    const chosen = SCENARIOS.find((s) => s.id === id)
    setConfig({ ...newConfig(), ...chosen?.patch })
  }

  // a new run opens on its own page, as it does after "Run workflow"
  function begin(next) {
    if (next === state) return
    setOutcome(null)
    setState(next)
    setOpenRun(next.runs[0].id)
    setView('runs')
  }

  function apply(result) {
    setState(result.state)
    setOutcome(result.outcome)
  }

  function reset() {
    const fresh = freshFor(guided)
    setState(fresh.lab)
    setConfig(fresh.config)
    setSeen(fresh.seen)
    setAnswers(fresh.answers)
    setScenarioId('')
    setOutcome(null)
    setOpenRun(null)
    setView('runs')
  }

  function go(key) {
    setView(key)
    setOpenRun(null)
    setOutcome(null)
    note('views', key)
  }

  return (
    <div className="gh lab-skin-light" aria-label="Release pipeline">
      <header className="gh-repo">
        <div className="gh-repo-title">
          <Icon name="repo" />
          <span className="gh-owner">harbor-foods</span>
          <span className="gh-slash">/</span>
          <b>orders-papi</b>
          <span className="gh-pill">Private</span>
          <button className="gh-btn gh-btn-sm gh-reset" onClick={reset}>
            {guided ? 'Restart this lab' : 'Reset lab'}
          </button>
        </div>
        <nav className="gh-tabs" aria-label="Repository">
          <span className="gh-tab">
            <Icon name="code" /> Code
          </span>
          <span className="gh-tab">
            <Icon name="pr" /> Pull requests
          </span>
          <span className="gh-tab gh-tab-on">
            <Icon name="play" /> Actions
          </span>
          <span className="gh-tab">
            <Icon name="gear" /> Settings
          </span>
        </nav>
      </header>

      <div className={`gh-body${guided ? ' with-guide' : ''}`}>
        <aside className="gh-side" aria-label="Actions">
          <div className="gh-side-title">Actions</div>
          {SIDE.slice(0, 1).map(([key, label, icon]) => (
            <SideItem key={key} on={view === key} icon={icon} label={label} onClick={() => go(key)} />
          ))}
          <div className="gh-side-title">Management</div>
          {SIDE.slice(1).map(([key, label, icon]) => (
            <SideItem key={key} on={view === key} icon={icon} label={label} onClick={() => go(key)} />
          ))}
        </aside>

        <main className="gh-main">
          {outcome && <LabOutcome outcome={outcome} />}

          {view === 'runs' && run && (
            <RunPage
              key={run.id}
              run={run}
              active={active && run === state.runs[0]}
              onBack={() => setOpenRun(null)}
              onSkip={() => setState(settle(state))}
              onSeen={(job) => note('jobs', job)}
              onView={(key) => note('views', key)}
            />
          )}

          {view === 'munit' && <MunitTests config={config} onChange={setConfig} onSeen={(key) => note('views', key)} guided={Boolean(guided)} />}

          {view === 'runs' && !run && (
            <>
              <div className="gh-wf-head">
                <div>
                  <h2>Release pipeline</h2>
                  <span className="gh-dim mono">.github/workflows/release.yml</span>
                </div>
              </div>
              <div className="gh-dispatch">
                <span className="gh-dim">
                  This workflow has a <code>workflow_dispatch</code> event trigger.
                </span>
                <div className="gh-dispatch-row">
                  {guided ? (
                    <span className="gh-field gh-dim">The lab has set the options for this exercise.</span>
                  ) : (
                  <label className="gh-field">
                    <span>Exercise</span>
                    <select className="gh-input" value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
                      <option value="">Default options, or your own</option>
                      {SCENARIOS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                          {s.incident ? ` (${s.incident})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  )}
                  {scenario && !guided && (
                    <button className="gh-btn" onClick={() => setConfig({ ...config, ...scenario.fix })} disabled={active}>
                      Apply the fix
                    </button>
                  )}
                  <button className="gh-btn gh-btn-green" onClick={() => begin(startRun(state, config))} disabled={active}>
                    <Icon name="play" /> Run workflow
                  </button>
                </div>
              </div>
              <RunList runs={state.runs} onOpen={setOpenRun} />
            </>
          )}

          {view === 'options' && (
            <section className="gh-box gh-pad" aria-label="Pipeline options">
              <h2 className="gh-h">Workflow options</h2>
              <p className="gh-dim small">
                What the next run of release.yml uses.{guided ? '' : ' Pick an exercise on the runs page to load its options.'}
              </p>
              <Options config={config} onChange={setConfig} />
            </section>
          )}

          {view === 'environments' && (
            <div className="gh-envs">
              {ENVIRONMENTS.map((name) => (
                <Environment
                  key={name}
                  name={name}
                  state={state}
                  busy={active}
                  onRedeploy={(version) => begin(startRedeploy(state, config, name, version))}
                  onRollback={(id) => apply(rollback(state, name, id))}
                  onUndeploy={() => setState(undeploy(state, name))}
                  onOverwrite={() => setState(overwriteSnapshot(state, state.envs[name].version))}
                  onBind={() => setState(updateBinding(state, name))}
                  onAllow={(target) => setState(allowOutbound(state, name, target))}
                />
              ))}
            </div>
          )}

          {view === 'exchange' && <ExchangeVersions state={state} onFree={(version) => apply(freeReserved(state, version))} />}

          {view === 'promote' && <Promotion state={state} onPromote={(input) => apply(promoteInstance(state, input))} />}
        </main>

        {guided && (
          <LabSteps
            lab={guided}
            ctx={ctx}
            finished={finished}
            onAnswer={(i, value) => setAnswers((a) => ({ ...a, [i]: value }))}
          />
        )}
      </div>
    </div>
  )
}

function SideItem({ on, icon, label, onClick }) {
  return (
    <button className={`gh-side-item${on ? ' on' : ''}`} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <Icon name={icon} /> {label}
    </button>
  )
}

const runTitle = (run) => (run.stages.length === 1 && run.stages[0].name.startsWith('Redeploy') ? run.stages[0].name : `Release ${run.version}`)
const runStatus = (run) =>
  !run.done ? 'running' : run.result === 'Failed' ? 'failed' : run.result === 'Passed' ? 'passed' : 'warned'

function RunList({ runs, onOpen }) {
  return (
    <div className="gh-box">
      <div className="gh-box-head">
        {runs.length} workflow {runs.length === 1 ? 'run' : 'runs'}
      </div>
      {runs.length === 0 && (
        <div className="gh-empty">
          <Icon name="workflow" />
          <b>There are no workflow runs yet.</b>
          <span className="gh-dim">Press Run workflow to start the first run.</span>
        </div>
      )}
      {runs.map((r) => (
        <button key={r.id} className="gh-run-row" onClick={() => onOpen(r.id)}>
          <StatusIcon status={runStatus(r)} />
          <span className="gh-run-main">
            <b>{runTitle(r)}</b>
            <span className="gh-dim small">
              Release pipeline #{r.id}: Manually run · version <span className="mono">{r.version}</span>
            </span>
          </span>
          <span className="gh-branch mono">main</span>
          <span className="gh-dim small gh-run-result">{r.result ?? 'In progress'}</span>
        </button>
      ))}
    </div>
  )
}

function RunPage({ run, active, onBack, onSkip, onSeen, onView }) {
  const [picked, setPicked] = useState(null)
  const stages = run.stages
  const notable = [...stages].reverse().find((s) => s.status === 'failed' || s.status === 'warned')
  const latest = [...stages].reverse().find((s) => s.status !== 'pending' && s.status !== 'skipped')
  const shown = stages.find((s) => s.id === picked) ?? notable ?? latest ?? stages[0]
  const status = runStatus(run)
  const shownId = shown?.id
  const shownDone = shown && shown.status !== 'pending' && shown.status !== 'skipped'

  // a guided lab counts a job log as read once it is on screen with output
  useEffect(() => {
    if (shownDone) onSeen?.(shownId)
  }, [shownId, shownDone, onSeen])

  return (
    <>
      <button className="gh-back" onClick={onBack}>
        ← Release pipeline
      </button>
      <h2 className="gh-run-title">
        <StatusIcon status={status} big />
        {runTitle(run)} <span className="gh-dim">#{run.id}</span>
      </h2>

      <div className="gh-box gh-summary">
        <div>
          <span className="gh-dim small">Triggered via workflow_dispatch</span>
          <b>main</b>
        </div>
        <div>
          <span className="gh-dim small">Status</span>
          <b aria-live="polite">{run.result ?? 'In progress'}</b>
        </div>
        <div>
          <span className="gh-dim small">Version</span>
          <b className="mono">{run.version}</b>
        </div>
        <div>
          <span className="gh-dim small">Jobs</span>
          <b>
            {stages.filter((s) => s.status !== 'pending').length} of {stages.length}
          </b>
        </div>
        {active && (
          <button className="gh-btn gh-btn-sm" onClick={onSkip}>
            Skip to result
          </button>
        )}
      </div>

      <div className="gh-box gh-graph-box">
        <div className="gh-graph-head">
          <b>release.yml</b>
          <span className="gh-dim small">on: workflow_dispatch</span>
        </div>
        <ol className="gh-graph">
          {stages.map((s) => (
            <li key={s.id}>
              <button className={`gh-job gh-job-${s.status}${s === shown ? ' on' : ''}`} onClick={() => setPicked(s.id)}>
                <StatusIcon status={active && s === stages.find((x) => x.status === 'pending') ? 'running' : s.status} />
                <span className="gh-job-name">{s.name}</span>
                {s.runsOn === 'self-hosted' && <span className="gh-job-runner">self-hosted</span>}
              </button>
            </li>
          ))}
        </ol>
        {run.config.deployTarget !== 'cloudhub2' && run.config.deployTarget && <DeployPath config={run.config} />}
      </div>

      {shown?.issues.length > 0 && (
        <section className="gh-box gh-annotations" aria-label="Annotations">
          <div className="gh-box-head">
            Annotations <span className="gh-dim">· {shown.name}</span>
          </div>
          {shown.issues.map((issue) => (
            <LabOutcome key={issue.title} outcome={issue} />
          ))}
        </section>
      )}

      {shown?.report && <MunitReport key={shown.id} report={shown.report} onCoverage={() => onView?.('coverage')} />}

      {shown && (
        <section className="gh-logs" aria-label={`${shown.name} log`}>
          <div className="gh-logs-head">
            <div>
              <b>{shown.name}</b>
              <span>{STATUS_TEXT[shown.status]}</span>
            </div>
          </div>
          <div className="gh-step">
            <div className="gh-step-head">
              <StatusIcon status={shown.status} />
              <span className="mono">Run {shown.command}</span>
            </div>
            {shown.status === 'pending' && <p className="gh-log-note mono">Waiting for the job to start…</p>}
            {shown.status === 'skipped' && <p className="gh-log-note mono">This job was skipped because an earlier job failed.</p>}
            {shown.status === 'passed' && shown.logs.length === 0 && <p className="gh-log-note mono">This step produced no output.</p>}
            {shown.logs.length > 0 && (
              <ol className="gh-log mono">
                {shown.logs.map((l, i) => (
                  <li key={i} className={`gh-log-${l.level.toLowerCase()}`}>
                    {l.level === 'ERROR' ? 'Error: ' : l.level === 'WARN' ? 'Warning: ' : ''}
                    {l.text}
                    <Assumed basis={l.basis} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}
    </>
  )
}

// Who talks to whom in a deploy job to Harbor's own servers.
function DeployPath({ config }) {
  const targets = ENVIRONMENTS.map((e) => targetFor(config, e).name).filter(Boolean).join(', ')
  if (config.deployTarget === 'copy') {
    return (
      <div className="gh-path" aria-label="How the deploy job reaches the servers">
        <div className="gh-path-row">
          <span className="gh-path-node">{config.runner === 'self-hosted' ? 'Self-hosted runner in the data center' : 'GitHub-hosted runner'}</span>
          <span className="gh-path-link bad">file copy to each server →</span>
          <span className="gh-path-node">MULE_HOME\apps on the servers of {targets}</span>
        </div>
        <p className="gh-dim small">
          Runtime Manager takes no part. The runner needs a network route and write access to every server, so it has to sit inside the data center.
          <Assumed />
        </p>
      </div>
    )
  }
  return (
    <div className="gh-path" aria-label="How the deploy job reaches the servers">
      <div className="gh-path-row">
        <span className="gh-path-node">{config.runner === 'self-hosted' ? 'Self-hosted runner' : 'GitHub-hosted runner'}</span>
        <span className="gh-path-link">HTTPS 443 →</span>
        <span className="gh-path-node gh-path-cloud">Anypoint control plane (Runtime Manager)</span>
        <span className="gh-path-link">← WSS 443, opened by the agent</span>
        <span className="gh-path-node">Runtime Manager agent on each server of {targets}</span>
      </div>
      <p className="gh-dim small">
        The runner talks only to the control plane. Each agent opened its own outbound connection from inside the data center, so the runner needs no VPN and the servers need no inbound port.
      </p>
    </div>
  )
}

// small status marks drawn to look like the ones on an Actions page
function StatusIcon({ status, big }) {
  const size = big ? 22 : 16
  const common = { width: size, height: size, viewBox: '0 0 16 16', className: `gh-status gh-status-${status}`, 'aria-label': STATUS_TEXT[status] ?? 'In progress', role: 'img' }
  if (status === 'running')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="gh-spin-track" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" strokeWidth="2" strokeLinecap="round" className="gh-spin" />
      </svg>
    )
  if (status === 'passed')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" />
        <path d="M4.8 8.2 7 10.4l4.2-4.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  if (status === 'failed')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" />
        <path d="m5.5 5.5 5 5m0-5-5 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  if (status === 'warned')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="7" />
        <path d="M8 4.5v4.2" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="8" cy="11.3" r="1" fill="#fff" />
      </svg>
    )
  if (status === 'skipped')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5" />
        <path d="m4 12 8-8" strokeWidth="1.5" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" fill="none" strokeWidth="1.5" />
    </svg>
  )
}

const ICONS = {
  repo: 'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5v-1.5h1.75v-2h-8a1 1 0 0 0-.71 1.71.75.75 0 0 1-1.06 1.06A2.5 2.5 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.71A2.5 2.5 0 0 1 4.5 9h8ZM5 12.25V16l1.5-1.5L8 16v-3.75Z',
  code: 'm4.72 3.22-4.25 4.25a.75.75 0 0 0 0 1.06l4.25 4.25 1.06-1.06L2.06 8l3.72-3.72Zm6.56 0-1.06 1.06L13.94 8l-3.72 3.72 1.06 1.06 4.25-4.25a.75.75 0 0 0 0-1.06Z',
  pr: 'M5 3.25a1.75 1.75 0 1 1-2.5 1.58v6.34a1.75 1.75 0 1 1-1.5 0V4.83A1.75 1.75 0 0 1 5 3.25Zm6.5 8a1.75 1.75 0 1 1-1.5 0V6.5A1 1 0 0 0 9 5.5H7.56l1.22 1.22-1.06 1.06L4.69 4.75 7.72 1.72l1.06 1.06L7.56 4H9a2.5 2.5 0 0 1 2.5 2.5Z',
  play: 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.88-3.04 4.6 2.6a.5.5 0 0 1 0 .88l-4.6 2.6A.5.5 0 0 1 5.6 10.6V5.4a.5.5 0 0 1 .78-.44Z',
  gear: 'M8 0a8.2 8.2 0 0 1 .7.03l.5 2.03a5.9 5.9 0 0 1 1.5.62l1.8-1.07a8 8 0 0 1 1 1l-1.08 1.8c.27.47.48.97.62 1.5l2.03.5a8.2 8.2 0 0 1 0 1.4l-2.03.5a5.9 5.9 0 0 1-.62 1.5l1.07 1.8a8 8 0 0 1-1 1l-1.8-1.08a5.9 5.9 0 0 1-1.5.62l-.5 2.03a8.2 8.2 0 0 1-1.4 0l-.5-2.03a5.9 5.9 0 0 1-1.5-.62l-1.8 1.07a8 8 0 0 1-1-1l1.08-1.8a5.9 5.9 0 0 1-.62-1.5L.03 8.7a8.2 8.2 0 0 1 0-1.4l2.03-.5c.14-.53.35-1.03.62-1.5L1.6 3.5a8 8 0 0 1 1-1l1.8 1.08c.47-.27.97-.48 1.5-.62L6.4.03A8.2 8.2 0 0 1 8 0Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  workflow: 'M0 1.75C0 .78.78 0 1.75 0h3.5C6.22 0 7 .78 7 1.75v3.5C7 6.22 6.22 7 5.25 7H4v4a1 1 0 0 0 1 1h4v-1.25C9 9.78 9.78 9 10.75 9h3.5c.97 0 1.75.78 1.75 1.75v3.5c0 .97-.78 1.75-1.75 1.75h-3.5C9.78 16 9 15.22 9 14.25v-.75H5A2.5 2.5 0 0 1 2.5 11V7h-.75C.78 7 0 6.22 0 5.25Zm1.75-.25a.25.25 0 0 0-.25.25v3.5c0 .14.11.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Zm9 9a.25.25 0 0 0-.25.25v3.5c0 .14.11.25.25.25h3.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25Z',
  rocket: 'M14.06.94c.3.3.44.7.44 1.06 0 3.1-1.4 6-3.6 7.9l-.4 2.6a1.5 1.5 0 0 1-.8 1.1l-2.4 1.2a.75.75 0 0 1-1.05-.66l-.08-1.9-1.4-1.4-1.9-.08a.75.75 0 0 1-.66-1.05l1.2-2.4a1.5 1.5 0 0 1 1.1-.8l2.6-.4C9 2.4 11.9 1 15 1c.37 0 .76.14 1.06.44ZM11 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM2.5 11.5c.6 0 1.5.9 1.5 1.5S2 15 1 15c0-1 .9-3.5 1.5-3.5Z',
  package: 'm8.88.22 6.25 3.6A1.75 1.75 0 0 1 16 5.33v5.34c0 .63-.34 1.2-.88 1.51l-6.25 3.6a1.75 1.75 0 0 1-1.74 0l-6.25-3.6A1.75 1.75 0 0 1 0 10.67V5.33c0-.63.34-1.2.88-1.51L7.13.22a1.75 1.75 0 0 1 1.74 0ZM1.5 5.6v5.07c0 .09.05.17.13.22l5.62 3.24V8.97Zm7.25 3.37v5.16l5.62-3.24a.25.25 0 0 0 .13-.22V5.6ZM2.3 4.3 8 7.6l5.7-3.3L8.12 1.52a.25.25 0 0 0-.24 0Z',
  arrow: 'M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H1.75a.75.75 0 0 1 0-1.5h9.44L8.22 4.03a.75.75 0 0 1 0-1.06Z',
  beaker: 'M5 1h6v1.5h-.75v3.6l4.1 6.6A1.5 1.5 0 0 1 13.08 15H2.92a1.5 1.5 0 0 1-1.27-2.3l4.1-6.6V2.5H5Zm2.25 1.5v4L5.4 9.5h5.2L8.75 6.5v-4Z',
}

function Icon({ name }) {
  return (
    <svg className="gh-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

// The steps of a guided lab, beside the page. Each step ticks off when the pipeline shows it was done.
function LabSteps({ lab, ctx, finished, onAnswer }) {
  const done = lab.steps.map((s, i) => pipelineStepDone(s, i, ctx))
  const current = done.indexOf(false)
  const [open, setOpen] = useState(null)
  const shown = open ?? current
  const count = done.filter(Boolean).length
  const box = useRef(null)
  const hideHow = useHideHow()
  const [howShown, setHowShown] = useState({})
  const [explain, setExplain] = useState(false)

  useEffect(() => {
    setOpen(null)
    const step = box.current?.querySelector('[aria-current="step"]')
    if (box.current) box.current.scrollTop = step && current > 0 ? step.offsetTop - 70 : 0
  }, [current])

  return (
    <aside ref={box} className="gh-guide" aria-label="Lab steps">
      <div className="gh-guide-head">
        <span className="gh-dim small">Guided lab</span>
        <b>{lab.title}</b>
      </div>
      <p className="small">{lab.scenario}</p>
      <div className="gh-guide-bar" role="progressbar" aria-valuemin={0} aria-valuemax={done.length} aria-valuenow={count} aria-label="Steps done">
        <i style={{ width: `${(count / done.length) * 100}%` }} />
      </div>
      <div className="pl-guide-bar">
        <span className="gh-dim small pl-grow">
          {count} of {done.length} steps
        </span>
        <label className="gh-dim small pl-hide-how">
          <input type="checkbox" checked={hideHow} onChange={(e) => setHideHow(e.target.checked)} /> Hide the how text
        </label>
      </div>
      {finished && (
        <div className="gh-guide-done" role="status">
          <b>Lab solved</b>
          <p className="small">{lab.why}</p>
          <div className="pl-done-actions">
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setExplain(true)}>
              Explain this fix out loud
            </button>
            <a href={lab.docs} target="_blank" rel="noreferrer" className="small">
              Docs
            </a>
          </div>
        </div>
      )}
      {explain && <ExplainAloud lab={lab} onClose={() => setExplain(false)} />}
      <ol className="gh-todo">
        {lab.steps.map((s, i) => (
          <li key={i} className={done[i] ? 'done' : i === current ? 'on' : ''} aria-current={i === current ? 'step' : undefined}>
            <button type="button" aria-expanded={shown === i} onClick={() => setOpen(shown === i ? -1 : i)}>
              <i>{done[i] ? '✓' : i + 1}</i>
              <span>{s.title}</span>
            </button>
            {shown === i &&
              (s.ask ? (
                <div className="gh-todo-body">
                  <p>{s.ask}</p>
                  {s.options.map((o, j) => (
                    <label key={o} className={`gh-choice${ctx.answers[i] === j ? (j === s.right ? ' right' : ' wrong') : ''}`}>
                      <input type="radio" name={`${lab.id}-q${i}`} checked={ctx.answers[i] === j} onChange={() => onAnswer(i, j)} />
                      <span>{o}</span>
                    </label>
                  ))}
                  {ctx.answers[i] !== undefined && (
                    <p className={ctx.answers[i] === s.right ? 'gh-good' : 'gh-bad'}>{ctx.answers[i] === s.right ? s.reason : 'Not this one. Look again and choose another.'}</p>
                  )}
                </div>
              ) : (
                <div className="gh-todo-body">
                  {hideHow && !done[i] && !howShown[i] ? (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHowShown((h) => ({ ...h, [i]: true }))}>
                      Show how
                    </button>
                  ) : (
                    <p>{s.how}</p>
                  )}
                </div>
              ))}
          </li>
        ))}
      </ol>
    </aside>
  )
}

function Options({ config, onChange }) {
  const set = (patch) => onChange({ ...config, ...patch })
  const check = (key, label) => (
    <label className="lab-check small lx-tight">
      <input type="checkbox" checked={Boolean(config[key])} onChange={(e) => set({ [key]: e.target.checked })} /> {label}
    </label>
  )
  const number = (key, label) => (
    <label className="lab-field">
      <span className="small muted">{label}</span>
      <input className="input" type="number" value={config[key] ?? ''} onChange={(e) => set({ [key]: Number(e.target.value) })} />
    </label>
  )
  const command = DEPLOY_COMMANDS.find((c) => c.id === config.deployCommand)
  const mode = PROPERTY_MODES.find((m) => m.id === config.propertiesMode)
  const target = DEPLOY_TARGETS.find((t) => t.id === config.deployTarget) ?? DEPLOY_TARGETS[0]

  return (
    <>
      <fieldset className="lx-group">
        <legend className="small">Version and build</legend>
        <div className="lab-fields">
          <label className="lab-field">
            <span className="small muted">Version source</span>
            <select className="input" value={config.versionStrategy} onChange={(e) => set({ versionStrategy: e.target.value })}>
              <option value="fixed">Fixed version from the POM</option>
              <option value="next">nextAvailableVersion (PATCH)</option>
            </select>
          </label>
          <label className="lab-field">
            <span className="small muted">POM version</span>
            <input className="input mono" value={config.version} disabled={config.versionStrategy === 'next'} onChange={(e) => set({ version: e.target.value })} />
          </label>
          {check('pluginExtensions', 'Plugin has extensions set to true')}
          {check('mavenDeployPlugin', 'POM includes maven-deploy-plugin')}
        </div>
      </fieldset>

      <fieldset className="lx-group">
        <legend className="small">
          MUnit and coverage (sample results
          <Assumed />)
        </legend>
        {config.munit ? (
          <p className="muted small lab-note">This workflow runs the MUnit project, so the sample results are not used. The tests, the coverage block of pom.xml and the Maven command lines are files under MUnit tests in the sidebar.</p>
        ) : (
        <div className="lab-fields">
          {number('testCount', 'Tests found')}
          {number('testsFailing', 'Tests failing')}
          {number('applicationCoverage', 'Application coverage %')}
          {number('lowestFlowCoverage', 'Lowest flow coverage %')}
          {number('requiredApplicationCoverage', 'requiredApplicationCoverage')}
          {number('requiredFlowCoverage', 'requiredFlowCoverage')}
          {check('runCoverage', 'runCoverage')}
          {check('failBuild', 'failBuild')}
          {check('ignoreLowestFlow', 'Lowest flow in ignoreFlows')}
          {check('childOverride', 'Child POM overrides the coverage block')}
          {check('skipTests', 'Run with -DskipTests')}
        </div>
        )}
      </fieldset>

      <fieldset className="lx-group">
        <legend className="small">Publish and deploy</legend>
        <div className="lab-fields">
          {check('publishStage', 'Separate Publish to Exchange stage')}
          {check('deployProduction', 'Promote to Production')}
          <label className="lab-field lab-wide">
            <span className="small muted">Deploy stage command</span>
            <select className="input mono" value={config.deployCommand} onChange={(e) => set({ deployCommand: e.target.value })}>
              {DEPLOY_COMMANDS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small lab-wide lab-note">{command.note}</p>
          <label className="lab-field lab-wide">
            <span className="small muted">Application properties in the deployment POM</span>
            <select className="input" value={config.propertiesMode} onChange={(e) => set({ propertiesMode: e.target.value })}>
              {PROPERTY_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small lab-wide lab-note">{mode.note}</p>
          <label className="lab-field">
            <span className="small muted">updateStrategy</span>
            <select className="input" value={config.updateStrategy} onChange={(e) => set({ updateStrategy: e.target.value })}>
              <option>rolling</option>
              <option>recreate</option>
            </select>
          </label>
          {check('skipDeploymentVerification', 'skipDeploymentVerification')}
          {check('verifyVersion', 'Check the running version after each deploy')}
          {check('snapshotGuard', 'Fail Production on a SNAPSHOT')}
        </div>
      </fieldset>

      <fieldset className="lx-group">
        <legend className="small">Deployment target</legend>
        <div className="lab-fields">
          <label className="lab-field lab-wide">
            <span className="small muted">Where the deploy jobs send the application</span>
            <select className="input" value={config.deployTarget} onChange={(e) => set({ deployTarget: e.target.value })}>
              {DEPLOY_TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small lab-wide lab-note">{target.note}</p>
          {config.deployTarget !== 'cloudhub2' && (
            <>
              {ENVIRONMENTS.map((e) => (
                <TargetInputs key={e} envName={e} config={config} set={set} withType={config.deployTarget === 'hybrid'} />
              ))}
              {config.deployTarget === 'hybrid' && (
                <label className="lab-field">
                  <span className="small muted">muleVersion</span>
                  <input className="input mono" value={config.muleVersion} onChange={(e) => set({ muleVersion: e.target.value })} />
                </label>
              )}
              <label className="lab-field">
                <span className="small muted">Deploy jobs run on</span>
                <select className="input" value={config.runner} onChange={(e) => set({ runner: e.target.value })}>
                  {RUNNER_TYPES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small lab-wide lab-note">The names of the registered servers, server groups and clusters are under Environments.</p>
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="lx-group">
        <legend className="small">Deployment credentials</legend>
        <div className="lab-fields">
          <label className="lab-field lab-wide">
            <span className="small muted">Authentication method</span>
            <select className="input" value={config.authMode} onChange={(e) => set({ authMode: e.target.value })}>
              <option value="server">Server entry in settings.xml</option>
              <option value="connected-app">Connected App</option>
            </select>
          </label>
          {check('deployUserPass', 'username and password also in the deployment block')}
          {check('personalAccountActive', 'That personal account is active')}
          {config.authMode === 'connected-app' && check('connectedAppScope', 'Connected App has Design Center Developer')}
        </div>
      </fieldset>

      <details className="lx-pom">
        <summary className="small">Deployment block these options produce</summary>
        <CodeBlock className="mono small">{pomPreview(config)}</CodeBlock>
      </details>
    </>
  )
}

// The -Dtarget and -DtargetType values the workflow passes for one environment.
function TargetInputs({ envName, config, set, withType }) {
  const key = envName.toLowerCase()
  return (
    <>
      <label className="lab-field">
        <span className="small muted">{envName} target</span>
        <input className="input mono" value={config[`${key}Target`]} onChange={(e) => set({ [`${key}Target`]: e.target.value })} />
      </label>
      {withType && (
        <label className="lab-field">
          <span className="small muted">{envName} targetType</span>
          <select className="input mono" value={config[`${key}TargetType`]} onChange={(e) => set({ [`${key}TargetType`]: e.target.value })}>
            {TARGET_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}
    </>
  )
}

// Servers, server groups and clusters registered in Runtime Manager for one environment.
function HybridTargets({ envName, targets, busy, onAllow }) {
  if (!targets?.length) return null
  return (
    <>
      <h3 className="small muted lab-history-title">
        Own servers in Runtime Manager (sample data
        <Assumed />)
      </h3>
      {targets.map((t) => {
        const down = t.servers.some((s) => s.status !== 'Running')
        return (
          <div key={t.name} className="gh-target" aria-label={`${envName} target ${t.name}`}>
            <div className="lab-row-head">
              <b className="mono small lab-grow">{t.name}</b>
              <span className="small muted">{typeName(t.type)}</span>
              <span className={`lab-state lab-state-${down ? 'idle' : 'good'}`}>{down ? 'Disconnected' : 'Running'}</span>
            </div>
            <ul className="lab-history mono small">
              {t.servers.map((s) => (
                <li key={s.name} className="lab-history-row">
                  <span className="lab-grow">
                    {s.name} <span className="muted">on {s.host}</span>
                  </span>
                  <span className="muted">Mule {s.runtime}</span> <span className={s.status === 'Running' ? '' : 'gh-target-down'}>{s.status}</span>
                </li>
              ))}
            </ul>
            <p className="small">
              Last deployed through Runtime Manager: <span className="mono">{t.app ? `${ASSET_ID} ${t.app.version} ${t.app.status}` : 'nothing'}</span>
            </p>
            {t.copied && (
              <p className="lx-alert small">
                The apps folder on {t.copied.at.join(', ')} also has <span className="mono">{t.copied.app ?? `${ASSET_ID}-${t.copied.version}-mule-application`}</span>, copied there by a runner. Runtime Manager did not deploy it. It does not replace {ASSET_ID}: it runs as a second app named after the file, and both apps use the same HTTP listener port.
                <Assumed />
              </p>
            )}
            {t.note && <p className="lx-alert small">{t.note}</p>}
            {down && (
              <div className="lab-actions">
                <button className="btn btn-sm" disabled={busy} onClick={() => onAllow(t.name)}>
                  Allow outbound HTTPS 443 from this server to the control plane
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function Environment({ name, state, busy, onRedeploy, onRollback, onUndeploy, onOverwrite, onBind, onAllow }) {
  const env = state.envs[name]
  const keys = Object.keys(env.properties)
  const secure = Object.keys(env.secure)
  const missing = REQUIRED_KEYS.filter((k) => !keys.includes(k) && !secure.includes(k))
  const tone = env.status === 'Running' ? 'good' : 'idle'
  const paired = pairing(state, name)
  const snapshot = env.version && isSnapshot(env.version)

  return (
    <section className="lab-panel" aria-label={`${name} environment`}>
      <div className="lab-row-head">
        <h2 className="lx-env-title lab-grow">{name}</h2>
        <span className={`lab-state lab-state-${tone}`}>{env.status}</span>
      </div>
      <p className="small">
        <span className="muted">CloudHub 2.0: </span>
        <span className="mono">
          {ASSET_ID} {env.version ?? 'not deployed'}
        </span>
        {env.build && <span className="muted mono"> build {env.build}</span>}
        <Assumed />
      </p>
      {env.build && isFeatureBuild(env.build) && <p className="lx-alert small">This build came from a feature branch that overwrote the SNAPSHOT.</p>}
      <p className="small lx-keys">
        <span className="muted">Properties:</span> <span className="mono">{keys.join(', ') || 'none'}</span>
        <br />
        <span className="muted">Secure properties:</span> <span className="mono">{secure.map((k) => `${k}=******`).join(', ') || 'none'}</span>
      </p>
      {missing.length > 0 && <p className="lx-alert small">Missing: {missing.join(', ')}</p>}
      {env.instance && (
        <p className="small">
          API instance <span className="mono">{env.instance.label}</span>, ID <span className="mono">{env.instance.id}</span>. {paired.paired ? 'The application points at it.' : paired.problems.join(' ')}
        </p>
      )}
      <div className="lab-actions">
        {env.version && (
          <button className="btn btn-sm" disabled={busy} onClick={() => onRedeploy(env.version)}>
            Redeploy {env.version}
          </button>
        )}
        {snapshot && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onOverwrite}>
            Another branch publishes this SNAPSHOT
          </button>
        )}
        {env.instance && !paired.paired && env.applied && (
          <button className="btn btn-sm" disabled={busy} onClick={onBind}>
            Update instance ID and credentials
          </button>
        )}
        {env.applied && (
          <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onUndeploy}>
            mvn mule:undeploy
          </button>
        )}
      </div>
      {env.configs.length > 0 && (
        <>
          <h3 className="small muted lab-history-title">Configuration history (last 10)</h3>
          <ul className="lab-history mono small">
            {env.configs.map((c) => (
              <li key={c.id} className="lab-history-row">
                <span className="lab-grow">
                  {c.id} {c.version} <span className="muted">{c.status}</span> {c.id === env.applied && <span className="lab-approved">current</span>}
                </span>
                {c.id !== env.applied && (
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onRollback(c.id)}>
                    Roll back
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <HybridTargets envName={name} targets={env.targets} busy={busy} onAllow={onAllow} />
    </section>
  )
}

function ExchangeVersions({ state, onFree }) {
  const versions = versionsOf(state.exchange, ASSET_ID)
  return (
    <section className="lab-panel" aria-label="Exchange versions">
      <div className="lab-panel-head">
        <h2>Exchange: {ASSET_ID}</h2>
      </div>
      <p className="muted small lab-note">
        Mule applications do not appear in the Exchange catalog, so a pipeline reads this list through the APIs. Sample data
        <Assumed />
      </p>
      <ul className="lab-history mono small">
        {versions.map((v) => (
          <li key={v.version} className="lab-history-row">
            <span className="lab-grow">{v.version}</span>
            <span className={`lx-chip lx-chip-${v.lifecycle}`}>{v.lifecycle}</span>
          </li>
        ))}
        {state.exchange.reserved.map((r) => (
          <li key={r.version} className="lab-history-row">
            <span className="lab-grow">
              {r.version} <span className="muted">soft deleted, reserved</span>
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => onFree(r.version)}>
              Enable GAV reuse and hard-delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Promotion({ state, onPromote }) {
  const [input, setInput] = useState(newPromotion)
  const set = (patch) => setInput({ ...input, ...patch })
  const check = (key, label) => (
    <label className="lab-check small lx-tight">
      <input type="checkbox" checked={Boolean(input[key])} onChange={(e) => set({ [key]: e.target.checked })} /> {label}
    </label>
  )
  const source = state.envs[input.source]?.instance

  return (
    <section className="lab-panel" aria-label="Promote API instance">
      <div className="lab-panel-head">
        <h2>Promote API instance</h2>
      </div>
      <div className="lab-fields">
        <label className="lab-field">
          <span className="small muted">Source environment</span>
          <select className="input" value={input.source} onChange={(e) => set({ source: e.target.value, target: ENVIRONMENTS.find((n) => n !== e.target.value) })}>
            {ENVIRONMENTS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <div className="lab-field">
          <span className="small muted">Target environment</span>
          <b className="small">{input.target}</b>
        </div>
        <p className="muted small lab-wide lab-note">
          {source ? `Instance ${source.label}: ${source.policies.join(', ') || 'no policies'}. Tiers: ${source.tiers.join(', ') || 'none'}. Alerts: ${source.alerts.join(', ') || 'none'}.` : 'No API instance in this environment.'}
          <Assumed />
        </p>
        {check('includePolicies', 'Include policies')}
        {check('includeTiers', 'Include SLA tiers')}
        {check('includeAlerts', 'Include alerts')}
        {check('manageApis', 'I have Manage APIs Configuration')}
        {check('managePolicies', 'I have View and Manage Policies')}
        {check('sameClientProvider', 'Both environments use the same client provider type')}
      </div>
      <div className="lab-actions">
        <button className="btn btn-primary" onClick={() => onPromote(input)}>
          Promote
        </button>
      </div>
    </section>
  )
}

// ---------- MUnit: the project files, and the report of a run ----------

const STATUS_WORD = { passed: 'Passed', failed: 'Failed', error: 'Error', skipped: 'Ignored' }
const fileOrder = (path) => (path === WORKFLOW ? 0 : path === 'pom.xml' ? 1 : path.startsWith('src/test') ? 2 : 3)

// The files of the Mule project that the MUnit job reads. Test suites, the POM, the workflow and the DataWeave file
// are edited as text. The flow files are read only, so their doc:name and doc:id can be copied into a mock.
export function MunitTests({ config, onChange, onSeen, guided }) {
  const munit = config.munit
  const editable = munit ? Object.keys(munit.files).sort((a, b) => fileOrder(a) - fileOrder(b) || a.localeCompare(b)) : []
  const flowFiles = APP.map((f) => flowPath(f.file))
  const [picked, setPicked] = useState(WORKFLOW)
  const path = [...editable, ...flowFiles].includes(picked) ? picked : WORKFLOW
  const hasProject = Boolean(munit)

  useEffect(() => {
    if (hasProject) onSeen(`file:${path}`)
  }, [hasProject, path, onSeen])

  if (!munit) {
    return (
      <section className="gh-box gh-pad" aria-label="MUnit tests">
        <h2 className="gh-h">MUnit tests</h2>
        <p className="gh-dim small">
          The MUnit job uses the sample results in Workflow options. Load the sample project to work with real test suites, the munit-maven-plugin coverage block and the Maven command lines.
        </p>
        <div>
          <button className="gh-btn" onClick={() => onChange({ ...config, munit: munitProject('sample') })}>
            Load the sample MUnit project
          </button>
        </div>
      </section>
    )
  }

  const set = (next) => onChange({ ...config, munit: next })
  const cmd = workflowCommands(munit)
  const gate = coverageSettings(munit)
  const counts = testsByFlow(munit)
  const flowFile = APP.find((f) => flowPath(f.file) === path)
  const note = templateNote(munit, path)
  const level = (n) => (n < 0 ? 'not set' : `${n}%`)

  return (
    <section className="gh-box" aria-label="MUnit tests">
      <div className="gh-box-head gh-mu-head">
        <span>MUnit tests: orders-papi</span>
        {!guided && (
          <button className="gh-btn gh-btn-sm" onClick={() => onChange({ ...config, munit: undefined })}>
            Use sample results instead
          </button>
        )}
      </div>
      <div className="gh-mu-facts small">
        <span>
          Test job: <code>{cmd.test}</code>
        </span>
        <span>
          Gate: runCoverage {String(gate.runCoverage)}, failBuild {String(gate.failBuild)}, application {level(gate.requiredApplicationCoverage)}, resource {level(gate.requiredResourceCoverage)}, flow {level(gate.requiredFlowCoverage)}
        </span>
        {cmd.anySkip && (
          <span className="gh-mu-skip" role="status">
            release.yml passes a skip flag, so MUnit does not run and the coverage gate is not checked.
          </span>
        )}
      </div>
      <div className="gh-mu">
        <nav className="gh-mu-files" aria-label="Project files">
          {[...editable, ...flowFiles].map((f) => (
            <button key={f} className={`gh-mu-file mono${f === path ? ' on' : ''}`} onClick={() => setPicked(f)} aria-current={f === path ? 'true' : undefined}>
              {f}
              {flowFiles.includes(f) && <span className="gh-dim"> (read only)</span>}
            </button>
          ))}
        </nav>
        <div className="gh-mu-pane">
          {note && <p className="gh-mu-commit small mono">{note}</p>}
          {flowFile ? (
            <>
              <ul className="gh-mu-flows small">
                {flowFile.flows.map((fl) => (
                  <li key={fl.name}>
                    <span className="mono">{fl.name}</span>
                    <span className="gh-dim">
                      {fl.steps.length + fl.handler.length} processors, {counts[fl.name] ?? 0} {counts[fl.name] === 1 ? 'test' : 'tests'}
                    </span>
                    <button className="gh-btn gh-btn-sm" onClick={() => set(createTestFor(munit, fl.name))}>
                      Create test for this flow
                    </button>
                  </li>
                ))}
              </ul>
              <CodeBlock className="mono small">{flowXml(flowFile.file)}</CodeBlock>
            </>
          ) : (
            <>
              <textarea
                className="gh-mu-editor mono"
                aria-label={`Edit ${path}`}
                spellCheck={false}
                value={munit.files[path] ?? ''}
                onChange={(e) => set(setFile(munit, path, e.target.value))}
              />
              <div className="gh-mu-actions">
                <span className="gh-dim small">Changes apply to the next run.</span>
                <button className="gh-btn gh-btn-sm" onClick={() => set(revertFile(munit, path))}>
                  Revert file
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// What MUnit writes to the console and to target/site/munit: one line per test, then coverage per resource and flow.
export function MunitReport({ report, onCoverage, startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const { totals, tests, coverage } = report
  return (
    <section className="gh-box gh-mu-report" aria-label="MUnit report">
      <div className="gh-box-head gh-mu-head">
        <span>
          MUnit report <span className="gh-dim">· Tests: {totals.tests}, Errors: {totals.errors}, Failures: {totals.failures}, Skipped: {totals.skipped}</span>
        </span>
        {coverage && (
          <button
            className="gh-btn gh-btn-sm"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open)
              onCoverage()
            }}
          >
            Coverage report
          </button>
        )}
      </div>
      <table className="gh-mu-table small">
        <thead>
          <tr>
            <th>Suite</th>
            <th>Test</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => (
            <tr key={`${t.suite}/${t.name}`}>
              <td className="mono">{t.suite}</td>
              <td>
                <span className="mono">{t.name}</span>
                {t.message && <div className="gh-mu-msg mono">{t.message}</div>}
              </td>
              <td className={`gh-mu-${t.status}`}>{STATUS_WORD[t.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {coverage && open && (
        <div className="gh-mu-cov">
          <p className="small">
            <b>Application coverage {fmt(coverage.percent)}</b>{' '}
            <span className="gh-dim">
              {coverage.covered} of {coverage.total} processors ran in a test. From target/site/munit/coverage.
            </span>
          </p>
          <table className="gh-mu-table small">
            <thead>
              <tr>
                <th>Resource or flow</th>
                <th>Processors covered</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {coverage.resources.flatMap((r) => [
                <tr key={r.file} className="gh-mu-res">
                  <td className="mono">{r.file}</td>
                  <td>
                    {r.covered} of {r.total}
                  </td>
                  <td>{fmt(r.percent)}</td>
                </tr>,
                ...r.flows.map((f) => (
                  <tr key={`${r.file}/${f.name}`}>
                    <td className="mono gh-mu-indent">{f.name}</td>
                    <td>
                      {f.covered} of {f.total}
                    </td>
                    <td className={f.percent < report.settings.requiredFlowCoverage ? 'gh-mu-failed' : ''}>{fmt(f.percent)}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
