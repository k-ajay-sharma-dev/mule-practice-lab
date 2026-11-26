export default {
  id: 'ms-003',
  category: 'mulesoft',
  title: 'Until Successful vs Reconnection vs Retry',
  level: 'INTERMEDIATE',
  tags: ['reliability', 'retry', 'reconnection', 'http'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'The Fraud API returns **503** for a second or two. Will a reconnection strategy on the HTTP Request config retry it?',
      options: [
        'Yes, as the HTTP Request treats a 503 as a lost connection to the host',
        'No, a 503 is a response error, not a connectivity error',
        'Yes, if the reconnection frequency is shorter than the outage',
        'No, as reconnection on an HTTP Request config runs while the app starts',
      ],
      answer: 1,
      explain: 'Reconnection handles failures to obtain or keep a **connection**. A 503 is a valid response from a reachable server (`HTTP:SERVICE_UNAVAILABLE`), not a lost connection, so no reconnection frequency changes that. Reconnection is not limited to startup: it also reacts to connectivity errors at runtime. A short Until Successful around that one call is the fit.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An HTTP Request inside Until Successful keeps getting 503. The flow error handler has an On Error Propagate for `HTTP:SERVICE_UNAVAILABLE` that returns a fallback, then one for `ANY` that returns 500. What happens after the last retry fails?',
      options: [
        'The `HTTP:SERVICE_UNAVAILABLE` handler runs, because the last 503 error is rethrown as is',
        'The `ANY` handler runs, because the scope raises `MULE:RETRY_EXHAUSTED`',
        'No handler runs, because Until Successful ends the flow quietly after its last retry',
        'The flow returns the last 503 response, because Until Successful hands back the last result',
      ],
      answer: 1,
      explain: 'After the last failed attempt Until Successful raises `MULE:RETRY_EXHAUSTED`. The `HTTP:SERVICE_UNAVAILABLE` handler does not match that type, so the `ANY` handler runs and the caller gets 500. To return the fallback, add a handler for `MULE:RETRY_EXHAUSTED`. The scope does not rethrow the child error unchanged, and it does not end the flow quietly or hand back the failed response.',
    },
    {
      type: 'match',
      prompt: 'Match each dependency to the best reliability mechanism.',
      pairs: [
        ['Oracle DB dropping connections during a 30 s failover', 'Reconnection strategy on the DB config'],
        ['Fraud API returning 503 for 1 to 2 seconds', 'Until Successful around only that call, short delay, 2 to 3 retries'],
        ['Payment Gateway POST that times out but may have charged', 'Idempotency key or status check before any retry'],
      ],
      explain: 'Connection loss → reconnection; transient HTTP errors → narrow, short Until Successful; non-idempotent POST → never blind-retry.',
    },
    {
      type: 'single',
      prompt: 'A flow with a 5 second SLA wraps all its steps in one Until Successful scope, which re-runs those steps on any error. It uses `maxRetries=5` and `millisBetweenRetries=60000`. What happens to a request during an outage?',
      options: [
        'The event waits through the retries for up to about 5 minutes',
        'The retries run in the background, and the caller gets an immediate 200',
        'Mule stops retrying once the 5 second SLA has passed',
        'Mule parks the event on a queue until the retry delay has ended',
      ],
      answer: 0,
      explain: 'Until Successful is **synchronous**, so the event waits. Five retries 60 seconds apart far exceed the SLA, and waiting events pile up and hold resources during an outage. Retrying a whole block also re-runs every step, which can re-charge cards, and it retries every error type, including 400 validation errors. Long-delay retries belong in an async design (queue redelivery + DLQ).',
    },
    {
      type: 'single',
      prompt: 'The Payment Gateway `POST /charges` times out. What is the safe approach?',
      options: [
        'Retry it through Until Successful, 3 times with a growing delay',
        'Send an idempotency key, or check the charge status before retrying',
        'Raise the reconnection attempts on the HTTP Request configuration',
        'Raise the response timeout so the gateway has time to answer',
      ],
      answer: 1,
      explain: 'A timeout does **not** mean the charge failed: it may have succeeded. Retries of a non-idempotent POST, even with a delay, risk double charges. Reconnection does not apply, because a timeout is not a failed connection. A longer timeout makes the gap rarer, but the next timeout still leaves the charge state unknown.',
    },
    {
      type: 'single',
      prompt: 'A flow starts with a JMS listener. During broker patching the broker is down for about 2 minutes, and the listener must keep trying to connect until the broker is back. What do you configure?',
      options: [
        'An Until Successful scope around the JMS listener, with a high `maxRetries`',
        'An On Error Propagate for `JMS:CONNECTIVITY` with a retry count in the flow',
        'A `reconnect-forever` strategy on the connection of the JMS connector config',
        'Auto-restart in Runtime Manager, so the app restarts until the broker is back',
      ],
      answer: 2,
      explain: 'Reconnection belongs to the connection provider of the connector config, and `reconnect-forever` keeps trying until the broker is back. A source such as the JMS listener cannot be wrapped in Until Successful, which is a scope for the processors inside a flow. Error handlers have no retry count, and restarting the app treats the symptom while the connection is still down.',
    },
  ],
  description: `
A payments flow (≈ 20 req/s, SLA 5 s end-to-end) calls three things:

- An **Oracle database** (Database connector) that occasionally drops connections during a nightly failover (~30 s).
- A **Fraud API** over HTTP that returns **503** a few times a day for 1 to 2 seconds.
- A **Payment Gateway** \`POST /charges\` that sometimes **times out**, but may already have charged the card.

The team has wrapped *everything* in one Until Successful scope with \`maxRetries=5\` and \`millisBetweenRetries=60000\`.

**Questions**
- What does a reconnection strategy cover, and where is it configured?
- What does Until Successful cover, and what error is raised when it gives up?
- Which mechanism fits each of the three dependencies?
- What is wrong with the current Until Successful setup (think SLA, resources, and duplicate charges)?
`,
  answerTemplate: `## Reconnection strategy

## Until Successful

## Database

## Fraud API

## Payment Gateway

## Problems with the current setup
`,
  keyPoints: [
    'Reconnection strategy is set on the connector config/connection provider and only handles connectivity errors (establishing or re-establishing connections).',
    'Until Successful re-executes its child processors on any error, up to maxRetries with millisBetweenRetries; when exhausted it raises MULE:RETRY_EXHAUSTED.',
    'A 503 is an HTTP response error (HTTP:SERVICE_UNAVAILABLE), not a connectivity error, so reconnection will not retry it: Until Successful with a short delay will.',
    'Non-idempotent POST must not be blindly retried on timeout: use an idempotency key or check status before retrying.',
    'A 60 s delay × 5 retries blocks the request far beyond the 5 s SLA and holds resources; retries must be short and few, or the work moved to an async queue.',
    'Scope retries narrowly around one call, ideally filtering which errors are retried (e.g. Try + raise only retryable errors).',
  ],
  solution: `
**Reconnection strategy**: configured on the connector's connection (e.g. Database config → Connection → *Reconnection*: \`reconnect\` with frequency/count, or \`reconnect-forever\`; plus "fails deployment" on startup). It applies when the connector cannot obtain or loses a **connection** (connectivity errors). It does not retry business or HTTP-status errors.

**Until Successful**: a scope that re-runs its children when any error occurs, up to \`maxRetries\`, waiting \`millisBetweenRetries\` between attempts. After the last failure it throws \`MULE:RETRY_EXHAUSTED\`. It is synchronous: the event waits.

**Mapping**
- **Database failover:** reconnection strategy on the DB config (e.g. reconnect every 5 s, 6 to 10 attempts). Optionally fail fast and let the caller retry if the SLA can't be met.
- **Fraud API 503:** Until Successful around *only* the fraud call, \`maxRetries\` 2 to 3, \`millisBetweenRetries\` 500 to 1000 ms. Retry only on \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:TIMEOUT\`, \`HTTP:CONNECTIVITY\` (use a Try inside that re-raises others as a non-retryable custom error handled outside, or validate the status). Set a sensible \`responseTimeout\`.
- **Payment Gateway POST:** not safe to blind-retry: a timeout may mean the charge succeeded. Send an **idempotency key** (e.g. order ID) if the gateway supports it, or on timeout query the charge status before retrying. Otherwise route to a manual/async reconciliation path.

**Problems with the current setup**
- 5 × 60 s = up to 5 minutes per request versus a 5 s SLA; the caller times out while Mule keeps retrying.
- Each waiting event holds resources; at 20 req/s a short outage piles up thousands of in-flight events.
- Retrying the whole block re-runs earlier steps (re-calling the DB, re-charging cards).
- Every error is retried, including 400 validation errors that will never succeed.

Long-delay retries belong in an asynchronous design (VM/Anypoint MQ with redelivery + DLQ), not in a synchronous HTTP request.
`,
}
