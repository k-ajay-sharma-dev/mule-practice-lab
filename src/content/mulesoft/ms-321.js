export default {
  id: 'ms-321',
  category: 'mulesoft',
  title: 'The Three Phases of a Batch Job: Load and Dispatch, Process and On Complete',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'batch-job', 'phases', 'on-complete', 'persistent-queues'],
  estMinutes: 12,
  quiz: [
    {
      type: 'order',
      prompt: 'Put the phases of a Mule batch job in the order they run.',
      items: [
        'Load and dispatch: the input is split into records and the records are queued',
        'Process: each record moves through the batch steps',
        'On Complete: the job result with the counts is available',
      ],
      explain: 'Load and dispatch is implicit. You configure the steps and On Complete.',
    },
    {
      type: 'single',
      prompt: 'A Batch Job must load a CSV of 3 million rows on a small worker. The flow before it maps the whole file to one JSON array with DataWeave and runs out of memory. What should reach the Batch Job instead?',
      options: [
        'The CSV read as a stream of rows, which the job turns into records as it reads',
        'The file path only, so that each batch step opens the file and reads its own rows',
        'The rows mapped to Java objects first, since the job cannot split CSV content',
        'The same JSON array written to a temp file, so the job reads it back from disk',
      ],
      answer: 0,
      explain: 'The job splits any list or iterable into records, and each element becomes one record. A CSV read as a stream of rows works well, so the whole file never sits in memory as one value. A path is only text, and the job does not open files. The job splits CSV rows as it does other iterables. A temp file still needs the full array built in memory first.',
    },
    {
      type: 'single',
      prompt: 'A batch job has a block size of 100, and each record is a 5 MB document. The worker runs out of memory while several blocks are processed in parallel. Why?',
      options: [
        'The load phase keeps every record in heap memory until the process phase ends',
        'The batch queues live in heap memory, so all waiting records count against it',
        'On Complete keeps a copy of each record in memory to build the job result',
        'Each running block holds 100 records in memory, so a few threads hold gigabytes',
      ],
      answer: 3,
      explain: 'A thread takes a whole block, so with 5 MB records each block is about 500 MB, and several blocks at once fill the heap. Lower the block size or the concurrency for large records. Records that wait are kept in the batch queues on disk, not in heap, and that is true during the load phase too. On Complete gets counts, not records.',
    },
    {
      type: 'single',
      prompt: 'In On Complete a developer writes payload map ((r) -> r.itemId) to list the failed item IDs for the report mail. What does the expression work on?',
      options: [
        'The records that failed in any step, which On Complete gets as a list',
        'The batch job result, with counts such as total, successful and failed records',
        'All the records in a list, as they were after the last batch step',
        'The original payload that was given to the Batch Job scope at the start',
      ],
      answer: 1,
      explain: 'On Complete reports on the job, and its payload is the batch job result with counts, not records. The records are gone by then. To list failed IDs, collect them during the job, for example in a step that accepts only failed records and writes them to a table.',
    },
    {
      type: 'single',
      prompt: 'A flow runs a Batch Job and then a Logger. When does the Logger run?',
      options: [
        'After all records are processed, since the scope waits for the end',
        'Right after the records are loaded and queued, while processing goes on',
        'Never, since a Batch Job scope must be the last processor in a flow',
        'Only when the job fails, since On Complete replaces it on success',
      ],
      answer: 1,
      explain: 'The processing goes on in the background. The job runs on its own threads. Put work that needs the final result in On Complete.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about records in the process phase are true?',
      options: [
        'A record goes through the steps in order',
        'By default, a record that fails in a step skips the later steps',
        'All records sit in memory at once',
        'Records are handled in blocks, and blocks run on several threads',
        'Records leave the last step in the same order they were read',
        'A flow variable set while one record is processed is seen by the next record',
      ],
      answer: [0, 1, 3],
      explain: 'Each record moves through the steps in order, a failed record skips later steps under the default accept policy, and blocks run in parallel on several threads. Only the blocks in progress are in memory. The rest wait in the queues. Because blocks run in parallel, the order across records is not kept. Variables in a batch step belong to each record, so one record never sees the variables of another.',
    },
  ],
  description: `
Brindle Outdoor loads a nightly stock file of about 200,000 rows into a database. A new developer asks how the batch job works, why the flow log says "done" after two seconds, and where the final counts come from.

**Questions**
1. What are the three phases and what happens in each?
2. Why does the flow continue before the records are processed?
3. Where are the records while they wait?
4. Where do you read the final counts?
`,
  answerTemplate: `## Phases

## The flow continues

## Where records wait

## Final counts
`,
  keyPoints: [
    'Load and dispatch splits the input into records and queues them.',
    'Process runs each record through the steps, in blocks on several threads.',
    'On Complete gets the job result with the counts.',
    'The calling flow continues once records are queued.',
    'Batch queues are kept on disk by default, so a restart can resume.',
    'A failed record skips later steps unless a step accepts failures.',
  ],
  solution: `
**1. Phases.** Load and dispatch splits the payload into records and puts them in batch queues. Process moves each record through the batch steps in order. On Complete runs once at the end with the batch job result.

**2. The flow continues.** The batch job runs on its own threads. The flow that started it goes on as soon as the records are queued. That is why the log said "done" early. Anything that needs the final result belongs in On Complete.

**3. Where records wait.** In batch queues that the runtime stores on disk by default. Only the blocks being processed are in memory. After a restart, the job can continue with the records still queued.

**4. Final counts.** In On Complete, the payload holds the totals, such as total, successful and failed records and the elapsed time. Write them to a job log table and one summary log line.
`,
  followUps: [
    {
      q: 'Can you run a batch job synchronously?',
      a: 'Not as such. If a caller must wait, have On Complete write the result somewhere, such as a status table, and let the caller poll it.',
    },
    {
      q: 'Does the batch job keep the original order of records?',
      a: 'Records within a block keep their order, but blocks run in parallel. Do not rely on the global order unless you configure ordered processing.',
    },
    {
      q: 'What happens to records already queued if you undeploy the app?',
      a: 'They stay in the queues on disk and continue when the same app starts again on that worker. A new deployment on a new worker may lose them.',
    },
  ],
}
