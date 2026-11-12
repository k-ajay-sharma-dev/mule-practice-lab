import { design, flow, handler, route, router, scope, source, step, subFlow } from '../../flow/dsl.js'

export default {
  id: 'fl-012',
  category: 'flows',
  title: 'OAuth 2.0 Client Credentials: Fetching and Caching Tokens',
  level: 'INTERMEDIATE',
  tags: ['oauth2', 'security', 'http-request', 'object-store', 'caching'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The Shipment System API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The token is read from a cache (Object Store or Cache scope) instead of fetched per request',
      rule: { type: 'exists', component: ['os-retrieve', 'cache'] },
    },
    { label: 'Token handling lives in a reusable sub-flow', rule: { type: 'flows', kind: 'sub-flow', min: 1 } },
    { label: 'Every Flow Reference points to an existing flow', rule: { type: 'refs' } },
    {
      label: 'The token endpoint (POST /oauth/token) is only called on a cache miss',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'http-request', where: { method: 'POST', path: 'token' }, within: ['choice', 'cache'] },
          {
            type: 'inside',
            component: 'http-request',
            where: { method: 'POST', path: 'token' },
            within: 'on-error-continue',
            withinWhere: { type: 'KEY_NOT_FOUND' },
          },
        ],
      },
    },
    {
      label: 'A fetched token is stored so other requests and replicas reuse it',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'http-request', firstWhere: { path: 'token' }, then: 'os-store' },
          { type: 'inside', component: 'http-request', where: { path: 'token' }, within: 'cache' },
        ],
      },
    },
    {
      label: 'A 401 from the carrier is caught in a Try around the business call',
      rule: { type: 'handler', component: ['on-error-continue', 'on-error-propagate'], errorType: 'HTTP:UNAUTHORIZED', within: 'try' },
    },
    {
      label: 'After a 401 the call is retried once with a fresh token, in On Error Continue',
      rule: {
        type: 'inside',
        component: 'http-request',
        where: { path: { not: 'token' } },
        within: 'on-error-continue',
        withinWhere: { type: 'UNAUTHORIZED' },
      },
    },
    {
      label: 'The 401 handler fetches a fresh token before the retry',
      rule: {
        type: 'inside',
        component: 'http-request',
        where: { path: 'token' },
        within: 'on-error-continue',
        withinWhere: { type: 'UNAUTHORIZED' },
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'create-shipment',
      why: 'A second 401 already propagates as an error by default. This handler only picks a nicer status and logs it.',
    },
  ],
  referenceFlow: design(
    flow(
      'create-shipment',
      source('http-listener', { path: '/shipments', allowedMethods: 'POST' }),
      [
        // target keeps the shipment request as the payload while the token sub-flow runs
        step('flow-ref', { name: 'get-carrier-token', target: 'tokenLookup' }),
        scope(
          'try',
          {},
          [step('http-request', { method: 'POST', path: '/v1/shipments', responseTimeout: 10000 })],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'HTTP:UNAUTHORIZED' }, [
                step('logger', { level: 'WARN', message: 'Carrier rejected token (401), refreshing once' }),
                step('flow-ref', { name: 'refresh-carrier-token', target: 'tokenLookup' }),
                step('http-request', { method: 'POST', path: '/v1/shipments', responseTimeout: 10000 }),
              ]),
            ],
          },
        ),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ shipmentId: payload.id, trackingNumber: payload.tracking_number }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:UNAUTHORIZED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[502]' }),
          step('logger', { level: 'ERROR', message: 'Carrier still returns 401 after token refresh' }),
        ]),
      ],
    ),
    subFlow('get-carrier-token', [
      // A null default counts as no default: Retrieve would raise OS:KEY_NOT_FOUND on a miss.
      step('os-retrieve', { key: 'carrierToken', defaultValue: '#[""]', objectStore: 'carrier-token-store' }),
      step('set-variable', { variableName: 'token', value: '#[payload]' }),
      router(
        'choice',
        {},
        [route({ expression: '#[isEmpty(vars.token)]' }, [step('flow-ref', { name: 'refresh-carrier-token' })])],
        { otherwise: [] },
      ),
    ]),
    subFlow('refresh-carrier-token', [
      step('transform', {
        script:
          '%dw 2.0\noutput application/x-www-form-urlencoded\n---\n{\n  grant_type: "client_credentials",\n  client_id: p("carrier.clientId"),\n  client_secret: p("secure::carrier.clientSecret")\n}',
      }),
      step('http-request', { method: 'POST', path: '/oauth/token', responseTimeout: 5000 }),
      step('set-variable', { variableName: 'token', value: '#[payload.access_token]' }),
      step('os-store', { key: 'carrierToken', value: '#[vars.token]', objectStore: 'carrier-token-store' }),
    ]),
  ),
  description: `
Your **Shipment System API** calls a carrier's REST API secured with **OAuth 2.0 client credentials**. Facts:
- Token endpoint: \`POST https://auth.carrier.example/oauth/token\`, tokens valid for **3600 s**.
- The carrier **rate-limits the token endpoint to 10 calls/hour** and blocks your client if exceeded.
- Your API handles ~50 req/s across **3 replicas**.
- Occasionally the carrier revokes tokens early, and calls start returning **401**.

**Design the flow(s):** how tokens are obtained, cached, reused, refreshed and how 401s are handled. Where do the client ID and secret live?
`,
  answerTemplate: `## Option A: connector-managed OAuth

## Option B: manual token flow

## Cache scope / expiry

## Handling 401 (revoked tokens)

## Secrets

## Multiple replicas
`,
  keyPoints: [
    'Preferred: HTTP Request config with the OAuth module client-credentials grant type, which obtains, stores and reuses the token automatically.',
    'Manual alternative: a token sub-flow that reads from an Object Store with a TTL shorter than the token lifetime (e.g. 3300 s) and only calls the token endpoint on a miss.',
    'A 401 from the API invalidates the cached token and retries the call once with a fresh token (no infinite loop).',
    'Client ID/secret are in secure (encrypted) properties, never hard-coded or logged.',
    'With 3 replicas, either accept one token per replica (3 calls/hour) or share the token via a shared Object Store to stay within the limit.',
  ],
  solution: `
**Option A – let the connector do it (preferred)**
1. HTTP Request configuration → *Authentication* → **OAuth Client Credentials** (\`oauth:client-credentials-grant-type\` from the OAuth module) with \`clientId\`, \`clientSecret\`, \`tokenUrl\`, \`scopes\`.
2. The module requests a token on first use, adds \`Authorization: Bearer …\` to every request and reuses it until it expires. A \`refreshTokenWhen\` expression (e.g. \`#[attributes.statusCode == 401]\`) tells it to fetch a new token when the API rejects the current one.

**Option B – manual token sub-flow (when the IdP is non-standard)**
1. Sub-flow \`get-carrier-token\`: **Object Store Retrieve** key \`carrierToken\` from an Object Store with \`entryTtl\` ≈ 55 min.
2. On miss (\`OS:KEY_NOT_FOUND\` handled with On Error Continue): HTTP Request \`POST tokenUrl\` with form body \`grant_type=client_credentials\` built in DataWeave (\`output application/x-www-form-urlencoded\`), then **Store** \`access_token\`.
3. Business call: HTTP Request with header \`Authorization: "Bearer " ++ vars.token\`.
4. **401 handling:** Try scope → On Error Continue for \`HTTP:UNAUTHORIZED\` → Object Store **Remove** \`carrierToken\` → fetch a new token → retry the call **once** (counter variable to prevent loops). Second 401 propagates as an error.

**Secrets:** \`clientSecret\` in a **secure properties** file (Secure Configuration Properties module, encrypted, key passed at deploy time) or a secrets manager; mark properties hidden in Runtime Manager; never log headers.

**Replicas:** each replica's in-memory cache means 3 token calls/hour — within the limit. If you scale further, use a shared/persistent Object Store so replicas share one token, and avoid a thundering herd when it expires.
`,
  followUps: [
    { q: 'Why not fetch a token per request?', a: 'It doubles latency, loads the IdP and here would exceed the 10/hour limit within seconds, getting your client blocked.' },
    { q: 'Why set the cache TTL shorter than the token expiry?', a: 'To avoid using a token that expires mid-flight due to clock skew or network latency; refreshing a few minutes early is safer.' },
    { q: 'How is this different from protecting your own API with OAuth?', a: 'That is inbound security — enforced by an API Manager policy (e.g. OAuth 2.0 / JWT validation) on your API. Here Mule is the OAuth client calling someone else.' },
  ],
}
