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
      { label: 'Every channel calls an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Oracle changes are captured as asynchronous events', rule: { type: 'edge', from: 'oracle-db', to: ['event-stream', 'queue', 'topic', 'cloud-queue'], kind: 'async' } },
      { label: 'Change events are applied to SQL Server through a System API', rule: { type: 'path', from: ['event-stream', 'queue', 'topic', 'cloud-queue'], to: 'sql-server', via: 'system-api' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'A reconciliation job reads both sides through System APIs', rule: { type: 'edge', from: 'batch-job', to: 'system-api', min: 2 } },
      { label: 'Change events that cannot be applied go to a dead-letter queue', rule: { type: 'edge', from: ['process-api', 'event-stream', 'queue', 'topic', 'cloud-queue'], to: 'dlq' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Channel orders still reach Oracle in sync calls during the dual run', rule: { type: 'path', from: 'experience-api', via: 'process-api', to: 'oracle-db', kind: 'sync' } },
      { label: 'The Process API can route channel requests to SQL Server at cut-over', rule: { type: 'path', from: 'experience-api', via: 'process-api', to: 'sql-server', kind: 'sync' } },
      { label: 'A Process API maps each change before it is applied to SQL Server', rule: { type: 'path', from: ['event-stream', 'queue', 'topic', 'cloud-queue'], via: 'process-api', to: 'sql-server' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['oracle-db', 'sql-server'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'internal-app', 'mobile-app', 'batch-job', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'B2B order portal'],
        cs: ['internal-app', 'Customer service console'],
        exp: ['experience-api', 'exp-orders', { vCores: '0.2' }],
        prc: ['process-api', 'prc-orders (routing switch: Oracle / SQL Server)', { vCores: '0.2' }],
        sora: ['system-api', 'sys-orders-oracle', { vCores: '0.2' }],
        smss: ['system-api', 'sys-orders-sqlserver', { vCores: '0.5' }],
        ora: ['oracle-db', 'Oracle 12c orders (system of record until cut-over)'],
        mss: ['sql-server', 'SQL Server 2022 orders (target)'],
        cdc: ['event-stream', 'Kafka: oracle.orders.changes (CDC)'],
        sync: ['process-api', 'prc-orders-cdc-apply', { vCores: '0.5' }],
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
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 30 },
        { match: 'sql-server', latencyMs: 20, maxRps: 300 },
      ],
      tests: [
        {
          name: 'Dual run at peak',
          about: 'The portal writes 40 orders a second and customer service 10, all to Oracle. The CDC tool publishes 120 row changes a second, and every one is applied to SQL Server with no backlog left.',
          durationMin: 30,
          traffic: [
            { name: 'portal', from: 'web-app', rps: 40, to: 'oracle-db', kind: 'write' },
            { name: 'service', from: 'internal-app', rps: 10, to: 'oracle-db', kind: 'write' },
            { name: 'changes', from: 'oracle-db', rps: 120, to: 'sql-server', kind: 'write' },
          ],
          expect: {
            answers: [{ flow: 'portal', minSuccess: 0.99 }, { flow: 'service', minSuccess: 0.99 }],
            delivered: [{ flow: 'changes', to: 'sql-server', min: 0.99 }],
            backlog: [{ queue: ['event-stream', 'queue', 'topic', 'cloud-queue'], maxEnd: 500 }],
            vCores: { max: 2.5 },
          },
        },
        {
          name: 'SQL Server is down for 15 minutes',
          about: 'SQL Server fails for 15 minutes during the dual run. Channel orders still go to Oracle, the changes wait in Kafka, and every change is applied once SQL Server is back.',
          durationMin: 60,
          traffic: [
            { name: 'portal', from: 'web-app', rps: 40, to: 'oracle-db', kind: 'write' },
            { name: 'changes', from: 'oracle-db', rps: 120, to: 'sql-server', kind: 'write' },
          ],
          incidents: [{ down: 'sql-server', at: 5, forMin: 15 }],
          expect: {
            answers: [{ flow: 'portal', minSuccess: 0.99 }],
            delivered: [{ flow: 'changes', to: 'sql-server', min: 0.99 }],
            backlog: [{ queue: ['event-stream', 'queue', 'topic', 'cloud-queue'], maxEnd: 500 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'Kafka restarts while changes wait',
          about: 'SQL Server is down for 15 minutes and a Kafka broker restarts in the middle of it. The waiting changes must survive the restart, so no change is lost.',
          durationMin: 60,
          traffic: [{ name: 'changes', from: 'oracle-db', rps: 120, to: 'sql-server', kind: 'write' }],
          incidents: [{ down: 'sql-server', at: 5, forMin: 15 }, { restart: ['event-stream', 'queue', 'topic', 'cloud-queue'], at: 12 }],
          expect: {
            delivered: [{ flow: 'changes', to: 'sql-server', min: 0.99 }],
            lost: { max: 0 },
          },
        },
      ],
    },
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

Numbers for sizing:
- At peak the B2B portal writes 40 orders a second and customer service 10. The CDC tool publishes about 120 row changes a second.
- Oracle answers in about 30 ms. SQL Server takes a write in about 20 ms and up to 300 a second.
- SQL Server may be down for up to 15 minutes during the dual run, and a Kafka broker may restart at any time. No change may be lost.
- The budget for the migration apps is 2.5 vCores.

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
    'Sizing: the apply path (prc-orders-cdc-apply and sys-orders-sqlserver) gets 0.5 vCore each, so it applies 120 changes a second and catches up after a 15 minute SQL Server outage. 0.2 vCore is not enough.',
    'Kafka keeps the change events (retention), so a broker restart while SQL Server is down loses nothing.',
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

**Change flow.** Initial bulk load (DBA tooling) to a known position, then CDC from that position. The CDC tool publishes each row change to Kafka **keyed by order id**, so all changes of an order stay in one partition and in order. \`prc-orders-cdc-apply\` maps types and calls \`sys-orders-sqlserver\`, which upserts with a **MERGE** keyed on the business key. It only applies a change if its source sequence/SCN is newer than the stored one, so replays and duplicates are harmless. Failures after retries go to \`orders.cdc.dlq\` and alert; the consumer continues.

**Sizing and failures.**
- The channel path (\`exp-orders\`, \`prc-orders\`, \`sys-orders-oracle\`) carries 50 writes a second, so 0.2 vCore each leaves room.
- The apply path takes 120 changes a second. At 0.2 vCore it tops out near 100 and Kafka falls further behind every minute, so \`prc-orders-cdc-apply\` and \`sys-orders-sqlserver\` get 0.5 vCore each. After a 15 minute SQL Server outage about 108,000 changes wait in Kafka, and the spare capacity applies them in about 15 minutes.
- Channel orders never wait for SQL Server, since they reach it only through CDC.
- The topic keeps its events (retention on), so a broker restart during the outage loses nothing. A non-persistent broker would drop the waiting changes and SQL Server would drift from Oracle.
- Total: 1.7 vCores, inside the budget of 2.5.

**Reconciliation.** Every hour, per key range: row counts and checksums of normalised columns via both System APIs; deep compare on mismatch. Results on the drift dashboard; dual-run exit criterion: zero unexplained drift for two weeks.

**Cut-over.** Announce a 15-minute read-only window → stop writes in \`prc-orders\` → wait until CDC lag is zero → final reconciliation → flip the routing switch to SQL Server → reopen writes. Start reverse replication (or keep the switch reversible) for the rollback period, then decommission Oracle access in \`sys-orders-oracle\`.
`,
  followUps: [
    { q: 'Why not let Mule write to both databases from prc-orders instead of using CDC?', a: 'Dual writes from the application have no atomicity across two databases and miss changes made outside the APIs (PL/SQL jobs, tools). CDC captures every committed change from the source of record.' },
    { q: 'How do you handle Oracle sequences vs SQL Server IDENTITY during dual run?', a: 'Keep Oracle-generated ids as the keys in SQL Server (identity insert or plain key columns) while Oracle is the system of record; switch id generation only at cut-over, starting above the highest migrated value.' },
    { q: 'What about the nightly PL/SQL rebate jobs?', a: 'They must be rewritten (T-SQL or moved into an integration/batch job) and run in parallel during dual run, comparing outputs, before cut-over. They are part of the migration scope, not an afterthought.' },
  ],
}
