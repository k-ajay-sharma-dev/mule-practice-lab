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
      prompt: 'At 07:00 support asks whether the nightly item load ran, how long it took and how many rows it loaded. The CloudHub logs have already rotated. What should the integration have written?',
      options: [
        'A copy of every inbound record with its run ID, so counts can be taken from it',
        'A reject table row for each failed record, with its error and the run time',
        'The Mule log lines of each run in a table, so they outlast the log rotation',
        'A job log row per run with its ID, type, status, start and end time and counts',
      ],
      answer: 3,
      explain: 'A row per run, plus a row per step, answers this with one query and no log reading. A copy of the records gives counts but not status or duration, and it is heavy. Rejects show only what failed. Log lines in a table still need searching and parsing to give a status and counts.',
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
        'Run a COMMIT statement right after the log insert, inside the transactional scope',
      ],
      answer: [0, 1, 2],
      explain: 'An autonomous transaction commits only its own work, independent of the caller. A write outside the transactional scope, or in an error handler after the rollback, is not part of the load. A row written inside the transactional scope is rolled back with the load, wherever it sits in the scope. A COMMIT inside the scope commits the load rows so far too, so the load can no longer roll back as one unit.',
    },
    {
      type: 'single',
      prompt: 'The business has fixed the 50 rejected rows of run 4711 and wants only those resent. Each reject row holds the ORA error text and the time. What is missing?',
      options: [
        'The Mule correlation ID of the flow, so the log lines of each failure can be found',
        'The full input file of the run, stored with each reject row for reference',
        'The run ID and the record key or line number, so the right records can be found',
        'The stack trace of each error, so developers can see where the load failed',
      ],
      answer: 2,
      explain: 'With the run ID and key, someone can pick the right records, fix them and resend them. A correlation ID leads to log lines, which may have rotated, and not to the record. A copy of the whole file per reject wastes space and still does not say which line failed. A stack trace helps a developer, not a resend.',
    },
    {
      type: 'single',
      prompt: 'Total 10,000, loaded 9,940, rejected 50. What does the gap of 10 tell you?',
      options: [
        'The ten are the header, trailer and blank lines of the file, so the run is complete',
        'Ten records have no recorded outcome, such as skipped duplicates, until a count covers them',
        'The ten records are still in flight in the batch queues, and the next run will load them',
        'Oracle counts rows per block of the bulk insert, so small gaps between the totals are expected',
      ],
      answer: 1,
      explain: 'Make total = loaded + rejected + skipped a rule, and flag runs where it does not hold. Header and trailer lines are a guess until a count says so, and they should not be in the record total anyway. Batch queues do not carry records into the next run. Oracle reports rows inserted, not rounded per block.',
    },
    {
      type: 'single',
      prompt: 'Job log tables grow by millions of rows a year. What is a sound plan?',
      options: [
        'Keep every row, and add an index on run ID and start time so queries stay fast',
        'Keep an agreed retention, purge old rows on a schedule, and consider monthly partitions',
        'Copy each run to the data warehouse the next day, then delete it from the job log',
        'Move old rows into the staging schema so they sit next to the loaded data',
      ],
      answer: 1,
      explain: 'Monthly partitions let old data drop cheaply. Index the run ID and start time. Indexes keep queries fast, but the table and its backups still grow without end. Deleting after one day leaves support without the recent runs it looks at most. Staging is truncated and reloaded, so it is the wrong home for history.',
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
