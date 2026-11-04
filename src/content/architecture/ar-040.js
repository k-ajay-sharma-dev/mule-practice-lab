export default {
  id: 'ar-040',
  category: 'architecture',
  title: 'Circuit Breaker and Bulkhead in Mule',
  level: 'ADVANCED',
  tags: ['circuit-breaker', 'bulkhead', 'resilience', 'object-store', 'max-concurrency'],
  estMinutes: 30,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the circuit breaker states in the order they occur when the hotel partner fails and later recovers.',
      items: [
        'Closed — calls flow and failures are counted',
        'Open — calls are rejected immediately during the cool-down',
        'Half-Open — a limited number of trial calls are let through',
        'Closed again — the trial calls succeeded and counters are reset',
      ],
      explain: 'Crossing the failure threshold opens the circuit; after the cool-down a few trial calls decide whether to close it again or re-open.',
    },
    {
      type: 'multi',
      prompt: 'Which measures act as bulkheads so hotel slowness cannot affect flight searches?',
      options: [
        'A separate HTTP Request configuration for the hotel partner with its own bounded `maxConnections` and short timeouts',
        'The hotel call in its own flow with `maxConcurrency`, so excess calls fail fast instead of piling up',
        'Deploying the hotel integration as a separate app that scales independently',
        'One shared HTTP Request configuration with a bigger connection pool for all dependencies',
        'A rate-limiting policy on the Trip API at the gateway',
      ],
      answer: [0, 1, 2],
      explain: 'A bulkhead separates resources **per dependency**. A bigger shared pool just gives the slow dependency more to consume, and gateway rate limiting protects the API as a whole, not one dependency from another.',
    },
    {
      type: 'single',
      prompt: 'The Trip API runs on 2 replicas. Which statement about circuit state is accurate?',
      options: [
        'Circuit state must be in a shared persistent Object Store, otherwise the breaker does not work',
        'An in-memory Object Store gives each replica its own breaker (simple, each learns within seconds); a shared persistent store makes replicas agree but adds latency to every call',
        'Mule automatically synchronises flow variables across replicas',
        'Circuit state belongs in the API gateway configuration',
      ],
      answer: 1,
      explain: 'Both options are valid — it is a conscious trade-off between consistency across replicas and per-call overhead.',
    },
    {
      type: 'single',
      prompt: 'Which errors should count towards opening the hotel circuit?',
      options: [
        'Every error, including 400 Bad Request',
        'Timeouts, connectivity errors and 5xx responses',
        'Only 404 Not Found',
        'Only errors logged at ERROR level',
      ],
      answer: 1,
      explain: 'The breaker measures dependency **health**. A 4xx caused by bad input says nothing about whether the partner is up.',
    },
    {
      type: 'single',
      prompt: 'The hotel circuit is open. What should a trip search return?',
      options: [
        'HTTP 500 with the circuit-open error',
        'HTTP 503 for the whole request',
        'HTTP 200 with flights and `"hotels": { "status": "UNAVAILABLE" }` (recommendations empty or cached)',
        'Wait until the circuit closes and then answer',
      ],
      answer: 2,
      explain: 'Hotels are important but not critical: degrade gracefully with a clear indicator. Only a failure of the critical Flights dependency justifies a 503.',
    },
    {
      type: 'single',
      prompt: 'Why combine the breaker with a short (e.g. 3 s) hotel timeout instead of 30 s?',
      options: [
        'Short timeouts are required by the Object Store',
        'A breaker driven by 30-second timeouts reacts far too slowly — threads stay blocked long before it opens',
        'Because the hotel partner rejects long requests',
        'It makes the hotel partner faster',
      ],
      answer: 1,
      explain: 'The breaker only helps once it trips; short timeouts free threads quickly and let it detect the slowdown in seconds.',
    },
  ],
  description: `
A travel company's **Trip Process API** (CloudHub 2.0, 2 replicas) aggregates three dependencies:

| Dependency | Importance | Behaviour |
|---|---|---|
| Flights System API | Critical | Stable |
| Hotel partner API | Important | Frequently slow (20–30 s) during partner deployments |
| Recommendations API | Nice to have | Occasionally down |

During a hotel partner slowdown, **all** Trip API operations — including flight-only searches — became slow and then failed, because worker threads and HTTP connections were stuck waiting on the hotel partner.

The team wants a **circuit breaker** and **bulkheads**. Mule 4 does not ship a dedicated circuit-breaker scope in the core runtime, so the design must be built from available building blocks or a reusable module.

**Questions:**
- Explain the circuit breaker states and the bulkhead pattern.
- How would you implement a circuit breaker for the hotel dependency in Mule 4 across 2 replicas?
- How would you implement bulkheads so hotel slowness cannot affect flight searches?
- What does the API return when the hotel circuit is open, and how is it monitored?
`,
  answerTemplate: `## Patterns explained

## Circuit breaker implementation

## Bulkhead implementation

## Fallback responses and monitoring
`,
  keyPoints: [
    'A circuit breaker has Closed (normal), Open (fail fast without calling) and Half-Open (let a few trial calls through) states, driven by failure counts or rates and a cool-down period.',
    'A bulkhead isolates resources per dependency (connection pools, concurrency limits, even separate apps) so one slow dependency cannot exhaust shared threads.',
    'In Mule 4, circuit state can be kept in an Object Store (shared/persistent if replicas must agree) and wrapped in a reusable sub-flow or custom module around the outbound call.',
    'Bulkheads in Mule: a separate HTTP requester configuration per dependency with bounded maxConnections, short timeouts, and flows with maxConcurrency for each dependency.',
    'When open, return a degraded but useful response (flights without hotels, cached or empty recommendations) with clear indication, not a generic 500.',
    'Circuit state changes and rejected calls must be logged and alerted on so operators see the dependency issue immediately.',
  ],
  solution: `
**Patterns.**
- **Circuit breaker:** *Closed* — calls flow, failures counted. When failures exceed a threshold (e.g. 5 consecutive failures or 50% in the last 30 s) → *Open* — calls are rejected immediately for a cool-down (e.g. 30 s). Then *Half-Open* — a limited number of trial calls; success → Closed, failure → Open again.
- **Bulkhead:** like ship compartments — separate pools of resources per dependency so a leak in one does not sink the ship.

**Circuit breaker in Mule 4.**
- Wrap the hotel call in a reusable component (sub-flow, or better a custom Mule module / shared plugin so all apps use the same logic):
  1. Read state for key \`hotel-partner\` from an **Object Store** (state, failureCount, openedAt).
  2. If Open and cool-down not elapsed → raise a custom error \`APP:CIRCUIT_OPEN\` immediately.
  3. Otherwise call; on success reset counters (Half-Open → Closed); on qualifying errors (timeouts, 5xx, connectivity) increment and possibly Open.
- **Replicas:** with an in-memory store each replica has its own breaker — acceptable and simpler (each learns independently within seconds). A persistent/shared Object Store makes replicas agree but adds latency on each call; choose consciously.
- Only count failures that indicate dependency health (timeouts, 5xx), not 4xx caused by bad input.
- Combine with **short timeouts** (e.g. 3 s for hotels): a breaker driven by 30 s timeouts reacts too slowly.

**Bulkheads.**
- **Separate HTTP requester configs** per dependency, each with its own connection pool (\`maxConnections\`) and timeouts — a stuck hotel pool cannot take flight connections.
- Put each dependency call in its own flow with **\`maxConcurrency\`** limiting simultaneous hotel calls; excess requests fail fast (or wait briefly) instead of piling up.
- Run dependency calls **in parallel** (Scatter-Gather) with per-route timeouts so the aggregate response time is bounded by the slowest *allowed* route.
- Strongest bulkhead: deploy the hotel integration as a **separate app/replica set** (it is a separate System API anyway) and scale it independently.

**Fallbacks and monitoring.**
- Circuit open → \`on-error-continue\` for \`APP:CIRCUIT_OPEN\`: return trips with flights and \`"hotels": { "status": "UNAVAILABLE" }\`; recommendations → empty list or cached defaults. Flights failure is critical → proper 503.
- Log every state transition (\`CIRCUIT_OPENED hotel-partner failures=5\`), emit counts of rejected calls, and alert on Open. Dashboards show breaker state per dependency.
`,
  followUps: [
    { q: 'How is a circuit breaker different from a retry?', a: 'A retry assumes the failure is transient and tries again; a circuit breaker assumes the dependency is unhealthy and stops calling it for a while. They complement each other: few retries inside a closed circuit, no calls while it is open.' },
    { q: 'Is rate limiting at the gateway a bulkhead?', a: 'It protects the API as a whole from too many callers, but it does not isolate dependencies inside the app. Bulkheads are about internal resource separation per dependency.' },
  ],
}
