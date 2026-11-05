export default {
  id: 'cs-043',
  category: 'case-studies',
  title: 'Turning a Major Outage Into a Resilience Programme',
  level: 'ADVANCED',
  tags: ['resilience', 'incident-review', 'observability', 'circuit-breaker', 'sre'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      prompt: 'In the blameless review, which statement best separates the **trigger** from the **root cause**?',
      options: [
        'Trigger: the address-validation API slowed down. Root cause: it was called synchronously on the checkout critical path with a 60 s timeout and no fallback.',
        'Trigger: the on-call engineer was paged late. Root cause: the address-validation vendor had an outage.',
        'Trigger: CPU stayed low. Root cause: the Mule workers were undersized.',
        'Trigger: the web app retried. Root cause: Saturday-morning traffic was higher than usual.',
      ],
      answer: 0,
      explain: 'Third parties will always slow down sometimes — that is only the trigger. The outage happened because the design let an unessential dependency hold checkout threads for up to 60 s with no fallback. Blaming the vendor or the engineer misses what the team can fix.',
    },
    {
      type: 'multi',
      prompt: 'Which contributing factors turned a slow dependency into a 5-hour outage?',
      options: [
        'A 60 s timeout let slow calls hold worker threads until they were exhausted',
        '`customer-sapi` was co-deployed in the same application as `checkout-papi`, so it failed too',
        'The web app retried aggressively, adding load to an already saturated API',
        'Alerts fired only on CPU, which stayed low, so detection took 50 minutes',
        'The address-validation API used REST instead of SOAP',
        'Mule 4 cannot set response timeouts on HTTP Request operations',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Long timeouts, the shared deployment (no bulkhead), retry amplification and symptom-blind alerting all made it worse. The protocol of the vendor API is irrelevant, and Mule 4 HTTP requests do support explicit response timeouts — the team simply set a very long one.',
    },
    {
      type: 'single',
      prompt: 'What is the best **immediate** fix for the address-validation call?',
      options: [
        'Raise the timeout to 120 s so slow responses still succeed',
        'Cut the timeout to about 2 s and, on timeout or error, accept the address and validate it asynchronously later (flag the order for review)',
        'Add more replicas of `checkout-papi` so there are more threads to wait',
        'Retry the call three times before failing the checkout',
      ],
      answer: 1,
      explain: 'Address validation is not essential to taking an order, so it needs a short, deliberate timeout plus a fallback. More replicas only give the slow dependency more threads to hold, and synchronous retries multiply the load on a struggling service.',
    },
    {
      type: 'single',
      prompt: 'Why did restarting the application only help for a few minutes each time?',
      options: [
        'The restart cleared a memory leak that came back after a few minutes',
        'Restarts freed the threads, but the slow dependency and the client retries were still there, so the threads filled up again',
        'CloudHub throttles applications that are restarted more than once an hour',
        'The restart reloaded an old configuration that had the bug',
      ],
      answer: 1,
      explain: 'Runtime state was a symptom, not the cause. As long as every request waited on the slow API and clients kept retrying, thread exhaustion returned within minutes.',
    },
    {
      type: 'match',
      prompt: 'Match each resilience standard to the failure mode it addresses in this incident.',
      pairs: [
        ['Circuit breaker on unstable dependencies', 'Stop calling a dependency that is already failing or slow'],
        ['Bulkhead: separate deployment for critical APIs', 'Stop one API failure spreading to an unrelated API'],
        ['Client retries with exponential backoff and jitter', 'Avoid retry storms that amplify load'],
        ['Alerts on p95 latency, 5xx rate and throughput drop', 'Detect the problems users actually feel'],
      ],
      explain: 'Each standard maps to one contributing factor: no circuit breaker, co-deployment, aggressive retries, and CPU-only alerting.',
    },
    {
      type: 'order',
      prompt: 'Put the 6-month resilience programme in a sensible order, given peak trading starts in 3 months.',
      items: [
        'Blameless post-incident review with causes and contributing factors',
        'Immediate fixes: timeout + fallback, feature flag, split `customer-sapi`, backoff, symptom alerts',
        'Bring the top-20 critical APIs up to the resilience standards before peak',
        'Roll the standards out to the remaining apps and run game days',
        'Monthly reliability review tracking SLOs and incident metrics',
      ],
      explain: 'Understand first, then remove the exact failure quickly, then protect what matters most before peak, then broaden. The monthly review keeps the programme measurable after the big push.',
    },
    {
      type: 'multi',
      prompt: 'Which metrics would you report to leadership to show resilience is improving?',
      options: [
        'SLO attainment for critical APIs',
        'Time to detect (target under 5 minutes)',
        'Time to recover',
        'Percentage of critical APIs compliant with the resilience checklist',
        'Number of Mule applications deployed',
        'Average CPU utilisation of all workers',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Leadership needs outcome and coverage metrics. App count says nothing about resilience, and CPU is the very signal that stayed green during this outage.',
    },
  ],
  description: `
**Context.** An online grocery retailer had a 5-hour outage on a Saturday morning.

**Timeline**
1. A third-party address-validation API became slow (responses taking 30 s instead of 200 ms).
2. The \`checkout-papi\` called it synchronously with a 60 s timeout.
3. Mule worker threads filled up, checkout stopped responding, and the web app retried aggressively.
4. The shared \`customer-sapi\` (deployed in the same application as \`checkout-papi\` for "cost reasons") also stopped.
5. Alerts fired only on CPU, which stayed low, so the on-call engineer was paged 50 minutes in by the customer-service team.
6. Restarts helped for a few minutes each time.

You are the integration architect asked to run the post-incident review and propose a 6-month resilience programme across ~90 Mule applications.

**Goals**
- Blameless review with clear root causes and contributing factors.
- Quick fixes in weeks; structural improvements over 6 months.
- Measurable resilience improvement leadership can track.

**Constraints**
- Feature teams are busy with a peak trading season in 3 months.
- No dedicated SRE team; the integration team runs operations.

**Your task.** Run the analysis and propose the programme:
- immediate actions
- design standards
- observability
- testing
- governance
`,
  answerTemplate: `## Incident analysis (causes and contributing factors)

## Immediate fixes (next 2–4 weeks)

## Design standards for resilience

## Observability and alerting

## Testing resilience

## Programme plan, governance and metrics

## Risks
`,
  keyPoints: [
    'Root cause analysis separates trigger (slow dependency) from causes (unbounded synchronous dependency, long timeouts, shared deployment, client retries) and detection gaps (wrong alerts).',
    'Immediate fixes: sensible timeouts, a fallback when address validation is unavailable, separate deployments for critical APIs, and client-side retry with backoff.',
    'Standards: timeouts and retry budgets per dependency, circuit breakers/bulkheads for non-critical calls, graceful degradation, and isolating critical services.',
    'Observability: alert on symptoms users feel (latency, error rate, throughput drop) and on dependency latency, with dashboards, distributed tracing/correlation IDs and runbooks.',
    'Resilience is proven with load and failure-injection tests before peak, and tracked with SLOs and incident metrics (time to detect, time to recover).',
  ],
  solution: `
**Analysis.**
- *Trigger*: third-party latency spike.
- *Causes*: synchronous call on the critical path with a 60 s timeout; no fallback although address validation is not essential to taking an order; threads exhausted; \`customer-sapi\` co-deployed so the failure spread; aggressive client retries amplified load.
- *Detection*: alerts on CPU only; no latency or error-rate alerting; no dependency-level metrics.
- *Recovery*: restarts did not address the cause; no runbook or feature flag to switch the dependency off.
Write it blamelessly: focus on system conditions, not the engineer.

**Immediate (2–4 weeks).**
1. Address-validation timeout reduced to ~2 s; on timeout or error, accept the address and validate asynchronously later (flag order for review).
2. Feature flag/configuration to disable the call quickly.
3. Split \`customer-sapi\` into its own deployment; review other co-deployed critical APIs.
4. Web app retries with exponential backoff and jitter; API Manager spike control on checkout.
5. Alerts on p95 latency, 5xx rate and throughput drop for top-20 APIs, routed to on-call.

**Standards (published in Exchange as templates and a checklist).**
- Every outbound call has explicit connect/response timeouts and a retry policy with limits (no retries on non-idempotent calls without idempotency keys).
- Classify dependencies as critical/non-critical; non-critical calls have fallbacks or are made asynchronous.
- Circuit breaker pattern for unstable dependencies (custom implementation using Object Store state, or a gateway-level policy where available).
- Bulkheads: separate apps or separate thread/connection pools for critical flows; no co-deploying unrelated critical APIs.
- Health endpoints and graceful degradation messaging.

**Observability.** Anypoint Monitoring dashboards (or the existing observability tool via log/metric export) per API with:
- RED metrics (rate, errors, duration).
- Dependency latency.
- Correlation IDs propagated across APIs.
- Runbooks linked from each alert.

**Testing.** Load tests with dependency slowness simulated (mock servers injecting latency), game days before peak season, and resilience tests added to the CI/CD pipeline for critical APIs.

**Programme.** Month 1: immediate fixes. Months 2–3: top-20 critical APIs meet standards before peak. Months 4–6: remaining apps, game days, review. Governance: architecture review checks the resilience checklist; a monthly reliability review. **Metrics**: SLO attainment, time to detect (target < 5 min), time to recover, number of P1 incidents, % critical APIs compliant.

**Risks.** Programme crowded out by features (leadership-backed capacity, e.g. 20% per sprint), alert fatigue (symptom-based, tuned alerts), and fixes that only cover this one dependency (apply standards broadly).
`,
  followUps: [
    { q: 'Why did restarts only help for a few minutes?', a: 'Restarts freed threads, but the slow dependency and the client retries were still there, so threads filled up again. The cause was the unbounded waiting on a slow dependency, not the runtime state.' },
    { q: 'Is a 2-second timeout always right?', a: 'No. Timeouts should come from the dependency\'s normal latency (e.g. its p99) and the caller\'s own SLA budget. The point is that every call has a deliberate, bounded timeout.' },
    { q: 'How do you get busy teams to adopt the standards?', a: 'Make them easy (templates, shared libraries, pipeline checks), prioritise the critical APIs first, and tie the work to measurable SLOs that leadership tracks.' },
  ],
}
