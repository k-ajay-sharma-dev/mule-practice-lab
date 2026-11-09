import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-079',
  category: 'case-studies',
  title: 'Digital Bank Onboarding Customers With KYC Checks in Under Ten Minutes',
  level: 'INTERMEDIATE',
  tags: ['banking', 'kyc', 'onboarding', 'orchestration', 'async', 'pii', 'api-led'],
  estMinutes: 45,
  diagram: {
    task: 'draw the onboarding design: the app on an Experience API, one onboarding Process API that calls the identity, screening, core banking and CRM System APIs, vendor results coming back through a queue, and referred cases waiting on a manual review queue for the analyst workbench.',
    checks: [
      { label: 'The mobile app calls the onboarding Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API never calls System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'One Process API orchestrates identity, screening, core banking and CRM System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 4 } },
      { label: 'The ID and liveness vendor is reached only through its System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'Vendor results come back asynchronously through a queue to the Process API', rule: { type: 'path', from: 'external-api', via: ['queue', 'cloud-queue'], to: 'process-api', kind: 'async' } },
      { label: 'Referred applications wait on a manual review queue read by the analyst workbench', rule: { type: 'path', from: 'process-api', via: { type: ['queue', 'cloud-queue'], label: ['review', 'referral'] }, to: 'internal-app', kind: 'async' } },
      { label: 'Every line into or out of a queue is an async message', rule: { type: 'lines', touching: ['queue', 'cloud-queue'], kind: 'async' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-onboarding-api'],
        prc: ['process-api', 'prc-customer-onboarding-api'],
        sidv: ['system-api', 'sys-identity-verification-api'],
        sscr: ['system-api', 'sys-screening-api'],
        score: ['system-api', 'sys-core-banking-api'],
        scrm: ['system-api', 'sys-crm-api'],
        qres: ['queue', 'kyc.vendor-results'],
        qrev: ['queue', 'kyc.manual-review'],
        ops: ['internal-app', 'KYC analyst workbench'],
        idv: ['external-api', 'ID document and liveness vendor'],
        scr: ['saas', 'Sanctions and PEP screening'],
        core: ['legacy', 'Core banking'],
        crm: ['crm', 'Salesforce Financial Services Cloud'],
        ev: ['s3-bucket', 'KYC evidence store (encrypted)'],
      },
      [
        'mob -> exp', 'exp -> prc', 'prc -> sidv', 'prc -> sscr', 'prc -> score', 'prc -> scrm',
        'sidv -> idv', 'idv ~> sidv', 'sidv ~> qres', 'qres ~> prc', 'sidv -> ev',
        'sscr -> scr', 'score -> core', 'scrm -> crm', 'prc ~> qrev', 'qrev ~> ops',
      ],
    ),
  },
  description: `
**Context.** A digital bank wants to open current accounts for 30,000 new customers a month from its mobile app. Today onboarding takes three days: the app collects data, an overnight batch sends it to a screening provider, and analysts check passports by hand.

**Target journey**
1. The customer enters personal details and takes a photo of their ID and a selfie.
2. An ID and liveness vendor checks the document and face. Most results come back in 30 to 90 seconds by webhook; about 5% take up to 20 minutes for the vendor's human review.
3. Sanctions and PEP screening runs on the name, date of birth and address. It answers in under 2 seconds.
4. If both are clear, the account is opened in core banking and a customer record is created in Salesforce Financial Services Cloud.
5. About 8% of applications are referred (possible sanctions match, poor image, address mismatch) to a KYC analyst.

**Constraints**
- The app shows progress and must not hang on one long HTTP call.
- ID images and selfies are sensitive personal data. They may be kept for 5 years for AML evidence but must not be copied into CRM or logs.
- The core banking system opens accounts through a SOAP service and allows 15 concurrent calls.
- Analysts work 08:00 to 20:00. Referred cases must keep until they are picked up.

**Your task.** Design the integration for the onboarding journey, including referrals, privacy and failure handling.
`,
  answerTemplate: `## Journey and states

## API layers

## Handling slow vendor results

## Referrals and the analyst workbench

## Privacy and evidence

## Failure handling

## Risks
`,
  keyPoints: [
    'One onboarding Process API owns the journey state (started, ID pending, screening, referred, approved, opened) and calls the System APIs for the vendor, screening, core banking and CRM.',
    'The ID vendor answers by webhook: its System API receives the callback and puts the result on a queue, so the Process API resumes the application without the app holding a connection.',
    'The app polls or receives a push for status; it never waits on the vendor in one HTTP call.',
    'Referred cases go to a manual review queue that the analyst workbench reads, so they survive nights and restarts.',
    'Images go only to an encrypted evidence store with a 5 year retention; CRM gets a reference and the outcome, and logs mask personal data.',
  ],
  solution: `
**States.** \`STARTED → ID_PENDING → SCREENING → (REFERRED) → APPROVED → ACCOUNT_OPENED\`, plus \`DECLINED\` and \`EXPIRED\`. The Process API stores the state per application ID in its own small database so a restart resumes where it left off.

**Layers**
- \`exp-onboarding-api\`: \`POST /applications\`, \`POST /applications/{id}/documents\`, \`GET /applications/{id}\` for progress.
- \`prc-customer-onboarding-api\`: the journey logic and state.
- \`sys-identity-verification-api\`: starts a vendor check, receives the vendor webhook (signature verified), stores images in the evidence store, and publishes the result to \`kyc.vendor-results\`.
- \`sys-screening-api\`: synchronous sanctions and PEP check with a 3 second timeout.
- \`sys-core-banking-api\`: wraps the SOAP account opening service with a pool of 15 connections.
- \`sys-crm-api\`: creates the Person Account in Salesforce.

**Slow results.** The app submits documents and gets \`202 Accepted\`. The vendor result arrives on the queue, the Process API picks it up by application ID and moves on. The app polls \`GET /applications/{id}\` every few seconds, or receives a push when the state changes. A 20 minute vendor review does not tie up any thread.

**Referrals.** The Process API sends a referral message to \`kyc.manual-review\` with the reasons and a link to the evidence. The workbench reads the queue; the analyst's decision comes back through an API on the Process API, which then opens the account or declines. A case not picked up within 24 hours raises an alert.

**Privacy.** Images never pass through the Process API or CRM. The System API stores them in an encrypted bucket with object lock for 5 years and passes only a reference. Logs show the application ID, not the name or document number.

**Failures.** Screening timeout: retry once, then refer. Core banking busy: queue the opening request and retry with backoff (the customer sees "account being set up"). Idempotency: the application ID is the key for account opening so a retry cannot open two accounts. Poison messages on the result queue go to a DLQ.

**Risks.** Vendor webhook outage (poll the vendor for checks older than 30 minutes), sanctions list updates during a pending application (screen again right before opening), and analysts overwhelmed at launch (forecast the 8% referral rate and staff for it).
`,
  followUps: [
    { q: 'Why receive the vendor result on a queue and not call the Process API from the webhook?', a: 'The queue keeps the result if the Process API is busy or restarting. The webhook gets a quick acknowledgement, and the Process API consumes at its own pace with retries and a DLQ.' },
    { q: 'How does the app show progress without a long HTTP call?', a: 'It gets 202 Accepted with an application ID, then polls the status resource or receives a push notification when the state changes.' },
    { q: 'How do you stop two accounts being opened for one applicant?', a: 'Use the application ID as an idempotency key on the core banking System API. A repeated request returns the account already opened instead of creating another.' },
    { q: 'Why screen again right before opening the account?', a: 'Sanctions lists change daily. A referral may wait hours, so a final check makes sure the customer was not listed in the meantime.' },
  ],
}
