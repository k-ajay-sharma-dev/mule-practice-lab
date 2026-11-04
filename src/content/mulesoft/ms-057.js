export default {
  id: 'ms-057',
  category: 'mulesoft',
  title: 'Monitoring an API-Led Network: Functional Monitors and Per-Layer Dashboards',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'anypoint-monitoring', 'api-functional-monitoring', 'dashboards', 'alerts', 'observability'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'The Mobile EAPI dashboard looked "green" while every order failed. Why?',
      options: [
        'Anypoint Monitoring was down',
        'It returned well-formed 502 responses quickly — fast errors were not treated as errors in that layer\'s metrics',
        'The dashboard only shows JVM metrics',
        'The SAPI was not deployed',
      ],
      answer: 1,
      explain: 'Downstream failures surfaced as 502/504 upstream must count as errors; "fast, well-formed errors" are not green.',
    },
    {
      type: 'single',
      prompt: 'From where should a functional monitor test the internal Inventory SAPI?',
      options: [
        'A public location, like the Mobile EAPI',
        'A private location running inside your network / private space',
        'The developer\'s laptop',
        'It cannot be monitored functionally',
      ],
      answer: 1,
      explain: 'Public locations run on MuleSoft-hosted infrastructure and suit internet-facing APIs; internal Process and System APIs need private locations.',
    },
    {
      type: 'single',
      prompt: 'Which Inventory SAPI functional monitor would have caught the database refusing connections?',
      options: [
        'A `/health` check that returns 200 without touching the backend',
        'A lightweight read such as `GET /inventory/{sku}` for a known test SKU that actually hits the database',
        'A POST creating a real inventory record every minute',
        'A ping of the CloudHub replica',
      ],
      answer: 1,
      explain: 'A shallow health check would have stayed green. Avoid real writes in production — they pollute data and trigger business processes.',
    },
    {
      type: 'single',
      prompt: 'Which alert would have named the culprit fastest?',
      options: [
        'An error-rate alert on the Inventory SAPI app',
        'A CPU alert on the Mobile EAPI',
        'A weekly usage report',
        'A memory alert on the Orders PAPI',
      ],
      answer: 0,
      explain: 'A downstream SAPI error-rate alert explains the upstream 502s and points straight at the failing layer.',
    },
    {
      type: 'order',
      prompt: 'Order how a correlation ID lets you trace one failing mobile request.',
      items: [
        'The EAPI reads an incoming `x-correlation-id` or generates one',
        'Each layer forwards it on every outbound HTTP Request',
        'Every layer logs it on all log lines',
        'One search on the ID in the log aggregator shows the full path',
      ],
      explain: 'Propagation plus centralised logs turns 90 minutes across five log screens into one query.',
    },
    {
      type: 'multi',
      prompt: 'Which metrics belong on the **System API** layer dashboard?',
      options: [
        'Backend error types (connectivity, timeouts)',
        'Response time',
        'Connection pool / JVM / CPU',
        'Per-partner SLA tier usage',
      ],
      answer: [0, 1, 2],
      explain: 'Per-client application usage and policy violations belong to the Experience layer, which faces consumers.',
    },
  ],
  description: `
Saturday morning, the business reports "mobile orders are failing". The on-call engineer opens five different Runtime Manager log screens, one per app, and takes 90 minutes to discover that the **Inventory System API**'s database was refusing connections. Meanwhile, the Experience API's own dashboard looked "green" because it returned well-formed 502 responses quickly.

Chain: **Mobile EAPI → Orders PAPI → Inventory SAPI / Customers SAPI → backends**

**Questions**
1. What is API Functional Monitoring and how would you use it for this chain? Which layers would you monitor this way and from where?
2. Design dashboards per layer: what metrics matter at each level?
3. Which alerts would have caught this faster, and where should they be defined?
4. How do you trace one failing mobile request through all layers?
`,
  answerTemplate: `## API Functional Monitoring

## Dashboards per layer

## Alerts

## Tracing a request across layers
`,
  keyPoints: [
    'API Functional Monitoring runs scheduled test suites (assertions on status, body, latency) against deployed endpoints from public or private locations and notifies on failure.',
    'Monitor Experience APIs from public locations (the consumer\'s view) and Process/System APIs from private locations inside the network, testing a real read path end to end.',
    'Built-in Anypoint Monitoring dashboards show per-app requests, response times, failures and JVM/resource metrics; custom dashboards can combine apps of a domain per layer.',
    'Alert on error rate and response time per layer, plus API Manager API alerts (e.g. policy violations, bad responses); a downstream SAPI alert explains the upstream 502s.',
    'Propagate a correlation ID (x-correlation-id) across HTTP calls and log it in every layer so one search finds the whole chain.',
  ],
  solution: `
**API Functional Monitoring**
- Part of Anypoint Monitoring. You define a **monitor**: target endpoints, a test suite (assertions on status code, response body, headers, latency), a schedule, a location and notification channels (e.g. email or chat integrations).
- Tests can be defined in the UI or as code (BAT test suites) and kept in source control.
- **Public locations** run from MuleSoft-hosted infrastructure — good for the internet-facing Mobile EAPI. **Private locations** run inside your network/private space — needed for internal Process and System APIs.
- Suggested monitors: Mobile EAPI "get order status" (synthetic customer), Orders PAPI health and a read operation, each SAPI's lightweight read (e.g. \`GET /inventory/{sku}\` for a known test SKU) that actually touches the database. A pure \`/health\` that returns 200 without touching the backend would have missed this incident.

**Dashboards per layer**
| Layer | Focus |
|---|---|
| Experience | Requests and latency per endpoint, 4xx vs 5xx split, policy violations (auth failures, rate limited), per client app usage |
| Process | Latency broken down by downstream call, error rate by downstream API, throughput |
| System | Backend error types (connectivity, timeouts), response time, connection pool/JVM/CPU, rate-limit rejections |

Use the built-in application dashboards for each app and build **custom dashboards** per business domain combining all layer apps on one page (e.g. "Orders: EAPI / PAPI / SAPIs"), so you can see where the red starts. API Manager analytics adds per-API-instance and per-client-application views.

**Alerts**
- Runtime Manager / Anypoint Monitoring alerts on **error rate** and **response time** per app — a SAPI error-rate alert would have fired first and named the culprit.
- API Manager **API alerts** on the instances (e.g. policy violations, response code alerts) for consumer-facing behaviour.
- Functional monitor failure notifications for user-journey checks.
- Treat downstream 5xx returned as 502/504 by an upstream layer as **errors** in that layer's metrics — "fast, well-formed errors" are not green.

**Tracing across layers**
- Each layer reads an incoming \`x-correlation-id\` (or generates one at the EAPI) and forwards it on every outbound HTTP Request; Mule's correlation ID can be set from it so it appears in all log lines.
- Logs from all apps go to Anypoint Monitoring log search or an external aggregator (Splunk/ELK); one query on the ID shows the full path.
- Anypoint Monitoring's distributed tracing capabilities (where available in your subscription) can visualise the spans across apps.
`,
  followUps: [
    {
      q: 'Why not rely only on functional monitors?',
      a: 'They sample a few synthetic requests on a schedule; real-traffic metrics and alerts catch partial failures, slowdowns and issues affecting specific consumers that a synthetic test might miss.',
    },
    {
      q: 'Should functional monitors call production with real write operations?',
      a: 'Generally no — use read operations or dedicated test records, otherwise monitors pollute production data and trigger business processes.',
    },
    {
      q: 'What credentials does a functional monitor use against a protected API?',
      a: 'Give it its own client application (and contract) so its traffic is identifiable and can be excluded from business analytics; store the secret securely in the monitor configuration.',
    },
  ],
}
