// The guided lab gov-conformance. See platform-labs.js for the shape of a lab.
// A profile for Experience APIs is set to block publishing (a lab option). A developer cannot publish 1.4.0 of the
// Store App Experience API. The learner reads the failed rules, fixes the specification and publishes.
import { at, newPlatform, publish, saveProject } from '../platform.js'
import { OPS } from '../platform-kit.js'
import { checkSpec, emptyGovernance, latestOf, modelOf, profilesOf, selects } from '../platform-governance.js'
import { parseRaml } from '../../raml/parse.js'

const ASSET = 'store-app-exp-api'
const NAME = 'Store App Experience API'
const RULESETS = ['Required Examples', 'OWASP API Security Top 10 2019 Checklist']
const PROFILE = {
  id: 'gp-1', name: 'Experience API release gate', description: 'Every Experience API ships with examples and declared security answers.',
  criteria: { by: 'category', value: 'Experience', lifecycles: ['development', 'stable'] }, rulesets: RULESETS, notify: true, recipients: 'api-review@harbor.example', block: true, created: at(-5, 10),
}

const HEAD = `#%RAML 1.0
title: ${NAME}
description: The API behind the store app of Harbor. Store staff look up orders and start returns at the till.
version: v1
baseUri: https://store-app-exp.harbor.lab/api/{version}
mediaType: application/json
securitySchemes:
  oauth_2_0:
    type: OAuth 2.0
    description: Tokens of the Harbor identity provider for the store app
    settings:
      accessTokenUri: https://auth.harbor.lab/oauth2/token
      authorizationGrants: [ client_credentials ]
securedBy: [ oauth_2_0 ]
types:
  Order:
    properties:
      orderId: string
      status: string
  Return:
    properties:
      sku: string
      reason: string
/orders/{orderId}:
  description: One order of a customer
  get:
    description: Read one order for the till
    responses:
      200:
        body:
          type: Order
          example: { "orderId": "O-2001", "status": "DELIVERED" }
      401:
        description: The token is missing or not valid
      403:
        description: The store may not read this order
      404:
        body:
          example: { "message": "Order not found" }
`
const V130 = HEAD
// the draft of 1.4.0: returns at the till, written in a hurry
const DRAFT = `${HEAD}  /returns:
    description: The returns of an order
    post:
      description: Start a return at the till
      body:
        type: Return
      responses:
        201:
          body:
            properties:
              returnId: string
`
const FIXED = `${HEAD}  /returns:
    description: The returns of an order
    post:
      description: Start a return at the till
      body:
        type: Return
        example: { "sku": "H-100", "reason": "DAMAGED" }
      responses:
        201:
          body:
            properties:
              returnId: string
            example: { "returnId": "R-310" }
        401:
          description: The token is missing or not valid
        403:
          description: The store may not start returns
`

const draftOf = (s) => s.projects.find((p) => p.assetId === ASSET)?.raml ?? ''
const issuesOf = (raml) => checkSpec(modelOf(raml, parseRaml), RULESETS).filter((i) => i.severity === 'error')
// the profile still blocks and still selects the API: the learner fixed the spec, not the gate
const gateKept = (s) => profilesOf(s).some((p) => p.block && RULESETS.every((r) => p.rulesets.includes(r)) && selects(p, s, { assetId: ASSET, name: NAME, lifecycle: 'stable' }))

const lab = {
  id: 'p-gov-conformance',
  group: 'Governance and access',
  title: 'Governance blocks a new version',
  minutes: 15,
  scenario:
    'A developer of the store app team wants to publish version 1.4.0 of the Store App Experience API today. It adds returns at the till. Publish fails with a list of governance rules, and the developer asks you to take the API out of the profile so the release can go ahead. Find out what the profile asks for, fix the specification and publish.',
  start: () =>
    newPlatform({
      clock: at(1, 9),
      assets: [
        { assetId: ASSET, name: NAME, version: '1.3.0', apiVersion: 'v1', lifecycle: 'stable', raml: V130, t: at(-12, 10), team: 'Store app team', tags: ['Experience', 'Stores'] },
      ],
      projects: [{ id: 'p-store-app', name: NAME, assetId: ASSET, raml: DRAFT, updated: at(1, 8, 40), published: '1.3.0' }],
      governance: emptyGovernance(at(-5, 10), [PROFILE]),
      mail: [{ t: at(1, 8, 50), to: OPS, subject: 'Cannot publish Store App Experience API 1.4.0', body: 'Publish in Design Center fails with a list of governance rules. The release is this afternoon. Can you take our API out of the Experience API release gate profile for today?', source: 'Store app team' }],
    }),
  steps: [
    { title: 'Find the profile that blocks', how: 'Try Publish in Design Center on Store App Experience API and read the errors. Then open API Governance, Profiles. Experience API release gate has Blocks publishing set to Yes.', done: (s) => Boolean(s.seen['gov:profiles']) },
    { title: 'Read the issues of the draft', how: 'API Governance, APIs, Store App Experience API. The Design Center draft section runs the profile over the unpublished project and lists each failed rule with its location.', done: (s) => Boolean(s.seen[`gov:api:${ASSET}`]) },
    {
      ask: 'Which rules block the publish of 1.4.0?',
      title: 'Name the failed rules',
      options: [
        'Required Examples: the request body and the 201 response of POST /orders/{orderId}/returns have no example. OWASP: that operation declares no 401 and 403',
        'Anypoint Best Practices: a path holds a verb',
        'HTTPS Enforcement: the baseUri uses http',
        'Version 1.4.0 exists already in Exchange',
      ],
      right: 0,
      reason: 'The new operation is the only one that fails. GET /orders/{orderId} of 1.3.0 has its examples and its 401 and 403, so the old part of the API still passes.',
    },
    {
      ask: 'The developer wants the API out of the profile for today. Why do you say no?',
      title: 'Fix the spec, not the gate',
      options: [
        'The rules are advice, so it makes no difference',
        'The rules exist so consumers can mock the new call and know its 401 and 403 answers. Taking the API out hides the gap from the report, and 1.4.0 would stay that way, because a published version in Exchange cannot change',
        'Exchange deletes an API that leaves a profile',
        'API Manager stops the API instance',
      ],
      right: 1,
      reason: 'A gate that teams switch off when it is in the way checks nothing. The fix is a few lines of RAML and takes less time than the discussion.',
    },
    {
      title: 'Add the request example',
      how: 'Open Design Center, Store App Experience API. Under post of /returns, add an example to body, such as { "sku": "H-100", "reason": "DAMAGED" }.',
      done: (s) => !issuesOf(draftOf(s)).some((i) => i.rule === 'request-examples'),
    },
    {
      title: 'Add the response example and the 401 and 403',
      how: 'Under responses of the same post, add an example to the 201 body, such as { "returnId": "R-310" }, and declare 401 and 403 with a description. The problems bar stays at No problems.',
      done: (s) => draftOf(s).trim() !== '' && issuesOf(draftOf(s)).length === 0,
    },
    {
      title: 'Publish 1.4.0',
      how: 'Publish, Asset version 1.4.0, Publish to Exchange. Keep the profile as it is: it still blocks publishing and still selects the API.',
      done: (s) => latestOf(s, ASSET)?.version !== '1.3.0' && issuesOf(latestOf(s, ASSET).raml).length === 0 && gateKept(s),
    },
    {
      ask: 'Where does anypoint-cli-v4 governance:api:validate fit in a CI pipeline?',
      title: 'The governance CLI',
      options: [
        'After the deployment to Production, as a smoke test',
        'In the build, on the specification in the repository, before the publish to Exchange and the deployment. A rule with severity error ends the command with a non zero exit code, which stops the pipeline',
        'In API Manager, as a policy on the instance',
        'Only on the laptop of the architect',
      ],
      right: 1,
      reason: 'The command validates the API project against rulesets and returns an exit code, so any CI tool can fail the stage. Run it early: a spec that breaks a rule never reaches Exchange.',
    },
    {
      ask: 'The console already shows conformance. Why does the CLI matter in a pipeline?',
      title: 'Why the CLI',
      options: [
        'It does not: the console is enough',
        'In real Anypoint the console reports conformance after the publish and blocks nothing. The CLI turns the same rulesets into a gate on every change, with no one opening a screen, and the developer sees the failed rules in the build before the review',
        'The CLI has stricter rules than the console',
        'The CLI fixes the specification',
      ],
      right: 1,
      reason: 'The block in this lab is a lab option. In real Anypoint API Governance reports, notifies and shows the badge in Exchange. Enforcement comes from the pipeline, with the CLI.',
    },
  ],
  why: 'A governance profile states what every API of a kind must have. When a release meets it, fix the specification, not the profile: the rules protect the consumers, and a published version cannot change afterwards. In real Anypoint conformance is reported in API Governance and in Exchange, notifications go to the recipients of the profile, and the CLI command anypoint-cli-v4 governance:api:validate makes the rules a gate in CI by failing the build. The Block publishing switch of this lab is a lab option that shows the same gate inside Design Center.',
  docs: 'https://docs.mulesoft.com/api-governance/',
  solve(start) {
    let s = { ...start, seen: { ...start.seen, 'gov:profiles': start.clock, [`gov:api:${ASSET}`]: start.clock } }
    s = saveProject(s, 'p-store-app', FIXED)
    return publish(s, 'p-store-app', { assetId: ASSET, name: NAME, version: '1.4.0', apiVersion: 'v1', lifecycle: 'stable' }).state
  },
  answers: { 2: 0, 3: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
