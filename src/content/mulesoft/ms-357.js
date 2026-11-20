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
        'One queue message per row, with consumers that insert each row',
        'A batch job with bulk inserts and On Complete writing the totals',
        'A For Each over the rows, with one insert per row and a counter',
        'A Parallel For Each over the rows, with one insert per row',
      ],
      answer: 1,
      explain: 'An aggregator writes rows in blocks with bulk inserts. Batch gives the run boundary and the totals without extra tracking. Row by row inserts are slow at 2 million rows, and queues need a tracking table to know the run is done.',
    },
    {
      type: 'single',
      prompt: 'Orders arrive all day, each must be sent to a WMS, and one slow order must not hold up others. Which fits best?',
      options: [
        'A batch job every 15 minutes that sends the orders received since',
        'One queue message per order, with retries and a dead letter queue',
        'A scheduler flow that reads new orders and sends them in a For Each',
        'An HTTP listener that calls the WMS before it replies to the sender',
      ],
      answer: 1,
      explain: 'Independent records that arrive over time suit a queue. Consumers retry each order on its own, and a poison order goes to the dead letter queue. In a For Each or a batch run, a slow order holds up the rest of that run, and a synchronous call ties the sender to the WMS.',
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
        'In the heap only, so a large job needs a larger worker',
        'In persisted batch queues managed by the runtime',
        'In an object store that the job creates for each run',
        'In the JMS broker that the app is connected to',
      ],
      answer: 1,
      explain: 'The runtime writes the records to persisted batch queues on the worker. This is why disk space and record size matter for big jobs. Check the docs for your deployment model.',
    },
    {
      type: 'single',
      prompt: 'An interviewer asks how you would choose. What is a strong short answer?',
      options: [
        'Use queues for anything above a million rows, and batch below that',
        'Batch for bounded sets with run results, queues for a stream of records',
        'Use batch whenever the target is a database, and queues for APIs',
        'Use queues so the load can scale, and add a batch job for reports',
      ],
      answer: 1,
      explain: 'Add plain streaming bulk loads when rows rarely fail. Name the deciding factors: boundary, failure rate, reporting and scale. Row count or target type alone does not decide it.',
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
