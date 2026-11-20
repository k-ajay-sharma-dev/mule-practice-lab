import { diagram } from '../../arch/dsl.js'

const OMS = { type: ['saas', 'erp'], label: ['oms', 'order management'] }

export default {
  id: 'ar-073',
  category: 'architecture',
  title: 'Omnichannel Order Management: OMS as Orchestrator vs Mule Process Layer',
  level: 'EXPERT',
  tags: ['retail', 'supply-chain', 'oms', 'orchestration', 'api-led', 'events', 'bopis', 'ship-from-store'],
  estMinutes: 60,
  diagram: {
    task: 'draw the omnichannel order architecture in which the OMS owns the order lifecycle and Mule provides the channel APIs, order capture, event distribution and fulfilment connectivity to the WMS and stores. Put "OMS" in the names of the OMS box and of its System API.',
    checks: [
      { label: 'Web, store and marketplace channels each call an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Order capture is a Process API that hands the order to the OMS System API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['oms', 'order'] } } },
      { label: 'The OMS is reached only through its System API', rule: { type: 'only-via', target: { type: ['saas', 'erp'], label: ['oms', 'order management'] }, from: 'system-api' } },
      { label: 'Order lifecycle changes from the OMS are published as events', rule: { type: 'edge', from: ['system-api', 'saas'], to: ['topic', 'event-stream', 'queue'], kind: 'async' } },
      { label: 'A fulfilment Process API reacts to those events', rule: { type: 'edge', from: ['topic', 'event-stream', 'queue'], to: 'process-api', kind: 'async' } },
      { label: 'WMS and store POS are reached only through System APIs', rule: { type: 'only-via', target: ['wms', 'pos'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'A marketplace order reaches the OMS end to end', rule: { type: 'path', from: 'partner', to: { type: ['saas', 'erp'], label: ['oms', 'order management'] } } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Every Experience API hands its orders to a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Released orders reach both the DC WMS and the stores through the fulfilment Process API', rule: { type: 'path', from: ['topic', 'event-stream', 'queue'], via: 'process-api', to: ['wms', 'pos'], min: 2 } },
      { label: 'Fulfilment results go back to the OMS, which owns the order state', rule: { type: 'path', from: ['topic', 'event-stream', 'queue'], via: 'process-api', to: { type: ['saas', 'erp'], label: ['oms', 'order management'] } } },
      { label: 'Mule keeps no order database of its own. The OMS holds the order state', rule: { type: 'no-edge', from: ['experience-api', 'process-api', 'batch-job'], to: ['database', 'oracle-db', 'sql-server'], ifDrawn: true } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['saas', 'erp', 'wms', 'pos'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'internal-app', 'partner', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web / app storefront'],
        store: ['internal-app', 'Store associate app (BOPIS, endless aisle)'],
        mkt: ['partner', 'Marketplaces'],
        ecom: ['experience-api', 'exp-commerce-api', { replicas: 2 }],
        estore: ['experience-api', 'exp-store-app', { replicas: 2 }],
        emkt: ['experience-api', 'exp-marketplace-api', { replicas: 2, auth: 'client-id' }],
        pcap: ['process-api', 'prc-order-capture (validate, price, pay auth)', { replicas: 2 }],
        soms: ['system-api', 'sys-oms', { replicas: 2, vCores: '0.2' }],
        oms: ['saas', 'OMS (order management: lifecycle, sourcing)'],
        topic: ['topic', 'order.events (released, shipped, cancelled)'],
        pful: ['process-api', 'prc-fulfilment', { replicas: 2 }],
        swms: ['system-api', 'sys-wms', { replicas: 2 }],
        wms: ['wms', 'DC WMS'],
        spos: ['system-api', 'sys-store-fulfilment', { replicas: 2 }],
        pos: ['pos', 'Store systems (ship-from-store, pick-up)'],
      },
      [
        'web -> ecom', 'store -> estore', 'mkt -> emkt', 'ecom -> pcap', 'estore -> pcap', 'emkt -> pcap',
        'pcap -> soms', 'soms -> oms', 'soms ~> topic', 'topic ~> pful', 'pful -> swms', 'swms -> wms', 'pful -> spos', 'spos -> pos', 'pful -> soms',
      ],
    ),
    simulation: {
      systems: [{ match: { type: ['saas', 'erp'], label: ['oms', 'order management'] }, latencyMs: 600, maxRps: 100 }],
      tests: [
        {
          name: 'Peak day orders and an unknown caller',
          about: 'Web sends 20 orders a second, stores 4 and marketplaces 6, and every order goes through in under 2 seconds on average. A caller with no client id also sends 5 orders a second to the marketplace API, and all of them are refused.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 20, to: OMS, kind: 'write' },
            { name: 'stores', from: 'internal-app', rps: 4, to: OMS, kind: 'write' },
            { name: 'marketplaces', from: 'partner', rps: 6, to: OMS, kind: 'write' },
            { name: 'unknown caller', from: 'partner', rps: 5, to: OMS, kind: 'write', auth: 'none' },
          ],
          expect: {
            answers: [
              { flow: 'web', minSuccess: 0.99, maxMs: 2000 },
              { flow: 'stores', minSuccess: 0.99, maxMs: 2000 },
              { flow: 'marketplaces', minSuccess: 0.99, maxMs: 2000 },
              { flow: 'unknown caller', minRefused: 0.99 },
            ],
          },
        },
        {
          name: 'A zone fails at peak',
          about: 'One availability zone fails while the channels send 30 orders a second. Every API on the order capture and fulfilment paths keeps a replica running, inside the 2.5 vCore budget.',
          traffic: [
            { name: 'web', from: 'web-app', rps: 20, to: OMS, kind: 'write' },
            { name: 'stores', from: 'internal-app', rps: 4, to: OMS, kind: 'write' },
            { name: 'marketplaces', from: 'partner', rps: 6, to: OMS, kind: 'write' },
          ],
          incidents: [{ zone: true }],
          expect: { answers: [{ minSuccess: 0.99 }], vCores: { max: 2.5 } },
        },
        {
          name: 'A store system is offline',
          about: 'The OMS releases 8 orders a second to the DCs and 4 to stores. The store systems are offline for 20 minutes. DC releases carry on, and store releases wait and arrive once the stores are back, with none lost.',
          traffic: [
            { name: 'DC releases', from: { type: 'system-api', label: 'oms' }, rps: 8, to: 'wms', kind: 'write' },
            { name: 'store releases', from: { type: 'system-api', label: 'oms' }, rps: 4, to: 'pos', kind: 'write' },
          ],
          incidents: [{ down: 'pos', at: 5, forMin: 20 }],
          durationMin: 45,
          expect: { delivered: [{ flow: 'DC releases', to: 'wms', min: 0.99 }, { flow: 'store releases', to: 'pos', min: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A department-store group (web, app, **180 stores**, and 3 **marketplaces**) is replacing its order flow.

Requirements:
- BOPIS
- Ship-from-store
- Split shipments
- Partial cancellations
- Returns to any store
- **Sourcing**: choose the DC or store that fulfils each line based on stock, distance and cost

Two camps:
- **Camp A (integration team):** "We already have Mule. Build the order state machine and sourcing as a set of Process APIs (\`prc-order\`, \`prc-sourcing\`) with an Oracle order schema."
- **Camp B (business):** "Buy a commercial **OMS** (e.g. Salesforce Order Management, Manhattan, IBM Sterling). Mule only integrates."

Constraints:
- Go-live before the next peak (11 months).
- Integration team of 8.
- Order volume 40k/day (peak 250k/day).
- The business expects to tweak sourcing rules monthly.
- Finance needs every state change for revenue recognition.

Numbers for sizing:
- In the busiest minutes of peak day, web sends **20 orders a second**, stores **4** and marketplaces **6**. Each order is captured into the OMS, and its fulfilment update goes back to the OMS too.
- The OMS answers in about 600 ms and accepts **100 calls a second**. Order capture must answer in under **2 seconds** on average.
- Marketplaces call with a client id. Calls without one must be refused.
- The OMS releases about **8 orders a second** to the DCs and **4** to stores. Store systems can be offline for **20 minutes**, and no release may be lost. A broker redelivers a failed message about **once a minute**.
- Order capture must keep working when one availability zone fails.
- The budget for the Mule apps is **2.5 vCores**.

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
    'The order lifecycle (state machine, sourcing, splits, cancellations, returns) is core business logic with long-running state. It belongs in a system of record (the OMS), not in stateless integration flows.',
    'Mule owns connectivity: channel Experience APIs, order capture/validation, System APIs to OMS, WMS, stores, payment and ERP, and event distribution.',
    'The OMS publishes lifecycle events; Mule fans them out to fulfilment, finance and customer notifications asynchronously.',
    'Short, stateless orchestration (capture: validate, price, authorise, submit) is a fine Process API; long-running sagas with business-tunable rules are not.',
    'Building the OMS in Mule is justified only for simple, stable flows or when no product fits, and then it needs its own persistent state and team.',
    'Two replicas per API survive a zone outage; client id enforcement guards the marketplace API; size the OMS System API for capture plus fulfilment updates; a persistent topic holds releases for an offline store.',
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
- Compensation logic across lines and shipments. These need durable state, auditability and business tooling, which the OMS provides.

**Why not Camp A.** In 11 months, 8 people would have to build sourcing, split shipments, returns and a state store on top of Mule. That is effectively writing an OMS, with flows as the place for business rules. It also turns every rule change into a deployment.

**When Camp A fits.** One channel, simple linear flows, rules that rarely change, or an OMS too costly for the volume. Even then, put state in a database owned by an order service, not in flow variables.

**Sizing and failure handling.**
- Every API runs 2 replicas, so a zone outage leaves one of each running and capture keeps working.
- \`exp-marketplace-api\` enforces client ids, so a caller without one is refused before it reaches order capture.
- \`sys-oms\` carries both the captured orders and the fulfilment updates (about 60 calls a second at peak), so it runs 2 × 0.2 vCore. The other APIs fit on 0.1 vCore per replica. In total 1.8 vCores, inside the 2.5 vCore budget.
- The order events topic is persistent and keeps retrying a release while a store is offline. With redelivery about once a minute, a limit below 20 would drop releases for an offline store, so set none (or one well above 20, with a dead-letter queue).

**Trade-offs:** OMS licence cost and vendor lock-in; the OMS becomes a critical dependency (capture must queue orders if the OMS is down); data model mapping effort into and out of the OMS.
`,
  followUps: [
    { q: 'The OMS is down for 30 minutes during peak. What does order capture do?', a: 'Accept the order after validation and payment authorisation, persist it to a durable queue and return "received". Then submit to the OMS when it recovers, with idempotent submission keyed by the client order id.' },
    { q: 'Who owns inventory availability: the OMS or the ATP service?', a: 'Many OMS products include availability; pick one owner. If the OMS owns sourcing, it should own availability or consume a single ATP feed, because two availability engines will disagree.' },
    { q: 'How do you keep finance consistent with order state changes?', a: 'Consume OMS lifecycle events with per-order ordering and idempotency, post to ERP via a System API, and reconcile daily between OMS and ERP totals.' },
  ],
}
