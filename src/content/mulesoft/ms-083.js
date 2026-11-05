export default {
  id: 'ms-083',
  category: 'mulesoft',
  title: 'Kafka Consumers in Mule: Message vs Batch Listener, Ack Modes, Commit Keys and Parallel Consumers',
  level: 'INTERMEDIATE',
  tags: ['kafka', 'consumer-groups', 'offsets', 'partitions', 'ack-mode', 'messaging'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each Kafka listener ack mode to its documented behaviour.',
      pairs: [
        ['AUTO', 'Commits if the flow finishes successfully'],
        ['MANUAL', 'Commits only when the flow calls the Commit operation'],
        ['IMMEDIATE', 'Commits on receipt, before the flow runs'],
        ['DUPS_OK', 'Like MANUAL, but commits are asynchronous, which can produce duplicates'],
      ],
      explain: 'AUTO is the default. IMMEDIATE moves the commit before any work happens, and DUPS_OK accepts possible duplicates in exchange for asynchronous commits.',
    },
    {
      type: 'single',
      prompt: 'A listener uses MANUAL ack. A record fails validation and On Error Continue writes it to an error table. What must the flow do?',
      options: [
        'Call Commit in that path too, because the flow finishes successfully through On Error Continue',
        'Nothing, because On Error Continue commits automatically',
        'Raise an error, because a Commit is not allowed after an error',
        'Call Seek to skip the record',
      ],
      answer: 0,
      explain: 'The documentation requires Commit at the end of the flow when it finishes successfully, whether there were no errors or an On Error Continue handled one.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Where does the Commit operation get its required Consumer Commit Key on a Batch Listener?',
      options: [
        'From the Consumer Context attribute of the Batch Listener',
        'From the return value of kafka:consume',
        'From the offset in the payload',
        'From the Group ID on the consumer configuration',
      ],
      answer: 0,
      explain: 'The Batch Listener exposes the key in its Consumer Context attribute, and each batch record also has one in its Kafka Record Attributes. A Message Listener exposes it in the Kafka Record Attributes.',
    },
    {
      type: 'single',
      prompt: 'A scheduled flow uses `kafka:consume` to read a topic and then tries to call Commit. Why will this design not work?',
      options: [
        'Consume does not return the commit key, and the key is valid only in a flow started by a listener source',
        'Consume cannot read more than one topic',
        'Consume always runs in MANUAL mode',
        'Commit works only with a Batch Listener',
      ],
      answer: 0,
      explain: 'Consume defaults to IMMEDIATE ack and does not return the key. If the flow must control the commit, use a Message Listener or a Batch Listener.',
    },
    {
      type: 'single',
      prompt: 'A Mule app loads Kafka events into a data warehouse, where the bulk load is much cheaper in groups. Which source fits, and why?',
      options: [
        'Batch Listener, because each flow receives a list of records',
        'Message Listener, because each flow receives a list of records',
        'Batch Listener, because it has configurable streaming strategies',
        '`kafka:consume` on a Scheduler, because it returns the commit key',
      ],
      answer: 0,
      explain: 'The Batch Listener produces a list of records, and Commit covers that list. The Message Listener produces a single record. Both have an Amount of parallel consumers setting that defaults to 1. The Message Listener has a Streaming Strategy, and the Batch Listener does not support configurable streaming strategies. `kafka:consume` does not return the commit key.',
    },
    {
      type: 'single',
      prompt: 'A topic has 6 partitions. A team sets the listener to 12 parallel consumers in one consumer group, hoping for double the throughput. What should you tell them?',
      options: [
        'A partition goes to one consumer in a group, so at most 6 consumers receive records',
        'Throughput doubles, because each consumer reads every partition',
        'Kafka adds 6 partitions automatically',
        'The app will fail to start',
      ],
      answer: 0,
      explain: 'Partitions set the limit on parallelism in a group. Extra consumers sit idle until the topic has more partitions.',
    },
  ],
  description: `
A payments company consumes card authorisation events from a Kafka topic with 12 partitions, at a peak of about 4,000 events a second. Two Mule apps read the topic:

- \`fraud-scoring\` calls a scoring API for each event and must not lose any event.
- \`settlement-loader\` writes every event to a data warehouse, where the bulk load is much cheaper in groups of 500. Finance reconciles this data, so it must also be complete.

The first design used \`kafka:consume\` on a Scheduler, with \`kafka:commit\` afterwards. The team also wants to know how to raise throughput, and what MANUAL ack changes in the error handler.

**Questions**
1. Which source fits each app, and why not \`kafka:consume\`?
2. Compare the four ack modes. Which would you choose for each app?
3. How do Commit and the commit key work, including on the error path?
4. How do parallel consumers relate to partitions?
`,
  answerTemplate: `## Source for each app

## Ack modes

## Commit and the commit key

## Parallel consumers and partitions
`,
  keyPoints: [
    'Message Listener: one record per flow. Batch Listener: a list of records per flow.',
    'Ack modes: AUTO (default, commits if the flow finishes successfully), MANUAL, IMMEDIATE and DUPS_OK.',
    'With MANUAL, Commit is required at the end of the flow on success and when On Error Continue handles an error.',
    'Commit needs the Consumer Commit Key: from Kafka Record Attributes on a Message Listener, from the Consumer Context attribute on a Batch Listener.',
    'kafka:consume defaults to IMMEDIATE and does not return the commit key.',
    'Amount of parallel consumers defaults to 1; a partition goes to one consumer in a group, so partitions limit parallelism.',
    'Design for at-least-once delivery and make processing idempotent.',
  ],
  solution: `
**1. Sources.**
- \`fraud-scoring\`: **Message Listener**. It handles one record per flow, which suits a per-event API call.
- \`settlement-loader\`: **Batch Listener**. The flow receives a list of records, which suits a bulk load.
- \`kafka:consume\` does not fit either. It defaults to IMMEDIATE ack, so the commit happens on receipt, and it does not return the commit key. The key is only valid inside a flow started by a listener source.

**2. Ack modes.**
| Mode | When the commit happens | Note |
|---|---|---|
| AUTO | If the flow finishes successfully | The default, and the simplest safe choice |
| MANUAL | When the flow calls Commit | You pick the exact point |
| IMMEDIATE | On receipt, before the flow runs | A later failure cannot undo the commit |
| DUPS_OK | Like MANUAL, but asynchronous | Can produce duplicates |

Both apps must not lose events, so IMMEDIATE is ruled out. AUTO suits \`fraud-scoring\`. \`settlement-loader\` can use MANUAL if it needs to commit after the warehouse confirms the load.

**3. Commit.** The Commit operation requires the **Consumer Commit Key**. A Message Listener and each batch record expose it in the Kafka Record Attributes. A Batch Listener also exposes it in its Consumer Context attribute. Store it in a variable early in the flow. Check the exact expression for your connector version in Studio's metadata, especially on a Batch Listener.

With MANUAL, the documentation requires Commit at the end of the flow when it finishes successfully, and that includes a flow that finished through **On Error Continue**. If you park a bad record and continue, commit in that path too.

**4. Parallel consumers.** Amount of parallel consumers defaults to **1**, and Consumer Amount on the connection also defaults to 1. In a consumer group each partition goes to one consumer, so 12 partitions allow up to 12 active consumers across all replicas. Beyond that, consumers sit idle. Records keep their order only within a partition, so parallel work inside one partition can break order.
`,
  followUps: [
    {
      q: 'What does IMMEDIATE risk for fraud-scoring?',
      a: 'The commit happens before the flow runs, so if the flow fails afterwards the group has already moved past that record.',
    },
    {
      q: 'How do you stop duplicates doing harm?',
      a: 'Make the work idempotent. Use a business key such as the authorisation id in an upsert or a duplicate check, because a consumer can read a record again after a restart or a rebalance.',
    },
    {
      q: 'What attributes does a record carry?',
      a: 'Kafka Record Attributes include the topic, partition, offset, key, headers and the Consumer Commit Key, which helps when logging a failed record.',
    },
  ],
}
