export default {
  id: 'ms-341',
  category: 'mulesoft',
  title: 'At Most Once, At Least Once and Exactly Once: Explaining Delivery Guarantees in an Interview',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'delivery-guarantees', 'acknowledgement', 'idempotency', 'jms'],
  estMinutes: 15,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each delivery guarantee to what it means.',
      pairs: [
        ['At most once', 'A message can be lost, but never handled twice'],
        ['At least once', 'A message is never lost, but can be handled twice'],
        ['Exactly once', 'Each message has its effect one time, which needs extra work in the consumer'],
      ],
      explain: 'Most brokers give at least once. The consumer turns that into exactly once effects.',
    },
    {
      type: 'single',
      prompt: 'A JMS listener uses AUTO acknowledgement and the flow crashes halfway. Which guarantee is that closest to?',
      options: [
        'Exactly once',
        'At most once, because the message may already be acknowledged when the flow fails',
        'At least once',
        'No guarantee at all',
      ],
      answer: 1,
      explain: 'When the ack happens before the work is done, a crash loses the message. Check how your connector version handles AUTO.',
    },
    {
      type: 'single',
      prompt: 'How do you get at least once delivery from a Mule JMS listener?',
      options: [
        'Use a bigger prefetch',
        'Acknowledge only after the work is committed, for example with manual ack or a transacted listener',
        'Use a topic instead of a queue',
        'Turn off redelivery',
      ],
      answer: 1,
      explain: 'If the flow fails before the ack, the broker delivers the message again.',
    },
    {
      type: 'multi',
      prompt: 'An interviewer asks how you get exactly once effects on top of at least once delivery. Which answers fit?',
      options: [
        'Check a message ID against a processed table before doing the work',
        'Write with MERGE or upserts so a repeat changes nothing',
        'Record the message ID and the work in the same database transaction',
        'Ask the broker never to redeliver',
      ],
      answer: [0, 1, 2],
      explain: 'This is called an idempotent consumer. The broker cannot promise it alone across a database.',
    },
    {
      type: 'single',
      prompt: 'Which guarantee is fine for a stream of store footfall counts sent every minute?',
      options: [
        'Exactly once is always required',
        'At most once can be acceptable, since the next reading replaces a lost one',
        'None, counts are never sent by queue',
        'At least once with no duplicate check',
      ],
      answer: 1,
      explain: 'Pick the guarantee by what a loss or a duplicate costs the business.',
    },
    {
      type: 'single',
      prompt: 'Why is at least once the usual choice for an item master data hub?',
      options: [
        'It is the fastest',
        'Losing an item change is costly and hard to find, while a duplicate can be detected and skipped',
        'Exactly once is not allowed in Mule',
        'Duplicates never happen',
      ],
      answer: 1,
      explain: 'A lost price or barcode change can stay wrong in stores for weeks.',
    },
  ],
  description: `
In interviews for integration roles, a common opener is "What delivery guarantee does your queue give?" Brindle Outdoor's product data hub reads item notifications from JMS, loads them into Oracle and sends acknowledgements back. Explain the guarantees in plain words and relate them to that hub.

**Questions**
1. What do at most once, at least once and exactly once mean?
2. Which one does a typical JMS setup in Mule give, and what decides it?
3. How do you reach exactly once effects?
4. When is a weaker guarantee fine?
`,
  answerTemplate: `## The three guarantees

## What decides the guarantee in Mule

## Exactly once effects

## When weaker is fine
`,
  keyPoints: [
    'At most once can lose, at least once can repeat.',
    'The moment of acknowledgement decides the guarantee.',
    'Ack after the work is committed for at least once.',
    'Exactly once effects come from an idempotent consumer.',
    'Use message IDs, a processed table and upserts.',
    'Choose by the cost of a loss and of a duplicate.',
  ],
  solution: `
**1. The three guarantees.** At most once: a message is delivered zero or one time, so it can be lost. At least once: it is delivered one or more times, so it can repeat. Exactly once: each message has its effect one time.

**2. What decides it in Mule.** The point where the message is acknowledged. If the ack comes before the work, a crash loses the message. If it comes after the work is committed, a crash leads to redelivery. Manual ack or a transacted listener gives at least once.

**3. Exactly once effects.** Accept that the broker may deliver twice and make the consumer safe. Check the message ID or the sender document ID against a processed table, write with MERGE, and store the ID in the same transaction as the work.

**4. When weaker is fine.** Readings that the next message replaces, such as counters or heartbeats, can live with at most once. Master data, orders and plans cannot.
`,
  followUps: [
    {
      q: 'Does XA give exactly once?',
      a: 'XA ties the broker ack and the database commit into one transaction, which gets close. It is slower, needs support on both sides, and still has rare in doubt cases.',
    },
    {
      q: 'Which ID do you use for the duplicate check?',
      a: 'The sender document ID if there is one, since the broker message ID changes when a sender resends the same document.',
    },
    {
      q: 'Where does the processed table live?',
      a: 'In the same database as the work, so the check and the write can share one transaction.',
    },
  ],
}
