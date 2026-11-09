import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-087',
  category: 'case-studies',
  title: 'Fintech Offering Banking-as-a-Service APIs to Partner Brands',
  level: 'ADVANCED',
  tags: ['fintech', 'banking', 'partner-apis', 'multi-tenant', 'api-management', 'webhooks', 'events', 'oauth'],
  estMinutes: 55,
  diagram: {
    task: 'draw the BaaS platform: partner brands entering through the gateway (tokens from the authorisation server), one partner Experience API over account and payment Process APIs, the ledger, KYC vendor and payment rails behind System APIs, ledger events published once, and partner webhooks delivered from a queue with a DLQ, never inside an API call.',
    checks: [
      { label: 'Partner brands call the API gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'Every call into the Experience API passes the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The gateway validates tokens with the authorisation server', rule: { type: 'link', from: 'api-gateway', to: 'identity-provider' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The core ledger is reached only through a System API', rule: { type: 'only-via', target: { type: 'saas', label: ['ledger'] }, from: 'system-api' } },
      { label: 'The payment rails are reached only through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Ledger changes are published once as events', rule: { type: 'edge', from: { type: 'system-api', label: ['ledger'] }, to: ['event-stream', 'topic'], kind: 'async' } },
      { label: 'Webhooks wait on a queue before they are sent to partners', rule: { type: 'path', from: ['event-stream', 'topic'], via: ['queue', 'cloud-queue'], to: { type: 'external-api', label: ['webhook'] } } },
      { label: 'No partner API call waits on a webhook delivery (no synchronous route to it)', rule: { type: 'no-path', from: 'experience-api', to: { type: 'external-api', label: ['webhook'] }, kind: 'sync' } },
      { label: 'Webhooks that keep failing end up on a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
    ],
    reference: diagram(
      {
        p: ['partner', 'Partner brands (40 apps)'],
        gw: ['api-gateway', 'Flex Gateway: client ID per partner, SLA tier, mTLS'],
        idp: ['identity-provider', 'Authorisation server (client credentials)'],
        exp: ['experience-api', 'exp-baas-partner-api'],
        pacc: ['process-api', 'prc-account-api'],
        ppay: ['process-api', 'prc-payment-api'],
        skyc: ['system-api', 'sys-kyc-api'],
        sled: ['system-api', 'sys-core-ledger-api'],
        spay: ['system-api', 'sys-payment-rails-api'],
        ev: ['event-stream', 'ledger-events (key = account ID)'],
        wh: ['process-api', 'prc-webhook-dispatcher'],
        cfg: ['cache', 'Partner webhook config'],
        pq: ['queue', 'webhooks.partner-{id}'],
        dlq: ['dlq', 'webhooks DLQ'],
        snd: ['process-api', 'prc-webhook-sender'],
        kyc: ['external-api', 'KYC vendor'],
        led: ['saas', 'Cloud core ledger'],
        rails: ['payment', 'Sponsor bank payment rails'],
        hook: ['external-api', 'Partner webhook endpoints'],
      },
      [
        'p -> gw', 'gw -> idp', 'gw -> exp', 'exp -> pacc', 'exp -> ppay', 'pacc -> skyc', 'pacc -> sled', 'ppay -> sled',
        'ppay -> spay', 'skyc -> kyc', 'sled -> led', 'spay -> rails', 'sled ~> ev', 'ev ~> wh', 'wh -> cfg',
        'wh ~> pq', 'pq ~> snd', 'snd -> hook', 'pq ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A licensed e-money fintech offers banking-as-a-service: 40 partner brands (a travel app, a freelancer platform, a gig economy marketplace) open accounts, issue IBANs and send payments for their own customers through its APIs. It plans 150 partners in two years.

**Platform today**
- A cloud core ledger (SaaS) with a REST API and a change feed.
- A KYC vendor and a sponsor bank that provides access to the payment rails.
- Each partner was integrated by hand. Two large partners have their own code paths, and a slow partner webhook endpoint once held up payment processing for everyone for 40 minutes.

**Requirements**
- One API product for all partners: accounts, KYC, payments, transactions, and webhooks for events (payment received, payment failed, account frozen).
- Strong isolation: a partner sees only its own customers and accounts.
- SLA tiers: 20, 100 or 500 requests per second.
- Webhooks are delivered at least once, signed, retried for 24 hours, and replayable by the partner.
- Peak 1,500 API requests per second across partners; 4 million ledger events a day.
- Regulators expect the fintech to show who accessed which customer data and when.

**Your task.** Design the BaaS integration platform, including tenancy, security and webhooks.
`,
  answerTemplate: `## API product and layers

## Tenancy and isolation

## Security and SLA tiers

## Events and webhooks

## Scaling and noisy partners

## Audit and regulatory evidence

## Risks
`,
  keyPoints: [
    'One versioned partner Experience API in front of account and payment Process APIs, with every backend (ledger, KYC, rails) behind its own System API.',
    'Partners authenticate with client credentials and mTLS at the gateway; the partner ID comes from the token and every query is filtered by it.',
    'SLA tiers are API Manager contracts with rate limits per client ID, so one partner cannot use another partner\'s capacity.',
    'Ledger changes are published once to an event stream; a dispatcher puts each partner\'s webhooks on that partner\'s own queue, so a slow endpoint only delays itself.',
    'Webhook sends are signed, retried with backoff for 24 hours, then moved to a DLQ, and partners can replay events by ID or time range.',
  ],
  solution: `
**Layers.** \`exp-baas-partner-api\` (v1, published in Exchange with a partner portal), \`prc-account-api\` (open account, run KYC, freeze), \`prc-payment-api\` (validate, check balance, send), System APIs for the ledger, KYC and payment rails.

**Tenancy.** Each partner has a client ID and a partner ID claim in its token. The Process APIs add the partner ID to every ledger query and reject any account ID that does not belong to the partner. Ledger accounts are tagged with the partner ID at creation.

**Security and tiers.** Client credentials plus mTLS at Flex Gateway; tokens validated against the authorisation server. API Manager SLA tiers set the request rate per partner. Payment endpoints require an idempotency key header.

**Events and webhooks.** \`sys-core-ledger-api\` reads the ledger change feed and publishes \`ledger-events\` keyed by account ID, so events for one account stay in order. \`prc-webhook-dispatcher\` looks up which partner owns the account and its endpoint, and puts the webhook on \`webhooks.partner-{id}\`. \`prc-webhook-sender\` signs the body with the partner's HMAC secret and posts it. Failures retry with exponential backoff for 24 hours, then go to the DLQ and the partner portal shows them. Partners can request a replay of events by time range.

**Noisy partners.** Per-partner queues and rate limits, a circuit breaker per partner endpoint, and separate replicas for webhook sending so API traffic is never affected.

**Audit.** Log the partner ID, client ID, customer ID and operation for every call to a separate audit store, with personal data masked in application logs.

**Risks.** Cross-tenant data leak (automated tests that call with one partner's token and another partner's IDs), event ordering across retries (sequence numbers in each webhook), and ledger API limits at peak (cache reads of balances for a few seconds, back off on 429).
`,
  followUps: [
    { q: 'Why one queue per partner for webhooks?', a: 'A slow or failing partner endpoint fills only its own queue. Other partners keep receiving their events on time.' },
    { q: 'How does a partner prove a webhook really came from you?', a: 'Each webhook carries an HMAC signature of the body and a timestamp. The partner recomputes it with its shared secret and rejects old or mismatched messages.' },
    { q: 'Where do you enforce that a partner sees only its own customers?', a: 'In the Process APIs, using the partner ID from the validated token on every lookup. The gateway checks identity, but data filtering needs business context.' },
    { q: 'At-least-once delivery means duplicates. How do partners cope?', a: 'Every webhook has a unique event ID. Partners store processed IDs and ignore repeats.' },
  ],
}
