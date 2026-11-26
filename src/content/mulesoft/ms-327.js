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
      options: ['Once: all 1,230 records in one group', '2 times: 500, then 730 in the last group', '3 times: 500, 500 and 230', '1,230 times: once for each record'],
      answer: 2,
      explain: 'The last group holds what is left when the step has no more records.',
    },
    {
      type: 'single',
      prompt: 'An aggregator with size="200" gets 1,050 records. Inside it, a Logger logs sizeOf(payload) and payload[0].sku. What do the logs show?',
      options: [
        'An error, since the payload is a stream that cannot be indexed',
        'The value 1 and one SKU each time, since the aggregator runs per record',
        'The value 200 five times and 50 once, each with the first SKU of its group',
        'The value 100 each time, since each group holds one block of records',
      ],
      answer: 2,
      explain: 'In a fixed size aggregator the payload is a list of the records in the group, so random access works and you can log the size and the first key. The last group holds the 50 that are left. A stream that cannot be indexed is what streaming="true" gives. The group size comes from the aggregator, not from the block size.',
    },
    {
      type: 'single',
      prompt: 'A last step must write all 3 million records of a job to one CSV file on a small worker. Which aggregator setup fits?',
      options: [
        'size="3000000", so all records arrive in one list for a single write',
        'size="1000", with a File Write in OVERWRITE mode inside each group',
        'streaming="true", with the records sorted by key before the write',
        'streaming="true", with the payload written in order by a CSV writer',
      ],
      answer: 3,
      explain: 'A streaming aggregator gives all records of the step as one stream, read once and in order. The records are not all held in memory, so it fits one large file. A group of 3 million holds everything in memory. OVERWRITE in each group leaves only the last 1,000 records. You cannot sort, index or count the stream without reading it all.',
    },
    {
      type: 'multi',
      prompt: 'Which of these break or misuse a streaming aggregator?',
      options: [
        'payload[0] to log the first record',
        'sizeOf(payload) before writing',
        'Writing payload to a file with a streaming CSV writer',
        'payload orderBy (r) -> r.key',
        'payload map (r) -> { id: r.key } passed to a bulk insert',
      ],
      answer: [0, 1, 3],
      explain: 'A streaming aggregator gives a stream of records, not a list. Indexing with payload[0] and counting with sizeOf need random access or the whole set. Sorting needs every record before the first one can be written. Writing in order with a streaming writer is what streaming is for. A map that touches each record once also streams, so the bulk insert is fine.',
    },
    {
      type: 'single',
      prompt: 'A job keeps the default block size of 100. For bulk inserts, a developer sets an aggregator to size="1000". What happens?',
      options: [
        'The deploy fails, since the aggregator size must equal the block size',
        'Each insert still gets 100 records, since a group cannot span blocks',
        'It works: each group collects records from several blocks before the insert',
        'It works only with streaming="true", since a fixed group stays in one block',
      ],
      answer: 2,
      explain: 'The aggregator collects records across blocks, so its size does not depend on the block size. A block size of 100 and an aggregator size of 1,000 is a common mix. There is no rule that the two must match, and a fixed size group is not limited to one block.',
    },
    {
      type: 'single',
      prompt: 'What should the log line for each aggregator run contain?',
      options: [
        'The full list of records, so support can replay the insert',
        'Run ID, staging table, group size and the first and last key',
        'Nothing, since the job result already has the step counts',
        'Run ID and group size only, since record keys may expose business data',
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
