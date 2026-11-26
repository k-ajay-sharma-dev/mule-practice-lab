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
      prompt: 'A batch job gets 250 records. Block size is the default 100 and max concurrency is 8. At most how many threads work on the records at the same time?',
      options: [
        '8, one for each slot that max concurrency allows',
        '2, since the part block of 50 waits to join the next full block',
        '3, since the records make blocks of 100, 100 and 50',
        '1, since one job instance runs all its blocks on one thread',
      ],
      answer: 2,
      explain: 'A thread takes a whole block from the queue and processes it. 250 records make 3 blocks, the last one only 50, so only 3 threads can have work, however high max concurrency is. A part block is processed, it does not wait. Max concurrency is a ceiling, not a count of threads that always run. The default is 100 records per block in Mule 4. Fewer, larger blocks mean less queue overhead.',
    },
    {
      type: 'single',
      prompt: 'A batch job loads into a target that locks badly under parallel writes, so a developer sets maxConcurrency="1". What changes?',
      options: [
        'Only one instance of the job can run, so a second trigger waits for the first',
        'Each record now goes through every step before the next record starts',
        'The block size drops to 1, so each record becomes its own block',
        'Only one block is processed at a time, so blocks run one after another',
      ],
      answer: 3,
      explain: 'Max concurrency limits how many blocks are processed at the same time inside one job instance. It does not stop a second instance from starting, and it does not change the block size. Records inside a block still move through the steps as a block, not one record through all steps. If you do not set it, the runtime picks a value from the number of cores. Check the default for your Mule version.',
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
        'Raise the block size so each thread makes fewer, larger calls',
        'Lower max concurrency, and add a rate limit or use a bulk endpoint',
        'Raise max concurrency so the job ends before the limit resets',
        'Move to a larger worker so each call returns faster',
      ],
      answer: 1,
      explain: 'Use a bulk endpoint if the partner has one. More threads only produce more 429 errors. The target sets the pace.',
    },
    {
      type: 'multi',
      prompt: 'When does a larger block size help?',
      options: [
        'Records are small and the step work is fast',
        'Queue overhead shows up as a large share of the time',
        'Records are very large, such as 5 MB documents each',
        'The job has few records, such as 150',
      ],
      answer: [0, 1],
      explain: 'With 150 records and a block size of 500, everything runs in one block on one thread, so there is no parallel work at all.',
    },
    {
      type: 'single',
      prompt: 'How do you choose the final values?',
      options: [
        'Copy them from another batch project that already runs well on the same worker size',
        'Make them properties, test with real volumes, and watch time, memory and the target',
        'Use the largest values the worker allows, then lower them if it fails',
        'Keep the defaults, since the runtime tunes block size and concurrency to the load',
      ],
      answer: 1,
      explain: 'Test with real record sizes too. Production data often has larger records than test data, so test with a copy of real files.',
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
