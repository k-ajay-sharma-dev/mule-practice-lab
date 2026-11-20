import { diagram } from '../../arch/dsl.js'

const hotel = { type: 'external-api', label: 'hotel' }
const transport = { type: 'external-api', label: 'transport' }
const changes = { name: 'roster changes', from: 'saas', rps: 3, to: ['notification', hotel, transport], kind: 'write' }

export default {
  id: 'uc-127',
  category: 'use-cases',
  title: 'Airline Crew Roster Changes: Tell the Crew, Rebook the Hotel and the Car, and Let a Slow Partner Fall Behind Alone',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'anypoint-mq', 'exchange', 'fan-out', 'dlq', 'partners', 'aviation'],
  estMinutes: 35,
  diagram: {
    task: 'draw the roster change flow: the crew scheduling system calls a webhook Experience API, which publishes each change once to an exchange. The exchange copies it to three queues, one for the crew app notifications, one for hotel bookings and one for crew transport, each with its own consumer Process API and dead-letter queue. The hotel partner is called through a System API.',
    checks: [
      { label: 'The crew scheduling system calls a webhook Experience API', rule: { type: 'edge', from: 'saas', to: 'experience-api' } },
      { label: 'The Experience API publishes each change once, to an exchange', rule: { type: 'edge', from: 'experience-api', to: 'topic', kind: 'async' } },
      { label: 'The exchange copies each change to at least three queues', rule: { type: 'each', of: 'topic', edgeTo: 'queue', kind: 'async', count: 3 } },
      { label: 'Each queue has exactly one consumer Process API', rule: { type: 'each', of: 'queue', min: 3, edgeTo: 'process-api', max: 1 } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The webhook never waits on the crew app, the hotel partner or the transport company', rule: { type: 'no-path', from: 'experience-api', to: ['notification', 'external-api'], kind: 'sync' } },
      { label: 'The hotel partner is reached only through a System API', rule: { type: 'only-via', target: hotel, from: 'system-api' } },
      { label: 'Every line to or from the exchange, a queue or a DLQ is an async message', rule: { type: 'lines', touching: ['topic', 'queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        css: ['saas', 'Crew scheduling system'],
        exp: ['experience-api', 'exp-roster-webhook', { vCores: '0.2' }],
        ex: ['topic', 'roster-changes exchange'],
        qN: ['queue', 'roster-crew-app', { maxRedelivery: 200 }],
        qH: ['queue', 'roster-hotels', { maxRedelivery: 200 }],
        qT: ['queue', 'roster-transport', { maxRedelivery: 200 }],
        dN: ['dlq', 'roster-crew-app DLQ'],
        dH: ['dlq', 'roster-hotels DLQ'],
        dT: ['dlq', 'roster-transport DLQ'],
        prcN: ['process-api', 'prc-crew-notifications'],
        prcH: ['process-api', 'prc-crew-hotels'],
        prcT: ['process-api', 'prc-crew-transport'],
        push: ['notification', 'Crew app push notifications'],
        sysH: ['system-api', 'sys-hotel-partner'],
        htl: ['external-api', 'Hotel booking partner API'],
        car: ['external-api', 'Ground transport booking API'],
      },
      [
        'css -> exp', 'exp ~> ex', 'ex ~> qN', 'ex ~> qH', 'ex ~> qT',
        'qN ~> prcN', 'qH ~> prcH', 'qT ~> prcT', 'qN ~> dN', 'qH ~> dH', 'qT ~> dT',
        'prcN -> push', 'prcH -> sysH', 'sysH -> htl', 'prcT -> car',
      ],
    ),
    simulation: {
      systems: [
        { match: hotel, latencyMs: 900, maxRps: 10 },
        { match: transport, latencyMs: 400 },
        { match: 'notification', latencyMs: 100 },
      ],
      tests: [
        {
          name: 'An ordinary day',
          about: 'The scheduling system sends 3 roster changes a second. Each change reaches the crew app, the hotel partner and the transport company.',
          traffic: [changes],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ to: 'notification', min: 0.99 }, { to: hotel, min: 0.99 }, { to: transport, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'A storm cancels 200 flights',
          about: 'For 15 minutes the scheduling system sends 30 changes a second. The webhook takes them all, the crew hear at once, and the hotel queue drains at the partner\'s 10 a second within the hour.',
          traffic: [{ ...changes, spikes: [{ at: 5, forMin: 15, rps: 30 }] }],
          durationMin: 90,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            backlog: [{ queue: { type: 'queue', label: 'crew-app' }, maxPeak: 200 }, { queue: { type: 'queue', label: 'hotel' }, maxEnd: 0 }],
            delivered: [{ to: hotel, min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The hotel partner is down for two hours',
          about: 'The hotel partner has an outage. Crew notifications and transport go on as normal. Hotel bookings wait, none goes to the DLQ, and they all arrive once the partner is back.',
          traffic: [changes],
          incidents: [{ down: hotel, at: 10, forMin: 120 }],
          durationMin: 210,
          expect: { delivered: [{ to: 'notification', min: 0.99 }, { to: hotel, min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Changes with a broken crew record',
          about: 'One change in 100 points at a crew member with a broken record, and every consumer refuses it. Those copies go to the dead-letter queues, and the rest arrive.',
          traffic: [{ ...changes, poison: 0.01 }],
          durationMin: 240,
          expect: { delivered: [{ to: 'notification', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
An airline's **crew scheduling system** (a SaaS product) changes rosters all day: a pilot swapped onto another flight, a cabin crew member stood down, a whole crew moved after a delay. For each change it can call a webhook.

Three things must follow each change:
- The crew member gets a **push notification** in the crew app, within a minute.
- Their **hotel** at the outstation is booked, changed or cancelled with a **hotel booking partner**. Its API takes at most **10 requests a second** and answers in about a second.
- Their **ground transport** to and from the airport is rebooked with a **transport** company's API.

Today one Mule app receives the webhook and makes all three calls in a row before it answers. On an ordinary day the scheduling system sends about **3 changes a second**. Last winter a storm cancelled 200 flights and it sent about **30 a second** for 15 minutes. The hotel partner fell behind, the webhook timed out, the scheduling system gave up on most changes, and crews were not told they were stood down.

The hotel partner also has outages of an hour or two a few times a year.

Requirements:
- The webhook is answered within 300 ms, even during the storm.
- No roster change may be lost.
- A queue redelivers a failed message about once a minute, and every delivery counts toward its redelivery limit. No good change may reach a DLQ during a two-hour hotel outage, and changes that always fail must reach a DLQ.

**Questions:**
- Draw a design where each of the three can fall behind without holding up the others.
- What happens during the storm?
- What happens to roster changes while the hotel partner is down?
- What happens to a change that can never be processed?
`,
  answerTemplate: `## Design

## The storm

## The hotel partner outage

## Changes that cannot be processed
`,
  keyPoints: [
    'Answer the webhook as soon as the change is safely published. The scheduling system then never times out.',
    'Publish once to an exchange bound to one queue per follow-up. Each queue has its own consumer, so a slow hotel partner only fills the hotel queue.',
    'A consumer for a rate-limited partner works at the partner\'s pace. The queue takes the rest of the burst.',
    'Set each queue\'s redelivery limit above the longest outage you expect, so a two-hour outage does not empty the hotel queue into the DLQ.',
    'Give every queue its own DLQ for changes that fail every time, and alert on it.',
    'Call the hotel partner through a System API that knows its limit and its error codes.',
  ],
  solution: `
**Design**
\`\`\`
Crew scheduling system ─► exp-roster-webhook ~► roster-changes exchange ─┬~► roster-crew-app  ~► prc-crew-notifications ─► Crew app push
                                                                        ├~► roster-hotels    ~► prc-crew-hotels ─► sys-hotel-partner ─► Hotel partner
                                                                        └~► roster-transport ~► prc-crew-transport ─► Ground transport API
                                                          (each queue ~► its own DLQ)
\`\`\`

**The storm.** \`exp-roster-webhook\` publishes 30 changes a second and answers each one in milliseconds. The crew app queue drains at once, so crews hear within seconds. The hotel queue grows to about 18,000 messages in 15 minutes, and \`prc-crew-hotels\` works through it at the partner's 10 a second, so it is empty again within the hour. Transport sits in between.

**The hotel partner outage.** Hotel bookings wait on \`roster-hotels\`. Each one is redelivered about once a minute. With a limit of 200 deliveries, more than three hours, they ride out a two-hour outage. Crew notifications and transport do not notice. When the partner is back, the queue drains at 10 a second.

**Changes that cannot be processed.** A change for a broken crew record fails on every delivery. After 200 tries it moves to that queue's DLQ, and the crew control team is alerted. A change that only fails for hotels goes to the hotel DLQ only; the crew member is still told.

**Order.** Two changes for the same crew member can arrive close together. Each consumer should apply a change only if it is newer than the last one it applied for that crew member and duty, using the change time the scheduling system sends.
`,
  followUps: [
    {
      q: 'Why an exchange and three queues instead of three calls from one consumer?',
      a: 'With one consumer, a slow or broken hotel partner holds up the crew notifications, which are the most urgent. With a queue each, every follow-up has its own pace, retries and DLQ.',
    },
    {
      q: 'A redelivery limit of 200 means a broken change is tried for hours. Is that a problem?',
      a: 'It costs little: a few failed calls an hour per broken change. It is the price of not losing good changes during an outage. Alert on old messages in the queue as well, so a broken change is seen before it reaches the DLQ.',
    },
  ],
}
