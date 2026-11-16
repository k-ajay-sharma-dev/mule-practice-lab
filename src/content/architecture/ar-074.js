import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-074',
  category: 'architecture',
  title: 'API-led Connectivity for a Retail Supply Chain',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'api-led', 'oracle', 'wms', 'tms', 'layers'],
  estMinutes: 30,
  diagram: {
    task: 'draw the API-led network for the store app and the supplier portal: Experience, Process and System APIs, the gateway in front of suppliers, and the Oracle, WMS and TMS backends.',
    checks: [
      { label: 'The store app calls an Experience API', rule: { type: 'path', from: 'internal-app', to: 'experience-api' } },
      { label: 'Suppliers reach their Experience API through an API gateway', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'Every Experience API goes through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The fulfilment Process API orchestrates at least three System APIs', rule: { type: 'edge', from: { type: 'process-api', label: ['fulfil'] }, to: 'system-api', min: 3 } },
      { label: 'The Oracle inventory System API is reused by more than one Process API', rule: { type: 'edge', from: 'process-api', to: { type: 'system-api', label: ['inventory', 'oracle'] }, min: 2 } },
      { label: 'Oracle, WMS and TMS are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'database', 'wms', 'tms'], from: 'system-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Suppliers never bypass the gateway to call an Experience API', rule: { type: 'no-edge', from: 'partner', to: 'experience-api' } },
      { label: 'Supplier requests reach both Oracle and the WMS through System APIs', rule: { type: 'path', from: 'partner', via: 'system-api', to: ['erp', 'database', 'wms'], min: 2 } },
      { label: 'Store app requests reach Oracle, the WMS and the TMS through System APIs', rule: { type: 'path', from: 'internal-app', via: 'system-api', to: ['erp', 'database', 'wms', 'tms'], min: 3 } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'database', 'wms', 'tms'] } },
      { label: 'The gateway forwards live requests, so its lines are sync calls', rule: { type: 'lines', touching: 'api-gateway', kind: 'sync' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['internal-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        store: ['internal-app', 'Store associate app'],
        sup: ['partner', 'Supplier portal users'],
        gw: ['api-gateway', 'API Manager: client-id + rate limit', { auth: 'client-id' }],
        estore: ['experience-api', 'exp-store-app'],
        esup: ['experience-api', 'exp-supplier-portal', { rateLimit: 25 }],
        pful: ['process-api', 'prc-fulfilment', { timeoutMs: 2000, circuitBreaker: 'on', onFailure: 'partial answer' }],
        psup: ['process-api', 'prc-supplier-collaboration'],
        sinv: ['system-api', 'sys-oracle-inventory'],
        swms: ['system-api', 'sys-wms'],
        stms: ['system-api', 'sys-tms'],
        erp: ['erp', 'Oracle EBS (inventory, POs)'],
        wms: ['wms', 'WMS'],
        tms: ['tms', 'TMS'],
      },
      [
        'store -> estore', 'sup -> gw', 'gw -> esup', 'estore -> pful', 'esup -> psup',
        'pful -> sinv', 'pful -> swms', 'pful -> stms', 'psup -> sinv', 'psup -> swms',
        'sinv -> erp', 'swms -> wms', 'stms -> tms',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 300, maxRps: 60 },
        { match: 'wms', latencyMs: 200 },
        { match: 'tms', latencyMs: 400 },
      ],
      tests: [
        {
          name: 'A caller without a client id',
          about: 'Suppliers send 10 requests a second with their client id. Another caller sends 5 a second with none. The gateway refuses every one of those, and suppliers are all answered.',
          traffic: [
            { name: 'suppliers', from: 'partner', rps: 10, to: ['erp', 'wms'] },
            { name: 'no client id', from: 'partner', rps: 5, to: ['erp', 'wms'], auth: 'none' },
          ],
          expect: { answers: [{ flow: 'suppliers', minSuccess: 0.99 }, { flow: 'no client id', minRefused: 0.99 }] },
        },
        {
          name: 'A supplier script floods the portal',
          about: 'Store staff send 20 requests a second. For three minutes a supplier script sends 200 a second. The script gets 429 from a rate limit, and Oracle EBS, which staff also need, stays at 55 requests a second or less.',
          traffic: [
            { name: 'staff', from: 'internal-app', via: { label: 'store' }, rps: 20, to: ['erp', 'wms', 'tms'] },
            { name: 'suppliers', from: 'partner', rps: 10, to: ['erp', 'wms'], spikes: [{ at: 3, forMin: 3, rps: 200 }] },
          ],
          expect: { answers: [{ flow: 'suppliers', minLimited: 0.5 }], peakRps: [{ node: 'erp', max: 55 }] },
        },
        {
          name: 'The TMS hangs',
          about: 'The TMS stops answering. Staff still see stock and transfers, without the truck tracking, in about a second.',
          traffic: [{ name: 'staff', from: 'internal-app', via: { label: 'store' }, rps: 20, to: ['erp', 'wms', 'tms'] }],
          incidents: [{ hang: 'tms' }],
          expect: { answers: [{ minSuccess: 0.99, minDegraded: 0.9, maxMs: 1500 }] },
        },
      ],
    },
  },
  description: `
A regional retailer is starting its first MuleSoft programme. Two projects arrive at once:

1. **Store associate app** — staff check stock in nearby DCs, place a transfer to the store and track the truck.
2. **Supplier portal** — suppliers see their open POs, the stock of their products (vendor-managed inventory) and book delivery appointments at the DC.

Backends:
- **Oracle EBS** — inventory and purchase orders.
- **WMS** — DC stock, transfers, receiving appointments.
- **TMS** — loads and truck tracking.

The CIO wants the second project to be faster because of the first.

Numbers for sizing:
- Store staff send about **20 requests a second**; suppliers about **10 a second**. A supplier script once sent **200 a second** for minutes.
- Oracle EBS answers in about 300 ms and accepts **60 requests a second**; keep it at **55 or less**. The WMS answers in about 200 ms and the TMS in about 400 ms.
- The TMS sometimes stops answering. Staff should still see stock and transfers within **1.5 seconds**.
- Every supplier has a client id. Calls without one must be refused.

**Questions:**
- Which Experience, Process and System APIs do you create? Use the names \`exp-store-app\`, \`exp-supplier-portal\`, \`prc-fulfilment\`, \`sys-oracle-inventory\`, \`sys-wms\`, \`sys-tms\` and add what you need.
- What does each layer own?
- Which APIs does the supplier portal reuse from the first project?
- How are supplier calls secured differently from staff calls?
`,
  answerTemplate: `## System APIs

## Process APIs

## Experience APIs

## Reuse in project 2

## Security for suppliers
`,
  keyPoints: [
    'System APIs (sys-oracle-inventory, sys-wms, sys-tms) hide each backend and its protocol behind a stable, canonical contract.',
    'Process APIs hold the business logic: prc-fulfilment orchestrates stock lookup, transfer creation and truck tracking.',
    'Experience APIs shape data for one consumer: exp-store-app for staff, exp-supplier-portal for suppliers (filtered to their own data).',
    'Project 2 reuses sys-oracle-inventory and sys-wms, so only a new Process and Experience API are built — the speed-up the CIO wants.',
    'External suppliers go through API Manager policies (client ID enforcement / OAuth, rate limiting) and see only their own POs and products.',
    'A rate limit on the supplier Experience API protects the shared System APIs; a timeout, circuit breaker and partial answer in prc-fulfilment keep staff working when the TMS hangs.',
  ],
  solution: `
\`\`\`
 Store app ──► exp-store-app ──► prc-fulfilment ──► sys-oracle-inventory ──► Oracle EBS
                                        ├─────────► sys-wms ──────────────► WMS
                                        └─────────► sys-tms ──────────────► TMS
 Suppliers ─► gateway ─► exp-supplier-portal ─► prc-supplier-collaboration ─► sys-oracle-inventory (reused)
                                                                     └──────► sys-wms (appointments, reused)
\`\`\`

**System layer** — one per backend, reusable by anyone:
- \`sys-oracle-inventory\`: stock on hand per item/location, purchase orders.
- \`sys-wms\`: DC stock, transfers, receiving appointments.
- \`sys-tms\`: loads, shipment tracking.

**Process layer** — business capabilities:
- \`prc-fulfilment\`: "find stock near this store, create a transfer, follow the truck" — calls all three System APIs.
- \`prc-supplier-collaboration\`: "my open POs, my stock, book an appointment" — filters by supplier.

**Experience layer** — one per consumer:
- \`exp-store-app\`: compact payloads for a handheld.
- \`exp-supplier-portal\`: portal-friendly views, only the caller's data.

**Reuse.** Project 2 builds only one Process and one Experience API; the System APIs already exist, tested and documented in Exchange.

**Security.** Staff calls are internal (SSO token). Supplier calls pass an API gateway with OAuth/client-ID enforcement and rate limits; the supplier identity from the token drives filtering in the Process API so a supplier never sees another supplier's POs.

**Policies and failure handling.**
- The gateway enforces client ids, so a caller without one is refused before it reaches any API.
- A rate limit of 25 a second on \`exp-supplier-portal\` answers 429 to a runaway supplier script. Oracle EBS stays under its limit, and staff, who share \`sys-oracle-inventory\` and \`sys-wms\`, are not affected.
- \`prc-fulfilment\` calls with a 2 second timeout and a circuit breaker, and gives a partial answer when one call fails: if the TMS hangs, staff still see stock and transfers without the truck tracking.
`,
  followUps: [
    { q: 'Could exp-store-app call sys-wms directly to save a hop?', a: 'It works technically, but the business rules (which DCs, transfer limits) would end up in the Experience API and be duplicated by other channels. Keep them in the Process API unless the call is a pure pass-through read.' },
    { q: 'Where do you publish these APIs?', a: 'In Anypoint Exchange with RAML/OAS specs, examples and owners, so project 2 can discover and reuse them.' },
    { q: 'What changes if the WMS is replaced next year?', a: 'Only sys-wms is reimplemented against the new WMS; its contract stays, so the Process and Experience APIs are unaffected.' },
  ],
}
