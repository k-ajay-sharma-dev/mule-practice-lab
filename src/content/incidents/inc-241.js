export default {
  id: 'inc-241',
  category: 'incidents',
  title: "Two Copies of Every Store File Reach the Warehouse After Moving to a Two Node Cluster",
  level: 'INTERMEDIATE',
  tags: ["myproject","sftp","cluster","primary-node"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:01 INFO  [store-in] node=A New file /in/rcv_S120.csv", relevant: true, why: "Node A took the file." },
      { text: "2026-11-18 09:00:01 INFO  [store-in] node=B New file /in/rcv_S120.csv", relevant: true, why: "Node B took it too." },
      { text: "2026-11-18 09:00:04 WARN  [store-in] node=B Move failed, file not found", relevant: true, why: "Node A already moved it." },
      { text: "2026-11-18 09:00:05 INFO  [wms] Receipt posted twice store=S120", relevant: true, why: "Downstream got two copies." },
      { text: "2026-11-18 23:59:00 INFO  [store-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are files processed twice?",
        options: [
          "The listener runs on both nodes and both read the file before either moves it",
          "The store system uploaded each receipt file twice under one name",
          "The WMS retries each post because the first response timed out",
          "The archive move is slow, so the next poll on node A sees it again",
        ],
        answer: 0,
        explain: "Both nodes poll the same folder.",
      },
      {
        type: 'single',
        prompt: "What is the standard fix?",
        options: [
          "Set the listener to run on the primary node only",
          "Add a fixed start delay to the listener on node B",
          "Raise the polling frequency so files move sooner",
          "Turn off the archive move on both nodes",
        ],
        answer: 0,
        explain: "One poller per cluster.",
      },
      {
        type: 'multi',
        prompt: "What makes the receipt safe even so?",
        options: [
          "Check a business key such as receipt ID before posting",
          "Lock each file name in a shared object store",
          "Claim each file by moving it first, then process",
          "Raise the polling frequency so one node always wins",
        ],
        answer: [0,1,2],
        explain: "Idempotency and claims protect against repeats.",
      },
      {
        type: 'single',
        prompt: "Why did node B fail to move?",
        options: [
          "Node A had already moved the file",
          "The archive path on node B was wrong",
          "Node B had no write right on /in",
          "The SFTP server disk was full",
        ],
        answer: 0,
        explain: "The failed move is the clue.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove duplicate receipts",
          "Set primary node only",
          "Add a receipt ID check",
          "Test failover of the primary",
          "Watch for move failures",
        ],
        explain: "Clean, fix, harden, test, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The warehouse sees two receipts for many stores.

## Change / Context
- The app moved from one runtime to a two node cluster.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:01 INFO  [store-in] node=A New file /in/rcv_S120.csv
2026-11-18 09:00:01 INFO  [store-in] node=B New file /in/rcv_S120.csv
2026-11-18 09:00:04 WARN  [store-in] node=B Move failed, file not found
2026-11-18 09:00:05 INFO  [wms] Receipt posted twice store=S120
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
    "Polling sources run on every node unless told otherwise.",
    "Use primary node only for SFTP listeners in a cluster.",
    "Claim files with a move.",
    "Make posting idempotent.",
    "Move failures hint at races.",
    "Test failover.",
  ],
  solution: `
**Diagnosis.** Both cluster nodes poll the folder and pick the same file.

**Immediate mitigation.**
- Remove duplicates in the WMS.

**Root cause.** The listener runs on all nodes.

**Permanent fix.**
- Primary node only, plus an idempotent check on receipt ID.

**Prevention.** Review polling sources whenever moving to a cluster.
`,
  followUps: [
    { q: "What happens if the primary fails?", a: "Another node becomes primary and starts polling." },
    { q: "Does CloudHub have the same issue?", a: "Yes with more than one replica, use primary node only or a lock." },
    { q: "Why still check receipt IDs?", a: "Failover or retries can still cause repeats." },
    { q: "What does the move error tell you?", a: "That another process already handled the file." },
  ],
}
