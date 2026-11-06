import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-081',
  category: 'architecture',
  title: 'Partner File Exchange Hub: SFTP and FTP Intake into Oracle and SQL Server',
  level: 'ADVANCED',
  tags: ['sftp', 'ftp', 'b2b', 'file-integration', 'oracle', 'sql-server', 'api-led', 'dlq'],
  estMinutes: 45,
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
    ],
    reference: diagram(
      {
        p1: ['partner', 'Carriers and suppliers (SFTP, key auth)'],
        p2: ['partner', 'Legacy customs broker (FTP over VPN)'],
        sftp: ['sftp-server', 'Managed SFTP: /partner/inbound, /outbound'],
        ftp: ['sftp-server', 'Internal FTP (passive, VPN only)'],
        job: ['batch-job', 'prc-partner-file-intake (primary node only)'],
        q: ['queue', 'partner.records'],
        dlq: ['dlq', 'partner.records.dlq'],
        load: ['process-api', 'prc-partner-records'],
        sord: ['system-api', 'sys-orders-oracle'],
        sbil: ['system-api', 'sys-billing-sqlserver'],
        ora: ['oracle-db', 'Oracle order management'],
        mss: ['sql-server', 'SQL Server billing'],
        mon: ['monitoring', 'File tracking dashboard'],
      },
      [
        'p1 -> sftp', 'p2 -> ftp', 'job -> sftp', 'job -> ftp', 'job ~> q', 'q ~> load', 'q ~> dlq',
        'load -> sord', 'load -> sbil', 'sord -> ora', 'sbil -> mss', 'job -> mon',
      ],
    ),
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

**Onboarding.** Create SFTP account and folders, exchange keys and host-key fingerprint, register file type → mapping in configuration, expected schedule for "missing file" alerts, test file in a non-production environment.
`,
  followUps: [
    { q: 'Why not let the intake job write straight into Oracle and SQL Server?', a: 'It would tie file pickup to database speed and duplicate database logic in every intake flow. The queue absorbs bursts, and the System APIs keep one controlled access path per database.' },
    { q: 'How would you send acknowledgement files back to partners?', a: 'prc-partner-records publishes the outcome; an outbound flow writes an ACK/NACK file to the partner\'s /outbound folder with sftp:write, using a temporary name and rename so the partner never reads a partial file.' },
    { q: 'What about very large files (300 MB)?', a: 'Stream them: parse with streaming enabled, publish records in batches or use a batch job; never load the whole file into memory, and keep concurrency for large files low.' },
  ],
}
