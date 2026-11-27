// Guided labs of the Anypoint console. A lab has a starting platform and steps. Each step reads the state, so it is met by
// any route that gets there. `solve` plays a full solution through the same engine, for scripts/check-platform.js.
import {
  addApi, addApiAlert, addMonAlert, addRmAlert, addTier, advance, apiById, apiStatus, appNamed, applyPolicy, at, cpuOf, createClient, createProject, DAY, deployApp,
  finishDeploys, HOUR, importSpec, jarsOf, mark, MINUTE, mockCall, newApi, newApp, newPlatform, nextRun, packageJar, pairing, promoteApi, publish, ramlErrors, requestAccess, runNow, saveProject, setContract,
  setSchedule, setStudio, viewMessages,
} from './platform.js'
import { app, ask, asset, call, called, change, CLIENTS, creds, OPS, policy, propsValue, recent, sawLogs, until, withProp, withSecret } from './platform-kit.js'
import { LED_LABS } from './platform-led-labs.js'
import { FAILURE_LABS } from './platform-failure-labs.js'

export { openConsole } from './platform-project.js'

const CH2 = 'https://docs.mulesoft.com/cloudhub-2/'
const MON = 'https://docs.mulesoft.com/monitoring/'
const APIM = 'https://docs.mulesoft.com/api-manager/latest/'

export const GROUPS = ['Brightmart go-live', 'Full life cycle', 'End to end by system', 'API-led project', 'Failed jobs', 'API operations', 'More production failures', 'API-led failures', 'Versioning without breaking consumers', 'Your own servers', 'Files, SFTP and batch', 'Databases and queues', 'ActiveMQ', 'Kafka', 'Azure Service Bus', 'Email', 'Networking', 'Security', 'Mule XML', 'Chained incidents', 'Salesforce and SAP', 'B2B and EDI', 'Runtime Fabric and gateways', 'Scaling and release', 'Governance and access', 'Observability', 'Epic and healthcare', 'HR, ITSM and CRM', 'Data and cloud']

// ---------- helpers ----------

const scheduleOf = (s, name, flow) => app(s, name)?.schedules.find((x) => x.flow === flow)
const lastRun = (s, name, flow) => scheduleOf(s, name, flow)?.last
const ranOk = (s, name, flow, since = 0) => Boolean(lastRun(s, name, flow)?.ok) && lastRun(s, name, flow).t >= since
const ORDERS_RAML = `#%RAML 1.0
title: Orders System API
version: v1
mediaType: application/json
types:
  Order:
    properties:
      orderId: string
      customer: string
      total: number
/orders:
  get:
    description: List the orders
    queryParameters:
      status:
        type: string
        required: false
    responses:
      200:
        body:
          type: Order[]
          example: |
            [ { "orderId": "O-1001", "customer": "Brightmart", "total": 42.5 } ]
  post:
    description: Create an order
    body:
      type: Order
    responses:
      201:
        body:
          example: |
            { "orderId": "O-1002" }
  /{orderId}:
    get:
      description: Get one order
      responses:
        200:
          body:
            type: Order
            example: |
              { "orderId": "O-1001", "customer": "Brightmart", "total": 42.5 }
        404:
          body:
            example: |
              { "message": "Order not found" }
`
const SHIPMENTS_RAML = `#%RAML 1.0
title: Shipments Experience API
version: v1
/shipments:
  get:
    responses:
      200:
        body:
          application/json:
            example: |
              [ { "id": "S-1" } ]
`
const shipmentsApi = (extra = {}) =>
  newApi('19400555', {
    name: 'Shipments Experience API', assetId: 'shipments-experience-api', label: 'shipments-sbx', upstream: '', seen: true,
    policies: [policy('client-id')], tiers: [{ name: 'Gold', requests: 60, periodMs: 60000, autoApprove: true }, { name: 'Silver', requests: 10, periodMs: 60000, autoApprove: false }],
    contracts: CLIENTS.map((c, i) => ({ client: c.name, tier: i ? 'Silver' : 'Gold', status: 'approved', t: 0 })),
    ...extra,
  })
const LINKED = { pkg: 'shipments-eapi', autodiscovery: { apiId: '${api.id}', flowRef: 'shipments-main' } }
const shipmentsApp = (s, extra = {}) => {
  const c = creds(s, 'Sandbox')
  return newApp('shipments-eapi', { props: { 'partner.url': 'https://partner.brightmart.lab/shipments', 'api.id': '19400555', ...c.props }, secrets: c.secrets, autodiscovery: LINKED.autodiscovery, ...extra })
}
function shipments({ api = {}, appExtra = {}, traffic = true, ...extra } = {}) {
  const s = newPlatform({ clock: at(1, 8, 45), clients: structuredClone(CLIENTS), assets: [asset('shipments-experience-api', 'Shipments Experience API', SHIPMENTS_RAML)], ...extra })
  s.apis = [shipmentsApi(api)]
  s.apps = [shipmentsApp(s, appExtra)]
  if (traffic) s.traffic = [{ app: 'shipments-eapi', env: 'Sandbox', client: 'Mobile App', path: '/shipments', perMinute: 2 }]
  return s
}
// ---------- full life cycle ----------

const E2E = {
  asset: (s) => s.assets.find((a) => /orders/.test(a.assetId)),
  api: (s) => s.apis.find((a) => /orders/.test(a.assetId)),
  app: (s) => s.apps.find((a) => a.pkg === 'api' && a.status !== 'Stopped'),
  resources: (p) => {
    const list = [['GET', '/orders'], ['POST', '/orders'], ['GET', '/orders/O-1001']]
    return ramlErrors(p.raml).length === 0 && list.every(([m, path]) => mockCall(p.raml, m, path).status < 300)
  },
  client: (s) => s.clients.find((c) => E2E.api(s)?.contracts.some((x) => x.client === c.name && x.status === 'approved')),
}

const fullLifeCycle = {
  id: 'p-raml-to-monitoring',
  group: 'Full life cycle',
  title: 'From RAML design to monitoring',
  minutes: 40,
  scenario: 'Brightmart needs an Orders System API. You design it, publish it, build it, deploy it, protect it in API Manager and watch it in Monitoring. One person does the whole life cycle, so you see how the pieces connect.',
  start: () => newPlatform(),
  steps: [
    { title: 'Create the API specification', how: 'Open the menu at the top left and choose Design Center. Choose Create new, New API Specification, and call it Orders System API.', done: (s) => s.projects.some((p) => /orders/i.test(p.name)) },
    { title: 'Write the RAML', how: 'In the editor add GET and POST on /orders, and GET on /orders/{orderId}. You can write your own or use this one.', code: ORDERS_RAML, done: (s) => s.projects.some(E2E.resources) },
    { title: 'Try it in the mocking service', how: 'In the Documentation panel turn on the mocking service, choose GET /orders, Try it, Send. You get the example back before any code exists.', done: (s) => Boolean(s.seen.mock) },
    { title: 'Publish to Exchange', how: 'Choose Publish at the top right. Asset version 1.0.0, API version v1, LifeCycle State Stable.', done: (s) => Boolean(E2E.asset(s)) },
    { title: 'Find the asset in Exchange', how: 'Open Exchange from the menu and open Orders System API. This is what other teams see.', done: (s) => Object.keys(s.seen).some((k) => /^asset:.*orders/.test(k)) },
    { title: 'Import the specification into Studio', how: 'Open Anypoint Studio from the menu and choose Import a published API. APIkit makes one flow per method.', done: (s) => s.studio.some((p) => /orders/.test(p.assetId)) },
    { title: 'Create the API instance', how: 'API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint). Select the API from Exchange, give an instance label, then Save & Deploy. The status starts as Unregistered.', done: (s) => Boolean(E2E.api(s)) },
    { title: 'Add API Autodiscovery in Studio', how: 'In Studio open Global Elements, Create, API Autodiscovery. API ID ${api.id}, Flow Name the main flow. Then choose Export to package the application.', done: (s) => s.studio.some((p) => p.autodiscovery?.apiId && /-main$/.test(p.autodiscovery.flowRef ?? '') && p.jar) },
    { title: 'Copy the environment credentials', how: 'API Manager, API Administration, the Environment information button. It shows the client ID and client secret of Sandbox.', done: (s) => Boolean(s.seen['env:Sandbox']) },
    {
      title: 'Deploy the application',
      how: 'Runtime Manager, Deploy application. Choose the exported file. On the Properties tab set api.id to the API Instance ID, db.host to orders-db.brightmart.lab, anypoint.platform.client_id and, as a protected property, anypoint.platform.client_secret.',
      done: (s) => E2E.app(s)?.status === 'Running' && Boolean(propsValue(E2E.app(s), 'db.host')),
    },
    { title: 'See the API become Active', how: 'Open the API instance in API Manager. Active means the runtime found the instance with api.id and the credentials. If it stays Unregistered, read the ERROR line in the application logs.', done: (s) => Boolean(E2E.api(s)) && apiStatus(s, E2E.api(s)) === 'Active' },
    { title: 'Add SLA tiers', how: 'API instance, SLA Tiers, Add SLA tier. Add one tier with automatic approval and one with manual approval.', done: (s) => Boolean(E2E.api(s)?.tiers.some((t) => t.autoApprove) && E2E.api(s)?.tiers.some((t) => !t.autoApprove)) },
    { title: 'Apply Rate Limiting: SLA-Based', how: 'API instance, Policies, Add policy, Rate Limiting: SLA-Based. From now on only clients with a contract get through.', done: (s) => Boolean(E2E.api(s)?.policies.some((p) => p.type === 'rate-limit-sla')) },
    { title: 'Request access in Exchange', how: 'Exchange, Orders System API, Request access. Create a new application and choose the manual tier.', done: (s) => Boolean(E2E.api(s)?.contracts.some((c) => c.tier && E2E.api(s).tiers.find((t) => t.name === c.tier && !t.autoApprove))) },
    { title: 'Approve the contract', how: 'API instance, Contracts, Approve.', done: (s) => Boolean(E2E.client(s)) },
    { title: 'Call the API with and without credentials', how: 'Open API client. Send GET /orders as your application and get 200. Send it again with no client application and get 401.', done: (s) => Boolean(E2E.app(s)) && called(s, E2E.app(s).name, 200, 'GET', /^\/orders/) && called(s, E2E.app(s).name, 401) },
    { title: 'Go over the quota', how: 'In API client use Send 10 until the tier quota is used up and you see 429.', done: (s) => Boolean(E2E.app(s)) && called(s, E2E.app(s).name, 429) },
    { title: 'Create an API alert', how: 'API instance, Alerts, Add alert. Alert type Policy Violation, with your recipient.', done: (s) => Boolean(E2E.api(s)?.alerts.some((a) => a.type === 'Policy Violation' && a.recipients)) },
    { title: 'Create a Monitoring alert', how: 'Monitoring, Alerts, Create Alert. Resource type Application, metric Message Error Count, Above 0.', done: (s) => s.monAlerts.some((a) => a.metric === 'Message Error Count' && a.resource === 'Application' && Number(a.threshold) === 0) },
    { title: 'Trigger the API alert', how: 'In API client send a few more calls without credentials, then move the clock 1 minute. The mail arrives in the Inbox.', done: (s) => s.mail.some((m) => m.source === 'API Manager') },
    { title: 'Read the dashboard', how: 'Monitoring, Built-in dashboards, choose the application, View. Compare the Overview and Errors tabs.', done: (s) => Boolean(E2E.app(s)) && Boolean(s.seen[`dash:${E2E.app(s).name}`]) },
  ],
  why: 'The asset in Exchange is the contract, the API instance is the place where policies and clients live, and autodiscovery is the link between the instance and the running application. The link needs two things: the API ID and the credentials of the same environment.',
  docs: 'https://docs.mulesoft.com/mule-gateway/mule-gateway-config-autodiscovery-mule4',
  solve(start) {
    let s = saveProject(createProject(start, 'Orders System API'), 'p1', ORDERS_RAML)
    s = mark(s, 'mock')
    s = publish(s, 'p1', { assetId: 'orders-system-api', name: 'Orders System API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = mark(s, 'asset:orders-system-api')
    s = importSpec(s, 'orders-system-api')
    s = addApi(s, { assetId: 'orders-system-api', label: 'orders-sbx', upstream: '', consumer: '' })
    s = packageJar(setStudio(s, 'orders-system-api', { autodiscovery: { apiId: '${api.id}', flowRef: 'orders-system-api-main' } }), 'orders-system-api')
    s = mark(s, 'env:Sandbox')
    const c = creds(s, 'Sandbox')
    const p = s.studio[0]
    s = finishDeploys(deployApp(s, { name: 'orders-sapi', pkg: 'api', jar: p.jar, project: p.name, raml: p.raml, autodiscovery: p.autodiscovery, replicas: 1, vCores: 0.1, props: { 'api.id': s.lastApi, 'db.host': 'orders-db.brightmart.lab', ...c.props }, secrets: c.secrets }).state)
    const id = s.lastApi
    s = addTier(s, id, { name: 'Gold', requests: 100, periodMs: 60000, autoApprove: true })
    s = addTier(s, id, { name: 'Silver', requests: 5, periodMs: 60000, autoApprove: false })
    s = applyPolicy(s, id, 'rate-limit-sla')
    s = setContract(requestAccess(createClient(s, 'Web Shop'), id, 'Web Shop', 'Silver'), id, 'Web Shop', { status: 'approved' })
    const client = s.clients[0]
    for (let i = 0; i < 7; i++) s = call(s, 'orders-sapi', client, '/orders').state
    s = call(s, 'orders-sapi', null, '/orders').state
    s = addApiAlert(s, id, { name: 'Violations', severity: 'Warning', type: 'Policy Violation', atLeast: 1, periods: 1, period: 1, recipients: OPS })
    s = addMonAlert(s, { title: 'Errors', resource: 'Application', name_: 'orders-sapi', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    s = call(s, 'orders-sapi', null, '/orders').state
    s = advance(s, MINUTE)
    return mark(s, 'dash:orders-sapi')
  },
}


const promote = {
  id: 'p-promote',
  group: 'Full life cycle',
  title: 'Promote the API to Production',
  minutes: 15,
  scenario: 'Shipments Experience API works in Sandbox. The release is tonight: promote the API instance with its policies and tiers, then deploy the application to Production with the right settings for that environment.',
  start: () => shipments({ traffic: false, jars: [LINKED] }),
  steps: [
    { title: 'Switch to Production', how: 'Use the environment button at the top of the left menu in API Manager.', done: (s) => s.env === 'Production' || s.apis.some((a) => a.env === 'Production') },
    { title: 'Promote the instance', how: 'API Administration, Add API, Promote API from environment. Source environment Sandbox. Include Policies and SLA Tiers.', done: (s) => s.apis.some((a) => a.env === 'Production' && a.policies.length && a.tiers.length) },
    ask('Check the API ID', 'Is the API Instance ID in Production the same as in Sandbox?', ['Yes, promotion keeps the ID', 'No, each instance has its own ID', 'Only if the label is the same'], 1, 'Each instance has its own ID, so api.id is a property that changes per environment.'),
    { title: 'Deploy to Production', how: 'Runtime Manager in Production, Deploy application. Use the Production API ID and the Production credentials from Environment information. partner.url is https://partner.brightmart.lab/shipments.', done: (s) => appNamed(s, 'shipments-eapi', 'Production')?.status === 'Running' || s.apps.some((a) => a.env === 'Production' && a.status === 'Running') },
    { title: 'The Production API is Active', how: 'API Manager in Production shows Active. If not, read the application logs.', done: (s) => s.apis.some((a) => a.env === 'Production' && apiStatus(s, a) === 'Active') },
    ask('Contracts', 'A client has a contract in Sandbox. Can it call Production now?', ['Yes, contracts are promoted too', 'No, it needs its own contract in Production'], 1, 'Promotion can include policies, tiers and alerts. A client asks for access to the Production instance on its own.'),
    { title: 'Get a client through', how: 'Exchange, Shipments Experience API, Request access for the Production instance. Approve it if the tier is manual. Then call GET /shipments with API client in Production and get 200.', done: (s) => (s.lastCalls ?? []).some((c) => c.env === 'Production' && c.status === 200) },
  ],
  why: 'Promotion copies the configuration of an API instance. The application is deployed on its own, with the ID and credentials of the target environment.',
  docs: `${APIM}promote-api-task`,
  solve(start) {
    let s = { ...start, env: 'Production' }
    s = promoteApi(s, '19400555', { policies: true, tiers: true, alerts: false })
    const c = creds(s, 'Production')
    s = finishDeploys(deployApp(s, { name: 'shipments-eapi', ...jarsOf(s)[0], replicas: 2, vCores: 0.1, props: { 'partner.url': 'https://partner.brightmart.lab/shipments', 'api.id': s.lastApi, ...c.props }, secrets: c.secrets }).state)
    s = requestAccess(s, s.lastApi, 'Mobile App', 'Gold')
    return call(s, 'shipments-eapi', s.clients[0]).state
  },
  answers: { 2: 1, 5: 1 },
}

// ---------- failed jobs ----------

const jobs = (clock, apps, extra = {}) => newPlatform({ clock, apps, ...extra })

const nightly = {
  id: 'p-job-db',
  group: 'Failed jobs',
  title: 'The nightly load failed',
  minutes: 10,
  scenario: 'It is 09:00. The warehouse team says last night is missing. orders-nightly-load copies orders from SQL Server at 02:00. The application is Running, so nothing looks wrong in the list.',
  start: () => until(jobs(at(0, 12), [newApp('orders-nightly-load', { props: { 'db.host': 'sql01.brightmart.lab', 'db.port': '1443', 'db.user': 'mule_etl' }, secrets: { 'db.password': 'Nightly-2026' } })]), at(1, 9)),
  steps: [
    sawLogs('orders-nightly-load'),
    ask('Read the error', 'Set the log level filter to Error and read the block. What is the error type?', ['DB:QUERY_EXECUTION', 'DB:CONNECTIVITY', 'MULE:CONNECTIVITY', 'DB:BAD_SQL_SYNTAX'], 1, 'The element is the Select, and the error type is DB:CONNECTIVITY. The query never ran.'),
    ask('Find the cause', 'What does the message point at?', ['The password expired', 'The host name is wrong', 'The port is refused', 'The table does not exist'], 2, 'The host is right and the port is refused. SQL Server listens on 1433 by default, and this says 1443.'),
    { title: 'Fix the property', how: 'Settings, Properties, set db.port to 1433, Apply Changes. The application restarts with the new configuration.', done: (s) => propsValue(app(s, 'orders-nightly-load'), 'db.port') === '1433' && app(s, 'orders-nightly-load').status === 'Running' },
    { title: 'Run the missed job', how: 'Schedules, select nightly-load-flow, Run. Do not wait for 02:00: the data is needed today.', done: (s) => ranOk(s, 'orders-nightly-load', 'nightly-load-flow') },
    { title: 'Prove it in the logs', how: 'Open Logs again and find the line with the number of orders loaded.', done: (s) => ranOk(s, 'orders-nightly-load', 'nightly-load-flow') && (s.seen['logs:orders-nightly-load'] ?? 0) > 0 },
  ],
  why: 'Running means the application is up. It says nothing about the last run of a job. Check the schedule and the logs, fix the setting, then run the missed job by hand.',
  docs: `${CH2}ch2-view-logs`,
  solve: (s) => mark(runNow(withProp(mark(s, 'logs:orders-nightly-load'), 'orders-nightly-load', 'db.port', '1433'), 'orders-nightly-load', 'nightly-load-flow'), 'logs:orders-nightly-load'),
  answers: { 1: 1, 2: 2 },
}

const disabled = {
  id: 'p-job-disabled',
  group: 'Failed jobs',
  title: 'The job that never ran',
  minutes: 6,
  scenario: 'Stock has not moved since yesterday 18:00. stock-file-poll reads SFTP files every 15 minutes. There is no ERROR line anywhere in its logs.',
  start() {
    let s = until(jobs(at(0, 17), [newApp('stock-file-poll', { props: { 'sftp.host': 'sftp.brightmart.lab' }, secrets: { 'sftp.password': 'lab' } })]), at(0, 18))
    s = setSchedule(s, 'stock-file-poll', 'stock-file-flow', { enabled: false })
    return until(s, at(1, 9))
  },
  steps: [
    sawLogs('stock-file-poll'),
    ask('No error, no data', 'What does the last log line tell you?', ['The last run failed', 'The job ran at 18:00 and never started again', 'The application is stopped', 'The file was empty'], 1, 'The last run was fine. The silence after it is the finding: no run, so no error.'),
    { title: 'Find the schedule', how: 'Open Schedules of stock-file-poll.', done: (s) => Boolean(s.seen['schedules:stock-file-poll']) },
    { title: 'Enable it', how: 'Open the schedule, tick Enabled, Update.', done: (s) => Boolean(scheduleOf(s, 'stock-file-poll', 'stock-file-flow')?.enabled) },
    { title: 'Run it now', how: 'Select the flow and choose Run, so the files of the night are picked up.', done: (s) => ranOk(s, 'stock-file-poll', 'stock-file-flow', at(1, 9)) },
    { title: 'Prove the schedule works', how: 'Move the clock 15 minutes or more. The job must run on its own.', done: (s) => ranOk(s, 'stock-file-poll', 'stock-file-flow', at(1, 9)) && !lastRun(s, 'stock-file-poll', 'stock-file-flow').manual },
  ],
  why: 'A failed job leaves an error. A job that does not run leaves nothing, so look for the missing start line and check the schedule. An alert on errors never finds this one.',
  docs: `${CH2}ch2-manage-schedules`,
  solve: (s) => advance(runNow(setSchedule(mark(mark(s, 'logs:stock-file-poll'), 'schedules:stock-file-poll'), 'stock-file-poll', 'stock-file-flow', { enabled: true }), 'stock-file-poll', 'stock-file-flow'), 20 * MINUTE),
  answers: { 1: 1 },
}

const overlap = {
  id: 'p-job-overlap',
  group: 'Failed jobs',
  title: 'Every second run is skipped',
  minutes: 8,
  scenario: 'Prices arrive late. price-sync runs every 10 minutes, yet only about half of the runs happen. The job itself takes 14 minutes now that the catalogue has grown.',
  start: () => until(jobs(at(1, 6), [newApp('price-sync', { props: { 'pricing.url': 'https://pricing.brightmart.lab' } })]), at(1, 9)),
  steps: [
    sawLogs('price-sync'),
    ask('Read the message', 'Why is a run missing?', ['The scheduler crashed', 'The flow was still running and disallowConcurrentExecution is true', 'The database refused the connection', 'The replica restarted'], 1, 'The log says the flow is already running and that the execution is skipped. That is the scheduler doing what the setting asks.'),
    ask('Choose a fix', 'A teammate wants to set disallowConcurrentExecution to false. What is the risk?', ['None', 'Two runs work on the same prices at the same time', 'The application will not deploy', 'The scheduler stops'], 1, 'Two runs would overlap and write the same rows. Make the job faster or the interval longer.'),
    { title: 'Make it fit', how: 'Either change the schedule to 20 minutes, or give the application 1 vCore in Settings, Runtime, so a run takes 7 minutes.', done: (s) => !skips(s) },
    { title: 'Prove it over two hours', how: 'Move the clock 1 hour, twice. No run may be skipped.', done: (s) => !skips(s) && s.clock >= at(1, 11) && !s.events.some((e) => e.k === 'skip' && e.t > s.clock - 2 * HOUR + 10 * MINUTE) },
  ],
  why: 'Skipping is a symptom of a job that is longer than its interval. Fix the length or the interval and keep the protection against two runs at once.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/scheduler-concept',
  solve: (s) => advance(advance(setSchedule(mark(s, 'logs:price-sync'), 'price-sync', 'price-sync-flow', { value: 20 }), HOUR), 90 * MINUTE),
  answers: { 1: 1, 2: 1 },
}
const skips = (s) => {
  const a = app(s, 'price-sync')
  const x = a?.schedules[0]
  return !x?.enabled || (a.vCores >= 1 ? 7 : 14) * MINUTE > Number(x.value) * { seconds: 1000, minutes: MINUTE, hours: HOUR, days: DAY, milliseconds: 1 }[x.unit]
}

const batch = {
  id: 'p-job-batch',
  group: 'Failed jobs',
  title: 'A batch job stops at bad records',
  minutes: 12,
  scenario: 'invoice-batch loads 500 invoices at 01:30. This morning only 98 are in the system. Finance wants every good invoice today, and a list of the bad ones.',
  start: () =>
    until(jobs(at(0, 12), [newApp('invoice-batch', { props: { 'batch.maxFailedRecords': '0', 'reject.queue': 'invoice-rejects' } })], { queues: [{ name: 'invoice-rejects', type: 'Standard queue', dlq: '', attempts: 10, messages: [] }] }), at(1, 9)),
  steps: [
    sawLogs('invoice-batch'),
    ask('Read the result', 'The log has a Finished execution line. What does it say?', ['500 processed, 0 failed', '100 processed, 98 successful, 2 failed', '500 processed, 493 successful, 7 failed', '98 processed, 98 successful'], 1, 'The instance stopped in the first block of 100. The other 400 were never tried.'),
    ask('Read the error', 'Why did records fail?', ['The database was down', 'A date in the wrong format could not be read', 'The file was missing', 'A duplicate key'], 1, 'The expression could not turn 12/13/2026 into a date.'),
    ask('Read the stop', 'Why did the rest not run?', ['The heap was full', 'Max Failed Records is 0, so the first failed record stops the job instance', 'The block size is 100', 'The schedule was disabled'], 1, 'With 0 the batch stops at the first failed record. -1 means no limit.'),
    { title: 'Let the good records through', how: 'Settings, Properties, set batch.maxFailedRecords to -1, Apply Changes. Failed records go to the queue in reject.queue.', done: (s) => propsValue(app(s, 'invoice-batch'), 'batch.maxFailedRecords') === '-1' && app(s, 'invoice-batch').status === 'Running' },
    { title: 'Run the batch again', how: 'Schedules, invoice-batch-flow, Run. The log shows 493 successful and 7 failed.', done: (s) => app(s, 'invoice-batch')?.batch?.ok === 493 },
    { title: 'Get the list of bad invoices', how: 'Open MQ, invoice-rejects, Message Browser, Get Messages. Send this list to Finance.', done: (s) => Boolean(s.seen['mq:invoice-rejects']) && (s.queues[0]?.messages.length ?? 0) >= 7 },
  ],
  why: 'A batch job can finish and still lose records. Read the Finished execution line every time. A limit of -1 keeps the good records moving, as long as the failed ones are kept somewhere people look.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/batch-error-handling-faq',
  solve: (s) => viewMessages(runNow(withProp(mark(s, 'logs:invoice-batch'), 'invoice-batch', 'batch.maxFailedRecords', '-1'), 'invoice-batch', 'invoice-batch-flow'), 'invoice-rejects'),
  answers: { 1: 1, 2: 1, 3: 1 },
}

const sftp = {
  id: 'p-job-sftp',
  group: 'Failed jobs',
  title: 'The vendor changed the SFTP password',
  minutes: 8,
  scenario: 'vendor-sftp-upload sends purchase orders every hour. Since 07:00 every run fails. Look in the Inbox too: the vendor wrote last week.',
  start: () =>
    until(
      jobs(at(1, 6, 30), [newApp('vendor-sftp-upload', { props: { 'sftp.host': 'sftp.vendor.example', 'sftp.user': 'brightmart' }, secrets: { 'sftp.password': 'Vendor-Old-10' } })], {
        mail: [{ t: at(0, 10), to: OPS, subject: 'SFTP password rotation', body: 'From Tuesday the practice password of user brightmart is Vendor-New-11. The old one stops working at 06:45.', source: 'Vendor' }],
      }),
      at(1, 9, 30),
    ),
  steps: [
    sawLogs('vendor-sftp-upload'),
    ask('Read the error', 'What is the error type?', ['SFTP:CONNECTIVITY', 'SFTP:INVALID_CREDENTIALS', 'SFTP:ILLEGAL_PATH', 'SFTP:ACCESS_DENIED'], 1, 'The host answered and refused the login. A CONNECTIVITY error would mean the host was not reached.'),
    { title: 'Find the new password', how: 'Open the Inbox from the menu and read the mail of the vendor.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Store it as a protected property', how: 'Settings, Properties. Change sftp.password and keep it protected, so nobody can read it after the deployment. Apply Changes.', done: (s) => app(s, 'vendor-sftp-upload')?.secrets['sftp.password'] === 'Vendor-New-11' && !app(s, 'vendor-sftp-upload').props['sftp.password'] && app(s, 'vendor-sftp-upload').status === 'Running' },
    { title: 'Send the missed files', how: 'Schedules, vendor-upload-flow, Run.', done: (s) => ranOk(s, 'vendor-sftp-upload', 'vendor-upload-flow') },
    { title: 'Wait for the next run', how: 'Move the clock to the next job. It must succeed on its own.', done: (s) => ranOk(s, 'vendor-sftp-upload', 'vendor-upload-flow') && !lastRun(s, 'vendor-sftp-upload', 'vendor-upload-flow').manual },
  ],
  why: 'The error type separates a network problem from a login problem, and that decides who you call. A password belongs in a protected property.',
  docs: `${CH2}ch2-protect-app-props`,
  solve: (s) => advance(runNow(withSecret(mark(mark(s, 'logs:vendor-sftp-upload'), 'inbox'), 'vendor-sftp-upload', 'sftp.password', 'Vendor-New-11'), 'vendor-sftp-upload', 'vendor-upload-flow'), HOUR),
  answers: { 1: 1 },
}

const silent = {
  id: 'p-job-alert',
  group: 'Failed jobs',
  title: 'Nobody noticed for two days',
  minutes: 15,
  scenario: 'customer-export writes a file to Azure Blob storage at 03:00. It failed two nights in a row and a customer told you. Set up alerts so the team knows first, prove that they work, then fix the job.',
  start: () => until(jobs(at(0, 1), [newApp('customer-export', { props: { 'blob.account': 'brightmartstore', 'blob.container': 'customer-exports' } })]), at(1, 9)),
  steps: [
    ask('Choose the alert', 'Runtime Manager alerts on CloudHub 2.0 have Deployment success and Deployment failure. Which one fires when a job fails at 03:00?', ['Deployment failure', 'Deployment success', 'Neither, the deployment is fine'], 2, 'The application stays deployed, so no deployment alert fires. You need a metric alert in Monitoring.'),
    { title: 'Create the Monitoring alert', how: 'Monitoring, Alerts, Create Alert. Resource type Application, customer-export. Metric Message Error Count, severity High or Critical, Above 0 for each of the last 1 consecutive minutes. Add a recipient.', done: (s) => s.monAlerts.some((a) => a.name_ === 'customer-export' && a.metric === 'Message Error Count' && a.operator === 'Above' && Number(a.threshold) === 0 && Number(a.minutes) === 1 && ['High', 'Critical'].includes(a.severity) && a.recipients) },
    ask('Why 1 minute', 'The job runs once a night and takes seconds. What happens with "for each of the last 5 consecutive minutes"?', ['It fires faster', 'It never fires, because the error exists in one minute only', 'It fires five times'], 1, 'Every one of the five minutes must break the threshold. One failed run is one minute, so the alert stays silent.'),
    { title: 'Add the deployment alert too', how: 'Runtime Manager, Alerts, Create Alert. Condition Deployment failure for customer-export.', done: (s) => s.rmAlerts.some((a) => a.condition === 'Deployment failure' && ['customer-export', 'All'].includes(a.app) && a.recipients) },
    { title: 'Let the job fail once more', how: 'Move the clock to the next job at 03:00. The mail arrives in the Inbox.', done: (s) => s.mail.some((m) => m.source === 'Anypoint Monitoring') },
    { title: 'Fix the job', how: 'Read the log. The container is called customer-export. Change the property and Apply Changes.', done: (s) => propsValue(app(s, 'customer-export'), 'blob.container') === 'customer-export' && app(s, 'customer-export').status === 'Running' },
    { title: 'Run it and see the alert recover', how: 'Schedules, Run. In Monitoring the alert goes back to OK.', done: (s) => ranOk(s, 'customer-export', 'customer-export-flow') && s.monAlerts.some((a) => a.name_ === 'customer-export' && a.fired && a.state === 'OK') },
  ],
  why: 'A deployment alert watches the deployment. A job failure is a message error, so it needs a metric alert, with a window that fits how often the job runs. Test an alert before you trust it.',
  docs: `${MON}alerts`,
  solve(s) {
    let n = addMonAlert(s, { title: 'Export failed', resource: 'Application', name_: 'customer-export', metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: OPS })
    n = addRmAlert(n, { name: 'Deploy failed', severity: 'Critical', app: 'customer-export', condition: 'Deployment failure', recipients: OPS })
    n = advance(n, 19 * HOUR)
    n = withProp(n, 'customer-export', 'blob.container', 'customer-export')
    return advance(runNow(n, 'customer-export', 'customer-export-flow'), 2 * MINUTE)
  },
  answers: { 0: 2, 2: 1 },
}

const dlq = {
  id: 'p-job-dlq',
  group: 'Failed jobs',
  title: 'Orders in the dead letter queue',
  minutes: 12,
  scenario: 'order-events-consumer takes orders from the queue orders-in and creates them in the ERP. Since the ERP release this morning, orders land in orders-dlq. Fix the cause first, then bring every order back.',
  start: () =>
    until(
      jobs(at(1, 8), [newApp('order-events-consumer', { props: { 'erp.baseUrl': 'https://erp.brightmart.lab/v1', 'queue.name': 'orders-in', 'dlq.name': 'orders-dlq' } })], {
        queues: [{ name: 'orders-in', type: 'Standard queue', dlq: 'orders-dlq', attempts: 10, messages: [] }, { name: 'orders-dlq', type: 'Standard queue', dlq: '', attempts: 10, messages: [] }],
        queueTraffic: [{ queue: 'orders-in', everyMinutes: 10 }],
      }),
      at(1, 9),
    ),
  steps: [
    { title: 'Look at a dead letter', how: 'MQ, orders-dlq, Message Browser, Get Messages.', done: (s) => Boolean(s.seen['mq:orders-dlq']) },
    ask('Why 10', 'How did the messages get there?', ['The queue was full', 'Each was delivered 10 times, then rerouted', 'They expired', 'Someone moved them'], 1, 'Delivery attempts before reroute is 10 on orders-in. After the tenth failed delivery the message goes to the dead letter queue.'),
    sawLogs('order-events-consumer'),
    ask('Find the cause', 'What does the error say?', ['The ERP is down', 'The ERP answered 404: version v1 was retired', 'The queue is missing', 'The message is not valid JSON'], 1, 'HTTP:NOT_FOUND with a clear text: use v2. The messages are fine.'),
    { title: 'Fix the cause first', how: 'Settings, Properties, erp.baseUrl is https://erp.brightmart.lab/v2, Apply Changes. If you replay before this, the messages return to the dead letter queue.', done: (s) => propsValue(app(s, 'order-events-consumer'), 'erp.baseUrl') === 'https://erp.brightmart.lab/v2' && app(s, 'order-events-consumer').status === 'Running' },
    { title: 'Replay the dead letters', how: 'Schedules of order-events-consumer, select replay-dlq-flow, Run. The flow is disabled on purpose and is started by hand.', done: (s) => ranOk(s, 'order-events-consumer', 'replay-dlq-flow') },
    { title: 'Prove that both queues are empty', how: 'Move the clock 1 minute and look at MQ again. The log shows each order created in the ERP.', done: (s) => propsValue(app(s, 'order-events-consumer'), 'erp.baseUrl') === 'https://erp.brightmart.lab/v2' && ranOk(s, 'order-events-consumer', 'replay-dlq-flow') && s.queues.every((q) => q.messages.length === 0) && s.events.some((e) => e.k === 'msg' && e.s === 'ok') },
  ],
  why: 'A dead letter queue keeps the messages safe while you find the cause. The order matters: cause, fix, replay, proof.',
  docs: 'https://docs.mulesoft.com/mq/mq-queues',
  solve: (s) => advance(runNow(withProp(mark(viewMessages(s, 'orders-dlq'), 'logs:order-events-consumer'), 'order-events-consumer', 'erp.baseUrl', 'https://erp.brightmart.lab/v2'), 'order-events-consumer', 'replay-dlq-flow'), MINUTE),
  answers: { 1: 1, 3: 1 },
}

const memory = {
  id: 'p-job-oom',
  group: 'Failed jobs',
  title: 'A large file takes the replica down',
  minutes: 10,
  scenario: 'catalog-file-load reads a 1.4 GB file from Azure File Share at 04:15. The replica restarts during the run and the catalogue is old. The budget is 0.2 vCores and it stays that way.',
  start: () => until(jobs(at(0, 12), [newApp('catalog-file-load', { vCores: 0.2, props: { 'file.path': '/share/catalog.csv', 'read.strategy': 'in-memory' } })]), at(1, 9)),
  steps: [
    sawLogs('catalog-file-load'),
    ask('Read the error', 'Which line explains the restart?', ['DB:CONNECTIVITY', 'java.lang.OutOfMemoryError: Java heap space', 'FILE:FILE_NOT_FOUND', 'HTTP:TIMEOUT'], 1, 'The heap was full, the JVM ended and the platform started the replica again.'),
    { title: 'Check the heap in Monitoring', how: 'Monitoring, Built-in dashboards, catalog-file-load, JVM tab. Choose a time range that has 04:15 in it.', done: (s) => Boolean(s.seen['dash:catalog-file-load:JVM']) },
    ask('Choose the fix', 'The file is larger than the heap. What fits the budget?', ['A second replica', 'Read the file as a stream', 'A longer timeout', 'Restart every night'], 1, 'A second replica has the same small heap. Streaming reads the file in pieces and keeps the rest on disk.'),
    { title: 'Switch to streaming', how: 'Settings, Properties, read.strategy is streaming, Apply Changes. Keep 0.2 vCores.', done: (s) => propsValue(app(s, 'catalog-file-load'), 'read.strategy') === 'streaming' && app(s, 'catalog-file-load').vCores <= 0.2 && app(s, 'catalog-file-load').status === 'Running' },
    { title: 'Run it', how: 'Schedules, catalog-load-flow, Run. The run finishes and the heap stays well under 100 percent.', done: (s) => ranOk(s, 'catalog-file-load', 'catalog-load-flow') && app(s, 'catalog-file-load').vCores <= 0.2 },
  ],
  why: 'More memory moves the limit to the next larger file. Streaming removes the limit, because the file is never held in the heap as a whole.',
  docs: 'https://docs.mulesoft.com/mule-runtime/latest/streaming-about',
  solve: (s) => runNow(withProp(mark(mark(s, 'logs:catalog-file-load'), 'dash:catalog-file-load:JVM'), 'catalog-file-load', 'read.strategy', 'streaming'), 'catalog-file-load', 'catalog-load-flow'),
  answers: { 1: 1, 3: 1 },
}

const zone = {
  id: 'p-job-timezone',
  group: 'Failed jobs',
  title: 'The report is 5 and a half hours late',
  minutes: 5,
  scenario: 'store-report must run at 06:00 in Kolkata. It arrives at 11:30 there. The cron expression reads 0 0 6 * * ? and looks right.',
  start: () => until(jobs(at(1, 5), [newApp('store-report', { props: { 'smtp.host': 'smtp.brightmart.lab' } })]), at(1, 9)),
  steps: [
    { title: 'Open the schedule', how: 'Runtime Manager, store-report, Schedules.', done: (s) => Boolean(s.seen['schedules:store-report']) },
    ask('Find the cause', 'At 11:30 in Kolkata it is 06:00 in which time zone?', ['New York', 'UTC', 'London in summer'], 1, 'Kolkata is 5 hours and 30 minutes ahead of UTC. The expression is read in UTC.'),
    { title: 'Set the time zone', how: 'Open the schedule, choose the time zone Asia/Kolkata, Update.', done: (s) => scheduleOf(s, 'store-report', 'store-report-flow')?.enabled && (nextRun(scheduleOf(s, 'store-report', 'store-report-flow'), s.clock) ?? 0) % DAY === 30 * MINUTE },
    { title: 'Wait for the next run', how: 'Move the clock to the next job. It runs at 00:30 UTC, which is 06:00 in Kolkata.', done: (s) => (lastRun(s, 'store-report', 'store-report-flow')?.t ?? 1) % DAY === 30 * MINUTE },
  ],
  why: 'A cron expression has no time zone of its own. Set it on the schedule, because a fixed shift in the expression breaks when daylight saving time changes.',
  docs: `${CH2}ch2-manage-schedules`,
  solve: (s) => advance(setSchedule(mark(s, 'schedules:store-report'), 'store-report', 'store-report-flow', { tz: 'Asia/Kolkata' }), 16 * HOUR),
  answers: { 1: 1 },
}

// ---------- API operations ----------

const unregistered = {
  id: 'p-api-unregistered',
  group: 'API operations',
  title: 'The API stays Unregistered',
  minutes: 8,
  scenario: 'shipments-eapi was deployed an hour ago and is Running, but API Manager shows Unregistered and every call returns 503.',
  start: () => finishDeploys(shipments({ traffic: false, api: { seen: false }, appExtra: { status: 'Starting', props: { 'partner.url': 'https://partner.brightmart.lab/shipments', 'api.id': '19400550', 'anypoint.platform.client_id': 'sbx-4f1c9a' } } })),
  steps: [
    { title: 'Call the API', how: 'API client, shipments-eapi, GET /shipments as Mobile App. You get 503.', done: (s) => called(s, 'shipments-eapi', 503) || called(s, 'shipments-eapi', 200) },
    sawLogs('shipments-eapi'),
    ask('Read the error', 'What does the runtime say?', ['401 Unauthorized from API Manager', 'The API ID was not found in this environment', 'The partner refused the connection', 'No policies were applied'], 1, 'The credentials were accepted. The ID in api.id belongs to no instance in Sandbox.'),
    { title: 'Find the right ID', how: 'API Manager, open Shipments Experience API. Copy the API Instance ID.', done: (s) => Boolean(s.seen['api:19400555']) },
    { title: 'Set api.id', how: 'Runtime Manager, shipments-eapi, Settings, Properties, Apply Changes.', done: (s) => pairing(s, app(s, 'shipments-eapi')).state === 'paired' && app(s, 'shipments-eapi').status === 'Running' },
    { title: 'The API is Active', how: 'API Manager shows Active.', done: (s) => apiStatus(s, apiById(s, '19400555')) === 'Active' },
    { title: 'Call it again', how: 'GET /shipments as Mobile App returns 200, and without a client it returns 401.', done: (s) => called(s, 'shipments-eapi', 200) && called(s, 'shipments-eapi', 401) },
  ],
  why: 'With autodiscovery the runtime blocks the API until it has the policies, so a wrong ID means 503 and not an open API.',
  docs: 'https://docs.mulesoft.com/mule-gateway/mule-gateway-config-autodiscovery-mule4',
  solve(s) {
    let n = call(s, 'shipments-eapi', CLIENTS[0]).state
    n = mark(mark(n, 'logs:shipments-eapi'), 'api:19400555')
    n = withProp(n, 'shipments-eapi', 'api.id', '19400555')
    n = call(n, 'shipments-eapi', CLIENTS[0]).state
    return call(n, 'shipments-eapi', null).state
  },
  answers: { 2: 1 },
}

const wrongCreds = {
  id: 'p-api-creds',
  group: 'API operations',
  title: 'Credentials of the wrong environment',
  minutes: 8,
  scenario: 'A teammate redeployed shipments-eapi in Sandbox with the properties of Production. The API went Inactive and partners get 503.',
  start: () => until(finishDeploys(shipments({ appExtra: { status: 'Starting', props: { 'partner.url': 'https://partner.brightmart.lab/shipments', 'api.id': '19400555', 'anypoint.platform.client_id': 'prd-81b0e2' }, secrets: { 'anypoint.platform.client_secret': 'prd-secret-c4aa' } } })), at(1, 9)),
  steps: [
    { title: 'Check the status', how: 'API Manager, API Administration, open Shipments Experience API.', done: (s) => Boolean(s.seen['api:19400555']) },
    sawLogs('shipments-eapi'),
    ask('Read the error', 'Which of the two links is broken?', ['The API ID', 'The environment credentials', 'The flow name'], 1, 'API Manager answered 401 Unauthorized. The ID was never looked up.'),
    { title: 'Find the Sandbox credentials', how: 'API Manager, API Administration, Environment information.', done: (s) => Boolean(s.seen['env:Sandbox']) },
    { title: 'Set both properties', how: 'Settings, Properties: anypoint.platform.client_id, and the secret as a protected property. Apply Changes.', done: (s) => pairing(s, app(s, 'shipments-eapi')).state === 'paired' && Boolean(app(s, 'shipments-eapi').secrets['anypoint.platform.client_secret']) && !app(s, 'shipments-eapi').props['anypoint.platform.client_secret'] && app(s, 'shipments-eapi').status === 'Running' },
    { title: 'The traffic recovers', how: 'Move the clock 5 minutes. The calls of Mobile App return 200 again.', done: (s) => recent(s, 'shipments-eapi', 3).length > 0 && recent(s, 'shipments-eapi', 3).every((e) => e.s === 200) },
  ],
  why: 'Each environment has its own client ID and secret, and an application can only register instances of that environment.',
  docs: 'https://docs.mulesoft.com/mule-gateway/mule-gateway-org-credentials-mule4',
  solve(s) {
    const c = creds(s, 'Sandbox')
    const n = mark(mark(mark(s, 'api:19400555'), 'logs:shipments-eapi'), 'env:Sandbox')
    return advance(change(n, 'shipments-eapi', { props: { ...app(n, 'shipments-eapi').props, ...c.props }, secrets: { ...app(n, 'shipments-eapi').secrets, ...c.secrets } }), 5 * MINUTE)
  },
  answers: { 2: 1 },
}

const quota = {
  id: 'p-api-429',
  group: 'API operations',
  title: 'A partner gets 429',
  minutes: 10,
  scenario: 'Partner Portal says half of its calls fail. It sends 15 calls a minute and is on the Silver tier. Business agreed to 30 calls a minute for this partner, and the other Silver clients keep 10.',
  start() {
    const s = shipments({ api: { policies: [policy('rate-limit-sla')] }, traffic: false })
    s.traffic = [{ app: 'shipments-eapi', env: 'Sandbox', client: 'Partner Portal', path: '/shipments', perMinute: 15 }]
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'See the status codes', how: 'Monitoring, Built-in dashboards, shipments-eapi. Compare the codes on the Errors tab.', done: (s) => Boolean(s.seen['dash:shipments-eapi']) },
    ask('Who answers', 'Who returns the 429?', ['The partner system', 'The application', 'The gateway policy, before the application'], 2, 'The calls have a policy name and take a few milliseconds. They never reach the flow.'),
    { title: 'Add a tier', how: 'API Manager, Shipments Experience API, SLA Tiers, Add SLA tier. For example Partner, 30 requests per 1 minute, manual approval.', done: (s) => Boolean(apiById(s, '19400555')?.tiers.some((t) => t.requests / t.periodMs >= 30 / 60000 && t.requests / t.periodMs < 59 / 60000)) },
    { title: 'Move the contract to the new tier', how: 'Contracts, Partner Portal, Change tier.', done: (s) => partnerTier(s)?.requests / partnerTier(s)?.periodMs >= 30 / 60000 },
    { title: 'Keep Silver as it is', how: 'Other clients depend on 10 per minute.', done: (s) => apiById(s, '19400555')?.tiers.find((t) => t.name === 'Silver')?.requests === 10 && partnerTier(s)?.name !== 'Silver' && partnerTier(s)?.name !== 'Gold' },
    { title: 'Prove it', how: 'Move the clock 5 minutes. Partner Portal has no 429 in that time.', done: (s) => partnerTier(s)?.name !== 'Silver' && recent(s, 'shipments-eapi', 3).length > 0 && recent(s, 'shipments-eapi', 3).every((e) => e.s === 200) },
  ],
  why: 'A 429 is a contract question. Change the tier of one client instead of raising a tier that others share.',
  docs: `${APIM}defining-sla-tiers`,
  solve(s) {
    let n = mark(s, 'dash:shipments-eapi')
    n = addTier(n, '19400555', { name: 'Partner', requests: 30, periodMs: 60000, autoApprove: false })
    n = setContract(n, '19400555', 'Partner Portal', { tier: 'Partner' })
    return advance(n, 5 * MINUTE)
  },
  answers: { 1: 2 },
}
const partnerTier = (s) => {
  const api = apiById(s, '19400555')
  const c = api?.contracts.find((x) => x.client === 'Partner Portal' && x.status === 'approved')
  return api?.tiers.find((t) => t.name === c?.tier)
}

const errors500 = {
  id: 'p-api-500',
  group: 'API operations',
  title: 'The API returns 500',
  minutes: 15,
  scenario: 'Mobile users see errors since the last release of shipments-eapi. Find the cause with log search, set an alert so you hear about the next one, then fix it.',
  start: () => until(shipments({ appExtra: { config: 2, props: { 'partner.url': 'https://partner-old.brightmart.lab/shipments', 'api.id': '19400555', 'anypoint.platform.client_id': 'sbx-4f1c9a' } } }), at(1, 9)),
  steps: [
    { title: 'Read the Errors tab', how: 'Monitoring, Built-in dashboards, shipments-eapi, Errors.', done: (s) => Boolean(s.seen['dash:shipments-eapi:Errors']) },
    { title: 'Search the logs', how: 'Monitoring, Log Search. Search for log-level: ERROR AND appId: shipments-eapi.', done: (s) => Boolean(s.seen.logsearch) },
    ask('Find the cause', 'What does the error block say?', ['HTTP:CONNECTIVITY to the partner URL', 'DB:CONNECTIVITY', 'EXPRESSION in a transform', 'Client ID rejected'], 0, 'The HTTP request to partner-old refuses the connection. The release changed partner.url.'),
    { title: 'Add a Response Code alert', how: 'API Manager, Shipments Experience API, Alerts, Add alert. Alert type Response Code, with 500 ticked, and a recipient.', done: (s) => Boolean(apiById(s, '19400555')?.alerts.some((a) => a.type === 'Response Code' && a.codes?.includes(500) && a.recipients)) },
    { title: 'See the alert fire', how: 'Move the clock a few minutes and open the Inbox.', done: (s) => s.mail.some((m) => m.source === 'API Manager') },
    { title: 'Fix the property', how: 'Settings, Properties, partner.url is https://partner.brightmart.lab/shipments, Apply Changes.', done: (s) => propsValue(app(s, 'shipments-eapi'), 'partner.url') === 'https://partner.brightmart.lab/shipments' && app(s, 'shipments-eapi').status === 'Running' },
    { title: 'The alert recovers', how: 'Move the clock 5 minutes. The calls return 200 and the alert is OK.', done: (s) => recent(s, 'shipments-eapi', 3).length > 0 && recent(s, 'shipments-eapi', 3).every((e) => e.s === 200) && Boolean(apiById(s, '19400555')?.alerts.some((a) => a.fired && a.state === 'OK')) },
  ],
  why: 'The dashboard says that something is wrong and since when. The log says what. The alert says it first the next time.',
  docs: `${APIM}using-api-alerts`,
  solve(s) {
    let n = mark(mark(mark(s, 'dash:shipments-eapi'), 'dash:shipments-eapi:Errors'), 'logsearch')
    n = addApiAlert(n, '19400555', { name: 'Server errors', severity: 'Critical', type: 'Response Code', codes: [500], atLeast: 1, periods: 1, period: 1, recipients: OPS })
    n = advance(n, 2 * MINUTE)
    return advance(withProp(n, 'shipments-eapi', 'partner.url', 'https://partner.brightmart.lab/shipments'), 5 * MINUTE)
  },
  answers: { 2: 0 },
}

const slow = {
  id: 'p-api-slow',
  group: 'API operations',
  title: 'The search API is slow',
  minutes: 10,
  scenario: 'search-eapi answers in several seconds since the campaign started. There are no errors. The target is an average under 500 ms and CPU under 80 percent.',
  start() {
    const s = newPlatform({ clock: at(1, 8, 50), apps: [newApp('search-eapi', { props: { 'index.name': 'products' } })], traffic: [{ app: 'search-eapi', env: 'Sandbox', path: '/search', perMinute: 30 }] })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the response time', how: 'Monitoring, Built-in dashboards, search-eapi, Overview.', done: (s) => Boolean(s.seen['dash:search-eapi']) },
    { title: 'Read the CPU', how: 'The Infrastructure tab.', done: (s) => Boolean(s.seen['dash:search-eapi:Infrastructure']) },
    ask('Find the limit', 'Requests are steady, errors are 0 and CPU is at 99 percent. What is the limit?', ['The heap', 'The CPU of the replica', 'The network', 'A policy'], 1, 'The replica has no CPU left, so calls wait. 0.1 vCore is too small for this load.'),
    { title: 'Give it more capacity', how: 'Runtime Manager, search-eapi, Settings, Runtime. More replicas, a larger replica size, or both. Apply Changes.', done: (s) => app(s, 'search-eapi')?.status === 'Running' && app(s, 'search-eapi').replicas * app(s, 'search-eapi').vCores >= 0.5 },
    { title: 'Prove it', how: 'Move the clock 5 minutes. Average under 500 ms, CPU under 80 percent.', done: (s) => recent(s, 'search-eapi', 3).length > 0 && recent(s, 'search-eapi', 3).reduce((n, e) => n + e.ms, 0) / recent(s, 'search-eapi', 3).length < 500 && cpuOf(s, app(s, 'search-eapi'), s.clock - 3 * MINUTE, s.clock) < 80 },
    { title: 'Add a response time alert', how: 'Monitoring, Alerts, Create Alert. Application search-eapi, Average Response Time, Above 1000, for each of the last 3 consecutive minutes or so.', done: (s) => s.monAlerts.some((a) => a.name_ === 'search-eapi' && a.metric === 'Average Response Time' && a.recipients) },
  ],
  why: 'Slow with no errors and full CPU means capacity. Two or more replicas also keep the API up while one restarts.',
  docs: `${CH2}ch2-architecture`,
  solve(s) {
    let n = mark(mark(s, 'dash:search-eapi'), 'dash:search-eapi:Infrastructure')
    n = advance(change(n, 'search-eapi', { replicas: 2, vCores: 0.5 }), 5 * MINUTE)
    return addMonAlert(n, { title: 'Slow', resource: 'Application', name_: 'search-eapi', metric: 'Average Response Time', severity: 'Medium', operator: 'Above', threshold: 1000, minutes: 3, recipients: OPS })
  },
  answers: { 2: 1 },
}

const attack = {
  id: 'p-api-attack',
  group: 'API operations',
  title: 'Someone guesses client IDs',
  minutes: 10,
  scenario: 'One address sends calls with made-up client IDs to Shipments Experience API. They get 401, so nothing leaks, but you want to know early and to stop it before the credentials check.',
  start() {
    const s = shipments()
    s.traffic.push({ app: 'shipments-eapi', env: 'Sandbox', path: '/shipments', perMinute: 5, ip: '203.0.113.66', clientId: 'guess', clientSecret: 'guess', client: 'unknown' })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'See the violations', how: 'Monitoring, Built-in dashboards, choose the API, Policies tab.', done: (s) => Boolean(s.seen['dash:19400555:Policies']) },
    { title: 'Add a Policy Violation alert', how: 'API Manager, the API, Alerts, Add alert. Policy Violation, with a recipient.', done: (s) => Boolean(apiById(s, '19400555')?.alerts.some((a) => a.type === 'Policy Violation' && a.recipients)) },
    { title: 'See it fire', how: 'Move the clock a few minutes and open the Inbox.', done: (s) => s.mail.some((m) => m.source === 'API Manager') },
    { title: 'Block the address', how: 'Policies, Add policy, IP Blocklist with 203.0.113.66. Keep Client ID Enforcement.', done: (s) => Boolean(apiById(s, '19400555')?.policies.some((p) => p.type === 'ip-block' && /203\.0\.113\./.test(p.settings.list)) && apiById(s, '19400555').policies.some((p) => p.type === 'client-id')) },
    { title: 'Put it first', how: 'Use Reorder policies, so the address is refused before the credentials are read.', done: (s) => apiById(s, '19400555')?.policies[0]?.type === 'ip-block' },
    { title: 'Prove it', how: 'Move the clock 5 minutes. The address gets 403 and Mobile App still gets 200.', done: (s) => recent(s, 'shipments-eapi', 3).some((e) => e.s === 403) && recent(s, 'shipments-eapi', 3).some((e) => e.s === 200) && !recent(s, 'shipments-eapi', 3).some((e) => e.s === 401) },
  ],
  why: 'Policies run in order. Refusing a known bad address first costs the least, and the violation alert tells you when the address changes.',
  docs: 'https://docs.mulesoft.com/mule-gateway/policies-included-ip-blocklist',
  solve(s) {
    let n = mark(s, 'dash:19400555:Policies')
    n = addApiAlert(n, '19400555', { name: 'Violations', severity: 'Warning', type: 'Policy Violation', atLeast: 3, periods: 1, period: 1, recipients: OPS })
    n = advance(n, 3 * MINUTE)
    n = structuredClone(n)
    apiById(n, '19400555').policies.unshift(policy('ip-block', { list: '203.0.113.66' }))
    return advance(n, 5 * MINUTE)
  },
}

const badDeploy = {
  id: 'p-api-deploy',
  group: 'API operations',
  title: 'A deployment fails',
  minutes: 8,
  scenario: 'You deploy a new shipments-eapi to Sandbox. Someone forgot a property. Deploy it, see how a failed deployment looks, and recover.',
  start: () => newPlatform({ jars: ['shipments-eapi'] }),
  steps: [
    { title: 'Create a Deployment failure alert', how: 'Runtime Manager, Alerts, Create Alert. Condition Deployment failure, for all applications.', done: (s) => s.rmAlerts.some((a) => a.condition === 'Deployment failure' && a.recipients) },
    { title: 'Deploy without properties', how: 'Runtime Manager, Deploy application. Name shipments-eapi, choose the file, no properties, Deploy Application.', done: (s) => s.apps.some((a) => a.error) || Boolean(s.mail.length) },
    { title: 'Read the mail and the logs', how: 'The Inbox has the alert. The log of the application names the property.', done: (s) => Boolean(s.seen.inbox) && Boolean(s.seen['logs:shipments-eapi']) },
    ask('Read the error', 'Which property is missing?', ['db.host', 'partner.url', 'api.id', 'http.port'], 1, 'Mule checks every ${...} placeholder when the application starts, so a missing value stops the deployment.'),
    { title: 'Add it and deploy again', how: 'Settings, Properties, partner.url is https://partner.brightmart.lab/shipments, Apply Changes.', done: (s) => app(s, 'shipments-eapi')?.status === 'Running' && propsValue(app(s, 'shipments-eapi'), 'partner.url') === 'https://partner.brightmart.lab/shipments' },
    { title: 'Call it', how: 'API client, GET /shipments, 200.', done: (s) => called(s, 'shipments-eapi', 200) },
  ],
  why: 'A missing property fails at start and not at the first call, which is why a deployment alert finds it at once.',
  docs: `${CH2}ch2-config-app-alerts`,
  solve(s) {
    let n = addRmAlert(s, { name: 'Failed', severity: 'Critical', app: 'All', condition: 'Deployment failure', recipients: OPS })
    n = finishDeploys(deployApp(n, { name: 'shipments-eapi', pkg: 'shipments-eapi', jar: 'shipments-eapi-1.0.0-mule-application.jar', replicas: 1, vCores: 0.1, props: {}, secrets: {} }).state)
    n = mark(mark(n, 'inbox'), 'logs:shipments-eapi')
    n = withProp(n, 'shipments-eapi', 'partner.url', 'https://partner.brightmart.lab/shipments')
    return call(n, 'shipments-eapi', null).state
  },
  answers: { 3: 1 },
}

export const PLATFORM_LABS = [fullLifeCycle, promote, ...LED_LABS, nightly, disabled, overlap, batch, sftp, silent, dlq, memory, zone, badDeploy, unregistered, wrongCreds, quota, errors500, slow, attack, ...FAILURE_LABS]

export const stepDone = (step, index, state, answers) => (step.ask ? answers[index] === step.right : Boolean(step.done(state)))
export const labDone = (lab, state, answers) => lab.steps.every((step, i) => stepDone(step, i, state, answers))
