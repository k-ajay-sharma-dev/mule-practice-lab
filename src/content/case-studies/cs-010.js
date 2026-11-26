export default {
  id: 'cs-010',
  category: 'case-studies',
  title: 'Start-up Scaling From 1 to 50 Integrations',
  level: 'BEGINNER',
  tags: ['standards', 'ci-cd', 'templates', 'governance', 'startup'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The first app has hard-coded passwords. What is the right fix?',
      options: [
        'Encrypt them as secure properties, with one properties file per environment',
        'Encrypt them as secure properties in one shared file, with the key set in the parent POM so every build can decrypt',
        'Move them to a config.yaml per environment, with read access to the repository limited to the integration team',
        'Set them as application properties in Runtime Manager, with no value kept in the project',
      ],
      answer: 0,
      explain: 'Secure properties keep credentials encrypted in the project, each environment gets its own values, and the key is supplied at deploy time. Putting the key in the parent POM puts it in Git next to the encrypted values, so the encryption protects nothing. A config.yaml with limited access is still plain text in Git, and every clone and backup carries it. Application properties in Runtime Manager are shown to anyone who can open the app unless they are declared as hidden secure properties.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Would you build a System API for every SaaS application the start-up integrates?',
      options: [
        'No. Only for systems several integrations touch, such as Salesforce and billing',
        'Yes, because a System API shields the syncs when a SaaS vendor changes its API',
        'No. A SaaS connector already acts as the System API, so none is needed',
        'Yes, so each SaaS application is wrapped before the first sync is built',
      ],
      answer: 0,
      explain: 'API-led should be applied pragmatically. A System API pays off for shared core systems, where many syncs reuse it. For a one-off sync, a vendor change touches one app anyway, so the extra API only costs vCores and time on a small budget; extract a System API when a second consumer appears. A connector handles the protocol, but it is not a reusable, governed API that other teams can call.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of the CI/CD pipeline for each app.',
      items: [
        'Developer pushes to Git',
        'CI runs mvn clean test with MUnit and a coverage threshold',
        'Pipeline deploys to sandbox with the mule-maven-plugin using a connected app',
        'Approval gate for production',
        'Pipeline deploys the same artifact to production',
      ],
      explain: 'Build and test once, deploy automatically, and gate production with an approval. Manual deploys from Studio are exactly what the pipeline replaces.',
    },
    {
      type: 'multi',
      prompt: 'A small team of Mule developers wants any developer to be able to pick up any app, so it creates a shared project template and parent POM. Which three things belong in them?',
      options: [
        'Common dependencies and plugin versions',
        'A global error handler with a standard error body',
        'JSON logging with correlation IDs',
        'The Salesforce and billing connection configs, with each environment’s host and user',
        'The DataWeave mappings of the first app, as a starting point',
      ],
      answer: [0, 1, 2],
      explain: 'A template standardises structure, error handling and logging so apps look alike. Connection configs with hosts and users are per app and per environment, and most apps will not call Salesforce or billing at all, so they belong in each app’s properties. Copying one app’s business mappings into every app is duplication, not reuse.',
    },
    {
      type: 'match',
      prompt: 'Match each goal to the measure that proves it.',
      pairs: [
        ['Deliver integrations quickly', 'Lead time per integration'],
        ['Incidents spotted before customers report them', 'Share of incidents detected by alerts'],
        ['Any developer can pick up any app', 'Time for a new developer to ship a first change'],
        ['Changes do not break production', 'Change failure rate'],
      ],
      explain: 'Each goal needs its own measurable signal; lead time, alert-detected incidents, onboarding time and change failure rate map directly onto the three goals plus safe delivery.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Eight months in, the start-up runs 20 small SaaS syncs, each deployed as its own app on 1 vCore. Most use a fraction of their memory, and the vCore budget is nearly spent. Which change frees the most capacity without coupling unrelated work?',
      options: [
        'Move all 20 syncs into one app on a larger worker, so they share its capacity',
        'Group related syncs into a few apps by domain, each on 1 vCore',
        'Resize each sync to the smallest size its memory and load need, such as 0.1 or 0.2 vCore',
        'Keep 1 vCore per sync, and run the quiet ones on an hourly schedule instead of all day',
      ],
      answer: 2,
      explain: 'Most syncs use a fraction of their memory, so the waste is the size of each app, not the number of apps. Resizing each one to 0.1 or 0.2 vCore frees most of the budget and keeps every sync on its own, so a bad deploy or a memory leak stops only that sync. One app for all 20 couples unrelated integrations, so one failure stops them all. Grouping by domain couples the syncs inside each group and, at 1 vCore per group, still pays for memory nobody uses. An hourly schedule does not free any vCore, since an app keeps its size between runs, and it delays syncs that need near real time.',
    },
  ],
  description: `
**Context.** A fast-growing SaaS start-up built its first Mule app a year ago (Salesforce to its billing system). The business now plans ~50 integrations over 18 months: payment provider, support desk, marketing tools, data warehouse, partner APIs. There is one integration developer and two more being hired.

**The problem today.** The first app has hard-coded passwords, no tests and is deployed by hand from Anypoint Studio.

**Goals**
- Deliver integrations quickly without creating a mess that slows the team later.
- Any developer can pick up any app.
- Production incidents are spotted before customers report them.

**Constraints**
- Small budget: limited vCores, no dedicated platform team.
- Mostly SaaS-to-SaaS integrations; a few need near real time.

**Your task.** Describe the foundations you put in place now and how you scale the practice.
`,
  answerTemplate: `## Foundations (first 1 to 2 months)

## Standards and reuse

## Delivery pipeline

## Operations

## How the practice grows
`,
  keyPoints: [
    'Secrets move out of code into secure properties (encrypted) or a secrets manager, with per-environment config files.',
    'A project template/parent POM gives every app the same structure, logging, error handling and correlation ID handling.',
    'CI/CD pipeline (e.g. Maven + mule-maven-plugin) builds, runs MUnit tests and deploys; no manual deploys from Studio to production.',
    'API-led layering is applied pragmatically: System APIs for shared systems (e.g. Salesforce, billing) that several integrations need, not for every one-off.',
    'Specs and reusable assets are published in Exchange; naming and versioning conventions are written down.',
    'Monitoring and alerts on error rates and app health exist from the first production app; vCore usage is tracked as apps grow.',
  ],
  solution: `
**Foundations (months 1 to 2).**
- Fix the first app: secure properties for credentials, \`config-dev.yaml\` / \`config-prod.yaml\`, MUnit tests for the main flows.
- Create a **project template** (or Maven archetype) and a **parent POM** with common dependencies, a global error handler returning a standard error body, JSON logging with correlation IDs.
- Set up **environments** (sandbox, prod) and Git branching.

**Standards and reuse.** Spec-first for anything other teams consume, published in Exchange. Naming: \`<system>-sapi\`, \`<domain>-papi\`, \`<channel>-eapi\`. Build System APIs for systems that 3+ integrations will touch (Salesforce, billing, ERP). Avoid over-layering tiny SaaS-to-SaaS syncs. Use Anypoint MQ for near-real-time or fan-out cases.

**Pipeline.** Git → CI (e.g. GitHub Actions / Jenkins / Azure DevOps) → \`mvn clean test\` with MUnit coverage threshold → deploy with the mule-maven-plugin using a connected app's credentials. Production deploys need approval.

**Operations.** Alerts on app down, error rate and CPU/memory; a shared log search; a simple runbook per app. Watch vCore consumption: size each app to what it really uses, often 0.1 or 0.2 vCore, and group small, related flows into one app only where they share a release cycle.

**Growing the practice.** Code reviews against a short checklist, a quarterly look at reuse and pain points, and a light C4E role (even one person) once the team is 3 or 4 developers.

**Risks.** Spending too long on foundations (time-box to weeks), over-engineering with three layers for everything, and vCore/licence costs creeping up.
`,
  followUps: [
    { q: 'Would you really build System APIs for every SaaS app?', a: 'No. Only where reuse is likely or the system is core. For a one-off sync between two SaaS tools a single app is fine; you can extract a System API later when a second consumer appears.' },
    { q: 'How do you convince the founders to spend time on foundations?', a: 'Show the cost of the current state (manual deploys, incidents, onboarding time) and keep the foundation work to a few weeks, delivered alongside the next real integration.' },
    { q: 'How do you measure success?', a: 'Lead time per integration, change failure rate, incidents detected by alerts before customers, and how quickly a new developer ships their first change.' },
  ],
}
