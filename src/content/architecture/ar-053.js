export default {
  id: 'ar-053',
  category: 'architecture',
  title: 'Process APIs: Orchestration, Aggregation and Enrichment',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'process-api', 'orchestration', 'aggregation', 'stateless'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Classify each need.',
      pairs: [
        ['Trip summary: booking + flight status + hotel confirmation', 'Aggregation'],
        ['Book trip: reserve flight → hotel → payment → confirm', 'Orchestration'],
        ['Customer record decorated with loyalty tier and lifetime value', 'Enrichment'],
      ],
      explain: 'Aggregation merges independent reads; orchestration runs dependent steps with decisions and compensation; enrichment decorates a primary record using its id.',
    },
    {
      type: 'match',
      prompt: 'Match each kind of work to the Mule 4 construct that fits it.',
      pairs: [
        ['Aggregation', 'Scatter-Gather (fixed routes) or parallel-foreach (dynamic list), merged with DataWeave'],
        ['Orchestration', 'Sequential flow-refs, Choice, Try scopes triggering compensation'],
        ['Enrichment', 'Sequential lookup into a target variable, with a cache for slow-changing data'],
      ],
      explain: 'Parallelism suits independent reads; dependent steps need sequence and error handling; enrichment keeps the main payload and adds to it.',
    },
    {
      type: 'single',
      prompt: 'In the trip summary, the airline route of a Scatter-Gather fails. What happens, and what should you do?',
      options: [
        'The failed route is silently skipped',
        'Scatter-Gather raises a composite routing error; catch it and return the successful parts with a partial/warnings flag if the business accepts it',
        'Mule retries the route automatically until it succeeds',
        'The whole app restarts',
      ],
      answer: 1,
      explain: 'You must decide the partial-failure policy explicitly — degraded responses are often better than failing the whole summary.',
    },
    {
      type: 'single',
      prompt: 'Book trip is half-done when the pod restarts. Where should its state have been?',
      options: [
        'In flow variables',
        'In a non-persistent in-memory Object Store',
        'In a durable process/saga record (database or persistent Object Store) or durable queues, with a recovery job that resumes or compensates',
        'In the HTTP session of the client',
      ],
      answer: 2,
      explain: 'Statelessness is about request handling: any replica serves any request, while long-running process state is externalised.',
    },
    {
      type: 'multi',
      prompt: 'Which are signs of a badly designed Process API?',
      options: [
        'Pure pass-through: one call in, one System API call out, no rules',
        'One Process API per consumer (prc-order-mobile-api, prc-order-web-api)',
        'Uses the SAP or JDBC connector directly instead of a System API',
        'Returns UI-ready labels and mobile-specific fields',
        'Calls another Process API such as Pricing',
        'Uses Scatter-Gather for independent reads',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Composing Process APIs is valid (watch chain depth), and Scatter-Gather is the right tool for independent reads.',
    },
    {
      type: 'single',
      prompt: 'Why not use the Async scope to aggregate the trip summary?',
      options: [
        'The Async scope is deprecated',
        'It is fire-and-forget and does not return results to the main flow, which aggregation needs',
        'It only works with queues',
        'It runs sequentially',
      ],
      answer: 1,
      explain: 'Scatter-Gather waits for all routes and hands you their results; the Async scope works on a copy and returns nothing.',
    },
  ],
  description: `
An interviewer asks you to explain the different **kinds of work** a Process API does, using a travel company:

| Need | Systems |
|---|---|
| **Trip summary**: booking + flight status + hotel confirmation for one trip | Booking DB, airline API, hotel API |
| **Book trip**: reserve flight → reserve hotel → take payment → confirm booking | Airline, hotel, payment gateway, Booking DB |
| **Customer lookup**: customer record enriched with loyalty tier and lifetime value | CRM, loyalty system |

**Questions:**
1. Classify each need as **aggregation**, **orchestration** or **enrichment**, and explain the difference.
2. Which Mule 4 constructs would you use for each (and why)?
3. Why should a Process API be **stateless**? Where does state go if a process needs it (e.g. Book trip is half-done when the pod restarts)?
4. Name two signs that a Process API is badly designed.
`,
  answerTemplate: `## Aggregation vs orchestration vs enrichment

## Mule constructs

## Statelessness

## Smells
`,
  keyPoints: [
    'Aggregation: independent calls combined into one view (parallel, e.g. Scatter-Gather or parallel-for-each); partial failure policy must be decided.',
    'Orchestration: ordered, dependent steps with business decisions and compensation (sequential flow, Choice, Try/error handling, saga).',
    'Enrichment: a primary record augmented with data from secondary sources (sequential lookup, often cacheable reference data).',
    'Process APIs should be stateless so any replica can serve any request and scale horizontally; durable process state lives in a database, persistent Object Store or a queue, not in memory.',
    'Smells: pass-through with no logic, one Process API per consumer, direct backend connectors, channel-specific formatting.',
  ],
  solution: `
**Classification.**

| Need | Kind | Why |
|---|---|---|
| Trip summary | **Aggregation** | Three independent reads merged into one view; no call depends on another's result (once you know the trip id). |
| Book trip | **Orchestration** | Ordered, dependent steps with business decisions; failure in step 3 requires undoing 1 and 2. |
| Customer lookup | **Enrichment** | A primary entity (customer) is decorated with extra attributes from another system, keyed by the primary's id. |

**Mule 4 constructs.**
- **Aggregation:** \`scatter-gather\` (fixed set of routes in parallel, with a timeout) or \`parallel-foreach\` (dynamic list). Decide the **partial-failure policy**: Scatter-Gather raises a composite routing error if any route fails — catch it and return the successful parts with a \`warnings\`/\`partial\` flag if the business accepts degraded responses (e.g. flight status unavailable). Merge with DataWeave.
- **Orchestration:** sequential flow with \`flow-ref\`s per step, \`choice\` for decisions, \`try\` scopes with \`on-error-continue\`/\`on-error-propagate\` to trigger **compensation** (cancel flight, release hotel). Idempotency keys on each step so retries do not double-book. For long-running or async steps, use queues (Anypoint MQ) and a persisted state instead of holding an HTTP request open.
- **Enrichment:** call CRM, then loyalty using the customer id (\`target\` variable to keep the main payload), merge. Loyalty tier changes rarely → cache it with a TTL (Cache scope or Object Store).

**Statelessness.**
- Any replica must handle any request: enables horizontal scaling, rolling deploys and failover without sticky sessions.
- In-memory state (variables across requests, non-persistent object stores) is lost on restart and not shared between replicas.
- When a process needs state (Book trip half-done): persist a **process/saga record** (booking id, completed steps, compensation needed) in a database or persistent Object Store, or model the steps as messages on durable queues. On restart, a recovery job/consumer resumes or compensates.
- Statelessness is about **request handling**; the business process can still be long-running as long as its state is externalised.

**Smells.**
1. **Pass-through:** one call in, one System API call out, no rules — remove it or justify it.
2. **One Process API per consumer** (\`prc-order-mobile-api\`, \`prc-order-web-api\`) — consumer differences belong in Experience APIs.
3. Uses the **SAP/JDBC connector directly** instead of a System API.
4. Returns UI-ready labels or mobile-specific fields.
5. Deep synchronous chains (Process → Process → Process) that blow the latency budget.
`,
  followUps: [
    { q: 'Scatter-Gather or async scope for aggregation?', a: 'Scatter-Gather waits for all routes and gives you their results, which aggregation needs. The async scope is fire-and-forget; it does not return results to the main flow.' },
    { q: 'What happens to the response time of an aggregation?', a: 'Roughly the slowest route plus merge overhead (not the sum), so set per-route timeouts and decide whether to return partial data rather than wait for a slow dependency.' },
    { q: 'Should orchestration ever be done by the client instead?', a: 'If business rules are involved, no — every client would reimplement them. Choreography with events is the alternative to central orchestration when steps belong to independent domains.' },
  ],
}
