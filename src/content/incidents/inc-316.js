export default {
  id: 'inc-316',
  category: 'incidents',
  title: "A Large File Copied From the Share Is Slightly Different",
  level: 'INTERMEDIATE',
  tags: ["myproject","large-files","azure-file-share","checksum"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:40:00 INFO  [copy-job] Retry on network error at offset 2147483648, resumed", relevant: true, why: "A resume happened at 2 GB." },
      { text: "2026-11-18 03:00:00 INFO  [copy-job] Copied history.csv sizeBytes=3000000000", relevant: false },
      { text: "2026-11-18 03:00:00 INFO  [copy-job] Source MD5 missing, no check", relevant: true, why: "No integrity check." },
      { text: "2026-11-18 06:00:00 WARN  [warehouse] Row 21400233 malformed", relevant: true, why: "One row is broken." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What likely broke the row?",
        options: [
          "The 2 GB resume wrote at a wrong offset and nothing checked it",
          "The source file on the share already had the bad row",
          "The copy changed the file encoding partway through",
          "The warehouse loader misreads rows past 21 million",
        ],
        answer: 0,
        explain: "Resumes need verification.",
      },
      {
        type: 'single',
        prompt: "What should the copy do?",
        options: [
          "Compare a checksum or at least size and row count after copy",
          "Trust the copy, since the resume step reported success",
          "Copy the file twice and keep the later copy",
          "Open the file in a viewer to spot broken rows",
        ],
        answer: 0,
        explain: "Verify integrity.",
      },
      {
        type: 'multi',
        prompt: "What gives you a checksum?",
        options: [
          "A hash computed by the sender",
          "A hash computed while streaming the copy",
          "A control file with the hash",
          "The file’s last modified time",
        ],
        answer: [0,1,2],
        explain: "Compare source and target.",
      },
      {
        type: 'single',
        prompt: "Why is offset 2 GB suspicious?",
        options: [
          "It is 2^31, where integer overflow bugs often appear",
          "It is the default resume point for every file copy",
          "It is where the file share stores its first block",
          "It is the end of the file, so the copy was complete",
        ],
        answer: 0,
        explain: "Large file bugs cluster at type limits.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Copy the file again",
          "Verify with a checksum",
          "Reload the warehouse",
          "Add checksum checks to the job",
          "Test resumes past 2 GB",
        ],
        explain: "Recopy, verify, reload, harden, test.",
      },
    ],
  },
  description: `
## Symptoms
- The warehouse load fails on one malformed row deep in the file.

## Change / Context
- Large files are copied from the file share to the warehouse landing area.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:40:00 INFO  [copy-job] Retry on network error at offset 2147483648, resumed
2026-11-18 03:00:00 INFO  [copy-job] Copied history.csv sizeBytes=3000000000
2026-11-18 03:00:00 INFO  [copy-job] Source MD5 missing, no check
2026-11-18 06:00:00 WARN  [warehouse] Row 21400233 malformed
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
    "Verify large copies.",
    "Use checksums.",
    "At least compare size and rows.",
    "Resumes need care.",
    "2 GB is a common bug boundary.",
    "Test past 2 GB.",
  ],
  solution: `
**Diagnosis.** A resume at 2 GB corrupted data and nothing verified the copy.

**Immediate mitigation.**
- Recopy and verify.

**Root cause.** No integrity check.

**Permanent fix.**
- Checksum verification.

**Prevention.** Tests above 2 GB.
`,
  followUps: [
    { q: "MD5 or SHA-256?", a: "SHA-256 is stronger. Either catches accidental corruption." },
    { q: "Can you hash while streaming?", a: "Yes, update the hash as bytes pass." },
    { q: "Who provides the source hash?", a: "The sender, in a control file." },
    { q: "Why 2^31?", a: "Signed 32 bit integers stop there." },
  ],
}
