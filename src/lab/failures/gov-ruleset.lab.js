// The guided lab gov-ruleset. See platform-labs.js for the shape of a lab.
// The architecture team wants every System API to follow the security rulesets. The learner creates a governance
// profile, finds the three System APIs that break it, fixes one in Design Center and publishes a minor version.
import { at, mark, newPlatform, publish, saveProject } from '../platform.js'
import { OPS } from '../platform-kit.js'
import { checkSpec, conformanceOf, createProfile, emptyGovernance, latestOf, modelOf, profilesOf } from '../platform-governance.js'
import { parseRaml } from '../../raml/parse.js'

const OWASP = 'OWASP API Security Top 10 2019 Checklist'
const HTTPS = 'HTTPS Enforcement'
const SECURITY = [OWASP, HTTPS]

const SCHEME = `securitySchemes:
  oauth_2_0:
    type: OAuth 2.0
    description: Client credentials issued by the Brightmart identity provider
    settings:
      accessTokenUri: https://auth.brightmart.lab/oauth2/token
      authorizationGrants: [ client_credentials ]
securedBy: [ oauth_2_0 ]
`
const AUTH = `      401:
        description: The token is missing or not valid
      403:
        description: The client may not use this resource
`
// one System or Process API of Brightmart. Each fails in one way only, so the learner reads one cause per API.
const spec = ({ title, about, base, scheme = true, auth = true, resources }) =>
  `#%RAML 1.0
title: ${title}
description: ${about}
version: v1
baseUri: ${base}
mediaType: application/json
${scheme ? SCHEME : ''}${resources
    .map(
      ([path, what, method, does, example]) => `${path}:
  description: ${what}
  ${method}:
    description: ${does}
    responses:
      200:
        body:
          example: ${example}
${auth ? AUTH : ''}      500:
        description: The system of record did not answer
`,
    )
    .join('')}`

const API = {
  inventory: { assetId: 'inventory-sys-api', name: 'Inventory System API', version: '1.2.0', tags: ['System', 'Inventory'], team: 'Supply Chain team', raml: spec({ title: 'Inventory System API', about: 'Stock on hand in the distribution centers, from the ERP.', base: 'http://inventory-sys.brightmart.lab/api/{version}', resources: [['/stock/{sku}', 'Stock of one item', 'get', 'Read the stock of one item', '{ "sku": "H-100", "onHand": 340 }']] }) },
  suppliers: { assetId: 'suppliers-sys-api', name: 'Suppliers System API', version: '1.0.0', tags: ['System', 'Purchasing'], team: 'Purchasing team', raml: spec({ title: 'Suppliers System API', about: 'Suppliers and their contacts, from the ERP.', base: 'https://suppliers-sys.brightmart.lab/api/{version}', scheme: false, resources: [['/suppliers/{supplierId}', 'One supplier', 'get', 'Read one supplier', '{ "supplierId": "SUP-12", "name": "Saltmarsh Supplies" }']] }) },
  warehouse: { assetId: 'warehouse-sys-api', name: 'Warehouse System API', version: '2.1.0', tags: ['System', 'Logistics'], team: 'Supply Chain team', raml: spec({ title: 'Warehouse System API', about: 'Picking and packing in the warehouse management system.', base: 'https://warehouse-sys.brightmart.lab/api/{version}', auth: false, resources: [['/picks/{orderId}', 'The pick list of an order', 'get', 'Read the pick list of an order', '{ "orderId": "O-2001", "lines": 3 }'], ['/packages/{orderId}', 'The packages of an order', 'get', 'Read the packages of an order', '{ "orderId": "O-2001", "packages": 1 }']] }) },
  payments: { assetId: 'payments-sys-api', name: 'Payments System API', version: '1.4.0', tags: ['System', 'Payments'], team: 'Payments team', raml: spec({ title: 'Payments System API', about: 'Payments with Tidewater Pay, the payment provider.', base: 'https://payments-sys.brightmart.lab/api/{version}', resources: [['/payments/{paymentId}', 'One payment', 'get', 'Read one payment', '{ "paymentId": "PAY-9001", "status": "CAPTURED" }']] }) },
  orders: { assetId: 'orders-prc-api', name: 'Orders Process API', version: '3.0.0', tags: ['Process', 'Orders'], team: 'Order Management team', raml: spec({ title: 'Orders Process API', about: 'Takes an order through payment, stock and shipping.', base: 'http://orders-prc.brightmart.lab/api/{version}', resources: [['/orders/{orderId}', 'One order', 'get', 'Read one order with its state', '{ "orderId": "O-2001", "state": "PACKED" }']] }) },
}
const FAILING = [API.inventory, API.suppliers, API.warehouse]

// the fixes a learner can make: https in the baseUri, a security scheme, or the 401 and 403 responses
const FIXED = {
  'inventory-sys-api': API.inventory.raml.replace('http://inventory-sys', 'https://inventory-sys'),
  'suppliers-sys-api': spec({ title: 'Suppliers System API', about: 'Suppliers and their contacts, from the ERP.', base: 'https://suppliers-sys.brightmart.lab/api/{version}', resources: [['/suppliers/{supplierId}', 'One supplier', 'get', 'Read one supplier', '{ "supplierId": "SUP-12", "name": "Saltmarsh Supplies" }']] }),
  'warehouse-sys-api': API.warehouse.raml.replaceAll('      500:\n', `${AUTH}      500:\n`),
}

const projectOf = (s, assetId) => s.projects.find((p) => p.assetId === assetId)
const secure = (raml) => !checkSpec(modelOf(raml, parseRaml), SECURITY).some((i) => i.severity === 'error')
const minorAfter = (from, to) => {
  const [a, b] = from.split('.').map(Number)
  const [x, y] = String(to).split('.').map(Number)
  return x === a && y > b
}
const republished = (s) => FAILING.filter((a) => {
  const last = latestOf(s, a.assetId)
  return last && minorAfter(a.version, last.version) && secure(last.raml)
})
const systemProfile = (p) => ['category', 'tag'].includes(p.criteria?.by) && String(p.criteria.value).toLowerCase() === 'system' && SECURITY.every((r) => p.rulesets.includes(r))

const lab = {
  id: 'p-gov-ruleset',
  group: 'Governance and access',
  title: 'Security rulesets for every System API',
  minutes: 20,
  scenario:
    'The architecture team of Brightmart wants every System API to follow the security rules before phase 2 opens them to more consumers. Nobody knows how far the specifications in Exchange are from that. Create a governance profile for the System layer with the OWASP and HTTPS rulesets, find the APIs that break it, and fix one of them the way a team would: in Design Center, with a new version.',
  start() {
    const t = at(-10, 10)
    return newPlatform({
      clock: at(1, 9),
      assets: Object.values(API).map((a) => ({ assetId: a.assetId, name: a.name, version: a.version, apiVersion: 'v1', lifecycle: 'stable', raml: a.raml, t, team: a.team, tags: a.tags })),
      projects: Object.values(API).map((a) => ({ id: `p-${a.assetId}`, name: a.name, assetId: a.assetId, updated: t, published: a.version })),
      governance: emptyGovernance(at(1, 9)),
      mail: [{ t: at(1, 8, 30), to: OPS, subject: 'Security rules for System APIs', body: 'From phase 2 every System API must pass the OWASP API Security Top 10 2019 Checklist and HTTPS Enforcement rulesets. Please set up a profile in API Governance, tell the owners what fails and fix one API as the example for the teams. Send the notifications to architecture@brightmart.example.', source: 'Brightmart architecture team' }],
    })
  },
  steps: [
    { title: 'Open API Governance', how: 'Open the menu at the top left and choose API Governance. The Overview counts the APIs by conformance. With no profile every API is Not validated.', done: (s) => Boolean(s.seen['gov:overview']) },
    {
      title: 'Create the profile for the System layer',
      how: `Profiles, Create profile. Profile name System API security. Under Rulesets tick ${OWASP} and ${HTTPS}. Under Filter criteria set Filter by to Category: API layer and Value to System, and keep the lifecycle states Development and Stable. Tick Send notifications with architecture@brightmart.example as the recipient. Create profile.`,
      done: (s) => profilesOf(s).some(systemProfile),
    },
    {
      title: 'Open each API that is not conformant',
      how: 'APIs, filter on Not conformant, and open each API. The Issues table names the ruleset, the rule, the severity and the location in the specification.',
      done: (s) => FAILING.every((a) => Boolean(s.seen[`gov:api:${a.assetId}`])),
    },
    {
      ask: 'Which System APIs fail, and why?',
      title: 'Name the causes',
      options: [
        'Inventory System API has a plain http baseUri. Suppliers System API declares no security scheme. Warehouse System API declares no 401 and 403 responses',
        'Inventory System API declares no security scheme. Suppliers System API has no 401 and 403. Warehouse System API uses http',
        'Inventory, Payments and the Orders Process API, because all three use http',
        'All five APIs fail the same rule',
      ],
      right: 0,
      reason:
        'Each System API breaks one rule with severity error. Payments System API passes. The Orders Process API uses http too, yet it shows Not validated: the profile selects the System layer only, so the filter criteria decide what is checked at all.',
    },
    {
      title: 'Fix one specification in Design Center',
      how: 'On the page of a failing API choose Open in Design Center. Make the change the issue asks for: https in the baseUri of Inventory, a securitySchemes entry with securedBy for Suppliers, or 401 and 403 under responses of each method of Warehouse. The problems bar must stay at No problems.',
      done: (s) => FAILING.some((a) => projectOf(s, a.assetId)?.raml && secure(projectOf(s, a.assetId).raml)),
    },
    {
      title: 'Publish a new minor version',
      how: 'Publish, and keep the Asset version that Design Center offers, the next minor such as 2.2.0. Publish to Exchange.',
      done: (s) => republished(s).length > 0,
    },
    {
      title: 'See it turn conformant',
      how: 'API Governance, APIs. Open the API again. The newest version shows Conformant for the profile.',
      done: (s) => republished(s).some((a) => s.seen[`gov:api:${a.assetId}:${latestOf(s, a.assetId).version}`] && conformanceOf(s, latestOf(s, a.assetId), parseRaml).status === 'Conformant'),
    },
    {
      ask: 'Why do you publish the fix as a new minor version?',
      title: 'Choose the version',
      options: [
        'To overwrite the old version, so nobody sees it',
        'A published version in Exchange cannot change. The fix adds to the contract and breaks no consumer, so it is a minor version. The old version stays and keeps showing Not conformant until it is deprecated',
        'A major version, because anything about security breaks consumers',
        'No version is needed: Exchange reads the project in Design Center',
      ],
      right: 1,
      reason:
        'Governance reports each version on its own. Declaring 401 and 403 or a security scheme for a gateway that already asks for a token changes no call that works today, so a minor version fits. If the fix changed what a working call needs, it would be a major version and a new API version.',
    },
    {
      ask: 'The API you fixed is now conformant to the security profile. What has governance proven?',
      title: 'Design and runtime',
      options: [
        'That the API instance enforces OAuth 2.0 on every call',
        'That the specification declares a security scheme, HTTPS and the 401 and 403 answers. Whether the gateway enforces them is a runtime question for API Manager policies, such as OAuth 2.0 or JWT validation, and for TLS on the listener',
        'That no client can call the API without a token',
        'That the application passes its MUnit tests',
      ],
      right: 1,
      reason:
        'API Governance reads the design: the specification in Exchange. It does not see the API instance, its policies or the certificate of the listener. A conformant specification next to an instance with no policy is still open, so a runtime check in API Manager belongs next to the design check.',
    },
  ],
  why: 'API Governance applies rulesets to the specifications that a profile selects. The filter criteria matter as much as the rules: an API outside every profile shows Not validated, which is not the same as Conformant. A rule with severity error makes the version Not conformant; warnings are advice. A fix is a new version in Exchange, because a published version never changes. Governance checks the design only. The policies on the API instance and the TLS of the runtime are checked somewhere else. In the lab the rulesets are a small set of rules with the names of the MuleSoft rulesets, the API layer comes from the tags of the asset, and conformance is computed when you look.',
  docs: 'https://docs.mulesoft.com/api-governance/',
  solve(start) {
    let s = mark(start, 'gov:overview')
    s = createProfile(s, { name: 'System API security', criteria: { by: 'category', value: 'System', lifecycles: ['development', 'stable'] }, rulesets: SECURITY, notify: true, recipients: 'architecture@brightmart.example' }, parseRaml).state
    for (const a of FAILING) s = mark(s, `gov:api:${a.assetId}`)
    s = saveProject(s, 'p-warehouse-sys-api', FIXED['warehouse-sys-api'])
    s = publish(s, 'p-warehouse-sys-api', { assetId: 'warehouse-sys-api', name: 'Warehouse System API', version: '2.2.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    return mark(s, 'gov:api:warehouse-sys-api:2.2.0')
  },
  answers: { 3: 0, 7: 1, 8: 1 },
}

export const LABS = [lab]
