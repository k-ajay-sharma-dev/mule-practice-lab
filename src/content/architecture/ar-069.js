import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-069',
  category: 'architecture',
  title: 'Inventory Availability: Single Source of Truth vs Distributed ATP',
  level: 'ADVANCED',
  tags: ['supply-chain', 'retail', 'inventory', 'atp', 'caching', 'reservations', 'oracle', 'events'],
  estMinutes: 40,
  diagram: {
    task: 'draw the availability architecture: channels, the ATP read path, the reservation write path to the inventory system of record, and how stock changes from the WMS and stores keep availability fresh.',
    checks: [
      { label: 'Web, mobile and store channels call Experience APIs', rule: { type: 'each', of: ['web-app', 'mobile-app', 'internal-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Availability reads are served from an ATP read model / cache', rule: { type: 'edge', from: { type: 'process-api', label: ['atp', 'availab'] }, to: 'cache' } },
      { label: 'Reservations go synchronously to the inventory system of record', rule: { type: 'path', from: { type: 'process-api', label: ['reserv', 'allocat'] }, to: ['database', 'erp'] } },
      { label: 'Stock changes are published as events by System APIs', rule: { type: 'edge', from: 'system-api', to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'The ATP service is updated from those events', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'Oracle inventory and the WMS are reached only through System APIs', rule: { type: 'only-via', target: ['database', 'erp', 'wms'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'E-commerce site'],
        mob: ['mobile-app', 'Mobile app'],
        store: ['internal-app', 'Store associate app'],
        ecom: ['experience-api', 'exp-commerce-api'],
        estore: ['experience-api', 'exp-store-app-api'],
        atp: ['process-api', 'prc-atp (availability)'],
        cache: ['cache', 'ATP read model (per SKU x node, Object Store / Redis)'],
        resv: ['process-api', 'prc-reservation'],
        sinv: ['system-api', 'sys-oracle-inventory'],
        db: ['database', 'Oracle inventory (system of record)'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'WMS (DC stock)'],
        spos: ['system-api', 'sys-pos-sales'],
        pos: ['pos', 'Store POS'],
        topic: ['topic', 'inventory.changed'],
      },
      [
        'web -> ecom', 'mob -> ecom', 'store -> estore', 'ecom -> atp', 'estore -> atp', 'ecom -> resv', 'estore -> resv',
        'atp -> cache', 'resv -> sinv', 'sinv -> db', 'swms -> wms', 'spos -> pos',
        'sinv ~> topic', 'swms ~> topic', 'spos ~> topic', 'topic ~> atp',
      ],
    ),
  },
  description: `
An omnichannel retailer sells through **web, mobile app and 250 stores** (BOPIS and ship-from-store). Stock lives in several places:
- **Oracle** inventory tables (the official book stock and reservations), updated by ERP jobs.
- **WMS** for 3 distribution centres: real-time picks and receipts.
- **Store POS**: sales decrement store stock, and counts arrive nightly.

Problems today:
- Product pages call Oracle directly for availability (**8,000 reads/s at peak**), and Oracle is at 90% CPU.
- The web team now wants to cache stock in their own Redis.
- During the last sale, 3% of orders were **oversold** because two channels sold the last unit at the same time.

**Questions:**
- Should there be ONE source of truth for inventory, or should each channel hold its own availability? Defend your answer.
- Design the **read path** (availability on product and store pages) and the **write path** (reserve stock at checkout).
- How do changes from the WMS and POS reach the availability view, and how stale can it be?
- How do you prevent overselling the last unit?
`,
  answerTemplate: `## Source of truth decision

## Read path (ATP)

## Write path (reservation)

## Keeping availability fresh

## Overselling and safety stock
`,
  keyPoints: [
    'One system of record for the inventory ledger and reservations (Oracle via sys-oracle-inventory); availability is a derived, distributed read model — not a second truth.',
    'A dedicated ATP Process API serves reads from a read model/cache built from inventory events, so 8,000 reads/s never touch Oracle.',
    'Reservations are synchronous and atomic against the system of record (conditional update / reservation row), which is where overselling is prevented.',
    'WMS, POS and Oracle changes are published as events; the ATP service applies them per SKU-location in order and tolerates seconds of staleness.',
    'Safety stock / low-stock thresholds and "confirm at checkout" turn read staleness into a business rule rather than a bug.',
  ],
  solution: `
**Decision: single source of truth for the ledger, distributed availability for reads.**
Letting each channel keep its own stock (the web team's Redis) creates N truths that drift and still oversell, because nobody owns the reservation. Instead:
- **Oracle (behind \`sys-oracle-inventory\`) owns on-hand and reservations.**
- **\`prc-atp\` owns the availability calculation** (on hand − reserved − safety stock, per SKU × location), served from a read model.

\`\`\`
 web / app ──► exp-commerce ──► prc-atp ──► ATP read model (cache)          READ  (8k/s, ~seconds stale)
                     └────────► prc-reservation ──► sys-oracle-inventory ──► Oracle   WRITE (atomic)
 WMS ◄─ sys-wms ─┐
 POS ◄─ sys-pos ─┼──~► inventory.changed ──~► prc-atp (updates read model per SKU-location)
 Oracle ◄─ sys-oracle-inventory ─┘
\`\`\`

**Read path.** Product and store pages call the Experience API, which calls \`prc-atp\`. ATP answers from a read model (Object Store v2 for modest volume, or an external cache such as Redis for 8k/s), keyed by SKU + location. It returns a **banded** answer for low stock ("only a few left") rather than exact counts.

**Write path.** At checkout, \`prc-reservation\` calls \`sys-oracle-inventory\` to reserve, which runs a **conditional update** in one Oracle transaction (e.g. update available quantity where available ≥ requested, or insert a reservation row and check the sum) and returns success or "insufficient". This is the only place the last unit is decided, so two channels can never both win. Reservations carry an expiry so abandoned carts release stock.

**Freshness.** \`sys-wms\`, \`sys-pos-sales\` and \`sys-oracle-inventory\` publish \`inventory.changed\` events (SKU, location, new quantity, sequence). \`prc-atp\` consumes them and updates the read model, ignoring events with a lower sequence than already applied. Target staleness: seconds; documented in the API contract.

**Overselling.** Remaining risk comes from POS sales not yet reported (store stock). Mitigate with per-location safety stock, excluding stores whose last update is too old from BOPIS, and confirming at reservation time.

**Trade-offs:** the read model is eventually consistent (accepted); one more service (ATP) to run; Oracle remains a write bottleneck, but writes are ~100× fewer than reads.
`,
  followUps: [
    { q: 'The web team says a 30-second TTL cache is good enough. Is it?', a: 'A TTL cache still hammers Oracle on every expiry and can be stale for 30 s with no way to update it early. An event-updated read model is fresher and removes the read load entirely; a short TTL can remain as a safety net.' },
    { q: 'Where would you do the reservation if Oracle cannot handle the checkout peak?', a: 'Shard reservations by SKU into a dedicated reservation store (or allocate quotas per channel in advance) and reconcile to Oracle asynchronously. But that moves the source of truth for reservations, which must then be explicitly owned.' },
    { q: 'How do you rebuild the ATP read model after corruption?', a: 'Take a snapshot of on-hand and open reservations from Oracle through the System API, load it with its sequence/high-water mark, then resume consuming events after that mark.' },
  ],
}
