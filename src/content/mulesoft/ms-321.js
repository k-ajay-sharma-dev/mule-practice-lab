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
      prompt: 'What must the payload be when it reaches a Batch Job scope?',
      options: [
        'A single JSON object, which the job splits into records by its fields',
        'Something the job can split into records, such as a list or an iterable stream',
        'A file path, which the job opens and reads one line at a time',
        'An XML document, since batch reads records only from XML',
      ],
      answer: 1,
      explain: 'Each element becomes one record. A CSV read as a stream of rows works well.',
    },
    {
      type: 'single',
      prompt: 'Where do records wait between load and process?',
      options: [
        'In flow variables, which the runtime copies to each batch step',
        'In batch queues that the runtime keeps on disk, so a restart can carry on',
        'In the HTTP listener buffer until the response is sent',
        'In a table the batch job creates in the app’s own datasource',
      ],
      answer: 1,
      explain: 'This is why batch jobs survive a restart of the runtime. It also means records are written to disk, which costs some speed.',
    },
    {
      type: 'single',
      prompt: 'What is the payload in the On Complete phase?',
      options: [
        'The last record that went through the final batch step',
        'All the records in a list, as they were after the last step',
        'The batch job result, with counts such as total, successful and failed',
        'The original payload that was given to the Batch Job scope',
      ],
      answer: 2,
      explain: 'On Complete reports on the job. The records are gone by then.',
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
      ],
      answer: [0, 1, 3],
      explain: 'Only the blocks in progress are in memory. The rest wait in the queues.',
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
