import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-033',
  category: 'architecture',
  title: 'Large Payloads and the Claim-Check Pattern',
  level: 'INTERMEDIATE',
  tags: ['claim-check', 'large-files', 'streaming', 'object-storage', 'messaging'],
  estMinutes: 25,
  diagram: {
    task: 'draw the claim-check design: where attachments are uploaded and stored, what the ClaimSubmitted message carries to the three consumers, and who fetches the files.',
    checks: [
      { label: 'Clients upload attachments straight to object storage (pre-signed URL), not through Mule', rule: { type: 'edge', from: ['mobile-app', 'web-app'], to: 'file-store' } },
      { label: 'Claim data goes through the Experience and Process APIs', rule: { type: 'path', from: ['mobile-app', 'web-app'], to: 'process-api', via: 'experience-api' } },
      { label: 'The Process API publishes ClaimSubmitted (metadata + references) asynchronously', rule: { type: 'edge', from: 'process-api', to: ['topic', 'queue', 'event-stream'], kind: 'async' } },
      { label: 'The event fans out to the three consumers', rule: { type: 'edge', from: ['topic', 'event-stream'], to: ['queue', 'process-api', 'system-api'], min: 3 } },
      { label: 'Consumers that need the content fetch it from storage by reference', rule: { type: 'edge', from: ['process-api', 'system-api'], to: 'file-store', min: 2 } },
      { label: 'The core claims system is reached only through a System API', rule: { type: 'only-via', target: ['legacy', 'saas', 'erp'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        web: ['web-app', 'Web'],
        ec: ['experience-api', 'exp-claims-api (issues upload URLs)'],
        pc: ['process-api', 'prc-claims-api (verifies objects)'],
        fs: ['file-store', 'Claim attachments bucket (private)'],
        ex: ['topic', 'claim-submitted'],
        fq: ['queue', 'fraud-q'],
        dq: ['queue', 'doc-index-q'],
        cq: ['queue', 'core-claims-q'],
        fr: ['process-api', 'prc-fraud-check (metadata only)'],
        di: ['process-api', 'prc-document-indexing'],
        scc: ['system-api', 'sys-core-claims-api'],
        core: ['legacy', 'Core claims system'],
      },
      [
        'mob -> ec', 'web -> ec', 'mob -> fs', 'web -> fs',
        'ec -> pc', 'pc -> fs', 'pc ~> ex',
        'ex ~> fq', 'ex ~> dq', 'ex ~> cq',
        'fq ~> fr', 'dq ~> di', 'cq ~> scc',
        'di -> fs', 'scc -> fs', 'scc -> core',
      ],
    ),
  },
  description: `
An insurer's claims platform must process **claim submissions** that include documents:

- JSON claim data: ~20 KB.
- Attachments (photos, PDFs): typically 2–10 MB, sometimes 200 MB (video).
- Flow: Mobile/Web → Claims Experience API → Claims Process API → publishes ClaimSubmitted to a message broker → three consumers (fraud check, document indexing, core claims system).
- Mule apps run on CloudHub 2.0 with small replicas (0.5 vCore).
- The broker has a maximum message size far below 200 MB, and large messages hurt broker throughput anyway.

The first prototype base64-encoded the attachments into the JSON and published them on the queue. It failed with out-of-memory errors and rejected messages.

**Questions:**
- Why did the prototype fail?
- Describe the claim-check pattern and how you would apply it here.
- How should the Mule apps handle the file data (streaming, memory)?
- What about security, lifecycle/cleanup and consistency between the message and the stored file?
`,
  answerTemplate: `## Why the prototype failed

## Claim-check design

## Handling file data in Mule

## Security, cleanup and consistency
`,
  keyPoints: [
    'Base64 inflates binary data by about a third and putting it inside JSON forces the whole payload into memory, multiplied across copies during transformation.',
    'Claim check: store the large content in object/blob storage, put only a reference (claim ticket) plus metadata in the message; consumers fetch the content if they need it.',
    'Uploads can bypass Mule entirely using pre-signed/short-lived upload URLs, so Mule handles only metadata.',
    'When Mule must move files, use streaming (repeatable file-store or non-repeatable streams) and avoid DataWeave operations that load the full content.',
    'References must be secured (no public URLs, short-lived signed links, encryption at rest) and stored objects need retention and cleanup rules.',
    'Write the file first and publish the event only after storage succeeded, so a consumer never receives a dangling reference.',
  ],
  solution: `
**Why the prototype failed.**
- Base64 adds roughly 33%; a 200 MB video becomes ~270 MB of text.
- Building JSON around it means the payload is materialised in memory, often several copies during DataWeave transformation → OOM on 0.5 vCore replicas.
- Brokers have message size limits and are designed for many small messages; large messages slow everyone.

**Claim-check design.**
1. Client requests an upload: \`POST /claims/{id}/attachments\` → Experience API returns a **short-lived pre-signed upload URL** for object storage (e.g. S3/Azure Blob) — the file goes straight from the device to storage, not through Mule.
2. Client submits claim JSON with the attachment references (or Mule receives an "upload completed" notification from storage).
3. Process API validates that the objects exist (and optionally size/type, virus scan result), then publishes **ClaimSubmitted** with metadata only:
\`\`\`json
{ "claimId": "CL-991", "attachments": [ { "ref": "claims/CL-991/a1.pdf", "size": 3145728, "contentType": "application/pdf", "sha256": "..." } ] }
\`\`\`
4. Consumers that need the content (document indexing, core claims) fetch it by reference; fraud check may only need metadata.

**Handling file data in Mule (when it must pass through).**
- Keep the payload as a **stream**: HTTP listener → S3/File connector upload without transforming it.
- Mule 4 repeatable **file-store streams** buffer to disk beyond an in-memory threshold, protecting heap; use non-repeatable streams when the content is read exactly once.
- Avoid \`write\`/\`read\` of the full body in DataWeave, \`sizeOf\` on the stream, or logging the payload.
- Use multipart/chunked uploads for very large files.

**Security, cleanup, consistency.**
- Bucket is private; encryption at rest; access via IAM roles of the consuming apps or short-lived signed URLs — never a permanent public link in a message.
- Lifecycle policy: delete orphaned uploads (no claim after 24 h); retain claim documents per regulatory retention.
- Ordering: **store first, publish second**. If publishing fails after storing, retry publish (the orphan cleanup handles the rare leftover). Include a checksum so consumers can verify integrity.
`,
  followUps: [
    { q: 'What if a consumer is outside your cloud and cannot reach the bucket?', a: 'Expose a download API that streams the object after authorizing the caller, or generate a short-lived signed URL per request; do not widen bucket access.' },
    { q: 'Would you use claim check for a 300 KB message?', a: 'Usually not: it adds a storage dependency and an extra call. Use it when payloads approach broker limits, are binary, or are not needed by most consumers.' },
  ],
}
