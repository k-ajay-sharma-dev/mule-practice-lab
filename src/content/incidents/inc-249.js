export default {
  id: 'inc-249',
  category: 'incidents',
  title: "Files Go Missing During the Move to a New SFTP Server",
  level: 'EXPERT',
  tags: ["myproject","sftp","migration","cutover"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 20:00:00 INFO  [ops] DNS sftp.brindle.example now points to new server", relevant: true, why: "The DNS changed during the evening." },
      { text: "2026-11-18 20:05:00 INFO  [partner-x] Upload ok /in/orders_X_2001.csv (old server cached IP)", relevant: true, why: "A partner still writes to the old server." },
      { text: "2026-11-18 20:10:00 INFO  [order-in] Poll new server found=0", relevant: true, why: "Mule reads only the new server." },
      { text: "2026-11-19 08:00:00 WARN  [customer-service] Orders missing from partner X since 20:00", relevant: true, why: "Orders are stuck on the old server." },
      { text: "2026-11-18 23:59:00 INFO  [ops] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Where are the missing files?",
        options: [
          "On the old server, because some partners still resolve the old address",
          "Deleted",
          "In Mule memory",
          "On the new server",
        ],
        answer: 0,
        explain: "DNS changes take time to reach every client.",
      },
      {
        type: 'single',
        prompt: "What should the cutover plan include?",
        options: [
          "Polling both servers until every partner has moved",
          "Switching off the old server at once",
          "Changing DNS only",
          "Telling no one",
        ],
        answer: 0,
        explain: "Run both sides in parallel for a while.",
      },
      {
        type: 'multi',
        prompt: "What else belongs in the plan?",
        options: [
          "Each partner confirms they reach the new server",
          "Host key fingerprints shared before cutover",
          "A sweep of the old server after the switch",
          "A big bang with no rollback",
        ],
        answer: [0,1,2],
        explain: "Plan per partner and sweep.",
      },
      {
        type: 'single',
        prompt: "Why share fingerprints early?",
        options: [
          "Partners will see a new host key and must trust it",
          "For billing",
          "For speed",
          "It is optional",
        ],
        answer: 0,
        explain: "Otherwise partners fail on the key change.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Collect files from the old server",
          "Process them",
          "Poll both servers for now",
          "Confirm each partner moved",
          "Switch off the old server",
        ],
        explain: "Recover, process, bridge, confirm, retire.",
      },
    ],
  },
  description: `
## Symptoms
- Orders from partner X are missing since the SFTP move.

## Change / Context
- The SFTP server was replaced by changing DNS in the evening.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 20:00:00 INFO  [ops] DNS sftp.brindle.example now points to new server
2026-11-18 20:05:00 INFO  [partner-x] Upload ok /in/orders_X_2001.csv (old server cached IP)
2026-11-18 20:10:00 INFO  [order-in] Poll new server found=0
2026-11-19 08:00:00 WARN  [customer-service] Orders missing from partner X since 20:00
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
    "DNS changes are not instant for every client.",
    "Run old and new in parallel.",
    "Confirm each partner.",
    "Share host key fingerprints early.",
    "Sweep the old server.",
    "Plan a rollback.",
  ],
  solution: `
**Diagnosis.** Some partners still write to the old server. Mule reads only the new one.

**Immediate mitigation.**
- Collect and process files from the old server.

**Root cause.** The cutover assumed DNS changes are instant.

**Permanent fix.**
- Poll both servers until every partner confirms.

**Prevention.** A partner by partner cutover checklist with a sweep.
`,
  followUps: [
    { q: "Why do partners cache DNS?", a: "Clients and resolvers keep records until the TTL ends, and some longer." },
    { q: "Should the TTL be lowered first?", a: "Yes, days before the change." },
    { q: "Can partners allow list IPs?", a: "Yes, so they need the new IP before cutover too." },
    { q: "How long to keep the old server?", a: "Until every partner confirms and a sweep finds nothing." },
  ],
}
