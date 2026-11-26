// The guided lab led-breaking-change. See platform-labs.js for the shape of a lab.
import { addApi, apiById, appNamed, applyPolicy, at, deployApp, finishDeploys, mark, pairing, publish, requestAccess, reviseApi, saveProject } from '../platform.js'
import { app, ask, call, change, CLIENTS, propsValue, until } from '../platform-kit.js'
import { internal, jarOf, LED, ledClient, ledForm, ledProject, patchApp, PRIVATE_SPACE, propText } from '../platform-project.js'
import { PKG } from './led-breaking-change.pkg.js'

const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc, customers } = LED
const ASSET = 'customers-system-api'
const V2_APP = 'customers-sapi-v2'
const JAR = {
  customers10: jarOf('customers').jar,
  customers11: 'customers-sapi-1.1.0-mule-application.jar',
  customers2: 'customers-sapi-2.0.0-mule-application.jar',
  process11: 'order-fulfilment-papi-1.1.0-mule-application.jar',
}
// release 1.1.0 renamed the field, and its RAML still says version v1
const RAML_11 = customers.raml.replace('"email":', '"contactEmail":')
const RAML_V2 = RAML_11.replace('version: v1', 'version: v2')
const PAPI = ledClient('process').name
const TEMPLATE = propText(ledProject({ traffic: [] }), 'customers', 'Sandbox', 'PASTE_THE_V2_API_INSTANCE_ID')

const getMobile = (s) => call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
const getPartner = (s) => call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
const running = (s, name) => appNamed(s, name, 'Sandbox')?.status === 'Running'
const calledSince = (s, name, t) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === 'Sandbox' && c.status === 200 && c.t > t)
const rolledBack = (s) => app(s, customers.app)?.pkg === 'customers-sapi' && running(s, customers.app)
const v2Api = (s) => s.apis.find((a) => a.env === 'Sandbox' && a.assetId === ASSET && a.apiVersion === 'v2')
const v2Running = (s) => {
  const a = app(s, V2_APP)
  return a?.pkg === PKG.customers2 && running(s, V2_APP) && a.publicEndpoint === false && Boolean(v2Api(s)) && pairing(s, a).api?.id === v2Api(s).id
}
const v2Contract = (s) => Boolean(v2Api(s)?.contracts.some((c) => c.client === PAPI && c.status === 'approved'))
const moved = (s) => app(s, proc.app)?.pkg === PKG.process11 && propsValue(app(s, proc.app), 'customers.url') === internal(V2_APP) && running(s, proc.app)

const lab = {
  id: 'p-fail-led-breaking-change',
  group: 'API-led failures',
  title: 'A System API breaks its contract without a new version',
  minutes: 35,
  scenario:
    'Yesterday at 18:30 the Customers team deployed release 1.1.0 of customers-sapi. It renames the field email to contactEmail, and it was published in Exchange as 1.1.0 with API version v1. Since then every answer is 200, but partners see a customer without an email and the mobile app has nowhere to send the order confirmation. No alert fired. Find the layer that changed, bring back the old contract, and release the change the right way as v2. The Process team has release 1.1.0 of order-fulfilment-papi ready, which reads contactEmail.',
  start() {
    const s = ledProject()
    s.jars = s.jars.map((j) => (typeof j !== 'string' && j.pkg === proc.app ? { ...j, pkg: PKG.process10 } : typeof j !== 'string' && j.pkg === mobile.app ? { ...j, pkg: PKG.mobile } : j))
    s.jars.push(
      { pkg: PKG.customers11, autodiscovery: jarOf('customers').autodiscovery, jar: JAR.customers11 },
      { pkg: PKG.customers2, autodiscovery: jarOf('customers').autodiscovery, jar: JAR.customers2 },
      { pkg: PKG.process11, autodiscovery: jarOf('process').autodiscovery, jar: JAR.process11 },
    )
    patchApp(s, 'process', { pkg: PKG.process10 })
    patchApp(s, 'mobile', { pkg: PKG.mobile })
    patchApp(s, 'customers', { pkg: PKG.customers11, jar: JAR.customers11, config: 2, updated: at(0, 18, 30) })
    const logger = 'org.mule.runtime.deployment'
    app(s, customers.app).logs.push(
      { t: at(0, 10), level: 'INFO', text: `Started app '${customers.app}' from ${JAR.customers10}`, logger, config: 1 },
      { t: at(0, 18, 30), level: 'INFO', text: `Initializing app '${customers.app}' from ${JAR.customers11}`, logger, config: 2 },
      { t: at(0, 18, 30), level: 'INFO', text: `Started app '${customers.app}'`, logger, config: 2 },
    )
    s.assets.push({ ...s.assets.find((a) => a.assetId === ASSET), version: '1.1.0', raml: RAML_11, t: at(0, 18) })
    const mob = s.assets.find((a) => a.name === mobile.name)
    mob.raml = mob.raml.replace('"inStock":true}', '"inStock":true,"notifyEmail":"orders@harbordeli.example"}')
    Object.assign(s.projects.find((p) => p.name === customers.name), { raml: RAML_11, published: '1.1.0', updated: at(0, 18) })
    Object.assign(s.apis.find((a) => a.id === customers.id), { version: '1.1.0' })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'See the missing data',
      how: 'API client, partner-orders-eapi as Partner Portal, GET /partner-orders/O-1001. Then mobile-orders-eapi as Mobile App, GET /my-orders/O-1001. Both answer 200. Read the bodies: the email of the customer and notifyEmail are null.',
      done: (s) => calledSince(s, partner.app, 0) && calledSince(s, mobile.app, 0),
    },
    ask(
      'Why nobody was paged',
      'Every call answers 200 and the dashboards show no errors. Why did no alert fire?',
      ['Monitoring is switched off in Sandbox', 'Each application did what it was built to do. A field that is missing is not an error until someone checks the answer against the contract', 'The errors are only logged in Production', 'Alerts ignore System APIs'],
      1,
      'A mapping of a field that is not there gives null, with status 200. Error counts and response codes cannot see it. Only a check of the data, such as a contract test, can.',
    ),
    {
      title: 'Compare the versions in Exchange',
      how: 'Exchange, Customers System API. Choose version 1.0.0, then 1.1.0, and compare the example of GET /customers/{customerId}. Look at the API version of both.',
      done: (s) => Boolean(s.seen[`asset:${ASSET}`]),
    },
    {
      title: 'Find the deployment',
      how: `Runtime Manager, Applications: ${customers.app} was updated yesterday at 18:30. Open its Logs and choose Config 2: it started from ${JAR.customers11}. No other application of the project changed.`,
      done: (s) => Boolean(s.seen[`logs:${customers.app}`]),
    },
    ask(
      'Which layer changed',
      'Mobile and partner both lost the email. Which layer changed?',
      ['mobile-orders-eapi', 'order-fulfilment-papi', 'customers-sapi', 'The SQL Server database'],
      2,
      'Only customers-sapi has a new release. It now answers contactEmail, and the Process API still maps email, so both Experience APIs above it get null.',
    ),
    ask(
      'Why it breaks',
      'Release 1.1.0 renamed email to contactEmail. Why is that a breaking change?',
      ['It is not, the data is still in the answer', 'A caller that reads email finds nothing. Renaming or removing a field that callers read, or making an optional field required, breaks them', 'Only because the response is bigger', 'Because the database column changed'],
      1,
      'The data is still there, under a name no caller knows. Adding a new optional field next to email would have broken nobody.',
    ),
    ask(
      'Choose the version',
      'Exchange versions follow semantic versioning: major, minor and patch. Which version should this release have had?',
      ['1.0.1, a patch', '1.1.0, a minor version', '2.0.0, a new major version with API version v2'],
      2,
      'A major version for a change that is not backward compatible, a minor version for an addition such as a new optional field, a patch for a fix or a documentation change. The asset version and the API version must agree: v2 goes with 2.x.x. Adding contactEmail next to email would have been 1.1.0.',
    ),
    ask(
      'The contract',
      'The Process team says nobody told them. What should have caught the rename before it was deployed?',
      ['A longer timeout in the Process API', 'The RAML in Exchange is the promise to every consumer. Comparing the new spec with 1.0.0 shows that email is gone, so the change needs a new major version and a plan with each consumer', 'A bigger replica', 'Nothing, renames always surprise someone'],
      1,
      'Consumers build against the published spec, not against the code. A change to the spec that a consumer would notice is a new major version, published next to the old one.',
    ),
    {
      title: 'Roll back customers-sapi',
      how: `Runtime Manager, ${customers.app}, Settings. Application File ${JAR.customers10}, Apply Changes. The old contract runs again.`,
      done: rolledBack,
    },
    {
      title: 'Point the instance back to 1.0.0',
      how: 'API Manager, Customers System API v1, Settings. Asset version 1.0.0, Save. The instance now names the contract it serves. In API Manager an instance moves only between minor and patch versions of one major version.',
      done: (s) => apiById(s, customers.id)?.version === '1.0.0' && apiById(s, customers.id)?.apiVersion === 'v1',
    },
    {
      title: 'The consumers are whole again',
      how: 'Call GET /partner-orders/O-1001 as Partner Portal once more. The customer has its email again.',
      done: (s) => rolledBack(s) && calledSince(s, partner.app, app(s, customers.app).updated),
    },
    {
      title: 'Publish the change as 2.0.0',
      how: 'Design Center, Customers System API. The spec already has contactEmail. Change version: v1 to version: v2, then Publish: asset version 2.0.0, API version v2. Version 1.0.0 stays in Exchange for the callers of v1.',
      done: (s) => s.assets.some((a) => a.assetId === ASSET && /^2\.\d+\.\d+$/.test(a.version) && a.apiVersion === 'v2' && a.raml.includes('contactEmail')),
    },
    {
      title: 'Create an API instance for v2',
      how: 'API Manager, Add API, Add new API, Customers System API, asset version 2.0.0. A new major version gets its own instance. Then Policies, Add policy, Client ID Enforcement. Copy the API Instance ID.',
      done: (s) => Boolean(v2Api(s)?.policies.some((p) => p.type === 'client-id')),
    },
    {
      title: `Deploy ${V2_APP}`,
      how: `Runtime Manager, Deploy application, name ${V2_APP}, file ${JAR.customers2}, target Private Space ${PRIVATE_SPACE}, no public endpoint. Paste the properties with the ID of the v2 instance, and add the protected property anypoint.platform.client_secret from Environment information. ${customers.app} keeps running v1.`,
      code: TEMPLATE,
      done: v2Running,
    },
    {
      title: 'Give the Process API a contract on v2',
      how: 'Exchange, Customers System API 2.0.0, Request access, choose the v2 instance and the client application Order Fulfilment API.',
      done: v2Contract,
    },
    ask(
      'Two versions side by side',
      `Why does ${customers.app} keep running v1 next to ${V2_APP}?`,
      ['Two copies answer faster', 'Each consumer of v1 moves to v2 on its own plan and tests it. v1 is deprecated and retired after the last one has moved', 'Exchange needs a running application for each version', 'v2 cannot run alone'],
      1,
      'A major version gives consumers time. Watch the calls on the v1 instance in API Manager: when nobody calls it any more, deprecate 1.0.0 in Exchange and stop the application.',
    ),
    {
      title: 'Move the Process API to v2',
      how: `Runtime Manager, ${proc.app}, Settings. Application File ${JAR.process11}, which maps contactEmail to email. Set customers.url to ${internal(V2_APP)}. Apply Changes.`,
      done: moved,
    },
    {
      title: 'Prove both consumers',
      how: 'API client: GET /my-orders/O-1001 as Mobile App and GET /partner-orders/O-1001 as Partner Portal. Both answer 200 with the email filled in, now read from v2.',
      done: (s) => moved(s) && v2Running(s) && v2Contract(s) && rolledBack(s) && calledSince(s, mobile.app, app(s, proc.app).updated) && calledSince(s, partner.app, app(s, proc.app).updated),
    },
  ],
  why: 'The RAML in Exchange is the promise a System API makes to everyone above it. A change a consumer would notice is a new major version: asset 2.0.0 with API version v2, its own API instance in API Manager, and its own deployment next to v1. Each consumer then moves on purpose, and v1 is retired when nobody calls it. In the lab the 2.0.0 jar of customers-sapi and the 1.1.0 jar of the Process API are already built, Exchange accepts any version number, and API Manager lets an instance pick any asset version. On the platform Exchange expects the major version of the asset to match the API version, and an instance changes only within one major version.',
  docs: 'https://docs.mulesoft.com/exchange/to-change-raml-version',
  solve(start) {
    let s = getMobile(getPartner(start))
    s = mark(mark(s, `asset:${ASSET}`), `logs:${customers.app}`)
    s = change(s, customers.app, { pkg: 'customers-sapi', jar: JAR.customers10 })
    s = reviseApi(s, customers.id, '1.0.0')
    s = getPartner(s)
    const project = s.projects.find((p) => p.name === customers.name).id
    s = saveProject(s, project, RAML_V2)
    s = publish(s, project, { assetId: ASSET, name: customers.name, version: '2.0.0', apiVersion: 'v2', lifecycle: 'stable' }).state
    s = addApi(s, { assetId: ASSET, label: 'customers-v2-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = applyPolicy(s, id, 'client-id')
    s = finishDeploys(deployApp(s, { ...ledForm(s, 'customers', id), name: V2_APP, pkg: PKG.customers2, jar: JAR.customers2 }).state)
    s = requestAccess(s, id, PAPI)
    s = change(s, proc.app, { pkg: PKG.process11, jar: JAR.process11, props: { ...app(s, proc.app).props, 'customers.url': internal(V2_APP) } })
    return getPartner(getMobile(s))
  },
  answers: { 1: 1, 4: 2, 5: 1, 6: 2, 7: 1, 15: 1 },
}

export const LABS = [lab]
