import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-104',
  category: 'flows',
  title: 'Exchange Rate API: Call Another API with HTTP Request',
  level: 'BEGINNER',
  tags: ['http-request', 'http', 'rest', 'http-listener'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives the GET request', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'GET' } } },
    { label: 'An HTTP Request calls GET /v1/rates/EUR', rule: { type: 'exists', component: 'http-request', where: { method: 'GET', path: '/v1/rates/EUR' } } },
    { label: 'The incoming call is logged before the provider is called', rule: { type: 'before', first: 'logger', then: 'http-request' } },
    { label: 'The provider answer is reshaped after the call', rule: { type: 'before', first: 'http-request', then: 'transform' } },
    { label: 'The response has a usdRate field', rule: { type: 'exists', component: 'transform', where: { script: 'usdRate' } } },
  ],
  referenceFlow: design(
    flow('get-eur-rate', source('http-listener', { path: '/exchange-rates/eur', allowedMethods: 'GET' }), [
      step('logger', { level: 'INFO', message: 'EUR rate requested' }),
      step('http-request', { method: 'GET', path: '/v1/rates/EUR' }),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ currency: payload.base, usdRate: payload.rate, asOf: payload.asOf }',
      }),
    ]),
  ),
  description: `
A bank's mobile app shows today's euro exchange rate. The rate comes from an outside provider. The app should not call the provider directly, so the bank puts a small API in front of it.

The app calls \`GET /exchange-rates/eur\`.

**HTTP Request** is the component that calls another API from inside a flow. The provider offers \`GET /v1/rates/EUR\`, which answers with:

\`\`\`json
{ "base": "EUR", "quote": "USD", "rate": 1.08, "asOf": "2026-11-06" }
\`\`\`

**Requirements**
- Log a line when the app calls the API.
- Call the provider.
- Answer the app with this shape:

\`\`\`json
{ "currency": "EUR", "usdRate": 1.08, "asOf": "2026-11-06" }
\`\`\`

**Design the flow.** What is in the payload after the HTTP Request?
`,
  answerTemplate: `## Trigger

## Calling the provider

## What the payload holds after the call

## Building the response
`,
  keyPoints: [
    'The HTTP Listener receives the call from the app. The HTTP Request makes the call to the provider.',
    'The host and port of the provider go on the request configuration. The path and method go on the operation.',
    'After the call, the payload is the body of the provider answer.',
    'The status code and headers of the answer are in attributes, for example attributes.statusCode.',
    'A Transform Message keeps the app independent of the field names the provider uses.',
  ],
  solution: `
1. **HTTP Listener**, path \`/exchange-rates/eur\`, allowed method \`GET\`.
2. **Logger**: \`EUR rate requested\`.
3. **HTTP Request**, method \`GET\`, path \`/v1/rates/EUR\`. The provider's host and port are set once on the request configuration.
4. **Transform Message** with this script:

\`\`\`
%dw 2.0
output application/json
---
{ currency: payload.base, usdRate: payload.rate, asOf: payload.asOf }
\`\`\`

The listener returns the final payload to the app. The app never sees the provider's field names, so the bank can change provider without changing the app.
`,
  followUps: [
    {
      q: 'The provider answers with status 404. What happens in the flow?',
      a: 'The HTTP Request raises the error HTTP:NOT_FOUND and the steps after it do not run. A 500 from the provider raises HTTP:INTERNAL_SERVER_ERROR in the same way.',
    },
    {
      q: 'What are attributes in this flow?',
      a: 'Attributes hold details about the message, not the data itself. After the HTTP Request, they hold the status code and headers of the provider answer.',
    },
    {
      q: 'Why not let the mobile app call the provider itself?',
      a: 'The provider credentials would have to live in the app, and every change at the provider would need a new app release. The API keeps both on the server side.',
    },
  ],
}
