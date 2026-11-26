import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-045',
  category: 'architecture',
  title: 'Zero-Trust Security Between Internal APIs',
  level: 'EXPERT',
  tags: ['zero-trust', 'mtls', 'oauth2', 'service-identity', 'security'],
  estMinutes: 50,
  diagram: {
    task: 'draw the payment chain under zero trust: a customer channel, the gateway, an Experience API, a Payments Process API, a Payments System API and its backend. Add the identity provider that gives every app its own identity, and the low-value internal app from the penetration test.',
    checks: [
      { label: 'Customers reach an Experience API through the gateway', rule: { type: 'path', from: ['web-app', 'mobile-app'], via: 'api-gateway', to: 'experience-api' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Payments Process API calls the Payments System API', rule: { type: 'edge', from: { type: 'process-api', label: 'payment' }, to: { type: 'system-api', label: 'payment' } } },
      { label: 'Only the Payments Process API may call the Payments System API, so a compromised app cannot move money', rule: { type: 'only-via', target: { type: 'system-api', label: 'payment' }, from: { type: 'process-api', label: 'payment' } } },
      { label: 'Every Experience and Process API gets its own token from the identity provider (no shared credentials)', rule: { type: 'each', of: ['experience-api', 'process-api'], edgeTo: 'identity-provider' } },
      { label: 'The low-value internal app has its own identity with narrow scopes, not a shared secret', rule: { type: 'each', of: 'internal-app', edgeTo: 'identity-provider' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['legacy', 'database', 'oracle-db', 'sql-server', 'erp', 'payment', 'saas', 'external-api'] } },
      { label: 'API calls and token requests are sync calls', rule: { type: 'lines', from: ['web-app', 'mobile-app', 'internal-app', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'identity-provider', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer web app'],
        low: ['internal-app', 'Low-value internal app (own client, narrow scopes)'],
        gw: ['api-gateway', 'Gateway (OAuth, JWT validation)', { auth: 'jwt' }],
        idp: ['identity-provider', 'Enterprise IdP (one OAuth client per app)'],
        exp: ['experience-api', 'exp-banking-api (token exchange for the user)', { vCores: '0.5' }],
        prc: ['process-api', 'prc-payments-api', { vCores: '0.5' }],
        sys: ['system-api', 'sys-payments-api (allow-list: prc-payments-api only)', { vCores: '0.5' }],
        core: ['legacy', 'Core banking payments'],
      },
      ['web -> idp', 'web -> gw', 'gw -> exp', 'exp -> idp', 'exp -> prc', 'prc -> idp', 'prc -> sys', 'sys -> core', 'low -> idp'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 300, maxRps: 200 }],
      tests: [
        {
          name: 'Callers without a valid token',
          about: 'Customers with tokens make 40 payments a second while a script without a token tries 5 a second. The compromised low-value app tries to reach the Payments System API. Only the customers get through.',
          traffic: [
            { name: 'customers', from: 'web-app', rps: 40, to: 'legacy' },
            { name: 'no token', from: 'web-app', rps: 5, to: 'legacy', auth: 'none' },
            { name: 'compromised app', from: 'internal-app', rps: 5, to: { type: 'system-api', label: 'payment' } },
          ],
          expect: {
            answers: [{ flow: 'customers', minSuccess: 0.99 }, { flow: 'no token', minRefused: 0.99 }],
            notReached: [{ flow: 'compromised app', node: { type: 'system-api', label: 'payment' } }],
          },
        },
        {
          name: 'The identity provider is down',
          about: 'The IdP is down for the whole run. Tokens already issued are still valid, and the gateway checks their signature with cached keys, so customers keep paying.',
          traffic: [{ name: 'customers', from: 'web-app', rps: 40, to: 'legacy' }],
          incidents: [{ down: 'identity-provider' }],
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
        {
          name: 'Month-end payment peak',
          about: 'Customers make 120 payments a second for the whole run. Every payment is answered in under a second on average, within the 2 vCore budget.',
          traffic: [{ name: 'customers', from: 'web-app', rps: 120, to: 'legacy' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], vCores: { max: 2 } },
        },
      ],
    },
  },
  quiz: [
    {
      type: 'single',
      prompt: 'A pen-test shows that any app inside the private network can call the Payments System API, because it trusts every caller on the internal network. Under zero trust, which change closes the gap?',
      options: [
        'Move the Payments System API to its own subnet with tighter firewall rules',
        'Enforce OAuth at the edge gateway, so traffic inside the network is already checked',
        'Validate a token on every call to Payments, and check its audience and scopes',
        'Allow only the IP addresses of the Payments Process API replicas',
      ],
      answer: 2,
      explain: '"Internal" grants no trust: every call proves which app it comes from and what it may do. Validating a token with audience and scopes on Payments does that, so a compromised low-value app is refused. A tighter subnet and an IP allowlist are network controls; they stay as defence in depth, but any process on an allowed host could still call. Checking only at the edge leaves the internal hops open, which is what the pen-test found.',
    },
    {
      type: 'match',
      prompt: 'Match each mechanism to what it proves or protects.',
      pairs: [
        ['mTLS with workload certificates', 'Which workload is on the other end, plus an encrypted connection'],
        ['OAuth access token with audience and scopes', 'Which operations the calling service may perform on which API'],
        ['Token exchange / signed internal JWT with the user subject', 'Which end user the call is made for'],
        ['Network segmentation (private spaces, firewalls)', 'Limits reachability as an extra layer'],
      ],
      explain: 'They complement each other: mTLS authenticates the workload, scoped tokens authorise it, and a verifiable user token carries the end user for authorisation and audit.',
    },
    {
      type: 'single',
      prompt: 'How should the Payments System API learn which end user triggered a payment?',
      options: [
        'An `X-User-Id` header the Process API sets after it checks the user',
        'A verifiable token, from token exchange or a signed internal JWT',
        'A user id field in the payment request body, sent over mTLS',
        'The `sub` claim of the caller’s client credentials token',
      ],
      answer: 1,
      explain: 'Any internal caller could forge a header or a body field, even one the Process API sets in good faith, because Payments cannot verify it; mTLS proves which workload sent it, not which user. A client credentials token names the calling app, not the user. The audit requirement (`client_id` + `sub` + correlation id) needs a token that carries the user and can be verified downstream.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do services get their identity instead of the shared client ID/secret?',
      options: [
        'Each app gets its own OAuth client and short-lived, scoped tokens',
        'One OAuth client per environment, shared by all apps in it',
        'An API key per app, set once in its properties file',
        'One OAuth client per team, shared by the apps that team owns',
      ],
      answer: 0,
      explain: 'Each Mule app uses the client credentials grant to get short-lived JWTs with the target audience and scopes, and its secret is rotated automatically. Per-service identities make least privilege and revocation possible; a compromised app can only call what it is allowed to. A client shared per environment or per team still lets one leaked secret act as many apps. A static API key is long-lived and carries no scopes.',
    },
    {
      type: 'order',
      prompt: 'Order the rollout steps for 150 APIs.',
      items: [
        'Discover real call graphs (who calls whom) from analytics and logs',
        'Platform work: client provisioning, certificate rotation, policy templates, token client library',
        'Apply policies in audit/permissive mode and fix callers',
        'Enforce on Payments and other high-risk System APIs first',
        'Enforce on the remaining System and Process APIs',
      ],
      explain: 'Incremental rollout avoids stopping delivery: know the call graph, build the platform, observe before enforcing, and start where the risk is highest.',
    },
    {
      type: 'single',
      prompt: 'A team worries that validating a JWT on every hop will hurt latency. What is the right answer?',
      options: [
        'Validate the token only at the edge gateway',
        'Validate signatures locally with cached keys; avoid per-call introspection',
        'Introspect every token at the IdP, which is the most accurate check',
        'Switch to opaque tokens, which are shorter to send on each hop',
      ],
      answer: 1,
      explain: 'The expensive parts are fetching tokens and remote introspection, both avoidable; local JWT validation costs little. Validating only at the edge brings back the internal trust that zero trust removes. Introspecting every token adds a network call to the IdP on each hop. Opaque tokens cannot be checked locally, so each hop would need introspection.',
    },
  ],
  description: `
A financial services company has ~150 Mule APIs across CloudHub 2.0 (private spaces) and Runtime Fabric on-prem. Today:

- Experience APIs are protected with OAuth at the gateway.
- Process and System APIs inside the network have **no authentication** ("they are internal"), or a shared client ID/secret reused by all callers.
- Any app in the network can call the Payments System API directly.
- A penetration test showed that a compromised low-value app could call the Payments System API and move money.
- Auditors require knowing **which service and which end user** triggered each payment.
- Customers make about **40 payments a second**, and **120 a second** at month end. Core banking answers in about 300 ms.
- The identity provider has had short outages. Payments must keep working while it is down.
- The budget for the payment chain is **2 vCores**.

The CISO mandates a **zero-trust** model: "never trust the network; authenticate and authorize every call."

**Questions:**
- What does zero trust mean concretely for service-to-service calls in this landscape?
- How does each service get an identity, and how is it authenticated (mTLS, OAuth client credentials, signed tokens)?
- How do you authorize which service may call which API and operation?
- How do you propagate end-user identity through the chain for authorization and audit?
- How do you roll this out to 150 APIs without stopping delivery?
`,
  answerTemplate: `## Zero-trust principles applied

## Service identity and authentication

## Authorization model

## End-user identity propagation

## Rollout plan
`,
  keyPoints: [
    'Zero trust means every call is authenticated and authorized regardless of network location, with least privilege and continuous verification; network segmentation remains as defence in depth.',
    'Each service gets its own identity: an OAuth client (client credentials) and/or a workload certificate for mTLS; shared credentials are eliminated.',
    'mTLS authenticates the connection and encrypts traffic; OAuth access tokens (JWT) with scopes/audience express what the caller may do; together they are stronger than either alone.',
    'Authorization is enforced at each API (gateway policies plus in-app checks), based on caller identity and scopes per operation, with an allow-list of which clients may call sensitive System APIs.',
    'End-user identity is propagated as a verifiable token (token exchange or a signed internal token) rather than a plain header, so downstream services can authorize and audit on the real user.',
    'Rollout is incremental: inventory call graphs, enable policies in monitor/permissive mode, onboard critical APIs first, automate credential and certificate rotation.',
    'Validate JWTs locally at the gateway with cached signing keys. Token introspection (oauth2) on every request makes the IdP a single point of failure for payments.',
  ],
  solution: `
**Principles applied.**
- No implicit trust for "internal" callers; every request carries a verifiable identity.
- Least privilege per caller and per operation.
- Encrypt everything in transit.
- Assume breach: limit blast radius (a compromised app can only call what it is allowed to) and log every decision.

**Service identity and authentication.**
- Each Mule app gets **its own OAuth client** in the enterprise IdP (client credentials grant), credentials stored as secure properties / secrets manager entries and rotated automatically.
- Callers obtain short-lived access tokens (JWT) with the **audience** of the target API and **scopes** for the operations needed.
- **mTLS** between apps (CloudHub 2.0 and RTF ingress can be configured for TLS with client certificate validation; Flex Gateway also supports mTLS) using certificates from an internal CA with short lifetimes. mTLS proves the workload; the token proves the authorized client and scopes.
- Gateway policies on every Process/System API: **JWT validation** (issuer, audience, expiry, signature) and optionally client-ID enforcement; replace the shared client ID with one per consumer via API Manager contracts.

**Authorization.**
- Per API, a matrix: which clients may call which operations (e.g. only Payments Process API may call \`POST /payments\` on the Payments System API).
- Enforce coarse-grained at the gateway (scopes required per resource/method) and fine-grained in the app (e.g. amount limits, account ownership).
- Network policies/segmentation remain as an additional layer (private spaces, firewall rules), not the only one.

**End-user identity propagation.**
- Do not pass \`X-User-Id: 123\` as a plain header: any internal caller could forge it.
- Options: **OAuth token exchange** (the Experience API exchanges the user token for a downstream token that contains both user and service identity). Or the Experience API issues a **signed internal JWT** containing the user subject, which downstream APIs validate.
- Payments System API logs \`client_id\` (which service) + \`sub\` (which user) + correlation ID for every payment → satisfies the audit requirement.

**Rollout.**
1. **Discover** real call graphs (API analytics, logs): who calls whom.
2. Platform work: IdP client provisioning automation, certificate issuance/rotation, shared policy templates, a client library for token acquisition and caching.
3. Apply policies in **audit/permissive mode** first where possible (log unauthenticated calls), fix callers, then enforce.
4. Order: Payments and other high-risk System APIs first, then remaining System APIs, then Process APIs.
5. Make "authenticated by default" part of the API template and governance rules so new APIs are compliant from day one.
6. Monitor rejected calls and token errors; alert on spikes.

**Settings that matter.**
- The gateway uses **JWT validation**: it checks the signature with the IdP keys it has cached. Requests without a valid token are refused before they reach an API. Introspecting every token at the IdP would stop all payments during an IdP outage.
- The Payments System API has no route from the low-value app at all, and its allow-list accepts only the Payments Process API.
- Sizing: at 120 payments a second each of the three APIs needs more than 0.1 vCore. 0.5 vCore each is 1.5 vCores, inside the budget.
`,
  followUps: [
    { q: 'Does mTLS alone satisfy zero trust?', a: 'It authenticates the workload and encrypts traffic, but by itself says little about which operations the caller may perform or on behalf of which user. Combining mTLS with scoped tokens and user identity propagation gives authorization and audit.' },
    { q: 'Will validating a JWT on every hop hurt latency?', a: 'Local JWT signature validation with cached public keys (JWKS) is cheap; the expensive part is fetching tokens, which callers should cache until shortly before expiry. Introspection calls per request are the costly option to avoid on hot paths.' },
    { q: 'How do you handle batch jobs with no end user?', a: 'They run under their own service identity with narrowly scoped permissions, and audit logs record the job identity and run ID instead of a user.' },
  ],
}
