import { useEffect, useState } from 'react'
import {
  addMonAlert, apiById, API_ALERT_CODES, API_METRICS, apiStatus, appNamed, APP_METRICS, cpuOf, DAY, dayText, endpointOf, eventsOf, heapOf, HOUR, isFailed, mark, MINUTE, MON_SEVERITIES, OPERATORS, queryLogs,
  removeMonAlert, setMonAlert, stamp,
} from '../../lab/platform.js'
import { packageOf } from '../../lab/platform-packages.js'
import { bucketsOf, COLORS } from './charts.js'
import { Btn, Chart, Check, Dot, Errors, Field, Input, Link, Modal, Note, Select, SideNav, Table, Tabs } from './parts.jsx'
import { LogLines } from './RuntimeManager.jsx'

const RANGES = [[30 * MINUTE, '30 minutes'], [HOUR, '1 hour'], [6 * HOUR, '6 hours'], [DAY, '24 hours'], [3 * DAY, '3 days']]
const APP_TABS = ['Overview', 'Requests', 'Errors', 'Flows', 'JVM', 'Infrastructure']
const API_TABS = ['Overview', 'Requests', 'Errors', 'Policies', 'Performance', 'Client Applications']

export default function Monitoring({ state, update, place, go, openEnv }) {
  const { page = 'Built-in dashboards', target } = place
  return (
    <>
      <SideNav
        env={state.env}
        onEnv={openEnv}
        items={[{ title: 'Monitoring' }, ['Built-in dashboards', 'Built-in dashboards'], ['Custom dashboards', 'Custom dashboards', true], ['Alerts', 'Alerts'], ['Functional Monitoring', 'Functional Monitoring', true], null, { title: 'Logs' }, ['Log Search', 'Log Search'], ['Log Points', 'Log Points', true], null, { title: 'Other' }, ['Settings', 'Settings', true]]}
        value={page}
        onPick={(p) => go({ page: p })}
      />
      <main className="pc-main">
        {page === 'Built-in dashboards' && (target ? <Dashboard key={target} state={state} update={update} target={target} go={go} /> : <PickDashboard state={state} go={go} />)}
        {page === 'Alerts' && <Alerts state={state} update={update} />}
        {page === 'Log Search' && <LogSearch state={state} update={update} />}
      </main>
    </>
  )
}

const resourcesOf = (state) => [
  ...state.apps.filter((a) => a.env === state.env).map((a) => [`app:${a.name}`, `${a.name}  (Application)`]),
  ...state.apis.filter((a) => a.env === state.env).map((a) => [`api:${a.id}`, `${a.name} ${a.apiVersion}, ${a.label || a.id}  (API)`]),
]

function PickDashboard({ state, go }) {
  const list = resourcesOf(state)
  const [pick, setPick] = useState('')
  return (
    <div className="pc-center">
      <h2>Using built-in dashboards</h2>
      <p className="pc-dim">Dashboards are collections of useful metrics, and they are ready for each of your applications and APIs.</p>
      <div className="pc-bar">
        <Field label="Environment">
          <Select value={state.env} onChange={() => {}} options={[state.env]} />
        </Field>
        <Field label="Resource name">
          <Select value={pick} onChange={setPick} options={list} placeholder="Select a resource" />
        </Field>
        <Btn kind="primary" disabled={!pick} onClick={() => go({ page: 'Built-in dashboards', target: pick })}>
          View
        </Btn>
      </div>
    </div>
  )
}

const by = (list, key) => {
  const map = new Map()
  for (const e of list) map.set(e[key] || 'none', (map.get(e[key] || 'none') ?? 0) + 1)
  return [...map].sort((a, b) => b[1] - a[1])
}
const avg = (list) => (list.length ? Math.round(list.reduce((n, e) => n + e.ms, 0) / list.length) : null)

function Dashboard({ state, update, target, go }) {
  const kind = target.slice(0, 3)
  const id = target.slice(4)
  const app = kind === 'app' ? appNamed(state, id) : null
  const api = kind === 'api' ? apiById(state, id) : null
  const tabs = kind === 'app' ? APP_TABS : API_TABS
  const [tab, setTab] = useState('Overview')
  const [range, setRange] = useState(HOUR)
  useEffect(() => update((s) => mark(mark(s, `dash:${id}`), `dash:${id}:${tab}`)), [id, tab, update])
  if (!app && !api) return <Note>This resource is not in the environment {state.env}.</Note>

  const b = bucketsOf(state.clock, Number(range), 30)
  const scope = app ? { app: app.name, env: app.env } : { api: api.id }
  const events = b.ranges.map(([f, t]) => eventsOf(state, scope, f, t).filter((e) => e.k !== 'skip'))
  const all = events.flat()
  const calls = all.filter((e) => e.k === 'in')
  const each = (fn) => events.map(fn)
  const count = (test) => each((l) => l.filter(test).length)
  const chart = (title, series, extra) => <Chart key={title} title={title} labels={b.labels} series={series} {...extra} />
  const line = (title, fn, color = COLORS.blue, extra) => chart(title, [{ name: app?.name ?? (api.label || api.name), color, points: each(fn) }], extra)
  const codes = (list) => [
    { name: '2xx', color: COLORS.green, points: list.map((l) => l.filter((e) => e.k === 'in' && e.s < 300).length) },
    { name: '4xx', color: COLORS.amber, points: list.map((l) => l.filter((e) => e.k === 'in' && e.s >= 400 && e.s < 500).length) },
    { name: '5xx', color: COLORS.red, points: list.map((l) => l.filter((e) => e.k === 'in' && e.s >= 500).length) },
  ]
  const ms = (l) => avg(l.filter((e) => e.k === 'in'))
  const rows = (pairs, heads) => <Table heads={heads} rows={pairs.map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)} empty="No data in this time range." />
  const failures = all.filter((e) => isFailed(e) || e.s >= 400)

  return (
    <>
      <div className="pc-bar">
        <Field label={state.env}>
          <Select value={target} onChange={(t) => go({ page: 'Built-in dashboards', target: t })} options={resourcesOf(state)} />
        </Field>
        <span className="pc-grow" />
        <Field label="Time range">
          <Select value={range} onChange={(r) => setRange(Number(r))} options={RANGES} />
        </Field>
      </div>
      <Tabs kind="pill" tabs={tabs} value={tab} onChange={setTab} />
      <dl className="pc-facts">
        <dt>Type</dt>
        <dd>{app ? 'Application' : 'API'}</dd>
        <dt>Status</dt>
        <dd>
          <Dot status={app ? app.status : apiStatus(state, api)} />
        </dd>
        {app ? (
          <>
            <dt>URL</dt>
            <dd>{packageOf(app.pkg).handle && app.publicEndpoint !== false ? endpointOf(app) : 'None'}</dd>
            <dt>Runtime</dt>
            <dd>{app.version}</dd>
            <dt>Replicas</dt>
            <dd>{app.replicas} x {app.vCores} vCores</dd>
            <dt>Last Updated</dt>
            <dd>{stamp(app.updated)}</dd>
          </>
        ) : (
          <>
            <dt>API Instance ID</dt>
            <dd>{api.id}</dd>
            <dt>Label</dt>
            <dd>{api.label || 'none'}</dd>
          </>
        )}
      </dl>

      <div className="pc-charts">
        {tab === 'Overview' && (
          <>
            {app && line('Mule Messages', (l) => l.length)}
            {line('Average Response Time', ms, COLORS.teal, { unit: ' ms' })}
            {app ? line('Failed Mule Messages', (l) => l.reduce((n, e) => n + (e.n ?? (isFailed(e) ? 1 : 0)), 0), COLORS.red) : line('Failed Requests', (l) => l.filter((e) => e.s >= 400).length, COLORS.red)}
            {chart('Inbound Request Volume by Response Type', codes(events))}
            {api && line('Total Requests', (l) => l.length)}
          </>
        )}
        {tab === 'Requests' && (
          <>
            {line('Inbound Request Volume', (l) => l.filter((e) => e.k === 'in').length)}
            {line('Inbound Maximum Response Time', (l) => Math.max(0, ...l.filter((e) => e.k === 'in').map((e) => e.ms)) || null, COLORS.teal, { unit: ' ms' })}
          </>
        )}
        {tab === 'Errors' && (
          <>
            {chart('Requests by Response Type', codes(events))}
            {line(app ? 'Failed Mule Messages' : 'Failed Requests', (l) => l.filter((e) => isFailed(e) || (api && e.s >= 400)).length, COLORS.red)}
          </>
        )}
        {tab === 'Flows' && line('Failures by Flow', (l) => l.filter(isFailed).length, COLORS.red)}
        {tab === 'JVM' && (
          <>
            {line('Heap Usage', (l, i) => heapOf(state, app, ...b.ranges[i]), COLORS.violet, { unit: '%', max: 100 })}
            {line('Old Gen GC Count', (l, i) => (heapOf(state, app, ...b.ranges[i]) > 95 ? 18 : heapOf(state, app, ...b.ranges[i]) > 60 ? 4 : 1), COLORS.teal)}
            {line('Thread Count', () => (app.status === 'Running' ? 62 : 0))}
          </>
        )}
        {tab === 'Infrastructure' && (
          <>
            {line('System CPU % Utilization', (l, i) => cpuOf(state, app, ...b.ranges[i]), COLORS.teal, { unit: '%', max: 100 })}
            {line('Memory Utilization', (l, i) => heapOf(state, app, ...b.ranges[i]), COLORS.violet, { unit: '%', max: 100 })}
          </>
        )}
        {tab === 'Policies' && line('Policy Violations', (l) => l.filter((e) => e.pol).length, COLORS.red)}
        {tab === 'Performance' && line('Average Response Time', ms, COLORS.teal, { unit: ' ms' })}
        {tab === 'Client Applications' && chart('Requests by Client Application', by(calls, 'c').slice(0, 4).map(([name], i) => ({ name, color: [COLORS.blue, COLORS.teal, COLORS.violet, COLORS.amber][i], points: count((e) => (e.c || 'none') === name) })))}
      </div>

      {tab === 'Requests' && rows(by(calls.map((e) => ({ x: `${e.m} ${e.p}` })), 'x'), ['Request Volume by Endpoint', 'Requests'])}
      {tab === 'Errors' && (
        <>
          {rows(by(calls.map((e) => ({ x: String(e.s) })), 'x'), ['Response code', 'Requests'])}
          {rows(by(failures.map((e) => ({ x: e.e ?? e.pol ?? String(e.s) })), 'x'), ['Top failures', 'Count'])}
        </>
      )}
      {tab === 'Flows' && rows(by(all, 'fl'), ['Flow', 'Messages'])}
      {tab === 'Policies' && rows(by(calls.filter((e) => e.pol), 'pol'), ['Policy', 'Violations'])}
      {tab === 'Client Applications' && rows(by(calls, 'c'), ['Client application', 'Requests'])}
      {tab === 'Overview' && app && app.schedules.length > 0 && <Note>Dashboards show messages and failures. They have no job list, so a job that never ran leaves no mark here. Check Schedules and Logs in Runtime Manager.</Note>}
    </>
  )
}

// ---------- alerts ----------

function Alerts({ state, update }) {
  const [creating, setCreating] = useState(false)
  const [term, setTerm] = useState('')
  const [severity, setSeverity] = useState('')
  const list = state.monAlerts.filter((a) => a.env === state.env && a.title.toLowerCase().includes(term.toLowerCase()) && (!severity || a.severity === severity))
  return (
    <>
      <div className="pc-bar">
        <Input value={term} onChange={setTerm} placeholder="Search by name" aria-label="Search by name" />
        <Select value={severity} onChange={setSeverity} options={MON_SEVERITIES} placeholder="Severity" aria-label="Severity" />
        <span className="pc-grow" />
        <Btn kind="primary" onClick={() => setCreating(true)}>
          Create Alert
        </Btn>
      </div>
      <Table
        heads={['Alert Name', 'Severity', 'Status', 'Metric', 'Last Alerted', 'Creation Date', 'Availability', '']}
        empty="No alerts yet."
        rows={list.map((a) => (
          <tr key={a.id}>
            <td>{a.title}</td>
            <td>{a.severity}</td>
            <td>
              <Dot status={a.enabled ? a.state : 'Paused'} />
            </td>
            <td>
              {a.metric} {a.operator.toLowerCase()} {a.threshold}
              <small className="pc-hint">{a.resource === 'API' ? apiById(state, a.name_)?.name : a.name_}</small>
            </td>
            <td>{a.lastAlerted ? dayText(a.lastAlerted) : 'Never'}</td>
            <td>{dayText(a.created)}</td>
            <td>
              <Link onClick={() => update((s) => setMonAlert(s, a.id, { enabled: !a.enabled }))}>{a.enabled ? 'Enabled' : 'Disabled'}</Link>
            </td>
            <td>
              <Link onClick={() => update((s) => removeMonAlert(s, a.id))}>Delete</Link>
            </td>
          </tr>
        ))}
      />
      <Note>Alerts made in API Manager and Runtime Manager are not listed here.</Note>
      {creating && <AlertForm state={state} onClose={() => setCreating(false)} onSave={(a) => { update((s) => addMonAlert(s, a)); setCreating(false) }} />}
    </>
  )
}

function AlertForm({ state, onClose, onSave }) {
  const [step, setStep] = useState(1)
  const [a, setA] = useState({ title: '', resource: 'Application', name_: '', codes: [500], metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 5, subject: '', message: '', recipients: 'ops@harbor.example' })
  const set = (patch) => setA({ ...a, ...patch })
  const names = a.resource === 'API' ? state.apis.filter((x) => x.env === state.env).map((x) => [x.id, `${x.name} ${x.apiVersion}`]) : state.apps.filter((x) => x.env === state.env).map((x) => [x.name, x.name])
  const errors = { 1: [!a.title.trim() && 'Give the alert a name.', !a.name_ && 'Choose a resource.'], 2: [!(a.minutes >= 1) && 'The number of minutes is 1 or more.'], 3: [!a.recipients.trim() && 'Add a recipient.'] }[step].filter(Boolean)
  return (
    <Modal
      title={['', 'Create Alert', 'Set Alert Condition', 'Configure Notifications'][step]}
      onClose={onClose}
      foot={
        <>
          <span className="pc-dim pc-grow">Step {step} of 3</span>
          <Btn onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? 'Cancel' : 'Back'}</Btn>
          <Btn kind="primary" disabled={errors.length > 0} onClick={() => (step < 3 ? setStep(step + 1) : onSave(a))}>
            {step < 3 ? 'Next' : 'Create Alert'}
          </Btn>
        </>
      }
    >
      {step === 1 && (
        <>
          <Field label="Alert name" required>
            <Input value={a.title} onChange={(title) => set({ title })} />
          </Field>
          <Field label="Environment">
            <Select value={state.env} onChange={() => {}} options={[state.env]} />
          </Field>
          <Field label="Resource Type">
            <Select value={a.resource} onChange={(resource) => set({ resource, name_: '', metric: resource === 'API' ? 'Response Codes' : 'Message Error Count' })} options={['Application', 'API']} />
          </Field>
          <Field label="Resource Name" required>
            <Select value={a.name_} onChange={(name_) => set({ name_ })} options={names} placeholder="Select a resource" />
          </Field>
        </>
      )}
      {step === 2 && (
        <>
          <Field label="Metric">
            <Select value={a.metric} onChange={(metric) => set({ metric })} options={a.resource === 'API' ? API_METRICS : APP_METRICS} />
          </Field>
          {a.metric === 'Response Codes' && (
            <div className="pc-levels">
              {API_ALERT_CODES.map((c) => (
                <Check key={c} checked={a.codes.includes(c)} onChange={(on) => set({ codes: on ? [...a.codes, c] : a.codes.filter((x) => x !== c) })}>
                  {c}
                </Check>
              ))}
            </div>
          )}
          <Field label="Severity">
            <Select value={a.severity} onChange={(severity) => set({ severity })} options={MON_SEVERITIES} />
          </Field>
          <div className="pc-pair">
            <Field label="Threshold">
              <Select value={a.operator} onChange={(operator) => set({ operator })} options={OPERATORS} />
            </Field>
            <Field label="Value">
              <Input type="number" value={a.threshold} onChange={(threshold) => set({ threshold })} />
            </Field>
          </div>
          <Field label="For each of the last ... consecutive minutes">
            <Input type="number" min="1" value={a.minutes} onChange={(minutes) => set({ minutes })} />
          </Field>
        </>
      )}
      {step === 3 && (
        <>
          <Field label="Subject">
            <Input value={a.subject} onChange={(subject) => set({ subject })} placeholder="${severity}: ${resource}" />
          </Field>
          <Field label="Message">
            <Input value={a.message} onChange={(message) => set({ message })} />
          </Field>
          <Field label="Recipients" required hint="The first goes in To, the rest in CC.">
            <Input value={a.recipients} onChange={(recipients) => set({ recipients })} />
          </Field>
        </>
      )}
      <Errors list={a.title ? errors : []} />
    </Modal>
  )
}

// ---------- log search ----------

function LogSearch({ state, update }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState(null)
  const rows = query === null ? [] : queryLogs(state, query).slice(0, 500)
  const search = (e) => {
    e.preventDefault()
    setQuery(text)
    if (text.trim()) update((s) => mark(mark(s, 'logsearch'), `logsearch:${text.trim().slice(0, 80)}`))
  }
  return (
    <>
      <form className="pc-bar" onSubmit={search}>
        <Input value={text} onChange={setText} placeholder='log-level: ERROR AND appId: orders-sapi' aria-label="Search query" />
        <Btn kind="primary" type="submit">
          Search
        </Btn>
      </form>
      <p className="pc-dim">Fields: appId, log-level, logger, message. Join terms with AND. A star matches any text. A quoted phrase matches as it is.</p>
      {query !== null && (
        <>
          <div className="pc-underline">{rows.length} log entries</div>
          <LogLines rows={rows} />
        </>
      )}
    </>
  )
}
