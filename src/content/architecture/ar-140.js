import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-140',
  category: 'architecture',
  title: 'A System API That Retries a Flaky Carrier API',
  level: 'BEGINNER',
  tags: ['retries', 'resilience', 'system-api', 'third-party-api', 'timeouts', 'logistics'],
  estMinutes: 20,
  diagram: {
    task: 'draw the delivery quote path: a Web app box, an Experience API box, a Process API box, a System API box and a Third-party API box for the carrier. Connect them in that order. Only the System API talks to the carrier.',
    checks: [
      { label: 'The web shop calls the Experience API', rule: { type: 'edge', from: 'web-app', to: 'experience-api' } },
      { label: 'The Experience API calls the Process API', rule: { type: 'edge', from: 'experience-api', to: 'process-api' } },
      { label: 'The Process API calls the System API', rule: { type: 'edge', from: 'process-api', to: 'system-api' } },
      { label: 'Only the System API calls the carrier', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'A quote is a live question, so every line is a sync call', rule: { type: 'lines', touching: ['experience-api', 'process-api', 'system-api', 'external-api'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop checkout'],
        exp: ['experience-api', 'exp-checkout-api'],
        prc: ['process-api', 'prc-delivery-options'],
        sys: ['system-api', 'sys-carrier-api', { retries: 2, timeoutMs: 1500 }],
        car: ['external-api', 'Carrier rates API'],
      },
      ['web -> exp', 'exp -> prc', 'prc -> sys', 'sys -> car'],
    ),
    simulation: {
      systems: [{ match: 'external-api', latencyMs: 250 }],
      tests: [
        {
          name: 'The carrier drops 1 call in 5',
          about: 'The shop asks for 30 delivery quotes a second. For 20 minutes the carrier fails 1 call in 5 at random. Retries in the System API turn almost every failure into an answer.',
          traffic: [{ name: 'quotes', from: 'web-app', rps: 30, to: 'external-api' }],
          incidents: [{ errors: 'external-api', rate: 0.2, at: 5, forMin: 20 }],
          durationMin: 30,
          expect: { answers: [{ minSuccess: 0.99, maxMs: 1500 }] },
        },
        {
          name: 'The carrier is slow for 10 minutes',
          about: 'The carrier takes 8 seconds to answer for 10 minutes. The System API gives up after its timeout, so no shopper waits 8 seconds for a price, and the quotes that are answered stay fast.',
          traffic: [{ name: 'quotes', from: 'web-app', rps: 30, to: 'external-api' }],
          incidents: [{ slow: 'external-api', latencyMs: 8000, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ maxMs: 1500 }] },
        },
      ],
    },
  },
  description: `
An online garden centre shows delivery prices at checkout. For each basket, the web shop asks its APIs for a quote, and the **System API** \`sys-carrier-api\` asks the carrier's rates API.

What the team sees:
- The shop asks for about **30 quotes a second** at busy times.
- The carrier answers in about **250 ms**, but some days it fails about **1 call in 5** for a few seconds at a time. Shoppers then see "Delivery price not available" and many leave.
- Once a month the carrier is slow, about **8 seconds** per call, for several minutes.
- Quotes that are answered must come back in under **1.5 seconds** on average, even while the carrier is slow.

A quote only reads prices. Asking twice changes nothing at the carrier.

A **retry** sends a failed call again. A **timeout** is the longest a caller waits for an answer before it gives up.

**Questions:**
- Draw the path from the web shop to the carrier.
- Which API should retry the carrier, and how many times?
- What timeout would you set, and why does it matter when the carrier is slow?
`,
  answerTemplate: `## Design

## Where to retry

## How many retries

## The timeout
`,
  keyPoints: [
    'Short, random failures are what retries are for. A failure rate of 1 in 5 becomes about 1 in 125 with two retries.',
    'Retry in one place only: the System API that owns the carrier. Retries in every layer multiply the calls.',
    'A quote is a read, so sending it again is safe. A call that creates something needs care before you retry it.',
    'Keep the timeout short. Each retry waits for it again, so timeout and retries together set the worst wait.',
    'Retries do not help when the carrier is down or slow for minutes. They only add load, so keep the count small.',
  ],
  solution: `
**Design.**
\`\`\`
 Web shop ─► exp-checkout-api ─► prc-delivery-options ─► sys-carrier-api ─► Carrier rates API
\`\`\`

**Where to retry.** In \`sys-carrier-api\`. It is the one API that knows the carrier, so it is the right place to know which failures are worth another try. The Process and Experience APIs do not retry, or one shopper's click could become many carrier calls.

**How many retries.** Two, with a short pause between them. If 1 call in 5 fails at random, a call fails three times in a row only about 1 time in 125. That is more than 99% of quotes answered. In Mule the System API wraps the HTTP Request in an **Until Successful** scope. The reconnection strategy of the HTTP connector does not do this, because it retries connections, not failed responses.

**The timeout.** About 1.5 seconds. The carrier normally answers in 250 ms, so 1.5 seconds is generous. With two retries the worst wait is about 4.5 seconds. Without a timeout, an 8 second carrier keeps each request and its thread for 8 seconds or more, and the APIs run out of threads.

**What retries cannot fix.** When the carrier is slow for 10 minutes, every try times out. The shop should then show a standard delivery price or ask the shopper to try later.
`,
  followUps: [
    {
      q: 'Why not retry five times to be safe?',
      a: 'It barely improves on two for random failures, and when the carrier is in trouble it sends five times the load at the worst moment. It also makes the worst wait much longer.',
    },
    {
      q: 'Would you retry a call that books a collection with the carrier?',
      a: 'Only if the carrier can spot a repeat, for example with a booking reference you send. Otherwise a retry after a timeout can book two collections.',
    },
  ],
}
