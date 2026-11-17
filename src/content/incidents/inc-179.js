export default {
  id: 'inc-179',
  category: 'incidents',
  title: 'Sydney Orders Land on the Previous Day in Finance: a DataWeave Date Taken After a Shift to UTC',
  level: 'INTERMEDIATE',
  tags: ['dataweave', 'dates', 'time-zones', 'finance'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-11-03 08:30:12 INFO  [order-sync] Order AU-50211 received orderedAt=2026-11-03T08:30:00+11:00', relevant: true, why: 'The order was placed on 3 November, Sydney time.' },
      { text: '2026-11-03 08:30:12 INFO  [order-sync] Mapped AU-50211 postingDate=2026-11-02', relevant: true, why: 'The posting date is a day early.' },
      { text: '2026-11-03 13:05:40 INFO  [order-sync] Order AU-50388 received orderedAt=2026-11-03T13:05:00+11:00', relevant: true, why: 'An order after 11:00 Sydney time keeps the right date, which points at the time zone offset.' },
      { text: '2026-11-03 13:05:40 INFO  [order-sync] Mapped AU-50388 postingDate=2026-11-03', relevant: true, why: '13:05 in Sydney is 02:05 UTC on the same day, so the date does not change.' },
      { text: '2026-11-03 13:05:41 INFO  [order-sync] ERP accepted 2 documents', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are morning orders from Sydney posted on the previous day?',
        options: [
          'The mapping shifts the time to UTC before taking the date, and before 11:00 in Sydney it is still the previous day in UTC',
          'The ERP rounds dates down for Australian customers',
          'DataWeave cannot read offsets such as +11:00',
          'The order system sends the wrong date',
        ],
        answer: 0,
        explain: 'Sydney is UTC+11 in November. An order at 08:30 local time is 21:30 UTC on the previous day. Shifting to UTC and then keeping only the date gives the previous day.',
      },
      {
        type: 'single',
        prompt: 'Finance wants the date the customer placed the order, in the store\'s own time. Which expression gives it?',
        options: [
          'payload.orderedAt as DateTime as Date, with no shift to UTC first',
          '(payload.orderedAt as DateTime >> "UTC") as Date',
          'now() as Date',
          'payload.orderedAt[0 to 5]',
        ],
        answer: 0,
        explain: 'Taking the date of the DateTime as it arrived keeps the local date of the offset it carries. The shift to UTC is what moves it.',
      },
      {
        type: 'multi',
        prompt: 'Which questions should be agreed with finance before the fix?',
        options: [
          'Which time zone defines the posting date: the store, the head office or UTC',
          'How to correct the documents already posted on the wrong day',
          'Whether month end close is affected by orders on the last morning of a month',
          'Which colour the ERP uses for posted documents',
        ],
        answer: [0, 1, 2],
        explain: 'The right date is a business rule. Wrong postings must be corrected, and the first morning of a month moves orders into the previous month, which matters at close.',
      },
      {
        type: 'single',
        prompt: 'Which test would have caught this?',
        options: [
          'An order at 08:30+11:00 that must map to the same calendar day',
          'An order at 12:00 UTC',
          'An order with no time at all',
          'A test that the mapping runs under one second',
        ],
        answer: 0,
        explain: 'Only a time where local and UTC dates differ shows the shift. Tests with UTC times or midday times pass either way.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm from the logs that only orders before 11:00 Sydney time are moved',
          'Agree with finance which time zone defines the posting date',
          'Change the mapping and add tests with times near midnight UTC',
          'Correct the documents already posted on the wrong day',
          'Check other mappings for the same pattern',
        ],
        explain: 'Prove the pattern, agree the rule, fix and test, repair the data, then look for the same mistake elsewhere.',
      },
    ],
  },
  description: `
## Symptoms
- An online shop sells in Australia. Finance says many orders appear in the ERP on the day before they were placed.
- Afternoon orders look right. Morning orders are a day early.
- At the start of November, orders from the morning of 1 November were posted in October.

## Change / Context
- A new mapping in \`order-sync\` builds the ERP document. A developer added a shift to UTC "so all dates are the same".
- The posting date is set with \`(payload.orderedAt as DateTime >> "UTC") as Date\`.
- The shop's order system sends times with the local offset, such as \`+11:00\` in November.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-03 08:30:12 INFO  [order-sync] Order AU-50211 received orderedAt=2026-11-03T08:30:00+11:00
2026-11-03 08:30:12 INFO  [order-sync] Mapped AU-50211 postingDate=2026-11-02
2026-11-03 13:05:40 INFO  [order-sync] Mapped AU-50388 postingDate=2026-11-03
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
    'Shifting a DateTime to UTC before taking the date can move it to another day.',
    'In Sydney at UTC+11, every order before 11:00 local time is on the previous UTC day.',
    'Which time zone defines a business date is a rule to agree with finance.',
    'Take the date in the agreed time zone, then convert.',
    'Correct postings already made, especially across a month end.',
    'Test with times where the local and UTC dates differ.',
  ],
  solution: `
**Diagnosis.** The mapping shifts each order time to UTC with \`>> "UTC"\` and then keeps the date. Sydney is UTC+11 in November, so any order before 11:00 local time falls on the previous UTC day.

**Immediate mitigation.**
- Tell finance which orders are affected: the ones placed before 11:00 Sydney time since the release.
- Hold month end close until orders from the morning of the 1st are moved back.

**Root cause.** "Make every date UTC" was applied to a business date. A posting date belongs to a calendar, so it depends on which time zone the business uses.

**Permanent fix.**
- Agree the rule with finance. Most often the posting date is the store's local date.
- Take the date from the DateTime as it arrives, with its own offset: \`payload.orderedAt as DateTime as Date\`. If the rule is a fixed zone, shift to that zone first, such as \`>> "Australia/Sydney"\`, not UTC.
- Keep full timestamps in UTC where systems compare instants, and keep business dates as dates.

**Prevention.** Add tests with times shortly after midnight local time. Search other mappings for \`>> "UTC") as Date\`.
`,
  followUps: [
    { q: 'When is UTC the right choice?', a: 'For instants that systems compare or sort, such as event times. A business date such as a posting date follows the calendar the business agrees on.' },
    { q: 'Why use a zone name like Australia/Sydney instead of +11:00?', a: 'The offset changes with daylight saving. A zone name applies the right offset for each date.' },
    { q: 'How would you correct the wrong postings?', a: 'Find the affected orders from the logs or the ERP by time of day, and post reversals and new documents with the right date, as finance prefers.' },
    { q: 'What test data would you add?', a: 'Times shortly after midnight local, around a daylight saving change, and on the first morning of a month.' },
  ],
}
