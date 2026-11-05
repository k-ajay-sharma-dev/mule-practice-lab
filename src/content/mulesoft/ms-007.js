export default {
  id: 'ms-007',
  category: 'mulesoft',
  title: 'Mule Event Structure: Payload, Attributes and Variables',
  level: 'BEGINNER',
  tags: ['mule-event', 'attributes', 'variables', 'http'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why is `attributes.uriParams.id` null when the Database Select runs?',
      options: [
        'The HTTP Request replaced the whole message — payload and attributes — with the System API response',
        'URI params are only available inside the Listener component',
        'The Database connector clears all variables',
        'Mule drops attributes after 30 seconds',
      ],
      answer: 0,
      explain: 'Every operation that returns a result replaces payload **and** attributes. After the HTTP Request, attributes are `HttpResponseAttributes` (status code, headers); the request params are gone. Variables are untouched.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which are valid ways to keep the request params available for the Choice router?',
      options: [
        'Set variables (`customerId`, `includeOrders`) right after the Listener and use `vars.*` later',
        'Use `target` on the HTTP Request and DB Select so their results go into variables',
        'Read them from `message.inboundProperties` as in Mule 3',
        'Move the Choice before the Listener',
      ],
      answer: [0, 1],
      explain: 'Copying into vars or using target variables both leave the original data reachable. Inbound properties do not exist in Mule 4.',
    },
    {
      type: 'match',
      prompt: 'Match the step to what `attributes` holds right after it.',
      pairs: [
        ['HTTP Listener', 'HttpRequestAttributes: method, headers, queryParams, uriParams'],
        ['HTTP Request', 'HttpResponseAttributes: statusCode, reasonPhrase, headers'],
        ['Set Variable', 'Unchanged from the previous step'],
      ],
      explain: 'Source and operations set attributes; Set Variable only changes `vars` and leaves the message alone.',
    },
    {
      type: 'single',
      prompt: 'An HTTP Request uses `target="customer"` with the default `targetValue`. What ends up in `vars.customer`, and what happens to the current payload?',
      options: [
        'The response body; the current payload and attributes are left untouched',
        'The whole response message; the payload is replaced too',
        'The status code only; the payload is cleared',
        'Nothing — target only works on Database operations',
      ],
      answer: 0,
      explain: 'The default `targetValue` is `#[payload]`, so only the body is stored and the status code is lost. Use `#[message]` if you also need the attributes.',
    },
    {
      type: 'single',
      prompt: 'A variable is changed inside an **Async** scope. Is the change visible to the main flow afterwards?',
      options: [
        'Yes, Async shares the same event',
        'No, Async works on a copy of the event',
        'Only if the Async scope finishes first',
        'Only for variables that existed before the scope',
      ],
      answer: 1,
      explain: 'Async gets a copy of the event, so its changes never come back. A Flow Reference, by contrast, shares the event and its changes are visible to the caller.',
    },
  ],
  description: `
A Customer Process API exposes \`GET /customers/{id}?includeOrders=true\`. The flow:

1. **HTTP Listener** receives the request.
2. **HTTP Request** calls the Customer System API \`GET /customers/{id}\`.
3. **Database Select** reads the customer's orders.
4. A **Choice** router checks \`attributes.queryParams.includeOrders == "true"\` to decide whether to merge the orders into the response.
5. A **Transform Message** builds the final JSON.

In testing, orders are **never** included, and the logs show \`attributes.uriParams.id\` is \`null\` when the DB select runs. A junior developer says "Mule loses the request somewhere".

**Questions**
1. What are the parts of a Mule 4 event, and which of them are replaced when a connector operation runs?
2. What do \`payload\` and \`attributes\` contain after the HTTP Listener, after the HTTP Request and after the Database Select?
3. Why are the query/URI params "lost", and what are two ways to fix it?
4. How do variables behave across a Flow Reference and inside an Async scope?
`,
  answerTemplate: `## Parts of the Mule event

## Payload and attributes after each step

## Why the params are lost and the fix

## Variables across Flow Reference and Async
`,
  keyPoints: [
    'A Mule 4 event = message (payload + attributes) + variables (vars), plus metadata such as correlationId and error.',
    'An operation that returns a result (HTTP Request, DB Select) replaces both payload and attributes; vars are untouched.',
    'After the HTTP Request, attributes are HttpResponseAttributes (statusCode, headers) — the listener\'s queryParams/uriParams are gone.',
    'Fix 1: copy needed request data into vars right after the listener. Fix 2: use target / targetValue on the outbound operations so payload and attributes stay intact.',
    'Variables set before a Flow Reference are visible in the called flow and changes come back; an Async scope works on a copy, so its changes are not visible to the caller.',
  ],
  solution: `
**Parts of the event:** the **message** (\`payload\` + \`attributes\`) and **variables** (\`vars\`). The event also carries metadata such as \`correlationId\` and, inside an error handler, \`error\`. Mule 3's inbound/outbound properties no longer exist — attributes replace inbound properties, and outbound headers are set explicitly on the connector.

**Step by step**
| After | payload | attributes |
|---|---|---|
| HTTP Listener | request body (empty for GET) | \`HttpRequestAttributes\`: method, headers, queryParams, uriParams, requestPath… |
| HTTP Request | response body of the System API | \`HttpResponseAttributes\`: statusCode, reasonPhrase, headers |
| Database Select | list/iterator of rows (maps) | whatever the operation returns — no HTTP data |

**Why the params are lost:** every operation that produces a result **replaces the message** (payload *and* attributes). By step 3 the listener attributes are long gone, so \`attributes.uriParams.id\` is null and the Choice never sees \`includeOrders\`.

**Fixes**
1. Right after the listener, store what you need: \`Set Variable customerId = attributes.uriParams.id\`, \`includeOrders = attributes.queryParams.includeOrders default "false"\`. Use \`vars.customerId\` later.
2. Configure the outbound operations with a **target variable** (\`target="customer"\`, optional \`targetValue="#[payload]"\`). The result goes into \`vars.customer\` and the incoming message is left untouched.

**Variables:** a Flow Reference passes the same event, so the called flow/sub-flow sees existing vars and any var it sets is visible after the reference returns. An **Async** scope receives a copy of the event; changes made inside it are not visible to the main flow.
`,
  followUps: [
    {
      q: 'If you use target on an HTTP Request, what happens to the response status code?',
      a: 'With the default targetValue (#[payload]) only the body is stored, so the status code is lost. Set targetValue to #[message] (or an expression that keeps attributes.statusCode) when you need it.',
    },
    {
      q: 'Where did Mule 3 inbound and outbound properties go?',
      a: 'Inbound properties became the read-only attributes of the message. Outbound properties were removed; headers and similar values are now set explicitly on the operation (e.g. the headers field of HTTP Request).',
    },
    {
      q: 'Does a Logger or Set Variable change the payload?',
      a: 'No. The Logger only reads the event and Set Variable only adds or changes a variable; payload and attributes stay the same.',
    },
  ],
}
