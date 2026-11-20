export default {
  id: 'ms-355',
  category: 'mulesoft',
  title: 'Who Gets Which Integration Email: Alerts, Reports and Business Notices Without Alert Fatigue',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'email', 'alerts', 'reports', 'design', 'support'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each kind of integration email to its usual audience.',
      pairs: [
        ['A failed run that needs action now', 'The support team or on call person for that app'],
        ['A daily summary of loads, rejects and timings', 'Integration owners and team leads'],
        ['A list of rejected items with reasons', 'The business data owners who can fix the source'],
      ],
      explain: 'Different readers need different content. One mail to everyone serves nobody.',
    },
    {
      type: 'single',
      prompt: 'A database outage made the hub send 140 mails in one hour about the same error. What is the better design?',
      options: [
        'Send each alert, but add a mail rule that files repeats in a folder',
        'Fold repeats into one mail with a count, and resend only on growth',
        'Stop all alerts from the hub while the database is known to be down',
        'Send only the first alert of each day for each app',
      ],
      answer: 1,
      explain: 'Show the count and the first and last time, and send again when the count grows a lot or after a quiet period. Repeats bury the next, different alert. That is alert fatigue. Muting all alerts or all but the first hides new problems.',
    },
    {
      type: 'single',
      prompt: 'Who should get the reject report for item data with missing barcodes?',
      options: [
        'The integration developers, who forward it to whoever owns items',
        'The business data owners who maintain items',
        'The support team, who raise a ticket for each rejected item',
        'The stores, since missing barcodes stop sales at the till',
      ],
      answer: 1,
      explain: 'Developers and support cannot fix master data. The people who can should get the report, in their own words, with a link to the full list.',
    },
    {
      type: 'multi',
      prompt: 'Which choices keep alert mails useful?',
      options: [
        'A subject that starts with severity, app and error type',
        'One line per problem with counts, times and a link to logs or the job log',
        'Routing by app owner, with a default mailbox for unknown apps',
        'The full failing payload attached, so support can replay it',
      ],
      answer: [0, 1, 2],
      explain: 'Payloads can hold personal or commercial data, and they make mails large.',
    },
    {
      type: 'single',
      prompt: 'Why use a distribution list or shared mailbox instead of personal addresses in the app properties?',
      options: [
        'A list sends one copy, so the mail server load stays low',
        'The team can change a list without a change to the app',
        'Mail servers reject mail sent to too many personal addresses',
        'A list keeps a copy of every mail, so it doubles as an audit log',
      ],
      answer: 1,
      explain: 'People join and leave teams. A property change still needs a redeploy or restart in many setups. A list change does not.',
    },
    {
      type: 'single',
      prompt: 'When is email the wrong channel for an integration alert?',
      options: [
        'When the alert holds a list of more than a few rejected items',
        'When someone must act within minutes outside office hours',
        'When the alert goes to more than one team at the same time',
        'When the same error has already been mailed earlier that day',
      ],
      answer: 1,
      explain: 'Mail is read in office hours. Urgent alerts need a paging or incident tool that wakes someone, with email as a copy.',
    },
  ],
  description: `
Thornbury Freight's report app sends integration mails: run failures, a daily load summary and reject lists. Everything goes to one list of 25 people. During an outage the list got 140 mails in an hour, and a critical failure from another app went unnoticed until morning. Business users say the reject lists are full of technical text they cannot use.

**Questions**
1. Which kinds of mail exist, and who should get each?
2. How do you stop repeats from burying important alerts?
3. What should an alert mail contain, and what not?
4. When is email the wrong channel?
`,
  answerTemplate: `## Kinds of mail and audiences

## Stopping repeats

## Content of an alert

## When not to use email
`,
  keyPoints: [
    'Split alerts, summaries and reject reports by audience.',
    'Route alerts by app owner with a default mailbox.',
    'Fold repeats with counts and resend only on growth or after a quiet period.',
    'Subject with severity, app and error type, body with counts and links.',
    'No payloads or personal data in mails.',
    'Urgent night alerts need paging, with email as a copy.',
  ],
  solution: `
**1. Kinds and audiences.** Alerts that need action go to the support team of the app, and critical ones also to on call. Daily summaries go to integration owners. Reject reports go to the business data owners, written in their words, with a link to the full list.

**2. Stopping repeats.** Group alerts by app and error type in each window, with a count and the first and last time. Keep the last sent time per group and resend only when the count grows a lot or a quiet period has passed.

**3. Content.** The subject starts with severity, app and error type. The body has one line per problem, counts, times, the run ID and a link to logs or the job log. No payloads, no personal data, no secrets.

**4. Wrong channel.** When someone must act within minutes outside office hours, use a paging or incident tool and send the mail as a copy. Email suits summaries and things that can wait for the morning.
`,
  followUps: [
    {
      q: 'How do you test the routing before go live?',
      a: 'Send test alerts for each app and severity to the real lists with a TEST subject prefix, and ask each owner to confirm receipt.',
    },
    {
      q: 'Where do you keep the routing rules?',
      a: 'In a small table or config file read at runtime, so owners and addresses change without a code release.',
    },
    {
      q: 'What tells you the mails are not reaching people?',
      a: 'The send result in the outbox table, bounces to the sender address, and a weekly check that owners still read the list.',
    },
  ],
}
