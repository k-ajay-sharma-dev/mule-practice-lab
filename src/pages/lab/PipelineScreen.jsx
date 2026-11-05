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

export default function PipelineScreen() {
  const [saved] = useState(loadSaved)
  const [state, setState] = useState(saved.lab)
  const [config, setConfig] = useState(saved.config)
  const [scenarioId, setScenarioId] = useState('')
  const [outcome, setOutcome] = useState(null)
  const active = Boolean(running(state))
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)

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

  function launch() {
    setOutcome(null)
    setState(startRun(state, config))
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
  }

  return (
    <>
      <section className="lab-panel lx-pipeline" aria-label="Release pipeline">
        <div className="lab-panel-head">
          <h2>Release pipeline</h2>
          <button className="btn btn-sm btn-ghost" onClick={reset}>
            Reset lab
          </button>
        </div>
        <div className="lx-launch">
          <label className="lab-field lab-grow">
            <span className="small muted">Exercise</span>
            <select className="input" value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
              <option value="">Default options, or your own</option>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.incident ? ` (${s.incident})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={launch} disabled={active}>
            Run pipeline
          </button>
          {scenario && (
            <button className="btn" onClick={() => setConfig({ ...config, ...scenario.fix })} disabled={active}>
              Apply the fix
            </button>
          )}
          {active && (
            <button className="btn" onClick={() => setState(settle(state))}>
              Skip to result
            </button>
          )}
        </div>
        <RunView key={state.runs[0]?.id ?? 'none'} run={state.runs[0]} config={config} />
      </section>

      {outcome && <LabOutcome outcome={outcome} />}

      <div className="lab-grid">
        <section className="lab-panel" aria-label="Pipeline options">
          <div className="lab-panel-head">
            <h2>Options</h2>
          </div>
          <Options config={config} onChange={setConfig} />
        </section>

        <div className="lx-stack">
          {ENVIRONMENTS.map((name) => (
            <Environment
              key={name}
              name={name}
              state={state}
              busy={active}
              onRedeploy={(version) => setState(startRedeploy(state, config, name, version))}
              onRollback={(id) => apply(rollback(state, name, id))}
              onUndeploy={() => setState(undeploy(state, name))}
              onOverwrite={() => setState(overwriteSnapshot(state, state.envs[name].version))}
              onBind={() => setState(updateBinding(state, name))}
            />
          ))}
          <ExchangeVersions state={state} onFree={(version) => apply(freeReserved(state, version))} />
          <Promotion state={state} onPromote={(input) => apply(promoteInstance(state, input))} />
        </div>
      </div>
    </>
  )
}

function RunView({ run, config }) {
  const [picked, setPicked] = useState(null)
  const stages = run?.stages ?? stagesFor(config).map((s) => ({ ...s, status: 'pending', logs: [], issues: [] }))
  const notable = [...stages].reverse().find((s) => s.status === 'failed' || s.status === 'warned')
  const latest = [...stages].reverse().find((s) => s.status !== 'pending' && s.status !== 'skipped')
  const shown = stages.find((s) => s.id === picked) ?? notable ?? latest

  return (
    <>
      <ol className="lx-rail">
        {stages.map((s) => (
          <li key={s.id}>
            <button className={`lx-stage lx-stage-${s.status}${s === shown ? ' lx-stage-open' : ''}`} onClick={() => setPicked(s.id)}>
              <b>{s.name}</b>
              <span className="mono lx-command">{s.command}</span>
              <span className="small lx-stage-status">{STATUS_TEXT[s.status]}</span>
            </button>
          </li>
        ))}
      </ol>
      {run && (
        <p className="small lx-result" aria-live="polite">
          Run {run.id}, version <span className="mono">{run.version}</span>: <b>{run.result ?? 'In progress'}</b>
        </p>
      )}
      {!run && <div className="empty-row muted">Choose an exercise or set the options, then run the pipeline.</div>}
      {shown && shown.status !== 'pending' && (
        <div>
          {shown.issues.map((issue) => (
            <LabOutcome key={issue.title} outcome={issue} />
          ))}
          {shown.logs.length > 0 && (
            <ol className="lab-log mono small">
              {shown.logs.map((l, i) => (
                <li key={i} className={`lab-log-${l.level.toLowerCase()}`}>
                  <b>{l.level}</b> {l.text}
                  <Assumed basis={l.basis} />
                </li>
              ))}
            </ol>
          )}
          {shown.status === 'passed' && shown.logs.length === 0 && <p className="muted small">This stage produced no output.</p>}
        </div>
      )}
    </>
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
        <pre className="mono small">{pomPreview(config)}</pre>
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
