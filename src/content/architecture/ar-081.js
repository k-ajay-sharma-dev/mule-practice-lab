import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-081',
  category: 'architecture',
  title: 'Partner File Exchange Hub: SFTP and FTP Intake into Oracle and SQL Server',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'ftp', 'b2b', 'file-integration', 'oracle', 'sql-server', 'api-led', 'dlq'],
  estMinutes: 60,
  diagram: {
    task: 'draw a partner file exchange hub in which partners deliver files over SFTP (and one legacy FTP server), an intake job picks them up and hands records off asynchronously, and the data reaches Oracle and SQL Server only through System APIs.',
    checks: [
      { label: 'Partners deliver files to a managed SFTP / FTP server', rule: { type: 'edge', from: 'partner', to: ['sftp-server', 'file-store'] } },
      { label: 'An intake job or Process API picks the files up from the file server', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['sftp-server', 'file-store'] } },
      { label: 'Intake hands records off asynchronously through a queue', rule: { type: 'edge', from: ['batch-job', 'process-api'], to: ['queue', 'cloud-queue', 'event-stream', 'topic'], kind: 'async' } },
      { label: 'Records that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue', 'event-stream', 'topic', 'process-api', 'batch-job'], to: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
      { label: 'SQL Server is reached only through a System API', rule: { type: 'only-via', target: 'sql-server', from: 'system-api' } },
      { label: 'Separate System APIs for the two databases', rule: { type: 'node', match: 'system-api', min: 2 } },
      { label: 'Partners never write to the databases directly', rule: { type: 'no-edge', from: 'partner', to: ['oracle-db', 'sql-server'] } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'Every partner delivers its files to a managed file server', rule: { type: 'each', of: 'partner', edgeTo: ['sftp-server', 'file-store'] } },
      { label: 'Every file server receives files from partners', rule: { type: 'each', of: ['sftp-server', 'file-store'], edgeFrom: 'partner' } },
      { label: 'The intake job picks up from every file server', rule: { type: 'each', of: ['sftp-server', 'file-store'], edgeFrom: ['batch-job', 'process-api'] } },
      { label: 'Picked up records reach both Oracle and SQL Server through the queue', rule: { type: 'path', from: ['batch-job', 'process-api'], via: ['queue', 'cloud-queue', 'event-stream', 'topic'], to: ['oracle-db', 'sql-server'], min: 2 } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['oracle-db', 'sql-server'] } },
      { label: 'Each System API owns one database, so none connects to both', rule: { type: 'each', of: 'system-api', edgeTo: ['oracle-db', 'sql-server'], count: 0, max: 1 } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['batch-job', 'process-api'], to: ['process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        p1: ['partner', 'Carriers and suppliers (SFTP, key auth)'],
        p2: ['partner', 'Legacy customs broker (FTP over VPN)'],
        sftp: ['sftp-server', 'Managed SFTP: /partner/inbound, /outbound'],
        ftp: ['sftp-server', 'Internal FTP (passive, VPN only)'],
        job: ['batch-job', 'prc-partner-file-intake (primary node only)', { vCores: '0.5' }],
        q: ['queue', 'partner.records', { maxRedelivery: 20 }],
        dlq: ['dlq', 'partner.records.dlq'],
        load: ['process-api', 'prc-partner-records', { vCores: '0.5' }],
        sord: ['system-api', 'sys-orders-oracle', { vCores: '0.5' }],
        sbil: ['system-api', 'sys-billing-sqlserver', { vCores: '0.2' }],
        ora: ['oracle-db', 'Oracle order management'],
        mss: ['sql-server', 'SQL Server billing'],
        mon: ['monitoring', 'File tracking dashboard'],
      },
      [
        'p1 -> sftp', 'p2 -> ftp', 'job -> sftp', 'job -> ftp', 'job ~> q', 'q ~> load', 'q ~> dlq',
        'load -> sord', 'load -> sbil', 'sord -> ora', 'sbil -> mss', 'job -> mon',
      ],
    ),
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 40, maxRps: 120 },
        { match: 'sql-server', latencyMs: 30, maxRps: 80 },
      ],
      tests: [
        {
          name: 'Morning file burst',
          about: 'Between 06:00 and 06:10 the intake job reads order records at 160 a second and billing records at 60, then back to 40 and 20. The intake keeps up, the databases stay under their limits, and the queue is empty again within 40 minutes.',
          durationMin: 40,
          traffic: [
            { name: 'orders', from: 'batch-job', rps: 40, to: 'oracle-db', kind: 'write', spikes: [{ at: 5, forMin: 10, rps: 160 }] },
            { name: 'billing', from: 'batch-job', rps: 20, to: 'sql-server', kind: 'write', spikes: [{ at: 5, forMin: 10, rps: 60 }] },
          ],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            peakRps: [{ node: 'oracle-db', max: 120 }, { node: 'sql-server', max: 80 }],
            backlog: [{ queue: ['queue', 'cloud-queue', 'event-stream', 'topic'], maxEnd: 100 }],
            lost: { max: 0 },
            vCores: { max: 2 },
          },
        },
        {
          name: 'Oracle maintenance window',
          about: 'Oracle is down for 10 minutes. The intake goes on reading files, the records wait in the queue, and every order record reaches Oracle once it is back. None goes to the DLQ.',
          durationMin: 40,
          traffic: [
            { name: 'orders', from: 'batch-job', rps: 40, to: 'oracle-db', kind: 'write' },
            { name: 'billing', from: 'batch-job', rps: 20, to: 'sql-server', kind: 'write' },
          ],
          incidents: [{ down: 'oracle-db', at: 5, forMin: 10 }],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ flow: 'orders', to: 'oracle-db', min: 0.99 }],
            backlog: [{ queue: ['queue', 'cloud-queue', 'event-stream', 'topic'], maxEnd: 100 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
        {
          name: 'Oracle rejects every record',
          about: 'A bad schema change makes Oracle reject every order record for 40 minutes. Records that keep failing for 20 minutes go to the DLQ for replay, none is lost, and the intake goes on.',
          durationMin: 60,
          traffic: [
            { name: 'orders', from: 'batch-job', rps: 40, to: 'oracle-db', kind: 'write' },
            { name: 'billing', from: 'batch-job', rps: 20, to: 'sql-server', kind: 'write' },
          ],
          incidents: [{ errors: 'oracle-db', rate: 1, at: 5, forMin: 40 }],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            dlq: { min: 4000 },
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
A logistics group exchanges files with **120 partners**:
- Carriers send shipment status and proof of delivery.
- Suppliers send invoices and advance shipping notices.
- A customs broker exchanges declarations.

Volumes: ~9,000 files per day, from 1 KB to 300 MB (CSV, fixed-width, XML).

Today every partner has its own point-to-point script. Some write into the **Oracle** order database through database links. Others drop files that a SQL Server Agent job imports into the **SQL Server** billing database.

Problems:
- Duplicates
- Half-loaded files
- No visibility of which partner sent what
- Passwords shared by email

Constraints:
- Most partners can use **SFTP** with key authentication; one customs broker only supports **FTP**, reachable over a site-to-site VPN.
- Orders live in Oracle, billing in SQL Server; both DBA teams want a single, controlled integration user per database.
- Operations want to answer "did partner X send today's file and was it loaded?" in one place.
- Mule runs in a two-node on-prem cluster and on CloudHub 2.0.

Numbers for sizing:
- Intake reads about 40 order records and 20 billing records a second. Between 06:00 and 06:10 most partners deliver at once, and this rises to 160 order and 60 billing records a second.
- Oracle takes at most 120 writes a second (40 ms each). SQL Server takes at most 80 (30 ms each).
- Oracle has a 10 minute maintenance window, and no record may be lost or parked in the DLQ because of it. A record that still fails after 20 minutes of redelivery goes to the DLQ.
- The budget for the integration apps is 2 vCores.

**Questions:**
- Draw the target architecture for partner file exchange.
- How are files picked up safely (no duplicates, no half-written files)?
- How do records reach Oracle and SQL Server, and how are failures handled?
- What does the onboarding of a new partner look like?
`,
  answerTemplate: `## Target architecture

## Safe file pickup

## Loading into Oracle and SQL Server

## Failure handling

## Partner onboarding
`,
  keyPoints: [
    'One managed SFTP landing zone with per-partner accounts and folders; plain FTP only as a VPN-restricted exception.',
    'An intake job (listener on the primary node only) picks up files with size check / rename contract, archives or moves them to /error.',
    'Intake parses and validates, then hands records to a queue — decoupling file arrival from database load speed.',
    'Process API consumes records and writes through sys-orders-oracle and sys-billing-sqlserver; databases are reached only through System APIs.',
    'Repeated failures go to a DLQ; every file is tracked (partner, name, rows, status) for operations.',
    'Onboarding is configuration: account, keys, folder, file type mapping and expected schedule — not a new script.',
    'Sizing: 0.5 vCore for the intake (220 records a second at the burst) and for the loader, so the queue drains after the burst; the databases are never pushed past 120 and 80 writes a second.',
    'Deliveries before the DLQ is about 20: long enough to ride out the 10 minute Oracle window, short enough to park records that keep failing.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Carriers / suppliers ─► Managed SFTP ◄─ prc-partner-file-intake (primary node only) ─~► partner.records ─~► prc-partner-records
 Customs broker (VPN) ─► Internal FTP  ◄─┘                    │                              └~► partner.records.dlq      ├─► sys-orders-oracle ─► Oracle
                                                              └─► File tracking dashboard                                  └─► sys-billing-sqlserver ─► SQL Server
\`\`\`

**Safe pickup.**
- SFTP listener per partner group with \`primaryNodeOnly="true"\` (cluster), matcher on final names, \`timeBetweenSizeCheck\`, partners upload as \`.tmp\` and rename.
- Post-action \`moveToDirectory\` to \`/archive\`; error handler moves to \`/error\`.
- File-level idempotency: (partner, file name, size, checksum) recorded; repeats are skipped.

**Loading.** Intake validates structure (schema / row count), splits into records and publishes them to \`partner.records\`. \`prc-partner-records\` applies business rules and calls \`sys-orders-oracle\` (parameterised inserts/updates, bulk where possible) or \`sys-billing-sqlserver\`. Each System API owns its database connection, pooling and vendor specifics (ORA-00001 / 2627 mapped to "already exists").

**Failures.** Transient DB errors retried; after max deliveries records go to \`partner.records.dlq\` with the file and line reference. The file tracking dashboard shows per partner: received, rows, loaded, failed.

**Sizing and redelivery.**
- The intake gets 0.5 vCore, so it reads 220 records a second at the 06:00 burst. It only publishes, so it never waits for a database.
- The loader gets 0.5 vCore and \`sys-orders-oracle\` 0.5, so they drain the burst at Oracle's 120 writes a second; the queue is empty again about 15 minutes after the burst. \`sys-billing-sqlserver\` needs only 0.2. The total is 1.7 vCores, inside the budget of 2.
- \`partner.records\` sends a record to the DLQ after 20 failed deliveries. A 10 minute Oracle window is ridden out with no record parked, while a record Oracle keeps rejecting (a bad schema change, a broken mapping) lands in the DLQ after about 20 minutes instead of being retried forever. With no limit the queue grows without end; with a limit of 3, a routine maintenance window fills the DLQ.

**Onboarding.** Create SFTP account and folders, exchange keys and host-key fingerprint, register file type → mapping in configuration, expected schedule for "missing file" alerts, test file in a non-production environment.
`,
  followUps: [
    { q: 'Why not let the intake job write straight into Oracle and SQL Server?', a: 'It would tie file pickup to database speed and duplicate database logic in every intake flow. The queue absorbs bursts, and the System APIs keep one controlled access path per database.' },
    { q: 'How would you send acknowledgement files back to partners?', a: 'prc-partner-records publishes the outcome; an outbound flow writes an ACK/NACK file to the partner\'s /outbound folder with sftp:write, using a temporary name and rename so the partner never reads a partial file.' },
    { q: 'What about very large files (300 MB)?', a: 'Stream them: parse with streaming enabled, publish records in batches or use a batch job; never load the whole file into memory, and keep concurrency for large files low.' },
  ],
}
