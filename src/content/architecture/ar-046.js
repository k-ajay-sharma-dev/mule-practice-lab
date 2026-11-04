export default {
  id: 'ar-046',
  category: 'architecture',
  title: 'Defining SLOs and SLIs for Integrations',
  level: 'EXPERT',
  tags: ['slo', 'sli', 'error-budget', 'reliability', 'monitoring'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'Which statement correctly distinguishes SLI, SLO and SLA?',
      options: [
        'SLI is the contract, SLO the measurement, SLA the target',
        'SLI is a measured ratio of good to valid events; SLO is the target for it over a window; SLA is a contractual promise with consequences',
        'They are synonyms used by different teams',
        'SLO is always stricter than the SLA and the SLI',
      ],
      answer: 1,
      explain: 'Example: SLI = % of checkout requests without 5xx; SLO = 99.9% over 28 days; SLA = the contract with a partner, set looser than the SLO.',
    },
    {
      type: 'match',
      prompt: 'Match each journey to its most meaningful SLI.',
      pairs: [
        ['Checkout (synchronous)', '% of valid requests answered without 5xx and under 1.5 s'],
        ['Order to warehouse (asynchronous)', '% of orders in the WMS within 5 minutes of OrderPlaced'],
        ['Nightly price feed (batch)', 'Feed completed by 06:00 with records loaded without rejection'],
      ],
      explain: 'Sync journeys use availability and latency; async flows need freshness and completeness; batch needs on-time completion and correctness.',
    },
    {
      type: 'single',
      prompt: 'Which alert would have caught the 3-hour silent stop of order-to-warehouse within minutes?',
      options: [
        'CPU above 80% on the consumer app',
        'No OrderPlaced consumed for 10 minutes while orders are being placed (or oldest message age > 5 min)',
        'Any ERROR line in the logs',
        'App status "down" in Runtime Manager',
      ],
      answer: 1,
      explain: 'Every app was "up", so health and resource alerts stayed quiet. Symptom-based alerts on the flow itself detect a silent stop.',
    },
    {
      type: 'multi',
      prompt: 'Which signals should page the on-call engineer?',
      options: [
        'Fast SLO burn rate on checkout',
        'Oldest message age above 5 minutes on the warehouse queue',
        'Gap between published and consumed orders',
        'DLQ count above zero for the order flow',
        'CPU above 80%',
        'Every single ERROR log line',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Page on symptoms users feel and on budget burn. CPU and individual log lines belong on dashboards and tickets — paging on them is why on-call ignores alerts.',
    },
    {
      type: 'single',
      prompt: 'How does an error budget change the "freeze after every incident" debate?',
      options: [
        'It bans releases permanently once one incident occurs',
        'Budget remaining → ship normally; burning fast → slow risky changes; exhausted → prioritise reliability work until it recovers',
        'It only applies to batch jobs',
        'It replaces the need for SLOs',
      ],
      answer: 1,
      explain: 'A data-based rule agreed by product and operations replaces emotional freezes — and shows when the team is over-investing in reliability.',
    },
    {
      type: 'single',
      prompt: 'Checkout depends on three services, each around 99.9% available. Is a 99.99% checkout SLO realistic?',
      options: [
        'Yes, availability is set by the Experience API alone',
        'No — availability roughly multiplies along the chain (~99.7%) unless you add redundancy, caching, async buffering or graceful degradation',
        'Yes, if every API has 2 replicas',
        'No, because SLOs can never exceed 99%',
      ],
      answer: 1,
      explain: 'You cannot promise more than your critical dependencies allow without design changes; choose targets from measured performance and business need.',
    },
  ],
  description: `
An e-commerce company runs ~60 Mule APIs and event flows. The integration team gets constant pressure:

- The business says "integrations are unreliable" but cannot say what reliable means.
- Every API is promised "99.99% availability" in a slide deck; nobody measures it.
- Alerts fire on CPU > 80% and every single error log line; on-call ignores most of them.
- An **order-to-warehouse** event flow silently stopped for 3 hours last month — every app was "up", so no alert fired.
- Product teams want to ship faster; operations wants a release freeze after each incident.

Key journeys:

| Journey | Type |
|---|---|
| Checkout (Experience → Process → Payment/Inventory) | Synchronous |
| Order to warehouse (MQ event → WMS) | Asynchronous |
| Nightly price feed (batch) | Batch |

**Questions:**
- Define SLIs and SLOs for each journey type. How do they differ for sync, async and batch?
- Where and how do you measure them in a Mule/Anypoint landscape?
- How do error budgets change the release-freeze discussion?
- Redesign alerting so the 3-hour silent stop would have been caught quickly and noise is reduced.
- How do SLOs relate to SLAs with partners and to dependencies you do not control?
`,
  answerTemplate: `## SLIs and SLOs per journey

## Measurement

## Error budgets and release policy

## Alerting redesign

## SLAs and external dependencies
`,
  keyPoints: [
    'An SLI is a measured ratio of good events to valid events (e.g. requests under 800 ms and not 5xx); an SLO is the target for that SLI over a window (e.g. 99.5% over 28 days); an SLA is a contractual promise with consequences.',
    'Synchronous journeys use availability and latency SLIs; asynchronous flows need freshness/end-to-end delay and completeness SLIs; batch needs on-time completion and correctness SLIs.',
    'SLIs are measured as close to the user as possible (gateway/Experience API metrics, synthetic checks) and for async flows by comparing produced vs consumed events and message age.',
    'The error budget (100% minus SLO) turns reliability into a shared decision rule: budget remaining allows releases; exhausted budget prioritises reliability work.',
    'Alert on SLO burn rate and symptoms (no events processed, message age, DLQ growth) rather than on CPU or individual log lines.',
    'SLOs must be consistent with dependencies: an API cannot promise more availability than its critical dependencies allow without redundancy or graceful degradation.',
  ],
  solution: `
**SLIs and SLOs per journey.**

| Journey | SLI | SLO (example) |
|---|---|---|
| Checkout (sync) | % of valid requests answered without 5xx | 99.9% / 28 days |
| | % of requests completed < 1.5 s | 99% / 28 days |
| Order to warehouse (async) | % of orders in WMS within 5 min of OrderPlaced (freshness) | 99.5% |
| | % of orders reaching WMS at all within 24 h (completeness) | 99.99% |
| Price feed (batch) | Feed completed by 06:00 | 99% of days |
| | % records loaded without rejection | 99.9% |

Notes: exclude client errors (4xx) caused by callers from the "bad" count; choose targets from **current measured performance and business need**, not "four nines" by default. 99.99% allows ~4 minutes of failure per month — likely unrealistic with the current dependencies.

**Measurement.**
- **Sync:** API gateway / Anypoint Monitoring metrics (response time, status codes) on the Experience API — closest to the user. Add synthetic checks for critical endpoints. Export metrics or structured logs to the observability platform to compute ratios over rolling windows.
- **Async:** emit events/metrics at publish and at final consumption with the same order ID and timestamps; compute end-to-end delay and missing orders (published but not confirmed after X min). Track queue depth, **oldest message age**, DLQ count.
- **Batch:** job start/end events, record counts in/out/rejected.
- Make SLI computation part of the shared logging/monitoring framework so 60 apps report consistently.

**Error budgets.**
- Checkout SLO 99.9% → budget 0.1% of requests per 28 days.
- Policy agreed with product and operations: **budget left → ship normally**; budget burning fast → slow down risky changes; **budget exhausted → prioritise reliability fixes** until it recovers. This replaces emotional "freeze after every incident" with a data-based rule, and also tells the team when they are over-investing in reliability.

**Alerting redesign.**
- Page on **burn rate**: e.g. consuming the monthly budget many times faster than sustainable over a short and a long window (fast-burn and slow-burn alerts).
- Async symptom alerts: "no OrderPlaced consumed for 10 min while orders are being placed", oldest message age > 5 min, DLQ > 0, published-vs-consumed gap. The 3-hour silent stop would trigger within ~10 minutes.
- Demote CPU/memory and single error lines to dashboards/tickets, not pages. Each page links to a runbook.

**SLAs and dependencies.**
- SLAs (contracts with partners) should be **looser** than internal SLOs, leaving a safety margin.
- A chain with dependencies at 99.9% each cannot simply be 99.99% — availability multiplies roughly. Options: negotiate dependency SLOs, add redundancy, caching, async buffering or graceful degradation, and define SLIs that exclude well-communicated planned maintenance only if the business agrees.
- Publish SLOs with each API in Exchange so consumers can design for them.
`,
  followUps: [
    { q: 'Why measure at the Experience API rather than each System API?', a: 'The user experiences the whole journey; per-API SLIs are useful for diagnosis and for owner teams, but the journey SLO is what the business cares about and what error budgets should be based on.' },
    { q: 'What is a burn-rate alert in simple terms?', a: 'It alerts when errors consume the error budget much faster than the rate that would just exhaust it by the end of the window, for example spending a large share of the monthly budget within an hour, which indicates a real incident rather than noise.' },
  ],
}
