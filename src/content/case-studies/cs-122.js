export default {
  id: 'cs-122',
  category: 'case-studies',
  title: 'Ticketing Company Surviving On-Sale Spikes for a Stadium Tour',
  level: 'EXPERT',
  tags: ['myproject', 'ticketing', 'spikes', 'rate-limiting', 'queues', 'inventory', 'resilience'],
  estMinutes: 50,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'At 10:00 two million fans arrive for 300,000 seats. What protects the seat inventory system?',
      options: [
        'A waiting room in front that lets buyers in at the rate the inventory system can handle',
        'Scaling the inventory system to two million parallel requests for ten minutes',
        'Rejecting every request above the limit with 429 and asking fans to refresh',
        'Letting each buyer reserve seats without checking availability first',
      ],
      answer: 0,
      explain: 'The inventory system has a hard limit on how fast it can lock seats. A waiting room admits buyers at that rate and keeps a fair order. Rejecting with 429 invites refresh storms, and the core cannot scale to that peak.',
    },
    {
      type: 'single',
      prompt: 'A buyer picks seats and goes to payment. How long are the seats held?',
      options: [
        'A short hold with an expiry, released automatically if payment does not finish',
        'Until the buyer closes the browser',
        'Until the end of the on-sale day',
        'No hold, the seats are only taken when payment succeeds',
      ],
      answer: 0,
      explain: 'A hold with an expiry stops two buyers paying for the same seat, and returns seats to sale when a buyer gives up. No hold means double selling, and long holds lock seats away from real buyers.',
    },
    {
      type: 'multi',
      prompt: 'Which three API policies or limits belong on the public purchase API?',
      options: [
        'A rate limit per client to stop scripts from flooding the API',
        'A spike control that smooths bursts before they reach the backend',
        'Client ID enforcement so every caller is known',
        'Removing authentication during the on-sale to make it faster',
      ],
      answer: [0, 1, 2],
      explain: 'Known callers, a per client limit and spike smoothing protect the backend and make bots visible. Dropping authentication helps bots most.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The payment provider slows down under load. Orders wait 40 seconds and the queue grows. What do you change?',
      options: [
        'Take the payment asynchronously: confirm the hold, process payment from a queue, and tell the buyer when it is done',
        'Retry each payment call five times in the request',
        'Remove the seat hold expiry so slow payments still succeed',
        'Send every payment to two providers at once',
      ],
      answer: 0,
      explain: 'Moving payment off the request path keeps the front end responsive. The hold still expires, but its length can be set to cover a slow payment window. Retries in the request add load to a slow provider.',
    },
    {
      type: 'match',
      prompt: 'Match each part to the job it does.',
      pairs: [
        ['Waiting room', 'Admits buyers at a safe rate, in a fair order'],
        ['Seat hold with expiry', 'Stops double selling and frees abandoned seats'],
        ['Payment queue', 'Keeps orders safe while the payment provider is slow'],
        ['Rate limit per client', 'Stops one script from taking the capacity'],
      ],
      explain: 'Each part handles one failure: the crowd, double selling, a slow dependency and abuse.',
    },
    {
      type: 'order',
      prompt: 'Order the preparation for the on-sale.',
      items: [
        'Measure how many seat locks a second the inventory system handles',
        'Set the waiting room admission rate below that number',
        'Load test the full purchase path with realistic traffic',
        'Run a rehearsal on a smaller on-sale',
        'Staff a war room with clear rollback steps on the day',
      ],
      explain: 'The real limit sets the admission rate, load tests prove the path, a smaller sale proves the operations, and the day is run with a plan.',
    },
  ],
  description: `
**Context.** A ticketing company sells tickets for concerts and sport. A stadium tour goes on sale on Friday at 10:00: **300,000 seats**, and marketing expects **two million fans** in the first ten minutes.

**The last big on-sale**
- The seat inventory system, an old core system, locked up after 90 seconds.
- Fans refreshed again and again, which doubled the load.
- Some seats were sold twice and had to be refunded.
- Bots bought blocks of tickets for resale.

**Facts**
- The inventory system can lock about 1,500 seats a second, and that cannot be raised before Friday.
- Purchases go through a public purchase API on the Anypoint platform, then a process API, then the inventory system and a payment provider.
- The payment provider slows down when its own load is high.

**Opinions**
- CTO: "Scale everything to the peak."
- Head of customer care: "Fairness matters more than speed."
- Security lead: "This time the bots must lose."

**Your task.** Design how the on-sale is protected end to end, from the fan arriving to the ticket being confirmed.
`,
  answerTemplate: `## Decision

## Admitting the crowd

## Holding and selling seats

## Payment under load

## API protection and bots

## Preparation and the day

## Risks
`,
  keyPoints: [
    'The inventory system limit (about 1,500 seat locks a second) sets the pace; the front must match it.',
    'A waiting room admits buyers at that rate in a fair order, which stops refresh storms.',
    'Seats are held with a short expiry, so nothing is sold twice and abandoned seats return.',
    'Payment moves to a queue so a slow provider does not block buyers.',
    'Client ID enforcement, a per client rate limit and spike control protect the API and expose bots.',
    'Load tests, a rehearsal and a war room plan make the day predictable.',
  ],
  solution: `
**Decision.** Pace the sale to what the inventory system can do, and protect every step behind it.

**Admitting the crowd.** A waiting room in front of the shop gives each fan a place in line and admits buyers at a rate below 1,500 seat locks a second. Fans see their position, so they stop refreshing.

**Holding seats.** When a buyer picks seats, the process API places a hold with a short expiry, such as eight minutes. If payment does not finish, the hold expires and the seats return to sale. No seat is sold twice.

**Payment.** The purchase API confirms the hold and puts a payment request on a queue. A consumer calls the payment provider at a rate it can take, with retries and backoff. The buyer sees "payment in progress" and then a confirmation.

**API protection.** Client ID enforcement on the purchase API, a rate limit per client, and spike control in front of the process API. Purchases per account are limited, and odd patterns are flagged for review.

**Preparation.** Measure the real lock rate, load test the full path, rehearse on a smaller on-sale, and run the day from a war room with clear steps to slow admission if errors rise.

**Risks.** A hold time that is too short for slow payments, the waiting room itself as a single point of failure, and bots that use many accounts.
`,
  followUps: [
    { q: 'Why not return 429 and let fans retry?', a: 'Fans retry at once and in bulk, which raises the load. A waiting room gives a fair place in line instead.' },
    { q: 'How do you choose the hold time?', a: 'Long enough for most buyers to pay, including a slow payment window, and short enough that abandoned seats return quickly. Measure it in the rehearsal.' },
    { q: 'What do you watch during the on-sale?', a: 'Seat lock rate and errors on the inventory system, queue depth and age for payments, hold expiries, and rejected calls by client.' },
    { q: 'Can policies alone stop bots?', a: 'They limit and expose them. Account limits, checks at sign-up and review of unusual buying patterns are also needed.' },
  ],
}
