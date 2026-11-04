import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-020',
  category: 'case-studies',
  title: 'Fintech Lender Orchestrating Loan Origination',
  level: 'ADVANCED',
  tags: ['fintech', 'orchestration', 'security', 'pii', 'third-party-apis'],
  estMinutes: 45,
  diagram: {
    task: 'draw the loan origination architecture: app and broker channels, the loan application Process API with its state store, vendor System APIs behind a canonical model, the asynchronous path for slow applications, and booking and funding.',
    checks: [
      { label: 'Brokers come in through the API gateway (credentials per broker, SLA tiers)', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'Every Experience API calls the loan application Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Process API runs checks against at least three System APIs (KYC, bureau, decision…)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Third-party vendors are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'One credit-bureau System API hides both bureaus behind a canonical report', rule: { type: 'edge', from: { type: 'system-api', label: ['bureau', 'credit'] }, to: 'external-api', min: 2 } },
      { label: 'Application state and vendor results are persisted (no duplicate pay-per-call on retry)', rule: { type: 'edge', from: 'process-api', to: ['database', 'cache'] } },
      { label: 'Applications whose checks time out continue asynchronously', rule: { type: 'edge', from: 'process-api', to: ['queue', 'topic'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Lender app'],
        brk: ['partner', 'Broker / comparison site'],
        gw: ['api-gateway', 'Gateway (OAuth client credentials, SLA tiers)'],
        eapp: ['experience-api', 'app-loans-eapi'],
        ebrk: ['experience-api', 'broker-loans-eapi'],
        ploan: ['process-api', 'loan-application-papi'],
        q: ['queue', 'pending-applications'],
        st: ['database', 'Application state + vendor results'],
        skyc: ['system-api', 'kyc-sapi'],
        sbur: ['system-api', 'credit-bureau-sapi'],
        sdec: ['system-api', 'decision-engine-sapi'],
        spay: ['system-api', 'payments-sapi'],
        kyc: ['external-api', 'KYC vendor'],
        ba: ['external-api', 'Credit bureau A'],
        bb: ['external-api', 'Credit bureau B'],
        eng: ['saas', 'Decision engine'],
        pay: ['payment', 'Payments provider'],
      },
      [
        'app -> eapp', 'brk -> gw', 'gw -> ebrk', 'eapp -> ploan', 'ebrk -> ploan',
        'ploan -> st', 'ploan ~> q', 'q ~> ploan',
        'ploan -> skyc', 'ploan -> sbur', 'ploan -> sdec', 'ploan -> spay',
        'skyc -> kyc', 'sbur -> ba', 'sbur -> bb', 'sdec -> eng', 'spay -> pay',
      ],
    ),
  },
  description: `
**Context.** A digital lender offers personal loans through its app and through comparison/broker websites. A loan application requires: identity verification (KYC vendor), fraud scoring, credit bureau reports from two bureaus, open-banking income verification (via an aggregator), an internal decision engine, e-signature, and finally booking in the loan management system (LMS) and funding via the payments provider. Today this is a monolith that times out when a bureau is slow.

**Goals**
- Instant decision (under 30 s) for 80% of applications; the rest go to manual review.
- Add or switch a credit bureau or KYC vendor without changing the app.
- Brokers integrate through a standard API with quotes and application status.

**Constraints**
- Highly sensitive personal and financial data; strict audit requirements from regulators (keep rules generic).
- Third-party vendors are pay-per-call — avoid unnecessary or duplicate calls.
- Bureaus occasionally take 20+ seconds or are unavailable.

**Your task.** Propose the architecture, the orchestration and the security/data-protection approach.
`,
  answerTemplate: `## API architecture (channels, process, systems)

## Origination orchestration (sync vs async)

## Vendor abstraction and resilience

## Security and data protection

## Audit, monitoring and risks
`,
  keyPoints: [
    'Channel Experience APIs (app, broker) call a Loan Application Process API; vendors are behind System APIs with a canonical model so vendors can be swapped.',
    'Independent checks (KYC, fraud, bureaus) run in parallel with per-call timeouts; slow or failed checks route the application to an asynchronous/manual-review path instead of failing it.',
    'Vendor results are cached/persisted per application so retries do not trigger new pay-per-call requests; calls are idempotent.',
    'Application state is persisted with a clear status model, exposed to app and brokers via status API or webhooks.',
    'Sensitive data protected: TLS/mTLS to vendors, OAuth 2.0 for channels, field-level encryption or tokenisation of identifiers, and masking in logs.',
    'Full audit trail of every vendor request/response reference and decision input, for regulatory and dispute purposes.',
  ],
  solution: `
**Architecture.**
- **Experience**: \`app-loans-eapi\`, \`broker-loans-eapi\` (OAuth 2.0 client credentials per broker, SLA tiers, quote and status endpoints, webhooks for status).
- **Process**: \`loan-application-papi\` (orchestration + state), \`decision-papi\` (wraps decision engine inputs/outputs).
- **System**: \`kyc-sapi\`, \`fraud-sapi\`, \`credit-bureau-sapi\` (canonical credit report regardless of bureau), \`income-verification-sapi\`, \`esign-sapi\`, \`lms-sapi\`, \`payments-sapi\`.

**Orchestration.**
1. Submit → validate → persist application (\`RECEIVED\`).
2. **Parallel** (scatter-gather or async + aggregation): KYC, fraud, bureau A/B. Each with a timeout; results stored as they arrive.
3. If all results arrive in time → decision engine → \`APPROVED / DECLINED / REFER\`. Otherwise → \`PENDING\`; continue asynchronously (queue) and notify when decided.
4. Approved → e-sign → booking in LMS → funding. These are async with callbacks; compensation if booking fails after signing (flag for operations).

**Vendor abstraction and resilience.** Canonical models (credit report, identity result) in DataWeave mappings per vendor. Routing configuration chooses the bureau (by product, cost, availability). Circuit-breaker behaviour: when a vendor errors repeatedly, route to the backup or straight to manual review. Store vendor responses per application and check before calling again → no double billing on retries.

**Security.** OAuth 2.0 / JWT for channels; mTLS and credentials in secure properties or a vault for vendors; tokenise national ID and bank details, encrypt sensitive fields at rest; log only masked identifiers and correlation IDs. Private connectivity (e.g. CloudHub 2.0 private space) to the LMS and decision engine.

**Audit and monitoring.** Immutable audit record: inputs, vendor request IDs, decision version and outcome. Dashboards: decision time p95, % instant decisions, vendor latency/error rates, cost per application.

**Risks.** Vendor outages (fallback/manual review), PII leaks (logging discipline, reviews), duplicate funding (idempotency on funding requests), and decision-engine changes not versioned (store version per decision).
`,
  followUps: [
    { q: 'Why not let the app wait until all checks complete?', a: 'Bureau latency is unbounded; blocking makes UX and timeouts unpredictable. A timeout-bounded instant path plus an async fallback keeps the app responsive and still decides every application.' },
    { q: 'How do you avoid paying twice for a bureau report on retry?', a: 'Persist each vendor response keyed by application ID and check type, and make the System API return the stored result for repeat calls within its validity period.' },
    { q: 'What do you prioritise first?', a: 'The direct app channel with one bureau and KYC end to end, including audit and security; brokers and the second bureau follow once the orchestration and state model are proven.' },
  ],
}
