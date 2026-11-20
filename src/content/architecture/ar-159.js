import { diagram } from '../../arch/dsl.js'

const scoring = { type: 'external-api', label: 'scoring' }
const tx = { name: 'transactions', from: 'device', rps: 300, to: [scoring, 'data-warehouse'], kind: 'write' }

export default {
  id: 'ar-159',
  category: 'architecture',
  title: 'Hot and Cold Paths From One Event Stream: Fraud Scoring in Seconds and the Warehouse Within the Hour, and a Slow Warehouse Never Delays a Fraud Check',
  level: 'EXPERT',
  tags: ['event-streaming', 'kafka', 'fraud', 'data-warehouse', 'consumer-groups', 'payments'],
  estMinutes: 50,
  diagram: {
    task: 'draw the card terminals sending transactions to an Experience API that publishes them to an event stream. Draw two consumers of the stream: a fraud scoring Process API that calls the fraud scoring service through a System API, and a warehouse loader job that writes to the data warehouse. Draw the terminals as an IoT device box and the scoring service as a Third-party API box with scoring in its name.',
    checks: [
      { label: 'The terminals send to an Experience API', rule: { type: 'edge', from: 'device', to: 'experience-api' } },
      { label: 'Transactions go through an event stream before they are scored', rule: { type: 'path', from: 'device', via: 'event-stream', to: scoring } },
      { label: 'Transactions go through the same event stream before they reach the warehouse', rule: { type: 'path', from: 'device', via: 'event-stream', to: 'data-warehouse' } },
      { label: 'The stream has two consumers', rule: { type: 'each', of: 'event-stream', edgeTo: ['process-api', 'batch-job'], count: 2 } },
      { label: 'The fraud path never waits on the warehouse', rule: { type: 'no-path', from: { type: 'process-api', label: 'fraud' }, to: 'data-warehouse' } },
      { label: 'The scoring service is reached only through a System API', rule: { type: 'only-via', target: scoring, from: 'system-api' } },
      { label: 'Every line to or from the stream is an async message', rule: { type: 'lines', touching: 'event-stream', kind: 'async' } },
    ],
    reference: diagram(
      {
        pos: ['device', 'Card terminals'],
        exp: ['experience-api', 'exp-card-transactions', { replicas: 2, vCores: '0.5' }],
        es: ['event-stream', 'card-transactions'],
        frd: ['process-api', 'prc-fraud-scoring', { replicas: 2, vCores: '0.5', timeoutMs: 2000 }],
        sys: ['system-api', 'sys-fraud-scoring', { replicas: 2, vCores: '0.5' }],
        svc: ['external-api', 'Fraud scoring service'],
        ldr: ['batch-job', 'Warehouse loader', { vCores: '1' }],
        dw: ['data-warehouse', 'Data warehouse'],
      },
      ['pos -> exp', 'exp ~> es', 'es ~> frd', 'frd -> sys', 'sys -> svc', 'es ~> ldr', 'ldr -> dw'],
    ),
    simulation: {
      systems: [
        { match: 'external-api', latencyMs: 150, maxRps: 500 },
        { match: 'data-warehouse', latencyMs: 60, maxRps: 1000 },
      ],
      tests: [
        {
          name: 'Lunchtime peak',
          about: 'Terminals send 300 transactions a second. The terminals get their answer at once, every transaction is scored, and every one reaches the warehouse.',
          traffic: [tx],
          durationMin: 30,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 200 }],
            delivered: [{ to: scoring, min: 0.99 }, { to: 'data-warehouse', min: 0.99 }],
            backlog: [{ queue: 'event-stream', maxPeak: 20000 }],
          },
        },
        {
          name: 'The warehouse is down for an hour',
          about: 'The warehouse has a long maintenance window in the middle of the afternoon. Fraud scoring goes on as normal while it is down, and nothing is lost.',
          traffic: [{ ...tx, rps: 150 }],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 60 }],
          durationMin: 70,
          expect: { delivered: [{ to: scoring, min: 0.95 }], lost: { max: 0 } },
        },
        {
          name: 'The loader catches up',
          about: 'After a 15 minute warehouse outage the loader works through what waited in the stream, and by the end every transaction is in the warehouse.',
          traffic: [{ ...tx, rps: 150 }],
          incidents: [{ down: 'data-warehouse', at: 5, forMin: 15 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'data-warehouse', min: 0.99 }, { to: scoring, min: 0.99 }], lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A card payments company receives a copy of every authorised transaction from its **card terminals** in shops. It needs each transaction in two places:

- **Fraud scoring**: each transaction goes to a **fraud scoring service**, which flags cards that are being misused. It must happen within seconds, while the card is still in the shop.
- **The data warehouse**: finance and risk teams report on every transaction. Within the hour is fine.

Today one Mule app takes each transaction, calls the scoring service, then writes to the warehouse. When the warehouse is down for maintenance, the app fails the whole transaction and its queue retries it, so fraud scoring stops too. Last month a two hour warehouse window meant two hours with no fraud checks.

**Numbers**
- About **300 transactions a second** at lunchtime, about 150 in the afternoon.
- The scoring service answers in about 150 ms and takes up to 500 a second.
- The warehouse takes up to 1,000 writes a second and has maintenance windows of up to an hour.

**Questions:**
- Draw the design.
- How do the two paths get the same transactions without waiting on each other?
- What happens during a warehouse maintenance window, and after it?
- What is the cost of this design, and what must each consumer do about repeats?
`,
  answerTemplate: `## Design

## One stream, two consumers

## During and after a warehouse window

## Repeats and ordering

## Cost
`,
  keyPoints: [
    'The hot path and the cold path have different deadlines, so they must not share one consumer. A slow or absent warehouse would hold up fraud checks.',
    'Publish each transaction once to an event stream such as Kafka. Each consumer reads it in its own consumer group, with its own position in the stream.',
    'The fraud consumer stays near the head of the stream. The warehouse loader may fall behind and catch up later, as long as the stream keeps events longer than the longest outage.',
    'The Experience API answers the terminals as soon as the stream has the event. Neither consumer is on the terminals\' path.',
    'Both consumers must handle a repeat: a crash after work but before the position is saved replays some events. Key each write by transaction ID.',
    'Size each consumer for its own job: the fraud path for the peak, the loader for the peak plus the catch up after an outage.',
  ],
  solution: `
**Design**
\`\`\`
Card terminals ─► exp-card-transactions ~► card-transactions (stream) ~► prc-fraud-scoring ─► sys-fraud-scoring ─► Fraud scoring service
                                                                    ~► Warehouse loader ─► Data warehouse
\`\`\`

**One stream, two consumers.** Each consumer reads the stream in its own consumer group. A Kafka topic keeps the events for a set time whether they have been read or not, so the fraud consumer and the loader each move at their own pace.

**During and after a warehouse window.** The loader cannot write, so its position stays where it was and its lag grows. Fraud scoring is untouched. After the window the loader reads from where it stopped. At 150 transactions a second, an hour of lag is about 540,000 events, and a loader that writes 500 a second clears it in under half an hour. Set the stream's retention well above the longest window, for example 7 days.

**Repeats and ordering.** Key the stream by card number, so all events of one card stay in order on one partition. That matters to fraud scoring, which looks at a card's recent history. The warehouse load is an upsert by transaction ID, so a replayed event changes nothing.

**Cost.** Two consumers and a stream instead of one app. In return, a warehouse window no longer turns off fraud checks, and a third consumer, such as a loyalty service, can read the same stream later without any change to the others.

**Sizing.** The fraud path takes 300 a second: two replicas of half a vCore for the Experience, Process and System APIs, so a zone failure still leaves capacity. The loader gets 1 vCore to catch up quickly, and a 2 second timeout keeps a slow scoring call from holding the fraud consumer's threads.
`,
  followUps: [
    {
      q: 'Why not two queues, one for each path, instead of a stream?',
      a: 'It works: the Experience API publishes to an exchange bound to two queues. A stream adds replay: a new consumer, or a fixed loader, can read last week\'s events again. With queues, an event is gone once it is consumed.',
    },
    {
      q: 'The fraud scoring service is down for 10 minutes. What should the fraud consumer do?',
      a: 'Stop and wait rather than skip, because a missed score is a missed fraud check. The events wait in the stream. When it is back, score the backlog oldest first, and tell the fraud team which window was scored late.',
    },
  ],
}
