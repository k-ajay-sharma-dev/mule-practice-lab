export default {
  id: 'ar-011',
  category: 'architecture',
  title: 'Observability Across an API-led Chain',
  level: 'INTERMEDIATE',
  tags: ['observability', 'correlation-id', 'logging', 'tracing'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'How does one correlation ID follow the loan request across the HTTP hops?',
      options: [
        'Each app generates its own UUID and logs it',
        'The Experience API accepts or generates X-Correlation-ID; the Mule 4 HTTP listener uses it as the event correlationId and the HTTP requester sends it downstream by default',
        'The ID is put in the payload body of every request',
        'Anypoint Monitoring adds it automatically to Splunk',
      ],
      answer: 1,
      explain: 'Mule 4 propagates the correlation ID over HTTP by default — you only have to make sure the setting is not disabled and that the entry point accepts or generates the ID.',
    },
    {
      type: 'single',
      prompt: 'The LoanSubmitted message crosses Anypoint MQ. How do you keep the same correlation ID in the document consumer?',
      options: [
        'It is propagated automatically over MQ with no work',
        'Add it as a message property when publishing and set it back in the consumer (e.g. With CorrelationID scope from the tracing module)',
        'Use the MQ message ID as the correlation ID',
        'It cannot be done for asynchronous hops',
      ],
      answer: 1,
      explain: 'The async hop breaks the HTTP header chain, so the ID must travel as a message property and be restored as the event correlation ID on the consumer side.',
    },
    {
      type: 'multi',
      prompt: 'Which items belong in the logging standard?',
      options: [
        'Structured JSON with fixed fields (timestamp, app, env, correlationId, businessKey, event, durationMs, status)',
        'Log at entry, exit, before/after each external call with duration, and on error',
        'Mask national ID numbers, credentials and tokens in a shared component',
        'Log the full payload at INFO in production for easier debugging',
      ],
      answer: [0, 1, 2],
      explain: 'Per-call durations answer "which hop was slow". Full payloads in production logs leak personal data and inflate Splunk cost.',
    },
    {
      type: 'single',
      prompt: 'How do Mule logs get into Splunk without risking the apps when Splunk is down?',
      options: [
        'Each flow calls the Splunk HTTP API with a Logger-like HTTP Request',
        'A Log4j2 appender (HTTP Event Collector) or platform log forwarding, with an async/local appender so a Splunk outage does not block the app',
        'Developers export logs manually once a day',
        'Splunk reads the Mule apps\' memory directly',
      ],
      answer: 1,
      explain: 'Logging is configured once in Log4j2, not in each flow. Async appenders decouple the app from the log backend.',
    },
    {
      type: 'multi',
      prompt: 'Which alerts tell the team about problems before customers do?',
      options: [
        '5xx rate above a threshold',
        'p95 latency above the SLA',
        'DLQ message count greater than zero',
        'No LoanSubmitted processed in 30 minutes during business hours',
        'An alert on every single ERROR log line',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Alert on symptoms and absence of expected activity. Alerting on every error line causes noise that the team learns to ignore.',
    },
    {
      type: 'match',
      prompt: 'Match each signal to where it goes.',
      pairs: [
        ['Structured application logs', 'Splunk (central log platform)'],
        ['Built-in throughput and response-time metrics per app', 'Anypoint Monitoring'],
        ['Requests per client application', 'API Manager analytics'],
        ['Per-hop spans across apps', 'A tracing backend via OpenTelemetry'],
      ],
      explain: 'Each tool answers a different question. Without full tracing, per-hop durationMs logs with the same correlation ID already locate the slow hop in one Splunk search.',
    },
  ],
  description: `
A bank runs a **loan application** journey across 7 Mule apps on CloudHub 2.0:

\`\`\`
Web/Mobile → Loan Experience API → Loan Process API
   → Customer System API (Salesforce)
   → Credit Bureau System API (external)
   → Core Banking System API (on-prem)
   → publishes LoanSubmitted to Anypoint MQ → Document consumer
\`\`\`

Problems reported:
- A customer complains that the application "hung for 40 seconds" yesterday at 14:02. It took the team **two days** to find which hop was slow.
- Each app logs in a different format; some log the whole payload including national ID numbers.
- The security team already uses **Splunk** for all other systems and wants Mule logs there.
- Management wants a dashboard of loan submissions per hour and error rate per API.

**Questions:**
- How do you make one request traceable across all hops, including the async MQ hop?
- What is your logging standard (format, levels, what never to log)?
- Where do logs, metrics and traces go, and how?
- How do you alert so the team hears about problems before customers do?
`,
  answerTemplate: `## Correlation across hops

## Logging standard

## Logs, metrics and traces — where they go

## Alerting and dashboards
`,
  keyPoints: [
    'One correlation ID per request, accepted or generated at the Experience API and propagated on every HTTP call (X-Correlation-ID, which Mule 4 HTTP listener/requester handle by default) and as a message property on MQ.',
    'Structured JSON logs with a fixed set of fields (timestamp, app, env, correlationId, flow, event, durationMs, status), logged at entry, exit and error of each API.',
    'Sensitive data (national ID, account numbers, full payloads in prod) is never logged or is masked; payload logging only at DEBUG in lower environments.',
    'Logs forwarded to the central SIEM/log platform (Splunk) via a Log4j2 appender or log forwarding, while Anypoint Monitoring covers built-in metrics and dashboards.',
    'Distributed tracing (e.g. OpenTelemetry) or at least per-hop duration logging makes latency attributable to a specific hop.',
    'Alerts on symptoms (error rate, p95 latency, DLQ depth, no messages processed) rather than on single log lines, routed to an on-call channel.',
  ],
  solution: `
**Correlation across hops.**
- The Experience API accepts an incoming \`X-Correlation-ID\` (from the web channel) or generates one. In Mule 4 the HTTP listener uses that header as the event's \`correlationId\`, and the HTTP requester sends it downstream by default — verify this setting is not disabled.
- For **Anypoint MQ**, add the correlation ID as a **message property** when publishing, and in the consumer set it back (e.g. using the \`tracing\` module's *With CorrelationID* scope) so the async part shares the same ID.
- Return the ID in the response header so support can ask the customer or front-end for it.
- Include a **business key** (loan application ID) in logs once known, so support can search by either.

**Logging standard.**
- **Structured JSON**: \`timestamp, level, app, env, correlationId, businessKey, flow, event (START/END/ERROR/EXT_CALL), target, durationMs, httpStatus, errorType\`.
- Log at **entry, exit, before/after each external call** (with duration) and on error — not every processor.
- **Never log**: national ID, credentials, tokens, full payloads in production. Mask in a shared logging component (DataWeave masking function) so every app behaves the same.
- Ship this as a **shared library** (e.g. a Mule plugin or the JSON Logger asset) so 7 teams do not invent 7 formats.

**Where things go.**
- **Logs → Splunk**: configure a Log4j2 appender (HTTP Event Collector) in each app or use the platform's log forwarding, plus a local/async appender so a Splunk outage does not block the app.
- **Metrics → Anypoint Monitoring** (built-in dashboards per app/API: throughput, response time, errors) and API Manager analytics per client.
- **Traces**: Mule 4.6+ can emit OpenTelemetry spans; export to a tracing backend if your subscription/tooling supports it. Without full tracing, per-hop \`durationMs\` logs with the same correlation ID already answer "which hop was slow" in one Splunk query.

**Alerting and dashboards.**
- Alerts on **symptoms**: 5xx rate > threshold, p95 latency > SLA, DLQ message count > 0, "no LoanSubmitted processed in 30 min during business hours", replicas restarting.
- Business dashboard in Splunk from the structured logs (loan submissions per hour, by channel).
- Route alerts to on-call (PagerDuty/Teams), each linked to a runbook.

**Result:** the "40 seconds at 14:02" question becomes one search on the correlation ID showing a span/log per hop with durations — minutes instead of two days.
`,
  followUps: [
    { q: 'Logging every hop adds latency and Splunk licence cost. How do you control it?', a: 'Use async appenders, log only entry/exit/external-call/error events, keep payloads out of production logs, and agree retention per log level. Splunk cost is driven by volume, so a lean structured standard is cheaper than ad-hoc verbose logs.' },
    { q: 'A partner calls you without a correlation ID header. What happens?', a: 'The Experience API generates one, logs it, and returns it in the response header. Never reject the request just because the header is missing.' },
    { q: 'How do you trace across a third-party system that does not propagate your ID?', a: 'Log the outgoing call with your correlation ID plus the partner\'s own request/transaction ID from the response, so the two can be joined when raising a ticket with the partner.' },
  ],
}
