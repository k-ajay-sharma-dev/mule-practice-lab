import { diagram } from '../../arch/dsl.js'

const web = { name: 'web stock checks', from: 'web-app', rps: 80, to: 'wms' }
const kiosks = { name: 'kiosk stock checks', from: 'device', rps: 20, to: 'wms' }
const kioskApi = { type: 'experience-api', label: 'kiosk' }

export default {
  id: 'ar-164',
  category: 'architecture',
  title: 'In-Store Kiosks Stuck in a Retry Loop Take the Website Down With Them: a Rate Limit on the Kiosk Experience API Keeps the Shared Layers Free',
  level: 'INTERMEDIATE',
  tags: ['rate-limiting', 'experience-api', 'noisy-neighbour', 'shared-process-api', 'retail'],
  estMinutes: 30,
  diagram: {
    task: 'draw the website and the in-store kiosks, each calling its own Experience API. Both Experience APIs call one stock Process API, which calls the warehouse system through a System API.',
    checks: [
      { label: 'The website calls its own Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The kiosks call their own Experience API', rule: { type: 'edge', from: 'device', to: kioskApi } },
      { label: 'Each channel has its own Experience API', rule: { type: 'each', of: 'experience-api', edgeFrom: ['web-app', 'device'], max: 1 } },
      { label: 'Both Experience APIs share one stock Process API', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'The warehouse system is reached only through a System API', rule: { type: 'only-via', target: 'wms', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        kiosk: ['device', 'In-store kiosks'],
        expW: ['experience-api', 'exp-web-shop', { vCores: '0.2' }],
        expK: ['experience-api', 'exp-store-kiosk', { replicas: 2, vCores: '0.2', rateLimit: 30 }],
        prc: ['process-api', 'prc-stock', { vCores: '0.5' }],
        sys: ['system-api', 'sys-warehouse', { vCores: '0.5' }],
        wms: ['wms', 'Warehouse system'],
      },
      ['web -> expW', 'kiosk -> expK', 'expW -> prc', 'expK -> prc', 'prc -> sys', 'sys -> wms'],
    ),
    simulation: {
      systems: [{ match: 'wms', latencyMs: 80, maxRps: 200 }],
      tests: [
        {
          name: 'A normal Saturday',
          about: 'The website checks stock 80 times a second and the kiosks 20. Everything is answered quickly and nothing is refused.',
          traffic: [web, kiosks],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400, maxLimited: 0 }] },
        },
        {
          name: 'A kiosk release goes wrong',
          about: 'A new kiosk version retries every failed call in a tight loop, and the kiosks send 400 calls a second for 10 minutes. The website is not slowed down, and the kiosks get 429 for what is over their share.',
          traffic: [web, { ...kiosks, spikes: [{ at: 5, forMin: 10, rps: 400 }] }],
          durationMin: 20,
          expect: { answers: [{ flow: 'web stock checks', minSuccess: 0.99, maxMs: 400 }, { flow: 'kiosk stock checks', minLimited: 0.3 }], peakRps: [{ node: 'wms', max: 200 }] },
        },
      ],
    },
  },
  description: `
A sports retailer shows stock levels in two places: the **website** and **in-store kiosks** where customers check if a size is in the warehouse. Both channels have their own Experience API, and both use one stock **Process API** that asks the **warehouse system** through a System API.

Last month a new kiosk version had a bug: when a call failed, it retried at once, in a loop. Within minutes the kiosks were sending 400 calls a second. The shared stock Process API and the warehouse system were swamped, and the **website** could not show stock for half an hour, on a Saturday.

**Numbers**
- The website checks stock about **80 times a second** at peak. The kiosks about **20**.
- The warehouse system answers in about 80 ms and takes up to 200 calls a second.
- The kiosks have never needed more than 30 calls a second, even in the January sale.

**Questions:**
- Draw the design.
- Where should a limit go so that one channel cannot use up the shared layers?
- What should a kiosk see when it is over its limit?
- What else would you change after the incident?
`,
  answerTemplate: `## Design

## Where the limit goes

## What the kiosk sees

## After the incident
`,
  keyPoints: [
    'Shared layers are shared capacity. One channel that misbehaves can use all of it, and every other channel suffers. That is the noisy neighbour problem.',
    'Put a rate limit on the kiosk Experience API, at the edge of that channel. What is over the limit is refused there and never reaches the Process API or the warehouse.',
    'Set the limit from what the channel really needs plus room, here 30 a second, not from what the shared layers can take.',
    'Over the limit the kiosk gets 429 Too Many Requests. A well-behaved client backs off; this one will not until it is fixed, but now only the kiosks are hurt.',
    'A limit is a guard, not the fix. The kiosk retry loop needs backoff, and a release needs a test of how the client behaves when calls fail.',
  ],
  solution: `
**Design**
\`\`\`
Website ───────► exp-web-shop ─────┐
                                   ├─► prc-stock ─► sys-warehouse ─► Warehouse system
In-store kiosks ► exp-store-kiosk ─┘
                  (rate limit 30/s)
\`\`\`

**Where the limit goes.** On \`exp-store-kiosk\`, as an API Manager rate limiting policy. The kiosks are one client of that API, so the policy can limit the whole channel. A limit on \`prc-stock\` would not help: it would refuse website calls as readily as kiosk calls.

**What the kiosk sees.** 429 with a Retry-After header. The kiosk screen should say "stock check unavailable, please ask a colleague", not spin.

**After the incident.** The kiosk app gets exponential backoff with jitter on retries. An alert fires when any channel\'s rate of 429s rises. Two replicas of the kiosk API keep the stores going through a zone outage.

**Sizing.** The website API needs 0.2 vCore for 80 a second. The shared Process and System APIs get half a vCore each, enough for both channels at their limits with room to spare.
`,
  followUps: [
    {
      q: 'The website also has a mobile app now. Does it need a limit?',
      a: 'Every channel should have one, set from its own needs. A limit per channel makes the share of the shared layers explicit, and a bug in one channel then stays in that channel.',
    },
    {
      q: 'Why not give the kiosks their own Process API instead?',
      a: 'It would isolate them, at the cost of a second copy to run and change. The warehouse system behind it is still shared, so a limit is needed anyway.',
    },
  ],
}
