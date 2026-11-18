export default {
  id: 'inc-176',
  category: 'incidents',
  title: 'Sign-Up Says Success but Welcome Emails Never Arrive: Errors Inside an Async Scope Do Not Reach the Caller',
  level: 'BEGINNER',
  tags: ['myproject', 'async', 'error-handling', 'email', 'monitoring'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-07-09 09:12:40 INFO  [member-api] POST /members received for m.oduya@example.com', relevant: false },
      { text: '2026-07-09 09:12:40 INFO  [member-api] Member M-7781 saved', relevant: false },
      { text: '2026-07-09 09:12:40 INFO  [member-api] Response 201 sent', relevant: true, why: 'The caller gets success as soon as the main flow ends. The email runs separately.' },
      { text: '2026-07-09 09:12:41 ERROR [member-api] Error in Async: EMAIL:CONNECTIVITY Authentication failed', relevant: true, why: 'The email step fails inside the Async scope, after the answer was sent.' },
      { text: '2026-07-09 09:12:41 ERROR [member-api] Unhandled error in Async, logged by the default handler', relevant: true, why: 'Illustrative line: the error stays inside the Async work. Nothing retries or alerts.' },
      { text: '2026-07-09 09:20:00 INFO  [stock-sync] 98 items updated', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the sign-up return 201 when the welcome email fails?',
        options: [
          'The email runs in an Async scope, so the main flow finishes and answers without waiting for it',
          'The email connector never raises errors, it only logs them',
          'The HTTP Listener ignores errors raised after the payload is set',
          'The 201 status is set before the flow, so errors cannot change it',
        ],
        answer: 0,
        explain: 'An Async scope runs its steps on its own. The main flow carries on and answers, and an error inside the Async scope is not raised in the main flow.',
      },
      {
        type: 'single',
        prompt: 'What is the right way to make sure each welcome email is sent?',
        options: [
          'Put an email request on a queue, and let a consumer send it with retries and a dead letter queue',
          'Remove the Async scope so a failed email makes the sign-up fail',
          'Wrap the email in an Async scope inside another Async scope',
          'Log the email error at ERROR level and check the logs weekly',
        ],
        answer: 0,
        explain: 'The email should not block or fail the sign-up, but it must not be lost either. A queue keeps the request, the consumer retries, and failures land somewhere visible.',
      },
      {
        type: 'multi',
        prompt: 'Which two changes help right now?',
        options: [
          'Fix the email credentials that started failing',
          'Find members who signed up during the failure and send their emails again',
          'Make the sign-up return 500 for every new member',
          'Delete members created during the failure',
        ],
        answer: [0, 1],
        explain: 'Fix the cause, then repair the missed work. Failing sign-ups or deleting members would hurt customers for a side task.',
      },
      {
        type: 'single',
        prompt: 'How would you have noticed this sooner?',
        options: [
          'An alert on the count of email errors, or on emails sent compared with sign-ups',
          'An alert on the answer time of POST /members',
          'An alert when the number of 201 responses rises',
          'A weekly report of members by country',
        ],
        answer: 0,
        explain: 'The API looked healthy, so only a signal from the email side shows the gap, such as errors from the email step or a mismatch between sign-ups and emails.',
      },
      {
        type: 'order',
        prompt: 'Order the steps.',
        items: [
          'Confirm the email error in the logs',
          'Fix the email credentials and test one send',
          'List members who missed the email and resend',
          'Move sending to a queue and consumer with retries',
          'Add an alert on email failures',
        ],
        explain: 'Fix the cause, repair the missed emails, then change the design so a failure is retried and seen.',
      },
    ],
  },
  description: `
## Symptoms
- A gym chain's \`member-api\` creates a member on \`POST /members\` and sends a welcome email.
- For three days, new members have not received the welcome email. Sign-up still returns **201** and members are saved.
- Nobody was alerted. Support found it from customer calls.

## Change / Context
- The email step is inside an **Async** scope, so sign-up does not wait for the mail server.
- The mail account password was changed three days ago.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-07-09 09:12:40 INFO  [member-api] Response 201 sent
2026-07-09 09:12:41 ERROR [member-api] Error in Async: EMAIL:CONNECTIVITY Authentication failed
2026-07-09 09:12:41 ERROR [member-api] Unhandled error in Async, logged by the default handler
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
    'An Async scope runs on its own. The main flow does not wait for it.',
    'An error inside an Async scope is not raised in the main flow, so the caller still gets success.',
    'The email password change caused the errors. The design hid them.',
    'Fix the credentials, then resend the missed emails.',
    'Work that must happen belongs on a queue with retries and a dead letter queue.',
    'Alert on the side task itself, because the API looks healthy.',
  ],
  solution: `
**Diagnosis.** The email step runs in an **Async** scope. The main flow saves the member and returns 201 at once. The email fails later with an authentication error, after the mail password changed. Errors inside the Async scope do not reach the main flow, so the caller sees success and nothing retries.

**Immediate mitigation.**
- Update the mail credentials and send one test email.
- List members created since the change and send their welcome emails again.

**Root cause.** Two things together. The password changed without updating the app, and the design sent the email in a way where a failure is only logged.

**Permanent fix.**
- Publish an email request to a queue after the member is saved.
- A consumer sends the email with retries, and after several failures the message goes to a dead letter queue.
- Handle errors inside the consumer, with clear logs that include the member id.

**Prevention.** Alert on email failures and on the dead letter queue depth. Add the mail credentials to the list of secrets checked when passwords rotate.
`,
  followUps: [
    {
      q: 'Can you put an error handler inside the Async scope?',
      a: 'Yes, a Try inside it can catch and log the error. But the work is still lost if the app restarts, which a queue avoids.',
    },
    {
      q: 'Why not remove the Async scope?',
      a: 'Then a mail server problem would fail or slow every sign-up. The email is a side task and should not block the member.',
    },
    {
      q: 'What happens to Async work if the app restarts?',
      a: 'Work that has not finished is lost, because it lives only in memory. A persistent queue keeps it.',
    },
    {
      q: 'How do you know which members to resend to?',
      a: 'Use the created time of members since the password change, or the error logs, which should carry the member id.',
    },
  ],
}
