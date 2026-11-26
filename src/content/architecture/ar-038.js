export default {
  id: 'ar-038',
  category: 'architecture',
  title: 'Retry Policies Without Retry Storms',
  level: 'ADVANCED',
  tags: ['retries', 'backoff', 'resilience', 'until-successful', 'reconnection'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Mobile (4 attempts) → Experience (4 attempts) → Process (4 attempts) → Inventory System API. Worst case, how many HTTP calls reach the System API for one tap?',
      options: ['12', '16', '64', '4'],
      answer: 2,
      explain: 'Retries **multiply**, not add: 4 × 4 × 4 = 64 calls, and more at the DB with its own reconnects, exactly when the database is weakest.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Where should automatic retries live in this chain?',
      options: [
        'At every layer, so each one is resilient on its own',
        'Only in the mobile app, which knows the user',
        'Only in the System API next to the database; outer layers fail fast',
        'Only at the API gateway, so no app needs retry logic',
      ],
      answer: 2,
      explain: 'The layer next to the dependency knows which errors are transient (deadlock) and which are not (constraint violation). Outer layers retrying too is what creates the storm.',
    },
    {
      type: 'multi',
      prompt: 'A Mule app calls a backend API with `GET` requests and can retry failed calls with backoff. A retry only helps if the failure is transient. Which three failures should it retry?',
      options: [
        '`HTTP:CONNECTIVITY`',
        '503 Service Unavailable',
        '429 Too Many Requests',
        '400 Bad Request',
        '403 Forbidden',
      ],
      answer: [0, 1, 2],
      explain: 'Retry only transient failures. `HTTP:CONNECTIVITY` is safe to retry here because a GET is idempotent, and a 429 retry should respect `Retry-After`. A transient database deadlock is another retryable failure. A 400 or 403 will fail again on every attempt, so retrying it only adds load.',
    },
    {
      type: 'single',
      prompt: '`POST /bookings` times out. What makes a retry safe?',
      options: [
        'A GET on the booking list first, to check no booking was made',
        'A longer timeout, so the first attempt can finish before a retry',
        'A client Idempotency-Key that the API stores with the result',
        'A single retry after 5 seconds, so the first call has finished',
      ],
      answer: 2,
      explain: 'A timeout means the outcome is unknown. With an idempotency key and server-side de-duplication, a repeat returns the original booking instead of creating a duplicate.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'You want exponential backoff with jitter on a synchronous call in Mule 4. What is true about `until-successful`?',
      options: [
        'It supports exponential backoff out of the box via `backoffMultiplier`',
        'It waits a fixed `millisBetweenRetries`, so growing delays need custom logic',
        'It retries only connectivity errors, so a 503 is never retried',
        'It automatically skips non-retryable errors such as 400',
      ],
      answer: 1,
      explain: '`until-successful` uses a fixed delay. For growing, randomised delays you compute the wait yourself, and you filter error types so non-retryable errors are raised immediately.',
    },
    {
      type: 'single',
      prompt: 'After a 30-second database outage, 2,000 mobile clients retry with exponential backoff of 1 s, 2 s and 4 s, with no jitter. The database recovers, then falls over again a few seconds later. Which change fixes this?',
      options: [
        'Raise the base delay to 5 seconds and keep the same exponential steps',
        'Cut the attempts from 3 to 1, so each client retries only once',
        'Let each client wait a random time within its backoff window before it retries',
        'Switch to a fixed 2-second delay, so the load is the same on each retry',
      ],
      answer: 2,
      explain: 'The clients failed at the same moment, so without jitter they also retry at the same moments and hit the recovering database in waves. Random jitter spreads the retries over the delay window, so the database sees a steady trickle. A longer base delay or fewer attempts only move or shrink the wave, and a fixed delay keeps every client in lockstep.',
    },
  ],
  description: `
An airline's **Booking** chain had an outage that turned a 2-minute database hiccup into a 45-minute incident:

\`\`\`
Mobile app (retries 3×) → Booking Experience API (until-successful 3×)
  → Booking Process API (until-successful 3×)
     → Inventory System API (HTTP reconnection 3×, DB reconnect forever)
        → Inventory DB
\`\`\`

During the hiccup, the DB received far more queries than normal, kept collapsing as it recovered, and all apps exhausted their threads. Post-mortem notes:
- Every layer retries independently with fixed 1-second delays.
- \`POST /bookings\` is retried by the Experience API even after a timeout, sometimes creating duplicate bookings.
- Retries happen on **400 Bad Request** too.

**Questions:**
- Calculate the worst-case amplification of one user request reaching the DB.
- Where should retries happen, and where should they not?
- Which errors are retryable, and how do you make non-idempotent operations safe to retry?
- Describe a backoff policy and how you would implement it in Mule 4 (synchronous and asynchronous flows).
`,
  answerTemplate: `## Amplification calculation

## Where to retry (and not)

## Retryable errors and idempotency

## Backoff policy and Mule implementation
`,
  keyPoints: [
    'Retries multiply across layers: 4 attempts at each of the 3 retrying layers (app, Experience, Process) gives up to 4^3 = 64 System API calls for one user action: and more at the DB.',
    'Retry at one layer only, ideally the one closest to the failing dependency, and let outer layers fail fast with a clear error.',
    'Retry only transient failures (connectivity errors, timeouts, 502/503/504, 429 with Retry-After); never retry 4xx validation or authorization errors.',
    'Non-idempotent operations need an idempotency key (and de-duplication on the server) before they can be retried safely after a timeout.',
    'Use exponential backoff with jitter and a retry budget/total deadline; in synchronous paths keep retries few and short, in asynchronous paths use broker redelivery with delays and a DLQ.',
    'Combine retries with circuit breaking so a dependency that is clearly down stops receiving traffic.',
  ],
  solution: `
**Amplification.** Mobile 1 + 3 retries = 4 attempts; each Experience attempt → 4 Process attempts; each → 4 System attempts at HTTP level; each → DB reconnect attempts. Worst case **4 × 4 × 4 = 64** HTTP calls to the System API per tap, more at the DB: exactly when the DB is weakest. Fixed 1 s delays make all clients retry **in sync**, creating waves.

**Where to retry.**
- **One layer:** the System API closest to the DB/backend, because it knows the error semantics (a deadlock is transient; a constraint violation is not).
- Process and Experience layers: **no automatic retries** on synchronous calls (or a single retry for idempotent GETs on connection failure). They propagate a clear 503 with \`Retry-After\`.
- Mobile app: a user-visible "try again" or one automatic retry with backoff: not three blind retries.
- Connector **reconnection strategies** are for establishing connections at startup or after drops; avoid "reconnect forever" in request paths where it hides failures and holds threads.

**Retryable errors.**
- Retry: \`HTTP:CONNECTIVITY\`, \`HTTP:TIMEOUT\` (only if idempotent), 502/503/504, 429 respecting \`Retry-After\`, DB transient errors (deadlock, connection reset).
- Do **not** retry: 400/401/403/404/409/422, validation and business errors.
- **Idempotency for POST /bookings:** the client sends an \`Idempotency-Key\`; the Process API stores key → result (e.g. Object Store with TTL) and returns the stored result on repeat. Only then is a retry after timeout safe.

**Backoff policy.**
- Exponential backoff with **jitter**: e.g. 200 ms, 400 ms, 800 ms ± random, max 3 attempts, with an overall **deadline** that fits the caller's timeout budget.
- **Retry budget:** retries may add at most ~10% extra load; beyond that, fail fast.

**Mule 4 implementation.**
- Synchronous: \`until-successful\` uses a **fixed** \`millisBetweenRetries\`; for exponential/jittered backoff, implement a small retry loop (e.g. a sub-flow with a counter and a computed wait) or a reusable custom module; wrap only the specific call, with an \`on-error-continue\`/error-type filter so non-retryable errors are raised immediately.
- Asynchronous (Anypoint MQ): **nack** and let the broker redeliver, use the queue's max delivery count and **DLQ**; for increasing delays, republish to a delay/retry queue with a delay per attempt. Batch/async processing tolerates longer backoff than user-facing calls.
- Add a **circuit breaker** in front of the DB/System API so that after N consecutive failures callers fail fast for a cool-down period instead of retrying.
`,
  followUps: [
    { q: 'Why add jitter?', a: 'Without jitter, all clients that failed at the same moment retry at the same moments, producing synchronized load spikes. Random jitter spreads retries over time and lets the dependency recover.' },
    { q: 'Should the gateway retry?', a: 'Generally no for non-idempotent calls; a gateway retry is invisible to the application and multiplies load. If used at all, restrict it to idempotent GETs on connection failures.' },
    { q: 'How do you know retries are hurting you?', a: 'Log and measure attempts per request (attempt number in logs, retry counters as metrics). A rising ratio of attempts to requests during an incident is a clear storm signal.' },
  ],
}
