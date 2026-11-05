export default {
  id: 'ms-028',
  category: 'mulesoft',
  title: 'HTTP Listener Attributes and Building Responses with Status Codes',
  level: 'BEGINNER',
  tags: ['http-listener', 'attributes', 'status-codes', 'headers'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: '`GET /shipments?status=OPEN&status=DELAYED`. Which expression returns both values?',
      options: [
        '`attributes.queryParams.*status`',
        '`attributes.queryParams.status`',
        '`attributes.queryString.status`',
        '`attributes.uriParams.status`',
      ],
      answer: 0,
      explain: '`queryParams` is a MultiMap: `.status` returns the first value ("OPEN"), `.*status` returns all of them.',
    },
    {
      type: 'single',
      prompt: "`attributes.headers.'X-Correlation-Id'` is always null although the client sends it. Why?",
      options: [
        'The listener stores header names in lower case, so use `attributes.headers."x-correlation-id"`',
        'Custom headers are removed by the listener',
        'Headers are only available in `vars`',
        'The client must send it as a query parameter',
      ],
      answer: 0,
      explain: 'HTTP header names are case-insensitive; the listener normalises them to lower case.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match the flow outcome to the listener builder that sends the response.',
      pairs: [
        ['Flow completes normally', '`http:response`'],
        ['Error caught by On Error Continue', '`http:response` (flow considered successful)'],
        ['Error propagated out of the flow', '`http:error-response`'],
      ],
      explain: 'A common bug: setting `vars.httpStatus` in On Error Continue but only configuring the error-response builder.',
    },
    {
      type: 'single',
      prompt: 'How do you make `POST /shipments` return 201 with a `Location` header?',
      options: [
        'Set `vars.httpStatus = 201` and `vars.outboundHeaders = { Location: ... }`, used by `<http:response statusCode="#[vars.httpStatus default 200]">` and its headers',
        'Set the payload to `201`',
        'Add `Location` to `attributes.headers`',
        'POST responses are always 201 automatically',
      ],
      answer: 0,
      explain: 'Response status and headers are expressions on the listener builders. Attributes are read-only request data.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for returning a 404 JSON body when a shipment is not found.',
      items: [
        'Look up the shipment and find it empty',
        'Raise Error `APP:NOT_FOUND`',
        'On Error Propagate for `APP:NOT_FOUND` sets `vars.httpStatus = 404` and a JSON payload',
        'The listener error-response builder sends the 404 with that body',
      ],
      explain: 'Without this, an unhandled error gives 500 with the error description — the "Java-like" text the clients saw.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which are fields of `HttpRequestAttributes`?',
      options: ['`method`', '`uriParams`', '`relativePath`', '`remoteAddress`', '`statusCode`'],
      answer: [0, 1, 2, 3],
      explain: '`statusCode` belongs to `HttpResponseAttributes`, which you get after an HTTP **Request**, not from the Listener.',
    },
  ],
  description: `
A **Shipments Experience API** exposes:

| Method | Path | Notes |
|---|---|---|
| GET | \`/shipments/{trackingId}\` | optional \`?fields=status,eta\` |
| GET | \`/shipments?status=OPEN&status=DELAYED\` | the same query param can repeat |
| POST | \`/shipments\` | must return **201 Created** plus a \`Location\` header |

Current behaviour:
- \`POST\` always returns **200**.
- When a shipment is not found, the API returns **500** with a Java-like error text.
- \`attributes.queryParams.status\` returns only \`"OPEN"\`.
- The developer reads a header with \`attributes.headers.'X-Correlation-Id'\` and always gets \`null\`, although the client sends it.

**Questions**
1. List the most useful fields of \`HttpRequestAttributes\`.
2. How do you read a repeated query param and a header reliably?
3. How do you set a dynamic status code and headers on the success response and on the error response?
4. Fix POST → 201 + Location and not-found → 404 with a JSON body.
5. When is the listener's **error response** used versus the normal **response**?
`,
  answerTemplate: `## HttpRequestAttributes

## Repeated query params and headers

## Response and error response builders

## Fixing 201 and 404

## Which builder is used when
`,
  keyPoints: [
    'Listener attributes include method, requestPath, listenerPath, relativePath, uriParams, queryParams, queryString, headers, remoteAddress and scheme.',
    'queryParams and headers are MultiMaps: .key gives the first value, .*key gives all values; header names are stored in lower case.',
    'The http:response and http:error-response elements take statusCode, reasonPhrase, headers and body as expressions, commonly driven by vars.httpStatus.',
    'If the flow completes (including via On Error Continue) the normal response is sent; if an error propagates out of the flow, the error response is sent.',
    'Without customisation an unhandled error gives a 500 with the error description as body.',
  ],
  solution: `
**HttpRequestAttributes** (what the listener puts in \`attributes\`): \`method\`, \`scheme\`, \`version\`, \`requestUri\`, \`requestPath\`, \`listenerPath\`, \`relativePath\`, \`uriParams\`, \`queryParams\`, \`queryString\`, \`headers\`, \`remoteAddress\`, \`localAddress\`, and client certificate info for mutual TLS.

**Repeated params and headers** — both are **MultiMaps**:
\`\`\`dataweave
%dw 2.0
output application/json
---
{
  firstStatus: attributes.queryParams.status,       // "OPEN"
  allStatuses: attributes.queryParams.*status,      // ["OPEN", "DELAYED"]
  correlation: attributes.headers."x-correlation-id" // header keys are lower case
}
\`\`\`
HTTP header names are case-insensitive; the listener stores them in lower case, which is why \`'X-Correlation-Id'\` returned null.

**Builders on the listener**
\`\`\`xml
<http:listener config-ref="api-httpListenerConfig" path="/shipments/*">
  <http:response statusCode="#[vars.httpStatus default 200]">
    <http:headers>#[vars.outboundHeaders default {}]</http:headers>
  </http:response>
  <http:error-response statusCode="#[vars.httpStatus default 500]">
    <http:body>#[payload]</http:body>
    <http:headers>#[vars.outboundHeaders default {}]</http:headers>
  </http:error-response>
</http:listener>
\`\`\`

**POST → 201:** after the insert, set
\`vars.httpStatus = 201\` and \`vars.outboundHeaders = { Location: "/shipments/" ++ payload.trackingId }\`.

**Not found → 404:** raise a custom error (e.g. \`Raise Error type="APP:NOT_FOUND"\`) when the lookup is empty. In the error handler, \`On Error Propagate type="APP:NOT_FOUND"\` sets \`vars.httpStatus = 404\` and a JSON payload \`{ "message": "Shipment not found" }\` — the error-response builder sends it. (Alternatively On Error Continue with the same vars — then the normal response builder is used.)

**Which builder is used**
| Flow outcome | Builder |
|---|---|
| Completes normally | \`http:response\` |
| Error caught by **On Error Continue** | \`http:response\` (the flow is considered successful) |
| Error **propagated** out of the flow | \`http:error-response\` |

So the status/headers logic must exist in whichever builder your error strategy ends up using — a common bug is setting \`vars.httpStatus\` in On Error Continue but only configuring the error-response builder.
`,
  followUps: [
    {
      q: 'Does the HTTP Listener stream large response bodies?',
      a: 'Yes, it can. The listener has a response streaming mode (AUTO, ALWAYS, NEVER); with streaming it uses chunked transfer encoding instead of a Content-Length, which avoids loading large bodies fully into memory.',
    },
    {
      q: 'What is the difference between requestPath and relativePath?',
      a: 'requestPath is the full path the client called; relativePath is the part after any base path configured on the listener config. Use relativePath when the same flow is deployed behind different base paths.',
    },
    {
      q: 'How do you read form parameters from an application/x-www-form-urlencoded POST?',
      a: 'They are in the payload, not in attributes. DataWeave reads that MIME type into an object, so payload.fieldName works.',
    },
  ],
}
