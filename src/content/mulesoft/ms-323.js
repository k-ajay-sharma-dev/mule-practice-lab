export default {
  id: 'ms-323',
  category: 'mulesoft',
  title: 'Tuning Block Size and Max Concurrency of a Batch Job',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'block-size', 'max-concurrency', 'performance', 'memory'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'What does the block size of a batch job control?',
      options: [
        'The number of records a thread takes from the queue and processes together',
        'The size of the input file',
        'The number of batch steps',
        'The size of the aggregator',
      ],
      answer: 0,
      explain: 'The default is 100 records per block in Mule 4. Fewer, larger blocks mean less queue overhead.',
    },
    {
      type: 'single',
      prompt: 'What does max concurrency control?',
      options: [
        'How many batch jobs can be deployed',
        'How many blocks are processed at the same time',
        'How many records fit in a block',
        'How many retries a record gets',
      ],
      answer: 1,
      explain: 'If you do not set it, the runtime picks a value from the number of cores. Check the default for your Mule version.',
    },
    {
      type: 'single',
      prompt: 'Each record is about 50 KB. Block size is 1,000 and max concurrency is 8. Roughly how much record data is in memory at once?',
      options: ['About 50 KB', 'About 50 MB', 'About 400 MB', 'About 4 GB'],
      answer: 2,
      explain: '50 KB x 1,000 x 8 = 400 MB, before any copies made by transforms. On a small worker this fails.',
    },
    {
      type: 'single',
      prompt: 'A batch step calls a partner API that allows 10 calls per second. What do you tune first?',
      options: [
        'Raise the block size',
        'Lower max concurrency, and add a rate limit or use a bulk endpoint if there is one',
        'Remove error handling',
        'Use a bigger worker',
      ],
      answer: 1,
      explain: 'More threads only produce more 429 errors. The target sets the pace.',
    },
    {
      type: 'multi',
      prompt: 'When does a larger block size help?',
      options: [
        'Records are small and the step work is fast',
        'Queue overhead shows up as a large share of the time',
        'Records are very large',
        'The job has few records, such as 150',
      ],
      answer: [0, 1],
      explain: 'With 150 records and a block size of 500, everything runs in one block on one thread, so there is no parallel work at all.',
    },
    {
      type: 'single',
      prompt: 'How do you choose the final values?',
      options: [
        'Copy them from another project',
        'Make them properties, test with real volumes and record sizes, and watch time, memory and the target system',
        'Use the largest values allowed',
        'Leave the defaults forever',
      ],
      answer: 1,
      explain: 'Production data often has larger records than test data, so test with a copy of real files.',
    },
  ],
  description: `
Thornbury Freight runs a batch job that loads 1.5 million shipment events. It takes 3 hours. A developer raised the block size to 5,000 and max concurrency to 32. The job then failed with out of memory errors, and the database team complained about lock waits.

**Questions**
1. What do block size and max concurrency control?
2. Why did the change fail?
3. How would you tune the job instead?
`,
  answerTemplate: `## Block size and max concurrency

## Why the change failed

## A better way to tune
`,
  keyPoints: [
    'Block size is records per block. Max concurrency is blocks at once.',
    'Memory is about record size x block size x concurrency, plus copies.',
    'The target system often limits throughput, not Mule.',
    'Large blocks with few records remove parallel work.',
    'Keep both values in properties and tune with real volumes.',
    'Measure time per block and target load before and after each change.',
  ],
  solution: `
**1. The settings.** Block size is how many records a thread takes from the queue at a time. Max concurrency is how many blocks run at the same time. The defaults are a block size of 100 and a concurrency based on the cores. Verify both for your runtime version.

**2. Why it failed.** 5,000 records x 32 blocks is 160,000 records in memory at once, plus copies from transforms. The worker ran out of heap. 32 threads writing to the same tables also caused lock waits and slowed the database, so more threads did not mean more speed.

**3. A better way.** Find where the time goes first: the steps, the database or the queue. Use a batch aggregator with bulk inserts to cut round trips. Raise the block size in small steps for small records. Set concurrency to what the target can take. Keep both in properties, test with a copy of real files, and watch memory, time per block and database waits.
`,
  followUps: [
    {
      q: 'What does the scheduling strategy of a batch job change?',
      a: 'It decides how several instances of the same job share threads. In order runs one instance after another, while round robin lets them run side by side.',
    },
    {
      q: 'Why can a bigger worker still be slow?',
      a: 'If the database or API is the bottleneck, more cores only queue more work at the same narrow point.',
    },
    {
      q: 'How would you see the time per block?',
      a: 'Log the start and end of each aggregator run with the record count, or use the monitoring metrics of the runtime.',
    },
  ],
}
