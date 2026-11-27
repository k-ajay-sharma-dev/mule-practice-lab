// The guided lab ver-semver-bump. See platform-labs.js for the shape of a lab.
// Three changes to one API, each published with the version number it needs.
import { apiById, at, mark, publish, reviseApi, saveProject } from '../platform.js'
import { ask, call, CLIENTS, until } from '../platform-kit.js'
import { LED, ledProject } from '../platform-project.js'

const [MOBILE_APP] = CLIENTS
const { orders, mobile } = LED
const ASSET = 'orders-system-api'
const WRONG = 'One order, with the name of its customer'
const RIGHT = 'One order, with the ID of its customer'
// release 1.2.3 says the answer has the name of the customer. It has the ID.
const RAML_123 = orders.raml.replace('description: One order', `description: ${WRONG}`)
const ramlOf = (version) => (version === '1.0.0' ? orders.raml : RAML_123)

const ofApi = (s) => s.assets.filter((a) => a.assetId === ASSET)
const fixed = (raml) => !raml.includes(WRONG)
const v1 = (a) => a.apiVersion === 'v1' && /\nversion: v1\n/.test(a.raml)
const patchOk = (a) => /^1\.2\.([4-9]|\d{2,})$/.test(a.version) && v1(a) && fixed(a.raml) && !a.raml.includes('"channel"') && a.raml.includes('"customerId"')
const minorOk = (a) => /^1\.([3-9]|\d{2,})\.0$/.test(a.version) && v1(a) && a.raml.includes('"channel"') && a.raml.includes('"customerId"')
const majorOk = (a) => a.version === '2.0.0' && a.apiVersion === 'v2' && /\nversion: v2\n/.test(a.raml) && a.raml.includes('"customerRef"') && !a.raml.includes('"customerId"')
const major = (s) => ofApi(s).find(majorOk)
// the v1 instance serves a 1.x release that has channel, and still says v1
const instanceOk = (s) => {
  const api = apiById(s, orders.id)
  const a = ofApi(s).find((x) => x.version === api?.version)
  return Boolean(a && minorOk(a) && api.apiVersion === 'v1')
}
const calledSince = (s, name, t) => (s.lastCalls ?? []).some((c) => c.app === name && c.env === 'Sandbox' && c.status === 200 && c.t > t)

const lab = {
  id: 'p-ver-semver-bump',
  group: 'Versioning without breaking consumers',
  title: 'Patch, minor or major: number each change',
  minutes: 25,
  scenario:
    'The Orders System API of Brightmart is at asset version 1.2.3 in Exchange, API version v1. Three changes wait in its spec. First, the description of GET /orders/{orderId} says the answer has the name of the customer, but it has the ID. Second, the warehouse wants a new optional field channel in the order. Third, the Customers team wants customerId renamed to customerRef. Publish each change from Design Center with the version number it needs, and keep the API instance of v1 serving v1.',
  start() {
    const s = ledProject()
    const base = s.assets.find((a) => a.assetId === ASSET)
    const history = ['1.1.0', '1.2.0', '1.2.1', '1.2.2', '1.2.3']
    s.assets.push(...history.map((version, i) => ({ ...base, version, raml: ramlOf(version), t: at(0, 10 + i) })))
    Object.assign(s.projects.find((p) => p.name === orders.name), { raml: RAML_123, published: '1.2.3', updated: at(0, 14) })
    Object.assign(s.apis.find((a) => a.id === orders.id), { version: '1.2.3' })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Read the version history',
      how: 'Exchange, Orders System API. Open the version list: 1.0.0 up to 1.2.3, all with API version v1. Open the Summary of 1.2.3 and find version: v1 in the spec.',
      done: (s) => Boolean(s.seen[`asset:${ASSET}`]),
    },
    ask(
      'Two version numbers',
      'Exchange shows asset version 1.2.3 and API version v1. What is the difference?',
      ['They are the same number written two ways', 'The asset version numbers each release of the spec in Exchange, as major.minor.patch. The API version is the version property in the RAML, the contract consumers code against. Many asset versions can share one API version, and they share its major number', 'The asset version is the version of the Mule runtime', 'The API version counts the deployments'],
      1,
      'For a RAML published from Design Center, Exchange reads the API version from the version property of the spec. The two must agree: every 1.x.x release is v1, and 2.0.0 goes with v2.',
    ),
    {
      title: 'Publish the fix as a patch',
      how: `Design Center, Orders System API. In the description of GET /orders/{orderId}, write "${RIGHT}". Save, then Publish. The dialog proposes 1.3.0, which is a minor number. Change it to 1.2.4 and keep API version v1. A published version can never be changed: a wrong number stays in the list, and you publish again with the right one.`,
      done: (s) => ofApi(s).some(patchOk),
    },
    ask(
      'Number the new field',
      'The warehouse wants channel, a new optional field in the order. Callers that do not know it ignore it. Which version?',
      ['1.2.5, a patch', '1.3.0, a minor version', '2.0.0, a new major version'],
      1,
      'A minor version is a change that is backward compatible and asks nothing of the callers, such as a new optional field or a new resource. A patch is for a fix or a documentation change. Both keep API version v1.',
    ),
    {
      title: 'Publish the new field as a minor version',
      how: 'Design Center, Orders System API. In the example of GET /orders/{orderId}, add "channel":"web" after "customerId":"C-7". Keep customerId. Save, then Publish as 1.3.0 with API version v1.',
      done: (s) => ofApi(s).some(minorOk),
    },
    {
      title: 'Move the v1 instance to 1.3.0',
      how: `API Manager, Orders System API, instance ${orders.id}, Settings. Asset version 1.3.0, Save. The instance keeps its ID, its policies and its contracts. A patch or a minor version moves the existing instance.`,
      done: instanceOk,
    },
    ask(
      'Find the major change',
      'Which of these changes needs a new major version?',
      ['Fixing a typo in a description', 'Adding an optional query parameter', 'Renaming customerId to customerRef, removing a field, or making an optional field required', 'Adding a new resource GET /orders/{orderId}/lines'],
      2,
      'A caller that reads customerId finds nothing after the rename, and a caller that never sent a field fails once it is required. Such a change asks every caller to adapt, so it is a major version.',
    ),
    {
      title: 'Publish the rename as 2.0.0 with API version v2',
      how: 'Design Center, Orders System API. Rename customerId to customerRef in the example, and change version: v1 to version: v2 at the top of the spec. Save, then Publish as 2.0.0. The API version field now reads v2. A 2.0.0 with API version v1, or a 1.4.0 with the rename, is a wrong number: publish again.',
      done: (s) => Boolean(major(s)),
    },
    ask(
      'Where v2 runs',
      'Can the instance of v1 in API Manager move to asset version 2.0.0?',
      ['Yes, like the move to 1.3.0', 'No. An instance changes its asset version only within one major version. v2 needs a new API instance with its own ID, and its consumers request access to it', 'Yes, but only in Production', 'No, a 2.0.0 asset cannot be managed'],
      1,
      'API Manager offers only the versions of the same major, so 2.0.0 is not in the list of the v1 instance. The lab Run v1 and v2 side by side shows the new instance.',
    ),
    {
      title: 'Check that v1 consumers saw nothing',
      how: `API Manager: instance ${orders.id} still serves 1.3.0, API version v1. Its Settings page offers only 1.x versions, so 2.0.0 cannot land there. Then API client, ${mobile.app} as Mobile App, GET /my-orders/O-1001: 200. Publishing to Exchange changes the contract on paper, not the running application.`,
      done: (s) => Boolean(major(s)) && instanceOk(s) && calledSince(s, mobile.app, major(s).t),
    },
  ],
  why: 'Exchange numbers each release of a spec with semantic versioning. A patch is a fix or a documentation change, a minor version is a backward compatible change such as a new optional field or resource, and a major version is a change that callers must adapt to. The API version in the RAML is what consumers code against. Patch and minor releases keep it, and a major release raises it, so 2.0.0 goes with v2. An API instance moves between minor and patch releases of its major version. A new major version gets a new instance. In the lab Exchange accepts any number that has the form 1.0.0 and does not check it against the API version.',
  docs: 'https://docs.mulesoft.com/exchange/to-change-raml-version',
  solve(start) {
    const project = start.projects.find((p) => p.name === orders.name).id
    const form = { assetId: ASSET, name: orders.name, apiVersion: 'v1', lifecycle: 'stable' }
    let s = mark(start, `asset:${ASSET}`)
    let raml = RAML_123.replace(WRONG, RIGHT)
    s = publish(saveProject(s, project, raml), project, { ...form, version: '1.2.4' }).state
    raml = raml.replace('"customerId":"C-7"', '"customerId":"C-7","channel":"web"')
    s = publish(saveProject(s, project, raml), project, { ...form, version: '1.3.0' }).state
    s = reviseApi(s, orders.id, '1.3.0')
    raml = raml.replace('"customerId"', '"customerRef"').replace('version: v1', 'version: v2')
    s = publish(saveProject(s, project, raml), project, { ...form, version: '2.0.0', apiVersion: 'v2' }).state
    return call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
  },
  answers: { 1: 1, 3: 1, 6: 2, 8: 1 },
}

export const LABS = [lab]
