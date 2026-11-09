import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-070',
  category: 'architecture',
  title: 'Escaping the Shared Oracle Integration Database',
  level: 'INTERMEDIATE',
  tags: ['retail', 'supply-chain', 'oracle', 'anti-pattern', 'api-led', 'events', 'data-ownership'],
  estMinutes: 20,
  diagram: {
    task: 'redraw the landscape so that the Oracle inventory schema has one owner: channels use APIs, the WMS sits behind its own System API, and finance gets changes as events instead of reading the tables.',
    checks: [
      { label: 'The e-commerce site and the store ops app call Experience APIs', rule: { type: 'each', of: ['web-app', 'internal-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Experience APIs go through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Oracle database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'The WMS is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
      { label: 'Stock changes are published as events', rule: { type: 'edge', from: 'system-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'Finance analytics is fed from events, not from the shared tables', rule: { type: 'path', from: 'system-api', via: ['topic', 'queue', 'event-stream'], to: 'data-warehouse' } },
      { label: 'Finance gets changes as events, not from a direct feed out of a System API', rule: { type: 'no-edge', from: 'system-api', to: 'data-warehouse' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['database', 'wms'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'internal-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'E-commerce site'],
        store: ['internal-app', 'Store ops app'],
        eweb: ['experience-api', 'exp-ecommerce-api'],
        estore: ['experience-api', 'exp-store-ops-api'],
        prc: ['process-api', 'prc-stock-api'],
        sinv: ['system-api', 'sys-oracle-inventory'],
        swms: ['system-api', 'sys-wms'],
        db: ['database', 'Oracle inventory schema (owned by inventory team)'],
        wms: ['wms', 'WMS'],
        topic: ['topic', 'inventory.changed'],
        pfin: ['process-api', 'prc-finance-feed'],
        dw: ['data-warehouse', 'Finance analytics'],
      },
      [
        'web -> eweb', 'store -> estore', 'eweb -> prc', 'estore -> prc', 'prc -> sinv', 'prc -> swms',
        'sinv -> db', 'swms -> wms', 'sinv ~> topic', 'topic ~> pfin', 'pfin -> dw',
      ],
    ),
  },
  description: `
A retailer's **Oracle database** has become the integration hub. Over 15 years:
- The **WMS** writes receipts straight into \`INV_ONHAND\` with a database link.
- The **e-commerce** platform reads \`INV_ONHAND\` and writes \`RESERVATIONS\` through its own JDBC user.
- The **store ops app** runs SQL against the same tables.
- **Finance** runs nightly queries joining 30 tables; a trigger copies changes into staging tables for them.

Now the inventory team wants to rename two columns and split \`INV_ONHAND\` by location.

What is wrong now:
- **Six teams** say this will break them.
- Nobody knows all the readers.
- A bad query from the store app locked \`RESERVATIONS\` for 20 minutes last month.

**Questions:**
- Why is "integrate through a shared database" an anti-pattern here? Name at least three concrete problems from the scenario.
- What should the target look like? Who owns the schema?
- How does each current consumer (e-commerce, store app, WMS, finance) integrate instead?
- How would you migrate without a big-bang cut-over?
`,
  answerTemplate: `## Why the shared database hurts

## Target architecture and ownership

## How each consumer integrates

## Migration plan
`,
  keyPoints: [
    'A shared integration database couples every consumer to the physical schema: no team can change a column without coordinating with all readers.',
    'There is no contract, no access control per use case, and no protection against a bad query from one consumer locking data for everyone.',
    'Target: the inventory team owns the schema, exposed only through sys-oracle-inventory (and a WMS System API); consumers use APIs or events.',
    'Change propagation (finance, analytics) uses published events instead of triggers and staging tables.',
    'Migrate consumer by consumer (strangler): build the System API, move readers and writers one at a time, then revoke direct grants.',
  ],
  solution: `
**Why it is an anti-pattern.**
1. **Schema = contract.** Six teams depend on table and column names, so renaming a column is a cross-team project.
2. **No isolation.** One consumer's long-running query or lock (store app) hurts everyone, including checkout.
3. **Hidden business rules.** Each writer (WMS, e-commerce) re-implements validation; triggers add invisible behaviour.
4. **Unknown consumers and weak security.** Shared JDBC users, database links, no audit of who reads what.

**Target.**
\`\`\`
 E-commerce ─► exp-ecommerce ─┐
 Store app  ─► exp-store-ops ─┴─► prc-stock ─► sys-oracle-inventory ─► Oracle (one owner)
                                       └──────► sys-wms ─► WMS
 sys-oracle-inventory ~► inventory.changed ~► prc-finance-feed ─► finance analytics
\`\`\`
- The **inventory team owns the schema**; the only path in is \`sys-oracle-inventory\`, which exposes resources such as \`GET /stock?sku=&location=\` and \`POST /reservations\` in a canonical model.
- The **WMS** gets its own System API; receipts are posted through the inventory API rather than a database link.
- **Finance** subscribes to \`inventory.changed\` events (or receives a governed extract) instead of querying 30 tables.

**Migration (strangler).**
1. Build \`sys-oracle-inventory\` over the existing tables (no schema change yet).
2. Move consumers one at a time, starting with the riskiest writer (e-commerce reservations); monitor database audit logs to find hidden readers.
3. Replace the finance trigger with events published by the System API (or CDC while migrating).
4. Revoke direct grants and database links per consumer; only then refactor the schema behind the API.

**Trade-off:** an extra hop and an API to maintain, in exchange for the freedom to change the schema and protect Oracle.
`,
  followUps: [
    { q: 'Finance insists on SQL access for ad-hoc analysis. What do you offer?', a: 'A read replica or data warehouse fed by events/CDC, with its own schema that they own. Ad-hoc SQL is fine — just not on the operational tables that other systems write to.' },
    { q: 'How do you discover the unknown readers before revoking access?', a: 'Enable Oracle auditing or review session/SQL history per database user over a few weeks, map users to applications, and give each a dedicated account first so usage becomes visible.' },
    { q: 'Is a System API just the database with HTTP on top?', a: 'It should not be: it exposes business resources in a canonical model and hides tables, so the schema can change behind it without breaking consumers.' },
  ],
}
