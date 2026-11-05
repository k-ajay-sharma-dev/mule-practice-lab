import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-041',
  category: 'use-cases',
  title: 'Dynamic Pricing Feed to 800 Stores and Online',
  level: 'ADVANCED',
  tags: ['pricing', 'fan-out', 'kafka', 'store-systems', 'retail', 'consistency'],
  estMinutes: 35,
  diagram: {
    task: 'draw the price distribution network: change-set intake from the pricing engine, the Price Distribution Process API, the durable per-store stream, the store delivery workers for POS and shelf labels, the online consumer and the delivery-state store.',
    checks: [
      { label: 'The Process API fetches change sets from the pricing engine through a Pricing System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: { type: ['saas', 'external-api'], label: ['pricing', 'price engine'] } } },
      { label: 'Split change sets are published to a durable stream keyed by store (async)', rule: { type: 'edge', from: 'process-api', to: ['event-stream', 'topic', 'queue'], kind: 'async' } },
      { label: 'Store delivery and the online shop consume the stream independently', rule: { type: 'edge', from: ['event-stream', 'topic', 'queue'], to: ['process-api', 'batch-job'], kind: 'async', min: 2 } },
      { label: 'Store servers (POS) are reached only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'database'], label: ['pos', 'store server'] }, from: 'system-api' } },
      { label: 'The shelf-label vendor is reached only through a System API', rule: { type: 'only-via', target: { type: ['saas', 'external-api'], label: ['esl', 'shelf', 'label'] }, from: 'system-api' } },
      { label: 'The online shop gets its prices from the stream, independent of the stores', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: { type: ['saas', 'external-api', 'database'], label: ['online', 'e-commerce', 'ecommerce', 'shop', 'web'] } } },
      { label: 'Per-store delivery state (last applied version) is stored for head office', rule: { type: 'edge', from: ['process-api', 'batch-job'], to: 'database' } },
    ],
    reference: diagram(
      {
        pe: ['saas', 'Pricing engine'],
        hook: ['experience-api', 'exp-price-change-webhook'],
        prc: ['process-api', 'prc-price-distribution-api'],
        spe: ['system-api', 'sys-pricing-engine-api'],
        claim: ['file-store', 'Change-set payloads (claim check)'],
        k: ['event-stream', 'price-changes (key = storeId)'],
        sw: ['process-api', 'prc-store-price-delivery'],
        ow: ['process-api', 'prc-online-price-sync'],
        state: ['database', 'Per-store delivery state'],
        spos: ['system-api', 'sys-store-pos-api'],
        sesl: ['system-api', 'sys-esl-api'],
        secom: ['system-api', 'sys-ecommerce-api'],
        pos: ['legacy', 'Store servers / POS (800)'],
        esl: ['saas', 'ESL shelf-label vendor cloud'],
        ecom: ['saas', 'Online shop'],
      },
      [
        'pe -> hook', 'hook -> prc', 'prc -> spe', 'spe -> pe', 'prc -> claim', 'prc ~> k', 'k ~> sw', 'k ~> ow',
        'sw -> spos', 'spos -> pos', 'sw -> sesl', 'sesl -> esl', 'sw -> state', 'ow -> secom', 'secom -> ecom',
      ],
    ),
  },
  description: `
A supermarket chain introduces a **pricing engine** that recalculates prices based on demand, competitor prices and expiry dates. Prices must reach **800 stores** (POS and electronic shelf labels) and the **online shop**.

Facts:
- The pricing engine produces **price change sets**: normally 50,000 changes/day; markdown runs for fresh products at 14:00 and 18:00 produce up to **200,000 changes** in a few minutes. Output is a REST endpoint to fetch change sets, plus a notification webhook.
- Each store has a **store server** (POS back office) reachable over a VPN with a REST API; **~5% of stores are offline** at any time (network issues), sometimes for a day.
- Electronic shelf labels (ESL) are managed by a vendor cloud API per store.
- **Legal constraint:** the price on the shelf label must equal the price charged at the POS. Changes must be applied in the store **POS first, then ESL**, or both at an agreed effective time.
- Some prices are **store-specific** (regional zones), others national. Online uses the national price plus delivery zone overrides.
- Head office needs to know, per store, which change set is active.

**Describe your solution:**
- How do you distribute change sets to 800 stores efficiently?
- How do you keep POS and shelf labels consistent?
- What happens with offline stores and out-of-order change sets?
- How do you track and report delivery state?
`,
  answerTemplate: `## Overall architecture

## Change-set intake and splitting

## Distribution per store

## POS and ESL consistency

## Offline stores and ordering

## Observability and control
`,
  keyPoints: [
    'Change sets fetched once, versioned, and split per store/zone in a Process API; one durable stream/queue partition per store (e.g. Kafka topic keyed by store ID or per-store queues).',
    'Per-store consumers deliver to the store server with retries, preserving order by change-set version.',
    'POS updated first and confirmed, then ESL; or both scheduled with an effective time, so customers are never charged differently from the label.',
    'Offline stores catch up from the durable log when back; superseded intermediate prices can be collapsed to the latest per item.',
    'Per-store delivery state (last applied version, failures) stored and shown on a dashboard; alerts for stores lagging behind.',
    'Online shop receives national prices via its own consumer, independent of store delivery.',
  ],
  solution: `
**Overall architecture.**
- **Pricing System API** fetches change sets when the webhook signals a new one.
- **Price Distribution Process API** validates, versions and splits change sets.
- **Event backbone**: a Kafka topic (Apache Kafka connector) keyed by **store ID**, or Anypoint MQ with per-store queues / FIFO. The key requirements are durability, order per store, and replay.
- **Store delivery workers** consume per store and call the store server; an **ESL worker** calls the ESL vendor API.
- An **online** consumer pushes national/zone prices to the e-commerce platform.

**Change-set intake and splitting.** Each change set gets a monotonic **version**. DataWeave resolves which stores each change applies to (national → all, zone → stores in that zone via a store-to-zone lookup) and groups by store. It produces one message per store per change set (a 200,000-line markdown becomes ~800 messages of a few hundred lines each, not 160 million rows). Large payloads can be stored in object storage with the message carrying a reference (claim-check pattern).

**Distribution per store.** Workers process messages for a store **in version order**. Calls to the store server are idempotent (store records last applied version; a re-sent version is acknowledged without change). Concurrency across stores is high; within one store, sequential.

**POS and ESL consistency.**
1. Send prices to POS with **effective time**; wait for confirmation.
2. Then send to ESL for that store.

Alternative when both support it: send both with the same future effective time (e.g. 14:15) and confirm both before it; if ESL confirmation fails, POS change is rolled back or the effective time is postponed. Store staff get a list of manual labels for items without ESL.

**Offline stores and ordering.** If a store is unreachable, its messages stay in its partition/queue; retries with backoff, then periodic retries. When it reconnects, the backlog is applied in order. Optimisation: if many versions are queued, **collapse** to the latest price per item before sending (fewer calls, same end state). Stores offline > 4 hours trigger an alert to store operations.

**Observability and control.** A state table: store, last applied POS version, last applied ESL version, last error. Dashboard and API for head office ("which stores are not on version 4711?"). Alerts on lag and on POS/ESL mismatch. Business rules (markdown limits, minimum margin) are validated before distribution; anything that breaks them is held for approval.

**NFRs.** Markdown runs must reach online stores within minutes: test 800 parallel deliveries; size workers and connection pools for VPN latency.
`,
  followUps: [
    { q: 'Why Kafka instead of a simple queue?', a: 'Per-store ordering, retention for replay and many independent consumers (stores, online, analytics) fit a partitioned log. Anypoint MQ with per-store FIFO queues also works but means 800 queues to manage.' },
    { q: 'What if a store server applies a price but the confirmation is lost?', a: 'The retry re-sends the same version; the store server reports it is already applied, and the worker records success — idempotency by version.' },
    { q: 'Could stores pull prices instead?', a: 'Yes — stores could poll a Price API for "changes since version X". Pull handles offline stores naturally but needs software changes in 800 store servers; push is chosen when stores cannot be changed.' },
  ],
}
