import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-043',
  category: 'use-cases',
  title: 'Insurance Claim Photo Upload and Damage Assessment',
  level: 'ADVANCED',
  tags: ['file-upload', 'claim-check', 'object-storage', 'insurance', 'async'],
  estMinutes: 35,
  diagram: {
    task: 'draw the claim-photo flow: the mobile Experience API, direct upload to object storage (claim check), the upload-completed processing, the claims core, policy and ECM System APIs, and the asynchronous damage-assessment call with its callback.',
    checks: [
      { label: 'The mobile app calls an Experience API for claims and upload URLs', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'Photos and videos go straight from the app to object storage, not through Mule', rule: { type: 'edge', from: 'mobile-app', to: 'file-store' } },
      { label: 'An upload-completed event is published asynchronously', rule: { type: 'edge', from: ['file-store', 'experience-api'], to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API consumes upload events (scan, store in ECM, link to claim)', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The claims and policy core systems are reached only through System APIs', rule: { type: 'only-via', target: ['legacy', 'erp'], from: 'system-api' } },
      { label: 'The damage-assessment vendor is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The vendor posts its result back to a secured callback API', rule: { type: 'edge', from: 'external-api', to: ['experience-api', 'process-api', 'system-api'] } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Claims mobile app'],
        exp: ['experience-api', 'exp-claims-mobile-api'],
        cb: ['experience-api', 'exp-assessment-callback'],
        prc: ['process-api', 'prc-claims-api'],
        doc: ['process-api', 'prc-claim-documents'],
        q: ['queue', 'upload-completed'],
        os: ['file-store', 'EU object storage (pre-signed URLs)'],
        spol: ['system-api', 'sys-policy-api'],
        sclm: ['system-api', 'sys-claims-core-api'],
        secm: ['system-api', 'sys-ecm-api'],
        sai: ['system-api', 'sys-damage-assessment-api'],
        pol: ['legacy', 'Policy system'],
        clm: ['legacy', 'Claims core (on-prem)'],
        ecm: ['file-store', 'ECM'],
        ai: ['external-api', 'AI damage assessment (async)'],
      },
      [
        'mob -> exp', 'mob -> os', 'exp -> prc', 'os ~> q', 'q ~> doc', 'prc -> spol', 'prc -> sclm', 'doc -> secm', 'doc -> sclm', 'doc -> sai',
        'spol -> pol', 'sclm -> clm', 'secm -> ecm', 'sai -> ai', 'ai -> cb', 'cb -> prc',
      ],
    ),
  },
  description: `
A motor insurer wants customers to file car-damage claims from its mobile app, including **photos and videos**, and get a first **repair estimate** quickly.

Facts:
- Customers upload **6–20 photos** (2–8 MB each) and optionally a **video up to 200 MB**, often over poor mobile connections.
- The **claims system** (Guidewire-style core system, on-prem, SOAP/REST APIs) creates the claim and must store references to all documents, but cannot store large binaries itself; documents go to the **enterprise content management (ECM)** system.
- A third-party **AI damage-assessment** service accepts photo URLs and returns damaged parts, severity and an estimated repair cost in **2–15 minutes** (async with callback).
- ~3,000 claims/day; storms produce 10× peaks.
- Rules: estimates under **€2,500** with high confidence and no fraud flags can be **auto-approved** for repair at a partner garage; others go to an adjuster.
- Photos contain **number plates and faces**; GDPR applies. Policy and claim data must not leave the EU.

**Describe your solution:**
- How should the app upload large files — through Mule or not?
- How do you create the claim and link documents?
- How do you integrate the asynchronous assessment service?
- How do you implement the auto-approval decision safely?
`,
  answerTemplate: `## Upload design

## Claim creation

## Document handling

## Assessment integration

## Decision and routing

## Security, privacy and NFRs
`,
  keyPoints: [
    'Binary uploads go directly to object storage via short-lived pre-signed URLs (multipart/resumable), not through the Mule API; Mule handles metadata and orchestration (claim-check pattern).',
    'Claim API validates policy coverage and creates the claim first (or a draft) in the core system, returning a claim ID used to key all uploads.',
    'Upload-complete events trigger processing: virus scan, metadata extraction, store in ECM and link document IDs to the claim.',
    'Assessment called asynchronously with time-limited URLs; callback endpoint secured and correlated by claim ID, with timeout handling if no callback arrives.',
    'Auto-approval rules (amount, confidence, fraud score, coverage) externalised and audited; everything else routed to an adjuster.',
    'EU-resident storage and vendor processing, encryption, minimal retention of copies, and logging without personal data.',
  ],
  solution: `
**Upload design.** Streaming 200 MB videos through an API layer over mobile networks wastes worker memory and fails often. Instead:
1. App calls \`POST /claims/{claimId}/uploads\` (Experience API) with file names, types and sizes.
2. Mule validates (count, type, size) and returns **pre-signed upload URLs** for EU object storage (S3/Azure Blob), valid ~15 minutes, supporting **multipart/resumable** uploads.
3. The app uploads directly; storage emits an **object-created event** (or the app calls \`/uploads/complete\`).

Mule only handles metadata and orchestration — the **claim-check pattern**.

**Claim creation.** \`POST /claims\` → Claims Process API: verify the policy is active and covers the vehicle/date (Policy System API), create a **first notice of loss (FNOL)** in the claims system via its System API, and return the claim ID. Idempotency key from the app (one claim per submission even if the request is retried on a bad network).

**Document handling.** On upload completed: virus/malware scan, check the file really is an image/video, extract metadata (EXIF time/location, useful for fraud checks), store in the **ECM** (or keep in object storage with an ECM reference), and **link document IDs to the claim** in the claims system. Large files are streamed storage → ECM without loading them fully in memory.

**Assessment integration.** When the required photos are present, call the assessment API with **time-limited read URLs** and a **callback URL**. The callback endpoint is secured (mTLS or signature/OAuth), correlates by claim ID + request ID, and is idempotent. A Scheduler checks for assessments without callback after 30 minutes → poll the vendor's status endpoint or route to an adjuster.

**Decision and routing.** Rules (configuration, versioned): estimate < €2,500, confidence ≥ threshold, fraud score low (fraud service), policy has no outstanding premium, no injuries reported → **auto-approve**: update claim, create repair order at a partner garage via the garage network API, notify the customer. Otherwise → adjuster task in the claims system with the assessment attached. Every decision stores inputs and rule version.

**Security, privacy and NFRs.**
- Data stays in EU regions; the assessment vendor contract and region verified.
- Number plates/faces: only shared with processors that need them; optional blurring before sending to third parties where not needed.
- Encryption in transit and at rest, pre-signed URLs short-lived, logs contain claim IDs only.
- Storm peaks: upload path scales with object storage; queues buffer processing; assessment calls throttled to vendor quota.
`,
  followUps: [
    { q: 'Why not just accept multipart/form-data in a Mule API?', a: 'It works for small files, but large videos over mobile mean long-lived connections, memory pressure and retries of the whole upload. Direct-to-storage with resumable uploads is more reliable and cheaper.' },
    { q: 'What if the customer uploads only 3 photos and leaves?', a: 'The claim stays in an incomplete state; reminders are sent via push, and after a timeout an adjuster contacts the customer. Assessment starts only once minimum photo requirements are met.' },
    { q: 'How would you test it?', a: 'MUnit for orchestration and rules with mocked vendor and claims APIs; integration tests with sample images; a load test simulating storm peaks on the claim and callback APIs.' },
  ],
}
