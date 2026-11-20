export default {
  id: 'inc-200',
  category: 'incidents',
  title: 'Cancelled Holidays Keep the Hotel Booking: a Saga Compensation Step That Failed Once and Was Never Retried',
  level: 'EXPERT',
  tags: ['saga', 'compensation', 'retries', 'consistency', 'travel'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-18 17:20:01 INFO  [trip-process] Booking trip tripId=TR-5512 steps=flight,hotel,car', relevant: false },
      { text: '2026-11-18 17:20:05 ERROR [trip-process] Car hire failed tripId=TR-5512 errorType=HTTP:SERVICE_UNAVAILABLE', relevant: true, why: 'The last step failed, so the earlier steps must be undone.' },
      { text: '2026-11-18 17:20:06 INFO  [trip-process] Compensation flight cancelled tripId=TR-5512', relevant: true, why: 'The flight was undone.' },
      { text: '2026-11-18 17:20:07 ERROR [trip-process] Compensation hotel failed tripId=TR-5512 errorType=HTTP:TIMEOUT', relevant: true, why: 'The hotel cancel timed out.' },
      { text: '2026-11-18 17:20:07 INFO  [trip-process] Trip failed tripId=TR-5512 status=FAILED', relevant: true, why: 'The trip is marked failed, but the hotel is still booked, and nothing will try again.' },
      { text: '2026-11-18 17:21:00 INFO  [trip-process] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do customers still have a hotel booking?',
        options: [
          'The hotel cancel timed out once and nothing ever tried it again',
          'The flight cancel timed out, so the handler stopped before the hotel',
          'The trip was marked FAILED first, so the handler skipped the cancels',
          'The hotel was cancelled before the flight, so the hotel rejected it',
        ],
        answer: 0,
        explain: 'A compensation is as important as the original step. One failed try left the trip half undone.',
      },
      {
        type: 'single',
        prompt: 'What must be true of a compensation step?',
        options: [
          'It is retried until it works or a person takes over, and a repeat is harmless',
          'It runs once in the error handler, and a failure is logged for review',
          'It runs in the same database transaction as the step it undoes',
          'It waits until the customer confirms the refund in the trip app',
        ],
        answer: 0,
        explain: 'Compensation must eventually happen. Retries need idempotency, so a second cancel of the same booking does no harm.',
      },
      {
        type: 'multi',
        prompt: 'Which make the saga safe?',
        options: [
          'Store the saga state, with each step done and each step undone',
          'Put failed compensations on a queue with retries and a dead letter path',
          'Use the booking reference so a cancel can be repeated safely',
          'Mark the trip FAILED as soon as any step fails, so support sees it at once',
        ],
        answer: [0, 1, 2],
        explain: 'State shows what is left to undo, a queue keeps trying, and idempotency makes retries safe. FAILED should mean fully undone.',
      },
      {
        type: 'single',
        prompt: 'What should the trip status be while the hotel cancel is still being retried?',
        options: [
          'COMPENSATING, so support knows rooms and money may still be held',
          'FAILED, since the trip cannot go ahead and the customer should rebook',
          'PENDING, the same status used while the booking steps are running',
          'FAILED with a note, and the cancel retries tracked only in the logs',
        ],
        answer: 0,
        explain: 'FAILED made everyone think the trip was clean. An honest middle status tells support and the customer the truth.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Find trips marked FAILED with steps still booked',
          'Cancel the open hotel bookings and refund customers',
          'Store saga state and add a COMPENSATING status',
          'Retry compensations from a queue, with a dead letter path to a person',
          'Alert on trips that stay COMPENSATING too long',
        ],
        explain: 'Find and fix the damage, then make compensation durable and watched.',
      },
    ],
  },
  description: `
## Symptoms
- Customers whose trip booking failed are being charged by hotels, and some arrive to find rooms in their name.
- The trip app shows these trips as FAILED.

## Change / Context
- A trip books a flight, a hotel and a car in that order, through partner APIs.
- If a step fails, the flow calls cancel on the steps already done, in reverse order, in an error handler.
- Cancels run once. If a cancel fails, the error is logged and the trip is marked FAILED.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 17:20:05 ERROR [trip-process] Car hire failed tripId=TR-5512 errorType=HTTP:SERVICE_UNAVAILABLE
2026-11-18 17:20:06 INFO  [trip-process] Compensation flight cancelled tripId=TR-5512
2026-11-18 17:20:07 ERROR [trip-process] Compensation hotel failed tripId=TR-5512 errorType=HTTP:TIMEOUT
2026-11-18 17:20:07 INFO  [trip-process] Trip failed tripId=TR-5512 status=FAILED
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
    'A compensation that runs once can leave a half undone trip.',
    'Store saga state: which steps are done and which are undone.',
    'Retry compensations from a queue, with a dead letter path to a person.',
    'Make cancels idempotent by booking reference.',
    'Use an honest middle status such as COMPENSATING.',
    'Alert on sagas that stay unfinished.',
  ],
  solution: `
**Diagnosis.** The car step failed. The flight was cancelled, but the hotel cancel timed out. The flow logged it and marked the trip FAILED, so nothing tried the hotel again.

**Immediate mitigation.** Find FAILED trips with bookings still held, cancel them, and refund customers.

**Root cause.** Compensation was treated as best effort in an error handler, with no state and no retries.

**Permanent fix.**
- Store the saga state per trip: each step with done or undone.
- Publish each needed cancel to a queue. A consumer retries with growing delays and sends to a dead letter queue and a person after the limit.
- Cancel by booking reference, so a repeat cancel is harmless.
- Mark the trip COMPENSATING until every step is undone, then FAILED.

**Prevention.** Alert on trips that stay COMPENSATING for more than an agreed time, and test sagas with a failing cancel.
`,
  followUps: [
    { q: 'Why not use one transaction across all three partners?', a: 'Partner APIs cannot join one transaction. A saga with compensations is the usual answer.' },
    { q: 'What if a partner has no cancel API?', a: 'Then a person must cancel. Route it to a work queue with all the details.' },
    { q: 'Why reverse order?', a: 'Later steps may depend on earlier ones, so undo them first.' },
    { q: 'How do you know the cancel worked if it timed out?', a: 'Ask the partner for the booking status before retrying, or rely on an idempotent cancel by reference.' },
  ],
}
