import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-125',
  category: 'architecture',
  title: 'An API Gateway in Front of an Experience API',
  level: 'BEGINNER',
  tags: ['api-gateway', 'policies', 'api-manager', 'rate-limiting', 'experience-api', 'retail'],
  estMinutes: 10,
  diagram: {
    task: 'draw an API gateway in front of an Experience API. Use four boxes: a Web app box, an API gateway / policies box, an Experience API box and a Process API box. Connect them in that order, with one line between each pair.',
    checks: [
      { label: 'The web app calls the gateway', rule: { type: 'edge', from: 'web-app', to: 'api-gateway' } },
      { label: 'The gateway passes requests to the Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'The web app never calls the Experience API directly', rule: { type: 'no-edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The Experience API calls the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'The gateway forwards live requests, so every call in the path is a sync call', rule: { type: 'lines', from: ['web-app', 'api-gateway', 'experience-api'], to: ['api-gateway', 'experience-api', 'process-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Online store'],
        gw: ['api-gateway', 'API gateway'],
        exp: ['experience-api', 'exp-web-store-api'],
        prc: ['process-api', 'prc-products-api'],
      },
      ['web -> gw', 'gw -> exp', 'exp -> prc'],
    ),
  },
  description: `
An online store runs a big sale twice a year. During the last one, a flood of requests slowed its **Experience API**, which shapes data for the store and calls a **Process API** for the business rules. Nothing checked who was calling.

An **API gateway** is the checkpoint in front of an API. It applies **policies**, which are rules for each request, such as "only known clients" or "at most this many requests a minute".

**Questions:**
- Draw the gateway in the request path.
- Which two policies would you apply, and why?
`,
  answerTemplate: `## Design

## Policies
`,
  keyPoints: [
    'An API gateway is the checkpoint that stands in the request path.',
    'Policies stop bad or excess requests before they reach the API logic.',
    'Client ID Enforcement checks who is calling. Rate Limiting caps how many requests get through.',
    'Policies are configured in API Manager, so the API logic does not change.',
  ],
  solution: `
**Design.**
\`\`\`
 Online store ─► API gateway ─► exp-web-store-api ─► prc-products-api
\`\`\`

**Policies.**
| Policy | Job here |
|---|---|
| Client ID Enforcement | Rejects a caller without valid client credentials, usually a client ID and secret |
| Rate Limiting | Caps requests in a time window. Extra requests get HTTP status 429 (too many requests) |

Both are set up in API Manager, Anypoint Platform's tool for managing APIs, so the team writes no new logic in the API.

**A note on the box.** The diagram draws the gateway as its own step so that you can see it. A Mule app paired with API Manager through API Autodiscovery can enforce policies inside its own runtime, with no extra hop.
`,
  followUps: [
    {
      q: 'Why place the gateway in front of the Experience API and not the Process API?',
      a: 'The Experience API is where outside traffic enters. Stopping bad requests there keeps them away from every layer below.',
    },
    {
      q: 'Do policies replace business rules?',
      a: 'No. A policy looks at the request: who sent it and how often. A rule such as "a customer can return shoes within 30 days" still belongs in a Process API.',
    },
  ],
}
