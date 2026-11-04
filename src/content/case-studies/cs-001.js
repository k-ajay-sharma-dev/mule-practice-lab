export default {
  id: 'cs-001',
  category: 'case-studies',
  title: 'Retailer Moving Off Point-to-Point Integrations',
  level: 'ADVANCED',
  tags: ['api-led', 'migration', 'governance'],
  estMinutes: 40,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the first six months of the programme in the right order.',
      items: [
        'Catalogue every integration (source, target, frequency, owner, pain) and pick 2–3 painful pilots',
        'Build System APIs for ERP and CRM and set standards (spec-first in Exchange, error model, CI/CD) with a small C4E',
        'Re-implement the pilots on Process APIs that use the new System APIs',
        'Run old and new in parallel and compare outputs',
        'Switch traffic to the new flow and retire the old point-to-point link',
      ],
      explain: 'Discover first, then lay the reusable foundations, then strangle one integration at a time: rebuild, run in parallel, switch, retire. Retiring before a parallel run removes your safety net.',
    },
    {
      type: 'single',
      prompt: 'Which assets should the team build first to unlock the CIO goals of speed and reuse?',
      options: [
        'System APIs for the core systems (ERP products/orders/stock, CRM customers)',
        'An Experience API for the new loyalty app',
        'A full canonical data model for every entity before any API is built',
        'A one-off rewrite of all 40 integrations on Mule',
      ],
      answer: 0,
      explain: 'System APIs for the core systems are what every later integration (web shop, loyalty app) reuses. A complete canonical model up front is a classic analysis-paralysis trap, and rewriting everything is the big bang the CIO ruled out.',
    },
    {
      type: 'single',
      prompt: 'Stores must keep trading. How do you move from point-to-point to APIs?',
      options: [
        'Strangler pattern: route one integration at a time to the new APIs, run in parallel, then retire the old link',
        'Big-bang cutover on a quiet weekend with all integrations switched at once',
        'Leave the old integrations running forever and only use APIs for new projects',
        'Freeze all changes for six months while the new platform is built',
      ],
      answer: 0,
      explain: 'The strangler pattern replaces integrations incrementally with a parallel run and rollback option per integration. Leaving the old links forever never removes the fragility that caused the problem.',
    },
    {
      type: 'multi',
      prompt: 'Which governance practices belong in this programme?',
      options: [
        'Every new integration starts by searching Exchange for an existing API',
        'API specs (RAML/OAS) published in Exchange before implementation',
        'Policies such as client ID enforcement and rate limiting applied centrally',
        'Track reuse count and integration lead time as KPIs',
        'Each project team chooses its own error format and logging style',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Discovery in Exchange, spec-first design, central policies and measured KPIs make reuse real and prove the 3-weeks goal. Letting each team pick its own error model is how the point-to-point mess started.',
    },
    {
      type: 'match',
      prompt: 'Match each programme risk to its mitigation.',
      pairs: [
        ['Double writes during the parallel run', 'One system of record per entity'],
        ['Team lacks MuleSoft skills', 'Pair with an experienced partner at the start'],
        ['Pilots keep growing', 'Strict, agreed pilot scope'],
      ],
      explain: 'Parallel runs are safe only when one system owns each entity; skills gaps close fastest by pairing; scope creep is controlled by a tight pilot scope.',
    },
    {
      type: 'single',
      prompt: 'How do you show the CIO that the loyalty app goal (reuse what the web shop uses) has been met?',
      options: [
        'The loyalty app is built on the same Customer and Order APIs, and the reuse count in Exchange/API Manager shows it',
        'The loyalty app gets its own copies of the ERP and CRM integrations so it is independent',
        'Count the number of Mule applications deployed',
        'Measure CPU usage of the Mule workers',
      ],
      answer: 0,
      explain: 'Reuse means a second consumer on the same APIs, visible as a reuse metric. Building separate copies for the loyalty app recreates point-to-point, and app counts or CPU say nothing about reuse.',
    },
  ],
  description: `
**Context.** A mid-size retailer has 40+ point-to-point integrations built over 10 years (scripts, ETL jobs, direct DB links) between POS, ERP, WMS, CRM and the web shop. Every change breaks something; nobody knows the full picture.

**Goals from the CIO**
- Cut time to deliver a new integration from ~3 months to ~3 weeks.
- No big-bang cutover — stores must keep trading.
- Reuse: the new loyalty app should reuse what the web shop uses.

**Your task.** Propose an approach for the first 6 months: what you build first, how you migrate, and how you govern it.
`,
  answerTemplate: `## First 6 months — what to build first

## Migration approach

## Governance and reuse

## Risks
`,
  keyPoints: [
    'Start with an inventory/map of existing integrations and pick high-value, high-pain candidates.',
    'Build System APIs for core systems (ERP, POS, CRM) first — they unlock reuse.',
    'Strangler pattern: route one integration at a time to the new APIs; run in parallel, then retire.',
    'Publish APIs in Exchange with standards (RAML/OAS, naming, error model) — a C4E or similar team.',
    'Measure reuse and delivery time to prove the goals.',
    'Risks: data consistency during parallel run, skills gap, scope creep.',
  ],
  solution: `
**Month 0–1: discover.** Catalogue every integration (source, target, frequency, owner, pain). Choose 2–3 pilots that hurt most *and* touch core systems.

**Month 1–3: foundations.** Build **System APIs** for ERP (products, orders, stock) and CRM (customers). Define standards: API spec first in Exchange, canonical error model, logging/correlation IDs, CI/CD pipeline. Stand up a small **C4E** to own templates and reviews.

**Month 3–6: strangle.** Re-implement the pilots on Process APIs that use the new System APIs. Run old and new **in parallel**, compare outputs, then switch traffic and retire the old link — one at a time, never big-bang. The loyalty app is built on the same Customer/Order APIs → visible reuse.

**Governance.** Every new integration starts by searching Exchange; API policies (client ID, rate limits) applied centrally; track *reuse count* and *lead time* as KPIs.

**Risks.** Double-writes during parallel runs (use one system of record per entity), team skills (pair with partners initially), and scope creep (strict pilot scope).
`,
}
