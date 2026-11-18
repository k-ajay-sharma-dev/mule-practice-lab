export default {
  id: 'inc-208',
  category: 'incidents',
  title: "The EU Consumer Receives Nothing: a JMS Selector Uses region but the Property Is Region",
  level: 'INTERMEDIATE',
  tags: ["myproject","queues","jms","selectors","routing"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 08:10:00 INFO  [eu-consumer] Listening queue=shipments selector=region = 'EU'", relevant: true, why: "The selector asks for a property named region." },
      { text: "2026-11-18 08:10:05 INFO  [shipment-publisher] Sent shipmentId=SH-401 properties={Region=EU}", relevant: true, why: "The publisher sets Region with a capital R." },
      { text: "2026-11-18 08:15:00 INFO  [broker] Queue shipments depth=2210", relevant: true, why: "Messages pile up because no consumer matches them." },
      { text: "2026-11-18 08:15:00 INFO  [us-consumer] Listening selector=Region = 'US' received=880", relevant: true, why: "The US consumer uses the right name and works." },
      { text: "2026-11-18 08:16:00 INFO  [broker] Memory 30%", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the EU consumer get nothing?",
        options: [
          "Selector property names are case sensitive, and region does not match Region",
          "EU shipments stopped",
          "The EU consumer is on the wrong broker",
          "Selectors only work on topics",
        ],
        answer: 0,
        explain: "The selector looks for a property that no message has, so it matches nothing.",
      },
      {
        type: 'single',
        prompt: "Where do the EU messages go?",
        options: [
          "They stay on the queue, because no consumer selects them",
          "To the US consumer",
          "To the DLQ",
          "They expire at once",
        ],
        answer: 0,
        explain: "Messages wait until a consumer whose selector matches takes them, or until they expire.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "A shared constant or contract for property names",
          "A test that sends a message and checks the right consumer gets it",
          "An alert on queue depth",
          "Using lower case everywhere by guess",
        ],
        answer: [0,1,2],
        explain: "Agree the names in one place, test the routing, and watch for growth.",
      },
      {
        type: 'single',
        prompt: "What risk do selectors add on a shared queue?",
        options: [
          "Messages that match no selector wait forever and can hit the TTL",
          "They speed up the broker",
          "They encrypt messages",
          "None",
        ],
        answer: 0,
        explain: "Unmatched messages go unnoticed without a depth alert.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix the selector to Region",
          "Restart the EU consumer",
          "Watch the queue drain",
          "Check for messages close to expiry",
          "Add a routing test per region",
        ],
        explain: "Fix, restart, confirm, look for losses, then test.",
      },
    ],
  },
  description: `
## Symptoms
- A new EU shipment consumer was deployed today. EU shipments are not processed.
- The shipments queue grows all morning.

## Change / Context
- Several consumers share one queue, each with a JMS selector on the region property.
- The publisher sets the property \`Region\`.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 08:10:00 INFO  [eu-consumer] Listening queue=shipments selector=region = 'EU'
2026-11-18 08:10:05 INFO  [shipment-publisher] Sent shipmentId=SH-401 properties={Region=EU}
2026-11-18 08:15:00 INFO  [broker] Queue shipments depth=2210
2026-11-18 08:15:00 INFO  [us-consumer] Listening selector=Region = 'US' received=880
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
    "JMS selector identifiers are case sensitive.",
    "Messages that match no selector stay on the queue.",
    "Agree property names in a shared contract.",
    "Test routing for each region.",
    "Alert on queue depth.",
    "Unmatched messages can expire.",
  ],
  solution: `
**Diagnosis.** The selector uses \`region\`, but messages carry \`Region\`. No message matches, so EU shipments stay on the queue.

**Immediate mitigation.**
- Correct the selector and restart the consumer.
- Check that no EU message expired while waiting.

**Root cause.** The property name was typed from memory, not taken from the publisher contract.

**Permanent fix.**
- Define property names in a shared contract or library used by publisher and consumers.

**Prevention.** A routing test per region in the pipeline and an alert on queue depth.
`,
  followUps: [
    { q: "Would separate queues per region be better?", a: "Often yes. They are clearer to monitor and need no selectors." },
    { q: "Are selector values case sensitive too?", a: "Yes, string values compare exactly." },
    { q: "What does a selector cost?", a: "The broker must check each message against each consumer selector." },
    { q: "How do you find unmatched messages?", a: "Browse the queue and compare message properties with the consumers’ selectors." },
  ],
}
