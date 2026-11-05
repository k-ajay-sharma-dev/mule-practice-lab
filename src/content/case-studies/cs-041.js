import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-041',
  category: 'case-studies',
  title: 'Running Payroll Across 40 Countries From One HR Core',
  level: 'ADVANCED',
  tags: ['payroll', 'hr', 'multi-country', 'batch', 'reconciliation'],
  estMinutes: 50,
  diagram: {
    task: 'draw the payroll integration: HR changes into a canonical pay-input Process API driven by country config and a payroll calendar, queued per provider to the aggregator and local adapters, and results flowing back to the ERP and analytics.',
    checks: [
      { label: 'The HR system is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'erp'], label: ['hr', 'workday', 'people'] }, from: 'system-api' } },
      { label: 'A payroll-calendar job triggers validation and cut-off runs', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'Country rules (provider, format, cut-off, minimisation) come from a configuration store', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['config', 'calendar', 'country'] } } },
      { label: 'Pay-input changes are queued separately per provider', rule: { type: 'edge', from: 'process-api', to: 'queue', kind: 'async', min: 2 } },
      { label: 'Each provider queue is consumed by its own adapter', rule: { type: 'each', of: 'queue', edgeTo: 'system-api' } },
      { label: 'Payroll providers (API and SFTP) are reached only through their adapters', rule: { type: 'only-via', target: ['external-api', 'file-store'], from: 'system-api' } },
      { label: 'Payroll journals are posted to the ERP only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Detailed results land in the (access-restricted) analytics platform', rule: { type: 'edge', from: ['process-api', 'batch-job', 'system-api'], to: 'data-warehouse' } },
    ],
    reference: diagram(
      {
        cal: ['batch-job', 'Payroll calendar (T-5 validation, cut-off)'],
        pin: ['process-api', 'prc-pay-input-api'],
        res: ['process-api', 'prc-payroll-results-api'],
        qa: ['queue', 'pay-changes-aggregator'],
        ql: ['queue', 'pay-changes-local-de'],
        shr: ['system-api', 'sys-hr-api'],
        sagg: ['system-api', 'sys-payroll-aggregator-api'],
        sloc: ['system-api', 'sys-payroll-de-api (PGP / SFTP)'],
        serp: ['system-api', 'sys-erp-journals-api'],
        hr: ['saas', 'Cloud HR system'],
        cfg: ['database', 'Country config & payroll calendar'],
        arc: ['database', 'Encrypted payload archive'],
        agg: ['external-api', 'Global payroll aggregator'],
        sftp: ['file-store', 'Local provider SFTP'],
        erp: ['erp', 'ERP (journals)'],
        dw: ['data-warehouse', 'Analytics (restricted)'],
      },
      [
        'cal -> pin', 'cal -> res', 'pin -> shr', 'shr -> hr', 'pin -> cfg', 'pin -> arc', 'pin ~> qa', 'pin ~> ql', 'qa ~> sagg', 'ql ~> sloc',
        'sagg -> agg', 'sloc -> sftp', 'res -> sagg', 'res -> sloc', 'res -> serp', 'serp -> erp', 'res -> dw',
      ],
    ),
  },
  description: `
**Context.** A professional-services firm with 25,000 employees in 40 countries has one cloud HR system (the system of record for employees, positions and compensation). It uses 14 payroll providers:
- a global payroll aggregator covering 28 countries
- 13 local in-country providers

**The problem today**
- HR teams email spreadsheets of changes each month.
- Payroll errors and late payments damage trust.
- Finance struggles to post payroll journals and reconcile bank payments.

**Goals**
- Employee changes (hires, leavers, salary, bank details, absences) flow automatically to the right payroll provider before each country's cut-off.
- Payroll results flow back for journals in the ERP and for analytics.
- Fewer errors and a full audit trail of what was sent, when, and what changed.

**Constraints**
- Each provider accepts different formats (APIs, SFTP files, provider-specific templates) and has different cut-off dates.
- Payroll data is highly sensitive (salary, bank, tax IDs); strict access control and data minimisation per country.
- Local legal rules differ (kept generic); some countries require data to be processed in-country or by specific providers.
- HR changes are often entered late or retroactively.

**Your task.** Propose:
- the integration architecture
- how you handle cut-offs and retroactive changes
- security
- the rollout across countries
`,
  answerTemplate: `## Target architecture and canonical payroll model

## Change detection and delivery to providers

## Cut-offs, retroactive changes and validations

## Results back to finance and analytics

## Security and data protection

## Rollout plan and governance

## Risks
`,
  keyPoints: [
    'A canonical pay-input model derived from the HR system, with per-provider/per-country adapters; country-specific rules isolated in configuration and mappings.',
    'Changes are detected as effective-dated events (or snapshot comparison) so retroactive changes are explicit and providers receive what changed and from when.',
    'A payroll calendar per country drives scheduling, pre-cut-off validation and alerts for late changes.',
    'Pre-send validation and post-run reconciliation (headcount, gross-to-net totals, bank payments) catch errors before employees are affected.',
    'Strong security: field-level minimisation per provider, encryption in transit and at rest, restricted access to logs and payloads, secrets per provider.',
    'Country-by-country rollout with parallel runs before cut-over.',
  ],
  solution: `
**Architecture.** \`hr-sapi\` (HR system APIs/integration events) → \`pay-input-papi\` (builds canonical \`PayInput\`: employee, effective date, change type, compensation elements, bank, absence) → provider adapters \`payroll-aggregator-sapi\` (API) and \`payroll-<country>-sapi\` (mostly SFTP files with PGP encryption). A country configuration store holds provider, format, cut-off calendar, required fields and data-minimisation rules.

**Change detection.** Prefer HR change events/effective-dated transactions; where unavailable, nightly snapshot comparison. Each change carries effective date and entered date; retroactive changes are flagged so providers can calculate arrears. Changes are queued per country and delivered on the provider's preferred rhythm (real time for the aggregator, daily or per-cycle files for local providers).

**Cut-offs and validation.** A payroll calendar triggers: (1) T-5 days validation report to HR (missing bank details, tax IDs, invalid codes), (2) cut-off final file/batch, (3) late-change alerts routed to payroll managers for manual handling. Files and API batches have control totals (headcount, changed records).

**Results back.** Providers return gross-to-net results and payment files. \`payroll-results-papi\` maps them to a canonical result and posts summarised journals to the ERP (by cost centre, using deterministic references so reruns do not double post). It also lands detailed results in the analytics platform (access-restricted). Reconciliation: HR headcount vs paid headcount, gross totals vs previous month (variance thresholds), bank payments vs net pay.

**Security.** Each provider receives only the fields it needs; payloads encrypted (TLS, PGP for files); secrets in a vault; Mule logs hold IDs and outcomes, never salaries or bank data; payload archives in encrypted storage with role-based access and retention per policy. In-country processing requirements met by choosing providers/runtime locations accordingly.

**Rollout.** Wave 1: two countries on the aggregator with simple payroll. Then aggregator countries in waves, then local providers. Each country runs one or two parallel cycles (manual and automated) with comparison before cut-over. Governance: a global payroll integration owner, country payroll leads sign off mappings.

**Risks.** Wrong pay (parallel runs, reconciliation), missed cut-offs (calendar-driven alerts), data breach (minimisation and encryption), provider format changes (versioned adapters with contract tests).
`,
  followUps: [
    { q: 'Why not send full employee snapshots every month to every provider?', a: 'It sends more sensitive data than needed and hides what changed, making retro pay and auditing harder. Effective-dated changes plus periodic full reconciliation give accuracy and minimisation.' },
    { q: 'How do you handle a salary change entered after cut-off?', a: 'The change is flagged as late, payroll managers are alerted, and it is delivered as a retroactive change in the next cycle (or as an off-cycle payment if policy requires). It is never silently dropped.' },
    { q: 'How would you test before go-live in a country?', a: 'Parallel runs: process real changes through both the old manual process and the new integration, compare provider outputs line by line, and only cut over after agreed accuracy for one or two cycles.' },
  ],
}
