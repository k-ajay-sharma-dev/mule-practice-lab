import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-029',
  category: 'case-studies',
  title: 'Construction Firm Linking Project Management and ERP',
  level: 'BEGINNER',
  tags: ['construction', 'erp', 'system-api', 'master-data', 'error-handling'],
  estMinutes: 25,
  diagram: {
    task: 'draw the target integration between the SaaS project tool and the on-prem ERP: approval webhooks, the Process API with its cross-reference store, the System APIs and the scheduled syncs.',
    checks: [
      { label: 'Approval webhooks are queued asynchronously instead of calling the ERP inline', rule: { type: 'edge', from: ['system-api', 'experience-api', 'process-api'], to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A Process API holds the mapping logic and calls both the ERP and project-tool System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'The on-prem ERP is reached only through a System API', rule: { type: 'only-via', target: ['erp', 'legacy'], from: 'system-api' } },
      { label: 'The SaaS project tool is reached only through a System API (which throttles to its rate limit)', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'Cross-reference IDs (commitment ↔ PO number) are stored for idempotent updates', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'Scheduled jobs run the master-data and actual-cost syncs', rule: { type: 'edge', from: 'batch-job', to: ['process-api', 'system-api'], min: 2 } },
      { label: 'Technical failures end up in a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
      { label: 'An approved commitment reaches the ERP end to end', rule: { type: 'path', from: 'partner', to: ['erp', 'legacy'] } },
    ],
    reference: diagram(
      {
        hook: ['partner', 'Project tool approval webhooks'],
        sproj: ['system-api', 'sys-projects-api'],
        q: ['queue', 'commitment-approvals'],
        dlq: ['dlq', 'commitment-approvals-dlq'],
        prc: ['process-api', 'prc-project-costs-api'],
        md: ['batch-job', 'Nightly master-data sync'],
        ac: ['batch-job', 'Daily actual-cost sync'],
        xref: ['database', 'Cross-reference store'],
        serp: ['system-api', 'sys-erp-api'],
        erp: ['erp', 'On-prem ERP (SOAP, views)'],
        pmt: ['saas', 'Project management tool'],
      },
      [
        'hook -> sproj', 'sproj ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> xref', 'prc -> serp', 'prc -> sproj',
        'md -> prc', 'ac -> prc', 'serp -> erp', 'sproj -> pmt',
      ],
    ),
  },
  description: `
**Context.** A mid-sized construction company runs ~120 active building projects. Site teams use a SaaS project-management tool (budgets, change orders, subcontractor commitments, progress claims). Finance uses an on-premises ERP for cost codes, purchase orders, supplier invoices and payments. Each month, project accountants spend days copying commitments and change orders into the ERP and copying actual costs back, and the two systems rarely agree.

**Goals**
- New projects and cost codes created in the ERP appear automatically in the project tool.
- Approved commitments and change orders flow to the ERP as purchase orders / PO changes.
- Actual costs (invoices posted in the ERP) flow back to the project tool daily.

**Constraints**
- The ERP is on-premises behind a firewall and offers a SOAP API plus database views.
- The project tool has a REST API with rate limits (~100 calls/minute) and webhooks for approvals.
- Finance insists the ERP stays the system of record for money; the project tool is the system of record for project scope.

**Your task.** Propose the integration architecture, ownership of each data object, and error handling.
`,
  answerTemplate: `## System of record per data object

## API layers and deployment

## Flows (ERP → project tool, project tool → ERP)

## Error handling and reconciliation

## Risks
`,
  keyPoints: [
    'A clear system-of-record table: projects/cost codes/suppliers and actual costs owned by ERP; commitments and change orders originate in the project tool.',
    'System APIs wrap the on-prem ERP (SOAP) and the SaaS tool (REST); the on-prem ERP is reached through a runtime deployed close to it or secure connectivity from the cloud.',
    'Approval webhooks trigger commitment-to-PO creation; scheduled jobs handle master data and daily actual-cost sync.',
    'Cross-reference IDs (project tool ID ↔ ERP PO number) are stored so updates go to the right record and retries are idempotent.',
    'Failures (e.g. invalid cost code) are reported back to the project team with a clear reason and retried after correction, plus a monthly reconciliation report.',
  ],
  solution: `
**Ownership.**

| Object | System of record | Direction |
| --- | --- | --- |
| Project, cost codes, suppliers | ERP | ERP → project tool |
| Commitments, change orders | Project tool | Project tool → ERP (as PO / PO change) |
| Invoices, actual costs | ERP | ERP → project tool |

**Layers and deployment.** \`erp-sapi\` (SOAP via the Web Service Consumer connector, or database views for reads) runs on a Mule runtime on-premises or in CloudHub with a VPN to the data centre. \`projects-sapi\` wraps the SaaS REST API with a client-side throttle to stay under 100 calls/minute. \`project-costs-papi\` holds mapping and cross-reference logic.

**Flows.**
- *Master data*: a nightly scheduler reads new/changed projects, cost codes and suppliers from ERP (watermark on last-modified) and upserts them into the project tool.
- *Commitments*: the project tool's approval webhook → queue → \`project-costs-papi\` validates cost codes and supplier, creates the PO in ERP, stores the PO number back on the commitment. Change orders update the existing PO using the stored cross-reference.
- *Actual costs*: a daily job extracts posted invoice lines by project/cost code and updates the project tool's cost reports.

**Errors.** Validation errors (unknown cost code, supplier on hold) are not retried blindly — the commitment is marked "sync failed" in the project tool with the reason, and the project accountant fixes and re-approves. Technical errors (ERP down) retry with backoff, then go to a DLQ with alerting. A monthly report compares commitments vs POs per project.

**Rollout.** Pilot on five projects, then all new projects, then backfill open projects.

**Risks.** Rate limits on the SaaS API (batching, throttling), mismatched cost-code structures (agreed mapping before build), and users editing financial data in the wrong system (lock fields in the project tool that ERP owns).
`,
  followUps: [
    { q: 'Why not read the ERP database directly for everything?', a: 'Reads from approved views are fine, but writes must go through the ERP API so its business rules and audit trail apply. Direct table writes are a support and audit risk.' },
    { q: 'How do you handle the SaaS rate limit during the initial backfill?', a: 'Run the backfill as a throttled batch job outside working hours, respect 429 Retry-After headers, and spread it over several nights if needed.' },
    { q: 'What if the same change order is approved twice?', a: 'The cross-reference store maps the change-order ID to the PO change; the second event is detected as already processed and ignored.' },
  ],
}
