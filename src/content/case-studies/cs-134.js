export default {
  id: 'cs-134',
  category: 'case-studies',
  title: 'Media Agency Loading Spend From 15 Ad Platforms That Correct Their Numbers for Days',
  level: 'ADVANCED',
  tags: ['myproject', 'analytics', 'batch', 'rate-limits', 'late-data', 'apis'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Ad platforms keep changing yesterday’s numbers for up to seven days. How should the daily load work?',
      options: [
        'Reload the last seven days each day and replace those rows by key',
        'Load yesterday each day, and apply corrections in a monthly adjustment run',
        'Add each day’s new numbers on top of the totals already loaded',
        'Load each day only once it is seven days old and final',
      ],
      answer: 0,
      explain: 'Reloading a rolling window and replacing rows keyed by platform, account, campaign and date keeps the numbers current. A monthly adjustment leaves daily reports wrong for weeks. Adding on top double counts, and waiting a week makes daily reports useless.',
    },
    {
      type: 'single',
      prompt: 'One platform allows 200 API calls an hour for the whole agency, and the agency has 900 accounts on it. What do you do?',
      options: [
        'Use its bulk report endpoint, and pace any other calls from a queue',
        'Call each account in turn from 06:00, retrying when the platform throttles',
        'Load half of the accounts on one day and the other half the next',
        'Run the 900 calls from several servers so each has its own limit',
      ],
      answer: 0,
      explain: 'Bulk reports cut the number of calls, and a paced queue stays under the limit. Calling each account in turn hits the limit after 200 calls and then spends hours retrying, half the accounts a day leaves reports a day old, and the limit belongs to the agency, not to each server.',
    },
    {
      type: 'multi',
      prompt: 'Which three things make the numbers trustworthy?',
      options: [
        'Each row records when it was loaded and from which report',
        'Sample checks of totals against each platform’s own dashboard',
        'Currency and time zone kept per account and converted the same way',
        'Converting every platform’s dates to UTC and dropping the account time zone',
        'Loading each day once, the next morning, and never loading it again',
        'Converting spend to one reporting currency at load and keeping only the converted value',
      ],
      answer: [0, 1, 2],
      explain: 'Load times explain changes, sample checks catch errors, and consistent currency and time zone make platforms comparable. Moving dates to UTC splits each account’s day across two dates, so totals no longer match the platform. Platforms correct numbers for several days, so a single load freezes the first, wrong figures; reload a window of recent days. Keeping only the converted value loses the amount the platform shows, so nobody can check it again or redo the conversion.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Platforms change their APIs a few times a year. How do you limit the damage?',
      options: [
        'One adapter per platform, each mapping to a common spend record',
        'One large flow with a branch for each of the 15 platforms',
        'A loader per client team, each covering the platforms it uses',
        'Raw platform fields stored as they are, mapped later in each report',
      ],
      answer: 0,
      explain: 'Adapters per platform isolate change. The common record keeps reporting the same whatever the source.',
    },
    {
      type: 'match',
      prompt: 'Match each problem to its answer.',
      pairs: [
        ['Numbers corrected for days', 'Reload a rolling seven day window and replace by key'],
        ['Tight rate limits', 'Bulk reports and calls paced from a queue'],
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
