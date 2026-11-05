export default {
  id: 'inc-013',
  category: 'incidents',
  title: 'Nightly Sales Export Misses an Hour After the DST Change',
  level: 'INTERMEDIATE',
  tags: ['timezones', 'dst', 'scheduler', 'dataweave', 'batch-jobs'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-10-26 00:00:00.010 INFO  [sales-export] Scheduler fired (cron 0 0 0 * * ?, JVM tz=UTC) = 01:00 Europe/Amsterdam', relevant: true, why: 'The cron has no timeZone, so it fires at 00:00 UTC: 02:00 local in summer but 01:00 local in winter.' },
      { text: '2026-10-26 00:00:00.010 INFO  [sales-export] Export window 2026-10-24T23:00:00Z .. 2026-10-25T23:00:00Z', relevant: true, why: 'A fixed 24 h window. 25 Oct lasted 25 hours locally and started at 2026-10-24T22:00Z, so 00:00-01:00 local is missing.' },
      { text: '2026-10-26 00:00:02.300 INFO  [db] Connection pool initialised (size=5)', relevant: false },
      { text: '2026-10-26 00:00:41.233 INFO  [sales-export] Exported 21,904 rows for business date 2026-10-25', relevant: false },
      { text: '2026-10-26 00:00:42.001 INFO  [sftp] Uploaded sales_20261025.csv to finance', relevant: false },
      { text: '2026-03-30 00:00:00.012 INFO  [sales-export] Export window 2026-03-28T22:00:00Z .. 2026-03-29T22:00:00Z', relevant: true, why: 'In March the local day lasted 23 hours (2026-03-28T23:00Z to 2026-03-29T22:00Z), so the 24 h window reached back one hour into the previous day, which had already been exported.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is an hour missing on 25 Oct and duplicated in March?',
        options: [
          'The window is computed as 24 hours, but a local calendar day lasts 25 hours in October and 23 hours in March',
          'The POS system clock was wrong on those days',
          'The database stores timestamps in local time',
          'The scheduler skipped a run on those days',
        ],
        answer: 0,
        explain: 'toTs is correct (start of today local), but fromTs = toTs - 24h. On DST change days a local day is not 24 h, so the window misses or overlaps one hour.',
      },
      {
        type: 'single',
        prompt: 'Why does the job now start at 01:00 local instead of 02:00?',
        options: [
          'The cron has no timeZone and runs at 00:00 UTC, which is 01:00 in winter (CET)',
          'CloudHub moved the worker to another region',
          'The window calculation delays the start',
          'The cron expression was edited',
        ],
        answer: 0,
        explain: 'Without a timeZone the cron follows the UTC JVM. It is the same hard-coded-offset thinking, though it is not what loses the data.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Re-run the whole export for 25 Oct with the same code',
          'Export the missing hour 2026-10-24T22:00Z to 23:00Z as a correction and check the March duplicate with finance',
          'Change the JVM time zone to Europe/Amsterdam',
          'Ask finance to ignore DST days',
        ],
        answer: 1,
        explain: 'Re-running with the same code reproduces the same window. A one-off correction for the exact missing hour fixes the data now.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Cron with timeZone="Europe/Amsterdam" at a local time outside the 02:00-03:00 DST hour',
          'Build the window from start of the business date to start of the next date in Europe/Amsterdam, then convert to UTC',
          'MUnit tests for the last Sunday of March and October asserting 23 and 25 hour windows',
          'Use a fixed +01:00 offset for all calculations',
        ],
        answer: [0, 1, 2],
        explain: 'Use calendar dates in a named zone (P1D on a Date, not PT24H on a timestamp). A fixed offset is exactly the bug.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Compare the logged UTC window with the real local day boundaries',
          'Export the missing hour as a correction',
          'Review past DST dates for missing or duplicated hours',
          'Fix the cron time zone and the window calculation',
          'Add DST unit tests and daily row-count reconciliation',
        ],
        explain: 'Diagnose, correct the data, check history, fix the code, then test and reconcile.',
      },
    ],
  },
  description: `
## Symptoms
- Finance in Amsterdam reconciles the nightly sales export against the POS system.
- **Sunday 25 Oct 2026** was the night clocks went back from CEST to CET. The export for that day is **missing all sales between 00:00 and 01:00 local time**.
- Finance also finds that in **March** one hour of sales was **exported twice**. At the time it was blamed on "a POS glitch".
- Since 25 Oct, the export job also starts at **01:00 local** instead of the usual 02:00.

## Change / Context
- The app runs on CloudHub (JVM time zone **UTC**).
- Scheduler: \`<cron expression="0 0 0 * * ?"/>\`. The developer wrote it after working out that "00:00 UTC = 02:00 Amsterdam" (true in summer).
- The flow computes the window like this (simplified DataWeave):
\`\`\`
var to   = (now() >> "Europe/Amsterdam") as Date  // today, local
var toTs = (to ++ |00:00:00|) ... // start of today local, converted to UTC
var fromTs = toTs - |PT24H|
\`\`\`
- Sales timestamps are stored in **UTC** in the database. Query: \`created_at >= :fromTs AND created_at < :toTs\`.

## Logs
\`\`\`
2026-10-26 00:00:00.010 INFO  [sales-export] Export window 2026-10-24T23:00:00Z .. 2026-10-25T23:00:00Z
2026-10-26 00:00:41.233 INFO  [sales-export] Exported 21,904 rows for business date 2026-10-25
\`\`\`

## Your tasks
1. What is the most likely root cause (explain both the missing hour and the March duplicates)?
2. What do you do **right now**?
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
    'Explains that the local business day of 25 Oct lasted 25 hours (clocks went back), so a fixed PT24H window starting 24 h before local midnight misses the first hour (22:00–23:00 UTC on 24 Oct = 00:00–01:00 local).',
    'Explains the March case: that day had 23 hours, so the 24 h window overlapped the previous day by one hour, causing duplicates.',
    'Explains the start-time shift: the cron has no timeZone, so it runs at 00:00 UTC, which is 02:00 in summer but 01:00 in winter.',
    'Immediate: re-export the missing hour for 25 Oct (correct window 2026-10-24T22:00Z to 2026-10-25T23:00Z), and check the March export for duplicates.',
    'Permanent fix: set timeZone="Europe/Amsterdam" on the cron, compute the window from calendar dates (start of yesterday local to start of today local, each converted to UTC) instead of subtracting 24 hours.',
    'Prevention: unit/MUnit tests for the window calculation on both DST transition dates, and a reconciliation check of row counts per business date.',
  ],
  solution: `
**Diagnosis.** Two separate time bugs.

1. **Window bug.** The job computes \`toTs\` = start of *today* in Amsterdam (correct) and \`fromTs = toTs - 24h\`. But a local calendar day is not always 24 h. On 25 Oct clocks went back, so the day lasted **25 hours**: it started at 00:00 CEST = **2026-10-24T22:00Z** and ended at 00:00 CET = **2026-10-25T23:00Z**. The job used 23:00Z → 23:00Z, missing **00:00–01:00 local**. In March the day is **23 hours**, so the 24 h window reached back into the previous day and exported that hour twice.
2. **Schedule bug.** The cron has no \`timeZone\`, so it fires at **00:00 UTC**: 02:00 local in summer, 01:00 local in winter. Not the cause of the missing data, but it shows the same "UTC offset hard-coded" thinking.

**Immediate mitigation.** Run a one-off export for the missing hour (2026-10-24T22:00Z to 23:00Z) and send it to finance, labelled as a correction. Re-check the March export date and remove/credit the duplicate hour if it was double-counted. Tell finance which dates were affected historically (every DST change since go-live).

**Root cause.** Treating "a day" as **24 hours** instead of a **calendar date in a specific time zone**, and scheduling in UTC while the business runs in local time.

**Permanent fix.**
- Scheduler: \`<cron expression="0 0 4 * * ?" timeZone="Europe/Amsterdam"/>\` so it always runs at 04:00 local. Not 02:00: that hour does not exist on the last Sunday of March and happens twice on the last Sunday of October.
- Window: take the business date (yesterday in Europe/Amsterdam), build **start of that date** and **start of the next date** in Europe/Amsterdam, then convert both to UTC for the query. Use date arithmetic (\`|P1D|\` on a Date) rather than \`|PT24H|\` on a timestamp.
- Log the business date and the exact UTC window on every run (already done — that's what made this diagnosable).

**Prevention.** MUnit tests that call the window calculation for the last Sunday of March and October (and a normal day) and assert 23/25/24-hour windows; a daily reconciliation comparing row counts per business date between POS and the export; a team rule to store in UTC and convert at the edges with a named zone, never a fixed offset.
`,
  followUps: [
    { q: 'Why not just schedule in UTC and avoid time zones entirely?', a: 'Storage and transport in UTC is good, but the business question is "sales for the Amsterdam calendar day", which is defined by local time. The boundaries must be computed in the business zone and then converted to UTC.' },
    { q: 'What happens to a cron job scheduled at 02:30 local on the night clocks go forward?', a: '02:30 does not exist that night, so depending on the scheduler implementation the run may be skipped or shifted. Avoid scheduling business jobs in the 02:00–03:00 local window in DST zones.' },
    { q: 'How would you prove the root cause to finance?', a: 'Show the logged UTC window next to the true local-day boundaries for 25 Oct, then query the database for rows between 22:00Z and 23:00Z on 24 Oct — that count matches the missing sales.' },
  ],
}
