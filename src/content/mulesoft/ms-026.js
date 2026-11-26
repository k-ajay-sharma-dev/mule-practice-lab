export default {
  id: 'ms-026',
  category: 'mulesoft',
  title: 'Observability Design: Anypoint Monitoring, Custom Metrics and Alerts',
  level: 'EXPERT',
  tags: ['monitoring', 'alerts', 'custom-metrics', 'observability', 'slo'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Why did no alert fire between 02:10 and 05:40?',
      options: [
        'The alerts watched CPU, memory and app state, which stayed normal',
        'Anypoint Monitoring does not record outbound HTTP failures',
        'CloudHub 2.0 holds back non-critical alerts outside office hours',
        'The app had crashed, so it stopped sending any metrics at all',
      ],
      answer: 0,
      explain: 'Infrastructure stays normal during a dependency failure. The signal existed (outbound failure rate to the provider on the built-in dashboard), but nobody alerted on it. Alert on **symptoms**, not only resources.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which alerts would have caught this incident quickly?',
      options: [
        'Payment System API failure rate > 5% for 5 minutes',
        'Outbound failures/timeouts to the payment provider above a threshold',
        'Business metric: technical failures per provider',
        'CPU above 80% on the payment app replicas for 10 minutes',
        'An alert when the payment app status changes from RUNNING',
        'A daily report of failed payments sent to customer service',
      ],
      answer: [0, 1, 2],
      explain: 'The incident was 30% `HTTP:TIMEOUT` errors to one provider, so alert on the failure rate, on outbound timeouts and on failures per provider. Dependency errors and timeouts rarely move CPU. CPU alerts are for capacity, not for user-facing incidents. The app stayed running all night, so a status alert never fires. A daily report would arrive hours after customers had noticed.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the Anypoint capability.',
      pairs: [
        ['App stopped, replica restarting, deployment failed', 'Runtime Manager alerts'],
        ['Failure rate or response time threshold on app metrics', 'Anypoint Monitoring alerts'],
        ['Payments by provider and outcome on a dashboard', 'Custom Metrics connector'],
        ['Detect an outage at 03:00 with no real traffic', 'API Functional Monitoring'],
      ],
      explain: 'Runtime Manager alerts cover app/platform state; Monitoring alerts cover metric thresholds; custom metrics carry business dimensions; functional monitoring runs scheduled synthetic tests.',
    },
    {
      type: 'single',
      prompt: 'What makes "which app and which dependency is failing" answerable in minutes?',
      options: [
        'Correlation IDs in every log line and per-dependency dashboards',
        'Raising the log level to DEBUG on all 45 apps during incidents',
        'Searching the logs of each app in Runtime Manager one by one',
        'Running more replicas per app so failures are spread out',
      ],
      answer: 0,
      explain: 'Consistent structured logs that include `error.errorType` let a search like `errorType=HTTP:TIMEOUT app=payment-sapi` find the culprit immediately; tracing helps further where available.',
    },
    {
      type: 'single',
      prompt: 'What should a `/health` endpoint used by synthetic checks do?',
      options: [
        'Run a cheap check of the app and its critical dependencies',
        'Place a real payment, to prove that the full path works',
        'Return 200 once the app has started, without calling dependencies',
        'Return the JVM heap statistics to any caller that asks',
      ],
      answer: 0,
      explain: 'Check that the app responds and critical dependencies are reachable. Avoid heavy or state-changing calls; protect it from public abuse with client ID enforcement or internal-only ingress.',
    },
  ],
  description: `
You are the platform architect for an e-commerce company with **45 Mule apps** on CloudHub 2.0. A recent incident went like this:

- At 02:10, the Payment System API started returning \`HTTP:TIMEOUT\` from the payment provider for 30% of calls.
- From 02:10 to 05:40, no alert fired. The apps were "running" and CPU/memory were normal.
- At 05:40, customer service noticed a spike in "payment failed" complaints. Engineers spent another hour finding which app and which dependency was failing.

The CTO asks you for an **observability design** so this can't happen again, using Anypoint Platform capabilities first and external tools where sensible.

**Questions**
1. What does Anypoint Monitoring provide out of the box for an app (built-in dashboards, metrics)? Why didn't infrastructure alerts catch this incident?
2. Which **alerts** would you define (on what signal, threshold, window, and who gets notified)? Distinguish Runtime Manager alerts and Anypoint Monitoring alerts.
3. How would you publish **business metrics** (e.g. payments by outcome and provider) from the flow, and what are the options?
4. How do you make the "which app/dependency" question answerable in minutes?
5. How would you add **proactive** checks, so an outage is detected even when there is no traffic (e.g. at 03:00)?
`,
  answerTemplate: `## Out-of-the-box monitoring

## Alerts

## Business metrics

## Finding the failing component

## Proactive checks
`,
  keyPoints: [
    'Built-in dashboards show inbound/outbound request rates, response times and failures per app and per outbound dependency, plus JVM/infrastructure metrics; infra metrics stay normal when a dependency fails.',
    'Alert on symptoms: error rate and response time per API/app (e.g. failures > 5% over 5 minutes), not only CPU/memory; route to on-call tooling with severity.',
    'Runtime Manager alerts cover deployment/app state and resource events; Anypoint Monitoring basic/advanced alerts cover metric thresholds (advanced features depend on subscription).',
    'Business metrics via the Custom Metrics connector (subscription-dependent) or structured logs/metrics exported to an external tool (e.g. Splunk, Datadog via telemetry/log forwarding).',
    'Correlation IDs, consistent structured logs and outbound-dependency dashboards (and distributed tracing where available) let you pinpoint the failing app and dependency.',
    'Proactive synthetic checks with API Functional Monitoring (or an external synthetic tool) on critical endpoints, including health endpoints that check dependencies.',
  ],
  solution: `
**Out of the box:** Anypoint Monitoring **built-in dashboards** per app: inbound requests (rate, response time, failures, by endpoint), **outbound requests per dependency** (HTTP calls with response time and failures), JVM (heap, GC, threads) and infrastructure (CPU, memory). The incident was a **dependency failure**: the app was healthy and CPU/memory normal, and errors were probably handled (e.g. returned as "payment failed"), so infra-based alerts had nothing to fire on. The signal existed (outbound failure rate to the provider), but nobody alerted on it.

**Alerts** (symptom-based, per critical API):
- **Error rate**: Payment System API failures > 5% for 5 minutes → page on-call (P1).
- **Outbound dependency**: failures/timeouts calling the payment provider above a threshold → page + provider escalation.
- **Latency**: p95 response time above SLO (e.g. > 2 s for 10 minutes) → warn.
- **Traffic drop**: requests far below the normal baseline for the time of day → warn (catches "nothing is arriving").
- **Platform/app state** (Runtime Manager alerts): deployment failed, app/replica stopped or restarting, resource thresholds.
Anypoint Monitoring offers basic alerts on app metrics and, with higher subscriptions, advanced alerts on custom dashboard queries. Route notifications to email plus PagerDuty/Opsgenie/Slack (via email integration or webhook in the external tool), with a runbook link in each alert.

**Business metrics:** in the payment flow, emit a metric on every outcome with dimensions such as \`provider\`, \`outcome\` (approved/declined/technical_error), \`errorType\`:
- **Custom Metrics connector** → visible in Anypoint Monitoring custom dashboards and alertable (availability depends on subscription tier).
- Or **structured logs** (JSON with outcome fields) forwarded to Splunk/ELK and turned into metrics there, or metrics exported to Datadog/Prometheus via telemetry export where available.
A "technical failures per provider" business alert would have fired at 02:15.

**Finding the failing component**
- Correlation ID propagated through all layers and included in every log line.
- A **service map / dependency view** per API layer (Experience → Process → System → backend) and dashboards per dependency.
- Consistent error codes (\`error.errorType\` logged), so a search like \`errorType=HTTP:TIMEOUT app=payment-sapi\` is immediate.
- Distributed tracing (OpenTelemetry-based tracing support in recent Mule runtimes, exported to a tracing backend) where available.

**Proactive checks:** **API Functional Monitoring** (Anypoint) runs scheduled test suites against public or private endpoints and alerts on failure: e.g. every 5 minutes call a \`/health\` endpoint of the Payment System API that performs a lightweight check against the provider (or a sandbox transaction). It detects outages even when real traffic is zero. External synthetic tools work too.

Close the loop with SLOs per API (availability, latency), an incident runbook, and post-incident reviews that add the missing alert.
`,
  followUps: [
    {
      q: 'Why is "alert on CPU > 80%" a weak primary alert for integration apps?',
      a: 'Most integration failures are dependency errors, timeouts or bad data that don\'t move CPU. CPU alerts are useful for capacity, but user-facing symptoms (errors, latency, traffic) catch real incidents.',
    },
    {
      q: 'How do you avoid alert fatigue with 45 apps?',
      a: 'Alert only on SLO-relevant symptoms for critical APIs, use time windows and severity levels, de-duplicate in the on-call tool, and review noisy alerts regularly; everything else goes to dashboards, not pages.',
    },
    {
      q: 'What should a /health endpoint check, and what should it avoid?',
      a: 'It should check the app is responsive and critical dependencies are reachable in a cheap way. Avoid heavy or state-changing calls and protect it from public abuse (e.g. client ID or internal-only ingress).',
    },
  ],
}
