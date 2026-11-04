export default {
  id: 'ms-011',
  category: 'mulesoft',
  title: 'Error Types, Raise Error, Error Mapping and a Global Handler',
  level: 'INTERMEDIATE',
  tags: ['error-handling', 'error-types', 'raise-error', 'api-design'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A CRM 404 surfaces as 500 because the flow handler lists `ANY` first. Why?',
      options: [
        'Handlers are evaluated top to bottom and the first match wins, so `ANY` catches everything',
        'Mule always picks the most generic handler',
        '`HTTP:NOT_FOUND` is not a subtype of `ANY`',
        'The HTTP Listener converts every error to 500',
      ],
      answer: 0,
      explain: 'The first `on-error` whose `type`/`when` matches runs. Put specific types first and `ANY` last.',
    },
    {
      type: 'single',
      prompt: 'Which `raise-error` is allowed for the validation case?',
      options: [
        '`<raise-error type="APP:VALIDATION_ERROR"/>`',
        '`<raise-error type="MULE:VALIDATION_ERROR"/>`',
        '`<raise-error type="HTTP:BAD_REQUEST"/>`',
        '`<raise-error type="ANY"/>`',
      ],
      answer: 0,
      explain: 'Custom errors must use **your own** namespace. `MULE:VALIDATION_ERROR` is not a core runtime type (Raise Error can raise core types such as `MULE:CONNECTIVITY`, but you cannot invent new ones there), and you cannot raise in a connector namespace such as `HTTP`.',
    },
    {
      type: 'single',
      prompt: 'How do you turn `HTTP:NOT_FOUND` into `CRM:CUSTOMER_NOT_FOUND` **only** for the "get customer" call?',
      options: [
        'An error mapping on that HTTP Request operation',
        'An On Error Continue for `HTTP:NOT_FOUND` in the global handler',
        'A Choice router after the call checking the status code',
        'Change the HTTP config so 404 is treated as success everywhere',
      ],
      answer: 0,
      explain: '`<error-mapping sourceType="HTTP:NOT_FOUND" targetType="CRM:CUSTOMER_NOT_FOUND"/>` on one operation re-types the error for that call only; other 404s keep their type.',
    },
    {
      type: 'order',
      prompt: 'Order the On Error Propagate handlers in the global error handler.',
      items: [
        '`APP:VALIDATION_ERROR` → 400',
        '`CRM:CUSTOMER_NOT_FOUND` → 404',
        '`CRM:UNAVAILABLE, HTTP:CONNECTIVITY, HTTP:TIMEOUT` → 503',
        '`ANY` → 500',
      ],
      explain: 'Specific types first, the catch-all `ANY` last, otherwise it would shadow everything below it.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the shared global handler are true?',
      options: [
        'It is set with `<configuration defaultErrorHandler-ref="global-error-handler"/>`',
        'When an On-Error in the flow\'s own handler matches the error, that one runs and not the default handler',
        'It should return `error.errorMessage.payload` so clients see the CRM error page',
        'A handler for `MULE:CONNECTIVITY` also catches `HTTP:CONNECTIVITY`',
      ],
      answer: [0, 1, 3],
      explain: 'Connector connectivity types have `MULE:CONNECTIVITY` as their parent. Never return the raw CRM HTML — log it and return the contract JSON body.',
    },
  ],
  description: `
You are building a **Customer System API** in front of a legacy CRM (HTTP) with 25 flows. The API contract says:

| Situation | HTTP status | Body \`code\` |
|---|---|---|
| Invalid input (e.g. bad email) | 400 | \`VALIDATION_ERROR\` |
| Customer not found in CRM (CRM returns 404) | 404 | \`CUSTOMER_NOT_FOUND\` |
| CRM unreachable or times out | 503 | \`BACKEND_UNAVAILABLE\` |
| Anything else | 500 | \`INTERNAL_ERROR\` |

Today each flow has its own copy-pasted error handler, and some flows return the CRM's raw HTML error page. Also, a CRM 404 currently surfaces as a generic 500 because one flow catches \`ANY\` first.

**Questions**
1. Explain Mule 4 error types: format, hierarchy, and how an \`on-error\` handler is selected.
2. How do you raise \`VALIDATION_ERROR\` yourself, and which namespaces are you allowed to use?
3. How do you turn the CRM's \`HTTP:NOT_FOUND\` into a business error *only for the "get customer" call*?
4. How do you avoid 25 copies of the handler?
5. Why did the 404 become a 500?
`,
  answerTemplate: `## Error types and handler selection

## Raising custom errors

## Error mapping

## One shared handler

## The 404 → 500 bug
`,
  keyPoints: [
    'Error types are NAMESPACE:IDENTIFIER with a parent hierarchy rooted at ANY (e.g. HTTP:CONNECTIVITY is a MULE:CONNECTIVITY); handlers match a type or its parents.',
    'on-error handlers are evaluated in order and the first match (type and/or when expression) wins — specific types must come before ANY.',
    'Raise Error creates custom types in your own namespace (e.g. APP:VALIDATION_ERROR) and can raise core runtime types such as MULE:CONNECTIVITY; you cannot raise in an existing connector or module namespace.',
    'Error mapping on a single operation (sourceType HTTP:NOT_FOUND → targetType CRM:CUSTOMER_NOT_FOUND) re-types an error only for that call.',
    'A global error handler is referenced from the configuration element (defaultErrorHandler-ref) and covers errors that flows do not handle themselves.',
  ],
  solution: `
**Error types:** \`NAMESPACE:IDENTIFIER\`, e.g. \`HTTP:NOT_FOUND\`, \`DB:CONNECTIVITY\`, \`MULE:EXPRESSION\`. Types form a hierarchy rooted at \`ANY\`; connector types usually have a core parent (\`HTTP:CONNECTIVITY\` → \`MULE:CONNECTIVITY\`), so a handler for \`MULE:CONNECTIVITY\` also catches connector connectivity errors. Handlers inside \`<error-handler>\` are checked **top to bottom**; the first whose \`type\` and/or \`when\` matches runs. Critical errors (e.g. JVM fatal errors) can't be handled.

**Raising custom errors:** use **Raise Error** after a validation (or the Validation module, which raises \`VALIDATION:*\`):
\`\`\`xml
<raise-error type="APP:VALIDATION_ERROR" description="email is not valid"/>
\`\`\`
For a custom type the namespace must be your own (\`APP\`, \`CUSTOMER\`…). Raise Error can also raise core runtime types such as \`MULE:CONNECTIVITY\`, where only the description can be customised, but it cannot raise in a namespace that belongs to an existing connector or module (e.g. \`HTTP\`).

**Error mapping:** on the CRM "get customer" HTTP Request only:
\`\`\`xml
<http:request config-ref="crm" method="GET" path="/customers/{id}">
  <error-mapping sourceType="HTTP:NOT_FOUND" targetType="CRM:CUSTOMER_NOT_FOUND"/>
</http:request>
\`\`\`
Other calls that may return 404 keep their original type. Mapping \`HTTP:CONNECTIVITY\` and \`HTTP:TIMEOUT\` to \`CRM:UNAVAILABLE\` is also handy.

**One shared handler:** define a global \`<error-handler name="global-error-handler">\` and set \`<configuration defaultErrorHandler-ref="global-error-handler"/>\`. Order:
1. \`APP:VALIDATION_ERROR\` (and \`APIKIT:BAD_REQUEST\` if using APIkit) → 400
2. \`CRM:CUSTOMER_NOT_FOUND\` → 404
3. \`CRM:UNAVAILABLE, HTTP:CONNECTIVITY, HTTP:TIMEOUT\` → 503
4. \`ANY\` → 500

Each is an **On Error Propagate** that sets \`vars.httpStatus\` and a JSON body (\`code\`, \`message: error.description\`, \`correlationId\`), used by the listener's error response. Never return \`error.errorMessage.payload\` (the CRM HTML) to the client — log it instead. Flows remove their local handlers (an error matched by a flow's own handler never reaches the default one).

**404 → 500:** the flow's handler listed \`ANY\` first, so it matched before the specific handler ever got a chance. Specific types first, \`ANY\` last.
`,
  followUps: [
    {
      q: 'What is the difference between error.description, error.errorType and error.errorMessage?',
      a: 'description is the human-readable message, errorType is the NAMESPACE:IDENTIFIER (with parent), and errorMessage is the Mule message attached to the error — e.g. the HTTP response body and attributes returned by the failing request.',
    },
    {
      q: 'Can a flow use both its own handler and the global one?',
      a: 'The docs say default error handling takes place for errors you do not match or capture with ANY, but they do not spell out how a custom global handler combines with a local one, so do not rely on it. Reference the global handler from a flow (error-handler ref), or handle a few cases locally and re-raise the rest so the caller handles them.',
    },
    {
      q: 'If APIkit is used, which errors does it raise for you?',
      a: 'APIkit Router raises APIKIT:BAD_REQUEST, NOT_FOUND, METHOD_NOT_ALLOWED, NOT_ACCEPTABLE and UNSUPPORTED_MEDIA_TYPE (and APIKIT:NOT_IMPLEMENTED for the console/unimplemented flows); the scaffolded handler maps them to statuses.',
    },
  ],
}
