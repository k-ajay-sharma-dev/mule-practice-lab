import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-021',
  category: 'case-studies',
  title: 'Global Company Consolidating Regional HR Systems',
  level: 'ADVANCED',
  tags: ['hr', 'consolidation', 'master-data', 'phased-rollout', 'privacy'],
  estMinutes: 45,
  diagram: {
    task: 'draw the coexistence architecture: downstream consumers on a stable Worker API, the workers Process API routing to regional HR systems and the global HCM, the global ID cross-reference, joiner/mover/leaver events with a priority leaver path, and country payroll files.',
    checks: [
      { label: 'Downstream systems use the Worker API, never an HR system directly', rule: { type: 'each', of: 'internal-app', edgeTo: ['experience-api', 'process-api'] } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The workers Process API routes to the global HCM and regional HR systems (at least three System APIs)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'HR systems are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'legacy', 'erp'], from: 'system-api' } },
      { label: 'A global employee ID cross-reference is maintained', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Joiner/mover/leaver changes are published as events', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'Leaver events drive identity/access provisioning (same-day access removal)', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: 'identity-provider' } },
      { label: 'Country payroll provider files are generated from the canonical model', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: 'file-store' } },
    ],
    reference: diagram(
      {
        down: ['internal-app', 'Downstream apps (badge, learning, expenses…)'],
        ad: ['identity-provider', 'Active Directory / IdP'],
        ew: ['experience-api', 'workers-eapi (fields filtered per consumer)'],
        pw: ['process-api', 'workers-papi (source routing per region)'],
        prov: ['process-api', 'identity-provisioning'],
        pay: ['batch-job', 'country-payroll-files'],
        top: ['topic', 'worker-events (JML)'],
        qlv: ['queue', 'worker-terminated (priority)'],
        shcm: ['system-api', 'hcm-sapi'],
        sr1: ['system-api', 'hr-emea-sapi'],
        sr2: ['system-api', 'hr-apac-sapi'],
        hcm: ['saas', 'Global cloud HCM'],
        hr1: ['legacy', 'Regional HR (on-prem)'],
        hr2: ['saas', 'Regional HR (SaaS)'],
        xref: ['database', 'Global ID cross-reference'],
        files: ['file-store', 'Payroll provider files (per country)'],
      },
      [
        'down -> ew', 'ew -> pw', 'pw -> xref',
        'pw -> shcm', 'pw -> sr1', 'pw -> sr2', 'shcm -> hcm', 'sr1 -> hr1', 'sr2 -> hr2',
        'pw ~> top', 'pw ~> qlv', 'qlv ~> prov', 'top ~> prov', 'prov -> ad',
        'top ~> pay', 'pay -> files',
      ],
    ),
  },
  description: `
**Context.** A manufacturing group with 40,000 employees in 25 countries runs five regional HR systems (two on-premises, three SaaS) and many local payroll providers. It has chosen a single global cloud HCM platform and will roll it out region by region over two years.

More than 60 downstream systems consume employee data today:
- Active Directory/identity
- payroll providers
- time & attendance
- benefits
- learning
- expenses
- badge access
- the data warehouse

**Goals**
- Downstream systems keep working throughout the rollout, whichever HR system a region is on.
- One global employee identifier and a consistent worker data model.
- Joiners get accounts and access on day one; leavers lose access the same day.

**Constraints**
- Local payroll providers stay for now (different file formats per country).
- Employee data is subject to privacy laws in each country; some data must not leave its region (keep rules generic).
- HR data model differences (job codes, org structures) between regions.

**Your task.** Propose an integration strategy for the transition and the end state.
`,
  answerTemplate: `## End-state architecture

## Transition strategy (coexistence during rollout)

## Worker data model and identifiers

## Joiner/mover/leaver processes

## Privacy and data residency

## Risks
`,
  keyPoints: [
    'Downstream systems consume a stable Worker API/events (canonical worker model) instead of a specific HR system, so they do not change as regions move.',
    'During coexistence, a routing layer knows which HR system is the source per region/country and maps each to the canonical model.',
    'A global employee ID is introduced with a cross-reference to legacy IDs, maintained through the migration.',
    'Joiner/mover/leaver changes are published as events (e.g. WorkerHired, WorkerTerminated) and consumed by identity/access, payroll and others; leaver events are high priority.',
    'Payroll provider files are generated per country from the canonical model via country-specific mappings.',
    'Privacy: data minimisation per consumer, field-level filtering by purpose, and regional processing/storage where required.',
  ],
  solution: `
**End state.** Global HCM is the source for worker data. \`hcm-sapi\` wraps it; \`workers-papi\` exposes the canonical worker model (\`GET /workers/{globalId}\`, search, org structures) and publishes events on an event bus/Anypoint MQ topics. Consumers subscribe or call the API. Country payroll adapters generate provider files.

**Transition (coexistence).**
- Build \`workers-papi\` and events **first**, fed by the existing regional HR systems via \`hr-<region>-sapi\` adapters mapped to the canonical model.
- Migrate downstream consumers from direct HR feeds to the API/events — this decoupling is the key enabler.
- As each region moves to the global HCM, switch that region's source in the routing configuration. Consumers see no change.
- Parallel run per region: compare canonical output from old and new HR systems for a payroll cycle before switching.

**Data model and IDs.** Canonical worker (identity, employment, position, org, location, manager, cost centre) with region extensions. A **cross-reference service** maps global ID ↔ legacy IDs and is needed for history and reporting. Code mappings (job codes, org units) maintained as managed reference data, not hard-coded in DataWeave.

**JML processes.** \`WorkerHired\`, \`WorkerChanged\`, \`WorkerTerminated\` events with effective dates. Identity/access provisioning consumes them (account creation before start date, disable on termination). Leaver events have a dedicated high-priority path and monitoring.

**Privacy.** Each consumer gets only the fields its purpose needs (filtering at the Process API or per-consumer Experience APIs). Regional data that must stay in region is processed by runtimes deployed in that region; only permitted attributes flow globally. Audit access to sensitive fields.

**Risks.** Payroll errors during cutover (parallel payroll runs), model disagreements between regions (HR data governance board), inaccurate cross-references, and long tail of undocumented consumers (discovery early).
`,
  followUps: [
    { q: 'Why build the canonical API before the HCM rollout instead of integrating the new HCM directly?', a: 'Because otherwise every consumer is rewired twice — once per regional system change. Decoupling first means each region cutover becomes a source switch, not 60 integration changes.' },
    { q: 'How do you find the undocumented consumers?', a: 'Network and database access logs, file transfer server logs, service accounts on the HR systems, and asking system owners; then plan to turn off old feeds deliberately and watch who complains in test.' },
    { q: 'What is your biggest risk?', a: 'Payroll accuracy during cutover, because errors directly affect employees. Mitigate with parallel payroll runs and sign-off by payroll owners before each regional switch.' },
  ],
}
