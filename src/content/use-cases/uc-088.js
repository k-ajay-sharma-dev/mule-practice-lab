import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-088',
  category: 'use-cases',
  title: 'Personalised Offers at the Till with an Offline Fallback',
  level: 'ADVANCED',
  tags: ['loyalty', 'retail', 'pos', 'caching', 'latency', 'fallback', 'event-driven'],
  estMinutes: 35,
  diagram: {
    task: 'draw the offers design: tills through the gateway to an Experience API, offer lookups from a cache filled each night, the offers engine and the redemptions database behind System APIs, a store queue for offline redemptions, and redemptions published to the engine and the data warehouse.',
    checks: [
      { label: 'Tills reach the offers API through the gateway', rule: { type: 'path', from: 'pos', via: 'api-gateway', to: 'experience-api' } },
      { label: 'Offer lookups read a cache filled in advance', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'A nightly job loads offers into the cache', rule: { type: 'edge', from: 'batch-job', to: 'cache' } },
      { label: 'The offers engine is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The redemptions database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Redemptions are published for the engine and the warehouse', rule: { type: 'path', from: 'process-api', via: ['topic', 'event-stream', 'queue'], to: ['data-warehouse', 'saas'], min: 2 } },
      { label: 'Offline till redemptions wait in a store queue', rule: { type: 'edge', from: 'pos', to: ['queue', 'cloud-queue'], kind: 'async' } },
      { label: 'The till never waits on the data warehouse', rule: { type: 'no-path', from: 'pos', to: 'data-warehouse', kind: 'sync' } },
    ],
    reference: diagram(
      {
        pos: ['pos', 'Tills (650 stores)'],
        sq: ['queue', 'Store outbox (offline redemptions)'],
        gw: ['api-gateway', 'Gateway (store client certificates)'],
        exp: ['experience-api', 'exp-pos-offers'],
        prc: ['process-api', 'prc-member-offers'],
        cache: ['cache', 'Member offers cache (12 M members)'],
        load: ['batch-job', 'Nightly offers load'],
        seng: ['system-api', 'sys-offers-engine'],
        eng: ['saas', 'Offers engine'],
        red: ['process-api', 'prc-offer-redemption'],
        sred: ['system-api', 'sys-redemptions'],
        db: ['database', 'Redemptions (single-use offers)'],
        top: ['topic', 'offer-redemptions'],
        dw: ['data-warehouse', 'Data warehouse'],
      },
      [
        'pos -> gw', 'gw -> exp', 'exp -> prc', 'prc -> cache', 'prc -> seng', 'seng -> eng', 'load -> seng', 'load -> cache',
        'exp -> red', 'red -> sred', 'sred -> db', 'red ~> top', 'top ~> seng', 'top ~> dw', 'pos ~> sq', 'sq ~> red',
      ],
    ),
  },
  description: `
A health and beauty chain has **650 stores** and **4,000 tills**, and a loyalty scheme with **12 million members**. An offers engine (SaaS, machine learning) picks **up to 20 personalised offers** per member each night, for example "£2 off any sun cream, once".

The new requirement: when the member's card is scanned at the till, the till shows their offers and applies the ones in the basket.

Constraints:
- The till waits at most **300 ms** for offers. After that it carries on without them; the queue must not stop.
- Peak load is **1,500 card scans a second** on Saturday afternoon.
- The offers engine API answers in **400 to 900 ms** and allows 200 calls a second.
- Store WAN links fail about twice a month per store, for up to 2 hours.
- **Single-use** offers must not be redeemed twice, for example in two stores on the same day.
- Every redemption goes back to the offers engine (it learns from them) and to the data warehouse.

**Questions:**
1. How do you answer in under 300 ms at 1,500 scans a second?
2. How do you stop a single-use offer being redeemed twice?
3. What does the till do when the store is offline?
4. How do redemptions reach the engine and the warehouse?
`,
  answerTemplate: `## Lookup path

## Cache loading

## Redemption

## Offline stores

## Feeding the engine and the warehouse
`,
  keyPoints: [
    'Offers are loaded into a cache each night, so a lookup is one key read; the live engine is only a fallback for a cache miss.',
    'Tills reach exp-pos-offers through the gateway with a client certificate per store and a 300 ms timeout on the till side.',
    'A redemption is recorded in a central table with a unique key on member plus offer, so a second use is refused.',
    'Offline tills apply only general offers and keep redemptions in a store queue that forwards them when the link returns.',
    'Redemptions are published to a topic; the engine and the data warehouse each consume it, never in the till path.',
  ],
  solution: `
**Lookup path.** Till, then gateway, then exp-pos-offers, then prc-member-offers. The Process API reads the member's offers from the **cache** by member ID: one key read, a few milliseconds. On a miss (a member who joined today) it calls the offers engine through sys-offers-engine with a 200 ms timeout, and returns no offers if that fails. The till applies its own 300 ms timeout as a last guard. 1,500 scans a second are cache reads, not engine calls.

**Cache loading.** The nightly job reads the engine's offers for every member after its 02:00 run and writes them to the cache with a 30 hour TTL (the engine also offers a bulk export, which is faster than 12 million API calls). The cache is a managed store sized for 12 million entries of about 2 KB.

**Redemption.** When the basket is paid, the till calls exp-pos-offers, then prc-offer-redemption. It inserts member plus offer plus transaction into the redemptions table through sys-redemptions. A **unique key on member plus offer** for single-use offers means a second insert fails, and the till gets "offer already used" and removes the discount before payment completes. Repeated calls with the same transaction ID are treated as success.

**Offline stores.** Without WAN, the till cannot check single-use offers centrally. It applies only general offers that it holds locally, and writes any redemption to the **store outbox queue**. When the link returns, the queue forwards the redemptions to prc-offer-redemption. A clash found then is logged for fraud review; the risk is small and accepted by the business.

**Feeding the engine and the warehouse.** After each successful redemption, prc-offer-redemption publishes to **offer-redemptions**. sys-offers-engine consumes it and posts batches to the engine; the warehouse loads it in micro-batches. Neither is on the till's path, so their speed never affects the queue in the store.
`,
  followUps: [
    { q: 'Why not call the offers engine live for every scan?', a: 'It answers in up to 900 ms and allows 200 calls a second. The till needs 300 ms at 1,500 scans a second, which only a cache can give.' },
    { q: 'What if the nightly load fails?', a: 'The 30 hour TTL keeps yesterday’s offers alive, and the job alerts. Most offers last several days, so yesterday’s set is still mostly right.' },
    { q: 'Why record redemptions centrally and not in the engine?', a: 'The engine is slow and outside our control. A central table with a unique key gives a quick, reliable answer to the question of whether an offer was used.' },
  ],
}
