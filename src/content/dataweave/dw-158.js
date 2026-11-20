export default {
  id: 'dw-158',
  category: 'dataweave',
  title: 'Plan a Restart From the Failure Queue: Report by Source Queue and Error Type',
  level: 'ADVANCED',
  tags: ['myproject', 'queues', 'dlq', 'failure-queue', 'groupBy', 'pluck', 'minBy', 'reporting', 'product-data-hub', 'json'],
  estMinutes: 25,
  description: `
Kestrel Home Supply runs a product data hub that reads GS1 style notifications from JMS queues. When a message fails for good, the hub moves it to a failure queue. A separate restart app checks that the database and blob storage are healthy, then republishes failed messages to their main queue.

Before the restart app runs, a flow browses the failure queue and sends a plan to support, who decide what to republish and what to fix first.

Each failed message has \`messageId\`, \`sourceQueue\`, \`deadLetteredAt\` and \`errorType\`. Some old messages have no \`errorType\`; use \`UNKNOWN\` for them.

Output:

- \`total\`: the number of messages
- \`queues\`: one entry per source queue, sorted by queue name as text, with:
  - \`queue\` and \`count\`
  - \`oldest\`: the earliest \`deadLetteredAt\`, as it appears in the input
  - \`errors\`: one entry per error type (\`UNKNOWN\` included), sorted by type as text, with \`type\`, \`count\` and \`messageIds\` in input order
- \`replay\`: ids whose error type is \`HTTP:TIMEOUT\`, \`HTTP:SERVICE_UNAVAILABLE\` or \`DB:CONNECTIVITY\`, in input order. These failed for a passing reason, and the restart app can republish them.
- \`review\`: every other id, in input order
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "messageId": "m-01", "sourceQueue": "pdh.item.in", "deadLetteredAt": "2026-11-18T07:10:00Z", "errorType": "HTTP:TIMEOUT" },
  { "messageId": "m-02", "sourceQueue": "pdh.barcode.in", "deadLetteredAt": "2026-11-18T06:55:00Z", "errorType": "VALIDATION:INVALID_PAYLOAD" },
  { "messageId": "m-03", "sourceQueue": "pdh.item.in", "deadLetteredAt": "2026-11-18T06:40:00Z", "errorType": "HTTP:TIMEOUT" },
  { "messageId": "m-04", "sourceQueue": "pdh.item.in", "deadLetteredAt": "2026-11-18T08:05:00Z", "errorType": "DB:CONNECTIVITY" },
  { "messageId": "m-05", "sourceQueue": "pdh.barcode.in", "deadLetteredAt": "2026-11-18T08:30:00Z", "errorType": "VALIDATION:INVALID_PAYLOAD" },
  { "messageId": "m-06", "sourceQueue": "pdh.item.in", "deadLetteredAt": "2026-11-18T08:45:00Z" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "total": 6,
  "queues": [
    {
      "queue": "pdh.barcode.in",
      "count": 2,
      "oldest": "2026-11-18T06:55:00Z",
      "errors": [{ "type": "VALIDATION:INVALID_PAYLOAD", "count": 2, "messageIds": ["m-02", "m-05"] }]
    },
    {
      "queue": "pdh.item.in",
      "count": 4,
      "oldest": "2026-11-18T06:40:00Z",
      "errors": [
        { "type": "DB:CONNECTIVITY", "count": 1, "messageIds": ["m-04"] },
        { "type": "HTTP:TIMEOUT", "count": 2, "messageIds": ["m-01", "m-03"] },
        { "type": "UNKNOWN", "count": 1, "messageIds": ["m-06"] }
      ]
    }
  ],
  "replay": ["m-01", "m-03", "m-04"],
  "review": ["m-02", "m-05", "m-06"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  total: sizeOf(payload),
  queues: payload groupBy $.sourceQueue pluck (msgs, q) -> { queue: q, count: sizeOf(msgs) },
  replay: [],
  review: []
}
`,
  hints: [
    'First map every message to a small record where the error type already has its `UNKNOWN` default. The rest of the script then never repeats the default.',
    '`groupBy` gives an object keyed by queue. `pluck (msgs, q) -> ...` turns it back into a list. The key is a Key, so use `q as String`.',
    'Inside each queue, group again by error type. Sort the lists afterwards with `orderBy $.queue` and `orderBy $.type`.',
    '`minBy` compares values, so give it real dates: `(msgs minBy ($.at as DateTime)).at` returns the original text of the earliest one.',
  ],
  solution: `%dw 2.0
output application/json
var retryable = ["HTTP:TIMEOUT", "HTTP:SERVICE_UNAVAILABLE", "DB:CONNECTIVITY"]

var dead = payload map (m) -> {
  id: m.messageId,
  queue: m.sourceQueue,
  at: m.deadLetteredAt,
  errorType: m.errorType default "UNKNOWN"
}

fun errorsOf(msgs) =
  (msgs groupBy $.errorType pluck (list, t) -> {
    "type": t as String,
    count: sizeOf(list),
    messageIds: list map $.id
  }) orderBy $."type"
---
{
  total: sizeOf(dead),
  queues: (dead groupBy $.queue pluck (msgs, q) -> {
    queue: q as String,
    count: sizeOf(msgs),
    oldest: (msgs minBy ($.at as DateTime)).at,
    errors: errorsOf(msgs)
  }) orderBy $.queue,
  replay: (dead filter (m) -> retryable contains m.errorType) map $.id,
  review: (dead filter (m) -> not (retryable contains m.errorType)) map $.id
}`,
  explanation: `
**Normalise first.** The first \`map\` gives every message the same small shape, with the \`UNKNOWN\` default applied once. Grouping, counting and the replay split all read that one field.

**Two levels of groupBy.** The outer group is per queue, the inner one per error type. \`pluck\` turns each grouped object back into a list, so the report can be sorted.

**Input order inside groups.** \`groupBy\` keeps the order of the items within each group, so \`messageIds\` follow the order in the failure queue.

**Oldest as a date.** \`minBy\` with \`as DateTime\` compares real times. Returning \`.at\` keeps the text the support team will search for. The oldest message shows how long a problem has been waiting.

**Replay or review.** A timeout or a service that was down may work on a second try. A validation error will fail the same way again, so republishing it only fills the failure queue again. The two lists are built from the same test, so every message is in exactly one.
`,
  tests: [
    {
      name: 'One queue, one unknown error',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "messageId": "z-1", "sourceQueue": "pdh.transfer.in", "deadLetteredAt": "2026-11-19T01:00:00Z" }]',
        },
      ],
      expected:
        '{ "total": 1, "queues": [{ "queue": "pdh.transfer.in", "count": 1, "oldest": "2026-11-19T01:00:00Z", "errors": [{ "type": "UNKNOWN", "count": 1, "messageIds": ["z-1"] }] }], "replay": [], "review": ["z-1"] }',
    },
    {
      name: 'Empty failure queue',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '{ "total": 0, "queues": [], "replay": [], "review": [] }',
    },
  ],
  followUps: [
    {
      q: 'How does the flow read the failure queue without removing the messages?',
      a: 'Use a queue browser, which JMS defines for reading without consuming, or a broker tool that does the same. Consuming them before support has decided loses data unless they are put back.',
    },
    {
      q: 'Is it safe to republish every DB:CONNECTIVITY message?',
      a: 'Only if the hub handles repeats. The connection may have dropped after part of the load committed. The duplicate checks on message id and sender document id must run again on the republished message.',
    },
    {
      q: 'The failure queue holds 50,000 messages after an outage. What changes in the report?',
      a: 'Keep the counts and the oldest time, but cap the message ids per error type. A list of 50,000 ids in an email helps nobody.',
    },
  ],
}
