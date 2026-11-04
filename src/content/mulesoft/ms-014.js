export default {
  id: 'ms-014',
  category: 'mulesoft',
  title: 'HTTP Request Tuning: Timeouts, Connection Pool and Response Validators',
  level: 'INTERMEDIATE',
  tags: ['http', 'timeouts', 'connection-pool', 'response-validator'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each HTTP Request setting to what it limits.',
      pairs: [
        ['`connectionTimeout` (TCP client socket properties)', 'Establishing the TCP/TLS connection'],
        ['`responseTimeout` (on the operation)', 'Waiting for the response after sending the request'],
        ['`connectionIdleTimeout`', 'How long an unused pooled connection is kept'],
        ['`maxConnections`', 'Concurrent connections towards the provider'],
      ],
      explain: 'Connection-level settings govern the pool and TCP setup; the response timeout governs each request and raises `HTTP:TIMEOUT` on expiry.',
    },
    {
      type: 'single',
      prompt: 'The rates API normally answers in 300 ms and the Order API SLA is 3 s. Which `responseTimeout` fits?',
      options: ['About 1,500–2,000 ms', '30,000 ms', '300 ms exactly', 'Leave the default — timeouts only matter for POST'],
      answer: 0,
      explain: 'The timeout must fit inside the 3 s SLA with room for a fallback, while being well above normal latency. 300 ms exactly would fail on normal jitter.',
    },
    {
      type: 'single',
      prompt: 'Why did a hanging rates API make the Order API stop answering **unrelated** requests?',
      options: [
        'In-flight events piled up holding connections and concurrency until the app ran out of capacity',
        'Mule stops all flows when one connector is unhealthy',
        'The HTTP Listener has a single thread',
        'The rates API returned 503, which triggered the gatekeeper',
      ],
      answer: 0,
      explain: 'Without a sensible timeout, every waiting call keeps an event in flight. Short timeouts, bounded `maxConnections` and a fallback isolate the dependency (bulkhead).',
    },
    {
      type: 'single',
      prompt: 'How do you make a 404 from the rates API a normal response for this call only?',
      options: [
        'Add `<http:success-status-code-validator values="200..299,404"/>` to that request and branch on `attributes.statusCode`',
        'Set `followRedirects="true"` on the config',
        'Add an error mapping from `HTTP:NOT_FOUND` to `ANY`',
        'Configure a reconnection strategy for 404',
      ],
      answer: 0,
      explain: 'A response validator on that one request makes 404 non-failing and keeps the body available as `payload`. By default anything outside 200..399 raises a typed error such as `HTTP:NOT_FOUND`.',
    },
    {
      type: 'single',
      prompt: 'After a new load balancer, the first call after a quiet period fails with "connection reset". What do you check?',
      options: [
        'That `connectionIdleTimeout` is lower than the load balancer idle timeout',
        'That `responseTimeout` is higher than the load balancer idle timeout',
        'That the response validator accepts 5xx',
        'That the listener uses HTTPS',
      ],
      answer: 0,
      explain: 'If the LB drops idle connections sooner than Mule does, Mule reuses a dead pooled connection. Keep Mule idle timeout below the LB one (or disable persistent connections as a last resort).',
    },
    {
      type: 'single',
      prompt: 'The rates host is completely unreachable. Which error type is raised?',
      options: ['`HTTP:CONNECTIVITY`', '`HTTP:NOT_FOUND`', '`HTTP:SERVICE_UNAVAILABLE`', '`MULE:EXPRESSION`'],
      answer: 0,
      explain: '`HTTP:CONNECTIVITY` (child of `MULE:CONNECTIVITY`). `SERVICE_UNAVAILABLE` means the server answered with 503.',
    },
  ],
  description: `
An **Order Process API** calls a third-party **Shipping Rates API**. Observed issues in production:

- Normally the rates API answers in 300 ms. During a provider incident it hung for minutes; the Order API stopped answering **all** requests, even ones that don't need shipping rates.
- When a ZIP code is unknown, the provider returns **404** with a JSON body \`{"reason":"ZIP_UNKNOWN"}\`. The business wants that treated as "no rates available" and the order to continue — but Mule raises \`HTTP:NOT_FOUND\`.
- After moving to a new load balancer, some calls fail with "connection reset" errors on the first request after a quiet period.
- The Order API's own SLA is 3 seconds.

**Questions**
1. Which timeouts exist on the HTTP Request (connection-level vs request-level) and what values would you choose here?
2. Why did one slow dependency affect unrelated requests?
3. How do you make 404 a normal response for this call only? Show the configuration.
4. What do you check in the connection settings for the "connection reset" errors?
`,
  answerTemplate: `## Timeouts

## Why everything slowed down

## Treating 404 as success

## Connection reset errors
`,
  keyPoints: [
    'Connection timeout (in the TCP client socket properties of the connection, default 30000 ms) limits establishing the TCP connection; response timeout (on the request) limits waiting for the response — on expiry the error is HTTP:TIMEOUT.',
    'Without a sensible responseTimeout, waiting requests pile up and consume capacity/connections, starving other requests.',
    'Response validator: success-status-code-validator with values like 200..299,404 makes 404 non-failing; then branch on attributes.statusCode.',
    'Connection pool settings: maxConnections, connectionIdleTimeout and usePersistentConnections; idle timeout must be lower than the load balancer\'s idle timeout to avoid reused dead connections.',
    'Timeouts must fit inside the caller\'s SLA, leaving room for retries only if the budget allows.',
  ],
  solution: `
**Timeouts**
- **Connection timeout** (\`connectionTimeout\` in the TCP client socket properties of the request connection, not on the connection element itself) — time to establish the TCP/TLS connection. Choose a low value, e.g. 2,000 ms.
- **Response timeout** (\`responseTimeout\` on the HTTP Request operation; if unset, Mule's default response timeout applies) — time to wait for the response. With a 300 ms normal latency and a 3 s SLA, ~1,500–2,000 ms. Expiry raises **\`HTTP:TIMEOUT\`**, which you handle (e.g. "rates unavailable, use default shipping" or 503).

**Why everything slowed down:** each hanging call keeps an event in flight, holding a connection from the pool and the flow's concurrency. As requests keep arriving, in-flight events accumulate until the app hits its concurrency/connection/memory limits and everything queues — a classic missing-timeout cascade. Short timeouts, a bounded \`maxConnections\` and a fallback isolate the dependency (bulkhead); a circuit-breaker style pattern (e.g. a flag in Object Store after N failures) helps further.

**404 as success** — on this request only:
\`\`\`xml
<http:request method="GET" config-ref="shippingRates" path="/rates"
    responseTimeout="2000">
  <http:query-params>#[{ zip: vars.zip }]</http:query-params>
  <http:response-validator>
    <http:success-status-code-validator values="200..299,404"/>
  </http:response-validator>
</http:request>
<choice>
  <when expression="#[attributes.statusCode == 404]">
    <set-payload value="#[{ rates: [], reason: payload.reason }]"/>
  </when>
</choice>
\`\`\`
By default only 2xx/3xx (200..399) count as success; anything else raises a typed error like \`HTTP:NOT_FOUND\`. Alternatively keep the default and handle \`HTTP:NOT_FOUND\` in a Try with On Error Continue — but the validator makes the intent explicit and keeps the body available as \`payload\`.

**Connection reset:** Mule reuses pooled persistent connections. If the load balancer closes idle connections sooner than Mule's \`connectionIdleTimeout\`, Mule reuses a connection the LB already dropped → reset. Set \`connectionIdleTimeout\` **below** the LB's idle timeout (or disable persistent connections as a last resort). Also review \`maxConnections\` (default unlimited) to cap concurrency towards the provider, and TLS/proxy settings for the new path.
`,
  followUps: [
    {
      q: 'Would you retry on HTTP:TIMEOUT for this rates call?',
      a: 'Only once and only if the SLA budget allows (e.g. 1 s timeout + one quick retry); the call is a read so it is idempotent. Otherwise return a fallback quickly.',
    },
    {
      q: 'How do you send a header to every request of this config, e.g. an API key?',
      a: 'Use default headers on the HTTP Request configuration (with the key from a secure property) or the headers of each request. Never hardcode the key in the XML.',
    },
    {
      q: 'What error type do you get when the host is unreachable?',
      a: 'HTTP:CONNECTIVITY (a child of MULE:CONNECTIVITY), which is the error a reconnection strategy or a retry wrapper would target.',
    },
  ],
}
