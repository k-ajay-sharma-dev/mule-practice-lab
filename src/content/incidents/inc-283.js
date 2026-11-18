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
      { text: "2026-11-18 03:00:20 ERROR [msg-archive] java.lang.OutOfMemoryError: Java heap space", relevant: true, why: "Memory runs out." },
      { text: "2026-11-18 03:00:00 INFO  [msg-archive] payload converted to String before insert", relevant: true, why: "The flow builds a huge string." },
      { text: "2026-11-18 03:01:00 INFO  [runtime] Worker restarted", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does memory run out?",
        options: [
          "The 180 MB message is turned into one Java string before insert",
          "The CLOB is too small",
          "Oracle is slow",
          "The network",
        ],
        answer: 0,
        explain: "Strings hold everything in memory, often twice.",
      },
      {
        type: 'single',
        prompt: "What is better?",
        options: [
          "Stream the content into the LOB, or store the file in blob storage and keep a reference",
          "Use a bigger worker",
          "Compress in memory",
          "Skip archiving",
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
          "It is required by Oracle",
        ],
        answer: [0,1,2],
        explain: "A claim check pattern for archives.",
      },
      {
        type: 'single',
        prompt: "What does the table keep then?",
        options: [
          "The container, path, size and checksum",
          "Nothing",
          "The full file",
          "A copy in a VARCHAR2",
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
2026-11-18 03:00:20 ERROR [msg-archive] java.lang.OutOfMemoryError: Java heap space
2026-11-18 03:00:00 INFO  [msg-archive] payload converted to String before insert
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
