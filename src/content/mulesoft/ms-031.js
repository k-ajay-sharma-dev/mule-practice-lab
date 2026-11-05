export default {
  id: 'ms-031',
  category: 'mulesoft',
  title: 'Inside the error Object: errorType, description, cause and errorMessage',
  level: 'INTERMEDIATE',
  tags: ['error-handling', 'error-object', 'http-request', 'dataweave'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'The Card System API returned **422** with a JSON body. Inside the error handler, where is that body?',
      options: [
        '`payload` — the HTTP Request replaced it before failing',
        '`error.errorMessage.payload`',
        '`error.cause.payload`',
        '`error.description`',
      ],
      answer: 1,
      explain: 'When HTTP Request fails a response validator, the response becomes the error\'s message: body in `error.errorMessage.payload`, status in `error.errorMessage.attributes.statusCode`. `error.description` is only the generated text.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each field of the Mule 4 `error` object to what it holds.',
      pairs: [
        ['`errorType`', 'Namespace + identifier, e.g. HTTP:SERVICE_UNAVAILABLE'],
        ['`description`', 'Short human-readable explanation'],
        ['`cause`', 'The underlying Java Throwable'],
        ['`errorMessage`', 'The Mule message the failing component produced'],
      ],
      explain: '`errorType` drives matching in On Error handlers, `description` is for humans, `cause` is the raw exception, and `errorMessage` carries e.g. the downstream HTTP response.',
    },
    {
      type: 'multi',
      prompt: 'A Process API calls a card API, which fails with a 422 and a JSON body holding a `code` and a `message`. The Process API must now send its client a safe error body. Which three items belong in that body?',
      options: [
        'The downstream `code`',
        'The downstream `message`',
        'The correlation ID',
        '`error.cause` and its stack trace',
        'The default `error.description`',
      ],
      answer: [0, 1, 2],
      explain: 'Return a sanitized, consistent body, for example with the code `CARD_EXPIRED`. Stack traces and the default description, which contains the internal resource URL, leak internals. Log them instead.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A DataWeave transformation fails. What should you expect in `error.errorMessage`?',
      options: [
        'Always the input payload of the transformation',
        'Usually null — so read it with `default`',
        'The generated script source',
        'An HTTP 500 response',
      ],
      answer: 1,
      explain: 'Only components that produce a message as part of the failure (like HTTP Request with a response) populate it. Always guard with `default`.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'One route of a Scatter-Gather fails. Which error is raised, and where are the per-route details?',
      options: [
        'The failing route\'s own error type; other routes are discarded',
        '`MULE:COMPOSITE_ROUTING`; the error message payload exposes the successful results and the failures per route',
        '`MULE:UNKNOWN`; details are only in the log',
        '`HTTP:CONNECTIVITY`; details are in `error.cause`',
      ],
      answer: 1,
      explain: 'Scatter-Gather wraps route failures in **MULE:COMPOSITE_ROUTING**, and its error message lets you see which route failed and decide if a partial response is acceptable.',
    },
    {
      type: 'single',
      prompt: 'The downstream 422 body is a stream and you use it in both a Logger and the response Transform. What is the safe approach?',
      options: [
        'Nothing special — error bodies are always strings',
        'Read it once (e.g. into a variable) before using it repeatedly',
        'Use `error.description` instead of the body',
        'Call the card API again to get a fresh copy',
      ],
      answer: 1,
      explain: 'The body may be a stream; consuming it once and storing the parsed value avoids an empty or failing second read.',
    },
  ],
  description: `
A **Payments Process API** calls a Card System API with HTTP Request. When the card API returns **422** with a JSON body such as:

\`\`\`json
{ "code": "CARD_EXPIRED", "message": "Card expired on 2025-08" }
\`\`\`

the process API currently responds with:

\`\`\`json
{ "error": "HTTP POST on resource 'https://cards.internal/charges' failed: unprocessable entity (422)." }
\`\`\`

The product team wants the client to receive the **downstream code and message**, plus a correlation ID, and wants the logs to contain the full technical detail.

**Questions**
1. What fields does the \`error\` object expose in Mule 4, and what is each one for?
2. Where is the 422 response body and status code after the HTTP Request fails?
3. Write the DataWeave for the client-facing error body.
4. What should you log, and what should you never return to the client?
5. How do you get details of each failing route after a Scatter-Gather error?
`,
  answerTemplate: `## Fields of the error object

## Where the downstream response lives

## Client error body

## Logging vs returning

## Scatter-Gather failures
`,
  keyPoints: [
    'error.errorType has namespace and identifier (e.g. HTTP:SERVICE_UNAVAILABLE) and a parent type hierarchy. The HTTP connector has no HTTP:UNPROCESSABLE_ENTITY type, so select a 422 by error.errorMessage.attributes.statusCode (e.g. in the handler\'s when).',
    'error.description is a human-readable message; error.detailedDescription adds more detail; error.cause is the underlying Java exception.',
    'error.errorMessage is the message produced by the failing component — for HTTP Request it holds the response body (payload) and attributes (statusCode, headers).',
    'Return a sanitized, consistent error body to clients; log the technical detail (type, description, cause) with the correlation ID.',
    'For Scatter-Gather (MULE:COMPOSITE_ROUTING) the per-route results and failures are available through the error message payload.',
  ],
  solution: `
**Fields of \`error\`** (available inside error handlers)
| Field | Content |
|---|---|
| \`errorType\` | \`namespace\` + \`identifier\`, e.g. \`HTTP:SERVICE_UNAVAILABLE\`; has a \`parentErrorType\` chain (422 has no dedicated HTTP type — match it on the status code) |
| \`description\` | short human-readable explanation |
| \`detailedDescription\` | longer explanation, often including the component |
| \`cause\` | the underlying Java \`Throwable\` |
| \`errorMessage\` | the Mule message the failing component produced (may be null) |
| \`childErrors\` | nested errors for composite situations |

**Downstream response:** when HTTP Request fails a response validator, the response becomes the error's message:
- \`error.errorMessage.payload\` → \`{ "code": "CARD_EXPIRED", ... }\`
- \`error.errorMessage.attributes.statusCode\` → \`422\`
- \`error.errorMessage.attributes.headers\` → response headers

Note the body may be a stream — read it once (or into a variable) before using it repeatedly.

**Client body**
\`\`\`dataweave
%dw 2.0
output application/json
var downstream = error.errorMessage.payload default {}
---
{
  code: downstream.code default "PAYMENT_FAILED",
  message: downstream.message default "The payment could not be processed",
  correlationId: correlationId
}
\`\`\`
Set \`vars.httpStatus = error.errorMessage.attributes.statusCode default 500\` (or map it to your own contract — e.g. 422 stays 422, 5xx from the backend becomes 502).

**Logging vs returning**
- Log at ERROR: \`error.errorType\`, \`error.description\`, status code, correlation ID, and optionally a truncated downstream body.
- Never return \`error.cause\`, stack traces, internal URLs/hosts (the default description contains the resource URL) or sensitive data.

**Scatter-Gather:** a failure raises \`MULE:COMPOSITE_ROUTING\`. The error message payload exposes the successful \`results\` and the \`failures\` per route (each failure is an error with its own type and description). So you can log which route failed and decide whether a partial response is acceptable.
`,
  followUps: [
    {
      q: 'How do you check an error type including its parents in DataWeave?',
      a: 'Compare error.errorType.namespace and identifier, or walk parentErrorType. In configuration it is simpler to match with the type attribute of On Error handlers, which already respects the hierarchy.',
    },
    {
      q: 'What is error.errorMessage when a DataWeave transformation fails?',
      a: 'Usually null — only components that produce a message as part of the failure (like HTTP Request with a response) populate it. Always use default when reading it.',
    },
    {
      q: 'Where does the "failed: unprocessable entity (422)" text come from?',
      a: 'It is the description generated by the HTTP connector\'s response validator. It is useful for logs but leaks internal URLs, so it should not be passed through to clients as-is.',
    },
  ],
}
