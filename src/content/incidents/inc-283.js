export default {
  id: 'inc-283',
  category: 'incidents',
  title: "Storing Large XML Messages in a CLOB Column Exhausts Memory",
  level: 'ADVANCED',
  tags: ["myproject","oracle","lob","large-files"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [msg-archive] Insert message size=180MB into MSG_ARCHIVE.BODY (CLOB)", relevant: true, why: "Large messages are archived." },
      { text: "2026-11-18 03:00:01 INFO  [msg-archive] payload converted to String before insert", relevant: true, why: "The flow builds a huge string." },
      { text: "2026-11-18 03:00:20 ERROR [msg-archive] java.lang.OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 03:01:00 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does memory run out?",
        options: [
          "The 180 MB message is turned into one Java string before insert",
          "The CLOB column cannot hold a value larger than 128 MB",
          "Oracle returns the insert slowly and the worker times out",
          "The JDBC driver reads the whole archive table into memory",
        ],
        answer: 0,
        explain: "Strings hold everything in memory, often twice.",
      },
      {
        type: 'single',
        prompt: "What is better?",
        options: [
          "Stream into the LOB, or keep the file in blob storage with a reference",
          "Double the worker heap so a 180 MB string fits in memory",
          "Compress the full string in memory before the insert runs",
          "Stop archiving messages and rely on the source system logs",
        ],
        answer: 0,
        explain: "Stream or move it out.",
      },
      {
        type: 'multi',
        prompt: "Why store large files outside the database?",
        options: [
          "Smaller backups",
          "Cheaper storage",
          "Faster queries on the table",
          "Oracle refuses LOB values over 100 MB",
        ],
        answer: [0,1,2],
        explain: "A claim check pattern for archives.",
      },
      {
        type: 'single',
        prompt: "What does the table keep then?",
        options: [
          "The container, path, size and checksum",
          "Only the file name, since the path never changes",
          "A second copy of the full message for fast reads",
          "The first 4,000 characters in a VARCHAR2 column",
        ],
        answer: 0,
        explain: "Enough to find and verify the file.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Skip archiving large messages for now",
          "Change to streaming or a blob reference",
          "Test with 200 MB",
          "Migrate existing large rows",
          "Alert on message size",
        ],
        explain: "Contain, fix, test, migrate, watch.",
      },
    ],
  },
  description: `
## Symptoms
- The archive worker crashes on large messages.

## Change / Context
- Every message is archived in a CLOB column.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [msg-archive] Insert message size=180MB into MSG_ARCHIVE.BODY (CLOB)
2026-11-18 03:00:01 INFO  [msg-archive] payload converted to String before insert
2026-11-18 03:00:20 ERROR [msg-archive] java.lang.OutOfMemoryError: Java heap space
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
    "Large strings exhaust memory.",
    "Stream into LOBs.",
    "Or store files outside and keep references.",
    "Keep path, size and checksum.",
    "Test with large files.",
    "Alert on size.",
  ],
  solution: `
**Diagnosis.** The flow turns a 180 MB message into a string, and the heap runs out.

**Immediate mitigation.**
- Skip large ones for now.

**Root cause.** Archive design assumed small messages.

**Permanent fix.**
- Stream to a LOB or store in blob storage with a reference.

**Prevention.** Size alerts and large tests.
`,
  followUps: [
    { q: "What is a claim check?", a: "Store the large content elsewhere and pass a reference." },
    { q: "Can JDBC stream LOBs?", a: "Yes, with stream based setters." },
    { q: "How long to keep archives?", a: "Per retention rules." },
    { q: "Where else does this pattern appear?", a: "In the inbound hub, where notifications point to blobs." },
  ],
}
