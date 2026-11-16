import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-122',
  category: 'architecture',
  title: 'A Process API Calling Two System APIs',
  level: 'BEGINNER',
  tags: ['api-led', 'process-api', 'system-api', 'supply-chain', 'tms'],
  estMinutes: 10,
  diagram: {
    task: 'draw a Process API that combines data from two systems. Use five boxes: one Process API box, two System API boxes, one ERP box and one Transport mgmt (TMS) box. Draw a line from the Process API to each System API. Then draw a line from one System API to the ERP, and from the other System API to the TMS.',
    checks: [
      { label: 'The Process API calls two System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'A System API connects to the ERP', rule: { type: 'edge', from: 'system-api', to: 'erp' } },
      { label: 'A System API connects to the TMS', rule: { type: 'edge', from: 'system-api', to: 'tms' } },
      { label: 'The System APIs do not call each other', rule: { type: 'no-edge', from: 'system-api', to: 'system-api' } },
      { label: 'The Process API never connects to a backend directly', rule: { type: 'no-edge', from: 'process-api', to: ['erp', 'tms'] } },
      { label: 'The order is read from the ERP with sync calls all the way, so it can be merged', rule: { type: 'path', from: 'process-api', to: 'erp', kind: 'sync' } },
      { label: 'The shipment is read from the TMS with sync calls all the way, so it can be merged', rule: { type: 'path', from: 'process-api', to: 'tms', kind: 'sync' } },
    ],
    reference: diagram(
      {
        prc: ['process-api', 'prc-order-status-api', { calls: 'in parallel', onFailure: 'partial answer' }],
        so: ['system-api', 'sys-orders-api'],
        ss: ['system-api', 'sys-shipments-api', { timeoutMs: 2000, circuitBreaker: 'on' }],
        erp: ['erp', 'ERP'],
        tms: ['tms', 'TMS'],
      },
      ['prc -> so', 'prc -> ss', 'so -> erp', 'ss -> tms'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 800 },
        { match: 'tms', latencyMs: 600 },
      ],
      tests: [
        {
          name: 'Order status in time',
          about: 'Customers ask for 20 order statuses a second. The ERP takes 800 ms and the TMS 600 ms, and the answer must come in under 1.1 seconds on average.',
          traffic: [{ name: 'status', from: 'process-api', rps: 20, to: ['erp', 'tms'] }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1100, maxDegraded: 0.01 }] },
        },
        {
          name: 'The TMS is down',
          about: 'The TMS fails for the whole run. Customers still get the order from the ERP, with a note that shipment details are not available.',
          traffic: [{ name: 'status', from: 'process-api', rps: 20, to: ['erp', 'tms'] }],
          incidents: [{ down: 'tms' }],
          expect: { answers: [{ minSuccess: 0.99, minDegraded: 0.9 }] },
        },
        {
          name: 'The TMS stops answering',
          about: 'The TMS hangs for the whole run and never replies. The answer, without the shipment, must still come in under 2.5 seconds on average.',
          traffic: [{ name: 'status', from: 'process-api', rps: 20, to: ['erp', 'tms'] }],
          incidents: [{ hang: 'tms' }],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2500 }] },
        },
      ],
    },
  },
  description: `
Customers of an online retailer ask, "Where is my order?" The answer sits in two systems:
- The **ERP** (the main business system) holds the order.
- The **TMS** (transport management system) holds the shipment.

Each system already has its own System API. A **Process API** will call both and merge the results into one order status.

Some numbers for the design:
- Customers ask for about 20 order statuses a second.
- The ERP answers in about 800 ms and the TMS in about 600 ms. The answer must come in under 1.1 seconds on average.
- The TMS has outages, and at times it hangs without replying. Customers should then still see their order, without the shipment, in under 2.5 seconds.

**Questions:**
- Draw the design.
- Why does the merge belong in the Process API?
`,
  answerTemplate: `## Design

## Where the merge belongs
`,
  keyPoints: [
    'A Process API combines data from more than one System API.',
    'Each System API stays focused on one backend system.',
    'System APIs do not call each other. Logic that crosses systems belongs in the Process API.',
    'Calls in parallel (Scatter-Gather) take the time of the slower call, not the sum.',
    'A partial answer keeps the order visible when the TMS fails. A timeout and a circuit breaker on the TMS call keep a hanging TMS from holding threads.',
  ],
  solution: `
**Design.**
\`\`\`
                        ┌─► sys-orders-api ────► ERP
 prc-order-status-api ──┤
                        └─► sys-shipments-api ─► TMS
\`\`\`

**Where the merge belongs.** Order status needs both systems, so it is logic that crosses systems. If the orders System API called the shipments System API, the two would be tied together and neither could be reused alone. In the Process API, each System API stays small, and other callers can reuse either one.

**Settings that matter.**
- *Calls in parallel.* One after the other, the two calls take 800 + 600 ms plus the hops, about 1.5 seconds. In parallel the slower call sets the time, about 850 ms.
- *Partial answer.* When the TMS call fails, the Process API returns the order and says the shipment details are not available, so the customer still gets part of the answer.
- *Timeout and circuit breaker.* A TMS that hangs would hold each request for the default 10 seconds, and the threads of the Process API run out. A 2 second timeout on the shipments System API, with a circuit breaker, makes the call fail fast, and the partial answer takes over.
`,
  followUps: [
    {
      q: 'Must the two calls run one after the other?',
      a: 'No. Neither call needs the result of the other, so a Mule flow can run them at the same time with a Scatter-Gather router and merge the results afterwards.',
    },
    {
      q: 'What should the Process API do if the TMS is down?',
      a: 'That is a business decision. One option is to return the order and say the shipment details are not available right now, so the customer still gets part of the answer.',
    },
  ],
}
