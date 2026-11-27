// The guided lab flex-gateway-policy. See platform-labs.js for the shape of a lab.
import { advance, apiById, at, MINUTE, mark, newPlatform, setApi } from '../platform.js'
import { ask, CLIENTS, OPS, policy, until } from '../platform-kit.js'
import { appliedOf, callsOf, FLEX, flexApi, IDP, jwtVerdict, newFlex, newGateway, OLD_IDP } from '../platform-flex.js'

const API = '19600201'
const NEW_JWKS = `${IDP}/oauth2/v1/keys`
const OLD_JWKS = `${OLD_IDP}/oauth2/keys`
const PARTNER = 'Partner Portal'
const api = (s) => apiById(s, API)
const applied = (s) => appliedOf(s, FLEX, api(s))?.policies ?? []
const jwtOk = (s) => {
  const p = applied(s).find((x) => x.type === 'jwt')
  return Boolean(p) && p.settings.validateAud !== 'No' && jwtVerdict(p.settings, 'partner').token === 'valid'
}
const orderOk = (s) => {
  const at_ = (type) => applied(s).findIndex((x) => x.type === type)
  const rl = at_('rate-limit')
  return rl >= 0 && at_('client-id') >= 0 && at_('jwt') >= 0 && at_('client-id') < rl && at_('jwt') < rl
}

const lab = {
  id: 'p-flex-gateway-policy',
  group: 'Runtime Fabric and gateways',
  title: 'A new JWT policy on Flex and every partner gets 401',
  minutes: 25,
  scenario: `The Partner Shipments API runs on the Flex Gateway ${FLEX} in the Harbor data center, in front of a .NET shipments service. At 07:00 a change added JWT Validation, so partners must send a token of the Harbor identity provider, and Rate Limiting, to protect the service from scanners. Since then partner calls fail with 401, and a few with 429. It is 08:10. Find out why and make the partner calls work again.`,
  start() {
    const clock = at(1, 6)
    let s = newPlatform({
      clock,
      clients: structuredClone(CLIENTS),
      apis: [
        flexApi(API, {
          name: 'Partner Shipments API', assetId: 'partner-shipments-api', label: 'flex', basePath: '/partner-shipments', upstream: 'http://shipments-svc.harbor.local:8080/api', consumer: 'https://flex-dc.harbor.example/partner-shipments', t: clock,
          policies: [policy('client-id')],
          contracts: [{ client: PARTNER, tier: '', status: 'approved', t: clock }],
        }),
      ],
      flex: newFlex({
        created: clock,
        gateways: { [FLEX]: newGateway(FLEX, { since: clock, lastSeen: clock }) },
        traffic: [
          { api: API, n: 6, ip: '198.51.100.7', client: PARTNER, jwt: 'partner', path: '/shipments?status=OPEN', ua: 'harbor-partner-portal/2.1' },
          // anonymous scanners from the internet, a burst every third minute
          { api: API, n: 30, every: 3, ip: '203.0.113.66', path: '/shipments', ua: 'python-requests/2.31' },
        ],
      }),
    })
    s = until(s, at(1, 7))
    // CHG 7 00: Rate Limiting first "to protect the service", then Client ID, then the JWT settings copied from an older API
    s = setApi(s, API, {
      policies: [
        policy('rate-limit', { requests: 20, periodMs: 60000, identifier: '(not configured)' }),
        policy('client-id'),
        { id: 'lab-jwt', type: 'jwt', settings: { origin: 'Bearer Authentication Header', signingMethod: 'RSA', keyOrigin: 'JWKS', jwksUrl: OLD_JWKS, jwksTtl: 60, validateAud: 'Yes', audiences: 'api://partner-orders', expMandatory: 'Yes' } },
      ],
    })
    s = until(s, at(1, 7, 40))
    s.mail.push(
      {
        t: at(1, 7, 20),
        to: OPS,
        subject: 'Reminder: the legacy sign on is retired',
        body: `Hello. Since 1 November all Harbor tokens are issued by ${IDP}. Its key set is published at ${NEW_JWKS}. The old ${OLD_IDP} does not issue tokens any more and its key set only holds the retired key. Partner tokens carry aud api://partner-shipments for the shipments API. Harbor identity team`,
        source: 'Harbor identity team',
      },
      {
        t: at(1, 7, 38),
        to: OPS,
        subject: 'Shipments API answers 401 since 07:00',
        body: 'Our portal calls the Partner Shipments API with a fresh token from the Harbor identity provider and the client ID you gave us, as always. Since about 07:00 every call answers 401 Unauthorized, and a few 429 Too Many Requests. Our drivers cannot see their open shipments. Please fix it soon. Partner integration team',
        source: 'Partner Portal',
      },
    )
    return until(s, at(1, 8, 10))
  },
  steps: [
    { title: 'Read the mail of the partner', how: 'Open the Inbox from the menu under Lab tools. Read the mail of the identity team as well.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: `Open the logs of ${FLEX}`,
      how: `Flex Gateway, Flex Gateways, ${FLEX}, Logs. Look at the access lines of /partner-shipments and the jwt-validation-flex lines before them.`,
      done: (s) => Boolean(s.seen['flex-logs']),
    },
    {
      title: 'Look at the policies the gateway runs',
      how: `Flex Gateway, ${FLEX}, APIs. The list shows the policies of the applied configuration in their order, with the JWKS Url and the audience of JWT Validation.`,
      done: (s) => Boolean(s.seen['flex-apis']),
    },
    ask(
      'Why every token fails',
      'The partner sends a valid, fresh token. Why does JWT Validation answer 401?',
      [
        'The token has expired before it reached the gateway',
        `The policy fetches its keys from ${OLD_JWKS}, the key set of the retired identity provider. The token is signed with key hid-2026-11, which only ${NEW_JWKS} publishes, so the signature cannot be validated. The audience value api://partner-orders was copied from another API and does not match the token either`,
        'Flex Gateway cannot validate RSA tokens',
        'Client ID Enforcement rejects the token',
      ],
      1,
      'JWT Validation with JWKS takes the kid of the token header and looks for that key in the key set it downloaded. A key set of the wrong identity provider has no such key, so every signature fails with 401. Claim checks such as the audience come after the signature, so the second problem shows only once the first is fixed.',
    ),
    {
      title: 'Fix the JWT Validation settings',
      how: `API Manager, Partner Shipments API, Policies, JWT Validation, Edit configuration. Set the JWKS Url and the Audience Claim Values to what the identity team wrote, keep Validate Audience Claim on Yes, then Apply. Move the clock a minute: the gateway polls API Manager and applies the new version.`,
      done: jwtOk,
    },
    ask(
      'Why partners still get 429',
      'With a good token most partner calls answer 200, but every third minute some answer 429. The partner sends only 6 calls a minute and the limit is 20. Why?',
      [
        'The limit counts per replica',
        'Policies run in the order of the list. Rate Limiting runs first and counts every request, also the burst of anonymous scanner calls that Client ID Enforcement rejects later. The scanners use the quota, and the partner calls after them get 429. Put the authentication policies first, so only known clients spend the quota',
        'Rate Limiting always runs last on Flex Gateway',
        'The window of Rate Limiting is per partner',
      ],
      1,
      'A rejected request stops the chain, so a cheap check that rejects bad traffic early protects the policies after it. Rate Limiting before authentication lets anyone use up the quota of the real clients, which is a denial of service by design. A Rate Limiting identifier on the client ID would also split the quota, but anonymous calls still share one group.',
    ),
    {
      title: 'Put Rate Limiting after the authentication policies',
      how: 'API Manager, Partner Shipments API, Policies, Reorder policies. Move Rate Limiting down with the arrow until Client ID Enforcement and JWT Validation are above it, then Apply order. Move the clock a minute so the gateway applies it.',
      done: orderOk,
    },
    {
      title: 'Watch the partner calls',
      how: `Move the clock 10 minutes. The Logs of ${FLEX} show 200 for every call of the partner, and 401 for the scanners.`,
      done: (s) => {
        const mine = callsOf(s, API, s.clock - 8 * MINUTE).filter((c) => c.c === PARTNER)
        return jwtOk(s) && orderOk(s) && mine.length >= 30 && mine.every((c) => c.s === 200)
      },
    },
    ask(
      'Flex Gateway or a Mule gateway',
      'A colleague asks why this API is on Flex Gateway and not behind an API proxy, a Mule application in API Manager. What is the difference?',
      [
        'There is none, Flex Gateway is a Mule runtime',
        'Flex Gateway is a lightweight Envoy based gateway that runs on a Linux host, Docker or Kubernetes, close to any service. It is managed from API Manager in Connected Mode or with YAML in Local Mode. An API proxy is a Mule application on a Mule runtime, with Mule Gateway policies, a heavier footprint and the full Mule toolset for mediation. For a non Mule service in the data center Flex is the usual choice',
        'Only an API proxy can enforce JWT Validation',
        'Flex Gateway works only on CloudHub',
      ],
      1,
      'Both are managed in API Manager and share most policy types, but they are configured per runtime: the Flex versions of the policies have their own settings. Flex starts fast, uses little memory and fits as a sidecar or ingress. A Mule proxy suits APIs that need Mule logic such as transformation or orchestration in the gateway.',
    ),
  ],
  why: 'Flex Gateway runs the policies of an API in the order of the list in API Manager, and a request that a policy rejects goes no further. JWT Validation with a JWKS key origin checks the signature with the keys at the JWKS Url, then the claims such as the audience, so a key set of the wrong identity provider fails every token with 401. Rate Limiting counts every request that reaches it, so it belongs after the policies that reject unknown callers. In Connected Mode a change in API Manager is a new configuration version that the gateway applies on its next poll. In the lab the gateway polls once a lab minute and the scanner burst comes every third minute.',
  docs: 'https://docs.mulesoft.com/gateway/latest/',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), 'flex-logs'), 'flex-apis')
    s = setApi(s, API, { policies: api(s).policies.map((p) => (p.type === 'jwt' ? { ...p, settings: { ...p.settings, jwksUrl: NEW_JWKS, audiences: 'api://partner-shipments' } } : p)) })
    s = advance(s, MINUTE)
    const rank = { 'client-id': 0, jwt: 1, 'rate-limit': 2 }
    s = setApi(s, API, { policies: [...api(s).policies].sort((a, b) => rank[a.type] - rank[b.type]) })
    return advance(s, 10 * MINUTE)
  },
  answers: { 3: 1, 5: 1, 8: 1 },
}

export const LABS = [lab]
