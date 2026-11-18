import { diagram } from '../../arch/dsl.js'

const notices = { name: 'store notices', from: 'batch-job', rps: 10, forMin: 1, to: 'notification', kind: 'write' }

export default {
  id: 'uc-194',
  category: 'use-cases',
  title: 'Six Hundred Store Notices Through a Relay That Takes One Every Two Seconds: Queue Them, Let the Mailer Go at the Relay\'s Pace, and Ride Out Its Maintenance',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'smtp', 'rate-limit', 'queues', 'dlq', 'stores'],
  estMinutes: 35,
  diagram: {
    task: 'draw the price notice job putting one request per store on a queue with a dead-letter queue. A mailer Process API reads the queue and sends each notice through the mail relay. The job never calls the relay itself.',
    checks: [
      { label: 'Notices wait on a queue before the mail relay', rule: { type: 'path', from: 'batch-job', via: 'queue', to: 'notification' } },
      { label: 'The job never sends to the relay directly', rule: { type: 'no-path', from: 'batch-job', to: 'notification', kind: 'sync' } },
      { label: 'A mailer Process API reads the queue', rule: { type: 'edge', from: 'queue', to: 'process-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        job: ['batch-job', 'price-notice-job'],
        q: ['queue', 'store.notices', { maxRedelivery: 60 }],
        dlq: ['dlq', 'store.notices.dlq'],
        prc: ['process-api', 'prc-store-mailer'],
        mail: ['notification', 'Mail relay'],
      },
      ['job ~> q', 'q ~> prc', 'q ~> dlq', 'prc -> mail'],
    ),
    simulation: {
      systems: [{ match: 'notification', latencyMs: 300, maxRps: 0.5 }],
      tests: [
        {
          name: 'The Monday price run',
          about: 'The job queues 600 notices in a minute. The mailer sends them at the relay\'s pace, and all are sent within 40 minutes without going over its limit.',
          traffic: [notices],
          durationMin: 40,
          expect: { delivered: [{ to: 'notification', min: 0.99 }], peakRps: [{ node: 'notification', max: 0.5 }], dlq: { max: 0 } },
        },
        {
          name: 'Relay maintenance during the run',
          about: 'The relay is down for 45 minutes, starting a minute into the run. Every notice waits and goes out afterwards; none ends on the dead-letter queue.',
          traffic: [notices],
          incidents: [{ down: 'notification', at: 1, forMin: 45 }],
          durationMin: 90,
          expect: { delivered: [{ to: 'notification', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Closed stores',
          about: 'Five stores in 600 have closed and their mailboxes refuse mail. Those notices end on the dead-letter queue instead of circling.',
          traffic: [{ ...notices, poison: 0.01 }],
          durationMin: 120,
          expect: { dlq: { min: 1 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, emails each of its 600 stores when shelf prices change. A price notice job builds one notice per store every Monday morning.

The company **mail relay** lets this sending account send about **30 emails a minute** (one every two seconds). Above that it refuses mail and may lock the account. The old job sent all 600 in a loop: most were refused, and some stores printed last week's labels.

**Numbers**
- **600 notices**, built in about a minute.
- The relay: about **0.5 sends a second**, and down for maintenance for up to **45 minutes** some Mondays.
- About **1 store in 100** has closed; its mailbox refuses mail every time.
- In this model a queue consumer only takes what the boxes behind it have spare, a failed delivery is tried again about once a minute, and a limit of 0 means no limit.

**Questions:**
- Draw the design.
- How long does the run take, and how does the queue keep the mailer under the relay's limit?
- Choose a redelivery limit, and say what happens to closed stores' notices.
- What would you change if the stores needed their notices within 5 minutes?
`,
  answerTemplate: `## Design

## Pacing

## The redelivery limit

## Faster delivery
`,
  keyPoints: [
    'The job puts all 600 on the queue at once. The queue holds them, and the mailer takes them at the pace the relay allows: 600 at 0.5 a second is 20 minutes.',
    'The pace belongs to the consumer, not the producer. The job can stay fast and simple.',
    'A limit above the maintenance window (45 tries at about one a minute) keeps good notices off the DLQ; 60 leaves room. Without a limit, closed stores\' notices circle for ever.',
    'Within 5 minutes is not possible at 30 a minute. Ask for a higher limit, use a bulk sending service, or send one email per region with a link to each store\'s labels.',
  ],
  solution: `
**Design**
\`\`\`
price-notice-job ~► store.notices ~► prc-store-mailer ─► Mail relay
                               ~► store.notices.dlq
\`\`\`

**Settings.** \`store.notices\`: 60 deliveries before the DLQ.

**In Mule.** A single consumer (or a rate limit on the mailer) keeps the pace. With Anypoint MQ, set the subscriber's prefetch and concurrency to 1, and add a short wait between sends if the relay needs it.
`,
  followUps: [
    {
      q: 'Two mailer replicas for safety: does that break the pace?',
      a: 'It can double it. Either give each a rate limit of half, or run one active consumer and keep the other on standby.',
    },
    {
      q: 'How do the closed stores get fixed?',
      a: 'The DLQ is reviewed after each run; store operations remove closed stores from the job\'s list, so next week they are not built at all.',
    },
  ],
}
