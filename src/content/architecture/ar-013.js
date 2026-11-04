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
      { label: 'Partners get their own Experience API', rule: { type: 'each', of: 'partner', edgeTo: 'experience-api' } },
      { label: 'At most two Experience APIs (shared digital + partner, no "lite" variants)', rule: { type: 'node', match: 'experience-api', min: 1, max: 2 } },
      { label: 'Exactly one System API per backend system (three in total)', rule: { type: 'node', match: 'system-api', min: 3, max: 3 } },
      { label: 'At most two Process APIs, and only ones that add value', rule: { type: 'node', match: 'process-api', min: 1, max: 2 } },
      { label: 'Process APIs orchestrate several System APIs rather than passing through', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Each backend is hidden behind its System API', rule: { type: 'only-via', target: ['crm', 'saas', 'legacy', 'erp', 'database'], from: 'system-api' } },
      { label: 'The mobile app reaches Salesforce end to end', rule: { type: 'path', from: 'mobile-app', to: 'crm' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web'],
        mob: ['mobile-app', 'Mobile app'],
        ptn: ['partner', 'Partners'],
        bo: ['internal-app', 'Back-office app'],
        edig: ['experience-api', 'exp-digital-channels-api'],
        eptn: ['experience-api', 'exp-partner-api'],
        p360: ['process-api', 'prc-customer-360-api'],
        pon: ['process-api', 'prc-customer-onboarding-api'],
        scrm: ['system-api', 'sys-crm-customer-api'],
        sbil: ['system-api', 'sys-billing-account-api'],
        snet: ['system-api', 'sys-network-subscription-api'],
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
  },
  description: `
A telecom company adopted API-led connectivity two years ago. An audit of Exchange shows:

- **180 APIs** for ~30 backend systems.
- Examples: \`sfdc-account-sapi\`, \`sfdc-account-v2-sapi\`, \`sfdc-contact-sapi\`, \`sfdc-account-contact-sapi\`, \`get-customer-by-email-papi\`, \`get-customer-by-phone-papi\`, \`mobile-customer-eapi\`, \`mobile-customer-lite-eapi\`.
- Many Process APIs simply **pass through** to one System API with no logic.
- Each API runs as its own app with 2 replicas → the vCore bill keeps growing; teams complain that finding the right API takes longer than building a new one.

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
`,
  followUps: [
    { q: 'Doesn\'t one bigger System API become a bottleneck for team autonomy?', a: 'It can if many teams change it. Keep each API owned by one team aligned to the system/domain; split when there are genuinely different owners or change rates, not per query.' },
    { q: 'How do you justify the consolidation effort to management?', a: 'Show the vCore cost of low-traffic apps, the duplicate maintenance effort and the time developers spend searching. Consolidation reduces run cost and makes future projects faster through real reuse.' },
    { q: 'Mobile really needs a smaller payload. Isn\'t a lite API justified?', a: 'Often a sparse fieldset (e.g. fields= or view= parameter) or a mobile-tuned Experience API representation solves it within one API. Create a separate Experience API only if security, aggregation or lifecycle differ.' },
  ],
}
