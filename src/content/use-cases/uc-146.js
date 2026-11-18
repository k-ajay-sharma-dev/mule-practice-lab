import { diagram } from '../../arch/dsl.js'

const collections = { name: 'tanker collections', from: 'device', rps: 5, to: 'erp', kind: 'write', spikes: [{ at: 10, forMin: 5, rps: 300 }] }

export default {
  id: 'uc-146',
  category: 'use-cases',
  title: 'Milk Tankers Out of Coverage All Day Upload Everything at Once at the Depot: Take the Burst Into a Queue and Feed the Co-op ERP at the 50 a Second It Can Take',
  level: 'ADVANCED',
  tags: ['myproject', 'agriculture', 'burst', 'queue', 'load-levelling', 'sizing', 'store-and-forward'],
  estMinutes: 40,
  diagram: {
    task: 'draw the tanker tablets calling a collections Experience API, which puts each collection record on a queue with a dead-letter queue. A collections Process API reads the queue and posts each record to the co-op ERP through a System API.',
    checks: [
      { label: 'The tablets call an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Collections wait on a queue before they reach the ERP', rule: { type: 'path', from: 'device', via: 'queue', to: 'erp' } },
      { label: 'The tablets never wait on the ERP', rule: { type: 'no-path', from: 'device', to: 'erp', kind: 'sync' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
    ],
    reference: diagram(
      {
        tab: ['device', 'Tanker tablets'],
        exp: ['experience-api', 'exp-tanker-collections', { replicas: 2, vCores: '0.5' }],
        q: ['queue', 'milk-collections', { maxRedelivery: 60 }],
        dlq: ['dlq', 'milk-collections DLQ'],
        prc: ['process-api', 'prc-milk-collections'],
        sys: ['system-api', 'sys-coop-erp'],
        erp: ['erp', 'Co-op ERP'],
      },
      ['tab -> exp', 'exp ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> sys', 'sys -> erp'],
    ),
    simulation: {
      systems: [{ match: 'erp', latencyMs: 250, maxRps: 50 }],
      tests: [
        {
          name: 'The evening return to the depot',
          about: 'Through the day a few records a second arrive. At 18:00 sixty tankers reach the depot Wi-Fi together and send 300 records a second for five minutes. Every tablet upload is accepted, and the ERP never gets more than 50 a second.',
          traffic: [collections],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 400 }], peakRps: [{ node: 'erp', max: 50 }], delivered: [{ to: 'erp', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The backlog clears by 19:00',
          about: 'After the burst about 90,000 records wait. They are all in the ERP within the hour, in time for the evening tanker reports.',
          traffic: [collections],
          durationMin: 60,
          expect: { backlog: [{ queue: 'queue', minPeak: 50000, maxEnd: 0 }] },
        },
        {
          name: 'A record for a farm that left the co-op',
          about: 'One record in 200 is for a farm that left the co-op, and the ERP refuses it every time. Those records move to the dead-letter queue for the milk office.',
          traffic: [{ ...collections, poison: 0.005 }],
          durationMin: 120,
          expect: { dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A dairy co-op collects milk from 400 farms with 60 **tankers**. At each farm the driver records the volume, the temperature and a sample number on a **tanker tablet**. Many farms are in valleys with no mobile signal, so the tablets keep the records and send them when they can, which is mostly at the depot in the evening.

Today the tablets post each record straight to the **co-op ERP** through Mule. At 18:00, when most tankers reach the depot Wi-Fi together, the ERP is swamped, uploads fail, and drivers wait in the yard re-sending records.

**Numbers**
- Through the day: about **5 records a second** from tankers with signal.
- At 18:00: about **300 records a second for five minutes** as the tankers arrive.
- The co-op ERP takes about 250 ms per record and up to **50 records a second**.
- The milk office runs its tanker reports at 19:00 and needs every record by then.
- About 1 record in 200 is for a farm that has left the co-op and is refused by the ERP.

**Questions:**
- Draw the design.
- How do the tablets get their uploads accepted at once, at 300 a second?
- How do the records reach an ERP that takes 50 a second, and by when?
- What happens to a record the ERP always refuses?
`,
  answerTemplate: `## Design

## Accepting the burst

## Feeding the ERP

## Records that always fail
`,
  keyPoints: [
    'The burst and the ERP\'s limit are both fixed. A queue between them turns a five minute burst into an hour of steady work: queue-based load levelling.',
    'The tablets are answered as soon as a record is on the queue. Drivers can leave the yard.',
    'Size the Experience API for the burst, not the day. Two replicas of half a vCore take 300 a second in this model and survive a zone outage.',
    'The consumer takes records only as fast as the ERP allows. It never needs more than the ERP can take.',
    'Check the timing: about 90,000 records at 45 a second to spare is about 35 minutes, inside the hour before the 19:00 reports.',
    'Records the ERP always refuses go to a dead-letter queue after a redelivery limit, so they do not hold up the rest.',
  ],
  solution: `
**Design**
\`\`\`
Tanker tablets ─► exp-tanker-collections ~► milk-collections ~► prc-milk-collections ─► sys-coop-erp ─► Co-op ERP
                                                     ~► DLQ
\`\`\`

**Accepting the burst.** \`exp-tanker-collections\` checks each record, puts it on \`milk-collections\` and answers 202. 300 a second is more than the smallest size takes, so it runs on two replicas of half a vCore.

**Feeding the ERP.** \`prc-milk-collections\` reads the queue and posts through \`sys-coop-erp\`. The ERP takes 50 a second, so after the burst the backlog of about 90,000 records falls by about 45 a second and is gone in about 35 minutes.

**Records that always fail.** After 60 failed deliveries a record moves to the DLQ, and the milk office decides what to do with it, for example pay a farm that left mid-month.

**Repeats.** A tablet that loses Wi-Fi after sending may send a record again. Each record carries the tablet's own ID, such as tanker, farm, date and sample number, and the ERP ignores a record it already has.
`,
  followUps: [
    {
      q: 'Could the tablets send their records in batches instead?',
      a: 'Yes, one call with all of a tanker\'s records would cut the calls from thousands to 60. The Experience API then splits the batch onto the queue, and the ERP side is unchanged.',
    },
    {
      q: 'A record shows milk above the safe temperature. Should it wait in the queue like the rest?',
      a: 'No. The Experience API can publish such records to a separate priority queue, read by its own consumer, so the quality team hears within seconds.',
    },
  ],
}
