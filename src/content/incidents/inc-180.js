export default {
  id: 'inc-180',
  category: 'incidents',
  title: 'Customers Get 200 OK for Bookings That Were Never Saved: On Error Continue at the Flow Level',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'error-handling', 'on-error-continue', 'http-status', 'database'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-12 18:40:03 INFO  [booking-api] POST /bookings received, table=12 time=19:30', relevant: false },
      { text: '2026-11-12 18:40:08 ERROR [booking-api] DB:CONNECTIVITY Cannot get connection for URL jdbc:mysql://bookings-db:3306', relevant: true, why: 'The insert failed because the database was unreachable.' },
      { text: '2026-11-12 18:40:08 INFO  [booking-api] On Error Continue: returning {"message":"Booking received"}', relevant: true, why: 'The handler turned the failure into a normal answer.' },
      { text: '2026-11-12 18:40:08 INFO  [booking-api] Response 200', relevant: true, why: 'The customer was told the booking worked, but nothing was saved.' },
      { text: '2026-11-12 18:41:15 INFO  [booking-api] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did customers get 200 when the database insert failed?',
        options: [
          'On Error Continue ends the flow as a success, so the Listener sends its normal response',
          'The Database connector retried the insert in the background and reported success',
          'The HTTP Listener sends 200 whenever the payload is set, whatever the error state',
          'DB:CONNECTIVITY is raised only as a warning, so the flow carries on to the end',
        ],
        answer: 0,
        explain: 'On Error Continue handles the error and lets the flow finish as if it succeeded. The Listener sends its success response, which defaults to status 200.',
      },
      {
        type: 'single',
        prompt: 'Which change gives the caller an honest answer?',
        options: [
          'Use On Error Propagate for this error, with an error response status of 503',
          'Keep On Error Continue and add a Logger at ERROR level inside the handler',
          'Keep On Error Continue and retry the insert with Until Successful in it',
          'Keep On Error Continue and change the message to "Booking pending"',
        ],
        answer: 0,
        explain: 'On Error Propagate rethrows the error, and the Listener sends its error response. Setting the status to 503 tells the client to try again later.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Find the bookings that got 200 during the outage, from the logs',
          'Contact those customers or the restaurants, as the tables are not booked',
          'Replay the failed requests from the logs without asking anyone',
          'Fix the response so failures return an error status',
        ],
        answer: [0, 1, 3],
        explain: 'Customers believe they have a table. Find them, tell them or the restaurant, and stop the false answers. Replaying blindly could book tables that are now taken, or that guests no longer want.',
      },
      {
        type: 'single',
        prompt: 'When is On Error Continue the right choice?',
        options: [
          'When a fallback still gives a correct result, so success is the truth',
          'When the caller’s app should never show an error page to customers',
          'When the error is a connectivity error that may clear on its own',
          'When the flow has no other handler and must not end in an error',
        ],
        answer: 0,
        explain: 'It fits when the flow can still give a correct result, for example a cached price when the price service is down. It hides failures if used as a catch-all.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Change the handler so a failed insert returns 503',
          'Find bookings answered 200 during the outage',
          'Contact the affected customers and restaurants',
          'Add a test where the database is down and the status must not be 200',
          'Review other flows for On Error Continue used as a catch-all',
        ],
        explain: 'Stop new false answers, find and contact the affected customers, then test and look for the same pattern elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- A restaurant booking app sends bookings to \`booking-api\`.
- Last Thursday evening, guests arrived with confirmations, but the restaurants had no record of their bookings.
- The app showed "Booking received" every time.

## Change / Context
- The bookings database was unreachable for 25 minutes during a failover.
- The flow has one error handler: an **On Error Continue** for ANY error, which sets the payload to \`{"message":"Booking received"}\`. A developer added it "so customers never see an error page".
- Monitoring watches the share of 5xx responses. It stayed at zero.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-12 18:40:08 ERROR [booking-api] DB:CONNECTIVITY Cannot get connection for URL jdbc:mysql://bookings-db:3306
2026-11-12 18:40:08 INFO  [booking-api] On Error Continue: returning {"message":"Booking received"}
2026-11-12 18:40:08 INFO  [booking-api] Response 200
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
    'On Error Continue completes the flow as a success, so the Listener sends its success response.',
    'A catch-all On Error Continue hides failures from callers and from monitoring.',
    'Use On Error Propagate, or set an error status, when the work did not happen.',
    '503 tells the client the failure is temporary.',
    'Find and contact customers who were told the booking worked.',
    'Alert on errors in logs, not only on 5xx responses.',
  ],
  solution: `
**Diagnosis.** The flow's **On Error Continue** caught DB:CONNECTIVITY and set a friendly payload. On Error Continue ends the flow as a success, so the Listener answered 200 and the app showed a confirmation for bookings that were never saved.

**Immediate mitigation.**
- Use the logs to list every booking answered 200 during the outage and tell the customers or the restaurants.
- Ship a quick change so failed inserts return an error status.

**Root cause.** A handler meant to make errors look nice was used as a catch-all. It turned a failure into a success, and monitoring of 5xx responses saw nothing.

**Permanent fix.**
- Use **On Error Propagate** for errors where the work did not happen, with an error response of 503 and a clear message such as "We could not save your booking, please try again".
- Keep On Error Continue only for errors with a real fallback.
- Let the app show a retry message on 503.

**Prevention.** Add a test with the database down that checks the status is not 200. Alert on ERROR lines and on failed inserts, not only on response codes.
`,
  followUps: [
    { q: 'What status code would you return and why?', a: '503, because the failure is temporary and the client may try again. 500 is also acceptable, but 503 says more.' },
    { q: 'How does On Error Propagate change the HTTP response?', a: 'The error goes back to the Listener, which sends its error response. You can set its status and body from the error.' },
    { q: 'Why did monitoring stay quiet?', a: 'It counted 5xx responses, and the handler turned every failure into 200. Alerts should also look at errors in the logs.' },
    { q: 'Can you make the booking safe without the database?', a: 'Yes, by writing it to a durable queue and confirming it later. Then the answer should be 202 Accepted with a pending status, not a confirmation.' },
  ],
}
