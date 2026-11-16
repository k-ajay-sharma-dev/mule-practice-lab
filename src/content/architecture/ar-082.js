import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-082',
  category: 'architecture',
  title: 'Hybrid Cloud Document Archive: Azure Blob Storage with an Amazon S3 Copy',
  level: 'ADVANCED',
  tags: ['azure', 'blob-storage', 's3', 'hybrid-cloud', 'document-archive', 'api-led', 'insurance'],
  estMinutes: 60,
  diagram: {
    task: 'draw a document archive in which portals reach documents through an Experience API, documents are stored in Azure Blob Storage and indexed in a database, and a second copy is written to Amazon S3 asynchronously, with all storage reached only through System APIs.',
    checks: [
      { label: 'Every portal / staff channel calls an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Azure Blob Storage is reached only through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'The S3 bucket is reached only through a System API', rule: { type: 'only-via', target: 's3-bucket', from: 'system-api' } },
      { label: 'The document index database is reached only through a System API', rule: { type: 'only-via', target: ['sql-server', 'oracle-db', 'database'], from: 'system-api' } },
      { label: 'The archive Process API publishes replication requests asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'cloud-queue', 'event-stream', 'topic'], kind: 'async' } },
      { label: 'The S3 copy is made from the replication queue, not in the user\'s request', rule: { type: 'path', from: ['queue', 'cloud-queue', 'event-stream', 'topic'], to: 's3-bucket' } },
      { label: 'Failed replications go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue', 'event-stream', 'topic', 'process-api'], to: 'dlq' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Every line to or from a queue or topic is an async message', rule: { type: 'lines', touching: ['queue', 'topic', 'event-stream', 'cloud-queue', 'dlq'], kind: 'async' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
      { label: 'Every Experience API calls a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'A document is stored in Azure Blob in the user\'s request, as sync calls', rule: { type: 'path', from: 'experience-api', to: 'azure-blob', kind: 'sync' } },
      { label: 'A document is indexed in the user\'s request, so search finds it at once', rule: { type: 'path', from: 'experience-api', to: ['sql-server', 'oracle-db', 'database'], kind: 'sync' } },
      { label: 'No chain of sync calls joins the user\'s request to S3', rule: { type: 'no-path', from: 'experience-api', to: 's3-bucket', kind: 'sync' } },
      { label: 'The replicator reads the document from Azure Blob to copy it', rule: { type: 'path', from: ['queue', 'cloud-queue', 'event-stream', 'topic'], to: 'azure-blob' } },
      { label: 'The migration job reads the old DMS through a System API', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'legacy' } },
      { label: 'The DMS is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Migrated documents are archived through a Process API, so they are indexed and copied like new ones', rule: { type: 'path', from: 'batch-job', via: 'process-api', to: 's3-bucket' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['azure-blob', 's3-bucket', 'sql-server', 'oracle-db', 'database', 'legacy'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['web-app', 'internal-app', 'batch-job', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer portal (policy documents)'],
        staff: ['internal-app', 'Claims handler desktop'],
        exp: ['experience-api', 'exp-documents', { vCores: '0.5' }],
        prc: ['process-api', 'prc-document-archive', { vCores: '0.5' }],
        job: ['batch-job', 'Nightly migration from on-prem DMS'],
        q: ['queue', 'doc.replication.requests', { maxRedelivery: 60 }],
        rep: ['process-api', 'prc-archive-replicator', { vCores: '0.2' }],
        dlq: ['dlq', 'doc.replication.dlq'],
        sblob: ['system-api', 'sys-azure-blob-archive', { vCores: '0.5' }],
        ss3: ['system-api', 'sys-s3-archive', { vCores: '0.2' }],
        sidx: ['system-api', 'sys-document-index', { vCores: '0.5' }],
        sdms: ['system-api', 'sys-dms'],
        blob: ['azure-blob', 'Azure Blob: claims-documents container'],
        s3: ['s3-bucket', 'S3 bucket: documents-secondary'],
        idx: ['sql-server', 'Document index (SQL Server)'],
        dms: ['legacy', 'On-prem document management system'],
      },
      [
        'web -> exp', 'staff -> exp', 'exp -> prc', 'prc -> sblob', 'prc -> sidx', 'prc ~> q',
        'job -> sdms', 'job -> prc', 'q ~> rep', 'q ~> dlq', 'rep -> sblob', 'rep -> ss3', 'rep -> sidx',
        'sblob -> blob', 'ss3 -> s3', 'sidx -> idx', 'sdms -> dms',
      ],
    ),
    simulation: {
      systems: [
        { match: 'azure-blob', latencyMs: 300 },
        { match: 's3-bucket', latencyMs: 500 },
        { match: 'sql-server', latencyMs: 20 },
      ],
      tests: [
        {
          name: 'Claims surge after a storm',
          about: 'Claims handlers upload 20 documents a second, and 100 a second for 10 minutes after a storm. Each upload is stored and indexed within a second, and every document has its S3 copy by the end.',
          durationMin: 40,
          traffic: [{ name: 'uploads', from: 'internal-app', rps: 20, to: ['azure-blob', 'sql-server', 's3-bucket'], kind: 'write', spikes: [{ at: 5, forMin: 10, rps: 100 }] }],
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 1000 }],
            delivered: [{ to: 's3-bucket', min: 0.99 }],
            lost: { max: 0 },
            vCores: { max: 3 },
          },
        },
        {
          name: 'S3 is down for 30 minutes',
          about: 'The S3 region fails for 30 minutes. Uploads go on as fast as before, the replication requests wait in the queue, and every copy is made once S3 is back. None goes to the DLQ.',
          durationMin: 90,
          traffic: [{ name: 'uploads', from: 'internal-app', rps: 20, to: ['azure-blob', 'sql-server', 's3-bucket'], kind: 'write' }],
          incidents: [{ down: 's3-bucket', at: 5, forMin: 30 }],
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 1000 }],
            delivered: [{ to: 's3-bucket', min: 0.99 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
        {
          name: 'S3 refuses every copy',
          about: 'A wrong bucket policy makes S3 refuse every write for two hours. Uploads still work, and a request that keeps failing for an hour moves to the DLQ for replay. None is lost.',
          durationMin: 150,
          traffic: [{ name: 'uploads', from: 'internal-app', rps: 20, to: ['azure-blob', 'sql-server', 's3-bucket'], kind: 'write' }],
          incidents: [{ errors: 's3-bucket', rate: 1, at: 5, forMin: 120 }],
          expect: {
            answers: [{ minSuccess: 0.99 }],
            dlq: { min: 3000 },
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
An insurer must retire its on-prem document management system (DMS, 38 TB, 60 million documents) and archive claim and policy documents in the cloud. Requirements:
- **Primary store: Azure Blob Storage** (company standard). Regulators require a **second copy with a different provider**: Amazon S3 in another region.
- Customers download policy documents from the portal; claims handlers upload and view documents (photos, estimates, PDFs up to 25 MB; repair videos up to 2 GB).
- Search by claim, policy, customer and document type within 2 seconds.
- 10-year retention; documents must not be modified after archiving.
- Existing documents must be migrated from the DMS over six months without disrupting users.
- Mule runs on CloudHub 2.0 with a private space connected to the data centre.

Numbers for sizing:
- Claims handlers upload about 20 documents a second. After a storm this reaches 100 a second for 10 minutes.
- An upload must be stored and indexed within 1 second on average. Writing to Azure Blob takes about 300 ms, to the index 20 ms, to S3 about 500 ms.
- An S3 outage of up to 30 minutes must not slow uploads, and no copy may be lost or parked in the DLQ because of it. A replication request that still fails after an hour goes to the DLQ.
- The budget for the archive apps is 3 vCores.

**Questions:**
- Draw the target architecture, including migration.
- How is a document stored, indexed and replicated?
- How do users download large files efficiently?
- How do you handle failures and keep the two copies consistent?
`,
  answerTemplate: `## Target architecture

## Store, index and replicate

## Downloads

## Failures and consistency

## Migration
`,
  keyPoints: [
    'Azure Blob is the primary store; S3 holds the secondary copy — each behind its own System API.',
    'A document index (SQL Server) holds metadata (claim, policy, type, blob path, hash) for fast search; the blobs hold only content.',
    'Upload path: store in Azure, write the index, publish a replication request; the S3 copy is made asynchronously so users do not wait for two clouds.',
    'Replication failures retry and then go to a DLQ; a reconciliation job compares index, Azure and S3 by hash.',
    'Large downloads via short-lived read-only links (SAS / pre-signed URLs) issued by the System APIs, not proxied through Mule.',
    'Migration: a nightly job reads from the DMS through sys-dms and feeds the same archive Process API.',
    'Sizing: 0.5 vCore for exp-documents, prc-document-archive, the Blob and the index System APIs carries the 100 a second surge; the replicator and the S3 System API need 0.2 each to catch up after an outage. 2.6 vCores in all.',
    'Deliveries before the DLQ is 60, one a minute: longer than a 30 minute S3 outage, so only requests that keep failing for an hour are parked.',
  ],
  solution: `
**Architecture.**
\`\`\`
 Portal / handler desktop ─► exp-documents ─► prc-document-archive ─► sys-azure-blob-archive ─► Azure Blob
                                                   │    └─► sys-document-index ─► SQL Server index
                                                   └~► doc.replication.requests ─~► prc-archive-replicator ─► sys-s3-archive ─► S3
                                                                         └~► doc.replication.dlq
 Nightly DMS migration job ─► sys-dms ─► on-prem DMS;  job ─► prc-document-archive
\`\`\`

**Store, index, replicate.**
1. \`prc-document-archive\` streams the content to **Upload Blob** with a deterministic name: \`claims/{year}/{month}/{claimId}/{documentId}.{ext}\`, computing a SHA-256 hash.
2. It writes metadata (ids, type, blob path, hash, size, retention date) to the index via \`sys-document-index\`.
3. It publishes \`{documentId, blobPath, hash}\` to \`doc.replication.requests\`. The replicator downloads from Azure and puts the object into S3 (\`s3:put-object\` with bucket and key), then marks the index entry "replicated".

**Downloads.** For large files, the System API returns a short-lived, read-only link (Azure SAS for the blob, or an S3 pre-signed URL as fallback); the browser downloads directly. Small documents can be streamed through the API.

**Failures and consistency.** Upload or index failure → the request fails and nothing is published (clean-up of an orphan blob by the reconciliation job). Replication: retries with backoff, then DLQ with alerting and replay. A weekly reconciliation compares index, Azure listing and S3 listing (count and hash) per prefix. Immutability through storage-level retention policies on both sides.

**Sizing and redelivery.**
- The upload path (\`exp-documents\`, \`prc-document-archive\`, \`sys-azure-blob-archive\`, \`sys-document-index\`) carries 100 uploads a second at the surge, so each gets 0.5 vCore. At 0.1 vCore each one tops out near 50 a second and a third of the surge fails with 503.
- The S3 copy is off the user's path, so an upload takes about 400 ms whether S3 is up or down.
- After a 30 minute S3 outage the queue holds about 36,000 requests. The replicator and \`sys-s3-archive\` get 0.2 vCore each, so they copy about 100 a second and catch up in under 10 minutes.
- \`doc.replication.requests\` moves a request to the DLQ after 60 failed deliveries. A limit of 5 would park thousands of good requests during a normal outage; no limit at all would retry a refused copy forever.
- Total: 2.6 vCores, inside the budget of 3.

**Migration.** The nightly job pages through the DMS via \`sys-dms\` and calls the same archive Process API, at a throttled rate; the index records the source DMS id for traceability; users switch to the new archive per business area once its documents are migrated.
`,
  followUps: [
    { q: 'Why not upload to Azure and S3 in the same request?', a: 'The user would wait for two clouds and a failure in either would fail the request. Writing the primary synchronously and replicating asynchronously keeps uploads fast and makes the copy retryable.' },
    { q: 'Where would you search: in the blob store or in the index?', a: 'In the index. Listing blobs by prefix is fine for "all documents of a claim", but searches by customer, type or date need a database with proper indexes.' },
    { q: 'How do you avoid giving the portal broad storage credentials?', a: 'The portal never gets credentials; the System API checks authorisation and issues a link for a single document with read-only permission and a short expiry.' },
  ],
}
