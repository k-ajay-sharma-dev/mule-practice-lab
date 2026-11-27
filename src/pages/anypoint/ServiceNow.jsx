// ServiceNow: the instance brightmart.service-now.lab in the style of the Next Experience UI. List views with filter
// conditions and Update selected, forms with history, users and roles, Access Control (ACL), the REST API Explorer,
// Rate Limit Rules, the Application Registry, Transform Maps, the System Log and the REST transactions. A lab tool: the
// screen is used as brightmart.admin, and the REST API Explorer can run as another user.
import { useEffect, useMemo, useState } from 'react'
import { mark } from '../../lab/platform.js'
import * as sn from '../../lab/platform-servicenow.js'

const NAV = [
  ['Incident', [['incident', 'All'], ['incident-open', 'Open'], ['incident-new', 'Create New']]],
  ['Configuration', [['cmdb_ci', 'Configuration Items']]],
  ['User Administration', [['sys_user', 'Users'], ['sys_user_group', 'Groups']]],
  ['System Security', [['acl', 'Access Control (ACL)']]],
  ['System Web Services', [['explorer', 'REST API Explorer'], ['rate', 'Rate Limit Rules']]],
  ['System OAuth', [['oauth', 'Application Registry']]],
  ['System Import Sets', [['transform', 'Transform Maps']]],
  ['System Logs', [['syslog', 'System Log, All'], ['tx', 'Transactions (REST)'], ['audit', 'History (sys_audit)']]],
]
const SEEN = { acl: 'snow:acl', explorer: 'snow:explorer', rate: 'snow:rate', oauth: 'snow:oauth', transform: 'snow:import', syslog: 'snow:syslog', tx: 'snow:tx', audit: 'snow:audit', sys_user: 'snow:users', sys_user_group: 'snow:users' }
const LABELS = {
  number: 'Number', opened_at: 'Opened', short_description: 'Short description', description: 'Description', caller_id: 'Caller', category: 'Category', impact: 'Impact', urgency: 'Urgency', priority: 'Priority', state: 'State',
  assignment_group: 'Assignment group', assigned_to: 'Assigned to', cmdb_ci: 'Configuration item', correlation_id: 'Correlation ID', correlation_display: 'Correlation display', close_code: 'Resolution code', close_notes: 'Resolution notes', work_notes: 'Work notes',
  sys_id: 'Sys ID', sys_created_on: 'Created', sys_created_by: 'Created by', sys_updated_on: 'Updated', sys_updated_by: 'Updated by', sys_mod_count: 'Updates',
  user_name: 'User ID', first_name: 'First name', last_name: 'Last name', name: 'Name', email: 'Email', active: 'Active', web_service_access_only: 'Web service access only', internal_integration_user: 'Internal Integration User', locked_out: 'Locked out', roles: 'Roles',
  sys_class_name: 'Class', support_group: 'Support group', operational_status: 'Operational status', location: 'Location',
}
const label = (f) => LABELS[f] ?? f
const PAGE = 50
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
const json = (v) => JSON.stringify(v, null, 2)

const Btn = ({ kind = 'plain', ...p }) => <button type="button" className={`sn-btn sn-btn-${kind}`} {...p} />
const Txt = ({ value, onChange, ...p }) => <input className="sn-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />
const Sel = ({ value, onChange, options, ...p }) => (
  <select className="sn-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
    {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>))}
  </select>
)
const Box = ({ checked, onChange, children, ...p }) => (
  <label className="sn-check">
    <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} {...p} /> {children}
  </label>
)
const Field = ({ label: l, wide, children }) => (
  <label className={`sn-field${wide ? ' sn-wide' : ''}`}>
    <span>{l}</span>
    {children}
  </label>
)
const Msg = ({ msg }) => (msg ? <p className={`sn-msg sn-msg-${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>{msg.text}</p> : null)
function Table({ heads, rows, empty = 'No records to display' }) {
  return (
    <div className="sn-table-box">
      <table className="sn-table">
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="sn-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
const Head = ({ title, count, children }) => (
  <div className="sn-head">
    <h2>
      {title}
      {count !== undefined && <small> [{count}]</small>}
    </h2>
    <div className="sn-head-actions">{children}</div>
  </div>
)

const PAGES = NAV.flatMap(([, items]) => items.map(([k]) => k))

// place.page opens a page of the navigator, place.rec ({ table, id }) a form
export default function ServiceNow({ state, update, place }) {
  const y = state.servicenow
  const [page, setPage] = useState(PAGES.includes(place?.page) ? place.page : 'incident')
  const [rec, setRec] = useState(place?.rec ?? null) // { table, id } of an open form
  const [msg, setMsg] = useState(null)

  // a save from before ServiceNow was built, or the open console, holds a placeholder: build the instance on first open
  useEffect(() => {
    if (y && !sn.isFilled(y)) update((s) => sn.upgradeServicenow(s))
  }, [y, update])
  useEffect(() => {
    if (!sn.isFilled(y)) return
    const key = SEEN[page] ?? (sn.SCHEMA[page.replace('-open', '')] ? `snow:list:${page.replace('-open', '')}` : null)
    if (key && !rec) update((s) => mark(s, key))
  }, [page, rec, Boolean(sn.isFilled(y))]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rec || !sn.isFilled(y)) return
    const r = sn.recordOf(y, rec.table, rec.id)
    if (rec.table === 'incident' && r) update((s) => mark(s, `snow:form:${r.number}`))
  }, [rec?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>ServiceNow</h2>
        <p className="pc-empty pc-boxed">This lab has no ServiceNow instance.</p>
      </main>
    )
  if (!sn.isFilled(y)) return <main className="pc-main">Starting ServiceNow...</main>

  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const say = (r, ok) => setMsg(r?.error ? { type: 'error', text: r.error } : { type: 'info', text: ok })
  const open = (table, id) => {
    setMsg(null)
    setRec({ table, id })
  }
  const pick = (p) => {
    setMsg(null)
    setRec(null)
    setPage(p)
  }
  const props = { y, state, act, say, open, msg }
  const table = page.replace('-open', '')

  return (
    <main className="pc-main sn-app">
      <header className="sn-top">
        <b className="sn-logo">servicenow</b>
        <span className="sn-inst">{sn.INSTANCE}</span>
        <span className="sn-who">System Administrator ({sn.ADMIN_USER})</span>
      </header>
      <div className="sn-shell">
        <nav className="sn-nav" aria-label="Application navigator">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <h3>{group}</h3>
              {items.map(([k, text]) => (
                <button key={k} type="button" className={page === k ? 'on' : ''} aria-current={page === k ? 'page' : undefined} onClick={() => pick(k)}>
                  {text}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <section className="sn-page">
          {rec ? (
            <Form key={`${rec.table}${rec.id}`} {...props} table={rec.table} id={rec.id} back={() => setRec(null)} />
          ) : page === 'incident-new' ? (
            <NewIncident {...props} done={(id) => open('incident', id)} />
          ) : sn.SCHEMA[table] ? (
            <List key={page} {...props} table={table} preset={page === 'incident-open' ? [{ field: 'state', op: 'IN', value: '1,2,3' }] : []} />
          ) : page === 'acl' ? (
            <Acls {...props} />
          ) : page === 'explorer' ? (
            <Explorer {...props} />
          ) : page === 'rate' ? (
            <RateRules {...props} />
          ) : page === 'oauth' ? (
            <Registry {...props} />
          ) : page === 'transform' ? (
            <Transforms {...props} />
          ) : page === 'syslog' ? (
            <SysLog y={y} />
          ) : page === 'tx' ? (
            <Transactions y={y} />
          ) : (
            <Audit y={y} />
          )}
        </section>
      </div>
    </main>
  )
}

// ---------- list view ----------

const encode = (conds) =>
  conds
    .filter((c) => c.field && c.op)
    .map((c) => `${c.field}${c.op}${['ISEMPTY', 'ISNOTEMPTY'].includes(c.op) ? '' : c.value}`)
    .join('^')
function ValueInput({ y, table, field, value, onChange }) {
  const t = sn.typeOf(table, field)
  const ref = sn.refTable(table, field)
  if (t === 'c') return <Sel aria-label="Value" value={value} onChange={onChange} options={[['', '-- None --'], ...Object.entries(sn.CHOICES[field] ?? {})]} />
  if (t === 'b') return <Sel aria-label="Value" value={value} onChange={onChange} options={['true', 'false']} />
  if (ref) return <Sel aria-label="Value" value={value} onChange={onChange} options={[['', '-- None --'], ...sn.rowsOf(y, ref).map((r) => [r.sys_id, String(r[sn.SCHEMA[ref].display])])]} />
  return <Txt aria-label="Value" value={value} onChange={onChange} />
}
function List({ y, act, say, open, msg, table, preset }) {
  const schema = sn.SCHEMA[table]
  const fields = Object.keys(schema.fields).filter((f) => sn.typeOf(table, f) !== 'j')
  const [conds, setConds] = useState(preset)
  const [query, setQuery] = useState(encode(preset))
  const [at, setAt] = useState(0)
  const [chosen, setChosen] = useState([])
  const [bulk, setBulk] = useState(null)
  const rows = useMemo(() => sn.select(y, table, query).rows, [y, table, query])
  const shown = rows.slice(at, at + PAGE)
  const setCond = (i, patch) => setConds(conds.map((c, k) => (k === i ? { ...c, ...patch, ...(patch.field && { value: '' }) } : c)))
  const run = () => {
    setQuery(encode(conds))
    setAt(0)
    setChosen([])
  }
  const all = rows.length > 0 && rows.every((r) => chosen.includes(r.sys_id))
  const apply = () => {
    const values = Object.fromEntries(Object.entries(bulk).filter(([, v]) => String(v ?? '').trim() !== ''))
    if (!Object.keys(values).length) return say({ error: 'Set at least one field' })
    const r = act((s) => sn.updateSelected(s, table, chosen, values))
    say(r, `${r.changed} records updated`)
    setBulk(null)
    setChosen([])
  }
  return (
    <>
      <Head title={schema.label} count={rows.length}>
        {table === 'sys_user' && <NewUser act={act} say={say} />}
        {table === 'incident' && chosen.length > 0 && (
          <Btn kind="primary" onClick={() => setBulk({ state: '', assignment_group: '', close_code: '', work_notes: '' })}>
            Update selected ({chosen.length})
          </Btn>
        )}
      </Head>
      <Msg msg={msg} />
      <div className="sn-filter" role="group" aria-label="Filter conditions">
        {conds.map((c, i) => (
          <div key={i} className="sn-cond">
            {i > 0 && <span className="sn-and">AND</span>}
            <Sel aria-label="Field" value={c.field} onChange={(field) => setCond(i, { field })} options={[['', '-- choose field --'], ...fields.map((f) => [f, label(f)])]} />
            <Sel aria-label="Operator" value={c.op} onChange={(op) => setCond(i, { op })} options={sn.OPERATORS} />
            {!['ISEMPTY', 'ISNOTEMPTY'].includes(c.op) && (c.op === '=' || c.op === '!=' ? <ValueInput y={y} table={table} field={c.field} value={c.value} onChange={(value) => setCond(i, { value })} /> : <Txt aria-label="Value" value={c.value} onChange={(value) => setCond(i, { value })} />)}
            <button type="button" className="sn-x" aria-label="Remove condition" onClick={() => setConds(conds.filter((_, k) => k !== i))}>
              ×
            </button>
          </div>
        ))}
        <div className="sn-row">
          <Btn onClick={() => setConds([...conds, { field: '', op: '=', value: '' }])}>Add filter condition</Btn>
          <Btn kind="primary" onClick={run}>
            Run
          </Btn>
          <Btn
            onClick={() => {
              setConds([])
              setQuery('')
              setAt(0)
            }}
          >
            Clear
          </Btn>
        </div>
        <p className="sn-crumb">
          <b>{schema.label}</b> {query ? <code>{query}</code> : 'All'}
        </p>
      </div>
      {bulk && (
        <div className="sn-bulk" role="group" aria-label="Update selected">
          <h3>Update {chosen.length} selected records</h3>
          <Field label="State">
            <Sel value={bulk.state} onChange={(v) => setBulk({ ...bulk, state: v })} options={[['', '-- leave --'], ...Object.entries(sn.CHOICES.state)]} />
          </Field>
          <Field label="Assignment group">
            <Sel value={bulk.assignment_group} onChange={(v) => setBulk({ ...bulk, assignment_group: v })} options={[['', '-- leave --'], ...sn.rowsOf(y, 'sys_user_group').map((g) => [g.sys_id, g.name])]} />
          </Field>
          <Field label="Resolution code">
            <Sel value={bulk.close_code} onChange={(v) => setBulk({ ...bulk, close_code: v })} options={[['', '-- leave --'], ...Object.entries(sn.CHOICES.close_code)]} />
          </Field>
          <Field label="Work notes" wide>
            <textarea className="sn-input" rows={2} value={bulk.work_notes} onChange={(e) => setBulk({ ...bulk, work_notes: e.target.value })} />
          </Field>
          <div className="sn-row">
            <Btn kind="primary" onClick={apply}>
              Update
            </Btn>
            <Btn onClick={() => setBulk(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      <Table
        heads={[
          table === 'incident' ? <input key="all" type="checkbox" aria-label={`Select all ${rows.length} records`} checked={all} onChange={(e) => setChosen(e.target.checked ? rows.map((r) => r.sys_id) : [])} /> : '',
          ...schema.list.map(label),
        ]}
        rows={shown.map((r) => (
          <tr key={r.sys_id}>
            <td>{table === 'incident' && <input type="checkbox" aria-label={`Select ${r.number}`} checked={chosen.includes(r.sys_id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, r.sys_id] : chosen.filter((x) => x !== r.sys_id))} />}</td>
            {schema.list.map((f, i) => (
              <td key={f}>
                {i === 0 ? (
                  <button type="button" className="sn-link" onClick={() => open(table, r.sys_id)}>
                    {sn.displayOf(y, table, f, r[f]) || '(empty)'}
                  </button>
                ) : (
                  sn.displayOf(y, table, f, r[f])
                )}
              </td>
            ))}
          </tr>
        ))}
      />
      <div className="sn-pager">
        <Btn disabled={at === 0} onClick={() => setAt(Math.max(0, at - PAGE))}>
          Previous
        </Btn>
        <span>
          {rows.length ? at + 1 : 0} to {Math.min(rows.length, at + PAGE)} of {rows.length}
        </span>
        <Btn disabled={at + PAGE >= rows.length} onClick={() => setAt(at + PAGE)}>
          Next
        </Btn>
      </div>
    </>
  )
}

// ---------- forms ----------

const EDIT = {
  incident: ['short_description', 'description', 'category', 'impact', 'urgency', 'state', 'assignment_group', 'assigned_to', 'cmdb_ci', 'correlation_id', 'correlation_display', 'close_code', 'close_notes'],
  sys_user: ['first_name', 'last_name', 'email', 'active', 'web_service_access_only', 'internal_integration_user', 'locked_out'],
  sys_user_group: ['description', 'email'],
  cmdb_ci: [],
}
function Editor({ y, table, field, value, onChange }) {
  const t = sn.typeOf(table, field)
  const ref = sn.refTable(table, field)
  if (t === 'b') return <Box checked={value} onChange={onChange}>{label(field)}</Box>
  if (t === 'c') return <Sel aria-label={label(field)} value={value} onChange={onChange} options={[['', '-- None --'], ...Object.entries(sn.CHOICES[field] ?? {})]} />
  if (ref) return <Sel aria-label={label(field)} value={value} onChange={onChange} options={[['', '-- None --'], ...sn.rowsOf(y, ref).map((r) => [r.sys_id, String(r[sn.SCHEMA[ref].display])])]} />
  if (field === 'description' || field === 'close_notes') return <textarea className="sn-input" rows={3} aria-label={label(field)} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  return <Txt aria-label={label(field)} value={value} onChange={onChange} />
}
function Form({ y, state, act, say, msg, table, id, back }) {
  const r = sn.recordOf(y, table, id)
  const editable = EDIT[table] ?? []
  const [draft, setDraft] = useState(() => Object.fromEntries(editable.map((f) => [f, r?.[f] ?? (sn.typeOf(table, f) === 'b' ? false : '')])))
  const [note, setNote] = useState('')
  if (!r)
    return (
      <>
        <p className="sn-empty">Record not found.</p>
        <Btn onClick={back}>Back</Btn>
      </>
    )
  const schema = sn.SCHEMA[table]
  const readOnly = Object.keys(schema.fields).filter((f) => !editable.includes(f) && sn.typeOf(table, f) !== 'j' && f !== 'roles')
  const save = () => {
    const values = { ...draft, ...(note.trim() && { work_notes: note }) }
    const res = act((s) => sn.saveRecord(s, table, id, values))
    say(res, res?.changed ? 'Record updated' : 'No change')
    setNote('')
  }
  const history = y.audit.filter((a) => a.documentkey === id).slice(-12).reverse()
  return (
    <>
      <Head title={`${schema.label.replace(/s$/, '')} ${r[schema.display] ?? ''}`}>
        <Btn onClick={back}>Back</Btn>
        {editable.length > 0 && (
          <Btn kind="primary" onClick={save}>
            Update
          </Btn>
        )}
      </Head>
      <Msg msg={msg} />
      <div className="sn-form">
        {readOnly.map((f) => (
          <Field key={f} label={label(f)}>
            <span className="sn-ro">{sn.displayOf(y, table, f, r[f]) || ' '}</span>
          </Field>
        ))}
        {editable.map((f) => (
          <Field key={f} label={sn.typeOf(table, f) === 'b' ? '' : label(f)} wide={f === 'description' || f === 'close_notes' || f === 'short_description'}>
            <Editor y={y} table={table} field={f} value={draft[f]} onChange={(v) => setDraft({ ...draft, [f]: v })} />
          </Field>
        ))}
        {table === 'incident' && (
          <Field label="Work notes" wide>
            <textarea className="sn-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
      </div>
      {table === 'sys_user' && <UserExtras y={y} act={act} say={say} user={r} now={state.clock ?? 0} />}
      {table === 'incident' && (r.work_notes ?? []).length > 0 && (
        <section className="sn-section">
          <h3>Activity</h3>
          <ul className="sn-activity">
            {[...r.work_notes].reverse().map((w, i) => (
              <li key={i}>
                <b>{w.by}</b> <small>{w.t}</small>
                <p>{w.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="sn-section">
        <h3>History</h3>
        <Table heads={['Created', 'Field', 'Old value', 'New value', 'User']} rows={history.map((a) => <tr key={a.sys_id}><td>{a.sys_created_on}</td><td>{a.fieldname}</td><td>{a.oldvalue}</td><td>{a.newvalue}</td><td>{a.user}</td></tr>)} empty="No history" />
      </section>
    </>
  )
}
function UserExtras({ y, act, say, user, now }) {
  const [role, setRole] = useState('')
  const [pw, setPw] = useState('')
  const rule = sn.ruleFor(y, user)
  return (
    <>
      <section className="sn-section">
        <h3>Roles</h3>
        <Table heads={['Role', 'Description', '']} rows={user.roles.map((r) => <tr key={r}><td>{r}</td><td>{sn.ROLES[r]}</td><td><Btn onClick={() => say(act((s) => sn.setRole(s, user.user_name, r, false)), `Role ${r} removed`)}>Remove</Btn></td></tr>)} empty="No roles" />
        <div className="sn-row">
          <Sel aria-label="Role to add" value={role} onChange={setRole} options={[['', '-- choose role --'], ...Object.keys(sn.ROLES).filter((r) => !user.roles.includes(r)).map((r) => [r, r])]} />
          <Btn kind="primary" disabled={!role} onClick={() => (say(act((s) => sn.setRole(s, user.user_name, role, true)), `Role ${role} added`), setRole(''))}>
            Add
          </Btn>
        </div>
      </section>
      <section className="sn-section">
        <h3>Set password</h3>
        <div className="sn-row">
          <input className="sn-input" type="password" autoComplete="new-password" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Btn kind="primary" disabled={!pw} onClick={() => (say(act((s) => sn.setUserFields(s, user.user_name, { password: pw })), 'Password saved'), setPw(''))}>
            Save
          </Btn>
          <span className="sn-dim">{user.pw ? 'A password is set.' : 'No password yet.'}</span>
        </div>
        <p className="sn-dim">
          REST requests this hour: {sn.usedThisHour(y, user.user_name, now)}
          {rule ? ` of ${rule.limit} (rule ${rule.name})` : ', no rate limit rule applies'}
        </p>
      </section>
    </>
  )
}
function NewIncident({ y, act, say, msg, done }) {
  const [d, setD] = useState({ short_description: '', description: '', impact: '3', urgency: '3', category: 'inquiry', assignment_group: '', cmdb_ci: '', correlation_id: '' })
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const submit = () => {
    const r = act((s) => sn.newIncident(s, d))
    if (r?.error) return say(r)
    say(r, `Incident ${r.number} created`)
    done(r.sysId)
  }
  return (
    <>
      <Head title="Incident New record">
        <Btn kind="primary" onClick={submit}>
          Submit
        </Btn>
      </Head>
      <Msg msg={msg} />
      <div className="sn-form">
        {Object.keys(d).map((f) => (
          <Field key={f} label={label(f)} wide={f === 'short_description' || f === 'description'}>
            <Editor y={y} table="incident" field={f} value={d[f]} onChange={set(f)} />
          </Field>
        ))}
      </div>
    </>
  )
}

// ---------- users: the New form sits on top of the list ----------

function NewUser({ act, say }) {
  const blank = { user_name: '', first_name: '', last_name: '', email: '', web_service_access_only: false, internal_integration_user: false }
  const [d, setD] = useState(null)
  if (!d) return <Btn onClick={() => setD(blank)}>New</Btn>
  const submit = () => {
    const r = act((s) => sn.createUser(s, d))
    say(r, `User ${d.user_name} created. Set its password and roles on the user record.`)
    if (!r?.error) setD(null)
  }
  return (
    <div className="sn-bulk" role="group" aria-label="New user">
      <h3>User New record</h3>
      {['user_name', 'first_name', 'last_name', 'email'].map((f) => (
        <Field key={f} label={label(f)}>
          <Txt value={d[f]} onChange={(v) => setD({ ...d, [f]: v })} />
        </Field>
      ))}
      <Box checked={d.web_service_access_only} onChange={(v) => setD({ ...d, web_service_access_only: v })}>
        Web service access only
      </Box>
      <Box checked={d.internal_integration_user} onChange={(v) => setD({ ...d, internal_integration_user: v })}>
        Internal Integration User
      </Box>
      <div className="sn-row">
        <Btn kind="primary" onClick={submit}>
          Submit
        </Btn>
        <Btn onClick={() => setD(null)}>Cancel</Btn>
      </div>
    </div>
  )
}

// ---------- Access Control ----------

function Acls({ y, act, say, msg }) {
  const [filter, setFilter] = useState('')
  const [openId, setOpenId] = useState(null)
  const [role, setRole] = useState('')
  const [nu, setNu] = useState(null)
  const list = y.acls.filter((a) => a.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const a = y.acls.find((x) => x.sys_id === openId)
  return (
    <>
      <Head title="Access Controls" count={list.length}>
        <Btn onClick={() => setNu({ name: '', operation: 'read', roles: '', description: '' })}>New</Btn>
      </Head>
      <Msg msg={msg} />
      <p className="sn-dim">Elevated to security_admin. An ACL named table checks the record, table.field checks one field. A user passes when it has one of the roles; admin passes every ACL. A field without its own ACL follows its table.</p>
      <div className="sn-row">
        <Txt aria-label="Name contains" placeholder="Name contains, such as cmdb_ci" value={filter} onChange={setFilter} />
      </div>
      {nu && (
        <div className="sn-bulk" role="group" aria-label="New ACL">
          <Field label="Name (table or table.field)">
            <Txt value={nu.name} onChange={(v) => setNu({ ...nu, name: v })} />
          </Field>
          <Field label="Operation">
            <Sel value={nu.operation} onChange={(v) => setNu({ ...nu, operation: v })} options={['read', 'write', 'create', 'delete']} />
          </Field>
          <Field label="Requires role (comma separated)">
            <Txt value={nu.roles} onChange={(v) => setNu({ ...nu, roles: v })} />
          </Field>
          <Field label="Description">
            <Txt value={nu.description} onChange={(v) => setNu({ ...nu, description: v })} />
          </Field>
          <div className="sn-row">
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => sn.createAcl(s, { ...nu, roles: nu.roles.split(',').map((x) => x.trim()).filter(Boolean) }))
                say(r, `ACL ${nu.name} created`)
                if (!r?.error) setNu(null)
              }}
            >
              Submit
            </Btn>
            <Btn onClick={() => setNu(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      <Table
        heads={['Name', 'Type', 'Operation', 'Requires role', 'Active', 'Description']}
        rows={list.map((x) => (
          <tr key={x.sys_id} className={openId === x.sys_id ? 'sn-on' : ''}>
            <td>
              <button type="button" className="sn-link" onClick={() => setOpenId(x.sys_id)}>
                {x.name}
              </button>
            </td>
            <td>{x.type}</td>
            <td>{x.operation}</td>
            <td>{x.roles.join(', ') || '(none: everyone)'}</td>
            <td>{String(x.active)}</td>
            <td>{x.description}</td>
          </tr>
        ))}
      />
      {a && (
        <section className="sn-section">
          <h3>
            ACL {a.name} ({a.operation})
          </h3>
          <Table heads={['Requires role', '']} rows={a.roles.map((r) => <tr key={r}><td>{r}</td><td><Btn onClick={() => say(act((s) => sn.saveAcl(s, a.sys_id, { roles: a.roles.filter((z) => z !== r) })), 'ACL updated')}>Remove</Btn></td></tr>)} empty="No role: everyone passes" />
          <div className="sn-row">
            <Sel aria-label="Role to add" value={role} onChange={setRole} options={[['', '-- choose role --'], ...Object.keys(sn.ROLES).filter((r) => !a.roles.includes(r)).map((r) => [r, r])]} />
            <Btn kind="primary" disabled={!role} onClick={() => (say(act((s) => sn.saveAcl(s, a.sys_id, { roles: [...a.roles, role] })), 'ACL updated'), setRole(''))}>
              Add
            </Btn>
            <Box checked={a.active} onChange={(v) => say(act((s) => sn.saveAcl(s, a.sys_id, { active: v })), 'ACL updated')}>
              Active
            </Box>
          </div>
        </section>
      )}
    </>
  )
}

// ---------- REST API Explorer ----------

function Explorer({ y, act }) {
  const [d, setD] = useState({ as: sn.ADMIN_USER, method: 'GET', table: 'incident', sysId: '', sysparm_query: '', sysparm_display_value: 'false', sysparm_fields: '', sysparm_limit: '10', sysparm_offset: '', sysparm_exclude_reference_link: false, body: '' })
  const [res, setRes] = useState(null)
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const params = { sysparm_query: d.sysparm_query, sysparm_display_value: d.sysparm_display_value === 'false' ? '' : d.sysparm_display_value, sysparm_fields: d.sysparm_fields, sysparm_limit: d.sysparm_limit, sysparm_offset: d.sysparm_offset, ...(d.sysparm_exclude_reference_link && { sysparm_exclude_reference_link: 'true' }) }
  const qs = Object.entries(params)
    .filter(([, v]) => String(v ?? '').trim() !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const url = `${sn.INSTANCE_URL}/api/now/table/${d.table}${d.sysId ? `/${d.sysId}` : ''}${qs ? `?${qs}` : ''}`
  const send = () => setRes(act((s) => sn.explore(s, { as: d.as, method: d.method, table: d.table, sysId: d.sysId.trim(), params: Object.fromEntries(Object.entries(params).filter(([, v]) => String(v ?? '').trim() !== '')), body: ['POST', 'PATCH', 'PUT'].includes(d.method) ? d.body : undefined })))
  return (
    <>
      <Head title="REST API Explorer" />
      <p className="sn-dim">Namespace now, API Table API, version latest. Lab: Run as sends the request as that user, the way you test after impersonating it.</p>
      <div className="sn-form">
        <Field label="Run as">
          <Sel value={d.as} onChange={set('as')} options={sn.rowsOf(y, 'sys_user').map((u) => [u.user_name, u.user_name])} />
        </Field>
        <Field label="HTTP method">
          <Sel value={d.method} onChange={set('method')} options={METHODS} />
        </Field>
        <Field label="tableName">
          <Sel value={d.table} onChange={set('table')} options={sn.TABLES} />
        </Field>
        <Field label="sys_id (for one record)">
          <Txt value={d.sysId} onChange={set('sysId')} />
        </Field>
        <Field label="sysparm_query" wide>
          <Txt value={d.sysparm_query} onChange={set('sysparm_query')} placeholder="stateIN1,2,3^ORDERBYsys_created_on" />
        </Field>
        <Field label="sysparm_display_value">
          <Sel value={d.sysparm_display_value} onChange={set('sysparm_display_value')} options={['false', 'true', 'all']} />
        </Field>
        <Field label="sysparm_fields">
          <Txt value={d.sysparm_fields} onChange={set('sysparm_fields')} placeholder="number,short_description" />
        </Field>
        <Field label="sysparm_limit">
          <Txt value={d.sysparm_limit} onChange={set('sysparm_limit')} inputMode="numeric" />
        </Field>
        <Field label="sysparm_offset">
          <Txt value={d.sysparm_offset} onChange={set('sysparm_offset')} inputMode="numeric" />
        </Field>
        <Field label="">
          <Box checked={d.sysparm_exclude_reference_link} onChange={set('sysparm_exclude_reference_link')}>
            sysparm_exclude_reference_link
          </Box>
        </Field>
        {['POST', 'PATCH', 'PUT'].includes(d.method) && (
          <Field label="Request body (JSON)" wide>
            <textarea className="sn-input sn-mono" rows={5} value={d.body} onChange={(e) => set('body')(e.target.value)} placeholder='{"short_description":"Test"}' />
          </Field>
        )}
      </div>
      <p className="sn-crumb">
        <code>
          {d.method} {url}
        </code>
      </p>
      <Btn kind="primary" onClick={send}>
        Send
      </Btn>
      {res && (
        <section className="sn-section" aria-live="polite">
          <h3>Response</h3>
          {res.error && !res.status ? (
            <p className="sn-msg sn-msg-error">{res.error}</p>
          ) : (
            <>
              <p>
                Status code <b className={res.status < 400 ? 'sn-good' : 'sn-bad'}>{res.status}</b>, {res.ms} ms
              </p>
              <h4>Headers</h4>
              <pre className="sn-pre">{Object.entries({ 'Content-Type': 'application/json;charset=UTF-8', ...res.headers }).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
              <h4>Response body</h4>
              <pre className="sn-pre">{res.body === null ? '(no content)' : json(res.body)}</pre>
            </>
          )}
        </section>
      )}
    </>
  )
}

// ---------- rate limits, OAuth, transform maps ----------

function RateRules({ y, state, act, say, msg }) {
  const blank = { sys_id: '', name: '', type: 'User', who: '', limit: '1000', active: true }
  const [d, setD] = useState(null)
  const now = state.clock ?? 0
  return (
    <>
      <Head title="Rate Limit Rules" count={y.rateRules.length}>
        <Btn onClick={() => setD(blank)}>New</Btn>
      </Head>
      <Msg msg={msg} />
      <p className="sn-dim">A rule counts the REST requests of a user per hour. Past the limit the instance answers 429 Too Many Requests until the hour resets. Every answer carries X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset. A rule for a user wins over one for a role, which wins over All users.</p>
      <Table
        heads={['Name', 'REST API', 'Applies to', 'User or role', 'Rate limit per hour', 'Active', '']}
        rows={y.rateRules.map((r) => (
          <tr key={r.sys_id}>
            <td>{r.name}</td>
            <td>{r.resource}</td>
            <td>{r.type}</td>
            <td>{r.who}</td>
            <td>{r.limit}</td>
            <td>{String(r.active)}</td>
            <td>
              <Btn onClick={() => setD({ ...r, limit: String(r.limit) })}>Edit</Btn>
            </td>
          </tr>
        ))}
      />
      {d && (
        <div className="sn-bulk" role="group" aria-label="Rate limit rule">
          <Field label="Name">
            <Txt value={d.name} onChange={(v) => setD({ ...d, name: v })} />
          </Field>
          <Field label="Applies to">
            <Sel value={d.type} onChange={(v) => setD({ ...d, type: v, who: '' })} options={['User', 'Role', 'All users']} />
          </Field>
          {d.type !== 'All users' && (
            <Field label={d.type}>
              <Sel value={d.who} onChange={(v) => setD({ ...d, who: v })} options={[['', '-- choose --'], ...(d.type === 'User' ? sn.rowsOf(y, 'sys_user').map((u) => [u.user_name, u.user_name]) : Object.keys(sn.ROLES).map((r) => [r, r]))]} />
            </Field>
          )}
          <Field label="Rate limit per hour">
            <Txt value={d.limit} onChange={(v) => setD({ ...d, limit: v })} inputMode="numeric" />
          </Field>
          <Box checked={d.active} onChange={(v) => setD({ ...d, active: v })}>
            Active
          </Box>
          <div className="sn-row">
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => sn.saveRateRule(s, d))
                say(r, 'Rule saved')
                if (!r?.error) setD(null)
              }}
            >
              {d.sys_id ? 'Update' : 'Submit'}
            </Btn>
            <Btn onClick={() => setD(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      <section className="sn-section">
        <h3>Usage this hour</h3>
        <Table
          heads={['User', 'Requests', 'Rejected with 429', 'Limit']}
          rows={Object.entries(y.rate)
            .filter(([u]) => sn.usedThisHour(y, u, now) > 0)
            .map(([u, c]) => (
              <tr key={u}>
                <td>{u}</td>
                <td>{c.n}</td>
                <td>{c.rejected ?? 0}</td>
                <td>{sn.userOf(y, u) ? (sn.ruleFor(y, sn.userOf(y, u))?.limit ?? 'none') : ''}</td>
              </tr>
            ))}
          empty="No requests this hour"
        />
      </section>
    </>
  )
}
function Registry({ y, act, say, msg }) {
  const [d, setD] = useState(null)
  const [made, setMade] = useState(null)
  return (
    <>
      <Head title="Application Registries" count={y.oauth.length}>
        <Btn onClick={() => (setD({ name: '', user: '' }), setMade(null))}>New</Btn>
      </Head>
      <Msg msg={msg} />
      {d && (
        <div className="sn-bulk" role="group" aria-label="Create an OAuth API endpoint for external clients">
          <h3>Create an OAuth API endpoint for external clients</h3>
          <Field label="Name">
            <Txt value={d.name} onChange={(v) => setD({ ...d, name: v })} />
          </Field>
          <Field label="OAuth application user">
            <Sel value={d.user} onChange={(v) => setD({ ...d, user: v })} options={[['', '-- choose user --'], ...sn.rowsOf(y, 'sys_user').map((u) => [u.user_name, u.user_name])]} />
          </Field>
          <p className="sn-dim">Grant type client credentials: the token acts as the OAuth application user, with its roles.</p>
          <div className="sn-row">
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => sn.createOAuth(s, d))
                if (r?.error) return say(r)
                setMade(r)
                setD(null)
              }}
            >
              Submit
            </Btn>
            <Btn onClick={() => setD(null)}>Cancel</Btn>
          </div>
        </div>
      )}
      {made && (
        <p className="sn-msg sn-msg-info" role="status">
          Client ID <code>{made.clientId}</code>, Client Secret <code>{made.clientSecret}</code>. Copy the secret now, it is not shown again.
        </p>
      )}
      <Table
        heads={['Name', 'Client ID', 'OAuth application user', 'Active']}
        rows={y.oauth.map((o) => (
          <tr key={o.sys_id}>
            <td>{o.name}</td>
            <td>
              <code>{o.client_id}</code>
            </td>
            <td>{o.user}</td>
            <td>
              <Box checked={o.active} onChange={(v) => act((s) => sn.setOAuthActive(s, o.sys_id, v))}>
                Active
              </Box>
            </td>
          </tr>
        ))}
      />
    </>
  )
}
function Transforms({ y, act, say, msg }) {
  return (
    <>
      <Head title="Table Transform Maps" count={y.transforms.length} />
      <Msg msg={msg} />
      <p className="sn-dim">The Import Set API, POST /api/now/import/&lt;staging table&gt;, writes a row to the staging table and runs its transform map. A field map with Coalesce ticked is the key: a target record with the same value is updated, otherwise a new one is inserted.</p>
      {y.transforms.map((m) => (
        <section key={m.sys_id} className="sn-section">
          <h3>{m.name}</h3>
          <p>
            Source table <code>{m.source}</code>, target table <code>{m.target}</code>, active {String(m.active)}
          </p>
          <Table
            heads={['Source field', 'Target field', 'Coalesce']}
            rows={m.fields.map((f) => (
              <tr key={f.target}>
                <td>{f.source}</td>
                <td>{f.target}</td>
                <td>
                  <Box checked={f.coalesce} onChange={(v) => say(act((s) => sn.setCoalesce(s, m.sys_id, f.target, v)), `Coalesce on ${f.target} ${v ? 'on' : 'off'}`)} aria-label={`Coalesce on ${f.target}`}>
                    Coalesce
                  </Box>
                </td>
              </tr>
            ))}
          />
        </section>
      ))}
    </>
  )
}

// ---------- logs ----------

function SysLog({ y }) {
  return (
    <>
      <Head title="System Log, All" count={y.syslog.length} />
      <Table heads={['Created', 'Level', 'Source', 'Message']} rows={[...y.syslog].reverse().map((l, i) => <tr key={i}><td>{sn.dt(l.t)}</td><td>{l.level}</td><td>{l.source}</td><td>{l.message}</td></tr>)} />
    </>
  )
}
function Transactions({ y }) {
  const [who, setWho] = useState('')
  const [openAt, setOpenAt] = useState(null)
  const list = [...y.tx].reverse().filter((e) => !who || e.user === who)
  const x = openAt !== null ? list[openAt] : null
  return (
    <>
      <Head title="Transactions (REST)" count={list.length} />
      <p className="sn-dim">The latest inbound REST requests: who sent them, from where, and the answer.</p>
      <div className="sn-row">
        <Sel aria-label="User" value={who} onChange={(v) => (setWho(v), setOpenAt(null))} options={[['', 'All users'], ...[...new Set(y.tx.map((e) => e.user))].map((u) => [u, u])]} />
      </div>
      <Table
        heads={['Created', 'User', 'Source', 'Method', 'URL', 'Status', 'Response time', 'Rows', 'X-Total-Count']}
        rows={list.map((e, i) => (
          <tr key={i} className={openAt === i ? 'sn-on' : ''}>
            <td>
              <button type="button" className="sn-link" onClick={() => setOpenAt(openAt === i ? null : i)}>
                {sn.dt(e.t)}
              </button>
            </td>
            <td>{e.user}</td>
            <td>{e.src}</td>
            <td>{e.m}</td>
            <td className="sn-url">{e.url}</td>
            <td className={e.st < 400 ? 'sn-good' : 'sn-bad'}>{e.st}</td>
            <td>{e.ms} ms</td>
            <td>{e.n}</td>
            <td>{e.tot ?? ''}</td>
          </tr>
        ))}
      />
      {x && (
        <section className="sn-section">
          <h3>
            {x.m} {x.url}
          </h3>
          <h4>Request body</h4>
          <pre className="sn-pre">{x.req || '(none)'}</pre>
          <h4>Response body</h4>
          <pre className="sn-pre">{x.res || '(none)'}</pre>
        </section>
      )}
    </>
  )
}
function Audit({ y }) {
  const [table, setTable] = useState('')
  const list = [...y.audit].reverse().filter((a) => !table || a.tablename === table)
  return (
    <>
      <Head title="History (sys_audit)" count={list.length} />
      <div className="sn-row">
        <Sel aria-label="Table" value={table} onChange={setTable} options={[['', 'All tables'], ...sn.TABLES.map((t) => [t, t])]} />
      </div>
      <Table heads={['Created', 'Table', 'Document key', 'Field', 'Old value', 'New value', 'User']} rows={list.map((a) => <tr key={a.sys_id}><td>{a.sys_created_on}</td><td>{a.tablename}</td><td className="sn-url">{a.documentkey}</td><td>{a.fieldname}</td><td>{a.oldvalue}</td><td>{a.newvalue}</td><td>{a.user}</td></tr>)} />
    </>
  )
}

