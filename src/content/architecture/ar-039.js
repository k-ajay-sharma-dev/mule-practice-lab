export default {
  id: 'ar-039',
  category: 'architecture',
  title: 'Timeout Budgets Across an API-led Chain',
  level: 'ADVANCED',
  tags: ['timeouts', 'latency-budget', 'resilience', 'api-led', 'http-requester'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the core problem with the current timeout values?',
      options: [
        'They are all too short',
        'They are inverted: inner calls (60–90 s) outlive the outer caller (30 s), so work continues for a user who has already given up',
        'The browser timeout should be longer than 90 s',
        'Timeouts should be identical at every hop',
      ],
      answer: 1,
      explain: 'Timeouts must **shrink** going deeper. Otherwise orphaned inner calls complete after the user retried — here, producing double payments.',
    },
    {
      type: 'order',
      prompt: 'For a 10-second end-to-end target, order the hops from the LONGEST timeout to the SHORTEST.',
      items: [
        'Front end → Checkout Experience API',
        'Experience → Checkout Process API',
        'Process → Payment System API',
        'Payment System API → payment provider',
      ],
      explain: "Each layer's timeout = caller's timeout − its own processing − a margin to build a clean error response (e.g. 10 s, 8 s, 6 s, 5 s).",
    },
    {
      type: 'single',
      prompt: 'The call to the payment provider times out. What should the Payment System API assume?',
      options: [
        'The payment failed — retry immediately',
        'The payment succeeded — confirm the order',
        'The outcome is unknown: mark it PENDING, query the provider by idempotency key before any retry, and let reconciliation resolve leftovers',
        'Return 500 and let the user click Pay again',
      ],
      answer: 2,
      explain: 'A timeout on a non-idempotent call is **unknown outcome**, not failure. Blind retries or a second click caused the double charges.',
    },
    {
      type: 'multi',
      prompt: 'Which settings must be designed and aligned for this chain?',
      options: [
        'HTTP Request `connectionTimeout` and `responseTimeout` per hop',
        'Bounded connection pools (`maxConnections`) so a slow backend cannot take every connection',
        'Gateway and load balancer timeouts at least as long as the app timeout at that layer',
        '`maxConcurrency` on the flow calling the slow dependency, as a bulkhead',
        'Relying on Mule to cancel downstream calls automatically when the caller disconnects',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Mule does not cancel downstream work when the caller is gone — that is why inner timeouts must be shorter. If the load balancer cuts first, clients see generic errors instead of your 504.',
    },
    {
      type: 'single',
      prompt: 'Fraud review sometimes takes 20 seconds. How should checkout handle it within a 10-second budget?',
      options: [
        'Raise all timeouts to 30 s',
        'Return 202 Accepted with a status resource (Location: /payments/{id}) and complete in the background',
        'Retry the fraud call until it answers within 10 s',
        'Skip fraud review when it is slow',
      ],
      answer: 1,
      explain: 'If something genuinely exceeds the budget, change the interaction to asynchronous rather than stretching synchronous timeouts.',
    },
    {
      type: 'single',
      prompt: 'How do you choose a value like 1.5 s for the Pricing call?',
      options: [
        'Use the connector default',
        'Take the measured p99 under normal load, add margin, and check it fits the parent budget — if not, change the design (cache, parallelism, async)',
        'Use the same value as the parent layer',
        'Set it as high as possible to avoid errors',
      ],
      answer: 1,
      explain: 'Timeouts are derived from measured latency and the budget. If p99 does not fit, the design must change rather than the timeout grow.',
    },
  ],
  description: `
A retailer's **checkout** chain has these settings today:

| Hop | Timeout configured | Typical latency (p95) |
|---|---|---|
| Web front end → Checkout Experience API | 30 s (browser/JS) | 1.2 s |
| Experience → Checkout Process API | default HTTP requester response timeout | 1.0 s |
| Process → Pricing System API | 60 s | 300 ms |
| Process → Payment System API | 60 s | 600 ms |
| Payment System API → Payment provider | 90 s | 500 ms |
| Load balancer in front of apps | its own idle/request timeout | — |

Incident: the payment provider became slow (responses after 40–80 s). Users saw an error after 30 s and clicked "Pay" again. Meanwhile the inner calls kept running and **some payments completed after the user had already given up**, leading to double charges. Threads and connections piled up in the Payment System API.

**Questions:**
- What is wrong with these timeout values?
- Design a timeout budget for this chain with a 10-second end-to-end target.
- How do you handle a timeout on a non-idempotent call such as a payment?
- Which Mule 4 settings are involved, and what else must be aligned (gateway, load balancer, connection pools)?
`,
  answerTemplate: `## Problems with current values

## Proposed budget

## Timeouts on non-idempotent calls

## Mule settings and alignment
`,
  keyPoints: [
    'Timeouts must shrink as you go deeper: each inner call must finish (or give up) before its caller times out, otherwise work continues for a caller that is gone.',
    'Budget from the user target downward, allocating per hop based on measured p95/p99 latency plus margin and leaving time for processing and error responses.',
    'A timeout on a payment means unknown outcome, not failure: use idempotency keys and a status check/reconciliation instead of a blind retry.',
    'In Mule 4 the HTTP requester has connection and response timeouts; database and other connectors have their own query/connection timeouts; gateways and load balancers have separate limits that must be consistent.',
    'Bounded connection pools and concurrency limits prevent slow dependencies from consuming all threads and connections.',
    'Long-running operations should become asynchronous (202 Accepted + status resource) rather than stretching synchronous timeouts.',
  ],
  solution: `
**Problems.**
- **Inverted timeouts:** outer layer 30 s, inner 60–90 s. When the front end gives up, inner calls continue → orphaned work and double payments when the user retries.
- Defaults are implicit and not designed — nobody knows what the Experience → Process timeout really is.
- No distinction between "failed" and "unknown outcome" for payment.
- Long timeouts hold connections; under slowness, pools and threads are exhausted (Little's law: concurrency = rate × latency).

**Proposed budget (10 s end-to-end target).**

| Hop | Timeout |
|---|---|
| Front end → Experience | 10 s |
| Experience → Process | 8 s |
| Process → Pricing | 1.5 s (p99 + margin; can run in parallel with other reads) |
| Process → Payment System API | 6 s |
| Payment System → provider | 5 s (connection timeout ~1–2 s) |

Rule: each layer's timeout = caller's timeout − own processing − margin for building an error response. Better still: **propagate a deadline** (e.g. a header with the remaining time) so inner layers can skip work that cannot finish in time.

**Non-idempotent calls.**
- Send an **idempotency key** (e.g. orderId) to the payment provider (most providers support this).
- On timeout: mark the payment **PENDING/UNKNOWN**, return a clear response to the front end (\`202\` with "payment being confirmed" or a status endpoint), and **query the provider's status** by the key before any retry.
- A reconciliation job resolves leftover unknowns. The front end disables the second "Pay" click and polls status.

**Mule settings and alignment.**
- HTTP Request configuration: \`connectionTimeout\`, \`responseTimeout\` (per request or config), and connection pool limits (\`maxConnections\`, idle timeout) so a slow backend cannot grab unlimited connections.
- Database connector: query timeout / connection pool settings.
- Optional: \`maxConcurrency\` on the flow calling the slow dependency, acting as a bulkhead.
- **Gateway** proxy timeouts and **load balancer** timeouts must be ≥ the app's own timeout at that layer, otherwise the LB cuts the connection first and clients see generic errors.
- Map \`HTTP:TIMEOUT\` to a consistent 504 error body with the correlation ID.
- If something genuinely takes > 10 s (e.g. fraud review), switch to **async**: return \`202 Accepted\` + \`Location: /payments/{id}\` and complete in the background.
`,
  followUps: [
    { q: 'How do you choose a value like 1.5 s for Pricing?', a: 'From measured latency distribution: take p99 under normal load, add margin, and check it fits the parent budget. If p99 does not fit, the design must change (cache, async, parallelism) rather than the timeout grow.' },
    { q: 'What happens to a Mule flow when the caller has already timed out?', a: 'Mule keeps processing unless the work is bounded by its own timeouts; it does not automatically cancel downstream calls. That is why inner timeouts must be shorter and why deadlines are worth propagating.' },
  ],
}
