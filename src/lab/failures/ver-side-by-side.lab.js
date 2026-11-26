// The guided lab ver-side-by-side. See platform-labs.js for the shape of a lab.
// A System API needs a breaking change. v1 keeps running for its consumer, and v2 runs next to it as its own
// application with its own API instance, for the new consumer.
import { addApi, apiById, applyPolicy, at, deployApp, finishDeploys, mark, newApi, newApp, pairing, requestAccess } from '../platform.js'
import { app, ask, asset, call, change, CLIENTS, creds, policy, until } from '../platform-kit.js'
import { internal, jarOf, LED, ledClient, ledForm, ledProject, patchApp, PRIVATE_SPACE, propText } from '../platform-project.js'
import { PKG } from './ver-side-by-side.pkg.js'

const [MOBILE_APP] = CLIENTS
const { mobile, process: proc, inventory } = LED
const ASSET = 'inventory-system-api'
const V2_APP = 'inventory-sapi-v2'
const STORE = { app: 'store-stock-eapi', id: '19500104', name: 'Store Stock Experience API', assetId: 'store-stock-experience-api' }
const TABLET = { name: 'Store Tablet', clientId: 'stt-3a61', clientSecret: 'stt-secret-58' }
const STORE_CLIENT = { name: 'Store Stock API', clientId: 'sse-9d04', clientSecret: 'sse-secret-36' }
const JAR = { v1: jarOf('inventory').jar, v2: 'inventory-sapi-2.0.0-mule-application.jar' }
const RAML_V2 = inventory.raml.replace('version: v1', 'version: v2').replace('"available":24', '"onHand":24')
const STORE_RAML = `#%RAML 1.0
title: Store Stock Experience API
version: v1
mediaType: application/json
/store-stock:
  /{sku}:
    get:
      description: The stock of one product for the store tablets
      responses:
        200:
          body:
            example: |
              {"sku":"H-100","onHand":24}
`
const TEMPLATE = propText(ledProject({ traffic: [] }), 'inventory', 'Sandbox', 'PASTE_THE_V2_API_INSTANCE_ID')
const PAPI = ledClient('process').name

const running = (s, name) => app(s, name)?.status === 'Running'
const calledSince = (s, name, t) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === 'Sandbox' && c.status === 200 && c.t > t)
// the Process API met the v2 answer on the v1 address and could not read the stock
const broke = (s) => (app(s, proc.app)?.store?.nullStock ?? 0) > 0
const v1Back = (s) => app(s, inventory.app)?.pkg === 'inventory-sapi' && running(s, inventory.app) && pairing(s, app(s, inventory.app)).api?.id === inventory.id
const v2Api = (s) => s.apis.find((a) => a.env === 'Sandbox' && a.assetId === ASSET && a.apiVersion === 'v2' && a.version.startsWith('2.'))
const v2Running = (s) => {
  const a = app(s, V2_APP)
  return a?.pkg === PKG.inventory2 && running(s, V2_APP) && a.publicEndpoint === false && Boolean(v2Api(s)) && pairing(s, a).api?.id === v2Api(s).id
}
const v2Contract = (s) => Boolean(v2Api(s)?.contracts.some((c) => c.client === STORE_CLIENT.name && c.status === 'approved'))
// the old consumer was never touched: same release, same configuration, same contract on v1
const untouched = (s) => {
  const p = app(s, proc.app)
  return p?.pkg === PKG.process && p.config === 1 && running(s, proc.app) && p.props['inventory.url'] === internal(inventory.app) && Boolean(apiById(s, inventory.id)?.contracts.some((c) => c.client === PAPI && c.status === 'approved'))
}
const getStore = (s) => call(s, STORE.app, TABLET, '/store-stock/H-100').state
const getMobile = (s) => call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state

const lab = {
  id: 'p-ver-side-by-side',
  group: 'Versioning without breaking consumers',
  title: 'Run v1 and v2 of a System API side by side',
  minutes: 35,
  scenario:
    'The Inventory team renamed the field available to onHand. They published it in Exchange as asset 2.0.0 with API version v2, and the jar is built. The new store tablets of Harbor Foods need it: store-stock-eapi is deployed and waits for v2. order-fulfilment-papi still reads available from v1, and its team has no time to change it this quarter. Release v2 so that the tablets get onHand and the Process API keeps working without a single change.',
  start() {
    const s = ledProject()
    s.clients.push(structuredClone(TABLET), structuredClone(STORE_CLIENT))
    s.jars = s.jars.map((j) => (typeof j !== 'string' && j.pkg === proc.app ? { ...j, pkg: PKG.process } : j))
    s.jars.push({ pkg: PKG.inventory2, autodiscovery: jarOf('inventory').autodiscovery, jar: JAR.v2 })
    patchApp(s, 'process', { pkg: PKG.process, store: {} })
    s.assets.push(
      { ...s.assets.find((a) => a.assetId === ASSET), version: '2.0.0', apiVersion: 'v2', raml: RAML_V2, t: at(0, 16) },
      asset(STORE.assetId, STORE.name, STORE_RAML),
    )
    const c = creds(s, 'Sandbox')
    s.apis.push(newApi(STORE.id, { name: STORE.name, assetId: STORE.assetId, label: `${STORE.app}-sbx`, seen: true, policies: [policy('client-id')], contracts: [{ client: TABLET.name, tier: '', status: 'approved', t: 0 }] }))
    s.apps.push(
      newApp(STORE.app, {
        target: PRIVATE_SPACE, publicEndpoint: true, autodiscovery: { apiId: '${api.id}', flowRef: `${STORE.app}-main` }, updated: at(0, 17),
        props: { 'anypoint.platform.visualizer.layer': 'Experience', 'inventory.url': internal(V2_APP), 'sapi.client_id': STORE_CLIENT.clientId, 'api.id': STORE.id, ...c.props },
        secrets: { 'sapi.client_secret': STORE_CLIENT.clientSecret, ...c.secrets },
      }),
    )
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Compare the two versions',
      how: 'Exchange, Inventory System API. Choose version 1.0.0, then 2.0.0, and read the Summary. 1.0.0 has version: v1 and the field available. 2.0.0 has version: v2 and the field onHand.',
      done: (s) => Boolean(s.seen[`asset:${ASSET}`]),
    },
    {
      title: 'Find who calls v1',
      how: `API Manager, Inventory System API, instance ${inventory.id}. Open Contracts: ${PAPI} has a contract. That is order-fulfilment-papi. Note the API Instance ID.`,
      done: (s) => Boolean(s.seen[`api:${inventory.id}`]),
    },
    {
      title: 'Try v2 in place, in Sandbox',
      how: `Runtime Manager, ${inventory.app}, Settings. Application File ${JAR.v2}, Apply Changes. Same name, same URL, same API instance. Then API client, ${mobile.app} as Mobile App, GET /my-orders/O-1001. It answers 502. Open the Logs of ${proc.app}: it answered 500 with Cannot coerce Null (null) to Number.`,
      done: broke,
    },
    ask(
      'Why it broke',
      `The v2 jar runs fine and answers 200. Why did ${proc.app} fail?`,
      ['The v2 jar has a bug', `Every caller of ${inventory.app} got v2 at the same moment, with no choice. The Process API still reads available, which v2 no longer sends`, 'The API instance blocked the call', 'Sandbox has too little memory'],
      1,
      'A breaking change deployed in place has the same address and the same API instance as v1. Every consumer gets the new contract at once, whether it is ready or not. Here the DataWeave transform of the Process API reads available as a Number and fails on null.',
    ),
    {
      title: 'Put v1 back',
      how: `Runtime Manager, ${inventory.app}, Settings. Application File ${JAR.v1}, Apply Changes. Call GET /my-orders/O-1001 as Mobile App once more: 200.`,
      done: (s) => broke(s) && v1Back(s) && calledSince(s, mobile.app, app(s, inventory.app).updated),
    },
    {
      title: 'Create an API instance for v2',
      how: 'API Manager, Add API, Mule Gateway, Connect to existing application. Select the Inventory System API, asset version 2.0.0. Save & Deploy. Then Policies, Add policy, Client ID Enforcement. Copy the new API Instance ID. The v1 instance stays as it is.',
      done: (s) => Boolean(v2Api(s)?.policies.some((p) => p.type === 'client-id')),
    },
    ask(
      'A new instance',
      'Why does v2 get its own API instance instead of moving the v1 instance to 2.0.0?',
      ['An instance holds only one application', 'In API Manager an instance changes its asset version only within one major version. A new major version gets a new instance, with its own API ID, policies and contracts', 'Exchange does not allow two instances of one asset', 'To save vCores'],
      1,
      'The v1 instance keeps its ID, its policies and the contract of the Process API. The v2 instance starts empty, and each consumer of v2 requests access to it.',
    ),
    {
      title: `Deploy ${V2_APP}`,
      how: `Runtime Manager, Deploy application, name ${V2_APP}, file ${JAR.v2}, target Private Space ${PRIVATE_SPACE}, no public endpoint. Paste the properties and put the ID of the v2 instance in api.id. Add the protected property anypoint.platform.client_secret from Environment information. ${inventory.app} keeps running v1.`,
      code: TEMPLATE,
      done: v2Running,
    },
    ask(
      'Two applications',
      `Why a second application named ${V2_APP} and not v1 and v2 in one application?`,
      ['Runtime Manager allows one jar per name', `Through autodiscovery each application pairs with one API instance, by the ID in api.id. ${inventory.app} keeps the v1 ID and ${V2_APP} has the v2 ID, so each version has its own address, policies and contracts`, 'v2 needs more memory', 'Two versions in one application run slower'],
      1,
      `In the lab each version is its own deployment. The address of ${inventory.app} does not change, so the callers of v1 notice nothing.`,
    ),
    {
      title: 'Give the tablets a contract on v2',
      how: `Exchange, Inventory System API, version 2.0.0, Request access. Choose the v2 instance and the client application ${STORE_CLIENT.name}. ${STORE.app} calls v2 with that client ID.`,
      done: v2Contract,
    },
    {
      title: 'Prove that v2 answers',
      how: `API client, ${STORE.app} as ${TABLET.name}, GET /store-stock/H-100. It answers 200 with onHand. In Visualizer, ${STORE.app} calls ${V2_APP}.`,
      done: (s) => v2Running(s) && v2Contract(s) && calledSince(s, STORE.app, app(s, V2_APP).updated),
    },
    {
      title: 'Prove that v1 still answers',
      how: `API client, ${mobile.app} as Mobile App, GET /my-orders/O-1001. 200, with inStock. ${proc.app} is still on configuration 1: nobody changed it, and it still calls ${inventory.app} with its contract on v1.`,
      done: (s) => untouched(s) && v1Back(s) && v2Running(s) && calledSince(s, mobile.app, Math.max(app(s, V2_APP)?.updated ?? Infinity, app(s, inventory.app).updated)),
    },
    ask(
      'When v1 can go',
      `When can ${inventory.app} with v1 be stopped?`,
      ['Now, v2 is live', 'After the last consumer of v1 has moved to v2 and API Manager shows no more calls on the v1 instance. Deprecate 1.0.0 in Exchange first, so no new consumer starts on it', 'Never', 'After one day'],
      1,
      'Side by side buys time. Each consumer moves on its own plan, and v1 is retired only when nobody calls it.',
    ),
  ],
  why: 'A breaking change released in place reaches every consumer at once, because it has the same address and the same API instance. Released as a new major version it runs next to v1: asset 2.0.0 with API version v2 in Exchange, its own API instance in API Manager, and its own application paired by autodiscovery with the ID of that instance. New consumers request access to v2. Old consumers keep their contract on v1 and move when they are ready. In the lab the 2.0.0 jar is already built, the Process API reads available as a Number the way a DataWeave transform does. An instance moves only within its major version, in the lab as on the platform, so a new major version needs a new instance.',
  docs: 'https://docs.mulesoft.com/api-manager/latest/manage-versions-instances-concept',
  solve(start) {
    let s = mark(mark(start, `asset:${ASSET}`), `api:${inventory.id}`)
    s = change(s, inventory.app, { pkg: PKG.inventory2, jar: JAR.v2 })
    s = getMobile(s)
    s = change(s, inventory.app, { pkg: 'inventory-sapi', jar: JAR.v1 })
    s = getMobile(s)
    s = addApi(s, { assetId: ASSET, version: '2.0.0', label: 'inventory-v2-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = finishDeploys(deployApp(s, { ...ledForm(s, 'inventory', id), name: V2_APP, pkg: PKG.inventory2, jar: JAR.v2 }).state)
    s = requestAccess(s, id, STORE_CLIENT.name)
    return getMobile(getStore(s))
  },
  answers: { 3: 1, 6: 1, 8: 1, 12: 1 },
}

export const LABS = [lab]
