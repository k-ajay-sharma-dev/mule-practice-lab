export default {
  id: 'inc-175',
  category: 'incidents',
  title: 'Partner Has the Booking but Our Database Does Not: A Rollback Cannot Undo an HTTP Call',
  level: 'ADVANCED',
  tags: ['transactions', 'database', 'http', 'consistency'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-08-21 14:30:05 INFO  [booking-api] Try (LOCAL transaction) started for booking BK-5521', relevant: true, why: 'The Try begins a local database transaction.' },
      { text: '2026-08-21 14:30:05 INFO  [booking-api] db:insert bookings BK-5521 done, not committed yet', relevant: false },
      { text: '2026-08-21 14:30:06 INFO  [booking-api] POST hotel-partner /reservations 201 ref=HX-90311', relevant: true, why: 'The partner created the reservation. This call is not part of the database transaction.' },
      { text: '2026-08-21 14:30:06 ERROR [booking-api] db:insert booking_lines failed: DB:QUERY_EXECUTION value too long', relevant: true, why: 'A later step fails inside the Try.' },
      { text: '2026-08-21 14:30:06 WARN  [booking-api] Transaction rolled back for BK-5521', relevant: true, why: 'The database undoes its inserts, but the partner keeps the reservation.' },
      { text: '2026-08-21 14:30:06 INFO  [booking-api] Response 500 sent', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the partner keep a reservation that our database does not have?',
        options: [
          'The local transaction covers only the database, so the rollback cannot undo the HTTP call',
          'The partner ignores DELETE requests sent during a rollback',
          'The Try scope commits HTTP calls before database work by design',
          'The rollback failed, so the database kept nothing by accident',
        ],
        answer: 0,
        explain: 'A local database transaction rolls back database work only. The HTTP call to the partner already happened and has no part in the transaction, so its effect stays.',
      },
      {
        type: 'single',
        prompt: 'Which fix keeps both sides consistent?',
        options: [
          'Commit the booking first, call the partner after, and on a partner failure run a compensating step',
          'Put the HTTP call inside an XA transaction so it rolls back with the database',
          'Retry the whole Try until the second insert works',
          'Call the partner twice so one of the calls always lines up',
        ],
        answer: 0,
        explain: 'HTTP calls cannot join a transaction. Order the steps so the local work is safe first, and undo with a compensating action, such as cancelling the reservation, when a later step fails.',
      },
      {
        type: 'multi',
        prompt: 'Which two things help when a later step fails after the partner call?',
        options: [
          'A compensating call that cancels the partner reservation by its reference',
          'An idempotency key on the partner call, so a retry does not create a second reservation',
          'Raising the database transaction timeout',
          'Logging the error at DEBUG instead of ERROR',
        ],
        answer: [0, 1],
        explain: 'Compensation undoes the external effect, and an idempotency key makes retries safe. Neither the timeout nor the log level changes the outcome.',
      },
      {
        type: 'single',
        prompt: 'The data showed the same pattern 40 times last month. What is the first cleanup step?',
        options: [
          'List partner reservations with no matching booking, and confirm each with the business before cancelling',
          'Delete all partner reservations made last month',
          'Insert empty bookings for every orphaned reservation',
          'Ignore them, because the partner will expire them',
        ],
        answer: 0,
        explain: 'Find the orphans by comparing both sides, then decide case by case. Some may be real stays that a customer expects.',
      },
      {
        type: 'order',
        prompt: 'Order the steps of the corrected flow.',
        items: [
          'Validate the whole booking, including field lengths',
          'Insert the booking and lines in one local transaction and commit',
          'Call the partner with an idempotency key',
          'Save the partner reference on the booking',
          'If the partner call fails, mark the booking and retry or cancel later',
        ],
        explain: 'Validate first so known failures happen before any side effect, commit the local data, then make the external call, and record or compensate the outcome.',
      },
    ],
  },
  description: `
## Symptoms
- A travel company's \`booking-api\` saves a booking in its database and reserves the room with a hotel partner.
- Finance finds hotel invoices for reservations that have no booking in our database.
- The bookings failed with a 500, so customers think they did not book, but the hotel holds the room.

## Change / Context
- The flow puts both database inserts and the partner \`POST /reservations\` inside one **Try** with a **LOCAL** transaction.
- The developer expected the rollback to "undo everything" when a step fails.
- A new field was added to \`booking_lines\` last week, and long values now fail the second insert.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-08-21 14:30:05 INFO  [booking-api] Try (LOCAL transaction) started for booking BK-5521
2026-08-21 14:30:06 INFO  [booking-api] POST hotel-partner /reservations 201 ref=HX-90311
2026-08-21 14:30:06 ERROR [booking-api] db:insert booking_lines failed: DB:QUERY_EXECUTION value too long
2026-08-21 14:30:06 WARN  [booking-api] Transaction rolled back for BK-5521
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
    'A local database transaction undoes database work only.',
    'An HTTP call is never part of a transaction, so a rollback cannot undo it.',
    'Validate first, so known failures happen before any external effect.',
    'Commit local work, then call the partner, then record the outcome.',
    'Use a compensating action, such as a cancel, when a later step fails.',
    'An idempotency key makes retries of the external call safe.',
    'Clean up orphans by comparing both sides and deciding case by case.',
  ],
  solution: `
**Diagnosis.** The Try holds a **LOCAL** transaction. It covers the two database inserts, but not the partner \`POST\`. When the second insert fails, the database rolls back, while the partner keeps the reservation. The data is now split.

**Immediate mitigation.**
- Fix the field length, or validate it, so the second insert stops failing.
- List partner reservations with no matching booking and work with the business on each: cancel with the partner, or restore the booking if the customer expects the stay.

**Root cause.** The design assumed a rollback undoes every step in the Try. Only work that joins the transaction is undone, and an HTTP call cannot join it.

**Permanent fix.**
- Validate the whole booking first.
- Insert the booking and its lines in one local transaction and commit.
- Then call the partner with an idempotency key, and save its reference on the booking.
- If the partner call fails, mark the booking as pending and retry later, or cancel it clearly.
- If something fails after the partner call, run a compensating cancel with the reference.

**Prevention.** In design review, mark every external side effect in a flow and say how it is undone. Add a test that fails each step after the partner call and checks both sides afterwards.
`,
  followUps: [
    {
      q: 'Would an XA transaction fix this?',
      a: 'No. XA can join resources that support it, such as some databases and JMS brokers. An HTTP call cannot join any transaction.',
    },
    {
      q: 'What is a compensating action?',
      a: 'A step that undoes the effect of an earlier one, such as cancelling a reservation, because the original cannot be rolled back.',
    },
    {
      q: 'Why save the partner reference?',
      a: 'It is needed to cancel or check the reservation later, and it links both sides for support.',
    },
    {
      q: 'Where would you put the partner call if it often fails?',
      a: 'After the commit, through a queue and a consumer with retries, so the booking is safe and the call happens when the partner is back.',
    },
  ],
}
