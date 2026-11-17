export default {
  id: 'ms-219',
  category: 'mulesoft',
  title: 'Batch Aggregator, Record Variables and the On Complete Report',
  level: 'ADVANCED',
  tags: ['batch', 'batch-aggregator', 'on-complete', 'bulk', 'performance', 'error-handling', 'agriculture'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A batch step holds a Batch Aggregator with `size="200"` around a Database Bulk Insert. What is the payload inside the aggregator?',
      options: [
        'One record at a time, as in the rest of the step',
        'The whole input file, before it was split into records',
        'A list of up to 200 record payloads',
        'The result of the previous batch step',
      ],
      answer: 2,
      explain: 'The aggregator collects records and runs its steps on a group of them. A bulk operation then sends one call for many records.',
    },
    {
      type: 'single',
      prompt: 'The job has 1,050 records and the aggregator size is 200. What happens to the last 50 records?',
      options: [
        'They are processed as a smaller group when no more records come',
        'They wait for the next job to fill the group to 200',
        'They are marked as failed because the group is not full',
        'They are skipped, and On Complete reports them as loaded only',
      ],
      answer: 0,
      explain: 'The aggregator does not wait for ever. When the records run out, it processes the group it has, even if it is smaller than the size.',
    },
    {
      type: 'single',
      prompt: 'The bulk insert inside the aggregator fails. What happens to the records in that group?',
      options: [
        'Only the record that broke the insert is marked as failed',
        'The aggregator retries each record on its own',
        'Nothing, because aggregator errors are only logged',
        'All the records in the group are marked as failed',
      ],
      answer: 3,
      explain: 'The aggregator handles the group as one unit, so an error marks each of its records as failed. Insert the failed records again one by one in a later step if you need to find the bad row.',
    },
    {
      type: 'single',
      prompt: 'When should you use `streaming="true"` instead of a size?',
      options: [
        'When you need random access to the records, such as `payload[10]`',
        'When you want every record of the job in one group and can read them in one pass',
        'When records must be processed one at a time',
        'When the job must stop after the first failed record',
      ],
      answer: 1,
      explain: 'A streaming aggregator gives all the records of the job as one stream, which suits writing one large file. It can be read only once, in order, so random access is not possible.',
    },
    {
      type: 'single',
      prompt: 'A step sets a variable `supplierCode` for each record. A later step reads `vars.supplierCode`. What does it see?',
      options: [
        'The value from the last record that set it, for every record',
        'Nothing, because variables do not cross batch steps',
        'The value that this same record set in the earlier step',
        'An error, because variables cannot be set in a batch step',
      ],
      answer: 2,
      explain: 'A variable set inside a batch step belongs to that record and goes with it to the later steps. Each record keeps its own value.',
    },
    {
      type: 'multi',
      prompt: 'Which values can the On Complete phase read from its payload? Choose all that apply.',
      options: ['totalRecords', 'successfulRecords', 'failedRecords', 'The payload of each record'],
      answer: [0, 1, 2],
      explain: 'On Complete gets a summary of the job, with counts such as total, successful and failed records and the time taken. The records themselves are no longer available.',
    },
  ],
  description: `
Oakvale Growers is a cooperative of 900 farms. Each night a Mule app reads a CSV of the day's milk and grain deliveries, around 60,000 rows, checks each row, enriches it with the supplier's code, and writes it to the cooperative's database.

The first version inserted one row at a time. It took 70 minutes, and the database team complained about the number of calls. When it failed, nobody knew how many rows had been written.

**Questions**
1. How does a Batch Aggregator help here, and how would you size it?
2. What happens to records when the aggregated insert fails, and how do you find the bad row?
3. How do record variables behave across steps?
4. What would you report in On Complete, and to whom?
`,
  answerTemplate: `## The aggregator

## When a group fails

## Record variables

## On Complete
`,
  keyPoints: [
    'A Batch Aggregator collects records and runs its steps on a list of them, which suits bulk operations.',
    'A fixed size gives groups of that many records. The last group can be smaller.',
    'streaming="true" gives every record of the job as one stream that can be read once, in order.',
    'If the aggregator fails, every record in the group is marked as failed.',
    'A variable set in a batch step belongs to that record and goes with it to later steps.',
    'On Complete gets a job summary with counts, not the records. Use it to report and alert.',
  ],
  solution: `
**1. The aggregator.** Put the database write in a Batch Aggregator inside the last step and use Bulk Insert. 60,000 rows with a size of 500 is 120 database calls instead of 60,000. Pick the size with the database team: large enough to save calls, small enough that one failed group does not mark too many records as failed and the bulk call fits the database limits.

**2. When a group fails.** The whole group is marked as failed. Add a step after it with \`acceptPolicy="ONLY_FAILURES"\` that writes the failed records one at a time. The good rows go in, and the bad row fails alone with its own error. Set \`maxFailedRecords\` so a few bad rows do not stop the job, but a broken file does.

**3. Record variables.**
| Where set | Where seen |
|---|---|
| Before the batch job | Every record starts with a copy |
| In a step, for one record | Later steps for that record only |

The supplier code set in the enrich step is therefore there for the same record in the write step.

**4. On Complete.** Its payload has counts such as \`totalRecords\`, \`successfulRecords\` and \`failedRecords\` and the time taken. Log them with the job instance id, and send an alert to the operations team when \`failedRecords\` is above zero. The failed rows themselves should be written to an error table or file during the steps, because On Complete cannot see them.
`,
  followUps: [
    {
      q: 'Does the flow wait for the batch job to finish?',
      a: 'No. The batch job runs in the background. The flow carries on at once with details of the job instance as its payload. Anything that must happen after the job belongs in On Complete.',
    },
    {
      q: 'Can you change the records inside the aggregator?',
      a: 'Treat the aggregator as the place to send groups to another system. Do the changes to each record in earlier steps, where each record is handled on its own and failures are tracked per record.',
    },
    {
      q: 'Where are the records kept while the job runs?',
      a: 'The runtime keeps the queued records in persistent storage on disk, not only in memory. That is why a large job needs free disk space where it runs, and why the size of each record matters as much as the count.',
    },
  ],
}
