export default {
  id: 'ms-250',
  category: 'mulesoft',
  title: 'A Queue Backlog Incident: Consumers Falling Behind, Prefetch, Acknowledgement Timeouts and Scaling Limits',
  level: 'EXPERT',
  tags: ['myproject', 'queues', 'anypoint-mq', 'backlog', 'prefetch', 'performance', 'scaling', 'troubleshooting', 'energy'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'A queue holds 200,000 messages and grows by 50 a second. What is the first question to answer?',
      options: [
        'How many replicas can we add right now?',
        'Is the consumer slow, stopped or failing?',
        'Can we raise the message TTL on the queue?',
        'Can we switch the queue to FIFO?',
      ],
      answer: 1,
      explain: 'Find what the consumer is waiting on first. More replicas help only if the consumer is short of capacity. If it waits on a slow database, more replicas wait too.',
    },
    {
      type: 'single',
      prompt: 'Each message takes 90 seconds to process, and the acknowledgement timeout is 60 seconds. What happens?',
      options: [
        'Nothing unusual, the flow finishes and acks',
        'The message is delivered again while still running',
        'The flow is stopped after 60 seconds',
        'The message goes to the DLQ at once',
      ],
      answer: 1,
      explain: 'The lock expires while the flow is still working, so the same work runs twice. The broker assumes a consumer that does not ack in time has failed. Set the timeout above the slowest normal processing time, or make the work shorter.',
    },
    {
      type: 'single',
      prompt: 'The subscriber prefetches a large number of messages into a local buffer, and processing is slow. What is the risk?',
      options: [
        'None, a larger prefetch only helps',
        'Buffered messages pass their lock time and come back',
        'The subscriber stops acking until the buffer is empty',
        'Messages in the buffer are lost from the broker',
      ],
      answer: 1,
      explain: 'Prefetched messages can wait in the buffer past their lock time, and other replicas cannot take them, so they come back as redeliveries. Prefetch helps fast consumers. With slow work, keep the buffer small so locks do not expire and other replicas can share the load.',
    },
    {
      type: 'multi',
      prompt: 'The consumer writes each message to a database. Adding replicas made the backlog grow faster. What could explain it?',
      options: [
        'The database is the limit, so more consumers wait longer',
        'Timeouts cause redeliveries, which add work',
        'Each replica gets its own copy of every message',
        'Lock contention on the same table rows',
      ],
      answer: [0, 1, 3],
      explain: 'Scaling the consumer moves the pressure to the next bottleneck. Find the slowest dependency before adding consumers.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to work through the incident.',
      items: [
        'Check consumer health, error rates and redelivery counts',
        'Measure processing time per message and find the slowest step',
        'Fix the bottleneck or batch the database writes',
        'Tune prefetch, timeouts and concurrency to the new processing time',
        'Scale consumers within what the downstream can take, and watch the queue drain',
      ],
      explain: 'Diagnose, fix the slow step, then tune and scale. Scaling first can make things worse.',
    },
    {
      type: 'single',
      prompt: 'After the incident, which alert would have warned the team earliest?',
      options: [
        'CPU above 90% on the workers',
        'Queue depth or oldest message age over a limit',
        'An alert when the app restarts',
        'Any ERROR line in the app log',
      ],
      answer: 1,
      explain: 'Queue depth and message age show a consumer falling behind long before users notice.',
    },
  ],
  description: `
Fernvale Energy reads smart meter readings from an Anypoint MQ queue and writes them to a billing database. At month end the queue grew to 200,000 messages. The team added two replicas, and the backlog grew faster. The logs show many messages processed twice and database timeouts.

**Questions**
1. How do you find why consumers fall behind?
2. How do acknowledgement timeouts and prefetch cause repeated work?
3. Why did more replicas make it worse?
4. What would you change, and what would you monitor?
`,
  answerTemplate: `## Finding the cause

## Timeouts and prefetch

## Why replicas hurt

## Changes and monitoring
`,
  keyPoints: [
    'Find what the consumer waits on before scaling it.',
    'If processing takes longer than the acknowledgement timeout, the message is delivered again.',
    'A large prefetch buffer with slow processing lets locks expire and blocks other replicas.',
    'More consumers on a saturated database add waiting, timeouts and redeliveries.',
    'Batch database writes, tune timeouts and prefetch, then scale within downstream limits.',
    'Alert on queue depth and the age of the oldest message.',
  ],
  solution: `
**1. Finding the cause.** Look at the consumer, not only the queue. Is it running, is it failing, and how long does one message take? Here the time per message rose because each reading did a single row insert, and the database slowed under month end load. Redelivery counts were high, which pointed to messages being worked on twice.

**2. Timeouts and prefetch.** With manual acknowledgement, the broker gives a consumer a set time to ack. When the database slowed, processing passed that time, the lock expired and the broker delivered the message again while the first copy was still running. A large prefetch made it worse: messages waited in each replica's local buffer, their locks ran down before work even started, and other replicas could not take them.

**3. Why replicas hurt.** The database was the limit. Two more replicas meant more connections and more lock waits on the same tables, so each message took longer, more locks expired and more work repeated. Scaling the consumer moved more pressure onto the bottleneck.

**4. Changes and monitoring.** Batch the inserts, for example with a bulk insert per group of messages, which cuts database time per message. Set the acknowledgement timeout above the slowest normal processing time and keep prefetch small for slow work. Make the consumer safe to repeat, using the reading id as a key. Then scale replicas only as far as the database can take. Alert on queue depth and the age of the oldest message, so a growing backlog is seen early.
`,
  followUps: [
    {
      q: 'How do you make the meter reading insert safe to repeat?',
      a: 'Use the reading id or meter and timestamp as a unique key and upsert, or ignore a duplicate key error. A second copy then changes nothing.',
    },
    {
      q: 'Could you drain the backlog faster without touching the database?',
      a: 'Only partly. You can pause non urgent consumers or move bulk history to a separate queue, but the database still has to absorb every write.',
    },
    {
      q: 'Why not set a very long acknowledgement timeout to be safe?',
      a: 'A crashed consumer then holds its messages until the long timeout ends, which delays recovery. Choose a value a little above real processing time.',
    },
  ],
}
