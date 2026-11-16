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
      { label: 'The gateway forwards live calls, so every call in the path is a sync call', rule: { type: 'lines', from: ['partner', 'api-gateway', 'experience-api', 'process-api'], to: ['api-gateway', 'experience-api', 'process-api', 'system-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        par: ['partner', 'Courier company'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id', rateLimit: 50 }],
        exp: ['experience-api', 'exp-courier-api', { vCores: '0.2' }],
        prc: ['process-api', 'prc-delivery-api', { vCores: '0.2' }],
        sys: ['system-api', 'sys-orders-api', { vCores: '0.2' }],
      },
      ['par -> gw', 'gw -> exp', 'exp -> prc', 'prc -> sys'],
    ),
    simulation: {
      tests: [
        {
          name: 'A caller without a client ID',
          about: 'The courier sends 20 delivery updates a second with its client ID. Someone else on the internet sends 5 a second with no credentials. The gateway refuses the unknown caller and answers the courier.',
          traffic: [
            { name: 'courier', from: 'partner', rps: 20, to: 'system-api' },
            { name: 'unknown caller', from: 'partner', rps: 5, to: 'system-api', auth: 'none' },
          ],
          expect: { answers: [{ flow: 'courier', minSuccess: 0.99 }, { flow: 'unknown caller', minRefused: 0.99 }], vCores: { max: 1 } },
        },
        {
          name: 'The courier sends a burst',
          about: 'After a sorting run the courier sends 300 updates a second for two minutes. The gateway answers 429 to what is over the agreed 50 a second, so the APIs behind it are not overloaded and nothing fails with an error.',
          traffic: [{ name: 'courier', from: 'partner', rps: 20, to: 'system-api', spikes: [{ at: 3, forMin: 2, rps: 300 }] }],
          expect: { answers: [{ maxFailed: 0.01, minLimited: 0.2 }], peakRps: [{ node: 'experience-api', max: 60 }] },
        },
      ],
    },
  },
  description: `
A retailer uses an outside courier. The courier wants to send delivery updates straight into the retailer's order records.

The courier is a **partner**, an outside company that calls your APIs. Its calls arrive from the internet, so the retailer wants one checkpoint at the edge: an **API gateway**, which applies rules to each request.

Behind the gateway, the update passes through three API layers: an **Experience API** shaped for the courier, a **Process API** with the business rules, and a **System API** that talks to the order system.

The courier sends about **20** updates a second and has its own client ID. After a sorting run it can burst to **300** a second for a couple of minutes. The retailer agreed a limit of **50** a second with the courier. Calls without a client ID must be refused. The budget for the APIs is **1 vCore**.

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
    'On the gateway, Client ID Enforcement refuses unknown callers and a rate limit of 50 a second answers 429 to a burst.',
  ],
  solution: `
**Design.**
\`\`\`
 Courier company ─► API gateway ─► exp-courier-api ─► prc-delivery-api ─► sys-orders-api
\`\`\`

**Why only the gateway.** Traffic from outside the company is checked at one entry point. The retailer can see who is calling and turn off one partner without touching the APIs. The inner APIs stay hidden, so the team can change them without telling the courier. The courier depends on \`exp-courier-api\` alone.

**Policies and sizing.** The gateway applies Client ID Enforcement, so a call without the courier's client ID is refused before it reaches any API. It also applies a rate limit of 50 a second. In a burst of 300 a second the courier gets 429 for the extra calls and sends them again later, and the APIs behind the gateway never see more than 50. Each API then needs 0.2 vCore, 0.6 vCore in all.
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
