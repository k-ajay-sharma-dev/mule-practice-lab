export default {
  id: 'ms-326',
  category: 'mulesoft',
  title: 'maxFailedRecords: When a Batch Job Stops and What Happens to the Rest',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'max-failed-records', 'error-handling', 'circuit-breaker'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'A batch job has no maxFailedRecords setting. The file has 5,000 rows and row 12 fails validation in the first step. What happens?',
      options: [
        'Row 12 is counted as failed and the other 4,999 rows still load',
        'The job goes on loading rows until 100 have failed, then it stops',
        'Every row written so far is rolled back and the job ends as failed',
        'The job stops after the failure, and rows still queued are not processed',
      ],
      answer: 3,
      explain: 'The default is 0, so the job stops after the first failed record. Blocks already running finish, but queued records are not processed. Loading the rest is what -1 does, and there is no default of 100. A batch job does not roll back records that earlier blocks already wrote. Many teams change it on day one. Know why you pick a value.',
    },
    {
      type: 'single',
      prompt: 'A job runs with maxFailedRecords="-1". 30,000 of 100,000 rows fail validation. What do the counts in On Complete show?',
      options: [
        'The job stopped at the first failure, since -1 allows no failures at all',
        'All 100,000 rows processed: 70,000 successful and 30,000 failed',
        'All 100,000 rows successful, since -1 turns off marking records as failed',
        'Only 70,000 rows processed, since failed rows leave the job uncounted',
      ],
      answer: 1,
      explain: '-1 means no limit: the job processes every record however many fail. Failed records are still marked failed and counted. Stopping at the first failure is what the default 0 does. Use -1 when rejects are expected and handled in a failure step.',
    },
    {
      type: 'single',
      prompt: 'The limit is 10, but the job result shows 37 failed records. How can that be?',
      options: [
        'The limit applies per batch step, so each step can add up to 10',
        'Blocks already running when the limit is hit still finish, so more can fail',
        'The limit counts failed blocks, not failed records',
        'Failures in On Complete are added to the failed count',
      ],
      answer: 1,
      explain: 'More records can fail before the job stops. The limit is checked as blocks run in parallel. Treat it as a stop signal, not an exact cap.',
    },
    {
      type: 'single',
      prompt: 'The job stopped at the limit. What happens to records not yet processed?',
      options: [
        'They are processed when the job is started again',
        'They are not processed, and On Complete still runs with the counts',
        'They are marked successful so the counts still add up',
        'They are moved to a dead letter queue that the runtime creates',
      ],
      answer: 1,
      explain: 'The counts show fewer processed than total. Report total minus processed as "not processed", and plan a rerun for them.',
    },
    {
      type: 'multi',
      prompt: 'The database goes down during a load with maxFailedRecords="-1". What goes wrong?',
      options: [
        'Every remaining record fails and goes to the reject table',
        'The job spends time failing thousands of records one by one',
        'The rejects are not data problems, so the business gets a wrong reject report',
        'The job stops at the first failure, so the rest stay queued for a rerun',
        'Failed records are retried in a later block, so they load once the database is back',
        'On Complete is skipped, since the job failed too many records',
      ],
      answer: [0, 1, 2],
      explain: 'With no limit, every remaining record fails one by one and lands in the reject table, and the reject report then blames data that was fine. Stopping at the first failure is what the default limit of 0 does, not -1. A batch job does not retry a failed record in a later block; it stays failed. On Complete still runs, and its result shows the failures. No limit is right for data errors, not for an outage.',
    },
    {
      type: 'single',
      prompt: 'What design handles both bad data and an outage?',
      options: [
        'Use 0, so any failure stops the job and someone looks at it',
        'Allow data errors with a high limit, but treat connectivity errors as fatal',
        'Wrap every record in Until Successful, so it waits until the database is back',
        'Use -1 and delete the reject rows of the run once the outage is over',
      ],
      answer: 1,
      explain: 'On a connectivity error, stop the job, keep the records for a rerun, and alert. Separate error types. A connectivity error should not count as a bad record.',
    },
  ],
  description: `
Quayle Freight loads carrier invoices with a batch job and maxFailedRecords="-1". One night the database restarted for 20 minutes. The job wrote 180,000 records to the reject table, and finance spent a day on a reject report that had no data problems in it.

**Questions**
1. What does maxFailedRecords do, and what are 0 and -1?
2. What happens to records when the limit is reached?
3. Why was -1 a problem here?
4. Design error handling that copes with both bad data and an outage.
`,
  answerTemplate: `## maxFailedRecords

## Reaching the limit

## Why -1 hurt

## A better design
`,
  keyPoints: [
    'The default 0 stops the job after the first failed record.',
    '-1 means no limit.',
    'Blocks in flight finish, so failures can pass the limit.',
    'Unprocessed records are not run. On Complete still runs.',
    'Outage errors are not data errors and should not fill the reject table.',
    'Stop on connectivity errors, reject on data errors, and alert.',
  ],
  solution: `
**1. maxFailedRecords.** It sets how many failed records the job allows before it stops. 0, the default, stops at the first failure. -1 means no limit.

**2. Reaching the limit.** Blocks already running finish, so the failed count can go past the limit. Records still queued are not processed. On Complete runs, and processed is lower than total. Report the gap and plan a rerun.

**3. Why -1 hurt.** During the outage every record failed with a connection error, and the failure step wrote each one as a reject. The reject table mixed real data errors with an outage, and the job ran on for no benefit.

**4. A better design.** Before the job, check the database with a health query. In the steps, let data errors fail the record, and write them to the reject table with an ONLY_FAILURES step. For connectivity errors, use reconnection and a few retries. If they persist, stop the job: set a flag in an object store that the steps check, or use a limit that a burst of failures reaches fast. Mark the run FAILED, keep the file for a rerun and send one alert.
`,
  followUps: [
    {
      q: 'Can you stop a running batch job from inside a step?',
      a: 'Not directly in every version. A common way is a flag that makes later records skip work, plus a limit on failures that ends the job.',
    },
    {
      q: 'How would you rerun only the unprocessed records?',
      a: 'With per record or per block status rows keyed by run ID, start a new job with the keys that have no status.',
    },
    {
      q: 'Should an HTTP 400 from a target count as a data error?',
      a: 'Usually yes, since the request content was refused. A 503 or a timeout is a system error.',
    },
  ],
}
