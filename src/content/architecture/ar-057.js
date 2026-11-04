export default {
  id: 'ar-057',
  category: 'architecture',
  title: 'Error Handling and Status Propagation Across Layers',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'error-handling', 'http-status', 'resilience'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each incident to what the mobile app should receive.',
      pairs: [
        ['Order does not exist in SAP', '404 ORDER_NOT_FOUND with a friendly message'],
        ['SAP down for maintenance', '503 quickly (after a short timeout), retry later'],
        ['Carrier API returned 429', '200 with the order, shipment null and a TRACKING_UNAVAILABLE warning'],
        ['Invalid date filter sent by the app', '400 from spec validation before any downstream call'],
      ],
      explain: 'Each layer translates errors into its own contract. Optional dependencies degrade gracefully, and bad input is rejected at the edge rather than failing inside SAP.',
    },
    {
      type: 'single',
      prompt: 'The Process API gets a 401 from the System API because its own client credentials expired. What should the mobile app receive?',
      options: [
        '401 — pass it through',
        '403 — the user is not allowed',
        'A 5xx (500/502): it is an internal fault; the consumer\'s credentials were fine',
        '200 with empty data',
      ],
      answer: 2,
      explain: 'Blindly passing through a downstream 401 would tell the app to re-authenticate the user, which will not help.',
    },
    {
      type: 'multi',
      prompt: 'What may the external error body contain?',
      options: [
        'A stable error `code`',
        'A safe, human-readable `message`',
        'The `correlationId`',
        'The Java stack trace',
        'The SAP message text and backend hostname',
      ],
      answer: [0, 1, 2],
      explain: 'Internal details are logged with the correlation id, not returned to external consumers.',
    },
    {
      type: 'single',
      prompt: 'Which Mule 4 construct lets the order response succeed when the optional carrier call fails?',
      options: [
        'An `on-error-propagate` in the global error handler',
        'A Try scope around the carrier call with `on-error-continue` that sets shipment to null and adds a warning',
        'An `until-successful` around the whole flow',
        'Disabling status-code validation on all requesters',
      ],
      answer: 1,
      explain: '`on-error-continue` completes the scope successfully with the fallback, so the rest of the flow carries on; `on-error-propagate` fails the request with the mapped status.',
    },
    {
      type: 'single',
      prompt: 'Inside the Process API, a loyalty lookup returns 404 for a customer. What should the Process API do?',
      options: [
        'Return 404 Order not found',
        'Interpret it in business terms — likely "no loyalty record", so continue with loyalty null',
        'Return 500',
        'Retry until it succeeds',
      ],
      answer: 1,
      explain: 'A 404 on a secondary resource does not mean the requested order is missing; do not blindly pass through status codes.',
    },
    {
      type: 'single',
      prompt: 'How should the correlation id work across the layers?',
      options: [
        'Each layer generates its own id',
        'Generated or accepted at the Experience API, propagated on every outbound call (e.g. x-correlation-id) and logged in every layer',
        'Only the System API logs it',
        'It is only needed for errors returned to the user',
      ],
      answer: 1,
      explain: 'One id across all layers lets support find the full trace from a single value the user reports.',
    },
  ],
  description: `
Chain: \`exp-mobile-api\` → \`prc-order-api\` → \`sys-sap-order-api\` and \`sys-carrier-tracking-api\`.

Production incidents:

| Incident | What the mobile app received |
|---|---|
| Customer asked for an order that does not exist in SAP | **500** "Internal Server Error" with a Java stack trace |
| SAP was down for maintenance | **500** after 60 s |
| Carrier API returned 429 (rate limited) | Whole response failed with **500**, although order data was available |
| Invalid date filter sent by the app | **500** from SAP's BAPI error |

**Questions:**
1. For each incident, what *should* each layer return, and why?
2. Design the **error contract** (status codes and body) shared across layers.
3. Should the System API's error message reach the mobile user verbatim? What about correlation ids?
4. How do Mule 4 constructs (error types, \`on-error-propagate\` / \`on-error-continue\`, HTTP requester status validation) help implement this?
`,
  answerTemplate: `## Per-incident behaviour

## Shared error contract

## What reaches the consumer

## Mule implementation
`,
  keyPoints: [
    'Each layer translates errors into its own contract: a SoR "not found" becomes 404 at System, the Process API maps it to a business meaning (404 order not found), and the Experience API returns a consumer-friendly 404.',
    'Backend unavailability is 503 (or 504 on timeout) with fast failure via timeouts — not 500 after 60 s; Retry-After where meaningful.',
    'Client input errors are caught as early as possible (spec validation at the Experience API) and returned as 400, never forwarded to SAP to fail as 500.',
    'Optional dependencies (carrier tracking) degrade gracefully: return the order with a partial/warning flag instead of failing the whole response.',
    'A standard error body (code, message, correlationId, details) is shared via an Exchange fragment; internal details and stack traces are logged, not returned externally; the correlation id flows through all layers.',
  ],
  solution: `
**Per-incident behaviour.**

| Incident | System | Process | Experience (mobile) |
|---|---|---|---|
| Order not in SAP | Map SAP RETURN "not found" → **404** \`ORDER_NOT_FOUND\` | Propagate as **404** (business: order does not exist) | **404** "We couldn't find that order" |
| SAP down | Connection error/timeout → **503** \`BACKEND_UNAVAILABLE\` (fail fast, e.g. 5–10 s timeout; circuit breaker optional) | **503** (or serve cached data if allowed) | **503** with friendly message, retry later |
| Carrier 429 | **429** or **503** from carrier System API | Treat tracking as **optional**: return order with \`shipment: null\`, \`warnings: ["TRACKING_UNAVAILABLE"]\` → **200** | **200**, app shows "tracking temporarily unavailable" |
| Invalid date filter | Should never get here | Validate too (defence in depth) → **400** | APIkit validates query param against spec → **400** \`INVALID_PARAMETER\` before any downstream call |

Key ideas:
- **Do not blindly pass through** downstream status codes. A 404 from a lookup of a *secondary* resource (e.g. customer's loyalty record) inside a Process API might mean "no loyalty" (200 with null), not "order not found".
- **401/403 from a downstream API** caused by the *calling API's* own credentials is an internal fault — surface as **500/502** to the consumer, not 401 (the consumer's credentials were fine).
- Downstream **5xx** → upstream **502** (bad gateway) or **503** depending on your standard; be consistent.

**Shared error contract** (Exchange fragment used by all specs):
\`\`\`json
{
  "code": "ORDER_NOT_FOUND",
  "message": "Order 12345 was not found",
  "correlationId": "7f3c9a2e-…",
  "timestamp": "2026-11-03T10:15:00Z",
  "details": [ { "field": "fromDate", "issue": "must be ISO-8601 date" } ]
}
\`\`\`
Statuses: 400 validation, 401/403 auth, 404 not found, 409 conflict/business rule, 429 throttled, 500 unexpected, 502 bad downstream response, 503 dependency unavailable, 504 downstream timeout.

**What reaches the consumer.**
- Externally: stable \`code\`, safe \`message\`, \`correlationId\`. **No** stack traces, SAP message texts, hostnames or SQL.
- Internally (System → Process), more detail is acceptable in \`details\` for troubleshooting.
- The **correlation id** (e.g. \`x-correlation-id\`) is generated or accepted at the Experience API, propagated on every outbound call, and logged in every layer so one id finds the full trace.

**Mule implementation.**
- HTTP Request operations raise \`HTTP:NOT_FOUND\`, \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:TIMEOUT\`, \`HTTP:CONNECTIVITY\` etc. based on response status validation; catch them by type.
- **Global error handler** per app (from the shared template) maps error types → status + body; APIkit's generated handlers cover \`APIKIT:BAD_REQUEST\`, \`APIKIT:NOT_FOUND\`, \`APIKIT:METHOD_NOT_ALLOWED\`, etc.
- \`on-error-propagate\` to fail the request with the mapped status; \`on-error-continue\` inside a \`try\` around the optional carrier call to degrade gracefully.
- Custom error types (\`raise-error type="ORDER:NOT_FOUND"\`) and error mappings on operations give business meaning instead of transport meaning.
- Timeouts per hop are decreasing from top to bottom so the top layer can still answer cleanly.
`,
  followUps: [
    { q: 'Should the Process API retry a 503 from the System API?', a: 'A small bounded retry with backoff for idempotent reads can help with transient blips, but avoid retries at every layer, which multiply load (retry storms). Usually retry at one layer only, closest to the failure.' },
    { q: 'What status do you return when the Process API partially succeeded on a write?', a: 'Avoid partial writes being visible: use compensation or async completion. If the outcome is pending, return 202 Accepted with a status resource; otherwise return the failure and ensure compensation runs.' },
    { q: 'Where do you log the error — every layer?', a: 'Each layer logs its own view with the same correlation id, but at the right level: the layer that originated or handled the error logs details at ERROR; pass-through layers log concisely to avoid duplicate noise.' },
  ],
}
