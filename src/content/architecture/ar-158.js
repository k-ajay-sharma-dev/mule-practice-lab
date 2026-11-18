import { diagram } from '../../arch/dsl.js'

const portal = { name: 'portal', from: 'web-app', rps: 60, to: 'legacy' }
const app = { name: 'mobile app', from: 'mobile-app', rps: 140, to: 'legacy' }
const accounts = { type: 'process-api', label: 'accounts' }

export default {
  id: 'ar-158',
  category: 'architecture',
  title: 'A Cost Review Finds 16 vCores Serving 200 Requests a Second: Right-Size Four APIs and Still Survive an Availability Zone Outage',
  level: 'ADVANCED',
  tags: ['sizing', 'cost', 'cloudhub-2', 'replicas', 'availability-zones', 'banking'],
  estMinutes: 40,
  diagram: {
    task: 'draw the customer portal and the mobile app, each with its own Experience API, both calling one accounts Process API, which reads the core banking system through a System API. Then set the replicas and vCores of each API.',
    checks: [
      { label: 'The portal calls its own Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The mobile app calls its own Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'Each channel has its own Experience API', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: ['web-app', 'mobile-app'], max: 1 } },
      { label: 'Both Experience APIs call the same accounts Process API', rule: { type: 'each', of: accounts, edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Core banking is reached only through a System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Customer portal'],
        mob: ['mobile-app', 'Mobile app'],
        expW: ['experience-api', 'exp-customer-portal', { replicas: 2, vCores: '0.2' }],
        expM: ['experience-api', 'exp-mobile-app', { replicas: 2, vCores: '0.5' }],
        prc: ['process-api', 'prc-accounts', { replicas: 2, vCores: '0.5' }],
        sys: ['system-api', 'sys-core-banking', { replicas: 2, vCores: '0.5' }],
        core: ['legacy', 'Core banking'],
      },
      ['web -> expW', 'mob -> expM', 'expW -> prc', 'expM -> prc', 'prc -> sys', 'sys -> core'],
    ),
    simulation: {
      systems: [{ match: 'legacy', latencyMs: 80, maxRps: 600 }],
      tests: [
        {
          name: 'Monday 09:00',
          about: 'The portal sends 60 requests a second and the app 140. Answers are fast, and the four APIs use no more than 4 vCores between them.',
          traffic: [portal, app],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], vCores: { max: 4 } },
        },
        {
          name: 'One availability zone goes down',
          about: 'One zone of the region fails for 20 minutes at the Monday peak, taking one replica of each API with it. The other replicas carry the load.',
          traffic: [portal, app],
          incidents: [{ zone: 'a', at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 600 }] },
        },
      ],
    },
  },
  description: `
A building society runs four Mule APIs on **CloudHub 2.0** for its **customer portal** and **mobile app**: an Experience API for each channel, an accounts Process API and a System API in front of **core banking**.

When the apps went live, the team gave each API **4 replicas of 1 vCore**, to be safe. A cost review now shows **16 vCores** in production for about 200 requests a second, and finance asks for a plan that uses **at most 4**.

The operations lead agrees, on one condition: the apps must keep working if **one availability zone** of the region fails, which happened once last year.

**Numbers**
- At the Monday 09:00 peak the portal makes about **60 requests a second** and the app about **140**.
- Core banking answers in about 80 ms and takes up to 600 requests a second.
- In this model one vCore serves about 500 simple requests a second, and CloudHub 2.0 spreads the replicas of an app over the zones of its region.

**Questions:**
- Draw the design and give each API its replicas and vCores.
- How many vCores does your plan use?
- What happens to each API when a zone fails?
- What would you watch after the change, and when would you size up again?
`,
  answerTemplate: `## Design

## Sizing each API

## When a zone fails

## Watching after the change
`,
  keyPoints: [
    'Size from the load each API carries: the portal API 60 requests a second, the app API 140, and the Process and System APIs 200 each.',
    'One replica is a single point of failure. Two replicas spread over two zones keep an API up when a zone fails.',
    'With two replicas, each one must carry the whole load on its own during a zone outage, so size each replica for the full peak, not half of it.',
    'Smaller replicas in pairs cost less than big ones in fours: 2 x 0.5 vCore carries 200 requests a second here, even on one replica.',
    'Keep some headroom. A box that is very busy gets slower, so a plan sized to the last request fails the latency target first.',
    'After the change, watch CPU, memory and response times at each peak, and size up before the busiest days of the year, not after.',
  ],
  solution: `
**Design**
\`\`\`
Customer portal ─► exp-customer-portal (2 × 0.2) ─┐
                                                  ├─► prc-accounts (2 × 0.5) ─► sys-core-banking (2 × 0.5) ─► Core banking
Mobile app ──────► exp-mobile-app (2 × 0.5) ──────┘
\`\`\`

**Sizing each API.** In this model 0.2 vCore serves about 100 requests a second and 0.5 vCore about 250.
- \`exp-customer-portal\` carries 60 a second: one 0.2 vCore replica is enough, and a second one is for the zone.
- \`exp-mobile-app\` carries 140: one 0.2 replica is not enough on its own, so 0.5.
- \`prc-accounts\` and \`sys-core-banking\` carry 200 each: 0.5 vCore each.

That is 0.4 + 1 + 1 + 1 = **3.4 vCores**, down from 16.

**When a zone fails.** Each API loses one replica and the other carries the whole load. The Process and System APIs then run at about 80% busy, which is slower but within the target.

**Watching after the change.** Compare the response times at the next Monday peaks with the old ones, and set alerts on CPU and memory per replica. Memory matters as much as CPU: a 0.2 vCore replica also has less memory, so test the largest responses before the change.
`,
  followUps: [
    {
      q: 'Why not 1 replica of 1 vCore for each API? That is 4 vCores too.',
      a: 'It has the same cost but no zone to spare: one failed zone can take an API down completely. Two smaller replicas give the same capacity and survive a zone.',
    },
    {
      q: 'What is a real load test for this change?',
      a: 'Run the Monday peak against a test copy with the new sizes, then stop one replica of each API in the middle and check the latency and errors while one replica carries the load.',
    },
  ],
}
