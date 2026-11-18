export default {
  id: 'ms-327',
  category: 'mulesoft',
  title: 'Batch Aggregator: Fixed Size or Streaming, and Logging Each Block',
  level: 'ADVANCED',
  tags: ['myproject', 'batch', 'batch-aggregator', 'streaming', 'bulk-insert', 'logging'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'An aggregator has size 500. A step receives 1,230 records. How many times does the aggregator run?',
      options: ['Once', '2 times', '3 times: 500, 500 and 230', '1,230 times'],
      answer: 2,
      explain: 'The last group holds what is left when the step has no more records.',
    },
    {
      type: 'single',
      prompt: 'What is the payload inside a fixed size aggregator?',
      options: [
        'One record',
        'A list of the records in the group, which you can index and count',
        'A stream you can read once',
        'The job result',
      ],
      answer: 1,
      explain: 'Random access works, so you can log the size and the first key.',
    },
    {
      type: 'single',
      prompt: 'What does streaming="true" on an aggregator give you?',
      options: [
        'Faster bulk inserts',
        'All records of the step as one stream, read once in order, without holding them all in memory',
        'Records in random order',
        'A list of fixed size',
      ],
      answer: 1,
      explain: 'Use it to write all records to one file. You cannot index the stream or count it without reading it.',
    },
    {
      type: 'multi',
      prompt: 'Which of these break or misuse a streaming aggregator?',
      options: [
        'payload[0] to log the first record',
        'sizeOf(payload) before writing',
        'Writing payload to a file with a streaming CSV writer',
        'payload orderBy (r) -> r.key',
      ],
      answer: [0, 1, 3],
      explain: 'Indexing, counting and sorting need the whole set or random access. Writing in order is what streaming is for.',
    },
    {
      type: 'single',
      prompt: 'Is the aggregator size tied to the block size of the job?',
      options: [
        'Yes, it must be equal',
        'No. The aggregator collects across blocks, so its size can differ from the block size',
        'It must be smaller',
        'It must be a multiple of 100',
      ],
      answer: 1,
      explain: 'A block size of 100 and an aggregator size of 1,000 is a common mix.',
    },
    {
      type: 'single',
      prompt: 'What should the log line for each aggregator run contain?',
      options: [
        'The full list of records',
        'Run ID, staging table, group size and the first and last key',
        'Nothing, to save time',
        'Only the word "insert"',
      ],
      answer: 1,
      explain: 'With the table and keys, support can tie an ORA error to the rows.',
    },
  ],
  description: `
Marrow & Pine Home loads several message types into Oracle staging tables with one shared batch flow. A batch aggregator does a bulk insert, with the size from a property. Support cannot tell from the logs which table a failed insert was for. A second team wants to reuse the flow to write all records to one CSV file for an archive.

**Questions**
1. How does a fixed size aggregator group records?
2. What is a streaming aggregator for, and what can you not do with it?
3. How do the aggregator size and the block size relate?
4. What do you log per aggregator run?
`,
  answerTemplate: `## Fixed size

## Streaming

## Aggregator size and block size

## Logging
`,
  keyPoints: [
    'A fixed size aggregator runs per group of N records, plus one for the rest.',
    'Its payload is a list with random access.',
    'A streaming aggregator gives all records as one stream, read once.',
    'No indexing, counting or sorting on a streaming aggregator payload.',
    'Aggregator size and block size are separate settings.',
    'Log the run ID, table, group size and key range per run.',
  ],
  solution: `
**1. Fixed size.** The aggregator collects records that pass its step. When it has N, it runs its processors with a list of N records. At the end it runs once more with the rest. The list allows indexing and counting, so a bulk insert and a log line are both possible.

**2. Streaming.** With \`streaming="true"\` the aggregator gets every record of the step as one stream, without keeping them all in memory. It fits writing one archive file. You cannot index, count or sort it without reading it all, which defeats the point.

**3. Sizes.** The block size sets how records are read from the queue. The aggregator size sets how many records reach the bulk insert. They are separate. Keep both in properties.

**4. Logging.** Pass the staging table name to the shared flow as a variable. Per run, log the run ID, table, group size and the first and last key. Do not log the rows.
`,
  followUps: [
    {
      q: 'What happens to the records of a group when the aggregator fails?',
      a: 'They are marked failed together, unless you catch the error and handle rows one by one inside the aggregator.',
    },
    {
      q: 'Can an aggregator have a size larger than the number of records?',
      a: 'Yes. It then runs once at the end with all records, which may be more memory than you want.',
    },
    {
      q: 'Why pass the table name instead of reading it from the payload?',
      a: 'The shared flow serves many message types. A variable set by the caller is explicit and works for an empty group too.',
    },
  ],
}
