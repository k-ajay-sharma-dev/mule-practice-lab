export default {
  id: 'ar-058',
  category: 'architecture',
  title: 'The Cost of Hops: Latency, Caching and Logical vs Physical Layers',
  level: 'ADVANCED',
  tags: ['api-led', 'performance', 'latency', 'caching', 'deployment'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The Process API calls PIM (250 ms), price (120 ms) and stock (400 ms) sequentially. Roughly how long do the backend calls take after switching to Scatter-Gather?',
      options: ['770 ms', '~400 ms (the slowest route) plus merge overhead', '120 ms', '1.4 s'],
      answer: 1,
      explain: 'Parallel independent calls cost about the slowest route rather than the sum — the single biggest win here.',
    },
    {
      type: 'order',
      prompt: 'Order these fixes by expected impact, biggest first.',
      items: [
        'Parallelise the three System API calls',
        'Call internal/private endpoints instead of the public load balancer',
        'Cache product content and prices',
        'Right-size the 0.2 vCore apps and tune connection pools',
      ],
      explain: 'Sequential composition and hairpin routing cost the most; caching then removes most PIM/price calls, and right-sizing removes queueing under load.',
    },
    {
      type: 'match',
      prompt: 'Match each kind of data to the right caching decision.',
      pairs: [
        ['Product content (PIM)', 'Hours, at the Process or System API, evicted on PIM publish'],
        ['Price', 'Minutes in the Process API, or event-driven invalidation'],
        ['Stock', 'Event-fed read model or ≤ 1 min for listings, never for checkout'],
        ['Whole anonymous search response', 'Short TTL at the Experience API / CDN via HTTP cache headers'],
      ],
      explain: 'Cache closest to the consumer that can accept the staleness, and as low as possible when many consumers benefit.',
    },
    {
      type: 'single',
      prompt: 'What do you lose by co-deploying a thin Experience API and its Process API in one Mule app?',
      options: [
        'The ability to use DataWeave',
        'Independent scaling and deploys, blast-radius isolation and gateway policies on the internal call (in-process calls bypass the gateway)',
        'The API specs',
        'Nothing at all',
      ],
      answer: 1,
      explain: 'Co-location removes a hop and cost; keep separate specs and modules so you can split again later.',
    },
    {
      type: 'single',
      prompt: 'A senior developer proposes that the mobile app call the databases directly. Best response?',
      options: [
        'Agree — API-led is too slow for mobile',
        'Direct access gives up security, decoupling and reuse to save time that parallelism, internal routing and caching can recover',
        'Agree, but only for read operations',
        'Move all logic into the Experience API instead',
      ],
      answer: 1,
      explain: 'The latency comes from sequential calls and routing, not from the existence of layers.',
    },
    {
      type: 'single',
      prompt: 'Is Scatter-Gather always faster?',
      options: [
        'Yes, always',
        'Only when the calls are independent and the backends can handle the concurrency; it also uses more threads and connections at once',
        'No, it is always slower than sequential calls',
        'Only on CloudHub 2.0',
      ],
      answer: 1,
      explain: 'Parallelism has a resource cost — size pools and replicas accordingly.',
    },
  ],
  description: `
A product-search screen must respond in **≤ 800 ms at p95**. Measured p95 end-to-end is **1.4 s**. Current chain:

\`\`\`
mobile -> exp-mobile-api -> prc-product-api -> sys-pim-api        (PIM, p95 250 ms)
                                           -> sys-price-api      (pricing DB, p95 120 ms)
                                           -> sys-stock-api      (WMS, p95 400 ms)
\`\`\`

Facts:
- Each Mule app runs separately on CloudHub 2.0 (0.2 vCore, 1 replica).
- The Process API calls the three System APIs **sequentially**.
- Every call goes through the public load balancer because developers used the public URLs.

A senior developer says: *"API-led is too slow — let's have the mobile app call the databases directly."*

**Questions:**
1. Build a **latency budget** for the chain. Where does the time go?
2. List concrete fixes, ordered by impact.
3. Where would you cache, at which layer, and with what TTL/invalidation?
4. Explain *"API-led is logical, not physical"*. When would you deploy two layers in one app, and what do you lose?
`,
  answerTemplate: `## Latency budget

## Fixes by impact

## Caching per layer

## Logical vs physical
`,
  keyPoints: [
    'Sequential calls sum backend latencies (~770 ms p95 before any overhead); making independent calls parallel reduces it to roughly the slowest dependency.',
    'Each hop adds network, TLS, policy and serialization overhead; routing internal calls via public endpoints adds more — use internal/private endpoints within the same region/space.',
    'Cache at the right layer for the data\'s volatility: product content (long TTL) near the System/Process layer, price (medium), stock (short or none); HTTP caching at the Experience layer for anonymous data.',
    'Undersized replicas (0.2 vCore) under load add queueing latency; right-size and scale out before redesigning.',
    'API-led layers are design boundaries; a thin layer can be co-deployed (e.g. as a separate flow/module in the same app) to remove a hop, at the cost of independent scaling, deployment and fault isolation.',
  ],
  solution: `
**Latency budget (p95, approximate).**

| Segment | Time |
|---|---|
| Mobile ↔ Experience (internet, TLS) | 100–150 ms (outside your control) |
| Experience overhead (policies, DataWeave) | 10–30 ms |
| Exp → Process via **public** LB | 20–60 ms per hop vs a few ms internally |
| Process → 3 System APIs **sequential** | 250 + 120 + 400 = **770 ms** + 3 hops overhead |
| System → backends | included above |
| Queueing on 0.2 vCore under load | variable, can be 100s of ms |

The problem is mostly **sequential composition** and **routing**, not the existence of layers. Pure hop overhead inside one region on private networking is typically single-digit to low tens of ms per hop — measure it rather than assume.

**Fixes by impact.**
1. **Parallelise** the three System calls in the Process API (Scatter-Gather): 770 ms → ~400 ms (slowest) + merge.
2. **Call internal endpoints** (private ingress / internal service URLs in the Private Space) instead of the public LB; avoid hairpinning out and back in.
3. **Cache** (see below) — removes most PIM and price calls entirely.
4. **Right-size**: 0.2 vCore apps doing heavy DataWeave and parallel calls may CPU-starve; increase size or replicas and check thread/connection pools; keep-alive connections on HTTP requesters.
5. **Tune payloads**: request only needed fields from System APIs (field selection), stream large responses, avoid repeated JSON ↔ Java conversions.
6. **Stock**: 400 ms from WMS — ask whether search results need live stock. Often "in stock / low / out" refreshed every minute is enough (cached or event-fed read model), with live stock checked only on the product detail or checkout.
7. Set per-hop **timeouts** with a decreasing budget so a slow dependency returns partial results instead of breaking the SLA.

**Caching per layer.**

| Data | Volatility | Where | TTL / invalidation |
|---|---|---|---|
| Product content (PIM) | Changes daily | Process or System API (Object Store / Cache scope), or HTTP caching policy | Hours; invalidate on PIM publish event if available |
| Price | Changes several times a day | Process API | Minutes; or event-driven invalidation from pricing |
| Stock | Changes constantly | Event-fed read model or short TTL (≤ 1 min) | Accept staleness only for listing, not checkout |
| Whole search response (anonymous) | — | Experience API / CDN with HTTP cache headers | Short, keyed by query |

Rule: cache **closest to the consumer that can accept the staleness**, and as low as possible when many consumers benefit (a System API cache helps every Process API).

**Logical vs physical.** The three layers are **responsibilities and contracts**, not mandatory separate deployments. Options:
- Separate apps (default): independent scaling, deployment, ownership, failure isolation, clear policies per API.
- **Co-deployed**: e.g. a thin Experience API and its Process API in one Mule app, with the Experience flows calling Process logic via \`flow-ref\` (or the Process API's flows packaged as a shared module). The Process API can still also be exposed on its own HTTP listener with its own API Manager instance for other consumers.
- When: tight latency budgets, very thin layers, small team, low reuse, cost pressure.
- What you lose: independent scaling/deploys, blast-radius isolation, per-layer policy enforcement for internal calls (in-process calls bypass the gateway), and it is easy to leak logic across the boundary. Keep the code structured (separate modules/flows, separate specs) so you can split later.

**Answer to the senior developer:** direct DB access from mobile removes security, decoupling and reuse to save ~100 ms that can be recovered by parallelism, internal routing and caching.
`,
  followUps: [
    { q: 'How do you find which hop is slow in production?', a: 'Propagate a correlation id and use distributed tracing / Anypoint Monitoring per app (response time per API and per outbound request), then compare each layer\'s time with its downstream time — the difference is that layer\'s own overhead.' },
    { q: 'Does caching in the Process API break the System API\'s contract?', a: 'No, but consumers must know data can be stale; document freshness in the API spec, and avoid caching data that drives writes or money decisions without validation at write time.' },
    { q: 'Is Scatter-Gather always faster?', a: 'Only if the calls are independent and the backends can handle concurrency. It also uses more threads and connections at once, so size pools and replicas accordingly.' },
  ],
}
