export default {
  id: 'inc-207',
  category: 'incidents',
  title: "Large Product Catalogues Fail to Publish: the Message Is Over the Anypoint MQ Size Limit",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","anypoint-mq","message-size","claim-check"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:02 INFO  [catalog-sync] Built catalogue supplierId=SP-22 items=48000 sizeMB=14", relevant: true, why: "The message is 14 MB." },
      { text: "2026-11-18 06:00:03 ERROR [catalog-sync] Publish failed queue=catalog-updates reason=payload too large", relevant: true, why: "The broker refuses it." },
      { text: "2026-11-18 06:00:03 INFO  [catalog-sync] Built catalogue supplierId=SP-07 items=900 sizeMB=0.3", relevant: false },
      { text: "2026-11-18 06:00:04 INFO  [catalog-sync] Published supplierId=SP-07", relevant: true, why: "Small catalogues still work." },
      { text: "2026-11-18 06:01:00 INFO  [catalog-sync] Run finished published=41 failed=1", relevant: true, why: "Only the big supplier fails." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does one supplier fail every day?",
        options: [
          "Its catalogue message is larger than the queue allows",
          "The supplier is blocked",
          "The queue is full",
          "The supplier has no items",
        ],
        answer: 0,
        explain: "Brokers limit message size. Anypoint MQ has a per-message size limit that a 14 MB message exceeds.",
      },
      {
        type: 'single',
        prompt: "What is the claim check pattern?",
        options: [
          "Store the large data in storage and send a small message with a reference to it",
          "Compress until it fits",
          "Split into random pieces",
          "Send by email",
        ],
        answer: 0,
        explain: "The queue carries the pointer. The consumer fetches the data from storage.",
      },
      {
        type: 'multi',
        prompt: "Which designs fit?",
        options: [
          "Write the catalogue to blob storage and publish its location",
          "Split into one message per batch of items, with a sequence and total",
          "Send only changed items each day",
          "Raise the limit in the publisher config",
        ],
        answer: [0,1,2],
        explain: "Each keeps messages small. A client cannot raise the broker limit.",
      },
      {
        type: 'single',
        prompt: "What must the consumer handle with a claim check?",
        options: [
          "The stored file being missing or already processed",
          "Nothing new",
          "Larger messages",
          "A different queue",
        ],
        answer: 0,
        explain: "The data now lives elsewhere, so the consumer must cope with it being late, gone or seen before.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the size against the broker limit",
          "Store large catalogues in blob storage",
          "Publish a message with the blob location",
          "Update the consumer to download and process it",
          "Clean up stored files after processing",
        ],
        explain: "Confirm, then build both sides of the claim check, then clean up.",
      },
    ],
  },
  description: `
## Symptoms
- One large supplier’s catalogue never updates. All other suppliers are fine.

## Change / Context
- The sync job publishes each supplier’s whole catalogue as one Anypoint MQ message.
- The supplier grew from 5,000 to 48,000 items this year.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:02 INFO  [catalog-sync] Built catalogue supplierId=SP-22 items=48000 sizeMB=14
2026-11-18 06:00:03 ERROR [catalog-sync] Publish failed queue=catalog-updates reason=payload too large
2026-11-18 06:00:04 INFO  [catalog-sync] Published supplierId=SP-07
2026-11-18 06:01:00 INFO  [catalog-sync] Run finished published=41 failed=1
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    "Brokers limit message size.",
    "Large data belongs in storage, with a reference on the queue.",
    "Splitting into smaller messages also works.",
    "Sending only changes keeps messages small.",
    "The consumer must handle missing stored data.",
    "Clean up stored files.",
  ],
  solution: `
**Diagnosis.** The supplier’s catalogue grew to 14 MB, larger than the queue allows, so the broker rejects it.

**Immediate mitigation.**
- Send this supplier’s catalogue through a claim check or in parts until the change is released.

**Root cause.** The design assumed whole catalogues would always be small.

**Permanent fix.**
- Write large catalogues to blob storage and publish a message with the location and checksum.
- Or send only changed items, in batches.

**Prevention.** Log message sizes and alert as they approach the limit.
`,
  followUps: [
    { q: "Would compression help?", a: "For a while. Data keeps growing, so it only delays the problem." },
    { q: "Where should the claim check data live?", a: "In durable storage both apps can reach, such as blob storage, with a retention rule." },
    { q: "What goes in the message?", a: "The location, size, checksum and a business ID." },
    { q: "How do you split safely?", a: "Add a batch ID, sequence and total so the consumer knows when it has all parts." },
  ],
}
