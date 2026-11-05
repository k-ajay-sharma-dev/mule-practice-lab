import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-010',
  category: 'architecture',
  title: 'Batch vs Streaming vs Real-Time',
  level: 'INTERMEDIATE',
  tags: ['batch', 'real-time', 'streaming', 'integration-patterns'],
  estMinutes: 25,
  diagram: {
    task: 'draw the three flows side by side: the nightly price batch to the stores, the real-time stock check for the website, and the sales events consumed by loyalty and finance.',
    checks: [
      { label: 'A scheduled batch job delivers the nightly price set', rule: { type: 'edge', from: 'batch-job', to: ['file-store', 'system-api', 'device', 'queue'] } },
      { label: 'The website calls an Experience API synchronously for stock', rule: { type: 'each', of: 'web-app', edgeTo: 'experience-api', kind: 'sync' } },
      { label: 'The website reaches the inventory database end to end', rule: { type: 'path', from: 'web-app', to: 'database' } },
      { label: 'The Oracle inventory DB is reached only through a System API', rule: { type: 'only-via', target: { type: 'database', label: ['oracle', 'inventory', 'stock'] }, from: 'system-api' } },
      { label: 'Stock lookups use a short-TTL cache', rule: { type: 'edge', from: ['experience-api', 'process-api', 'system-api'], to: 'cache' } },
      { label: 'POS sales are published as events', rule: { type: 'edge', from: 'device', to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'Loyalty and finance each get their own copy of the sales events', rule: { type: 'edge', from: ['topic', 'event-stream'], to: ['queue', 'process-api', 'batch-job'], min: 2 } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        pos: ['device', 'Store POS (400 stores)'],
        web: ['web-app', 'E-commerce site'],
        job: ['batch-job', 'Nightly price sync (22:00, watermark)'],
        mer: ['erp', 'Merchandising system'],
        fs: ['file-store', 'Per-store price files (SFTP)'],
        es: ['experience-api', 'exp-store-stock-api'],
        ss: ['system-api', 'sys-store-inventory-api'],
        ora: ['database', 'Inventory DB (Oracle)'],
        c: ['cache', 'Stock cache (short TTL)'],
        tp: ['topic', 'pos-sales-events'],
        lq: ['queue', 'loyalty-q'],
        fq: ['queue', 'finance-q'],
        dlq: ['dlq', 'sales DLQ'],
        loy: ['process-api', 'prc-loyalty-points'],
        fin: ['process-api', 'prc-finance-load'],
        lsys: ['saas', 'Loyalty platform'],
        fsys: ['erp', 'Finance system'],
      },
      [
        'job -> mer', 'job -> fs', 'pos -> fs',
        'web -> es', 'es -> ss', 'ss -> c', 'ss -> ora',
        'pos ~> tp', 'tp ~> lq', 'tp ~> fq', 'lq ~> loy', 'fq ~> fin', 'lq ~> dlq', 'fq ~> dlq',
        'loy -> lsys', 'fin -> fsys',
      ],
    ),
  },
  description: `
A grocery chain with 400 stores is replacing its old integration scripts. Three data flows must be designed:

1. **Price updates** from the merchandising system to all store POS systems. ~200,000 price changes are approved each evening; new prices must be active when stores open at 07:00.
2. **Stock level** checks for the e-commerce site: when a customer opens a product page, show whether the nearest store has stock. Store inventory DB is central (Oracle).
3. **Sales transactions** from POS to the finance system and the loyalty program. Each store sends ~3,000 transactions/day; loyalty points should appear within a few minutes; finance only needs data by the next morning.

**Questions:**
- For each flow: batch, near-real-time (event/stream), or real-time request/reply? Justify.
- Which Mule 4 building blocks would you use?
- What happens when a run or a message fails in each design?
`,
  answerTemplate: `## Flow 1 — Price updates

## Flow 2 — Stock checks

## Flow 3 — Sales transactions

## Failure handling
`,
  keyPoints: [
    'Price updates: scheduled batch (Scheduler + Batch Job or bulk/file transfer) because a large set must be complete before a fixed deadline.',
    'Stock check: real-time synchronous API (request/reply) because the user waits; protected with caching and timeouts.',
    'Sales: event-driven near-real-time (queue/stream per transaction) for loyalty; finance can consume the same events or an aggregated daily batch.',
    'The choice is driven by latency need, volume, whether a complete set is needed, and who is waiting for the result.',
    'Each design has explicit failure handling: batch record-level errors and rerun, sync errors returned to caller, async retries with a DLQ.',
  ],
  solution: `
**Flow 1 — Price updates: batch.** The business need is "complete set active by 07:00", not "each change in seconds". A **Scheduler** at e.g. 22:00 reads approved changes (watermark on approval timestamp), and a **Batch Job** (or a set-based file per store over SFTP if POS systems accept files) delivers them. Batch gives record-level error handling, step-by-step processing and a summary in the On Complete phase. Size the window: 200k records over 400 stores must finish well before 07:00 with time for a rerun.

**Flow 2 — Stock check: real-time request/reply.** A customer is waiting, so a synchronous \`GET /stores/{id}/stock?sku=\` System/Process API is right. Protect the Oracle DB with short timeouts, connection pooling, and a short-TTL cache (stock does not need to be exact to the second — show "limited stock" wording). Batch would show stale data; events alone would need a local copy of all stock (possible later as a read model if load grows).

**Flow 3 — Sales: event-driven.** Each POS transaction is published as an event (Anypoint MQ exchange or Kafka topic), and **two consumers**: loyalty (processes in minutes) and finance. Finance can either consume the same events and load them, or a nightly job aggregates them — both are fine because finance's need is next-day. One event stream serves both latencies; the producer does not know the consumers.

**Failure handling.**
- *Batch:* failed records collected (accept policy, failed-record report), job is **rerunnable/idempotent** (upsert prices by SKU+store+effective date); alert if not finished by e.g. 05:00.
- *Real-time:* return a clear error/degraded response (e.g. "stock unavailable") instead of hanging; circuit breaker if Oracle is down.
- *Events:* retries with backoff, **dead-letter queue** after N attempts, idempotent consumers (transaction ID) because delivery is at-least-once.

**Rule of thumb:** *who waits* (a user → real-time), *how fresh* (minutes → events), *how much and must it be complete* (large set with deadline → batch).
`,
  followUps: [
    { q: 'The business now wants price changes in stores within 5 minutes during the day. What changes?', a: 'Add an event-driven path for urgent/individual price changes while keeping the nightly batch as the reconciliation/full sync. Running both is common: events for freshness, batch to correct drift.' },
    { q: 'Why not use a Batch Job for the stock check by preloading all stock nightly?', a: 'Stock changes constantly during the day, so a nightly copy is stale for the main use case. A continuously updated read model (via events or CDC) could work, but nightly batch cannot.' },
    { q: 'What if POS stores are offline for hours?', a: 'Stores buffer transactions locally and send them when back online; consumers must handle late and out-of-order events, using transaction timestamps and idempotency rather than arrival order.' },
  ],
}
