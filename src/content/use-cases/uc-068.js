import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-068',
  category: 'use-cases',
  title: 'Store Inventory Cycle Counts from Handhelds to the ERP',
  level: 'BEGINNER',
  tags: ['retail', 'store-inventory', 'cycle-count', 'oracle', 'oracle-ebs', 'activemq', 'handheld', 'api-led'],
  estMinutes: 20,
  diagram: {
    task: 'draw the cycle-count integration: store handhelds calling an Experience API, submitted counts queued for the cycle-count Process API, the store-inventory Oracle database and Oracle EBS behind System APIs, and the nightly count-task generator.',
    checks: [
      { label: 'Store handhelds call an Experience API', rule: { type: 'each', of: 'device', edgeTo: 'experience-api' } },
      { label: 'Submitted counts are queued instead of processed inline', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'A Process API consumes the counts and computes variances', rule: { type: 'edge', from: ['queue', 'topic'], to: 'process-api', kind: 'async' } },
      { label: 'The store inventory database and Oracle EBS are reached only through System APIs', rule: { type: 'only-via', target: ['database', 'erp'], from: 'system-api' } },
      { label: 'The Experience API never calls a System API directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'A nightly job generates count tasks', rule: { type: 'edge', from: 'batch-job', to: ['system-api', 'process-api'] } },
    ],
    reference: diagram(
      {
        hh: ['device', 'Store handhelds (Zebra)'],
        exp: ['experience-api', 'exp-store-counts'],
        q: ['queue', 'STORE.COUNTS.SUBMITTED'],
        prc: ['process-api', 'prc-cycle-count'],
        job: ['batch-job', 'Nightly count-task generator'],
        ssi: ['system-api', 'sys-store-inventory'],
        sebs: ['system-api', 'sys-oracle-ebs-inventory'],
        ora: ['database', 'Store inventory (Oracle)'],
        ebs: ['erp', 'Oracle EBS Inventory'],
      },
      ['hh -> exp', 'exp -> prc', 'exp ~> q', 'q ~> prc', 'prc -> ssi', 'prc -> sebs', 'job -> ssi', 'ssi -> ora', 'sebs -> ebs'],
    ),
  },
  description: `
A DIY retailer with **600 stores** replaces its yearly stock-take with **daily cycle counts**: every night ~50 items per store are selected for counting (high value, high shrink, or negative stock). Next morning associates count them with **handheld scanners** before opening.

Systems:
- **Store inventory database** (Oracle) — book stock per store and item, updated from POS sales and deliveries.
- **Oracle EBS Inventory** — the financial stock ledger; counts must be posted as **inventory adjustments**.

Rules:
- The handheld must download today's count list, then submit counts (item, location in store, counted quantity).
- Variance = counted − book stock **at the time the count started** (sales during counting must not distort it).
- If the variance is more than **10 % or €200**, the item must be **recounted** by a supervisor before posting.
- Adjustments must post to EBS by **12:00** the same day.
- Stores have Wi-Fi but it drops in the back rooms.

Volumes: 600 stores × 50 items = 30,000 counts/day, mostly 07:00–09:00.

**Questions:** which APIs do you build, how do you compute the variance correctly, how do you handle recounts, and how do counts reach EBS?
`,
  answerTemplate: `## APIs

## Count list download

## Submitting counts and variance

## Recounts

## Posting to EBS

## Errors and monitoring
`,
  keyPoints: [
    'exp-store-counts for the handheld (GET today\'s tasks, POST counts) → prc-cycle-count → sys-store-inventory and sys-oracle-ebs-inventory.',
    'Book stock is snapshotted when the task is started, and POS sales during the count window are added back, so the variance is correct.',
    'Counts are accepted (202) and queued so weak Wi-Fi does not lose them; the handheld retries with the same count ID (idempotent).',
    'Variances above threshold create a recount task instead of posting.',
    'Approved adjustments are posted to EBS via its inventory interface / a PL/SQL wrapper and the store book stock is corrected.',
  ],
  solution: `
\`\`\`
 Handheld -> exp-store-counts -> prc-cycle-count (GET tasks)
 Handheld -> exp-store-counts ~> [STORE.COUNTS.SUBMITTED] ~> prc-cycle-count -> sys-store-inventory -> Oracle
                                                                           -> sys-oracle-ebs-inventory -> EBS
 Nightly job -> sys-store-inventory (create count tasks)
\`\`\`

**Count tasks.** At 02:00 a job calls **sys-store-inventory** which runs a stored procedure that selects the items per store and inserts count tasks.

**Download.** \`GET /stores/{storeId}/count-tasks?date=today\` → Process API → System API. When the associate taps *Start*, \`POST /count-tasks/{id}/start\` records the start timestamp and snapshots book stock.

**Submit.** \`POST /count-tasks/{id}/counts\` with a client-generated count ID. The Experience API validates and publishes to the queue, returning **202**. If the Wi-Fi drops the handheld retries with the same ID; the Process API ignores duplicates (unique count ID).

**Variance.** variance = counted − (snapshot book stock − units sold between start and count time). The Process API reads the snapshot and POS movements through sys-store-inventory.

**Recounts.** If |variance| > 10 % or value > €200, the task becomes RECOUNT_REQUIRED and appears on the supervisor's handheld. The second count replaces the first.

**Posting.** Approved variances → **sys-oracle-ebs-inventory** inserts adjustment transactions (a PL/SQL wrapper over the EBS inventory transaction interface, called with \`db:stored-procedure\`) with reason code "cycle count". Then sys-store-inventory updates book stock. A noon check lists stores with unposted counts.

**Errors.** EBS unavailable → the message is rolled back and redelivered; after the limit it goes to a DLQ and support is alerted before the 12:00 deadline.
`,
  followUps: [
    { q: 'Why snapshot book stock at count start?', a: 'Customers keep buying while associates count. Without the snapshot (and adjusting for sales in between) the variance would wrongly include those sales.' },
    { q: 'Why 202 and a queue instead of posting directly?', a: 'It makes the handheld fast and tolerant of Wi-Fi drops, and EBS slowness or outages do not affect the store associate.' },
    { q: 'How would you add RFID counts later?', a: 'RFID readers become another consumer of exp-store-counts (or a new Experience API) producing the same canonical count message; variance and posting logic is reused.' },
  ],
}
