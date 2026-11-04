import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-073',
  category: 'architecture',
  title: 'Omnichannel Order Management: OMS as Orchestrator vs Mule Process Layer',
  level: 'EXPERT',
  tags: ['retail', 'supply-chain', 'oms', 'orchestration', 'api-led', 'events', 'bopis', 'ship-from-store'],
  estMinutes: 45,
  diagram: {
    task: 'draw the omnichannel order architecture in which the OMS owns the order lifecycle and Mule provides the channel APIs, order capture, event distribution and fulfilment connectivity to the WMS and stores.',
    checks: [
      { label: 'Web, store and marketplace channels each call an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Order capture is a Process API that hands the order to the OMS System API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['oms', 'order'] } } },
      { label: 'The OMS is reached only through its System API', rule: { type: 'only-via', target: { type: ['saas', 'erp'], label: ['oms', 'order management'] }, from: 'system-api' } },
      { label: 'Order lifecycle changes from the OMS are published as events', rule: { type: 'edge', from: ['system-api', 'saas'], to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'A fulfilment Process API reacts to those events', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'WMS and store POS are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'pos'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'A marketplace order reaches the OMS end to end', rule: { type: 'path', from: 'partner', to: { type: ['saas', 'erp'], label: ['oms', 'order management'] } } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web / app storefront'],
        store: ['internal-app', 'Store associate app (BOPIS, endless aisle)'],
        mkt: ['partner', 'Marketplaces'],
        ecom: ['experience-api', 'exp-commerce-api'],
        estore: ['experience-api', 'exp-store-app'],
        emkt: ['experience-api', 'exp-marketplace-api'],
        pcap: ['process-api', 'prc-order-capture (validate, price, pay auth)'],
        soms: ['system-api', 'sys-oms'],
        oms: ['saas', 'OMS (order management: lifecycle, sourcing)'],
        topic: ['topic', 'order.events (released, shipped, cancelled)'],
        pful: ['process-api', 'prc-fulfilment'],
        swms: ['system-api', 'sys-wms'],
        wms: ['wms', 'DC WMS'],
        spos: ['system-api', 'sys-store-fulfilment'],
        pos: ['pos', 'Store systems (ship-from-store, pick-up)'],
      },
      [
        'web -> ecom', 'store -> estore', 'mkt -> emkt', 'ecom -> pcap', 'estore -> pcap', 'emkt -> pcap',
        'pcap -> soms', 'soms -> oms', 'soms ~> topic', 'topic ~> pful', 'pful -> swms', 'swms -> wms', 'pful -> spos', 'spos -> pos', 'pful -> soms',
      ],
    ),
  },
  description: `
A department-store group (web, app, **180 stores**, and 3 **marketplaces**) is replacing its order flow. Requirements: BOPIS, ship-from-store, split shipments, partial cancellations, returns to any store, and **sourcing** (choose the DC or store that fulfils each line based on stock, distance and cost).

Two camps:
- **Camp A (integration team):** "We already have Mule. Build the order state machine and sourcing as a set of Process APIs (\`prc-order\`, \`prc-sourcing\`) with an Oracle order schema."
- **Camp B (business):** "Buy a commercial **OMS** (e.g. Salesforce Order Management, Manhattan, IBM Sterling). Mule only integrates."

Constraints: go-live before the next peak (11 months), integration team of 8, order volume 40k/day (peak 250k/day), the business expects to tweak sourcing rules monthly, and finance needs every state change for revenue recognition.

**Questions:**
- Which camp do you side with, and where exactly is the boundary between OMS and Mule?
- Draw the architecture: channels, order capture, OMS, event distribution, fulfilment to DCs and stores.
- What does Mule orchestrate, and what must it NOT orchestrate?
- When would Camp A be the right answer?
`,
  answerTemplate: `## Recommendation and boundary

## Architecture

## What Mule orchestrates (and does not)

## When to build the order logic in Mule
`,
  keyPoints: [
    'The order lifecycle (state machine, sourcing, splits, cancellations, returns) is core business logic with long-running state — it belongs in a system of record (the OMS), not in stateless integration flows.',
    'Mule owns connectivity: channel Experience APIs, order capture/validation, System APIs to OMS, WMS, stores, payment and ERP, and event distribution.',
    'The OMS publishes lifecycle events; Mule fans them out to fulfilment, finance and customer notifications asynchronously.',
    'Short, stateless orchestration (capture: validate, price, authorise, submit) is a fine Process API; long-running sagas with business-tunable rules are not.',
    'Building the OMS in Mule is justified only for simple, stable flows or when no product fits — and then it needs its own persistent state and team.',
  ],
  solution: `
**Recommendation: Camp B, with a sharp boundary.** The OMS is the **system of record for order state** and runs sourcing; Mule is the **connectivity and event layer** around it.

\`\`\`
 Web/App ─► exp-commerce ─┐
 Store app ─► exp-store ───┼─► prc-order-capture ─► sys-oms ─► OMS (lifecycle, sourcing, splits)
 Marketplaces ─► exp-mkt ─┘                          │
                                     sys-oms ~► order.events (released / shipped / cancelled / returned)
                                                      ├~► prc-fulfilment ─► sys-wms ─► DC WMS
                                                      │                  └► sys-store-fulfilment ─► stores
                                                      ├~► prc-finance ─► sys-oracle-erp (revenue, invoices)
                                                      └~► prc-notifications ─► email/SMS
\`\`\`

**What Mule orchestrates.**
- **Order capture** (short, synchronous): validate, enrich, re-price check, payment authorisation, submit to OMS, return the order number. Stateless and idempotent (client order id).
- **Fulfilment connectivity**: on \`order.released\`, translate the OMS fulfilment order into WMS waves or store pick tasks; report picks/shipments back to the OMS through \`sys-oms\`.
- **Event distribution** to finance, notifications and analytics.

**What Mule must NOT orchestrate.**
- The order state machine and its long-running transitions (days or weeks for returns).
- Sourcing rules the business changes monthly.
- Compensation logic across lines and shipments. These need durable state, auditability and business tooling — the OMS provides them.

**Why not Camp A.** In 11 months, 8 people would have to build sourcing, split shipments, returns and a state store on top of Mule — effectively writing an OMS, with flows as the place for business rules. It also turns every rule change into a deployment.

**When Camp A fits.** One channel, simple linear flows, rules that rarely change, or an OMS too costly for the volume — and even then put state in a database owned by an order service, not in flow variables.

**Trade-offs:** OMS licence cost and vendor lock-in; the OMS becomes a critical dependency (capture must queue orders if the OMS is down); data model mapping effort into and out of the OMS.
`,
  followUps: [
    { q: 'The OMS is down for 30 minutes during peak. What does order capture do?', a: 'Accept the order after validation and payment authorisation, persist it to a durable queue and return "received", then submit to the OMS when it recovers, with idempotent submission keyed by the client order id.' },
    { q: 'Who owns inventory availability — OMS or the ATP service?', a: 'Many OMS products include availability; pick one owner. If the OMS owns sourcing, it should own availability or consume a single ATP feed — two availability engines will disagree.' },
    { q: 'How do you keep finance consistent with order state changes?', a: 'Consume OMS lifecycle events with per-order ordering and idempotency, post to ERP via a System API, and reconcile daily between OMS and ERP totals.' },
  ],
}
