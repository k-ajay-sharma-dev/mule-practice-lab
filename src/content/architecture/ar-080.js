import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-080',
  category: 'architecture',
  title: 'Data Residency for Store and Loyalty Data Across Countries',
  level: 'EXPERT',
  tags: ['retail', 'data-residency', 'gdpr', 'pii', 'multi-region', 'activemq', 'loyalty', 'analytics'],
  estMinutes: 45,
  diagram: {
    task: 'draw a regional integration architecture in which EU and US store and loyalty data are processed and stored in-region, and only aggregated or pseudonymised data flows to global analytics.',
    checks: [
      { label: 'Stores in each region publish to an in-region broker', rule: { type: 'each', of: 'pos', min: 2, edgeTo: ['queue', 'event-stream', 'topic'], kind: 'async' } },
      { label: 'Each region keeps its own customer / loyalty store', rule: { type: 'node', match: ['database', 'crm'], min: 2 } },
      { label: 'Regional customer data is reached only through System APIs', rule: { type: 'only-via', target: ['database', 'crm'], from: 'system-api' } },
      { label: 'Regional Process APIs publish aggregated / pseudonymised events asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'event-stream', 'queue'], kind: 'async', min: 2 } },
      { label: 'Global analytics is fed from the aggregate stream', rule: { type: 'path', from: ['topic', 'event-stream'], to: 'data-warehouse' } },
      { label: 'Regional System APIs never feed the global warehouse directly', rule: { type: 'no-edge', from: 'system-api', to: 'data-warehouse' } },
      { label: 'The loyalty app calls an Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        poseu: ['pos', 'EU store POS (DE, FR, NL)'],
        posus: ['pos', 'US store POS'],
        mob: ['mobile-app', 'Loyalty app (EU)'],
        eloy: ['experience-api', 'exp-loyalty-eu'],
        ploy: ['process-api', 'prc-loyalty-eu'],
        qeu: ['queue', 'EU broker: eu.store.sales'],
        qus: ['queue', 'US broker: us.store.sales'],
        peu: ['process-api', 'prc-store-sales-eu (EU runtime)'],
        pus: ['process-api', 'prc-store-sales-us (US runtime)'],
        seu: ['system-api', 'sys-loyalty-eu'],
        sus: ['system-api', 'sys-loyalty-us'],
        dbeu: ['database', 'EU loyalty and sales DB (EU region)'],
        dbus: ['database', 'US loyalty and sales DB (US region)'],
        g: ['topic', 'global.sales.aggregates (no PII)'],
        pg: ['process-api', 'prc-global-sales'],
        dw: ['data-warehouse', 'Global analytics'],
      },
      [
        'poseu ~> qeu', 'posus ~> qus', 'qeu ~> peu', 'qus ~> pus', 'peu -> seu', 'pus -> sus', 'seu -> dbeu', 'sus -> dbus',
        'mob -> eloy', 'eloy -> ploy', 'ploy -> seu',
        'peu ~> g', 'pus ~> g', 'g ~> pg', 'pg -> dw',
      ],
    ),
  },
  description: `
A sports retailer operates **650 stores in 9 countries** (Germany, France, Netherlands, UK, US, Canada, India, UAE, Australia). It runs a single global integration platform in the US.

Every store sends these to a US-hosted Oracle database and data lake:
- Sales with **loyalty IDs**
- Receipts with customer emails
- Store-employee timesheets

Legal has flagged:
- **EU (GDPR)**: personal data may leave the EU only with a valid transfer mechanism; the DPO wants EU customer and employee data processed and stored in the EU by default.
- **India**: certain categories of personal data may face localisation requirements; legal wants an option to keep them in-country.
- Head office still needs **global sales dashboards** by store, day and product, and a global view of loyalty programme performance.
- Integration logs (which include payloads) are currently shipped to a US logging service.

The platform runs on **CloudHub 2.0** (US control plane) and on-prem Mule runtimes in some countries; stores use local ActiveMQ brokers.

**Questions:**
- Which data must stay in-region, and which can be global? Classify the flows.
- Draw the target architecture: where runtimes, brokers and databases live, and what crosses borders.
- How do you give HQ global analytics without moving personal data?
- What about logs, monitoring and the control plane?
- What does this cost in reuse and operations?
`,
  answerTemplate: `## Data classification

## Regional architecture

## Global analytics without personal data

## Logs, monitoring and control plane

## Trade-offs
`,
  keyPoints: [
    'Classify data first: personal data (loyalty, receipts with emails, employees) is regional; aggregates and product/store reference data can be global.',
    'Regional "cells": in-region brokers, runtimes (e.g. CloudHub 2.0 private spaces or runtimes in that region, or the EU control plane) and databases process personal data locally.',
    'Only aggregated or pseudonymised events cross borders to the global layer; tokenisation keys stay in-region.',
    'Logs and monitoring must follow the same rules: mask payloads or keep log stores in-region; the control-plane location matters too.',
    'Same APIs and templates deployed per region preserve reuse; the cost is more environments, duplicated operations and regional release management.',
  ],
  solution: `
**Classification.**

| Data | Residency | Global form |
|---|---|---|
| Loyalty member profile, receipts with email | In-region | Pseudonymised member token, no contact data |
| Employee timesheets | In-region (HR system in region) | Headcount/hours aggregates |
| Sales lines | In-region with loyalty id | Aggregated by store/day/SKU, loyalty id removed or tokenised |
| Products, stores, prices | Global | — |

**Regional cells.**
\`\`\`
 EU stores ─~► EU broker ─~► prc-store-sales-eu (EU runtime) ─► sys-loyalty-eu ─► EU DB
                                     └~► global.sales.aggregates (no PII) ─┐
 US stores ─~► US broker ─~► prc-store-sales-us (US runtime) ─► sys-loyalty-us ─► US DB
                                     └~► global.sales.aggregates ──────────┴─► prc-global-sales ─► Global analytics
 EU loyalty app ─► exp-loyalty-eu ─► prc-loyalty-eu ─► sys-loyalty-eu
\`\`\`
- Each region has its own brokers, runtimes and databases. The same API specifications and Mule apps are deployed per region with regional configuration — reuse of design, not of instances.
- India gets its own cell when required; until then it can be an "EU-style" cell configured for in-country hosting.
- Runtime location: CloudHub 2.0 private spaces in the region, or customer-hosted runtimes; consider the **EU control plane** for EU workloads if management metadata must stay in the EU too.

**Global analytics.** Regional Process APIs publish **aggregates** (store/day/SKU) and **pseudonymised** member metrics (token, tier, spend band). The re-identification key never leaves the region. The global warehouse is fed only from that stream — never directly from regional System APIs.

**Logs and monitoring.** Payload logging is the most common leak: mask or omit personal fields in logs, keep detailed logs in regional log stores, and send only metrics and correlation ids to global monitoring.

**Trade-offs.** More environments and pipelines, duplicated broker operations, regional release coordination, and cross-region features (a US member shopping in Paris) need explicit, lawful exchange APIs. In return: a clear compliance story and smaller blast radius per region.
`,
  followUps: [
    { q: 'A loyalty member from the US shops in a German store. Where is the transaction stored?', a: 'The sale is processed in the EU cell where it happened; a cross-region API resolves the member token to points accrual in the US cell, exchanging only what is needed under the agreed legal basis.' },
    { q: 'Does running CloudHub 2.0 in an EU region solve residency by itself?', a: 'It keeps runtime processing in that region, but you must also consider the control plane, logs, Anypoint MQ or broker location, object stores, backups and support access — residency is about every copy of the data.' },
    { q: 'How do you stop a developer adding the email field to the global aggregate event?', a: 'Govern the global event schema (reviewed contract in Exchange), validate outbound events against an allow-listed schema in the publishing flow, and add automated data-classification tests in CI.' },
  ],
}
