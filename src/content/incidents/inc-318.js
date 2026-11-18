export default {
  id: 'inc-318',
  category: 'incidents',
  title: "Large Inbound Messages Time Out Before the Hub Sends an Acknowledgement",
  level: 'ADVANCED',
  tags: ["myproject","large-files","blue-yonder","claim-check","azure-blob"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [hub] Notification received messageId=N-9120 blob size=850MB", relevant: true, why: "A very large blob." },
      { text: "2026-11-18 03:00:00 INFO  [hub] Download and validate before ACK", relevant: true, why: "The hub downloads first." },
      { text: "2026-11-18 03:05:00 WARN  [sender] No RECEIVED ack in 5 minutes, resending", relevant: true, why: "The sender gives up waiting." },
      { text: "2026-11-18 03:06:00 INFO  [hub] Duplicate messageId=N-9120 rejected", relevant: true, why: "The resend is a duplicate." },
      { text: "2026-11-18 23:59:00 INFO  [hub] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the sender resend?",
        options: [
          "The hub downloads 850 MB before sending RECEIVED, which takes longer than the sender waits",
          "The sender is broken",
          "The queue is slow",
          "Auth",
        ],
        answer: 0,
        explain: "The ack waits on heavy work.",
      },
      {
        type: 'single',
        prompt: "What should the hub ack after?",
        options: [
          "Light checks only: notification valid, not duplicate, blob exists",
          "The full download",
          "The final load",
          "Nothing",
        ],
        answer: 0,
        explain: "Ack receipt fast, process later.",
      },
      {
        type: 'multi',
        prompt: "Which checks are light?",
        options: [
          "Schema of the small notification",
          "Duplicate message ID lookup",
          "Blob exists and its size",
          "Full content validation",
        ],
        answer: [0,1,2],
        explain: "Content validation comes after RECEIVED.",
      },
      {
        type: 'single',
        prompt: "What tells the sender about content errors?",
        options: [
          "A later ack such as REJECTED or COMPLETED with reasons",
          "Nothing",
          "An email",
          "The first ack",
        ],
        answer: 0,
        explain: "Two stage acks.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Ack N-9120 so the sender stops",
          "Move download after RECEIVED",
          "Test with an 850 MB blob",
          "Agree timeouts with the sender",
          "Watch ack latency",
        ],
        explain: "Stop resends, fix, test, agree, watch.",
      },
    ],
  },
  description: `
## Symptoms
- A sender keeps resending large messages.

## Change / Context
- The hub receives notifications that point to blobs, and acks them.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [hub] Notification received messageId=N-9120 blob size=850MB
2026-11-18 03:00:00 INFO  [hub] Download and validate before ACK
2026-11-18 03:05:00 WARN  [sender] No RECEIVED ack in 5 minutes, resending
2026-11-18 03:06:00 INFO  [hub] Duplicate messageId=N-9120 rejected
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
    "Ack receipt quickly.",
    "Do heavy work after the first ack.",
    "Use light checks first.",
    "Send a final ack later.",
    "Agree timeouts.",
    "Watch ack latency.",
  ],
  solution: `
**Diagnosis.** The hub waits for a full 850 MB download before RECEIVED, past the sender timeout.

**Immediate mitigation.**
- Ack and stop resends.

**Root cause.** Heavy work before the receipt ack.

**Permanent fix.**
- Light checks, then RECEIVED, then process.

**Prevention.** Ack latency alerts.
`,
  followUps: [
    { q: "Why not raise the sender timeout?", a: "It helps, but the design should not depend on file size." },
    { q: "What if the blob is corrupt?", a: "Send REJECTED later with the reason." },
    { q: "How do you check blob size cheaply?", a: "Read its properties, not its content." },
    { q: "Where is ack state kept?", a: "In the job log tables." },
  ],
}
