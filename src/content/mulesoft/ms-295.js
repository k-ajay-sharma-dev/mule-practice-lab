export default {
  id: 'ms-295',
  category: 'mulesoft',
  title: 'Bulk Inserts Into SQL Server From a Batch Job: Aggregator Size, Failed Blocks and Row by Row Retry',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'planning-platform', 'bulk-insert', 'batch', 'aggregator', 'rejects'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A DBA traces a Mule bulk insert of 500 plan rows and expects to see a T-SQL BULK INSERT. What does the trace show instead?',
      options: [
        'A BULK INSERT command that reads a file Mule first uploaded to the server',
        'A single INSERT with 500 rows in its VALUES list, built by the connector',
        'One parameterized INSERT, run as a JDBC batch with 500 sets of parameters',
        'A bcp session that streams the 500 rows to the server in native format',
      ],
      answer: 2,
      explain: 'The bulk insert operation takes a list of maps, one per row, and sends one parameterized INSERT as a JDBC batch. It is not the T-SQL BULK INSERT command, which reads a file on the server, and it does not use bcp. The connector does not build a long VALUES list, which would not be parameterized per row.',
    },
    {
      type: 'single',
      prompt: 'Where does a bulk insert belong in a Mule batch job?',
      options: [
        'In the On Complete phase, after the last batch step has processed all records',
        'In a batch aggregator inside a batch step, so rows go in blocks',
        'In a batch step, once for each record that reaches it',
        'Before the batch job, on the whole payload at once',
      ],
      answer: 1,
      explain: 'The aggregator collects records up to its size and hands them over as a list, which suits a bulk insert.',
    },
    {
      type: 'single',
      prompt: 'One row in a block of 500 breaks a NOT NULL rule. What happens with a plain bulk insert in a transaction?',
      options: [
        'Only the bad row fails, and the other 499 are inserted',
        'The whole block fails, and the 499 good rows are not inserted',
        'The rows before the bad one are kept, and the rest are skipped',
        'The bad row is inserted with a default value for the column',
      ],
      answer: 1,
      explain: 'The block succeeds or fails together. You need a plan to find and keep the good rows.',
    },
    {
      type: 'multi',
      prompt: 'How can you keep good rows when a block fails?',
      options: [
        'Validate rows in DataWeave before the insert and send bad ones to a reject table with reasons',
        'On failure, retry the block row by row to isolate the bad rows',
        'Load into a staging table with loose types, then move good rows with SQL',
        'Raise the aggregator size, so fewer blocks can fail',
        'Wrap the bulk insert in a transaction, so the failed block rolls back cleanly',
        'Set max failed records to -1, so the job goes on after the failure',
      ],
      answer: [0, 1, 2],
      explain: 'Checks before the insert, a row by row fallback, or loose staging all keep good rows out of the failure. A larger block makes the problem worse, since one bad row takes more good rows with it. A transaction rolls back the good rows of the block too. Max failed records of -1 keeps the job running, but the rows of the failed block are still not loaded.',
    },
    {
      type: 'single',
      prompt: 'How would you choose the aggregator size?',
      options: [
        'Set it to 1, so a failed insert affects only one row',
        'Test with real volumes, from a few hundred to a few thousand rows',
        'Set it to the batch block size, so each block is one insert',
        'Use a streaming aggregator, so the whole job goes in as a single insert',
      ],
      answer: 1,
      explain: 'Watch duration, memory and log growth while testing. Too small means many round trips. Too large means big transactions, more memory and costly failures.',
    },
    {
      type: 'single',
      prompt: 'Where do you log loaded, failed and total counts for the job?',
      options: [
        'In each batch step, with a Logger per record',
        'In On Complete, from the batch job result, into the job log table',
        'In the flow after the Batch Job scope, from the result payload it returns',
        'In the aggregator, by adding up the size of each block',
      ],
      answer: 1,
      explain: 'The batch job result has totals for processed, successful and failed records. Store them with the run id.',
    },
  ],
  description: `
Marrow & Pine Home loads a daily inventory file of 1.5 million rows into a SQL Server staging table before it goes to the planning platform. The Mule batch job uses a bulk insert in an aggregator of 1,000 rows. One night a block failed on a single bad date, and 999 good rows were lost with it. The job still reported success.

**Questions**
1. How does bulk insert work in the Database connector?
2. Why were good rows lost?
3. How would you keep good rows and record the bad ones?
4. How do you report the run?
`,
  answerTemplate: `## Bulk insert in Mule

## Why good rows were lost

## Keeping good rows

## Reporting
`,
  keyPoints: [
    'Bulk insert sends one parameterized INSERT as a JDBC batch.',
    'Use it in a batch aggregator to write blocks.',
    'A failed block loses all its rows.',
    'Validate first and send rejects to a reject table with reasons.',
    'On a block failure, retry row by row to isolate bad rows.',
    'Log loaded, failed and total counts in On Complete.',
  ],
  solution: `
**1. Bulk insert in Mule.** The bulk insert operation takes a parameterized INSERT and a list of maps. The driver sends the rows as one JDBC batch. In a batch job, a batch aggregator collects records into blocks and the bulk insert runs once per block.

**2. Why good rows were lost.** A block is written as a unit. One bad date failed the whole batch call, so all 1,000 rows were rejected. The batch step marked them failed, but nothing checked the failure counts, so the job looked successful.

**3. Keeping good rows.** Check rows in DataWeave before the aggregator: dates, numbers, required fields and known codes. Send bad rows to a reject table with the reason and the source line. If a block still fails, catch the error and retry that block row by row, so only the bad rows fail and are recorded. A third option is a staging table with text columns, followed by a set based SQL step that moves good rows and flags bad ones.

**4. Reporting.** In On Complete, read loaded, failed and total counts from the batch job result and write them to the job log with the run id. Fail the run, or hold the send to the planning platform, when failures pass an agreed limit.
`,
  followUps: [
    {
      q: 'Why is row by row retry only a fallback?',
      a: 'It is slow. It should run only for the rare block that fails, after the checks catch most bad rows.',
    },
    {
      q: 'What about the SQL Server parameter limit?',
      a: 'A single statement can take about 2,100 parameters. A JDBC batch sends the same statement many times, so the limit applies per row, not per block. A multi row VALUES statement built by hand does hit it.',
    },
    {
      q: 'Would a table valued parameter be faster?',
      a: 'It can be, since the whole set goes in one call to a procedure. Check that your connector and driver versions support it before you design around it.',
    },
  ],
}
