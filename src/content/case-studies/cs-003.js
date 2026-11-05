import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-003',
  category: 'case-studies',
  title: 'Insurer Modernising Claims Intake',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'async', 'documents', 'legacy'],
  estMinutes: 35,
  diagram: {
    task: 'draw the claims intake architecture: the channels, Experience/Process/System APIs, the asynchronous hand-off to the legacy claims system, and where documents are stored.',
    checks: [
      { label: 'Web, mobile and broker channels each call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app', 'partner'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Every Experience API goes through the shared Claims Intake Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The intake Process API publishes the claim asynchronously (claim reference returned at once)', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'Claims reach the legacy claims system from the queue, not from a channel call', rule: { type: 'path', from: ['queue', 'topic', 'event-stream'], to: 'legacy' } },
      { label: 'Legacy systems are reached only through System APIs', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Messages that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'topic', 'process-api'], to: 'dlq' } },
      { label: 'Photos and PDFs are stored in a document store; only IDs travel with the claim', rule: { type: 'edge', from: ['system-api', 'process-api', 'mobile-app'], to: 'file-store' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web claim form'],
        mob: ['mobile-app', 'Mobile app (photos)'],
        brk: ['partner', 'Brokers (email + PDF)'],
        cc: ['internal-app', 'Call centre'],
        ew: ['experience-api', 'claims-web-eapi'],
        em: ['experience-api', 'claims-mobile-eapi'],
        eb: ['experience-api', 'claims-broker-eapi'],
        prc: ['process-api', 'claims-intake-papi'],
        q: ['queue', 'claim-submitted'],
        dlq: ['dlq', 'claim-submitted-dlq'],
        tri: ['process-api', 'prc-claims-triage-consumer'],
        spol: ['system-api', 'policy-sapi'],
        sleg: ['system-api', 'claims-legacy-sapi'],
        sdoc: ['system-api', 'documents-sapi'],
        pol: ['legacy', 'Policy system'],
        leg: ['legacy', 'Legacy claims system (SOAP)'],
        docs: ['file-store', 'Document store (S3/ECM)'],
        ntf: ['notification', 'Push / email status'],
      },
      [
        'web -> ew', 'cc -> ew', 'mob -> em', 'brk -> eb',
        'ew -> prc', 'em -> prc', 'eb -> prc',
        'prc -> spol', 'prc -> sdoc', 'prc ~> q', 'q ~> tri', 'q ~> dlq',
        'tri -> sleg', 'tri -> ntf',
        'spol -> pol', 'sleg -> leg', 'sdoc -> docs',
      ],
    ),
  },
  description: `
**Context.** A car and home insurer receives claims through four channels:
- a web form
- a mobile app (with photos)
- brokers (who email PDF forms)
- a call centre

All claims end up in a **20-year-old claims system**. It offers only two ways in:
- a fixed-width file loaded overnight
- a slow SOAP service for single claims (~8 s per call, often unavailable during its nightly batch)

**Goals**
- Customers get a **claim reference immediately**, whatever the channel.
- Simple claims (e.g. windscreen) should be approved the same day.
- Photos and documents must be stored and linked to the claim.
- A future mobile app redesign should not need back-end changes.

**Constraints**
- The legacy claims system will stay for at least 3 more years.
- Claims data contains personal data (GDPR).

**Your task.** Propose an integration architecture for claims intake and explain how a claim flows end to end.
`,
  answerTemplate: `## Architecture (layers and APIs)

## End-to-end flow of one claim

## Handling the legacy claims system

## Documents and photos

## Security and data protection
`,
  keyPoints: [
    'Uses API-led layers: channel-specific Experience APIs, a shared Claims Intake Process API, and System APIs for the claims system, policy system and document store.',
    'Intake is asynchronous: validate, persist/queue the claim, return a claim reference (e.g. 202 Accepted) without waiting for the legacy system.',
    'Legacy system is decoupled behind a System API fed from a queue, with retries, dead-letter handling and tolerance for its nightly downtime.',
    'Documents/photos go to a document store (e.g. S3/ECM) and only a reference/ID travels through the flow, not large binaries.',
    'Simple claims are routed to a fast path (rules/triage step) while complex ones go to handlers.',
    'Personal data protected: auth on every API, TLS, masking PII in logs, least-privilege access, retention rules.',
  ],
  solution: `
**Architecture.**
- **Experience APIs**: \`claims-web-eapi\`, \`claims-mobile-eapi\`, \`claims-broker-eapi\` (incl. an email/PDF intake flow). They shape data for each channel and call one process API. The call centre uses the web one.
- **Process API**: \`claims-intake-papi\` — validates the claim, checks the policy, triages, stores documents, publishes the claim for the legacy system.
- **System APIs**: \`policy-sapi\` (is the policy active, what's covered), \`claims-legacy-sapi\` (wraps the SOAP service), \`documents-sapi\` (object storage / ECM).

**One claim end to end.**
1. Mobile app posts the claim + photo upload references to \`claims-mobile-eapi\`.
2. \`claims-intake-papi\` validates the payload, calls \`policy-sapi\` to confirm cover, generates a **claim reference**, saves the claim in an intake store, and publishes a *ClaimSubmitted* message to **Anypoint MQ**.
3. Customer gets **202 Accepted** with the claim reference in a second or two.
4. A consumer picks up the message, runs **triage rules**: windscreen + active policy + amount under a threshold → auto-approve path; otherwise → handler work queue.
5. The consumer calls \`claims-legacy-sapi\` to create the claim in the legacy system and stores the legacy claim ID against the reference.
6. Status updates are sent back (push notification / email) through the channel.

**Legacy system.** Never call it synchronously from a channel. The queue absorbs its slowness and its nightly window: retries with backoff, a **DLQ** for messages that keep failing, an idempotency check on the claim reference so retries don't create duplicates. The overnight fixed-width file can remain for bulk/back-office loads.

**Documents.** Photos and PDFs are uploaded directly (or via \`documents-sapi\`) to object storage; the claim carries only **document IDs**. Broker PDFs can go through document extraction (e.g. MuleSoft IDP or OCR) to pre-fill the claim, with manual review when confidence is low.

**Security.** OAuth 2.0 / client ID enforcement on all APIs, TLS everywhere, **mask PII** in logs, encrypt data at rest, limit who can read claim data, and apply retention/deletion rules for GDPR.
`,
}
