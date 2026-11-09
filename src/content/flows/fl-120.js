import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-120',
  category: 'flows',
  title: 'Card Payments API: a Fraud Signal in an Async Scope That Neither Slows the Response Nor Gets Lost',
  level: 'ADVANCED',
  tags: ['async', 'fire-and-forget', 'vm', 'until-successful', 'error-handling', 'banking', 'performance'],
  estMinutes: 35,
  flowChecks: [
    { label: 'An HTTP Listener receives the payment', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'POST' } } },
    {
      label: 'The fraud signal call is inside an Async scope',
      rule: { type: 'inside', component: 'http-request', within: 'async', where: { path: 'fraud' } },
    },
    {
      label: 'The Async scope starts after the payment is authorised',
      rule: { type: 'before', first: 'http-request', firstWhere: { path: 'authori' }, then: 'async' },
    },
    {
      label: 'The Async scope has a max concurrency of 30 to 64: room for the peak at the timeout, but still a firm cap',
      rule: { type: 'exists', component: 'async', where: { maxConcurrency: { gte: 30, lte: 64 } } },
    },
    {
      label: 'The fraud call inside the Async scope times out within 3 seconds',
      rule: { type: 'inside', component: 'http-request', within: 'async', where: { path: 'fraud', responseTimeout: { gte: 1, lte: 3000 } } },
    },
    {
      label: 'A failed signal is caught inside the Async scope and put on a VM queue',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'on-error-continue', within: 'async' },
          { type: 'inside', component: 'vm-publish', within: 'on-error-continue' },
          { type: 'inside', component: 'vm-publish', within: 'async' },
        ],
      },
    },
    {
      label: 'A second flow reads the same VM queue',
      rule: { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } },
    },
    {
      label: 'The retry flow repeats the fraud call in Until Successful, at least 5 seconds apart',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'until-successful', where: { path: 'fraud' } },
          { type: 'exists', component: 'until-successful', where: { millisBetweenRetries: { gte: 5000 } } },
        ],
      },
    },
    {
      label: 'Signals that still fail after the retries are parked in a database table',
      rule: { type: 'inside', component: 'db-insert', within: 'on-error-continue', withinWhere: { type: 'RETRY_EXHAUSTED' } },
    },
    {
      label: 'The payment response is built on the main path after the Async scope',
      rule: { type: 'before', first: 'async', then: 'transform', outside: true },
    },
  ],
  referenceFlow: design(
    flow('authorise-payment-api', source('http-listener', { path: '/payments', allowedMethods: 'POST' }), [
      step('http-request', { method: 'POST', path: '/psp/v3/authorisations', responseTimeout: 4000 }),
      step('set-variable', { variableName: 'authorisation', value: '#[payload]' }),
      scope('async', { maxConcurrency: 32 }, [
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{ paymentId: vars.authorisation.paymentId, cardHash: vars.authorisation.cardHash, amount: vars.authorisation.amount, outcome: vars.authorisation.status }',
        }),
        scope('try', {}, [step('http-request', { method: 'POST', path: '/fraud/v1/signals', responseTimeout: 3000 })], {
          errorHandlers: [
            handler('on-error-continue', { type: 'ANY' }, [
              step('logger', { level: 'WARN', message: '#["Fraud signal failed for " ++ vars.authorisation.paymentId ++ ", queued for retry"]' }),
              step('vm-publish', { queueName: 'fraud-signal-retry' }),
            ]),
          ],
        }),
      ]),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n{ paymentId: vars.authorisation.paymentId, status: vars.authorisation.status }',
      }),
    ]),
    flow(
      'retry-fraud-signals',
      source('vm-listener', { queueName: 'fraud-signal-retry' }),
      [
        scope('try', {}, [
          scope('until-successful', { maxRetries: 5, millisBetweenRetries: 20000 }, [
            step('http-request', { method: 'POST', path: '/fraud/v1/signals', responseTimeout: 3000 }),
          ]),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'MULE:RETRY_EXHAUSTED' }, [
              step('db-insert', {
                database: 'Oracle',
                sql: 'INSERT INTO fraud_signal_parking (payment_id, signal_json, parked_at) VALUES (:paymentId, :signal, SYSTIMESTAMP)',
              }),
              step('logger', { level: 'ERROR', message: '#["Fraud signal parked for " ++ payload.paymentId]' }),
            ]),
          ],
        }),
      ],
    ),
  ),
  description: `
A card issuer runs a **Payments API** in Mule on a customer-hosted runtime, a single Mule 4.6 server per data centre. After the payment service provider (PSP) authorises a payment, Mule must send a **fraud signal** to the fraud analytics service at \`POST /fraud/v1/signals\`.

Facts:
- The API must answer in **under 300 ms at p95**. The PSP call takes about 180 ms.
- The fraud service takes **400 ms to 2 seconds**, and about **1%** of calls fail. Twice a year it is down for an hour.
- The fraud team says a missing signal is a compliance finding. A late signal, within an hour, is fine.
- Peak load is **10 payments per second**.

A developer put the fraud call in an **Async scope** with no other changes. Response times are now good, but the fraud team found 3,000 missing signals after the last outage, and on the day the fraud service slowed down to 30 seconds per call, hundreds of fraud calls piled up, the app ran short of threads and payment calls started to time out.

An **Async scope** runs its steps on another thread while the flow carries on. Errors inside it never reach the flow, and the caller never sees them. **Max concurrency** limits how many copies of the scope run at the same time.

**Requirements**
- The caller never waits for the fraud service.
- A fraud slowdown must not take threads from the payment calls.
- No signal is lost when the fraud service fails, and failures are retried for a while.
- Signals that still fail are kept somewhere a person can replay them.

**Design the flows.**
`,
  answerTemplate: `## What went wrong

## The payment path

## The Async scope

## Catching failures

## The retry flow

## Where signals end up when all else fails
`,
  keyPoints: [
    'An Async scope does not return errors to the flow. Without a Try inside it, a failed call is logged and the signal is gone.',
    'Async with no max concurrency starts a new copy for every payment. A slow fraud service then piles up hundreds of waiting calls.',
    'A 3 second response timeout caps each copy, so at 10 payments a second no more than about 30 run at once.',
    'Set max concurrency a little above that figure. It is a firm cap that protects the rest of the app if something else goes wrong.',
    'Catch failures inside the Async scope and publish them to a persistent VM queue, which survives a restart.',
    'A separate flow drains the VM queue and retries with Until Successful, away from the payment path.',
    'After the retries run out, park the signal in a table so it can be replayed by hand or by a job.',
    'Read what the Async scope needs from variables set before it. Changes made inside it do not come back to the flow.',
  ],
  solution: `
**What went wrong**
1. **Lost signals.** The error from the fraud call stayed inside the Async scope. Nothing caught it, so it was only logged.
2. **Thread exhaustion.** With no max concurrency and no short timeout, every payment started a copy that waited 30 seconds. At 10 payments per second that is about 300 calls waiting at once.

**Flow 1: authorise-payment-api**
1. **HTTP Listener** \`POST /payments\`.
2. **HTTP Request** \`POST /psp/v3/authorisations\`, then **Set Variable** \`authorisation\`.
3. **Async**, max concurrency 32:
   - **Transform** the signal from \`vars.authorisation\`.
   - **Try** with **HTTP Request** \`POST /fraud/v1/signals\`, timeout 3 seconds.
   - **On Error Continue** for \`ANY\`: log a warning and **VM Publish** to \`fraud-signal-retry\`.
4. **Transform** the response. This runs at once, while the Async scope works on its own.

**Flow 2: retry-fraud-signals**
1. **VM Listener** on \`fraud-signal-retry\`, a persistent queue.
2. **Try** with **Until Successful**, 5 retries, 20 seconds apart, around the same fraud call.
3. **On Error Continue** for \`MULE:RETRY_EXHAUSTED\`: **Database Insert** into \`fraud_signal_parking\` and log an error.

**Sizing max concurrency.** With a 3 second timeout, one copy lives at most about 3 seconds. At 10 payments per second that is at most about 30 copies at once, even when every call times out. A limit of 32 is never reached in normal running, and it still stops a runaway if the timeout is ever removed. Test the limit under load before going live.

**During a one-hour outage.** Each signal fails within 3 seconds and goes to the persistent VM queue. The retry flow works through the queue, and signals whose retries run out are parked. When the service is back, the queue drains and a small job replays the parked rows. Raise the number of consumers on the VM Listener if the backlog must clear faster.
`,
  followUps: [
    {
      q: 'Why use a VM queue and not call Until Successful directly inside the Async scope?',
      a: 'Until Successful inside Async would hold a slot for minutes per failed signal. The slots would fill up during an outage. The VM queue moves the waiting into a separate flow with its own threads.',
    },
    {
      q: 'Would this design work on CloudHub 2.0 with three replicas?',
      a: 'Each replica would have its own VM queue, and a replica that is replaced loses its messages. Use Anypoint MQ for the retry queue in that case.',
    },
    {
      q: 'Could the payment be authorised but the signal never sent if Mule crashes?',
      a: 'Yes, in the moment between the PSP answer and the VM Publish. If that gap is not acceptable, write the signal to an outbox table in the same transaction as the payment record and publish it from there.',
    },
    {
      q: 'What does the caller see if the fraud service is down?',
      a: 'Nothing different. The response does not depend on the Async scope, so the caller still gets the authorisation result.',
    },
  ],
}
