export default {
  id: 'inc-195',
  category: 'incidents',
  title: 'Monthly Subscriptions Drift to the 28th: Adding One Month to the Last Billing Date Instead of the Start Date',
  level: 'INTERMEDIATE',
  tags: ['dataweave', 'dates', 'billing', 'scheduling'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-18 02:00:01 INFO  [billing] Billing run started due=2026-11-18', relevant: false },
      { text: '2026-11-18 02:00:03 DEBUG [billing] subscriptionId=SB-4410 startDate=2026-01-31 lastBilled=2026-10-28 nextDue=2026-11-28', relevant: true, why: 'A customer who started on the 31st is now billed on the 28th.' },
      { text: '2026-11-18 02:00:03 DEBUG [billing] subscriptionId=SB-4410 history=2026-01-31,2026-02-28,2026-03-28,2026-04-28', relevant: true, why: 'After February the date stays on the 28th every month.' },
      { text: '2026-11-18 02:00:03 DEBUG [billing] mapping nextDue = lastBilled + |P1M|', relevant: true, why: 'Each next date is worked out from the last billed date.' },
      { text: '2026-11-18 02:00:09 INFO  [billing] Billing run finished billed=8120', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the date stay on the 28th after February?',
        options: [
          'Jan 31 plus one month is Feb 28, as February has no 31st. Every later date adds a month to the 28th',
          'February has 30 days',
          'The billing run only runs on the 28th',
          'Dates are stored as text',
        ],
        answer: 0,
        explain: 'Adding a month moves to the last valid day when the day does not exist. Building on that date keeps the 28th forever.',
      },
      {
        type: 'single',
        prompt: 'How do you work out the right due date?',
        options: [
          'Add the number of months since the start to the start date, so each month is clamped on its own',
          'Add 30 days to the last date',
          'Always bill on the 1st',
          'Add one month to the last date as now',
        ],
        answer: 0,
        explain: 'start + 10 months gives 2026-11-30, and start + 1 month still gives Feb 28. Each date is worked out from the anchor, so nothing drifts.',
      },
      {
        type: 'multi',
        prompt: 'Which customers are affected?',
        options: [
          'Those who started on the 29th, 30th or 31st',
          'Only in months after a shorter month',
          'Every customer who started on the 1st',
          'Customers who started on the 15th',
        ],
        answer: [0, 1],
        explain: 'Only start days that some months lack can be clamped. The 1st and the 15th exist in every month.',
      },
      {
        type: 'single',
        prompt: 'Customers were billed early. What should happen to them?',
        options: [
          'Move their next due date back to the right day, and let customer service decide on any credit',
          'Charge them again on the right day as well',
          'Do nothing',
          'Cancel their subscriptions',
        ],
        answer: 0,
        explain: 'Fix the schedule and let the business decide about refunds or credits. Billing twice would make it worse.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Find subscriptions whose start day is past the 28th',
          'Change the rule to start date plus months since start',
          'Correct the next due date for the affected subscriptions',
          'Agree any credit with customer service',
          'Add tests for start dates on the 29th, 30th and 31st, and in leap years',
        ],
        explain: 'Size it, fix the rule, correct the data, settle with customers, then test the edges.',
      },
    ],
  },
  description: `
## Symptoms
- Customers who joined on the 31st complain they are now billed on the 28th of every month.
- Customers who joined on the 1st to the 28th are fine.

## Change / Context
- The billing mapping works out the next due date as \`lastBilled + |P1M|\`.
- Subscriptions store the start date and the last billed date.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:03 DEBUG [billing] subscriptionId=SB-4410 startDate=2026-01-31 lastBilled=2026-10-28 nextDue=2026-11-28
2026-11-18 02:00:03 DEBUG [billing] subscriptionId=SB-4410 history=2026-01-31,2026-02-28,2026-03-28,2026-04-28
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
    'Adding a month to the 31st lands on the last day of a shorter month.',
    'Building each date on the last one keeps the shorter day forever.',
    'Work out each due date from the start date plus months since start.',
    'Only start days past the 28th are affected.',
    'Correct the schedule and let the business decide on credits.',
    'Test the 29th, 30th, 31st and leap years.',
  ],
  solution: `
**Diagnosis.** \`2026-01-31 + |P1M|\` is \`2026-02-28\`. The next run adds a month to the 28th, and so on, so the customer stays on the 28th.

**Immediate mitigation.** Find subscriptions with a start day of 29, 30 or 31. Set their next due date from the start date.

**Root cause.** The rule used the last billed date as the base. Clamping in a short month then carried forward.

**Permanent fix.** Work out the due date as the start date plus the number of months billed so far. February is still clamped, but March goes back to the 31st.

**Prevention.** Tests with start dates at the end of months and in leap years. Store the anchor date and never the clamped one as the base.
`,
  followUps: [
    { q: 'What does start plus one month give for 2028-01-31?', a: '2028-02-29, as 2028 is a leap year.' },
    { q: 'Why not bill every 30 days?', a: 'The date would move each month, and customers expect the same day of the month.' },
    { q: 'Where should the anchor live?', a: 'On the subscription record, set once and never changed by billing.' },
    { q: 'What if the business wants the last day of the month?', a: 'Then store that rule and work out the last day of each month directly.' },
  ],
}
