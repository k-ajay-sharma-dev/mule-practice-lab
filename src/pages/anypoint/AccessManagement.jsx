// Access Management: the organization Brightmart, its business groups, users, teams, roles, connected apps, environments
// and the audit log. The rules live in lab/platform-access.js. Two lab tools sit at the end of the menu: Check access
// on a user, which shows what the platform would answer, and a CI pipeline that deploys with the Mule Maven plugin.
import { useEffect, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import {
  accessOf, addMember, addScopes, bgName, checkAccess, createConnectedApp, createEnvironment, createTeam, deleteConnectedApp, deleteTeam, effectiveGrants, envScoped, envsOf, grant, inviteUser,
  PERMISSIONS, reasonFor, removeMember, removeScope, revoke, revokeOldSecret, ROLE_NAMES, ROLES, rotateSecret, runPipeline, SCOPES, scopeEnvScoped, setPipelineAuth, setUserEnabled, teamsOf, TOKEN_URL, USER_GRANTS,
} from '../../lab/platform-access.js'
import { Btn, Check, Copy, Errors, Field, Input, Link, Modal, Note, Radios, Select, SideNav, Table, Tabs } from './parts.jsx'

const SECTIONS = ['Organization', 'Business Groups', 'Users', 'Teams', 'Roles', 'Connected Apps', 'Environments', 'Audit Log']
const SEEN = { Users: 'access:users', Teams: 'access:teams', Roles: 'access:roles', 'Connected Apps': 'access:connected-apps', 'Audit Log': 'access:audit', 'CI pipeline': 'access:ci' }
const ENV_NAMES = ['Sandbox', 'Production']
const PERM_NAMES = PERMISSIONS.map((p) => p[0])
const typeText = (t) => (t === 'user' ? 'App acts on behalf of a user' : 'App acts on its own behalf (client credentials)')
const what = (x) => x.role ?? x.perm
const scopeText = (s, x) => `${bgName(s, x.bg)}${x.env ? `, ${x.env}` : ''}`

export default function AccessManagement({ state, update, place, go }) {
  const a = accessOf(state)
  const section = place.section ?? 'Organization'
  useEffect(() => {
    if (SEEN[section]) update((s) => mark(s, SEEN[section]))
  }, [section, update])
  const items = [...SECTIONS.map((x) => [x, x]), ...(a.ci ? [null, { title: 'Lab tools' }, ['CI pipeline', 'CI pipeline (lab tool)']] : [])]
  const props = { state, update, place, go }
  return (
    <>
      <SideNav items={items} value={section} onPick={(x) => go({ section: x })} />
      <main className="pc-main am-main">
        {section === 'Organization' && <Organization {...props} />}
        {section === 'Business Groups' && <BusinessGroups {...props} />}
        {section === 'Users' && (place.user ? <UserPage key={place.user} {...props} username={place.user} /> : <Users {...props} />)}
        {section === 'Teams' && (place.team ? <TeamPage key={place.team} {...props} id={place.team} /> : <Teams {...props} />)}
        {section === 'Roles' && <Roles {...props} />}
        {section === 'Connected Apps' && (place.app ? <AppPage key={place.app} {...props} clientId={place.app} /> : <ConnectedApps {...props} />)}
        {section === 'Environments' && <Environments {...props} />}
        {section === 'Audit Log' && <AuditLog {...props} />}
        {section === 'CI pipeline' && a.ci && <Pipeline {...props} />}
      </main>
    </>
  )
}

const Crumb = ({ go, section, name }) => (
  <p className="pc-dim">
    <Link onClick={() => go({ section })}>{section}</Link> / {name}
  </p>
)
const Pill = ({ on, children }) => <span className={`am-pill ${on ? 'am-on' : 'am-off'}`}>{children}</span>

// ---------- organization and business groups ----------

function Organization({ state, go }) {
  const a = accessOf(state)
  const root = a.bgs.find((b) => !b.parent)
  return (
    <>
      <div className="pc-title">
        <h2>Organization</h2>
      </div>
      <dl className="am-facts">
        <dt>Name</dt>
        <dd>{root.name}</dd>
        <dt>Organization ID</dt>
        <dd className="pc-mono">7c1f0e52-brightmart-lab-0001</dd>
        <dt>Owner</dt>
        <dd>brightmart-admin</dd>
        <dt>Business groups</dt>
        <dd>{a.bgs.length - 1} below the root</dd>
        <dt>Users</dt>
        <dd>
          {a.users.filter((u) => u.enabled).length} enabled, {a.users.filter((u) => !u.enabled).length} disabled
        </dd>
        <dt>Connected apps</dt>
        <dd>{a.apps.length}</dd>
      </dl>
      <p className="pc-dim">The root organization holds the business groups. An Organization Administrator of a business group also administers the business groups below it; other permissions stay in the business group they are given in.</p>
      <Btn onClick={() => go({ section: 'Business Groups' })}>Business Groups</Btn>
    </>
  )
}

function BusinessGroups({ state }) {
  const a = accessOf(state)
  const rows = a.bgs.map((b) => (
    <tr key={b.id}>
      <td>
        {b.parent && <span className="am-indent">└ </span>}
        <b>{b.name}</b>
      </td>
      <td>{b.parent ? bgName(state, b.parent) : 'Root organization'}</td>
      <td>{envsOf(state, b.id).map((e) => e.name).join(', ')}</td>
      <td>{a.teams.filter((t) => t.bg === b.id).length}</td>
      <td>{a.users.filter((u) => u.bg === b.id).length}</td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Business Groups</h2>
      </div>
      <Table heads={['Name', 'Parent', 'Environments', 'Teams', 'Users']} rows={rows} />
    </>
  )
}

// ---------- users ----------

function Users({ state, update, go }) {
  const a = accessOf(state)
  const [invite, setInvite] = useState(null)
  const rows = a.users.map((u) => (
    <tr key={u.username}>
      <td>
        <Link onClick={() => go({ section: 'Users', user: u.username })}>{u.username}</Link>
      </td>
      <td>{u.name}</td>
      <td>{u.email}</td>
      <td>{bgName(state, u.bg)}</td>
      <td>{teamsOf(state, u.username).map((t) => t.name).join(', ') || 'None'}</td>
      <td>
        <Pill on={u.enabled}>{u.enabled ? 'Enabled' : 'Disabled'}</Pill>
      </td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Users</h2>
        <Btn kind="primary" onClick={() => setInvite({ username: '', name: '', bg: 'brightmart' })}>
          Invite Users
        </Btn>
      </div>
      <Table heads={['Username', 'Name', 'Email', 'Business group', 'Teams', 'Status']} rows={rows} />
      {invite && (
        <Modal
          title="Invite Users"
          onClose={() => setInvite(null)}
          foot={
            <>
              <Btn onClick={() => setInvite(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!/^[a-z0-9][a-z0-9._-]{2,40}$/i.test(invite.username) || a.users.some((u) => u.username === invite.username.toLowerCase())} onClick={() => (update((s) => inviteUser(s, invite)), setInvite(null))}>
                Invite
              </Btn>
            </>
          }
        >
          <Field label="Username" required>
            <Input value={invite.username} onChange={(v) => setInvite({ ...invite, username: v })} />
          </Field>
          <Field label="Name">
            <Input value={invite.name} onChange={(v) => setInvite({ ...invite, name: v })} />
          </Field>
          <Field label="Business group">
            <Select value={invite.bg} onChange={(v) => setInvite({ ...invite, bg: v })} options={a.bgs.map((b) => [b.id, b.name])} />
          </Field>
        </Modal>
      )}
    </>
  )
}

function UserPage({ state, update, go, username }) {
  const a = accessOf(state)
  const u = a.users.find((x) => x.username === username)
  const [tab, setTab] = useState('Permissions')
  useEffect(() => {
    update((s) => mark(s, 'access:users'))
  }, [update])
  if (!u) return <p className="pc-empty pc-boxed">There is no user {username}.</p>
  return (
    <>
      <Crumb go={go} section="Users" name={u.username} />
      <div className="pc-title">
        <h2>{u.name}</h2>
        <Pill on={u.enabled}>{u.enabled ? 'Enabled' : 'Disabled'}</Pill>
        <span className="pc-grow" />
        {u.username !== 'brightmart-admin' && <Btn onClick={() => update((s) => setUserEnabled(s, u.username, !u.enabled))}>{u.enabled ? 'Disable' : 'Enable'}</Btn>}
      </div>
      <p className="pc-dim">
        {u.username}, {u.email}, business group {bgName(state, u.bg)}.
      </p>
      <Tabs tabs={['Permissions', 'Teams', 'Roles']} value={tab} onChange={setTab} />
      {tab === 'Permissions' && <Matrix state={state} username={u.username} />}
      {tab === 'Teams' && <UserTeams state={state} username={u.username} go={go} />}
      {tab === 'Roles' && <Grants state={state} update={update} to={`user:${u.username}`} />}
      <CheckAccess state={state} update={update} username={u.username} />
    </>
  )
}

// a permission matrix: each permission per business group and environment, and where it comes from
function Matrix({ state, username }) {
  const a = accessOf(state)
  const cols = a.bgs.flatMap((b) => ENV_NAMES.map((env) => ({ bg: b.id, env })))
  return (
    <>
      <p className="pc-dim">What {username} can do, from direct permissions, roles and teams. Point at a mark to see where it comes from.</p>
      <div className="pc-table-box">
        <table className="pc-table am-matrix">
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {cols.map((c) => (
                <th key={`${c.bg}-${c.env}`} scope="col">
                  {bgName(state, c.bg)}
                  <small>{c.env}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map(([perm, product]) => (
              <tr key={perm}>
                <th scope="row">
                  {perm}
                  <small>{product}</small>
                </th>
                {cols.map((c) => {
                  const why = reasonFor(state, username, perm, envScoped(perm) ? c.env : null, c.bg)
                  return (
                    <td key={`${c.bg}-${c.env}`} className={why ? 'am-yes' : 'am-no'} title={why ?? 'Not granted'}>
                      {why ? '✓' : '·'}
                      <span className="am-sr">{why ? `Granted. ${why}` : 'Not granted'}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Where the permissions come from</h3>
      <Table
        heads={['Permission or role', 'Business group', 'Environment', 'From']}
        rows={effectiveGrants(state, username).map((x) => (
          <tr key={x.id}>
            <td>{what(x)}</td>
            <td>{bgName(state, x.bg)}</td>
            <td>{x.env ?? 'All'}</td>
            <td>{x.via}</td>
          </tr>
        ))}
        empty="This user has no permissions."
      />
    </>
  )
}

function UserTeams({ state, username, go }) {
  const rows = teamsOf(state, username).map((t) => (
    <tr key={t.id}>
      <td>
        <Link onClick={() => go({ section: 'Teams', team: t.id })}>{t.name}</Link>
      </td>
      <td>{bgName(state, t.bg)}</td>
    </tr>
  ))
  return <Table heads={['Team', 'Business group']} rows={rows} empty="This user is in no team." />
}

// The permissions and roles of a user or a team, and the form that adds one
function Grants({ state, update, to }) {
  const a = accessOf(state)
  const [form, setForm] = useState({ what: 'Read Applications', bg: 'ecom', env: 'Sandbox' })
  const scoped = ROLES[form.what] ? ROLES[form.what].env : envScoped(form.what)
  const rows = a.grants
    .filter((x) => x.to === to)
    .map((x) => (
      <tr key={x.id}>
        <td>{what(x)}</td>
        <td>{x.role ? 'Role' : 'Permission'}</td>
        <td>{bgName(state, x.bg)}</td>
        <td>{x.env ?? 'All'}</td>
        <td>
          <Btn onClick={() => update((s) => revoke(s, x.id))}>Remove</Btn>
        </td>
      </tr>
    ))
  return (
    <>
      <Table heads={['Permission or role', 'Kind', 'Business group', 'Environment', '']} rows={rows} empty="Nothing is given here." />
      <div className="am-form">
        <Field label="Permission or role">
          <Select value={form.what} onChange={(v) => setForm({ ...form, what: v })} options={[...PERM_NAMES.filter((p) => p !== 'Organization Administrator').map((p) => [p, p]), ...ROLE_NAMES.map((r) => [r, `Role: ${r}`])]} />
        </Field>
        <Field label="Business group">
          <Select value={form.bg} onChange={(v) => setForm({ ...form, bg: v })} options={a.bgs.map((b) => [b.id, b.name])} />
        </Field>
        <Field label="Environment" hint={scoped ? null : 'Not scoped to an environment'}>
          <Select value={scoped ? form.env : ''} disabled={!scoped} onChange={(v) => setForm({ ...form, env: v })} options={scoped ? envsOf(state, form.bg).map((e) => e.name) : [['', 'All']]} />
        </Field>
        <Btn kind="primary" onClick={() => update((s) => grant(s, to, form.what, form.bg, scoped ? form.env : null))}>
          Add permissions
        </Btn>
      </div>
    </>
  )
}

function CheckAccess({ state, update, username }) {
  const a = accessOf(state)
  const [form, setForm] = useState({ action: 'Manage Applications', bg: 'ecom', env: 'Production' })
  const [out, setOut] = useState(null)
  const scoped = envScoped(form.action)
  const run = () => {
    setOut(checkAccess(state, username, form.action, form.env, form.bg))
    update((s) => checkAccess(s, username, form.action, form.env, form.bg).state)
  }
  return (
    <section className="am-lab">
      <h3>Check access (lab tool)</h3>
      <p className="pc-dim">What the platform answers when {username} tries an action. The answer is written to the audit log.</p>
      <div className="am-form">
        <Field label="Action">
          <Select value={form.action} onChange={(v) => setForm({ ...form, action: v })} options={PERM_NAMES} />
        </Field>
        <Field label="Business group">
          <Select value={form.bg} onChange={(v) => setForm({ ...form, bg: v })} options={a.bgs.map((b) => [b.id, b.name])} />
        </Field>
        <Field label="Environment">
          <Select value={scoped ? form.env : ''} disabled={!scoped} onChange={(v) => setForm({ ...form, env: v })} options={scoped ? ENV_NAMES : [['', 'All']]} />
        </Field>
        <Btn kind="primary" onClick={run}>
          Check access
        </Btn>
      </div>
      {out && <p className={`am-answer ${out.allowed ? 'am-on' : 'am-off'}`}>{out.text}</p>}
    </section>
  )
}

// ---------- teams ----------

function Teams({ state, update, go }) {
  const a = accessOf(state)
  const [form, setForm] = useState(null)
  const rows = a.teams.map((t) => (
    <tr key={t.id}>
      <td>
        <Link onClick={() => go({ section: 'Teams', team: t.id })}>{t.name}</Link>
      </td>
      <td>{bgName(state, t.bg)}</td>
      <td>{t.members.length}</td>
      <td>{a.grants.filter((x) => x.to === `team:${t.id}`).length}</td>
    </tr>
  ))
  const taken = form && a.teams.some((t) => t.name.toLowerCase() === form.name.trim().toLowerCase())
  return (
    <>
      <div className="pc-title">
        <h2>Teams</h2>
        <Btn kind="primary" onClick={() => setForm({ name: '', bg: 'ecom' })}>
          Create Team
        </Btn>
      </div>
      <p className="pc-dim">A team gives its permissions to every member. People join and leave a team; the access follows.</p>
      <Table heads={['Name', 'Business group', 'Members', 'Permissions']} rows={rows} />
      {form && (
        <Modal
          title="Create Team"
          onClose={() => setForm(null)}
          foot={
            <>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
              <Btn
                kind="primary"
                disabled={!form.name.trim() || taken}
                onClick={() => {
                  update((s) => createTeam(s, form))
                  setForm(null)
                }}
              >
                Create
              </Btn>
            </>
          }
        >
          <Field label="Team name" required>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </Field>
          <Field label="Business group">
            <Select value={form.bg} onChange={(v) => setForm({ ...form, bg: v })} options={a.bgs.map((b) => [b.id, b.name])} />
          </Field>
          <Errors list={taken ? ['A team with this name exists.'] : []} />
        </Modal>
      )}
    </>
  )
}

function TeamPage({ state, update, go, id }) {
  const a = accessOf(state)
  const t = a.teams.find((x) => x.id === id)
  const [tab, setTab] = useState('Members')
  const [who, setWho] = useState('')
  if (!t) return <p className="pc-empty pc-boxed">This team was deleted.</p>
  const others = a.users.filter((u) => !t.members.includes(u.username))
  return (
    <>
      <Crumb go={go} section="Teams" name={t.name} />
      <div className="pc-title">
        <h2>{t.name}</h2>
        <span className="pc-grow" />
        {t.id !== 't1' && (
          <Btn
            onClick={() => {
              update((s) => deleteTeam(s, t.id))
              go({ section: 'Teams' })
            }}
          >
            Delete Team
          </Btn>
        )}
      </div>
      <p className="pc-dim">Business group {bgName(state, t.bg)}.</p>
      <Tabs tabs={['Members', 'Permissions']} value={tab} onChange={setTab} />
      {tab === 'Members' && (
        <>
          <Table
            heads={['Username', 'Name', '']}
            rows={t.members.map((m) => (
              <tr key={m}>
                <td>{m}</td>
                <td>{a.users.find((u) => u.username === m)?.name}</td>
                <td>
                  <Btn onClick={() => update((s) => removeMember(s, t.id, m))}>Remove</Btn>
                </td>
              </tr>
            ))}
            empty="No members."
          />
          <div className="am-form">
            <Field label="User">
              <Select value={who} onChange={setWho} placeholder="Choose a user" options={others.map((u) => [u.username, `${u.username} (${u.name})`])} />
            </Field>
            <Btn
              kind="primary"
              disabled={!who}
              onClick={() => {
                update((s) => addMember(s, t.id, who))
                setWho('')
              }}
            >
              Add Members
            </Btn>
          </div>
        </>
      )}
      {tab === 'Permissions' && <Grants state={state} update={update} to={`team:${t.id}`} />}
    </>
  )
}

// ---------- roles ----------

function Roles({ state }) {
  const a = accessOf(state)
  const holder = (x) => (x.to.startsWith('team:') ? `Team ${a.teams.find((t) => `team:${t.id}` === x.to)?.name}` : x.to.slice(5))
  const rows = ROLE_NAMES.map((r) => (
    <tr key={r}>
      <td>
        <b>{r}</b>
        <small className="am-sub">{ROLES[r].text}</small>
      </td>
      <td>{ROLES[r].perms.join(', ')}</td>
      <td>{ROLES[r].env ? 'One environment' : 'Business group'}</td>
      <td>
        {a.grants
          .filter((x) => x.role === r)
          .map((x) => `${holder(x)} in ${scopeText(state, x)}`)
          .join('; ') || 'Nobody'}
      </td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Roles</h2>
      </div>
      <p className="pc-dim">A role is a set of permissions. Give it to a team on the team page, or to a user under Users, Roles.</p>
      <Table heads={['Role', 'Permissions', 'Scope', 'Given to']} rows={rows} />
    </>
  )
}

// ---------- connected apps ----------

function ConnectedApps({ state, update, go }) {
  const a = accessOf(state)
  const [form, setForm] = useState(null)
  const rows = a.apps.map((x) => (
    <tr key={x.clientId}>
      <td>
        <Link onClick={() => go({ section: 'Connected Apps', app: x.clientId })}>{x.name}</Link>
      </td>
      <td>{typeText(x.type)}</td>
      <td className="pc-mono">{x.clientId}</td>
      <td>{x.scopes.length}</td>
      <td>{x.owner}</td>
    </tr>
  ))
  const save = () => {
    const input = { ...form, redirectUris: form.redirect ? [form.redirect.trim()] : [] }
    // the client ID comes from the name and a counter, so it is the same in the state the update gets
    const { clientId } = createConnectedApp(state, input)
    update((s) => createConnectedApp(s, input).state)
    setForm(null)
    go({ section: 'Connected Apps', app: clientId })
  }
  const ok = form && form.name.trim() && !a.apps.some((x) => x.name === form.name.trim()) && (form.type === 'client_credentials' || (form.grantTypes.length && (!form.grantTypes.includes('Authorization Code') || /^https?:\/\//.test(form.redirect))))
  return (
    <>
      <div className="pc-title">
        <h2>Connected Apps</h2>
        <Btn kind="primary" onClick={() => setForm({ name: '', type: 'client_credentials', grantTypes: [], redirect: '' })}>
          Create app
        </Btn>
      </div>
      <p className="pc-dim">A connected app lets a script, a pipeline or another system call Anypoint with OAuth 2.0, without a user login.</p>
      <Table heads={['Name', 'Type', 'Client ID', 'Scopes', 'Owner']} rows={rows} empty="No connected apps yet." />
      {form && (
        <Modal
          title="Create app"
          wide
          onClose={() => setForm(null)}
          foot={
            <>
              <Btn onClick={() => setForm(null)}>Cancel</Btn>
              <Btn kind="primary" disabled={!ok} onClick={save}>
                Save
              </Btn>
            </>
          }
        >
          <Field label="Name" required>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          </Field>
          <Radios
            name="am-type"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={[
              ['client_credentials', typeText('client_credentials'), 'For a pipeline or a backend that calls Anypoint for itself. Scopes are given per business group and environment.'],
              ['user', typeText('user'), 'For a tool a person signs in to. It can do what the user can, limited by its scopes.'],
            ]}
          />
          {form.type === 'user' && (
            <>
              <p className="pc-label">Grant types</p>
              {USER_GRANTS.map((x) => (
                <Check key={x} checked={form.grantTypes.includes(x)} onChange={(on) => setForm({ ...form, grantTypes: on ? [...form.grantTypes, x] : form.grantTypes.filter((y) => y !== x) })}>
                  {x}
                </Check>
              ))}
              <Field label="Redirect URIs" hint="Needed for Authorization Code">
                <Input value={form.redirect} onChange={(v) => setForm({ ...form, redirect: v })} placeholder="https://tools.brightmart.example/callback" />
              </Field>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

function AppPage({ state, update, go, clientId }) {
  const a = accessOf(state)
  const app = a.apps.find((x) => x.clientId === clientId)
  const [show, setShow] = useState(false)
  const [adding, setAdding] = useState(false)
  if (!app) return <p className="pc-empty pc-boxed">This connected app was deleted.</p>
  return (
    <>
      <Crumb go={go} section="Connected Apps" name={app.name} />
      <div className="pc-title">
        <h2>{app.name}</h2>
        <span className="pc-grow" />
        <Btn
          onClick={() => {
            update((s) => deleteConnectedApp(s, app.clientId))
            go({ section: 'Connected Apps' })
          }}
        >
          Delete
        </Btn>
      </div>
      <dl className="am-facts">
        <dt>Type</dt>
        <dd>{typeText(app.type)}</dd>
        <dt>Grant types</dt>
        <dd>{app.grantTypes.join(', ')}</dd>
        {app.redirectUris.length > 0 && (
          <>
            <dt>Redirect URIs</dt>
            <dd>{app.redirectUris.join(', ')}</dd>
          </>
        )}
        <dt>Client ID</dt>
        <dd className="pc-mono">
          {app.clientId} <Copy text={app.clientId} />
        </dd>
        <dt>Client Secret</dt>
        <dd className="pc-mono">
          {show ? app.secrets[0] : '•'.repeat(24)} <Btn onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</Btn> <Copy text={app.secrets[0]} />
        </dd>
        {app.secrets.length > 1 && (
          <>
            <dt>Old secret</dt>
            <dd>Still works until you revoke it.</dd>
          </>
        )}
        <dt>Token endpoint</dt>
        <dd className="pc-mono">
          POST {TOKEN_URL} <Copy text={TOKEN_URL} />
        </dd>
      </dl>
      <div className="am-actions">
        <Btn onClick={() => update((s) => rotateSecret(s, app.clientId))}>Rotate Secret</Btn>
        <Btn disabled={app.secrets.length < 2} onClick={() => update((s) => revokeOldSecret(s, app.clientId))}>
          Revoke Old Secret
        </Btn>
      </div>
      <h3>Scopes</h3>
      <Table
        heads={['Scope', 'Business group', 'Environment', '']}
        rows={app.scopes.map((x, i) => (
          <tr key={`${x.scope}-${x.bg}-${x.env}`}>
            <td>{x.scope}</td>
            <td>{bgName(state, x.bg)}</td>
            <td>{x.env ?? 'All'}</td>
            <td>
              <Btn onClick={() => update((s) => removeScope(s, app.clientId, i))}>Remove</Btn>
            </td>
          </tr>
        ))}
        empty="No scopes. A token of this app can do nothing yet."
      />
      <Btn kind="primary" onClick={() => setAdding(true)}>
        Add Scopes
      </Btn>
      {app.type === 'client_credentials' && (
        <pre className="am-code">{`curl -X POST ${TOKEN_URL} \\\n  -H "Content-Type: application/json" \\\n  -d '{"grant_type":"client_credentials","client_id":"${app.clientId}","client_secret":"<secret>"}'`}</pre>
      )}
      {adding && <AddScopes state={state} update={update} app={app} close={() => setAdding(false)} />}
    </>
  )
}

function AddScopes({ state, update, app, close }) {
  const a = accessOf(state)
  const [picked, setPicked] = useState([])
  const [bg, setBg] = useState('ecom')
  const [envs, setEnvs] = useState(['Sandbox'])
  const needsEnv = picked.some(scopeEnvScoped)
  const toggle = (list, set, x, on) => set(on ? [...list, x] : list.filter((y) => y !== x))
  const add = () => {
    const scopes = picked.flatMap((scope) => (scopeEnvScoped(scope) ? envs.map((env) => ({ scope, bg, env })) : [{ scope, bg, env: null }]))
    update((s) => addScopes(s, app.clientId, scopes))
    close()
  }
  return (
    <Modal
      title="Add Scopes"
      wide
      onClose={close}
      foot={
        <>
          <Btn onClick={close}>Cancel</Btn>
          <Btn kind="primary" disabled={!picked.length || (needsEnv && !envs.length)} onClick={add}>
            Add Scopes
          </Btn>
        </>
      }
    >
      <p className="pc-label">1. Scopes</p>
      <div className="am-scopes">
        {SCOPES.map(([name, env]) => (
          <Check key={name} checked={picked.includes(name)} onChange={(on) => toggle(picked, setPicked, name, on)}>
            {name}
            {env && <small> (per environment)</small>}
          </Check>
        ))}
      </div>
      <Field label="2. Business group">
        <Select value={bg} onChange={setBg} options={a.bgs.map((b) => [b.id, b.name])} />
      </Field>
      <p className="pc-label">3. Environments {needsEnv ? '' : '(none of the chosen scopes needs one)'}</p>
      {envsOf(state, bg).map((e) => (
        <Check key={e.id} checked={envs.includes(e.name)} disabled={!needsEnv} onChange={(on) => toggle(envs, setEnvs, e.name, on)}>
          {e.name} ({e.type})
        </Check>
      ))}
    </Modal>
  )
}

// ---------- environments and audit log ----------

function Environments({ state, update }) {
  const a = accessOf(state)
  const [form, setForm] = useState({ bg: 'ecom', name: '', type: 'Sandbox' })
  const rows = a.envs.map((e) => (
    <tr key={e.id}>
      <td>{bgName(state, e.bg)}</td>
      <td>
        <b>{e.name}</b>
      </td>
      <td>
        <span className={`am-type am-${e.type.toLowerCase()}`}>{e.type}</span>
      </td>
      <td className="pc-mono">{e.id}</td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Environments</h2>
      </div>
      <p className="pc-dim">Each business group has its own environments. A Production environment is meant for live traffic; a Sandbox one for building and testing. Permissions for Runtime Manager and API Manager are given per environment.</p>
      <Table heads={['Business group', 'Name', 'Type', 'ID']} rows={rows} />
      <div className="am-form">
        <Field label="Business group">
          <Select value={form.bg} onChange={(v) => setForm({ ...form, bg: v })} options={a.bgs.map((b) => [b.id, b.name])} />
        </Field>
        <Field label="Name">
          <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="QA" />
        </Field>
        <Field label="Type">
          <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={['Sandbox', 'Production']} />
        </Field>
        <Btn kind="primary" disabled={!form.name.trim()} onClick={() => (update((s) => createEnvironment(s, form)), setForm({ ...form, name: '' }))}>
          Add environment
        </Btn>
      </div>
      <Note>The console switch of the lab uses Sandbox and Production, so a new environment shows here only.</Note>
    </>
  )
}

function AuditLog({ state }) {
  const a = accessOf(state)
  const [text, setText] = useState('')
  const q = text.trim().toLowerCase()
  const list = [...a.audit].reverse().filter((e) => !q || Object.values(e).some((v) => String(v ?? '').toLowerCase().includes(q)))
  const rows = list.map((e, i) => (
    <tr key={i}>
      <td className="pc-mono">{stamp(e.t)}</td>
      <td>{e.user}</td>
      <td>{e.product}</td>
      <td>{e.action}</td>
      <td>
        {e.type}: {e.object}
      </td>
      <td>{bgName(state, e.bg)}</td>
      <td>{e.env ?? ''}</td>
      <td>
        <Pill on={e.result !== 'Denied' && e.result !== 'Failed'}>{e.result}</Pill>
      </td>
    </tr>
  ))
  return (
    <>
      <div className="pc-title">
        <h2>Audit Log</h2>
      </div>
      <Field label="Filter">
        <Input value={text} onChange={setText} placeholder="User, action, object or result" />
      </Field>
      <Table heads={['Timestamp', 'User', 'Product', 'Action', 'Object', 'Business group', 'Environment', 'Result']} rows={rows} empty="No entries." />
    </>
  )
}

// ---------- the CI pipeline, a lab tool ----------

function Pipeline({ state, update }) {
  const ci = accessOf(state).ci
  const [form, setForm] = useState(() => ({ type: ci.auth.type, username: ci.auth.username ?? '', password: ci.auth.password ?? '', clientId: ci.auth.clientId ?? '', clientSecret: ci.auth.clientSecret ?? '' }))
  const [open, setOpen] = useState(null)
  const runs = [...ci.runs].reverse()
  const shown = runs.find((r) => r.n === open) ?? runs[0]
  const pom =
    form.type === 'user'
      ? `<cloudhub2Deployment>\n  <uri>https://anypoint.mulesoft.com</uri>\n  <provider>MC</provider>\n  <environment>\${env}</environment>\n  <target>Cloudhub-US-East-2</target>\n  <username>\${anypoint.username}</username>\n  <password>\${anypoint.password}</password>\n</cloudhub2Deployment>`
      : `<cloudhub2Deployment>\n  <uri>https://anypoint.mulesoft.com</uri>\n  <provider>MC</provider>\n  <environment>\${env}</environment>\n  <target>Cloudhub-US-East-2</target>\n  <connectedAppClientId>\${anypoint.client.id}</connectedAppClientId>\n  <connectedAppClientSecret>\${anypoint.client.secret}</connectedAppClientSecret>\n  <connectedAppGrantType>client_credentials</connectedAppGrantType>\n</cloudhub2Deployment>`
  return (
    <>
      <div className="pc-title">
        <h2>{ci.name}</h2>
        <span className="pc-grow" />
        <Btn kind="primary" onClick={() => update(runPipeline)}>
          Run pipeline
        </Btn>
      </div>
      <Note>A lab tool: the build server of {ci.project}. It publishes to Exchange and deploys to Sandbox and Production in Ecommerce with the Mule Maven plugin. A run checks the login and the permissions; it does not change Runtime Manager.</Note>
      <div className="am-split">
        <section>
          <h3>Anypoint login (secret variables)</h3>
          <Radios
            name="am-ci"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={[
              ['user', 'Username and password'],
              ['connected-app', 'Connected app'],
            ]}
          />
          {form.type === 'user' ? (
            <>
              <Field label="anypoint.username">
                <Input value={form.username} onChange={(v) => setForm({ ...form, username: v })} autoComplete="off" />
              </Field>
              <Field label="anypoint.password">
                <Input type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} autoComplete="off" />
              </Field>
            </>
          ) : (
            <>
              <Field label="anypoint.client.id">
                <Input value={form.clientId} onChange={(v) => setForm({ ...form, clientId: v })} autoComplete="off" />
              </Field>
              <Field label="anypoint.client.secret">
                <Input type="password" value={form.clientSecret} onChange={(v) => setForm({ ...form, clientSecret: v })} autoComplete="off" />
              </Field>
            </>
          )}
          <Btn kind="primary" onClick={() => update((s) => setPipelineAuth(s, form))}>
            Save
          </Btn>
          <p className="pc-dim">Saved: {ci.auth.type === 'user' ? `user ${ci.auth.username}` : `connected app ${ci.auth.clientId || 'with no client ID'}`}</p>
        </section>
        <section>
          <h3>pom.xml, mule-maven-plugin</h3>
          <pre className="am-code">{pom}</pre>
        </section>
      </div>
      <h3>Runs</h3>
      <Table
        heads={['Run', 'Time', 'Login', 'Status']}
        rows={runs.map((r) => (
          <tr key={r.n} className={shown?.n === r.n ? 'am-picked' : ''}>
            <td>
              <Link onClick={() => setOpen(r.n)}>#{r.n}</Link>
            </td>
            <td className="pc-mono">{stamp(r.t)}</td>
            <td>{r.by}</td>
            <td>
              <Pill on={r.status === 'Succeeded'}>{r.status}</Pill>
            </td>
          </tr>
        ))}
        empty="No runs yet."
      />
      {shown && (
        <pre className="am-code am-log" aria-label={`Log of run ${shown.n}`}>
          {shown.lines.join('\n')}
        </pre>
      )}
    </>
  )
}
