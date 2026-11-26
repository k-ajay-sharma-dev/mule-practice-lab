import { useEffect, useState } from 'react'
import { isSnapshot, versionsOf } from '../../lab/exchange.js'
import {
  ASSET_ID,
  DEPLOY_COMMANDS,
  ENVIRONMENTS,
  freeReserved,
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
  running,
  SCENARIOS,
  settle,
  stagesFor,
  startRedeploy,
  startRun,
  step,
  undeploy,
  updateBinding,
} from '../../lab/pipeline.js'
import { CodeBlock } from '../../components/CopyButton.jsx'
import Assumed from './Assumed.jsx'
import { LabOutcome } from './ExchangeScreen.jsx'
import './exchange.css'

const STATE_KEY = 'pl.lab.pipeline'
const TICK_MS = 900 // real time between two stages while a run plays
const STATUS_TEXT = { pending: 'Waiting', passed: 'Passed', warned: 'Passed, check this', failed: 'Failed', skipped: 'Skipped' }

function loadSaved() {
  const fresh = { lab: newState(), config: newConfig() }
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY))
    const valid = saved?.lab?.envs?.Sandbox && saved.lab.envs.Production && Array.isArray(saved.lab.runs) && saved.lab.exchange && saved.config
    return valid ? { lab: saved.lab, config: { ...newConfig(), ...saved.config } } : fresh
  } catch {
    return fresh
  }
}

function save(lab, config) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ lab, config }))
  } catch {
    // storage blocked: the pipeline lasts for this visit
  }
}

// The release pipeline, laid out like a GitHub Actions page: a repository header, a sidebar, the workflow's runs and
// one run with its job graph and logs. The lab is the same as before; only the way it is shown changed.
const SIDE = [
  ['runs', 'Release pipeline', 'workflow'],
  ['options', 'Workflow options', 'gear'],
  ['environments', 'Environments', 'rocket'],
  ['exchange', 'Exchange versions', 'package'],
  ['promote', 'Promote API instance', 'arrow'],
]

export default function PipelineScreen() {
  const [saved] = useState(loadSaved)
  const [state, setState] = useState(saved.lab)
  const [config, setConfig] = useState(saved.config)
  const [scenarioId, setScenarioId] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [view, setView] = useState('runs')
  const [openRun, setOpenRun] = useState(null)
  const active = Boolean(running(state))
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)
  const run = openRun === null ? null : state.runs.find((r) => r.id === openRun)

  useEffect(() => save(state, config), [state, config])

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
    setState(newState())
    setConfig(newConfig())
    setScenarioId('')
    setOutcome(null)
    setOpenRun(null)
    setView('runs')
  }

  function go(key) {
    setView(key)
    setOpenRun(null)
    setOutcome(null)
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
            Reset lab
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

      <div className="gh-body">
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
            />
          )}

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
                  {scenario && (
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
              <p className="gh-dim small">What the next run of release.yml uses. Pick an exercise on the runs page to load its options.</p>
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
                />
              ))}
            </div>
          )}

          {view === 'exchange' && <ExchangeVersions state={state} onFree={(version) => apply(freeReserved(state, version))} />}

          {view === 'promote' && <Promotion state={state} onPromote={(input) => apply(promoteInstance(state, input))} />}
        </main>
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
          <span className="gh-dim">Pick an exercise or set the options, then press Run workflow.</span>
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

function RunPage({ run, active, onBack, onSkip }) {
  const [picked, setPicked] = useState(null)
  const stages = run.stages
  const notable = [...stages].reverse().find((s) => s.status === 'failed' || s.status === 'warned')
  const latest = [...stages].reverse().find((s) => s.status !== 'pending' && s.status !== 'skipped')
  const shown = stages.find((s) => s.id === picked) ?? notable ?? latest ?? stages[0]
  const status = runStatus(run)

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
              </button>
            </li>
          ))}
        </ol>
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
}

function Icon({ name }) {
  return (
    <svg className="gh-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
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

function Environment({ name, state, busy, onRedeploy, onRollback, onUndeploy, onOverwrite, onBind }) {
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
