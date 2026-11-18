export default {
  id: 'ms-313',
  category: 'mulesoft',
  title: 'Sending the Job Report Email in an Async Scope Without Hurting the Job',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'async', 'job-report', 'error-handling', 'notifications'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'An inbound job ends by sending a notification email. Why put the send in an Async scope?',
      options: [
        'Email must be async',
        'So a slow or failed send does not delay or fail the job, which has already loaded the data',
        'To get a reply',
        'To encrypt the mail',
      ],
      answer: 1,
      explain: 'The job result is the data load. The email reports it and should not change it.',
    },
    {
      type: 'single',
      prompt: 'The SMTP relay is down and the Send inside the Async scope fails. What does the main flow see?',
      options: [
        'The error is raised in the main flow',
        'Nothing. The error stays in the Async scope, so it needs its own error handling and logging',
        'The main flow retries',
        'The job is rolled back',
      ],
      answer: 1,
      explain: 'Add an error handler inside the async work, for example in a flow it calls, that logs and records the failure.',
    },
    {
      type: 'single',
      prompt: 'The Async scope sets a variable. Does the main flow see the change afterwards?',
      options: [
        'Yes',
        'No. The scope works on a copy of the event, and its changes do not come back',
        'Only for payload',
        'Only when the scope finishes first',
      ],
      answer: 1,
      explain: 'Build what the email needs before the scope, and do not depend on results from it.',
    },
    {
      type: 'multi',
      prompt: 'What should a job report email contain?',
      options: [
        'Job name, run ID, environment, start and end time, and status',
        'Counts: received, loaded, rejected, duplicates',
        'The full payload of every record',
        'Where to find details, such as the job log query or a report link',
      ],
      answer: [0, 1, 3],
      explain: 'Payloads make emails large and can expose personal data.',
    },
    {
      type: 'single',
      prompt: 'The app is redeployed while an Async scope is waiting to send. What can happen?',
      options: [
        'The mail is always sent',
        'The work in the Async scope can be lost. If emails must not be lost, put them on a persistent queue or an outbox table instead',
        'Mule stores it in the job log',
        'The relay sends it',
      ],
      answer: 1,
      explain: 'Async is fire and forget in memory. It suits best effort notices, not must deliver messages.',
    },
    {
      type: 'single',
      prompt: 'A flood of 3,000 small jobs each sends an email in an Async scope. What can go wrong?',
      options: [
        'Nothing',
        'Many sends at once can hit relay rate limits and fill inboxes. Limit concurrency and consider one summary email per period',
        'The jobs run slower than before',
        'Mule merges the emails',
      ],
      answer: 1,
      explain: 'An Async scope can set a max concurrency. A digest email is often more useful for support.',
    },
  ],
  description: `
Brindle Outdoor runs an inbound adapter that loads item messages into staging tables. At the end it publishes an acknowledgement and sends a notification email to support. Last week the mail relay was slow, jobs took minutes longer, and one job was marked failed only because the email could not be sent.

**Questions**
1. Why should the email not be part of the job result?
2. How does an Async scope behave with errors and variables?
3. What goes in the job report email?
4. When is an Async scope not enough?
`,
  answerTemplate: `## Email and the job result

## How Async behaves

## The report content

## When Async is not enough
`,
  keyPoints: [
    'The email reports the job. It must not fail it.',
    'Send in an Async scope or through a queue.',
    'Async errors do not reach the main flow: handle them inside.',
    'Async works on a copy: prepare data before it.',
    'Report run ID, status, times and counts, with a pointer to details.',
    'Use a persistent queue or outbox when mail must not be lost.',
  ],
  solution: `
**1. Email and the job result.** The job's work is loading the data and sending the acknowledgement. The email only tells people about it. If the send is in the main path, a slow relay delays the job and a relay error marks a good job as failed.

**2. How Async behaves.** The Async scope runs on another thread with a copy of the event. The main flow carries on at once. Errors inside it do not reach the main flow, so add error handling inside, log the failure with the run ID and, if useful, record it in the job log. Variables set inside it do not come back.

**3. The report content.** Job name, environment, run ID, message type, start and end time, status, and counts for received, loaded, rejected and duplicates. Add a pointer to details, such as the reject report or a query on the job log. Leave out payloads and personal data.

**4. When Async is not enough.** Async work lives in memory. A restart loses it, and many sends at once can hit rate limits. When an email must arrive, such as a reject report the business acts on, write it to a persistent queue or an outbox table and let a sender flow deliver it with retries. Set a max concurrency, and send one digest instead of one mail per small job.
`,
  followUps: [
    {
      q: 'How would you test that a mail failure does not fail the job?',
      a: 'Point the SMTP config at a closed port in a test and check that the job ends as success and logs the mail error.',
    },
    {
      q: 'Who should receive the job report?',
      a: 'A team mailbox or distribution list, not named people, so changes in the team do not need a deploy.',
    },
    {
      q: 'Would you send an email for every successful run?',
      a: 'Often not. Success can go into a daily digest, and failures or warnings send at once.',
    },
  ],
}
