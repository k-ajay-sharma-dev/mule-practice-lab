import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-070',
  category: 'architecture',
  title: 'Escaping the Shared Oracle Integration Database',
  level: 'INTERMEDIATE',
  tags: ['retail', 'supply-chain', 'oracle', 'anti-pattern', 'api-led', 'events', 'data-ownership'],
  estMinutes: 30,
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
        eweb: ['experience-api', 'exp-ecommerce-api', { vCores: '0.5' }],
        estore: ['experience-api', 'exp-store-ops-api', { rateLimit: 40 }],
        prc: ['process-api', 'prc-stock-api', { vCores: '0.5' }],
        sinv: ['system-api', 'sys-oracle-inventory', { vCores: '0.5' }],
        swms: ['system-api', 'sys-wms'],
        db: ['database', 'Oracle inventory schema (owned by inventory team)'],
        wms: ['wms', 'WMS'],
        topic: ['topic', 'inventory.changed'],
        pfin: ['process-api', 'prc-finance-feed', { vCores: '0.5' }],
        dw: ['data-warehouse', 'Finance analytics'],
      },
      [
        'web -> eweb', 'store -> estore', 'eweb -> prc', 'estore -> prc', 'prc -> sinv', 'prc -> swms',
        'sinv -> db', 'swms -> wms', 'sinv ~> topic', 'topic ~> pfin', 'pfin -> dw',
      ],
    ),
    simulation: {
      systems: [{ match: 'database', latencyMs: 30, maxRps: 300 }],
      tests: [
        {
          name: 'A runaway store report',
          about: 'E-commerce reads stock 100 times a second. For five minutes a bad store report sends 400 requests a second. The report gets 429 from a rate limit, checkout reads still work, and Oracle stays at 250 a second or less.',
          traffic: [
            { name: 'ecommerce', from: 'web-app', rps: 100, to: 'database' },
            { name: 'store ops', from: 'internal-app', rps: 20, to: 'database', spikes: [{ at: 3, forMin: 5, rps: 400 }] },
          ],
          expect: { answers: [{ flow: 'ecommerce', minSuccess: 0.99 }, { flow: 'store ops', minLimited: 0.5 }], peakRps: [{ node: 'database', max: 250 }], vCores: { max: 3 } },
        },
        {
          name: 'The finance warehouse is down',
          about: 'Checkouts write 50 reservations a second while the finance warehouse is down for 30 minutes. Checkout does not notice, and finance gets every change once it is back.',
          traffic: [{ name: 'reservations', from: 'web-app', rps: 50, to: ['database', 'data-warehouse'], kind: 'write' }],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'data-warehouse', min: 0.99 }], backlog: [{ queue: ['topic', 'queue', 'event-stream'], maxEnd: 500 }], lost: { max: 0 } },
        },
      ],
    },
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

Numbers for sizing:
- E-commerce reads stock **100 times a second** and writes **50 reservations a second** at peak. The store ops app normally sends **20 requests a second**, but a runaway report can send **400 a second** for minutes.
- An Oracle call takes about 30 ms. Oracle can take about **300 requests a second**; the inventory team wants integrations at **250 or less**.
- The finance warehouse can be down for **30 minutes** during its loads, and finance needs every change.
- The budget for these APIs is **3 vCores**.

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
    'A rate limit per consumer (the store ops Experience API) replaces "one bad query locks everyone"; an event feed sized to drain its backlog keeps finance off the checkout path.',
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

**Sizing and protection.**
- A rate limit of 40 a second on \`exp-store-ops-api\` answers 429 to a runaway report, so it can no longer hurt checkout. This is the API-led version of "one bad query locks everyone".
- \`exp-ecommerce-api\`, \`prc-stock-api\` and \`sys-oracle-inventory\` run on 0.5 vCore each for the checkout load.
- \`prc-finance-feed\` runs on 0.5 vCore, so after a warehouse outage it drains the topic faster than new changes arrive. The topic is persistent, so nothing is lost while the warehouse is down.
- In total 2.2 vCores, inside the 3 vCore budget.

**Trade-off:** an extra hop and an API to maintain, in exchange for the freedom to change the schema and protect Oracle.
`,
  followUps: [
    { q: 'Finance insists on SQL access for ad-hoc analysis. What do you offer?', a: 'A read replica or data warehouse fed by events/CDC, with its own schema that they own. Ad-hoc SQL is fine — just not on the operational tables that other systems write to.' },
    { q: 'How do you discover the unknown readers before revoking access?', a: 'Enable Oracle auditing or review session/SQL history per database user over a few weeks, map users to applications, and give each a dedicated account first so usage becomes visible.' },
    { q: 'Is a System API just the database with HTTP on top?', a: 'It should not be: it exposes business resources in a canonical model and hides tables, so the schema can change behind it without breaking consumers.' },
  ],
}
