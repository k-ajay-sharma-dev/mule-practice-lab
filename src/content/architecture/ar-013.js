import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-013',
  category: 'architecture',
  title: 'API Granularity and Avoiding API Sprawl',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'granularity', 'api-sprawl', 'reuse'],
  estMinutes: 25,
  diagram: {
    task: 'draw the consolidated target structure for the Customer domain (Salesforce CRM, billing, network subscriptions) serving web, mobile and partners, with no pass-through or per-query APIs.',
    checks: [
      { label: 'Web and mobile both call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Partners get their own Experience API', rule: { type: 'each', of: 'partner', edgeTo: { type: 'experience-api', label: ['partner', 'b2b'] } } },
      { label: 'At most two Experience APIs (shared digital + partner, no "lite" variants)', rule: { type: 'node', match: 'experience-api', min: 1, max: 2 } },
      { label: 'Exactly one System API per backend system (three in total)', rule: { type: 'node', match: 'system-api', min: 3, max: 3 } },
      { label: 'At most two Process APIs, and only ones that add value', rule: { type: 'node', match: 'process-api', min: 1, max: 2 } },
      { label: 'Process APIs orchestrate several System APIs rather than passing through', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Each backend is hidden behind its System API', rule: { type: 'only-via', target: ['crm', 'saas', 'legacy', 'erp', 'database'], from: 'system-api' } },
      { label: 'The mobile app reaches Salesforce end to end over sync calls', rule: { type: 'path', from: 'mobile-app', to: 'crm', kind: 'sync' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Every Process API combines at least two System APIs, so none is a pass-through', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 2 } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['crm', 'saas', 'legacy', 'erp', 'database'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'mobile-app', 'partner', 'internal-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web'],
        mob: ['mobile-app', 'Mobile app'],
        ptn: ['partner', 'Partners'],
        bo: ['internal-app', 'Back-office app'],
        edig: ['experience-api', 'exp-digital-channels-api', { replicas: 2, vCores: '0.2' }],
        eptn: ['experience-api', 'exp-partner-api', { replicas: 2, vCores: '0.1', auth: 'client-id' }],
        p360: ['process-api', 'prc-customer-360-api', { replicas: 2, vCores: '0.2', calls: 'in parallel', timeoutMs: 2000, circuitBreaker: 'on', onFailure: 'partial answer' }],
        pon: ['process-api', 'prc-customer-onboarding-api', { replicas: 2, vCores: '0.2' }],
        scrm: ['system-api', 'sys-crm-customer-api', { replicas: 2, vCores: '0.2' }],
        sbil: ['system-api', 'sys-billing-account-api', { replicas: 2, vCores: '0.2' }],
        snet: ['system-api', 'sys-network-subscription-api', { replicas: 2, vCores: '0.2' }],
        sf: ['crm', 'Salesforce'],
        bil: ['saas', 'Billing platform'],
        net: ['legacy', 'Network subscription system'],
      },
      [
        'web -> edig', 'mob -> edig', 'ptn -> eptn',
        'edig -> p360', 'edig -> pon', 'eptn -> p360',
        'p360 -> scrm', 'p360 -> sbil', 'p360 -> snet',
        'pon -> scrm', 'pon -> sbil', 'pon -> snet',
        'bo -> scrm',
        'scrm -> sf', 'sbil -> bil', 'snet -> net',
      ],
    ),
    simulation: {
      systems: [
        { match: 'crm', latencyMs: 250 },
        { match: 'saas', latencyMs: 200 },
        { match: 'legacy', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'Busy hour on a 3 vCore budget',
          about: 'Web sends 20 customer requests a second, mobile 20 and partners 10, for ten minutes. All of them are answered, and the whole domain uses at most 3 vCores.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 20, to: ['crm', 'saas', 'legacy'] },
            { name: 'mobile', from: 'mobile-app', rps: 20, to: ['crm', 'saas', 'legacy'] },
            { name: 'partners', from: 'partner', rps: 10, to: ['crm', 'saas', 'legacy'] },
          ],
          expect: { answers: [{ minSuccess: 0.99 }], vCores: { max: 3 } },
        },
        {
          name: 'A zone goes down at the busy hour',
          about: 'One availability zone is lost for the whole run. Every API must keep a replica in another zone, so customers are still answered.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 20, to: ['crm', 'saas', 'legacy'] },
            { name: 'mobile', from: 'mobile-app', rps: 20, to: ['crm', 'saas', 'legacy'] },
            { name: 'partners', from: 'partner', rps: 10, to: ['crm', 'saas', 'legacy'] },
          ],
          incidents: [{ zone: true }],
          expect: { answers: [{ minSuccess: 0.97 }] },
        },
        {
          name: 'Partners need a client id',
          about: 'Partners with their client id send 10 requests a second. A caller without one sends 5 a second and must be refused at the partner API.',
          traffic: [
            { name: 'partners', from: 'partner', rps: 10, to: ['crm', 'saas', 'legacy'] },
            { name: 'no client id', from: 'partner', rps: 5, to: ['crm', 'saas', 'legacy'], auth: 'none' },
          ],
          expect: { answers: [{ flow: 'partners', minSuccess: 0.99 }, { flow: 'no client id', minRefused: 0.99 }] },
        },
        {
          name: 'The network system hangs',
          about: 'The network subscription system stops answering. Partners still get the customer view within a second, without the subscription part.',
          traffic: [{ name: 'partners', from: 'partner', rps: 10, to: ['crm', 'saas', 'legacy'] }],
          incidents: [{ hang: 'legacy' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }] },
        },
      ],
    },
  },
  description: `
A telecom company adopted API-led connectivity two years ago. An audit of Exchange shows:

- **180 APIs** for ~30 backend systems.
- Examples: \`sfdc-account-sapi\`, \`sfdc-account-v2-sapi\`, \`sfdc-contact-sapi\`, \`sfdc-account-contact-sapi\`, \`get-customer-by-email-papi\`, \`get-customer-by-phone-papi\`, \`mobile-customer-eapi\`, \`mobile-customer-lite-eapi\`.
- Many Process APIs simply **pass through** to one System API with no logic.
- Each API runs as its own app with 2 replicas → the vCore bill keeps growing; teams complain that finding the right API takes longer than building a new one.

For the consolidated Customer domain, plan for these numbers:
- At the busy hour web sends 20 customer requests a second, mobile 20 and partners 10.
- Salesforce answers in about 250 ms, billing in 200 ms and the network subscription system in 400 ms. The network system sometimes stops answering; partners should then still get the customer view within a second, without the subscriptions.
- Partners must present a client id. Callers without one are refused.
- The APIs must survive the loss of one availability zone.
- The budget for the whole domain is 3 vCores.

**Questions:**
- What went wrong, and what *should* decide the boundary and size of an API?
- How many System/Process/Experience APIs would you aim for in the Customer domain? Give a concrete target structure.
- When is it acceptable to skip a layer?
- How do you consolidate without breaking current consumers?
`,
  answerTemplate: `## Diagnosis

## Principles for API boundaries

## Target structure for the Customer domain

## When to skip a layer

## Consolidation plan
`,
  keyPoints: [
    'APIs were cut by operation/query or by consumer instead of by business capability/resource, producing many tiny overlapping APIs.',
    'A System API is per system (or system + business entity group), exposing resources like /accounts and /contacts with query parameters — not one API per query.',
    'A Process API must add value (orchestration, rules, aggregation across systems); a pass-through Process API is removed or merged.',
    'Experience APIs exist only when a channel truly needs a different shape/security; otherwise channels share one, or use field selection/query parameters.',
    'Consolidation uses facade/redirect: new consolidated APIs, old ones deprecated with a sunset date, consumers migrated using analytics; deployment can also co-locate small APIs to save vCores.',
    'Seven small APIs at 2 replicas of 0.1 or 0.2 vCore survive a zone outage and stay near 2.6 vCores, inside the 3 vCore budget.',
    'The partner API enforces client ids, and the Customer 360 API uses a short timeout, a circuit breaker and a partial answer when the network system hangs.',
  ],
  solution: `
**Diagnosis.** APIs were cut by **operation** (\`get-customer-by-email\`), by **version as a new asset** (\`-v2-sapi\`) and by **consumer variant** (\`-lite\`). The layers were applied mechanically ("every flow needs three APIs"), so Process APIs became pass-throughs. Result: sprawl, duplicate logic, and discovery cost higher than build cost — the opposite of reuse.

**Principles.**
- Size by **business capability and resource**, not by query. One API = a cohesive set of resources owned by one team.
- **System API:** one per system and domain area — e.g. *Salesforce Customer SAPI* with \`/accounts\`, \`/accounts/{id}/contacts\`, \`/contacts?email=&phone=\`. Search variants are **query parameters**.
- **Process API:** only when there is **orchestration, aggregation or business rules** across systems (e.g. a 360° customer view combining CRM + billing + network).
- **Experience API:** only when a channel needs a **different contract** (shape, auth model, aggregation for a slow mobile network). Use field selection or a \`view=summary\` parameter instead of a "lite" API.
- Versions are **versions of the same asset**, not new assets.

**Target for Customer domain** (example):
- System: *CRM Customer SAPI* (Salesforce), *Billing Account SAPI*, *Network Subscription SAPI* — 3.
- Process: *Customer 360 PAPI* (aggregate view + rules), *Customer Onboarding PAPI* (orchestrates creation across systems) — 2.
- Experience: *Digital Channels EAPI* (web + mobile share it), *Partner EAPI* (different security/contract) — 2.

≈ 7 APIs instead of ~25 in this domain.

**Skipping a layer.** Acceptable when a consumer needs exactly what a System API offers and there is no orchestration — e.g. an internal back-office app calling the CRM SAPI directly through the gateway. Document it; add the Process layer when logic appears. Do not create empty layers "for the future".

**Consolidation plan.**
1. Inventory with **API Manager analytics**: which APIs have traffic, which consumers.
2. Build the consolidated APIs; old APIs become thin facades or are kept unchanged but **deprecated** in Exchange with a sunset date.
3. Migrate consumers domain by domain, starting with the highest cost/lowest traffic.
4. Short term cost relief: low-traffic APIs can run on smaller replicas, and a single app can host several related API instances — trade-off: shared deployment/blast radius.
5. Prevent recurrence: design review via the C4E/architecture board before a new API asset is created; naming standards; "search Exchange first".

**Sizing and failure handling**
- Every API runs 2 replicas, so a zone outage leaves one in another zone. The System APIs and Process APIs get 0.2 vCore per replica because each System API carries the reads of both Process APIs. The partner API stays at 0.1. The total is 2.6 vCores, inside the 3 vCore budget. The old 180 APIs at 2 replicas each could never fit it.
- The partner Experience API enforces client id, which is one reason partners get their own API.
- The Customer 360 Process API calls its System APIs in parallel, with a 2 s timeout and a circuit breaker. When the network system hangs it answers with the account and billing data and leaves out the subscriptions.
`,
  followUps: [
    { q: 'Doesn\'t one bigger System API become a bottleneck for team autonomy?', a: 'It can if many teams change it. Keep each API owned by one team aligned to the system/domain; split when there are genuinely different owners or change rates, not per query.' },
    { q: 'How do you justify the consolidation effort to management?', a: 'Show the vCore cost of low-traffic apps, the duplicate maintenance effort and the time developers spend searching. Consolidation reduces run cost and makes future projects faster through real reuse.' },
    { q: 'Mobile really needs a smaller payload. Isn\'t a lite API justified?', a: 'Often a sparse fieldset (e.g. fields= or view= parameter) or a mobile-tuned Experience API representation solves it within one API. Create a separate Experience API only if security, aggregation or lifecycle differ.' },
  ],
}
