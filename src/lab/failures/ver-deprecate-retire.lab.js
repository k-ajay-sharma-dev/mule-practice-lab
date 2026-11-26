// The guided lab ver-deprecate-retire. See platform-labs.js for the shape of a lab.
import { addMonAlert, apiById, at, deleteApp, eventsOf, mark, MINUTE, newApi, newApp, requestAccess, setContract } from '../platform.js'
import { app, ask, call, change, OPS, policy, propsValue, until } from '../platform-kit.js'
import { internal, LED, ledForm, ledProject, patchApp, PRIVATE_SPACE } from '../platform-project.js'
import { LAYER_PROPERTY, PKG } from './ver-deprecate-retire.pkg.js'

const { customers, process: proc } = LED
const ASSET = 'customers-system-api'
const V1 = customers.id
const V2 = '19500311'
const V1_APP = customers.app
const V2_APP = 'customers-sapi-v2'
const RETURNS = 'returns-papi'
const V1_URL = internal(V1_APP)
const V2_URL = internal(V2_APP)
const START = at(1, 9)
const QUIET = 15 * MINUTE
const JAR = {
  customers2: 'customers-sapi-2.0.0-mule-application.jar',
  process11: 'order-fulfilment-papi-1.1.0-mule-application.jar',
  returns12: 'returns-papi-1.2.0-mule-application.jar',
  returns13: 'returns-papi-1.3.0-mule-application.jar',
}
const RETURNS_CLIENT = { name: 'Returns API', clientId: 'ret-3a58', clientSecret: 'ret-secret-12' }
const LOYALTY = { name: 'Loyalty Sync', clientId: 'loy-90b4', clientSecret: 'loy-secret-35' }
const PORTAL = { name: 'Returns Portal', clientId: 'rpo-61d7', clientSecret: 'rpo-secret-08' }
const RAML_V2 = customers.raml.replace('"email":', '"contactEmail":').replace('version: v1', 'version: v2')

const getReturn = (s) => call(s, RETURNS, PORTAL, '/returns/R-501').state
const running = (s, name) => app(s, name)?.status === 'Running'
const v2Contract = (s) => Boolean(apiById(s, V2)?.contracts.some((c) => c.client === RETURNS_CLIENT.name && c.status === 'approved'))
const moved = (s) => app(s, RETURNS)?.pkg === PKG.returns13 && propsValue(app(s, RETURNS), 'customers.url') === V2_URL && running(s, RETURNS)
const v1Calls = (s, from) => eventsOf(s, { api: V1 }, from, s.clock).filter((e) => e.k === 'in')
const quiet = (s) => moved(s) && s.clock - app(s, RETURNS).updated >= QUIET && v1Calls(s, app(s, RETURNS).updated).length === 0
const revoked = (s) => apiById(s, V1).contracts.every((c) => c.status !== 'approved')
// a call of returns-papi to v1 that failed: v1 was stopped, deleted or locked while the Returns team still used it
const brokeReturns = (s) => (app(s, RETURNS)?.logs ?? []).some((l) => l.t >= START && l.level === 'ERROR' && l.text.includes(`${V1_URL}/customers`))
const v1Gone = (s) => !app(s, V1_APP) || app(s, V1_APP).status === 'Stopped'

const lab = {
  id: 'p-ver-deprecate-retire',
  group: 'Versioning without breaking consumers',
  title: 'Retire v1 without breaking anyone',
  minutes: 30,
  scenario:
    'Last week the Customers team released the Customers System API v2: asset 2.0.0, its own API instance and customers-sapi-v2 running next to customers-sapi. In v2 the field email is called contactEmail. The Order Fulfilment Process API moved to v2 the same day. Now the team wants to switch off v1. Before you do, find out who still calls it, warn them, help them move, and remove v1 only when nobody needs it. A consumer that still calls v1 gets errors the moment v1 is gone.',
  start() {
    let s = ledProject({ clock: at(1, 8) })
    s.clients.push(structuredClone(RETURNS_CLIENT), structuredClone(LOYALTY), structuredClone(PORTAL))
    const first = s.assets.find((a) => a.assetId === ASSET)
    s.assets.push({ ...first, version: '2.0.0', apiVersion: 'v2', raml: RAML_V2, t: at(0, 11) })
    Object.assign(s.projects.find((p) => p.name === customers.name), { raml: RAML_V2, published: '2.0.0' })
    apiById(s, V1).contracts.push({ client: RETURNS_CLIENT.name, tier: '', status: 'approved', t: 0 }, { client: LOYALTY.name, tier: '', status: 'approved', t: 0 })
    s.apis.push(newApi(V2, { name: customers.name, assetId: ASSET, version: '2.0.0', apiVersion: 'v2', label: 'customers-sapi-v2-sbx', seen: true, policies: [policy('client-id')], contracts: [{ client: proc.client.name, tier: '', status: 'approved', t: at(0, 11) }] }))
    const { name: _, ...v2Form } = ledForm(s, 'customers', V2)
    s.apps.push(newApp(V2_APP, { ...v2Form, pkg: PKG.customers2, jar: JAR.customers2, publicEndpoint: false }))
    patchApp(s, 'process', { pkg: PKG.process11, jar: JAR.process11, props: { 'customers.url': V2_URL } })
    s.apps.push(
      newApp(RETURNS, {
        pkg: PKG.returns12, jar: JAR.returns12, target: PRIVATE_SPACE, publicEndpoint: true,
        props: { [LAYER_PROPERTY]: 'Process', 'customers.url': V1_URL, 'sapi.client_id': RETURNS_CLIENT.clientId, 'http.timeout': '10000' },
        secrets: { 'sapi.client_secret': RETURNS_CLIENT.clientSecret },
      }),
    )
    s.jars.push(
      { pkg: PKG.customers2, autodiscovery: { apiId: '${api.id}', flowRef: `${V1_APP}-main` }, jar: JAR.customers2 },
      { pkg: PKG.process11, autodiscovery: { apiId: '${api.id}', flowRef: `${proc.app}-main` }, jar: JAR.process11 },
      { pkg: PKG.returns12, jar: JAR.returns12 },
      { pkg: PKG.returns13, jar: JAR.returns13 },
    )
    s.traffic.push({ app: RETURNS, env: 'Sandbox', client: PORTAL.name, path: '/returns/R-501', perMinute: 1 })
    s = addMonAlert(s, { title: 'Errors in the returns API', resource: 'Application', name_: RETURNS, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, recipients: OPS, minutes: 1 })
    return until(s, START)
  },
  steps: [
    {
      title: 'Open the v1 instance',
      how: 'API Manager, API Administration, Customers System API v1. Open Contracts: three client applications have an approved contract. A contract says who may call, not who does.',
      done: (s) => Boolean(s.seen[`api:${V1}`]),
    },
    {
      title: 'See who really calls v1',
      how: `Open Visualizer and choose ${V1_APP}. Look at the lines that come into it, and compare with ${V2_APP}. The API Summary of the v1 instance in API Manager shows the same traffic as a count.`,
      done: (s) => Boolean(s.seen[`vis:${V1_APP}`] || s.seen[`dash:api:${V1}`]),
    },
    ask(
      'Who still calls v1',
      'The v1 instance has contracts for Order Fulfilment API, Returns API and Loyalty Sync. Who calls v1 today?',
      ['All three, they all have a contract', `Only ${RETURNS}, with the client application Returns API`, 'Only order-fulfilment-papi', 'Nobody, v2 is live'],
      1,
      `Contracts list who may call. Traffic shows who does. order-fulfilment-papi calls ${V2_APP} since last week, Loyalty Sync has made no call, and ${RETURNS} of the Returns team still reads v1 every minute.`,
    ),
    ask(
      'Deprecate 1.0.0 in Exchange',
      'The next move is to mark Customers System API 1.0.0 as deprecated in Exchange, under Manage versions. What does that do?',
      ['It stops every call to v1 at once', 'It deletes the v1 instance in API Manager', 'It marks the version in Exchange, so every team that looks at the asset sees it is on its way out. Calls to v1 keep working', 'It moves the callers to v2'],
      2,
      'A deprecated version behaves like a stable one. Only its status differs, and it can go back to stable. Only an Exchange Administrator can deprecate. The Exchange of this lab has no Manage versions menu, so here it is a question.',
    ),
    ask(
      'Warn the Returns team',
      'What does your notice to the Returns team say?',
      ['That v1 goes away soon', `Which version replaces v1 and what changed in it: email is now contactEmail. How to get a contract on v2, the address of ${V2_APP}, and the date after which v1 stops`, 'Nothing, they will notice the errors', 'The client secret of v2'],
      1,
      'A consumer needs the new contract, a way in and a date. The change of the field means their code changes too, so they need time to build and test a release.',
    ),
    {
      title: 'Give Returns API a contract on v2',
      how: 'The Returns team replies that release 1.3.0 of returns-papi is ready and reads contactEmail. First the access: Exchange, Customers System API, version 2.0.0, Request access. Choose the instance customers-sapi-v2-sbx and the application Returns API.',
      done: v2Contract,
    },
    {
      title: `Apply the Returns release`,
      how: `The Returns team asks you to apply it in their change window. Runtime Manager, ${RETURNS}, Settings. Application File ${JAR.returns13}, and on the Properties tab set customers.url to ${V2_URL}. Change both in the same Apply Changes: the new file reads contactEmail, the old one reads email.`,
      done: moved,
    },
    {
      title: 'Check the Returns API',
      how: `API client, ${RETURNS} as Returns Portal, GET /returns/R-501. It answers 200 and the customer has an email, now read from v2.`,
      done: (s) => moved(s) && (s.lastCalls ?? []).some((c) => c.app === RETURNS && c.status === 200 && c.t > app(s, RETURNS).updated),
    },
    {
      title: 'Wait until v1 is quiet',
      how: 'Move the lab clock by 15 minutes. API Manager, Customers System API v1, API Summary: no new requests. In Visualizer no line goes into customers-sapi any more. Quiet for a while is the proof that nobody needs v1.',
      done: quiet,
    },
    ask(
      'A contract with no calls',
      'Loyalty Sync has an approved contract on v1 and made no call in the last hours. What do you do?',
      ['Ignore it, a contract does no harm', 'Ask its owner first. A job that runs once a month makes no calls for weeks. When the owner confirms, revoke the contract', 'Move it to v2 yourself', 'Delete the client application in Exchange'],
      1,
      'Traffic of a few hours proves little for a monthly job. The owner of the client application knows. A revoked contract can be restored if someone was missed.',
    ),
    {
      title: 'Revoke the v1 contracts',
      how: 'API Manager, Customers System API v1, Contracts. Revoke each contract. The v2 instance keeps its own contracts.',
      done: revoked,
    },
    {
      title: 'Remove v1',
      how: `Runtime Manager, ${V1_APP}, Settings, Delete application. ${V2_APP} keeps serving. If ${RETURNS} logged a failed call to v1 at any point of this lab, v1 went away while a consumer still needed it, and the lab does not count the retirement. Restart the lab to do it in order.`,
      done: (s) => v1Gone(s) && quiet(s) && revoked(s) && running(s, V2_APP) && !brokeReturns(s),
    },
  ],
  why: 'A new major version runs next to the old one so that each consumer can move on its own plan. Retiring the old one is a process: find the callers from the traffic, not only from the contracts, mark the version deprecated in Exchange, tell each consumer what changed and by when, give them a contract on the new instance, wait until the old instance is quiet, and only then revoke the contracts and remove the application. Removing it earlier turns a planned change into an outage for whoever was still calling. Deprecation in Exchange only flags the version: it stops nothing. In the lab the Returns release is already built, the Exchange has no Manage versions menu, so deprecation is a question, and the instance stays in API Manager after the application is gone.',
  docs: 'https://docs.mulesoft.com/exchange/lifecycle',
  solve(start) {
    let s = mark(mark(start, `api:${V1}`), `vis:${V1_APP}`)
    s = requestAccess(s, V2, RETURNS_CLIENT.name)
    s = change(s, RETURNS, { pkg: PKG.returns13, jar: JAR.returns13, props: { ...app(s, RETURNS).props, 'customers.url': V2_URL } })
    s = getReturn(s)
    s = until(s, s.clock + QUIET)
    for (const c of apiById(s, V1).contracts) s = setContract(s, V1, c.client, { status: 'revoked' })
    return deleteApp(s, V1_APP)
  },
  answers: { 2: 1, 3: 2, 4: 1, 9: 1 },
}

export const LABS = [lab]
