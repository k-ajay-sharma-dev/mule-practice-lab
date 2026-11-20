export default {
  id: 'inc-172',
  category: 'incidents',
  title: 'Checkout Hangs for Five Minutes When the Payment Gateway Is Down: Until Successful With Its Defaults',
  level: 'INTERMEDIATE',
  tags: ['until-successful', 'retries', 'timeouts', 'error-handling'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-10-14 19:02:11 INFO  [checkout-api] POST /checkout order=88120 received', relevant: false },
      { text: '2026-10-14 19:02:12 WARN  [checkout-api] HTTP:CONNECTIVITY calling payments-gw, attempt 1, retrying in 60000 ms', relevant: true, why: 'Until Successful waits 60 seconds between tries by default.' },
      { text: '2026-10-14 19:02:42 WARN  [web-shop] POST /checkout timed out after 30000 ms, showing "try again"', relevant: true, why: 'The shop stopped waiting after 30 seconds, while Mule kept retrying for minutes.' },
      { text: '2026-10-14 19:02:45 INFO  [checkout-api] POST /checkout order=88120 received', relevant: true, why: 'The shopper pressed again, so a second checkout with its own five minutes of retries started.' },
      { text: '2026-10-14 19:03:12 WARN  [checkout-api] HTTP:CONNECTIVITY calling payments-gw, attempt 2, retrying in 60000 ms', relevant: true, why: 'Each retry holds the same HTTP request open while the shopper waits.' },
      { text: '2026-10-14 19:04:00 INFO  [stock-sync] 412 stock levels updated', relevant: false },
      { text: '2026-10-14 19:07:12 ERROR [checkout-api] MULE:RETRY_EXHAUSTED after 6 attempts', relevant: true, why: 'Five retries after the first try, about five minutes in total. The caller gave up long before.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Checkout requests hang for about five minutes when the payment gateway is down. What is the most likely cause?',
        options: [
          'Until Successful runs with its defaults, 5 retries 60 seconds apart, while the shop waits on the request',
          'The HTTP Listener has a response timeout of five minutes that the shop cannot override',
          'The payment gateway holds each connection open for five minutes before it refuses it',
          'The flow uses a Scheduler that only runs the payment step once every five minutes',
        ],
        answer: 0,
        explain: 'Until Successful defaults to maxRetries 5 and millisBetweenRetries 60000. Wrapped around a call made while a caller waits, that means up to six tries over about five minutes, far beyond the 30 seconds the shop waits.',
      },
      {
        type: 'single',
        prompt: 'What is the best change for a call that a shopper is waiting on?',
        options: [
          'Retry only briefly, with a small gap, so the whole call fits well inside the caller timeout, then fail fast',
          'Raise the shop timeout to six minutes so the retries can finish',
          'Remove all error handling so the error reaches the shop at once',
          'Increase maxRetries to 20 so a short outage is always covered',
        ],
        answer: 0,
        explain: 'Retries in a synchronous path must fit inside the time the caller waits. A couple of quick retries help with a blip. A real outage should fail fast with a clear answer, not hold threads for minutes.',
      },
      {
        type: 'multi',
        prompt: 'Which two problems does the long retry cause besides a slow answer?',
        options: [
          'Each waiting request holds resources while it retries, so an outage can pile up requests',
          'A shopper who presses again starts a second checkout that may also go through later',
          'Until Successful deletes the order from the database after the last try',
          'The HTTP Listener stops accepting new requests on any other path',
        ],
        answer: [0, 1],
        explain: 'Requests stuck in retries keep resources busy, and the shop has already told the shopper to try again, so a second checkout starts. Until Successful does not delete data, and other paths keep working unless resources run out.',
      },
      {
        type: 'single',
        prompt: 'The payment must still be taken when the gateway recovers, even if it is down for an hour. Which design fits?',
        options: [
          'Accept the order, put a payment request on a queue, and let a consumer retry with backoff',
          'Keep the HTTP request open with Until Successful set to 60 retries',
          'Ask the shopper to keep the page open until the gateway answers',
          'Use a Scatter-Gather so two copies of the call race each other',
        ],
        answer: 0,
        explain: 'Long retries belong off the request path. A queue keeps the work safe, a consumer retries with backoff, and the shop gets a quick answer such as "payment pending".',
      },
      {
        type: 'order',
        prompt: 'Order the steps to fix this safely.',
        items: [
          'Confirm the Until Successful settings and the shop timeout',
          'Cut the retries in the request path so they fit inside the timeout',
          'Return a clear error or "pending" answer when the gateway is down',
          'Move retries that may take long to a queue and consumer',
          'Add an idempotency key so a second press cannot pay twice',
          'Test with the gateway down and watch the answer time',
        ],
        explain: 'First stop requests hanging, then give shoppers a clear answer, then move the long retries off the request path, and finally guard against double payment.',
      },
    ],
  },
  description: `
## Symptoms
- An online shop's checkout calls \`checkout-api\`, which takes the payment through a payment gateway.
- During a gateway outage, checkout requests hang. The shop gives up after 30 seconds and tells shoppers to try again.
- Mule keeps working on each request for about five minutes, and logs \`MULE:RETRY_EXHAUSTED\` at the end.
- Some shoppers pressed again, and support now sees orders that look like duplicates.

## Change / Context
- Last sprint a developer wrapped the gateway call in **Until Successful** to "make payments more reliable".
- The scope has no settings changed, so it runs with its defaults.
- The shop waits 30 seconds for an answer.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-10-14 19:02:12 WARN  [checkout-api] HTTP:CONNECTIVITY calling payments-gw, attempt 1, retrying in 60000 ms
2026-10-14 19:02:42 WARN  [web-shop] POST /checkout timed out after 30000 ms
2026-10-14 19:02:45 INFO  [checkout-api] POST /checkout order=88120 received
2026-10-14 19:07:12 ERROR [checkout-api] MULE:RETRY_EXHAUSTED after 6 attempts
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Until Successful defaults to 5 retries with 60000 ms between them.',
    'Around a call the caller waits on, that is up to six tries over about five minutes.',
    'Retries in a request path must fit inside the time the caller waits.',
    'The caller gave up at 30 seconds, so Mule kept working on an answer nobody would read.',
    'A shopper pressing again starts a second checkout, so add an idempotency key.',
    'Long retries belong on a queue with a consumer and backoff, not in the request.',
    'Fail fast with a clear answer when the gateway is down.',
  ],
  solution: `
**Diagnosis.** The gateway call sits inside Until Successful with its defaults: **maxRetries 5** and **millisBetweenRetries 60000**. One failing call becomes six tries over about five minutes. The shop waits only 30 seconds, so every checkout during the outage times out at the shop while Mule keeps retrying.

**Immediate mitigation.**
- Change the scope so the whole retry fits well inside 30 seconds, for example 2 retries a second or two apart, or remove it from this path for now.
- Return a clear error, such as 503 with "payment unavailable, try later", once the quick retries fail.
- Check the orders from the outage window for double payments and refund any.

**Root cause.** A retry scope meant for background work was placed in a synchronous request path with default timings. Nobody compared the total retry time with the caller's timeout.

**Permanent fix.**
- Keep only short retries in the request path.
- If payment must be taken after a longer outage, accept the order, put a payment request on a queue, and let a consumer retry with backoff. Tell the shopper the payment is pending.
- Add an idempotency key per checkout so a second press finds the first order instead of starting another payment.

**Prevention.** In code review, check every Until Successful and every retry setting against the time its caller waits. Add a test that runs checkout with the gateway down and checks the answer time.
`,
  followUps: [
    {
      q: 'How long does Until Successful wait in total with the defaults?',
      a: 'The first try, then 5 retries 60 seconds apart, so about five minutes plus the time of each try.',
    },
    {
      q: 'Is Until Successful ever right in an API flow?',
      a: 'Yes, with short settings, for brief network blips where a quick second try usually works and the total stays well inside the caller timeout.',
    },
    {
      q: 'Why does the second press cause trouble?',
      a: 'The first request is still retrying in Mule. When the gateway returns, both requests can take a payment unless an idempotency key ties them together.',
    },
    {
      q: 'What would you watch in production after the fix?',
      a: 'The answer time of checkout, the count of 503s while the gateway is down, and the depth of the payment queue if you added one.',
    },
  ],
}
