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
        'Move them to secure (encrypted) properties or a secrets manager, with per-environment config files',
        'Move them to a plain config.yaml committed to Git',
        'Keep them in the code but restrict who can read the repository',
        'Pass them as query parameters from the calling system',
      ],
      answer: 0,
      explain: 'Secure properties (or a secrets manager) keep credentials encrypted and let each environment have its own values. A plain YAML file in Git is still a leaked secret, just in a different file.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Would you build a System API for every SaaS application the start-up integrates?',
      options: [
        'No — only for systems several integrations will touch (Salesforce, billing); one-off SaaS-to-SaaS syncs can be a single app, with a System API extracted when a second consumer appears',
        'Yes — API-led always means three layers for every integration',
        'No — System APIs are only for on-premises systems',
        'Yes, but only Experience APIs; System APIs add no value for SaaS',
      ],
      answer: 0,
      explain: 'API-led should be applied pragmatically. Three layers for every small sync wastes vCores and time on a small budget, while core shared systems clearly benefit from a reusable System API.',
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
        'Production passwords for every system',
        'A full copy of the flows from every other app',
      ],
      answer: [0, 1, 2],
      explain: 'A template standardises structure, error handling and logging so apps look alike. Secrets never belong in a template, and copying flows between apps is duplication, not reuse.',
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
      prompt: 'vCores are limited and there is no platform team. Which choice helps most?',
      options: [
        'Group small, related flows into one app where it makes sense, and track vCore consumption as apps grow',
        'Give every integration its own app on the largest worker size',
        'Skip monitoring to save capacity',
        'Run everything in Anypoint Studio on a developer laptop',
      ],
      answer: 0,
      explain: 'Grouping related small flows saves capacity while keeping apps understandable. One large worker per tiny integration burns the budget, and dropping monitoring breaks the goal of spotting incidents first.',
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
  answerTemplate: `## Foundations (first 1–2 months)

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
**Foundations (month 1–2).**
- Fix the first app: secure properties for credentials, \`config-dev.yaml\` / \`config-prod.yaml\`, MUnit tests for the main flows.
- Create a **project template** (or Maven archetype) and a **parent POM** with common dependencies, a global error handler returning a standard error body, JSON logging with correlation IDs.
- Set up **environments** (sandbox, prod) and Git branching.

**Standards and reuse.** Spec-first for anything other teams consume, published in Exchange. Naming: \`<system>-sapi\`, \`<domain>-papi\`, \`<channel>-eapi\`. Build System APIs for systems that 3+ integrations will touch (Salesforce, billing, ERP) — avoid over-layering tiny SaaS-to-SaaS syncs. Use Anypoint MQ for near-real-time or fan-out cases.

**Pipeline.** Git → CI (e.g. GitHub Actions / Jenkins / Azure DevOps) → \`mvn clean test\` with MUnit coverage threshold → deploy with the mule-maven-plugin using a connected app's credentials. Production deploys need approval.

**Operations.** Alerts on app down, error rate and CPU/memory; a shared log search; a simple runbook per app. Watch vCore consumption — group small, related flows into one app where it makes sense to save capacity.

**Growing the practice.** Code reviews against a short checklist, a quarterly look at reuse and pain points, and a light C4E role (even one person) once the team is 3–4 developers.

**Risks.** Spending too long on foundations (time-box to weeks), over-engineering with three layers for everything, and vCore/licence costs creeping up.
`,
  followUps: [
    { q: 'Would you really build System APIs for every SaaS app?', a: 'No. Only where reuse is likely or the system is core. For a one-off sync between two SaaS tools a single app is fine; you can extract a System API later when a second consumer appears.' },
    { q: 'How do you convince the founders to spend time on foundations?', a: 'Show the cost of the current state (manual deploys, incidents, onboarding time) and keep the foundation work to a few weeks, delivered alongside the next real integration.' },
    { q: 'How do you measure success?', a: 'Lead time per integration, change failure rate, incidents detected by alerts before customers, and how quickly a new developer ships their first change.' },
  ],
}
