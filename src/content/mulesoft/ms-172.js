export default {
  id: 'ms-172',
  category: 'mulesoft',
  title: 'Sizing Memory and Disk for Batch and Streaming: Block Size, Max Concurrency, File-Store Buffers and Batch History',
  level: 'ADVANCED',
  tags: ['deployment', 'memory', 'performance', 'batch', 'streaming', 'sizing', 'on-prem'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      prompt: 'A batch job on a 4-core server moves 3 MB images. With the defaults, what is a reasonable first estimate of the record data held in working memory at full concurrency?',
      options: [
        'About 2.4 GB: 100 records per block x 3 MB x 8 concurrent blocks (twice the 4 cores)',
        'About 300 MB, because only one block is loaded at a time',
        'About 3 MB, because records stream one at a time',
        'It needs no memory, because the queue is on disk',
      ],
      answer: 0,
      explain: 'Blocks of up to 100 records move from persistent storage into RAM, and default concurrency is twice the cores. This is a planning estimate only. The docs advise a lower block size for this kind of payload, and comparative tests before production.',
    },
    {
      type: 'single',
      prompt: 'A job has only 90 records with heavy processing per record. What happens with the default block size?',
      options: [
        'Processing is sequential, because fewer than 101 records form a single block',
        'Each record gets its own thread',
        'The job fails because the block is not full',
        'Mule waits for 10 more records',
      ],
      answer: 0,
      explain: 'The docs state this case. With 200 records only two blocks can run in parallel. For small jobs with heavy records, a lower block size spreads the work.',
    },
    {
      type: 'single',
      prompt: 'Why does the disk under a batch job matter as much as the heap?',
      options: [
        'During the input phase Mule creates an in-disk queue of the records, and it is constantly read and written, so a 1 million record, 3-step job does at least three million I/O operations',
        'The batch history is the only thing written to disk',
        'Records are written to disk only when a step fails',
        'Disk is used only with the Batch Aggregator',
      ],
      answer: 0,
      explain: 'Batch Job Performance Tuning describes heavy I/O use. Disk characteristics and workload size play a key role in performance.',
    },
    {
      type: 'single',
      prompt: 'An app on Runtime Fabric has 0.5 vCPU. Which statement about the default batch `maxConcurrency` is correct?',
      options: [
        'It defaults to twice the cores that the JVM detects, and on fractional core deployments the JVM detects a non-fractional number, so the default can be higher than the allocation suggests',
        'It defaults to 1 on fractional cores',
        'It is calculated from the 0.5 vCPU and rounds down to 1',
        'It is fixed at 16',
      ],
      answer: 0,
      explain: 'The docs call this out for CloudHub and Runtime Fabric. Set `maxConcurrency` from a property and test it when the allocation is small.',
    },
    {
      type: 'match',
      prompt: 'Match each streaming strategy to its documented default and overflow behaviour.',
      pairs: [
        ['Repeatable file-store stream (Mule EE default)', '512 KB in memory, then a temporary file on disk'],
        ['Repeatable in-memory stream', 'Starts at 512 KB, grows by 512 KB, and the app fails above the maximum'],
        ['Repeatable file-store iterable', '500 objects in memory, then serialized to disk'],
        ['Non-repeatable stream', 'Can be read only once'],
      ],
      explain: 'Byte streams are sized in bytes; streamed objects are sized by instance count, so you must estimate how much memory each instance takes.',
    },
    {
      type: 'single',
      prompt: 'An API returns 200 KB files under high concurrency. Someone sets `inMemorySize` on `repeatable-file-store-stream` to 50 MB "so nothing touches disk". What is the trade-off?',
      options: [
        'Fewer disk writes, but a larger buffer needs more memory and limits the number of concurrent requests the app can process',
        'There is no cost, because the buffer is only used when needed',
        'The stream becomes non-repeatable',
        'File-store streaming stops being available',
      ],
      answer: 0,
      explain: 'A buffer is memory taken by each in-flight stream. The docs say the default 512 KB does not significantly impact performance in most scenarios, so change it only after testing.',
    },
    {
      type: 'single',
      prompt: 'A frequently triggered batch app starts failing with `No space left on device`. Which setting does the docs page point to?',
      options: [
        'A Batch Job History configuration, to shorten how long instance history stays in a temporary Mule directory (default 7 days)',
        '`blockSize`',
        '`schedulingStrategy`',
        '`wrapper.java.maxmemory`',
      ],
      answer: 0,
      explain: 'History persists for 7 days by default and a monitoring process removes it when that period expires. The error can occur if the frequency or number of records is too high for the disk.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about moving a large batch app to Java 17 are documented?',
      options: [
        'Heap usage can remain at a higher baseline or not fall immediately after load, and this is expected',
        'Large batch apps and apps at the limit of CPU and memory need performance testing and monitoring',
        'On Runtime Fabric, allocate at least 1400 MB of memory for 0.50 vCPU replica sizes',
        'A higher heap baseline after the upgrade always proves a memory leak',
      ],
      answer: [0, 1, 2],
      explain: 'Java 17 manages memory differently from Java 8, so old heap patterns are not a valid baseline. Read the Java Support page before setting alerts.',
    },
  ],
  description: `
A retailer is sizing two workloads for a **new on-premises server with 4 cores and 16 GB of RAM**, and one on Runtime Fabric:

- **Catalogue load:** 5 million small records (about 1 KB each) in one nightly batch job with three steps, loading a database through a Batch Aggregator.
- **Image sync:** 40,000 product images of about 3 MB each in a batch job, four times a day.
- **Price API:** a Runtime Fabric app with 0.5 vCPU that reads 200 KB files for many concurrent callers.

In the test environment the team saw:
- Heap exhaustion in the image job after increasing nothing but the record size.
- Slow catalogue loads on a shared network disk.
- \`No space left on device\` after a week of running the image job.
- Nothing wrong at low volume, then memory pressure at high concurrency in the price API, after a developer raised the stream buffer.

**Questions**
1. How do block size and concurrency drive working memory? Estimate the image job.
2. How would you tune each batch job, and why does disk matter?
3. Which streaming strategy and buffer suit the price API?
4. How do you size for Runtime Fabric, given fractional cores?
5. What explains the disk error, and how do you stop it?
`,
  answerTemplate: `## Working memory in a batch job

## Tuning each job

## Streaming for the API

## Fractional cores

## Disk errors
`,
  keyPoints: [
    'Records go to a persistent queue first. Mule then moves blocks of up to 100 records from storage into RAM, one block per thread.',
    'The default `maxConcurrency` for a batch job is twice the cores the JVM detects. Flow and Async scopes set no limit by default.',
    'On fractional core deployments the JVM detects a non-fractional number of cores.',
    'Fewer than 101 records means sequential processing at the default block size. Heavy records need smaller blocks; tiny records can use larger ones.',
    'The in-disk queue causes heavy I/O: 1 million records and 3 steps means at least 3 million I/O operations.',
    'A Batch Aggregator reduces network round trips, and the logic must accept fewer records than its size.',
    'File-store stream (EE default): 512 KB in memory, then a temporary file. In-memory stream: fails above its maximum.',
    'Streamed objects are buffered by instance count: 500 objects by default.',
    'Batch history lasts 7 days by default. A history configuration addresses `No space left on device`.',
    'Scheduling: `ORDERED_SEQUENTIAL` is the default; `ROUND_ROBIN` shares threads between instances in flight.',
    'Any block size or buffer change needs comparative tests. Java 17 heap patterns differ from Java 8.',
  ],
  solution: `
**1. Working memory.** A batch job does not map one request to one thread. Records are first stored in a persistent queue. Mule then schedules them in blocks of up to 100 records per thread and moves each block into RAM. A rough estimate of record data in memory is therefore:

\`\`\`
blockSize x average record size x concurrent blocks
100       x 3 MB                x 8 (2 x 4 cores)   = about 2.4 GB
\`\`\`

This is a planning figure, not a documented formula: it ignores what the steps themselves allocate. It explains why the larger records exhausted the heap. The docs use the same 3 MB image example and recommend a lower block size.

**2. Tuning.**
- *Image sync:* lower \`blockSize\`, for example 10 to 20, and set \`maxConcurrency\` from a property. Test several values. Do not hold whole images in variables between steps.
- *Catalogue load:* with 5 million small records, the docs suggest that larger blocks such as 500 improve job time without hurting memory. Use a Batch Aggregator to write in bulk, sized for what the database operation allows, and handle a final group that is smaller than the size.
- *Disk:* the input phase builds an in-disk queue that is read and written constantly, so a shared network disk is a poor location. Use fast local storage for the Mule working directory and measure \`await\` and \`%util\` with \`sar -d\`.
- *Instances:* if the job can be triggered repeatedly, keep \`ORDERED_SEQUENTIAL\` unless you have tested \`ROUND_ROBIN\`.

**3. Price API.** Keep the default file-store stream with its 512 KB buffer: a 200 KB file fits in memory without a temporary file. Raising \`inMemorySize\` to tens of megabytes reduces disk writes only for files that are bigger than the buffer, and a larger buffer limits the concurrent requests the app can process. If the flow reads the file only once and speed really matters, \`non-repeatable-stream\` is possible, but check that nothing else in the flow reads it: Cache, some transformations and For Each on a JSON array can consume the stream.

**4. Fractional cores.** The batch default relies on the cores that the JVM detects, and on fractional deployments that is a whole number. A replica with 0.5 vCPU can therefore start more concurrent blocks than its CPU share suggests. Set \`maxConcurrency\` explicitly and test. For Java 17 the docs state at least 1400 MB for 0.50 vCPU replica sizes on Runtime Fabric.

**5. Disk errors.** Batch instance history persists for 7 days in a temporary Mule directory. Four daily runs of 40,000 records can exceed the free space. Add a \`batch:history\` configuration to shorten it, size the disk for the job's frequency and record count, and alert on disk use. Also remember streaming: file-store streams write temporary files under load.
`,
  followUps: [
    {
      q: 'Is it safe to read a stream late in a flow?',
      a: 'It works, but unconsumed streams keep file handles, cursors and connections open until they are fully consumed or the event completes. Consume or transform them promptly, or you risk connection pool exhaustion or `OutOfMemoryError`.',
    },
    {
      q: 'What should you do after an OutOfMemoryError in such a job?',
      a: 'Mule raises `MULE:FATAL`, which On-Error components cannot handle. The docs say the only safe recovery is to restart the Mule runtime instance, because the JVM can remain in an invalid state.',
    },
    {
      q: 'When would you use streaming on a Batch Aggregator instead of a size?',
      a: 'When the aggregator contains an operation that streams data, you can set `streaming="true"` instead of `size`. With a fixed size, test that value and lower values, and check the maximum that the target system allows.',
    },
    {
      q: 'Does repeatable auto-paging work in bytes?',
      a: 'No. For objects the in-memory buffer is measured in instance counts, so 500 large objects use far more memory than 500 small ones. Mule serializes the overflow with Kryo, and Kryo cannot serialize everything, so keep objects simple.',
    },
  ],
}
