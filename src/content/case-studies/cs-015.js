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
      prompt: 'What is the right way to use the Mule Migration Assistant (MMA) here?',
      options: [
        'As an accelerator: run it, then review, refactor and test its output, planning for manual rework',
        'As a one-click converter whose output can go straight to production',
        'Not at all — it cannot read Mule 3 projects',
        'Only for DevKit connectors',
      ],
      answer: 0,
      explain: 'MMA converts much of the configuration and flags what it cannot convert, but its output needs review and manual work. Treating it as a finished conversion is the tempting mistake that leads to hidden behaviour differences.',
    },
    {
      type: 'order',
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
      prompt: 'Few automated tests exist. What do you do before migrating an app?',
      options: [
        'Capture its behaviour — MUnit tests for key flows and recorded production input/output pairs — so the Mule 4 version can be compared',
        'Nothing; test the Mule 4 version manually after go-live',
        'Write unit tests for the Mule 3 Java components only',
        'Rely on the MMA report as the test evidence',
      ],
      answer: 0,
      explain: 'Without a baseline you cannot prove the migrated app behaves the same. Recorded input/output pairs catch subtle differences (encoding, nulls, streaming) that manual checks miss.',
    },
    {
      type: 'single',
      prompt: 'How do you cut over a shipment-tracking app without unplanned downtime?',
      options: [
        'Deploy the Mule 4 version alongside, route a slice of traffic or replay messages, compare outputs, then switch with a tested rollback',
        'Undeploy the Mule 3 app and deploy Mule 4 in the same maintenance window, with no way back',
        'Run both versions permanently and let consumers choose',
        'Migrate all 15 tracking apps in one weekend',
      ],
      answer: 0,
      explain: 'Parallel run plus a rehearsed rollback removes the risk of a one-way switch. Big-bang migration of all critical apps concentrates risk exactly where downtime is not allowed.',
    },
    {
      type: 'multi',
      prompt: 'Which actions address the team and demand constraints?',
      options: [
        'Mule 4 and DataWeave 2.0 training plus a migration playbook and templates',
        'Pair the one experienced Mule 4 developer with others on the first wave',
        'Build new features only in apps that are already migrated',
        'Keep adding features to Mule 3 apps and port them later',
        'Add partner capacity for peaks if needed',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Training, pairing and extra capacity close the skills gap; a "new features only on Mule 4" rule avoids building everything twice. Adding features to Mule 3 apps means double work and a moving target.',
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
**Assessment (month 0–1).** Inventory all 85 apps: owner, criticality, traffic, connectors/transports used, MEL density, custom Java, DevKit connectors, external dependencies. Decommission dead apps. Group into waves: simple/low-risk → medium → critical tracking apps → apps blocked by custom connectors.

**Tooling.** Run the **Mule Migration Assistant** on a sample to see what it converts and what it flags. Treat its output as a starting point: review, simplify and refactor. Decide the target platform at the same time (CloudHub 2.0, Runtime Fabric or customer-hosted Mule 4) since it affects config, deployment and logging.

**Technical changes.**
- MEL → DataWeave 2.0 expressions; DataWeave 1.0 scripts → 2.0 (syntax differences, e.g. \`%dw 2.0\`, \`output\`, function definitions).
- Inbound/outbound properties → \`attributes\` and variables; sessions vars → explicit variables or headers.
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
