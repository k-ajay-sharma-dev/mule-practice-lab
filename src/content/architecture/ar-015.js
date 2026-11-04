export default {
  id: 'ar-015',
  category: 'architecture',
  title: 'Reusable Error-Handling and Logging Framework',
  level: 'INTERMEDIATE',
  tags: ['error-handling', 'reuse', 'shared-library', 'logging'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each Mule error to the HTTP status the framework returns.',
      pairs: [
        ['APIKIT:BAD_REQUEST or VALIDATION:*', '400'],
        ['APP:NOT_FOUND raised by the app', '404'],
        ['APP:CONFLICT', '409'],
        ['HTTP:CONNECTIVITY to a backend', '503'],
        ['HTTP:TIMEOUT from a backend', '504'],
      ],
      explain: 'Client errors (4xx) tell consumers not to retry; backend unavailability and timeouts (5xx) are retryable. That distinction is exactly what consumers were missing.',
    },
    {
      type: 'single',
      prompt: 'Some apps return `200 OK` with `{ "status": "failed" }`. Why is that a problem?',
      options: [
        'It makes the payload too large',
        'Clients, gateways, monitoring and retry logic all read the status code, so failures look like successes',
        'JSON cannot contain the word "failed"',
        'It is fine as long as it is documented',
      ],
      answer: 1,
      explain: 'The HTTP status is the contract tooling understands. A proper status plus a standard error body lets consumers program against both.',
    },
    {
      type: 'single',
      prompt: 'How should the framework be distributed to 60 apps?',
      options: [
        'Copy the 300 lines of error XML into each project',
        'A shared Mule library (mule-plugin dependency) with global error handlers, logging and DataWeave modules, imported and set as the default error handler',
        'A wiki page with the recommended XML',
        'A separate Mule app that every API calls on error',
      ],
      answer: 1,
      explain: 'A dependency is reused, not copied, so a fix ships by bumping a version instead of editing 60 apps.',
    },
    {
      type: 'single',
      prompt: 'An Anypoint MQ consumer receives a message with invalid data. What should the framework do?',
      options: [
        'Return HTTP 400 to the publisher',
        'Nack and redeliver it forever',
        'Classify it as non-retryable and move it to the DLQ immediately with error code and correlation ID, and alert support',
        'Swallow it with On Error Continue and ack',
      ],
      answer: 2,
      explain: 'Async consumers have no HTTP caller. Bad data will never succeed, so retrying only wastes capacity; connectivity or timeout errors are the ones to retry with backoff.',
    },
    {
      type: 'single',
      prompt: 'A System API returns 500 to the Process API. What does the Process API return to its caller?',
      options: [
        '500 with the System API\'s stack trace',
        '502, with the standard error body, because a downstream dependency failed',
        '200 with an empty body',
        '400 because the request must have been wrong',
      ],
      answer: 1,
      explain: 'Errors are propagated with meaning: a downstream failure becomes a gateway-type error at the next layer, never a leaked stack trace.',
    },
    {
      type: 'multi',
      prompt: 'Which practices apply to versioning and rolling out the framework?',
      options: [
        'Semantic versioning of the library',
        'A parent POM pins the recommended version',
        'A pipeline check or dependency bot flags apps on old versions',
        'Breaking changes to the error shape ship as a patch version',
      ],
      answer: [0, 1, 2],
      explain: 'A new error response shape changes API contracts, so it needs a major version and a coordinated rollout — never a patch.',
    },
  ],
  description: `
An airline has 60 Mule 4 apps built by 4 vendors. Every app handles errors differently:

- Some return \`200 OK\` with \`{ "status": "failed" }\` in the body; others return a raw Java stack trace with 500.
- Consumers cannot tell a **validation error** from a **backend timeout**, so they retry everything — including bad requests.
- The 24×7 support team cannot see which errors need action.
- Each vendor copies the same 300 lines of error XML into every project; fixing a bug means changing 60 apps.

You are asked to design a **common error-handling and logging framework** that all new and existing apps adopt.

**Questions:**
- What is the standard error response contract, and how do Mule error types map to HTTP status codes?
- How do you package and distribute the framework so it is reused, not copied?
- How should errors behave in sync APIs vs async (queue) consumers?
- How do you version and roll out changes to the framework across 60 apps?
`,
  answerTemplate: `## Error response contract

## Mule error to HTTP mapping

## Packaging and distribution

## Sync vs async behaviour

## Versioning and rollout
`,
  keyPoints: [
    'One error response schema for all APIs (e.g. RFC 7807 problem+json style: type/code, message, correlationId, timestamp, details), published as a shared fragment in Exchange.',
    'Explicit mapping table: validation errors → 400, auth → 401/403, not found → 404, conflicts → 409, backend connectivity/timeout → 502/503/504, unexpected → 500 — with no stack traces in responses.',
    'The framework is packaged as a shared Mule library (plugin dependency) containing global error handlers and logging sub-flows, imported via a dependency, not copied.',
    'Async consumers never return HTTP codes: they classify errors as retryable vs non-retryable, retry with backoff, and send poison messages to a DLQ with error context.',
    'Framework changes follow semantic versioning; apps upgrade by bumping the dependency version through CI/CD, and a parent POM can centralise the version.',
  ],
  solution: `
**Error response contract.** Publish an **error RAML/OAS fragment** in Exchange used by every API spec:
\`\`\`json
{ "code": "BACKEND_TIMEOUT", "message": "Booking system did not respond in time",
  "correlationId": "c0a8...", "timestamp": "2026-05-01T10:15:00Z", "details": [] }
\`\`\`
Use a proper HTTP status — never \`200\` for a failure. Error \`code\` values are a controlled list that consumers can program against.

**Mapping (example).**
| Mule error type | HTTP | Retry? |
|---|---|---|
| \`APIKIT:BAD_REQUEST\`, \`VALIDATION:*\`, custom \`APP:INVALID_INPUT\` | 400 | No |
| \`APIKIT:NOT_FOUND\`, \`APP:NOT_FOUND\` | 404 | No |
| \`APIKIT:METHOD_NOT_ALLOWED\` | 405 | No |
| \`APP:CONFLICT\` | 409 | No |
| \`HTTP:CONNECTIVITY\`, \`HTTP:SERVICE_UNAVAILABLE\` | 503 | Yes |
| \`HTTP:TIMEOUT\` | 504 | Yes (idempotent ops) |
| \`HTTP:BAD_REQUEST\` from a backend | 502 or mapped business error | Depends |
| \`ANY\` (unexpected) | 500, generic message | Maybe |

Apps raise **custom error types** (\`raise-error type="APP:NOT_FOUND"\`) for business cases, so the mapping stays declarative. Downstream errors from System APIs are **propagated with meaning** (a 404 from SAPI may stay 404; a 500 from SAPI becomes 502 at the Process API).

**Packaging.** A shared **Mule library** (packaged with classifier \`mule-plugin\`) containing: global error handler(s), a logging sub-flow / JSON logging configuration, DataWeave modules for building the error body and masking. Apps add the dependency and \`<import>\` the XML, then set it as the default error handler (\`<configuration defaultErrorHandler-ref="..."/>\`). App-specific errors are handled locally with \`on-error-propagate\`/\`on-error-continue\` *before* falling back to the global handler. Provide a **project template** (archetype) so new apps start with it.

**Sync vs async.**
- *Sync APIs:* \`on-error-propagate\` → mapped status + error body; log ERROR once at the outermost layer (avoid logging the same error in every layer).
- *Async consumers (Anypoint MQ/JMS):* classify: **retryable** (connectivity, timeout) → nack/redeliver with backoff (max redeliveries); **non-retryable** (bad data) → move to **DLQ** immediately with error code and correlation ID as message properties, alert support. Never swallow errors with \`on-error-continue\` without recording them.

**Versioning and rollout.** Semver the library; a **parent POM** pins the recommended version; Renovate/Dependabot-style PRs or a pipeline check flag apps on old versions. Breaking changes (new response shape) require a major version and coordinated rollout with API contract changes.

**Trade-off:** a shared library creates coupling — a bug affects everyone, so it needs its own MUnit test suite and an owner (typically the C4E/platform team).
`,
  followUps: [
    { q: 'Why not handle errors only at the Experience API and let lower layers throw anything?', a: 'Each API is reusable by other consumers, so each must have a clean contract on its own. Lower layers return standard errors; upper layers translate them into their consumer\'s context.' },
    { q: 'How do you avoid logging the same error five times as it bubbles up through layers?', a: 'Log ERROR only where the error is handled/terminated (the outermost flow of each app), and log WARN/DEBUG context in inner flows. The correlation ID links the entries across apps.' },
    { q: 'A vendor says the shared library slows their delivery. How do you respond?', a: 'Keep the library small and stable, provide a template that works out of the box, and allow local overrides for app-specific errors. Measure the support time saved by consistent errors to show the value.' },
  ],
}
