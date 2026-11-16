import { diagram } from '../../arch/dsl.js'

const ECC = { type: 'erp', label: 'ecc' }
const S4 = { type: 'erp', label: ['s/4', 's4'] }

export default {
  id: 'ar-062',
  category: 'architecture',
  title: 'Replacing a System of Record: SAP ECC to S/4HANA',
  level: 'ADVANCED',
  tags: ['api-led', 'system-api', 'migration', 'sap', 'strangler'],
  estMinutes: 40,
  diagram: {
    task: 'draw the estate during the ECC to S/4HANA coexistence period, including where routing happens and what the two legacy IDoc integrations now call.',
    checks: [
      { label: 'The Order System API routes to both SAP ECC and S/4HANA (strangler facade)', rule: { type: 'edge', from: { type: 'system-api', label: 'order' }, to: 'erp', min: 2 } },
      { label: 'Both SAP systems are reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Process APIs stay unaware of ECC vs S/4 (no direct SAP calls)', rule: { type: 'no-edge', from: 'process-api', to: 'erp' } },
      { label: 'The routing table / id cross-reference is owned by the System layer', rule: { type: 'edge', from: 'system-api', to: ['cache', 'database'] } },
      { label: 'The former IDoc integrations now call a System API instead of SAP directly', rule: { type: 'each', of: ['batch-job', 'internal-app'], edgeTo: 'system-api' } },
      { label: 'The former IDoc integrations no longer touch SAP directly', rule: { type: 'no-edge', from: ['batch-job', 'internal-app'], to: 'erp' } },
      { label: 'Every System API is called by an API or integration', rule: { type: 'each', of: 'system-api', edgeFrom: ['process-api', 'batch-job', 'internal-app'] } },
      { label: 'Experience APIs are unchanged and keep calling Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mobile app still reaches SAP end to end', rule: { type: 'path', from: 'mobile-app', to: 'erp' } },
      { label: 'The partner still reaches SAP end to end', rule: { type: 'path', from: 'partner', to: 'erp' } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'partner', 'experience-api', 'process-api', 'batch-job', 'internal-app'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        pa: ['partner', 'Partner A'],
        em: ['experience-api', 'exp-mobile-api', { vCores: '0.2' }],
        ep: ['experience-api', 'exp-partner-a-api', { vCores: '0.2' }],
        po: ['process-api', 'prc-order-api', { vCores: '0.5' }],
        pf: ['process-api', 'prc-fulfilment-api'],
        idoc: ['batch-job', 'Former IDoc integration (re-platformed)'],
        so: ['system-api', 'sys-sap-order-api (routes by company code)', { replicas: 2, vCores: '0.5', timeoutMs: 2000, circuitBreaker: 'on' }],
        sm: ['system-api', 'sys-sap-material-api', { vCores: '0.5', timeoutMs: 2000, circuitBreaker: 'on' }],
        rt: ['database', 'Routing table + ECC/S4 id cross-reference'],
        ecc: ['erp', 'SAP ECC'],
        s4: ['erp', 'SAP S/4HANA'],
      },
      [
        'mob -> em', 'pa -> ep', 'em -> po', 'ep -> po', 'po -> so', 'po -> sm', 'pf -> so', 'idoc -> so',
        'so -> rt', 'so -> ecc', 'so -> s4', 'sm -> ecc', 'sm -> s4',
      ],
    ),
    simulation: {
      systems: [
        { match: ECC, latencyMs: 300, maxRps: 200 },
        { match: S4, latencyMs: 250 },
        { match: 'database', latencyMs: 10 },
      ],
      tests: [
        {
          name: 'Orders during coexistence',
          about: 'Orders for countries still on ECC come in at 60 a second and orders for countries already on S/4HANA at 30, from the app and the partner. The System API sends each order to the system that owns its company code, everything is answered in under a second on average, and the APIs fit the 4 vCore budget.',
          traffic: [
            { name: 'ECC orders', from: ['mobile-app', 'partner'], rps: 60, to: [ECC, 'database'] },
            { name: 'S/4 orders', from: ['mobile-app', 'partner'], rps: 30, to: [S4, 'database'] },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1000 }], vCores: { max: 4 } },
        },
        {
          name: 'S/4HANA hangs during a cutover',
          about: 'During a cutover weekend S/4HANA stops answering for the whole run. Orders for countries still on ECC must keep being answered in under a second, even though they go through the same System APIs.',
          traffic: [
            { name: 'ECC orders', from: ['mobile-app', 'partner'], rps: 60, to: [ECC, 'database'] },
            { name: 'S/4 orders', from: ['mobile-app', 'partner'], rps: 30, to: [S4, 'database'] },
          ],
          incidents: [{ hang: S4 }],
          expect: { answers: [{ flow: 'ECC orders', minSuccess: 0.99, maxMs: 1000 }] },
        },
      ],
    },
  },
  description: `
The business is migrating from **SAP ECC** to **SAP S/4HANA** over 18 months, **by company code** (country by country). During the migration, some orders live in ECC and some in S/4.

Current estate:

| API | Notes |
|---|---|
| \`sys-sap-order-api\` | Uses BAPIs/RFC via the SAP connector; ECC field semantics mapped to a clean model |
| \`sys-sap-material-api\` | Same approach |
| \`prc-order-api\`, \`prc-pricing-api\`, \`prc-fulfilment-api\` | Consume the System APIs |
| 4 Experience APIs | Mobile, web, 2 partners |
| 2 legacy integrations | Call ECC **directly** via IDocs, bypassing System APIs |

During coexistence, orders for countries still on ECC arrive at about **60 a second** and orders for countries already on S/4HANA at about 30, from the app and the partner. ECC answers in about 300 ms and takes at most 200 calls a second; S/4HANA answers in about 250 ms. The routing table answers in about 10 ms. Orders should be answered in under a second on average, and the budget for the APIs is **4 vCores**. On cutover weekends S/4HANA can stop answering for hours, and ECC countries must not notice.

**Questions:**
1. What changes in **which layer**? What should *not* change?
2. How do you route requests during the coexistence period?
3. What about the two integrations that bypass the System layer?
4. What are the risks where the "API-led protects you" promise breaks down?
`,
  answerTemplate: `## Impact per layer

## Coexistence routing

## Integrations that bypass the System layer

## Where the promise breaks down
`,
  keyPoints: [
    'Ideally only System API implementations change: new S/4 connectivity (OData/REST APIs or BAPIs/RFC that still exist) and mappings, behind an unchanged contract.',
    'Process and Experience APIs and their consumers should not change, unless the System contract leaked ECC semantics or business processes themselves change in S/4.',
    'During coexistence the System API routes by a business key (company code, order number range) to ECC or S/4 — a strangler facade — with a routing table in configuration.',
    'Integrations that bypassed the System layer must be rebuilt or redirected; the migration is the business case to bring them into API-led.',
    'Risks: leaked SoR semantics (codes, number formats, statuses), process changes in S/4, data migration timing (an order moving systems), and performance/limits of the new interface.',
    'The System APIs in front of both SAP systems need a short timeout (2 s) and a circuit breaker, so a hanging S/4HANA does not use up the threads that ECC orders also need. The order System API runs 2 replicas of 0.5 vCore.',
  ],
  solution: `
**Impact per layer.**

\`\`\`
Experience  [exp-mobile] [exp-web] [exp-partner-a] [exp-partner-b]   NO CHANGE
Process     [prc-order] [prc-pricing] [prc-fulfilment]                 NO CHANGE (ideally)
System      [sys-sap-order-api]  [sys-sap-material-api]                 IMPLEMENTATION CHANGES
                 |         \\
               ECC (RFC)   S/4HANA (OData APIs / RFC)
\`\`\`

- **System layer:** new connectivity to S/4HANA (S/4 exposes OData/REST APIs; many BAPIs/RFCs are still available, but some change — verify per object). New DataWeave mappings from S/4 structures to the **same** contract. New error mappings. Performance testing.
- **Process layer:** no change if the System contract is clean. Changes only if S/4 changes *business* behaviour (e.g. new pricing conditions the process must handle).
- **Experience layer and consumers:** no change. This is the API-led payoff to demonstrate to the business.
- Naming: \`sys-sap-order-api\` still fits (it is still SAP). If the name had been \`sys-ecc-order-api\`, you would keep the name for compatibility or introduce a new asset — another reason to name by system family, not version.

**Coexistence routing (strangler facade inside the System API).**
- Routing key: **company code** (or sales org); for reads by order id, a lookup or number-range rule tells you which system holds the order (S/4 often uses new number ranges).
- Routing table in configuration/Object Store, updated as each country cuts over — no redeploy per wave.
- Queries spanning both (e.g. \`GET /orders?customerId=\` for a customer active in two countries): query both in parallel and merge, or restrict by company code — document behaviour.
- Writes go only to the system that owns that company code after cut-over; freeze windows around migration of open orders.
- Same contract, two implementations behind one API: consumers never learn about the migration.

**Integrations that bypass the System layer.** IDoc integrations straight into ECC must be rebuilt for S/4 anyway. Use the migration as the business case to re-platform them onto \`sys-sap-*\` APIs (or to have the System layer own IDoc/event handling for S/4), so next time they are protected too. Add them to the migration plan explicitly — they are typically where cut-over weekends go wrong.

**Settings that matter during coexistence.**
- One System API now serves two backends, so a problem in one can reach orders for the other. When S/4HANA hangs, every call to it would hold a thread of \`sys-sap-order-api\` for the default 10 s timeout, and the app soon has no threads left for ECC orders either. A **2000 ms timeout** and a **circuit breaker** on \`sys-sap-order-api\` and \`sys-sap-material-api\` make those calls fail at once, so ECC countries keep being answered in well under a second.
- Sizing: \`sys-sap-order-api\` carries every order (2 replicas of 0.5 vCore), \`prc-order-api\` and \`sys-sap-material-api\` 0.5 vCore each, and the two Experience APIs 0.2 each. With the other apps that is 2.6 vCores, inside the budget of 4.

**Where the promise breaks down.**
1. **Leaked semantics:** if v1 exposed ECC status codes, document types or 10-digit padded ids, consumers depend on them. Mitigate: map S/4 values back to the published enums; fix the contract in a later version.
2. **Business process changes:** S/4 may change how pricing, credit or ATP works — Process APIs change, and possibly the meaning of data.
3. **Identifiers:** new number ranges or customer/business-partner model changes (S/4 uses Business Partner for customers/vendors) — the Customer System API mapping changes significantly; ids exposed to consumers may need a cross-reference.
4. **Non-functional:** different latency, throughput or API limits; re-test caching and timeouts.
5. **Data migration:** an order migrated mid-lifecycle exists in both systems for a period — the router must know the authoritative copy.
`,
  followUps: [
    { q: 'Would you create a new System API for S/4 instead of changing the existing one?', a: 'If the S/4 data model is so different that the contract must change, create v2 or a new asset and let Process APIs migrate; otherwise keep one System API with two backends so consumers are untouched. The second is the API-led ideal.' },
    { q: 'How do you test that consumers are unaffected?', a: 'Before each wave, run the existing System API contract tests and Process API regression suites against the S/4 implementation. Add parallel-run comparisons (same request to ECC and S/4 path, diff the canonical responses).' },
    { q: 'Where do you keep the ECC-to-S/4 id cross-reference?', a: 'In a small cross-reference store owned by the System layer (database or persistent store), populated from the data migration, so translation stays hidden from the Process layer.' },
  ],
}
