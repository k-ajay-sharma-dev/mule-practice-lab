import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-034',
  category: 'case-studies',
  title: 'Insurance Broker Quoting Across 30 Carriers',
  level: 'INTERMEDIATE',
  tags: ['insurance', 'aggregation', 'scatter-gather', 'canonical-model', 'timeouts'],
  estMinutes: 40,
  diagram: {
    task: 'draw the quoting platform: the broker portal, one quote Process API that stores each request and fans out to carrier adapters (REST, SOAP, SFTP), the inbound response listener and the manual-carrier work queue.',
    checks: [
      { label: 'The broker portal reaches its Experience API through the gateway', rule: { type: 'path', from: 'web-app', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The Experience API calls one quote Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'The Process API fans out to at least three carrier adapters (System APIs)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'Quote requests are stored so late responses can be attached', rule: { type: 'edge', from: 'process-api', to: 'database' } },
      { label: 'Carriers are reached only through their adapters', rule: { type: 'only-via', target: ['external-api', 'legacy', 'file-store'], from: 'system-api' } },
      { label: 'A listener/scheduled job picks up async carrier responses and updates the quote request', rule: { type: 'edge', from: 'batch-job', to: 'process-api' } },
      { label: 'Experience APIs never call carrier adapters directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'Broker staff handle manual carriers through the same platform', rule: { type: 'edge', from: 'internal-app', to: ['api-gateway', 'experience-api'] } },
    ],
    reference: diagram(
      {
        portal: ['web-app', 'Broker portal'],
        staff: ['internal-app', 'Broker assistant work queue'],
        gw: ['api-gateway', 'API gateway (client ID + OAuth)'],
        eapi: ['experience-api', 'exp-broker-portal-api'],
        prc: ['process-api', 'prc-quote-api'],
        resp: ['batch-job', 'Async carrier response listener'],
        sa: ['system-api', 'sys-carrier-a-api (REST)'],
        sb: ['system-api', 'sys-carrier-b-api (SOAP)'],
        sc: ['system-api', 'sys-carrier-c-api (XML/SFTP)'],
        req: ['database', 'Quote requests (status, results)'],
        reg: ['database', 'Carrier registry (eligibility, timeouts)'],
        ca: ['external-api', 'Carrier A REST'],
        cb: ['legacy', 'Carrier B SOAP'],
        cc: ['file-store', 'Carrier C SFTP'],
      },
      [
        'portal -> gw', 'staff -> gw', 'gw -> eapi', 'eapi -> prc', 'prc -> req', 'prc -> reg', 'prc -> sa', 'prc -> sb', 'prc -> sc',
        'sa -> ca', 'sb -> cb', 'sc -> cc', 'resp -> sc', 'resp -> prc',
      ],
    ),
  },
  description: `
**Context.** A commercial insurance broker wants a portal where its brokers (and later small-business customers) enter a risk once and get quotes from up to 30 insurance carriers. Carriers integrate very differently:
- 12 have modern REST APIs
- 9 have SOAP services
- 5 accept structured XML by email/SFTP and respond hours later
- 4 have only a web portal (manual)

**Goals**
- One quote request → comparable quotes from as many carriers as possible.
- Instant quotes shown within 15 seconds; slower carriers' quotes added as they arrive.
- Bind (accept) a quote and receive policy documents.

**Constraints**
- Each carrier has its own question set, codes and validation rules.
- Carrier APIs vary from 2 to 40 seconds; some are unreliable.
- New carriers are added every quarter; some leave.
- Carrier credentials are per broker firm and must be stored securely.

**Your task.** Propose the architecture for quote fan-out, carrier onboarding, and the asynchronous/manual carriers.
`,
  answerTemplate: `## Canonical risk and quote model

## API layers

## Quote fan-out, timeouts and partial results

## Async and manual carriers

## Bind and documents

## Onboarding new carriers

## Risks
`,
  keyPoints: [
    'A canonical risk/quote model with per-carrier mappings means the portal never knows carrier-specific formats.',
    'A Process API fans out in parallel to eligible carriers with per-carrier timeouts, returning partial results instead of waiting for the slowest.',
    'Quote requests are persisted with an ID; late and asynchronous responses are attached to it and pushed or polled by the portal.',
    'Each carrier is a System API (or a pluggable adapter) behind a common contract, so onboarding a carrier means building one adapter and mapping.',
    'Carrier credentials live in a secrets store/secure properties, never in the portal or code.',
    'Manual carriers are handled by a work queue for broker staff, with the result entered into the same quote record.',
  ],
  solution: `
**Canonical model.** \`Risk\` (business, location, turnover, cover requested) and \`Quote\` (carrier, premium, excess, terms, expiry, status). Carrier-specific questions are a superset with per-carrier "required fields" rules; the portal asks only for missing ones.

**Layers.** \`broker-portal-eapi\` → \`quote-papi\` → carrier adapters \`carrier-<name>-sapi\` all implementing the same internal contract (\`POST /quotes\`, \`POST /binds\`, \`GET /documents\`). A \`carrier-registry\` (config) holds eligibility rules, adapter URL, timeout and status (active/suspended).

**Fan-out.** \`quote-papi\` stores the request (status \`IN_PROGRESS\`), selects eligible carriers, and calls them in parallel (scatter-gather or parallel-for-each with per-route timeouts, or one async message per carrier). At ~15 s it returns what it has plus "pending" markers. Remaining responses update the stored request; the portal polls \`GET /quote-requests/{id}\` or receives a push notification. A circuit breaker per carrier (based on recent failure rate) skips carriers that are down instead of waiting for timeouts.

**Async carriers.** XML request generated and sent by SFTP/email; an inbound listener matches responses by reference and updates the record. **Manual carriers**: a task is created for a broker assistant with a pre-filled summary; they key the quote into the portal.

**Bind.** Re-validate the quote is still valid and call the carrier bind endpoint with an idempotency reference. Store the policy number and retrieve documents (stored in a document management system with links in the portal).

**Onboarding.** Adapter template in Exchange, mapping from the canonical model, contract tests against the carrier sandbox, then register in carrier registry. Target: 3–4 weeks per API carrier.

**Security.** Carrier credentials per broker firm in a secrets manager or encrypted secure properties per environment; client ID + OAuth on the Experience API; PII minimised in logs.

**Risks.** Mapping errors leading to mispriced quotes (contract tests, business sign-off), slow carriers degrading UX (timeouts and partial results), carrier API changes (versioned adapters, monitoring of error rates per carrier).
`,
  followUps: [
    { q: 'Scatter-gather or messaging for the fan-out?', a: 'Scatter-gather with timeouts is simple for the instant carriers, but it fails the whole route set by default if a route errors, so you must handle errors per route. For many carriers and late responses, one message per carrier with a stored request is more robust.' },
    { q: 'How do you compare quotes that are not like-for-like?', a: 'Normalise the key comparison fields in the canonical model, flag differences (excess, exclusions) explicitly, and let the broker see the carrier detail. Do not hide material differences.' },
    { q: 'A carrier changes its API with two weeks notice. What happens?', a: 'Only that carrier adapter changes; build a new version behind the same internal contract, run contract tests, and switch the registry entry. The portal and other carriers are unaffected.' },
  ],
}
