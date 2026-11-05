import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-044',
  category: 'case-studies',
  title: 'Bank Modernising Its Core Banking System With a Strangler Approach',
  level: 'EXPERT',
  tags: ['banking', 'core-modernisation', 'strangler', 'data-migration', 'api-led'],
  estMinutes: 60,
  diagram: {
    task: 'draw the coexistence state of the strangler: channels on core-agnostic Experience and Process APIs, a product-location registry, System APIs for both the mainframe and the new core, and events from both cores feeding downstream systems.',
    checks: [
      { label: 'Mobile, web and branch/contact-centre each call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Channels see only core-agnostic Process APIs — Experience APIs never call System APIs', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The mainframe is reached only through System APIs (no screen-scraping or direct CICS from channels)', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The new core is reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'erp'], from: 'system-api' } },
      { label: 'The accounts Process API routes to both the mainframe and the new-core System APIs', rule: { type: 'edge', from: { type: 'process-api', label: ['account'] }, to: 'system-api', min: 2 } },
      { label: 'A product-location registry says which core holds each customer product', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['registry', 'location', 'routing', 'cross'] } } },
      { label: 'Both cores publish transaction events (CDC / native) asynchronously', rule: { type: 'edge', to: ['event-stream', 'topic', 'queue'], kind: 'async', min: 2 } },
      { label: 'Downstream reporting consumes events independent of which core posted them', rule: { type: 'path', from: ['event-stream', 'topic', 'queue'], to: 'data-warehouse' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile banking'],
        web: ['web-app', 'Online banking'],
        br: ['internal-app', 'Branch & contact centre'],
        em: ['experience-api', 'exp-mobile-api'],
        ew: ['experience-api', 'exp-web-api'],
        eb: ['experience-api', 'exp-branch-api'],
        acc: ['process-api', 'prc-accounts-api'],
        pay: ['process-api', 'prc-payments-api'],
        ev: ['event-stream', 'AccountTransactionPosted events'],
        mfa: ['system-api', 'sys-mf-accounts-api'],
        nca: ['system-api', 'sys-nc-accounts-api'],
        reg: ['database', 'Product-location registry'],
        mf: ['legacy', 'Mainframe core (CICS, MQ, batch)'],
        nc: ['saas', 'New cloud core'],
        dw: ['data-warehouse', 'Data platform (regulatory reporting)'],
      },
      [
        'mob -> em', 'web -> ew', 'br -> eb', 'em -> acc', 'ew -> acc', 'eb -> acc', 'em -> pay', 'eb -> pay',
        'acc -> reg', 'acc -> mfa', 'acc -> nca', 'pay -> reg', 'pay -> mfa', 'pay -> nca', 'mfa -> mf', 'nca -> nc',
        'mf ~> ev', 'nc ~> ev', 'ev ~> dw',
      ],
    ),
  },
  description: `
**Context.** A regional bank (1.5 million customers) runs a 30-year-old mainframe core banking system for current accounts, savings, loans and payments.

About 70 channel and back-office systems connect to it through a mix of:
- CICS transactions
- nightly batch files
- MQ messages
- screen-scraping

The board has approved a move to a modern cloud-native core banking product over five years. A previous "big bang" core replacement at a peer bank failed publicly.

**Goals**
- Move products to the new core in stages, starting with new savings products.
- Channels (mobile, web, branch, contact centre) keep working throughout without big rewrites.
- Reduce mainframe costs as products leave.

**Constraints**
- Strict regulatory expectations on operational resilience, data integrity and customer communication during migration (kept generic).
- Batch-heavy processes (interest, statements, regulatory reports) run on the mainframe overnight.
- Customers hold products on both cores during the transition (e.g. current account on mainframe, savings on new core).
- Mainframe skills are scarce; three key experts retire within two years.

**Your task.** Propose:
- the target architecture
- the strangler migration strategy
- the data migration approach
- the coexistence design
- governance
`,
  answerTemplate: `## Target architecture and principles

## The strangler facade: API layer between channels and cores

## Migration sequencing (products and customers)

## Coexistence: customers with products on both cores

## Data migration and reconciliation

## Batch, reporting and events

## Governance, people and risk management
`,
  keyPoints: [
    'Channels move first onto stable, core-agnostic Process and Experience APIs (the strangler facade); later core moves change only System API routing.',
    'Migrate product by product (and within products by customer cohorts), starting with new products on the new core to avoid early data migration risk.',
    'A routing/cross-reference service knows which core holds each customer product, enabling coexistence and aggregated views (e.g. all balances).',
    'Data migration is rehearsed repeatedly with automated reconciliation (counts, balances, interest) and a tested rollback plan per wave.',
    'Events (CDC from the mainframe where possible, native events from the new core) feed downstream systems so batch-file dependencies are reduced over time.',
    'Governance covers mainframe knowledge capture, regulatory engagement, and clear go/no-go criteria for each wave.',
  ],
  solution: `
**Principles.** No big bang; channels decoupled from cores first; one source of truth per product at any time; every migration wave reversible; measure everything.

**Phase 0–1: facade (year 1).**
- System APIs over the mainframe: \`mf-accounts-sapi\`, \`mf-payments-sapi\`, \`mf-customer-sapi\` using whatever interface is available (CICS via an approved connector or a mainframe-side API layer, MQ via the IBM MQ connector, files where unavoidable).
- Process APIs in business terms: \`accounts-papi\`, \`payments-papi\`, \`customer-papi\`. Channel Experience APIs call only these.
- Migrate channels off screen-scraping and direct CICS calls onto the APIs — a large but valuable programme on its own (and the first visible benefit).

**Phase 2: new products on new core (year 2).** New savings products are launched only on the new core (\`nc-accounts-sapi\`). \`accounts-papi\` routes by product via a **product-location registry** (customer + product → core). Aggregated views (\`GET /customers/{id}/accounts\`) fan out to both cores and merge.

**Phase 3+: migrate existing products (years 2–5).** Order by risk and value: simple savings → term deposits → loans → current accounts and payments (most interconnected, last). Within a product, migrate by customer cohorts (staff first, then small cohorts, then larger). For each wave: freeze window, extract → transform → load, reconcile, switch registry entries, monitor, keep a rollback path until sign-off.

**Coexistence.** Internal transfers between a mainframe current account and a new-core savings account are orchestrated in \`payments-papi\` as a two-step transfer with idempotent posting and reconciliation (no distributed transaction). Customer master data has one owner (a customer master/MDM), synchronised to both cores.

**Data migration.** Dedicated tooling for bulk loads (Mule can orchestrate but bulk ETL/migration tools may be better for volumes); multiple dress rehearsals with production-like data; automated reconciliation of record counts, balances, accrued interest and limits; business sign-off per wave.

**Batch and events.** Overnight mainframe batch keeps running for remaining products. Change data capture (via a CDC tool) or MQ events from the mainframe, and native events from the new core, publish \`AccountTransactionPosted\` etc. This lets downstream systems (fraud, CRM, data platform) consume events independent of which core posted them. Regulatory reporting draws from a data platform fed by both cores.

**Governance and people.** Design authority across bank, core vendor and integration team; regulator engagement before each major wave; knowledge capture from retiring mainframe experts (documented interfaces, paired work); integration C4E owns API standards and the registry.

**Risks.**
- Incorrect balances after migration (reconciliation and rehearsals).
- Performance of fan-out views (caching, parallel calls).
- Facade becoming a bottleneck or a new monolith (domain-aligned APIs, independent deployments).
- Scope creep in the facade (strict contracts).
`,
  followUps: [
    { q: 'Why start with new products rather than migrating an existing one?', a: 'New products need no data migration, so the bank proves the new core, APIs, operations and controls with low risk and real customers before attempting the harder migrations.' },
    { q: 'What happens to the facade at the end of the programme?', a: 'It stays. The Process APIs are the stable business interface; once the mainframe is gone, the mainframe System APIs are retired and routing simply always points to the new core.' },
    { q: 'How do you roll back a migration wave?', a: 'Keep the source accounts frozen but intact until sign-off, and capture transactions posted to the new core during the window. Have a rehearsed procedure to reverse registry entries and replay those transactions on the old core.' },
    { q: 'Would you use Mule for the bulk data migration?', a: 'Mule can orchestrate and handle moderate volumes with batch jobs, but for very large one-off migrations a dedicated migration/ETL tool or the core vendor\'s loaders are often more efficient; Mule then focuses on coexistence and APIs.' },
  ],
}
