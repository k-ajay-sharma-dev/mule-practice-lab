import { diagram } from '../../arch/dsl.js'

const members = { type: 'saas', label: 'membership' }
const entry = { name: 'gate checks', from: 'device', rps: 80, to: members }

export default {
  id: 'uc-136',
  category: 'use-cases',
  title: 'Gym Turnstiles Check Memberships at the Door: One Experience API, a Cache for the 06:00 Rush, and a Platform That Takes 50 Calls a Second',
  level: 'BEGINNER',
  tags: ['iot', 'cache', 'experience-api', 'system-api', 'saas', 'leisure'],
  estMinutes: 20,
  diagram: {
    task: 'draw the turnstiles calling an Experience API, which reads a membership status cache first and otherwise asks the membership platform through a System API.',
    checks: [
      { label: 'The turnstiles call an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'The turnstiles reach the membership platform through a System API', rule: { type: 'path', from: 'device', via: 'system-api', to: members } },
      { label: 'The Experience API reads a cache', rule: { type: 'edge', from: 'experience-api', to: 'cache' } },
      { label: 'The membership platform is reached only through a System API', rule: { type: 'only-via', target: members, from: 'system-api' } },
    ],
    reference: diagram(
      {
        gate: ['device', 'Gym turnstiles (40 gyms)'],
        exp: ['experience-api', 'exp-gym-entry', { vCores: '0.5' }],
        c: ['cache', 'Membership status cache', { ttlSec: 300 }],
        sys: ['system-api', 'sys-memberships'],
        mem: ['saas', 'Membership platform'],
      },
      ['gate -> exp', 'exp -> c', 'exp -> sys', 'sys -> mem'],
    ),
    simulation: {
      systems: [{ match: 'saas', latencyMs: 250, maxRps: 50 }],
      cache: { hitRatio: 0.9, atTtlSec: 300 },
      tests: [
        {
          name: 'The 06:00 rush',
          about: 'Members arrive before work and the turnstiles ask 80 times a second. Each check is answered quickly, and the membership platform stays under its limit.',
          traffic: [entry],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 200 }], peakRps: [{ node: 'saas', max: 50 }] },
        },
        {
          name: 'The membership platform is down for 10 minutes',
          about: 'The platform has an outage. Members whose status is in the cache still get in, so most of the queue at the door keeps moving.',
          traffic: [{ ...entry, rps: 40 }],
          incidents: [{ down: 'saas', at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.9 }] },
        },
      ],
    },
  },
  description: `
A chain of **40 gyms** lets members in with a card or a phone at **turnstiles**. Each turnstile asks Mule whether the member may come in. Memberships are kept in a **membership platform**, a SaaS product the chain pays for.

Today each turnstile calls the platform directly. At 06:00 queues form at the doors, because the platform allows about **50 calls a second** for the whole chain and answers 429 above that.

**Numbers**
- At 06:00 the turnstiles ask about **80 times a second** across the chain.
- The platform answers in about 250 ms and takes about 50 calls a second.
- A membership changes rarely: when a member joins, pays late or cancels. Five minutes of delay is fine for the business.
- A turnstile must get its answer within **200 ms**, or the queue at the door grows.
- The platform has had outages of about 10 minutes. During one, at least 9 members in 10 should still get in.

**Questions:**
- Draw the design.
- How do 80 checks a second fit into a platform limit of 50?
- What happens at the door when the platform is down?
`,
  answerTemplate: `## Design

## The cache

## When the platform is down
`,
  keyPoints: [
    'Turnstiles call an Experience API made for them. It answers yes or no and nothing more.',
    'A System API is the only way to the membership platform. It holds the platform\'s credentials and knows its limit.',
    'A membership status changes rarely, so a cache with a 5 minute time to live answers most checks without a call to the platform.',
    'Most members visit at the same times each week, so their status is often already in the cache.',
    'During a platform outage, members whose status is cached still get in. The gym decides what the turnstile does for the rest, for example let staff check the card at the desk.',
    'Size the Experience API for the rush: 80 checks a second is more than the smallest size takes in this model.',
  ],
  solution: `
**Design**
\`\`\`
Gym turnstiles ─► exp-gym-entry ─► (Membership status cache) ─► sys-memberships ─► Membership platform
\`\`\`

**The cache.** \`exp-gym-entry\` looks up the member in the cache first. On a miss it asks \`sys-memberships\`, keeps the answer for 5 minutes and answers the turnstile. If 9 checks in 10 find the status in the cache, 80 checks a second become about 8 calls a second to the platform.

**When the platform is down.** Checks that find the member in the cache are answered as usual. The rest fail, and the turnstile shows "please see reception".

**Sizing.** 80 checks a second is more than one 0.1 vCore replica takes in this model, so \`exp-gym-entry\` gets half a vCore. The System API only sees the cache misses.
`,
  followUps: [
    {
      q: 'A member pays their overdue fee at the desk and wants to go in at once. What then?',
      a: 'The desk app tells Mule about the payment, and Mule removes that member from the cache. The next check asks the platform and gets the new status.',
    },
    {
      q: 'Should the cache also keep "no" answers?',
      a: 'Yes, for a shorter time, such as a minute. A cancelled card swiped again and again at the door would otherwise reach the platform every time.',
    },
  ],
}
