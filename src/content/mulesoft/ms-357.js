export default {
  id: 'ms-357',
  category: 'mulesoft',
  title: 'Batch Job or One Queue Message per Record? Explaining the Trade Off for Large Loads',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'batch', 'queues', 'design', 'trade-offs', 'staging'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each approach to its main strength.',
      pairs: [
        ['Batch job in one app', 'Run level counts, block writes to the database and one On Complete summary'],
        ['One queue message per record', 'Many consumers can scale out, and each record retries on its own'],
        ['Stream the file straight into bulk inserts', 'Few moving parts and high speed when rows rarely fail'],
      ],
      explain: 'The right answer depends on volume, failure rate and how results must be reported.',
    },
    {
      type: 'single',
      prompt: 'A nightly file of 2 million item rows must load into staging, and the business wants one job log row with totals. Which fits best?',
      options: [
        'One queue message per row',
        'A batch job with an aggregator doing bulk inserts and On Complete writing the totals',
        'A For Each with one insert per row',
        'An HTTP call per row',
      ],
      answer: 1,
      explain: 'Batch gives the run boundary and the totals for free.',
    },
    {
      type: 'single',
      prompt: 'Orders arrive all day, each must be sent to a WMS, and one slow order must not hold up others. Which fits best?',
      options: [
        'A batch job every hour',
        'One queue message per order, with consumers that retry and a dead letter queue',
        'A single flow that loops forever',
        'A nightly file',
      ],
      answer: 1,
      explain: 'Independent records that arrive over time suit a queue.',
    },
    {
      type: 'multi',
      prompt: 'What do you give up when you split a large file into one queue message per record?',
      options: [
        'A natural run boundary, so totals and "run complete" need extra tracking',
        'Block writes to the database, unless consumers batch again',
        'Broker storage and throughput become a concern at millions of messages',
        'The ability to retry single records',
      ],
      answer: [0, 1, 2],
      explain: 'Single record retry is the strength of the queue approach, not something you lose.',
    },
    {
      type: 'single',
      prompt: 'Where does a Mule batch job keep records while it runs?',
      options: [
        'Only in the payload of the flow',
        'In batch queues managed by the runtime, which are persisted, so large jobs need disk space',
        'In the database',
        'In the JMS broker',
      ],
      answer: 1,
      explain: 'This is why disk space and record size matter for big jobs. Check the docs for your deployment model.',
    },
    {
      type: 'single',
      prompt: 'An interviewer asks how you would choose. What is a strong short answer?',
      options: [
        'Always batch',
        'Use batch for bounded sets that need run level results, queues for a stream of independent records, and plain streaming bulk loads when rows rarely fail',
        'Always queues',
        'Whatever the team used last time',
      ],
      answer: 1,
      explain: 'Name the deciding factors: boundary, failure rate, reporting and scale.',
    },
  ],
  description: `
Larkfield Grocers' product data hub loads several large nightly files into Oracle staging. A new architect suggests replacing the batch jobs with one JMS message per record, so the load can scale across workers. The team asks you to compare the two before anything changes.

**Questions**
1. What does a batch job give you that per record messages do not?
2. What do per record messages give you?
3. What are the costs of each at millions of rows?
4. How would you choose, and is there a middle way?
`,
  answerTemplate: `## What batch gives

## What per record messages give

## Costs at scale

## Choosing
`,
  keyPoints: [
    'Batch gives a run boundary, block writes and On Complete totals.',
    'Queues give independent retries and scale across consumers.',
    'Per record messages need extra tracking for run totals.',
    'Millions of messages load the broker and lose block writes.',
    'Batch queues need disk space on the worker.',
    'A middle way sends blocks, not single records, to the queue.',
  ],
  solution: `
**1. What batch gives.** A clear run with a start and an end. Aggregators that write blocks with bulk inserts. On Complete with totals, failures and timing for the job log.

**2. What per record messages give.** Each record retries alone, with a dead letter queue for poison records. Consumers can scale across workers. Records can arrive at any time.

**3. Costs at scale.** Batch keeps records in persisted queues on the worker, so it needs disk space, and one app does the work. Per record messages put millions of messages on the broker, lose block writes unless consumers group again, and need a tracking table to know when a run is complete.

**4. Choosing.** For a bounded nightly file with run level reporting, batch fits. For a stream of independent records, queues fit. A middle way is to split the file into blocks of a few thousand rows, send each block as a message with the run ID, and track blocks per run.
`,
  followUps: [
    {
      q: 'How do you know a run is complete with queue messages?',
      a: 'Write the expected block count to a run table first, record each finished block, and close the run when the counts match.',
    },
    {
      q: 'What breaks if a batch worker restarts mid job?',
      a: 'The job may resume from its persisted queues, depending on the deployment. Writes must be idempotent, keyed by run ID, so repeated blocks do no harm.',
    },
    {
      q: 'Does a bigger worker fix a slow batch job?',
      a: 'Only if CPU, memory or threads are the limit. If the database is the limit, more workers only add contention.',
    },
  ],
}
