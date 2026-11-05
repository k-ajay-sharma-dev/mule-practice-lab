export default {
  id: 'ar-045',
  category: 'architecture',
  title: 'Zero-Trust Security Between Internal APIs',
  level: 'EXPERT',
  tags: ['zero-trust', 'mtls', 'oauth2', 'service-identity', 'security'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'What does zero trust mean for calls between internal APIs?',
      options: [
        'Remove network segmentation because it is no longer needed',
        'Every call is authenticated and authorised regardless of network location, with least privilege; segmentation stays as defence in depth',
        'Only Experience APIs need authentication',
        'All internal APIs share one strong client secret',
      ],
      answer: 1,
      explain: '"Internal" grants no trust. The pen-test showed why: any app in the network could call the Payments System API.',
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
        'A plain `X-User-Id` header set by the caller',
        'A verifiable token — OAuth token exchange or a signed internal JWT issued by the Experience API — validated downstream',
        'The client id of the calling app',
        'The source IP address',
      ],
      answer: 1,
      explain: 'Any internal caller could forge a plain header. The audit requirement (`client_id` + `sub` + correlation id) needs a token that can be verified.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do services get their identity instead of the shared client ID/secret?',
      options: [
        'Each Mule app gets its own OAuth client (client credentials) and obtains short-lived JWTs with the target audience and scopes; secrets are rotated automatically',
        'One client per environment shared by all apps',
        'Hard-coded API keys in each app',
        'IP allowlists only',
      ],
      answer: 0,
      explain: 'Per-service identities make least privilege and revocation possible; a compromised app can only call what it is allowed to.',
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
        'Validate only at the edge',
        'Local signature validation with cached JWKS keys is cheap; callers cache tokens until shortly before expiry; avoid per-request introspection on hot paths',
        'Use introspection on every call — it is the fastest',
        'Skip validation for GET requests',
      ],
      answer: 1,
      explain: 'The expensive parts are fetching tokens and remote introspection, both avoidable; local JWT validation costs little.',
    },
  ],
  description: `
A financial services company has ~150 Mule APIs across CloudHub 2.0 (private spaces) and Runtime Fabric on-prem. Today:

- Experience APIs are protected with OAuth at the gateway.
- Process and System APIs inside the network have **no authentication** ("they are internal"), or a shared client ID/secret reused by all callers.
- Any app in the network can call the Payments System API directly.
- A penetration test showed that a compromised low-value app could call the Payments System API and move money.
- Auditors require knowing **which service and which end user** triggered each payment.

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
- Do not pass \`X-User-Id: 123\` as a plain header — any internal caller could forge it.
- Options: **OAuth token exchange** (the Experience API exchanges the user token for a downstream token that contains both user and service identity). Or the Experience API issues a **signed internal JWT** containing the user subject, which downstream APIs validate.
- Payments System API logs \`client_id\` (which service) + \`sub\` (which user) + correlation ID for every payment → satisfies the audit requirement.

**Rollout.**
1. **Discover** real call graphs (API analytics, logs) — who calls whom.
2. Platform work: IdP client provisioning automation, certificate issuance/rotation, shared policy templates, a client library for token acquisition and caching.
3. Apply policies in **audit/permissive mode** first where possible (log unauthenticated calls), fix callers, then enforce.
4. Order: Payments and other high-risk System APIs first, then remaining System APIs, then Process APIs.
5. Make "authenticated by default" part of the API template and governance rules so new APIs are compliant from day one.
6. Monitor rejected calls and token errors; alert on spikes.
`,
  followUps: [
    { q: 'Does mTLS alone satisfy zero trust?', a: 'It authenticates the workload and encrypts traffic, but by itself says little about which operations the caller may perform or on behalf of which user. Combining mTLS with scoped tokens and user identity propagation gives authorization and audit.' },
    { q: 'Will validating a JWT on every hop hurt latency?', a: 'Local JWT signature validation with cached public keys (JWKS) is cheap; the expensive part is fetching tokens, which callers should cache until shortly before expiry. Introspection calls per request are the costly option to avoid on hot paths.' },
    { q: 'How do you handle batch jobs with no end user?', a: 'They run under their own service identity with narrowly scoped permissions, and audit logs record the job identity and run ID instead of a user.' },
  ],
}
