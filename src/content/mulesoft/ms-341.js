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
      prompt: 'A Mule 4 JMS listener uses IMMEDIATE acknowledgement and the flow crashes halfway. Which guarantee is that closest to?',
      options: [
        'Exactly once, because the broker removes the message only once',
        'At most once, because the message was acknowledged on receipt',
        'At least once, because the broker redelivers the unfinished message',
        'No guarantee at all, because the message can be lost or repeated',
      ],
      answer: 1,
      explain: 'IMMEDIATE acknowledges as soon as the message is received, so a crash loses it. AUTO acknowledges only when the flow ends without error, so a crash leads to redelivery.',
    },
    {
      type: 'single',
      prompt: 'How do you get at least once delivery from a Mule JMS listener?',
      options: [
        'Raise the prefetch so the listener holds more messages at once',
        'Acknowledge only after the work is done, such as with AUTO, MANUAL or a transaction',
        'Use a topic instead of a queue, so every message is kept until it is read',
        'Set the redelivery limit to 0, so the broker never drops a failed message',
      ],
      answer: 1,
      explain: 'AUTO acknowledges when the flow ends without error. MANUAL leaves the ack to the flow. If the flow fails before the ack, the broker delivers the message again.',
    },
    {
      type: 'multi',
      prompt: 'An interviewer asks how you get exactly once effects on top of at least once delivery. Which answers fit?',
      options: [
        'Check a message ID against a processed table before doing the work',
        'Write with MERGE or upserts so a repeat changes nothing',
        'Record the message ID and the work in the same database transaction',
        'Switch the listener to IMMEDIATE ack, so no message is ever redelivered',
        'Drop any message whose JMSRedelivered flag is set, since it was seen before',
        'Make the acknowledgement timeout longer, so the broker waits before it redelivers',
      ],
      answer: [0, 1, 2],
      explain: 'A processed table, upserts, and writing the ID with the work in one transaction all make a repeat harmless. This is called an idempotent consumer. The broker cannot promise it alone across a database. IMMEDIATE ack turns at least once into at most once, so a crash loses messages. A redelivered message may have failed before any work was done, so dropping it loses data. A longer timeout makes repeats rarer but does not remove them.',
    },
    {
      type: 'single',
      prompt: 'Which guarantee is fine for a stream of store footfall counts sent every minute?',
      options: [
        'Exactly once, since every reading must be counted',
        'At most once, since the next reading replaces a lost one',
        'At least once is usually safer, since a lost reading leaves a gap in the hour',
        'Exactly once through XA, since counts feed the store reports',
      ],
      answer: 1,
      explain: 'Pick the guarantee by what a loss or a duplicate costs the business. A reading every minute is soon replaced, so a lost one costs little. At least once adds redelivery and duplicate checks for a gap the next reading fills. Exactly once and XA cost far more than a lost minute is worth.',
    },
    {
      type: 'single',
      prompt: 'Why is at least once the usual choice for an item master data hub?',
      options: [
        'It is the fastest of the three, and a hub must keep up with item volume',
        'A lost item change is costly and hard to find, while a duplicate can be skipped',
        'Exactly once needs XA, which the Database connector does not offer for Oracle',
        'Duplicates cannot happen when the hub reads from a queue with AUTO ack',
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

**2. What decides it in Mule.** The point where the message is acknowledged. If the ack comes before the work, a crash loses the message. If it comes after the work is committed, a crash leads to redelivery. In Mule 4, IMMEDIATE acknowledges on receipt, which is at most once. AUTO acknowledges when the flow ends without error, and MANUAL ack or a transacted listener also give at least once.

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
