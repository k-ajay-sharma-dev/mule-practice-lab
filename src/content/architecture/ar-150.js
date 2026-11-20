import { diagram } from '../../arch/dsl.js'

const shop = { name: 'shop messages', from: 'web-app', rps: 60, to: 'notification', kind: 'write' }
const hr = { name: 'HR messages', from: 'internal-app', rps: 10, to: 'notification', kind: 'write' }
const notifications = { type: 'process-api', label: 'notifications' }

export default {
  id: 'ar-150',
  category: 'architecture',
  title: 'One Notification Service for Every App: a Shared Process API, a Queue With a Dead-Letter Queue, and One Way Out to the SMS and Email Provider',
  level: 'BEGINNER',
  tags: ['myproject', 'reuse', 'notifications', 'anypoint-mq', 'dlq', 'process-api', 'retail'],
  estMinutes: 20,
  diagram: {
    task: 'draw the shared notification service: the online shop and the HR portal both call one notifications Process API, which puts each message on a queue with a dead-letter queue. A sender Process API takes messages from the queue and sends them to the email and SMS provider through a System API.',
    checks: [
      { label: 'The online shop calls the shared notifications Process API', rule: { type: 'edge', from: 'web-app', to: notifications } },
      { label: 'The HR portal calls the same notifications Process API', rule: { type: 'edge', from: 'internal-app', to: notifications } },
      { label: 'Messages wait on a queue before they are sent', rule: { type: 'path', from: notifications, via: 'queue', to: 'notification' } },
      { label: 'No app waits on the provider', rule: { type: 'no-path', from: ['web-app', 'internal-app'], to: 'notification', kind: 'sync' } },
      { label: 'The provider is reached only through a System API', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'The queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Online shop'],
        hr: ['internal-app', 'HR portal'],
        prc: ['process-api', 'prc-notifications', { vCores: '0.5' }],
        q: ['queue', 'notifications-to-send', { maxRedelivery: 60 }],
        dlq: ['dlq', 'notifications-to-send DLQ'],
        snd: ['process-api', 'prc-notification-sender', { vCores: '0.5' }],
        sys: ['system-api', 'sys-messaging-provider', { vCores: '0.5' }],
        prov: ['notification', 'Email and SMS provider'],
      },
      ['web -> prc', 'hr -> prc', 'prc ~> q', 'q ~> snd', 'q ~> dlq', 'snd -> sys', 'sys -> prov'],
    ),
    simulation: {
      systems: [{ match: 'notification', latencyMs: 300, maxRps: 120 }],
      tests: [
        {
          name: 'A sale starts',
          about: 'The shop sends 60 order confirmations a second and HR sends 10 messages a second. Every app gets its answer at once, and every message reaches the provider.',
          traffic: [shop, hr],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 300 }], delivered: [{ to: 'notification', min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The provider is down for 20 minutes',
          about: 'The provider has an outage. The apps keep sending, the messages wait in the queue, and all of them go out once it is back. None goes to the dead-letter queue.',
          traffic: [{ ...shop, rps: 20 }, hr],
          incidents: [{ down: 'notification', at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], lost: { max: 0 }, dlq: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'Some addresses are wrong',
          about: 'One shop message in 50 has an address the provider refuses every time. Those messages move to the dead-letter queue, and the rest go out.',
          traffic: [{ ...shop, rps: 20, poison: 0.02 }, hr],
          durationMin: 120,
          expect: { delivered: [{ to: 'notification', min: 0.97 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A furniture retailer has two teams that each send email and text messages: the **online shop** (order and delivery updates) and the **HR portal** (shift changes, payslip ready), with more apps to come. Each team wrote its own code against the same **email and SMS provider**, with its own login and its own retries.

Last month the provider was down for 20 minutes. The shop's checkout waited on it and failed orders. The HR portal lost every message sent in those 20 minutes. Nobody could say how many messages went out that day.

The plan is one **shared notification service** that every app calls.

**Numbers**
- At the start of a sale the shop sends about **60 messages a second**. HR sends about **10**.
- The provider takes about 300 ms per message and up to 120 a second.
- About 1 message in 50 has an address the provider refuses every time. Support wants those set aside within about an hour.
- The broker tries a failed message again about **once a minute**. Provider outages have lasted up to 20 minutes.

**Questions:**
- Draw the shared service. How does an app send a message without waiting on the provider?
- What happens to messages during a provider outage?
- What happens to a message the provider refuses every time?
`,
  answerTemplate: `## Design

## Why a Process API others reuse

## Provider outages

## Refused messages
`,
  keyPoints: [
    'One Process API, prc-notifications, is the only way any app sends a message. Teams reuse it instead of each calling the provider.',
    'It puts each message on a queue and answers at once. The app never waits on the provider.',
    'A sender takes messages from the queue at the pace the provider can take, through one System API that holds the provider\'s login and limits.',
    'During an outage the messages wait in the queue and go out when the provider is back.',
    'Set a redelivery limit and draw a dead-letter queue, so a message refused every time stops being tried and is kept for someone to look at.',
    'One service also gives one count of what was sent, by app and by channel.',
  ],
  solution: `
**Design**
\`\`\`
Online shop ─┐
             ├─► prc-notifications ~► notifications-to-send ~► prc-notification-sender ─► sys-messaging-provider ─► Provider
HR portal ───┘                               ~► DLQ
\`\`\`

**Why a Process API.** Sending a message is a business step: pick the template, the channel and the language, then send. That is process logic other apps reuse, so it sits in a Process API. The provider's quirks sit in the System API behind it.

**Sizing.** 70 messages a second at peak is more than one 0.1 vCore replica takes in this model, so \`prc-notifications\`, the sender and the System API get half a vCore each.

**Provider outages.** \`prc-notifications\` answers as soon as the message is on the queue. The sender fails to reach the provider, and the queue delivers the message again later. In this model a failed delivery is tried again about once a minute, so a redelivery limit of 60 covers an outage of about an hour.

**Refused messages.** After 60 failed deliveries a message moves to the DLQ. A support team reviews it each day and fixes the address in the shop or HR record.
`,
  followUps: [
    {
      q: 'Should an order confirmation and a payslip message share one queue?',
      a: 'At this volume, yes. If HR messages were time critical and the shop could flood the queue, give each its own queue and sender, so one cannot delay the other.',
    },
    {
      q: 'What does the app get back?',
      a: 'An accepted answer with a message ID. A status endpoint or an event can tell it later whether the provider delivered the message.',
    },
  ],
}
