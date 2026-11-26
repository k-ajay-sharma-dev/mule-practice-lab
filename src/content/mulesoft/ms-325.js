export default {
  id: 'ms-325',
  category: 'mulesoft',
  title: 'Job Log Counts From a Batch Job: Record Variables and the On Complete Result',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'on-complete', 'job-log', 'record-variables', 'oracle'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer sets vars.rejectCount inside a batch step and reads it in On Complete. It is null. Why?',
      options: [
        'On Complete runs on another thread, so it reads it before it is set',
        'Variables set inside a batch step belong to that record, not to On Complete',
        'Variables in a batch job are cleared each time a block is committed',
        'The variable needs a default value set before the Batch Job scope',
      ],
      answer: 1,
      explain: 'Each record carries its own variables through the steps. They are record variables.',
    },
    {
      type: 'multi',
      prompt: 'A load of 10,000 rows ends with 12 failed records. Finance wants an email from On Complete. Which of these can On Complete read from its own payload, the batch job result?',
      options: [
        'The total number of records the job received',
        'The keys of the 12 failed records, to list in the email',
        'The successful and failed record counts',
        'How long the job took, as elapsed time',
        'The record variables of the failed records, such as vars.rejectReason',
      ],
      answer: [0, 2, 3],
      explain: 'The batch job result has counts, elapsed time and step results, not the records. The total, the success and failure counts and the elapsed time are all in it. The keys of failed records are not, so the email cannot list them from the payload. Record variables belong to each record and end with it, so On Complete cannot read a reject reason that way either. Write rejects to a table while you process, and read that table in On Complete.',
    },
    {
      type: 'single',
      prompt: 'How can On Complete know the run ID of the job log row?',
      options: [
        'It cannot, since On Complete sees only the batch job result',
        'Set the job instance ID to the run ID, or store the run ID keyed by the instance ID',
        'Read it from the last record, which carries the run ID as a variable',
        'Use the flow name and start time, which the batch job result carries for each run',
      ],
      answer: 1,
      explain: 'The batch job has a job instance ID setting that can take an expression. Check the docs for your version.',
    },
    {
      type: 'order',
      prompt: 'Put the job log writes of one run in order.',
      items: [
        'Insert the job row with status STARTED and the run ID',
        'Insert a step row per stage, such as reject counts after validation',
        'Write totals from the batch job result in On Complete',
        'Update the job row to SUCCESS, PARTIAL or FAILED',
      ],
      explain: 'Each row is written as the run reaches that point, so a crash leaves a clear trail.',
    },
    {
      type: 'single',
      prompt: 'A row by row fallback rejected 7 rows inside the aggregator, but the job counts them as successful. How do you report true numbers?',
      options: [
        'Raise an error after the fallback, so the aggregator marks only the 7 rows as failed',
        'In On Complete, count the run’s reject rows and subtract them from successful',
        'Fail the whole block whenever one row in it is rejected',
        'Add them up in a record variable and read it in On Complete',
      ],
      answer: 1,
      explain: 'The reject table is the source of truth. It survives restarts, which in memory counters do not. An error from an aggregator marks every record of the block as failed, not only the 7. Failing the whole block throws away the good rows too. Record variables end with each record, so On Complete cannot read them.',
    },
    {
      type: 'single',
      prompt: 'What should the one log line in On Complete contain?',
      options: [
        'The full batch job result as JSON, with each step result',
        'Run ID, job instance ID, table, the counts and elapsed time',
        'Run ID, job instance ID, the counts and the keys of the failed records',
        'Run ID, job instance ID, table and the counts, at DEBUG level to keep production logs small',
      ],
      answer: 1,
      explain: 'The counts are total, loaded, rejected and not processed. Support can then match the log line to the job log row. The full result as JSON is long and hard to search. On Complete has no record keys, only counts, so failed keys must come from the reject table. A job summary is the line support needs in production, so DEBUG hides it.',
    },
  ],
  description: `
Larkfield Grocers loads supplier items with a batch job. A batch aggregator writes blocks into a staging table, with a row by row fallback that sends bad rows to a reject table. The job log table has a row per run and rows per step. Today the job log shows 12,000 loaded, but staging has 11,943 rows.

**Questions**
1. Why did a counter set in a batch step not reach On Complete?
2. What does On Complete know, and what not?
3. How do you link On Complete to the run in the job log?
4. How do you report numbers that match the tables?
`,
  answerTemplate: `## Record variables

## What On Complete knows

## Linking to the run

## True numbers
`,
  keyPoints: [
    'Variables set in a batch step are record variables.',
    'On Complete has counts and timing, not records.',
    'Link the run with the job instance ID or a lookup keyed by it.',
    'Fallback rejects are counted as successful by the job.',
    'Count rejects from the reject table by run ID.',
    'Write each job log row when the run reaches that point.',
  ],
  solution: `
**1. Record variables.** In Mule 4 a variable set inside a batch step travels with the record. It is not shared across records and is gone by On Complete. A shared counter would also be wrong with several threads.

**2. What On Complete knows.** The batch job result: total, loaded, processed, successful and failed records, elapsed time and results per step. It does not have the records or anything the aggregator handled itself.

**3. Linking to the run.** Set the job instance ID from an expression such as the run ID, or store the run ID in an object store keyed by the job instance ID before the job starts. Each reject row and staging row carries the run ID too.

**4. True numbers.** The fallback catches the bulk insert error, so the job counts those records as successful. In On Complete, count the reject rows for the run, subtract them from the successful count, and write loaded, rejected and not processed counts to the job log. Update the job row status and log one summary line.
`,
  followUps: [
    {
      q: 'Why not keep a counter in an object store and increment it per block?',
      a: 'It works, but increments from parallel blocks can collide, and a restart can count a block twice. A COUNT by run ID on the table is always right.',
    },
    {
      q: 'What status do you give a run with rejects?',
      a: 'PARTIAL, with the counts, so a report can list it. FAILED is for runs where nothing loaded or the job stopped.',
    },
    {
      q: 'How do you avoid losing the job log update if On Complete fails?',
      a: 'Keep On Complete short, wrap the writes in a Try with logging, and have a check that finds runs still marked STARTED after a time.',
    },
  ],
}
