import { design, flow, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-098',
  category: 'flows',
  title: 'Store Opening Hours API: Return a Fixed JSON Response',
  level: 'BEGINNER',
  tags: ['http-listener', 'http', 'json', 'retail'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives requests on /store/hours', rule: { type: 'source', component: 'http-listener', where: { path: '/store/hours' } } },
    { label: 'The listener allows the GET method', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'GET' } } },
    { label: 'The arrival of a request is logged before the response is built', rule: { type: 'before', first: 'logger', then: ['set-payload', 'transform'] } },
    { label: 'The response is built with Set Payload or Transform Message', rule: { type: 'exists', component: ['set-payload', 'transform'] } },
    { label: 'A second Logger records that the response is ready', rule: { type: 'before', first: ['set-payload', 'transform'], then: 'logger' } },
  ],
  referenceFlow: design(
    flow('get-store-hours', source('http-listener', { path: '/store/hours', allowedMethods: 'GET' }), [
      step('logger', { level: 'INFO', message: 'Opening hours requested' }),
      step('set-payload', { value: '#[output application/json --- { store: "Main Street", opens: "09:00", closes: "18:00" }]' }),
      step('logger', { level: 'INFO', message: 'Opening hours response ready' }),
    ]),
  ),
  description: `
A small retail chain wants its website to show the opening hours of the Main Street store. The hours rarely change, so the answer can be fixed in the flow for now. No database is needed.

An **HTTP Listener** is the component that starts a flow when a web request arrives. The **payload** is the main data a flow is carrying at any moment.

**Requirements**
- The website calls \`GET /store/hours\`.
- The flow answers with this JSON:

\`\`\`json
{ "store": "Main Street", "opens": "09:00", "closes": "18:00" }
\`\`\`

- The support team wants one log line when a request arrives and one when the response is ready.

**Design the flow.** How does the JSON you build get back to the website?
`,
  answerTemplate: `## Trigger

## Building the response

## Logging

## How the response reaches the caller
`,
  keyPoints: [
    'An HTTP Listener with the path /store/hours and the allowed method GET starts the flow.',
    'Set Payload replaces the payload with the fixed JSON. Transform Message would work too.',
    'The listener sends the payload at the end of the flow back as the response body, with status 200 when the flow succeeds.',
    'A Logger writes a line to the application log and leaves the payload unchanged.',
  ],
  solution: `
1. **HTTP Listener**, path \`/store/hours\`, allowed method \`GET\`. The host and port live on the listener configuration. The path lives on the listener itself.
2. **Logger** at INFO level: \`Opening hours requested\`.
3. **Set Payload** with \`#[output application/json --- { store: "Main Street", opens: "09:00", closes: "18:00" }]\`. The \`output\` part tells Mule to produce JSON.
4. **Logger** at INFO level: \`Opening hours response ready\`.

There is no separate "send response" step. When the flow finishes, the listener returns the payload as the body with status 200.
`,
  followUps: [
    {
      q: 'What does the caller receive if a step in the flow fails?',
      a: 'If nothing handles the error, the listener answers with status 500 and the error description as the body.',
    },
    {
      q: 'Does the Logger change what the website receives?',
      a: 'No. A Logger only writes to the log. The payload passes through it unchanged, so the order of the last two steps does not affect the response.',
    },
    {
      q: 'The hours start to change every week. What would you change?',
      a: 'Move the hours out of the flow, for example into a database table or a properties file, so a new value does not need a new deployment of the code.',
    },
  ],
}
