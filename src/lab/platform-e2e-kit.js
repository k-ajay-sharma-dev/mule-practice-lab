// The shared kit of the end to end labs (group 'End to end by system'): checks, steps and solve moves for the parts every
// integration has: the spec in Design Center, Exchange, Studio with the package of the lab (state.studioPkgs), the API
// instance with Client ID Enforcement, the deployment from the exported jar, alerts and the promotion to Production.
// Two styles live here: `e2e` with the helpers above it (Kafka, Anypoint MQ, ActiveMQ, Service Bus) and `e2eKit(cfg)`
// (SFTP, FTP, Azure Blob, Azure Files).
import {
  addApi, apiStatus, appNamed, applyPolicy, createClient, createProject, deployApp, finishDeploys, importSpec, jarsOf, mark, mockCall, packageJar, pairing,
  projectRaml, promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio,
} from './platform.js'
import { creds } from './platform-kit.js'
import { newSqlServer, serverOf, tablesOf } from './platform-db.js'

// ---------- helpers and the e2e steps ----------

export const SBX = 'Sandbox'
export const PRD = 'Production'
export const apiOf = (s, assetId, env = SBX) => s.apis.find((a) => a.assetId === assetId && a.env === env)
export const appOf = (s, pkg, env = SBX) => s.apps.find((a) => a.pkg === pkg && a.env === env && a.status === 'Running') ?? null
export const propsOf = (a) => ({ ...a?.props, ...a?.secrets })
// a protected property with this value, and no plain property of the same key
export const isSecret = (a, key, value) => Boolean(a) && a.secrets?.[key] === value && !String(a.props?.[key] ?? '').trim()
const specValid = (raml, routes) => ramlErrors(raml).length === 0 && routes.every(([m, path]) => mockCall(raml, m, path).status < 300)
export const specOk = (s, name, routes) => s.projects.some((p) => p.name.trim().toLowerCase() === name.toLowerCase() && specValid(projectRaml(s, p), routes))
// the app of the package runs, its autodiscovery found the instance of the asset, and the instance is Active
export const linked = (s, assetId, pkg, env = SBX) => {
  const a = appOf(s, pkg, env)
  const api = apiOf(s, assetId, env)
  return Boolean(a && api) && pairing(s, a).api?.id === api.id && apiStatus(s, api) === 'Active'
}
export const contracted = (s, assetId, env = SBX) => (apiOf(s, assetId, env)?.contracts ?? []).some((c) => c.status === 'approved')
export const clientIdOn = (s, assetId, env = SBX) => Boolean(apiOf(s, assetId, env)?.policies.some((p) => p.type === 'client-id'))
export const alerted = (s, pkg, to) => {
  const a = appOf(s, pkg)
  return Boolean(a) && s.monAlerts.some((x) => x.enabled && x.env === SBX && x.name_ === a.name && x.metric === 'Message Error Count' && ((x.operator === 'Above' && Number(x.threshold) === 0) || (x.operator === 'Above or equal to' && Number(x.threshold) === 1)) && String(x.recipients ?? '').includes(to))
}
export const rowsOf = (s, server, table) => tablesOf(serverOf(s, server) ?? {})?.[table]?.rows ?? []
// A SQL Server of the lab with the login of one integration: a database user with read and write on the tables
export function sqlServer(name, host, database, login, password) {
  const srv = newSqlServer(name, { host, database })
  srv.logins.push({ name: login, type: 'SQL login', password, disabled: false, defaultDb: database, policy: true, failed: 0 })
  srv.users.push({ name: login, login, schema: 'dbo', roles: ['db_datareader', 'db_datawriter'] })
  return srv
}

export const e2e = {
  read: (what) => ({ title: 'Read the request', how: `Open the Inbox from the menu under Lab tools. Note ${what}.`, done: (s) => Boolean(s.seen.inbox) }),
  // Design Center: write the spec, try the mock, publish it
  design: ({ name, assetId, raml, routes, tryIt, why }) => [
    {
      title: `Design the ${name}`,
      how: `Design Center, Create new, New API Specification. Project Name ${name}, RAML 1.0, Create. Write the specification in the editor: the one below, or your own with the same resources and an example for each answer. ${why}`,
      code: raml,
      done: (s) => specOk(s, name, routes),
    },
    { title: 'Try it in the mocking service', how: `In the Documentation panel turn on the mocking service, choose ${tryIt}, Try it, Send. The mock answers from the examples of the spec, so the callers can build against it before any code exists.`, done: (s) => specOk(s, name, routes) && Boolean(s.seen.mock) },
    { title: 'Publish it to Exchange', how: `Publish at the top right. Asset version 1.0.0, API version v1, LifeCycle State Stable, and keep the Asset ID ${assetId}. Studio and API Manager find the API by that ID.`, done: (s) => s.assets.some((a) => a.assetId === assetId) },
  ],
  studio: ({ name, assetId, how, code }) => ({
    title: 'Build it in Studio',
    how: `Anypoint Studio (Lab tools), Import a published API, ${name}. APIkit makes one flow per method of the spec. In the lab the project then holds the flows the team wrote on the spec; the part that matters is below. ${how}`,
    code,
    done: (s) => s.studio.some((p) => p.assetId === assetId && p.pkg),
  }),
  manage: ({ name, assetId, label }) => ({
    title: 'Create the API instance with Client ID Enforcement',
    how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), Mule 4, Next. Select ${name} from Exchange, Next. Instance label ${label}, Next, Next, Save & Deploy. Open the instance, Policies, + Add policy, Client ID Enforcement, keep the defaults and apply it: from now on only a client application with a contract gets through. Last, API Administration, Environment information: copy the Client ID and Client Secret of Sandbox for the deployment.`,
    done: (s) => clientIdOn(s, assetId) && Boolean(s.seen['env:Sandbox']),
  }),
  export: ({ assetId }) => ({
    title: 'Add API Autodiscovery and export the jar',
    how: `Back in Studio, Create API Autodiscovery: API ID \${api.id}, Flow Name ${assetId}-main, OK. Then Export. The jar now carries the link to API Manager; the ID itself comes from a property, because each environment has its own instance.`,
    done: (s) => s.studio.some((p) => p.assetId === assetId && p.autodiscovery?.apiId === '${api.id}' && p.autodiscovery.flowRef === `${assetId}-main` && p.jar),
  }),
  promote: ({ name, assetId }) => ({
    title: 'Promote the API instance to Production',
    how: `API Manager, switch the environment to Production with the button at the top of the left menu. API Administration, Add API, Promote API from environment: Source Environment Sandbox, the ${name} instance, include Policies. Promote. The new instance has its own API Instance ID: note it for api.id. Environment information now shows the Client ID and Client Secret of Production.`,
    done: (s) => clientIdOn(s, assetId, PRD) && Boolean(s.seen['env:Production']),
  }),
  // ---------- the moves of solve() ----------
  designSolve(s, { name, assetId, raml }) {
    let n = createProject(s, name)
    n = saveProject(n, n.projects.at(-1).id, raml)
    n = mark(n, 'mock')
    n = publish(n, n.projects.at(-1).id, { assetId, name, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    return importSpec(mark(n, `asset:${assetId}`), assetId)
  },
  manageSolve(s, assetId, label) {
    const n = addApi(s, { assetId, label, upstream: '', consumer: '' })
    return mark(applyPolicy(n, n.lastApi, 'client-id'), `env:${s.env}`)
  },
  exportSolve: (s, assetId) => packageJar(setStudio(s, assetId, { autodiscovery: { apiId: '${api.id}', flowRef: `${assetId}-main` } }), assetId),
  // deploys the jar exported from Studio, linked to the instance of the asset in the current environment
  deployStudio(s, { name, assetId, props = {}, secrets = {} }) {
    const jar = jarsOf(s).find((j) => j.project === assetId)
    const c = creds(s, s.env)
    return finishDeploys(deployApp(s, { name, ...jar, replicas: 1, vCores: 0.1, props: { ...props, 'api.id': apiOf(s, assetId, s.env).id, ...c.props }, secrets: { ...secrets, ...c.secrets } }).state)
  },
  deployJar: (s, { name, pkg, props = {}, secrets = {}, replicas = 1 }) => finishDeploys(deployApp(s, { name, ...jarsOf(s).find((j) => j.pkg === pkg), replicas, vCores: 0.1, props, secrets }).state),
  // Exchange, Request access: a new client application gets a contract on the instance of the current environment
  accessSolve(s, assetId, client) {
    const n = s.clients.some((c) => c.name === client) ? s : createClient(s, client)
    return requestAccess(n, apiOf(n, assetId, n.env).id, client)
  },
  promoteSolve: (s, assetId) => mark(promoteApi({ ...s, env: PRD }, apiOf(s, assetId).id, { policies: true, tiers: true, alerts: false }), 'env:Production'),
}

// ---------- e2eKit(cfg) ----------

// cfg: { title, assetId, raml, calls: [[method, path]], mock: 'GET /x', pkg, name, client: { name }, label }
export function e2eKit(cfg) {
  const { title, assetId, pkg, name, client, label } = cfg
  const project = (s) => s.projects.find((p) => p.name.trim().toLowerCase() === title.toLowerCase())
  const studio = (s) => s.studio.find((p) => p.assetId === assetId && p.pkg === pkg)
  const api = (s, env = 'Sandbox') => s.apis.findLast((a) => a.assetId === assetId && a.env === env)
  const appIn = (s, env = 'Sandbox') => appNamed(s, name, env)
  const prop = (a, k) => String({ ...a?.props, ...a?.secrets }[k] ?? '').trim()
  // the app runs the package of the lab, and autodiscovery pairs it with the instance of its environment
  const linked = (s, env = 'Sandbox') => {
    const a = appIn(s, env)
    const i = api(s, env)
    return a?.status === 'Running' && a.pkg === pkg && Boolean(i) && pairing(s, a).api?.id === i.id && apiStatus(s, i) === 'Active'
  }
  const specOk = (s) => {
    const p = project(s)
    if (!p) return false
    const raml = projectRaml(s, p)
    return ramlErrors(raml).length === 0 && cfg.calls.every(([m, path]) => mockCall(raml, m, path).status < 300)
  }
  const check = {
    project, studio, api, appIn, prop, linked, specOk,
    published: (s) => s.assets.some((a) => a.assetId === assetId),
    imported: (s) => Boolean(studio(s)),
    exported: (s) => Boolean(studio(s)?.jar) && studio(s).autodiscovery?.apiId === '${api.id}' && studio(s).autodiscovery?.flowRef === `${assetId}-main`,
    instance: (s) => Boolean(api(s)?.policies.some((p) => p.type === 'client-id')),
    access: (s) => Boolean(s.seen['env:Sandbox']) && Boolean(api(s)?.contracts.some((c) => c.client === client.name && c.status === 'approved')),
    promoted: (s) => Boolean(api(s, 'Production')?.policies.some((p) => p.type === 'client-id')),
    alert: (s, to) => s.monAlerts.some((x) => x.enabled && x.name_ === name && x.metric === 'Message Error Count' && String(x.recipients ?? '').includes(to)),
  }
  const steps = {
    inbox: (who, what) => ({ title: 'Read the request', how: `Open the Inbox from the top bar and read the mail of ${who}. Note ${what}.`, done: (s) => Boolean(s.seen.inbox) }),
    spec: () => ({
      title: 'Write the API specification',
      how: `Design Center from the console menu, Create new, New API Specification, name ${title}. Replace the starter RAML with the one below. The editor shows no errors when it is right.`,
      code: cfg.raml,
      done: specOk,
    }),
    mock: () => ({ title: 'Try it in the mocking service', how: `In the Documentation panel turn on the mocking service, choose ${cfg.mock}, Try it, Send. The callers of the API can build against the example before any flow exists.`, done: (s) => specOk(s) && Boolean(s.seen.mock) }),
    publish: () => ({ title: 'Publish to Exchange', how: `Publish at the top right. Asset version 1.0.0, API version v1, LifeCycle State Stable. The asset id is ${assetId}.`, done: check.published }),
    studio: () => ({
      title: 'Import the specification into Studio',
      how: `Anypoint Studio from the console menu, Import a published API, ${title}. APIkit makes one flow per method. Lab made: the project also holds the flows the team wrote on this spec, so the jar you export runs the whole integration.`,
      done: check.imported,
    }),
    export: (code, more = '') => ({
      title: 'Add API Autodiscovery and export',
      how: `In the project, Global Elements, Create API Autodiscovery. API ID \${api.id}, Flow Name ${assetId}-main. Then Export. ${more}The code below is the part of the project that moves the data.`,
      code,
      done: check.exported,
    }),
    instance: () => ({
      title: 'Create the API instance with Client ID Enforcement',
      how: `API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select ${title} from Exchange, instance label ${label}, Save & Deploy. Then Policies, + Add policy, Client ID Enforcement, Apply. Only client applications with a contract get through.`,
      done: check.instance,
    }),
    access: () => ({
      title: `Give ${client.name} access`,
      how: `API Administration, Environment information: the client ID and client secret of Sandbox, which the app needs to pair with the instance. Then Exchange, ${title}, Request access. API Instance Sandbox, ${label}; Application ${client.name}; Request access.`,
      done: check.access,
    }),
    alert: (to) => ({
      title: 'Alert on failures',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${name}, metric Message Error Count, Above 0. Recipients ${to}, from the mail.`,
      done: (s) => check.alert(s, to),
    }),
    promote: () => ({
      title: 'Promote the API instance to Production',
      how: `In API Manager switch to Production with the environment button at the top of the left menu. API Administration, Add API, Promote API from environment. Source environment Sandbox, include Policies. The Production instance gets its own API ID.`,
      done: check.promoted,
    }),
  }
  const solve = {
    design(s) {
      s = createProject(s, title)
      s = mark(saveProject(s, s.projects.at(-1).id, cfg.raml), 'mock')
      return mark(publish(s, s.projects.at(-1).id, { assetId, name: title, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state, `asset:${assetId}`)
    },
    studio: (s) => packageJar(setStudio(importSpec(s, assetId), assetId, { autodiscovery: { apiId: '${api.id}', flowRef: `${assetId}-main` } }), assetId),
    api(s) {
      s = addApi(s, { assetId, label, upstream: '', consumer: '' })
      const id = s.lastApi
      return requestAccess(mark(applyPolicy(s, id, 'client-id'), 'env:Sandbox'), id, client.name)
    },
    // props and secrets of the environment of the state, with api.id and the credentials of that environment
    deploy(s, props, secrets) {
      const jar = jarsOf(s).find((j) => j.project === assetId)
      const c = creds(s, s.env)
      return finishDeploys(deployApp(s, { name, ...jar, replicas: 1, vCores: 0.1, props: { ...props, 'api.id': api(s, s.env).id, ...c.props }, secrets: { ...secrets, ...c.secrets } }).state)
    },
    promote: (s) => promoteApi({ ...s, env: 'Production' }, api(s).id, { policies: true, tiers: false, alerts: false }),
  }
  return { check, steps, solve }
}
// The rows of a table on a database server of the lab
export const rowsIn = (s, server, table) => (serverOf(s, server) ? (tablesOf(serverOf(s, server))[table]?.rows ?? []) : [])
// A table for a lab database: columns are [name, type, nullable]
export const labTable = (schema, name, columns, pk) => ({
  schema, name, columns: columns.map(([n, type, nullable = false]) => ({ name: n, type, nullable })), pk, pkName: `PK_${name}`, clustered: true, fks: [], indexes: [], rows: [], count: 0, distinct: {}, spread: {}, changed: 0,
})
