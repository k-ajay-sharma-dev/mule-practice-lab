export default {
  id: 'dw-205',
  category: 'dataweave',
  title: 'Sort Redelivered JMS Messages Into Process, Skip and Dead Letter',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'jms', 'redelivery', 'idempotency', 'json'],
  estMinutes: 20,
  description: `
Brindle Outdoor runs a product data hub. A JMS listener takes notifications that point to item files in blob storage. Last night the hub lost its database connection for a while. Messages were rolled back and the broker sent them again, some of them several times. A few had already been processed before the outage, but their acknowledgement never reached the broker.

\`payload.messages\` is a list of messages pulled for a replay check, in arrival order: \`messageId\`, \`docType\`, \`redelivered\` (the JMSRedelivered flag) and \`deliveryCount\`. \`vars.processedIds\` holds the message IDs already in the processed table. \`vars.maxDeliveries\` is the delivery limit.

**Rules**, checked in this order for each message:
1. \`SKIP_DUPLICATE\` when the message ID is in \`processedIds\`. The work is done, so the message is acknowledged and dropped.
2. \`SKIP_DUPLICATE\` when an earlier message in this list has the same message ID.
3. \`DEAD_LETTER\` when \`deliveryCount\` is greater than \`maxDeliveries\`.
4. Otherwise \`PROCESS\`.

\`wasRedelivered\` is \`true\` when the flag is set or the delivery count is above 1.

Output \`results\` (\`messageId\`, \`action\`, \`wasRedelivered\`) in the input order, and \`summary\` with one count per action in the order \`PROCESS\`, \`SKIP_DUPLICATE\`, \`DEAD_LETTER\`, including zeros.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "messages": [
    { "messageId": "ID:hub-7781", "docType": "Item", "redelivered": true, "deliveryCount": 2 },
    { "messageId": "ID:hub-7782", "docType": "Barcode", "redelivered": false, "deliveryCount": 1 },
    { "messageId": "ID:hub-7783", "docType": "Item", "redelivered": true, "deliveryCount": 7 },
    { "messageId": "ID:hub-7781", "docType": "Item", "redelivered": true, "deliveryCount": 3 },
    { "messageId": "ID:hub-7779", "docType": "SupplierItem", "redelivered": true, "deliveryCount": 9 },
    { "messageId": "ID:hub-7784", "docType": "Item", "redelivered": false, "deliveryCount": 1 }
  ]
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: `{ "processedIds": ["ID:hub-7779", "ID:hub-7784"], "maxDeliveries": 5 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "results": [
    { "messageId": "ID:hub-7781", "action": "PROCESS", "wasRedelivered": true },
    { "messageId": "ID:hub-7782", "action": "PROCESS", "wasRedelivered": false },
    { "messageId": "ID:hub-7783", "action": "DEAD_LETTER", "wasRedelivered": true },
    { "messageId": "ID:hub-7781", "action": "SKIP_DUPLICATE", "wasRedelivered": true },
    { "messageId": "ID:hub-7779", "action": "SKIP_DUPLICATE", "wasRedelivered": true },
    { "messageId": "ID:hub-7784", "action": "SKIP_DUPLICATE", "wasRedelivered": false }
  ],
  "summary": { "PROCESS": 2, "SKIP_DUPLICATE": 3, "DEAD_LETTER": 1 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  results: payload.messages map (m) -> {
    messageId: m.messageId,
    action: if (m.deliveryCount > vars.maxDeliveries) "DEAD_LETTER" else "PROCESS",
    wasRedelivered: m.redelivered
  }
}
`,
  hints: [
    'Use the index in `map (m, i) ->` to look only at earlier messages: `payload.messages filter ((x, j) -> j < i)`.',
    'Check the processed table before the delivery count. A processed message must never go to the dead letter queue.',
    'Build `summary` with `reduce` over the list of actions, as `acc ++ { (a): ... }`.',
  ],
  solution: `%dw 2.0
output application/json

var msgs = payload.messages
var results = msgs map (m, i) -> do {
  var earlier = (msgs filter ((x, j) -> j < i)) map (x) -> x.messageId
  ---
  {
    messageId: m.messageId,
    action:
      if (vars.processedIds contains m.messageId) "SKIP_DUPLICATE"
      else if (earlier contains m.messageId) "SKIP_DUPLICATE"
      else if (m.deliveryCount > vars.maxDeliveries) "DEAD_LETTER"
      else "PROCESS",
    wasRedelivered: m.redelivered or m.deliveryCount > 1
  }
}
var actions = ["PROCESS", "SKIP_DUPLICATE", "DEAD_LETTER"]
---
{
  results: results,
  summary: actions reduce (a, acc = {}) -> acc ++ { (a): sizeOf(results filter (r) -> r.action == a) }
}`,
  explanation: `
**Order of the checks matters.** A message that is already in the processed table did its work. Its acknowledgement was lost, so the broker sent it again. Parking it in a dead letter queue would make support replay it later and load it twice. Acknowledge it and drop it.

**Duplicates inside one pull.** The same message can arrive twice before the first copy is recorded. The first copy wins and the later ones are skipped.

**The delivery count is the poison message guard.** A message that failed more times than the limit goes to the dead letter queue with its error, so it stops blocking the queue.

**The redelivered flag is a hint, not proof.** It says the broker tried before. Only the processed table says whether the work finished.
`,
  tests: [
    {
      name: 'Quiet night',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messages": [{ "messageId": "ID:a", "docType": "Item", "redelivered": false, "deliveryCount": 1 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "processedIds": [], "maxDeliveries": 5 }' },
      ],
      expected:
        '{ "results": [{ "messageId": "ID:a", "action": "PROCESS", "wasRedelivered": false }], "summary": { "PROCESS": 1, "SKIP_DUPLICATE": 0, "DEAD_LETTER": 0 } }',
    },
    {
      name: 'Processed message over the limit is skipped, not parked',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "messages": [{ "messageId": "ID:b", "docType": "Item", "redelivered": true, "deliveryCount": 6 }, { "messageId": "ID:c", "docType": "Item", "redelivered": false, "deliveryCount": 6 }] }' },
        { name: 'vars', mime: 'application/json', content: '{ "processedIds": ["ID:b"], "maxDeliveries": 5 }' },
      ],
      expected:
        '{ "results": [{ "messageId": "ID:b", "action": "SKIP_DUPLICATE", "wasRedelivered": true }, { "messageId": "ID:c", "action": "DEAD_LETTER", "wasRedelivered": true }], "summary": { "PROCESS": 0, "SKIP_DUPLICATE": 1, "DEAD_LETTER": 1 } }',
    },
  ],
  followUps: [
    {
      q: 'Why can a processed message come back from the broker?',
      a: 'The flow committed its database work, then failed before the acknowledgement. The broker never got the ack and delivered the message again.',
    },
    {
      q: 'Where does the delivery count come from in Mule?',
      a: 'Brokers usually set the JMSXDeliveryCount property, which the JMS connector shows in the message attributes. Check your broker, since support for it varies.',
    },
    {
      q: 'What should a dead letter message carry?',
      a: 'The original body and properties, plus the last error type, the error text and the failure time, so a restart app can decide later.',
    },
  ],
}
