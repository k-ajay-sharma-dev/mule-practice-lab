// Dynamics and SharePoint: the Microsoft side of Brightmart's CRM integrations, on the engine of platform-msgraph.js.
// App registrations in the style of the Microsoft Entra admin center (secrets, certificates, API permissions, admin
// consent), Dataverse tables, keys, application users and security roles in the style of Power Apps, SharePoint sites
// and document libraries as Graph sees them, and the request log of every token, Dataverse and Graph call with the
// throttling of each app. A lab tool: one admin of the tenant Brightmart Retail does everything.
import { useEffect, useMemo, useState } from 'react'
import { mark, stamp, timeText } from '../../lab/platform.js'
import {
  addCert, addKey, addPermission, addSecret, appUserOf, colLabel, createAppUser, deleteKey, deleteRegistration, deleteRole, deleteRows, dupesOf, grantConsent, grantSite, isFilled, isGranted, keysOf, LOGIN_URL, MIB,
  ORG_URL, permKey, PERMISSIONS, PRIVS, quotaOf, reactivateKey, registerApp, removeAppUser, removeCert, removePermission, removeSecret, revokeConsent, rowsOf, saveRole, SECRET_DAYS, secretHint, secretState, setNotify,
  setUserRoles, SP_HOST, TABLES, TENANT, TENANT_ID, TENANT_NAME, upgradeMsgraph,
} from '../../lab/platform-msgraph.js'
import { Btn, Check, Copy, Field, Input, Note, Select, Tabs, Table } from './parts.jsx'

const TABS = ['App registrations', 'Dataverse', 'SharePoint', 'Request log']
const BLADES = ['Overview', 'Certificates & secrets', 'API permissions', 'Expiry alerts']
const bytes = (n) => (n >= MIB ? `${(n / MIB).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`)
const day = (t) => stamp(t).slice(0, 10)
const Badge = ({ kind, children }) => <span className={`ms-gr-badge ${kind}`}>{children}</span>
const stateKind = (x) => (x === 'Expired' || x === 'Failed' ? 'bad' : x === 'Expiring soon' || x === 'Pending' ? 'warn' : 'good')

export default function Dynamics({ state, update, place }) {
  const m = state.msgraph
  const [tab, setTab] = useState(TABS.includes(place?.tab) ? place.tab : TABS[0])

  // a save from before this screen was built, or the open console, holds a placeholder: build the tenant on first open
  useEffect(() => {
    if (m && !isFilled(m)) update((s) => upgradeMsgraph(s))
  }, [m, update])
  useEffect(() => {
    if (!isFilled(m)) return
    if (tab === 'App registrations') update((s) => mark(s, 'msgraph:entra'))
    if (tab === 'Request log') update((s) => mark(s, 'msgraph:log'))
  }, [tab, Boolean(isFilled(m))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!m)
    return (
      <main className="pc-main">
        <h2>Dynamics and SharePoint</h2>
        <p className="pc-empty pc-boxed">This lab has no Microsoft tenant.</p>
      </main>
    )
  if (!isFilled(m)) return <main className="pc-main">Opening the tenant...</main>

  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const props = { m, state, update, act, place: place ?? {} }
  return (
    <main className="pc-main ms-gr">
      <header className="ms-gr-top">
        <b>Microsoft 365</b>
        <span>{TENANT_NAME}</span>
        <span className="ms-gr-dim">{TENANT}</span>
        <span className="ms-gr-lab">Lab copy</span>
      </header>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'App registrations' && <Entra {...props} />}
      {tab === 'Dataverse' && <Dataverse {...props} />}
      {tab === 'SharePoint' && <SharePoint {...props} />}
      {tab === 'Request log' && <RequestLog {...props} />}
    </main>
  )
}

// ---------- Entra ID: app registrations ----------

function Entra({ m, state, update, act, place }) {
  const [open, setOpen] = useState(place.app ?? null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const reg = m.apps.find((a) => a.appId === open)
  useEffect(() => {
    if (reg) update((s) => mark(s, `msgraph:app:${reg.appId}`))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (reg) return <Registration reg={reg} state={state} act={act} back={() => setOpen(null)} blade={place.blade} />
  const worst = (r) => {
    const list = r.secrets.map((x) => secretState(x, state.clock))
    return list.includes('Expired') ? 'Expired' : list.includes('Expiring soon') ? 'Expiring soon' : list.length ? 'Current' : 'None'
  }
  return (
    <section className="ms-gr-panel" aria-label="App registrations">
      <h2>App registrations</h2>
      <form
        className="ms-gr-form"
        onSubmit={(e) => {
          e.preventDefault()
          const r = act((s) => registerApp(s, name))
          if (r?.error) return setErr(r.error)
          setErr('')
          setName('')
          setOpen(r.appId)
        }}
      >
        <Field label="New registration: display name">
          <Input value={name} onChange={setName} placeholder="brightmart-my-app" />
        </Field>
        <Btn kind="primary" type="submit" disabled={!name.trim()}>
          Register
        </Btn>
        <span className="ms-gr-dim">Supported account types: this organization only (single tenant)</span>
      </form>
      {err && <p className="ms-gr-err">{err}</p>}
      <Table
        heads={['Display name', 'Application (client) ID', 'Created on', 'Certificates & secrets']}
        rows={m.apps.map((r) => (
          <tr key={r.appId}>
            <td>
              <button type="button" className="pc-link" onClick={() => setOpen(r.appId)}>
                {r.name}
              </button>
            </td>
            <td className="pc-mono">{r.appId}</td>
            <td>{day(r.t)}</td>
            <td>{worst(r) === 'None' ? <span className="ms-gr-dim">No secrets</span> : <Badge kind={stateKind(worst(r))}>{worst(r)}</Badge>}</td>
          </tr>
        ))}
        empty="No app registrations in this tenant."
      />
    </section>
  )
}

function Registration({ reg, state, act, back, blade: first }) {
  const [blade, setBlade] = useState(BLADES.includes(first) ? first : BLADES[0])
  return (
    <section className="ms-gr-panel" aria-label={reg.name}>
      <button type="button" className="pc-link" onClick={back}>
        App registrations
      </button>
      <h2>{reg.name}</h2>
      <div className="ms-gr-split">
        <nav className="ms-gr-nav" aria-label="Manage">
          {BLADES.map((b) => (
            <button key={b} type="button" className={blade === b ? 'on' : ''} aria-current={blade === b ? 'page' : undefined} onClick={() => setBlade(b)}>
              {b}
            </button>
          ))}
        </nav>
        <div className="ms-gr-body">
          {blade === 'Overview' && <Overview reg={reg} act={act} back={back} />}
          {blade === 'Certificates & secrets' && <Secrets key={reg.appId} reg={reg} now={state.clock} act={act} />}
          {blade === 'API permissions' && <Permissions reg={reg} act={act} />}
          {blade === 'Expiry alerts' && <Expiry key={reg.appId} reg={reg} act={act} />}
        </div>
      </div>
    </section>
  )
}

function Overview({ reg, act, back }) {
  const rows = [
    ['Display name', reg.name],
    ['Application (client) ID', reg.appId, true],
    ['Object ID', reg.objectId],
    ['Directory (tenant) ID', TENANT_ID, true],
    ['Supported account types', 'My organization only'],
    ['Client credentials', `${reg.certs.length} certificate${reg.certs.length === 1 ? '' : 's'}, ${reg.secrets.length} secret${reg.secrets.length === 1 ? '' : 's'}`],
    ['OAuth 2.0 token endpoint (v2)', LOGIN_URL, true],
    ['Dataverse scope', `${ORG_URL}/.default`, true],
    ['Graph scope', 'https://graph.microsoft.com/.default', true],
  ]
  return (
    <>
      <h3>Overview</h3>
      <dl className="ms-gr-dl">
        {rows.map(([k, v, copy]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>
              <span className="pc-mono">{v}</span> {copy && <Copy text={v} />}
            </dd>
          </div>
        ))}
      </dl>
      <div className="ms-gr-form">
        <Btn kind="danger" onClick={() => (act((s) => deleteRegistration(s, reg.appId)), back())}>
          Delete
        </Btn>
      </div>
    </>
  )
}

function Secrets({ reg, now, act }) {
  const [view, setView] = useState('Client secrets')
  const [desc, setDesc] = useState('')
  const [days, setDays] = useState('180')
  const [made, setMade] = useState(null)
  const [cert, setCert] = useState('')
  const [certDays, setCertDays] = useState('365')
  const [err, setErr] = useState('')
  return (
    <>
      <h3>Certificates & secrets</h3>
      <p className="ms-gr-dim">Credentials let the app authenticate as itself to the token endpoint. A certificate is safer than a client secret.</p>
      <Tabs tabs={['Client secrets', 'Certificates']} value={view} onChange={setView} kind="pill" />
      {view === 'Client secrets' ? (
        <>
          <form
            className="ms-gr-form"
            onSubmit={(e) => {
              e.preventDefault()
              const r = act((s) => addSecret(s, reg.appId, { desc, days: Number(days) }))
              if (r?.error) return setErr(r.error)
              setErr('')
              setMade(r)
              setDesc('')
            }}
          >
            <Field label="New client secret: description">
              <Input value={desc} onChange={setDesc} placeholder="mule-prod-2027" />
            </Field>
            <Field label="Expires">
              <Select value={days} onChange={setDays} options={SECRET_DAYS.map(([d, l]) => [String(d), d === 180 ? `Recommended: ${l}` : l])} />
            </Field>
            <Btn kind="primary" type="submit">
              Add
            </Btn>
          </form>
          {err && <p className="ms-gr-err">{err}</p>}
          {made && <Note>Copy the new client secret value now. It is not shown again after you leave this page. The Secret ID is not the secret.</Note>}
          <Table
            heads={['Description', 'Expires', 'Value', 'Secret ID', '']}
            rows={reg.secrets.map((x) => {
              const st = secretState(x, now)
              return (
                <tr key={x.id}>
                  <td>{x.desc}</td>
                  <td>
                    {day(x.end)} {st !== 'Current' && <Badge kind={stateKind(st)}>{st}</Badge>}
                  </td>
                  <td className="pc-mono">
                    {made?.id === x.id ? (
                      <>
                        <span className="ms-gr-value">{x.value}</span> <Copy text={x.value} />
                      </>
                    ) : (
                      secretHint(x)
                    )}
                  </td>
                  <td className="pc-mono">
                    <span className="ms-gr-value">{x.id}</span> <Copy text={x.id} />
                  </td>
                  <td>
                    <Btn onClick={() => act((s) => removeSecret(s, reg.appId, x.id))} aria-label={`Delete secret ${x.desc}`}>
                      Delete
                    </Btn>
                  </td>
                </tr>
              )
            })}
            empty="No client secrets have been created for this application."
          />
        </>
      ) : (
        <>
          <form
            className="ms-gr-form"
            onSubmit={(e) => {
              e.preventDefault()
              act((s) => addCert(s, reg.appId, { desc: cert, days: Number(certDays) }))
              setCert('')
            }}
          >
            <Field label="Upload certificate: subject" hint="Lab-made: the lab makes the public key and its thumbprint">
              <Input value={cert} onChange={setCert} placeholder="CN=brightmart-mule" />
            </Field>
            <Field label="Valid for days">
              <Input value={certDays} onChange={setCertDays} inputMode="numeric" />
            </Field>
            <Btn kind="primary" type="submit">
              Add
            </Btn>
          </form>
          <Table
            heads={['Thumbprint', 'Description', 'Start date', 'Expires', '']}
            rows={reg.certs.map((c) => (
              <tr key={c.thumb}>
                <td className="pc-mono">
                  <span className="ms-gr-value">{c.thumb}</span> <Copy text={c.thumb} />
                </td>
                <td>{c.desc}</td>
                <td>{day(c.start)}</td>
                <td>
                  {day(c.end)} {now >= c.end && <Badge kind="bad">Expired</Badge>}
                </td>
                <td>
                  <Btn onClick={() => act((s) => removeCert(s, reg.appId, c.thumb))}>Delete</Btn>
                </td>
              </tr>
            ))}
            empty="No certificates have been added for this application."
          />
        </>
      )}
    </>
  )
}

function Permissions({ reg, act }) {
  const [api, setApi] = useState('Microsoft Graph')
  const [type, setType] = useState('Application')
  const choices = PERMISSIONS[api].filter(([, t]) => t === type)
  const [perm, setPerm] = useState('')
  const pick = choices.some(([n]) => n === perm) ? perm : (choices[0]?.[0] ?? '')
  const describe = (p) => PERMISSIONS[p.api]?.find(([n, t]) => n === p.name && t === p.type)?.[2] ?? ''
  const pending = reg.perms.some((p) => !isGranted(reg, p))
  return (
    <>
      <h3>API permissions</h3>
      <p className="ms-gr-dim">Application permissions are used by an app that runs without a signed in user, and every one needs admin consent. Dataverse needs none for an app: it checks its application user.</p>
      <div className="ms-gr-form">
        <Btn kind="primary" disabled={!reg.perms.length} onClick={() => act((s) => grantConsent(s, reg.appId))}>
          Grant admin consent for {TENANT_NAME}
        </Btn>
        <Btn disabled={!reg.granted.length} onClick={() => act((s) => revokeConsent(s, reg.appId))}>
          Revoke admin consent
        </Btn>
        {pending && <Badge kind="warn">Not every permission has consent</Badge>}
      </div>
      <Table
        heads={['API / Permissions name', 'Type', 'Description', 'Admin consent required', 'Status', '']}
        rows={reg.perms.map((p) => (
          <tr key={permKey(p)}>
            <td>
              <span className="ms-gr-dim">{p.api}</span> <b>{p.name}</b>
            </td>
            <td>{p.type}</td>
            <td>{describe(p)}</td>
            <td>{p.type === 'Application' ? 'Yes' : 'No'}</td>
            <td>{isGranted(reg, p) ? <Badge kind="good">Granted for {TENANT_NAME}</Badge> : <Badge kind="warn">Not granted for {TENANT_NAME}</Badge>}</td>
            <td>
              <Btn onClick={() => act((s) => removePermission(s, reg.appId, permKey(p)))}>Remove permission</Btn>
            </td>
          </tr>
        ))}
        empty="No permissions added."
      />
      <form
        className="ms-gr-form ms-gr-boxed"
        onSubmit={(e) => {
          e.preventDefault()
          act((s) => addPermission(s, reg.appId, { api, name: pick, type }))
        }}
      >
        <b>Add a permission</b>
        <Field label="API">
          <Select value={api} onChange={setApi} options={Object.keys(PERMISSIONS)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={setType} options={[['Delegated', 'Delegated permissions'], ['Application', 'Application permissions']]} />
        </Field>
        <Field label="Permission">
          <Select value={pick} onChange={setPerm} options={choices.map(([n, , d]) => [n, `${n}: ${d}`])} disabled={!choices.length} />
        </Field>
        <Btn kind="primary" type="submit" disabled={!pick}>
          Add permissions
        </Btn>
      </form>
    </>
  )
}

function Expiry({ reg, act }) {
  const [days, setDays] = useState(String(reg.notify?.days ?? '30'))
  const [to, setTo] = useState(reg.notify?.to ?? '')
  return (
    <>
      <h3>Expiry alerts</h3>
      <Note>Lab-made: Entra ID itself sends no mail when a secret is about to expire. A tenant uses a scheduled script, an Azure Monitor alert or a Logic App that reads the passwordCredentials of the app. This page stands for that.</Note>
      <form
        className="ms-gr-form"
        onSubmit={(e) => {
          e.preventDefault()
          act((s) => setNotify(s, reg.appId, { days, to }))
        }}
      >
        <Field label="Days before expiry">
          <Input value={days} onChange={setDays} inputMode="numeric" />
        </Field>
        <Field label="Send to">
          <Input value={to} onChange={setTo} placeholder="team@brightmart.example" />
        </Field>
        <Btn kind="primary" type="submit">
          Save
        </Btn>
      </form>
      <p>{reg.notify ? `A mail goes to ${reg.notify.to} when a secret has ${reg.notify.days} days or less left.` : 'No expiry alert is set.'}</p>
    </>
  )
}

// ---------- Dataverse ----------

function Dataverse({ m, update, act, place }) {
  const [page, setPage] = useState(TABLES[place.page] || ['users', 'roles'].includes(place.page) ? place.page : 'account')
  useEffect(() => {
    const key = TABLES[page] ? `msgraph:table:${page}` : page === 'users' ? 'msgraph:appusers' : 'msgraph:roles'
    update((s) => mark(s, key))
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="ms-gr-panel" aria-label="Dataverse">
      <h2>
        Dataverse <span className="ms-gr-dim">{ORG_URL}</span>
      </h2>
      <div className="ms-gr-split">
        <nav className="ms-gr-nav" aria-label="Dataverse">
          <b>Tables</b>
          {Object.entries(TABLES).map(([k, d]) => (
            <button key={k} type="button" className={page === k ? 'on' : ''} onClick={() => setPage(k)}>
              {d.label}
            </button>
          ))}
          <b>Security</b>
          <button type="button" className={page === 'users' ? 'on' : ''} onClick={() => setPage('users')}>
            Application users
          </button>
          <button type="button" className={page === 'roles' ? 'on' : ''} onClick={() => setPage('roles')}>
            Security roles
          </button>
        </nav>
        <div className="ms-gr-body">
          {TABLES[page] && <TableView key={page} table={page} m={m} act={act} first={place.view} />}
          {page === 'users' && <AppUsers m={m} act={act} />}
          {page === 'roles' && <Roles m={m} act={act} />}
        </div>
      </div>
    </section>
  )
}

function TableView({ table, m, act, first }) {
  const d = TABLES[table]
  const [view, setView] = useState(first === 'Keys' ? 'Keys' : 'Rows')
  const [find, setFind] = useState('')
  const [dupeCol, setDupeCol] = useState('')
  const [picked, setPicked] = useState([])
  const [keyName, setKeyName] = useState('')
  const [keyCol, setKeyCol] = useState(Object.keys(d.cols)[1] ?? Object.keys(d.cols)[0])
  const [err, setErr] = useState('')
  const cols = Object.keys(d.cols)
  const all = rowsOf(m, table)
  const dupes = dupeCol ? dupesOf(m, table, dupeCol) : []
  const shown = useMemo(() => {
    let list = [...all]
    if (dupeCol) {
      const vals = new Set(dupes.map((r) => String(r[dupeCol]).toLowerCase()))
      list = list.filter((r) => vals.has(String(r[dupeCol] ?? '').toLowerCase()))
      list.sort((a, b) => String(a[dupeCol]).localeCompare(String(b[dupeCol])) || a.createdon - b.createdon)
    }
    const q = find.trim().toLowerCase()
    if (q) list = list.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(q)))
    return list
  }, [all, dupeCol, find]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id, on) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))
  return (
    <>
      <h3>
        {d.label} <span className="ms-gr-dim">{d.set}</span>
      </h3>
      <Tabs tabs={['Rows', 'Keys']} value={view} onChange={setView} kind="pill" />
      {view === 'Rows' ? (
        <>
          <div className="ms-gr-form">
            <Field label="Search">
              <Input value={find} onChange={setFind} placeholder="Filter by keyword" />
            </Field>
            <Field label="Show duplicates of">
              <Select value={dupeCol} onChange={(v) => (setDupeCol(v), setPicked([]))} placeholder="(all rows)" options={cols.map((c) => [c, colLabel(c)])} />
            </Field>
            {dupeCol && (
              <Btn onClick={() => setPicked(dupes.map((r) => r[d.id]))} disabled={!dupes.length}>
                Select all but the oldest
              </Btn>
            )}
            <Btn kind="danger" disabled={!picked.length} onClick={() => (act((s) => deleteRows(s, table, picked)), setPicked([]))}>
              Delete {picked.length || ''}
            </Btn>
          </div>
          <p className="ms-gr-dim">
            {all.length} rows{dupeCol && `, ${dupes.length} duplicates of ${colLabel(dupeCol)}`}
            {shown.length > 200 && ', the first 200 shown'}
          </p>
          <Table
            heads={['', ...cols.map(colLabel), 'Created on', 'Modified on', 'Created by']}
            rows={shown.slice(0, 200).map((r) => (
              <tr key={r[d.id]}>
                <td>
                  <Check checked={picked.includes(r[d.id])} onChange={(on) => toggle(r[d.id], on)} aria-label={`Select ${r[d.primary] ?? r[d.id]}`} />
                </td>
                {cols.map((c) => (
                  <td key={c}>{r[c] ?? ''}</td>
                ))}
                <td>{stamp(r.createdon).slice(0, 16)}</td>
                <td>{stamp(r.modifiedon).slice(0, 16)}</td>
                <td>{r.by}</td>
              </tr>
            ))}
            empty="No rows."
          />
        </>
      ) : (
        <>
          <p className="ms-gr-dim">An alternate key makes a set of columns unique and lets the Web API address a row by it, as in PATCH /{d.set}(column='value'). Dataverse builds its index in the background.</p>
          <form
            className="ms-gr-form"
            onSubmit={(e) => {
              e.preventDefault()
              const r = act((s) => addKey(s, table, { name: keyName.trim() ? `brightmart_${keyName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')}` : '', cols: [keyCol] }))
              if (r?.error) return setErr(r.error)
              setErr('')
              setKeyName('')
            }}
          >
            <Field label="New key: display name">
              <Input value={keyName} onChange={setKeyName} placeholder="Account Number Key" />
            </Field>
            <Field label="Column">
              <Select value={keyCol} onChange={setKeyCol} options={cols.map((c) => [c, colLabel(c)])} />
            </Field>
            <Btn kind="primary" type="submit">
              Save
            </Btn>
          </form>
          {err && <p className="ms-gr-err">{err}</p>}
          <Table
            heads={['Name', 'Columns', 'Status', '']}
            rows={keysOf(m, table).map((k) => (
              <tr key={k.name}>
                <td className="pc-mono">{k.name}</td>
                <td>{k.cols.map(colLabel).join(', ')}</td>
                <td>
                  <Badge kind={stateKind(k.status)}>{k.status}</Badge> {k.status === 'Failed' && <span className="ms-gr-dim">The data has duplicate values. Remove them, then Reactivate.</span>}
                  {k.status === 'Pending' && <span className="ms-gr-dim">The index is being built. Move the clock a minute.</span>}
                </td>
                <td>
                  {k.status === 'Failed' && <Btn onClick={() => act((s) => reactivateKey(s, table, k.name))}>Reactivate</Btn>} <Btn onClick={() => act((s) => deleteKey(s, table, k.name))}>Delete</Btn>
                </td>
              </tr>
            ))}
            empty="No alternate keys."
          />
        </>
      )}
    </>
  )
}

function AppUsers({ m, act }) {
  const free = m.apps.filter((a) => !appUserOf(m, a.appId))
  const [appId, setAppId] = useState('')
  const [roles, setRoles] = useState([])
  const [editing, setEditing] = useState(null)
  const [editRoles, setEditRoles] = useState([])
  const [err, setErr] = useState('')
  const names = Object.keys(m.dv.roles)
  const pick = free.some((a) => a.appId === appId) ? appId : (free[0]?.appId ?? '')
  const roleBoxes = (list, set) => (
    <span className="ms-gr-checks">
      {names.map((r) => (
        <Check key={r} checked={list.includes(r)} onChange={(on) => set(on ? [...list, r] : list.filter((x) => x !== r))}>
          {r}
        </Check>
      ))}
    </span>
  )
  return (
    <>
      <h3>Application users</h3>
      <p className="ms-gr-dim">An application user stands for an app registration in this environment. Its security roles decide what the app may do, table by table.</p>
      <form
        className="ms-gr-form ms-gr-boxed"
        onSubmit={(e) => {
          e.preventDefault()
          const r = act((s) => createAppUser(s, pick, roles))
          if (r?.error) return setErr(r.error)
          setErr('')
          setRoles([])
        }}
      >
        <b>New app user</b>
        <Field label="App">
          <Select value={pick} onChange={setAppId} options={free.map((a) => [a.appId, `${a.name} (${a.appId})`])} disabled={!free.length} />
        </Field>
        <Field label="Business unit">
          <Input value="brightmart" onChange={() => {}} readOnly />
        </Field>
        <Field label="Security roles">{roleBoxes(roles, setRoles)}</Field>
        <Btn kind="primary" type="submit" disabled={!pick}>
          Create
        </Btn>
      </form>
      {err && <p className="ms-gr-err">{err}</p>}
      <Table
        heads={['Name', 'App ID', 'Business unit', 'Security roles', 'Status', '']}
        rows={m.dv.users.map((u) => (
          <tr key={u.appId}>
            <td>{u.name}</td>
            <td className="pc-mono">{u.appId}</td>
            <td>brightmart</td>
            <td>
              {editing === u.appId ? (
                <>
                  {roleBoxes(editRoles, setEditRoles)}
                  <Btn kind="primary" onClick={() => (act((s) => setUserRoles(s, u.appId, editRoles)), setEditing(null))}>
                    Save
                  </Btn>
                </>
              ) : (
                u.roles.join(', ') || <span className="ms-gr-dim">No roles</span>
              )}
            </td>
            <td>Active</td>
            <td>
              <Btn onClick={() => (setEditing(u.appId), setEditRoles(u.roles))}>Manage roles</Btn> <Btn onClick={() => act((s) => removeAppUser(s, u.appId))}>Remove</Btn>
            </td>
          </tr>
        ))}
        empty="No application users."
      />
    </>
  )
}

function Roles({ m, act }) {
  const [name, setName] = useState('')
  const [privs, setPrivs] = useState({})
  const [err, setErr] = useState('')
  const names = Object.keys(m.dv.roles)
  const role = m.dv.roles[name]
  const locked = Boolean(role?.system)
  const open = (n) => {
    setName(n)
    setPrivs(structuredClone(m.dv.roles[n]?.privs ?? {}))
    setErr('')
  }
  const has = (t, p) => (privs[t] ?? []).includes(p)
  const flip = (t, p, on) => setPrivs((x) => ({ ...x, [t]: on ? [...(x[t] ?? []), p] : (x[t] ?? []).filter((y) => y !== p) }))
  return (
    <>
      <h3>Security roles</h3>
      <Table
        heads={['Role', 'Type', 'Privileges', '']}
        rows={names.map((n) => (
          <tr key={n}>
            <td>
              <button type="button" className="pc-link" onClick={() => open(n)}>
                {n}
              </button>
            </td>
            <td>{m.dv.roles[n].system ? 'System' : 'Custom'}</td>
            <td>
              {Object.entries(m.dv.roles[n].privs)
                .map(([t, l]) => `${TABLES[t]?.label ?? t}: ${l.join(', ')}`)
                .join('; ')}
            </td>
            <td>{!m.dv.roles[n].system && <Btn onClick={() => act((s) => deleteRole(s, n))}>Delete</Btn>}</td>
          </tr>
        ))}
      />
      <form
        className="ms-gr-boxed"
        onSubmit={(e) => {
          e.preventDefault()
          const r = act((s) => saveRole(s, name, privs))
          setErr(r?.error ?? '')
        }}
      >
        <div className="ms-gr-form">
          <Field label={role ? 'Role' : 'New role: name'}>
            <Input value={name} onChange={(v) => (setName(v), m.dv.roles[v] && setPrivs(structuredClone(m.dv.roles[v].privs)))} placeholder="Brightmart My App" />
          </Field>
          <Btn onClick={() => open('')}>New role</Btn>
        </div>
        <p className="ms-gr-dim">Lab-made: every privilege is at Organization level. {locked && 'System roles cannot be changed here.'}</p>
        <div className="pc-table-box">
          <table className="pc-table ms-gr-matrix">
            <thead>
              <tr>
                <th scope="col">Table</th>
                {PRIVS.map((p) => (
                  <th key={p} scope="col">
                    {p === 'AppendTo' ? 'Append To' : p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(TABLES).map(([t, d]) => (
                <tr key={t}>
                  <th scope="row">{d.label}</th>
                  {PRIVS.map((p) => (
                    <td key={p}>
                      <input type="checkbox" checked={has(t, p)} disabled={locked} onChange={(e) => flip(t, p, e.target.checked)} aria-label={`${p} on ${d.label}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ms-gr-form">
          <Btn kind="primary" type="submit" disabled={!name.trim() || locked}>
            Save
          </Btn>
        </div>
        {err && <p className="ms-gr-err">{err}</p>}
      </form>
    </>
  )
}

// ---------- SharePoint ----------

function SharePoint({ m, update, act, place }) {
  const [siteId, setSiteId] = useState(m.sites.find((x) => x.name === place.site)?.id ?? m.sites[0]?.id ?? '')
  const site = m.sites.find((x) => x.id === siteId) ?? m.sites[0]
  const [driveId, setDriveId] = useState('')
  const drive = site?.drives.find((d) => d.id === driveId) ?? site?.drives[0]
  const [app, setApp] = useState('')
  const [role, setRole] = useState('write')
  useEffect(() => {
    if (site) update((s) => mark(s, `msgraph:site:${site.id}`))
  }, [site?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (drive) update((s) => mark(s, `msgraph:drive:${drive.id}`))
  }, [drive?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!site) return <p className="pc-empty pc-boxed">No SharePoint sites.</p>
  const pickApp = m.apps.some((a) => a.appId === app) ? app : (m.apps[0]?.appId ?? '')
  const sessions = Object.entries(m.sessions).filter(([, x]) => site.drives.some((d) => d.id === x.drive))
  const items = [...(drive?.items ?? [])].sort((a, b) => b.t - a.t || a.name.localeCompare(b.name))
  return (
    <section className="ms-gr-panel" aria-label="SharePoint">
      <h2>SharePoint</h2>
      <div className="ms-gr-split">
        <nav className="ms-gr-nav" aria-label="Sites">
          <b>Sites</b>
          {m.sites.map((x) => (
            <button key={x.id} type="button" className={x.id === site.id ? 'on' : ''} onClick={() => (setSiteId(x.id), setDriveId(''))}>
              {x.name}
            </button>
          ))}
        </nav>
        <div className="ms-gr-body">
          <h3>{site.name}</h3>
          <dl className="ms-gr-dl">
            <div>
              <dt>URL</dt>
              <dd className="pc-mono">
                https://{SP_HOST}/sites/{site.name}
              </dd>
            </div>
            <div>
              <dt>Site ID (Graph)</dt>
              <dd className="pc-mono">
                <span className="ms-gr-value">{site.id}</span> <Copy text={site.id} />
              </dd>
            </div>
          </dl>
          <h4>Document libraries</h4>
          <div className="ms-gr-form">
            {site.drives.map((d) => (
              <Btn key={d.id} kind={d.id === drive?.id ? 'primary' : 'default'} onClick={() => setDriveId(d.id)}>
                {d.name}
              </Btn>
            ))}
          </div>
          {drive && (
            <>
              <p className="pc-mono">
                Drive ID <span className="ms-gr-value">{drive.id}</span> <Copy text={drive.id} />
              </p>
              <p className="ms-gr-dim">
                {items.length} files{items.length > 200 && ', the newest 200 shown'}
              </p>
              <Table
                heads={['Name', 'Modified', 'Modified By', 'File size']}
                rows={items.slice(0, 200).map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{stamp(i.t).slice(0, 16)}</td>
                    <td>{i.by}</td>
                    <td>{bytes(i.size)}</td>
                  </tr>
                ))}
                empty="This library is empty."
              />
            </>
          )}
          {sessions.length > 0 && (
            <>
              <h4>Upload sessions in progress</h4>
              <Table
                heads={['File', 'App', 'Received', 'Last fragment']}
                rows={sessions.map(([id, x]) => (
                  <tr key={id}>
                    <td>{x.name}</td>
                    <td>{x.who}</td>
                    <td>
                      {bytes(x.next)} of {x.size ? bytes(x.size) : 'unknown'}
                    </td>
                    <td>{timeText(x.t)}</td>
                  </tr>
                ))}
              />
            </>
          )}
          <h4>Site permissions (Sites.Selected)</h4>
          <p className="ms-gr-dim">An app with the application permission Sites.Selected reaches only the sites granted here. In a tenant an admin calls POST /v1.0/sites/{'{site-id}'}/permissions.</p>
          <form
            className="ms-gr-form"
            onSubmit={(e) => {
              e.preventDefault()
              act((s) => grantSite(s, site.id, pickApp, role))
            }}
          >
            <Field label="App">
              <Select value={pickApp} onChange={setApp} options={m.apps.map((a) => [a.appId, a.name])} disabled={!m.apps.length} />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={setRole} options={['read', 'write']} />
            </Field>
            <Btn kind="primary" type="submit" disabled={!pickApp}>
              Grant
            </Btn>
          </form>
          <Table
            heads={['App', 'App ID', 'Role', '']}
            rows={Object.entries(site.grants).map(([id, r]) => (
              <tr key={id}>
                <td>{m.apps.find((a) => a.appId === id)?.name ?? '(deleted app)'}</td>
                <td className="pc-mono">{id}</td>
                <td>{r}</td>
                <td>
                  <Btn onClick={() => act((s) => grantSite(s, site.id, id, null))}>Revoke</Btn>
                </td>
              </tr>
            ))}
            empty="No app has access through Sites.Selected."
          />
        </div>
      </div>
    </section>
  )
}

// ---------- the request log ----------

function RequestLog({ m, state }) {
  const [who, setWho] = useState('')
  const [only, setOnly] = useState('all')
  const apps = [...new Set(m.log.map((e) => e.who))].sort()
  const list = [...m.log]
    .reverse()
    .filter((e) => (!who || e.who === who) && (only === 'all' || (only === 'errors' ? e.st >= 400 : e.st === 429)))
  const quota = Object.keys(m.quota).map((a) => [a, quotaOf(m, a, state.clock)])
  return (
    <section className="ms-gr-panel" aria-label="Request log">
      <h2>Request log</h2>
      <p className="ms-gr-dim">The last {m.log.length} calls of the apps to login.microsoftonline.com, Dataverse, Graph and SharePoint upload URLs. Lab-made limit: {m.limit} Graph requests per app per lab minute; each call during Retry-After adds 30 seconds.</p>
      {quota.length > 0 && (
        <div className="ms-gr-cards" aria-label="Throttling">
          {quota.map(([a, q]) => (
            <div key={a} className={q.until ? 'bad' : ''}>
              <small>{a}</small>
              <b>
                {q.used} / {m.limit}
              </b>
              <span>{q.until ? `Throttled until ${timeText(q.until)}` : 'Not throttled'}</span>
            </div>
          ))}
        </div>
      )}
      <div className="ms-gr-form">
        <Field label="App">
          <Select value={who} onChange={setWho} placeholder="All apps" options={apps} />
        </Field>
        <Field label="Status">
          <Select value={only} onChange={setOnly} options={[['all', 'All'], ['errors', 'Errors (4xx and 5xx)'], ['429', '429 only']]} />
        </Field>
      </div>
      <Table
        heads={['Time', 'App', 'API', 'Method', 'Path', 'Status', 'Code']}
        rows={list.map((e, i) => (
          <tr key={i} className={e.st >= 400 ? 'ms-gr-bad' : ''}>
            <td>{timeText(e.t)}</td>
            <td>{e.who}</td>
            <td>{e.api}</td>
            <td>{e.m}</td>
            <td className="pc-mono ms-gr-path">{e.p}</td>
            <td>{e.st}</td>
            <td className="pc-mono">{e.c}</td>
          </tr>
        ))}
        empty="No calls yet."
      />
      <Note>A token lasts about an hour (expires_in 3599), in the lab as in Entra ID. Dataverse answers 401 with WWW-Authenticate when the token is missing or expired; Graph answers 401 InvalidAuthenticationToken.</Note>
    </section>
  )
}
