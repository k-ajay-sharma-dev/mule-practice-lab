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
        'To store the data itself',
        'To record each run with its ID, message type, status, start and end time and counts, so support can see what happened without reading logs',
        'To replace the reject table',
        'To hold passwords',
      ],
      answer: 1,
      explain: 'A row per run, plus a row per step, answers most support questions with one query.',
    },
    {
      type: 'single',
      prompt: 'The flow writes a job step row and then the load fails and rolls back. The step row is gone too. Why?',
      options: [
        'Oracle deletes logs on errors',
        'The log insert ran in the same transaction as the load, so the rollback removed it',
        'The table has a trigger',
        'The connection pool lost it',
      ],
      answer: 1,
      explain: 'Logs must be written outside the business transaction to survive it.',
    },
    {
      type: 'multi',
      prompt: 'How can a job log row survive a rollback of the load?',
      options: [
        'Write it in a separate Database operation outside the transactional Try scope',
        'Call a logging procedure declared with PRAGMA AUTONOMOUS_TRANSACTION, which commits on its own',
        'Write it after the rollback in the error handler',
        'Put it in the same INSERT as the data',
      ],
      answer: [0, 1, 2],
      explain: 'An autonomous transaction commits only its own work, independent of the caller.',
    },
    {
      type: 'single',
      prompt: 'What should a reject row hold?',
      options: [
        'Only the error text',
        'The run ID, record key or line number, the reason or ORA code and message, the time, and the record or a pointer to it',
        'The full log file',
        'The password of the sender',
      ],
      answer: 1,
      explain: 'With the run ID and key, someone can fix and resend the right records.',
    },
    {
      type: 'single',
      prompt: 'Total 10,000, loaded 9,940, rejected 50. What does the gap of 10 tell you?',
      options: [
        'Nothing',
        'Ten records are not accounted for, such as duplicates that were skipped or a lost block, so the counts must explain them',
        'Oracle rounds counts',
        'The file was smaller',
      ],
      answer: 1,
      explain: 'Make total = loaded + rejected + skipped a rule, and flag runs where it does not hold.',
    },
    {
      type: 'single',
      prompt: 'Job log tables grow by millions of rows a year. What is a sound plan?',
      options: [
        'Never delete',
        'Keep an agreed retention, purge old rows in a scheduled job, and consider partitions by month so old data drops cheaply',
        'Truncate daily',
        'Move them to the staging schema',
      ],
      answer: 1,
      explain: 'Index the run ID and start time. Support usually queries recent runs by type and status.',
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
