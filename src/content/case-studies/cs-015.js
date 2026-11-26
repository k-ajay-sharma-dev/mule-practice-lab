export default {
  id: 'cs-015',
  category: 'case-studies',
  title: 'Planning a Mule 3 to Mule 4 Migration Programme',
  level: 'INTERMEDIATE',
  tags: ['migration', 'mule-3', 'mule-4', 'dataweave', 'testing'],
  estMinutes: 40,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Mule 3 construct to its Mule 4 replacement.',
      pairs: [
        ['MEL expressions', 'DataWeave 2.0 expressions'],
        ['Inbound/outbound message properties', 'attributes and variables'],
        ['Exception strategies', 'Error handlers with on-error-propagate / on-error-continue'],
        ['DevKit custom connectors', 'Connectors rebuilt with the Mule SDK (or replaced)'],
        ['Transports (file, FTP, JMS, HTTP)', 'Mule 4 connectors'],
      ],
      explain: 'Mule 4 removed MEL, message properties, exception strategies, transports and DevKit. Each has a direct replacement, which is the core of any migration plan.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What is the right way to use the Mule Migration Assistant (MMA) here?',
      options: [
        'Run it on each app, then review, refactor and test the output by hand',
        'Run it on each app, and treat the items its report could not convert as the work left to do',
        'Skip it and rewrite every app from scratch in Anypoint Studio 7',
        'Use it to convert the DevKit connectors, and migrate flows by hand',
      ],
      answer: 0,
      explain: 'MMA converts much of the configuration and flags what it cannot convert, but its output needs review and manual work. Its report lists what it could not convert, yet the converted parts can still behave differently (MEL and DataWeave 1.0 semantics, error handling), so they need review and tests too. Rewriting all 85 apps from scratch throws away a useful accelerator. MMA does not convert DevKit connectors; they need the Mule SDK or a replacement.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order the migration waves.',
      items: [
        'Inventory and score all 85 apps; decommission the unused ones',
        'Simple, low-risk apps (team learns Mule 4 with the experienced developer pairing)',
        'Medium-complexity apps',
        'The 15 critical shipment-tracking apps, with parallel run and rollback',
        'Apps blocked by DevKit custom connectors once their SDK rewrite or replacement is ready',
      ],
      explain: 'Assess first, then build skills on low-risk apps before touching the critical ones. Connector-blocked apps come last because their dependency takes the longest.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Few automated tests exist. What do you do before migrating an app?',
      options: [
        'Record production input and output pairs, and write MUnit tests for the key flows',
        'Write MUnit tests for the Mule 4 version once it is migrated, then go live',
        'Write unit tests for the custom Java components, which carry the risk',
        'Run a load test on each Mule 3 app to record a performance baseline',
      ],
      answer: 0,
      explain: 'Without a baseline you cannot prove the migrated app behaves the same. Recorded input/output pairs catch subtle differences (encoding, nulls, streaming) that manual checks miss. Tests written only after migration describe the new behaviour, not the old one. Java components are a small part of the logic. A load test baseline shows speed, not whether the output is the same.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'How do you cut over a shipment-tracking app without downtime?',
      options: [
        'Run Mule 4 beside Mule 3 on replayed messages, compare outputs, then switch traffic with a rehearsed rollback',
        'Run Mule 4 beside Mule 3 on replayed messages, compare outputs, then switch and undeploy Mule 3 the same hour',
        'Run Mule 4 beside Mule 3 with both on live traffic, compare outputs, then retire Mule 3 after a rollback period',
        'Switch to Mule 4 in a short window at the quietest hour, with Mule 3 still deployed and a rehearsed switch back',
      ],
      answer: 0,
      explain: 'Replayed messages let you compare outputs with no effect on real shipments, and a rehearsed rollback removes the risk of a one-way switch. Undeploying Mule 3 right after the switch removes the rollback path when a difference shows up later. Both versions on live traffic process each message twice, so updates and notifications go out twice. A short window at a quiet hour is still downtime, which this app cannot have.',
    },
    {
      type: 'single',
      prompt: 'A small team is migrating many apps from Mule 3 to Mule 4 over a year. The business still expects new features during that time. How should the team handle those features?',
      options: [
        'Build new features only in apps that are already migrated',
        'Keep adding features to the Mule 3 apps and port them later',
        'Build each new feature twice, once in Mule 3 and once in Mule 4',
        'Give the new features to a partner team on Mule 3, so the core team keeps migrating',
      ],
      answer: 0,
      explain: 'A "new features only on Mule 4" rule avoids building everything twice. Adding features to Mule 3 apps means double work and a moving target, and a partner team on Mule 3 only grows the code that still has to be migrated. The skills gap is handled separately with training, a migration playbook and templates, pairing with the experienced developer, and partner capacity for peaks.',
    },
  ],
  description: `
**Context.** A logistics company runs 85 Mule 3.x applications (a mix of 3.8 and 3.9) on customer-hosted servers. The runtime version is out of standard support and security has flagged it.

The apps use:
- MEL, extensively
- DataWeave 1.0
- a few custom Java components
- old transports (file, FTP, JMS, HTTP)
- Batch modules
- some DevKit-based custom connectors

**Goals**
- All business-critical apps on Mule 4 within 12 months.
- No unplanned downtime for the 15 apps that handle shipment tracking.
- Use the migration to improve quality, rather than only copy the old code.

**Constraints**
- Four Mule developers, only one has Mule 4 experience.
- Limited automated tests exist for the Mule 3 apps.
- Business still expects new features during the programme.

**Your task.** Describe how you would plan and run the migration.
`,
  answerTemplate: `## Assessment and inventory

## Migration approach and tooling

## Main technical changes to handle

## Testing and cutover

## Team and governance

## Risks
`,
  keyPoints: [
    'Starts with an inventory scoring each app on business criticality, complexity (MEL, custom Java, DevKit connectors, transports) and usage; retire unused apps instead of migrating them.',
    'Uses the Mule Migration Assistant (MMA) as an accelerator but plans for manual rework and review of its output.',
    'Names the key Mule 3 → 4 changes: MEL to DataWeave 2.0 expressions, DataWeave 1.0 to 2.0, message properties to attributes/variables, exception strategies to error handlers (on-error-continue/propagate), transports to connectors, DevKit connectors to Mule SDK.',
    'Builds regression tests (e.g. MUnit plus captured production request/response pairs) before migrating so behaviour can be compared.',
    'Cutover per app with parallel run or blue/green and a rollback plan; critical apps migrate after the team has done lower-risk ones.',
    'Handles new feature demand with a freeze or a "build new features only on Mule 4" rule to avoid double work.',
  ],
  solution: `
**Assessment (months 0 to 1).** Inventory all 85 apps: owner, criticality, traffic, connectors/transports used, MEL density, custom Java, DevKit connectors, external dependencies. Decommission dead apps. Group into waves: simple/low-risk → medium → critical tracking apps → apps blocked by custom connectors.

**Tooling.** Run the **Mule Migration Assistant** on a sample to see what it converts and what it flags. Treat its output as a starting point: review, simplify and refactor. Decide the target platform at the same time (CloudHub 2.0, Runtime Fabric or customer-hosted Mule 4) since it affects config, deployment and logging.

**Technical changes.**
- MEL → DataWeave 2.0 expressions; DataWeave 1.0 scripts → 2.0 (syntax differences, e.g. \`%dw 2.0\`, \`output\`, function definitions).
- Inbound/outbound properties → \`attributes\` and variables; session variables → explicit variables or headers.
- Exception strategies → \`error-handler\` with \`on-error-propagate\` / \`on-error-continue\` and typed errors.
- Transports → Mule 4 connectors (File, FTP/SFTP, JMS, HTTP); streaming is repeatable by default.
- DevKit connectors → rewrite with the **Mule SDK** or replace with an existing connector / HTTP calls.
- Batch, scopes and Java invocations reviewed (Java module instead of components).

**Testing and cutover.** Before migrating, capture behaviour: MUnit tests for key flows and recorded input/output pairs from production for comparison. Deploy the Mule 4 version alongside, route a slice of traffic or replay messages, compare outputs, then switch with a tested rollback (keep Mule 3 app ready for a short period).

**Team.** Train the team (Mule 4 fundamentals, DataWeave 2.0), pair the experienced developer on the first wave, create a migration playbook and templates, possibly add a partner for peak capacity. New features go only into migrated apps.

**Risks.** Hidden behaviour differences (encoding, null handling, streaming), custom connectors taking longer than expected, and business pressure for features stalling the programme.
`,
  followUps: [
    { q: 'Would you migrate all 85 apps like for like?', a: 'No. Retire unused ones, consolidate duplicates, and redesign the worst ones (e.g. into API-led layers) when the effort is similar; but avoid turning every migration into a redesign or the timeline slips.' },
    { q: 'What is usually the hardest part?', a: 'Heavy MEL and custom Java logic plus DevKit connectors, because they need manual rework, and the lack of tests that tell you whether behaviour has changed.' },
    { q: 'How do you track progress?', a: 'Apps migrated per wave against plan, regression defects found after cutover, and remaining Mule 3 traffic; report to stakeholders monthly.' },
  ],
}
