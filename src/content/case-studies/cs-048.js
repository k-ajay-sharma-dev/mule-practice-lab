export default {
  id: 'cs-048',
  category: 'case-studies',
  title: 'Proving the Value of an API-Led Programme to Leadership After 18 Months',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'reuse-metrics', 'business-value', 'kpis', 'c4e'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt:
        'The CFO asks "What have we got for this money?". Say you have measured the programme for a few weeks; the figures below are examples of what you could find. Which kind of headline best answers the CFO?',
      options: [
        '"We built 52 APIs and published every one of them in Exchange in 18 months."',
        '"Lead time fell from 14 to 8 weeks, and reuse avoided about 1.1M of build effort."',
        '"Our Exchange assets have been viewed 9,000 times by developers this year."',
        '"We delivered 14 projects, and every one of them went live on schedule."',
      ],
      answer: 1,
      explain: 'Leadership cares about speed, cost and outcomes, so the headline gives the lead time trend and the effort avoided, with the assumptions in an appendix. API counts, project counts and page views describe activity; 52 APIs could be 52 liabilities.',
    },
    {
      type: 'single',
      prompt: 'How do you find out which APIs are **really** reused?',
      options: [
        'Count Exchange views and downloads per asset over the last 12 months',
        'Use API Manager contracts per API instance and analytics on calling client IDs',
        'Ask each project team which APIs they think are used, and add up the answers',
        'Count the Git repositories whose code or properties files mention the API name',
      ],
      answer: 1,
      explain: 'Contracts and analytics show actual consuming applications. Views and opinions measure interest, not consumption.',
    },
    {
      type: 'multi',
      prompt: 'Which practices keep the "cost avoided by reuse" figure credible?',
      options: [
        'Use conservative build-effort estimates per API type',
        'Subtract the effort still needed to integrate with the reused API',
        'Show the assumptions openly',
        'Compare with real, similar-sized projects where possible',
        'Count every reuse at the full original build cost of the API',
        'Include Exchange downloads as reuse events',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A CFO discounts numbers that look too good. Counting reuse at full build cost or treating downloads as reuse inflates the figure and destroys credibility.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the one-page presentation for leadership.',
      items: [
        'Business outcomes: what was launched and how fast',
        'Speed and cost trend over 18 months',
        'Reuse figures and how they were measured',
        'Gaps and risks, each with a plan',
        'The ask: renewal and the next steps',
      ],
      explain: 'Lead with what leadership values, support it with trends, then volunteer the bad news with a plan before someone else finds it, and finish with the decision you need.',
    },
    {
      type: 'single',
      prompt: '12 APIs have only one consumer. What do you do?',
      options: [
        'Retire all 12, since an API with one consumer adds a hop and no reuse',
        'Leave them out of the reuse report, since they pull the average down',
        'Review each one: keep the valid ones, merge or retire the over-layered ones',
        'Require other teams to start consuming them in their next projects',
      ],
      answer: 2,
      explain: 'Some single-consumer APIs are fine (new, or genuinely single-purpose); others show over-layering. A review plus clearer guidance (no Process API without a reuse or orchestration reason) fixes the cause. Hiding them damages credibility, and forced consumption creates bad dependencies.',
    },
    {
      type: 'single',
      prompt: 'Two business units still buy point-to-point integrations from an outsourcing vendor. Best response?',
      options: [
        'Ask the CIO to make the platform mandatory for every unit from next quarter',
        'Fund the two units’ integrations from the central budget, so the platform costs them nothing',
        'Add an architecture intake, show the cost gap, and give the vendor the standards',
        'Ask the vendor to publish its integrations’ specs in Exchange so other teams can reuse them',
      ],
      answer: 2,
      explain: 'An intake gives visibility, a cost comparison with similar platform projects persuades with evidence, and bringing the vendor onto the standards turns a bypass into extra capacity. A mandate from the CIO forces compliance without showing the units why, and they find ways around it. Central funding removes the price argument but not the capacity the vendor gives them, and it grows the central budget with no control over what is built. Specs in Exchange describe the point-to-point links, but the links stay point-to-point and nothing reuses the platform’s APIs.',
    },
    {
      type: 'match',
      prompt: 'Match each metric to the best data source.',
      pairs: [
        ['% of APIs with 2+ consuming apps', 'API Manager contracts and analytics'],
        ['Lead time from approval to production', 'Jira plus CI/CD deployment dates'],
        ['Incidents per API and MTTR', 'Incident management tool'],
        ['Integrations built outside the platform', 'Architecture inventory'],
      ],
      explain: 'Use data the organisation already has and can re-run every quarter, so the value dashboard becomes continuous rather than a one-off exercise.',
    },
  ],
  description: `
**Context.** An insurance company started an API-led programme 18 months ago. Since then the integration team (8 people plus a C4E of 3) has delivered **14 projects** and built **52 APIs** (24 System, 17 Process, 11 Experience) on Anypoint Platform. The platform licence and team cost ~2.4M per year.

**The situation**
- A new CFO asks: "What have we got for this money? Should we renew the platform next year?"
- Data available: Exchange asset list, API Manager contracts and analytics, Jira tickets with effort per project, deployment history from the CI/CD pipeline, incident records, and the original business case (which estimated delivery 30% faster after year 1).
- Anecdotally, projects feel faster, but nobody has measured it. Two business units still commission point-to-point integrations from an outsourcing vendor.
- Some APIs have **no consumers** besides the project that built them.

**Your task.** Define how you measure the programme's value, what numbers you would collect and how, how you present them to leadership (including the bad news), and what you change based on the findings.
`,
  answerTemplate: `## What "value" means for this audience

## Metrics: delivery speed, reuse, cost, quality, business outcomes

## How you collect the data

## Presenting to leadership (including weak spots)

## Actions based on the findings
`,
  keyPoints: [
    'Frames value in leadership terms (speed to market, cost avoided, risk reduced, business outcomes enabled), not API counts.',
    'Defines reuse precisely: APIs with more than one consuming application (from contracts/analytics), and the share of each new project built from existing assets.',
    'Measures delivery speed as lead time and effort per project over time, comparing early projects with recent ones of similar size, and against point-to-point projects where possible.',
    'Converts reuse into money cautiously (effort avoided × rate) and is transparent about assumptions; includes run cost and incident trends.',
    'Presents weak spots honestly: unused APIs, business units bypassing the platform, and what will be done about them.',
    'Turns findings into actions: retire or merge unused APIs, mandate an architecture review route for new integrations, publish a recurring value dashboard.',
  ],
  solution: `
**What value means here.** The CFO cares about: *are we delivering faster and cheaper than the alternative, are we reducing risk, and does it enable business outcomes?* API counts mean nothing on their own; 52 APIs could be 52 liabilities.

**Metrics.**

| Area | Metric | Source |
|---|---|---|
| Reuse | % of APIs with 2+ consuming apps; average consumers per System/Process API | API Manager contracts, analytics |
| Reuse | % of each project's integration built from existing APIs | Project design docs / Exchange dependencies |
| Speed | Lead time from approval to production per project; trend over 18 months | Jira + CI/CD deployment dates |
| Cost | Effort per project (person-days) vs early projects and vs estimate without reuse | Jira time, project estimates |
| Cost | Effort avoided by reuse × blended rate (state assumptions) | Derived |
| Quality | Incidents per API per month, MTTR, change failure rate | Incident tool, pipeline |
| Business | Outcomes enabled: e.g. claims portal launched in 10 weeks, broker API onboarding time | Project owners |
| Adoption | Integrations built outside the platform | Architecture inventory |

**Collecting the data.**
- Export contracts per API instance and API analytics (calling client IDs) to find real consumers, not Exchange "views".
- For each of the 14 projects, list APIs used and mark them *new* or *reused*.
- Compare similar-sized projects: e.g. the first five projects had a median lead time of 14 weeks; the last five had 8 weeks with 50 to 60% reuse (example numbers; use actual data).
- For cost avoided: reused API count × typical build effort for that API type, discounted (reuse still costs some effort).

**Example headline (illustrative).**

\`\`\`
Reuse:   31 of 52 APIs have 2+ consumers; recent projects reused ~55% of their APIs
Speed:   median lead time 14 weeks (first 5 projects) -> 8 weeks (last 5)
Cost:    ~1.1M of build effort avoided (assumptions in appendix)
Quality: incidents per API down 40% since standard templates & monitoring
Gaps:    12 APIs with a single consumer; 2 BUs still buying point-to-point
\`\`\`

**Presenting it.** One page: business outcomes first (what we launched, how fast), then speed and cost trend, then reuse, then risks/gaps, then the ask. Show the trend, not only a snapshot. Be explicit about the methodology and assumptions; a CFO will discount numbers that look too good. Present the gaps yourself, with a plan, before someone else finds them.

**Actions based on findings.**
- **Unused APIs**: review the 12 single-consumer APIs. Some are fine (new, or genuinely single-purpose), others were over-layered; merge or retire, and adjust guidance ("don't build a Process API without a reuse or orchestration reason").
- **Bypass**: put new integrations through an architecture intake; show the two BUs their projects' cost vs. a comparable platform project; offer the outsourcing vendor the platform standards.
- **Make it continuous**: a quarterly value dashboard (automated from API Manager and the pipeline) instead of a one-off exercise.
- **Renewal decision**: the business case is the trend in speed and cost avoided plus outcomes enabled, compared with the run cost.
`,
  followUps: [
    { q: 'Why is "number of APIs built" a bad KPI?', a: 'It rewards building more APIs, including unnecessary layers and duplicates. Consumption and reuse, delivery speed and outcomes show value; API count only shows activity.' },
    { q: 'How do you avoid overstating cost avoided by reuse?', a: 'Use conservative effort estimates, subtract the effort of integrating with the reused API, show assumptions openly, and compare with real projects where possible rather than theoretical ones.' },
    { q: 'What if the numbers show the programme is not delivering?', a: 'Present them anyway with a diagnosis (for example over-engineered layers, no reuse culture or poor discovery in Exchange) and a recovery plan. Credibility is worth more than one good-looking report.' },
  ],
}
