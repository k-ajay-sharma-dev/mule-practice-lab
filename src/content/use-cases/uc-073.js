import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-073',
  category: 'use-cases',
  title: 'Ship-from-Store: Sourcing, Store Picking and Carrier Labels',
  level: 'ADVANCED',
  tags: ['retail', 'ship-from-store', 'omnichannel', 'pos', 'tms', 'activemq', 'oracle', 'sla', 'compensation'],
  estMinutes: 35,
  diagram: {
    task: 'draw the ship-from-store integration: released orders queued from the OMS, the store-fulfilment Process API using sourcing rules in Oracle and store stock, fulfilment tasks delivered to stores asynchronously, the store app reporting picks through its Experience API, labels and pickups via the TMS, and the SLA watchdog.',
    checks: [
      { label: 'Released orders reach the Process API through a queue', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'Store tasks are delivered asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The store fulfilment app calls its own Experience API', rule: { type: 'each', of: 'internal-app', edgeTo: 'experience-api' } },
      { label: 'Pick and pack results go from the Experience API to the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'Store stock is reached only through a System API', rule: { type: 'only-via', target: 'pos', from: 'system-api' } },
      { label: 'Labels, manifests and pickups go through the TMS behind a System API', rule: { type: 'only-via', target: 'tms', from: 'system-api' } },
      { label: 'Sourcing rules and store capacity are read from Oracle', rule: { type: 'path', from: 'process-api', to: 'database' } },
      { label: 'An SLA watchdog re-sources tasks that are not picked in time', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
    ],
    reference: diagram(
      {
        app: ['internal-app', 'Store fulfilment app'],
        exps: ['experience-api', 'exp-store-fulfilment'],
        prc: ['process-api', 'prc-store-fulfilment'],
        job: ['batch-job', 'Task SLA watchdog (5 min)'],
        qrel: ['queue', 'ORDER.RELEASED'],
        qst: ['queue', 'STORE.FULFIL.TASKS'],
        dlq: ['dlq', 'DLQ.STORE.FULFIL'],
        soms: ['system-api', 'sys-oms'],
        ssrc: ['system-api', 'sys-sourcing'],
        ssi: ['system-api', 'sys-store-stock'],
        stms: ['system-api', 'sys-tms'],
        oms: ['erp', 'OMS'],
        srcdb: ['database', 'Sourcing rules & capacity (Oracle)'],
        pos: ['pos', 'Store stock / POS back office'],
        tms: ['tms', 'TMS (labels, manifests, pickups)'],
      },
      [
        'soms ~> qrel', 'qrel ~> prc', 'qrel ~> dlq', 'prc -> ssrc', 'ssrc -> srcdb', 'prc -> ssi', 'ssi -> pos', 'prc ~> qst', 'qst ~> exps',
        'app -> exps', 'exps -> prc', 'prc -> stms', 'stms -> tms', 'prc -> soms', 'soms -> oms', 'job -> prc',
      ],
    ),
  },
  description: `
A fashion retailer wants its **450 stores** to fulfil online orders (ship-from-store) to cut delivery times and sell store stock before markdown.

Systems:
- **OMS** — owns online orders and releases each line for fulfilment.
- **Store stock** — held in each store's POS back-office, replicated centrally every few minutes; accuracy ~92 %.
- **Sourcing rules** in an Oracle schema: store eligibility, distance, stock buffer, **capacity** per store (max orders per hour, by staffing), cut-off times.
- **TMS** — carrier selection, **shipping labels**, manifests and **pickup booking**.
- A new **store fulfilment app** on tablets (you design its back end).

Requirements:
- ~25,000 order lines/day sourced from stores (40 % of online), 4× on Black Friday.
- Store must accept and pick within **45 minutes**; otherwise re-source to the next best store (or DC).
- **Not found** (stock inaccuracy) → re-source within 5 minutes; after 3 failed stores, fall back to the DC.
- A store must never get more orders than its hourly capacity.
- Orders released before **14:00** must be in the carrier pickup that day.
- The customer must not notice re-sourcing, except possibly a later delivery estimate.

**Questions:**
1. Draw the integration and describe the sourcing → pick → pack → ship sequence.
2. How do you enforce store capacity and avoid two stores working on the same line?
3. How does re-sourcing work for timeouts and not-found items?
4. What happens if the TMS is down when the store packs a parcel?
`,
  answerTemplate: `## Architecture and sequence

## Sourcing and capacity

## Store tasks and confirmations

## Re-sourcing

## Labels and carrier pickup

## Failure handling and NFRs
`,
  keyPoints: [
    'OMS releases lines to a queue; prc-store-fulfilment sources them using Oracle sourcing rules + store stock, assigns one store, and sends the task to that store asynchronously.',
    'Capacity enforced atomically in Oracle (conditional UPDATE of the store\'s hourly slot counter); the line is assigned to exactly one store via a state row with optimistic locking.',
    'Store app → exp-store-fulfilment → Process API for accept / picked / not-found / packed; each transition checks the current state and assignment version.',
    'A watchdog re-sources overdue tasks; not-found excludes that store and re-sources, falling back to the DC after 3 attempts.',
    'Labels are created through sys-tms at pack time; if the TMS is down the parcel is queued for labelling and the store gets a "label pending" status.',
  ],
  solution: `
\`\`\`
 OMS -> sys-oms ~> [ORDER.RELEASED] ~> prc-store-fulfilment -> sys-sourcing -> Oracle (rules, capacity, assignments)
                                                       -> sys-store-stock -> store stock
                                                       ~> [STORE.FULFIL.TASKS] ~> exp-store-fulfilment -> store app
 store app -> exp-store-fulfilment -> prc-store-fulfilment -> sys-tms -> TMS (label, manifest, pickup)
                                                       -> sys-oms (status, tracking)
 SLA watchdog -> prc-store-fulfilment (re-source)
\`\`\`

**Sourcing.** For each released line the Process API asks sys-store-stock for candidate stores with stock ≥ buffer, ranks them with the rules from sys-sourcing (distance, cut-off, markdown priority) and tries to **reserve capacity** in the best one:
\`UPDATE store_capacity SET used = used + 1 WHERE store_id = :s AND slot_hour = :h AND used < max_orders\` — 1 row updated means capacity was reserved; 0 means try the next store. The assignment row (line ID, store, attempt, version, state ASSIGNED) is inserted in the same transaction, so a line is never assigned twice.

**Store tasks.** A task message (persistent, storeId as a JMS property) is published; exp-store-fulfilment delivers it to the store's tablets. The associate accepts → picks → packs; each call carries the assignment version. If the task was meanwhile re-sourced, the call is rejected with "task moved" and the associate puts the item back.

**Re-sourcing.**
- *Timeout*: the watchdog finds ASSIGNED/ACCEPTED tasks older than 45 minutes, cancels the store task (version + 1), releases capacity and runs sourcing again excluding that store.
- *Not found*: same, immediately, and the store's stock for that SKU is set to 0 until the next count.
- After 3 failed stores the line goes to the DC (a different OMS fulfilment node).

**Labels and pickup.** At *packed* the Process API calls sys-tms with parcel dimensions and weight → label (ZPL/PDF) back to the app for printing; the parcel is added to the store's manifest and pickup is booked for the day if before cut-off. Tracking number goes to the OMS for the customer email.

**TMS down.** \`HTTP:TIMEOUT\` / connectivity errors → the parcel is queued for labelling with retries; the app shows "label pending" and prints when ready. If still failing near cut-off, an alert goes to operations (fallback: carrier's own portal).

**NFRs.** Black Friday 4× volume: sourcing is fast SQL on indexed tables; task queues absorb store bursts; capacity counters prevent overwhelming stores. Dashboards: tasks by state and age per store, re-sourcing rate, not-found rate per store.
`,
  followUps: [
    { q: 'Why enforce capacity in Oracle instead of in the Process API memory?', a: 'Several Mule workers source concurrently; a conditional UPDATE in the database is atomic across all of them, while in-memory counters would drift or double-book.' },
    { q: 'How do you stop an associate packing a line that was already re-sourced?', a: 'Every action carries the assignment version; the Process API only accepts actions for the current version, so a stale task gets "task moved".' },
    { q: 'What metric would you show store managers?', a: 'Accept/pick times against SLA, not-found rate and capacity used per hour — they drive both staffing and stock accuracy improvements.' },
  ],
}
