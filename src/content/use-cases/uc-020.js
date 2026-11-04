import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-020',
  category: 'use-cases',
  title: 'KYC Identity Verification for Account Opening',
  level: 'ADVANCED',
  tags: ['kyc', 'async-orchestration', 'security', 'pii', 'fintech'],
  estMinutes: 35,
  diagram: {
    task: 'draw the onboarding integration: the app, the Onboarding Experience and Process APIs, the persisted application state, the vendor webhook path through a queue, System APIs for every provider, the compliance feedback loop and the timeout checker.',
    checks: [
      { label: 'The mobile app calls an Onboarding Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'ID images go from the app straight to the vendor, not through Mule', rule: { type: 'edge', from: 'mobile-app', to: { type: ['external-api', 'saas'], label: ['vendor', 'identity', 'verif', 'idv', 'kyc'] } } },
      { label: 'Vendor results come back asynchronously through a queue', rule: { type: 'path', from: { type: ['external-api', 'saas'], label: ['vendor', 'identity', 'verif', 'idv', 'kyc'] }, via: ['queue', 'topic', 'event-stream'], to: 'process-api' } },
      { label: 'Application state is persisted (not held in a waiting flow)', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['application', 'state', 'audit'] } } },
      { label: 'The Process API orchestrates System APIs for each provider', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 4 } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: { type: ['legacy', 'erp', 'saas', 'database'], label: ['core', 'banking'] }, from: 'system-api' } },
      { label: 'Compliance decisions flow back into the process', rule: { type: 'path', from: { type: ['saas', 'internal-app'], label: ['compliance', 'case'] }, to: 'process-api' } },
      { label: 'A timeout checker polls the vendor for late results', rule: { type: 'path', from: 'batch-job', to: { type: ['external-api', 'saas'], label: ['vendor', 'identity', 'verif', 'idv', 'kyc'] } } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Banking app'],
        idv: ['external-api', 'ID verification vendor'],
        e: ['experience-api', 'exp-onboarding-api'],
        p: ['process-api', 'prc-onboarding-api'],
        app: ['database', 'Application state + audit log'],
        q: ['queue', 'kyc-results-q'],
        wh: ['system-api', 'sys-idv-vendor-api (webhook + fetch)'],
        sscr: ['system-api', 'sys-screening-api'],
        scr: ['external-api', 'Sanctions / PEP screening'],
        sbur: ['system-api', 'sys-credit-bureau-api'],
        bur: ['legacy', 'Credit bureau (SOAP)'],
        scb: ['system-api', 'sys-core-banking-api'],
        cb: ['legacy', 'Core banking'],
        scase: ['system-api', 'sys-compliance-case-api'],
        cases: ['saas', 'Compliance case tool'],
        timer: ['batch-job', 'Timeout checker'],
      },
      [
        'mob -> e', 'mob -> idv', 'e -> p', 'p -> app', 'idv -> wh', 'wh ~> q', 'q ~> p', 'p -> wh', 'wh -> idv', 'p -> sscr',
        'sscr -> scr', 'p -> sbur', 'sbur -> bur', 'p -> scb', 'scb -> cb', 'p -> scase', 'scase -> cases', 'cases -> scase',
        'scase ~> q', 'timer -> wh',
      ],
    ),
  },
  description: `
A digital bank lets customers **open an account in its mobile app**. Before activation, regulations require **KYC/AML checks**:

1. **Document + selfie verification** with an identity-verification vendor (the app uploads ID photos and a selfie video to the vendor SDK; the vendor returns a result via **webhook**, usually in 2 minutes, sometimes hours when manual review is needed).
2. **Sanctions and PEP screening** with a screening provider (synchronous REST, ~1 s).
3. **Address verification** against a credit bureau (SOAP, sometimes slow).
4. Create the customer and account in the **core banking system** only if all checks pass.

Constraints:
- 5,000 applications/day, marketing campaigns can bring 5× peaks.
- Applicants must see progress in the app; ~80% should be approved **within 10 minutes**.
- Any "possible match" on sanctions/PEP or a vendor "review" result goes to the **compliance team's case tool**; compliance decisions must be fed back.
- Personal data and ID images are highly sensitive; the regulator requires a full **audit trail** of every check and decision, retained for 5 years after the relationship ends.
- The bank plans to add a second identity vendor as fallback next year.

**Design the integration:**
- APIs and the orchestration of a long-running process.
- How you handle async vendor results, timeouts and retries.
- Manual review loop and final decision.
- Security, data minimisation and audit.
`,
  answerTemplate: `## API design

## Process orchestration and state

## Async results and timeouts

## Manual review

## Security, privacy and audit

## Vendor independence
`,
  keyPoints: [
    'Onboarding Process API with an application state machine persisted in a database (not in-memory), progressed by events; the app polls or receives push updates on status.',
    'Independent checks run in parallel where possible; vendor webhooks verified, de-duplicated and correlated by application ID; timeouts handled by scheduled checks, not blocking threads.',
    'Decision rules explicit: all pass → create customer/account in core banking idempotently; any hit/review → case in compliance tool; decisions fed back via API/event.',
    'Sensitive data minimised: images go app → vendor directly (SDK), Mule handles references and results; PII encrypted at rest and masked in logs; mTLS/OAuth to vendors.',
    'Immutable audit log of each check request/response summary, rule version and decision with timestamps and actor.',
    'Vendor-agnostic System API contracts so a second identity vendor (fallback/routing) is a new adapter.',
  ],
  solution: `
**API design.**
- **Onboarding Experience API** (mobile): \`POST /applications\`, \`GET /applications/{id}\` (status + next step), secured with OAuth 2.0 (app/user tokens).
- **Onboarding Process API**: orchestrates checks and decisions.
- **System APIs**: identity-verification vendor, screening provider, credit bureau (SOAP via Web Service Consumer), core banking, compliance case tool. Each exposes a **vendor-neutral contract** (e.g. \`POST /identity-checks\` returning status PASS/FAIL/REVIEW).

**Process orchestration and state.** This is long-running (minutes to days), so state lives in an **application table** (or a workflow engine), never in a waiting Mule flow:
*Created → IdentityPending → ChecksInProgress → (Approved | InReview | Rejected) → AccountCreated*.
- After the app finishes the vendor SDK upload, the vendor calls back. Meanwhile the Process API runs **sanctions/PEP screening** and **address verification** in parallel (scatter-gather or separate queued tasks), saving each result.
- Every result is an event on Anypoint MQ; a decision step evaluates the application each time a result arrives: all PASS → approve; any FAIL → reject; any REVIEW/possible match → compliance case.
- On approval, create customer and account in **core banking** with application ID as idempotency key (look up before create).
- The app polls \`GET /applications/{id}\` or receives a push notification on status change.

**Async results and timeouts.**
- Vendor webhooks: verify signature, store and enqueue, ack quickly; de-duplicate by vendor check ID; correlate via the application ID passed to the vendor as reference. Fetch the full result from the vendor API rather than trusting the webhook body alone.
- Timeouts: a scheduler finds applications waiting longer than expected (e.g. identity > 30 minutes) and polls the vendor, informs the user that a manual check is in progress, and alerts if beyond SLA.
- Synchronous providers: timeout + retry with backoff for technical errors; persistent failure → application paused, not rejected (never reject a customer because a vendor was down).
- Peaks: intake is queue-based, consumers scale with replicas, and calls to each provider are throttled to their contracted limits.

**Manual review.** Possible matches create a **case** in the compliance tool with the check results and links (not copies) to evidence in the vendor portal. The compliance decision (approve/reject + reason, analyst ID) comes back via API/webhook, is recorded and continues the state machine. Four-eyes rules stay in the case tool.

**Security, privacy and audit.**
- **Data minimisation**: ID images go from the app straight to the vendor via its SDK; Mule only handles references and structured results.
- PII encrypted in transit (TLS, mTLS to vendors where offered) and at rest (DB encryption, field-level for document numbers); secrets in a vault; **masked logs** (application ID only).
- **Audit log**: append-only record of every check (what was sent at summary level, result, vendor reference, rules version, decision, timestamp, system/analyst) retained per regulation; separate retention and deletion rules for rejected applicants.
- Access to the integration's data restricted by role; Anypoint environments and logs access controlled.

**Vendor independence.** Because the Process API talks to a neutral identity-check contract, adding vendor B is a new System API plus routing rules (fallback on vendor A outage, or by country/document type).
`,
  followUps: [
    { q: 'The vendor webhook arrives before your system created the application record. Possible?', a: 'Yes, with races. Store the event anyway (keyed by reference), and when the application record exists or on the next evaluation, apply pending results; never drop unknown-reference events immediately.' },
    { q: 'How do you avoid creating two bank accounts if core banking times out?', a: 'Use the application ID as an external reference, query core banking for it before retrying the create, and keep the step state in the application table.' },
    { q: 'How do you test with real-looking identity data?', a: 'Vendor sandboxes provide test documents/outcomes (pass, fail, review); never use real customer IDs in lower environments. Test each branch of the state machine and the timeout scheduler.' },
  ],
}
