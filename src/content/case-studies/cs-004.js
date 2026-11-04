import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-004',
  category: 'case-studies',
  title: 'Manufacturer Connecting SAP to a New MES',
  level: 'INTERMEDIATE',
  tags: ['sap', 'idoc', 'hybrid', 'manufacturing'],
  estMinutes: 35,
  diagram: {
    task: 'draw the SAP ↔ MES integration: the SAP System API receiving IDocs, the per-plant buffers and plant flows, the MES in each plant, and how confirmations get back to SAP without loss or duplicates.',
    checks: [
      { label: 'SAP is reached only through an SAP System API (the only piece that knows IDocs/BAPIs)', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The SAP System API publishes canonical messages asynchronously to plant queues', rule: { type: 'edge', from: 'system-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'There is a plant-side flow for each plant (at least two)', rule: { type: 'node', match: ['process-api', 'batch-job'], min: 2 } },
      { label: 'Production orders travel from SAP to an MES through a buffer', rule: { type: 'path', from: 'erp', to: { type: ['saas', 'legacy', 'external-api', 'database'], label: ['mes'] }, via: ['queue', 'topic', 'event-stream'] } },
      { label: 'Confirmations go back to SAP through a persistent queue (survives WAN outages)', rule: { type: 'path', from: ['process-api', 'batch-job'], to: 'erp', via: 'queue' } },
      { label: 'IDoc TIDs and confirmation IDs are kept in a persistent store for exactly-once handling', rule: { type: 'edge', from: ['system-api', 'process-api'], to: ['cache', 'database'] } },
      { label: 'Poison messages go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        sap: ['erp', 'SAP ECC (later S/4HANA)'],
        ssap: ['system-api', 'sap-sapi (IDoc / BAPI)'],
        tid: ['cache', 'TID + confirmation-ID store'],
        qa: ['queue', 'plant-a-orders'],
        qb: ['queue', 'plant-b-orders'],
        pa: ['process-api', 'prc-plant-a-mes-sync'],
        pb: ['process-api', 'prc-plant-b-mes-sync'],
        mesa: ['saas', 'MES plant A'],
        mesb: ['saas', 'MES plant B'],
        ca: ['queue', 'plant-a-confirmations'],
        cb: ['queue', 'plant-b-confirmations'],
        dlq: ['dlq', 'mes-sap-dlq'],
      },
      [
        'sap -> ssap', 'ssap -> tid', 'ssap ~> qa', 'ssap ~> qb',
        'qa ~> pa', 'qb ~> pb', 'pa -> mesa', 'pb -> mesb',
        'pa ~> ca', 'pb ~> cb', 'ca ~> ssap', 'cb ~> ssap', 'ssap -> sap',
        'qa ~> dlq', 'ca ~> dlq',
      ],
    ),
  },
  description: `
**Context.** A manufacturer with 3 plants is rolling out a new **Manufacturing Execution System (MES)** on the shop floor. SAP ECC (moving to S/4HANA in ~2 years) stays the system of record for materials and production orders.

**Required flows**
- SAP → MES: **material master** (\`MATMAS\` IDocs) and **production orders** (\`LOIPRO\` IDocs) as soon as they are released.
- MES → SAP: **production confirmations** (quantities produced, scrap) and goods movements, near real time.
- The MES exposes a REST API; it is installed **in each plant** on the local network.

**Constraints**
- SAP and the MES servers are on-premises; the company already uses Anypoint Platform (control plane in the cloud).
- A plant must **keep producing** if the WAN link to the data centre is down for a few hours.
- No IDoc may be lost or processed twice. The SAP team wants to see IDoc status in SAP (\`WE02\`).
- The S/4HANA migration should not force a rewrite of the MES side.

**Your task.** Propose the integration design: runtimes and deployment, how IDocs are received and acknowledged, how confirmations get back to SAP, and how you deal with outages.
`,
  answerTemplate: `## Deployment and runtimes

## SAP → MES (IDocs)

## MES → SAP (confirmations)

## Reliability: no loss, no duplicates, WAN outages

## Preparing for S/4HANA
`,
  keyPoints: [
    'Uses on-prem/hybrid runtimes (customer-hosted Mule or Runtime Fabric) close to SAP and the plants, managed from the Anypoint control plane.',
    'Receives IDocs with the SAP Connector as a registered RFC server (program ID on the SAP gateway) using tRFC/qRFC with a persistent transaction ID store for exactly-once handling.',
    'Transforms IDocs into a canonical/neutral model (e.g. Material, ProductionOrder) via a System API so the MES does not depend on IDoc structures.',
    'Sends confirmations to SAP via BAPI/RFC or IDoc through an SAP System API, with idempotency (confirmation ID) to avoid double posting.',
    'Buffers in both directions with persistent queues so a WAN or system outage delays data instead of losing it; plants can keep working locally.',
    'S/4HANA change is isolated to the SAP System API; MES-facing contracts stay the same.',
  ],
  solution: `
**Deployment.** Run Mule 4 on **customer-hosted runtimes** (or Runtime Fabric) managed from the Anypoint control plane: one cluster in the data centre next to SAP, and a small runtime **in each plant** next to the MES. Traffic between them is over the WAN; nothing on the shop floor depends on the cloud being reachable.

**SAP → MES.**
- The **SAP Connector** listens for IDocs as an RFC server: a program ID registered on the SAP gateway, with an RFC destination / partner profile in SAP pointing to it.
- Use **tRFC** (or **qRFC** where order matters, e.g. a material change before the production order that uses it). Keep the **transaction IDs (TIDs)** in a persistent store so a resend of the same TID is not processed twice.
- \`sap-sapi\` converts \`MATMAS\`/\`LOIPRO\` into canonical *Material* and *ProductionOrder* JSON and publishes them per plant (a queue or topic per plant). The plant runtime consumes and calls the MES REST API.
- Status back to SAP: the IDoc is acknowledged when it is safely persisted; processing errors are reported back (e.g. a status/ALEAUD message) so the SAP team sees them in \`WE02\`.

**MES → SAP.** The plant runtime receives confirmations from the MES (API call or polling), stores them in a local persistent queue, and forwards them to \`sap-sapi\`, which posts them using the appropriate **BAPI** (or an IDoc). Each confirmation carries the MES confirmation ID; \`sap-sapi\` checks it (Object Store/DB) before posting, so retries never double-book quantities.

**Outages.** If the WAN is down, the plant keeps producing with the orders it already has; confirmations queue up locally and flow when the link returns. If SAP is down, messages wait in the queue with retries and backoff; poison messages go to a DLQ with an alert. Monitor queue depth and age per plant.

**S/4HANA.** Only \`sap-sapi\` knows about IDocs/BAPIs. When S/4HANA arrives (IDocs still supported, or OData/APIs instead), you change that one API; the canonical model and the plant flows stay the same.
`,
}
