import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-083',
  category: 'architecture',
  title: 'Migrating Orders from Oracle to SQL Server with Change Data Capture and a Dual-Run Period',
  level: 'EXPERT',
  tags: ['oracle', 'sql-server', 'migration', 'cdc', 'kafka', 'dual-run', 'api-led', 'strangler'],
  estMinutes: 50,
  diagram: {
    task: 'draw a migration architecture in which channels keep using the same Experience and Process APIs, Oracle changes are captured as events and applied to SQL Server through a System API, and a reconciliation job compares both databases during the dual run.',
    checks: [
      { label: 'Every channel calls an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'mobile-app'], edgeTo: 'experience-api' } },
      { label: 'Oracle changes are captured as asynchronous events', rule: { type: 'edge', from: 'oracle-db', to: ['event-stream', 'queue', 'topic', 'cloud-queue'], kind: 'async' } },
      { label: 'Change events are applied to SQL Server through a System API', rule: { type: 'path', from: ['event-stream', 'queue', 'topic', 'cloud-queue'], to: 'sql-server', via: 'system-api' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'A reconciliation job reads both sides through System APIs', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
      { label: 'Change events that cannot be applied go to a dead-letter queue', rule: { type: 'edge', from: ['process-api', 'event-stream', 'queue', 'topic', 'cloud-queue'], to: 'dlq' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'B2B order portal'],
        cs: ['internal-app', 'Customer service console'],
        exp: ['experience-api', 'exp-orders'],
        prc: ['process-api', 'prc-orders (routing switch: Oracle / SQL Server)'],
        sora: ['system-api', 'sys-orders-oracle'],
        smss: ['system-api', 'sys-orders-sqlserver'],
        ora: ['oracle-db', 'Oracle 12c orders (system of record until cut-over)'],
        mss: ['sql-server', 'SQL Server 2022 orders (target)'],
        cdc: ['event-stream', 'Kafka: oracle.orders.changes (CDC)'],
        sync: ['process-api', 'prc-orders-cdc-apply'],
        dlq: ['dlq', 'orders.cdc.dlq'],
        rec: ['batch-job', 'Hourly reconciliation job'],
        mon: ['monitoring', 'Dual-run drift dashboard'],
      },
      [
        'web -> exp', 'cs -> exp', 'exp -> prc', 'prc -> sora', 'prc -> smss',
        'sora -> ora', 'smss -> mss', 'ora ~> cdc', 'cdc ~> sync', 'sync -> smss', 'sync ~> dlq',
        'rec -> sora', 'rec -> smss', 'rec -> mon',
      ],
    ),
  },
  description: `
A wholesaler is moving its **order database from Oracle 12c to SQL Server 2022** as part of a data-centre exit. The Oracle schema (180 tables, 2.4 billion order lines) is used by:
- 14 Mule APIs (web portal, customer service, EDI, warehouse) — 6 of them query Oracle directly with their own SQL.
- Nightly PL/SQL jobs that calculate rebates.
- Reporting tools.

Constraints:
- **No big-bang weekend**: the business accepts at most 15 minutes of read-only time at cut-over.
- A **dual-run period of 6 weeks** where both databases are kept in sync and compared, so the cut-over can be rolled back.
- The DBAs will run a change data capture (CDC) tool that publishes Oracle row changes to **Kafka**.
- Data types differ: Oracle \`NUMBER\`, \`DATE\`, \`VARCHAR2\` (empty string is NULL) vs SQL Server \`DECIMAL\`, \`DATETIME2\`, \`NVARCHAR\`; sequences vs \`IDENTITY\`.

**Questions:**
- Draw the migration architecture during the dual run.
- How do changes flow from Oracle to SQL Server, and how do you guarantee order and idempotency?
- How do you prove both databases match?
- How does the cut-over work, and how would you roll back?
`,
  answerTemplate: `## Migration architecture

## Change flow (CDC)

## Ordering and idempotency

## Reconciliation

## Cut-over and rollback
`,
  keyPoints: [
    'First put all access behind System APIs (sys-orders-oracle) so consumers stop issuing their own SQL — the precondition for switching databases.',
    'Add sys-orders-sqlserver with the same contract; prc-orders routes reads/writes with a switch.',
    'CDC publishes Oracle changes to Kafka keyed by the order id; prc-orders-cdc-apply upserts into SQL Server through the System API (MERGE, idempotent by key and change sequence).',
    'Type mapping is explicit: NUMBER → DECIMAL, DATE → DATETIME2, empty VARCHAR2 = NULL, sequences → keep source ids during migration.',
    'Hourly reconciliation compares counts and checksums per key range through both System APIs; drift is visible on a dashboard.',
    'Cut-over: short read-only window, drain CDC, final reconcile, flip the switch; rollback by reverse sync or flipping back while Oracle is still current.',
  ],
  solution: `
**Architecture (dual run).**
\`\`\`
 Portal / CS console ─► exp-orders ─► prc-orders ─┬─► sys-orders-oracle ─► Oracle (system of record)
                                                  └─► sys-orders-sqlserver ─► SQL Server (target)
 Oracle ─~► Kafka oracle.orders.changes ─~► prc-orders-cdc-apply ─► sys-orders-sqlserver
                                                   └~► orders.cdc.dlq
 Hourly reconciliation job ─► sys-orders-oracle, sys-orders-sqlserver ─► drift dashboard
\`\`\`

**Step 0 — decouple.** Move the 6 APIs with direct SQL onto \`sys-orders-oracle\`. Until no consumer depends on Oracle-specific SQL, a database switch is impossible.

**Change flow.** Initial bulk load (DBA tooling) to a known position, then CDC from that position. The CDC tool publishes each row change to Kafka **keyed by order id**, so all changes of an order stay in one partition and in order. \`prc-orders-cdc-apply\` maps types and calls \`sys-orders-sqlserver\`, which upserts with a **MERGE** keyed on the business key and only applies a change if its source sequence/SCN is newer than the stored one — replays and duplicates are harmless. Failures after retries go to \`orders.cdc.dlq\` and alert; the consumer continues.

**Reconciliation.** Every hour, per key range: row counts and checksums of normalised columns via both System APIs; deep compare on mismatch. Results on the drift dashboard; dual-run exit criterion: zero unexplained drift for two weeks.

**Cut-over.** Announce a 15-minute read-only window → stop writes in \`prc-orders\` → wait until CDC lag is zero → final reconciliation → flip the routing switch to SQL Server → reopen writes. Start reverse replication (or keep the switch reversible) for the rollback period, then decommission Oracle access in \`sys-orders-oracle\`.
`,
  followUps: [
    { q: 'Why not let Mule write to both databases from prc-orders instead of using CDC?', a: 'Dual writes from the application have no atomicity across two databases and miss changes made outside the APIs (PL/SQL jobs, tools). CDC captures every committed change from the source of record.' },
    { q: 'How do you handle Oracle sequences vs SQL Server IDENTITY during dual run?', a: 'Keep Oracle-generated ids as the keys in SQL Server (identity insert or plain key columns) while Oracle is the system of record; switch id generation only at cut-over, starting above the highest migrated value.' },
    { q: 'What about the nightly PL/SQL rebate jobs?', a: 'They must be rewritten (T-SQL or moved into an integration/batch job) and run in parallel during dual run, comparing outputs, before cut-over — they are part of the migration scope, not an afterthought.' },
  ],
}
