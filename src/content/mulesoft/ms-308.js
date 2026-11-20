export default {
  id: 'ms-308',
  category: 'mulesoft',
  title: 'Job Log and Reject Tables in Oracle: Counts That Survive a Rollback',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'job-log', 'rejects', 'auditing', 'transactions'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the job log table for in an integration that loads staging tables?',
      options: [
        'To keep a copy of every inbound record so a failed load can be replayed',
        'To record each run with its ID, type, status, times and counts for support',
        'To hold each record that failed validation together with its error',
        'To store the Mule log lines of each run so they outlast log rotation',
      ],
      answer: 1,
      explain: 'Support can see what happened without reading logs. Failed records belong in the reject table. A row per run, plus a row per step, answers most support questions with one query.',
    },
    {
      type: 'single',
      prompt: 'The flow writes a job step row and then the load fails and rolls back. The step row is gone too. Why?',
      options: [
        'Oracle undoes every insert in the session when any statement in it fails',
        'The log insert ran in the same transaction as the load, so the rollback removed it',
        'The row was still in the connection buffer and the pool dropped it on error',
        'The error handler deletes the run rows to keep the job table consistent',
      ],
      answer: 1,
      explain: 'Logs must be written outside the business transaction to survive it.',
    },
    {
      type: 'multi',
      prompt: 'How can a job log row survive a rollback of the load?',
      options: [
        'Write it in a separate Database operation outside the transactional Try scope',
        'Call a logging procedure declared with PRAGMA AUTONOMOUS_TRANSACTION',
        'Write it in an error handler outside the transactional scope, after the rollback',
        'Write it inside the transactional Try scope, before the first load statement',
      ],
      answer: [0, 1, 2],
      explain: 'An autonomous transaction commits only its own work, independent of the caller. A row written inside the transactional scope is rolled back with the load, wherever it sits in the scope.',
    },
    {
      type: 'single',
      prompt: 'What should a reject row hold?',
      options: [
        'The ORA error text only, since the job table already holds the rest',
        'The run ID, record key or line, reason or ORA code, time and a pointer to the record',
        'The full input file of the run so support can see every record together',
        'The record key and the time, with the reason kept in the Mule log',
      ],
      answer: 1,
      explain: 'With the run ID and key, someone can fix and resend the right records.',
    },
    {
      type: 'single',
      prompt: 'Total 10,000, loaded 9,940, rejected 50. What does the gap of 10 tell you?',
      options: [
        'A gap under one percent is normal for bulk loads and can be ignored',
        'Ten records are not accounted for, such as skipped duplicates, so counts must explain them',
        'The ten records are still in flight and the next run will load them',
        'Oracle counts rows per block, so small gaps between totals are expected',
      ],
      answer: 1,
      explain: 'Make total = loaded + rejected + skipped a rule, and flag runs where it does not hold.',
    },
    {
      type: 'single',
      prompt: 'Job log tables grow by millions of rows a year. What is a sound plan?',
      options: [
        'Never delete, since audits may ask for any run, and add indexes as it grows',
        'Keep an agreed retention, purge old rows on a schedule, and consider monthly partitions',
        'Truncate the tables every night after the daily report has been sent',
        'Move old rows into the staging schema so they sit next to the loaded data',
      ],
      answer: 1,
      explain: 'Monthly partitions let old data drop cheaply. Index the run ID and start time. Support usually queries recent runs by type and status.',
    },
  ],
  description: `
Brindle Outdoor runs about twenty inbound flows into Oracle staging tables. Each run should record when it started, which steps ran, how many records were good and bad, and how it ended. Today counts are only in the Mule log, and when a load fails, the step rows written during the run vanish with the rollback.

**Questions**
1. What tables do you need, and what goes in each?
2. Why did the step rows vanish, and how do you keep them?
3. What makes counts useful rather than noise?
4. How do the tables feed reports?
`,
  answerTemplate: `## Tables

## Rows that survive a rollback

## Useful counts

## Reports
`,
  keyPoints: [
    'A job table: one row per run with status and counts.',
    'A job step table: one row per step with time and counts.',
    'A reject table: run ID, key, reason, payload pointer.',
    'Write logs outside the business transaction or autonomously.',
    'Totals must add up: loaded + rejected + skipped.',
    'Reports and alert emails read these tables.',
  ],
  solution: `
**1. Tables.** A job table with run ID, flow, message type, message ID, status, start and end time, and counts. A step table with run ID, step name, time, status and counts per step. A reject table with run ID, record key or line, reason code, message, time and the record or a pointer to the stored file. Use a sequence or identity for keys, and index run ID and start time.

**2. Rows that survive a rollback.** The step insert ran inside the transaction of the load, so the rollback removed it. Write the job and step rows outside the transactional scope, or call a logging procedure marked with \`PRAGMA AUTONOMOUS_TRANSACTION\`, which commits its own insert. The error handler then updates the job row to FAILED with the error.

**3. Useful counts.** Record total read, good, rejected, duplicates skipped and loaded. Check that they add up, and mark the run with a warning if they do not. Counts per step show where records were lost.

**4. Reports.** A report flow queries the job and reject tables for a period and sends a summary, for example a daily email with runs, counts and failures per message type. Alerts read the same tables, so the numbers match what support sees.
`,
  followUps: [
    {
      q: 'Should the job log hold the message payload?',
      a: 'Usually not. Store a pointer to the stored file, such as a blob path. Payloads can hold personal data and make the table large.',
    },
    {
      q: 'How do you find runs that never finished?',
      a: 'Query rows still in STARTED or RUNNING older than the expected run time. A watchdog can mark them and alert.',
    },
    {
      q: 'Is an autonomous transaction always a good idea?',
      a: 'For logging, yes. For business data it is risky, because it commits work the caller might roll back.',
    },
  ],
}
