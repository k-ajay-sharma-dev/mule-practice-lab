export default {
  id: 'inc-030',
  category: 'incidents',
  title: 'Debug Logging of Full Payloads Triples API Latency',
  level: 'BEGINNER',
  tags: ['logging', 'performance', 'memory', 'pii'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '11:02:43.990 INFO  [catalog-sapi] GET /products customer=C-2201 corrId=91ab', relevant: false },
      { text: '11:02:44.101 INFO  [catalog-sapi] LoggerMessageProcessor: [{"sku":"A-1001","name":"...","price":... (5,212,880 chars)', relevant: true, why: 'The whole 5 MB payload, including customer pricing, is serialised into a log message at INFO.' },
      { text: '11:02:44.977 INFO  [catalog-sapi] LoggerMessageProcessor: {"products":[{"sku":"A-1001", ... (5,340,112 chars)', relevant: true, why: 'A second full-payload log after the transform: two huge strings per request.' },
      { text: '11:02:45.003 WARN  [catalog-sapi] Log appender queue is full, blocking caller', relevant: true, why: 'The async log queue is full, so the request thread now waits on logging, which shows up as latency.' },
      { text: '11:02:45.010 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '11:02:45.220 INFO  [gc] G1 Young Generation pause 410 ms heap=88%', relevant: true, why: 'Building huge log strings creates garbage: memory spikes and long GC pauses.' },
      { text: '11:02:45.600 INFO  [catalog-sapi] GET /products 200 products=1240 duration=1104 ms corrId=91ab', relevant: false },
      { text: '11:02:46.001 INFO  [scheduler] Price cache refresh completed in 120 ms', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did latency go from 300 ms to ~1.1 s?',
        options: [
          'Each request serialises ~5 MB twice into log strings; the async appender queue fills and blocks the request thread, and GC pauses add more',
          'The products database became slower after the release',
          'The new transform has an inefficient DataWeave expression',
          'The log aggregator quota was reached and Mule stopped responding',
        ],
        answer: 0,
        explain: 'Logging `#[payload]` forces the whole payload into a String. At 50 req/s that floods the appender, which then **blocks the caller**: logging cost becomes request latency.',
      },
      {
        type: 'single',
        prompt: 'What do you do **immediately**?',
        options: [
          'Add more replicas to absorb the logging overhead',
          'Set the logger category to WARN in Runtime Manager (or hotfix-remove the logger) and ask for the logs with customer pricing to be purged',
          'Increase the log aggregator quota',
          'Increase the async appender queue size to 1 million entries',
        ],
        answer: 1,
        explain: 'Stop the payload logging. Changing the category level needs no code change if the logger has its own category, though applying it restarts the app on CloudHub 2.0. The pricing data in the logs is also a compliance issue to clean up.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix / logging standard**?',
        options: [
          'Log metadata: correlationId, endpoint, item count, payload size, duration',
          'If samples are needed: DEBUG level, dedicated category, truncated and masked',
          'A shared logging subflow/JSON logger and a review rule: no full bodies or PII at INFO',
          'Log the payload with `write(payload, "application/java")` instead, which is faster',
        ],
        answer: [0, 1, 2],
        explain: 'Log identifiers and sizes, not bodies. Changing the serialisation format still reads and serialises the whole payload.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Correlate the latency increase with the new payload loggers in the release',
          'Turn the logger category down to WARN or remove it',
          'Confirm p95 latency and log volume are back to normal',
          'Request purge/restriction of logs containing pricing',
          'Adopt a logging standard and alert on log volume per app',
        ],
        explain: 'Find the change, stop the impact, verify, deal with the data exposure, then prevent recurrence.',
      },
    ],
  },
  description: `
## Symptoms
- \`catalog-sapi\` p95 latency for \`GET /products\` went from **300 ms to ~1.1 s** after Tuesday's release.
- Memory usage spikes during busy periods; the log volume in the log aggregator went up **40x** and the team got a quota warning.
- Responses are correct.

## Change / Context
- To help debug a customer issue, a developer added a Logger at INFO level in the main flow: \`message: #[payload]\` before and after the transform.
- \`GET /products\` returns up to **5 MB** of JSON per call. The app runs at ~50 req/s at peak.
- The response payload contains customer-specific pricing.

## Logs
\`\`\`
11:02:44.101 INFO  [catalog-sapi] LoggerMessageProcessor: [{"sku":"A-1001","name":"...","price":... (5,212,880 chars)
11:02:44.977 INFO  [catalog-sapi] LoggerMessageProcessor: {"products":[{"sku":"A-1001", ... (5,340,112 chars)
11:02:45.003 WARN  [catalog-sapi] Log appender queue is full, blocking caller
\`\`\`

## Your tasks
1. Why did latency increase?
2. What do you do immediately?
3. What is the right fix?
4. What logging standards prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Logging #[payload] forces the full (possibly streamed) payload to be read and serialised into a String for each log line — heavy CPU, memory and I/O.',
    'Async appenders fill up at this volume and then block the caller, adding latency to the request thread.',
    'Immediate: change the log level/category via Runtime Manager (no code change, but applying it can restart the app) or remove the logger and redeploy.',
    'Fix: log identifiers, sizes and correlation IDs, not bodies; use DEBUG for payload samples, truncated, masked, and only temporarily.',
    'Logging pricing/customer data is a compliance risk; logs must be masked or the data purged.',
  ],
  solution: `
## Diagnosis
Each request now serialises ~5 MB of JSON **twice** into log messages. At 50 req/s that is roughly 500 MB/s of strings to build, encode and ship. That costs CPU, creates a lot of garbage (memory spikes, GC pauses) and fills the async logging queue — once it is full, the logger **blocks the calling thread**, which shows up directly as request latency.

## Immediate mitigation
Turn the noise off: if the logger uses a dedicated category, set it to WARN in Runtime Manager (logging levels can be changed without code), otherwise hotfix and redeploy with the logger removed. Ask the log platform team to purge/restrict the logs containing customer pricing.

## Root cause
Debug-style payload logging promoted to production at INFO level, with no size limit, no masking and no review of the logging standard.

## Permanent fix
- Log **metadata**: \`correlationId\`, endpoint, number of products, payload size, duration.
- If payload samples are really needed, log at DEBUG under a dedicated category, truncate (e.g. first 1–2 KB) and mask sensitive fields.
- Keep log4j2 async appenders, and size the queue sensibly.

## Prevention
- A logging standard (what to log at each level, never full bodies/PII at INFO) enforced in code review.
- Use a common logging subflow/JSON logger so the format and masking are consistent.
- Alert on log volume per app; load test with production logging config.
`,
  followUps: [
    { q: 'Does logging the payload affect streaming?', a: 'Yes — to log it, Mule must read the whole stream; with a repeatable stream it gets buffered (memory/disk), with a non-repeatable stream it can even be consumed so later processors see an empty payload.' },
    { q: 'How can you change log levels in CloudHub without changing code?', a: 'Runtime Manager lets you set log levels per package or class for a deployed app; that is why using clear logger categories is useful. It needs no new build, but it is not free: the CloudHub 2.0 docs say changing the log level restarts the application, and on CloudHub 1.0 applying settings redeploys it.' },
  ],
}
