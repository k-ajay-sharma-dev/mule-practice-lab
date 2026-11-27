// Salesforce: the Setup of the Harbor org in the style of Lightning Experience. Setup Home, Object Manager with fields,
// External ID and validation rules, Users, Profiles, Permission Sets, Network Access, App Manager with the connected app,
// Change Data Capture, Platform Events, Bulk Data Load Jobs, System Overview with the API usage gauge, Company
// Information, Login History, the Accounts list with Merge Accounts and the Query Editor of the Developer Console.
import { useEffect, useMemo, useState } from 'react'
import { mark } from '../../lab/platform.js'
import * as sf from '../../lab/platform-salesforce.js'

const NAV = [
  ['', [['home', 'Setup Home']]],
  ['Administration', [['users', 'Users'], ['profiles', 'Profiles'], ['permsets', 'Permission Sets']]],
  ['Platform Tools', [['objects', 'Object Manager'], ['apps', 'App Manager'], ['cdc', 'Change Data Capture'], ['events', 'Platform Events']]],
  ['Environments', [['bulk', 'Bulk Data Load Jobs'], ['overview', 'System Overview']]],
  ['Settings', [['company', 'Company Information'], ['network', 'Network Access'], ['logins', 'Login History']]],
  ['Apps', [['accounts', 'Accounts'], ['console', 'Developer Console']]],
]
const SEEN = { home: 'sf:home', overview: 'sf:limits', company: 'sf:limits', bulk: 'sf:bulk', job: 'sf:bulk', objects: 'sf:objects', object: 'sf:objects', cdc: 'sf:cdc', logins: 'sf:login-history', events: 'sf:events', apps: 'sf:apps', app: 'sf:apps', accounts: 'sf:accounts', users: 'sf:users', profiles: 'sf:profiles', profile: 'sf:profiles', permsets: 'sf:permsets', permset: 'sf:permsets', network: 'sf:network', console: 'sf:console' }
const START_SOQL = 'SELECT Id, Name, Harbor_Customer_Id__c, LastModifiedDate\nFROM Account\nORDER BY Name\nLIMIT 20'
const LEVELS = ['none', 'read', 'edit']

const pad = (n) => String(n).padStart(2, '0')
export const when = (t) => {
  if (t === null || t === undefined || Number.isNaN(t)) return ''
  const d = new Date(sf.BASE + t)
  const h = d.getUTCHours()
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}, ${h % 12 || 12}:${pad(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}
const n = sf.fmt
const cell = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const Btn = ({ kind = 'neutral', ...props }) => <button type="button" className={`sf-btn sf-btn-${kind}`} {...props} />

function Table({ heads, rows, empty = 'No records to display.' }) {
  return (
    <div className="sf-table-box">
      <table className="sf-table">
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{typeof v === 'object' && v !== null && !Array.isArray(v) && !('$$typeof' in v) ? cell(v) : v}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="sf-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
const Card = ({ title, actions, children }) => (
  <section className="sf-card">
    <header>
      <h2>{title}</h2>
      {actions && <div className="sf-actions">{actions}</div>}
    </header>
    <div className="sf-card-body">{children}</div>
  </section>
)
const Errors = ({ list }) => (list?.length ? <div className="sf-error" role="alert">{list.map((e, i) => <p key={i}>{e}</p>)}</div> : null)
const Field = ({ label, children }) => (
  <label className="sf-field">
    <span>{label}</span>
    {children}
  </label>
)
const Txt = ({ value, onChange, ...p }) => <input className="sf-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p} />
const Sel = ({ value, onChange, options, ...p }) => (
  <select className="sf-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...p}>
    {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>))}
  </select>
)
const Box = ({ checked, onChange, label }) => (
  <label className="sf-check">
    <input type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} /> {label}
  </label>
)
const Detail = ({ rows }) => (
  <dl className="sf-detail">
    {rows.map(([k, v]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd>{v === '' || v === null || v === undefined ? ' ' : v}</dd>
      </div>
    ))}
  </dl>
)

export default function Salesforce({ state, update, place, go }) {
  const orgName = sf.orgNames().includes(place.org) ? place.org : 'Production'
  const org = sf.orgOf(state, orgName)
  const view = place.view ?? 'home'
  const now = state.clock ?? 0
  const to = (next) => go({ org: orgName, ...next })
  const [errors, setErrors] = useState([])
  useEffect(() => setErrors([]), [place])
  useEffect(() => {
    if (SEEN[view] && org) update((s) => mark(s, SEEN[view]))
    if (view === 'job' && place.job) update((s) => mark(s, `sf:job:${place.job}`))
  }, [view, place.job, org, update])

  if (!org)
    return (
      <main className="pc-main sf">
        <p className="pc-empty pc-boxed">No Salesforce org is connected to this console.</p>
      </main>
    )
  // an action that returns { state, errors }
  const act = (fn) => {
    const r = fn(state)
    if (r.errors?.length) return setErrors(r.errors), false
    update((s) => fn(s).state ?? fn(s))
    setErrors([])
    return true
  }
  const plain = (fn) => update((s) => fn(s))
  const props = { state, org, orgName, now, to, place, act, plain, update, setErrors }
  const pages = { home: Home, users: Users, profiles: Holders, profile: Holder, permsets: Holders, permset: Holder, objects: Objects, object: ObjectPage, apps: Apps, app: AppPage, cdc: Cdc, events: Events, bulk: Bulk, job: Job, overview: Overview, company: Company, network: Network, logins: Logins, accounts: Accounts, console: Console }
  const Page = pages[view] ?? Home
  const active = { profile: 'profiles', permset: 'permsets', object: 'objects', app: 'apps', job: 'bulk' }[view] ?? view
  return (
    <main className="pc-main sf">
      <div className="sf-top">
        <span className="sf-cloud" aria-hidden="true">
          sf
        </span>
        <b>Setup</b>
        <button type="button" className={view === 'objects' || view === 'object' ? 'on' : ''} onClick={() => to({ view: 'objects' })}>
          Object Manager
        </button>
        <span className="sf-grow" />
        <label className="sf-orgpick">
          <span>Org</span>
          <select value={orgName} onChange={(e) => go({ org: e.target.value, view })}>
            {sf.orgsOf(state).map((o) => (
              <option key={o.name} value={o.name}>
                {o.name} ({o.myDomain})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sf-shell">
        <nav className="sf-nav" aria-label="Setup">
          {NAV.map(([group, items]) => (
            <div key={group || 'home'}>
              {group && <h3>{group}</h3>}
              {items.map(([k, label]) => (
                <button key={k} type="button" className={active === k ? 'on' : ''} onClick={() => to({ view: k })}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sf-page">
          <Errors list={errors} />
          <Page {...props} />
        </div>
      </div>
    </main>
  )
}

const Head = ({ kicker = 'Setup', title, children }) => (
  <div className="sf-head">
    <div>
      <small>{kicker}</small>
      <h1>{title}</h1>
    </div>
    {children && <div className="sf-actions">{children}</div>}
  </div>
)

// ---------- Setup Home and the limits ----------

function Gauge({ used, max, label = 'API REQUESTS, LAST 24 HOURS' }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0
  return (
    <div className={`sf-gauge${pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''}`}>
      <small>{label}</small>
      <b>{n(used)}</b>
      <div className="sf-bar" role="img" aria-label={`${pct.toFixed(1)} percent used`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <span>
        {pct.toFixed(1)}% of {n(max)} max
      </span>
    </div>
  )
}

function Home({ org, now, to }) {
  const u = sf.apiUsage(org, now)
  const open = (org.jobs ?? []).filter((j) => ['Open', 'UploadComplete', 'InProgress'].includes(j.state)).length
  return (
    <>
      <Head title="Home" />
      <div className="sf-tiles">
        <button type="button" onClick={() => to({ view: 'overview' })}>
          <Gauge used={u.used} max={u.max} />
        </button>
        <button type="button" onClick={() => to({ view: 'bulk' })}>
          <small>BULK DATA LOAD JOBS</small>
          <b>{(org.jobs ?? []).length}</b>
          <span>{open} open or in progress</span>
        </button>
        <button type="button" onClick={() => to({ view: 'users' })}>
          <small>USERS</small>
          <b>{org.users.length}</b>
          <span>{org.users.filter((x) => (x.lockedUntil ?? 0) > now).length} locked out</span>
        </button>
        <button type="button" onClick={() => to({ view: 'logins' })}>
          <small>LOGIN HISTORY</small>
          <b>{(org.loginHistory ?? []).length}</b>
          <span>{(org.loginHistory ?? []).filter((l) => l.status !== 'Success').length} failed</span>
        </button>
      </div>
      <Card title="Org">
        <Detail rows={[['Organization', `Harbor (${org.name})`], ['My Domain', org.myDomain], ['Login URL', `https://${org.loginHost}`], ['Edition', org.edition], ['Instance', org.instance], ['API version', `v${org.apiVersion}`]]} />
      </Card>
    </>
  )
}

function Overview({ org, now }) {
  const u = sf.apiUsage(org, now)
  const L = sf.limitsOf(org, now)
  const peak = Math.max(1, ...u.hourly.map((x) => x.n))
  const clients = Object.entries(u.byClient).sort((a, b) => b[1] - a[1])
  return (
    <>
      <Head title="System Overview" />
      <div className="sf-tiles">
        <div>
          <Gauge used={u.used} max={u.max} />
        </div>
        <div>
          <Gauge used={L.DailyBulkApiBatches.Max - L.DailyBulkApiBatches.Remaining} max={L.DailyBulkApiBatches.Max} label="BULK API BATCHES, LAST 24 HOURS" />
        </div>
        <div>
          <Gauge used={L.DailyDeliveredPlatformEvents.Max - L.DailyDeliveredPlatformEvents.Remaining} max={L.DailyDeliveredPlatformEvents.Max} label="PLATFORM EVENTS DELIVERED, LAST 24 HOURS" />
        </div>
      </div>
      <Card title="API requests per hour, last 24 hours">
        <div className="sf-chart" role="img" aria-label="API requests per hour">
          {u.hourly.map((x) => (
            <div key={x.h} title={`${pad(((x.h % 24) + 24) % 24)}:00 UTC: ${n(x.n)} requests`}>
              <i style={{ height: `${(x.n / peak) * 100}%` }} />
              <small>{pad(((x.h % 24) + 24) % 24)}</small>
            </div>
          ))}
        </div>
        <p className="sf-note">The limit is counted over a rolling 24 hours, not per calendar day. A request counts until 24 hours after it was made. In this lab the window moves hour by hour.</p>
      </Card>
      <Card title="API requests by client, last 24 hours">
        <Table
          heads={['Client', 'Requests', 'Share', 'Rejected (REQUEST_LIMIT_EXCEEDED)', 'Status']}
          rows={clients.map(([c, v]) => {
            const st = org.feedState?.[c]
            const app = !(org.feeds ?? []).some((f) => f.client === c)
            const rej = u.rejected[c] ?? 0
            return [c, n(v), `${u.used ? ((v / u.used) * 100).toFixed(1) : 0}%`, n(rej), st?.since ? `Failing since ${when(st.since)}` : rej ? 'Some requests rejected' : app ? 'Mule app' : 'OK']
          })}
        />
        <p className="sf-note">Lab made: this table stands for the API Usage Last 7 Days report, grouped by client. A Bulk API job counts a few requests for the whole job; its records count against Bulk API batches.</p>
      </Card>
      <Card title="Limits (GET /services/data/v61.0/limits)">
        <pre className="sf-pre">{JSON.stringify(L, null, 2)}</pre>
      </Card>
    </>
  )
}

function Company({ org, now }) {
  const u = sf.apiUsage(org, now)
  return (
    <>
      <Head title="Company Information" />
      <Card title="Organization Detail">
        <Detail
          rows={[
            ['Organization Name', 'Harbor'],
            ['Organization Edition', org.edition],
            ['Salesforce.com Organization ID', org.orgId],
            ['Instance', org.instance],
            ['My Domain', org.myDomain],
            ['Default Locale', 'English (United States)'],
            ['Default Time Zone', '(GMT+00:00) Coordinated Universal Time (UTC)'],
            ['API Requests, Last 24 Hours', `${n(u.used)} (${n(u.max)} max)`],
            ['Streaming API Events, Last 24 Hours', `${n(Object.values(org.channels ?? {}).reduce((k, c) => k + c.events.filter((e) => e.t > now - 86400000).length, 0))}`],
            ['Used Data Space', '412 MB'],
          ]}
        />
      </Card>
    </>
  )
}

// ---------- users, profiles, permission sets, network access ----------

function Users({ org, orgName, now, act, plain }) {
  const [form, setForm] = useState(null)
  const [pw, setPw] = useState({})
  const [assign, setAssign] = useState({})
  const permsets = Object.keys(org.permsets ?? {})
  return (
    <>
      <Head title="All Users">
        <Btn kind="brand" onClick={() => setForm({ name: '', username: '', profile: 'Minimum Access - API Only Integrations', password: '' })}>
          New User
        </Btn>
      </Head>
      {form && (
        <Card title="New User" actions={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn kind="brand" onClick={() => act((s) => sf.createUser(s, orgName, form)) && setForm(null)}>Save</Btn></>}>
          <div className="sf-form">
            <Field label="Last Name">
              <Txt value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>
            <Field label="Username">
              <Txt value={form.username} onChange={(v) => setForm({ ...form, username: v })} placeholder="mule.sync@harbor.example" />
            </Field>
            <Field label="Profile">
              <Sel value={form.profile} onChange={(v) => setForm({ ...form, profile: v })} options={Object.keys(org.profiles)} />
            </Field>
            <Field label="User License">
              <Txt value={sf.LICENSES[form.profile] ?? 'Salesforce'} onChange={() => {}} readOnly />
            </Field>
            <Field label="Password">
              <Txt type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
            </Field>
          </div>
          <p className="sf-note">Salesforce mails the security token of the new user. In the lab the mail goes to the operations inbox.</p>
        </Card>
      )}
      {org.users.map((u) => {
        const locked = (u.lockedUntil ?? 0) > now
        return (
          <Card key={u.username} title={`${u.name} (${u.username})`}>
            <Detail rows={[['Profile', u.profile], ['User License', u.license], ['Active', u.active ? 'Yes' : 'No'], ['Frozen', u.frozen ? 'Yes' : 'No'], ['Locked out', locked ? (u.lockedUntil > 1e14 ? 'Yes, until an administrator unlocks the user' : `Until ${when(u.lockedUntil)}`) : 'No'], ['Password expires', u.passwordExpires ? when(u.passwordExpires) : 'Never'], ['Permission Set Assignments', (u.permsets ?? []).join(', ') || 'None']]} />
            <div className="sf-row">
              <Txt type="password" value={pw[u.username] ?? ''} onChange={(v) => setPw({ ...pw, [u.username]: v })} placeholder="New password" aria-label={`New password of ${u.username}`} />
              <Btn onClick={() => (plain((s) => sf.setPassword(s, orgName, u.username, pw[u.username])), setPw({ ...pw, [u.username]: '' }))} disabled={!pw[u.username]}>
                Reset Password
              </Btn>
              <Btn onClick={() => plain((s) => sf.resetSecurityToken(s, orgName, u.username))}>Reset Security Token</Btn>
              {locked && <Btn onClick={() => plain((s) => sf.unlockUser(s, orgName, u.username))}>Unlock</Btn>}
              <Btn onClick={() => plain((s) => sf.setUserFrozen(s, orgName, u.username, !u.frozen))}>{u.frozen ? 'Unfreeze' : 'Freeze'}</Btn>
              <Btn onClick={() => plain((s) => sf.revokeSessions(s, orgName, u.username))}>Revoke Sessions</Btn>
            </div>
            <div className="sf-row">
              <Sel value={assign[u.username] ?? ''} onChange={(v) => setAssign({ ...assign, [u.username]: v })} options={[['', 'Choose a permission set'], ...permsets]} aria-label={`Permission set for ${u.username}`} />
              <Btn onClick={() => plain((s) => sf.assignPermset(s, orgName, u.username, assign[u.username], true))} disabled={!assign[u.username]}>
                Add Assignment
              </Btn>
              <Btn onClick={() => plain((s) => sf.assignPermset(s, orgName, u.username, assign[u.username], false))} disabled={!assign[u.username] || !(u.permsets ?? []).includes(assign[u.username])}>
                Remove Assignment
              </Btn>
            </div>
          </Card>
        )
      })}
    </>
  )
}

function Holders({ org, orgName, place, to, act }) {
  const profiles = place.view === 'profiles'
  const list = Object.entries(profiles ? org.profiles : (org.permsets ?? {}))
  const [form, setForm] = useState(null)
  return (
    <>
      <Head title={profiles ? 'Profiles' : 'Permission Sets'}>
        {!profiles && (
          <Btn kind="brand" onClick={() => setForm({ label: '', name: '' })}>
            New
          </Btn>
        )}
      </Head>
      {form && (
        <Card title="Create Permission Set" actions={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn kind="brand" onClick={() => act((s) => sf.createPermset(s, orgName, form)) && (setForm(null), to({ view: 'permset', name: form.name }))}>Save</Btn></>}>
          <div className="sf-form">
            <Field label="Label">
              <Txt value={form.label} onChange={(v) => setForm({ ...form, label: v, name: form.typed ? form.name : v.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') })} />
            </Field>
            <Field label="API Name">
              <Txt value={form.name} onChange={(v) => setForm({ ...form, name: v, typed: true })} />
            </Field>
            <Field label="License">
              <Txt value="Salesforce Integration" onChange={() => {}} readOnly />
            </Field>
          </div>
        </Card>
      )}
      <Table
        heads={[profiles ? 'Profile Name' : 'Label', 'API Enabled', 'Users']}
        rows={list.map(([k, h]) => [
          <button key={k} type="button" className="sf-a" onClick={() => to({ view: profiles ? 'profile' : 'permset', name: k })}>
            {h.label ?? k}
          </button>,
          h.apiEnabled || h.modifyAll ? 'Yes' : 'No',
          org.users.filter((u) => (profiles ? u.profile === k : (u.permsets ?? []).includes(k))).length,
        ])}
      />
    </>
  )
}

function Holder({ org, orgName, place, to, act, plain }) {
  const profile = place.view === 'profile'
  const kind = profile ? 'profile' : 'permset'
  const h = profile ? org.profiles[place.name] : org.permsets?.[place.name]
  const types = Object.keys(org.objects)
  const type = types.includes(place.type) ? place.type : 'Account'
  const [ip, setIp] = useState({ start: '', end: '' })
  if (!h) return <p className="sf-empty">This {profile ? 'profile' : 'permission set'} does not exist.</p>
  const letters = (t) => (h.modifyAll ? 'CRED' : String(h.objects?.[t] ?? h.allObjects ?? ''))
  const lvl = (fd) => (h.modifyAll ? 'edit' : (h.fields?.[`${type}.${fd.name}`] ?? h.allFields ?? 'none'))
  const fixed = h.modifyAll
  return (
    <>
      <Head kicker={profile ? 'Profile' : 'Permission Set'} title={h.label ?? place.name}>
        <Btn onClick={() => to({ view: profile ? 'profiles' : 'permsets' })}>Back to list</Btn>
      </Head>
      <Card title="System Permissions">
        <Box checked={h.apiEnabled || h.modifyAll} label="API Enabled" onChange={(v) => !fixed && plain((s) => sf.setApiEnabled(s, orgName, kind, place.name, v))} />
        {h.apiOnly && <p className="sf-note">API Only User: users of this profile cannot log in to the user interface.</p>}
        {fixed && <p className="sf-note">Modify All Data: this profile can see and change every object and field.</p>}
      </Card>
      <Card title="Object Settings">
        <Table
          heads={['Object', 'Read', 'Create', 'Edit', 'Delete']}
          rows={types.map((t) => [
            t,
            ...['R', 'C', 'E', 'D'].map((c) => (
              <input
                key={c}
                type="checkbox"
                aria-label={`${t} ${c}`}
                checked={letters(t).includes(c)}
                disabled={fixed}
                onChange={(e) => {
                  const set = new Set(letters(t))
                  if (e.target.checked) set.add(c)
                  else {
                    set.delete(c)
                    if (c === 'R') set.clear()
                    if (c === 'E') set.delete('D')
                  }
                  plain((s) => sf.setObjectAccess(s, orgName, kind, place.name, t, [...set].join('')))
                }}
              />
            )),
          ])}
        />
      </Card>
      <Card title={`Field Permissions: ${type}`} actions={<Sel value={type} onChange={(v) => to({ view: place.view, name: place.name, type: v })} options={types} aria-label="Object" />}>
        <Table
          heads={['Field Name', 'API Name', 'Read Access', 'Edit Access']}
          rows={org.objects[type].fields
            .filter((fd) => !fd.readonly && !fd.required && fd.name !== 'Name')
            .map((fd) => {
              const v = lvl(fd)
              const set = (next) => plain((s) => sf.setFieldAccess(s, orgName, kind, place.name, type, fd.name, next))
              return [
                fd.label,
                fd.name,
                <input key="r" type="checkbox" aria-label={`Read ${fd.name}`} disabled={fixed} checked={v !== 'none'} onChange={(e) => set(e.target.checked ? 'read' : 'none')} />,
                <input key="e" type="checkbox" aria-label={`Edit ${fd.name}`} disabled={fixed} checked={v === 'edit'} onChange={(e) => set(e.target.checked ? 'edit' : 'read')} />,
              ]
            })}
        />
        <p className="sf-note">Required and system fields are always visible. A field without Read Access is invisible to the API: a query on it fails with INVALID_FIELD, and a write fails too.</p>
      </Card>
      {profile ? (
        <Card title="Login IP Ranges">
          <Table
            heads={['Start IP Address', 'End IP Address', '']}
            rows={(h.loginIpRanges ?? []).map((r, i) => [r.start, r.end, <Btn key="d" onClick={() => plain((s) => sf.removeIpRange(s, orgName, place.name, i))}>Delete</Btn>])}
            empty="No login IP ranges. Users of this profile can log in from any IP address."
          />
          <div className="sf-row">
            <Txt value={ip.start} onChange={(v) => setIp({ ...ip, start: v })} placeholder="Start IP Address" aria-label="Start IP Address" />
            <Txt value={ip.end} onChange={(v) => setIp({ ...ip, end: v })} placeholder="End IP Address" aria-label="End IP Address" />
            <Btn onClick={() => act((s) => sf.addIpRange(s, orgName, place.name, ip.start, ip.end)) && setIp({ start: '', end: '' })}>New</Btn>
          </div>
          <p className="sf-note">A login from outside these ranges fails with Restricted IP in Login History. From inside them the API needs no security token.</p>
        </Card>
      ) : (
        <Card title="Assigned Users">
          <Table heads={['Full Name', 'Username', 'Profile']} rows={org.users.filter((u) => (u.permsets ?? []).includes(place.name)).map((u) => [u.name, u.username, u.profile])} empty="No users have this permission set. Assign it under Users." />
        </Card>
      )}
    </>
  )
}

function Network({ org, orgName, act, plain }) {
  const [ip, setIp] = useState({ start: '', end: '' })
  return (
    <>
      <Head title="Network Access" />
      <Card title="Trusted IP Ranges">
        <Table heads={['Start IP Address', 'End IP Address', '']} rows={(org.network?.trustedIps ?? []).map((r, i) => [r.start, r.end, <Btn key="d" onClick={() => plain((s) => sf.removeIpRange(s, orgName, 'network', i))}>Delete</Btn>])} />
        <div className="sf-row">
          <Txt value={ip.start} onChange={(v) => setIp({ ...ip, start: v })} placeholder="Start IP Address" aria-label="Start IP Address" />
          <Txt value={ip.end} onChange={(v) => setIp({ ...ip, end: v })} placeholder="End IP Address" aria-label="End IP Address" />
          <Btn onClick={() => act((s) => sf.addIpRange(s, orgName, 'network', ip.start, ip.end)) && setIp({ start: '', end: '' })}>New</Btn>
        </div>
        <p className="sf-note">From a trusted IP range a user logs in to the API with the password alone. From anywhere else the API wants the password followed by the security token.</p>
      </Card>
    </>
  )
}

function Logins({ org }) {
  const list = [...(org.loginHistory ?? [])].reverse()
  return (
    <>
      <Head title="Login History" />
      <Table
        heads={['Login Time', 'Username', 'Source IP', 'Login Type', 'Login Subtype', 'Status', 'Application', 'Login URL']}
        rows={list.map((l) => [when(l.t), l.username, l.sourceIp, l.loginType, l.loginSubtype, <span key="s" className={l.status === 'Success' ? 'sf-ok' : 'sf-bad'}>{l.status}</span>, l.application, l.loginUrl])}
        empty="No logins in this org yet."
      />
      <p className="sf-note">Lab made: the list keeps the last 40 logins. The connector logs in once and then uses its session until it expires after two hours without calls.</p>
    </>
  )
}

// ---------- connected apps ----------

function Apps({ org, orgName, to, act }) {
  const [form, setForm] = useState(null)
  return (
    <>
      <Head title="Lightning Experience App Manager">
        <Btn kind="brand" onClick={() => setForm({ name: '', email: '', oauth: true, certificate: '', scopes: [] })}>
          New Connected App
        </Btn>
      </Head>
      {form && (
        <Card title="New Connected App" actions={<><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn kind="brand" onClick={() => act((s) => sf.createConnectedApp(s, orgName, form)) && (setForm(null), to({ view: 'app', name: form.name.trim() }))}>Save</Btn></>}>
          <div className="sf-form">
            <Field label="Connected App Name">
              <Txt value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            </Field>
            <Field label="Contact Email">
              <Txt value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            </Field>
          </div>
          <h3 className="sf-sub">API (Enable OAuth Settings)</h3>
          <Box checked={form.oauth} label="Enable OAuth Settings" onChange={(v) => setForm({ ...form, oauth: v })} />
          {form.oauth && (
            <>
              <Field label="Use digital signatures: certificate file">
                <Sel value={form.certificate} onChange={(v) => setForm({ ...form, certificate: v })} options={[['', 'No file chosen'], ...(org.certificates ?? []).map((c) => [c.name, `${c.name}.crt (expires ${when(c.expires)})`])]} />
              </Field>
              <fieldset className="sf-scopes">
                <legend>Selected OAuth Scopes</legend>
                {sf.OAUTH_SCOPES.map((x) => (
                  <Box key={x} label={x} checked={form.scopes.includes(x)} onChange={(v) => setForm({ ...form, scopes: v ? [...form.scopes, x] : form.scopes.filter((y) => y !== x) })} />
                ))}
              </fieldset>
            </>
          )}
        </Card>
      )}
      <Table
        heads={['App Name', 'Consumer Key', 'OAuth', 'Permitted Users']}
        rows={(org.connectedApps ?? []).map((a) => [
          <button key="n" type="button" className="sf-a" onClick={() => to({ view: 'app', name: a.name })}>
            {a.name}
          </button>,
          a.oauth ? 'Manage Consumer Details' : '',
          a.oauth ? 'Enabled' : 'No',
          a.permittedUsers,
        ])}
      />
    </>
  )
}

function AppPage({ org, orgName, place, now, to, plain }) {
  const a = (org.connectedApps ?? []).find((x) => x.name === place.name)
  const [show, setShow] = useState(false)
  if (!a) return <p className="sf-empty">There is no such connected app.</p>
  const toggle = (k, v, on) => plain((s) => sf.setConnectedApp(s, orgName, a.name, { [k]: on ? [...a[k], v] : a[k].filter((x) => x !== v) }))
  const expired = a.certificate && a.certificate.expires <= now
  return (
    <>
      <Head kicker="Connected App" title={a.name}>
        <Btn onClick={() => to({ view: 'apps' })}>Back to App Manager</Btn>
      </Head>
      <Card title="API (Enable OAuth Settings)">
        <Detail rows={[['Consumer Key', show ? <code key="k">{a.consumerKey}</code> : <button key="b" type="button" className="sf-a" onClick={() => setShow(true)}>Manage Consumer Details</button>], ['Selected OAuth Scopes', (a.scopes ?? []).join(', ')], ['Use digital signatures', a.certificate ? `${a.certificate.name}.crt, expires ${when(a.certificate.expires)}${expired ? ' (expired)' : ''}` : 'No']]} />
        <Field label="Upload a certificate">
          <Sel value={a.certificate?.name ?? ''} onChange={(v) => v && plain((s) => sf.setConnectedApp(s, orgName, a.name, { certificate: v }))} options={[['', 'Choose a certificate file'], ...(org.certificates ?? []).map((c) => [c.name, `${c.name}.crt (expires ${when(c.expires)})`])]} />
        </Field>
      </Card>
      <Card title="OAuth Policies (Edit Policies)">
        <div className="sf-form">
          <Field label="Permitted Users">
            <Sel value={a.permittedUsers} onChange={(v) => plain((s) => sf.setConnectedApp(s, orgName, a.name, { permittedUsers: v }))} options={sf.PERMITTED} />
          </Field>
          <Field label="IP Relaxation">
            <Sel value={a.ipRelaxation} onChange={(v) => plain((s) => sf.setConnectedApp(s, orgName, a.name, { ipRelaxation: v }))} options={sf.IP_RELAXATION} />
          </Field>
        </div>
        <p className="sf-note">The JWT bearer flow has no login page where a user could approve the app, so the user must be pre-authorized: choose Admin approved users are pre-authorized and add a profile or permission set of the user below.</p>
      </Card>
      <Card title="Profiles (Manage Profiles)">
        {Object.keys(org.profiles).map((p) => (
          <Box key={p} label={p} checked={a.profiles.includes(p)} onChange={(v) => toggle('profiles', p, v)} />
        ))}
      </Card>
      <Card title="Permission Sets (Manage Permission Sets)">
        {Object.keys(org.permsets ?? {}).map((p) => (
          <Box key={p} label={org.permsets[p].label ?? p} checked={a.permsets.includes(p)} onChange={(v) => toggle('permsets', p, v)} />
        ))}
      </Card>
    </>
  )
}

// ---------- Object Manager ----------

function Objects({ org, to }) {
  return (
    <>
      <Head title="Object Manager" />
      <Table
        heads={['Label', 'API Name', 'Type', 'Records']}
        rows={Object.keys(org.objects).map((k) => {
          const d = sf.describe(org, k)
          return [
            <button key="l" type="button" className="sf-a" onClick={() => to({ view: 'object', obj: k })}>
              {d.label}
            </button>,
            k,
            d.custom ? 'Custom Object' : 'Standard Object',
            n(d.count),
          ]
        })}
      />
    </>
  )
}

function ObjectPage({ org, orgName, place, to, act, plain, update }) {
  const type = sf.typeName(org, place.obj) ?? 'Account'
  const obj = org.objects[type]
  const tab = place.tab ?? 'fields'
  const [editing, setEditing] = useState(null)
  useEffect(() => {
    if (editing) update((s) => mark(s, `sf:field:${type}.${editing.name}`))
  }, [editing, type, update])
  return (
    <>
      <Head kicker="Object Manager" title={obj.label}>
        <Btn onClick={() => to({ view: 'objects' })}>Back to Object Manager</Btn>
      </Head>
      <div className="sf-tabs" role="tablist">
        {[
          ['fields', 'Fields & Relationships'],
          ['rules', 'Validation Rules'],
        ].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => to({ view: 'object', obj: type, tab: k })}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'fields' && (
        <>
          {editing && (
            <Card title={`Edit ${editing.label}`} actions={<><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn kind="brand" onClick={() => act((s) => sf.editField(s, orgName, type, editing.name, { externalId: editing.externalId, unique: editing.unique, required: editing.required })) && setEditing(null)}>Save</Btn></>}>
              <Detail rows={[['Field Label', editing.label], ['Field Name', editing.name], ['Data Type', editing.type]]} />
              <Box checked={editing.required} label="Required: always require a value in this field in order to save a record" onChange={(v) => setEditing({ ...editing, required: v })} />
              <Box checked={editing.unique} label="Unique: do not allow duplicate values" onChange={(v) => setEditing({ ...editing, unique: v })} />
              <Box checked={editing.externalId} label="External ID: set this field as the unique record identifier from an external system" onChange={(v) => setEditing({ ...editing, externalId: v })} />
            </Card>
          )}
          <Table
            heads={['Field Label', 'Field Name', 'Data Type', 'External ID', 'Unique', 'Required', '']}
            rows={obj.fields.map((fd) => [
              fd.label,
              fd.name,
              `${fd.type}${fd.length ? `(${fd.length})` : ''}${fd.to ? ` (${fd.to})` : ''}`,
              fd.externalId ? 'Yes' : '',
              fd.unique ? 'Yes' : '',
              fd.required ? 'Yes' : '',
              fd.custom || (!fd.readonly && fd.name !== 'Id') ? (
                <Btn key="e" onClick={() => setEditing({ ...fd, externalId: Boolean(fd.externalId), unique: Boolean(fd.unique), required: Boolean(fd.required) })}>
                  Edit
                </Btn>
              ) : (
                ''
              ),
            ])}
          />
        </>
      )}
      {tab === 'rules' && (
        <Table
          heads={['Rule Name', 'Error Location', 'Error Condition Formula', 'Error Message', 'Active', '']}
          rows={(obj.rules ?? []).map((r) => [r.name, r.errorField, <code key="f">{r.formula}</code>, r.message, r.active ? 'Yes' : 'No', <Btn key="a" onClick={() => plain((s) => sf.setRuleActive(s, orgName, type, r.name, !r.active))}>{r.active ? 'Deactivate' : 'Activate'}</Btn>])}
          empty="This object has no validation rules."
        />
      )}
    </>
  )
}

// ---------- events ----------

function Cdc({ org, orgName, now, plain }) {
  const [picked, setPicked] = useState(null)
  const [sel, setSel] = useState({ a: '', s: '' })
  const chosen = picked ?? org.cdc ?? []
  const avail = sf.CDC_AVAILABLE.filter((x) => !chosen.includes(x))
  return (
    <>
      <Head title="Change Data Capture" />
      <Card title="Select Entities" actions={<Btn kind="brand" onClick={() => (plain((s) => sf.setCdcEntities(s, orgName, chosen)), setPicked(null))} disabled={!picked}>Save</Btn>}>
        <div className="sf-dual">
          <div>
            <h3>Available Entities</h3>
            <select size={6} className="sf-input" value={sel.a} onChange={(e) => setSel({ ...sel, a: e.target.value })} aria-label="Available Entities">
              {avail.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className="sf-dual-mid">
            <Btn onClick={() => sel.a && avail.includes(sel.a) && setPicked([...chosen, sel.a])} aria-label="Add">
              &gt;
            </Btn>
            <Btn onClick={() => sel.s && setPicked(chosen.filter((x) => x !== sel.s))} aria-label="Remove">
              &lt;
            </Btn>
          </div>
          <div>
            <h3>Selected Entities</h3>
            <select size={6} className="sf-input" value={sel.s} onChange={(e) => setSel({ ...sel, s: e.target.value })} aria-label="Selected Entities">
              {chosen.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="sf-note">Each selected entity publishes change events on its channel, such as /data/AccountChangeEvent. The event bus keeps them for 72 hours.</p>
      </Card>
      <Bus org={org} now={now} cdcOnly />
    </>
  )
}

function Bus({ org, now, cdcOnly }) {
  const channels = sf.channelsOf(org).filter((c) => !cdcOnly || c.startsWith('/data/'))
  return (
    <Card title="Event bus (lab made view)">
      <Table
        heads={['Channel', 'Events retained', 'Oldest replay ID', 'Latest replay ID', 'Purged up to']}
        rows={channels.map((c) => {
          const i = sf.channelInfo(org, c, now)
          return [c, i.events.length, i.oldest ?? '', i.latest ?? '', i.purgedUpTo || '']
        })}
      />
      <p className="sf-note">Retention is 72 hours. A subscriber gives a replay ID: -1 for new events only, -2 for every retained event, or the ID of the last event it processed. An ID older than the retention fails.</p>
    </Card>
  )
}

function Events({ org, orgName, now, plain }) {
  return (
    <>
      <Head title="Platform Events" />
      {sf.PLATFORM_EVENTS.filter((e) => org.platformEvents.includes(e.name)).map((e0) => {
        const e = sf.eventDef(org, e0.name)
        const ch = `/event/${e.name}`
        const info = sf.channelInfo(org, ch, now)
        const subs = (org.subscribers ?? []).filter((x) => x.channel === ch)
        return (
          <Card key={e.name} title={`${e.label} (${e.name})`}>
            <div className="sf-form">
              <Field label="Event Type">
                <Txt value={e.eventType} onChange={() => {}} readOnly />
              </Field>
              <Field label="Publish Behavior">
                <Sel value={e.publishBehavior} onChange={(v) => plain((s) => sf.setPublishBehavior(s, orgName, e.name, v))} options={sf.PUBLISH_BEHAVIORS} />
              </Field>
            </div>
            <Table heads={['Field Label', 'API Name', 'Data Type', 'Required']} rows={e.fields.map((x) => [x.label, x.name, x.type, x.required ? 'Yes' : ''])} />
            <h3 className="sf-sub">Subscriptions</h3>
            <Table
              heads={['Subscriber', 'Type', 'Replay ID', 'Tip', 'Behind', 'Status', 'Last Error', '']}
              rows={subs.map((x) => [
                x.name,
                x.kind,
                x.position,
                info.latest ?? org.replay,
                Math.max(0, info.events.filter((ev) => ev.replayId > x.position).length),
                x.status,
                x.lastError ?? '',
                <span key="b" className="sf-row">
                  {x.status === 'Running' ? <Btn onClick={() => plain((s) => sf.setSubscriber(s, orgName, x.name, 'suspend'))}>Suspend</Btn> : <Btn onClick={() => plain((s) => sf.setSubscriber(s, orgName, x.name, 'resume'))}>Resume</Btn>}
                  <Btn onClick={() => plain((s) => sf.setSubscriber(s, orgName, x.name, 'tip'))}>Resume from Tip</Btn>
                </span>,
              ])}
              empty="No Apex trigger or flow subscribes to this event."
            />
          </Card>
        )
      })}
      <Bus org={org} now={now} />
    </>
  )
}

// ---------- Bulk Data Load Jobs ----------

function Bulk({ org, to }) {
  const jobs = [...(org.jobs ?? [])].reverse()
  return (
    <>
      <Head title="Bulk Data Load Jobs" />
      <Table
        heads={['Job ID', 'Submitted By', 'Start Time', 'Object', 'Operation', 'Status', 'Records Processed', 'Records Failed', 'Job Type']}
        rows={jobs.map((j) => [
          <button key="i" type="button" className="sf-a" onClick={() => to({ view: 'job', job: j.id })}>
            {j.id.slice(0, 15)}
          </button>,
          j.createdById,
          when(sf.timeOf(j.createdDate)),
          j.object,
          j.operation,
          <span key="s" className={j.state === 'Failed' || j.numberRecordsFailed ? 'sf-bad' : j.state === 'JobComplete' ? 'sf-ok' : ''}>{j.state}</span>,
          n(j.numberRecordsProcessed),
          n(j.numberRecordsFailed),
          j.jobType === 'Classic' ? 'Bulk API' : 'Bulk API 2.0',
        ])}
        empty="No bulk jobs in the last 7 days."
      />
    </>
  )
}

function Job({ org, orgName, place, to, plain }) {
  const j = (org.jobs ?? []).find((x) => x.id === place.job)
  const [tab, setTab] = useState('failed')
  if (!j) return <p className="sf-empty">This job is no longer kept.</p>
  const csv = tab === 'failed' ? sf.failedCsv(j) : sf.successCsv(j)
  return (
    <>
      <Head kicker="Bulk Data Load Job" title={j.id}>
        {['Open', 'UploadComplete'].includes(j.state) && <Btn onClick={() => plain((s) => sf.abortBulkJob(s, orgName, j.id))}>Abort Job</Btn>}
        <Btn onClick={() => to({ view: 'bulk' })}>Back to jobs</Btn>
      </Head>
      <Card title="Job Detail">
        <Detail
          rows={[
            ['Object', j.object],
            ['Operation', j.operation],
            ['External ID Field', j.externalIdFieldName ?? ''],
            ['Status', j.state],
            ['State Message', j.errorMessage ?? ''],
            ['Concurrency Mode', j.concurrencyMode],
            ['Content Type', j.contentType],
            ['API Version', j.apiVersion.toFixed(1)],
            ['Job Type', j.jobType],
            ['Records Processed', n(j.numberRecordsProcessed)],
            ['Records Failed', n(j.numberRecordsFailed)],
            ['Retries', j.retries],
            ['Total Processing Time (ms)', n(j.totalProcessingTime)],
            ['Created By', j.createdById],
            ['Start Time', when(sf.timeOf(j.createdDate))],
          ]}
        />
      </Card>
      <Card
        title="Results"
        actions={
          <div className="sf-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'failed'} className={tab === 'failed' ? 'on' : ''} onClick={() => setTab('failed')}>
              failedResults
            </button>
            <button type="button" role="tab" aria-selected={tab === 'ok'} className={tab === 'ok' ? 'on' : ''} onClick={() => setTab('ok')}>
              successfulResults
            </button>
          </div>
        }
      >
        <pre className="sf-pre">{csv}</pre>
        <p className="sf-note">GET /services/data/v61.0/jobs/ingest/{j.id.slice(0, 15)}/{tab === 'failed' ? 'failedResults' : 'successfulResults'}. Lab made: the lab keeps up to 50 failed rows and 10 successful rows, for the last 8 jobs only.{j.trimmed ? ' The rows of this job are no longer kept.' : ''}</p>
      </Card>
    </>
  )
}

// ---------- Accounts and the Developer Console ----------

function Accounts({ org, orgName, plain }) {
  const groups = sf.duplicateGroups(org)
  const [master, setMaster] = useState({})
  const list = sf.recordsOf(org, 'Account')
  return (
    <>
      <Head kicker="Accounts" title="All Accounts" />
      <Card title={`Possible duplicates by Harbor Customer Id (${groups.length})`}>
        {groups.length === 0 && <p className="sf-empty">No two accounts share a Harbor Customer Id.</p>}
        {groups.map((g) => {
          const key = g[0].Harbor_Customer_Id__c
          const m = master[key] ?? g[0].Id
          return (
            <div key={key} className="sf-dupe">
              <b>{key}</b>
              {g.map((r) => (
                <label key={r.Id} className="sf-check">
                  <input type="radio" name={`m-${key}`} checked={m === r.Id} onChange={() => setMaster({ ...master, [key]: r.Id })} /> Master record: {r.Name} ({r.Id}), {r.BillingCity ?? ''} created {when(sf.timeOf(r.CreatedDate))}
                </label>
              ))}
              <Btn
                kind="brand"
                onClick={() =>
                  plain((s) =>
                    sf.mergeAccounts(
                      s,
                      orgName,
                      m,
                      g.map((r) => r.Id),
                    ),
                  )
                }
              >
                Merge Accounts
              </Btn>
            </div>
          )
        })}
      </Card>
      <Table heads={['Account Name', 'Harbor Customer Id', 'Type', 'Billing City', 'Billing Country', 'Loyalty Tier', 'Last Modified']} rows={list.slice(-60).reverse().map((r) => [r.Name, r.Harbor_Customer_Id__c ?? '', r.Type ?? '', r.BillingCity ?? '', r.BillingCountry ?? '', r.Loyalty_Tier__c ?? '', when(sf.timeOf(r.LastModifiedDate))])} />
      {list.length > 60 && <p className="sf-note">Showing the 60 most recent of {n(list.length)} accounts.</p>}
    </>
  )
}

function Console({ state, orgName, update }) {
  const [text, setText] = useState(START_SOQL)
  const [out, setOut] = useState(null)
  const run = () => {
    const r = sf.soql(state, orgName, text)
    update((s) => mark(sf.soql(s, orgName, text).state, 'sf:soql'))
    setOut(r.result)
  }
  const rows = useMemo(() => (out?.ok ? out.records.slice(0, 200) : []), [out])
  return (
    <div className="sf-dev">
      <div className="sf-dev-bar">
        <b>Developer Console</b>
        <span>File</span>
        <span>Edit</span>
        <span>Debug</span>
      </div>
      <div className="sf-dev-tabs">Query Editor</div>
      <textarea className="sf-dev-text" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Query Editor" />
      <div className="sf-row">
        <Btn onClick={run}>Execute</Btn>
      </div>
      {out && !out.ok && <pre className="sf-dev-err">{out.error}</pre>}
      {out?.ok && (
        <>
          <p className="sf-dev-count">Query Results - Total Rows: {n(out.totalSize)}</p>
          {!out.countOnly && <Table heads={out.columns} rows={rows.map((r) => out.columns.map((c) => cell(r[c])))} />}
          {out.records.length > 200 && <p className="sf-note">The grid shows the first 200 rows.</p>}
        </>
      )}
    </div>
  )
}
