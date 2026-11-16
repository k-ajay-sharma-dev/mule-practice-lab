import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-125',
  category: 'architecture',
  title: 'An API Gateway in Front of an Experience API',
  level: 'BEGINNER',
  tags: ['api-gateway', 'policies', 'api-manager', 'rate-limiting', 'experience-api', 'retail'],
  estMinutes: 20,
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
        gw: ['api-gateway', 'API gateway', { auth: 'client-id', rateLimit: 200 }],
        exp: ['experience-api', 'exp-web-store-api', { vCores: '0.5' }],
        prc: ['process-api', 'prc-products-api', { vCores: '0.5' }],
      },
      ['web -> gw', 'gw -> exp', 'exp -> prc'],
    ),
    simulation: {
      systems: [],
      tests: [
        {
          name: 'The sale opens',
          about: 'The store sends 60 requests a second, and 400 a second for the first three minutes of the sale. The requests over the limit get 429, none fail with a server error, and the APIs stay inside 1.5 vCores.',
          traffic: [{ name: 'shoppers', from: 'web-app', rps: 60, to: 'process-api', spikes: [{ at: 3, forMin: 3, rps: 400 }] }],
          expect: { answers: [{ minSuccess: 0.5, maxFailed: 0.01 }], vCores: { max: 1.5 } },
        },
        {
          name: 'Scrapers without a client id',
          about: 'Shoppers send 60 requests a second through the store. Scrapers send 100 a second with no client id. The gateway refuses the scrapers, and every shopper gets an answer.',
          traffic: [
            { name: 'shoppers', from: 'web-app', rps: 60, to: 'process-api' },
            { name: 'scrapers', from: 'web-app', rps: 100, auth: 'none', to: 'process-api' },
          ],
          expect: { answers: [{ flow: 'shoppers', minSuccess: 0.99 }, { flow: 'scrapers', minRefused: 0.99 }], notReached: [{ flow: 'scrapers', node: 'experience-api' }] },
        },
      ],
    },
  },
  description: `
An online store runs a big sale twice a year. During the last one, a flood of requests slowed its **Experience API**, which shapes data for the store and calls a **Process API** for the business rules. Nothing checked who was calling.

Some numbers for the design:
- The store sends about 60 requests a second. When a sale opens, that jumps to 400 a second for a few minutes.
- The budget for the two APIs is 1.5 vCores. In this model one vCore serves about 500 simple requests a second, so the APIs can be sized for about 200 a second, not for the whole spike.
- Scrapers have sent 100 requests a second without a client id.

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
    'Size the APIs for normal peaks and set the rate limit at what they can carry, here 200 a second with 0.5 vCore each. A spike then gets 429, not 503 errors from an overloaded API.',
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

**Sizing.** 0.5 vCore for each API carries about 250 requests a second, and the two together use 1 vCore of the 1.5 budget. A rate limit of 200 a second keeps them below that. When the sale opens and 400 a second arrive, half get 429 and the store can ask them to try again, while the rest are answered quickly. Without the limit the Experience API is overloaded and fails requests with 503. Buying enough vCores for the whole spike would cost 2 vCores, over the budget. Client ID Enforcement refuses the scrapers at the gateway, so they never use the API capacity.

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
