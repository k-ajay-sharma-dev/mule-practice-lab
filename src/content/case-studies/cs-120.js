export default {
  id: 'cs-120',
  category: 'case-studies',
  title: 'Telecom Group Deciding Where 400 Mule 3 Integrations Land: CloudHub 2.0, Runtime Fabric or Both',
  level: 'EXPERT',
  tags: ['migration', 'mule-3', 'mule-4', 'cloudhub-2', 'runtime-fabric', 'telecom', 'decision-record', 'data-residency'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      prompt: 'Some integrations handle call detail records that the regulator says must stay in-country, and some sit next to the mainframe with tight latency. Most others call SaaS systems. Where do they run?',
      options: [
        'Both: Runtime Fabric on premises for residency and mainframe, CloudHub 2.0 for the rest',
        'All on CloudHub 2.0 private spaces, with a VPN to the in-country data centres',
        'All on Runtime Fabric, so the team learns and runs one platform only',
        'Each project team chooses the platform per integration as it migrates',
      ],
      answer: 0,
      explain: 'Residency and latency force some workloads on premises, while SaaS-facing ones gain from a managed platform. A written placement rule keeps the split deliberate. A VPN does not keep the records in the country, since the workers run in the cloud region, one platform for everything pays the on-premises cost where it brings nothing, and team-by-team choice produces an unmanaged mix.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each Mule 3 feature to what replaces it in Mule 4.',
      pairs: [
        ['DataWeave 1.0 scripts', 'DataWeave 2.0 scripts, converted and retested'],
        ['MEL expressions', 'DataWeave expressions'],
        ['Inbound and outbound properties', 'Message attributes and variables'],
        ['Exception strategies', 'On Error Continue and On Error Propagate handlers with error types'],
      ],
      explain: 'These are the changes that take most of the effort in a Mule 3 to Mule 4 migration, because they touch nearly every flow. Error handling also changes model, not only syntax, so behaviour must be retested.',
    },
    {
      type: 'single',
      prompt: 'The project manager plans each app as: run the Mule Migration Assistant, run a smoke test, deploy. Two days per app. What do you tell them about the plan?',
      options: [
        'It holds, because the assistant converts each app fully and a smoke test proves it',
        'It needs a rewrite step, because the assistant leaves every DataWeave script to be redone by hand',
        'Add time for the parts the assistant marks for manual work, then a full regression test',
        'It holds, and the deploy step can be dropped, because the assistant deploys to the Mule 4 target too',
      ],
      answer: 2,
      explain: 'The assistant speeds up the mechanical part and leaves comments and a report where it cannot decide; DataWeave, custom Java and error handling still need people. Error handling also changes model in Mule 4, so behaviour must be retested, not smoke tested. It does not convert everything, it does convert many DataWeave 1.0 scripts, and the platform move is a separate step it does not do.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'For each of the 400 integrations in the inventory, which three facts decide whether it is migrated as is, redesigned or retired?',
      options: [
        'Whether it has had any traffic in the last 6 months',
        'Whether it runs on CloudHub 1.0 or on an on-premises Mule 3 server today',
        'How critical the business process is and who owns it',
        'How much custom Java and complex transformation it contains',
        'How many flows it has',
        'How many years ago it was first built',
      ],
      answer: [0, 2, 3],
      explain: 'Traffic finds retirements, criticality sets risk and order, and complexity sets the effort and whether a redesign is cheaper. Where it runs today does not decide its future: the target is set by the placement rule (residency, latency), and an app on either Mule 3 host can be migrated, redesigned or retired. A flow count measures size, not difficulty: ten plain flows migrate faster than one flow full of custom Java. Age says nothing on its own; an old integration can still carry billing traffic every day.',
    },
    {
      type: 'order',
      prompt: 'Order the programme.',
      items: [
        'Inventory the 400 integrations with traffic, owner, complexity and placement (residency, latency)',
        'Build the Mule 4 landing zones: Runtime Fabric, CloudHub 2.0 private spaces, CI/CD templates',
        'Pilot ten integrations of different kinds to calibrate effort per type',
        'Migrate in waves by business domain, highest support risk first, with parallel runs',
        'Retire the Mule 3 servers and CloudHub 1.0 apps as each wave is signed off',
      ],
      explain: 'Facts first, then the target platforms, then a pilot that turns guesses into real effort numbers, then waves, then decommissioning that releases cost as it goes.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The pilot shows that only 300 of the 400 integrations can be migrated before the extended support contract ends. What do you recommend?',
      options: [
        'Order by risk, retire unused ones, and buy a short, dated support extension',
        'Run the last 100 on unsupported Mule 3 until the team has time for them',
        'Pause all new business projects for a year to free developers for the migration',
        'Cut regression testing to smoke tests so all 400 finish before the deadline',
      ],
      answer: 0,
      explain: 'Risk-based order protects the critical processes, retirement shrinks scope, and a bounded extension covers the gap with a plan the business can check. Unsupported running, a full freeze or skipping tests all trade a schedule problem for an outage or a business problem.',
    },
  ],
  description: `
**Context.** A telecom group (mobile, broadband and TV in three countries) has **400 integrations on Mule 3.9**:

| Where | Count | Examples |
|---|---|---|
| Standalone Mule 3 servers in two data centres | 290 | Mainframe billing, network inventory, call detail record (CDR) mediation feeds |
| CloudHub 1.0 (Mule 3 runtime) | 110 | Salesforce, ServiceNow, partner portals, marketing SaaS |

The **extended support contract for Mule 3 ends in 15 months**. The security team has listed Mule 3 as a top-five risk.

**Facts gathered so far**
- 70 integrations have had no traffic in six months.
- About 120 use DataWeave 1.0 heavily; 60 contain custom Java components; most have few or no MUnit tests.
- CDR feeds (30 integrations) carry data that the national regulator requires to stay in-country. They also need under 20 ms latency to the mainframe.
- The group already runs OpenShift in both data centres; a CloudHub 1.0 to CloudHub 2.0 move was planned anyway.
- 25 Mule developers, all with Mule 3 experience; 8 have used Mule 4.

**Opinions in the steering group**
- The CTO: "Everything to CloudHub 2.0, we want out of the data centre."
- Head of network IT: "CDR and mainframe work must stay on site."
- The CFO: "We pay for both platforms only if it is cheaper overall."

**Your task.** Recommend where the integrations should run, how to migrate them from Mule 3 to Mule 4, and how to deal with the support deadline. Write it as a decision the steering group can approve.
`,
  answerTemplate: `## Decision: placement rule

## Options considered

## Migration approach (Mule 3 to Mule 4)

## Programme plan and waves

## The support deadline

## Skills and team

## Risks
`,
  keyPoints: [
    'A hybrid decision with a written placement rule: residency-bound and mainframe-bound integrations on Runtime Fabric on the existing OpenShift, everything else on CloudHub 2.0 private spaces.',
    'Start with the inventory: retire the 70 unused integrations, classify the rest by complexity, criticality and placement.',
    'Mule 4 migration with the Mule Migration Assistant plus manual work for DataWeave 2.0, error handling and custom Java; record and replay production traffic to test where MUnit tests are missing.',
    'A pilot calibrates effort; waves follow business domains and support risk, with parallel runs and fast decommissioning.',
    'Plan for the deadline honestly: prioritise by risk and negotiate a bounded extension for what cannot finish, rather than running unsupported.',
    'Train the 25 developers on Mule 4 early, pairing the 8 experienced developers with each wave.',
  ],
  solution: `
**Decision.** Hybrid with a rule:
- Runtime Fabric on OpenShift (both data centres) for integrations that handle data required to stay in-country, or need under 20 ms to on-premises systems. About 110 integrations.
- CloudHub 2.0 private spaces with VPN to the data centres for the rest. About 220 integrations.
- Retire about 70 unused integrations after owner confirmation.
Both are managed from one Anypoint control plane, one CI/CD template and one monitoring setup, which keeps the operating cost of two runtimes low. The CTO gets most workloads out of the data centre; network IT keeps CDR on site; the CFO sees retired servers and licences against the cost of both platforms.

**Options rejected.** All CloudHub 2.0 breaks residency and latency. All Runtime Fabric keeps SaaS-facing integrations in the data centre for no benefit.

**Migration approach.** Each integration: run the Mule Migration Assistant, fix what it marks, rewrite DataWeave 1.0 to 2.0, redo error handling with error types, replace custom Java where a connector exists. Tests: record production requests and messages for a week, replay them against Mule 4 and compare outputs.

**Plan.** Months 1 to 2: inventory, landing zones, training. Months 2 to 3: pilot ten integrations of different types to measure effort. Months 3 to 15: waves by domain (CRM and SaaS first on CloudHub 2.0, billing and CDR on Runtime Fabric), highest security exposure first.

**Deadline.** If the pilot shows the 15 months cannot cover everything, agree a short, defined support extension for the tail now, while retiring and prioritising aggressively.

**Risks.** DataWeave conversion effort underestimated, OpenShift capacity, and losing developers to business projects during the programme.
`,
  followUps: [
    { q: 'Why not move everything to Runtime Fabric and keep one platform?', a: 'SaaS-facing integrations would stay in the data centre with no benefit, and the group would carry all the infrastructure work. The hybrid rule keeps on site only what has to stay there.' },
    { q: 'How do you test integrations that have no MUnit tests?', a: 'Record real production inputs and outputs from the Mule 3 version, replay the inputs against the Mule 4 version, and compare. Add MUnit tests for the critical paths during the rewrite.' },
    { q: 'What makes DataWeave 1.0 to 2.0 conversion risky?', a: 'Syntax changes are mechanical, but some functions and null handling behave differently. Output can look right and still differ in edge cases, which only comparison testing reveals.' },
    { q: 'How do you keep two runtime platforms from doubling operations work?', a: 'One control plane, one deployment template per platform from the same pipeline, shared monitoring and logging, and one placement rule so nobody chooses case by case.' },
  ],
}
