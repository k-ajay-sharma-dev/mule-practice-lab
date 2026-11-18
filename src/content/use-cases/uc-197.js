import { diagram } from '../../arch/dsl.js'

const resets = { name: 'password resets', from: 'web-app', rps: 3, to: 'notification', kind: 'write' }
const campaign = { name: 'campaign emails', from: 'saas', rps: 60, forMin: 30, to: 'notification', kind: 'write' }

export default {
  id: 'uc-197',
  category: 'use-cases',
  title: 'A Marketing Campaign Must Not Delay Password Resets: Two Queues and Two Mailers on One Mail Relay, With a Rate Limit That Keeps Room for the Urgent Mail',
  level: 'ADVANCED',
  tags: ['myproject', 'email', 'smtp', 'queues', 'rate-limit', 'priority', 'dlq'],
  estMinutes: 45,
  diagram: {
    task: 'draw the campaign tool putting campaign emails on a bulk queue, read by a bulk mailer Process API. Draw the web shop\'s account Experience API putting password reset emails on a transactional queue, read by a transactional mailer Process API. Both mailers send through the same mail relay. Each queue has its own dead-letter queue.',
    checks: [
      { label: 'Password resets and campaign emails wait on different queues', rule: { type: 'node', match: 'queue', min: 2 } },
      { label: 'Password resets reach the relay through their own queue', rule: { type: 'path', from: 'web-app', via: { type: 'queue', label: 'transactional' }, to: 'notification' } },
      { label: 'Campaign emails reach the relay through the bulk queue', rule: { type: 'path', from: 'saas', via: { type: 'queue', label: 'bulk' }, to: 'notification' } },
      { label: 'Campaign emails never reach the transactional queue', rule: { type: 'no-path', from: 'saas', to: { type: 'queue', label: 'transactional' } } },
      { label: 'Every queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
    ],
    reference: diagram(
      {
        camp: ['saas', 'Campaign tool'],
        qB: ['queue', 'email.bulk', { maxRedelivery: 30 }],
        dB: ['dlq', 'email.bulk.dlq'],
        prcB: ['process-api', 'prc-bulk-mailer', { rateLimit: 15 }],
        web: ['web-app', 'Web shop'],
        exp: ['experience-api', 'exp-account'],
        qT: ['queue', 'email.transactional', { maxRedelivery: 30 }],
        dT: ['dlq', 'email.transactional.dlq'],
        prcT: ['process-api', 'prc-transactional-mailer'],
        mail: ['notification', 'Mail relay'],
      },
      ['camp ~> qB', 'qB ~> prcB', 'qB ~> dB', 'prcB -> mail', 'web -> exp', 'exp ~> qT', 'qT ~> prcT', 'qT ~> dT', 'prcT -> mail'],
    ),
    simulation: {
      systems: [{ match: 'notification', latencyMs: 300, maxRps: 20 }],
      tests: [
        {
          name: 'Campaign day',
          about: 'The campaign tool queues 60 emails a second for half an hour, far more than the relay\'s 20. Password resets still go out as they come; the campaign drains at its own pace.',
          traffic: [campaign, resets],
          durationMin: 40,
          expect: { delivered: [{ flow: 'password resets', to: 'notification', min: 0.99 }], peakRps: [{ node: 'notification', max: 20 }], dlq: { max: 0 } },
        },
        {
          name: 'The whole campaign goes out',
          about: 'Given time, every campaign email is sent, with none on a dead-letter queue.',
          traffic: [campaign, resets],
          durationMin: 180,
          expect: { delivered: [{ flow: 'campaign emails', to: 'notification', min: 0.99 }], dlq: { max: 0 }, lost: { max: 0 } },
        },
        {
          name: 'Addresses that bounce',
          about: 'One campaign email in 100 goes to an address the relay refuses every time. Those end on the bulk dead-letter queue instead of circling.',
          traffic: [{ ...campaign, poison: 0.01, forMin: 10 }],
          durationMin: 150,
          expect: { dlq: { min: 1 }, backlog: [{ queue: { type: 'queue', label: 'bulk' }, maxEnd: 0 }] },
        },
      ],
    },
  },
  description: `
Marrow & Pine Home, a fictional homewares retailer, sends two kinds of email through one company **mail relay**:
- **Transactional**: password resets, order confirmations. A shopper is waiting for each one.
- **Campaign**: the marketing team's campaign tool sends to 100,000 customers at once.

Both used one queue. On campaign day the queue held two hours of campaign emails, and password resets waited behind them. Shoppers gave up and called customer service.

**Numbers**
- The relay takes about **20 sends a second** in total.
- Password resets: about **3 a second**.
- The campaign tool queues about **60 a second for 30 minutes**.
- About **1 campaign email in 100** goes to an address that bounces every time.
- In this model a queue consumer only takes what the boxes behind it have spare, and nothing decides which of two consumers goes first; a rate limit on a consumer caps what it takes. A failed delivery is tried again about once a minute.

**Questions:**
- Draw the design.
- Why do two queues alone not guarantee that resets go first? What setting does?
- How long does the campaign take to go out?
- Set the redelivery limits.
`,
  answerTemplate: `## Design

## Keeping room for urgent mail

## How long the campaign takes

## Redelivery limits
`,
  keyPoints: [
    'One queue is first come, first served. Urgent mail behind a campaign waits for the campaign.',
    'Two queues give two lines, but both mailers draw on one relay. If the bulk mailer takes all 20 sends a second, the reset mailer still waits.',
    'A rate limit of 15 a second on the bulk mailer keeps 5 a second free for transactional mail, which needs about 3.',
    'The campaign then drains at 15 a second: 108,000 emails take about two hours. Marketing should know that before they promise a launch time.',
    'Each queue gets a limit and a DLQ of its own, so a bounce storm from the campaign never touches transactional mail.',
  ],
  solution: `
**Design**
\`\`\`
Campaign tool ~► email.bulk ~► prc-bulk-mailer (≤ 15/s) ─► Mail relay
              ~► email.bulk.dlq                            ▲
Web shop ─► exp-account ~► email.transactional ~► prc-transactional-mailer
                       ~► email.transactional.dlq
\`\`\`

**Settings.** \`prc-bulk-mailer\`: rate limit 15 a second. Both queues: 30 deliveries before the DLQ.

**In Mule.** The bulk mailer's pace can come from its consumer settings (prefetch and concurrency) plus a fixed wait, since a rate limit policy guards an API's inbound calls, not a queue consumer. The point is the same: the bulk side takes a set share of the relay.

**A second relay account.** Many providers sell a bulk sending service with its own limits. Moving campaigns there removes the contest altogether.
`,
  followUps: [
    {
      q: 'Marketing wants the campaign out in 30 minutes. What do you say?',
      a: 'At this relay\'s limit that is not possible without starving resets. A bulk sending service, or a higher limit for a separate account, is the way to buy that speed.',
    },
    {
      q: 'Does order of drawing or deploying decide which mailer goes first in real life?',
      a: 'No, and that is the problem: competing consumers take what they can get. Priority has to be designed in with a limit, a reserved share, or separate relay accounts.',
    },
  ],
}
