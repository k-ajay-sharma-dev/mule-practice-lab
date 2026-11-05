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
      prompt: 'Teams resent central control and the old architecture board was a bottleneck. Which operating model fits best?',
      options: [
        'A central integration factory that builds every integration so quality stays consistent',
        'Hub-and-spoke C4E: a small central team builds the paved road (platform, templates, standards, reusable assets) and delivery teams build and own their own integrations',
        'Let each of the five IT teams choose its own tools and standards on the platform',
        'Outsource all integration delivery to the partner permanently',
      ],
      answer: 1,
      explain: 'A C4E is an **enablement** model. A central factory recreates the bottleneck teams already resent and does not scale; full autonomy without shared standards just rebuilds point-to-point chaos on a new platform.',
    },
    {
      type: 'order',
      prompt: 'Put the first-year plan in order.',
      items: [
        'Foundations: business groups/environments, SSO, deployment target agreed with security, CI/CD and project templates',
        'Lighthouse 1 delivered jointly with the partner, creating reusable System APIs',
        'Lighthouses 2–3 led by internal developers, reusing System APIs from lighthouse 1',
        'Partner moves to review-only, then the contract ends with knowledge in-house',
        'Federation: delivery teams build their own integrations with C4E office hours and a community of practice',
      ],
      explain: 'Foundations and a first visible win come first. Then internal staff take the lead while the partner is still there to coach, so the partner exit is safe before delivery is federated to the teams.',
    },
    {
      type: 'multi',
      prompt: 'Which measures stop the C4E from becoming a bottleneck?',
      options: [
        'Self-service templates, documentation and CI/CD pipelines',
        'Governance by automation: API spec linting and pipeline gates for tests and coverage',
        'A clear SLA for C4E design reviews, e.g. 2 business days',
        'Delivery teams own their APIs in production',
        'A weekly architecture board that must approve every change before deployment',
        'The C4E deploys every application to production itself',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Self-service, automated checks, time-boxed reviews and team ownership scale. A weekly board approving every change and central deployments are exactly the bottleneck the previous board became.',
    },
    {
      type: 'single',
      prompt: 'Security and audit are cautious about cloud deployment. What do you do in the first three months?',
      options: [
        'Pause the programme until security approves a public cloud policy',
        'Deploy to the CloudHub shared space anyway and fix security later',
        'Design the deployment target jointly with security early — e.g. CloudHub 2.0 private spaces with VPN, or Runtime Fabric on-premises if cloud is not accepted yet',
        'Run Mule applications on developer laptops until a decision is made',
      ],
      answer: 2,
      explain: 'Involving security early and offering private connectivity or on-premises runtimes keeps the programme moving without bypassing controls. Waiting kills momentum; ignoring security destroys trust.',
    },
    {
      type: 'single',
      prompt: 'How should the lighthouse projects be chosen?',
      options: [
        'Start with the most complex legacy system to prove the platform can handle anything',
        'High business visibility, achievable in 8–12 weeks, and creating System APIs that later projects will reuse',
        'Pick the cheapest file transfer so the new team cannot fail',
        'Run all three urgent backlog items in parallel to show speed',
      ],
      answer: 1,
      explain: 'Lighthouses must show value quickly and seed reuse. The hardest legacy system first is a classic way to stall a new team, and a trivial file transfer proves nothing to leadership.',
    },
    {
      type: 'multi',
      prompt: 'Which metrics would you report to the CIO to show first-year value?',
      options: [
        'Lead time per integration against the pre-platform baseline',
        'Reusable assets and how many times they are reused',
        'Point-to-point links and scripts retired',
        'Hours of manual work saved by the lighthouse projects',
        'Number of APIs created',
        'Number of Exchange page views',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Speed, reuse, simplification and business outcomes show value. API counts and page views measure activity, not benefit.',
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
**Context.** A 7,000-employee insurance and pensions administrator has just signed an Anypoint Platform subscription. Nobody in the company has MuleSoft experience. Integration today is done by five separate IT teams using scripts, database links and a little-used old ESB. The CIO hired you as the first integration architect and wants a centre for enablement (C4E) / integration CoE running within 12 months, with visible business value along the way.

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
    'The C4E is an enablement model: a small central team builds foundations, standards and reusable assets, while delivery teams build integrations themselves — federated, not a central factory forever.',
    'Start with 2–3 high-value lighthouse projects chosen for visible business value and reuse potential, delivered jointly with the partner while upskilling internal staff.',
    'Platform foundations early: environments/business groups, identity integration, network connectivity, secrets, CI/CD with templates, logging/monitoring.',
    'Light, automated governance: templates, Exchange-published assets, API design review for new APIs, automated checks in pipelines — instead of a heavy review board.',
    'Knowledge transfer is planned and measured (pairing, certifications, internal developers leading by month 4–5) so the partner exit is safe.',
    'Value tracked with business and reuse metrics (delivery time, assets reused, incidents, retired point-to-point links), reported regularly to leadership.',
  ],
  solution: `
**Operating model.** Mission: "make integration faster and safer for every team". Hub-and-spoke: a central C4E (platform, architecture, enablement) plus delivery teams in the business IT areas who build and own their APIs. The C4E builds the paved road; teams drive on it.

**People.**
- Hires: integration architect (you), platform engineer, two senior Mule developers. The partner provides 2–3 consultants for 6 months.
- Upskill 6–8 of the existing Java/SQL developers via official training, certification and pairing on real projects.
- Roles defined: platform owner, API product owners in business areas, C4E champions in each delivery team.

**Months 0–3: foundations + first lighthouse.**
- Platform: organisation and business-group/environment structure (dev, test, prod), SSO with the corporate IdP and team permissions. Deployment target decision with security (CloudHub 2.0 with private spaces/VPN, or Runtime Fabric on-premises if cloud is not accepted yet). Secure properties and secrets handling, and logging export to the company's monitoring tool.
- Engineering: project templates (Maven parent POM, error handling, logging with correlation IDs, MUnit setup), CI/CD pipeline, naming and versioning standards. Publish all in Exchange.
- Lighthouse 1: one urgent backlog item with clear value (e.g. policy data to the customer portal) delivered jointly, designed API-led with reusable System APIs.

**Months 4–8: scale delivery.**
- Lighthouses 2–3 led by internal developers with partner support. Reuse System APIs from lighthouse 1.
- Light governance: API design review (30-minute slot, async in pull requests where possible), automated checks (linting of API specs, pipeline gates for tests and coverage), security policies applied through API Manager.
- Partner exit plan: by month 5 internal staff lead all work; partner reviews only.

**Months 9–12: federation.**
- Delivery teams build integrations themselves with C4E support (office hours, community of practice, internal training path).
- Backlog triage with business priorities; asset catalogue grows; first old ESB/script integrations retired.

**Measuring value.** Lead time per integration (baseline vs now), number of reusable assets and their reuse count, number of point-to-point links retired, incident rates, developer certifications, business outcomes from lighthouse projects (e.g. hours of manual work saved). Quarterly report to the CIO.

**Avoiding the bottleneck.** Self-service (templates, docs, pipelines), governance by automation, federated delivery, clear SLAs for C4E reviews (e.g. 2 business days), and teams owning their own APIs in production.

**Risks.** Partner dependency (measured knowledge transfer), security blocking cloud (early joint design, possibly on-premises runtimes first), "C4E builds everything" (explicit enablement charter), and losing momentum (visible early wins and communication).
`,
  followUps: [
    { q: 'Why not have the central team build all integrations so quality is consistent?', a: 'A central factory becomes the bottleneck the teams already resent, and it does not scale. Consistency comes from templates, standards and automated checks, while teams keep ownership and speed.' },
    { q: 'How do you choose the lighthouse projects?', a: 'High business visibility, achievable in 8–12 weeks, and they create System APIs others will reuse. Avoid the most complex legacy system first.' },
    { q: 'How do you prove ROI in year one?', a: 'Baseline current effort and lead times, then report time saved, reuse of assets on later projects, retired scripts and licences, and business outcomes from the lighthouse projects.' },
  ],
}
