import { diagram } from '../../arch/dsl.js'

const balances = { name: 'balance checks', from: 'mobile-app', rps: 400, to: { type: 'database', label: 'balance' } }
const payments = { name: 'payments', from: 'mobile-app', rps: 40, to: 'legacy', kind: 'write' }
const queue = { type: 'queue', label: 'payment' }

export default {
  id: 'ar-149',
  category: 'architecture',
  title: 'A Core Banking System That Goes Offline Every Night: Balances From a Copy, Payments Held in a Queue Until It Is Back',
  level: 'EXPERT',
  tags: ['legacy', 'core-banking', 'batch-window', 'store-and-forward', 'read-models', 'anypoint-mq', 'banking'],
  estMinutes: 60,
  diagram: {
    task: 'draw the app\'s two paths: balance checks through the Experience API and a balances Process API to a balance copy database, and payments through a payments Process API onto a payment queue with a dead-letter queue, drained by a payment poster that posts to the core through its System API and then updates the balance copy.',
    checks: [
      { label: 'Balance checks read the balance copy through a balances Process API', rule: { type: 'path', from: 'experience-api', via: { type: 'process-api', label: 'balance' }, to: { type: 'database', label: 'balance' } } },
      { label: 'Balance checks never reach the core banking system', rule: { type: 'no-path', from: { type: 'process-api', label: 'balance' }, to: 'legacy' } },
      { label: 'Payments wait on a queue before they are posted to the core', rule: { type: 'path', from: { type: 'process-api', label: 'payments' }, via: queue, to: 'legacy' } },
      { label: 'No chain of sync calls joins the app to the core', rule: { type: 'no-path', from: 'mobile-app', to: 'legacy', kind: 'sync' } },
      { label: 'The payment queue has a dead-letter queue', rule: { type: 'each', of: queue, edgeTo: 'dlq' } },
      { label: 'The core is reached only through its System API', rule: { type: 'only-via', target: 'legacy', from: 'system-api' } },
      { label: 'The payment poster updates the balance copy after each posting', rule: { type: 'edge', from: { type: 'process-api', label: 'poster' }, to: { type: 'database', label: 'balance' } } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Credit union app'],
        exp: ['experience-api', 'exp-banking-app', { replicas: 2, vCores: '1' }],
        bal: ['process-api', 'prc-balances', { vCores: '1' }],
        copy: ['database', 'Balance copy (available balance per account)'],
        pay: ['process-api', 'prc-payments', { vCores: '0.5' }],
        q: ['queue', 'payments-to-post', { maxRedelivery: 100 }],
        dlq: ['dlq', 'payments-to-post DLQ'],
        post: ['process-api', 'prc-payment-poster', { vCores: '0.5' }],
        sys: ['system-api', 'sys-core-postings', { vCores: '0.5' }],
        core: ['legacy', 'Core banking system'],
        sync: ['batch-job', 'Balance refresh after the nightly batch'],
      },
      [
        'app -> exp', 'exp -> bal', 'bal -> copy',
        'exp -> pay', 'pay ~> q', 'q ~> post', 'q ~> dlq', 'post -> sys', 'sys -> core', 'post -> copy',
        'sync -> sys', 'sync -> copy',
      ],
    ),
    simulation: {
      systems: [
        { match: 'legacy', latencyMs: 300, maxRps: 100 },
        { match: 'database', latencyMs: 5 },
      ],
      tests: [
        {
          name: 'Evening peak',
          about: 'Members check balances 400 times a second and send 40 payments a second. Balances come back fast, and every payment is posted to the core.',
          traffic: [balances, payments],
          durationMin: 30,
          expect: {
            answers: [{ minSuccess: 0.99 }, { flow: 'balance checks', maxMs: 300 }],
            delivered: [{ flow: 'payments', to: 'legacy', min: 0.99 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The nightly batch window',
          about: 'The core is offline for an hour, and the broker restarts in the middle of it. Balances and new payments are still accepted. Payments wait in the queue, none is lost or given up, and the queue is empty again within the hour after the core is back.',
          traffic: [balances, payments],
          incidents: [{ down: 'legacy', at: 10, forMin: 60 }, { restart: 'queue', at: 40 }],
          durationMin: 140,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            lost: { max: 0 },
            dlq: { max: 0 },
            backlog: [{ queue, maxEnd: 0 }],
          },
        },
        {
          name: 'Some payments are to closed accounts',
          about: 'One payment in 100 is to an account the core has closed, and the core refuses it every time. Those payments end up in the dead-letter queue for the operations team, and the rest are posted.',
          traffic: [balances, { ...payments, poison: 0.01 }],
          durationMin: 150,
          expect: { delivered: [{ flow: 'payments', to: 'legacy', min: 0.98 }], dlq: { min: 100 }, lost: { max: 0 } },
        },
      ],
    },
  },
  description: `
A credit union runs a **core banking system** from the 1990s. Every night from 23:30 to 00:30 it goes **offline for its end-of-day batch**: interest, fees, statements. It answers nothing during that hour.

Members use the **app** at all hours. Today the app's APIs call the core for every balance and every payment, so for an hour each night the app shows "Service unavailable". Night-shift workers, people paying for taxis and anyone abroad complain every week.

What the team knows:
- At the evening peak, members check balances about **400 times a second** and send about **40 payments a second**.
- The core can take about **100 requests a second**. It answers in about **300 ms**.
- About 1 payment in 100 goes to an account that has been closed. The core refuses it every time.
- The core has a postings interface that accepts one payment at a time, and refuses a payment it has already posted if it is sent again with the same reference.
- A **balance copy** database can hold each account's available balance. After the batch, a job can refresh it from the core.

The board's rules:
- Members must see a balance at any hour. It may be a little behind during the batch, if the app says so.
- A payment accepted by the app must never be lost, even if the broker restarts.
- Payments must reach the core in the order they were made for each account.

**Questions:**
- Draw a design that keeps the app working through the batch window.
- How do balances stay correct while payments are waiting?
- How many deliveries should a payment get before it goes to the dead-letter queue?
- What must the payment poster do to keep each account's payments in order?
`,
  answerTemplate: `## Design

## Balances

## Payments during the window

## The redelivery limit

## Order per account

## After the window
`,
  keyPoints: [
    'Split reads from writes. Balances come from a copy the integration owns. Payments go onto a queue and are posted when the core can take them.',
    'Nothing the app calls should wait on the core. A balance check that reaches the core fails for the whole window.',
    'The poster updates the balance copy after each posting, and the app takes pending payments off the available balance at once, so members do not spend the same money twice.',
    'A persistent queue keeps payments through a broker restart. A payment accepted by the app is then never lost.',
    'Set the redelivery limit above the number of tries a payment gets during a whole window, or good payments end up in the DLQ every night. Refused payments still reach it.',
    'Keep each account\'s payments in order with one consumer per account group, such as a FIFO queue or message groups keyed by account.',
    'The core refuses a repeated reference, so posting is safe to retry after a timeout.',
  ],
  solution: `
**Design**
\`\`\`
Credit union app ─► exp-banking-app ─┬─► prc-balances ─► Balance copy
                                     └─► prc-payments ~► payments-to-post ~► prc-payment-poster ─► sys-core-postings ─► Core banking system
                                                              ~► DLQ                ─► Balance copy
Balance refresh after the nightly batch ─► sys-core-postings, and ─► Balance copy
\`\`\`

**Balances.** \`prc-balances\` answers from the balance copy, never from the core. When \`prc-payments\` accepts a payment it takes the amount off the available balance in the copy at once, so a member who pays at 23:45 sees the lower balance and cannot spend the money twice. After the batch the refresh job reads the core's balances, which now include interest and fees, and corrects the copy. The app shows "balance as at 23:30, pending items taken off" during the window.

**Payments during the window.** \`prc-payments\` checks the payment against the available balance, publishes it to the persistent queue \`payments-to-post\` and answers "accepted". The poster tries to post it. While the core is down every try fails and the payment waits. About 144,000 payments build up in the hour. When the core is back, the poster drains them at what the core has left after live payments: about 60 a second, so roughly 40 minutes.

**The redelivery limit.** A payment made at 23:31 is delivered again and again for an hour: about once a minute in this model. With a limit of 10 it would go to the DLQ before the core came back. A limit of 100 rides out the window, and a payment to a closed account still reaches the DLQ about 100 minutes after its first try. The operations team returns those to the member's account and tells them.

**Order per account.** Two payments from one account must post in the order made, or the second could bounce. Use a FIFO queue, or message groups keyed by account ID, so one consumer handles an account at a time. Accounts are many, so this still spreads the work.

**Sizing.** The Experience API carries 440 requests a second: two replicas of one vCore. \`prc-balances\` carries 400 a second: one vCore. The payment path carries 40 a second, and the core's 100 a second limits the drain, so half a vCore each is enough.
`,
  followUps: [
    {
      q: 'Why not keep a cache of balances in front of the core instead of a copy?',
      a: 'A cache only answers what someone asked recently, and misses go to the core, which is offline. The copy holds every account, and the integration keeps it current itself.',
    },
    {
      q: 'What if a payment is accepted against the copy but the core then refuses it for lack of funds?',
      a: 'It goes to the DLQ like a closed account. Release the amount in the copy and tell the member. Keeping pending items in the copy makes this rare.',
    },
    {
      q: 'Could the poster post in bulk after the window instead of one by one?',
      a: 'If the core has a bulk interface, yes, and the queue drains faster. Keep the per-account order inside each bulk, and keep the same references so a repeated bulk is refused rather than posted twice.',
    },
  ],
}
