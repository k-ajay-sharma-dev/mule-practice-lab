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
        prc: ['process-api', 'prc-order-status-api'],
        so: ['system-api', 'sys-orders-api'],
        ss: ['system-api', 'sys-shipments-api'],
        erp: ['erp', 'ERP'],
        tms: ['tms', 'TMS'],
      },
      ['prc -> so', 'prc -> ss', 'so -> erp', 'ss -> tms'],
    ),
  },
  description: `
Customers of an online retailer ask, "Where is my order?" The answer sits in two systems:
- The **ERP** (the main business system) holds the order.
- The **TMS** (transport management system) holds the shipment.

Each system already has its own System API. A **Process API** will call both and merge the results into one order status.

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
  ],
  solution: `
**Design.**
\`\`\`
                        ┌─► sys-orders-api ────► ERP
 prc-order-status-api ──┤
                        └─► sys-shipments-api ─► TMS
\`\`\`

**Where the merge belongs.** Order status needs both systems, so it is logic that crosses systems. If the orders System API called the shipments System API, the two would be tied together and neither could be reused alone. In the Process API, each System API stays small, and other callers can reuse either one.
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
