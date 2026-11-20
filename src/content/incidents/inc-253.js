export default {
  id: 'inc-253',
  category: 'incidents',
  title: "The Sales Feed to the Planning Platform Sends a File Twice After a Timeout",
  level: 'INTERMEDIATE',
  tags: ["myproject","ftp","planning-platform","sales","rename"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 04:00:00 INFO  [sales-out] Upload start /in/sales_20261118.dat", relevant: true, why: "Upload begins." },
      { text: "2026-11-18 04:02:00 ERROR [sales-out] Upload failed SocketTimeoutException, retrying", relevant: true, why: "The client timed out." },
      { text: "2026-11-18 04:02:00 INFO  [ftp-server] Transfer complete sales_20261118.dat", relevant: true, why: "The server got the whole file." },
      { text: "2026-11-18 04:03:00 INFO  [sales-out] Upload ok /in/sales_20261118_r1.dat", relevant: true, why: "The retry used a new name, so there are two files." },
      { text: "2026-11-18 23:59:00 INFO  [sales-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did the platform get two files?",
        options: [
          "The first upload finished, but the client timed out and retried under a new name",
          "The FTP server kept a partial copy and later completed it as a second file",
          "The platform imported sales_20261118.dat twice on two polls",
          "The scheduler started the 04:00 job twice, once per node",
        ],
        answer: 0,
        explain: "A timeout does not prove failure.",
      },
      {
        type: 'single',
        prompt: "What makes the retry safe?",
        options: [
          "Upload to a fixed temp name, then rename it to the final name",
          "Give each retry a new name with an _rN suffix",
          "Turn off retries and send the file by hand on failure",
          "Wait ten minutes before each retry of the upload",
        ],
        answer: 0,
        explain: "One final name, written once.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Check whether the final file exists before retrying",
          "A run ID in the trailer so the platform skips repeats",
          "Raise the timeout for large files",
          "Delete any _r1 files from the folder once a week",
        ],
        answer: [0,1,2],
        explain: "Idempotent sends and checks.",
      },
      {
        type: 'single',
        prompt: "Why does a timeout not mean failure?",
        options: [
          "The server may finish the transfer after the client gives up",
          "FTP servers ignore the client’s socket timeout",
          "The server always rolls back a timed out upload file",
          "The client resends lost packets after a timeout",
        ],
        answer: 0,
        explain: "The result is unknown.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell the platform to drop the second file",
          "Change the upload to temp name and rename",
          "Check for an existing file before retry",
          "Add a run ID in the trailer",
          "Review timeouts for large files",
        ],
        explain: "Contain, fix, harden.",
      },
    ],
  },
  description: `
## Symptoms
- The planning platform counted yesterday’s sales twice.

## Change / Context
- Sales go to the planning platform over FTP each night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 04:00:00 INFO  [sales-out] Upload start /in/sales_20261118.dat
2026-11-18 04:02:00 ERROR [sales-out] Upload failed SocketTimeoutException, retrying
2026-11-18 04:02:00 INFO  [ftp-server] Transfer complete sales_20261118.dat
2026-11-18 04:03:00 INFO  [sales-out] Upload ok /in/sales_20261118_r1.dat
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
    "A timeout leaves the result unknown.",
    "Retries must be idempotent.",
    "Temp name and rename.",
    "Check before retrying.",
    "Run IDs let the receiver skip repeats.",
    "Size timeouts for large files.",
  ],
  solution: `
**Diagnosis.** The upload finished on the server but the client timed out, then retried under a new name.

**Immediate mitigation.**
- Ask the platform to drop the duplicate.

**Root cause.** Retries create new files instead of replacing one.

**Permanent fix.**
- Temp name, rename, and a check before retry.

**Prevention.** A run ID the receiver can use to skip repeats.
`,
  followUps: [
    { q: "Why not raise the timeout only?", a: "It helps, but any timeout can still happen." },
    { q: "What if rename is not allowed?", a: "Use a control file written last." },
    { q: "Who removes the duplicate?", a: "Agree a process with the platform team." },
    { q: "How do you test this?", a: "Force a timeout in test and check only one file arrives." },
  ],
}
