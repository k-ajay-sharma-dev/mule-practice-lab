import { diagram } from '../../arch/dsl.js'

const cloudA = { type: 'external-api', label: 'Vendor A' }
const cloudB = { type: 'external-api', label: 'Vendor B' }
const prices = { name: 'price changes', from: 'erp', rps: 5, spikes: [{ at: 5, forMin: 10, rps: 100 }], to: [cloudA, cloudB, 'saas'], kind: 'write' }

export default {
  id: 'uc-132',
  category: 'use-cases',
  title: 'Electronic Shelf Labels: One Price Change Out to Two Label Vendors and the Online Store, and a Slow Vendor Holds Up Nobody',
  level: 'INTERMEDIATE',
  tags: ['pub-sub', 'topic', 'dlq', 'fan-out', 'retail', 'pricing'],
  estMinutes: 30,
  diagram: {
    task: 'draw the price path: the ERP calls a price changes Process API, which publishes each change to a topic with a dead-letter queue. Three subscribers take their own copy: one for each label vendor\'s cloud and one for the online store, each through its own System API.',
    checks: [
      { label: 'The ERP sends price changes to a Process API', rule: { type: 'edge', from: 'erp', to: 'process-api' } },
      { label: 'Each change is published to a topic', rule: { type: 'edge', from: 'process-api', to: 'topic', kind: 'async' } },
      { label: 'The topic has three subscribers, so each target gets its own copy', rule: { type: 'each', of: 'topic', edgeTo: 'process-api', count: 3 } },
      { label: 'Both label clouds and the online store are reached from the topic', rule: { type: 'path', from: 'topic', via: 'system-api', to: ['external-api', 'saas'], min: 3 } },
      { label: 'The ERP never waits on a label cloud', rule: { type: 'no-path', from: 'erp', to: 'external-api', kind: 'sync' } },
      { label: 'The topic has a dead-letter queue', rule: { type: 'each', of: 'topic', edgeTo: 'dlq' } },
      { label: 'Every line to or from the topic is an async message', rule: { type: 'lines', touching: ['topic', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        erp: ['erp', 'ERP (pricing)'],
        pub: ['process-api', 'prc-price-changes', { vCores: '0.5' }],
        t: ['topic', 'price-changes', { maxRedelivery: 60 }],
        dlq: ['dlq', 'price-changes DLQ'],
        subA: ['process-api', 'prc-labels-vendor-a'],
        subB: ['process-api', 'prc-labels-vendor-b'],
        subW: ['process-api', 'prc-online-prices'],
        sysA: ['system-api', 'sys-label-cloud-a'],
        sysB: ['system-api', 'sys-label-cloud-b'],
        sysW: ['system-api', 'sys-online-store'],
        a: ['external-api', 'Vendor A label cloud (120 stores)'],
        b: ['external-api', 'Vendor B label cloud (60 stores)'],
        web: ['saas', 'Online store'],
      },
      ['erp -> pub', 'pub ~> t', 't ~> dlq', 't ~> subA', 't ~> subB', 't ~> subW', 'subA -> sysA', 'subB -> sysB', 'subW -> sysW', 'sysA -> a', 'sysB -> b', 'sysW -> web'],
    ),
    simulation: {
      systems: [
        { match: cloudA, latencyMs: 200, maxRps: 120 },
        { match: cloudB, latencyMs: 400, maxRps: 30 },
        { match: 'saas', latencyMs: 150, maxRps: 200 },
      ],
      tests: [
        {
          name: 'The 06:00 price run',
          about: 'Head office releases 60,000 price changes in 10 minutes. Vendor A and the online store keep up. Vendor B takes about 40 minutes, and its backlog delays nobody else. Every change arrives.',
          traffic: [prices],
          durationMin: 90,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: cloudA, min: 0.99 }, { to: cloudB, min: 0.99 }, { to: 'saas', min: 0.99 }], lost: { max: 0 }, backlog: [{ queue: 'topic', maxEnd: 0 }] },
        },
        {
          name: 'Vendor A is down for 30 minutes',
          about: 'Vendor A\'s cloud has an outage during the price run. Vendor B and the online store are not affected. Vendor A\'s copies wait and arrive when it is back, and none goes to the dead-letter queue.',
          traffic: [prices],
          incidents: [{ down: cloudA, at: 5, forMin: 30 }],
          durationMin: 120,
          expect: { delivered: [{ to: cloudA, min: 0.99 }, { to: cloudB, min: 0.99 }, { to: 'saas', min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'Products with no label',
          about: 'One change in 100 is for a product that has no shelf label in some stores, and the vendors refuse it every time. Those copies move to the dead-letter queue, and the rest arrive.',
          traffic: [{ ...prices, poison: 0.01 }],
          durationMin: 150,
          expect: { delivered: [{ to: cloudA, min: 0.98 }, { to: 'saas', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A supermarket chain has replaced paper shelf tags with **electronic shelf labels**. Its 180 stores use two label vendors: **Vendor A** in 120 stores and **Vendor B** in 60. Each vendor has a cloud API that pushes prices to the labels in its stores. The **online store** must show the same prices.

Prices are set in the **ERP**. Today a script calls Vendor A, then Vendor B, then the online store, for each change. Vendor B's API is slow and allows about **30 calls a second**. On a big price day the script ran four hours behind, so Vendor A's stores and the website showed old prices all morning, and the tills charged the new ones.

**Numbers**
- Most of the day about 5 price changes a second.
- At 06:00 head office releases a promotion: about **100 changes a second for 10 minutes**.
- Vendor A takes about 120 calls a second, the online store about 200.
- About 1 change in 100 is for a product that has no label in some stores, and the vendors refuse it every time.

**Questions:**
- Draw a design where each target gets every change at its own pace.
- What happens to Vendor A's stores when Vendor B is slow?
- What happens to changes during a vendor outage, and to a change a vendor refuses?
`,
  answerTemplate: `## Design

## Each target at its own pace

## Outages and refused changes

## Prices at the till
`,
  keyPoints: [
    'Publish each price change once, to a topic. Each target has its own subscriber, which takes its own copy.',
    'A slow subscriber falls behind on its own. Vendor A and the online store are not held up by Vendor B.',
    'Each vendor is reached through its own System API, which holds that vendor\'s login, limits and message format.',
    'During an outage a subscriber\'s copies wait and are tried again. The redelivery limit must cover a long outage.',
    'A change refused every time moves to the dead-letter queue for the pricing team, instead of being tried for ever.',
    'The ERP gets its answer once the change is on the topic. It never waits on a label vendor.',
  ],
  solution: `
**Design**
\`\`\`
ERP ─► prc-price-changes ~► price-changes (topic) ~► prc-labels-vendor-a ─► sys-label-cloud-a ─► Vendor A
                                                  ~► prc-labels-vendor-b ─► sys-label-cloud-b ─► Vendor B
                                                  ~► prc-online-prices ───► sys-online-store ──► Online store
                                                  ~► DLQ
\`\`\`

**Each target at its own pace.** On Anypoint MQ this is an exchange bound to three queues, one per subscriber. Vendor A and the online store finish the 06:00 run in about 10 minutes. Vendor B takes about 40 minutes because it allows 30 calls a second. Its queue grows and shrinks, and nothing else notices.

**Outages and refused changes.** In this model a failed delivery is tried again about once a minute, so a redelivery limit of 60 keeps a change for about an hour of outage before it is given up. A change refused for a missing label goes to the dead-letter queue after that, and the pricing team fixes the label list.

**Sizing.** The publisher takes 100 changes a second at 06:00, more than the smallest size takes in this model, so it gets half a vCore.

**Prices at the till.** The tills read prices from the ERP, so they change first. For a promotion, release the prices to the labels ahead of time with a start time, if the vendors support it, so the shelf and the till change together.
`,
  followUps: [
    {
      q: 'Two changes for the same product arrive close together. Can the older one win?',
      a: 'Yes, if a subscriber retries the first after the second went through. Send the price\'s effective time with each change, and have each subscriber skip a change older than the one the vendor already has.',
    },
    {
      q: 'A third vendor joins next year. What changes?',
      a: 'One more subscriber and one more System API. The ERP, the publisher and the other subscribers stay as they are.',
    },
  ],
}
