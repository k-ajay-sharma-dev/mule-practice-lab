export default {
  id: 'inc-206',
  category: 'incidents',
  title: "Messages Vanish During a Long Consumer Outage: the Queue Time to Live Was Shorter Than the Migration",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","anypoint-mq","ttl","migration"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-06 09:00:00 INFO  [invoice-consumer] Stopped for ERP migration", relevant: true, why: "The consumer was stopped for a long migration." },
      { text: "2026-11-11 18:00:00 INFO  [anypoint-mq] Queue invoices-in defaultTtl=2 days", relevant: true, why: "Messages expire after two days on this queue." },
      { text: "2026-11-12 09:00:00 INFO  [invoice-consumer] Started", relevant: true, why: "The consumer returned six days later." },
      { text: "2026-11-12 09:00:05 INFO  [anypoint-mq] Queue invoices-in depth=1710 published since stop=5120", relevant: true, why: "Most messages expired before the consumer returned." },
      { text: "2026-11-12 09:01:00 INFO  [invoice-consumer] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are about 3,400 invoices missing?",
        options: [
          "They waited longer than the queue time to live and expired",
          "The publisher stopped sending once the consumer was down",
          "The consumer read them on start but failed to post them to the ERP",
          "The queue hit its size limit and rejected new invoices",
        ],
        answer: 0,
        explain: "Messages older than the queue TTL are removed whether anyone read them or not.",
      },
      {
        type: 'single',
        prompt: "Where should the expired messages have gone?",
        options: [
          "Nowhere, as expiry deletes them unless you keep a copy elsewhere",
          "To the queue’s DLQ, which receives every expired message",
          "Back to the publisher, which is told about each expiry",
          "To a hidden archive that keeps them for 30 days after expiry",
        ],
        answer: 0,
        explain: "Do not assume expired messages land in a DLQ. Check how your broker treats expiry.",
      },
      {
        type: 'multi',
        prompt: "How do you recover the invoices?",
        options: [
          "Ask the source system to resend invoices from the stop date",
          "Compare invoices sent with invoices received in the ERP",
          "Check the queue for any that remain",
          "Raise the queue TTL so the expired ones come back",
        ],
        answer: [0,1,2],
        explain: "Recovery comes from the source. A queue is not a long-term store.",
      },
      {
        type: 'single',
        prompt: "What should happen before a long planned outage?",
        options: [
          "Check the TTL against the outage length, and raise it or pause the producer",
          "Raise the queue’s maximum delivery count so messages are kept longer",
          "Purge the queue so that the consumer starts clean after the outage",
          "Add a DLQ to the queue so that expired messages are kept there",
        ],
        answer: 0,
        explain: "Planned outages must fit inside the TTL.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "List invoices sent since the stop date",
          "Ask the source to resend the missing ones",
          "Raise the queue TTL to cover planned outages",
          "Add queue TTL to the outage checklist",
          "Alert on message age",
        ],
        explain: "Recover, fix the setting, then make it part of planning.",
      },
    ],
  },
  description: `
## Symptoms
- After a six day ERP migration, about two thirds of supplier invoices sent in that time never arrived.

## Change / Context
- The invoice consumer was stopped for the migration.
- The queue was created with a time to live of two days.
- The producer kept publishing during the outage.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-06 09:00:00 INFO  [invoice-consumer] Stopped for ERP migration
2026-11-11 18:00:00 INFO  [anypoint-mq] Queue invoices-in defaultTtl=2 days
2026-11-12 09:00:00 INFO  [invoice-consumer] Started
2026-11-12 09:00:05 INFO  [anypoint-mq] Queue invoices-in depth=1710 published since stop=5120
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
    "Messages older than the queue TTL are removed.",
    "Do not assume expired messages go to a DLQ.",
    "A queue is not a long-term store.",
    "Check TTL before planned outages.",
    "Recover from the source system.",
    "Alert on message age.",
  ],
  solution: `
**Diagnosis.** The consumer was off for six days. The queue TTL is two days, so older invoices expired before it returned.

**Immediate mitigation.**
- Ask the source system to resend invoices from the stop date and compare with the ERP.

**Root cause.** The migration plan did not include the queue TTL, and nobody watched message age.

**Permanent fix.**
- Set the TTL longer than any planned outage, within the broker limits.
- Or pause the producer during long outages.

**Prevention.** Add queue settings to the outage checklist and alert when the oldest message passes a set age.
`,
  followUps: [
    { q: "Why have a TTL at all?", a: "To stop old messages that nobody will read from piling up forever." },
    { q: "Can a message have its own TTL?", a: "Yes, a publisher can set a shorter TTL for messages that go stale fast." },
    { q: "What if the outage cannot fit?", a: "Park messages in a durable store, such as a database or blob storage, and replay later." },
    { q: "How do you prove nothing is missing?", a: "Reconcile counts or IDs between source and target." },
  ],
}
