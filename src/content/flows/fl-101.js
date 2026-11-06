import { design, flow, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-101',
  category: 'flows',
  title: 'Pick a Shipping Service: Choice with Two Routes and a Default',
  level: 'BEGINNER',
  tags: ['choice', 'routers', 'routing', 'shipping'],
  estMinutes: 10,
  flowChecks: [
    { label: 'An HTTP Listener receives the shipment', rule: { type: 'source', component: 'http-listener' } },
    { label: 'A Choice has two condition routes', rule: { type: 'routes', component: 'choice', min: 2 } },
    { label: 'A route inside the Choice selects the LETTER service', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'service', value: 'LETTER' } } },
    { label: 'The Choice also selects the FREIGHT service for heavy shipments', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'service', value: 'FREIGHT' } } },
    { label: 'The response is built after the Choice', rule: { type: 'before', first: 'choice', then: 'transform' } },
  ],
  referenceFlow: design(
    flow('pick-shipping-service', source('http-listener', { path: '/shipments/service', allowedMethods: 'POST' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[payload.weightKg <= 2]' }, [step('set-variable', { variableName: 'service', value: 'LETTER' })]),
          route({ expression: '#[payload.weightKg <= 30]' }, [step('set-variable', { variableName: 'service', value: 'PARCEL' })]),
        ],
        { otherwise: [step('set-variable', { variableName: 'service', value: 'FREIGHT' })] },
      ),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ shipmentId: payload.shipmentId, service: vars.service }',
      }),
    ]),
  ),
  description: `
A shipping company picks a delivery service from the weight of each shipment.

The booking system sends \`POST /shipments/service\` with this body:

\`\`\`json
{ "shipmentId": "SHP-204", "weightKg": 12 }
\`\`\`

A **Choice** router sends the message down exactly one path. Each path with a condition is a **route**. The **default** route, also called \`otherwise\`, runs when no condition is true.

**Requirements**
- Up to and including 2 kg: service \`LETTER\`.
- Up to and including 30 kg: service \`PARCEL\`.
- Anything heavier: service \`FREIGHT\`. Use the default route for this.
- Each route stores its answer in a variable called \`service\`.
- The flow answers with the \`shipmentId\` and the \`service\`.

**Design the flow.** Does the order of the two conditions matter?
`,
  answerTemplate: `## Trigger

## Conditions and their order

## The default route

## Building the response
`,
  keyPoints: [
    'A Choice runs only one route: the first one whose condition is true.',
    'The order matters. A 1 kg shipment passes both conditions, so the 2 kg test must come first.',
    'The default route handles everything the conditions did not match, here the shipments over 30 kg.',
    'Each route sets vars.service, and one Transform Message after the Choice builds the response once.',
  ],
  solution: `
1. **HTTP Listener**, path \`/shipments/service\`, allowed method \`POST\`.
2. **Choice** with these routes:
   - First route, \`#[payload.weightKg <= 2]\`: **Set Variable** \`service\` to \`LETTER\`.
   - Second route, \`#[payload.weightKg <= 30]\`: **Set Variable** \`service\` to \`PARCEL\`.
   - Default route: **Set Variable** \`service\` to \`FREIGHT\`.
3. **Transform Message** after the Choice:

\`\`\`
%dw 2.0
output application/json
---
{ shipmentId: payload.shipmentId, service: vars.service }
\`\`\`

The second condition does not need to say "more than 2 kg". A shipment only reaches it when the first condition was false, because the Choice stops at the first match.
`,
  followUps: [
    {
      q: 'What happens to a 1 kg shipment if you swap the two conditions?',
      a: 'It matches the 30 kg test first, so it gets PARCEL. The LETTER route would never run, because everything up to 2 kg also passes the 30 kg test.',
    },
    {
      q: 'Why is the Transform Message after the Choice and not inside each route?',
      a: 'The response has the same shape on every route. Writing it once avoids three copies that must be kept in step.',
    },
    {
      q: 'When would Choice be the wrong router?',
      a: 'When more than one path must run. Choice runs one route only. Scatter-Gather runs all its routes at the same time.',
    },
  ],
}
