import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-051',
  category: 'architecture',
  title: 'When It Is OK to Skip a Layer',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'layers', 'trade-offs', 'pass-through'],
  estMinutes: 20,
  diagram: {
    task: 'draw all four cases on one canvas and build only the layers each case needs: A (HR dashboard and Workday), B (mobile product details from SAP, PIM and WMS), C (nightly Salesforce to data warehouse batch) and D (partner order status from SAP).',
    checks: [
      { label: 'A: the HR dashboard reads Workday through a System API', rule: { type: 'path', from: 'internal-app', via: 'system-api', to: { label: 'workday' } } },
      { label: 'A: the HR dashboard uses no Process API, because there is nothing to orchestrate', rule: { type: 'no-path', from: 'internal-app', to: 'process-api', ifDrawn: true } },
      { label: 'B: the mobile app reaches SAP, the PIM and the WMS', rule: { type: 'path', from: 'mobile-app', to: ['erp', 'saas', 'wms', 'database'], min: 3 } },
      { label: 'B: the mobile app enters through an Experience API', rule: { type: 'no-path', from: 'mobile-app', to: ['process-api', 'system-api'], unless: 'experience-api' } },
      { label: 'B: the aggregation lives in a Process API, not in the Experience API', rule: { type: 'no-path', from: 'mobile-app', to: 'system-api', unless: 'process-api' } },
      { label: 'B: one Process API combines three System APIs', rule: { type: 'each', of: 'process-api', edgeTo: 'system-api', count: 3, some: true } },
      { label: 'C: the batch job reads Salesforce accounts', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'C: the batch job writes to the data warehouse', rule: { type: 'path', from: 'batch-job', to: 'data-warehouse' } },
      { label: 'D: the partner reaches the SAP order data', rule: { type: 'path', from: 'partner', to: 'erp' } },
      { label: 'D: the external partner goes through an Experience API that shields it from later changes', rule: { type: 'no-path', from: 'partner', to: ['process-api', 'system-api'], unless: 'experience-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'saas', 'wms', 'crm', 'database', 'oracle-db', 'sql-server'] } },
      { label: 'Workday, SAP, the PIM and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'saas', 'wms', 'database', 'oracle-db', 'sql-server'], from: 'system-api' } },
      { label: 'APIs call each other with sync calls', rule: { type: 'lines', from: ['internal-app', 'mobile-app', 'partner', 'batch-job', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        dash: ['internal-app', 'A: HR dashboard'],
        gw: ['api-gateway', 'Gateway (client-id enforcement)'],
        swd: ['system-api', 'sys-workday-worker-api'],
        wd: ['saas', 'Workday'],
        mob: ['mobile-app', 'B: Mobile app'],
        emob: ['experience-api', 'exp-mobile-api'],
        pprd: ['process-api', 'prc-product-api (aggregates)'],
        smat: ['system-api', 'sys-sap-material-api'],
        spim: ['system-api', 'sys-pim-api'],
        swms: ['system-api', 'sys-wms-stock-api'],
        sap: ['erp', 'SAP'],
        pim: ['saas', 'PIM'],
        wms: ['wms', 'WMS'],
        job: ['batch-job', 'C: Nightly account sync'],
        ssf: ['system-api', 'sys-sfdc-account-api'],
        sf: ['crm', 'Salesforce'],
        dw: ['data-warehouse', 'Data warehouse'],
        ptn: ['partner', 'D: Partner'],
        eptn: ['experience-api', 'exp-partner-api'],
        sord: ['system-api', 'sys-sap-order-api'],
      },
      [
        'dash -> gw', 'gw -> swd', 'swd -> wd',
        'mob -> emob', 'emob -> pprd', 'pprd -> smat', 'pprd -> spim', 'pprd -> swms', 'smat -> sap', 'spim -> pim', 'swms -> wms',
        'job -> ssf', 'ssf -> sf', 'job -> dw',
        'ptn -> eptn', 'eptn -> sord', 'sord -> sap',
      ],
    ),
  },
  quiz: [
    {
      type: 'match',
      prompt: 'Match each case to the layers you would build.',
      pairs: [
        ['A — HR dashboard, read-only Workday list', 'A System API called directly by the dashboard'],
        ['B — Product details from SAP, PIM and WMS for mobile', 'All three layers'],
        ['C — Nightly Salesforce → data warehouse sync', 'A scheduled Process-layer app, no Experience API'],
        ['D — Partner order status, carrier data next year', 'An Experience API over the SAP System API now; add a Process API later'],
      ],
      explain: 'Build a layer only when it has a responsibility: no orchestration in A, real aggregation in B, no channel in C, and an external consumer to protect in D.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'In case D, will adding `prc-order-status-api` next year be a breaking change for the partner?',
      options: [
        'Yes — the partner must migrate to a new API',
        'No — the Experience API already decouples the partner; only its implementation changes',
        'Yes, unless the partner calls the Process API directly',
        'It depends on the carrier',
      ],
      answer: 1,
      explain: 'The Experience contract stays the same while the implementation switches from the System API to the new Process API.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'In case B, why not put the aggregation of SAP, PIM and WMS inside the mobile Experience API?',
      options: [
        'Experience APIs cannot call more than one API',
        'Web, kiosk and partners would each need the same aggregation, so it would be duplicated per channel',
        'It would be slower',
        'Aggregation is only allowed in System APIs',
      ],
      answer: 1,
      explain: 'Reusable composition belongs in the Process layer so every channel gets the same product view.',
    },
    {
      type: 'single',
      prompt: 'What is the main risk of Experience → System directly?',
      options: [
        'It is forbidden by API Manager',
        'Business logic creeps into the Experience API and is duplicated when a second channel arrives; the consumer is coupled to one system\'s domain boundary',
        'System APIs cannot accept external traffic',
        'It doubles the vCore cost',
      ],
      answer: 1,
      explain: 'The skip is fine while there is no orchestration or rule; it becomes a problem when logic starts to accumulate in the Experience layer.',
    },
    {
      type: 'single',
      prompt: 'An architecture board is writing a policy for when teams may skip a layer in API-led design. When should a team build a Process API?',
      options: [
        'For every integration, even when the API would only forward the calls',
        'In front of every System API, so that nothing calls a System API directly',
        'For orchestration, cross-system aggregation or rules shared by several consumers',
        'Only when the consumer is external or needs a materially different shape',
      ],
      answer: 2,
      explain: 'The default is "build a layer only when it has a responsibility". A Process API that only forwards calls adds latency, cost and maintenance with no benefit. The same policy says to build a System API for a system of record consumed (or plausibly consumed) by more than one integration, and an Experience API when the consumer is external, needs a different security model or needs a materially different shape. Record every skip in an ADR and revisit it when a second consumer or system appears, so skips are decisions and not accidents. External consumers still deserve an Experience boundary.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'What does "API-led is logical, not physical" mean here?',
      options: [
        'Layers exist only on diagrams and need no contracts',
        'Layers are design responsibilities; a thin layer can be a module or flow in the same app, keeping the contract boundary without a network hop',
        'All layers must run on the same server',
        'Physical deployment decides which layer an API belongs to',
      ],
      answer: 1,
      explain: 'You can keep the separation of responsibilities and still avoid paying for an extra deployment and hop.',
    },
  ],
  description: `
Your architecture board insists that **every** integration must have an Experience, a Process and a System API. Teams complain that half the Process APIs are empty pass-throughs. You are asked to write the policy for **when a layer may be skipped**.

Evaluate these four cases:

| Case | Description |
|---|---|
| A | An internal HR dashboard needs a read-only list of employees from Workday. No other system involved. |
| B | The mobile app needs "product details" = SAP material + PIM marketing content + live stock from WMS. |
| C | A nightly batch syncs Salesforce accounts into the data warehouse. No consumer UI. |
| D | A partner needs order status. Today it comes only from SAP, but next year shipment data from a carrier will be added. |

**Questions:**
1. For each case: which layers do you build, and why?
2. What are the **risks** of Experience → System directly, and of Process-only (no Experience)?
3. Write a short decision rule your board could adopt.
`,
  answerTemplate: `## Case A

## Case B

## Case C

## Case D

## Risks of skipping

## Decision rule
`,
  keyPoints: [
    'Layers exist to add value (decoupling, composition, consumer shaping); a layer that only forwards calls adds latency, cost and maintenance with no benefit.',
    'Experience → System is acceptable when there is no orchestration or business rule, and the consumer needs roughly the System API\'s shape; the consumer is then coupled to that system\'s domain contract.',
    'Process-only (no Experience layer) is fine for internal or system-to-system consumers (batch, events) where no channel-specific shaping or external security is needed.',
    'When composition is known to be coming soon, introducing the Process API early avoids a later breaking change for consumers — a judgement on likelihood and cost.',
    'The policy should be explicit and documented (ADR), with the default being "build the layer only when it has a responsibility".',
  ],
  solution: `
**Case A — HR dashboard, Workday only.** Build \`sys-workday-worker-api\` and let the dashboard call it (via the gateway with client-id enforcement). No Process API: there is no orchestration. An Experience API is only needed if the dashboard needs a materially different shape or different security (e.g. external users). **Exp → Sys (or consumer → Sys) is fine.**

**Case B — product details from 3 systems.** All three layers: three System APIs, a \`prc-product-api\` that aggregates (reused by web, kiosk, partners), and an Experience API (or shared digital-channel Experience API) for the mobile shape. Putting the aggregation in the Experience API would duplicate it for every channel.

**Case C — nightly batch.** The batch job is itself an application, not a user channel. Typical design: a scheduled Process-layer app (or a batch app) that reads from \`sys-sfdc-account-api\` (or the Salesforce connector, if there is no reuse case and volumes are large) and writes to the warehouse. **No Experience layer.** For high-volume bulk loads, going through REST System APIs record-by-record can be inefficient; many teams use Bulk API / database loaders directly and document the exception.

**Case D — partner order status, carrier coming next year.** Two options:
- Build \`exp-partner-api\` → \`sys-sap-order-api\` now, add \`prc-order-status-api\` next year. The Experience API's contract to the partner stays the same; only its implementation changes. Since the Experience layer already decouples the partner, adding the Process layer later is **not** a breaking change for the partner.
- Build the Process API now if other consumers will need the same combined status.
Either is defensible; the key point is the Experience API protects the external consumer.

**Risks.**

| Skip | Risk |
|---|---|
| Experience → System | Business logic creeps into the Experience API; when a second channel arrives it is duplicated. The consumer is coupled to one system's domain boundary (if data later comes from two systems, someone must change). |
| Consumer → System (no Exp) | External consumer coupled to an internal contract; harder to version independently; security model of internal APIs exposed. Acceptable only for trusted internal consumers. |
| Process-only | Fine internally; for external/UI consumers the Process API starts accumulating channel-specific fields and versions. |
| Building all layers always | Pass-through APIs: extra hop latency (often tens of ms each), more apps/vCores, more deployments, more places to break. |

**Decision rule (example for the board):**
1. A **System API** is always built for a system of record that is (or will plausibly be) consumed by more than one integration.
2. A **Process API** is built only when there is orchestration, aggregation across systems, or business rules shared by more than one consumer.
3. An **Experience API** is built when the consumer is external, needs a different security model, or needs a materially different shape/protocol. Internal trusted consumers may call Process or System APIs directly.
4. Every skip is recorded in an ADR so it is a decision, not an accident; revisit when a second consumer or second system appears.
`,
  followUps: [
    { q: 'Isn\'t skipping a layer going to cause rework later?', a: 'Sometimes, but rework in one Experience API is usually cheaper than building and running pass-through layers everywhere for requirements that may never come (YAGNI). The Experience API already shields external consumers from the change.' },
    { q: 'Can a System API be called directly by a mobile app?', a: 'Technically yes, but it exposes an internal contract externally and pushes channel needs into the System API. For external channels prefer at least a thin Experience API or a gateway-level facade.' },
    { q: 'What does "API-led is logical, not physical" mean here?', a: 'Layers are design responsibilities; they do not have to be separate deployments. If a layer is thin you can implement it as a module or flow in the same app, keeping the contract boundary without the network hop.' },
  ],
}
