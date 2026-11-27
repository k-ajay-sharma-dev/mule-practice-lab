// The guided lab ver-dependency-impact. See platform-labs.js for the shape of a lab.
import { appNamed, at, deleteApp, deployApp, eventsOf, finishDeploys, mark, MINUTE, newApi, newPlatform, pairing } from '../platform.js'
import { ask, call, change, CLIENTS, policy, propsValue, until } from '../platform-kit.js'
import { internal, jarOf, LED, ledApi, ledApp, ledForm, ledProject, propText } from '../platform-project.js'
import { PKG } from './ver-dependency-impact.pkg.js'

const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc, inventory } = LED
const ASSET = 'inventory-system-api'
const V2_APP = 'inventory-sapi-v2'
const V1 = { Sandbox: inventory.id, Production: inventory.id.replace('195', '196') }
const V2 = { Sandbox: '19500313', Production: '19600313' }
const JAR = { inventory2: 'inventory-sapi-2.0.0-mule-application.jar', process11: 'order-fulfilment-papi-1.1.0-mule-application.jar' }
const QUIET = 15 * MINUTE
const RAML_V2 = inventory.raml.replace('version: v1', 'version: v2').replace('"available":24}', '"warehouses":[{"id":"W1","available":16},{"id":"W2","available":8}]}')
const TEMPLATE = (env) => propText(newPlatform(), 'inventory', env, V2[env])
const PROD_TRAFFIC = [
  { app: mobile.app, env: 'Production', client: MOBILE_APP.name, path: '/my-orders/O-1001', perMinute: 1 },
  { app: partner.app, env: 'Production', client: PARTNER_PORTAL.name, path: '/partner-orders/O-1002', perMinute: 1 },
]

const inEnv = (s, env) => ({ ...s, env })
const running = (s, name, env) => appNamed(s, name, env)?.status === 'Running'
const v2Running = (s, env) => {
  const a = appNamed(s, V2_APP, env)
  return a?.pkg === PKG.inventory2 && running(s, V2_APP, env) && pairing(s, a).api?.id === V2[env]
}
const moved = (s, env) => {
  const a = appNamed(s, proc.app, env)
  return a?.pkg === PKG.process11 && propsValue(a, 'inventory.url') === internal(V2_APP, env) && running(s, proc.app, env)
}
const okSince = (s, name, env, t) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === env && c.status === 200 && c.t > t)
const proven = (s, env) => moved(s, env) && v2Running(s, env) && [mobile.app, partner.app].every((n) => okSince(s, n, env, appNamed(s, proc.app, env).updated))
const v1Quiet = (s, env) => moved(s, env) && s.clock - appNamed(s, proc.app, env).updated >= QUIET && eventsOf(s, { api: V1[env] }, appNamed(s, proc.app, env).updated, s.clock).every((e) => e.k !== 'in')
const v1Gone = (s, env) => !appNamed(s, inventory.app, env) || appNamed(s, inventory.app, env).status === 'Stopped'

const getBoth = (s) => call(call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state, partner.app, PARTNER_PORTAL, '/partner-orders/O-1002').state
function release(start, env) {
  let s = inEnv(start, env)
  const { name: _, ...form } = ledForm(s, 'inventory', V2[env], env)
  s = finishDeploys(deployApp(s, { ...form, name: V2_APP, pkg: PKG.inventory2, jar: JAR.inventory2, publicEndpoint: false }).state)
  s = change(s, proc.app, { pkg: PKG.process11, jar: JAR.process11, props: { ...appNamed(s, proc.app, env).props, 'inventory.url': internal(V2_APP, env) } })
  return getBoth(s)
}

const lab = {
  id: 'p-ver-dependency-impact',
  group: 'Versioning without breaking consumers',
  title: 'Who breaks if I change this API?',
  minutes: 40,
  scenario:
    'The Inventory team has a second warehouse and wants the Inventory System API to give the stock per warehouse. Release 2.0.0 replaces the field available with a list called warehouses, so it is published as API version v2. The team has created a v2 API instance in Sandbox and in Production, with a contract for Order Fulfilment API. The Order Fulfilment team has release 1.1.0 of its Process API ready, which reads v2. Before anyone deploys, map who depends on the Inventory System API, then release in an order where no consumer sees an error.',
  start() {
    const s = ledProject({ clock: at(1, 8, 30) })
    for (const key of Object.keys(LED)) {
      s.apis.push(ledApi(key, 'Production'))
      s.apps.push(ledApp(s, key, 'Production'))
    }
    s.traffic.push(...PROD_TRAFFIC)
    const first = s.assets.find((a) => a.assetId === ASSET)
    s.assets.push({ ...first, version: '2.0.0', apiVersion: 'v2', raml: RAML_V2, t: at(0, 15) })
    Object.assign(s.projects.find((p) => p.name === inventory.name), { raml: RAML_V2, published: '2.0.0' })
    for (const env of ['Sandbox', 'Production'])
      s.apis.push(newApi(V2[env], { name: inventory.name, assetId: ASSET, env, version: '2.0.0', apiVersion: 'v2', label: `${V2_APP}-${env === 'Sandbox' ? 'sbx' : 'prd'}`, policies: [policy('client-id')], contracts: [{ client: proc.client.name, tier: '', status: 'approved', t: at(0, 16) }] }))
    s.jars.push({ pkg: PKG.inventory2, autodiscovery: jarOf('inventory').autodiscovery, jar: JAR.inventory2 }, { pkg: PKG.process11, autodiscovery: jarOf('process').autodiscovery, jar: JAR.process11 })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Map the chain in Visualizer',
      how: 'Open Visualizer and choose inventory-sapi. Follow the lines: which application calls it, and which applications call that one? Switch the environment to Production and look again.',
      done: (s) => Boolean(s.seen['vis:inventory-sapi']),
    },
    {
      title: 'Check the contracts of v1',
      how: 'API Manager, Inventory System API v1, Contracts. One client application has a contract: Order Fulfilment API. Then open the Order Fulfilment Process API and the two Experience APIs and read their contracts too.',
      done: (s) => Boolean(s.seen[`api:${V1.Sandbox}`] || s.seen[`api:${V1.Production}`]),
    },
    ask(
      'Where the address lives',
      `Runtime Manager, ${proc.app}, Settings, Properties. What decides which version of the Inventory System API it calls?`,
      ['The API instance of the Inventory System API', 'Its property inventory.url, and a contract of its client application Order Fulfilment API on the instance it calls', 'The RAML of the Process API', 'The layer property of Visualizer'],
      1,
      'A consumer calls an address that sits in its own properties, and the gateway of the provider lets it in when its client ID has a contract. Moving a consumer means a new address and a contract on the new instance.',
    ),
    ask(
      'Who is affected',
      'Inventory v2 has warehouses instead of available. If v2 replaced v1 in place, who would see a change?',
      ['Only inventory-sapi', `${proc.app}, which reads available, and through it ${mobile.app} and ${partner.app}, so the Mobile App and Partner Portal`, 'Only Partner Portal, because it shows the stock', 'Nobody, the stock is still in the answer'],
      1,
      `${proc.app} is the direct consumer. The two Experience APIs depend on it, so a break in the Process API reaches both. When release 1.1.0 of the Process API reads v2 and keeps its own answer, the Experience APIs need no change at all.`,
    ),
    ask(
      'The safe order',
      'Which order changes nothing for the callers on the way?',
      [
        `Move ${proc.app} to v2 first, then deploy v2, then stop v1`,
        `Deploy v2 next to v1, move ${proc.app} to v2 and test it, in Sandbox first and then in Production. Stop v1 last, when it gets no calls`,
        'Replace v1 with v2 under the same name in one night',
        'Stop v1 first so nobody uses it, then deploy v2',
      ],
      1,
      'The provider adds the new version next to the old one, each consumer moves when it is ready, and the old version goes last. Every other order leaves a moment where a consumer calls something that is not there or does not match.',
    ),
    {
      title: `Sandbox: deploy ${V2_APP}`,
      how: `Environment Sandbox. Runtime Manager, Deploy application, name ${V2_APP}, file ${JAR.inventory2}, target Private Space brightmart-ps, no public endpoint. Paste these properties, which hold the ID of the v2 instance of Sandbox, and add the protected property anypoint.platform.client_secret from Environment information. inventory-sapi keeps running v1.`,
      code: TEMPLATE('Sandbox'),
      done: (s) => v2Running(s, 'Sandbox'),
    },
    {
      title: `Sandbox: move ${proc.app}`,
      how: `Runtime Manager, ${proc.app}, Settings. Application File ${JAR.process11}, and set inventory.url to ${internal(V2_APP)}. Change both in one Apply Changes. Had you done this before ${V2_APP} existed, both Experience APIs would answer 503: the Process API would call an address that is not there.`,
      done: (s) => moved(s, 'Sandbox'),
    },
    {
      title: 'Sandbox: test both Experience APIs',
      how: 'API client in Sandbox: GET /my-orders/O-1001 as Mobile App and GET /partner-orders/O-1002 as Partner Portal. Both answer 200 with the same stock as before, now added up from two warehouses.',
      done: (s) => proven(s, 'Sandbox'),
    },
    {
      title: `Production: deploy ${V2_APP}`,
      how: `Switch the environment to Production. Deploy ${V2_APP} the same way with these properties, which hold the ID of the v2 instance of Production and the client ID of Production. The client secret of Production is in Environment information.`,
      code: TEMPLATE('Production'),
      done: (s) => v2Running(s, 'Production'),
    },
    {
      title: `Production: move ${proc.app}`,
      how: `Production, Runtime Manager, ${proc.app}, Settings. Application File ${JAR.process11}, inventory.url ${internal(V2_APP, 'Production')}. Apply Changes.`,
      done: (s) => moved(s, 'Production'),
    },
    {
      title: 'Production: prove both consumers',
      how: 'API client in Production: GET /my-orders/O-1001 as Mobile App and GET /partner-orders/O-1002 as Partner Portal. Both answer 200. Visualizer of Production shows the line from the Process API to the new application.',
      done: (s) => proven(s, 'Production'),
    },
    {
      title: 'Production: retire v1 last',
      how: 'Move the clock by 15 minutes. API Manager, Inventory System API v1 of Production: no new requests. Then Runtime Manager, inventory-sapi in Production, Stop or Delete application. v1 of Sandbox can follow on the same rule.',
      done: (s) => v1Quiet(s, 'Production') && v1Gone(s, 'Production') && proven(s, 'Production') && proven(s, 'Sandbox'),
    },
  ],
  why: 'Before changing an API, find its consumers: Visualizer draws the calls between applications from their traffic, API Manager lists the client applications with a contract, and the properties of each consumer hold the address it calls. A change that breaks the contract is a new major version that runs next to the old one. The direct consumer moves first in Sandbox and then in Production, and the old version goes last, when it has no calls. Here the Process API absorbs the change: it reads v2 and keeps its own answer, so the Experience APIs and their clients change nothing. In the lab the v2 instances and their contracts already exist, and both releases are already built.',
  docs: 'https://docs.mulesoft.com/visualizer/',
  solve(start) {
    let s = mark(mark(start, 'vis:inventory-sapi'), `api:${V1.Sandbox}`)
    s = release(s, 'Sandbox')
    s = release(s, 'Production')
    s = until(s, s.clock + QUIET)
    return inEnv(deleteApp(s, inventory.app), 'Production')
  },
  answers: { 2: 1, 3: 1, 4: 1 },
}

export const LABS = [lab]
