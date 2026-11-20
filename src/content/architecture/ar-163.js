import { diagram } from '../../arch/dsl.js'

const carrier = { type: 'external-api', label: 'carrier' }
const history = { name: 'order history', from: 'mobile-app', rps: 60, to: ['erp', carrier] }
const orders = { type: 'process-api', label: ['order-history', 'order history'] }

export default {
  id: 'ar-163',
  category: 'architecture',
  title: 'The Order History Screen Goes Blank When the Carrier Is Down: Answer With the Orders and Leave Out the Tracking, Within a Second and a Half',
  level: 'INTERMEDIATE',
  tags: ['graceful-degradation', 'partial-response', 'timeouts', 'circuit-breaker', 'process-api', 'retail'],
  estMinutes: 30,
  diagram: {
    task: 'draw the shopping app calling an Experience API, which calls an order history Process API. The Process API gets the orders from the order management system through one System API and the tracking from the carrier through another. Draw the order management system as an ERP box and the carrier as a Third-party API box with carrier in its name. Set the Process API\'s timeout, circuit breaker and what it does when a call fails.',
    checks: [
      { label: 'The app calls an Experience API', rule: { type: 'edge', from: 'mobile-app', to: 'experience-api' } },
      { label: 'The Experience API calls the order history Process API', rule: { type: 'edge', from: 'experience-api', to: orders } },
      { label: 'The order history Process API calls two System APIs', rule: { type: 'each', of: orders, edgeTo: 'system-api', count: 2 } },
      { label: 'The orders come through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The carrier is reached only through a System API', rule: { type: 'only-via', target: carrier, from: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Shopping app'],
        exp: ['experience-api', 'exp-shopping-app', { vCores: '0.2' }],
        prc: ['process-api', 'prc-order-history', { vCores: '0.2', timeoutMs: 1000, circuitBreaker: 'on', onFailure: 'partial answer' }],
        sysO: ['system-api', 'sys-orders', { vCores: '0.2' }],
        sysT: ['system-api', 'sys-carrier-tracking', { vCores: '0.2' }],
        oms: ['erp', 'Order management system'],
        car: ['external-api', 'Carrier tracking API'],
      },
      ['app -> exp', 'exp -> prc', 'prc -> sysO', 'prc -> sysT', 'sysO -> oms', 'sysT -> car'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 120 },
        { match: carrier, latencyMs: 250 },
      ],
      tests: [
        {
          name: 'A normal evening',
          about: 'Customers open their order history 60 times a second. Each screen shows the orders and their tracking, well within a second.',
          traffic: [history],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 800, maxDegraded: 0.01 }] },
        },
        {
          name: 'The carrier hangs',
          about: 'The carrier\'s API stops answering for 15 minutes. The screen still shows the orders, without tracking, in under a second and a half.',
          traffic: [history],
          incidents: [{ hang: carrier, at: 3, forMin: 15 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1500, minDegraded: 0.7 }] },
        },
        {
          name: 'The carrier fails one call in three',
          about: 'The carrier answers errors to a third of the calls. Those screens show the orders with no tracking, and none of them fails.',
          traffic: [history],
          incidents: [{ errors: carrier, rate: 0.33, at: 0, forMin: 20 }],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
An electronics retailer's **shopping app** has an order history screen. For each order it shows what was bought and, for orders on their way, the **tracking** from the carrier.

The orders come from the **order management system**. The tracking comes from the **carrier tracking API**, run by the parcel carrier. Today the Process API behind the screen calls both and fails if either fails. When the carrier's API hangs, the screen spins for ten seconds, then shows an error, and customers phone to ask where their orders went.

**Numbers**
- About **60 screens a second** in the evening.
- The order management system answers in about 120 ms. The carrier in about 250 ms.
- The carrier's API has had spells of hanging and spells of failing one call in three.
- The product owner: "Show the orders within a second and a half, always. Tracking is nice to have."

**Questions:**
- Draw the design.
- What should the screen show when the carrier is slow or failing, and how does the Process API do that?
- Which timeout, and why?
- What does the app need to know about a partial answer?
`,
  answerTemplate: `## Design

## Orders first, tracking if it comes

## The timeout and the breaker

## Telling the app
`,
  keyPoints: [
    'Split what the screen must have from what is nice to have. The orders are the answer; tracking is extra.',
    'The Process API answers with the orders even when the tracking call fails, and marks the tracking as missing. That is graceful degradation.',
    'A short timeout on the tracking call keeps a hanging carrier from holding every request. Ten seconds by default is far beyond the screen\'s budget.',
    'A circuit breaker stops calling the carrier at all while most calls fail, so answers come back at once instead of after each timeout.',
    'Say in the answer that tracking is missing, such as trackingAvailable: false, so the app shows "tracking not available right now" instead of nothing.',
  ],
  solution: `
**Design**
\`\`\`
Shopping app ─► exp-shopping-app ─► prc-order-history ─► sys-orders ─► Order management system
                                                    └─► sys-carrier-tracking ─► Carrier tracking API
\`\`\`

**Orders first, tracking if it comes.** \`prc-order-history\` gets the orders, then the tracking for those still on their way. In Mule the tracking call sits in a Try with On Error Continue, which leaves the tracking out and sets \`trackingAvailable: false\`. A failed orders call still fails the request: without orders there is nothing to show.

**The timeout and the breaker.** The tracking call has a 1 second timeout, which leaves room for the orders inside the 1.5 second budget. With a circuit breaker on the carrier, after a run of failures calls fail at once for a while, then a few are let through to see if the carrier is back.

**Sizing.** 60 screens a second, each holding a thread while it waits, is more than the smallest size in this model, so each API gets 0.2 vCore.
`,
  followUps: [
    {
      q: 'Could the tracking be cached instead?',
      a: 'Yes, for a few minutes per parcel. A cache cuts the calls to the carrier and gives an older status during an outage, which is often better than none. It does not remove the need for the timeout on a miss.',
    },
    {
      q: 'Should the calls to the orders and the tracking run in parallel?',
      a: 'The tracking needs the parcel numbers from the orders, so they run one after the other. Calls to the carrier for several parcels can run in parallel, for example with a Parallel For Each.',
    },
  ],
}
