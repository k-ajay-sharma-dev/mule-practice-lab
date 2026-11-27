// Guided labs on the API-led project of Brightmart: design, build, secure, watch, repair, change and promote the layers.
import {
  addApi, addMonAlert, addTier, advance, apiStatus, appNamed, applyPolicy, at, callApi, createProject, deployApp, eventsOf, finishDeploys, mark, MINUTE, mockCall, pairing, promoteApi, publish, ramlErrors,
  requestAccess, saveProject, setBackend, setContract, startApp, viewMessages,
} from './platform.js'
import { app, ask, asset, call, called, change, CLIENTS, OPS, policy, propsValue, recent, sawLogs, until, withProp } from './platform-kit.js'
import { LAYER_PROPERTY } from './platform-led.js'
import { internal, jarOf, LED, ledApi, ledApp, ledClient, ledForm, ledProject, patchApp, PRIVATE_SPACE, propText } from './platform-project.js'

const VIS = 'https://docs.mulesoft.com/visualizer/'
const APIM = 'https://docs.mulesoft.com/api-manager/latest/'
const CH2 = 'https://docs.mulesoft.com/cloudhub-2/'
const GROUP = 'API-led project'
const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc, customers, orders, inventory } = LED

const layerOf = (s, d) => app(s, d.app)?.props[LAYER_PROPERTY]
const apiOf = (s, d, env = 'Sandbox') => s.apis.find((a) => a.env === env && a.name === d.name)
const active = (s, d, env) => Boolean(apiOf(s, d, env)) && apiStatus(s, apiOf(s, d, env)) === 'Active'
const contract = (s, d, client, env) => apiOf(s, d, env)?.contracts.find((c) => c.client === client && c.status === 'approved')
const sawDash = (d, tab) => ({ title: `Open the dashboard of ${d.app}`, how: `Monitoring, Built-in dashboards, choose ${d.app}, View.${tab ? ` Then the ${tab} tab.` : ''}`, done: (s) => Boolean(s.seen[`dash:${d.app}${tab ? `:${tab}` : ''}`]) })
const sawMap = { title: 'Open the map', how: 'Open Visualizer from the menu. Each box is an application, each line is a call.', done: (s) => Boolean(s.seen.visualizer) }
const getMobile = (s, client = MOBILE_APP) => call(s, mobile.app, client, '/my-orders/O-1001')
const calm = (s, d, code) => recent(s, d.app, 3).length > 0 && recent(s, d.app, 3).every((e) => e.s === (code ?? 200))
const deployLed = (s, key, apiId) => {
  const env = s.env
  return finishDeploys(deployApp(s, ledForm(s, key, apiId, env)).state)
}
const sample = ledProject()
const TEMPLATE = (key, env = 'Sandbox', id = 'PASTE_THE_API_INSTANCE_ID') => propText(sample, key, env, id)
const running = (s, d, env = 'Sandbox') => appNamed(s, d.app, env)?.status === 'Running'
const isPrivate = (s, d) => Boolean(app(s, d.app)) && app(s, d.app).publicEndpoint === false
const start = (s) => until(s, at(1, 9))

// ---------- design ----------

const design = {
  id: 'p-led-design',
  group: GROUP,
  title: '1. Read and fix the layers',
  minutes: 12,
  scenario: 'Brightmart built its order project with API-led connectivity: two Experience APIs, one Process API and three System APIs. Read the map of the project. Two applications are not where they belong on it.',
  start: () => start(patchApp(patchApp(ledProject(), 'inventory', { props: { [LAYER_PROPERTY]: 'Experience' } }), 'process', { props: { [LAYER_PROPERTY]: '' } })),
  steps: [
    sawMap,
    ask('Experience layer', 'What is the job of mobile-orders-eapi?', ['It reads Oracle and shapes the rows', 'It gives one kind of consumer the data in the form that consumer needs', 'It holds the rules of an order', 'It stores the orders of mobile users'], 1, 'An Experience API belongs to a consumer. The mobile app gets three fields, the partner gets the whole order.'),
    ask('Process layer', 'What is the job of order-fulfilment-papi?', ['It joins several systems and runs the steps of a business process', 'It protects the Oracle database', 'It translates RAML to OAS', 'It serves one mobile screen'], 0, 'The Process API knows the steps: check the customer, check the stock, create the order, send the event.'),
    ask('System layer', 'Why does inventory-sapi stand between the Process API and the SFTP server?', ['SFTP cannot be called from a Process API', 'It makes the files faster', 'It hides the server, the credentials and the file format behind a stable contract', 'Every project needs three layers'], 2, 'When the files move to another server, only inventory-sapi changes.'),
    { title: 'Put inventory-sapi in its layer', how: `Runtime Manager, inventory-sapi, Settings, Properties. Set ${LAYER_PROPERTY} to System, Apply Changes.`, done: (s) => layerOf(s, inventory) === 'System' && running(s, inventory) },
    { title: 'Put order-fulfilment-papi in its layer', how: `The same property on order-fulfilment-papi, with the value Process.`, done: (s) => layerOf(s, proc) === 'Process' && running(s, proc) },
    ask('A new consumer', 'A web shop needs the order status with other field names. What do you build?', ['A new System API on Oracle', 'New fields in the Process API', 'A new Experience API that calls the Process API', 'A database link from the web shop'], 2, 'The Process API and the System APIs are used again as they are. That is the gain of the layers.'),
    ask('A wrong shortcut', 'A teammate wants mobile-orders-eapi to read Oracle itself, to save two hops. What breaks first?', ['Nothing', 'The mobile API then knows the database, so a change in Oracle changes the mobile API and the same query exists twice', 'Oracle does not accept HTTP', 'The API cannot be published in Exchange'], 1, 'Two hops cost some milliseconds. A second copy of the query costs a change in two places each time.'),
    { title: 'Call the chain', how: 'API client, mobile-orders-eapi, send as Mobile App, GET /my-orders/O-1001. Then open the map again.', done: (s) => called(s, mobile.app, 200) && s.seen.visualizer !== undefined },
  ],
  why: 'A layer is a job, not a folder. Experience serves a consumer, Process runs the business steps, System hides one system. The layer property only tells Visualizer where to draw the application.',
  docs: VIS,
  solve(s) {
    let n = mark(s, 'visualizer')
    n = withProp(n, inventory.app, LAYER_PROPERTY, 'System')
    n = withProp(n, proc.app, LAYER_PROPERTY, 'Process')
    return getMobile(n).state
  },
  answers: { 1: 1, 2: 0, 3: 2, 6: 2, 7: 1 },
}

// ---------- build ----------

const buildSystem = {
  id: 'p-led-system',
  group: GROUP,
  title: '2. Build a System API',
  minutes: 30,
  scenario: 'Everything is ready except the Customers System API in front of SQL Server, so each order status fails. Design it, publish it, manage it and deploy it where only other applications can reach it.',
  start() {
    const s = ledProject({ skip: ['customers'], traffic: [] })
    s.assets = s.assets.filter((a) => a.name !== customers.name)
    s.projects = s.projects.filter((p) => p.name !== customers.name)
    return s
  },
  steps: [
    { title: 'See what is missing', how: 'API client, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001. The answer is 503.', done: (s) => called(s, mobile.app, 503) || active(s, customers) },
    { title: 'Design the API', how: 'Design Center, Create new, New API Specification, named Customers System API. Add GET /customers/{customerId}.', code: customers.raml, done: (s) => s.projects.some(designed) },
    { title: 'Publish it', how: 'Publish to Exchange, asset version 1.0.0, API version v1.', done: (s) => s.assets.some((a) => /customers/.test(a.assetId) && designed(a)) },
    { title: 'Create the API instance', how: 'API Manager, Add API, Add new API. Mule Gateway, basic endpoint, choose Customers System API from Exchange, Save & Deploy. Copy the API Instance ID.', done: (s) => Boolean(sysApi(s)) },
    { title: 'Apply Client ID Enforcement', how: 'Policies, Add policy, Client ID Enforcement.', done: (s) => Boolean(sysApi(s)?.policies.some((p) => p.type === 'client-id')) },
    {
      title: 'Deploy the application',
      how: `Runtime Manager, Deploy application, name customers-sapi, target Private Space ${PRIVATE_SPACE}, file customers-sapi-1.0.0. Properties, Text view: paste this with your API ID. Then in the Table view add the protected property anypoint.platform.client_secret with the value from API Manager, Environment information.`,
      code: TEMPLATE('customers'),
      done: (s) => running(s, customers) && propsValue(app(s, customers.app), 'db.host') === 'sql01.brightmart.lab',
    },
    { title: 'Keep it private', how: 'Ingress tab: the public endpoint is off. On a running application use Settings, Ingress, Apply Changes.', done: (s) => isPrivate(s, customers) },
    { title: 'The API is Active', how: 'API Manager shows Active. If not, read the ERROR line in the logs of customers-sapi.', done: (s) => Boolean(sysApi(s)) && apiStatus(s, sysApi(s)) === 'Active' },
    { title: 'Give the Process API a contract', how: 'Exchange, Customers System API, Request access, with the client application Order Fulfilment API.', done: (s) => Boolean(sysApi(s)?.contracts.some((c) => c.client === ledClient('process').name && c.status === 'approved')) },
    { title: 'Call the chain again', how: 'GET /my-orders/O-1001 as Mobile App answers 200.', done: (s) => called(s, mobile.app, 200) },
    { title: 'Prove that it is private', how: 'API client, customers-sapi, GET /customers/C-7. There is no answer, because the API client is outside.', done: (s) => called(s, customers.app, 0) },
  ],
  why: 'A System API is a whole API: a contract in Exchange, an instance with policies, and an application. Its only callers are the applications above it, so it needs no public endpoint.',
  docs: `${CH2}ch2-private-space-about`,
  solve(start) {
    let s = getMobile(start).state
    s = createProject(s, customers.name)
    s = saveProject(s, s.projects.at(-1).id, customers.raml)
    s = publish(s, s.projects.at(-1).id, { assetId: 'customers-system-api', name: customers.name, version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = addApi(s, { assetId: 'customers-system-api', label: 'customers-sbx', upstream: '', consumer: '' })
    s = applyPolicy(s, s.lastApi, 'client-id')
    s = deployLed(s, 'customers', s.lastApi)
    s = requestAccess(s, s.lastApi, ledClient('process').name)
    s = getMobile(s).state
    return call(s, customers.app, MOBILE_APP, '/customers/C-7').state
  },
}
const designed = (x) => /customers/i.test(x.name) && ramlErrors(x.raml).length === 0 && mockCall(x.raml, 'GET', '/customers/C-7').status === 200
const sysApi = (s) => s.apis.find((a) => a.env === 'Sandbox' && /customers/.test(a.assetId))

const buildProcess = {
  id: 'p-led-process',
  group: GROUP,
  title: '3. Build the Process API',
  minutes: 25,
  scenario: 'The System APIs and the Experience APIs are deployed. The Process API between them is missing. It calls three System APIs with its own client ID, joins the answers, and sends an event when an order is created.',
  start() {
    const s = ledProject({ skip: ['process'], traffic: [] })
    for (const d of [customers, orders, inventory]) apiOf(s, d).contracts = []
    s.apis.push({ ...ledApi('process'), seen: false })
    return s
  },
  steps: [
    { title: 'Request access to the System APIs', how: 'Exchange: Customers, Orders and Inventory System API, Request access as Order Fulfilment API. Orders has the tier Internal, which needs approval.', done: (s) => [customers, orders, inventory].every((d) => apiOf(s, d).contracts.some((c) => c.client === ledClient('process').name)) },
    { title: 'Approve the Orders contract', how: 'API Manager, Orders System API, Contracts, Approve. The team that owns the API decides who calls it.', done: (s) => Boolean(contract(s, orders, ledClient('process').name)) },
    {
      title: 'Deploy order-fulfilment-papi',
      how: `Runtime Manager, Deploy application, target Private Space ${PRIVATE_SPACE}, file order-fulfilment-papi-1.0.0, no public endpoint. Paste the properties in the Text view. Add two protected properties: sapi.client_secret is ${ledClient('process').clientSecret}, and anypoint.platform.client_secret comes from Environment information.`,
      code: TEMPLATE('process', 'Sandbox', proc.id),
      done: (s) => running(s, proc) && pairing(s, app(s, proc.app)).state === 'paired',
    },
    { title: 'Keep the secret protected', how: 'sapi.client_secret is a protected property, so nobody reads it in Runtime Manager.', done: (s) => Boolean(app(s, proc.app)?.secrets['sapi.client_secret']) && !app(s, proc.app).props['sapi.client_secret'] },
    { title: 'Read an order status', how: 'API client, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001, 200.', done: (s) => called(s, mobile.app, 200, 'GET') },
    ask('Read the time', 'The Process API reads the customer (60 ms) and the stock (140 ms) in a Scatter-Gather. How long do the two take?', ['200 ms', 'About 140 ms', 'About 60 ms'], 1, 'The routes run side by side, so the slower route sets the time. If one route fails, the Scatter-Gather ends with MULE:COMPOSITE_ROUTING.'),
    { title: 'Read an order that does not exist', how: 'GET /my-orders/O-9001 answers 404, and not 500.', done: (s) => called(s, mobile.app, 404) },
    { title: 'Create an order', how: 'POST /my-orders as Mobile App, 201. The Process API sends an event to order-events.', done: (s) => called(s, mobile.app, 201, 'POST') },
    { title: 'See the event being taken', how: 'Monitoring, Built-in dashboards, warehouse-consumer. Move the clock one minute first.', done: (s) => Boolean(s.seen['dash:warehouse-consumer']) && eventsOf(s, { app: 'warehouse-consumer', env: 'Sandbox' }, 0, s.clock).some((e) => e.k === 'msg' && e.s === 'ok') },
    ask('Why a queue', 'Why does the Process API send an event instead of calling the warehouse?', ['A queue is cheaper', 'The caller does not wait for the warehouse, and the message stays when the warehouse is down', 'The warehouse has no API contract', 'Queues keep the order of all messages'], 1, 'The order is accepted in milliseconds. The consumer takes the event when it can.'),
  ],
  why: 'The Process API is a client of the System APIs like any other: own client ID, own contract, a timeout on each call, and a decision for each error type.',
  docs: `${APIM}defining-sla-tiers`,
  solve(start) {
    let s = start
    for (const d of [customers, inventory]) s = requestAccess(s, d.id, ledClient('process').name)
    s = setContract(requestAccess(s, orders.id, ledClient('process').name, 'Internal'), orders.id, ledClient('process').name, { status: 'approved' })
    s = deployLed(s, 'process', proc.id)
    s = getMobile(s).state
    s = call(s, mobile.app, MOBILE_APP, '/my-orders/O-9001').state
    s = call(s, mobile.app, MOBILE_APP, '/my-orders', 'POST', '{}').state
    return mark(advance(s, MINUTE), 'dash:warehouse-consumer')
  },
  answers: { 5: 1, 9: 1 },
}

const buildExperience = {
  id: 'p-led-experience',
  group: GROUP,
  title: '4. Build an Experience API for partners',
  minutes: 25,
  scenario: 'The mobile app is live. Now partners want the same orders with the customer and the stock, and each partner has a quota. The Process and System APIs stay as they are.',
  start() {
    const s = ledProject({ skip: ['partner'], traffic: [] })
    apiOf(s, proc).contracts = apiOf(s, proc).contracts.filter((c) => c.client === ledClient('mobile').name)
    return s
  },
  steps: [
    { title: 'Read the specification', how: 'Exchange, Partner Orders Experience API.', done: (s) => Boolean(s.seen['asset:partner-orders-experience-api']) },
    { title: 'Create the API instance', how: 'API Manager, Add API, Add new API, Partner Orders Experience API from Exchange.', done: (s) => Boolean(apiOf(s, partner)) },
    { title: 'Add two SLA tiers', how: 'SLA Tiers: Silver, 10 requests per 1 minute, automatic approval. Gold, 60 requests per 1 minute, manual approval.', done: (s) => Boolean(apiOf(s, partner)?.tiers.some((t) => t.autoApprove) && apiOf(s, partner)?.tiers.some((t) => !t.autoApprove)) },
    { title: 'Apply the quota', how: 'Policies, Add policy, Rate Limiting: SLA-Based.', done: (s) => Boolean(apiOf(s, partner)?.policies.some((p) => p.type === 'rate-limit-sla')) },
    { title: 'Give it a contract on the Process API', how: 'Exchange, Order Fulfilment Process API, Request access as Partner Orders API.', done: (s) => Boolean(contract(s, proc, ledClient('partner').name)) },
    {
      title: 'Deploy partner-orders-eapi',
      how: `Runtime Manager, Deploy application, target Private Space ${PRIVATE_SPACE}, file partner-orders-eapi-1.0.0. Keep the public endpoint on. Paste the properties with your API ID. Protected properties: papi.client_secret is ${ledClient('partner').clientSecret}, and anypoint.platform.client_secret comes from Environment information.`,
      code: TEMPLATE('partner'),
      done: (s) => running(s, partner) && active(s, partner) && app(s, partner.app).publicEndpoint !== false,
    },
    { title: 'Give Partner Portal access', how: 'Exchange, Partner Orders Experience API, Request access as Partner Portal, tier Silver.', done: (s) => Boolean(contract(s, partner, 'Partner Portal')) },
    { title: 'Call it as the partner', how: 'API client, partner-orders-eapi as Partner Portal, GET /partner-orders/O-1001, 200.', done: (s) => called(s, partner.app, 200) },
    { title: 'Use up the quota', how: 'Send 10 until you see 429.', done: (s) => called(s, partner.app, 429) },
    { title: 'Call the mobile API', how: 'GET /my-orders/O-1001 as Mobile App, 200. Compare the two bodies.', done: (s) => called(s, mobile.app, 200) },
    ask('Who saw the 429', 'Did the Process API see the calls that got 429?', ['Yes, it counted them', 'No, the gateway of partner-orders-eapi answered them', 'Only the first one'], 1, 'The policy runs before the flow, so a partner that sends too much never reaches the layers below.'),
  ],
  why: 'Two Experience APIs, two shapes, two sets of policies, and one Process API below them. A quota belongs at the edge, where the consumer is known.',
  docs: `${APIM}defining-sla-tiers`,
  solve(start) {
    let s = mark(start, 'asset:partner-orders-experience-api')
    s = addApi(s, { assetId: 'partner-orders-experience-api', label: 'partner-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = addTier(s, id, { name: 'Silver', requests: 10, periodMs: 60000, autoApprove: true })
    s = addTier(s, id, { name: 'Gold', requests: 60, periodMs: 60000, autoApprove: false })
    s = applyPolicy(s, id, 'rate-limit-sla')
    s = requestAccess(s, proc.id, ledClient('partner').name)
    s = deployLed(s, 'partner', id)
    s = requestAccess(s, id, 'Partner Portal', 'Silver')
    for (let i = 0; i < 11; i++) s = call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
    return getMobile(s).state
  },
  answers: { 10: 1 },
}

// ---------- secure ----------

const secure = {
  id: 'p-led-secure',
  group: GROUP,
  title: '5. Secure the layers',
  minutes: 20,
  scenario: 'A review found three gaps. The mobile app can call customers-sapi on its own. The Process API has no policy. The Process and System APIs are open to the internet.',
  start() {
    const s = ledProject({ traffic: [] })
    for (const k of ['process', 'customers', 'orders', 'inventory']) patchApp(s, k, { publicEndpoint: true })
    apiOf(s, customers).contracts.push({ client: 'Mobile App', tier: '', status: 'approved', t: 0 })
    Object.assign(apiOf(s, proc), { policies: [], contracts: [{ client: ledClient('mobile').name, tier: '', status: 'approved', t: 0 }] })
    return s
  },
  steps: [
    { title: 'Prove the gap', how: 'API client, customers-sapi as Mobile App, GET /customers/C-7. The answer is 200, with the email of the customer.', done: (s) => called(s, customers.app, 200) },
    { title: 'Revoke the direct contract', how: 'API Manager, Customers System API, Contracts, Mobile App, Revoke.', done: (s) => apiOf(s, customers).contracts.some((c) => c.client === 'Mobile App' && c.status === 'revoked') || !apiOf(s, customers).contracts.some((c) => c.client === 'Mobile App') },
    { title: 'Try it again', how: 'The same call answers 401.', done: (s) => called(s, customers.app, 401) || called(s, customers.app, 0) },
    { title: 'Give the Partner API a contract', how: 'Exchange, Order Fulfilment Process API, Request access as Partner Orders API. Mobile Orders API has one.', done: (s) => Boolean(contract(s, proc, ledClient('partner').name)) },
    { title: 'Protect the Process API', how: 'API Manager, Order Fulfilment Process API, Policies, Client ID Enforcement.', done: (s) => apiOf(s, proc).policies.some((p) => p.type === 'client-id') },
    ask('The order of the two steps', 'Why do you give the contract before you apply the policy?', ['The platform asks for it', 'With the policy first, partner calls get 401 until the contract exists', 'A policy deletes the contracts'], 1, 'Contract first, policy second: no caller is refused in between.'),
    { title: 'Close the public endpoints', how: 'Runtime Manager, Settings, Ingress, public endpoint off, Apply Changes. For order-fulfilment-papi, customers-sapi, orders-sapi and inventory-sapi.', done: (s) => [proc, customers, orders, inventory].every((d) => isPrivate(s, d) && running(s, d)) },
    { title: 'The inside is closed', how: 'API client, customers-sapi: there is no answer at all.', done: (s) => called(s, customers.app, 0) },
    { title: 'The edge still works', how: 'GET /my-orders/O-1001 as Mobile App and GET /partner-orders/O-1001 as Partner Portal, both 200.', done: (s) => isPrivate(s, proc) && called(s, mobile.app, 200) && called(s, partner.app, 200) },
    ask('One client ID for all', 'A team wants all applications to share one client ID. What do you lose?', ['Nothing, it is one secret less', 'You cannot revoke or limit one caller, and the dashboards show one client for everything', 'The gateway gets slower'], 1, 'One client ID per caller gives one contract per caller. That is what you revoke when something leaks.'),
  ],
  why: 'Each layer trusts only the layer above it. The network stops outsiders, the contract stops the wrong insiders, and each pair of applications has its own credentials.',
  docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-client-id-enforcement',
  solve(start) {
    const direct = (s) => call(s, customers.app, MOBILE_APP, '/customers/C-7').state
    let s = direct(start)
    s = direct(setContract(s, customers.id, 'Mobile App', { status: 'revoked' }))
    s = requestAccess(s, proc.id, ledClient('partner').name)
    s = applyPolicy(s, proc.id, 'client-id')
    for (const d of [proc, customers, orders, inventory]) s = change(s, d.app, { publicEndpoint: false })
    s = getMobile(direct(s)).state
    return call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
  },
  answers: { 5: 1, 9: 1 },
}

// ---------- watch ----------

const TRACE = 'trace-1001'
const trace = {
  id: 'p-led-trace',
  group: GROUP,
  title: '6. Follow one call through three layers',
  minutes: 15,
  scenario: 'Support asks: what happened to one call of the mobile app? Every application of the project writes the correlation ID in its log lines and passes it on, so one search finds the whole path.',
  start: () => start(ledProject()),
  steps: [
    { title: 'Send a call with a correlation ID', how: `API client, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001. Set X-Correlation-ID to ${TRACE}.`, done: (s) => (s.lastCalls ?? []).some((c) => c.cid === TRACE && c.app === mobile.app && c.status === 200) },
    { title: 'Find the path', how: `Monitoring, Log Search, search for ${TRACE}.`, done: (s) => Object.keys(s.seen).some((k) => k.startsWith('logsearch:') && k.includes(TRACE)) },
    ask('Count the applications', 'How many applications wrote a line with this ID?', ['One', 'Three', 'Five', 'Six'], 2, 'One Experience, one Process and three System APIs.'),
    ask('Where the time goes', 'Which call of order-fulfilment-papi took the longest?', ['Customers', 'Orders', 'Inventory'], 2, 'The SFTP server needs 120 ms, so the inventory call takes 140 ms. The line "Called" has the time of each call.'),
    { title: 'Send a call that fails', how: `GET /my-orders/O-9001 with X-Correlation-ID ${TRACE}-b. The answer is 404.`, done: (s) => (s.lastCalls ?? []).some((c) => c.cid === `${TRACE}-b` && c.status === 404) },
    { title: 'Find where it started', how: `Log Search for ${TRACE}-b.`, done: (s) => Object.keys(s.seen).some((k) => k.startsWith('logsearch:') && k.includes(`${TRACE}-b`)) },
    ask('Who answered first', 'Which application answered 404 first?', ['mobile-orders-eapi', 'order-fulfilment-papi', 'orders-sapi', 'customers-sapi'], 2, 'orders-sapi did not find the order. The two layers above passed the 404 on.'),
    ask('What was not called', 'Why is there no line of inventory-sapi for the second call?', ['Its log level is WARN', 'The Process API reads the order first and stops at the 404', 'It was down'], 1, 'The order comes first, because the customer ID is in it. Without an order there is nothing to join.'),
    sawMap,
    sawDash(mobile),
  ],
  why: 'The Mule runtime passes X-Correlation-ID on with each HTTP Request, and the logger writes it as event. Keep the ID in the answer, so the caller can give it to you.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/logging-mdc',
  solve(s) {
    const send = (n, path, cid) => callApi(n, { env: 'Sandbox', app: mobile.app, method: 'GET', path, cid, client: 'Mobile App', clientId: MOBILE_APP.clientId, clientSecret: MOBILE_APP.clientSecret }).state
    let n = mark(send(s, '/my-orders/O-1001', TRACE), `logsearch:${TRACE}`)
    n = mark(send(n, '/my-orders/O-9001', `${TRACE}-b`), `logsearch:${TRACE}-b`)
    return mark(mark(n, 'visualizer'), `dash:${mobile.app}`)
  },
  answers: { 2: 2, 3: 2, 6: 2, 7: 1 },
}

// ---------- failures ----------

const down = {
  id: 'p-led-down',
  group: GROUP,
  title: '7. A System API is down',
  minutes: 15,
  scenario: 'It is 09:00. Mobile users and partners both get errors. The first suspect was the mobile team, but two consumers fail at once, so the cause is further down.',
  start: () => start(advance(patchApp(ledProject(), 'customers', { status: 'Stopped' }), 0)),
  steps: [
    sawDash(mobile, 'Errors'),
    ask('What both share', 'Mobile and partner calls both fail with 503. Where do you look next?', ['In the mobile app', 'In the layer both of them call', 'In the DNS'], 1, 'Two Experience APIs share the Process API and all that is below it.'),
    sawLogs(proc.app),
    ask('Read the error', 'What does the error block of order-fulfilment-papi name?', ['Orders API, HTTP:TIMEOUT', 'Customers API, HTTP:SERVICE_UNAVAILABLE', 'Inventory API, SFTP:CONNECTIVITY', 'Customers API, HTTP:UNAUTHORIZED'], 1, 'The call of the Customers API got 503. The Orders API answered, and the Inventory API was called side by side.'),
    sawMap,
    { title: 'Add an alert', how: `Monitoring, Alerts, Create Alert. Application ${proc.app}, Message Error Count, Above 0, with a recipient. You do this before the fix, so you can see it fire.`, done: (s) => s.monAlerts.some((a) => a.name_ === proc.app && a.metric === 'Message Error Count' && a.recipients) },
    { title: 'See it fire', how: 'Move the clock a few minutes, then open the Inbox.', done: (s) => s.mail.some((m) => m.source === 'Anypoint Monitoring') && Boolean(s.seen.inbox) },
    { title: 'Start the application', how: 'Runtime Manager, customers-sapi, Start.', done: (s) => running(s, customers) },
    { title: 'Everything recovers', how: 'Move the clock 5 minutes. Mobile and partner calls return 200 and the alert is OK.', done: (s) => calm(s, mobile) && calm(s, partner) && s.monAlerts.some((a) => a.name_ === proc.app && a.state === 'OK' && a.fired) },
  ],
  why: 'Start at the consumer, go down one layer at a time, and stop at the first application whose own calls are all fine. What every failing caller shares is the place to look.',
  docs: 'https://docs.mulesoft.com/monitoring/alerts',
  solve(s) {
    let n = mark(mark(mark(mark(s, `dash:${mobile.app}`), `dash:${mobile.app}:Errors`), `logs:${proc.app}`), 'visualizer')
    n = addMonAlert(n, { title: 'Process errors', resource: 'Application', name_: proc.app, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    n = mark(advance(n, 3 * MINUTE), 'inbox')
    return advance(finishDeploys(startApp(n, customers.app)), 5 * MINUTE)
  },
  answers: { 1: 1, 3: 1 },
}

const slow = {
  id: 'p-led-slow',
  group: GROUP,
  title: '8. A slow system spreads upwards',
  minutes: 20,
  scenario: 'Nothing is down, but the mobile app shows 504 for every order. The SFTP server has been answering in 8 seconds since 08:40. The stock is a detail on the screen, and it takes the whole order status with it.',
  start: () => start(setBackend(ledProject(), 'sftp', { ms: 8000 })),
  steps: [
    sawDash(mobile),
    sawMap,
    { title: 'Trace one call', how: 'API client, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001. The answer is 504 after 5 seconds.', done: (s) => called(s, mobile.app, 504) },
    sawLogs(proc.app),
    ask('Read the two timeouts', 'http.timeout is 5000 in mobile-orders-eapi and 10000 in order-fulfilment-papi. What happens at second 5?', ['Both stop', 'The mobile API gives up, and the Process API goes on working for nobody', 'The Process API answers 504', 'The SFTP server closes the connection'], 1, 'A timeout in a lower layer has to be shorter than the one above it. Else the lower layer does work whose answer nobody reads.'),
    { title: 'Give the stock its own limit', how: 'Runtime Manager, order-fulfilment-papi, Settings, Properties: inventory.timeout is 2000. Apply Changes.', done: (s) => Number(propsValue(app(s, proc.app), 'inventory.timeout')) > 0 && Number(propsValue(app(s, proc.app), 'inventory.timeout')) <= 3000 },
    { title: 'Answer without the stock', how: 'Set inventory.fallback to true. The flow catches the error of the inventory call and answers with stock unknown.', done: (s) => propsValue(app(s, proc.app), 'inventory.fallback') === 'true' && running(s, proc) },
    { title: 'Keep the timeouts in order', how: 'Set http.timeout of order-fulfilment-papi below the 5000 of the layer above, for example 4000.', done: (s) => Number(propsValue(app(s, proc.app), 'http.timeout')) < Number(propsValue(app(s, mobile.app), 'http.timeout')) },
    { title: 'Try the call again', how: 'GET /my-orders/O-1001 answers 200 with inStock unknown.', done: (s) => propsValue(app(s, proc.app), 'inventory.fallback') === 'true' && called(s, mobile.app, 200) },
    { title: 'The consumers recover', how: 'Move the clock 5 minutes. No more 504.', done: (s) => propsValue(app(s, proc.app), 'inventory.fallback') === 'true' && calm(s, mobile) && calm(s, partner) },
    ask('When not to fall back', 'For which call would an answer without the part be wrong?', ['The stock on a status page', 'The customer check before an order is created', 'A list of related products'], 1, 'A fallback is for data the caller can do without. A check that decides something has to fail.'),
  ],
  why: 'Give each call a timeout, make it shorter than the timeout above, and decide which parts of an answer may be missing. Then one slow system costs one field and not the whole page.',
  docs: 'https://docs.mulesoft.com/http-connector/latest/http-request-ref',
  solve(s) {
    let n = mark(mark(s, `dash:${mobile.app}`), 'visualizer')
    n = mark(getMobile(n).state, `logs:${proc.app}`)
    n = change(n, proc.app, { props: { ...app(n, proc.app).props, 'inventory.timeout': '2000', 'inventory.fallback': 'true', 'http.timeout': '4000' } })
    return advance(getMobile(n).state, 5 * MINUTE)
  },
  answers: { 4: 1, 10: 1 },
}

const revoked = {
  id: 'p-led-contract',
  group: GROUP,
  title: '9. A contract between two layers is gone',
  minutes: 12,
  scenario: 'Order status fails with 502 since 08:30. No application was deployed and none is down. Someone cleaned up contracts in API Manager yesterday evening.',
  start() {
    const s = ledProject()
    apiOf(s, orders).contracts[0].status = 'revoked'
    return start(s)
  },
  steps: [
    sawDash(mobile, 'Errors'),
    sawLogs(proc.app),
    ask('Read the error', 'What does the Process API get, and from whom?', ['HTTP:UNAUTHORIZED from the Orders API', 'HTTP:TIMEOUT from the Orders API', 'HTTP:NOT_FOUND from the Customers API', 'DB:CONNECTIVITY'], 0, 'The gateway of orders-sapi refuses the client ID of the Process API.'),
    ask('Read the two codes', 'The Orders API answers 401 and the mobile app sees 502. Why not 401?', ['The gateway changed it', 'A 401 to the mobile app would say that its own credentials are wrong, and they are fine', 'Mule turns every error into 502'], 1, 'The Process API answers 500, because its own credentials failed. The Experience API reports a bad answer from below as 502.'),
    { title: 'Find the contract', how: 'API Manager, Orders System API, Contracts.', done: (s) => Boolean(s.seen[`api:${orders.id}`]) },
    { title: 'Restore it', how: 'Order Fulfilment API, Restore.', done: (s) => Boolean(contract(s, orders, ledClient('process').name)) },
    { title: 'Add a Policy Violation alert', how: 'The same API, Alerts, Add alert, Policy Violation, with a recipient. The next 401 between two applications sends a mail.', done: (s) => apiOf(s, orders).alerts.some((a) => a.type === 'Policy Violation' && a.recipients) },
    { title: 'Prove it', how: 'Move the clock 5 minutes. Mobile calls return 200.', done: (s) => Boolean(contract(s, orders, ledClient('process').name)) && calm(s, mobile) },
  ],
  why: 'A contract is part of the running system. A 401 inside the project is a fault of the project, so it goes up as 500 or 502 and not as 401.',
  docs: `${APIM}using-api-alerts`,
  solve(s) {
    let n = mark(mark(mark(mark(s, `dash:${mobile.app}`), `dash:${mobile.app}:Errors`), `logs:${proc.app}`), `api:${orders.id}`)
    n = setContract(n, orders.id, ledClient('process').name, { status: 'approved' })
    n = structuredClone(n)
    apiOf(n, orders).alerts.push({ id: 'aa', enabled: true, state: 'OK', name: 'Violations', severity: 'Warning', type: 'Policy Violation', policy: 'Any', atLeast: 1, periods: 1, period: 1, recipients: OPS })
    return advance(n, 5 * MINUTE)
  },
  answers: { 2: 0, 3: 1 },
}

const backlog = {
  id: 'p-led-queue',
  group: GROUP,
  title: '10. The queue fills up',
  minutes: 12,
  scenario: 'A campaign brings 25 orders a minute. The mobile API is fast and without errors, but the warehouse says that orders arrive late. warehouse-consumer takes 10 messages a minute per replica.',
  start() {
    const s = ledProject({ traffic: [] })
    s.queueTraffic = Array.from({ length: 25 }, () => ({ queue: 'order-events', everyMinutes: 1 }))
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Look at the queue', how: 'MQ, order-events, Message Browser, Get Messages. Come back after the clock has moved 5 minutes and see the number grow.', done: (s) => Boolean(s.seen['mq:order-events']) },
    ask('Why nobody sees an error', 'Orders are late, and no dashboard shows an error. Why?', ['The errors are in another environment', 'Waiting in a queue is not a failure, so no message fails', 'Monitoring is off'], 1, 'The producer is fine and the consumer is fine. Only the number of waiting messages tells you.'),
    ask('Do the sum', '25 messages a minute come in, one replica takes 10. How many replicas at least, so that the backlog also gets smaller?', ['2', '3', '8'], 1, 'Three replicas take 30 a minute. Two take 20, and the queue keeps growing.'),
    { title: 'Add replicas', how: 'Runtime Manager, warehouse-consumer, Settings, Runtime, Replica Count. Apply Changes.', done: (s) => app(s, 'warehouse-consumer').replicas >= 3 && app(s, 'warehouse-consumer').status === 'Running' },
    { title: 'Empty the queue', how: 'Move the clock until order-events is empty. More replicas empty it sooner.', done: (s) => app(s, 'warehouse-consumer').replicas >= 3 && s.queues.find((q) => q.name === 'order-events').messages.length === 0 },
    ask('Order of messages', 'Four replicas read the same standard queue. What can change?', ['A message is lost', 'Two events of one order can be handled in another order than they were sent', 'Each message is handled four times'], 1, 'A standard queue gives no order across consumers. If the order matters, use a FIFO queue with the order ID as message group.'),
    ask('Say it once more', 'What should the consumer do so that a message delivered twice does no harm?', ['Run with one replica', 'Check the order ID before it writes, so that a repeat changes nothing', 'Acknowledge before it starts'], 1, 'Queues deliver at least once. An idempotent consumer makes a repeat harmless.'),
  ],
  why: 'A queue turns a slow consumer into a delay instead of an error. So watch the number of waiting messages, and scale the consumer by messages per minute.',
  docs: 'https://docs.mulesoft.com/mq/mq-queues',
  solve(s) {
    const n = change(viewMessages(s, 'order-events'), 'warehouse-consumer', { replicas: 8 })
    return advance(n, 30 * MINUTE)
  },
  answers: { 1: 1, 2: 1, 5: 1, 6: 1 },
}

// ---------- change and promote ----------

const replace = {
  id: 'p-led-replace',
  group: GROUP,
  title: '11. Replace Oracle behind a System API',
  minutes: 15,
  scenario: 'The orders move from Oracle to PostgreSQL. Release 2.0.0 of orders-sapi reads the new database and keeps the contract. The project has to go on working, and Oracle is switched off at the end.',
  start() {
    const s = ledProject()
    s.jars.push({ pkg: 'orders-sapi-v2', autodiscovery: jarOf('orders').autodiscovery, jar: 'orders-sapi-2.0.0-mule-application.jar' })
    return start(s)
  },
  steps: [
    { title: 'See who depends on Oracle', how: 'Open Visualizer and choose orders-sapi.', done: (s) => Boolean(s.seen[`vis:${orders.app}`]) },
    ask('Plan the change', 'Which applications do you deploy again?', ['All six', 'orders-sapi and order-fulfilment-papi', 'Only orders-sapi'], 2, 'The RAML of the Orders System API does not change, so nothing above it changes.'),
    { title: 'Deploy release 2.0.0', how: 'Runtime Manager, orders-sapi, Settings. Application File orders-sapi-2.0.0. Set db.host to pg01.brightmart.lab, then Apply Changes.', done: (s) => app(s, orders.app).pkg === 'orders-sapi-v2' && propsValue(app(s, orders.app), 'db.host') === 'pg01.brightmart.lab' && running(s, orders) },
    { title: 'Call it from the top', how: 'GET /my-orders/O-1001 as Mobile App, 200.', done: (s) => app(s, orders.app).pkg === 'orders-sapi-v2' && called(s, mobile.app, 200) },
    { title: 'Nothing else was touched', how: 'The other applications keep their configuration number. If you changed one, restart the lab.', done: (s) => app(s, orders.app).config > 1 && [mobile, partner, proc, customers, inventory].every((d) => app(s, d.app).config === 1) },
    { title: 'Switch Oracle off', how: 'Open Backends in the menu under Lab tools, Oracle, Stop.', done: (s) => s.backends?.oracle?.up === false },
    { title: 'Prove it', how: 'Call GET /my-orders/O-1001 once more, then move the clock 5 minutes. All calls return 200.', done: (s) => s.backends?.oracle?.up === false && (s.lastCalls ?? []).some((c) => c.app === mobile.app && c.status === 200 && c.t > s.backends.oracle.t) && calm(s, mobile) },
    ask('When a new version is needed', 'When would this change need version v2 of the API?', ['When the database is another product', 'When a field that a caller reads is renamed or removed', 'When the application gets a new jar'], 1, 'A caller sees the contract only. A change it would notice is a new API version, and both versions run until the callers have moved.'),
  ],
  why: 'This is the promise of the System layer: the system behind it changes and nobody above notices. It holds as long as the contract holds.',
  docs: `${CH2}ch2-update-apps`,
  solve(s) {
    let n = mark(s, `vis:${orders.app}`)
    n = change(n, orders.app, { pkg: 'orders-sapi-v2', jar: 'orders-sapi-2.0.0-mule-application.jar', props: { ...app(n, orders.app).props, 'db.host': 'pg01.brightmart.lab' } })
    n = getMobile(n).state
    n = setBackend(n, 'oracle', { up: false })
    return advance(getMobile(n).state, 5 * MINUTE)
  },
  answers: { 1: 2, 7: 1 },
}

const prodApp = (s, d) => appNamed(s, d.app, 'Production')
const prodProps = (key) => TEMPLATE(key, 'Production')
const promote = {
  id: 'p-led-promote',
  group: GROUP,
  title: '12. Promote the project in the right order',
  minutes: 35,
  scenario: 'Orders and Inventory are in Production already. Tonight customers-sapi, order-fulfilment-papi and mobile-orders-eapi follow. Each needs its API instance, its own properties and its contracts in Production.',
  start() {
    const s = ledProject({ traffic: [] })
    for (const k of ['orders', 'inventory']) {
      s.apis.push({ ...ledApi(k, 'Production'), contracts: [] })
      s.apps.push(ledApp(s, k, 'Production'))
    }
    return s
  },
  steps: [
    ask('Choose the order', 'In which order do the three go live?', ['mobile, process, customers', 'customers, process, mobile', 'All at the same time', 'process, mobile, customers'], 1, 'From the bottom up. Each layer finds the layer below it running, and nothing public exists until all is ready.'),
    { title: 'Promote the three API instances', how: 'Switch to Production. API Manager, Add API, Promote API from environment, with Policies and SLA Tiers. Customers System API, Order Fulfilment Process API and Mobile Orders Experience API.', done: (s) => [customers, proc, mobile].every((d) => apiOf(s, d, 'Production')?.policies.length) },
    { title: 'Read the Production credentials', how: 'API Manager in Production, Environment information.', done: (s) => Boolean(s.seen['env:Production']) },
    {
      title: 'Deploy customers-sapi',
      how: `Runtime Manager in Production, target Private Space ${PRIVATE_SPACE}, no public endpoint. Use the Production API ID. Protected property: anypoint.platform.client_secret of Production.`,
      code: prodProps('customers'),
      done: (s) => prodApp(s, customers)?.status === 'Running' && pairing(s, prodApp(s, customers)).state === 'paired',
    },
    { title: 'Contracts for the Process API', how: 'Exchange, Request access to the Production instances of Customers, Orders and Inventory as Order Fulfilment API. Approve Orders in API Manager.', done: (s) => [customers, orders, inventory].every((d) => contract(s, d, ledClient('process').name, 'Production')) },
    {
      title: 'Deploy order-fulfilment-papi',
      how: `The same target, no public endpoint. Protected properties: sapi.client_secret is ${ledClient('process').clientSecret}, and anypoint.platform.client_secret of Production.`,
      code: prodProps('process'),
      done: (s) => prodApp(s, proc)?.status === 'Running' && pairing(s, prodApp(s, proc)).state === 'paired',
    },
    { title: 'Contract for the Experience API', how: 'Exchange, Order Fulfilment Process API, Production instance, Request access as Mobile Orders API.', done: (s) => Boolean(contract(s, proc, ledClient('mobile').name, 'Production')) },
    {
      title: 'Deploy mobile-orders-eapi',
      how: `The public endpoint stays on. Protected properties: papi.client_secret is ${ledClient('mobile').clientSecret}, and anypoint.platform.client_secret of Production.`,
      code: prodProps('mobile'),
      done: (s) => prodApp(s, mobile)?.status === 'Running' && pairing(s, prodApp(s, mobile)).state === 'paired' && prodApp(s, mobile).publicEndpoint !== false,
    },
    ask('The addresses', 'What happens if order-fulfilment-papi in Production keeps the Sandbox customers.url?', ['It does not start', 'Production orders read Sandbox customers, and nothing shows an error at first', 'The gateway blocks it'], 1, 'The call works, with the wrong data. So addresses are properties of the environment, and you check them after a promotion.'),
    { title: 'No Sandbox address in Production', how: 'Check the url properties of the Production applications.', done: (s) => ['process', 'mobile'].every((k) => prodApp(s, LED[k]) && !Object.values(prodApp(s, LED[k]).props).some((v) => /-sbx\.|internal-sbx/.test(v))) },
    { title: 'Give Mobile App access', how: 'Exchange, Mobile Orders Experience API, Production instance, Request access as Mobile App.', done: (s) => Boolean(contract(s, mobile, 'Mobile App', 'Production')) },
    { title: 'The first call in Production', how: 'API client in Production, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001, 200.', done: (s) => (s.lastCalls ?? []).some((c) => c.env === 'Production' && c.app === mobile.app && c.status === 200) },
  ],
  why: 'Bottom up, so each layer finds what it needs. Per environment: the API ID, the platform credentials, the addresses, the client secrets and the contracts. The jar is the same.',
  docs: `${APIM}promote-api-task`,
  solve(start) {
    let s = mark({ ...start, env: 'Production' }, 'env:Production')
    const ids = {}
    for (const k of ['customers', 'process', 'mobile']) {
      s = promoteApi(s, LED[k].id, { policies: true, tiers: true, alerts: false })
      ids[k] = s.lastApi
    }
    s = deployLed(s, 'customers', ids.customers)
    const name = ledClient('process').name
    s = requestAccess(s, ids.customers, name)
    s = requestAccess(s, apiOf(s, inventory, 'Production').id, name)
    s = requestAccess(s, apiOf(s, orders, 'Production').id, name, 'Internal')
    s = setContract(s, apiOf(s, orders, 'Production').id, name, { status: 'approved' })
    s = deployLed(s, 'process', ids.process)
    s = requestAccess(s, ids.process, ledClient('mobile').name)
    s = deployLed(s, 'mobile', ids.mobile)
    s = requestAccess(s, ids.mobile, 'Mobile App')
    return getMobile(s).state
  },
  answers: { 0: 1, 8: 1 },
}

export const LED_LABS = [design, buildSystem, buildProcess, buildExperience, secure, trace, down, slow, revoked, backlog, replace, promote]
