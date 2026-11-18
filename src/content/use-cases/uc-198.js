import { diagram } from '../../arch/dsl.js'

const notify = { name: 'app notifications', from: 'internal-app', rps: 8, to: 'notification', kind: 'write' }
const campaign = { name: 'campaign emails', from: 'saas', rps: 50, forMin: 30, to: 'notification', kind: 'write' }

export default {
  id: 'uc-198',
  category: 'use-cases',
  title: 'One Email Service for Every App: a Notifications API With Client IDs, Separate Lanes for Urgent and Bulk Mail, a Suppression List in Oracle, and Settings for Campaigns, Relay Outages and a Zone Failure',
  level: 'EXPERT',
  tags: ['myproject', 'email', 'smtp', 'oracle', 'queues', 'rate-limit', 'client-id', 'replicas', 'dlq'],
  estMinutes: 60,
  diagram: {
    task: 'draw the company apps calling a notifications Experience API through an API gateway that checks client IDs. The Experience API puts each request on an urgent queue. The campaign tool puts its emails on a bulk queue. Each queue has a dead-letter queue and its own mailer Process API. Both mailers check the suppression list through a preferences System API over Oracle, and send through the mail relay.',
    checks: [
      { label: 'Apps come in through the API gateway', rule: { type: 'edge', from: 'internal-app', to: 'api-gateway' } },
      { label: 'App requests wait on the urgent queue before the relay', rule: { type: 'path', from: 'internal-app', via: { type: 'queue', label: 'urgent' }, to: 'notification' } },
      { label: 'Campaign emails wait on the bulk queue', rule: { type: 'path', from: 'saas', via: { type: 'queue', label: 'bulk' }, to: 'notification' } },
      { label: 'Campaign emails never reach the urgent queue', rule: { type: 'no-path', from: 'saas', to: { type: 'queue', label: 'urgent' } } },
      { label: 'No caller waits on the mail relay', rule: { type: 'no-path', from: 'internal-app', to: 'notification', kind: 'sync' } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Oracle is reached only through a System API', rule: { type: 'only-via', target: 'oracle-db', from: 'system-api' } },
    ],
    reference: diagram(
      {
        camp: ['saas', 'Campaign tool'],
        qB: ['queue', 'notify.bulk', { maxRedelivery: 60 }],
        dB: ['dlq', 'notify.bulk.dlq'],
        prcB: ['process-api', 'prc-bulk-mailer', { rateLimit: 10 }],
        apps: ['internal-app', 'Company apps'],
        gw: ['api-gateway', 'API gateway', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-notifications', { replicas: 2 }],
        qU: ['queue', 'notify.urgent', { maxRedelivery: 60 }],
        dU: ['dlq', 'notify.urgent.dlq'],
        prcU: ['process-api', 'prc-urgent-mailer', { replicas: 2 }],
        sys: ['system-api', 'sys-preferences', { replicas: 2 }],
        ora: ['oracle-db', 'Preferences Oracle'],
        mail: ['notification', 'Mail relay'],
      },
      ['camp ~> qB', 'qB ~> prcB', 'qB ~> dB', 'prcB -> sys', 'prcB -> mail', 'apps -> gw', 'gw -> exp', 'exp ~> qU', 'qU ~> prcU', 'qU ~> dU', 'prcU -> sys', 'prcU -> mail', 'sys -> ora'],
    ),
    simulation: {
      systems: [
        { match: 'oracle-db', latencyMs: 30 },
        { match: 'notification', latencyMs: 300, maxRps: 20 },
      ],
      tests: [
        {
          name: 'A normal day',
          about: 'Apps send about 8 notifications a second. Each request is accepted at once and every email goes out.',
          traffic: [notify],
          durationMin: 20,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 500 }], delivered: [{ to: 'notification', min: 0.99 }] },
        },
        {
          name: 'Campaign day',
          about: 'The campaign tool queues 50 emails a second for half an hour. App notifications still go out as they come, and the relay is never pushed past its limit.',
          traffic: [campaign, notify],
          durationMin: 40,
          expect: { delivered: [{ flow: 'app notifications', to: 'notification', min: 0.99 }], peakRps: [{ node: 'notification', max: 20 }] },
        },
        {
          name: 'Relay maintenance',
          about: 'The relay is down for 40 minutes. Requests are still accepted, wait on their queues, and all go out afterwards, with none on a dead-letter queue.',
          traffic: [notify],
          incidents: [{ down: 'notification', at: 5, forMin: 40 }],
          durationMin: 90,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'notification', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'A zone goes down',
          about: 'One availability zone fails for 20 minutes. The notifications API and the urgent mailer keep a replica in the other zone.',
          traffic: [notify],
          incidents: [{ zone: true, at: 5, forMin: 20 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99 }], delivered: [{ to: 'notification', min: 0.99 }] },
        },
        {
          name: 'An app without its client ID',
          about: 'A new app calls without a client ID. The gateway refuses it, and nothing is queued.',
          traffic: [{ ...notify, name: 'unknown app', rps: 1, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'unknown app', minRefused: 0.99 }], notReached: [{ flow: 'unknown app', node: 'queue' }] },
        },
      ],
    },
  },
  description: `
Larkfield Grocers, a fictional grocery chain, has a dozen apps that each send email their own way: different relays, different templates, no shared list of customers who unsubscribed. The privacy team found that an app had emailed customers who had opted out years ago.

You are asked to design **one email service** for the company:
- Apps call a notifications API with a template name, an address and data. They must be known apps.
- The marketing team's **campaign tool** sends large campaigns.
- Every email is checked against the **suppression list** (unsubscribes and hard bounces), kept in an **Oracle** preferences database.
- Everything goes out through the company **mail relay**.

**Numbers and events**
- Apps: about **8 notifications a second**, and each caller expects an answer within half a second.
- Campaigns: about **50 a second for 30 minutes**, a few times a month.
- The relay takes about **20 sends a second**, and is down for maintenance for up to **40 minutes**.
- One availability zone failed for 20 minutes last year.
- In this model a queue consumer only takes what the boxes behind it have spare, nothing decides which consumer goes first, a rate limit on a consumer caps what it takes, one zone going down takes away the replicas in it, and a failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why two lanes, and what keeps the bulk lane from taking the whole relay?
- Where is the suppression list checked, and why there?
- Set the limits, the replicas and the gateway policy, and explain each.
- What does an app get back from the API, and what does that answer promise?
`,
  answerTemplate: `## Design

## Two lanes

## The suppression list

## Settings

## What the API promises
`,
  keyPoints: [
    'One service gives one suppression check, one set of templates and one relay account. Apps only describe what to send.',
    'Urgent and bulk mail wait in separate queues, and the bulk mailer is capped below the relay\'s limit, so a campaign never delays a password reset. Apps need about 8 a second, so a cap of 10 on the bulk mailer leaves them room.',
    'Check suppression in the mailers, at send time, not in the apps: an unsubscribe made a minute ago still counts, and no app can forget.',
    'The API answers 202 once the request is queued. It promises "accepted", not "delivered"; delivery is reported later through the send log.',
    'Redelivery limits above the relay\'s maintenance window, two replicas of the API and the urgent mailer, and a client ID policy at the gateway cover the events listed.',
    'Bounces and complaints from the relay feed back into the suppression list, or the list goes stale.',
  ],
  solution: `
**Design**
\`\`\`
Company apps ─► API gateway (client ID) ─► exp-notifications ~► notify.urgent ~► prc-urgent-mailer ─► Mail relay
                                                            ~► notify.urgent.dlq       └─► sys-preferences ─► Preferences Oracle
Campaign tool ~► notify.bulk ~► prc-bulk-mailer (≤ 10/s) ─► Mail relay
             ~► notify.bulk.dlq       └─► sys-preferences
\`\`\`

**Settings.** Gateway: client ID enforcement. \`exp-notifications\`, \`prc-urgent-mailer\`, \`sys-preferences\`: 2 replicas. \`prc-bulk-mailer\`: 15 a second. Both queues: 60 deliveries before the DLQ.

**The send log.** Each mailer writes a row per request (sent, suppressed, rejected, gave up) in Oracle, keyed by the request ID. That row answers "did the customer get it?" and stops a repeated request from sending twice.
`,
  followUps: [
    {
      q: 'An app needs to know when its email was delivered. How?',
      a: 'Offer GET /notifications/{requestId} that reads the send log, or a callback event. Delivered to the relay is what Mule can know; a real "opened" needs the provider\'s tracking.',
    },
    {
      q: 'How do you stop a buggy app from flooding the urgent lane?',
      a: 'A rate limit per client ID at the gateway. A runaway app gets 429s, and the other apps keep their share of the urgent mailer.',
    },
  ],
}
