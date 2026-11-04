import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-082',
  category: 'architecture',
  title: 'Hybrid Cloud Document Archive: Azure Blob Storage with an Amazon S3 Copy',
  level: 'ADVANCED',
  tags: ['azure', 'blob-storage', 's3', 'hybrid-cloud', 'document-archive', 'api-led', 'insurance'],
  estMinutes: 45,
  diagram: {
    task: 'draw a document archive in which portals reach documents through an Experience API, documents are stored in Azure Blob Storage and indexed in a database, and a second copy is written to Amazon S3 asynchronously, with all storage reached only through System APIs.',
    checks: [
      { label: 'Every portal / staff channel calls an Experience API', rule: { type: 'each', of: ['web-app', 'internal-app'], edgeTo: 'experience-api' } },
      { label: 'Azure Blob Storage is reached only through a System API', rule: { type: 'only-via', target: 'azure-blob', from: 'system-api' } },
      { label: 'The S3 bucket is reached only through a System API', rule: { type: 'only-via', target: 's3-bucket', from: 'system-api' } },
      { label: 'The document index database is reached only through a System API', rule: { type: 'only-via', target: ['sql-server', 'oracle-db', 'database'], from: 'system-api' } },
      { label: 'The archive Process API publishes replication requests asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'cloud-queue', 'event-stream', 'topic'], kind: 'async' } },
      { label: 'The S3 copy is made from the replication queue, not in the user\'s request', rule: { type: 'path', from: ['queue', 'cloud-queue', 'event-stream', 'topic'], to: 's3-bucket' } },
      { label: 'Failed replications go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue', 'event-stream', 'topic', 'process-api'], to: 'dlq' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer portal (policy documents)'],
        staff: ['internal-app', 'Claims handler desktop'],
        exp: ['experience-api', 'exp-documents'],
        prc: ['process-api', 'prc-document-archive'],
        job: ['batch-job', 'Nightly migration from on-prem DMS'],
        q: ['queue', 'doc.replication.requests'],
        rep: ['process-api', 'prc-archive-replicator'],
        dlq: ['dlq', 'doc.replication.dlq'],
        sblob: ['system-api', 'sys-azure-blob-archive'],
        ss3: ['system-api', 'sys-s3-archive'],
        sidx: ['system-api', 'sys-document-index'],
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
  },
  description: `
An insurer must retire its on-prem document management system (DMS, 38 TB, 60 million documents) and archive claim and policy documents in the cloud. Requirements:
- **Primary store: Azure Blob Storage** (company standard). Regulators require a **second copy with a different provider**: Amazon S3 in another region.
- Customers download policy documents from the portal; claims handlers upload and view documents (photos, estimates, PDFs up to 25 MB; repair videos up to 2 GB).
- Search by claim, policy, customer and document type within 2 seconds.
- 10-year retention; documents must not be modified after archiving.
- Existing documents must be migrated from the DMS over six months without disrupting users.
- Mule runs on CloudHub 2.0 with a private space connected to the data centre.

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

**Migration.** The nightly job pages through the DMS via \`sys-dms\` and calls the same archive Process API, at a throttled rate; the index records the source DMS id for traceability; users switch to the new archive per business area once its documents are migrated.
`,
  followUps: [
    { q: 'Why not upload to Azure and S3 in the same request?', a: 'The user would wait for two clouds and a failure in either would fail the request. Writing the primary synchronously and replicating asynchronously keeps uploads fast and makes the copy retryable.' },
    { q: 'Where would you search: in the blob store or in the index?', a: 'In the index. Listing blobs by prefix is fine for "all documents of a claim", but searches by customer, type or date need a database with proper indexes.' },
    { q: 'How do you avoid giving the portal broad storage credentials?', a: 'The portal never gets credentials; the System API checks authorisation and issues a link for a single document with read-only permission and a short expiry.' },
  ],
}
