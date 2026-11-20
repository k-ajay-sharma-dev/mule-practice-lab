import { diagram } from '../../arch/dsl.js'

const tracking = { type: 'tms', label: 'tracking' }
const billing = { type: 'erp', label: 'billing' }
const scans = { name: 'sorter scans', from: 'device', rps: 300, to: [tracking, billing, 'data-warehouse'], kind: 'write', spikes: [{ at: 10, forMin: 10, rps: 900 }] }

export default {
  id: 'uc-156',
  category: 'use-cases',
  title: 'Parcel Hub Sorter Scans to Tracking, Billing and Analytics: One Topic, Three Paces, a Zone Outage at the Evening Peak, and Scans That Never Get Lost',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'topic', 'fan-out', 'sizing', 'availability', 'dlq', 'logistics'],
  estMinutes: 55,
  diagram: {
    task: 'draw the sorter scanners calling a sort events Experience API, which publishes each scan to a topic with a dead-letter queue. Three Process APIs subscribe: tracking (to the tracking system through a System API), billing (to the billing ERP through a System API) and analytics (to the data warehouse).',
    checks: [
      { label: 'The scanners call an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Scans are published once, to a topic', rule: { type: 'edge', from: 'experience-api', to: 'topic', kind: 'async' } },
      { label: 'The topic has a dead-letter queue', rule: { type: 'each', of: 'topic', edgeTo: 'dlq' } },
      { label: 'Each scan reaches tracking, billing and analytics through the topic', rule: { type: 'path', from: 'topic', to: [tracking.type, billing.type, 'data-warehouse'], min: 3 } },
      { label: 'The scanners never wait on tracking, billing or analytics', rule: { type: 'no-path', from: 'device', to: [tracking.type, billing.type, 'data-warehouse'], kind: 'sync' } },
      { label: 'The tracking system and the billing ERP are reached only through System APIs', rule: { type: 'only-via', target: [tracking.type, billing.type], from: 'system-api' } },
    ],
    reference: diagram(
      {
        scn: ['device', 'Sorter scanners'],
        exp: ['experience-api', 'exp-sort-events', { replicas: 2, vCores: '4' }],
        t: ['topic', 'parcel-scans', { maxRedelivery: 90 }],
        dlq: ['dlq', 'parcel-scans DLQ'],
        pT: ['process-api', 'prc-parcel-tracking', { replicas: 2, vCores: '1' }],
        sT: ['system-api', 'sys-tracking', { replicas: 2, vCores: '1' }],
        trk: ['tms', 'Parcel tracking system'],
        pB: ['process-api', 'prc-parcel-billing', { replicas: 2, vCores: '1' }],
        sB: ['system-api', 'sys-billing-erp', { replicas: 2, vCores: '1' }],
        erp: ['erp', 'Billing ERP'],
        pA: ['process-api', 'prc-scan-analytics', { replicas: 2, vCores: '1' }],
        dw: ['data-warehouse', 'Operations data warehouse'],
      },
      ['scn -> exp', 'exp ~> t', 't ~> dlq', 't ~> pT', 't ~> pB', 't ~> pA', 'pT -> sT', 'sT -> trk', 'pB -> sB', 'sB -> erp', 'pA -> dw'],
    ),
    simulation: {
      systems: [
        { match: tracking, latencyMs: 100, maxRps: 1500 },
        { match: billing, latencyMs: 150, maxRps: 1000 },
        { match: 'data-warehouse', latencyMs: 200, maxRps: 1000 },
      ],
      tests: [
        {
          name: 'The evening peak',
          about: 'Sorters scan 300 parcels a second, then 900 a second for ten minutes when the evening trunk lorries arrive. Every scan is accepted at once and reaches all three systems.',
          traffic: [scans],
          durationMin: 60,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 500 }],
            delivered: [{ to: tracking, min: 0.99 }, { to: billing, min: 0.99 }, { to: 'data-warehouse', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'A zone fails at the peak',
          about: 'An availability zone goes down as the lorries arrive. The replicas in the other zone take all 900 scans a second.',
          traffic: [scans],
          incidents: [{ zone: true, at: 9, forMin: 12 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The data warehouse is down for 45 minutes',
          about: 'Analytics stops for a warehouse upgrade. Tracking and billing carry on, the analytics copies wait, and all of them are loaded afterwards. Nothing goes to the dead-letter queue.',
          traffic: [{ ...scans, spikes: undefined }],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 45 }],
          durationMin: 120,
          expect: { delivered: [{ to: tracking, min: 0.99 }, { to: 'data-warehouse', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'The broker restarts with a backlog',
          about: 'During the warehouse upgrade the broker restarts for a patch. Not one waiting scan is lost.',
          traffic: [{ ...scans, spikes: undefined }],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 30 }, { restart: 'topic', at: 20 }],
          durationMin: 90,
          expect: { lost: { max: 0 }, delivered: [{ to: 'data-warehouse', min: 0.99 }] },
        },
        {
          name: 'A scan with a broken barcode',
          about: 'One scan in 2,000 has a barcode no system can read, and each subscriber refuses it every time. Those copies end on the dead-letter queue.',
          traffic: [{ ...scans, spikes: undefined, poison: 0.0005 }],
          durationMin: 150,
          expect: { dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
Fernway Parcels, a fictional carrier, runs a sorting hub. Every parcel is scanned by the **sorter scanners** as it goes through. Three systems need each scan:
- the **parcel tracking system**, so customers see "at the hub" within a minute;
- the **billing ERP**, which charges senders by weight and size;
- the **operations data warehouse**, for the hub's dashboards.

Today the scanners call each system in turn. A slow warehouse makes the scanners slow, and at the evening peak the sorter has stopped twice.

**Numbers**
- About **300 scans a second**, and **900 a second for ten minutes** when the evening trunk lorries arrive.
- Tracking answers in about 100 ms (up to 1,500 a second), billing in 150 ms (up to 1,000), the warehouse in 200 ms (up to 1,000).
- The warehouse is sometimes down for **45 minutes** for upgrades.
- About 1 scan in 2,000 has an unreadable barcode.
- In this model one vCore serves about 500 requests a second, and a failed delivery is tried again about once a minute. Every delivery counts toward the redelivery limit.
- A scanner must get its answer within **500 ms**, even if one availability zone fails at the peak.
- No scan may be lost, even if the broker restarts. No good scan may reach the DLQ during a 45-minute warehouse upgrade.

**Questions:**
- Draw the design.
- Why one topic and not three queues the Experience API publishes to, or one shared queue?
- Size the Experience API so one zone alone takes the peak, and size each subscriber.
- What must the topic be set to, so that a broker restart and a warehouse upgrade lose nothing?
- Choose a redelivery limit.
`,
  answerTemplate: `## Design

## Why a topic

## Sizing

## Nothing lost

## The redelivery limit
`,
  keyPoints: [
    'Publish each scan once to a topic. Each subscriber gets its own copy and works at its own pace, so a slow warehouse holds up only analytics.',
    'A shared queue would give each scan to only one of the three consumers. Three publishes from the Experience API would make the scanners wait on three sends, and a fourth system would mean changing the Experience API.',
    'One zone must take the peak: 900 a second needs about 1.8 vCores, so two replicas of 4 vCores leave plenty even with one zone gone.',
    'Each subscriber chain must keep up with the peak: two replicas of 1 vCore serve about 1,000 a second.',
    'Persistent messages survive a broker restart. With durable subscriptions (or a queue per subscriber bound to an exchange), copies wait for a subscriber that is down.',
    'A limit of 90 tries covers a 45 minute upgrade with room, and an unreadable scan still reaches the DLQ.',
  ],
  solution: `
**Design**
\`\`\`
Sorter scanners ─► exp-sort-events ~► parcel-scans (topic) ~► prc-parcel-tracking ─► sys-tracking ─► Tracking system
                                          ~► DLQ          ~► prc-parcel-billing ─► sys-billing-erp ─► Billing ERP
                                                          ~► prc-scan-analytics ─► Data warehouse
\`\`\`

**In Anypoint MQ** this is an exchange bound to three queues, one per subscriber, each with its own DLQ. **In ActiveMQ** it is a topic with durable subscriptions, or virtual topics that give each subscriber a queue.

**Sizing.** The Experience API: 2 replicas of 4 vCores. Each subscriber's Process API and System API: 2 replicas of 1 vCore.

**Nothing lost.** Persistent delivery on the topic, and a subscription that keeps copies while its subscriber is away. Scans the scanners have had an answer for are on disk at the broker.

**The limit.** 90 deliveries. After a warehouse upgrade the analytics backlog drains at up to 1,000 a second.
`,
  followUps: [
    {
      q: 'Billing must not charge a parcel twice if a scan is delivered twice. How?',
      a: 'The billing Process API keys each charge on the scan ID and the parcel, and ignores a repeat. Every subscriber of an at least once topic needs its own answer to repeats.',
    },
    {
      q: 'A fourth system wants the scans next year. What changes?',
      a: 'Add a subscription and its Process API. The scanners, the Experience API and the other three subscribers do not change.',
    },
  ],
}
