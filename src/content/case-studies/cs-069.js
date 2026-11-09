import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-069',
  category: 'case-studies',
  title: 'Electronics Manufacturer Posting Production Confirmations From Three MES Platforms to One SAP',
  level: 'INTERMEDIATE',
  tags: ['manufacturing', 'sap', 'store-and-forward', 'canonical-model', 'idempotency', 'runtime-fabric', 'hybrid'],
  estMinutes: 45,
  diagram: {
    task: 'draw the confirmation flow: an adapter for each of the three MES platforms publishing canonical confirmations to a store-and-forward queue, one production-confirmations Process API that checks a processed-ID store and posts to SAP through a System API, and a dead-letter queue.',
    checks: [
      { label: 'Each of the three MES platforms is read by its own adapter', rule: { type: 'each', of: { type: ['saas', 'legacy', 'sql-server', 'database'], label: 'mes' }, min: 3, edgeFrom: ['system-api', 'batch-job'] } },
      { label: 'All three adapters publish confirmations to a queue', rule: { type: 'edge', from: ['system-api', 'batch-job'], to: 'queue', kind: 'async', min: 3 } },
      { label: 'Plant adapters never call SAP or its System API directly', rule: { type: 'no-edge', from: { type: ['system-api', 'batch-job'], label: ['opcenter', 'factorytalk', 'poller', 'mes'] }, to: { type: ['erp', 'system-api'], label: 'sap' }, ifDrawn: true } },
      { label: 'No synchronous chain runs from a plant adapter to SAP', rule: { type: 'no-path', from: { type: ['system-api', 'batch-job'], label: ['opcenter', 'factorytalk', 'poller', 'mes'] }, to: 'erp', kind: 'sync' } },
      { label: 'One confirmations Process API takes the queue and posts to SAP', rule: { type: 'path', from: 'queue', to: 'erp', via: { type: 'process-api', label: ['confirm', 'production'] } } },
      { label: 'The Process API records processed confirmation IDs to stop duplicates', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Confirmations SAP rejects go to a dead-letter queue', rule: { type: 'edge', from: 'queue', to: 'dlq', kind: 'async' } },
    ],
    reference: diagram(
      {
        op: ['saas', 'Opcenter MES (3 plants)'],
        ft: ['legacy', 'FactoryTalk MES (2 plants)'],
        nm: ['sql-server', 'In-house MES database (4 plants)'],
        sop: ['system-api', 'sys-opcenter-api'],
        sft: ['system-api', 'sys-factorytalk-api'],
        poll: ['batch-job', 'In-house MES poller (every 2 min)'],
        q: ['queue', 'production-confirmations (plant broker)'],
        pc: ['process-api', 'prc-production-confirmations'],
        ids: ['cache', 'Processed confirmation IDs'],
        ssap: ['system-api', 'sys-sap-production-api'],
        sap: ['erp', 'SAP S/4HANA'],
        dlq: ['dlq', 'confirmations DLQ'],
      },
      [
        'sop -> op', 'sft -> ft', 'poll -> nm', 'sop ~> q', 'sft ~> q', 'poll ~> q', 'q ~> pc', 'pc -> ids', 'pc -> ssap', 'ssap -> sap',
        'q ~> dlq',
      ],
    ),
  },
  description: `
**Context.** An electronics manufacturer (power supplies and control boards) grew by buying other companies. It now has 9 plants on one central SAP S/4HANA, but three different Manufacturing Execution Systems (MES):
| MES | Plants | How it can share data |
|---|---|---|
| Siemens Opcenter | 3 | REST API; can be polled for completed operations |
| Rockwell FactoryTalk ProductionCentre | 2 | SOAP web service for completed orders |
| In-house .NET MES | 4 | No API; writes completed operations to a SQL Server table |

**What SAP needs.** Production confirmations (yield, scrap, activity times) and goods movements (component consumption, finished goods receipt) for each operation. About 250,000 confirmations a day in total.

**Today.** Each plant has its own interface, built by a different team. Plant controllers spend 2 days at month end fixing missing and doubled postings. Last quarter a WAN outage at one plant lost 4 hours of confirmations, found only at the stock count.

**Goals**
- One way of posting confirmations to SAP, whatever the MES.
- No lost and no doubled postings, even during WAN outages of up to 8 hours.
- Plant controllers can see and fix rejected confirmations themselves.

**Constraints**
- Each plant has a small Runtime Fabric cluster on site; SAP runs in the central data centre.
- SAP rejects a confirmation if the production order is already technically complete or a material is blocked.
- The SAP team wants all calls through one interface they can monitor.

**Your task.** Design the MES to SAP confirmation integration.
`,
  answerTemplate: `## Canonical confirmation message

## MES adapters (one per platform)

## Surviving WAN outages

## Posting to SAP exactly once

## Rejections and the plant controller view
`,
  keyPoints: [
    'Define one canonical confirmation (plant, order, operation, yield, scrap, times, components, a unique confirmation ID); adapters only translate.',
    'One adapter per MES platform, reused across that platform\'s plants: REST poller for Opcenter, SOAP for FactoryTalk, a database poller with a watermark for the in-house MES.',
    'Adapters publish to a persistent queue on the plant\'s Runtime Fabric broker, which forwards to the centre when the WAN is up.',
    'One production-confirmations Process API posts through one SAP System API and records processed confirmation IDs, so a resend is ignored.',
    'SAP rejections go to a DLQ with the SAP message, and plant controllers fix and replay them from a dashboard.',
  ],
  solution: `
**Canonical model.** A \`ProductionConfirmation\` with plant, production order, operation, work centre, yield, scrap, start and end times, consumed components and a confirmation ID. The ID is built from the MES name and its own record ID, so a resend has the same ID.

**Adapters.** One per MES platform, deployed to each plant's Runtime Fabric:
- \`sys-opcenter-api\` polls Opcenter for completed operations since the last watermark.
- \`sys-factorytalk-api\` calls the FactoryTalk web service.
- The in-house MES poller reads the SQL Server table with a watermark column every 2 minutes.

Each maps to the canonical message and publishes it. They never call SAP.

**Store and forward.** Each plant has a persistent queue on its local broker. If the WAN is down, confirmations wait there (8 hours is about 30,000 messages) and drain when the link returns. Messages keep their order per production order through a message group key.

**Posting.** \`prc-production-confirmations\` runs centrally. For each message it:
1. checks the processed-ID store and skips IDs already posted
2. calls \`sys-sap-production-api\`, which uses the production confirmation BAPI and returns the SAP document number
3. stores the ID with the document number

**Rejections.** Errors like "order technically complete" are not retried. They go to the DLQ with the SAP message. A dashboard per plant lets controllers fix the order in SAP and replay. Network errors are retried with backoff.
`,
  followUps: [
    { q: 'Why not let each plant adapter call SAP directly?', a: 'SAP would then have nine interfaces to monitor and a WAN outage would stop the plant flows. A central Process API behind a queue gives one interface and survives outages.' },
    { q: 'How do you stop a confirmation being posted twice after a WAN outage?', a: 'Each confirmation has a stable ID from the MES. The Process API stores processed IDs and skips any it has already posted.' },
    { q: 'Why keep message order per production order?', a: 'SAP expects operations in sequence and a final confirmation after earlier ones. Grouping by production order keeps that order while other orders run in parallel.' },
    { q: 'Which SAP errors should you retry?', a: 'Retry timeouts, locks and connection errors. Business errors like a blocked material go straight to the dead-letter queue for a person to fix.' },
  ],
}
