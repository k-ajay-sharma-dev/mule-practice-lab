export default {
  id: 'ms-001',
  category: 'mulesoft',
  title: 'On Error Continue vs On Error Propagate',
  level: 'BEGINNER',
  tags: ['error-handling', 'http'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The HTTP flow calls Inventory, which is down. The flow has **On Error Continue** that sets a JSON error payload but does not touch the status. What does the caller receive?',
      options: [
        'HTTP 500 with the default error message',
        'HTTP 200 with the JSON error payload',
        'HTTP 503, because the Inventory API returned 503',
        'No response — the connection is closed',
      ],
      answer: 1,
      explain: 'On Error Continue completes the flow as a **success**, so the Listener sends its normal response — 200 by default — with whatever payload the handler produced. That is why the HTTP flow should use On Error Propagate (or explicitly set the status).',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Which handler fits the HTTP flow so the caller gets a 503 and the error is reported as a failure?',
      options: [
        'On Error Propagate, with the Listener error response status set from a variable',
        'On Error Continue, because it lets you write the audit record first',
        'A Try scope with no handler',
        'Until Successful around the Inventory call',
      ],
      answer: 0,
      explain: 'On Error Propagate rethrows the error to the HTTP Listener, which then sends its **error response**. Setting `vars.httpStatus = 503` and using `#[vars.httpStatus default 500]` as the error-response status gives the 503. Auditing can be done inside either handler.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'In the batch job, one record fails when calling the shared logic. You want the other records to keep processing. What do you wrap the per-record call with?',
      options: [
        'A Try scope with On Error Propagate',
        'A Try scope with On Error Continue',
        'An Until Successful scope with maxRetries set to 0',
        'A Choice router that checks `error` before the call',
      ],
      answer: 1,
      explain: 'A Try scope with **On Error Continue** handles the failure and lets the record complete, so one bad record does not stop the job. Batch accept policies and `maxFailedRecords` are the alternative mentioned in the solution.',
    },
    {
      type: 'match',
      prompt: 'Match each handler to what happens after it finishes.',
      pairs: [
        ['On Error Propagate', 'The error is rethrown to the owner (caller flow or source)'],
        ['On Error Continue', 'The owner completes successfully with the handler result'],
        ['No matching handler in the flow', 'The default error handler runs and the error propagates'],
      ],
      explain: 'Propagate rethrows after its processors run; Continue swallows the error and the flow (or Try) ends as success. With no matching handler, Mule uses the default error handler, which logs and propagates.',
    },
    {
      type: 'single',
      prompt: 'An HTTP flow uses On Error Propagate. When a downstream API is down, the caller must get HTTP 503 with a JSON body, and an audit record must be written. Where do you do this?',
      options: [
        'In On Error Continue only, because On Error Propagate runs no processors',
        'Inside the handler, and the Listener error response sends the 503',
        'After the handler, in the next processor of the flow, which still runs',
        'Nowhere, because the Listener always sends 500 for a propagated error',
      ],
      answer: 1,
      explain: 'Both handlers run their processors before completing, so auditing works in either. The handler sets `vars.httpStatus` to 503 and builds the body with DataWeave. The Listener error response uses status `#[vars.httpStatus default 500]` and body `#[payload]`, so 500 is only the default.',
    },
  ],
  description: `
An HTTP-triggered flow calls a downstream Inventory API. When Inventory is down, the requirement is:

1. The caller must receive **HTTP 503** with a JSON error body.
2. An **audit record** must be written for every failure.
3. A batch job that calls the same sub-flow must **keep processing** the remaining records when one fails.

**Questions**
- Which error handler do you use in the HTTP flow, and why?
- Which do you use around the per-record call in the batch, and why?
- How do you set the 503 status and body?
`,
  answerTemplate: `## HTTP flow

## Batch per-record call

## Setting status and body
`,
  keyPoints: [
    'On Error Propagate rethrows; the HTTP Listener turns it into an error response.',
    'On Error Continue swallows the error and the flow completes as success (HTTP 200 unless set).',
    'Batch per-record: On Error Continue (or batch accept policy) so other records keep going.',
    'Status set via the Listener error response (e.g. vars.httpStatus) and body built with DataWeave.',
    'Audit logging can be done inside either handler before it completes.',
  ],
  solution: `
**HTTP flow → On Error Propagate.** The error is rethrown to the HTTP Listener, which sends the *error response*. Configure the listener's error response with \`statusCode: vars.httpStatus default 500\` and set \`vars.httpStatus = 503\` plus a JSON body in the handler. Write the audit record before the handler ends.

Using **On Error Continue** here would complete the flow as *success*, so the listener would send its normal response (200 by default) unless you override the status yourself. That is hard to get right.

**Batch per-record call → On Error Continue** (inside a Try scope around the call). The failure is handled and the record continues, so one bad record does not stop the job. Alternatively, rely on the batch job's \`maxFailedRecords\` and accept policies.

**Status and body:** Listener → *Responses* → Error response: status code \`#[vars.httpStatus default 500]\`, body \`#[payload]\`, where the handler sets payload to \`{ error: "Inventory unavailable", correlationId: correlationId }\`.
`,
}
