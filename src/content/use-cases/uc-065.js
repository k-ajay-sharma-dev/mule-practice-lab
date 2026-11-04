import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-065',
  category: 'use-cases',
  title: 'Cross-Dock Planning from Supplier ASNs to Store Loads',
  level: 'ADVANCED',
  tags: ['supply-chain', 'retail', 'cross-dock', 'asn', 'wms', 'tms', 'activemq', 'oracle', 'stored-procedure', 'pl-sql'],
  estMinutes: 35,
  diagram: {
    task: 'draw the cross-dock planning integration: inbound ASNs into an ActiveMQ queue, the planning Process API using an Oracle PL/SQL allocation schema and the merchandising allocations, the plan published once on a topic to the WMS and TMS System APIs, receipt feedback from the WMS, and the re-plan scheduler.',
    checks: [
      { label: 'Supplier ASNs are accepted by an Experience API and queued', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The cross-dock Oracle schema is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Store allocations come from the merchandising system', rule: { type: 'path', from: 'process-api', to: 'erp' } },
      { label: 'The plan is published once as an event', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream'], kind: 'async' } },
      { label: 'The plan event fans out to both the WMS and TMS System APIs', rule: { type: 'edge', from: ['topic', 'event-stream'], to: 'system-api', kind: 'async', min: 2 } },
      { label: 'WMS and TMS are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'tms'], from: 'system-api' } },
      { label: 'Actual receipts flow back from the WMS asynchronously', rule: { type: 'edge', from: 'wms', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A scheduler triggers periodic re-planning', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
    ],
    reference: diagram(
      {
        sup: ['partner', 'Suppliers (EDI 856)'],
        expb: ['experience-api', 'exp-b2b-asn'],
        qasn: ['queue', 'XDOCK.ASN.IN'],
        qrcv: ['queue', 'XDOCK.RECEIPTS'],
        dlq: ['dlq', 'DLQ.XDOCK'],
        prc: ['process-api', 'prc-crossdock-planning'],
        job: ['batch-job', 'Re-plan scheduler (30 min)'],
        tplan: ['topic', 'XDOCK.PLAN.EVENTS'],
        sdb: ['system-api', 'sys-xdock-db'],
        salloc: ['system-api', 'sys-merch-allocations'],
        swms: ['system-api', 'sys-wms'],
        stms: ['system-api', 'sys-tms'],
        ora: ['database', 'Oracle XDOCK schema (PL/SQL)'],
        merch: ['erp', 'Merchandising (allocations)'],
        wms: ['wms', 'DC WMS'],
        tms: ['tms', 'TMS (store routes)'],
      },
      [
        'sup -> expb', 'expb ~> qasn', 'qasn ~> prc', 'qasn ~> dlq', 'wms ~> qrcv', 'qrcv ~> prc', 'job -> prc', 'prc -> sdb', 'prc -> salloc', 'prc -> stms',
        'prc ~> tplan', 'tplan ~> swms', 'tplan ~> stms', 'sdb -> ora', 'salloc -> merch', 'swms -> wms', 'stms -> tms',
      ],
    ),
  },
  description: `
A grocery and general-merchandise retailer wants its new regional DC to **cross-dock** fast-moving goods: inbound pallets go from the receiving door straight to outbound store trailers without being put away. Target dwell time: **< 4 hours**.

Systems:
- **Suppliers** send **EDI 856 ASNs** with SSCC pallet IDs, items and quantities, ~1,500 ASNs/day, 6–48 hours before arrival.
- **Merchandising system** (Oracle-based) holds **store allocations**: how many units of each item each of the 220 stores should receive from each PO.
- **DC WMS** runs dock doors, receiving and sortation; it publishes receipt events on **ActiveMQ**.
- **TMS** plans store routes and trailers (departure times per store, trailer capacity in pallets/cube).
- An **Oracle 19c** schema owned by the integration team holds the cross-dock plan; the planning logic (pallet → store → trailer) already exists as a **PL/SQL package** written by the supply-chain analysts.

Facts and constraints:
- Plan must be ready **2 hours before** the inbound truck arrives so the WMS can pre-assign doors.
- Reality differs: trucks are late, ASNs are short, a pallet is damaged. When actual receipts differ, the plan for the affected stores must be **recomputed within 10 minutes**.
- Store trailers depart on fixed times; goods that miss a trailer go to stock (put-away) instead.
- WMS and TMS must work from the **same version** of the plan.

**Questions:**
1. Draw the architecture and describe the planning flow.
2. How do you call the PL/SQL package from Mule and get the plan back?
3. How do you keep WMS and TMS consistent when the plan changes?
4. What happens when the WMS or TMS is unavailable?
`,
  answerTemplate: `## Architecture

## Planning flow

## Calling the PL/SQL planner

## Plan versioning and distribution

## Re-planning on actual receipts

## Failure handling
`,
  keyPoints: [
    'ASNs are accepted, 997-acknowledged and queued; prc-crossdock-planning loads ASN lines and merch allocations into the Oracle XDOCK schema.',
    'The planner runs as a stored procedure (db:stored-procedure) with IN params (ASN, run ID) and an OUT REF CURSOR returning pallet → store → trailer assignments.',
    'Each plan has a version number; one PlanChanged event on an ActiveMQ topic is consumed by both the WMS and TMS System APIs, which apply only newer versions.',
    'WMS receipt events trigger a targeted re-plan for affected stores; a scheduler re-plans periodically as a safety net.',
    'Consumers with durable subscriptions (or virtual-topic queues) keep the event until the WMS/TMS are back; latest-version-wins avoids applying stale plans.',
  ],
  solution: `
\`\`\`
 Suppliers -> exp-b2b-asn ~> [XDOCK.ASN.IN] ~> prc-crossdock-planning -> sys-xdock-db -> Oracle (PL/SQL planner)
                                                       |-> sys-merch-allocations -> Merchandising
                                                       ~> [XDOCK.PLAN.EVENTS] ~> sys-wms -> WMS
                                                                              ~> sys-tms -> TMS
 WMS ~> [XDOCK.RECEIPTS] ~> prc-crossdock-planning      Scheduler (30 min) -> prc-crossdock-planning
\`\`\`

**Planning flow.**
1. ASN arrives → validated, stored, queued. prc-crossdock-planning fetches the allocations for the POs on the ASN from **sys-merch-allocations** and the store departure schedule from **sys-tms** (cached per day).
2. It writes ASN lines and allocations into staging tables with \`db:bulk-insert\` (one batch per ASN).
3. It calls the planner: \`db:stored-procedure\` → \`XDOCK_PLANNER.BUILD_PLAN(:asnId, :runId, :planCursor)\` with \`planCursor\` declared as an OUT parameter of type CURSOR. The REF CURSOR rows (SSCC, store, trailer, door, quantity) are streamed into DataWeave.
4. The plan is saved with **plan ID + version** and a PlanChanged event (plan ID, version, changed stores, full assignments or a pointer) is published to the ActiveMQ topic.

**Distribution.** sys-wms and sys-tms each consume the topic via their own queue (ActiveMQ virtual topic \`Consumer.WMS.VirtualTopic.XDOCK.PLAN\` style, or durable subscriptions). Each applies the plan only if its version is newer than what it last applied, so out-of-order or duplicate events are harmless. Both report back "applied version N" so a dashboard shows when WMS and TMS disagree.

**Re-planning.** Receipt events from the WMS (actual SSCCs and quantities) go to \`XDOCK.RECEIPTS\`. If they differ from the ASN, the Process API re-runs the planner for the affected stores only (smaller run, well within 10 minutes) and publishes version N+1. Pallets that cannot make any trailer get a "put-away" instruction. The 30-minute scheduler catches anything missed (late trucks, ASNs that never came).

**Concurrency.** Two receipt events for the same ASN must not plan at the same time: use a per-ASN lock (a \`SELECT ... FOR UPDATE\` on the ASN row inside the procedure, or JMS message groups with JMSXGroupID = ASN ID so one consumer handles one ASN at a time).

**Failures.**
- WMS/TMS down → plan events wait in their queues; when they come back they apply the latest version.
- Oracle down → \`DB:CONNECTIVITY\`, transaction rollback, redelivery; DLQ after the limit plus alert because a missing plan means put-away (slower, not lost).
- Planner raises an application error (e.g. no allocation for a PO) → plan everything else, flag the PO for the replenishment team.

**NFRs.** Planner performance tested at 300 ASNs/hour; Oracle connection pool sized to listener concurrency; all events carry plan ID and correlation ID.
`,
  followUps: [
    { q: 'Why keep the planning logic in PL/SQL rather than in DataWeave?', a: 'It is set-based logic over large joined tables that the analysts already own and test; running it next to the data is faster. Mule orchestrates, moves data and distributes results.' },
    { q: 'How do you read a REF CURSOR in Mule 4?', a: 'Declare the OUT parameter with type CURSOR on db:stored-procedure; the result map contains it as an iterable result set you can stream through DataWeave.' },
    { q: 'Why a topic and not two direct calls to WMS and TMS?', a: 'A single event guarantees both receive the same version, decouples their availability from the planner, and lets future consumers (store dashboard) subscribe without changes.' },
  ],
}
