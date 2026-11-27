// Access Management: business groups, users, teams, roles, permissions and connected apps, plus the secure properties
// tool (secure-properties-tool.jar). Pure and import free. Lives in state.access.
//
// State shape (state.access). The open console keeps only { created }: every reader goes through accessOf(), which
// falls back to the Brightmart seed, and the first change writes the seed into the state (ensureAccess). A save from before
// this module was built holds the same placeholder, so it needs no other upgrade.
//   created, n (a counter for ids and run numbers),
//   bgs: [{ id, name, parent }]            the root organization Brightmart and its business groups
//   envs: [{ id, bg, name, type }]         type 'Sandbox' or 'Production'
//   users: [{ username, name, email, enabled, bg, last }]
//   teams: [{ id, name, bg, members: [username] }]
//   grants: [{ id, to: 'user:<username>' | 'team:<id>', role?, perm?, bg, env }]   env is null for a permission that
//            is not scoped to an environment
//   apps: [{ clientId, name, type: 'client_credentials' | 'user', grantTypes, redirectUris, secrets: [current, old?],
//            scopes: [{ scope, bg, env }], owner, created, rotated, rotatedAt, enabled }]    the connected apps
//   audit: [{ t, user, product, action, type, object, bg, env, result }]
//   ci: { name, project, auth: { type: 'user', username, password } | { type: 'connected-app', clientId, clientSecret },
//         runs: [{ n, t, status, by, lines }] }      a lab tool: a CI pipeline that deploys with the Mule Maven plugin
//
// can(state, principal, action, env, bg) answers whether a user (its username) or a connected app ('app:<clientId>')
// holds a permission in a business group and environment. Other engines may use it.

const MAX_AUDIT = 60
const MAX_RUNS = 8

export const TOKEN_URL = 'https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token'
export const ROOT = 'brightmart'

// ---------- the catalog ----------

// [name, product, scoped to an environment]
export const PERMISSIONS = [
  ['Organization Administrator', 'General', false],
  ['Exchange Viewer', 'Exchange', false],
  ['Exchange Contributor', 'Exchange', false],
  ['Exchange Administrator', 'Exchange', false],
  ['Design Center Developer', 'Design Center', false],
  ['API Manager Environment Administrator', 'API Manager', true],
  ['Manage APIs Configuration', 'API Manager', true],
  ['View APIs Configuration', 'API Manager', true],
  ['Deploy API Proxies', 'API Manager', true],
  ['Read Applications', 'Runtime Manager', true],
  ['Create Applications', 'Runtime Manager', true],
  ['Manage Applications', 'Runtime Manager', true],
  ['Download Applications', 'Runtime Manager', true],
  ['Delete Applications', 'Runtime Manager', true],
  ['Read Servers', 'Runtime Manager', true],
]
const PERM = Object.fromEntries(PERMISSIONS.map(([name, product, env]) => [name, { product, env }]))
export const envScoped = (perm) => Boolean(PERM[perm]?.env)
// a permission that holds others. Lab-made: the real product has more of these links.
const IMPLIES = {
  'Exchange Administrator': ['Exchange Contributor', 'Exchange Viewer'],
  'Exchange Contributor': ['Exchange Viewer'],
  'API Manager Environment Administrator': ['Manage APIs Configuration', 'View APIs Configuration', 'Deploy API Proxies'],
  'Manage APIs Configuration': ['View APIs Configuration'],
}
const expand = (perm) => [perm, ...(IMPLIES[perm] ?? []).flatMap(expand)]

// The roles of the Roles page. An environment role is given for one environment.
export const ROLES = {
  'Organization Administrators': { perms: ['Organization Administrator'], env: false, text: 'Full access to the business group and the business groups below it.' },
  'Exchange Administrators': { perms: ['Exchange Administrator'], env: false, text: 'Publish, change and delete every asset of the business group.' },
  'Exchange Contributors': { perms: ['Exchange Contributor'], env: false, text: 'Publish and change assets.' },
  'Exchange Viewers': { perms: ['Exchange Viewer'], env: false, text: 'Read the assets.' },
  'API Manager Environment Administrator': { perms: ['API Manager Environment Administrator'], env: true, text: 'Every API Manager action in one environment.' },
  // lab-made: modeled on the environment roles of Runtime Manager
  'Runtime Manager Developer': { perms: ['Read Applications', 'Create Applications', 'Manage Applications', 'Download Applications', 'Read Servers'], env: true, text: 'Deploy, change and read applications in one environment.' },
  'Runtime Manager Viewer': { perms: ['Read Applications', 'Read Servers'], env: true, text: 'Read applications and servers in one environment.' },
}
export const ROLE_NAMES = Object.keys(ROLES)

// [scope, scoped to an environment, the permission it gives]
export const SCOPES = [
  ['View Organization', false, null],
  ['View Environment', true, null],
  ['Profile', false, null],
  ['Design Center Developer', false, 'Design Center Developer'],
  ['Exchange Viewer', false, 'Exchange Viewer'],
  ['Exchange Contributor', false, 'Exchange Contributor'],
  ['Exchange Administrator', false, 'Exchange Administrator'],
  ['API Manager: Manage APIs Configuration', true, 'Manage APIs Configuration'],
  ['API Manager: View APIs Configuration', true, 'View APIs Configuration'],
  ['API Manager: Deploy API Proxies', true, 'Deploy API Proxies'],
  ['Runtime Manager: Read Applications', true, 'Read Applications'],
  ['Runtime Manager: Create Applications', true, 'Create Applications'],
  ['Runtime Manager: Manage Applications', true, 'Manage Applications'],
  ['Runtime Manager: Download Applications', true, 'Download Applications'],
  ['Runtime Manager: Delete Applications', true, 'Delete Applications'],
  ['Runtime Manager: Read Servers', true, 'Read Servers'],
]
const SCOPE = Object.fromEntries(SCOPES.map(([name, env, perm]) => [name, { env, perm }]))
export const scopeEnvScoped = (scope) => Boolean(SCOPE[scope]?.env)
export const USER_GRANTS = ['Authorization Code', 'Refresh Token', 'JWT Bearer', 'Password']

// ---------- the seed ----------

const bg = (id, name, parent) => ({ id, name, parent })
const envOf = (b, name) => ({ id: `${b}-${name.toLowerCase().slice(0, 3)}`, bg: b, name, type: name === 'Production' ? 'Production' : 'Sandbox' })
export const user = (username, name, extra = {}) => ({ username, name, email: `${username}@brightmart.example`, enabled: true, bg: ROOT, last: null, ...extra })
const g = (id, to, what, b, env = null) => ({ id, to, ...(ROLES[what] ? { role: what } : { perm: what }), bg: b, env })

const seed = () => ({
  n: 100,
  bgs: [bg(ROOT, 'Brightmart', null), bg('ecom', 'Ecommerce', ROOT), bg('supply', 'Supply Chain', ROOT)],
  envs: [ROOT, 'ecom', 'supply'].flatMap((b) => [envOf(b, 'Sandbox'), envOf(b, 'Production')]),
  users: [
    user('brightmart-admin', 'You', { email: 'ops@brightmart.example' }),
    user('dana.okafor', 'Dana Okafor', { bg: 'ecom' }),
    user('priya.nair', 'Priya Nair', { bg: 'supply' }),
    user('tom.berg', 'Tom Berg'),
  ],
  teams: [
    { id: 't1', name: 'Platform Admins', bg: ROOT, members: ['brightmart-admin'] },
    { id: 't2', name: 'Ecommerce Developers', bg: 'ecom', members: ['dana.okafor'] },
    { id: 't3', name: 'Supply Chain Integration', bg: 'supply', members: ['priya.nair'] },
  ],
  grants: [
    g('g1', 'team:t1', 'Organization Administrators', ROOT),
    ...['Read Applications', 'Create Applications', 'Manage Applications', 'Download Applications'].map((p, i) => g(`g${10 + i}`, 'team:t2', p, 'ecom', 'Sandbox')),
    g('g14', 'team:t2', 'Read Applications', 'ecom', 'Production'),
    g('g15', 'team:t2', 'Exchange Contributor', 'ecom'),
    g('g16', 'team:t2', 'Design Center Developer', 'ecom'),
    g('g17', 'team:t2', 'Manage APIs Configuration', 'ecom', 'Sandbox'),
    g('g20', 'team:t3', 'Runtime Manager Developer', 'supply', 'Sandbox'),
    g('g21', 'team:t3', 'Runtime Manager Developer', 'supply', 'Production'),
    g('g22', 'team:t3', 'Exchange Contributors', 'supply'),
    g('g30', 'user:tom.berg', 'Exchange Administrators', ROOT),
  ],
  apps: [],
  audit: [],
})
const SEED_KEYS = Object.keys(seed())

// what the open console and old saves hold
export const defaultAccess = (now) => ({ created: now })
// a full Access Management state, for a lab that starts with its own users and apps
export const newAccess = (now = 0, extra = {}) => ({ created: now, ...seed(), ...extra })
export const accessOf = (s) => {
  const a = s?.access ?? {}
  return SEED_KEYS.every((k) => k in a) ? a : { ...seed(), ...a }
}
function ensureAccess(s) {
  s.access = { ...seed(), created: s.clock ?? 0, ...(s.access ?? {}) }
  return s.access
}
const edit = (state, fn) => {
  const s = structuredClone(state)
  const out = fn(s, ensureAccess(s))
  return out === undefined ? s : out
}
const audit = (s, a, entry) => {
  a.audit.push({ t: s.clock ?? 0, user: 'brightmart-admin', product: 'Access Management', bg: ROOT, env: null, result: 'Success', ...entry })
  if (a.audit.length > MAX_AUDIT) a.audit.splice(0, a.audit.length - MAX_AUDIT)
}

// ---------- reading ----------

export const bgName = (s, id) => accessOf(s).bgs.find((b) => b.id === id)?.name ?? id
export const envsOf = (s, b) => accessOf(s).envs.filter((e) => e.bg === b)
export const userOf = (s, username) => accessOf(s).users.find((u) => u.username === username)
export const teamsOf = (s, username) => accessOf(s).teams.filter((t) => t.members.includes(username))
export const grantsTo = (s, to) => accessOf(s).grants.filter((x) => x.to === to)
export const appOf = (s, clientId) => accessOf(s).apps.find((x) => x.clientId === clientId)
const ancestors = (a, id) => {
  const out = []
  for (let b = a.bgs.find((x) => x.id === id); b; b = a.bgs.find((x) => x.id === b.parent)) out.push(b.id)
  return out
}
const permsOf = (grant) => (grant.role ? ROLES[grant.role].perms : [grant.perm]).flatMap(expand)

// Every grant that reaches a user: given to the user, or to a team the user is in. `via` says where it comes from.
export function effectiveGrants(s, username) {
  const a = accessOf(s)
  const teams = a.teams.filter((t) => t.members.includes(username))
  return a.grants
    .filter((x) => x.to === `user:${username}` || teams.some((t) => x.to === `team:${t.id}`))
    .map((x) => ({ ...x, via: x.to.startsWith('team:') ? `Team ${teams.find((t) => `team:${t.id}` === x.to).name}` : 'Direct' }))
}
export const isOrgAdmin = (s, username, b = ROOT) => {
  const up = ancestors(accessOf(s), b)
  return effectiveGrants(s, username).some((x) => permsOf(x).includes('Organization Administrator') && up.includes(x.bg))
}

// Why a principal holds a permission, or null. A permission in a parent business group does not reach the business
// groups below it, except Organization Administrator.
export function reasonFor(s, principal, action, env, b = 'ecom') {
  const a = accessOf(s)
  const up = ancestors(a, b)
  if (String(principal).startsWith('app:')) {
    const app = a.apps.find((x) => x.clientId === principal.slice(4))
    if (!app || app.enabled === false) return null
    const hit = app.scopes.find((x) => x.bg === b && (SCOPE[x.scope]?.perm ? expand(SCOPE[x.scope].perm).includes(action) : x.scope === action) && (!scopeEnvScoped(x.scope) || x.env === env))
    return hit ? `Scope ${hit.scope}` : null
  }
  const u = a.users.find((x) => x.username === principal)
  if (!u || !u.enabled) return null
  for (const x of effectiveGrants(s, principal)) {
    const perms = permsOf(x)
    if (perms.includes('Organization Administrator') && up.includes(x.bg)) return `${x.via}: Organization Administrators in ${bgName(s, x.bg)}`
    if (x.bg === b && perms.includes(action) && (!envScoped(action) || x.env === env)) return `${x.via}: ${x.role ?? x.perm}`
  }
  return null
}
export const can = (s, principal, action, env, b = 'ecom') => reasonFor(s, principal, action, env, b) !== null

// ---------- changes ----------

export const createTeam = (state, { name, bg: b }) =>
  edit(state, (s, a) => {
    const id = `t${a.n++}`
    a.teams.push({ id, name: name.trim(), bg: b, members: [] })
    audit(s, a, { action: 'Create', type: 'Team', object: name.trim(), bg: b })
  })
export const deleteTeam = (state, id) =>
  edit(state, (s, a) => {
    const t = a.teams.find((x) => x.id === id)
    if (!t) return
    a.teams = a.teams.filter((x) => x.id !== id)
    a.grants = a.grants.filter((x) => x.to !== `team:${id}`)
    audit(s, a, { action: 'Delete', type: 'Team', object: t.name, bg: t.bg })
  })
export const addMember = (state, id, username) =>
  edit(state, (s, a) => {
    const t = a.teams.find((x) => x.id === id)
    if (!t || t.members.includes(username) || !a.users.some((u) => u.username === username)) return
    t.members.push(username)
    audit(s, a, { action: 'Add member', type: 'Team', object: `${t.name}: ${username}`, bg: t.bg })
  })
export const removeMember = (state, id, username) =>
  edit(state, (s, a) => {
    const t = a.teams.find((x) => x.id === id)
    if (!t) return
    t.members = t.members.filter((m) => m !== username)
    audit(s, a, { action: 'Remove member', type: 'Team', object: `${t.name}: ${username}`, bg: t.bg })
  })
// `what` is a permission or a role name
export const grant = (state, to, what, b, env = null) =>
  edit(state, (s, a) => {
    const scoped = ROLES[what] ? ROLES[what].env : envScoped(what)
    const e = scoped ? env : null
    if (scoped && !e) return
    if (a.grants.some((x) => x.to === to && (x.role ?? x.perm) === what && x.bg === b && x.env === e)) return
    a.grants.push(g(`g${a.n++}`, to, what, b, e))
    audit(s, a, { action: 'Grant', type: ROLES[what] ? 'Role' : 'Permission', object: `${what} to ${to}`, bg: b, env: e })
  })
export const revoke = (state, id) =>
  edit(state, (s, a) => {
    const x = a.grants.find((y) => y.id === id)
    if (!x) return
    a.grants = a.grants.filter((y) => y.id !== id)
    audit(s, a, { action: 'Revoke', type: x.role ? 'Role' : 'Permission', object: `${x.role ?? x.perm} from ${x.to}`, bg: x.bg, env: x.env })
  })
export const setUserEnabled = (state, username, enabled) =>
  edit(state, (s, a) => {
    const u = a.users.find((x) => x.username === username)
    if (!u) return
    u.enabled = enabled
    audit(s, a, { action: enabled ? 'Enable' : 'Disable', type: 'User', object: username })
  })
export const inviteUser = (state, { username, name, bg: b }) =>
  edit(state, (s, a) => {
    const id = username.trim().toLowerCase()
    if (!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(id) || a.users.some((u) => u.username === id)) return
    a.users.push(user(id, name.trim() || id, { bg: b }))
    audit(s, a, { action: 'Invite', type: 'User', object: id, bg: b })
  })
// lab-made: the console switch of the lab uses Sandbox and Production, so a new environment shows here only
export const createEnvironment = (state, { bg: b, name, type }) =>
  edit(state, (s, a) => {
    const n = name.trim()
    if (!n || a.envs.some((e) => e.bg === b && e.name.toLowerCase() === n.toLowerCase())) return
    a.envs.push({ id: `${b}-${a.n++}`, bg: b, name: n, type })
    audit(s, a, { action: 'Create', type: 'Environment', object: `${n} (${type})`, bg: b, env: n })
  })

// The lab tool "Check access": what the platform answers when a user tries an action. It writes the answer to the
// audit log, the way a denied request shows there.
export function checkAccess(state, username, action, env, b = 'ecom') {
  const why = reasonFor(state, username, action, envScoped(action) ? env : null, b)
  const next = edit(state, (s, a) => {
    audit(s, a, { user: username, product: PERM[action]?.product ?? 'General', action, type: 'Access check', object: `${action} in ${bgName(s, b)}${envScoped(action) ? `, ${env}` : ''}`, bg: b, env: envScoped(action) ? env : null, result: why ? 'Allowed' : 'Denied' })
  })
  return { state: next, allowed: Boolean(why), why, text: why ? `Allowed. ${why}.` : '403 Forbidden. You do not have permission to perform this action.' }
}

// ---------- connected apps ----------

const hash = (text) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
  return h
}
const hex = (seedText, len) => {
  let out = ''
  for (let i = 0; out.length < len; i++) out += hash(`${seedText}:${i}`).toString(16).padStart(8, '0')
  return out.slice(0, len)
}
// lab-made: ids and secrets come from a counter, so a lab is the same each time. A secret starts with "lab" so it is
// never mistaken for a real one.
const newSecret = (a, clientId) => `lab${hex(`secret:${clientId}:${a.n++}`, 29)}`

export function createConnectedApp(state, { name, type, grantTypes = [], redirectUris = [] }) {
  let clientId = null
  const next = edit(state, (s, a) => {
    clientId = hex(`client:${name}:${a.n++}`, 32)
    a.apps.push({ clientId, name: name.trim(), type, grantTypes: type === 'user' ? grantTypes : ['Client Credentials'], redirectUris: type === 'user' ? redirectUris : [], secrets: [newSecret(a, clientId)], scopes: [], owner: 'brightmart-admin', created: s.clock ?? 0, rotated: 0, rotatedAt: null, enabled: true })
    audit(s, a, { action: 'Create', type: 'Connected App', object: `${name.trim()} (${type === 'user' ? 'acts on behalf of a user' : 'client credentials'})` })
  })
  return { state: next, clientId }
}
// scopes: [{ scope, bg, env }]
export const addScopes = (state, clientId, scopes) =>
  edit(state, (s, a) => {
    const app = a.apps.find((x) => x.clientId === clientId)
    if (!app) return
    for (const x of scopes) {
      const e = scopeEnvScoped(x.scope) ? x.env : null
      if (scopeEnvScoped(x.scope) && !e) continue
      if (!app.scopes.some((y) => y.scope === x.scope && y.bg === x.bg && y.env === e)) app.scopes.push({ scope: x.scope, bg: x.bg, env: e })
    }
    audit(s, a, { action: 'Update scopes', type: 'Connected App', object: app.name })
  })
export const removeScope = (state, clientId, i) =>
  edit(state, (s, a) => {
    const app = a.apps.find((x) => x.clientId === clientId)
    if (!app?.scopes[i]) return
    app.scopes.splice(i, 1)
    audit(s, a, { action: 'Update scopes', type: 'Connected App', object: app.name })
  })
// Rotate Secret gives a new secret and keeps the old one working until Revoke Old Secret, so the clients can move over.
export const rotateSecret = (state, clientId) =>
  edit(state, (s, a) => {
    const app = a.apps.find((x) => x.clientId === clientId)
    if (!app) return
    app.secrets = [newSecret(a, clientId), app.secrets[0]]
    app.rotated += 1
    app.rotatedAt = a.n++
    audit(s, a, { action: 'Rotate secret', type: 'Connected App', object: app.name })
  })
export const revokeOldSecret = (state, clientId) =>
  edit(state, (s, a) => {
    const app = a.apps.find((x) => x.clientId === clientId)
    if (!app || app.secrets.length < 2) return
    app.secrets = [app.secrets[0]]
    audit(s, a, { action: 'Revoke old secret', type: 'Connected App', object: app.name })
  })
export const deleteConnectedApp = (state, clientId) =>
  edit(state, (s, a) => {
    const app = a.apps.find((x) => x.clientId === clientId)
    if (!app) return
    a.apps = a.apps.filter((x) => x.clientId !== clientId)
    audit(s, a, { action: 'Delete', type: 'Connected App', object: app.name })
  })

// POST to the token endpoint. Returns the HTTP answer: status and a JSON body.
export function tokenRequest(state, { grant_type, client_id, client_secret }) {
  const app = appOf(state, client_id)
  if (!app || app.enabled === false || !app.secrets.includes(client_secret)) return { status: 401, body: { error: 'invalid_client', error_description: 'Client authentication failed' } }
  if (grant_type !== 'client_credentials' || app.type !== 'client_credentials') return { status: 400, body: { error: 'unauthorized_client', error_description: 'The client is not allowed to use this grant type' } }
  return { status: 200, body: { access_token: `lab-token-${hex(`${client_id}:${client_secret}`, 12)}`, token_type: 'bearer', expires_in: 3600 } }
}

// ---------- the CI pipeline (a lab tool) ----------

// What the Mule Maven plugin needs to publish to Exchange and deploy to CloudHub 2.0 in both environments of
// Ecommerce. Lab-made: the real list depends on the plugin version and the deployment target.
export const PIPELINE_BG = 'ecom'
export const PIPELINE_ENVS = ['Sandbox', 'Production']
export const PIPELINE_NEEDS = [
  ['Exchange Contributor', null],
  ...PIPELINE_ENVS.flatMap((env) => [['View Environment', env], ['Read Applications', env], ['Create Applications', env], ['Manage Applications', env]]),
]
const PIPELINE_SCOPES = new Set(['View Organization', 'View Environment', 'Exchange Contributor', 'Runtime Manager: Read Applications', 'Runtime Manager: Create Applications', 'Runtime Manager: Manage Applications'])
// only the scopes the pipeline needs, in Ecommerce only
export const leastScopes = (app) => Boolean(app) && app.scopes.every((x) => x.bg === PIPELINE_BG && PIPELINE_SCOPES.has(x.scope))
const hasScope = (s, app, need, env) =>
  need === 'View Environment' ? app.scopes.some((x) => x.scope === 'View Environment' && x.bg === PIPELINE_BG && x.env === env) : can(s, `app:${app.clientId}`, need, env, PIPELINE_BG)

// the needs of the pipeline that a connected app does not hold: [permission or scope, environment]
export const pipelineMissing = (s, clientId) => {
  const app = appOf(s, clientId)
  return app ? PIPELINE_NEEDS.filter(([need, env]) => !hasScope(s, app, need, env)) : PIPELINE_NEEDS
}

export const setPipelineAuth = (state, auth) =>
  edit(state, (s, a) => {
    if (!a.ci) return
    a.ci.auth = auth.type === 'user' ? { type: 'user', username: auth.username ?? '', password: auth.password ?? '' } : { type: 'connected-app', clientId: (auth.clientId ?? '').trim(), clientSecret: (auth.clientSecret ?? '').trim() }
  })

// Runs the pipeline once. Lab-made: the run proves the login and the permissions and does not change Runtime Manager.
export function runPipeline(state) {
  return edit(state, (s, a) => {
    const ci = a.ci
    if (!ci) return
    const n = a.n++
    const lines = [`[INFO] Building ${ci.project} 1.4.${n % 10}`, `[INFO] --- mule-maven-plugin:4.3.0:deploy (default-deploy) @ ${ci.project} ---`]
    const fail = (text, by) => {
      lines.push(`[ERROR] Failed to execute goal org.mule.tools.maven:mule-maven-plugin:4.3.0:deploy (default-deploy) on project ${ci.project}: ${text}`, '[INFO] BUILD FAILURE')
      ci.runs.push({ n, t: s.clock ?? 0, status: 'Failed', by, lines })
    }
    let by
    if (ci.auth.type === 'user') {
      by = `user ${ci.auth.username}`
      const u = a.users.find((x) => x.username === ci.auth.username)
      lines.push(`[INFO] Logging in to https://anypoint.mulesoft.com/accounts/login as ${ci.auth.username}`)
      const ok = u && u.enabled && ci.auth.password === u.password
      audit(s, a, { user: ci.auth.username || 'unknown', product: 'Access Management', action: 'Login', type: 'User', object: ci.project, result: ok ? 'Success' : 'Failed' })
      if (!ok) return fail('401 Unauthorized. {"message":"Invalid username or password"}', by)
    } else {
      by = `connected app ${ci.auth.clientId.slice(0, 8)}`
      lines.push(`[INFO] POST ${TOKEN_URL} grant_type=client_credentials`)
      const r = tokenRequest(s, { grant_type: 'client_credentials', client_id: ci.auth.clientId, client_secret: ci.auth.clientSecret })
      const app = appOf(s, ci.auth.clientId)
      audit(s, a, { user: app ? `${app.name} (connected app)` : 'unknown client', action: 'Token', type: 'Connected App', object: ci.project, result: r.status === 200 ? 'Success' : 'Failed' })
      if (r.status !== 200) return fail(`${r.status} ${r.status === 401 ? 'Unauthorized' : 'Bad Request'}. ${JSON.stringify(r.body)}`, by)
      lines.push('[INFO] Got an access token, expires in 3600 s')
      for (const [need, env] of PIPELINE_NEEDS) {
        if (hasScope(s, app, need, env)) continue
        const call = need === 'Exchange Contributor' ? `POST /exchange/api/v2/assets (${ci.project})` : `${need === 'Read Applications' || need === 'View Environment' ? 'GET' : 'POST'} /amc/application-manager/api/v2/organizations/{orgId}/environments/{${env}}/deployments`
        return fail(`403 Forbidden on ${call}. {"message":"You do not have permission to perform this action"}`, by)
      }
    }
    lines.push(`[INFO] Published ${ci.project} to Exchange`, ...PIPELINE_ENVS.map((e) => `[INFO] Deployed ${ci.project} to ${e} in ${bgName(s, PIPELINE_BG)}`), '[INFO] BUILD SUCCESS')
    ci.runs.push({ n, t: s.clock ?? 0, status: 'Succeeded', by, lines })
    if (ci.runs.length > MAX_RUNS) ci.runs.splice(0, ci.runs.length - MAX_RUNS)
  })
}

// ---------- the secure properties tool ----------
//
// LAB-MADE CRYPTO. This is not AES and not Blowfish, and it is not secure. It is a keyed, reversible byte transform that
// behaves like the real tool where a learner can see it: the same input and key give the same output (the tool uses a
// fixed IV unless --use-random-iv), ECB and CBC pad to the block size, so a wrong key fails with BadPaddingException,
// while CFB and OFB have no padding, so a wrong key gives garbage and no error. Never use it for anything real.

export const ALGORITHMS = ['AES', 'Blowfish']
export const MODES = ['CBC', 'CFB', 'ECB', 'OFB']
const BLOCK = { AES: 16, Blowfish: 8 }
const BAD_PADDING = 'javax.crypto.BadPaddingException: Given final block not properly padded. Such issues can arise if a bad key is used during decryption.'

export function keyError(algorithm, key) {
  const n = new TextEncoder().encode(key ?? '').length
  if (!n) return 'A key is required.'
  if (algorithm === 'AES' && ![16, 24, 32].includes(n)) return `java.security.InvalidKeyException: Invalid AES key length: ${n} bytes`
  // lab-made wording: Blowfish takes 32 to 448 bit keys
  if (algorithm === 'Blowfish' && (n < 4 || n > 56)) return `java.security.InvalidKeyException: Invalid Blowfish key length: ${n} bytes (use 4 to 56)`
  return null
}
const stream = (seedText, n) => {
  let x = hash(seedText) || 1
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    out[i] = x & 255
  }
  return out
}
const tagOf = (k, n) => (k[0] ^ k[1] ^ (n * 31)) & 255
const toB64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

function encryptBytes(p, { algorithm, mode, key }) {
  const block = BLOCK[algorithm]
  const k = stream(`${algorithm}|${key}`, block)
  const iv = stream(`iv|${algorithm}|${key}`, block)
  if (mode === 'ECB' || mode === 'CBC') {
    // lab-made: one keyed check byte before the padding, so a wrong key fails nearly every time
    const pad = block - ((p.length + 1) % block)
    const x = new Uint8Array(p.length + 1 + pad)
    x.set(p)
    x[p.length] = tagOf(k, p.length)
    x.fill(pad, p.length + 1)
    const c = new Uint8Array(x.length)
    for (let i = 0; i < x.length; i++) {
      const prev = mode === 'CBC' ? (i < block ? iv[i] : c[i - block]) : 0
      c[i] = ((x[i] ^ prev) + k[i % block] + (k[(i + 3) % block] ^ (i % block))) & 255
    }
    return c
  }
  const c = new Uint8Array(p.length)
  const ks = stream(`ofb|${algorithm}|${key}`, p.length)
  for (let i = 0; i < p.length; i++) c[i] = mode === 'OFB' ? p[i] ^ ks[i] ^ iv[i % block] : p[i] ^ ((i ? c[i - 1] : iv[0]) + k[i % block]) & 255
  return c
}
function decryptBytes(c, { algorithm, mode, key }) {
  const block = BLOCK[algorithm]
  const k = stream(`${algorithm}|${key}`, block)
  const iv = stream(`iv|${algorithm}|${key}`, block)
  if (mode === 'ECB' || mode === 'CBC') {
    if (c.length === 0 || c.length % block) return { error: `javax.crypto.IllegalBlockSizeException: Input length must be multiple of ${block} when decrypting with padded cipher` }
    const x = new Uint8Array(c.length)
    for (let i = 0; i < c.length; i++) {
      const prev = mode === 'CBC' ? (i < block ? iv[i] : c[i - block]) : 0
      x[i] = ((c[i] - k[i % block] - (k[(i + 3) % block] ^ (i % block))) & 255) ^ prev
    }
    const pad = x[x.length - 1]
    if (pad < 1 || pad > block || x.length - pad < 1 || !x.slice(x.length - pad).every((b) => b === pad)) return { error: BAD_PADDING }
    const end = x.length - pad - 1
    if (x[end] !== tagOf(k, end)) return { error: BAD_PADDING }
    return { bytes: x.slice(0, end) }
  }
  const p = new Uint8Array(c.length)
  const ks = stream(`ofb|${algorithm}|${key}`, c.length)
  for (let i = 0; i < c.length; i++) p[i] = mode === 'OFB' ? c[i] ^ ks[i] ^ iv[i % block] : c[i] ^ ((i ? c[i - 1] : iv[0]) + k[i % block]) & 255
  return { bytes: p }
}

const unwrap = (v) => String(v ?? '').trim().replace(/^"(.*)"$/, '$1').replace(/^!\[(.*)\]$/, '$1')
export const isEncrypted = (v) => /^!\[.*\]$/.test(String(v ?? '').trim().replace(/^"(.*)"$/, '$1'))
// The string mode: { ok, value } or { ok: false, error }. Like the real tool, encrypt prints the bare base64 text; you
// wrap it in ![...] yourself when you put it in a file. Decrypt takes either form.
export function secureString(op, { algorithm, mode, key, value }) {
  const bad = keyError(algorithm, key)
  if (bad) return { ok: false, error: bad }
  if (op === 'encrypt') return { ok: true, value: toB64(encryptBytes(new TextEncoder().encode(String(value ?? '')), { algorithm, mode, key })) }
  let bytes
  try {
    bytes = fromB64(unwrap(value))
  } catch {
    return { ok: false, error: 'java.lang.IllegalArgumentException: Illegal base64 character' }
  }
  const r = decryptBytes(bytes, { algorithm, mode, key })
  if (r.error) return { ok: false, error: r.error }
  return { ok: true, value: new TextDecoder().decode(r.bytes) }
}

// The lines of a .yaml or .properties file with a value: [index, full key, value]. Nested YAML keys join with dots.
function valueLines(text) {
  const out = []
  const path = []
  String(text ?? '').split('\n').forEach((l, i) => {
    if (/^\s*(#|$)/.test(l)) return
    const yaml = l.match(/^(\s*)([\w.-]+):\s*(.*)$/)
    if (yaml) {
      const depth = yaml[1].length
      while (path.length && path.at(-1)[0] >= depth) path.pop()
      if (yaml[3] === '') path.push([depth, yaml[2]])
      else out.push([i, [...path.map((p) => p[1]), yaml[2]].join('.'), yaml[3], 'yaml'])
      return
    }
    const prop = l.match(/^\s*([\w.-]+)\s*=\s*(.*)$/)
    if (prop) out.push([i, prop[1], prop[2], 'properties'])
  })
  return out
}
export const fileValues = (text) => Object.fromEntries(valueLines(text).map(([, k, v]) => [k, unwrap(v)]))
export const fileEntries = (text) => valueLines(text).map(([, key, raw]) => ({ key, raw, encrypted: isEncrypted(raw), value: unwrap(raw) }))
// The file mode: encrypts or decrypts every value of the file and keeps the keys, comments and layout.
export function secureFile(op, { algorithm, mode, key, text }) {
  const bad = keyError(algorithm, key)
  if (bad) return { ok: false, error: bad }
  const lines = String(text ?? '').split('\n')
  for (const [i, k, v, kind] of valueLines(text)) {
    if (op === 'decrypt' && !isEncrypted(v)) continue
    const r = secureString(op, { algorithm, mode, key, value: op === 'encrypt' ? unwrap(v) : v })
    if (!r.ok) return { ok: false, error: `Error decrypting the value of ${k}. ${r.error}` }
    const at = lines[i].lastIndexOf(v)
    // file mode wraps each encrypted value in ![...]
    const value = op === 'encrypt' ? `![${r.value}]` : r.value
    const out = kind === 'yaml' ? `"${value.replace(/"/g, '\\"')}"` : value
    lines[i] = lines[i].slice(0, at) + out + lines[i].slice(at + v.length)
  }
  return { ok: true, value: lines.join('\n') }
}
// the command line the form equals
export const toolCommand = ({ kind, op, algorithm, mode, key, value, file }) =>
  `java -cp secure-properties-tool.jar com.mulesoft.tools.SecurePropertiesTool ${kind} ${op} ${algorithm} ${mode} ${key || '<key>'} ${kind === 'string' ? (value ? JSON.stringify(value) : '<value>') : `${file || '<input file>'} ${file || '<output file>'}`}`

// The apps whose project has secure property files, and saving a file into one. Lab-made: the project files of an app
// live on the app, and its next deploy builds the jar with them. In a real project you commit the encrypted file and
// the pipeline builds a new jar.
export const secureApps = (s) => s.apps.filter((x) => x.secureFiles && Object.keys(x.secureFiles).length)
export function saveSecureFile(state, name, env, file, text) {
  const s = structuredClone(state)
  const app = s.apps.find((x) => x.name === name && x.env === env)
  if (!app?.secureFiles || !(file in app.secureFiles)) return state
  app.secureFiles[file] = text
  return s
}

// For a package boot: can the secure configuration properties of the app be read with its mule.key? Returns the
// startup error, or null. The wording follows the runtime; the exact cause chain is lab-made.
export function secureBootError({ app, props }, { file = `${props['mule.env']}.yaml`, algorithm = 'AES', mode = 'CBC' } = {}) {
  if (!props['mule.env']) return 'Couldn\'t find configuration property value for key ${mule.env} from properties provider "Environment properties"'
  if (!props['mule.key']) return 'Couldn\'t find configuration property value for key ${mule.key} from properties provider "Environment properties"'
  const text = app.secureFiles?.[file]
  if (text === undefined) return `Couldn't find configuration properties file ${file} neither on classpath or in file system`
  for (const [, k, v] of valueLines(text)) {
    if (!isEncrypted(v)) continue
    const r = secureString('decrypt', { algorithm, mode, key: props['mule.key'], value: v })
    if (!r.ok) return `Failed to decrypt the value of property 'secure::${k}' in ${file}. Caused by: org.mule.encryption.exception.MuleEncryptionException: Could not decrypt the value. Caused by: ${r.error}`
  }
  return null
}
