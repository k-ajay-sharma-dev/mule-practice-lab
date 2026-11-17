export default {
  id: 'cs-134',
  category: 'case-studies',
  title: 'Media Agency Loading Spend From 15 Ad Platforms That Correct Their Numbers for Days',
  level: 'ADVANCED',
  tags: ['analytics', 'batch', 'rate-limits', 'late-data', 'apis'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Ad platforms keep changing yesterday\'s numbers for up to seven days. How should the daily load work?',
      options: [
        'Each day, reload the last seven days and replace those rows, keyed by platform, account, campaign and date',
        'Load yesterday once and never touch it again',
        'Add each day\'s numbers on top of the totals already loaded',
        'Wait seven days before loading anything',
      ],
      answer: 0,
      explain: 'Reloading a rolling window and replacing by key keeps the numbers current. Adding on top double counts, and waiting a week makes reports useless.',
    },
    {
      type: 'single',
      prompt: 'One platform allows 200 API calls an hour per account, and the agency has 900 accounts on it. What do you do?',
      options: [
        'Use the platform\'s bulk report endpoint where it exists, and pace calls per account from a queue',
        'Call every account at once at 06:00',
        'Ask the platform to remove the limit',
        'Skip half of the accounts each day',
      ],
      answer: 0,
      explain: 'Bulk reports cut the number of calls, and pacing per account stays under the limit. Calling all at once is throttled.',
    },
    {
      type: 'multi',
      prompt: 'Which three things make the numbers trustworthy?',
      options: [
        'Each row records when it was loaded and from which report',
        'A check that compares totals with the platform\'s own dashboard for a sample of accounts',
        'Currency and time zone stated per account and converted the same way every day',
        'Rounding every number to the nearest thousand',
      ],
      answer: [0, 1, 2],
      explain: 'Load times explain changes, sample checks catch errors, and consistent currency and time zone make platforms comparable.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Platforms change their APIs a few times a year. How do you limit the damage?',
      options: [
        'One adapter per platform that maps to a common spend record, so a change touches one adapter',
        'One big flow that handles all 15 platforms',
        'Let each client team write its own loader',
        'Stop using platforms that change their API',
      ],
      answer: 0,
      explain: 'Adapters per platform isolate change. The common record keeps reporting the same whatever the source.',
    },
    {
      type: 'match',
      prompt: 'Match each problem to its answer.',
      pairs: [
        ['Numbers corrected for days', 'Reload a rolling seven day window and replace by key'],
        ['Tight rate limits', 'Bulk reports and paced calls per account'],
        ['Different fields per platform', 'Adapter per platform to a common spend record'],
        ['Different time zones', 'Store the account time zone and convert consistently'],
      ],
      explain: 'Each problem of the platforms has one clear answer in the design.',
    },
    {
      type: 'order',
      prompt: 'Order the delivery.',
      items: [
        'Define the common spend record with the analytics team',
        'Build adapters for the three largest platforms',
        'Run beside the current spreadsheets for a month and compare',
        'Add the remaining platforms',
        'Retire the spreadsheets',
      ],
      explain: 'The common record first, then the platforms that matter most, then a comparison before anyone relies on it.',
    },
  ],
  description: `
**Context.** A media agency buys ads for **120 clients** on **15 ad platforms**. Clients get daily spend and results reports.

**Facts gathered so far**
- Analysts download reports from each platform and paste them into spreadsheets every morning.
- Platforms correct yesterday's numbers for several days, so reports never match the platforms later.
- Each platform has its own API, fields, rate limits and time zone rules.
- Some platforms offer bulk reports; others only allow one account per call.
- Each client account has its own currency.

**Opinions**
- Head of analytics: "I want numbers I can defend in front of a client."
- Analysts: "We spend two hours a day copying data."
- Finance: "Spend must match the invoices at month end."

**Your task.** Design how spend and results are loaded from the platforms every day.
`,
  answerTemplate: `## Decision

## The common spend record

## Loading each platform

## Late corrections

## Rate limits

## Trust and checks

## Risks
`,
  keyPoints: [
    'Reload a rolling window of recent days and replace by key, so corrections are picked up.',
    'One adapter per platform maps to a common spend record.',
    'Use bulk reports where possible and pace calls per account under the limits.',
    'Keep currency and time zone per account and convert consistently.',
    'Record load time and source on every row.',
    'Compare with the spreadsheets for a month before switching.',
  ],
  solution: `
**Decision.** Daily loads through one adapter per platform into a common spend record, with a rolling reload window.

**The common record.** Platform, account, campaign, date in the account time zone, spend in account currency and in the agency currency, results, load time and source report.

**Loading.** A scheduler puts one job per platform and account on a queue. Each adapter uses bulk reports where it can, and paces calls per account to stay under the limits, with backoff on throttling.

**Late corrections.** Each day reloads the last seven days and replaces rows by key. Older days are locked after the platform's correction window.

**Trust.** Sample checks against platform dashboards, alerts when a day's total changes more than a set share, and month end checks against invoices.

**Risks.** Platforms that change correction windows, accounts with no data on some days, and currency rates that differ from finance's.
`,
  followUps: [
    { q: 'Why replace rows instead of adding changes?', a: 'Platforms send corrected totals, not differences. Replacing by key keeps one row per day with the latest value.' },
    { q: 'What if a platform is down in the morning?', a: 'Retry later in the day, and show the report with that platform marked as delayed.' },
    { q: 'How do you handle a new platform?', a: 'Write one adapter to the common record and add its jobs to the scheduler. Reports need no change.' },
    { q: 'How do you match finance at month end?', a: 'After the correction window closes, lock the month and compare spend per platform with the invoices.' },
  ],
}
