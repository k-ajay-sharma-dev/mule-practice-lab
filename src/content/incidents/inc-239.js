export default {
  id: 'inc-239',
  category: 'incidents',
  title: "The SFTP Listener Reads Half Written Files From the Store System",
  level: 'BEGINNER',
  tags: ["myproject","sftp","listener","file-age"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 21:00:02 INFO  [store-sales] New file /in/sales_S041.csv sizeBytes=65536", relevant: true, why: "The listener picked a file mid upload." },
      { text: "2026-11-18 21:00:03 ERROR [store-sales] CSV parse failed line=812 unexpected end of record", relevant: true, why: "The last line is cut." },
      { text: "2026-11-18 21:00:09 INFO  [sftp-server] Upload complete /in/sales_S041.csv sizeBytes=241800", relevant: true, why: "The upload finished six seconds later." },
      { text: "2026-11-18 21:00:02 INFO  [store-sales] timeBetweenSizeCheck not set", relevant: true, why: "No size check is configured." },
      { text: "2026-11-18 23:59:00 INFO  [store-sales] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does parsing fail?",
        options: [
          "The listener read the file before the upload finished",
          "The CSV is malformed",
          "The encoding is wrong",
          "The server is slow",
        ],
        answer: 0,
        explain: "The file grew after the read.",
      },
      {
        type: 'single',
        prompt: "Which listener setting helps?",
        options: [
          "A time between size checks, so the file must stop growing before it is read",
          "A higher polling frequency",
          "autoDelete",
          "A bigger worker",
        ],
        answer: 0,
        explain: "The connector checks the size twice and skips files still changing.",
      },
      {
        type: 'multi',
        prompt: "What else signals a complete file?",
        options: [
          "The sender uploads with a temp name and renames",
          "A done file uploaded after the data file",
          "A trailer with a row count",
          "A random delay",
        ],
        answer: [0,1,2],
        explain: "Agree a signal with the sender.",
      },
      {
        type: 'single',
        prompt: "What happens to the failed file?",
        options: [
          "Process it again once complete, and make sure it is not lost",
          "Delete it",
          "Ignore it",
          "Rename it to .bad forever",
        ],
        answer: 0,
        explain: "The data is valid once complete.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Reprocess the failed file",
          "Set a size check on the listener",
          "Agree temp name and rename with stores",
          "Add a trailer check",
          "Watch parse errors per store",
        ],
        explain: "Recover, fix, agree, check, watch.",
      },
    ],
  },
  description: `
## Symptoms
- Some stores show parse errors every night, and their sales go missing.

## Change / Context
- Stores upload sales over a slow link. Mule uses the SFTP On New or Updated File listener.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 21:00:02 INFO  [store-sales] New file /in/sales_S041.csv sizeBytes=65536
2026-11-18 21:00:03 ERROR [store-sales] CSV parse failed line=812 unexpected end of record
2026-11-18 21:00:09 INFO  [sftp-server] Upload complete /in/sales_S041.csv sizeBytes=241800
2026-11-18 21:00:02 INFO  [store-sales] timeBetweenSizeCheck not set
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
    "A listener can see a file mid upload.",
    "Size checks skip growing files.",
    "Temp name and rename is best.",
    "Trailers prove completeness.",
    "Reprocess failed files.",
    "Watch errors per sender.",
  ],
  solution: `
**Diagnosis.** The listener reads files while stores are still uploading them.

**Immediate mitigation.**
- Reprocess the files once complete.

**Root cause.** No completeness signal and no size check.

**Permanent fix.**
- Set a size check and agree temp names with rename.

**Prevention.** Trailer counts and a per store error alert.
`,
  followUps: [
    { q: "Does a size check cost much?", a: "It adds a short wait and an extra list per file." },
    { q: "Why is rename best?", a: "A rename is atomic, so readers see only complete files." },
    { q: "What if the sender cannot rename?", a: "Use a done file or a size check." },
    { q: "What is a watermark?", a: "A setting that makes the listener only pick files newer than the last seen time." },
  ],
}
