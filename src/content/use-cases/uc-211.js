import { diagram } from '../../arch/dsl.js'

const adapter = { type: 'process-api', label: 'adapter' }
const acks = { name: 'acks', from: adapter, rps: 4, to: 'external-api', kind: 'write' }

export default {
  id: 'uc-211',
  category: 'use-cases',
  title: 'ACKs to the Supplier Portal Through a Broker That Is Patched Every Week: Persistent Messages So a Restart Loses None, a Relay That Waits Long Enough for a Slow Portal, and a Redelivery Limit Sized for Its Outages',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'ack', 'persistence', 'broker-restart', 'dlq', 'timeout'],
  estMinutes: 35,
  diagram: {
    task: 'draw the item adapter Process API putting each ACK on a queue with a dead-letter queue. An ACK relay Process API reads the queue and posts each ACK to the supplier portal\'s ACK API. The adapter never waits on the portal.',
    checks: [
      { label: 'ACKs wait on a queue before they reach the portal', rule: { type: 'path', from: adapter, via: 'queue', to: 'external-api' } },
      { label: 'The adapter never waits on the portal', rule: { type: 'no-path', from: adapter, to: 'external-api', kind: 'sync' } },
      { label: 'The relay posts to the portal\'s ACK API', rule: { type: 'edge', from: { type: 'process-api', label: 'relay' }, to: 'external-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        prc: ['process-api', 'prc-item-adapter'],
        q: ['queue', 'pdh.ack', { persistent: 'yes', maxRedelivery: 90 }],
        dlq: ['dlq', 'pdh.ack.dlq'],
        relay: ['process-api', 'prc-ack-relay', { timeoutMs: 30000 }],
        portal: ['external-api', 'Supplier portal ACK API'],
      },
      ['prc ~> q', 'q ~> relay', 'q ~> dlq', 'relay -> portal'],
    ),
    simulation: {
      systems: [{ match: 'external-api', latencyMs: 400 }],
      tests: [
        {
          name: 'A normal day',
          about: 'About four ACKs a second for half an hour. Every one reaches the portal.',
          traffic: [acks],
          durationMin: 30,
          expect: { delivered: [{ to: 'external-api', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The broker restarts with ACKs waiting',
          about: 'The portal is down, so ACKs pile up on the queue. Then the broker restarts for its weekly patch. Not one ACK is lost.',
          traffic: [acks],
          incidents: [{ down: 'external-api', at: 5, forMin: 20 }, { restart: 'queue', at: 15 }],
          durationMin: 60,
          expect: { lost: { max: 0 }, delivered: [{ to: 'external-api', min: 0.99 }] },
        },
        {
          name: 'A slow portal',
          about: 'The portal\'s database is busy and each post takes about 15 seconds for half an hour. The ACKs still go through as they come, without piling up on the queue.',
          traffic: [acks],
          incidents: [{ slow: 'external-api', latencyMs: 15000, at: 0, forMin: 30 }],
          durationMin: 60,
          expect: { delivered: [{ to: 'external-api', min: 0.99 }], backlog: [{ queue: 'queue', maxPeak: 100 }], dlq: { max: 0 } },
        },
        {
          name: 'The portal\'s monthly upgrade',
          about: 'The portal is down for an hour. ACKs wait on the queue and all of them arrive afterwards, with none on the dead-letter queue.',
          traffic: [acks],
          incidents: [{ down: 'external-api', at: 5, forMin: 60 }],
          durationMin: 120,
          expect: { delivered: [{ to: 'external-api', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'An ACK the portal always refuses',
          about: 'For an hour, one ACK in a hundred names a message the portal never knew. Each is refused every time and ends on the dead-letter queue, so the queue is empty again by the end.',
          traffic: [{ ...acks, poison: 0.01, forMin: 60 }],
          durationMin: 180,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 100 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, runs a product data hub. Its item adapter answers every supplier message with ACKs: \`RECEIVED\`, then \`LOADED\` or \`FAILED\`. Today the adapter posts each ACK straight to the **supplier portal's ACK API**. When the portal is slow or down, the adapter's own flow fails after it has already loaded the items, and the message is replayed and loaded twice.

The plan: the adapter puts each ACK on a queue, \`pdh.ack\`, and an **ACK relay** posts them to the portal.

**Numbers**
- About **4 ACKs a second**.
- A post takes about 400 ms; when the portal's database is busy, about **15 seconds**, for up to half an hour.
- The portal is down for its monthly upgrade for up to **an hour**.
- The broker is patched every week and **restarts**, often while ACKs are waiting.
- About **1 ACK in 100** names a message the portal never knew (a test supplier, a mistyped ID). It is refused every time.
- In this model calls time out after 10 seconds unless set otherwise, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- What does a broker restart do to the ACKs on the queue, and which setting decides it?
- Set the relay's timeout and the queue's redelivery limit. Explain each number.
- Who looks at the dead-letter queue, and what do they do?
`,
  answerTemplate: `## Design

## The broker restart

## Settings

## The dead-letter queue
`,
  keyPoints: [
    'With the queue, the adapter is done once the broker has the ACK. A slow or down portal no longer fails the adapter or causes a replay.',
    'A persistent message is written to the broker\'s disk before the publish returns. A non persistent one lives in memory and is gone when the broker restarts.',
    'A 15 second post needs a relay timeout above it, or every post fails and waits a minute. 30 seconds leaves room.',
    'An hour of upgrade with a retry about once a minute needs more than 60 deliveries. 90 covers it and still parks a refused ACK within two hours.',
    'A parked ACK is a data problem, not an outage. Supplier support checks the message ID with the supplier and deletes the ACK or fixes the ID.',
  ],
  solution: `
**Design**
\`\`\`
prc-item-adapter ~► pdh.ack ~► prc-ack-relay ─► Supplier portal ACK API
                    pdh.ack ~► pdh.ack.dlq
\`\`\`

**Settings.** \`pdh.ack\`: persistent, 90 deliveries. \`prc-ack-relay\`: timeout 30 seconds.

**Order.** With one relay and a queue, ACKs mostly keep their order. A LOADED that is redelivered can still arrive after a newer RECEIVED of the next message, so the portal should order by the time stamp in the ACK, not by arrival.
`,
  followUps: [
    {
      q: 'Persistent messages are slower. Could the ACK queue skip it?',
      a: 'Only if a lost ACK is acceptable. Here a lost LOADED leaves the supplier waiting for ever and phoning support, so the few milliseconds of a disk write are worth it.',
    },
    {
      q: 'The relay posts an ACK, the portal stores it, but the answer times out. What happens?',
      a: 'The ACK is redelivered and posted again. The portal must accept the same ACK twice, for example keyed on message ID and status. Agree on that when the interface is designed.',
    },
  ],
}
