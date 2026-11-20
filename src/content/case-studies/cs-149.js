export default {
  id: 'cs-149',
  category: 'case-studies',
  title: 'Bank Making Releases Safe Across 150 Mule APIs After a Bad Release Took Payments Down',
  level: 'EXPERT',
  tags: ['deployment', 'ci-cd', 'canary', 'rollback', 'governance'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A release broke payments for two hours. What gives the biggest early win?',
      options: [
        'A fast, practised rollback to the last good version',
        'A release board that approves every production release',
        'A release freeze on the payment APIs for the rest of the quarter',
        'A full regression test suite written for all 150 APIs first',
      ],
      answer: 0,
      explain: 'Bad releases will still happen. A rollback in minutes turns a two hour outage into a short one. A board slows teams without stopping bad code, a freeze only delays the risk, and a full test suite for 150 APIs takes months.',
    },
    {
      type: 'single',
      prompt: 'Which release style lets a new version take a small share of traffic first?',
      options: [
        'A canary release',
        'A recreate release',
        'A blue-green release',
        'A rolling update',
      ],
      answer: 0,
      explain: 'A canary sends a small share of traffic to the new version and watches it, which limits the harm of a bad release. A recreate release replaces everything at once, blue-green switches all traffic in one step, and a rolling update replaces replicas one by one without choosing the share of traffic.',
    },
    {
      type: 'multi',
      prompt: 'Which three checks should every pipeline run before production?',
      options: [
        'MUnit tests with a coverage gate',
        'A contract check that the API still matches its specification',
        'A check that every property exists for production',
        'A manual sign-off from the team lead in the pipeline for every change',
      ],
      answer: [0, 1, 2],
      explain: 'Tests, contract and configuration catch the most common causes of bad releases before they ship. A manual sign-off is a person, not a check, and slows every release the teams make.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A release needs a database change. How do you keep rollback possible?',
      options: [
        'Change in steps both versions can use, and remove old parts later',
        'Change the database and the app in the same release window',
        'Change the database first, with a script to undo it if needed',
        'Rename the columns in place, and rename them back on rollback',
      ],
      answer: 0,
      explain: 'If the old version still works with the new schema, you can roll the app back without undoing the database. Undo scripts and renames back add a risky database step to every rollback, and new data written in between may not fit the old schema.',
    },
    {
      type: 'match',
      prompt: 'Match each practice to the risk it reduces.',
      pairs: [
        ['Canary release', 'A bad version reaching everyone'],
        ['Automated rollback', 'A long outage while people decide'],
        ['Contract check', 'Breaking callers with a changed API'],
        ['Expand then contract schema changes', 'Rollback blocked by the database'],
      ],
      explain: 'Each practice covers one way a release goes wrong.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Make rollback to the last version one command, and practise it',
        'Add pipeline checks for tests, contracts and properties',
        'Add health checks and release dashboards per API',
        'Introduce canary releases for the payment APIs first',
        'Spread the practices to the other APIs at their next release',
      ],
      explain: 'Recover fast first, then catch problems earlier, then limit their reach, starting where risk is highest.',
    },
  ],
  description: `
**Context.** A bank runs **150 Mule APIs** on CloudHub 2.0, owned by 12 teams. Last month a release of the payments Process API failed in production, and card payments were down for **two hours**.

**Facts gathered so far**
- Teams release from their own pipelines, with different checks. Some have no automated tests.
- Rollback means rebuilding the old version, which took 70 minutes on the day.
- Releases replace all replicas at once.
- Some releases include database changes that the old version cannot use.
- There is no shared view of which version runs where.

**Opinions**
- CIO: "This must never take two hours again."
- Team leads: "Do not slow us down with a release board."
- Risk: "We need evidence of control for the regulator."

**Your task.** Design how releases are made safe across all 150 APIs, without stopping teams from shipping.
`,
  answerTemplate: `## Decision

## Rollback

## Pipeline checks

## Release styles

## Database changes

## Visibility and evidence

## Rolling it out

## Risks
`,
  keyPoints: [
    'Fast, practised rollback is the first win.',
    'Keep the last good artifact ready, never rebuild to roll back.',
    'Pipeline checks for tests, contracts and properties.',
    'Canary releases limit the reach of a bad version.',
    'Expand then contract database changes keep rollback possible.',
    'A shared view of versions and releases gives evidence of control.',
  ],
  solution: `
**Decision.** A shared release standard, delivered as a pipeline template, with fast rollback first, then checks, then canary releases for the riskiest APIs.

**Rollback.** Every release keeps the previous artifact in Exchange. Rollback redeploys it with one command, and teams practise it.

**Pipeline checks.** MUnit with coverage, a contract check against the API specification, and a check that every property exists for the target environment.

**Release styles.** Rolling updates by default. For payment APIs, a canary with a small share of traffic and automatic rollback on error or latency limits.

**Database changes.** Expand first, release the app, contract later, so the old version always works.

**Visibility and evidence.** One dashboard of versions, releases and rollbacks per environment, kept as evidence.

**Risks.** Teams bypassing the template, slow canaries for low traffic APIs, and schema changes done in one step.
`,
  followUps: [
    { q: 'Why not a release board?', a: 'Boards slow teams and do not stop bad code. Automated checks and fast rollback do more.' },
    { q: 'How do you run a canary on CloudHub 2.0?', a: 'Run the new version as a separate deployment and route a share of traffic to it, for example with a gateway or load balancer rule, then switch over.' },
    { q: 'What is a contract check?', a: 'A test that the running API still matches its published specification, so callers are not broken.' },
    { q: 'How do you measure success?', a: 'Time to roll back, failed releases caught before production, and minutes of customer impact per quarter.' },
  ],
}
