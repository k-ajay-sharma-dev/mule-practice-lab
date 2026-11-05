export default {
  id: 'ms-009',
  category: 'mulesoft',
  title: 'Scheduler: Fixed Frequency vs Cron in a Cluster',
  level: 'INTERMEDIATE',
  tags: ['scheduler', 'cron', 'clustering', 'cloudhub'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'Finance receives **two** identical files every night from an app on 2 CloudHub 2.0 replicas. Why?',
      options: [
        'Each replica runs its own Scheduler because the app is not clustered',
        'The cron expression fires twice because of daylight saving',
        'The SFTP connector retries the write automatically',
        'CloudHub runs every Scheduler twice for high availability',
      ],
      answer: 0,
      explain: 'Without clustering, every replica is an independent runtime and fires its own Scheduler. With clustering enabled, the Scheduler runs on the **primary node only**.',
    },
    {
      type: 'single',
      prompt: 'Which configuration runs the Finance export at 02:00 New York time on weekdays?',
      options: [
        '`<cron expression="0 0 2 ? * MON-FRI" timeZone="America/New_York"/>`',
        '`<cron expression="0 2 * * MON-FRI"/>`',
        '`<fixed-frequency frequency="24" timeUnit="HOURS" startDelay="2"/>`',
        '`<cron expression="0 0 2 ? * MON-FRI"/>` — the cron uses the business time zone by default',
      ],
      answer: 0,
      explain: 'Mule uses a Quartz-style cron with a **seconds** field first. Without `timeZone` the Scheduler uses the time zone of the machine running Mule, and the Scheduler page gives UTC for CloudHub. So the run would happen at the wrong local time and drift with daylight saving. CloudHub 2.0 bases schedules on the scheduler\'s defined time zone. Do not rely on this on CloudHub 1.0, where the Manage Schedules page says all schedules are based on UTC and the time zone configuration is ignored.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the scheduling strategy.',
      pairs: [
        ['Poll inventory every 5 minutes', 'Fixed frequency'],
        ['Run at 02:00 on weekdays', 'Cron'],
        ['Wait 1 minute after app start before the first poll', 'Fixed frequency with startDelay'],
      ],
      explain: 'Fixed frequency is "every N units" (with an optional start delay); cron is calendar-based.',
    },
    {
      type: 'single',
      prompt: 'The 5-minute inventory sync sometimes takes 7 minutes and overlaps itself. What is the fix?',
      options: [
        'Limit the flow to one execution at a time (`maxConcurrency="1"` and/or disallow concurrent execution)',
        'Switch to a cron expression — cron never overlaps',
        'Enable clustering — it prevents overlapping runs on the same node',
        'Increase the replica count to 3',
      ],
      answer: 0,
      explain: 'Clustering stops the **other replica** from firing but does not stop a slow run overlapping with the next trigger on the same node. Limiting concurrency makes the next trigger skip instead.',
    },
    {
      type: 'single',
      prompt: 'The Scheduler has `disallowConcurrentExecution="true"` and the previous run is still active when the next trigger fires. What happens to that trigger?',
      options: [
        'It runs immediately after the active run ends',
        'It is skipped, and the Scheduler resumes at its next configured interval',
        'It is queued in Object Store and runs at the next trigger',
        'It runs twice at the next interval',
      ],
      answer: 1,
      explain: 'Mule logs "Execution skipped" and waits for the next interval. If skipped runs matter, use a watermark so the next run picks up the gap.',
    },
  ],
  description: `
Two polling integrations are deployed to **CloudHub 2.0 with 2 replicas**:

- **Inventory sync** — must run every **5 minutes**. A run sometimes takes 7 minutes when the warehouse API is slow.
- **Finance export** — must run at **02:00 New York time** every weekday and produce exactly **one** file on the finance SFTP.

After go-live, finance receives **two** identical files every night, and the inventory sync occasionally overlaps itself, causing duplicate stock updates.

**Questions**
1. When do you choose fixed frequency vs cron? Write the configuration for both integrations.
2. Why does finance get two files, and how do you fix it?
3. Why can the inventory sync overlap, and how do you prevent it?
4. Which time zone does the cron use if you don't set one?
`,
  answerTemplate: `## Fixed frequency vs cron

## Two files every night

## Overlapping runs

## Time zone
`,
  keyPoints: [
    'Fixed frequency = every N time units (frequency, timeUnit, startDelay); cron = calendar-based schedule using a Quartz-style expression with a seconds field.',
    'Weekday 02:00 cron: 0 0 2 ? * MON-FRI with timeZone America/New_York.',
    'Each replica runs its own Scheduler unless the app is clustered; with clustering, the Scheduler fires on the primary node only.',
    'Prevent overlap by limiting concurrent executions of the flow (maxConcurrency="1" and/or the scheduler\'s disallow-concurrent-execution option).',
    'Without an explicit timeZone the cron uses the time zone of the machine running Mule (the Scheduler page gives UTC for CloudHub), which also ignores daylight-saving changes in the business time zone.',
    'timeZone works on CloudHub 2.0. On CloudHub 1.0 the Manage Schedules page says schedules are based on UTC and the time zone configuration is ignored, so convert the time to UTC there.',
  ],
  solution: `
**Fixed frequency vs cron**
- **Fixed frequency**: "every N units" since the app started — good for polling (\`frequency\`, \`timeUnit\`, \`startDelay\`).
- **Cron**: calendar-based ("at 02:00 on weekdays") using a Quartz-style expression (seconds minutes hours day-of-month month day-of-week).

\`\`\`xml
<!-- Inventory sync -->
<scheduler doc:name="Every 5 min">
  <scheduling-strategy>
    <fixed-frequency frequency="5" timeUnit="MINUTES" startDelay="1"/>
  </scheduling-strategy>
</scheduler>

<!-- Finance export -->
<scheduler doc:name="Weekdays 02:00 NY">
  <scheduling-strategy>
    <cron expression="0 0 2 ? * MON-FRI" timeZone="America/New_York"/>
  </scheduling-strategy>
</scheduler>
\`\`\`

**Two files:** every replica is an independent Mule runtime. Without clustering, **both replicas fire the Scheduler**, so the export runs twice. Fix: enable **clustering** for the app on CloudHub 2.0 (Schedulers then run on the primary node only), or move the trigger out of the app (single-replica scheduler app / external trigger). As a safety net, make the export idempotent (e.g. record "export done for date X" in a persistent Object Store).

**Overlap:** a 5-minute fixed frequency triggers again while a 7-minute run is still active. Limit the flow to one execution at a time — \`maxConcurrency="1"\` on the flow and/or the Scheduler's option to disallow concurrent execution — so the next trigger is skipped instead of overlapping. Also consider a watermark so a skipped trigger loses no data.

**Time zone:** without \`timeZone\` the cron uses the time zone of the machine running Mule. The Scheduler page gives **UTC** for CloudHub, so 02:00 would really be 21:00/22:00 in New York depending on daylight saving. On this CloudHub 2.0 app, set \`timeZone\` explicitly for business schedules: CloudHub 2.0 bases schedules on the scheduler's defined time zone. **CloudHub 1.0 is different:** the Manage Schedules page says all schedules are based on UTC and the time zone configuration is ignored. So convert the time to UTC and review it when the clocks change.
`,
  followUps: [
    {
      q: 'How would you trigger the job manually for a re-run without redeploying?',
      a: 'Expose the job logic in a separate flow and add a secured HTTP endpoint (or a Runtime Manager schedule run, where supported) that calls it with a date parameter. Keep the Scheduler flow as a thin trigger.',
    },
    {
      q: 'What happens to a cron schedule while the app is stopped at 02:00?',
      a: 'On CloudHub 2.0 it does not run at startup: the schedule runs at its next scheduled time, so plan for the run being missed. CloudHub 1.0 is different: it triggers a missed job as soon as the app restarts. If missed runs matter, persist the last successful run date and process the gap on the next start.',
    },
    {
      q: 'Is clustering the same on on-prem runtimes?',
      a: 'Yes, conceptually: in an on-prem Mule cluster the Scheduler (and most polling sources) runs on the primary node only, and another node takes over if the primary fails.',
    },
  ],
}
