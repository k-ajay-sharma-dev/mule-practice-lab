import { design, flow, handler, source, step } from '../../flow/dsl.js'

// The claim the portal sends, and the claim-check ticket for it on the queue.
const claimDoc = {
  policyNo: 'POL-88120417',
  claimant: { name: 'Daniel Okafor', email: 'd.okafor@example.com' },
  incidentDate: '2026-11-09',
  documents: [
    { name: 'front-bumper.jpg', base64: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT' },
    { name: 'repair-estimate.pdf', base64: 'JVBERi0xLjcKJcfsj6IKNSAwIG9iago8PC9MZW5ndGggNiAwIFIvRmlsdGVyIC9GbGF0ZURlY29kZT4+CnN0cmVhbQp4nCWLsQ' },
  ],
}
// SHA-256 of claimDoc written as JSON, the way the intake flow computes it.
const claimSha = '6ade6a60a9d4cf5c2ca367b23fce5748d4197b0e1b5e503f2ab18cf762ed0f4a'
const ticket = (sha256) => ({
  claimId: '7f3c9a10-5d2e-4b8a-9c61-2e0f4d8b7a35',
  policyNo: 'POL-88120417',
  bucket: 'acme-claims-documents',
  key: 'claims/2026/11/13/7f3c9a10-5d2e-4b8a-9c61-2e0f4d8b7a35.json',
  sha256,
  receivedAt: '2026-11-13T09:59:58Z',
})

export default {
  id: 'fl-044',
  category: 'flows',
  title: 'Claim Check Pattern for Large Messages over Anypoint MQ',
  level: 'ADVANCED',
  tags: ['myproject', 'claim-check', 'anypoint-mq', 's3', 'large-payload', 'messaging'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Claims are received through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'The large body is stored externally before the message is published',
      rule: { type: 'before', first: ['s3-put', 'db-insert', 'file-write', 'sftp-write'], then: 'mq-publish' },
    },
    { label: 'The incoming document is validated (size / checksum)', rule: { type: 'exists', component: 'validation' } },
    {
      label: 'The portal flow answers after the publish and never calls the slow claims system itself',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'http-listener', then: 'mq-publish' },
          { type: 'absent', component: 'wsc-consume', inFlowWith: { component: 'http-listener' } },
        ],
      },
    },
    {
      label: 'The consumer verifies the checksum after it reads the body back',
      rule: {
        type: 'before',
        first: ['s3-get', 'db-select', 'file-read', 'sftp-read'],
        then: ['validation', 'raise-error'],
      },
    },
    {
      label: 'The consumer uses manual acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The consumer retrieves the body by its key before calling the back end',
      rule: { type: 'before', first: ['s3-get', 'http-request', 'db-select'], then: ['wsc-consume', 'http-request'] },
    },
    {
      label: 'The message is acknowledged only after successful processing',
      rule: { type: 'before', first: ['wsc-consume', 'http-request'], then: 'mq-ack', every: true },
    },
    {
      label: 'A failed message is returned to the queue (Nack) from an error handler',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-continue', 'on-error-propagate'] },
    },
  ],
  simulation: {
    systems: {
      calls: {
        's3-get': { payload: claimDoc },
        'wsc-consume': { latencyMs: 12000, payload: { SubmitClaimResponse: { ClaimRef: 'LC-2026-118204', Status: 'ACCEPTED' } } },
      },
    },
    tests: [
      {
        name: 'The portal submits a claim',
        about: 'The portal gets its answer within 2 s, and the queue gets a small ticket without the documents.',
        trigger: { http: { method: 'POST', path: '/claims/v1/submissions', headers: { 'content-length': '2400000' }, body: claimDoc } },
        expect: {
          status: 202,
          maxMs: 2000,
          sent: [{ destination: 'claims-intake', count: 1, has: { policyNo: 'POL-88120417', documents: undefined } }],
        },
      },
      {
        name: 'The claims system accepts the claim',
        about: 'The worker reads the document back, checks it and submits it, then acknowledges the message.',
        trigger: { message: { kind: 'mq', destination: 'claims-intake', payload: ticket(claimSha) } },
        expect: { ack: 'acked' },
      },
      {
        name: 'The claims system is in maintenance',
        about: 'SubmitClaim fails, so the message goes back to the queue and the claim is not lost.',
        trigger: { message: { kind: 'mq', destination: 'claims-intake', payload: ticket(claimSha) } },
        overrides: { systems: { calls: { 'wsc-consume': { fault: { type: 'WSC:CONNECTIVITY', description: 'Connection refused: claims system in maintenance' } } } } },
        expect: { ack: 'returned' },
      },
      {
        name: 'The stored document was altered',
        about: 'The checksum in the ticket does not match the document, so the claim is not submitted and the message is not acknowledged.',
        trigger: { message: { kind: 'mq', destination: 'claims-intake', payload: ticket('0'.repeat(64)) } },
        expect: { ack: 'returned' },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'claims-intake-api',
      why: 'The intake handlers only log or set 413. Mule already answers an error status and logs the failure by default, and the scenario does not ask for a specific status for a large upload.',
    },
  ],
  referenceFlow: design(
    flow(
      'claims-intake-api',
      source('http-listener', { path: '/claims/v1/submissions', allowedMethods: 'POST' }),
      [
        step('validation', {
          check: 'is-true',
          expression: '#[(attributes.headers."content-length" as Number) <= 52428800]',
          message: 'Submission larger than 50 MB',
        }),
        step('set-variable', { variableName: 'claimId', value: '#[uuid()]' }),
        step('set-variable', { variableName: 's3Key', value: '#["claims/" ++ (now() as String {format: "yyyy/MM/dd"}) ++ "/" ++ vars.claimId ++ ".json"]' }),
        step('set-variable', {
          variableName: 'sha256',
          value: '#[dw::core::Binaries::toHex(dw::Crypto::hashWith(write(payload, "application/json") as Binary, "SHA-256"))]',
        }),
        step('set-variable', { variableName: 'policyNo', value: '#[payload.policyNo]' }),
        // Put Object outputs a Put Object Response, so the ticket below reads the saved variable.
        step('s3-put', { bucket: 'acme-claims-documents', key: '#[vars.s3Key]' }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  claimId: vars.claimId,\n  policyNo: vars.policyNo,\n  bucket: "acme-claims-documents",\n  key: vars.s3Key,\n  sha256: vars.sha256,\n  receivedAt: now()\n}',
        }),
        step('mq-publish', { destination: 'claims-intake' }),
        step('set-variable', { variableName: 'httpStatus', value: '202' }),
        step('set-payload', { value: '#[output application/json --- { claimId: vars.claimId, status: "RECEIVED" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [step('set-variable', { variableName: 'httpStatus', value: '413' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('logger', { level: 'ERROR', message: '#[error.description]' })]),
      ],
    ),
    flow(
      'claims-intake-worker',
      source('mq-subscriber', { destination: 'claims-intake', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('set-variable', { variableName: 'ticket', value: '#[payload]' }),
        // Output Mime Type application/json on Get Object, so the Transform below can select fields.
        step('s3-get', { bucket: 'acme-claims-documents', key: '#[vars.ticket.key]' }),
        step('validation', {
          check: 'is-true',
          expression: '#[dw::core::Binaries::toHex(dw::Crypto::hashWith(write(payload, "application/json") as Binary, "SHA-256")) == vars.ticket.sha256]',
          message: 'Document checksum mismatch',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/xml\nns clm http://legacy.acme.com/claims\n---\n{\n  clm#SubmitClaim: {\n    clm#ClaimId: vars.ticket.claimId,\n    clm#PolicyNo: payload.policyNo,\n    clm#Documents: { (payload.documents map { clm#Document: { clm#Name: $.name, clm#Content: $.base64 } }) }\n  }\n}',
        }),
        step('wsc-consume', { operation: 'SubmitClaim' }),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-continue', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Claim " ++ (vars.ticket.claimId default "?") ++ " failed: " ++ error.description]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
  ),
  description: `
An insurer's **claims portal** submits new claims as JSON with embedded documents (photos, PDFs, base64). Most are 1 to 3 MB, but **10% are 15 to 40 MB**.

The legacy **claims system** (SOAP \`SubmitClaim\`) is slow (5 to 60 s) and is down for maintenance every night for an hour, so the architects want a queue between the portal and the legacy system.

Constraints:
- **Anypoint MQ messages are limited to 10 MB**; large messages also slow brokers and inflate costs.
- The portal must get an acknowledgement within **2 s**.
- No claim may be lost: a claim stays on the queue until the claims system has accepted it. Documents must arrive unaltered (integrity check required by the regulator).
- Documents must be kept for 7 years anyway, in the corporate **S3** bucket \`acme-claims-documents\`.
- ≈8,000 claims/day.

**Facts**
- The portal posts each claim to \`POST /claims/v1/submissions\`. A claim has a \`policyNo\`, the claimant and a \`documents\` list. Answer **202** with a \`claimId\`.
- The queue is the Anypoint MQ queue \`claims-intake\`. Its message must carry the \`policyNo\` and where the claim is stored.
- The checksum is the hex SHA-256 of the claim written as JSON: \`write(payload, "application/json")\`. Compute it the same way on both sides.
- A claim the consumer cannot submit, including one whose checksum does not match, goes back to the queue. The queue's own dead-letter queue catches it after its maximum deliveries.
- The claims system's \`SubmitClaim\` (namespace \`http://legacy.acme.com/claims\`) takes \`<SubmitClaim>\` with \`ClaimId\`, \`PolicyNo\` and \`<Documents>\` holding one \`<Document>\` (\`Name\`, \`Content\` in base64) per document. It answers \`<SubmitClaimResponse><ClaimRef>LC-2026-118204</ClaimRef><Status>ACCEPTED</Status></SubmitClaimResponse>\` after 5 to 60 s.
- During maintenance \`SubmitClaim\` cannot be reached and the Web Service Consumer raises \`WSC:CONNECTIVITY\`.

**Design the flow(s):** intake, where the large body goes, what the queue message contains, the consumer, integrity checking and failure handling.
`,
  answerTemplate: `## Intake and validation

## Storing the body (the "claim")

## The queue message (the "check")

## Consumer flow

## Integrity

## Failures and clean-up
`,
  keyPoints: [
    'Claim check: store the large body in external storage (S3) and publish only a small reference message (claimId, bucket/key, checksum) to the queue.',
    'The body is stored before publishing, so a consumer never receives a reference to a document that does not exist.',
    'A checksum (SHA-256) is computed at intake and verified by the consumer to prove integrity.',
    'The consumer uses manual ack: retrieve body by key → transform → call legacy system → ack; on failure nack (redelivery, then DLQ after max deliveries).',
    'The API returns 202 with the claimId quickly; the slow/unavailable legacy system only affects the queue backlog, not the portal.',
  ],
  solution: `
**Intake flow**: \`POST /claims/v1/submissions\`
1. **Validate** size (≤ 50 MB) and mandatory fields.
2. Generate \`claimId\`; compute **SHA-256** of the claim written as JSON (\`write(payload, "application/json")\`), and save \`policyNo\` in a variable. The worker hashes the document it reads back the same way, so equal hashes prove nothing changed. Hashing the raw bytes (\`payload.^raw\`) at both ends works too.
3. **S3 Put Object** \`claims/yyyy/MM/dd/{claimId}.json\` in \`acme-claims-documents\` (the "claim"). This also satisfies the 7-year retention requirement. Its output is a Put Object Response, not your claim, which is why step 2 saved what the ticket needs.
4. DataWeave builds the small **claim-check** message: \`{ claimId, policyNo, bucket, key, sha256, receivedAt }\` (< 1 KB).
5. **Anypoint MQ Publish** \`claims-intake\` (queue with DLQ, max deliveries e.g. 10) → respond **202**.

**Worker flow**: MQ Subscriber \`claims-intake\`, **MANUAL** ack
1. **S3 Get Object** by key, with Output Mime Type \`application/json\` so DataWeave can select fields from the body.
2. **Validate** the checksum: a mismatch is a hard error (alert, DLQ).
3. DataWeave → SOAP \`SubmitClaim\` via **Web Service Consumer**.
4. **Ack**. On error → **Nack**, which returns the message to the queue; after max deliveries it lands in the DLQ for ops. Nack sets no wait of its own, so the nightly outage can use up the deliveries: size them for that, or replay the DLQ when the legacy system is back.

**Clean-up:** nothing to delete: the S3 object is the retained record. If storage were temporary, an S3 lifecycle rule or a Scheduler would purge processed objects.
`,
  followUps: [
    {
      q: 'What happens if the S3 put succeeds but the MQ publish fails?',
      a: 'The API returns an error and the portal retries; the orphaned object is harmless (same claimId is not reused) and can be swept by a lifecycle rule or a reconciliation job comparing S3 keys with processed claims.',
    },
    {
      q: 'Why not raise the payload limit or compress the message?',
      a: 'MQ has a hard 10 MB limit, and compression is unpredictable for images/PDFs. Large messages also hurt broker throughput and retries re-send the whole payload; a reference keeps the queue light.',
    },
    {
      q: 'How do you secure access to the stored documents?',
      a: 'Bucket encryption (SSE-KMS), least-privilege IAM for the two Mule apps only (put vs get), no public access, and optionally short-lived pre-signed URLs if a third party must read the document.',
    },
  ],
}
