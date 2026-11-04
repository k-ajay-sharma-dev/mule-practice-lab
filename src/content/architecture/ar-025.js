export default {
  id: 'ar-025',
  category: 'architecture',
  title: 'C4E Operating Model and Reuse Metrics',
  level: 'EXPERT',
  tags: ['c4e', 'operating-model', 'reuse', 'metrics'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the root cause of the 3–4 month wait and the teams buying other tools?',
      options: [
        'Anypoint Platform is too slow a tool',
        'The operating model: a central team delivers everything, so demand exceeds capacity and LoBs bypass it',
        'Too few vCores',
        'Exchange has too many assets',
      ],
      answer: 1,
      explain: 'A center that builds everything becomes a queue. A C4E enables LoB teams to build within guardrails instead.',
    },
    {
      type: 'match',
      prompt: 'Match each responsibility to who owns it in the target model.',
      pairs: [
        ['Platform, CI/CD templates, standards and rulesets', 'C4E'],
        ['Building and running APIs for a business domain', 'LoB delivery teams'],
        ['Core Customer/Account System APIs consumable by all', 'The team that owns that domain'],
      ],
      explain: 'Federated delivery with central enablement: the C4E provides products and guardrails, domains own their APIs.',
    },
    {
      type: 'multi',
      prompt: 'Which metrics belong in the value framework shown to the CFO?',
      options: [
        'Consumers (client apps/contracts) per API',
        '% of new projects reusing at least one existing API',
        'Lead time from request to production',
        'Estimated effort avoided by reuse vs platform + C4E cost, with the model agreed with finance',
        'Total number of APIs in Exchange',
      ],
      answer: [0, 1, 2, 3],
      explain: 'API count is a vanity metric — sprawl increases it. Reuse, speed and cost tied to real projects show value.',
    },
    {
      type: 'single',
      prompt: 'Where does the "consumers per API" number come from?',
      options: [
        'A survey of developers',
        'API Manager contracts/analytics and Exchange',
        'The vCore invoice',
        'Git commit counts',
      ],
      answer: 1,
      explain: 'Client applications with contracts and the traffic they generate show who really consumes each API.',
    },
    {
      type: 'single',
      prompt: 'The CFO does not trust "cost avoided" figures. What is the honest response?',
      options: [
        'Insist the numbers are exact',
        'Say it is a model agreed upfront, and add hard numbers: lead-time reductions on real projects, vCore/licence savings from rationalisation, decommissioned interfaces and tools',
        'Stop reporting cost entirely',
        'Report the number of APIs instead',
      ],
      answer: 1,
      explain: 'Stating the limits of an estimate builds credibility; complementing it with measurable savings and outcomes makes the case.',
    },
    {
      type: 'order',
      prompt: 'Order the 9-month plan.',
      items: [
        'Baseline current lead time and reuse; form the C4E; pick 2 pilot LoBs',
        'Publish templates and the top domain System APIs as documented reusable assets',
        'Pilots deliver with C4E coaching; collect the first reuse stories',
        'Expand to more LoBs and send a monthly value report to CFO/CTO',
      ],
      explain: 'Without a baseline, no trend can be shown before renewal. Quick wins with pilots come before scaling out.',
    },
  ],
  description: `
A financial-services group bought Anypoint Platform 3 years ago for **€1.5M/year**. Situation:

- A **central integration team** of 12 builds all APIs; the business units wait 3–4 months for any integration.
- Exchange has 220 assets but most APIs have **exactly one consumer**.
- Two business units started buying their own iPaaS/low-code tools because "MuleSoft is too slow".
- The CFO asks: "**What do we get for this money?** Show me numbers or we cut the licence at renewal in 9 months."

You are asked, as the new integration architect, to propose a **C4E (Center for Enablement) operating model** and a **metrics framework**.

**Questions:**
- What is wrong with the current model, and what does a C4E change (central vs federated delivery)?
- Who does what — C4E vs line-of-business (LoB) teams? What does the C4E provide as "products"?
- Which metrics prove value (reuse, speed, cost), how are they measured, and what are their limits?
- What is your 9-month plan to show results before renewal?
`,
  answerTemplate: `## Diagnosis

## Target operating model

## C4E responsibilities and assets

## Metrics framework

## 9-month plan
`,
  keyPoints: [
    'The current centralised delivery team is a bottleneck (a "center of excellence" that builds everything); a C4E enables LoB teams to build themselves using shared assets, standards and platform services.',
    'Clear split of responsibilities: the C4E owns platform, standards, reusable assets, templates, governance and coaching; LoB/federated teams build and run their own APIs within those guardrails.',
    'Reuse is engineered, not hoped for: domain System APIs with clear owners, discoverable in Exchange, with templates/accelerators so reuse is easier than rebuilding.',
    'Metrics include reuse (consumers per API, % of new projects reusing existing assets), speed (lead time to deliver an integration), and cost (estimated effort saved per reuse vs platform cost), with data from Exchange, API Manager analytics and project tracking.',
    'Metrics are stated honestly with limits (e.g. "cost avoided" is an estimate) and tied to business outcomes such as faster product launches.',
    'The plan shows quick wins within months: enable 1–2 LoB teams, publish key reusable APIs, and report a baseline and a trend before renewal.',
  ],
  solution: `
**Diagnosis.** A central team that *delivers everything* turns the platform into a queue: demand > capacity, so LoBs bypass it. APIs are built project-by-project (one consumer each), so there is little reuse — the platform's main economic benefit is missing. The problem is the **operating model**, not the tool.

**Target model — federated delivery, central enablement.**
- **C4E (small, ~5–6 people from the current team):** platform owner, enterprise/integration architects, a DevOps/platform engineer, an evangelist/coach.
- **LoB delivery teams** (with the remaining central developers moved into domains + SI partners): build and run APIs for their domain.
- **Domain ownership:** core System APIs (Customer, Account, Product) owned by the team that owns the domain, consumable by all.

**C4E "products".**
- Platform: environments, CI/CD templates, Connected Apps, monitoring/logging standards, cost reports.
- Standards & governance: API style guide, rulesets, automated policies, lightweight design review (see API governance).
- **Reusable assets:** project templates, error/logging framework, common fragments, connectors configs, **reference implementations**.
- Enablement: onboarding training, office hours, internal community, "API of the month" demos.
- Measuring and reporting value.

**Metrics framework.**
| Area | Metric | Source |
|---|---|---|
| Reuse | Consumers (client apps/contracts) per API; % of new projects using ≥ 1 existing API | API Manager contracts/analytics, Exchange |
| Speed | Lead time from request to production for a new integration | Project tracking/Jira |
| Adoption | Number of teams delivering on the platform; APIs published per quarter | Exchange, CI/CD |
| Quality | Incidents per API, conformance to standards | Monitoring, governance reports |
| Cost | Estimated effort avoided by reuse (reused API × typical build effort) vs platform + C4E cost | Estimate, agreed with finance |
Be explicit that **"cost avoided" is a model**, agreed upfront with finance (e.g. a reused System API saves N person-days). Avoid vanity metrics like "number of APIs" — sprawl increases it.

**9-month plan.**
- *Months 0–2:* baseline metrics (current lead time, reuse), form the C4E, pick **2 pilot LoBs**, including one that bought another tool. Publish templates and the top 3 domain System APIs as properly documented, reusable assets.
- *Months 3–6:* pilots deliver with C4E coaching; measure lead time; first reuse stories ("Mobile loan project reused Customer + Account APIs: 6 weeks instead of 4 months").
- *Months 6–9:* expand to more LoBs, monthly value report to CFO/CTO, rationalise licence usage (right-size vCores, decommission unused apps) to show cost discipline.

**Trade-offs/risks.** Federating delivery risks inconsistency → mitigated by automated governance. Some LoB integrations genuinely fit other tools → define when that's allowed (tool-selection guide), rather than fighting every exception.
`,
  followUps: [
    { q: 'The CFO doesn\'t trust "cost avoided" numbers. What else can you show?', a: 'Hard numbers: lead time reduction on real projects, licence/vCore costs reduced through rationalisation, decommissioned point-to-point interfaces and tools, and business outcomes enabled (e.g. product launched a quarter earlier).' },
    { q: 'How do you motivate LoB teams to publish reusable APIs instead of project-specific ones?', a: 'Make reuse the easy path (templates, design support), include it in design review criteria, fund domain System APIs as products rather than per project, and celebrate reuse publicly with metrics per team.' },
    { q: 'What if the platform is cut at renewal anyway?', a: 'That is a business decision; the architect\'s job is to give a transparent picture including exit cost. Well-designed API contracts and specs in Exchange reduce the migration impact because consumers depend on contracts, not on the runtime.' },
  ],
}
