// The guided lab ver-minor-in-place. See platform-labs.js for the shape of a lab.
// A backward compatible change goes out in place: same API instance, same application, same address.
import { apiById, at, mark, pairing, publish, reviseApi } from '../platform.js'
import { app, ask, call, change, CLIENTS, until } from '../platform-kit.js'
import { jarOf, LED, ledClient, ledProject, patchApp } from '../platform-project.js'
import { PKG } from './ver-minor-in-place.pkg.js'

const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc, customers } = LED
const ASSET = 'customers-system-api'
const JAR = { v10: jarOf('customers').jar, v11: 'customers-sapi-1.1.0-mule-application.jar' }
const RAML_11 = customers.raml.replace('"email":"orders@harbordeli.example"}', '"email":"orders@harbordeli.example","phone":"+1 555 0100"}')
const PAPI = ledClient('process').name

const running = (s, name) => app(s, name)?.status === 'Running'
const calledSince = (s, name, t) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === 'Sandbox' && c.status === 200 && c.t > t)
const published = (s) => s.assets.some((a) => a.assetId === ASSET && a.version === '1.1.0' && a.apiVersion === 'v1' && a.raml.includes('"phone"') && a.raml.includes('"email"'))
const instanceMoved = (s) => apiById(s, customers.id)?.version === '1.1.0' && apiById(s, customers.id)?.apiVersion === 'v1'
// the same application name, the new jar, and autodiscovery still on the same instance ID
const redeployed = (s) => {
  const a = app(s, customers.app)
  return a?.pkg === PKG.customers11 && running(s, customers.app) && pairing(s, a).api?.id === customers.id
}
// what the consumers rely on did not move: the instance ID, its contract and its policy
const kept = (s) => {
  const api = apiById(s, customers.id)
  return Boolean(api?.contracts.some((c) => c.client === PAPI && c.status === 'approved') && api.policies.some((p) => p.type === 'client-id'))
}

const lab = {
  id: 'p-ver-minor-in-place',
  group: 'Versioning without breaking consumers',
  title: 'Release a minor version in place',
  minutes: 20,
  scenario:
    'The Customers team adds phone, a new optional field, to the customer. Every field of today stays as it is. The spec is saved in Design Center and the jar customers-sapi 1.1.0 is built. order-fulfilment-papi calls the Customers System API, and both Experience APIs sit above it. Release the change so that no consumer has to change anything: no new contract, no new URL, no new client ID.',
  start() {
    const s = ledProject()
    s.jars = s.jars.map((j) => (typeof j !== 'string' && j.pkg === proc.app ? { ...j, pkg: PKG.process } : j))
    s.jars.push({ pkg: PKG.customers11, autodiscovery: jarOf('customers').autodiscovery, jar: JAR.v11 })
    patchApp(s, 'process', { pkg: PKG.process })
    Object.assign(s.projects.find((p) => p.name === customers.name), { raml: RAML_11, updated: at(0, 17) })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'See what the consumers hold',
      how: `API Manager, Customers System API, instance ${customers.id}. Note the API Instance ID, the policy Client ID Enforcement and the contract of ${PAPI}. In Runtime Manager, ${customers.app} has api.id=${customers.id} in its properties. These are what the consumers rely on.`,
      done: (s) => Boolean(s.seen[`api:${customers.id}`]),
    },
    ask(
      'Number the change',
      'A new optional field, and every old field unchanged. Which asset version?',
      ['1.0.1, a patch', '1.1.0, a minor version with API version v1', '2.0.0, a new major version with API version v2'],
      1,
      'A change that asks nothing of the callers is a minor version. The API version in the RAML stays v1.',
    ),
    {
      title: 'Publish 1.1.0',
      how: 'Design Center, Customers System API. The example of GET /customers/{customerId} already has phone, and the spec still says version: v1. Publish with asset version 1.1.0 and API version v1.',
      done: published,
    },
    {
      title: 'Point the existing instance to 1.1.0',
      how: `API Manager, Customers System API, instance ${customers.id}, Settings. Asset version 1.1.0, Save. The API Instance ID stays ${customers.id}. The policy and the contract stay where they are. On the platform this is Change API specification in the Actions menu of the instance.`,
      done: instanceMoved,
    },
    ask(
      'A new instance instead?',
      'A colleague wants to add a new API instance for 1.1.0 in API Manager and point the application to it. What would that do?',
      ['Nothing, two instances are the same', `The new instance gets a new API ID with no policies and no contracts. ${customers.app} would need the new ID in api.id, the v1 instance would go inactive, and ${PAPI} would have to request access again`, 'It is the only way to release 1.1.0', 'It makes the release faster'],
      1,
      'A new instance is for a new major version. A minor or patch release moves the existing instance, so the API ID, the policies and the contracts stay.',
    ),
    {
      title: `Redeploy ${customers.app} with 1.1.0`,
      how: `Runtime Manager, ${customers.app}, Settings. Application File ${JAR.v11}. Leave the name and the properties as they are, api.id stays ${customers.id}. Apply Changes. The name gives the same address, so no caller changes its URL.`,
      done: redeployed,
    },
    ask(
      'Why nobody notices',
      `The answer of ${customers.app} now has phone. Why does ${proc.app} not break?`,
      ['It does not call the Customers System API any more', 'It is a tolerant reader: it maps id, name and email of the customer and ignores fields it does not know. A new field is invisible to it', 'The gateway removes the new field', 'API Manager hides it from v1 callers'],
      1,
      'A backward compatible change counts on tolerant consumers. A consumer that rejects any unknown field, for example with a strict schema, turns a minor change into a breaking one for itself.',
    ),
    {
      title: 'Prove the consumers saw no change',
      how: `API client: GET /partner-orders/O-1001 as Partner Portal and GET /my-orders/O-1001 as Mobile App. Both answer 200, and the customer has id, name and email as before. ${customers.app} is still paired with instance ${customers.id}, and the contract of ${PAPI} is still there.`,
      done: (s) => redeployed(s) && instanceMoved(s) && kept(s) && calledSince(s, partner.app, app(s, customers.app).updated) && calledSince(s, mobile.app, app(s, customers.app).updated),
    },
  ],
  why: 'A backward compatible change is a minor version: asset 1.1.0 with the same API version v1. It is released in place. In API Manager the existing instance moves to the new asset version, so its API ID, policies and contracts stay. In Runtime Manager the same application gets the new jar, so its address and its autodiscovery ID stay. Consumers change nothing, as long as they read only the fields they need. A new API instance is for a new major version: it has a new ID, and every consumer must request access to it. In the lab the 1.1.0 jar is already built and the Process API maps the customer field by field.',
  docs: 'https://docs.mulesoft.com/api-manager/latest/manage-versions-instances-concept',
  solve(start) {
    let s = mark(start, `api:${customers.id}`)
    const project = s.projects.find((p) => p.name === customers.name).id
    s = publish(s, project, { assetId: ASSET, name: customers.name, version: '1.1.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = reviseApi(s, customers.id, '1.1.0')
    s = change(s, customers.app, { pkg: PKG.customers11, jar: JAR.v11 })
    s = call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
    return call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
  },
  answers: { 1: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
