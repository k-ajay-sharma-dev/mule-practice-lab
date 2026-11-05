import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-062',
  category: 'architecture',
  title: 'Replacing a System of Record: SAP ECC to S/4HANA',
  level: 'ADVANCED',
  tags: ['api-led', 'system-api', 'migration', 'sap', 'strangler'],
  estMinutes: 30,
  diagram: {
    task: 'draw the estate during the ECC to S/4HANA coexistence period, including where routing happens and what the two legacy IDoc integrations now call.',
    checks: [
      { label: 'The Order System API routes to both SAP ECC and S/4HANA (strangler facade)', rule: { type: 'edge', from: { type: 'system-api', label: 'order' }, to: 'erp', min: 2 } },
      { label: 'Both SAP systems are reached only through System APIs', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Process APIs stay unaware of ECC vs S/4 (no direct SAP calls)', rule: { type: 'no-edge', from: 'process-api', to: 'erp' } },
      { label: 'The routing table / id cross-reference is owned by the System layer', rule: { type: 'edge', from: 'system-api', to: ['cache', 'database'] } },
      { label: 'The former IDoc integrations now call a System API instead of SAP directly', rule: { type: 'each', of: ['batch-job', 'internal-app'], edgeTo: 'system-api' } },
      { label: 'Experience APIs are unchanged and keep calling Process APIs', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mobile app still reaches SAP end to end', rule: { type: 'path', from: 'mobile-app', to: 'erp' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        pa: ['partner', 'Partner A'],
        em: ['experience-api', 'exp-mobile-api'],
        ep: ['experience-api', 'exp-partner-a-api'],
        po: ['process-api', 'prc-order-api'],
        pf: ['process-api', 'prc-fulfilment-api'],
        idoc: ['batch-job', 'Former IDoc integration (re-platformed)'],
        so: ['system-api', 'sys-sap-order-api (routes by company code)'],
        sm: ['system-api', 'sys-sap-material-api'],
        rt: ['database', 'Routing table + ECC/S4 id cross-reference'],
        ecc: ['erp', 'SAP ECC'],
        s4: ['erp', 'SAP S/4HANA'],
      },
      [
        'mob -> em', 'pa -> ep', 'em -> po', 'ep -> po', 'po -> so', 'po -> sm', 'pf -> so', 'idoc -> so',
        'so -> rt', 'so -> ecc', 'so -> s4', 'sm -> ecc', 'sm -> s4',
      ],
    ),
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
