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
        'Yes — reconnection retries any failed request',
        'No — a 503 is an HTTP response error (`HTTP:SERVICE_UNAVAILABLE`), not a connectivity error',
        'Yes, but only if reconnect-forever is used',
        'No — HTTP Request configs do not support reconnection at all',
      ],
      answer: 1,
      explain: 'Reconnection only handles failures to obtain or keep a **connection**. A 503 is a valid response from a reachable server, so a short Until Successful around just that call is the fit.',
    },
    {
      type: 'single',
      prompt: 'Until Successful runs out of retries. Which error does it raise?',
      options: ['`MULE:RETRY_EXHAUSTED`', '`HTTP:TIMEOUT`', '`MULE:UNKNOWN`', 'The last child error, unchanged'],
      answer: 0,
      explain: 'After the last failed attempt Until Successful throws `MULE:RETRY_EXHAUSTED`. Handlers matching only the original type will not catch it.',
    },
    {
      type: 'match',
      prompt: 'Match each dependency to the best reliability mechanism.',
      pairs: [
        ['Oracle DB dropping connections during a 30 s failover', 'Reconnection strategy on the DB config'],
        ['Fraud API returning 503 for 1–2 seconds', 'Until Successful around only that call, short delay, 2–3 retries'],
        ['Payment Gateway POST that times out but may have charged', 'Idempotency key or status check before any retry'],
      ],
      explain: 'Connection loss → reconnection; transient HTTP errors → narrow, short Until Successful; non-idempotent POST → never blind-retry.',
    },
    {
      type: 'multi',
      prompt: 'What is wrong with wrapping everything in one Until Successful with `maxRetries=5` and `millisBetweenRetries=60000`?',
      options: [
        'A request can wait up to ~5 minutes against a 5 s SLA',
        'Waiting events pile up and hold resources at 20 req/s during an outage',
        'Earlier steps are re-run, which can re-charge cards',
        'Until Successful runs its retries asynchronously, so the caller gets an immediate 200',
        'Non-retryable errors such as 400 validation errors are retried too',
      ],
      answer: [0, 1, 2, 4],
      explain: 'Until Successful is **synchronous** — the event waits. Retrying a whole block re-runs every step and retries every error type. Long-delay retries belong in an async design (queue redelivery + DLQ).',
    },
    {
      type: 'single',
      prompt: 'The Payment Gateway `POST /charges` times out. What is the safe approach?',
      options: [
        'Retry immediately up to 5 times — timeouts mean the request never arrived',
        'Send an idempotency key (e.g. order ID) or query the charge status before retrying',
        'Increase the reconnection count on the HTTP config',
        'Wrap it in On Error Continue so the flow returns success',
      ],
      answer: 1,
      explain: 'A timeout does **not** mean the charge failed — it may have succeeded. Blind retries of a non-idempotent POST risk double charges.',
    },
    {
      type: 'single',
      prompt: 'Where is a reconnection strategy configured?',
      options: [
        'On the connector configuration (its connection provider)',
        'As a scope around the operation, like Until Successful',
        'In the error handler of the flow',
        'In the Runtime Manager alert settings',
      ],
      answer: 0,
      explain: 'Reconnection is part of the connector config connection (e.g. `reconnect` with frequency/count, or `reconnect-forever`). Until Successful is the scope-based mechanism.',
    },
  ],
  description: `
A payments flow (≈ 20 req/s, SLA 5 s end-to-end) calls three things:

- An **Oracle database** (Database connector) that occasionally drops connections during a nightly failover (~30 s).
- A **Fraud API** over HTTP that returns **503** a few times a day for 1–2 seconds.
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
    'A 503 is an HTTP response error (HTTP:SERVICE_UNAVAILABLE), not a connectivity error, so reconnection will not retry it — Until Successful with a short delay will.',
    'Non-idempotent POST must not be blindly retried on timeout — use an idempotency key or check status before retrying.',
    'A 60 s delay × 5 retries blocks the request far beyond the 5 s SLA and holds resources; retries must be short and few, or the work moved to an async queue.',
    'Scope retries narrowly around one call, ideally filtering which errors are retried (e.g. Try + raise only retryable errors).',
  ],
  solution: `
**Reconnection strategy** — configured on the connector's connection (e.g. Database config → Connection → *Reconnection*: \`reconnect\` with frequency/count, or \`reconnect-forever\`; plus "fails deployment" on startup). It applies when the connector cannot obtain or loses a **connection** (connectivity errors). It does not retry business or HTTP-status errors.

**Until Successful** — a scope that re-runs its children when any error occurs, up to \`maxRetries\`, waiting \`millisBetweenRetries\` between attempts. After the last failure it throws \`MULE:RETRY_EXHAUSTED\`. It is synchronous: the event waits.

**Mapping**
- **Database failover:** reconnection strategy on the DB config (e.g. reconnect every 5 s, 6–10 attempts). Optionally fail fast and let the caller retry if the SLA can't be met.
- **Fraud API 503:** Until Successful around *only* the fraud call, \`maxRetries\` 2–3, \`millisBetweenRetries\` 500–1000 ms. Retry only on \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:TIMEOUT\`, \`HTTP:CONNECTIVITY\` (use a Try inside that re-raises others as a non-retryable custom error handled outside, or validate the status). Set a sensible \`responseTimeout\`.
- **Payment Gateway POST:** not safe to blind-retry — a timeout may mean the charge succeeded. Send an **idempotency key** (e.g. order ID) if the gateway supports it, or on timeout query the charge status before retrying. Otherwise route to a manual/async reconciliation path.

**Problems with the current setup**
- 5 × 60 s = up to 5 minutes per request versus a 5 s SLA; the caller times out while Mule keeps retrying.
- Each waiting event holds resources; at 20 req/s a short outage piles up thousands of in-flight events.
- Retrying the whole block re-runs earlier steps (re-calling the DB, re-charging cards).
- Every error is retried, including 400 validation errors that will never succeed.

Long-delay retries belong in an asynchronous design (VM/Anypoint MQ with redelivery + DLQ), not in a synchronous HTTP request.
`,
}
