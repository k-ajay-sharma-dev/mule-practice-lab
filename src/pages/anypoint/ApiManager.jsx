import { useEffect, useState } from 'react'
import {
  addApi, addApiAlert, addTier, API_ALERT_CODES, API_ALERT_TYPES, apiById, apiStatus, applyPolicy, assetGroups, DAY, dayText, deleteApi, ENVS, eventsOf, HOUR, mark, pairedApps, promoteApi, removeApiAlert, reviseApi, sameMajor,
  RM_SEVERITIES, setApi, setContract,
} from '../../lab/platform.js'
import { docsUrl, POLICIES, policyByType } from '../../lab/policies.js'
import { FLEX_RUNTIME, flexFields } from '../../lab/platform-flex.js'
import { bucketsOf, COLORS } from './charts.js'
import { Btn, Chart, Check, Copy, Dot, Errors, Field, Input, Link, Modal, Note, RadioCards, Radios, Select, SideNav, Table } from './parts.jsx'

const HOME = [['API Administration', 'API Administration'], ['API Groups', 'API Groups', true], null, ['Automated Policies', 'Automated Policies', true], ['Client Applications', 'Client Applications'], ['Custom Policies', 'Custom Policies', true], null, ['Mule API Analytics', 'Mule API Analytics', true]]
const INSTANCE = [['API Summary', 'API Summary'], ['Alerts', 'Alerts'], ['Contracts', 'Contracts'], ['Policies', 'Policies'], ['SLA Tiers', 'SLA Tiers'], ['Settings', 'Settings']]

export default function ApiManager({ state, update, place, go, openEnv }) {
  const { page = 'API Administration', api: id, tab = 'API Summary' } = place
  const api = id ? apiById(state, id) : null
  if (api && api.env === state.env)
    return (
      <>
        <SideNav env={state.env} onEnv={openEnv} back={['API Administration', () => go({ page: 'API Administration' })]} items={INSTANCE} value={tab} onPick={(t) => go({ api: id, tab: t })} />
        <main className="pc-main">
          <Instance key={id} api={api} tab={tab} state={state} update={update} go={go} />
        </main>
      </>
    )
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={HOME} value={page === 'Add API' || page === 'Promote API' ? 'API Administration' : page} onPick={(p) => go({ page: p })} />
      <main className="pc-main">
        {page === 'API Administration' && <Administration state={state} update={update} go={go} />}
        {page === 'Add API' && <AddApi state={state} update={update} go={go} />}
        {page === 'Promote API' && <Promote state={state} update={update} go={go} />}
        {page === 'Client Applications' && <Clients state={state} />}
      </main>
    </>
  )
}

function Administration({ state, update, go }) {
  const [menu, setMenu] = useState(false)
  const [info, setInfo] = useState(false)
  const [term, setTerm] = useState('')
  const [filter, setFilter] = useState('')
  const apis = state.apis.filter((a) => a.env === state.env && `${a.name} ${a.label}`.toLowerCase().includes(term.toLowerCase()) && (!filter || apiStatus(state, a) === filter))
  const day = (a) => eventsOf(state, { api: a.id }, state.clock - DAY, state.clock).filter((e) => e.k === 'in')
  return (
    <>
      <div className="pc-crumb">API Administration ({state.env})</div>
      <div className="pc-bar">
        <div className="pc-drop">
          <Btn kind="primary" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            Add API ▾
          </Btn>
          {menu && (
            <div className="pc-menu">
              <button type="button" onClick={() => go({ page: 'Add API' })}>
                <b>Add new API</b>
                <small>Add a new API instance and secure it with Mule Gateway.</small>
              </button>
              <button type="button" onClick={() => go({ page: 'Promote API' })}>
                <b>Promote API from environment</b>
                <small>Copy an API instance of another environment into this one.</small>
              </button>
              <button type="button" disabled title="Not part of the lab">
                <b>Import API from zip file</b>
                <small>Use a configuration exported before.</small>
              </button>
            </div>
          )}
        </div>
        <Btn onClick={() => { setInfo(true); update((s) => mark(s, `env:${s.env}`)) }}>ⓘ Environment information</Btn>
        <Select value={filter} onChange={setFilter} options={['Active', 'Inactive', 'Unregistered']} placeholder="Filter by" aria-label="Filter by" />
        <Input value={term} onChange={setTerm} placeholder="Search by API name, version or label" aria-label="Search" />
      </div>
      <Table
        heads={['Status', 'API Name', 'Version', 'Instance', 'Error Rate', 'Total Requests', 'Client Applications', 'Creation Date']}
        empty="No APIs found in this environment."
        rows={apis.map((a) => {
          const calls = day(a)
          const bad = calls.filter((e) => e.s >= 400).length
          return (
            <tr key={a.id}>
              <td>
                <Dot status={apiStatus(state, a)} />
              </td>
              <td>
                <Link onClick={() => go({ api: a.id })}>{a.name}</Link>
              </td>
              <td>{a.apiVersion}</td>
              <td>
                {a.id} {a.label}
              </td>
              <td>{calls.length ? `${((bad / calls.length) * 100).toFixed(1)}%` : 'No Data'}</td>
              <td>{calls.length}</td>
              <td>{a.contracts.filter((c) => c.status === 'approved').length}</td>
              <td>{dayText(a.t ?? 0)}</td>
            </tr>
          )
        })}
      />
      {info && (
        <Modal title="Environment information" onClose={() => setInfo(false)} foot={<Btn kind="primary" onClick={() => setInfo(false)}>Close</Btn>}>
          <dl className="pc-facts one">
            <dt>Environment</dt>
            <dd>{state.env}</dd>
            <dt>Client ID</dt>
            <dd className="pc-mono">
              {state.creds[state.env].id} <Copy text={state.creds[state.env].id} />
            </dd>
            <dt>Client Secret</dt>
            <dd className="pc-mono">
              {state.creds[state.env].secret} <Copy text={state.creds[state.env].secret} />
            </dd>
          </dl>
          <p className="pc-dim">Lab values. They are the credentials a Mule runtime uses to register its APIs in this environment.</p>
        </Modal>
      )}
    </>
  )
}

const STEPS = ['Runtime', 'API', 'Downstream', 'Upstream', 'Review']

function AddApi({ state, update, go }) {
  const groups = assetGroups(state)
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ proxy: 'basic', muleVersion: 'Mule 4', assetId: '', version: '', label: '', consumer: '', client: 'Anypoint Platform', manual: false, upstream: '' })
  const set = (patch) => setF({ ...f, ...patch })
  const group = groups.find((g) => g[0].assetId === f.assetId)
  const ready = step !== 1 || Boolean(group)
  function save() {
    update((s) => addApi(s, f))
    go({ lastApi: true })
  }
  return (
    <>
      <div className="pc-crumb">
        <Link onClick={() => go({ page: 'API Administration' })}>APIs</Link> / Add API
      </div>
      <ol className="pc-steps">
        {STEPS.map((name, i) => (
          <li key={name} className={i < step ? 'done' : i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined}>
            <i>{i < step ? '✓' : i + 1}</i> {name}
          </li>
        ))}
      </ol>
      <div className="pc-sheet">
        {step === 0 && (
          <>
            <h3>Select runtime</h3>
            <RadioCards value="mule" onChange={() => {}} options={[['omni', 'Omni Gateway', 'An API gateway for APIs running anywhere.', true], ['mule', 'Mule Gateway', 'API gateway embedded in Mule runtime. Connect directly to an existing Mule app or deploy a new proxy app.'], ['mesh', 'Service Mesh', 'Manage microservices that are not Mule.', true]]} />
            <Field label="Proxy type" required>
              <Radios name="proxy" value={f.proxy} onChange={(proxy) => set({ proxy })} options={[['basic', 'Connect to existing application (basic endpoint)', 'Connect your API to a Mule application using Autodiscovery.'], ['deploy', 'Deploy a proxy application', 'Select a deployment target and deploy a new Mule application to serve as a proxy.', true]]} />
            </Field>
            <Field label="Mule version">
              <Select value={f.muleVersion} onChange={(muleVersion) => set({ muleVersion })} options={['Mule 4', 'Mule 3']} />
            </Field>
          </>
        )}
        {step === 1 && (
          <>
            <h3>API</h3>
            <p className="pc-dim">Select the API you want to manage.</p>
            <RadioCards value="exchange" onChange={() => {}} options={[['exchange', 'Select API from Exchange'], ['new', 'Create new API', null, true]]} />
            {groups.length === 0 && <Note>There are no APIs in Exchange yet. Publish one from Design Center first.</Note>}
            <div className="pc-list" role="radiogroup" aria-label="Select API">
              {groups.map((g) => (
                <button key={g[0].assetId} type="button" role="radio" aria-checked={f.assetId === g[0].assetId} className={f.assetId === g[0].assetId ? 'on' : ''} onClick={() => set({ assetId: g[0].assetId, version: g[0].version })}>
                  <span className="pc-radio" />
                  <span>
                    {g[0].name}
                    <small>Published to Exchange: {dayText(g[0].t)}</small>
                  </span>
                </button>
              ))}
            </div>
            {group && (
              <div className="pc-pair">
                <Field label="Asset type">
                  <Select value="RAML/OAS" onChange={() => {}} options={['RAML/OAS']} />
                </Field>
                <Field label="API version">
                  {/* the API version belongs to the asset version that is chosen */}
                  <Select value={(group.find((a) => a.version === f.version) ?? group[0]).apiVersion} onChange={() => {}} options={[(group.find((a) => a.version === f.version) ?? group[0]).apiVersion]} />
                </Field>
                <Field label="Asset version">
                  <Select value={f.version} onChange={(version) => set({ version })} options={group.map((a) => [a.version, a.lifecycle === 'deprecated' ? `${a.version}, deprecated` : a.version])} />
                </Field>
              </div>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h3>Downstream</h3>
            <Field label="Instance label" hint="Tells two instances of the same API apart.">
              <Input value={f.label} onChange={(label) => set({ label })} placeholder="orders-sbx" />
            </Field>
            <Field label="Consumer endpoint">
              <Input value={f.consumer} onChange={(consumer) => set({ consumer })} placeholder="https://api.brightmart.example/orders/v1" />
            </Field>
            <Field label="Client provider" required>
              <Select value={f.client} onChange={(client) => set({ client })} options={['Anypoint Platform']} />
            </Field>
            <Check checked={f.manual} onChange={(manual) => set({ manual })}>
              Manual Approval
            </Check>
          </>
        )}
        {step === 3 && (
          <>
            <h3>Upstream</h3>
            <Field label="Upstream URL" hint="Optional for a basic endpoint.">
              <Input value={f.upstream} onChange={(upstream) => set({ upstream })} placeholder="https://orders-sapi.example/api" />
            </Field>
          </>
        )}
        {step === 4 && (
          <>
            <h3>Review</h3>
            <p className="pc-dim">Review your selections and edit them if necessary.</p>
            <dl className="pc-facts one">
              {[['Runtime', 'Mule Gateway'], ['Proxy type', 'Basic endpoint'], ['API name', group?.[0].name], ['Asset version', f.version], ['Instance label', f.label || 'none'], ['Consumer endpoint', f.consumer || 'none'], ['Upstream URL', f.upstream || 'none']].map(([k, v]) => (
                <span key={k} className="pc-fact">
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </span>
              ))}
            </dl>
          </>
        )}
      </div>
      <div className="pc-foot">
        <Btn onClick={() => go({ page: 'API Administration' })}>Cancel</Btn>
        <span className="pc-grow" />
        {step > 0 && <Btn onClick={() => setStep(step - 1)}>Previous</Btn>}
        {step < 4 ? (
          <Btn kind="primary" disabled={!ready} onClick={() => setStep(step + 1)}>
            Next
          </Btn>
        ) : (
          <Btn kind="primary" onClick={save}>
            Save & Deploy
          </Btn>
        )}
      </div>
    </>
  )
}

function Promote({ state, update, go }) {
  const other = ENVS.filter((e) => e !== state.env)
  const [env, setEnv] = useState(other[0])
  const list = state.apis.filter((a) => a.env === env)
  const [id, setId] = useState('')
  const [include, setInclude] = useState({ policies: true, tiers: true, alerts: false })
  const chosen = list.find((a) => a.id === id)
  return (
    <>
      <div className="pc-crumb">
        <Link onClick={() => go({ page: 'API Administration' })}>APIs</Link> / Promote API from environment
      </div>
      <div className="pc-sheet">
        <Field label="Source Environment">
          <Select value={env} onChange={setEnv} options={other} />
        </Field>
        <Field label="API" required>
          <Select value={id} onChange={setId} placeholder="Select an API" options={list.map((a) => [a.id, `${a.name} ${a.apiVersion}, ${a.label || a.id}`])} />
        </Field>
        <Field label="API instance label">
          <Input value={chosen?.label ?? ''} onChange={() => {}} readOnly />
        </Field>
        <div className="pc-field">
          <span className="pc-label">Include in Promotion</span>
          {[['policies', 'Policies'], ['tiers', 'SLA Tiers'], ['alerts', 'Alerts']].map(([k, label]) => (
            <Check key={k} checked={include[k]} onChange={(on) => setInclude({ ...include, [k]: on })}>
              {label}
            </Check>
          ))}
        </div>
      </div>
      <div className="pc-foot">
        <Btn onClick={() => go({ page: 'API Administration' })}>Cancel</Btn>
        <span className="pc-grow" />
        <Btn kind="primary" disabled={!chosen} onClick={() => { update((s) => promoteApi(s, id, include)); go({ lastApi: true }) }}>
          Promote
        </Btn>
      </div>
    </>
  )
}

const Clients = ({ state }) => (
  <>
    <div className="pc-crumb">Client Applications</div>
    <Table
      heads={['Application', 'Client ID', 'Contracts in this environment']}
      empty="No client applications yet. They are created with Request access in Exchange."
      rows={state.clients.map((c) => (
        <tr key={c.name}>
          <td>{c.name}</td>
          <td className="pc-mono">{c.clientId}</td>
          <td>{state.apis.filter((a) => a.env === state.env && a.contracts.some((x) => x.client === c.name)).map((a) => a.name).join(', ') || 'None'}</td>
        </tr>
      ))}
    />
  </>
)

// ---------- one instance ----------

function Instance({ api, tab, state, update, go }) {
  useEffect(() => update((s) => mark(s, `api:${api.id}`)), [api.id, update])
  const page = { 'API Summary': Summary, Alerts, Contracts, Policies, 'SLA Tiers': Tiers, Settings }[tab] ?? Summary
  const Page = page
  return (
    <>
      <div className="pc-crumb">
        <Link onClick={() => go({ page: 'API Administration' })}>API Administration ({state.env})</Link> / {api.name} ({api.version}) / {tab}
      </div>
      <div className="pc-title">
        <h2>{api.name}</h2>
        <span className="pc-version">{api.version}</span>
        {state.assets.find((a) => a.assetId === api.assetId && a.version === api.version)?.lifecycle === 'deprecated' && <span className="pc-tag pc-tag-deprecated">Deprecated</span>}
      </div>
      <p className="pc-about">
        API Status: <Dot status={apiStatus(state, api)} /> <span>Asset Version: {api.version}</span> <span>Type: RAML/OAS</span>
      </p>
      <Page api={api} state={state} update={update} go={go} />
    </>
  )
}

function Summary({ api, state, go }) {
  const b = bucketsOf(state.clock, HOUR, 20)
  const list = b.ranges.map(([f, t]) => eventsOf(state, { api: api.id }, f, t).filter((e) => e.k === 'in'))
  const one = (title, color, fn, unit) => <Chart title={title} labels={b.labels} unit={unit} series={[{ name: title, color, points: list.map(fn) }]} />
  const status = apiStatus(state, api)
  return (
    <>
      <dl className="pc-facts">
        <dt>API Instance ID</dt>
        <dd className="pc-mono">
          {api.id} <Copy text={api.id} />
        </dd>
        <dt>Autodiscovery API ID</dt>
        <dd className="pc-mono">{api.id}</dd>
        <dt>Label</dt>
        <dd>{api.label || 'none'}</dd>
        <dt>Implementation URL</dt>
        <dd>{api.upstream || 'none'}</dd>
        <dt>Consumer endpoint</dt>
        <dd>{api.consumer || 'none'}</dd>
        <dt>{api.runtime === FLEX_RUNTIME ? 'Runtime' : 'Mule runtime version'}</dt>
        <dd>{api.runtime === FLEX_RUNTIME ? `Flex Gateway ${api.gateway}, port ${api.port}, base path ${api.basePath}` : status === 'Active' ? '4.9' : 'Not connected'}</dd>
      </dl>
      {api.runtime === FLEX_RUNTIME && <Link onClick={() => go({ product: 'Flex Gateway', gateway: api.gateway, tab: 'APIs' })}>Open {api.gateway} in Flex Gateways</Link>}
      {status !== 'Active' && api.runtime !== FLEX_RUNTIME && <Note>No running application has registered this instance. The application needs the API Autodiscovery element with this ID, and the client ID and secret of {state.env}.</Note>}
      <h3 className="pc-h3">Key Metrics, last hour</h3>
      <div className="pc-charts">
        {one('Total Requests', COLORS.blue, (l) => l.length)}
        {one('Total Policy Violations', COLORS.amber, (l) => l.filter((e) => e.pol).length)}
        {one('Total Errors', COLORS.red, (l) => l.filter((e) => e.s >= 400).length)}
        {one('Average Response Time', COLORS.teal, (l) => (l.length ? Math.round(l.reduce((n, e) => n + e.ms, 0) / l.length) : null), ' ms')}
      </div>
      <Link onClick={() => go({ product: 'Monitoring', page: 'Built-in dashboards', target: `api:${api.id}` })}>View API dashboard in Monitoring</Link>
    </>
  )
}

function Contracts({ api, state, update }) {
  const [changing, setChanging] = useState(null)
  const set = (c, patch) => update((s) => setContract(s, api.id, c.client, patch))
  return (
    <>
      <Table
        heads={['Application', 'Client ID', 'Current SLA tier', 'Requested SLA tier', 'Status', '']}
        empty="No contracts. A client application asks for one with Request access in Exchange."
        rows={api.contracts.map((c) => (
          <tr key={c.client}>
            <td>{c.client}</td>
            <td className="pc-mono">{state.clients.find((x) => x.name === c.client)?.clientId}</td>
            <td>{c.tier || 'N/A'}</td>
            <td>{c.change ? c.wanted : 'N/A'}</td>
            <td>
              <Dot status={c.status} />
            </td>
            <td className="pc-acts">
              {(c.status === 'pending' || c.change) && (
                <>
                  <Btn kind="primary" onClick={() => set(c, c.change ? { tier: c.wanted, change: false, status: 'approved' } : { status: 'approved' })}>
                    Approve
                  </Btn>
                  <Btn onClick={() => set(c, c.change ? { change: false } : { status: 'rejected' })}>Reject</Btn>
                </>
              )}
              {c.status === 'approved' && !c.change && (
                <>
                  {api.tiers.length > 0 && <Btn onClick={() => setChanging(c)}>Change tier</Btn>}
                  <Btn onClick={() => set(c, { status: 'revoked' })}>Revoke</Btn>
                </>
              )}
              {c.status === 'revoked' && <Btn onClick={() => set(c, { status: 'approved' })}>Restore</Btn>}
            </td>
          </tr>
        ))}
      />
      {changing && (
        <Modal title={`Change tier of ${changing.client}`} onClose={() => setChanging(null)}>
          <div className="pc-list">
            {api.tiers.map((t) => (
              <button key={t.name} type="button" className={changing.tier === t.name ? 'on' : ''} onClick={() => { set(changing, { tier: t.name }); setChanging(null) }}>
                <span className="pc-radio" />
                <span>
                  {t.name}
                  <small>
                    {t.requests} requests per {t.periodMs / 1000} seconds
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

const UNITS = [['1000', 'Second'], ['60000', 'Minute'], ['3600000', 'Hour'], ['86400000', 'Day']]

function Tiers({ api, update }) {
  const [t, setT] = useState(null)
  const set = (patch) => setT({ ...t, ...patch })
  const errors = t ? [!t.name.trim() && 'Give the tier a name.', api.tiers.some((x) => x.name === t.name.trim()) && 'A tier with this name exists.', !(t.requests > 0) && 'The number of requests is above 0.', !(t.time > 0) && 'The time period is above 0.'].filter(Boolean) : []
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => setT({ name: '', description: '', approval: 'Manual', requests: 10, time: 1, unit: '60000' })}>
          Add SLA tier
        </Btn>
      </div>
      <Table
        heads={['Name', 'Limits', 'Applications', 'Status', 'Approval', '']}
        empty="No SLA tiers."
        rows={api.tiers.map((x) => (
          <tr key={x.name}>
            <td>{x.name}</td>
            <td>
              {x.requests} per {x.periodMs / 1000} s
            </td>
            <td>{api.contracts.filter((c) => c.tier === x.name).length}</td>
            <td>Active</td>
            <td>{x.autoApprove ? 'Auto' : 'Manual'}</td>
            <td>
              <Link disabled={api.contracts.some((c) => c.tier === x.name)} title={api.contracts.some((c) => c.tier === x.name) ? 'Applications use this tier' : undefined} onClick={() => update((s) => setApi(s, api.id, { tiers: api.tiers.filter((y) => y.name !== x.name) }))}>
                Delete
              </Link>
            </td>
          </tr>
        ))}
      />
      {t && (
        <Modal
          title="Add SLA tier"
          onClose={() => setT(null)}
          foot={
            <>
              <Btn onClick={() => setT(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={errors.length > 0} onClick={() => { update((s) => addTier(s, api.id, { name: t.name.trim(), requests: t.requests, periodMs: t.time * Number(t.unit), autoApprove: t.approval === 'Automatic' })); setT(null) }}>
                Add
              </Btn>
            </>
          }
        >
          <Field label="Name" required>
            <Input value={t.name} onChange={(name) => set({ name })} />
          </Field>
          <Field label="Approval">
            <Select value={t.approval} onChange={(approval) => set({ approval })} options={['Automatic', 'Manual']} />
          </Field>
          <div className="pc-pair">
            <Field label="# of Reqs" required>
              <Input type="number" min="1" value={t.requests} onChange={(requests) => set({ requests })} />
            </Field>
            <Field label="Time Period" required>
              <Input type="number" min="1" value={t.time} onChange={(time) => set({ time })} />
            </Field>
            <Field label="Time Unit">
              <Select value={t.unit} onChange={(unit) => set({ unit })} options={UNITS} />
            </Field>
          </div>
          <Errors list={t.name ? errors : []} />
        </Modal>
      )}
    </>
  )
}

function PolicyForm({ policy, value, onClose, onSave }) {
  const [settings, setSettings] = useState(value)
  const shown = policy.fields.filter((f) => f.type !== 'limits' && (!f.when || settings[f.when[0]] === f.when[1]))
  return (
    <Modal
      wide
      title={`Configure ${policy.name} policy`}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={() => onSave(settings)}>
            Apply
          </Btn>
        </>
      }
    >
      <p className="pc-dim">
        {policy.summary}{' '}
        <a href={docsUrl(policy)} target="_blank" rel="noreferrer">
          Docs
        </a>
      </p>
      {shown.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint}>
          {f.type === 'select' ? <Select value={settings[f.key]} onChange={(v) => setSettings({ ...settings, [f.key]: v })} options={f.options} /> : <Input type={f.type} value={settings[f.key]} onChange={(v) => setSettings({ ...settings, [f.key]: v })} />}
        </Field>
      ))}
    </Modal>
  )
}

function Policies({ api, update }) {
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(null)
  const [editing, setEditing] = useState(null)
  const [order, setOrder] = useState(false)
  const save = (policies) => update((s) => setApi(s, api.id, { policies }))
  const move = (i, by) => {
    const next = [...api.policies]
    next.splice(i + by, 0, next.splice(i, 1)[0])
    save(next)
  }
  const free = POLICIES.filter((p) => !api.policies.some((x) => x.type === p.type))
  const defaults = (p) => Object.fromEntries(p.fields.map((f) => [f.key, f.value]))
  return (
    <>
      <p className="pc-dim">Apply policies to manage security, control traffic, and improve adaptability of your APIs.</p>
      <h3 className="pc-h3">Automated policies</h3>
      <div className="pc-empty pc-boxed">No automated policies applied</div>
      <h3 className="pc-h3">API-level policies</h3>
      <div className="pc-bar">
        <Btn kind="outline" onClick={() => setPicking(true)}>
          + Add policy
        </Btn>
        {api.policies.length > 1 && <Btn onClick={() => setOrder(!order)}>{order ? 'Apply order' : 'Reorder policies'}</Btn>}
      </div>
      <ol className="pc-policies">
        {api.policies.map((p, i) => {
          const d = policyByType.get(p.type)
          return (
            <li key={p.id}>
              <span className="pc-order">{i + 1}</span>
              <span className="pc-grow">
                <b>{d.name}</b>
                <small>{d.category}. All API methods, all API resources.</small>
              </span>
              {order ? (
                <>
                  <Btn disabled={i === 0} aria-label={`Move ${d.name} up`} onClick={() => move(i, -1)}>
                    ↑
                  </Btn>
                  <Btn disabled={i === api.policies.length - 1} aria-label={`Move ${d.name} down`} onClick={() => move(i, 1)}>
                    ↓
                  </Btn>
                </>
              ) : (
                <>
                  <Btn onClick={() => setEditing(p)}>Edit configuration</Btn>
                  <Btn onClick={() => save(api.policies.filter((x) => x.id !== p.id))}>Remove policy</Btn>
                </>
              )}
            </li>
          )
        })}
        {api.policies.length === 0 && <li className="pc-empty">No API-level policies applied</li>}
      </ol>
      {picking && (
        <Modal wide title="Select a policy" onClose={() => setPicking(false)}>
          <div className="pc-grid-list">
            {free.map((p) => (
              <button key={p.type} type="button" onClick={() => { setPicking(false); setAdding(p) }}>
                <b>{p.name}</b>
                <small>{p.category}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {adding && <PolicyForm policy={flexFields(api, adding)} value={defaults(flexFields(api, adding))}onClose={() => setAdding(null)} onSave={(settings) => { update((s) => applyPolicy(s, api.id, adding.type, settings)); setAdding(null) }} />}
      {editing && <PolicyForm policy={flexFields(api, policyByType.get(editing.type))}value={editing.settings} onClose={() => setEditing(null)} onSave={(settings) => { save(api.policies.map((p) => (p.id === editing.id ? { ...p, settings } : p))); setEditing(null) }} />}
    </>
  )
}

function Alerts({ api, update }) {
  const [a, setA] = useState(null)
  const set = (patch) => setA({ ...a, ...patch })
  const errors = a ? [!a.name.trim() && 'Give the alert a name.', !a.recipients.trim() && 'Add a recipient.', a.type === 'Response Code' && a.codes.length === 0 && 'Tick a response code.', !(a.atLeast >= 1 && a.period >= 1 && a.periods >= 1) && 'The numbers are 1 or more.'].filter(Boolean) : []
  return (
    <>
      <div className="pc-bar">
        <Btn kind="primary" onClick={() => setA({ name: '', enabled: true, severity: 'Info', type: 'Request Count', codes: [500], ms: 1000, policy: 'Any', atLeast: 1, periods: 1, period: 5, recipients: 'ops@brightmart.example' })}>
          Add alert
        </Btn>
      </div>
      <Table
        heads={['Name', 'Severity', 'Type', 'Condition', 'State', 'Fired', '']}
        empty="No alerts for this API."
        rows={api.alerts.map((x) => (
          <tr key={x.id}>
            <td>{x.name}</td>
            <td>{x.severity}</td>
            <td>
              {x.type}
              {x.type === 'Response Code' && ` ${x.codes.join(', ')}`}
            </td>
            <td>
              At least {x.atLeast}, {x.periods} period(s) of {x.period} min
            </td>
            <td>
              <Dot status={x.state} />
            </td>
            <td>{x.fired ? `${x.fired}, last ${dayText(x.lastAlerted)}` : 'Never'}</td>
            <td>
              <Link onClick={() => update((s) => removeApiAlert(s, api.id, x.id))}>Delete</Link>
            </td>
          </tr>
        ))}
      />
      {a && (
        <Modal
          title="Add alert"
          onClose={() => setA(null)}
          foot={
            <>
              <Btn onClick={() => setA(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={errors.length > 0} onClick={() => { update((s) => addApiAlert(s, api.id, a)); setA(null) }}>
                Create Alert
              </Btn>
            </>
          }
        >
          <Field label="Name" required>
            <Input value={a.name} onChange={(name) => set({ name })} />
          </Field>
          <Check checked={a.enabled} onChange={(enabled) => set({ enabled })}>
            Enabled
          </Check>
          <Field label="Severity">
            <Select value={a.severity} onChange={(severity) => set({ severity })} options={RM_SEVERITIES} />
          </Field>
          <Field label="Alert type">
            <Select value={a.type} onChange={(type) => set({ type })} options={API_ALERT_TYPES} />
          </Field>
          {a.type === 'Response Code' && (
            <div className="pc-levels">
              {API_ALERT_CODES.map((c) => (
                <Check key={c} checked={a.codes.includes(c)} onChange={(on) => set({ codes: on ? [...a.codes, c] : a.codes.filter((x) => x !== c) })}>
                  {c}
                </Check>
              ))}
            </div>
          )}
          {a.type === 'Policy Violation' && (
            <Field label="Policy">
              <Select value={a.policy} onChange={(policy) => set({ policy })} options={['Any', ...api.policies.map((p) => policyByType.get(p.type).name)]} />
            </Field>
          )}
          {a.type === 'Response Time' && (
            <Field label="Response time above (ms)">
              <Input type="number" min="1" value={a.ms} onChange={(ms) => set({ ms })} />
            </Field>
          )}
          <div className="pc-pair">
            <Field label="Occurrences, at least">
              <Input type="number" min="1" value={a.atLeast} onChange={(atLeast) => set({ atLeast })} />
            </Field>
            <Field label="For at least (periods)">
              <Input type="number" min="1" value={a.periods} onChange={(periods) => set({ periods })} />
            </Field>
            <Field label="Consecutive period of (minutes)">
              <Input type="number" min="1" value={a.period} onChange={(period) => set({ period })} />
            </Field>
          </div>
          <Field label="Recipients" required hint="The first goes in To, the others in CC.">
            <Input value={a.recipients} onChange={(recipients) => set({ recipients })} />
          </Field>
          <Errors list={a.name ? errors : []} />
        </Modal>
      )}
    </>
  )
}

function DeleteApi({ api, state, update, go, onClose }) {
  const paired = pairedApps(state, api)
  const running = paired.filter((a) => a.status === 'Running')
  return (
    <Modal
      title="Delete API"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="danger" onClick={() => { go({ page: 'API Administration' }); update((s) => deleteApi(s, api.id)) }}>
            {paired.length ? 'Delete anyway' : 'Delete'}
          </Btn>
        </>
      }
    >
      <p>
        Delete {api.name} {api.version} ({api.label || api.id}) in {api.env}? This cannot be undone.
      </p>
      <ul className="pc-steps">
        <li>
          {api.contracts.length} contract{api.contracts.length === 1 ? '' : 's'}, {api.policies.length} polic{api.policies.length === 1 ? 'y' : 'ies'}, {api.tiers.length} SLA tier{api.tiers.length === 1 ? '' : 's'} and {api.alerts.length} alert{api.alerts.length === 1 ? '' : 's'} are deleted with the instance.
        </li>
        {paired.length === 0 && <li>No application is paired to this instance by API Autodiscovery.</li>}
      </ul>
      {paired.length > 0 && (
        <p className="pc-errors" role="alert">
          {paired.map((a) => a.name).join(', ')} {paired.length === 1 ? 'is' : 'are'} paired to API ID {api.id} by API Autodiscovery. After the delete the gateway cannot track the ID, blocks the API and answers 503 to every request.
          {running.length > 0 ? ' Running applications are affected at once.' : ''} Point the application at another instance, or remove its Autodiscovery, to make it answer again.
        </p>
      )}
    </Modal>
  )
}

function Settings({ api, state, update, go }) {
  const [f, setF] = useState({ label: api.label, consumer: api.consumer, upstream: api.upstream })
  const [version, setVersion] = useState(api.version)
  const [said, setSaid] = useState('')
  const [deleting, setDeleting] = useState(false)
  // the platform offers only the versions of the same major; another major needs a new instance
  const versions = state.assets.filter((a) => a.assetId === api.assetId && sameMajor(a.version, api.version)).map((a) => [a.version, a.lifecycle === 'deprecated' ? `${a.version}, deprecated` : a.version])
  const save = () => {
    update((s) => setApi(version === api.version ? s : reviseApi(s, api.id, version), api.id, f))
    setSaid('Saved.')
  }
  return (
    <>
      <div className="pc-sheet">
        <Field label="API Instance ID">
          <Input value={api.id} onChange={() => {}} readOnly />
        </Field>
        <Field label="Asset version">
          <Select value={version} onChange={setVersion} options={versions.length ? versions : [api.version]} />
          <small className="pc-hint">Only versions of the same major are offered. A new major version needs its own API instance.</small>
        </Field>
        <Field label="Instance label">
          <Input value={f.label} onChange={(label) => setF({ ...f, label })} />
        </Field>
        <Field label="Consumer endpoint">
          <Input value={f.consumer} onChange={(consumer) => setF({ ...f, consumer })} />
        </Field>
        <Field label="Upstream URL">
          <Input value={f.upstream} onChange={(upstream) => setF({ ...f, upstream })} />
        </Field>
        <Check checked={api.mule4} disabled onChange={() => {}}>
          Check this box if you are managing this API in Mule 4 or above.
        </Check>
      </div>
      <div className="pc-foot">
        <span className="pc-dim pc-grow" aria-live="polite">
          {said}
        </span>
        <Btn kind="danger" onClick={() => setDeleting(true)}>
          Delete API
        </Btn>
        <Btn kind="primary" onClick={save}>
          Save
        </Btn>
      </div>
      {deleting && <DeleteApi api={api} state={state} update={update} go={go} onClose={() => setDeleting(false)} />}
    </>
  )
}

