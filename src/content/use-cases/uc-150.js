import { diagram } from '../../arch/dsl.js'

const slots = { type: 'wms', label: 'slot' }
const browsing = { name: 'slot views', from: ['web-app', 'mobile-app'], rps: 200, to: slots, spikes: [{ at: 10, forMin: 10, rps: 1200 }] }
const booking = { name: 'slot bookings', from: ['web-app', 'mobile-app'], rps: 10, to: slots, kind: 'write', spikes: [{ at: 10, forMin: 10, rps: 60 }] }
const views = { type: 'experience-api', label: 'slot' }

export default {
  id: 'uc-150',
  category: 'use-cases',
  title: 'Christmas Delivery Slots Open at 08:00: Serve the Rush of Lookers From a Short Cache, Let Every Booking Reach the Slot System, and Keep Both Going Through a Zone Outage',
  level: 'EXPERT',
  tags: ['retail', 'grocery', 'cache', 'spike', 'read-write-split', 'availability', 'sizing'],
  estMinutes: 55,
  diagram: {
    task: 'draw the website and the mobile app calling one delivery slots Experience API. It reads slot availability from a cache, and otherwise from the delivery slot system through a System API. Bookings go from the Experience API through a slot booking Process API and the same System API.',
    checks: [
      { label: 'The website calls the slots Experience API', rule: { type: 'edge', from: 'web-app', to: views } },
      { label: 'The mobile app calls the slots Experience API', rule: { type: 'edge', from: 'mobile-app', to: views } },
      { label: 'The Experience API reads a cache', rule: { type: 'edge', from: views, to: 'cache' } },
      { label: 'Bookings go through a Process API', rule: { type: 'path', from: views, via: 'process-api', to: slots } },
      { label: 'The slot system is reached only through a System API', rule: { type: 'only-via', target: slots, from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Grocery website'],
        app: ['mobile-app', 'Grocery app'],
        exp: ['experience-api', 'exp-delivery-slots', { replicas: 2, vCores: '4', timeoutMs: 2000, onFailure: 'partial answer' }],
        c: ['cache', 'Slot availability cache', { ttlSec: 15 }],
        prc: ['process-api', 'prc-slot-booking', { replicas: 2, vCores: '0.2' }],
        sys: ['system-api', 'sys-delivery-slots', { replicas: 2, vCores: '0.5' }],
        wms: ['wms', 'Delivery slot system'],
      },
      ['web -> exp', 'app -> exp', 'exp -> c', 'exp -> sys', 'exp -> prc', 'prc -> sys', 'sys -> wms'],
    ),
    simulation: {
      systems: [{ match: slots, latencyMs: 300, maxRps: 150 }],
      cache: { hitRatio: 0.95, atTtlSec: 15 },
      tests: [
        {
          name: 'Christmas slots open at 08:00',
          about: 'Lookers jump from 200 to 1,200 a second and bookings from 10 to 60 a second for ten minutes. Pages and bookings are answered, and the slot system stays within 150 calls a second.',
          traffic: [browsing, booking],
          durationMin: 30,
          expect: { answers: [{ flow: 'slot views', minSuccess: 0.99, maxMs: 500 }, { flow: 'slot bookings', minSuccess: 0.99, maxMs: 1000 }], peakRps: [{ node: slots, max: 150 }] },
        },
        {
          name: 'A zone goes down in the rush',
          about: 'An availability zone fails at 08:02. The replicas in the other zone take all the lookers and all the bookings.',
          traffic: [browsing, booking],
          incidents: [{ zone: true, at: 11, forMin: 10 }],
          durationMin: 30,
          expect: { answers: [{ flow: 'slot views', minSuccess: 0.99 }, { flow: 'slot bookings', minSuccess: 0.99 }] },
        },
        {
          name: 'The slot system slows to 12 seconds',
          about: 'The slot system answers in 12 seconds for 10 minutes. Every page still shows slots: from the cache, or marked as possibly changed when the slot system does not answer in time.',
          traffic: [browsing],
          incidents: [{ slow: slots, latencyMs: 12000, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'slot views', minSuccess: 0.99, maxMs: 2500 }] },
        },
      ],
    },
  },
  description: `
A grocery chain opens its **Christmas delivery slots** at 08:00 on 1 December. Customers know, and they wait with the **grocery website** and the **grocery app** open, refreshing. Last year the **delivery slot system** was swamped by people looking, and the people trying to book could not get through. The slots that should have sold in an hour took a day.

Slots are held in the **delivery slot system**, which takes about **150 calls a second**.

**Numbers**
- Lookers: about **200 slot views a second** before 08:00, about **1,200 a second** for ten minutes after.
- Bookings: about **10 a second**, up to **60 a second** in the rush.
- The slot system answers in about 300 ms and takes about **150 calls a second**. On a bad day it has slowed to 12 seconds.
- About 95% of views are for the same few days and stores, and a view up to **15 seconds** old is acceptable. A booking must always check the slot system itself.
- A view must be answered within **500 ms** and a booking within **1 second**. When the slot system is slow, a view must still show slots within **2.5 seconds**.
- If one availability zone fails during the rush, the other zone must take every view and booking.

**Questions:**
- Draw the design.
- How do 1,200 views a second fit into a slot system that takes 150?
- Why must bookings never be served from the cache?
- How big must the Experience API be, and why two replicas?
- What do customers see when the slot system slows down?
`,
  answerTemplate: `## Design

## Views and bookings

## Sizing for the rush

## A slow slot system
`,
  keyPoints: [
    'Split the reads from the writes. Views are many and may be a little old; bookings are few and must be checked against the real slots.',
    'A 15 second cache answers about 95 in 100 views. 1,200 views a second become about 60 calls to the slot system, which leaves room for the bookings.',
    'Bookings go through a Process API to the slot system every time, which takes the slot or says it has gone.',
    'Size the Experience API so that one zone alone takes the rush: about 1,260 calls a second needs several vCores per replica in this model.',
    'A short timeout and a partial answer let a page show cached slots when the slot system is slow, instead of spinning.',
  ],
  solution: `
**Design**
\`\`\`
Grocery website ─┐
                 ├─► exp-delivery-slots ─► Slot availability cache (15 s)
Grocery app ─────┘          │      └────────────────────────► sys-delivery-slots ─► Delivery slot system
                            └─► prc-slot-booking ─────────────┘
\`\`\`

**Views and bookings.** A view reads the cache by store and day. A miss goes to the slot system through \`sys-delivery-slots\` and fills the cache for 15 seconds. A booking goes through \`prc-slot-booking\`, which asks the slot system to take the slot; if it has gone, the customer is offered the next free one.

**Sizing for the rush.** In this model one vCore serves about 500 requests a second. One zone must take about 1,260 a second at the peak, and a box above 70% busy slows down, so the Experience API runs on two replicas of 4 vCores. The System API sees about 120 a second and gets half a vCore on each of two replicas.

**A slow slot system.** The Experience API waits at most 2 seconds for the slot system. On a timeout a view shows what the cache has, marked "availability may have changed". Bookings may then fail or be slow; the page says so plainly.

**After the rush.** The big Experience API is only needed for the morning. Scale it up the day before and back down the day after.
`,
  followUps: [
    {
      q: 'Could a virtual waiting room replace part of this?',
      a: 'Yes. A queue page in front of the site lets customers in at a pace the systems can take, and is fairer than a refresh race. It does not remove the need for the cache once they are in.',
    },
    {
      q: 'Two customers book the last slot at once. Who gets it?',
      a: 'The slot system decides, with one conditional update. The Process API turns the "already taken" answer into a friendly message with the next slot, instead of an error.',
    },
  ],
}
