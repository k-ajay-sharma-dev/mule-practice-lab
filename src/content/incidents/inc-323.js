export default {
  id: 'inc-323',
  category: 'incidents',
  title: "Item Updates Apply Out of Order After Adding a Second Consumer",
  level: 'ADVANCED',
  tags: ["myproject","queues","ordering","planning-platform"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 INFO  [deploy] item-consumer replicas 1 to 2", relevant: true, why: "Scaling changed ordering." },
      { text: "2026-11-18 10:00:00 INFO  [item-consumer-1] Applied item=ITM-5520 version=7 status=DISCONTINUED", relevant: true, why: "Version 7 applied first." },
      { text: "2026-11-18 10:00:02 INFO  [item-consumer-2] Applied item=ITM-5520 version=6 status=ACTIVE", relevant: true, why: "Older version 6 applied after and overwrote it." },
      { text: "2026-11-18 10:05:00 WARN  [planning-export] Item ITM-5520 sent as ACTIVE", relevant: true, why: "Wrong status goes downstream." },
      { text: "2026-11-18 10:05:30 INFO  [item-consumer-1] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the item wrong?",
        options: [
          "Two consumers applied versions of one item in parallel and the older finished last",
          "The sender published version 6 after version 7, so the consumer order was right",
          "The planning export read the item before consumer 1 had committed version 7",
          "The second replica runs an older build that maps DISCONTINUED to ACTIVE",
        ],
        answer: 0,
        explain: "Parallel consumers break order per key.",
      },
      {
        type: 'single',
        prompt: "Which fix keeps two consumers?",
        options: [
          "Ignore an update when its version is older than the stored one",
          "Add a short delay in each consumer before applying an update",
          "Sort the items by last update time in the planning export",
          "Set prefetch to 1 on both consumers so they take turns",
        ],
        answer: 0,
        explain: "A version check makes arrival order irrelevant. A delay or prefetch of 1 still lets two consumers race.",
      },
      {
        type: 'multi',
        prompt: "Which other designs keep order per item?",
        options: [
          "Message groups keyed by item ID",
          "FIFO queues with a group ID per item",
          "Partitions by item ID, one consumer each",
          "More replicas sharing one plain queue",
        ],
        answer: [0,1,2],
        explain: "Order is needed per key, not globally.",
      },
      {
        type: 'single',
        prompt: "What must the sender include?",
        options: [
          "A version or sequence number per item",
          "A unique message ID on every message",
          "The time the consumer received it",
          "The name of the queue it was sent to",
        ],
        answer: 0,
        explain: "Without a version the receiver cannot tell old from new.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Correct ITM-5520",
          "Find other items hit",
          "Add the version check",
          "Add grouping by item",
          "Test with two consumers",
        ],
        explain: "Fix, find, guard, group, prove.",
      },
    ],
  },
  description: `
## Symptoms
- A discontinued item shows as active in the planning platform.

## Change / Context
- The item consumer was scaled to two replicas for speed.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 INFO  [deploy] item-consumer replicas 1 to 2
2026-11-18 10:00:00 INFO  [item-consumer-1] Applied item=ITM-5520 version=7 status=DISCONTINUED
2026-11-18 10:00:02 INFO  [item-consumer-2] Applied item=ITM-5520 version=6 status=ACTIVE
2026-11-18 10:05:00 WARN  [planning-export] Item ITM-5520 sent as ACTIVE
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
    "Parallel consumers can reorder messages.",
    "Order matters per key.",
    "Check versions before applying.",
    "Use groups or partitions by key.",
    "Senders must send versions.",
    "Test scaling changes.",
  ],
  solution: `
**Diagnosis.** Two consumers processed updates to one item in parallel. The older update finished last.

**Immediate mitigation.**
- Correct the item and find others.

**Root cause.** Scaling assumed order did not matter.

**Permanent fix.**
- Version checks and grouping by item.

**Prevention.** Ordering tests whenever consumers scale.
`,
  followUps: [
    { q: "What is a message group?", a: "A broker feature that sends all messages with one group key to the same consumer." },
    { q: "Is global order needed?", a: "Rarely. Order per business key is usually enough." },
    { q: "Where is the version stored?", a: "In the target row, compared on each update." },
    { q: "Does this slow things down?", a: "Grouping can. Version checks cost little." },
  ],
}
