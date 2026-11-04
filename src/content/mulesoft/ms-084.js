export default {
  id: 'ms-084',
  category: 'mulesoft',
  title: 'Kafka Producers and Replay: Keys, Bulk Publish, Retries, Idempotence, Seek and Auto Offset Reset',
  level: 'ADVANCED',
  tags: ['kafka', 'partitions', 'offsets', 'consumer-groups', 'ordering', 'messaging'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Vehicle telemetry must stay in order per vehicle, across 24 partitions, while load spreads across the topic. What do you set on `kafka:publish`?',
      options: [
        'Key = vehicleId, and leave the partition unset',
        'Partition = 0 for every record',
        'No key, so records spread evenly',
        'A new random key on each record',
      ],
      answer: 0,
      explain: 'The same key maps to the same partition, and Kafka only orders records within a partition. A fixed partition keeps order but gives up all parallelism.',
    },
    {
      type: 'single',
      prompt: 'What is the main difference between `kafka:publish` and `kafka:bulk-publish`?',
      options: [
        'Publish sends one message; Bulk Publish takes a list of messages and returns metadata such as offset, partition and topic',
        'Bulk Publish ignores keys and always uses partition 0',
        'Bulk Publish only works with a Batch Listener',
        'Publish is asynchronous and Bulk Publish commits offsets',
      ],
      answer: 0,
      explain: 'Bulk Publish takes its messages from the payload by default and returns metadata for them. Committing offsets belongs to consumers, not producers.',
    },
    {
      type: 'single',
      prompt: 'Retries are on and Maximum in flight requests is at its default of 5. A send fails, is retried and then succeeds. What risk does the documentation describe?',
      options: [
        'Records can be reordered, because a later batch can be written before the retried one',
        'The topic loses its key mapping',
        'The consumer group resets to LATEST',
        'The message is sent to a dead-letter topic',
      ],
      answer: 0,
      explain: 'With more than one request in flight, a retried batch can land after one sent later. Setting Maximum in flight requests to 1 removes that risk at some cost to throughput.',
    },
    {
      type: 'multi',
      prompt: 'The team wants retries without duplicates and turns on **Enable idempotence**. What must also be true for the producer connection?',
      options: [
        'Maximum in flight requests is 5 or less',
        'Retries is greater than 0',
        'Producer Acknowledge Mode is ALL',
        'The topic has only one partition',
      ],
      answer: [0, 1, 2],
      explain: 'Idempotence defaults to false, and with it off a retried message can be duplicated. The acknowledge mode default is NONE, so set ALL yourself instead of relying on the suitable values the reference says are chosen when these are not set. Incompatible values raise a ConnectionException.',
    },
    {
      type: 'single',
      prompt: 'A brand-new consumer group starts on a topic that holds 7 days of data. Auto offset reset is left at its default. What does it read?',
      options: [
        'Only records published after it starts, because the default is LATEST',
        'All 7 days, because a new group always starts at the beginning',
        'Nothing, because the default raises an error',
        'The last 24 hours',
      ],
      answer: 0,
      explain: 'Auto offset reset applies when the group has no initial offset, and its default is LATEST. Set EARLIEST before the first start if the group must read history.',
    },
    {
      type: 'match',
      prompt: 'Match each description to the operation or error that fits, using the connector reference.',
      pairs: [
        ['Moves a consumer to a chosen offset of one partition', 'kafka:seek'],
        ['Lists KAFKA:INPUT_TOO_LARGE and KAFKA:INVALID_TOPIC_PARTITION among its errors', 'kafka:publish'],
        ['Lists KAFKA:ALREADY_COMMITTED among its errors', 'kafka:commit'],
        ['The source redelivery policy has run out of attempts', 'REDELIVERY_EXHAUSTED'],
      ],
      explain: 'Seek requires the topic, partition and offset. The Publish errors are shared with Bulk Publish and are listed by name only, so the reference does not define what triggers them. REDELIVERY_EXHAUSTED comes from the Redelivery Policy description.',
    },
  ],
  description: `
A fleet operator streams telemetry from 40,000 vehicles into a Kafka topic with 24 partitions, and Mule apps publish about 2,000 records a second. An hourly flow also publishes 50,000 route updates in one go.

The team has four concerns:

- A pilot showed records for one vehicle arriving out of order during a broker failover.
- Retried sends created a few duplicates.
- A new maintenance analytics group must read the last 7 days of data.
- After a bad release, one consumer must re-read one partition from a known offset.

**Questions**
1. How do keys and partitions control ordering?
2. When do you use Publish and when Bulk Publish?
3. How do retries, in-flight requests and idempotence affect ordering and duplicates?
4. How do you read history or re-read a partition?
5. Which publish errors are worth handling separately?
`,
  answerTemplate: `## Keys and partitions

## Publish vs Bulk Publish

## Retries, in-flight requests and idempotence

## Replay with Auto offset reset and Seek

## Publish errors
`,
  keyPoints: [
    'Kafka orders records only within a partition. The same key maps to the same partition.',
    'Publish: topic, optional partition, optional key, message (default payload) and headers.',
    'Bulk Publish takes messages (default payload) and returns metadata: offset, partition and topic.',
    'Retries without a single in-flight request can change record order.',
    'With idempotence off, a retried message can be duplicated. Idempotence needs in-flight of 5 or less, retries above 0 and acks ALL.',
    'Auto offset reset defaults to LATEST and applies when the group has no offset. The options are EARLIEST, LATEST and ERROR.',
    'kafka:seek requires topic, partition and offset.',
  ],
  solution: `
**1. Keys and partitions.** Kafka keeps order only within a partition. Publish with **key = vehicleId**, so each vehicle's records share a partition while vehicles spread across all 24. Without a key, records from one vehicle can land on different partitions and lose their relative order. Setting a partition by hand is rarely needed. \`KAFKA:INVALID_TOPIC_PARTITION\` is in Publish's error list, and a partition the topic does not have is its likely trigger, although the reference does not define it.

**2. Publish vs Bulk Publish.** \`kafka:publish\` sends one message, which suits telemetry handled record by record. \`kafka:bulk-publish\` takes a list of messages (the payload by default) and returns metadata (offset, partition, topic), which suits the hourly route update.

**3. Retries, in-flight requests and idempotence.**
| Setting | Default | Note |
|---|---|---|
| Retries amount | 1 | Resends records that fail with a potentially transient error |
| Maximum in flight requests | 5 | Above 1, retries can reorder records |
| Enable idempotence | false | With it off, a retried message can be duplicated |
| Producer Acknowledge Mode | NONE | Idempotence needs ALL |

- **Ordering:** the pilot's failover caused retries, and with several requests in flight a retried batch landed after a later one. Setting Maximum in flight requests to **1** removes that risk.
- **Duplicates:** turn on idempotence. It requires in-flight of 5 or less, retries above 0 and acks ALL. Incompatible values raise a \`ConnectionException\`.

The reference recommends leaving Retries unset and using the delivery timeout to control retry behaviour, so review both together. Measure throughput after any change to in-flight requests.

**4. Replay.**
- New group, full history: set **Auto offset reset** to **EARLIEST** before the group's first start. It reads what the topic still retains. The default, LATEST, reads only new records.
- Group with committed offsets: Auto offset reset no longer applies, because it only acts when there is no initial offset or the current offset no longer exists. Use \`kafka:seek\` with the topic, partition and offset.

A replay repeats work, so consumers must be idempotent.

**5. Publish errors.** The reference lists these by name only, so this grouping is a working judgement from the names.
- Fix before retrying: \`KAFKA:INPUT_TOO_LARGE\`, \`KAFKA:INVALID_TOPIC_PARTITION\`.
- Credentials or configuration: \`KAFKA:SECURITY\`, \`KAFKA:AUTHENTICATION_ERROR\`, \`KAFKA:INVALID_CONNECTION\`.
- Possibly transient: \`KAFKA:CONNECTIVITY\`, \`KAFKA:TIMEOUT\`, \`KAFKA:RETRY_EXHAUSTED\`.
`,
  followUps: [
    {
      q: 'What does Auto offset reset set to ERROR do?',
      a: 'It throws an error if no previous offset is found for the group. That suits a consumer that must never start silently from a guessed position.',
    },
    {
      q: 'What happens to key ordering if you add partitions later?',
      a: 'The key-to-partition mapping changes, so records for one key can move to another partition. Plan partition counts ahead and treat a change as a controlled event.',
    },
    {
      q: 'Why not always set in-flight requests to 1?',
      a: 'It limits how much the producer can send at once. Use it where order per key matters, and test the throughput you actually need.',
    },
  ],
}
