export default {
  id: 'inc-051',
  category: 'incidents',
  title: 'Correlation IDs Change Between Process and System Layers',
  level: 'BEGINNER',
  tags: ['api-led', 'correlation-id', 'observability', 'logging', 'tracing'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '11:20:05.301 INFO  [exp-mobile-api]   PUT /api/customers/C-7781/address corrId=3e9d-a1c0', relevant: false },
      { text: '11:20:05.318 INFO  [prc-customer-api] Updating address for C-7781 corrId=3e9d-a1c0', relevant: false },
      { text: '11:20:05.319 INFO  [prc-customer-api] Calling sys-crm-api PATCH /customers/C-7781 corrId=3e9d-a1c0 (config=shared-http-request sendCorrelationId=NEVER)', relevant: true, why: 'The shared requester config copied from a partner integration does not send the correlation ID: the chain breaks between process and system.' },
      { text: '11:20:05.341 INFO  [sys-crm-api]      PATCH /api/customers/C-7781 corrId=8b1f2c60-5d0e-4c7e-9a7d-2f3e4b0c9d11', relevant: true, why: 'sys-crm-api received no header, so it has a different ID from the rest of the chain.' },
      { text: '11:20:05.402 ERROR [sys-crm-api]      CRM rejected update: postcode invalid corrId=0c55e1d2-77aa-4b5f-8e21-6d9b3a4f1e02', relevant: true, why: 'A different ID on the next line of the same request: the logger uses uuid() per line. This is also the real reason the save failed.' },
      { text: "11:20:05.410 ERROR [prc-customer-api] HTTP:BAD_REQUEST HTTP PATCH on resource 'https://sys-crm-api.internal/api/customers/C-7781' failed: bad request (400). corrId=3e9d-a1c0", relevant: false },
      { text: '11:20:06.000 INFO  [sys-crm-api]      GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'multi',
        prompt: 'Why can the request not be traced end to end? (two problems)',
        options: [
          'prc-customer-api uses a requester config with sendCorrelationId="NEVER", so no X-Correlation-ID reaches sys-crm-api',
          'sys-crm-api logs uuid() instead of correlationId, so every log line has a new ID',
          'CloudHub 2.0 strips custom headers between apps',
          'The log aggregator drops System API logs',
        ],
        answer: [0, 1],
        explain: 'The ID is neither sent across the process-to-system hop nor logged consistently inside the System API.',
      },
      {
        type: 'single',
        prompt: 'What do you do **first** for the customer?',
        options: [
          'Search sys-crm-api by customer ID and timestamp: the CRM rejected an invalid postcode, so tell the customer and support',
          'Wait for the correlation fix to be deployed before investigating',
          'Replay the address change',
          'Restart sys-crm-api',
        ],
        answer: 0,
        explain: 'Answer the customer with a workaround search, then hotfix the requester config and the logger expression.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Separate internal (forwards ID) and partner (does not) requester configs in the common library',
          'Shared logging module that always writes correlationId, app, layer and business keys',
          'Return the correlation ID in every error response, and an MUnit test that asserts the header is forwarded',
          'Generate a fresh uuid() in every layer so each has its own ID',
        ],
        answer: [0, 1, 2],
        explain: 'Clear config separation, a logging standard and tests. A new ID per layer is exactly what breaks tracing.',
      },
      {
        type: 'single',
        prompt: 'What is the default behaviour of `sendCorrelationId` on the HTTP requester?',
        options: [
          'AUTO: the current correlation ID is sent on outbound calls',
          'NEVER: it must be enabled explicitly',
          'ALWAYS, and it cannot be changed',
          'It is only sent when a Logger references correlationId',
        ],
        answer: 0,
        explain: 'AUTO is the default; NEVER makes sense for external partners but breaks tracing inside your own application network.',
      },
    ],
  },
  description: `
## Symptoms
- A customer complains their address change "didn't save". Support gives the on-call engineer the correlation ID shown in the app's error screen: \`3e9d-a1c0\`.
- Searching the logs for \`3e9d-a1c0\` finds entries in \`exp-mobile-api\` and \`prc-customer-api\` — but **nothing** in \`sys-crm-api\`, even though \`prc-customer-api\` clearly called it.
- It takes two engineers 90 minutes to match the System API log entry by timestamp and customer ID. This has happened on several incidents this month.

## Change / Context
- Three weeks ago \`prc-customer-api\` moved its outbound HTTP calls to a new shared configuration in a common library, copied from a partner-facing integration. That config contains \`sendCorrelationId="NEVER"\` (the partner team didn't want to leak internal IDs to external parties).
- \`sys-crm-api\` logs with a custom logger expression: \`"corrId=" ++ uuid()\` added by a developer "to always have an ID".
- All apps are deployed to CloudHub 2.0 and log to the same log aggregation tool.

## Logs
\`\`\`
11:20:05.301 INFO  [exp-mobile-api]   PUT /api/customers/C-7781/address corrId=3e9d-a1c0
11:20:05.318 INFO  [prc-customer-api] Updating address for C-7781 corrId=3e9d-a1c0
11:20:05.319 INFO  [prc-customer-api] Calling sys-crm-api PATCH /customers/C-7781 corrId=3e9d-a1c0
11:20:05.341 INFO  [sys-crm-api]      PATCH /api/customers/C-7781 corrId=8b1f2c60-5d0e-4c7e-9a7d-2f3e4b0c9d11
11:20:05.402 ERROR [sys-crm-api]      CRM rejected update: postcode invalid corrId=0c55e1d2-77aa-4b5f-8e21-6d9b3a4f1e02
11:20:05.410 ERROR [prc-customer-api] HTTP:BAD_REQUEST HTTP PATCH on resource 'https://sys-crm-api.internal/api/customers/C-7781' failed: bad request (400). corrId=3e9d-a1c0
\`\`\`

## Your tasks
1. Why can't the request be traced end to end? (There are two separate problems.)
2. What do you do right now?
3. What is the root cause?
4. What is the permanent fix?
5. How do you prevent losing traceability again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Explains how Mule 4 propagates the correlation ID: the HTTP listener uses an incoming X-Correlation-ID header as the event correlation ID, and the HTTP requester sends it on outbound calls unless sendCorrelationId is set to NEVER.',
    'Problem 1: the copied requester config with sendCorrelationId="NEVER" stops the ID crossing from process to system layer, so sys-crm-api generates a new one.',
    'Problem 2: sys-crm-api logs uuid() instead of correlationId, so even within one request every log line has a different ID.',
    'Immediate: work around with timestamp + business key search to answer the customer, and hotfix the requester config and logger expression.',
    'Permanent fix: separate internal vs partner-facing requester configs, log correlationId consistently (shared logging module/JSON logger), and return the correlation ID in error responses.',
    'Prevention: logging/tracing standards in the C4E, a test that asserts the header is forwarded, and a dashboard query that checks every request ID appears in all layers.',
  ],
  solution: `
**Diagnosis.** Two separate problems:

1. **The ID is not sent.** In Mule 4, the HTTP listener takes \`X-Correlation-ID\` from the incoming request (or generates one) and the HTTP requester forwards the current \`correlationId\` on outbound calls by default. The shared requester config used by \`prc-customer-api\` has \`sendCorrelationId="NEVER"\`, so \`sys-crm-api\` receives no header and starts a new correlation ID.
2. **The ID is not logged.** \`sys-crm-api\` logs \`uuid()\`, which creates a new random value on **every log line** — even two lines from the same request (see 11:20:05.341 and .402) don't match. Even if the header arrived, the logs would be untraceable.

\`\`\`
exp-mobile-api  --X-Correlation-ID: 3e9d-a1c0-->  prc-customer-api  --(no header)-->  sys-crm-api
     3e9d-a1c0                                        3e9d-a1c0               new ID + uuid() per line
\`\`\`

**Immediate mitigation.** Answer the customer first: search \`sys-crm-api\` by customer ID and timestamp — the CRM rejected an invalid postcode, so the app should show a validation message (which also suggests the 400 should be mapped to a clear error for the app). Then hotfix:
- \`prc-customer-api\`: use a requester config without \`sendCorrelationId="NEVER"\` for internal calls (AUTO is the default).
- \`sys-crm-api\`: log \`correlationId\` instead of \`uuid()\`.

**Root cause.** A config built for an external partner (where hiding internal IDs is reasonable) was reused for internal API-to-API calls, and logging was done ad hoc without a standard. Nobody noticed because traceability is only tested during an incident.

**Permanent fix.**
- Two clearly named requester configs in the common library: \`internal-api-request-config\` (forwards correlation ID) and \`partner-request-config\` (does not).
- A shared logging approach (e.g. a JSON logger module or a logging template) that always writes \`correlationId\`, app name, layer, API version and business keys.
- Return the correlation ID in every error response (and as a response header) so support can quote it.
- Consider distributed tracing (OpenTelemetry-based, where your Mule runtime/Anypoint Monitoring setup supports it) on top of correlation IDs.

**Prevention.** C4E logging standard with a checklist item: "correlation ID forwarded and logged"; an MUnit test that verifies the outbound request carries the header; a periodic log query that picks sample IDs from Experience APIs and checks they appear in System API logs.
`,
  followUps: [
    { q: 'What are the options of sendCorrelationId on the HTTP requester?', a: 'AUTO (the default — send the correlation ID, respecting what the event/runtime decides), ALWAYS and NEVER. NEVER is useful for calls to external parties but breaks tracing inside your own application network.' },
    { q: 'Should the Experience API accept a correlation ID from the mobile app?', a: 'It can, if the app generates one per user action, which helps link app logs to API logs. Validate its format and length so callers cannot inject huge or malicious values into logs.' },
    { q: 'Is a correlation ID enough for asynchronous flows via a queue?', a: 'Only if it is carried in the message, for example as a message property or header, and restored by the consumer. Check that your publish/consume flows do this explicitly rather than assuming it.' },
  ],
}
