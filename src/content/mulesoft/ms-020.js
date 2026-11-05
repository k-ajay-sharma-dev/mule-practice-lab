export default {
  id: 'ms-020',
  category: 'mulesoft',
  title: 'Production Logging: log4j2, Correlation IDs and Log Levels',
  level: 'ADVANCED',
  tags: ['logging', 'log4j2', 'correlation-id', 'observability'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'How does the correlation ID travel from the Experience API to the System API?',
      options: [
        'The Listener takes `X-Correlation-ID` (or generates one), and HTTP Request controls sending it downstream with `sendCorrelationId` (AUTO by default)',
        'It must be copied manually into a header on every HTTP Request',
        'CloudHub injects a new ID at each app, so they cannot be linked',
        'It travels in the query string as `?correlationId=`',
      ],
      answer: 0,
      explain: 'No manual header copying is needed: `sendCorrelationId` governs the outbound ID. The docs do not define what AUTO does, so set `ALWAYS` if you need a guarantee and check the wire log. For async hops (MQ/JMS) put the ID in message properties and restore it on the consumer.',
    },
    {
      type: 'multi',
      prompt: 'Which belong in a good production INFO log line?',
      options: [
        '`correlationId`',
        'App, flow and step names',
        'Business identifier such as `orderId`, status and elapsed time',
        'The full payload including card holder name and address',
      ],
      answer: [0, 1, 2],
      explain: 'Structured logs with IDs and timing make cross-app search possible. Never log card data, personal data, passwords or tokens.',
    },
    {
      type: 'single',
      prompt: 'A thread dump shows many threads waiting on log file I/O. What is the fix?',
      options: [
        'Use async loggers (`AsyncLogger` / `AsyncRoot`) with an appropriate buffer, and stop logging huge payloads',
        'Set the root logger to DEBUG to flush faster',
        'Add more replicas only',
        'Write logs with a Logger inside an Async scope',
      ],
      answer: 0,
      explain: 'Synchronous appenders block processing threads. Async loggers decouple logging from processing; serialising huge payloads costs CPU and memory regardless of the appender.',
    },
    {
      type: 'single',
      prompt: 'You need DEBUG logs for the SAP connector in production. What do you do?',
      options: [
        'Add a logger for the connector package at DEBUG, keep the root at INFO, and revert afterwards',
        'Set the root logger to DEBUG',
        'Add a Logger component with level DEBUG before every SAP call',
        'Redeploy the app in debug mode from Studio',
      ],
      answer: 0,
      explain: 'Per-package levels target only the noisy component. Setting the root to DEBUG is exactly what made logs explode and slowed the app.',
    },
    {
      type: 'single',
      prompt: 'On **CloudHub 1.0** you add a Splunk appender to `log4j2.xml`. How do you keep logs visible in Runtime Manager too?',
      options: [
        'Disable CloudHub logs for the app and also include the CloudHub log4j appender in the config',
        'Nothing — CloudHub always merges custom appenders automatically',
        'Use only the Splunk appender; Runtime Manager reads from Splunk',
        'Set `sendCorrelationId="ALWAYS"`',
      ],
      answer: 0,
      explain: 'A custom log4j2 config on CloudHub 1.0 requires disabling CloudHub logs; including the CloudHub appender keeps platform logging working.',
    },
  ],
  description: `
A three-layer integration (Experience → Process → System APIs, 9 apps) is in production. Support complains:

- When a customer reports a failed order, it takes **hours** to find the related log lines across the 9 apps.
- Some apps log the **entire payload at INFO**, including card holder names and addresses; logs are shipped to Splunk.
- During a peak, one app's response time doubled; a thread dump showed many threads waiting on log file I/O.
- To debug an issue with the SAP connector, an engineer set the **root** logger to DEBUG in production — logs exploded and the app slowed down.

**Questions**
1. How do correlation IDs work in Mule 4, how are they propagated between apps, and how do you make them searchable?
2. What would a good log message look like (fields, level, content)? What must never be logged?
3. Why can logging slow down an app, and how do log4j2 async loggers help?
4. How do you enable DEBUG only for the SAP connector or for HTTP wire logging?
5. How do you get logs to Splunk from CloudHub without losing the platform logs?
`,
  answerTemplate: `## Correlation IDs

## Good log messages

## Logging performance

## Targeted debug logging

## Shipping logs externally
`,
  keyPoints: [
    'Every event has a correlationId: taken from the incoming X-Correlation-ID header by the HTTP Listener or generated; the HTTP Request controls outbound sending with sendCorrelationId (AUTO by default, ALWAYS to force it).',
    'Structured (JSON) logs with correlationId, app, flow, step, status and timing make cross-app search possible.',
    'Never log secrets or personal/card data; log identifiers and sizes, not full payloads, and keep payload logs at DEBUG.',
    'Synchronous file appenders block processing threads; async loggers (AsyncLogger/AsyncRoot with a bounded queue) decouple logging from processing.',
    'Per-package levels in log4j2.xml (e.g. a Logger for the connector package or org.mule.service.http wire logging) instead of changing the root level.',
    'Custom log4j2 appenders (e.g. HTTP/Splunk) must be configured so platform logging keeps working (e.g. keep the CloudHub appender on CloudHub 1.0).',
  ],
  solution: `
**Correlation IDs:** each Mule event has a \`correlationId\`. The HTTP Listener uses the incoming \`X-Correlation-ID\` header if present, otherwise generates one. The HTTP Request controls whether it goes downstream with \`sendCorrelationId\` (\`AUTO\` by default, \`ALWAYS\`, \`NEVER\`), so the same ID can travel Experience → Process → System; the docs do not define \`AUTO\` or name the outbound header, so confirm it in the wire log. The Experience API (or the gateway) should accept a client-supplied ID or create one and return it in the response header. Include \`correlationId\` in **every** log line (Logger message or a JSON logger that adds it automatically) so Splunk can search \`correlationId=...\` across all 9 apps. For asynchronous hops (Anypoint MQ/JMS), put the ID in message properties and restore it on the consumer.

**Good log messages** — structured, at boundaries (request in, call out, response, error):
\`\`\`json
{ "level": "INFO", "app": "order-papi", "flow": "create-order", "step": "SAP_CALL_END",
  "correlationId": "7f3c...", "orderId": "O-1234", "status": 201, "elapsedMs": 412 }
\`\`\`
INFO for business milestones, WARN for handled anomalies, ERROR with \`error.errorType\` and \`error.description\`. **Never** log passwords, tokens, card data or personal data (or mask it); log IDs and sizes, keep full payloads at DEBUG only in lower environments.

**Performance:** a synchronous appender writes on the processing thread — slow disk or a network appender blocks request threads (what the thread dump showed). Mule 4 uses asynchronous logging by default, but custom configs can undo it. Use \`<AsyncLogger>\`/\`<AsyncRoot>\` in \`log4j2.xml\`, appropriate buffer size, and a policy for a full queue. Logging huge payloads also costs CPU/memory for serialisation regardless of appender.

**Targeted debug:**
\`\`\`xml
<Loggers>
  <AsyncLogger name="org.mule.extension.sap" level="DEBUG"/>
  <AsyncLogger name="org.mule.service.http.impl.service.HttpMessageLogger" level="DEBUG"/> <!-- HTTP wire log -->
  <AsyncLogger name="com.acme.orders" level="INFO"/>   <!-- Logger component categories -->
  <AsyncRoot level="INFO"><AppenderRef ref="file"/></AsyncRoot>
</Loggers>
\`\`\`
Use the Logger component's \`category\` to group your own messages. In Runtime Manager you can usually change a package's log level without redeploying — set it, reproduce, then revert. (Check the exact package name of the connector in its documentation/stack traces.)

**Shipping logs:** add a log4j2 appender (e.g. Splunk HTTP Event Collector or a generic HTTP/socket appender) to the app's \`log4j2.xml\`. On **CloudHub 1.0** custom log4j2 config requires disabling CloudHub logs for the app, so also include the CloudHub log4j appender to keep logs in Runtime Manager. On CloudHub 2.0/RTF, follow the platform's log-forwarding options (or a custom appender). Alternatively, the Anypoint Monitoring log/telemetry export features, depending on subscription.
`,
  followUps: [
    {
      q: 'Why not just log the whole payload in production to make debugging easier?',
      a: 'It exposes personal or secret data, inflates storage and licence costs (e.g. Splunk ingest), and costs CPU/memory per request. Log references and metadata instead.',
    },
    {
      q: 'What happens to correlation IDs inside a Batch job or an Async scope?',
      a: 'They usually derive from the triggering event. But for batch records and async hops you should log the batch job instance ID and record keys explicitly, because the per-record context differs from the original request.',
    },
    {
      q: 'Where does the log4j2.xml live and what if you don\'t provide one?',
      a: 'In src/main/resources of the app. Without it, the runtime\'s default configuration is used, which logs to the app\'s log file in the runtime\'s logs folder.',
    },
  ],
}
