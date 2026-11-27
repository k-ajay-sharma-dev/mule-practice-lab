// Capacity planner, a lab tool: sizes a CloudHub 2.0 application from its peak load, the cost of one request and a
// budget in vCores, applies the chosen replicas and size through the normal deploy path, and runs a load test.
// The throughput model is lab-made, see lab/platform-capacity.js.
import { useEffect, useState } from 'react'
import { advance, deployApp, mark, timeText } from '../../lab/platform.js'
import { packageOf } from '../../lab/platform-packages.js'
import { APP_TYPES, CPU_TARGET, gb, loadOf, MAX_REPLICAS, N1_LIMIT, planOptions, runLoadTest, sizeOf, steadyOf, testsOf } from '../../lab/platform-capacity.js'
import { Btn, Errors, Field, Link, Note, Select, Table } from './parts.jsx'

const num = (v) => (String(v).trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const ms = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`)
const Text = ({ value, onChange, label, ...props }) => <input className="pc-input" inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} {...props} />

const formOf = (state, app) => {
  const p = app ? packageOf(app.pkg)?.profile : null
  const steady = app ? steadyOf(state, app.name, app.env) : 0
  return { type: p?.type ?? 'api', peak: String(steady || 600), payload: String(p?.payloadKb ?? 8), requestMs: String(p?.requestMs ?? APP_TYPES.find((t) => t.id === 'api').ms), budget: '4' }
}

export default function CapacityPlanner({ state, update }) {
  const apps = state.apps.filter((a) => a.env === state.env && !a.targetType)
  const first = apps.find((a) => packageOf(a.pkg)?.profile) ?? apps[0]
  const [name, setName] = useState(first?.name ?? '')
  const app = apps.find((a) => a.name === name)
  const [form, setForm] = useState(() => formOf(state, app))
  const [pick, setPick] = useState(null)
  const [all, setAll] = useState(false)
  const [errors, setErrors] = useState([])
  const [said, setSaid] = useState('')
  useEffect(() => update((s) => mark(s, 'capacity')), [update])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const choose = (n) => {
    setName(n)
    setForm(formOf(state, apps.find((a) => a.name === n)))
    setPick(null)
    setSaid('')
    setErrors([])
  }

  const input = { perMinute: num(form.peak), requestMs: num(form.requestMs), payloadKb: num(form.payload), budget: num(form.budget) }
  const bad = [
    !(input.perMinute > 0) && 'Expected requests a minute at peak is a number above 0.',
    !(input.requestMs > 0) && 'Per request time is a number of milliseconds above 0.',
    !(input.payloadKb >= 0) && 'Payload size is a number of KB, 0 or more.',
    !(input.budget >= 0.1) && 'Budget is at least 0.1 vCores.',
  ].filter(Boolean)
  const options = bad.length ? [] : planOptions(input)
  const shown = all ? options : options.slice(0, 12)
  const now = app && !bad.length ? loadOf({ replicas: app.replicas, vCores: app.vCores, ...input }) : null
  const profile = app ? packageOf(app.pkg)?.profile : null
  const tests = app ? [...testsOf(state, app.name)].reverse() : []
  const busy = app?.status === 'Starting'
  const chosen = options.find((o) => `${o.replicas}x${o.vCores}` === pick)

  function apply() {
    if (!app || !chosen) return
    const r = deployApp(state, { name: app.name, pkg: app.pkg, replicas: chosen.replicas, vCores: chosen.vCores, model: app.model, version: app.version, editing: true })
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    const scaleOnly = chosen.vCores === app.vCores
    setSaid(
      `Applied ${chosen.replicas} x ${chosen.vCores} vCores to ${app.name}. ${scaleOnly ? 'Only the replica count changed, so the running replicas stay and new ones join.' : app.model === 'Recreate' ? 'The size changed and the model is Recreate: the replicas stop first, so requests get 503 until the new ones run.' : 'The size changed, so a rolling update replaces every replica while the old ones keep serving.'}`,
    )
  }
  function loadTest() {
    if (!app || !profile || bad.length) return
    update((s) => runLoadTest(s, { app: app.name, path: profile.path, method: profile.method, perMinute: input.perMinute, minutes: 10, sample: profile.sample ?? 1 }, advance))
    setSaid(`Load test sent ${input.perMinute} requests a minute to ${app.name} for 10 lab minutes. The result is in Load tests.`)
  }

  if (!apps.length)
    return (
      <main className="pc-main">
        <p className="pc-empty pc-boxed">There is no CloudHub 2.0 application in {state.env}.</p>
      </main>
    )
  return (
    <main className="pc-main cp-main">
      <h2>Capacity planner</h2>
      <p className="pc-dim">Size a CloudHub 2.0 application for its peak. Keep peak CPU under {CPU_TARGET} percent and plan for one replica down (N+1). The throughput per vCore is a lab model: measure the cost of your own requests with a load test.</p>
      <div className="cp-inputs">
        <Field label="Application">
          <Select value={name} onChange={choose} options={apps.map((a) => [a.name, `${a.name}, ${a.replicas} x ${a.vCores} vCores`])} />
        </Field>
        <Field label="Application type" hint="Sets a lab-made per request time. Change it to what you measured.">
          <Select value={form.type} onChange={(type) => set({ type, requestMs: String(APP_TYPES.find((t) => t.id === type).ms) })} options={APP_TYPES.map((t) => [t.id, `${t.name}, ${t.ms} ms`])} />
        </Field>
        <Field label="Expected requests a minute at peak" hint={app ? `Steady traffic now: ${steadyOf(state, app.name, app.env)} a minute.` : undefined}>
          <Text label="Expected requests a minute at peak" value={form.peak} onChange={(peak) => set({ peak })} />
        </Field>
        <Field label="Payload size (KB)" hint="Request and response together.">
          <Text label="Payload size (KB)" value={form.payload} onChange={(payload) => set({ payload })} />
        </Field>
        <Field label="Per request time (ms)" hint="CPU time of one request on one full vCore.">
          <Text label="Per request time (ms)" value={form.requestMs} onChange={(requestMs) => set({ requestMs })} />
        </Field>
        <Field label="Budget (vCores)">
          <Text label="Budget (vCores)" value={form.budget} onChange={(budget) => set({ budget })} />
        </Field>
      </div>
      <Errors list={bad} />
      {now && (
        <p className="cp-now">
          <b>Now:</b> {app.replicas} x {app.vCores} vCores would run at <span className={now.cpu >= CPU_TARGET ? 'pc-bad' : ''}>{now.cpu}% CPU</span> at this peak, p95 {ms(now.p95)}
          {now.reject > 0 && <span className="pc-bad">, with about {Math.round(now.reject * 100)} percent of requests answered 503</span>}.
        </p>
      )}

      <h3>Options</h3>
      <Table
        heads={['', 'Replicas x size', 'Cost (vCores)', 'Peak CPU', 'Headroom', 'One replica down', 'N+1', 'p95', 'Memory per replica', '']}
        empty={bad.length ? 'Fix the inputs first.' : 'No option fits in the budget.'}
        rows={shown.map((o) => {
          const id = `${o.replicas}x${o.vCores}`
          const size = sizeOf(o.vCores)
          return (
            <tr key={id} className={`${o.fits ? 'cp-fit' : ''}${pick === id ? ' cp-on' : ''}`}>
              <td>
                <input type="radio" name="cp-option" aria-label={`Pick ${o.replicas} x ${o.vCores} vCores`} checked={pick === id} onChange={() => setPick(id)} />
              </td>
              <td>
                {o.replicas} x {o.vCores} vCores
                {o.replicas === app?.replicas && o.vCores === app?.vCores && <span className="pc-tag">Current</span>}
              </td>
              <td>{o.cost}</td>
              <td className={o.peak.cpu >= CPU_TARGET ? 'pc-bad' : ''}>{o.peak.cpu}%</td>
              <td>{o.headroom}%</td>
              <td className={o.replicas < 2 || o.down.cpu >= N1_LIMIT ? 'pc-bad' : ''}>{o.replicas < 2 ? 'Down' : `${o.down.cpu}% CPU${o.down.reject > 0 ? ', 503s' : ''}`}</td>
              <td>{o.n1 ? 'Yes' : 'No'}</td>
              <td>{ms(o.peak.p95)}</td>
              <td>
                {o.peak.heapPct}% of {gb(size.heap)} heap
              </td>
              <td>{o.fits && <span className="cp-tag">Fits</span>}</td>
            </tr>
          )
        })}
      />
      {options.length > 12 && (
        <Link onClick={() => setAll(!all)}>{all ? 'Show the first 12' : `Show all ${options.length} options`}</Link>
      )}
      <Note>
        Scale out (more replicas) adds throughput and survives a replica loss; a replica count change alone adds replicas and restarts none. Scale up (a larger size) gives one request more CPU and heap; it restarts every replica. At most {MAX_REPLICAS} replicas.
      </Note>
      <Errors list={errors} />
      <div className="pc-foot">
        <span className="pc-dim pc-grow" aria-live="polite">
          {said}
        </span>
        <Btn disabled={!profile || busy || app?.status !== 'Running' || bad.length > 0} onClick={loadTest} title={profile ? undefined : 'This application has no load profile in the lab.'}>
          Run load test
        </Btn>
        <Btn kind="primary" disabled={!chosen || busy} onClick={apply}>
          Apply to app
        </Btn>
      </div>
      {busy && <Note>A deployment of {app.name} is in progress. Wait until it is Running before the next change or a load test.</Note>}
      {!profile && app && <Note>The lab has no load profile for {app.name}, so a load test is not offered. The planner still sizes it from your inputs.</Note>}

      <h3>Load tests</h3>
      <Table
        heads={['Started', 'Config', 'Replicas x size', 'Requests a minute', 'Sent', 'Rejected (503)', 'p50', 'p95', 'Result']}
        empty="No load test of this application yet."
        rows={tests.map((t) => (
          <tr key={t.t}>
            <td>{timeText(t.t)}</td>
            <td>{t.config}</td>
            <td>
              {t.replicas} x {t.vCores} vCores
            </td>
            <td>{t.perMinute}</td>
            <td>{t.sent}</td>
            <td className={t.rejected > 0 ? 'pc-bad' : ''}>{t.rejected}</td>
            <td>{ms(t.p50)}</td>
            <td>{ms(t.p95)}</td>
            <td>{t.failed > 0 ? <span className="pc-bad">Failed</span> : 'Passed, no errors'}</td>
          </tr>
        ))}
      />
    </main>
  )
}
