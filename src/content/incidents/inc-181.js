export default {
  id: 'inc-181',
  category: 'incidents',
  title: 'The 6 AM Store Report Arrives at 5 PM: a Cron Scheduler Running in UTC After the Move to CloudHub',
  level: 'BEGINNER',
  tags: ['scheduler', 'cron', 'time-zones', 'cloudhub', 'migration'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-16 06:00:00 INFO  [store-report] Scheduler fired, building daily store report', relevant: true, why: 'The log time is the server time, which on CloudHub is UTC.' },
      { text: '2026-11-16 06:04:12 INFO  [store-report] Report sent to 140 store managers', relevant: true, why: '06:04 UTC is 17:04 in Sydney, the end of the working day.' },
      { text: '2026-11-16 06:04:13 INFO  [store-report] Next run 2026-11-17T06:00:00Z', relevant: true, why: 'The Z shows the schedule is read as UTC.' },
      { text: '2026-11-16 06:10:00 INFO  [store-report] GET /health 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the report now arrive in the late afternoon?',
        options: [
          'The cron expression has no time zone, so it uses the server time zone, which is UTC on CloudHub, not Sydney time as on the old server',
          'CloudHub delays scheduled jobs by eleven hours',
          'The report takes eleven hours to build',
          'The cron expression is invalid and runs at a random time',
        ],
        answer: 0,
        explain: 'Without a time zone, the Scheduler reads the cron expression in the time zone of the machine it runs on. The old server was set to Sydney time. CloudHub runs in UTC.',
      },
      {
        type: 'single',
        prompt: 'What is the best fix?',
        options: [
          'Set the time zone of the cron scheduler to Australia/Sydney',
          'Change the cron hour to 19 so it runs at 06:00 Sydney time',
          'Move the app back to the old server',
          'Run the report every hour',
        ],
        answer: 0,
        explain: 'A zone name keeps 06:00 local through daylight saving changes. A fixed UTC hour would drift by an hour twice a year.',
      },
      {
        type: 'multi',
        prompt: 'Which other parts of the app may have the same problem?',
        options: [
          'DataWeave now() used to decide "today" or "yesterday"',
          'Date formats in file names built from the current time',
          'Other schedulers in the same app',
          'The order of fields in the JSON output',
        ],
        answer: [0, 1, 2],
        explain: 'Anything that reads the current time without a zone changed with the server. Field order is not affected.',
      },
      {
        type: 'single',
        prompt: 'Which check would have caught this before go-live?',
        options: [
          'Compare the next run time shown after deploy with the expected local time',
          'Check that the app starts',
          'Check the report contents',
          'Check the CPU usage of the worker',
        ],
        answer: 0,
        explain: 'The next run time was in the logs and showed UTC. A check against the expected local time would have shown the gap.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm the next run time in the logs is in UTC',
          'Set the cron time zone to Australia/Sydney and redeploy',
          'Check the report "yesterday" range still covers the right day',
          'Search the app for other uses of the current time',
          'Add the time zone check to the migration checklist',
        ],
        explain: 'Confirm, fix the schedule, check the data range, look for the same issue elsewhere, then help the next migrations.',
      },
    ],
  },
  description: `
## Symptoms
- Store managers get a daily report of yesterday's sales. It used to arrive at 06:00 before stores open.
- Since the app moved to CloudHub, the report arrives at about 17:00.
- Some managers say the figures look like they cover the wrong day.

## Change / Context
- The app ran on an on-premises Mule server set to Sydney time. It moved to CloudHub without code changes.
- The flow uses a **Scheduler** with the cron expression \`0 0 6 * * ?\` and no time zone.
- The report covers "yesterday", worked out with \`now()\` in DataWeave.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-16 06:00:00 INFO  [store-report] Scheduler fired, building daily store report
2026-11-16 06:04:12 INFO  [store-report] Report sent to 140 store managers
2026-11-16 06:04:13 INFO  [store-report] Next run 2026-11-17T06:00:00Z
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
    'A cron Scheduler with no time zone uses the time zone of the machine it runs on.',
    'CloudHub workers run in UTC, so the schedule moved by the Sydney offset.',
    'Set the time zone on the cron scheduler with a zone name such as Australia/Sydney.',
    'A zone name follows daylight saving; a fixed UTC hour does not.',
    'now() in DataWeave also changed, so "yesterday" may cover the wrong day.',
    'Check every use of the current time when moving between servers.',
  ],
  solution: `
**Diagnosis.** The cron expression \`0 0 6 * * ?\` has no time zone, so it runs at 06:00 in the time zone of the server. The old server used Sydney time. CloudHub runs in UTC, so the job now runs at 06:00 UTC, which is 17:00 in Sydney in November.

**Immediate mitigation.** Tell store managers the timing changed. Check whether the reports since the move covered the right day.

**Root cause.** The app relied on the server's time zone without saying so. The move changed the server, and with it the schedule and the meaning of "today".

**Permanent fix.**
- Set the **time zone** of the cron scheduler to \`Australia/Sydney\`.
- Work out "yesterday" in the same zone, for example by shifting \`now()\` to \`Australia/Sydney\` before taking the date.

**Prevention.** Add a migration checklist item: every scheduler and every use of the current time must name its time zone. After each deploy, compare the logged next run time with the expected local time.
`,
  followUps: [
    { q: 'Why not change the cron hour to 19 UTC?', a: 'It would be right only until daylight saving changes, then an hour off. A zone name follows those changes.' },
    { q: 'What happens to the "yesterday" range?', a: 'now() returns UTC on CloudHub. Taking the date without shifting to Sydney can give the wrong day for part of the day.' },
    { q: 'Where else do time zones hide in Mule apps?', a: 'File names with dates, watermark values, database queries with current dates, and log timestamps.' },
    { q: 'How do you choose between fixed frequency and cron?', a: 'Fixed frequency suits polling every few minutes. Cron suits work at a set wall clock time, such as a report before stores open.' },
  ],
}
