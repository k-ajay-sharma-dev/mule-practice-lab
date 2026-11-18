export default {
  id: 'dw-155',
  category: 'dataweave',
  title: 'Build the Final ACK Message for a Claim Check Notification',
  level: 'BEGINNER',
  tags: ['myproject', 'queues', 'jms', 'ack-message', 'claim-check', 'conditional', 'product-data-hub', 'json'],
  estMinutes: 10,
  description: `
Kestrel Home Supply runs a product data hub. Partners send GS1 style messages such as Item, ReceivingAdvice and TransferOrder. Each one arrives as a small JMS notification that points to a JSON file in Azure Blob Storage. When the hub has loaded the file, it sends a final ACK back on a JMS reply queue.

The input holds the original \`notification\` and the \`run\` results from the job log. Build the ACK:

- \`ackType\`: always \`FINAL\`
- \`originalMessageId\`, \`messageType\` and \`senderDocumentId\`: copied from the notification
- \`to\`: the notification \`sender\`
- \`jobId\`: from the run
- \`result\`: \`REJECTED\` when the run status is \`FAILED\`. Otherwise \`ACCEPTED\` when there are no bad records, and \`PARTIALLY_ACCEPTED\` when there are some.
- \`counts\`: \`received\` (good plus bad), \`accepted\` (good) and \`rejected\` (bad)
- \`sentAt\`: the run \`finishedAt\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "notification": {
    "messageId": "N-20261118-0042",
    "messageType": "ReceivingAdvice",
    "senderDocumentId": "RA-55120",
    "sender": "DC-NORTH",
    "blobName": "inbound/receivingadvice/RA-55120.json"
  },
  "run": { "jobId": 90311, "status": "COMPLETED", "goodCount": 118, "badCount": 2, "finishedAt": "2026-11-18T09:12:44Z" }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "ackType": "FINAL",
  "originalMessageId": "N-20261118-0042",
  "messageType": "ReceivingAdvice",
  "senderDocumentId": "RA-55120",
  "to": "DC-NORTH",
  "jobId": 90311,
  "result": "PARTIALLY_ACCEPTED",
  "counts": { "received": 120, "accepted": 118, "rejected": 2 },
  "sentAt": "2026-11-18T09:12:44Z"
}`,
  },
  starterCode: `%dw 2.0
output application/json
var n = payload.notification
var run = payload.run
---
{
  ackType: "FINAL",
  originalMessageId: n.messageId,
  result: "ACCEPTED"
}
`,
  hints: [
    'Keep the notification and the run in two `var`s, so each field is a short selector.',
    'Check the failed status first, then the bad count: `if (...) "REJECTED" else if (...) "ACCEPTED" else "PARTIALLY_ACCEPTED"`.',
    '`received` is `run.goodCount + run.badCount`.',
  ],
  solution: `%dw 2.0
output application/json
var n = payload.notification
var run = payload.run
---
{
  ackType: "FINAL",
  originalMessageId: n.messageId,
  messageType: n.messageType,
  senderDocumentId: n.senderDocumentId,
  to: n.sender,
  jobId: run.jobId,
  result:
    if (run.status == "FAILED") "REJECTED"
    else if (run.badCount == 0) "ACCEPTED"
    else "PARTIALLY_ACCEPTED",
  counts: {
    received: run.goodCount + run.badCount,
    accepted: run.goodCount,
    rejected: run.badCount
  },
  sentAt: run.finishedAt
}`,
  explanation: `
**Two ACKs.** The hub sends a "received" ACK as soon as the notification passes its first checks, and this final ACK when the load ends. The sender then knows both that the message arrived and what happened to it.

**Ids the sender knows.** The sender matches the ACK to its own records by \`originalMessageId\` and \`senderDocumentId\`. The hub's own \`jobId\` is added so support on both sides can talk about the same run.

**Order of the checks.** A failed run is rejected whatever the counts say, so that test comes first. Only then do the bad records decide between full and partial acceptance.

**Counts that add up.** \`received\` is worked out from the other two, so the three numbers always agree. A partner can compare \`received\` with the number of records it sent.
`,
  tests: [
    {
      name: 'A failed run',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "notification": { "messageId": "N-7", "messageType": "Item", "senderDocumentId": "IT-901", "sender": "SUP-ALDER", "blobName": "inbound/item/IT-901.json" }, "run": { "jobId": 90400, "status": "FAILED", "goodCount": 0, "badCount": 0, "finishedAt": "2026-11-18T10:00:00Z" } }',
        },
      ],
      expected:
        '{ "ackType": "FINAL", "originalMessageId": "N-7", "messageType": "Item", "senderDocumentId": "IT-901", "to": "SUP-ALDER", "jobId": 90400, "result": "REJECTED", "counts": { "received": 0, "accepted": 0, "rejected": 0 }, "sentAt": "2026-11-18T10:00:00Z" }',
    },
    {
      name: 'Every record loaded',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "notification": { "messageId": "N-8", "messageType": "TransferOrder", "senderDocumentId": "TO-33", "sender": "DC-SOUTH", "blobName": "inbound/transferorder/TO-33.json" }, "run": { "jobId": 90401, "status": "COMPLETED", "goodCount": 40, "badCount": 0, "finishedAt": "2026-11-18T10:05:00Z" } }',
        },
      ],
      expected:
        '{ "ackType": "FINAL", "originalMessageId": "N-8", "messageType": "TransferOrder", "senderDocumentId": "TO-33", "to": "DC-SOUTH", "jobId": 90401, "result": "ACCEPTED", "counts": { "received": 40, "accepted": 40, "rejected": 0 }, "sentAt": "2026-11-18T10:05:00Z" }',
    },
  ],
  followUps: [
    {
      q: 'Why send a received ACK before the file is loaded?',
      a: 'Loading can take minutes. The early ACK tells the sender the notification passed its checks, so it does not resend while the load is still running.',
    },
    {
      q: 'The final ACK publish fails after the data is in Oracle. What now?',
      a: 'Record the failure in the job log and retry the publish on its own. Reloading the file would create duplicates, so the ACK retry must not repeat the load.',
    },
    {
      q: 'Should the ACK list every rejected record?',
      a: 'Usually only the counts and a reference. The partner can fetch the reject details from a report or a reject file, which keeps the queue message small.',
    },
  ],
}
