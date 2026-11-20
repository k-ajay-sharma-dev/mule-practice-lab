export default {
  id: 'inc-212',
  category: 'incidents',
  title: "A Two Million Message Backlog Knocks Over the ERP the Moment the Consumer Restarts",
  level: 'EXPERT',
  tags: ["myproject","queues","backlog","throttling","recovery","anypoint-mq"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [stock-consumer] Started after 9 hour outage queue depth=2100000", relevant: true, why: "A huge backlog is waiting." },
      { text: "2026-11-18 05:00:30 INFO  [stock-consumer] Replicas=4 concurrency=16 rate=1900/s", relevant: true, why: "Sixty-four parallel consumers drain it at full speed." },
      { text: "2026-11-18 05:02:10 ERROR [erp] Connection pool exhausted, response time 30 s", relevant: true, why: "The ERP cannot take that rate." },
      { text: "2026-11-18 05:03:00 ERROR [stock-consumer] ERP timeouts, messages nacked", relevant: true, why: "Timeouts cause redeliveries, adding more load." },
      { text: "2026-11-18 05:04:00 ERROR [store-app] Stock lookups failing", relevant: true, why: "Other ERP users are hit too." },
      { text: "2026-11-18 23:59:00 INFO  [stock-consumer] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the ERP fall over?",
        options: [
          "The drain ran at about 1,900 a second, far above the ERP’s 300",
          "Old messages in the backlog held stock values the ERP rejected",
          "The ERP was still finishing its own recovery from the outage",
          "Redeliveries from the outage doubled every message in the queue",
        ],
        answer: 0,
        explain: "Normal traffic never shows the limit. A backlog drain does.",
      },
      {
        type: 'single',
        prompt: "What limits the drain rate?",
        options: [
          "Replicas times concurrency, or a rate limit in the consumer",
          "The queue depth, since a deeper queue is drained faster",
          "The message TTL, which spreads old messages over time",
          "The ERP connection pool, which queues the extra calls safely",
        ],
        answer: 0,
        explain: "Set those to match the ERP capacity during recovery.",
      },
      {
        type: 'multi',
        prompt: "What makes a backlog drain safe?",
        options: [
          "A rate limit tied to the ERP capacity",
          "A circuit breaker that pauses on ERP errors",
          "Processing the newest stock first if only the latest value matters",
          "Raising concurrency so the backlog clears sooner",
        ],
        answer: [0,1,2],
        explain: "Pace it, pause on stress, and skip stale work when only the latest state matters.",
      },
      {
        type: 'single',
        prompt: "Stock updates are full snapshots per item. What can you skip?",
        options: [
          "Older updates for an item when a newer one is in the backlog",
          "Updates older than the outage start, since the ERP has those",
          "Updates for items with stock of zero, since nothing changed",
          "Every update after the first per item, since it set the level",
        ],
        answer: 0,
        explain: "If each message holds the full stock level, only the latest per item matters.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop or scale down the consumer",
          "Let the ERP recover",
          "Restart the drain with a rate limit and a circuit breaker",
          "Collapse stale updates per item if possible",
          "Write a recovery runbook with safe rates",
        ],
        explain: "Stop the harm, recover, drain safely, cut waste, then document.",
      },
    ],
  },
  description: `
## Symptoms
- After a nine hour outage, the stock consumer restarted. Within two minutes the ERP slowed to a halt and store apps failed.

## Change / Context
- The consumer runs on 4 replicas with concurrency 16, sized to clear normal peaks fast.
- The ERP handles about 300 stock updates a second.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [stock-consumer] Started after 9 hour outage queue depth=2100000
2026-11-18 05:00:30 INFO  [stock-consumer] Replicas=4 concurrency=16 rate=1900/s
2026-11-18 05:02:10 ERROR [erp] Connection pool exhausted, response time 30 s
2026-11-18 05:03:00 ERROR [stock-consumer] ERP timeouts, messages nacked
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
    "Backlog drains run at full consumer capacity.",
    "Consumer capacity can exceed what downstream can take.",
    "Rate limit the drain to downstream capacity.",
    "Pause on downstream errors.",
    "Skip stale updates when only the latest matters.",
    "Write a recovery runbook.",
  ],
  solution: `
**Diagnosis.** With 64 parallel consumers, the backlog drained at about 1,900 a second. The ERP takes about 300, so it fell over and timeouts made it worse.

**Immediate mitigation.**
- Scale the consumer down, let the ERP recover, then restart at a safe rate.

**Root cause.** The consumer was sized for speed with no limit tied to downstream capacity.

**Permanent fix.**
- Add a rate limit or lower concurrency matched to the ERP.
- Add a circuit breaker on ERP errors.
- Collapse updates to the latest per item when they are full snapshots.

**Prevention.** A runbook for draining backlogs and a load test of the drain.
`,
  followUps: [
    { q: "How do you work out a safe rate?", a: "Measure the ERP under load in test and leave room for other users." },
    { q: "Why not one consumer thread?", a: "At about 30 a second it would take most of a day while new updates keep arriving. Pace it to the ERP, not to the minimum." },
    { q: "Can the queue reorder for you?", a: "Not usually. Collapse stale updates in the consumer by item and timestamp." },
    { q: "What about other ERP users?", a: "Reserve capacity for them by keeping the drain well under the limit." },
  ],
}
