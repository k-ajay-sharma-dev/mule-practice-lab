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
      prompt: 'Mobile (4 attempts) → Experience (4 attempts) → Process (4 attempts) → Inventory System API. Worst case, how many HTTP calls reach the System API for one tap?',
      options: ['12', '16', '64', '4'],
      answer: 2,
      explain: 'Retries **multiply**, not add: 4 × 4 × 4 = 64 calls — and more at the DB with its own reconnects — exactly when the database is weakest.',
    },
    {
      type: 'single',
      prompt: 'Where should automatic retries live in this chain?',
      options: [
        'At every layer, so each one is resilient on its own',
        'Only in the mobile app, which knows the user',
        'At one layer — the System API closest to the database — while outer layers fail fast with 503 and Retry-After',
        'Only at the API gateway',
      ],
      answer: 2,
      explain: 'The layer next to the dependency knows which errors are transient (deadlock) and which are not (constraint violation). Outer layers retrying too is what creates the storm.',
    },
    {
      type: 'multi',
      prompt: 'Which failures are reasonable to retry (with backoff)?',
      options: [
        '`HTTP:CONNECTIVITY` on an idempotent GET',
        '503 Service Unavailable',
        '429 Too Many Requests, respecting Retry-After',
        'A transient database deadlock',
        '400 Bad Request',
        '403 Forbidden',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Retry only transient failures. A 400 or 403 will fail again on every attempt — retrying it just adds load.',
    },
    {
      type: 'single',
      prompt: '`POST /bookings` times out. What makes a retry safe?',
      options: [
        'Nothing — POST can never be retried',
        'A longer timeout so the retry is not needed',
        'An Idempotency-Key from the client; the Process API stores key → result and returns the stored result on a repeat',
        'Retrying only once instead of three times',
      ],
      answer: 2,
      explain: 'A timeout means the outcome is unknown. With an idempotency key and server-side de-duplication, a repeat returns the original booking instead of creating a duplicate.',
    },
    {
      type: 'single',
      prompt: 'You want exponential backoff with jitter on a synchronous call in Mule 4. What is true about `until-successful`?',
      options: [
        'It supports exponential backoff out of the box via `backoffMultiplier`',
        'It waits a fixed `millisBetweenRetries`, so exponential/jittered backoff needs a small custom retry loop or a reusable module',
        'It cannot be used in synchronous flows',
        'It automatically skips non-retryable errors such as 400',
      ],
      answer: 1,
      explain: '`until-successful` uses a fixed delay. For growing, randomised delays you compute the wait yourself, and you filter error types so non-retryable errors are raised immediately.',
    },
    {
      type: 'single',
      prompt: 'Why add random jitter to retry delays?',
      options: [
        'It makes each retry faster',
        'Clients that failed together otherwise retry together, producing synchronised waves that keep knocking the DB over',
        'It is required by the HTTP specification',
        'It reduces the total number of retries',
      ],
      answer: 1,
      explain: 'Fixed 1-second delays made every client retry in lockstep. Jitter spreads retries over time so the dependency can recover.',
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
    'Retries multiply across layers: 4 attempts at each of the 3 retrying layers (app, Experience, Process) gives up to 4^3 = 64 System API calls for one user action — and more at the DB.',
    'Retry at one layer only, ideally the one closest to the failing dependency, and let outer layers fail fast with a clear error.',
    'Retry only transient failures (connectivity errors, timeouts, 502/503/504, 429 with Retry-After); never retry 4xx validation or authorization errors.',
    'Non-idempotent operations need an idempotency key (and de-duplication on the server) before they can be retried safely after a timeout.',
    'Use exponential backoff with jitter and a retry budget/total deadline; in synchronous paths keep retries few and short, in asynchronous paths use broker redelivery with delays and a DLQ.',
    'Combine retries with circuit breaking so a dependency that is clearly down stops receiving traffic.',
  ],
  solution: `
**Amplification.** Mobile 1 + 3 retries = 4 attempts; each Experience attempt → 4 Process attempts; each → 4 System attempts at HTTP level; each → DB reconnect attempts. Worst case **4 × 4 × 4 = 64** HTTP calls to the System API per tap, more at the DB — exactly when the DB is weakest. Fixed 1 s delays make all clients retry **in sync**, creating waves.

**Where to retry.**
- **One layer:** the System API closest to the DB/backend, because it knows the error semantics (a deadlock is transient; a constraint violation is not).
- Process and Experience layers: **no automatic retries** on synchronous calls (or a single retry for idempotent GETs on connection failure). They propagate a clear 503 with \`Retry-After\`.
- Mobile app: a user-visible "try again" or one automatic retry with backoff — not three blind retries.
- Connector **reconnection strategies** are for establishing connections at startup or after drops; avoid "reconnect forever" in request paths where it hides failures and holds threads.

**Retryable errors.**
- Retry: \`HTTP:CONNECTIVITY\`, \`HTTP:TIMEOUT\` (only if idempotent), 502/503/504, 429 respecting \`Retry-After\`, DB transient errors (deadlock, connection reset).
- Do **not** retry: 400/401/403/404/409/422, validation and business errors.
- **Idempotency for POST /bookings:** the client sends an \`Idempotency-Key\`; the Process API stores key → result (e.g. Object Store with TTL) and returns the stored result on repeat. Only then is a retry after timeout safe.

**Backoff policy.**
- Exponential backoff with **jitter**: e.g. 200 ms, 400 ms, 800 ms ± random, max 3 attempts, with an overall **deadline** that fits the caller's timeout budget.
- **Retry budget:** retries may add at most ~10% extra load; beyond that, fail fast.

**Mule 4 implementation.**
- Synchronous: \`until-successful\` uses a **fixed** \`millisBetweenRetries\`; for exponential/jittered backoff, implement a small retry loop (e.g. a sub-flow with a counter and a computed wait) or a reusable custom module — and wrap only the specific call, with an \`on-error-continue\`/error-type filter so non-retryable errors are raised immediately.
- Asynchronous (Anypoint MQ): **nack** and let the broker redeliver, use the queue's max delivery count and **DLQ**; for increasing delays, republish to a delay/retry queue with a delay per attempt. Batch/async processing tolerates longer backoff than user-facing calls.
- Add a **circuit breaker** in front of the DB/System API so that after N consecutive failures callers fail fast for a cool-down period instead of retrying.
`,
  followUps: [
    { q: 'Why add jitter?', a: 'Without jitter, all clients that failed at the same moment retry at the same moments, producing synchronized load spikes. Random jitter spreads retries over time and lets the dependency recover.' },
    { q: 'Should the gateway retry?', a: 'Generally no for non-idempotent calls; a gateway retry is invisible to the application and multiplies load. If used at all, restrict it to idempotent GETs on connection failures.' },
    { q: 'How do you know retries are hurting you?', a: 'Log and measure attempts per request (attempt number in logs, retry counters as metrics). A rising ratio of attempts to requests during an incident is a clear storm signal.' },
  ],
}
