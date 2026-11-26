export default {
  id: 'cs-045',
  category: 'case-studies',
  title: 'Setting Up an Integration CoE From Scratch',
  level: 'EXPERT',
  tags: ['c4e', 'operating-model', 'governance', 'enablement', 'reuse'],
  estMinutes: 55,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Teams resent central control and the old architecture board was a bottleneck. Which operating model fits best?',
      options: [
        'A central integration factory builds every integration, so quality and standards stay the same everywhere',
        'Hub-and-spoke C4E: a small team builds the platform and templates, and delivery teams own their integrations',
        'Each of the five IT teams picks its own tools, standards and templates on the shared platform',
        'The partner builds all integrations for 6 months, then the five teams take over what it built',
      ],
      answer: 1,
      explain: 'A C4E is an **enablement** model: the central team builds the paved road (platform, templates, standards, reusable assets) and delivery teams build on it. A central factory recreates the bottleneck teams already resent and does not scale. Full autonomy without shared standards rebuilds point-to-point chaos on a new platform. A partner that builds everything leaves no skills in-house when the contract ends.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Put the first-year plan in order.',
      items: [
        'Foundations: business groups/environments, SSO, deployment target agreed with security, CI/CD and project templates',
        'Lighthouse 1 delivered jointly with the partner, creating reusable System APIs',
        'Lighthouses 2 and 3 led by internal developers, reusing System APIs from lighthouse 1',
        'Partner moves to review-only, then the contract ends with knowledge in-house',
        'Federation: delivery teams build their own integrations with C4E office hours and a community of practice',
      ],
      explain: 'Foundations and a first visible win come first. Then internal staff take the lead while the partner is still there to coach, so the partner exit is safe before delivery is federated to the teams.',
    },
    {
      type: 'multi',
      prompt: 'A company sets up a C4E (centre for enablement), a small central team that helps delivery teams build integrations. Which three measures stop the C4E from becoming a bottleneck?',
      options: [
        'Self-service templates, documentation and CI/CD pipelines',
        'Automated API spec linting and pipeline gates for tests',
        'Delivery teams own their APIs in production',
        'A C4E architect reviews each new API spec before it is published in Exchange',
        'A C4E member joins each delivery team full time for its first project',
      ],
      answer: [0, 1, 2],
      explain: 'Self-service, automated checks and team ownership scale. A clear SLA for C4E design reviews, for example 2 business days, helps too. A manual C4E review of every spec puts the small team on the path of every API again, which is how the previous board became a bottleneck; automated linting catches most of it. Embedding a C4E member full time in every team does not scale: a small C4E runs out of people after a few teams, and the rest wait.',
    },
    {
      type: 'single',
      prompt: 'Security and audit are cautious about cloud deployment. What do you do in the first three months?',
      options: [
        'Start on the CloudHub shared space with non-sensitive data only, and move once security approves',
        'Run all apps on customer-hosted runtimes in the data centre, which need no cloud approval',
        'Agree the deployment target with security now, such as private spaces or Runtime Fabric',
        'Build the lighthouse apps against mock services, and choose the target in month four',
      ],
      answer: 2,
      explain: 'Involving security early and offering private connectivity (CloudHub 2.0 private spaces with VPN) or on-premises runtimes (Runtime Fabric) keeps the programme moving without bypassing controls. Starting on the shared space without security builds on a target they may reject, and an insurer’s lighthouse projects rarely have only non-sensitive data. Customer-hosted servers dodge the question but tie the whole programme to servers it must run itself, chosen without security. Mock services delay the real decision, so the lighthouses miss their visible value.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How should the lighthouse projects be chosen?',
      options: [
        'Start with the most complex legacy system to prove the platform can handle anything',
        'Visible work that fits in 8 to 12 weeks and creates System APIs others will reuse',
        'Pick the smallest file transfer in the backlog so the new team cannot fail',
        'Run all three urgent backlog items in parallel to show leadership speed early',
      ],
      answer: 1,
      explain: 'Lighthouses must show value quickly and seed reuse. The hardest legacy system first is a classic way to stall a new team, a trivial file transfer proves nothing to leadership, and three projects at once spread a new team too thin.',
    },
    {
      type: 'multi',
      prompt: 'An integration team must show the CIO the value of its first year on Anypoint Platform. Which three metrics show real value?',
      options: [
        'Lead time per integration against the earlier baseline',
        'Reusable assets and how many times they are reused',
        'Point-to-point links and scripts retired',
        'Number of developers trained and certified on Mule',
        'Developer satisfaction score from a yearly platform survey',
      ],
      answer: [0, 1, 2],
      explain: 'Speed, reuse and simplification show value, and so do business outcomes such as hours of manual work saved by the lighthouse projects. Trained developers and a good survey score are useful inputs for the C4E, but they show capability, not a benefit the CIO can point to.',
    },
    {
      type: 'match',
      prompt: 'Match each role to its main responsibility in the C4E.',
      pairs: [
        ['Platform engineer', 'Environments, CI/CD, secrets and monitoring set-up'],
        ['C4E champion in a delivery team', 'Spreads standards and templates inside their own team'],
        ['API product owner in a business area', 'Prioritises and owns the roadmap of an API'],
        ['Partner consultants (6 months)', 'Accelerate delivery and coach internal developers'],
      ],
      explain: 'Clear roles make the federated model work: the platform team builds the road, champions and product owners carry it into the business, and the partner is a time-boxed accelerator, not a permanent dependency.',
    },
  ],
  description: `
**Context.** A 7,000-employee insurance and pensions administrator has recently signed an Anypoint Platform subscription. Nobody in the company has MuleSoft experience. Integration today is done by five separate IT teams using scripts, database links and a little-used old ESB. The CIO hired you as the first integration architect and wants a centre for enablement (C4E) / integration CoE running within 12 months, with visible business value along the way.

**Situation**

| Item | Today |
| --- | --- |
| Integration developers | 0 Mule developers; 15 developers with Java/SQL skills |
| Delivery model | Each team builds its own point-to-point links |
| Budget | Licence paid; funding for 4 new hires + a partner for 6 months |
| Demand | 30 integration requests in the backlog, 3 marked urgent |
| Leadership expectation | "Show ROI in the first year" |

**Constraints**
- Teams resist central control; a previous architecture board was seen as a bottleneck.
- Security and audit teams are cautious about cloud deployment.
- The partner contract ends after 6 months; knowledge must stay in-house.

**Your task.** Propose the operating model, the first 12 months plan (people, platform, standards, delivery), how you measure value, and how you avoid becoming a bottleneck.
`,
  answerTemplate: `## Operating model and C4E mission

## Team, roles and skills plan

## Platform foundations (environments, security, CI/CD)

## Standards, assets and governance (light-touch)

## First projects and value delivery

## Measuring success

## Risks and how you avoid becoming a bottleneck
`,
  keyPoints: [
    'The C4E is an enablement model: a small central team builds foundations, standards and reusable assets, while delivery teams build integrations themselves. It is federated, not a central factory forever.',
    'Start with 2 or 3 high-value lighthouse projects chosen for visible business value and reuse potential, delivered jointly with the partner while upskilling internal staff.',
    'Platform foundations early: environments/business groups, identity integration, network connectivity, secrets, CI/CD with templates, logging/monitoring.',
    'Light, automated governance: templates, Exchange-published assets, API design review for new APIs, automated checks in pipelines, instead of a heavy review board.',
    'Knowledge transfer is planned and measured (pairing, certifications, internal developers leading by month 5) so the partner exit is safe.',
    'Value tracked with business and reuse metrics (delivery time, assets reused, incidents, retired point-to-point links), reported regularly to leadership.',
  ],
  solution: `
**Operating model.** Mission: "make integration faster and safer for every team". Hub-and-spoke: a central C4E (platform, architecture, enablement) plus delivery teams in the business IT areas who build and own their APIs. The C4E builds the paved road; teams drive on it.

**People.**
- Hires: integration architect (you), platform engineer, two senior Mule developers. The partner provides 2 or 3 consultants for 6 months.
- Upskill 6 to 8 of the existing Java/SQL developers via official training, certification and pairing on real projects.
- Roles defined: platform owner, API product owners in business areas, C4E champions in each delivery team.

**Months 0 to 3: foundations + first lighthouse.**
- Platform: organisation and business-group/environment structure (dev, test, prod), SSO with the corporate IdP and team permissions. Deployment target decision with security (CloudHub 2.0 with private spaces/VPN, or Runtime Fabric on-premises if cloud is not accepted yet). Secure properties and secrets handling, and logging export to the company's monitoring tool.
- Engineering: project templates (Maven parent POM, error handling, logging with correlation IDs, MUnit setup), CI/CD pipeline, naming and versioning standards. Publish all in Exchange.
- Lighthouse 1: one urgent backlog item with clear value (e.g. policy data to the customer portal) delivered jointly, designed API-led with reusable System APIs.

**Months 4 to 8: scale delivery.**
- Lighthouses 2 and 3 led by internal developers with partner support. Reuse System APIs from lighthouse 1.
- Light governance: API design review (30-minute slot, async in pull requests where possible), automated checks (linting of API specs, pipeline gates for tests and coverage), security policies applied through API Manager.
- Partner exit plan: by month 5 internal staff lead all work; partner reviews only.

**Months 9 to 12: federation.**
- Delivery teams build integrations themselves with C4E support (office hours, community of practice, internal training path).
- Backlog triage with business priorities; asset catalogue grows; first old ESB/script integrations retired.

**Measuring value.** Lead time per integration (baseline vs now), number of reusable assets and their reuse count, number of point-to-point links retired, incident rates, developer certifications, business outcomes from lighthouse projects (e.g. hours of manual work saved). Quarterly report to the CIO.

**Avoiding the bottleneck.** Self-service (templates, docs, pipelines), governance by automation, federated delivery, clear SLAs for C4E reviews (e.g. 2 business days), and teams owning their own APIs in production.

**Risks.** Partner dependency (measured knowledge transfer), security blocking cloud (early joint design, possibly on-premises runtimes first), "C4E builds everything" (explicit enablement charter), and losing momentum (visible early wins and communication).
`,
  followUps: [
    { q: 'Why not have the central team build all integrations so quality is consistent?', a: 'A central factory becomes the bottleneck the teams already resent, and it does not scale. Consistency comes from templates, standards and automated checks, while teams keep ownership and speed.' },
    { q: 'How do you choose the lighthouse projects?', a: 'High business visibility, achievable in 8 to 12 weeks, and they create System APIs others will reuse. Avoid the most complex legacy system first.' },
    { q: 'How do you prove ROI in year one?', a: 'Baseline current effort and lead times, then report time saved, reuse of assets on later projects, retired scripts and licences, and business outcomes from the lighthouse projects.' },
  ],
}
