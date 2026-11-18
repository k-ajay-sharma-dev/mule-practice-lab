import { diagram } from '../../arch/dsl.js'

const processor = { type: 'external-api', label: 'processor' }
const freezes = { name: 'card freezes', from: 'mobile-app', rps: 30, to: processor, kind: 'write' }
const controls = { type: 'process-api', label: 'card-controls' }

export default {
  id: 'uc-140',
  category: 'use-cases',
  title: 'Freeze My Card: the App Waits Two Seconds at Most, the Card Processor Gets Every Freeze Even When It Is Down, and Nothing Is Frozen Twice',
  level: 'EXPERT',
  tags: ['banking', 'cards', 'timeouts', 'queue', 'jwt', 'resilience', 'idempotency'],
  estMinutes: 50,
  diagram: {
    task: 'draw the banking app calling an API gateway that checks tokens, then an Experience API and a card-controls Process API. The Process API calls the card processor through a System API. Beside that call, it puts any freeze it could not finish on a pending queue that it reads itself, and the pending queue has a dead-letter queue.',
    checks: [
      { label: 'The app comes in through the API gateway', rule: { type: 'edge', from: 'mobile-app', to: 'api-gateway' } },
      { label: 'The Experience API is reached only through the gateway', rule: { type: 'only-via', target: 'experience-api', from: 'api-gateway' } },
      { label: 'The card-controls Process API calls the card processor through a System API', rule: { type: 'path', from: controls, via: 'system-api', to: processor } },
      { label: 'The card-controls Process API puts unfinished freezes on a queue', rule: { type: 'edge', from: controls, to: 'queue', kind: 'async' } },
      { label: 'The same Process API reads that queue', rule: { type: 'edge', from: 'queue', to: controls, kind: 'async' } },
      { label: 'The pending queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'The card processor is reached only through a System API', rule: { type: 'only-via', target: processor, from: 'system-api' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'Banking app'],
        gw: ['api-gateway', 'API gateway', { auth: 'jwt' }],
        exp: ['experience-api', 'exp-banking-app', { replicas: 2, vCores: '0.2' }],
        prc: ['process-api', 'prc-card-controls', { replicas: 2, vCores: '0.2', timeoutMs: 1500 }],
        q: ['queue', 'card-controls-pending', { maxRedelivery: 120 }],
        dlq: ['dlq', 'card-controls-pending DLQ'],
        sys: ['system-api', 'sys-card-processor', { replicas: 2, vCores: '0.2' }],
        proc: ['external-api', 'Card processor'],
      },
      ['app -> gw', 'gw -> exp', 'exp -> prc', 'prc -> sys', 'sys -> proc', 'prc ~> q', 'q ~> prc', 'q ~> dlq'],
    ),
    simulation: {
      systems: [{ match: 'external-api', latencyMs: 300, maxRps: 200 }],
      tests: [
        {
          name: 'An ordinary evening',
          about: 'Customers freeze and unfreeze 30 cards a second. Each one is answered within two seconds and reaches the card processor.',
          traffic: [freezes],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2000 }], delivered: [{ to: processor, min: 0.99 }], lost: { max: 0 } },
        },
        {
          name: 'The card processor is down for 20 minutes',
          about: 'The processor has an outage. The app still answers at once that the freeze is on its way, and every freeze reaches the processor once it is back.',
          traffic: [freezes],
          incidents: [{ down: processor, at: 5, forMin: 20 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2000 }], delivered: [{ to: processor, min: 0.99 }], lost: { max: 0 }, dlq: { max: 0 } },
        },
        {
          name: 'The card processor slows to 8 seconds',
          about: 'The processor answers in 8 seconds for 15 minutes. The app does not wait that long: the freeze is answered within two seconds and finished in the background.',
          traffic: [freezes],
          incidents: [{ slow: processor, latencyMs: 8000, at: 5, forMin: 15 }],
          durationMin: 40,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 2000 }], delivered: [{ to: processor, min: 0.99 }] },
        },
        {
          name: 'A call with no token',
          about: 'A script calls the freeze endpoint with no token. The gateway refuses it, and no card is touched.',
          traffic: [{ ...freezes, name: 'no token', rps: 10, auth: 'none' }],
          durationMin: 10,
          expect: { answers: [{ flow: 'no token', minRefused: 0.99 }], notReached: [{ flow: 'no token', node: processor }] },
        },
      ],
    },
  },
  description: `
A bank's **banking app** has a "freeze my card" button. A customer who has lost a card, or sees a payment they do not know, presses it and expects the card to stop working **at once**. The freeze is done by the bank's **card processor**, an outside company.

Today the app calls Mule, and Mule calls the processor and waits. When the processor is slow, the app spins for 30 seconds and the customer presses the button again, or gives up. When the processor is down, the freeze fails and customers phone the bank in a panic.

The product owner's rules:
- The app shows an answer within **2 seconds**: "frozen", or "your freeze is on its way and will be done within minutes".
- **Every** freeze reaches the processor, even if it is down for a while.
- A freeze pressed twice, or sent again after a timeout, must not cause errors or an unfreeze.
- Only the signed-in owner of a card can freeze it.

**Numbers**
- About **30 freezes and unfreezes a second** at the evening peak, much more after news of a data breach.
- The processor normally answers in about 300 ms. It has had outages of 20 minutes and slow spells of 8 seconds.

**Questions:**
- Draw the design.
- How does the app get an answer within 2 seconds when the processor is slow or down?
- How does every freeze still reach the processor?
- How do you stop a repeat from doing harm?
- Where is the customer's identity checked?
`,
  answerTemplate: `## Design

## Answering within 2 seconds

## Finishing every freeze

## Repeats and ordering

## Who may freeze a card
`,
  keyPoints: [
    'Try the processor first with a timeout well under the 2 second budget. Most freezes are done within a second and the app says "frozen".',
    'A freeze that times out or fails goes on a pending queue, and the app is told it is on its way. The same Process API reads the queue and tries again.',
    'A timeout does not mean the freeze failed. The processor may have done it, so the retry must be safe to repeat.',
    'Send each freeze with an idempotency key, and send the state wanted ("frozen") rather than a toggle, so a repeat changes nothing.',
    'Keep freezes and unfreezes of one card in order. An old freeze retried after a newer unfreeze must not win: compare a timestamp or version, or keep one queue position per card.',
    'Check the JWT at the gateway, then check in the Experience API that the card belongs to the customer in the token.',
  ],
  solution: `
**Design**
\`\`\`
Banking app ─► API gateway (JWT) ─► exp-banking-app ─► prc-card-controls ─► sys-card-processor ─► Card processor
                                                         │      ▲
                                                         └~► card-controls-pending ~┘
                                                                  ~► DLQ
\`\`\`

**Answering within 2 seconds.** \`prc-card-controls\` calls the processor through \`sys-card-processor\` with a timeout of 1.5 seconds. On success the app says "frozen". On a timeout or an error, the Process API puts the freeze on \`card-controls-pending\` and answers 202, and the app says "on its way". Either way the customer has an answer within 2 seconds.

**Finishing every freeze.** The same Process API reads \`card-controls-pending\` and calls the processor again. During an outage the deliveries fail and the freezes wait. In this model a failed delivery is tried again about once a minute, so a limit of 120 covers two hours. After that a freeze moves to the DLQ, and the bank's fraud team blocks the card by hand. A push message tells the customer when a pending freeze is done.

**Repeats and ordering.** The request carries an idempotency key from the app, and the wanted state. The processor, or a table in the System API, ignores a key it has seen. Each request also carries the time the customer pressed the button, and the Process API drops a pending request older than the last one done for that card.

**Who may freeze a card.** The gateway checks the JWT: signature, issuer, audience and expiry. The Experience API checks that the card number in the request belongs to the customer ID in the token, so one customer can never freeze another's card.

**Sizing.** Two replicas of 0.2 vCore for each API is enough for the evening peak and survives a zone failure. For a breach spike, the pending queue absorbs what the processor cannot take at once.
`,
  followUps: [
    {
      q: 'Why not always put the freeze on the queue and answer at once?',
      a: 'Most of the time the processor answers in 300 ms, and "frozen" is a much better answer than "on its way". Trying first gives the best answer when things are healthy, and the queue only when they are not.',
    },
    {
      q: 'Should card payments be refused while a freeze is pending?',
      a: 'If the bank also runs its own authorisation checks, it can mark the card as blocked there at once, before the processor confirms. That closes the window in which a thief can still pay.',
    },
  ],
}
