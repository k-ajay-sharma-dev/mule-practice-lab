import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-054',
  category: 'use-cases',
  title: 'API-Led: Home Insurance Quote-and-Bind for Brokers and Aggregators',
  level: 'ADVANCED',
  tags: ['api-led', 'application-network', 'insurance', 'b2b', 'sla-tiers', 'guidewire'],
  estMinutes: 40,
  diagram: {
    task: 'draw the quote-and-bind application network: broker portal, aggregators and the migrated direct website with their Experience APIs, the quote and policy Process APIs, the System APIs and back ends, the rating cache and the async document path.',
    checks: [
      { label: 'Broker portal, aggregators and the direct website each call an Experience API (no more point-to-point)', rule: { type: 'each', of: ['web-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The quote Process API rates directly and never creates PolicyCenter submissions', rule: { type: 'no-edge', from: { type: 'process-api', label: ['quote'] }, to: { type: 'system-api', label: ['policycenter', 'guidewire'] } } },
      { label: 'Bind loads the guaranteed quote (reusing the quote store / quote API)', rule: { type: 'edge', from: { type: 'process-api', label: ['policy', 'bind'] }, to: { type: ['system-api', 'process-api'], label: ['quote'] } } },
      { label: 'All back ends sit behind System APIs', rule: { type: 'only-via', target: ['saas', 'legacy', 'external-api', 'payment', 'database'], from: 'system-api' } },
      { label: 'Rating / property results are cached to meet the 2 s aggregator SLA', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'cache' } },
      { label: 'PolicyBound is published asynchronously for document generation', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
    ],
    reference: diagram(
      {
        br: ['web-app', 'Broker portal'],
        agg: ['partner', 'Aggregators (x3)'],
        dw: ['web-app', 'Direct website'],
        eb: ['experience-api', 'exp-broker-portal'],
        ea: ['experience-api', 'exp-aggregator-quotes'],
        ed: ['experience-api', 'exp-direct-web'],
        pq: ['process-api', 'prc-home-quote'],
        pp: ['process-api', 'prc-home-policy'],
        pd: ['process-api', 'prc-policy-documents'],
        t: ['topic', 'PolicyBound'],
        cache: ['cache', 'Rating + property cache'],
        sqs: ['system-api', 'sys-quote-store'],
        srate: ['system-api', 'sys-rating-engine'],
        spc: ['system-api', 'sys-policycenter'],
        spay: ['system-api', 'sys-payments'],
        sdoc: ['system-api', 'sys-docgen'],
        qdb: ['database', 'Quote store'],
        rate: ['saas', 'Rating engine'],
        pc: ['legacy', 'Guidewire PolicyCenter (≈40 concurrent)'],
        psp: ['payment', 'Payment service provider'],
        doc: ['saas', 'Document generation'],
      },
      [
        'br -> eb', 'agg -> ea', 'dw -> ed', 'eb -> pq', 'eb -> pp', 'ea -> pq', 'ed -> pq', 'ed -> pp',
        'pq -> cache', 'pq -> srate', 'pq -> sqs', 'pp -> pq', 'pp -> sqs', 'pp -> spc', 'pp -> spay', 'pp ~> t', 't ~> pd', 'pd -> sdoc',
        'sqs -> qdb', 'srate -> rate', 'spc -> pc', 'spay -> psp', 'sdoc -> doc',
      ],
    ),
  },
  description: `
A property insurer wants to sell **home insurance** through two new channels, using one API network.

| Channel | Who | Needs | Volume |
|---|---|---|---|
| **Broker portal** (web) | 3,000 independent brokers' staff | Quote, adjust cover, **bind** (issue policy), download documents | ~4,000 quotes/day, 25% bind |
| **Aggregator partners** (3 price-comparison sites) | Partner systems | Very high-volume quote (prices shown in a comparison grid), then hand-off of the customer to buy | **~400,000 quotes/day**, peaks 120 quotes/s, conversion < 1% |
| (existing) **Direct website** | Consumers | Quote and buy — currently calls Guidewire directly through a point-to-point integration | ~20,000 quotes/day |

| System | Role | Interface | Notes |
|---|---|---|---|
| **Guidewire PolicyCenter** | Submissions, quotes, policies, bind | SOAP/Cloud API | Creating a submission ~2.5 s; max ~40 concurrent submissions |
| **Rating engine** (stand-alone, e.g. Earnix/Radar) | Prices risk | REST, ~250 ms | Licensed per call band |
| **Property data provider** | Rebuild cost, flood/subsidence risk per address | REST, paid per lookup | Data changes rarely |
| **Fraud & credit check** | Applicant check | REST, paid per call | Required only **at bind** |
| **Payment service provider** | Card/Direct Debit mandates | REST + webhooks | |
| **Document generation** | Policy schedule PDFs | REST, async | |

Constraints:
- Aggregator SLA: a price within **2 s at p95**, or the insurer is dropped from the grid.
- Each aggregator has a **commission and pricing agreement**: the price may differ per channel (channel loading).
- A quote is guaranteed for **30 days**; bind must use exactly the quoted price unless risk details changed.
- Broker portal: brokers bind on behalf of customers; commission recorded per broker.

**Questions:**
1. Decompose into APIs per layer (names, resources, consumers). Where does the existing direct website fit?
2. How do you meet the aggregator SLA without overloading PolicyCenter?
3. Describe the bind sequence (broker), including payment and documents.
4. How do you separate and protect consumers with very different volumes?
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Aggregator quote path (lightweight quote)

## Bind sequence

## Consumer isolation (SLA tiers, deployment)

## Reuse and migration of the direct website

## NFRs
`,
  keyPoints: [
    'Experience APIs per consumer type: exp-broker-portal, exp-aggregator-quotes (one shared, versioned partner contract + per-aggregator mappings), and later exp-direct-web replacing the point-to-point integration.',
    'Two Process APIs: prc-home-quote (price a risk: property data + rating + channel loading, persist a lightweight quote) and prc-home-policy (bind: re-validate, fraud/credit, PolicyCenter submission + bind, payment, documents).',
    'Aggregator quotes never create PolicyCenter submissions: they are rated directly via sys-rating-engine and stored in a quote store; a PolicyCenter submission is created only on bind/hand-off.',
    'Property data cached by address (UPRN) and rating results cached by risk hash to cut cost and latency; PolicyCenter protected by concurrency limits and queueing.',
    'Consumer isolation: SLA-based rate limiting per client, separate Experience API deployments/replicas for aggregators so their volume cannot starve brokers.',
    'Bind is a saga with idempotency: price guarantee check, fraud check, bind in PolicyCenter, payment mandate, async document generation and delivery.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-broker-portal** | \`POST /quotes\`, \`PATCH /quotes/{id}\`, \`POST /quotes/{id}/bind\`, \`GET /policies/{no}/documents\` | Broker shaping, broker ID/commission from token | Broker portal |
| Experience | **exp-aggregator-quotes** | \`POST /v1/home-quotes\`, \`GET /v1/home-quotes/{id}/handoff\` | Partner contract, per-aggregator field mapping and codes, deep-link generation | Aggregators (OAuth client each) |
| Experience | **exp-direct-web** (migration) | \`POST /quotes\`, \`POST /quotes/{id}/purchase\` | Replaces point-to-point integration | Direct website |
| Process | **prc-home-quote** | \`POST /quotes\`, \`GET /quotes/{id}\`, \`PATCH /quotes/{id}\` | Enrich address (property data), rate, apply channel loading/commission, store quote with 30-day guarantee | all Experience APIs |
| Process | **prc-home-policy** | \`POST /policies\` (from quoteId), \`GET /policies/{no}\` | Bind saga, re-validation, fraud/credit, PolicyCenter, payment, documents | broker, direct-web |
| Process | **prc-policy-documents** (event-driven) | consumes \`PolicyBound\` | Generate and deliver documents | — |
| System | **sys-policycenter** | \`POST /submissions\`, \`POST /submissions/{id}/quote\`, \`POST /submissions/{id}/bind\`, \`GET /policies/{no}\` | Wrap Guidewire; concurrency limit | prc-home-policy |
| System | **sys-rating-engine** | \`POST /ratings\` | Wrap rating engine | prc-home-quote |
| System | **sys-property-data** | \`GET /properties/{uprn}\`, \`GET /addresses?postcode=\` | Wrap provider, cache (TTL weeks) | prc-home-quote |
| System | **sys-fraud-credit** | \`POST /checks\` | Wrap provider | prc-home-policy |
| System | **sys-payments** | \`POST /mandates\`, \`POST /payments\` + webhook receiver | Wrap PSP | prc-home-policy |
| System | **sys-docgen** | \`POST /documents\` (async) | Wrap document generation | prc-policy-documents |
| System | **sys-quote-store** | \`POST /quotes\`, \`GET /quotes/{id}\` | Persistence of quotes (DB) | prc-home-quote, prc-home-policy |

\`\`\`
 [Broker portal]     [Aggregators x3]          [Direct website]
       |                   | (120 q/s)               |
 exp-broker-portal   exp-aggregator-quotes      exp-direct-web          Experience
       |             (own replicas, SLA tiers)       |
       +---------+---------+-----------+-------------+
                 v                     v
           prc-home-quote  <------  prc-home-policy --> [MQ: PolicyBound]  Process
           /     |      \\           /    |     |    \\         |
 sys-property sys-rating sys-quote  sys-fraud sys-policy sys-payments  prc-policy-documents
 -data        -engine    -store     -credit   center                       |
                                                                       sys-docgen    System
\`\`\`

**Aggregator quote path (meets 2 s).**
1. Aggregator → exp-aggregator-quotes \`POST /v1/home-quotes\`; Client ID + JWT policy identifies the aggregator; per-aggregator DataWeave mapping to canonical risk.
2. → prc-home-quote: sys-property-data by UPRN (cache hit for most addresses), sys-rating-engine (~250 ms). A **rating cache** keyed by a hash of the risk factors + channel avoids re-rating identical repeat requests (aggregators re-quote the same customer often).
3. Apply channel loading and commission from configuration (per aggregator), persist the quote in sys-quote-store (quote ID, price, risk hash, expiry +30 days). **No PolicyCenter call.**
4. Return price + quote ID + deep link. p95 dominated by rating ≈ 400–700 ms.

**Bind sequence (broker).**
1. Broker → exp-broker-portal \`POST /quotes/{id}/bind\` with payment details reference and \`Idempotency-Key\`.
2. → prc-home-policy \`POST /policies { quoteId, brokerId }\`.
3. Load quote from sys-quote-store: not expired, risk hash unchanged → **price guaranteed**; otherwise re-rate and require broker confirmation.
4. sys-fraud-credit check (paid; only at bind). Refer → status \`REFERRED\` to underwriters.
5. sys-policycenter: create submission, quote (with the guaranteed premium as an override/rating input as agreed with the Guidewire team), bind → policy number. Calls go through a **bounded concurrency** (max concurrency on the flow / queue in front) to respect the ~40 concurrent limit.
6. sys-payments: create mandate / take first payment. Failure → policy cancelled from inception (compensation) or bound with a payment-chase task, per business rule.
7. Publish \`PolicyBound\` to Anypoint MQ; return policy number. prc-policy-documents generates PDFs asynchronously and stores/sends them; the broker portal sees them when ready.

**Consumer isolation.**
- API Manager **SLA tiers**: aggregators e.g. 150 req/s each, brokers per-firm limits; Spike Control on System APIs.
- **exp-aggregator-quotes on its own replicas** (CloudHub 2.0 / RTF) and autoscaling, so an aggregator storm cannot exhaust capacity used by brokers.
- prc-home-quote scaled for the aggregate; caching makes cost and capacity proportional to *unique* risks.

**Reuse and migration.** The direct website's point-to-point integration is replaced by exp-direct-web, which reuses prc-home-quote and prc-home-policy — so all three channels share one rating path, one price-guarantee rule and one bind saga. Future products (landlord insurance) reuse sys-policycenter, sys-payments, sys-docgen, sys-fraud-credit.

**Errors and NFRs.**
- Rating engine down → aggregator gets a fast \`503\` (better than a timeout); brokers see "pricing unavailable".
- PolicyCenter slow/unavailable at bind → accept the bind request as \`202 PENDING\` and complete from a queue, notifying the broker (business must agree).
- Personal data minimised in logs; partner contracts use OAuth + mTLS; quote store encrypted at rest.
- Monitor per-aggregator latency and error rates — the aggregator SLA is commercially critical.
`,
  followUps: [
    { q: 'Why not create a PolicyCenter submission for every aggregator quote, like the direct website does today?', a: 'At 400,000 quotes/day with <1% conversion, PolicyCenter would be overloaded (2.5 s, ~40 concurrent) and fill with junk submissions. Rating directly and creating the submission only on bind is the standard pattern.' },
    { q: 'Each aggregator has a slightly different request format. One Experience API or three?', a: 'Usually one versioned Experience API with per-aggregator mapping modules if the operations are the same; split into separate APIs only if contracts, SLAs or release cycles really diverge.' },
    { q: 'How do you guarantee the bound price equals the quoted price if rates changed in between?', a: 'Store the quoted premium and a hash of the rating inputs with the quote; at bind, if inputs are unchanged and the quote has not expired, bind at the stored premium rather than re-rating.' },
    { q: 'Where does commission live?', a: 'Commission and channel loading are business rules in prc-home-quote (configuration per channel/partner), recorded on the quote and passed into PolicyCenter at bind so finance has one source.' },
  ],
}
