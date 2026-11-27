import { useEffect, useRef, useState } from 'react'
import {
  addRmAlert, appNamed, clearStore, deleteStoreKey, hybridTargets, cpuOf, cronError, dayText, deleteApp, rollbackApp, deployApp, endpointOf, eventsOf, heapOf, HOUR, internalOf, jarsOf, LOG_LEVELS, mark, removeRmAlert, REPLICA_SIZES, replicaName, RM_CONDITIONS,
  RM_SEVERITIES, runNow, RUNTIME_VERSIONS, scheduleText, searchLogs, setRmAlert, setSchedule, stamp, startApp, stopApp, TIME_ZONES, UNIT_NAMES,
} from '../../lab/platform.js'
import { packageOf } from '../../lab/platform-packages.js'
import { PRIVATE_SPACE } from '../../lab/platform-project.js'
import { NodeTable, ServersPage } from './Servers.jsx'
import { Btn, Chart, Check, Dot, Errors, Field, Input, Link, Modal, Note, Select, SideNav, Table, Tabs } from './parts.jsx'
import { bucketsOf, COLORS } from './charts.js'

const MASK = '••••••'

export default function RuntimeManager({ state, update, place, go, openEnv }) {
  const { page = 'Applications', app: name, tab } = place
  const app = name ? appNamed(state, name) : null
  if (app)
    return (
      <>
        <SideNav env={state.env} onEnv={openEnv} back={['Applications', () => go({ page: 'Applications' })]} items={[['Dashboard', 'Dashboard'], ['Logs', 'Logs'], ['Schedules', 'Schedules'], ['Object Store', 'Object Store'], null, ['Settings', 'Settings'], ['History', 'Configuration history']]} value={tab ?? 'Dashboard'} onPick={(t) => go({ app: name, tab: t })} />
        <main className="pc-main">
          <AppPage key={name} app={app} tab={tab ?? 'Dashboard'} state={state} update={update} go={go} />
        </main>
      </>
    )
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[['Applications', 'Applications'], ['Servers', 'Servers'], ['Omni Gateways', 'Omni Gateways', true], ['Alerts', 'Alerts'], null, ['VPCs', 'VPCs', true], ['Private Spaces', 'Private Spaces'], ['Load Balancers', 'Load Balancers', true]]} value={page === 'Deploy' ? 'Applications' : page} onPick={(p) => go(p === 'Private Spaces' ? { product: 'Private spaces' } : { page: p })} />
      <main className="pc-main">
        {page === 'Deploy' && <Deploy state={state} update={update} go={go} />}
        {page === 'Alerts' && <Alerts state={state} update={update} />}
        {page === 'Servers' && <ServersPage state={state} update={update} go={go} />}
        {page === 'Applications' && <Applications state={state} go={go} />}
      </main>
    </>
  )
}

function Applications({ state, go }) {
  const [term, setTerm] = useState('')
  const apps = state.apps.filter((a) => a.env === state.env && a.name.includes(term.toLowerCase()))
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => go({ page: 'Deploy' })}>
          Deploy application
        </Btn>
        <Input value={term} onChange={setTerm} placeholder="Search Applications" aria-label="Search Applications" />
      </div>
      <div className="pc-underline">All Applications ({apps.length})</div>
      <Table
        heads={['Name', 'Target Name', 'Target Type', 'Status', 'Runtime Version', 'Date Modified']}
        empty="There are no applications in this environment."
        rows={apps.map((a) => (
          <tr key={a.name}>
            <td>
              <Link onClick={() => go({ app: a.name, tab: 'Dashboard' })}>{a.name}</Link>
            </td>
            <td>{a.target}</td>
            <td>{a.targetType ?? 'CloudHub 2.0'}</td>
            <td>
              <Dot status={a.status} />
            </td>
            <td>{a.version}</td>
            <td>{stamp(a.updated)}</td>
          </tr>
        ))}
      />
    </>
  )
}

function AppPage({ app, tab, state, update, go }) {
  return (
    <>
      <div className="pc-title">
        <Dot status={app.status} />
        <h2>{app.name}</h2>
        <span className="pc-grow" />
        {app.status === 'Stopped' ? <Btn onClick={() => update((s) => startApp(s, app.name))}>Start</Btn> : <Btn disabled={app.status === 'Starting'} onClick={() => update((s) => stopApp(s, app.name))}>Stop</Btn>}
      </div>
      {tab === 'Dashboard' && <Overview app={app} state={state} go={go} />}
      {tab === 'Logs' && <Logs app={app} state={state} update={update} />}
      {tab === 'Schedules' && <Schedules app={app} state={state} update={update} />}
      {tab === 'Settings' && <Settings app={app} state={state} update={update} go={go} />}
      {tab === 'Object Store' && <ObjectStore app={app} update={update} />}
      {tab === 'History' && <History app={app} state={state} update={update} go={go} />}
    </>
  )
}

const valueText = (v) => (typeof v === 'string' ? v : JSON.stringify(v))

function ObjectStore({ app, update }) {
  const [asking, setAsking] = useState(false)
  useEffect(() => update((s) => mark(s, `os:${app.name}`)), [app.name, update])
  const entries = Object.entries(app.store ?? {})
  return (
    <>
      <div className="pc-bar">
        <b>Default partition</b>
        <span className="pc-grow" />
        <Btn kind="danger" disabled={entries.length === 0} onClick={() => setAsking(true)}>
          Delete all keys
        </Btn>
      </div>
      <p className="pc-dim">The keys the application keeps between runs, such as a watermark. {app.objectStore === false ? 'Object Store V2 is off for this application, so the lab shows the store the application keeps in memory.' : 'The application uses Object Store V2.'}</p>
      <Table
        heads={['Key', 'Value', '']}
        empty="The object store of this application has no keys."
        rows={entries.map(([key, value]) => (
          <tr key={key}>
            <td className="pc-mono">{key}</td>
            <td className="pc-mono pc-os-value">{valueText(value)}</td>
            <td>
              <Link onClick={() => update((s) => deleteStoreKey(s, app.name, key))}>Delete</Link>
            </td>
          </tr>
        ))}
      />
      <Note>A deleted key is gone for the next run too. A watermark that is deleted makes the next run start from its initial value.</Note>
      {asking && (
        <Modal
          title="Delete all keys"
          onClose={() => setAsking(false)}
          foot={
            <>
              <Btn onClick={() => setAsking(false)}>Cancel</Btn>
              <Btn kind="danger" onClick={() => { update((s) => clearStore(s, app.name)); setAsking(false) }}>
                Delete all
              </Btn>
            </>
          }
        >
          <p>Delete the {entries.length} keys of {app.name}? This cannot be undone.</p>
        </Modal>
      )}
    </>
  )
}

function History({ app, state, update, go }) {
  const [open, setOpen] = useState(null)
  const [said, setSaid] = useState('')
  const [errors, setErrors] = useState([])
  useEffect(() => update((s) => mark(s, `history:${app.name}`)), [app.name, update])
  // an application the lab put in place has no history yet, so its current configuration is the only row
  const list = app.history?.length ? [...app.history].reverse() : [{ config: app.config, jar: app.jar, t: app.updated, props: app.props, secrets: app.secrets, ...(app.status === 'Running' && { result: 'Applied' }) }]
  const redeploy = (config) => {
    const r = rollbackApp(state, app.name, config)
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    setSaid(`Config ${config} is deployed again as a new configuration. The application restarts with its file and properties.`)
  }
  const shown = list.find((h) => h.config === open)
  return (
    <>
      <p className="pc-dim">Each Apply Changes creates a configuration. Deploy an earlier one to roll back to its application file and properties. The runtime settings stay as they are now.</p>
      <Table
        heads={['Config', 'Application file', 'Deployed', 'Result', '']}
        empty="No configuration was deployed from Runtime Manager yet."
        rows={list.map((h) => {
          const current = h.config === app.config
          return (
            <tr key={h.config}>
              <td>
                <Link onClick={() => setOpen(open === h.config ? null : h.config)}>Config {h.config}</Link>
                {current && <span className="pc-tag">Current</span>}
                {h.rollbackOf && <small className="pc-dim"> from config {h.rollbackOf}</small>}
              </td>
              <td className="pc-mono">{h.jar}</td>
              <td>{stamp(h.t)}</td>
              <td>{h.result ? <Dot status={h.result === 'Applied' ? 'Succeeded' : h.result} /> : app.status === 'Starting' && current ? <Dot status="Starting" /> : ''}</td>
              <td>
                {!current && h.result !== 'Failed' && (
                  <Link disabled={app.status === 'Starting'} onClick={() => redeploy(h.config)}>
                    Deploy
                  </Link>
                )}
              </td>
            </tr>
          )
        })}
      />
      {shown && (
        <div className="pc-split">
          <b>Properties of config {shown.config}</b>
          {shown.props ? (
            <pre className="pc-pre">
              {[...Object.entries(shown.props).map(([k, v]) => `${k}=${v}`), ...Object.keys(shown.secrets ?? {}).map((k) => `${k}=${MASK} (protected)`)].join('\n') || 'No properties.'}
            </pre>
          ) : (
            <p className="pc-dim">This configuration was deployed before the lab kept properties. A rollback keeps the properties of now.</p>
          )}
        </div>
      )}
      <Errors list={errors} />
      <p className="pc-dim" aria-live="polite">
        {said} {said && <Link onClick={() => go({ app: app.name, tab: 'Dashboard' })}>Open the dashboard</Link>}
      </p>
    </>
  )
}

function Overview({ app, state, go }) {
  const b = bucketsOf(state.clock, HOUR * 2, 24)
  const each = (fn) => b.ranges.map(([from, to]) => fn(from, to))
  const target = { app: app.name, env: app.env }
  return (
    <>
      <dl className="pc-facts">
        <dt>Public Endpoint</dt>
        <dd>{packageOf(app.pkg).handle && app.publicEndpoint !== false ? endpointOf(app) : 'None'}</dd>
        <dt>Private Endpoint</dt>
        <dd>{packageOf(app.pkg).handle ? internalOf(app) : 'None'}</dd>
        <dt>Target</dt>
        <dd>{app.target}</dd>
        {app.targetType ? (
          <>
            <dt>Target type</dt>
            <dd>{app.targetType}, in your data center</dd>
            <dt>Runtime</dt>
            <dd>{app.version}, from the servers</dd>
          </>
        ) : (
          <>
            <dt>Replicas</dt>
            <dd>
              {app.replicas} x {app.vCores} vCores
            </dd>
            <dt>Runtime</dt>
            <dd>
              {app.version} {app.channel}, Java {app.java}
            </dd>
          </>
        )}
        <dt>Last Updated</dt>
        <dd>{stamp(app.updated)}</dd>
        {app.restarts > 0 && (
          <>
            <dt>Restarts</dt>
            <dd className="pc-bad">{app.restarts}</dd>
          </>
        )}
      </dl>
      {app.targetType && <NodeTable state={state} app={app} />}
      {app.status === 'Starting' && !app.targetType && (
        <Note>
          {app.serving
            ? `Rolling update in progress. The replicas of config ${app.serving.config} answer requests until config ${app.config} is ready.`
            : `Config ${app.config} is starting. ${app.model === 'Recreate' ? 'Recreate terminated the old replicas first, so' : 'No replica runs, so'} requests get 503 until it is ready.`}
        </Note>
      )}
      {app.updateFailed && (
        <Note>
          <b>Update failed.</b> Config {app.updateFailed.config} did not start: {app.updateFailed.error.replace(/\.?$/, '.')} The replicas of config {app.config} keep running.{' '}
          <Link onClick={() => go({ app: app.name, tab: 'Logs' })}>View logs</Link>
        </Note>
      )}
      {app.status === 'Waiting' && <Note>No server of the target is connected, so the deployment waits. It goes out when a server connects to Runtime Manager again.</Note>}
      {app.error && (
        <Note>
          <b>Deployment failed.</b> {app.error}{' '}
          <Link onClick={() => go({ app: app.name, tab: 'Logs' })}>View logs</Link>
        </Note>
      )}
      <div className="pc-charts">
        <Chart title="Mule messages" labels={b.labels} series={[{ name: app.name, color: COLORS.blue, points: each((f, t) => eventsOf(state, target, f, t).filter((e) => e.k !== 'skip').length) }]} />
        <Chart title="CPU" labels={b.labels} unit="%" max={100} series={[{ name: app.targetType ? app.target : replicaName(app), color: COLORS.teal, points: each((f, t) => cpuOf(state, app, f, t)) }]} />
        <Chart title="Memory" labels={b.labels} unit="%" max={100} series={[{ name: app.targetType ? app.target : replicaName(app), color: COLORS.violet, points: each((f, t) => heapOf(state, app, f, t)) }]} />
      </div>
    </>
  )
}

const RANGES = [['all', 'All'], ['1', 'Last hour'], ['6', 'Last 6 hours'], ['24', 'Last 24 hours']]

function Logs({ app, state, update }) {
  const [text, setText] = useState('')
  const [levels, setLevels] = useState(['FATAL', 'ERROR', 'WARN', 'INFO'])
  const [range, setRange] = useState('all')
  const [config, setConfig] = useState('')
  useEffect(() => update((s) => mark(s, `logs:${app.name}`)), [app.name, update])
  const configs = [...new Set([app.config, ...app.logs.map((l) => l.config)])].sort((a, b) => b - a)
  const from = range === 'all' ? -Infinity : state.clock - Number(range) * HOUR
  const shown = searchLogs(app, { text, levels, from }).filter((l) => !config || l.config === Number(config))
  return (
    <>
      <div className="pc-bar">
        <Field label="Config">
          <Select value={config} onChange={setConfig} options={configs.map((c) => [c, `Config ${c}${c === app.config ? ' (current)' : ''}`])} placeholder="All configs" />
        </Field>
        <Field label="Search">
          <Input value={text} onChange={setText} placeholder="Search" />
        </Field>
        <Field label="Time Range">
          <Select value={range} onChange={setRange} options={RANGES} />
        </Field>
        <div className="pc-field">
          <span className="pc-label">Log Levels</span>
          <div className="pc-levels">
            {LOG_LEVELS.map((l) => (
              <Check key={l} checked={levels.includes(l)} onChange={(on) => setLevels(on ? [...levels, l] : levels.filter((x) => x !== l))}>
                {l[0] + l.slice(1).toLowerCase()}
              </Check>
            ))}
          </div>
        </div>
      </div>
      <Note>Logs are kept for 30 days or up to 100 MB per config. Times are shown in the lab time, UTC.</Note>
      <LogLines rows={shown.map((l) => ({ ...l, replica: l.node ?? replicaName(app) }))} latest />
    </>
  )
}

export function LogLines({ rows, latest }) {
  const list = useRef(null)
  // the newest line is at the end, so the list opens there
  useEffect(() => {
    if (latest && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [latest, rows.length])
  if (rows.length === 0) return <div className="pc-empty">No log messages match.</div>
  return (
    <ol ref={list} className="pc-log" tabIndex={0} aria-label="Log messages">
      {rows.map((l, i) => (
        <li key={i} className={`pc-l-${l.level.toLowerCase()}`}>
          <div>
            <b>{l.level}</b> <span>{stamp(l.t)}</span> <span className="pc-dim">{l.app ?? l.replica}</span>
          </div>
          <pre>
            <span className="pc-dim">{l.logger}: </span>
            {l.text}
          </pre>
        </li>
      ))}
    </ol>
  )
}

function Schedules({ app, state, update }) {
  const [picked, setPicked] = useState([])
  const [editing, setEditing] = useState(null)
  const [said, setSaid] = useState('')
  useEffect(() => update((s) => mark(s, `schedules:${app.name}`)), [app.name, update])
  const run = () => {
    for (const flow of picked) update((s) => runNow(s, app.name, flow))
    setSaid(app.status === 'Running' ? `Started ${picked.join(', ')}. Read the result in Logs.` : 'The application is not running.')
  }
  const toggle = (enabled) => {
    for (const flow of picked) update((s) => setSchedule(s, app.name, flow, { enabled }))
    setSaid('')
  }
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" disabled={picked.length === 0} onClick={run}>
          Run
        </Btn>
        <Btn disabled={picked.length === 0} onClick={() => toggle(false)}>
          Disable
        </Btn>
        <span className="pc-dim">{said}</span>
      </div>
      <Table
        heads={['', 'Name', 'Schedule', 'Enabled', 'Last run', 'Result']}
        empty="This application has no schedules."
        rows={app.schedules.map((x) => (
          <tr key={x.flow}>
            <td>
              <input type="checkbox" aria-label={`Select ${x.flow}`} checked={picked.includes(x.flow)} onChange={(e) => setPicked(e.target.checked ? [...picked, x.flow] : picked.filter((f) => f !== x.flow))} />
            </td>
            <td>{x.flow}</td>
            <td>
              <Link onClick={() => setEditing(x)}>{scheduleText(x)}</Link>
            </td>
            <td>{x.enabled ? 'Yes' : 'No'}</td>
            <td>{x.last ? `${dayText(x.last.t)}${x.last.manual ? ' (by hand)' : ''}` : 'Never'}</td>
            <td>{x.last ? x.last.ok ? <Dot status="Succeeded" /> : <span className="pc-bad">Failed, {x.last.error}</span> : ''}</td>
          </tr>
        ))}
      />
      <p className="pc-dim">Last run and Result are lab columns. The CloudHub 2.0 page has the flow name and the schedule, and you find the result in the logs.</p>
      {editing && <ScheduleForm key={editing.flow} x={editing} onClose={() => setEditing(null)} onSave={(patch) => { update((s) => setSchedule(s, app.name, editing.flow, patch)); setEditing(null) }} now={state.clock} />}
    </>
  )
}

function ScheduleForm({ x, onClose, onSave, now }) {
  const [form, setForm] = useState({ value: x.value, unit: x.unit, tz: x.tz, enabled: x.enabled })
  const set = (patch) => setForm({ ...form, ...patch })
  const bad = x.type === 'cron' ? cronError(form.value) : Number(form.value) > 0 ? null : 'The frequency is a number above 0.'
  return (
    <Modal
      title={`Edit schedule: ${x.flow}`}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={Boolean(bad)} onClick={() => onSave(x.type === 'cron' ? { value: form.value, tz: form.tz, enabled: form.enabled } : { value: Number(form.value), unit: form.unit, enabled: form.enabled })}>
            Update
          </Btn>
        </>
      }
    >
      {x.type === 'cron' ? (
        <>
          <Field label="Cron expression" hint="Seconds, minutes, hours, day of month, month, day of week, year (optional)">
            <Input value={form.value} onChange={(value) => set({ value })} />
          </Field>
          <Field label="Time Zone">
            <Select value={form.tz} onChange={(tz) => set({ tz })} options={Object.keys(TIME_ZONES)} />
          </Field>
        </>
      ) : (
        <div className="pc-pair">
          <Field label="Run every" hint="The minimum recommended frequency is 10 seconds. The lab clock moves in minutes.">
            <Input type="number" min="1" value={form.value} onChange={(value) => set({ value })} />
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(unit) => set({ unit })} options={UNIT_NAMES.filter((u) => u !== 'milliseconds' && u !== 'seconds')} />
          </Field>
        </div>
      )}
      <Check checked={form.enabled} onChange={(enabled) => set({ enabled })}>
        Enabled
      </Check>
      <p className="pc-dim">Lab time is {dayText(now)} UTC.</p>
      <Errors list={bad ? [bad] : []} />
    </Modal>
  )
}

// ---------- deploy and settings ----------

const rowsOf = (props, secrets) => [...Object.entries(props).map(([key, value]) => ({ key, value, secret: false })), ...Object.entries(secrets).map(([key, value]) => ({ key, value, secret: true, kept: true }))]
const toProps = (rows) => ({
  props: Object.fromEntries(rows.filter((r) => r.key.trim() && !r.secret).map((r) => [r.key.trim(), r.value])),
  secrets: Object.fromEntries(rows.filter((r) => r.key.trim() && r.secret).map((r) => [r.key.trim(), r.value])),
})

function Properties({ rows, onChange }) {
  const [view, setView] = useState('Table view')
  const [text, setText] = useState('')
  const set = (i, patch) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const open = (v) => {
    if (v === 'Text view') setText(rows.filter((r) => !r.secret).map((r) => `${r.key}=${r.value}`).join('\n'))
    setView(v)
  }
  const typed = (value) => {
    setText(value)
    const plain = value.split('\n').filter((l) => l.includes('=')).map((l) => ({ key: l.slice(0, l.indexOf('=')).trim(), value: l.slice(l.indexOf('=') + 1).trim(), secret: false }))
    onChange([...plain, ...rows.filter((r) => r.secret)])
  }
  return (
    <>
      <Tabs kind="pill" tabs={['Table view', 'Text view']} value={view} onChange={open} />
      <p className="pc-dim">Use properties to change the way your app behaves. The value of a protected property is hidden after deployment.</p>
      {view === 'Text view' ? (
        <textarea className="pc-input pc-mono" rows={8} aria-label="Properties as text" value={text} onChange={(e) => typed(e.target.value)} />
      ) : (
        <>
          <div className="pc-props">
            {rows.map((r, i) => (
              <div key={i} className="pc-prop">
                <Input aria-label="Key" placeholder="Key" value={r.key} onChange={(key) => set(i, { key })} />
                <Input aria-label="Value" placeholder={r.kept ? MASK : 'Value'} type={r.secret ? 'password' : 'text'} autoComplete="off" value={r.kept ? '' : r.value} onChange={(value) => set(i, { value, kept: false })} />
                <button type="button" className={`pc-lock${r.secret ? ' on' : ''}`} aria-pressed={r.secret} onClick={() => set(i, { secret: !r.secret, ...(r.kept && { kept: false, value: '' }) })}>
                  {r.secret ? 'Protected' : 'Protect'}
                </button>
                <button type="button" className="pc-x" aria-label={`Remove ${r.key || 'property'}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <Btn onClick={() => onChange([...rows, { key: '', value: '', secret: false }])}>Add property</Btn>
        </>
      )}
    </>
  )
}

function RuntimeTab({ form, set }) {
  return (
    <div className="pc-split">
      <b>Runtime version</b>
      <div className="pc-pair">
        <Field label="Release Channel">
          <Select value={form.channel} onChange={(channel) => set({ channel, version: RUNTIME_VERSIONS[channel][0] })} options={Object.keys(RUNTIME_VERSIONS)} />
        </Field>
        <Field label="Runtime Version">
          <Select value={form.version} onChange={(version) => set({ version })} options={RUNTIME_VERSIONS[form.channel]} />
        </Field>
        <Field label="Java Version">
          <Select value={form.java} onChange={(java) => set({ java })} options={['17', '8']} />
        </Field>
      </div>
      <b>Replicas</b>
      <div className="pc-pair">
        <Field label="Replica Count">
          <Select value={form.replicas} onChange={(n) => set({ replicas: Number(n) })} options={[1, 2, 3, 4, 5, 6, 7, 8]} />
        </Field>
        <Field label="Replica size">
          <Select value={form.vCores} onChange={(n) => set({ vCores: Number(n) })} options={REPLICA_SIZES.map((n) => [n, `${n} vCores`])} />
        </Field>
      </div>
      <b>Deployment Model</b>
      <div className="pc-pair">
        <Field label="Deployment model" hint={form.model === 'Recreate' ? 'Recreate stops the replicas first, so there is downtime.' : 'Rolling update keeps the app available by updating replicas one by one.'}>
          <Select value={form.model} onChange={(model) => set({ model })} options={['Rolling update', 'Recreate']} />
        </Field>
      </div>
      <b>Runtime Options</b>
      <div>
        <Check checked={form.cluster} disabled={form.replicas < 2} onChange={(cluster) => set({ cluster })}>
          Run in Runtime Cluster Mode
        </Check>
        <Check checked={form.objectStore} onChange={(objectStore) => set({ objectStore })}>
          Use Object Store V2
        </Check>
      </div>
    </div>
  )
}

const NEW = { name: '', jar: '', pkg: '', target: 'Shared Space', publicEndpoint: true, channel: 'LTS', version: '4.9', java: '17', replicas: 1, vCores: 0.1, model: 'Rolling update', cluster: false, objectStore: true }

function Deploy({ state, update, go }) {
  const [form, setForm] = useState(NEW)
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('Runtime')
  const [errors, setErrors] = useState([])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const jars = jarsOf(state)
  const chosen = jars.find((j) => j.jar === form.jar)
  function submit() {
    const result = deployApp(state, { ...form, ...chosen, ...toProps(rows) })
    setErrors(result.errors)
    if (result.errors.length) return
    update(() => result.state)
    go({ app: form.name, tab: 'Dashboard' })
  }
  return (
    <>
      <h2>Deploy Application</h2>
      <div className="pc-pair">
        <Field label="Application Name" required>
          <Input value={form.name} onChange={(name) => set({ name })} placeholder="orders-sapi" />
        </Field>
        <Field label="Deployment Target">
          <Select
            value={form.targetType ? `${form.targetType}|${form.target}` : form.target}
            onChange={(v) => {
              const [type, name] = v.includes('|') ? v.split('|') : [undefined, v]
              set({ target: name, targetType: type, ...(name === 'Shared Space' && { publicEndpoint: true }) })
            }}
            options={[['Shared Space', 'Shared Space, US East (Ohio), CloudHub 2.0'], [PRIVATE_SPACE, `Private Space ${PRIVATE_SPACE}, US East (Ohio)`], ...hybridTargets(state).map((t) => [`${t.type}|${t.name}`, `${t.type}: ${t.name}, your data center`])]}
          />
        </Field>
        <Field label="Application File" required hint={jars.length === 0 ? 'No files yet. Export an application from Anypoint Studio first.' : chosen ? packageOf(chosen.pkg).note : undefined}>
          <Select value={form.jar} onChange={(jar) => set({ jar, pkg: jars.find((j) => j.jar === jar)?.pkg ?? '' })} placeholder="Choose file" options={jars.map((j) => j.jar)} />
        </Field>
      </div>
      <Tabs tabs={['Runtime', 'Ingress', 'Properties', 'Logging']} value={tab} onChange={setTab} />
      {tab === 'Runtime' && (form.targetType ? <HybridRuntime /> : <RuntimeTab form={form} set={set} />)}
      {tab === 'Ingress' && (form.targetType ? <HybridIngress app={{ name: form.name, env: state.env, targetType: form.targetType }} /> : <Ingress app={{ name: form.name, env: state.env }} target={form.target} on={form.publicEndpoint} onChange={(publicEndpoint) => set({ publicEndpoint })} />)}
      {tab === 'Properties' && <Properties rows={rows} onChange={setRows} />}
      {tab === 'Logging' && <LoggingTab />}
      <Errors list={errors} />
      <div className="pc-foot">
        <Btn onClick={() => go({ page: 'Applications' })}>Cancel</Btn>
        <Btn kind="primary" onClick={submit}>
          Deploy Application
        </Btn>
      </div>
    </>
  )
}

const Ingress = ({ app, target, on, onChange }) => (
  <div className="pc-split">
    <b>Public endpoint</b>
    <div>
      <Check checked={on} disabled={target === 'Shared Space'} onChange={onChange}>
        Use a public endpoint
      </Check>
      <p className="pc-dim">{!app.name ? 'Give the application a name first.' : on ? endpointOf(app) : 'None. The application is reached through the private endpoint only.'}</p>
      {target === 'Shared Space' && <p className="pc-dim">In the shared space every application has a public endpoint. A private space lets you take it away.</p>}
    </div>
    <b>Private endpoint</b>
    <div className="pc-dim">{app.name ? internalOf(app) : ''}</div>
    <b>Last-mile security</b>
    <Check checked={false} disabled onChange={() => {}}>
      Enable last-mile security
    </Check>
  </div>
)
const HybridRuntime = () => (
  <div className="pc-split">
    <b>Runtime</b>
    <p className="pc-dim">The servers of the target already run a Mule runtime, so the version comes from them. Every server of a group or cluster gets its own copy of the application.</p>
  </div>
)
const HybridIngress = ({ app }) => (
  <div className="pc-split">
    <b>Load balancer</b>
    <p className="pc-dim">Neither a server group nor an on premises cluster has a built in load balancer. Harbor puts its own in front of the servers: {app.name ? endpointOf(app) : 'give the application a name first'}.</p>
  </div>
)
const LoggingTab = () => (
  <>
    <Check checked onChange={() => {}}>
      Forward application logs to Anypoint Platform
    </Check>
    <p className="pc-dim">The lab keeps the log levels of the application at INFO.</p>
  </>
)

function Settings({ app, state, update, go }) {
  const [form, setForm] = useState({ channel: app.channel, version: app.version, java: app.java, replicas: app.replicas, vCores: app.vCores, model: app.model, cluster: app.cluster, objectStore: app.objectStore, publicEndpoint: app.publicEndpoint !== false })
  const [rows, setRows] = useState(() => rowsOf(app.props, app.secrets))
  const [tab, setTab] = useState('Properties')
  const [jar, setJar] = useState(app.jar)
  const [said, setSaid] = useState('')
  const [errors, setErrors] = useState([])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const jars = jarsOf(state)
  const chosen = jars.find((j) => j.jar === jar)
  function apply() {
    const result = deployApp(state, { ...form, ...(app.targetType && { target: app.target, targetType: app.targetType }), ...(chosen ?? { pkg: app.pkg }), ...toProps(rows), name: app.name, editing: true })
    setErrors(result.errors)
    if (result.errors.length) return
    update(() => result.state)
    setRows(rowsOf(toProps(rows).props, toProps(rows).secrets))
    setSaid('Changes applied. The application restarts with the new configuration.')
  }
  return (
    <>
      <div className="pc-pair">
        <Field label="Application File">
          <Select value={jar} onChange={setJar} options={[...new Set([app.jar, ...jars.map((j) => j.jar)])]} />
        </Field>
      </div>
      <Tabs tabs={['Runtime', 'Ingress', 'Properties', 'Logging']} value={tab} onChange={setTab} />
      {tab === 'Runtime' && (app.targetType ? <HybridRuntime /> : <RuntimeTab form={form} set={set} />)}
      {tab === 'Ingress' && (app.targetType ? <HybridIngress app={app} /> : <Ingress app={app} target={app.target} on={form.publicEndpoint} onChange={(publicEndpoint) => set({ publicEndpoint })} />)}
      {tab === 'Properties' && <Properties rows={rows} onChange={setRows} />}
      {tab === 'Logging' && <LoggingTab />}
      <Errors list={errors} />
      <div className="pc-foot">
        <span className="pc-dim pc-grow" aria-live="polite">
          {said}
        </span>
        <Btn kind="danger" onClick={() => { update((s) => deleteApp(s, app.name)); go({ page: 'Applications' }) }}>
          Delete application
        </Btn>
        <Btn kind="primary" disabled={app.status === 'Starting'} onClick={apply}>
          Apply Changes
        </Btn>
      </div>
    </>
  )
}

// ---------- alerts ----------

function Alerts({ state, update }) {
  const [creating, setCreating] = useState(false)
  const alerts = state.rmAlerts.filter((a) => a.env === state.env)
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => setCreating(true)}>
          + Create Alert
        </Btn>
      </div>
      <Table
        heads={['Name', 'Severity', 'Application', 'Condition', 'Active', 'Last fired', '']}
        empty="No alerts in this environment."
        rows={alerts.map((a) => (
          <tr key={a.id}>
            <td>{a.name}</td>
            <td>{a.severity}</td>
            <td>{a.app === 'All' ? 'All applications' : a.app}</td>
            <td>{a.condition}</td>
            <td>
              <input type="checkbox" aria-label={`Active: ${a.name}`} checked={a.enabled} onChange={(e) => update((s) => setRmAlert(s, a.id, { enabled: e.target.checked }))} />
            </td>
            <td>{a.fired?.length ? `${dayText(a.fired.at(-1))}` : 'Never'}</td>
            <td>
              <Link onClick={() => update((s) => removeRmAlert(s, a.id))}>Delete</Link>
            </td>
          </tr>
        ))}
      />
      <Note>CloudHub 2.0 applications have two conditions here: Deployment success and Deployment failure. Metric alerts are created in Monitoring.</Note>
      {creating && <AlertForm state={state} onClose={() => setCreating(false)} onSave={(a) => { update((s) => addRmAlert(s, a)); setCreating(false) }} />}
    </>
  )
}

function AlertForm({ state, onClose, onSave }) {
  const [a, setA] = useState({ name: '', severity: 'Critical', app: 'All', condition: 'Deployment failure', subject: '${severity}: ${resource}', message: '', recipients: 'ops@harbor.example' })
  const set = (patch) => setA({ ...a, ...patch })
  const errors = [!a.name.trim() && 'Give the alert a name.', a.name.length > 40 && 'A name has at most 40 characters.', !a.recipients.trim() && 'Add a recipient.'].filter(Boolean)
  return (
    <Modal
      title="Create Alert"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={errors.length > 0} onClick={() => onSave({ ...a, subject: a.subject.replace('${severity}', a.severity).replace('${resource}', a.app === 'All' ? 'an application' : a.app) })}>
            Create Alert
          </Btn>
        </>
      }
    >
      <Field label="Name" required>
        <Input value={a.name} onChange={(name) => set({ name })} />
      </Field>
      <Field label="Severity level">
        <Select value={a.severity} onChange={(severity) => set({ severity })} options={RM_SEVERITIES} />
      </Field>
      <Field label="Source">
        <Select value="Applications" onChange={() => {}} options={['Applications']} />
      </Field>
      <Field label="Application type">
        <Select value="CloudHub 2.0 and RTF Applications" onChange={() => {}} options={['CloudHub 2.0 and RTF Applications']} />
      </Field>
      <Field label="Applications">
        <Select value={a.app} onChange={(app) => set({ app })} options={[['All', 'All applications'], ...state.apps.filter((x) => x.env === state.env).map((x) => [x.name, x.name])]} />
      </Field>
      <Field label="Condition">
        <Select value={a.condition} onChange={(condition) => set({ condition })} options={RM_CONDITIONS} />
      </Field>
      <Field label="Subject">
        <Input value={a.subject} onChange={(subject) => set({ subject })} />
      </Field>
      <Field label="Message">
        <Input value={a.message} onChange={(message) => set({ message })} />
      </Field>
      <Field label="Recipients" required hint="Addresses separated by commas. The first goes in To, the rest in CC.">
        <Input value={a.recipients} onChange={(recipients) => set({ recipients })} />
      </Field>
      <Errors list={a.name ? errors : []} />
    </Modal>
  )
}

