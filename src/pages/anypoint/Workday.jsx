// Workday: the Brightmart tenant brightmart1, as an integration developer (kbrand) sees it. The search box finds tasks and
// workers the way the Workday search does. Workers shows the profile with the business process history, where the
// effective date and the completed date of each event can differ. Custom reports keeps the reports with their prompts,
// Enable As Web Service, sharing and the RaaS URL. Integration system users, Security groups (domain security policies
// with Get and Put, pending until activated) and Password rules hold the account side. Integration events lists every
// RaaS and SOAP request of the apps, and Signons the web service sign ons with the reason of a failure. The rules live in
// lab/platform-workday.js.
import { useEffect, useState } from 'react'
import { mark, timeText } from '../../lab/platform.js'
import {
  activatePending, activeCount, addPrompt, changeEmail, createGroup, createIsu, createReport, DOMAIN_LIST, editIsu, editReport, expiresAt, FIELDS, GROUP_TYPE, groupsOf, hireWorker, isFilled, jobName, locName, raasUrl, removePrompt, SCREEN_USER,
  setMembers, setPasswordRules, setPermissions, shortTime, soapUrl, SOURCES, statusOf, testReport, upgradeWorkday, wdDate, widOf, wsdlUrl,
} from '../../lab/platform-workday.js'
import { Btn, Check, Field, Input, Link, Note, Select, SideNav, Table, Tabs } from './parts.jsx'

const VIEWS = ['Home', 'Workers', 'Business processes', 'Custom reports', 'Integration system users', 'Security groups', 'Password rules', 'Reference IDs', 'Integration events', 'Signons']
const SEEN = { Workers: 'wd:workers', 'Business processes': 'wd:bp', 'Custom reports': 'wd:reports', 'Integration system users': 'wd:isu', 'Security groups': 'wd:groups', 'Password rules': 'wd:rules', 'Reference IDs': 'wd:refs', 'Integration events': 'wd:events', Signons: 'wd:signons' }
// the tasks the search box knows, with the view that does them
const TASKS = [
  ['Find Workers', 'Workers'],
  ['Change Contact Information', 'Workers'],
  ['Business Processes', 'Business processes'],
  ['Hire Employee', 'Business processes'],
  ['Create Custom Report', 'Custom reports'],
  ['Edit Custom Report', 'Custom reports'],
  ['Create Integration System User', 'Integration system users'],
  ['Edit Integration System User', 'Integration system users'],
  ['Create Security Group', 'Security groups'],
  ['Maintain Permissions for Security Group', 'Security groups'],
  ['Activate Pending Security Policy Changes', 'Security groups'],
  ['Maintain Password Rules', 'Password rules'],
  ['View Reference IDs', 'Reference IDs'],
  ['Integration Events', 'Integration events'],
  ['Signons and Attempted Signons', 'Signons'],
]
const Msg = ({ m }) => m && <p className={m.ok ? 'wd-ok' : 'wd-err'} role="status">{m.text}</p>
const Status = ({ s }) => <span className={`wd-tag wd-${s === 'Active' || s === 'Completed' || s === true ? 'good' : s === 'Pre-Hire' ? 'wait' : 'bad'}`}>{s === true ? 'Completed' : s === false ? 'Failed' : s}</span>
const secs = (ms) => (ms === undefined ? '' : `${(ms / 1000).toFixed(1)} s`)

export default function Workday({ state, update, place, go }) {
  const y = state.workday
  const view = VIEWS.includes(place?.view) ? place.view : 'Home'
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  // a save from before Workday was built, or the open console, holds a placeholder: build the tenant on first open
  useEffect(() => {
    if (y && !isFilled(y)) update((s) => upgradeWorkday(s))
  }, [y, update])
  useEffect(() => {
    if (!isFilled(y)) return
    const key = view === 'Workers' && place?.worker ? `wd:worker:${place.worker}` : view === 'Custom reports' && place?.report ? `wd:report:${place.report}` : null
    update((s) => {
      let n = SEEN[view] ? mark(s, SEEN[view]) : s
      if (key) n = mark(n, key)
      return n
    })
  }, [view, place?.worker, place?.report, Boolean(isFilled(y))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>Workday</h2>
        <p className="pc-empty pc-boxed">This lab has no Workday tenant.</p>
      </main>
    )
  if (!isFilled(y)) return <main className="pc-main">Starting Workday...</main>

  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const open = (v, extra = {}) => {
    setFound(null)
    go({ view: v, ...extra })
  }
  const search = (e) => {
    e.preventDefault()
    const q = query.trim().toLowerCase()
    if (!q) return setFound(null)
    const tasks = TASKS.filter(([t]) => t.toLowerCase().includes(q))
    const people = Object.entries(y.workers).filter(([id, x]) => id.includes(q) || x.name.toLowerCase().includes(q))
    setFound({ q: query.trim(), tasks, people })
  }
  const props = { y, state, act, go, open }
  return (
    <>
      <SideNav items={[{ title: 'Workday' }, ...VIEWS.map((v) => [v, v])]} value={view} onPick={(v) => open(v)} />
      <main className="pc-main wd-main">
        <header className="wd-bar">
          <b className="wd-logo">workday.</b>
          <form className="wd-search" onSubmit={search} role="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks and workers" aria-label="Search" />
            <button type="submit">Search</button>
          </form>
          <span className="wd-who">
            Tenant {y.tenant} | {SCREEN_USER} | {timeText(state.clock)}
          </span>
        </header>
        {found ? (
          <Found found={found} open={open} />
        ) : (
          <>
            {view === 'Home' && <Home {...props} />}
            {view === 'Workers' && (place?.worker && y.workers[place.worker] ? <Profile key={place.worker} {...props} id={place.worker} /> : <Workers {...props} />)}
            {view === 'Business processes' && <Processes {...props} />}
            {view === 'Custom reports' && (place?.report && y.reports[place.report] ? <Report key={place.report} {...props} r={y.reports[place.report]} /> : <Reports {...props} />)}
            {view === 'Integration system users' && <Isus {...props} />}
            {view === 'Security groups' && <Groups {...props} />}
            {view === 'Password rules' && <Rules {...props} />}
            {view === 'Reference IDs' && <Refs y={y} />}
            {view === 'Integration events' && <Events y={y} />}
            {view === 'Signons' && <Signons y={y} />}
          </>
        )}
      </main>
    </>
  )
}

function Found({ found, open }) {
  return (
    <section>
      <h2>Search results for {found.q}</h2>
      {!found.tasks.length && !found.people.length && <p className="pc-empty pc-boxed">No tasks or workers match.</p>}
      {found.tasks.length > 0 && (
        <>
          <h3>Tasks and reports</h3>
          <ul className="wd-list">
            {found.tasks.map(([t, v]) => (
              <li key={t}>
                <Link onClick={() => open(v)}>{t}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {found.people.length > 0 && (
        <>
          <h3>People</h3>
          <ul className="wd-list">
            {found.people.map(([id, x]) => (
              <li key={id}>
                <Link onClick={() => open('Workers', { worker: id })}>
                  {x.name} ({id})
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Home({ y, state, open }) {
  const t = state.clock
  const recent = [...y.log].reverse().slice(0, 5)
  return (
    <>
      <h2>Home</h2>
      <div className="wd-tiles">
        <button type="button" className="wd-tile" onClick={() => open('Workers')}>
          <b>{activeCount(y, t).toLocaleString('en-US')}</b>
          <span>Active workers</span>
        </button>
        <button type="button" className="wd-tile" onClick={() => open('Custom reports')}>
          <b>{Object.keys(y.reports).length}</b>
          <span>Custom reports</span>
        </button>
        <button type="button" className="wd-tile" onClick={() => open('Integration system users')}>
          <b>{Object.keys(y.isus).length}</b>
          <span>Integration system users</span>
        </button>
        <button type="button" className="wd-tile" onClick={() => open('Security groups')}>
          <b>{y.pending.length}</b>
          <span>Pending security policy changes</span>
        </button>
      </div>
      <h3>Latest integration events</h3>
      <Table
        heads={['Time', 'User', 'Request', 'Status', 'Message']}
        rows={recent.map((e, i) => (
          <tr key={i}>
            <td>{shortTime(e.t)}</td>
            <td>{e.user}</td>
            <td>
              {e.kind} {e.op}
            </td>
            <td>
              <Status s={e.ok} />
            </td>
            <td>{e.msg}</td>
          </tr>
        ))}
        empty="No web service requests yet."
      />
      <Note>Type a task such as Create Integration System User or a worker name in the search box.</Note>
    </>
  )
}

// ---------- workers ----------

function Workers({ y, state, go }) {
  const [f, setF] = useState('')
  const t = state.clock
  const list = Object.entries(y.workers).filter(([id, x]) => !f || id.includes(f) || x.name.toLowerCase().includes(f.toLowerCase()))
  const total = activeCount(y, t)
  const stored = Object.values(y.workers).filter((x) => statusOf(x, t) === 'Active').length
  return (
    <>
      <h2>Find Workers</h2>
      <p className="wd-count">
        Active workers: <b>{total.toLocaleString('en-US')}</b>
      </p>
      <p className="pc-dim">The list shows the named workers. The other {(total - stored).toLocaleString('en-US')} active workers are counted and reported but not listed in the lab.</p>
      <Field label="Name or Employee ID">
        <Input value={f} onChange={setF} aria-label="Filter workers" />
      </Field>
      <Table
        heads={['Worker', 'Employee ID', 'Status', 'Job profile', 'Location', 'Hire date', 'Termination date', 'Last updated']}
        rows={list.map(([id, x]) => (
          <tr key={id}>
            <td>
              <Link onClick={() => go({ view: 'Workers', worker: id })}>{x.name}</Link>
            </td>
            <td>{id}</td>
            <td>
              <Status s={statusOf(x, t)} />
            </td>
            <td>{jobName(y, x.job)}</td>
            <td>{locName(y, x.loc)}</td>
            <td>{wdDate(x.hire)}</td>
            <td>{x.term === null || x.term === undefined ? '' : wdDate(x.term)}</td>
            <td>{shortTime(x.upd)}</td>
          </tr>
        ))}
      />
    </>
  )
}

function Profile({ y, state, act, go, id }) {
  const x = y.workers[id]
  const [tab, setTab] = useState('Job')
  const [email, setEmail] = useState(x.email ?? '')
  const [m, setM] = useState(null)
  const t = state.clock
  const events = y.events.filter((e) => e.worker === id).reverse()
  return (
    <>
      <Link onClick={() => go({ view: 'Workers' })}>← Find Workers</Link>
      <div className="wd-person">
        <span className="wd-avatar" aria-hidden="true">
          {x.name
            .split(' ')
            .map((p) => p[0])
            .join('')}
        </span>
        <div>
          <h2>{x.name}</h2>
          <p>
            {jobName(y, x.job)} | {locName(y, x.loc)} | Employee ID {id} | <Status s={statusOf(x, t)} />
          </p>
        </div>
      </div>
      <Tabs tabs={['Job', 'Contact', 'Business Process']} value={tab} onChange={setTab} />
      {tab === 'Job' && (
        <dl className="wd-dl">
          <dt>Job profile</dt>
          <dd>{jobName(y, x.job)}</dd>
          <dt>Location</dt>
          <dd>{locName(y, x.loc)}</dd>
          <dt>Supervisory organization</dt>
          <dd>{x.org}</dd>
          <dt>Hire date</dt>
          <dd>{wdDate(x.hire)}</dd>
          <dt>Termination date</dt>
          <dd>{x.term === null || x.term === undefined ? 'None' : wdDate(x.term)}</dd>
          <dt>Last functionally updated</dt>
          <dd>{shortTime(x.upd)}</dd>
        </dl>
      )}
      {tab === 'Contact' && (
        <section className="wd-card">
          <p>
            Work email: <b>{x.email || 'None'}</b>
          </p>
          <h3>Change Contact Information</h3>
          <Field label="Work email" hint="Leave it empty to remove the work email.">
            <Input value={email} onChange={setEmail} aria-label="Work email" />
          </Field>
          <Btn kind="primary" onClick={() => setM(act((s) => changeEmail(s, id, email)))}>
            Submit
          </Btn>
          <Msg m={m} />
        </section>
      )}
      {tab === 'Business Process' && (
        <>
          <p className="pc-dim">The effective date is when the event takes effect. Completed on is the moment it was entered and approved. A future dated event is completed before it is effective; a back dated one after.</p>
          <Table
            heads={['Business process', 'Effective date', 'Completed on', 'Initiated by', 'Status', 'Details']}
            rows={events.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.type} <small className="pc-dim">{e.id}</small>
                </td>
                <td>{wdDate(e.eff)}</td>
                <td>{shortTime(e.done)}</td>
                <td>{e.by}</td>
                <td>{e.done > t ? 'In Progress' : e.status}</td>
                <td>{e.text}</td>
              </tr>
            ))}
            empty="No business processes for this worker in the lab."
          />
        </>
      )}
    </>
  )
}

function Processes({ y, state, act, open }) {
  const [type, setType] = useState('')
  const blank = { first: '', last: '', job: '', loc: '', email: '', hireDate: wdDate(state.clock) }
  const [form, setForm] = useState(null)
  const [m, setM] = useState(null)
  const list = [...y.events].reverse().filter((e) => !type || e.type === type)
  const hire = () => {
    const r = act((s) => hireWorker(s, form))
    setM(r)
    if (r.ok) setForm(null)
  }
  return (
    <>
      <h2>Business Processes</h2>
      {!form && (
        <Btn kind="primary" onClick={() => (setM(null), setForm(blank))}>
          Hire Employee
        </Btn>
      )}
      {form && (
        <section className="wd-card" aria-label="Hire Employee">
          <h3>Hire Employee</h3>
          <div className="pc-pair">
            <Field label="Legal first name" required>
              <Input value={form.first} onChange={(first) => setForm({ ...form, first })} aria-label="Legal first name" />
            </Field>
            <Field label="Legal last name" required>
              <Input value={form.last} onChange={(last) => setForm({ ...form, last })} aria-label="Legal last name" />
            </Field>
          </div>
          <div className="pc-pair">
            <Field label="Job profile" required>
              <Select value={form.job} onChange={(job) => setForm({ ...form, job })} placeholder="Choose a job profile" options={Object.entries(y.jobs).map(([k, v]) => [k, v])} />
            </Field>
            <Field label="Location" required>
              <Select value={form.loc} onChange={(loc) => setForm({ ...form, loc })} placeholder="Choose a location" options={Object.entries(y.locations).map(([k, v]) => [k, v])} />
            </Field>
          </div>
          <div className="pc-pair">
            <Field label="Work email" hint="Optional. It can be added later with Change Contact Information.">
              <Input value={form.email} onChange={(email) => setForm({ ...form, email })} aria-label="Work email" />
            </Field>
            <Field label="Hire date" hint="2026-11-03">
              <input className="pc-input" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} aria-label="Hire date" />
            </Field>
          </div>
          <p className="pc-dim">The next free Employee ID is given on Submit. The worker is active from the hire date.</p>
          <Btn kind="primary" onClick={hire}>
            Submit
          </Btn>{' '}
          <Btn onClick={() => setForm(null)}>Cancel</Btn>
        </section>
      )}
      <Msg m={m} />
      <Field label="Business process type">
        <Select value={type} onChange={setType} placeholder="All" options={['Hire', 'Terminate', 'Change Job', 'Contact Change']} />
      </Field>
      <Table
        heads={['Event', 'Business process', 'Worker', 'Effective date', 'Completed on', 'Initiated by', 'Details']}
        rows={list.map((e) => (
          <tr key={e.id}>
            <td>{e.id}</td>
            <td>{e.type}</td>
            <td>
              <Link onClick={() => open('Workers', { worker: e.worker })}>{y.workers[e.worker]?.name ?? e.worker}</Link>
            </td>
            <td>{wdDate(e.eff)}</td>
            <td>{shortTime(e.done)}</td>
            <td>{e.by}</td>
            <td>{e.text}</td>
          </tr>
        ))}
        empty="No business process events in the lab."
      />
    </>
  )
}

// ---------- custom reports ----------

function Reports({ y, act, go }) {
  const [form, setForm] = useState(null)
  const [m, setM] = useState(null)
  const create = () => {
    const r = act((s) => createReport(s, form))
    setM(r)
    if (r.ok) {
      setForm(null)
      go({ view: 'Custom reports', report: form.name.trim() })
    }
  }
  return (
    <>
      <div className="pc-title">
        <h2>Custom reports</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm({ name: '', source: 'All Active Workers' }), setM(null))}>
            Create Custom Report
          </Btn>
        )}
      </div>
      {form && (
        <section className="wd-card">
          <h3>Create Custom Report</h3>
          <div className="wd-grid">
            <Field label="Report name" required hint="A report for a web service has letters, digits and _ only.">
              <Input value={form.name} onChange={(name) => setForm({ ...form, name })} aria-label="Report name" />
            </Field>
            <Field label="Data source">
              <Select value={form.source} onChange={(source) => setForm({ ...form, source })} options={Object.keys(SOURCES)} />
            </Field>
          </div>
          <div className="wd-row">
            <Btn kind="primary" onClick={create}>
              Create
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      <Msg m={m} />
      <Table
        heads={['Report name', 'Owner', 'Data source', 'Web service', 'Prompts', 'Shared with']}
        rows={Object.values(y.reports).map((r) => (
          <tr key={r.name}>
            <td>
              <Link onClick={() => go({ view: 'Custom reports', report: r.name })}>{r.name}</Link>
            </td>
            <td>{r.owner}</td>
            <td>{r.source}</td>
            <td>{r.ws ? 'Enabled' : 'No'}</td>
            <td>{r.prompts.map((p) => p.name).join(', ') || 'None'}</td>
            <td>{r.share.join(', ') || 'Owner only'}</td>
          </tr>
        ))}
      />
    </>
  )
}

function Report({ y, act, go, r }) {
  const src = SOURCES[r.source]
  const [def, setDef] = useState({ fields: r.fields, ws: r.ws, share: r.share })
  const [m, setM] = useState(null)
  const [pf, setPf] = useState({ name: '', field: src.dates[0], op: 'from' })
  const [params, setParams] = useState({})
  const [test, setTest] = useState(null)
  const toggle = (list, v, on) => (on ? [...list, v] : list.filter((x) => x !== v))
  const example = `${raasUrl(r)}${r.prompts.map((p) => `&${p.name}=${p.op === 'from' ? '2026-11-02T00:00:00.000+00:00' : '2026-11-03T00:00:00.000+00:00'}`).join('')}`
  return (
    <>
      <Link onClick={() => go({ view: 'Custom reports' })}>← Custom reports</Link>
      <h2>{r.name}</h2>
      <p className="pc-dim">
        Owner {r.owner}. Data source {r.source}, secured by the domain {src.domain}.
      </p>
      <section className="wd-card">
        <h3>Definition</h3>
        <fieldset className="wd-fields">
          <legend>Fields</legend>
          {src.fields.map((f) => (
            <Check key={f} checked={def.fields.includes(f)} onChange={(on) => setDef({ ...def, fields: toggle(def.fields, f, on) })}>
              {f} <small className="pc-dim">{FIELDS[f]}</small>
            </Check>
          ))}
        </fieldset>
        <Check checked={def.ws} onChange={(ws) => setDef({ ...def, ws })}>
          Enable As Web Service
        </Check>
        <fieldset className="wd-fields">
          <legend>Share with these security groups</legend>
          {Object.keys(y.groups).map((g) => (
            <Check key={g} checked={def.share.includes(g)} onChange={(on) => setDef({ ...def, share: toggle(def.share, g, on) })}>
              {g}
            </Check>
          ))}
        </fieldset>
        <Btn kind="primary" onClick={() => setM(act((s) => editReport(s, r.name, def)))}>
          Save
        </Btn>
        <Msg m={m} />
      </section>
      <section className="wd-card">
        <h3>Prompts</h3>
        <p className="pc-dim">Each prompt filters a date field. A web service caller passes it as a query parameter; a prompt that is not passed does not filter.</p>
        <Table
          heads={['Prompt name', 'Field', 'Bound', '']}
          rows={r.prompts.map((p) => (
            <tr key={p.name}>
              <td>{p.name}</td>
              <td>{p.field}</td>
              <td>{p.op === 'from' ? 'From' : 'To'}</td>
              <td>
                <Link onClick={() => setM(act((s) => removePrompt(s, r.name, p.name)))}>Remove</Link>
              </td>
            </tr>
          ))}
          empty="No prompts. The report returns every row."
        />
        <div className="wd-grid">
          <Field label="Prompt name">
            <Input value={pf.name} onChange={(name) => setPf({ ...pf, name })} aria-label="Prompt name" />
          </Field>
          <Field label="Field">
            <Select value={pf.field} onChange={(field) => setPf({ ...pf, field })} options={src.dates} />
          </Field>
          <Field label="Bound">
            <Select
              value={pf.op}
              onChange={(op) => setPf({ ...pf, op })}
              options={[
                ['from', 'From'],
                ['to', 'To'],
              ]}
            />
          </Field>
        </div>
        <Btn
          onClick={() => {
            const res = act((s) => addPrompt(s, r.name, pf))
            setM(res)
            if (res.ok) setPf({ ...pf, name: '' })
          }}
        >
          Add prompt
        </Btn>
      </section>
      <section className="wd-card">
        <h3>Web service URLs</h3>
        {!r.ws && <p className="wd-err">Enable As Web Service is off, so these URLs answer 404.</p>}
        <dl className="wd-dl">
          <dt>REST (JSON)</dt>
          <dd>
            <code>{raasUrl(r)}</code>
          </dd>
          <dt>With prompts</dt>
          <dd>
            <code>{example}</code>
          </dd>
          <dt>WSDL</dt>
          <dd>
            <code>{wsdlUrl(r)}</code>
          </dd>
          <dt>SOAP web services</dt>
          <dd>
            <code>{soapUrl()}</code>
          </dd>
        </dl>
      </section>
      <section className="wd-card">
        <h3>Test</h3>
        <p className="pc-dim">Runs the report as {SCREEN_USER}, who sees every field. An ISU sees only the fields of the domains its groups have.</p>
        <div className="wd-grid">
          {r.prompts.map((p) => (
            <Field key={p.name} label={p.name} hint="2026-11-03 or 2026-11-03T09:00:00">
              <input className="pc-input" value={params[p.name] ?? ''} onChange={(e) => setParams({ ...params, [p.name]: e.target.value })} aria-label={p.name} />
            </Field>
          ))}
        </div>
        <Btn onClick={() => setTest(act((s) => testReport(s, r.name, params)))}>Run</Btn>
        {test && !test.ok && <p className="wd-err">{test.text}</p>}
        {test?.ok && (
          <>
            <p>
              {test.total.toLocaleString('en-US')} rows in {secs(test.ms)}. The first {test.rows.length}:
            </p>
            <Table heads={r.fields} rows={test.rows.map((row, i) => <tr key={i}>{r.fields.map((f) => <td key={f}>{row[f] ?? ''}</td>)}</tr>)} empty="No rows." />
          </>
        )}
      </section>
    </>
  )
}

// ---------- integration system users and security ----------

function Isus({ y, state, act }) {
  const [form, setForm] = useState(null)
  const [m, setM] = useState(null)
  const save = () => {
    const r = act((s) => (form.edit ? editIsu(s, form.user, form) : createIsu(s, form)))
    setM(r)
    if (r.ok) setForm(null)
  }
  return (
    <>
      <div className="pc-title">
        <h2>Integration system users</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm({ user: '', password: '', requireNew: false, noUi: true, timeout: '0' }), setM(null))}>
            Create Integration System User
          </Btn>
        )}
      </div>
      {form && (
        <section className="wd-card">
          <h3>{form.edit ? `Edit Integration System User ${form.user}` : 'Create Integration System User'}</h3>
          <div className="wd-grid">
            {!form.edit && (
              <Field label="User Name" required>
                <Input value={form.user} onChange={(user) => setForm({ ...form, user })} aria-label="User Name" />
              </Field>
            )}
            <Field label={form.edit ? 'New Password' : 'Password'} required={!form.edit} hint={form.edit ? 'Leave it empty to keep the password.' : 'At least 8 characters.'}>
              <Input type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} aria-label={form.edit ? 'New Password' : 'Password'} autoComplete="new-password" />
            </Field>
            <Field label="Session Timeout Minutes" hint="0 means no timeout.">
              <input className="pc-input" value={form.timeout} onChange={(e) => setForm({ ...form, timeout: e.target.value })} aria-label="Session Timeout Minutes" />
            </Field>
          </div>
          <Check checked={form.requireNew} onChange={(requireNew) => setForm({ ...form, requireNew })}>
            Require New Password at Next Sign In
          </Check>
          <Check checked={form.noUi} onChange={(noUi) => setForm({ ...form, noUi })}>
            Do Not Allow UI Sessions
          </Check>
          <div className="wd-row">
            <Btn kind="primary" onClick={save}>
              OK
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      <Msg m={m} />
      <Table
        heads={['User Name', 'Do Not Allow UI Sessions', 'Require New Password', 'Password set', 'Password expires', 'Security groups', '']}
        rows={Object.entries(y.isus).map(([u, x]) => {
          const exp = expiresAt(y, u)
          return (
            <tr key={u}>
              <td>{u}</td>
              <td>{x.noUi ? 'Yes' : 'No'}</td>
              <td>{x.requireNew ? 'Yes' : 'No'}</td>
              <td>{shortTime(x.set)}</td>
              <td className={exp !== null && exp <= state.clock ? 'wd-bad' : ''}>{exp === null ? 'Exempt' : `${shortTime(exp)}${exp <= state.clock ? ' (expired)' : ''}`}</td>
              <td>{groupsOf(y, u).join(', ') || 'None'}</td>
              <td>
                <Link onClick={() => (setForm({ edit: true, user: u, password: '', requireNew: x.requireNew, noUi: x.noUi, timeout: String(x.timeout ?? 0) }), setM(null))}>Edit</Link>
              </td>
            </tr>
          )
        })}
      />
    </>
  )
}

function Groups({ y, act }) {
  const [form, setForm] = useState(null)
  const [m, setM] = useState(null)
  const [comment, setComment] = useState('')
  const create = () => {
    const r = act((s) => createGroup(s, form))
    setM(r)
    if (r.ok) setForm(null)
  }
  return (
    <>
      <div className="pc-title">
        <h2>Security groups</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm({ name: '', members: [] }), setM(null))}>
            Create Security Group
          </Btn>
        )}
      </div>
      {form && (
        <section className="wd-card">
          <h3>Create Security Group</h3>
          <div className="wd-grid">
            <Field label="Name" required>
              <Input value={form.name} onChange={(name) => setForm({ ...form, name })} aria-label="Name" />
            </Field>
            <Field label="Type of Tenanted Security Group">
              <input className="pc-input" value={GROUP_TYPE} readOnly aria-label="Type of Tenanted Security Group" />
            </Field>
          </div>
          <fieldset className="wd-fields">
            <legend>Integration System Users</legend>
            {Object.keys(y.isus).map((u) => (
              <Check key={u} checked={form.members.includes(u)} onChange={(on) => setForm({ ...form, members: on ? [...form.members, u] : form.members.filter((x) => x !== u) })}>
                {u}
              </Check>
            ))}
          </fieldset>
          <div className="wd-row">
            <Btn kind="primary" onClick={create}>
              OK
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      <Msg m={m} />
      <section className={`wd-card ${y.pending.length ? 'wd-pending' : ''}`}>
        <h3>Activate Pending Security Policy Changes</h3>
        {y.pending.length ? (
          <ul className="wd-list">
            {y.pending.map((p) => (
              <li key={p.group + p.domain}>
                {p.group}: {p.domain}, {p.perms.length ? p.perms.join(' and ') : 'no access'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pc-dim">No pending changes. Changes to domain security policies wait here until they are activated.</p>
        )}
        <Field label="Comment">
          <Input value={comment} onChange={setComment} aria-label="Comment" />
        </Field>
        <Btn
          kind="primary"
          onClick={() => {
            const r = act((s) => activatePending(s, comment))
            setM(r)
            if (r.ok) setComment('')
          }}
        >
          Activate
        </Btn>
        {y.activations.length > 0 && <p className="pc-dim">Last activated {shortTime(y.activations.at(-1).t)}: {y.activations.at(-1).comment}</p>}
      </section>
      {Object.entries(y.groups).map(([name, g]) => (
        <GroupCard key={name} y={y} name={name} g={g} act={act} setM={setM} />
      ))}
    </>
  )
}

function GroupCard({ y, name, g, act, setM }) {
  const pendingOf = (d) => y.pending.find((p) => p.group === name && p.domain === d)
  const [members, setMembersState] = useState(g.members)
  const [perms, setPerms] = useState(() => Object.fromEntries(DOMAIN_LIST.map((d) => [d, pendingOf(d)?.perms ?? g.domains[d] ?? []])))
  const flip = (d, p, on) => {
    let next = on ? [...new Set([...perms[d], p])] : perms[d].filter((x) => x !== p)
    if (p === 'Put' && on) next = ['Get', 'Put']
    if (p === 'Get' && !on) next = []
    setPerms({ ...perms, [d]: next })
  }
  // every changed domain in one action: act starts from the state of this render, so one act per domain would keep
  // only the last change
  const save = () => {
    const changed = DOMAIN_LIST.filter((d) => [...perms[d]].sort().join() !== [...(pendingOf(d)?.perms ?? g.domains[d] ?? [])].sort().join())
    if (!changed.length) return setM({ ok: true, text: 'Nothing changed.' })
    setM(
      act((s) => {
        let r = { state: s, result: null }
        for (const d of changed) r = setPermissions(r.state, name, d, perms[d])
        return r
      }),
    )
  }
  return (
    <section className="wd-card">
      <h3>{name}</h3>
      <p className="pc-dim">{g.type}</p>
      <fieldset className="wd-fields">
        <legend>Members</legend>
        {Object.keys(y.isus).map((u) => (
          <Check key={u} checked={members.includes(u)} onChange={(on) => setMembersState(on ? [...members, u] : members.filter((x) => x !== u))}>
            {u}
          </Check>
        ))}
      </fieldset>
      <Btn onClick={() => setM(act((s) => setMembers(s, name, members)))}>Save members</Btn>
      <h4>Domain security policies</h4>
      <Table
        heads={['Domain', 'Get', 'Put', 'Active now']}
        rows={DOMAIN_LIST.map((d) => (
          <tr key={d}>
            <td>
              {d} {pendingOf(d) && <span className="wd-tag wd-wait">Pending</span>}
            </td>
            <td>
              <input type="checkbox" checked={perms[d].includes('Get')} onChange={(e) => flip(d, 'Get', e.target.checked)} aria-label={`Get on ${d} for ${name}`} />
            </td>
            <td>
              <input type="checkbox" checked={perms[d].includes('Put')} onChange={(e) => flip(d, 'Put', e.target.checked)} aria-label={`Put on ${d} for ${name}`} />
            </td>
            <td>{(g.domains[d] ?? []).join(', ') || 'None'}</td>
          </tr>
        ))}
      />
      <Btn kind="primary" onClick={save}>
        Save permissions
      </Btn>
    </section>
  )
}

function Rules({ y, act }) {
  const [days, setDays] = useState(String(y.rules.expiryDays))
  const [exempt, setExempt] = useState(y.rules.exempt)
  const [m, setM] = useState(null)
  return (
    <>
      <h2>Maintain Password Rules</h2>
      <section className="wd-card">
        <Field label="Password expiration days" hint="0 means passwords do not expire.">
          <input className="pc-input" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Password expiration days" />
        </Field>
        <fieldset className="wd-fields">
          <legend>System Users exempt from password expiration</legend>
          {Object.keys(y.isus).map((u) => (
            <Check key={u} checked={exempt.includes(u)} onChange={(on) => setExempt(on ? [...exempt, u] : exempt.filter((x) => x !== u))}>
              {u}
            </Check>
          ))}
        </fieldset>
        <Btn kind="primary" onClick={() => setM(act((s) => setPasswordRules(s, { expiryDays: days, exempt })))}>
          Save
        </Btn>
        <Msg m={m} />
      </section>
    </>
  )
}

// ---------- reference IDs and logs ----------

function Refs({ y }) {
  const rows = [...Object.entries(y.locations).map(([id, n]) => ['Location_ID', id, n]), ...Object.entries(y.jobs).map(([id, n]) => ['Job_Profile_ID', id, n]), ...Object.entries(y.workers).map(([id, x]) => ['Employee_ID', id, x.name])]
  return (
    <>
      <h2>View Reference IDs</h2>
      <p className="pc-dim">A web service reference names an ID and its type, such as {'<wd:ID wd:type="Location_ID">LOC_PIER_02</wd:ID>'}. Every object also has a WID.</p>
      <Table
        heads={['Type', 'ID', 'Name', 'WID']}
        rows={rows.map(([type, id, n]) => (
          <tr key={type + id}>
            <td>{type}</td>
            <td>
              <code>{id}</code>
            </td>
            <td>{n}</td>
            <td>
              <code className="wd-wid">{widOf(id)}</code>
            </td>
          </tr>
        ))}
      />
    </>
  )
}

function Events({ y }) {
  const [user, setUser] = useState('')
  const list = [...y.log].reverse().filter((e) => !user || e.user === user)
  return (
    <>
      <h2>Integration events</h2>
      <p className="pc-dim">Every RaaS and SOAP web service request of the apps, as Workday processed it. A request can complete in Workday after the caller gave up.</p>
      <Field label="User">
        <Select value={user} onChange={setUser} placeholder="All" options={[...new Set(y.log.map((e) => e.user))]} />
      </Field>
      <Table
        heads={['Time', 'User', 'App', 'Type', 'Operation', 'Status', 'Rows', 'Duration', 'Message']}
        rows={list.map((e, i) => (
          <tr key={i}>
            <td>{shortTime(e.t)}</td>
            <td>{e.user}</td>
            <td>{e.app}</td>
            <td>{e.kind}</td>
            <td>{e.op}</td>
            <td>
              <Status s={e.ok} />
            </td>
            <td>{e.rows ?? ''}</td>
            <td>{secs(e.ms)}</td>
            <td>
              {e.msg}
              {e.detail && <small className="wd-detail">{e.detail}</small>}
            </td>
          </tr>
        ))}
        empty="No web service requests yet."
      />
    </>
  )
}

function Signons({ y }) {
  return (
    <>
      <h2>Signons and Attempted Signons</h2>
      <p className="pc-dim">A web service caller only hears invalid username or password. The reason of a failed signon is here.</p>
      <Table
        heads={['Time', 'User Name', 'Session Type', 'Failed Signon', 'Reason']}
        rows={[...y.signons].reverse().map((x, i) => (
          <tr key={i}>
            <td>{shortTime(x.t)}</td>
            <td>{x.user}</td>
            <td>{x.how}</td>
            <td>{x.ok ? 'No' : 'Yes'}</td>
            <td className={x.ok ? '' : 'wd-bad'}>{x.reason}</td>
          </tr>
        ))}
        empty="No web service signons yet."
      />
    </>
  )
}
