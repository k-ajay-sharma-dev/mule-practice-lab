import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-128',
  category: 'architecture',
  title: 'A Partner Calling Through the Gateway',
  level: 'BEGINNER',
  tags: ['api-led', 'partner', 'api-gateway', 'policies', 'b2b'],
  estMinutes: 10,
  diagram: {
    task: 'draw the path of a partner call. Use five boxes: a Partner / B2B client box, an API gateway / policies box, an Experience API box, a Process API box and a System API box. Connect them in that order, with one line between each pair.',
    checks: [
      { label: 'The partner calls the gateway', rule: { type: 'edge', from: 'partner', to: 'api-gateway' } },
      { label: 'The partner reaches no API directly', rule: { type: 'no-edge', from: 'partner', to: ['experience-api', 'process-api', 'system-api'] } },
      { label: 'The gateway passes requests to the Experience API', rule: { type: 'edge', from: 'api-gateway', to: 'experience-api' } },
      { label: 'The Experience API calls the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'The Process API calls the System API', rule: { type: 'edge', from: 'process-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        par: ['partner', 'Courier company'],
        gw: ['api-gateway', 'API gateway'],
        exp: ['experience-api', 'exp-courier-api'],
        prc: ['process-api', 'prc-delivery-api'],
        sys: ['system-api', 'sys-orders-api'],
      },
      ['par -> gw', 'gw -> exp', 'exp -> prc', 'prc -> sys'],
    ),
  },
  description: `
A retailer uses an outside courier. The courier wants to send delivery updates straight into the retailer's order records.

The courier is a **partner**, an outside company that calls your APIs. Its calls arrive from the internet, so the retailer wants one checkpoint at the edge: an **API gateway**, which applies rules to each request.

Behind the gateway, the update passes through three API layers: an **Experience API** shaped for the courier, a **Process API** with the business rules, and a **System API** that talks to the order system.

**Questions:**
- Draw the path of one delivery update.
- Why does the partner reach only the gateway?
`,
  answerTemplate: `## Design

## Why only the gateway
`,
  keyPoints: [
    'A partner is outside your company, so its traffic is treated as untrusted until checked.',
    'The gateway is the one entry point, so there is one place to control and watch partner traffic.',
    'The partner gets its own Experience API, and it never sees Process or System APIs.',
  ],
  solution: `
**Design.**
\`\`\`
 Courier company ─► API gateway ─► exp-courier-api ─► prc-delivery-api ─► sys-orders-api
\`\`\`

**Why only the gateway.** Traffic from outside the company is checked at one entry point. The retailer can see who is calling and turn off one partner without touching the APIs. The inner APIs stay hidden, so the team can change them without telling the courier. The courier depends on \`exp-courier-api\` alone.
`,
  followUps: [
    {
      q: 'How does the gateway know which partner is calling?',
      a: 'One common way is the Client ID Enforcement policy. Each partner has a client application with its own client ID and secret, and it sends them with each request.',
    },
    {
      q: 'Can one partner get a higher request limit than another?',
      a: 'Yes. With SLA tiers, each client application is placed on a tier, and the Rate Limiting: SLA-Based policy applies the limit of that tier.',
    },
  ],
}
