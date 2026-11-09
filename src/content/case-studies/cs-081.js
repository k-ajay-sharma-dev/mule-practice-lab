import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-081',
  category: 'case-studies',
  title: 'Commercial Insurer Opening a Broker Portal and API for Mid-Term Policy Changes',
  level: 'INTERMEDIATE',
  tags: ['insurance', 'brokers', 'partner-apis', 'api-management', 'oauth', 'async', 'documents', 'legacy'],
  estMinutes: 45,
  diagram: {
    task: 'draw the broker channels: the portal and the broker platforms entering through the gateway (with the identity provider), two Experience APIs sharing one policy change Process API, the rating engine and the policy admin system behind System APIs, and policy documents produced asynchronously from a queue.',
    checks: [
      { label: 'The broker portal and the broker platforms both enter through the API gateway', rule: { type: 'each', of: ['web-app', 'partner'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'The gateway validates broker tokens with the identity provider', rule: { type: 'link', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'Portal and B2B Experience APIs share one policy change Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The policy admin system is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The rating engine is reached only through a System API', rule: { type: 'only-via', target: { type: 'saas', label: ['rating'] }, from: 'system-api' } },
      { label: 'Policy documents are generated from a queue', rule: { type: 'path', from: 'process-api', via: ['queue', 'topic', 'cloud-queue'], to: { type: 'saas', label: ['document'] } } },
      { label: 'A broker request never waits for document generation (no synchronous route to it)', rule: { type: 'no-path', from: 'experience-api', to: { type: 'saas', label: ['document'] }, kind: 'sync' } },
      { label: 'Every line into or out of the queue is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'cloud-queue'], kind: 'async' } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Broker portal'],
        brk: ['partner', 'Broker platforms (Acturis, Applied Epic)'],
        gw: ['api-gateway', 'API Manager: OAuth 2.0, client ID per firm'],
        idp: ['identity-provider', 'Broker identity (Okta)'],
        ep: ['experience-api', 'exp-broker-portal-api'],
        eb: ['experience-api', 'exp-broker-b2b-api'],
        prc: ['process-api', 'prc-policy-change-api'],
        q: ['queue', 'policy-documents.requests'],
        pdoc: ['process-api', 'prc-policy-documents'],
        srate: ['system-api', 'sys-rating-api'],
        spa: ['system-api', 'sys-policy-admin-api'],
        sdoc: ['system-api', 'sys-docgen-api'],
        rate: ['saas', 'Commercial rating engine'],
        pas: ['legacy', 'Policy admin system (IBM i)'],
        doc: ['saas', 'Document generation service'],
        store: ['file-store', 'Policy document store'],
      },
      [
        'portal -> gw', 'brk -> gw', 'gw -> idp', 'gw -> ep', 'gw -> eb', 'ep -> prc', 'eb -> prc',
        'prc -> srate', 'prc -> spa', 'prc ~> q', 'q ~> pdoc', 'pdoc -> sdoc', 'sdoc -> doc', 'sdoc -> store',
        'srate -> rate', 'spa -> pas',
      ],
    ),
  },
  description: `
**Context.** A commercial insurer writes property and liability cover for 90,000 small businesses, almost all through 1,200 broker firms. Brokers make about 6,000 mid-term changes a week: add a vehicle, change the sum insured, add a location.

**The problem today**
- Brokers email a change request. An underwriting assistant re-keys it into the policy admin system on IBM i, and the endorsement document is posted 5 to 8 days later.
- Large broker groups ask for an API so their broker platforms (Acturis, Applied Epic) can send changes without re-keying.
- Small brokers want a web portal.

**Systems**
- Policy admin system on IBM i, with RPG programs callable as web services. It handles about 25 calls per second.
- A SaaS commercial rating engine (REST, 300 ms average).
- A document generation SaaS that takes 5 to 40 seconds per endorsement pack.
- Okta for broker user identity.

**Goals**
- Simple changes (about 70%) are priced and bound online in under 1 minute; the rest are referred to an underwriter.
- The same rules apply in the portal and the API.
- Every broker firm can see only its own policies.
- The endorsement document is available within 10 minutes.

**Your task.** Design the integration for the portal and the broker API, including security, document generation and referrals.
`,
  answerTemplate: `## Channels and their needs

## Security and broker access

## API layers

## Quote, bind and referral

## Documents

## Risks
`,
  keyPoints: [
    'Two Experience APIs (portal and B2B) share one prc-policy-change-api, so pricing, referral rules and binding are the same for every channel.',
    'All broker traffic passes the API gateway: OAuth 2.0 tokens from the broker identity provider, a client ID per firm, and a rate limit per firm.',
    'Firm-level data access is enforced from the token claim (firm ID) in the Process API, not trusted from the request body.',
    'The rating engine and the IBM i policy admin system sit behind System APIs; the IBM i call rate is protected with a connection pool and a limit.',
    'Documents are requested through a queue after binding, so the broker gets the bind confirmation at once and the document link later by notification.',
  ],
  solution: `
**Channels.** The portal for small brokers, the B2B API for broker platforms. Both need: search my policies, quote a change, bind it, see documents.

**Security.** Portal users sign in with Okta; broker platforms use client credentials issued per firm. API Manager validates the OAuth token against Okta, applies client ID enforcement and a rate limit per firm (for example 5 requests per second). The firm ID comes from the token claim. The Process API filters every policy lookup by that firm ID, so a broker cannot read another firm's policy by guessing a number.

**Layers**
- \`exp-broker-portal-api\`: screens for the portal, paging, friendly errors.
- \`exp-broker-b2b-api\`: a versioned contract in Exchange for broker software houses.
- \`prc-policy-change-api\`: quote, bind, refer. Calls \`sys-rating-api\` for the premium and \`sys-policy-admin-api\` to apply the endorsement.
- \`prc-policy-documents\`: consumes \`policy-documents.requests\`, calls \`sys-docgen-api\`, stores the PDF and notifies the broker.

**Quote, bind and referral.** Quote: the Process API reads the policy, calls the rating engine, and returns a quote ID valid for 30 days. Bind: it applies the change on IBM i with the quote ID as the idempotency key. Rules (sum insured above a threshold, claims in the last year) refer the change to an underwriter's work queue instead of binding.

**Documents.** After bind the Process API publishes a document request and returns \`201\` with the endorsement number. The document flow generates the pack, stores it, and sends a notification with the link. A failed generation retries three times and then goes to a DLQ with an alert.

**Risks.** IBM i load at month-end (pool of 10 connections, queue bind requests if it is busy), broker platforms sending duplicate binds (idempotency on quote ID), and the B2B contract changing under software houses (semantic versioning, 6 month support for the old major version).
`,
  followUps: [
    { q: 'Why one Process API for two Experience APIs?', a: 'The pricing, referral and binding rules must be identical for the portal and the B2B channel. Keeping them in one Process API avoids two copies drifting apart.' },
    { q: 'How do you stop a broker reading another firm\'s policies?', a: 'Take the firm ID from the validated token claim and filter every lookup by it in the Process API. Never trust a firm ID sent in the request body.' },
    { q: 'Why not generate the document inside the bind call?', a: 'Generation takes up to 40 seconds and can fail on its own. Binding returns at once, and the document follows asynchronously with retries and a notification.' },
    { q: 'How do you protect the IBM i system from a burst of B2B traffic?', a: 'Rate limit per firm at the gateway, a bounded connection pool in the System API, and a queue for binds when the backend is saturated.' },
  ],
}
