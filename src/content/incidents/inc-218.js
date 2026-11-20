export default {
  id: 'inc-218',
  category: 'incidents',
  title: "Partner Cannot Open the Zip Files We Copy From Blob Storage: the Download Was Read as Text",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-blob","binary","encoding","dataweave"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:01 INFO  [export-copy] Downloaded blob=exports/2026-11-17.zip sizeBytes=4194304", relevant: true, why: "The blob is 4 MB." },
      { text: "2026-11-18 03:00:02 DEBUG [export-copy] Transform output text/plain encoding=UTF-8", relevant: true, why: "A transform turns the bytes into text." },
      { text: "2026-11-18 03:00:03 INFO  [export-copy] Uploaded to partner SFTP sizeBytes=6102544", relevant: true, why: "The file grew by about half, a sign it was changed." },
      { text: "2026-11-18 07:00:00 WARN  [partner] Archive is corrupt: exports_2026-11-17.zip", relevant: true, why: "The partner cannot open it." },
      { text: "2026-11-18 07:01:00 INFO  [export-copy] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the zip corrupt?",
        options: [
          "The bytes were read as text and written out as UTF-8, which changed them",
          "The SFTP upload ran in ASCII mode and changed the line endings",
          "The download stream was cut off before the whole blob arrived",
          "The partner’s unzip tool cannot read archives larger than 4 MB",
        ],
        answer: 0,
        explain: "Binary data must pass through unchanged. Encoding it as UTF-8 text changes bytes that are not valid characters.",
      },
      {
        type: 'single',
        prompt: "What is the clue in the logs?",
        options: [
          "The file is bigger after the copy",
          "The upload took only one second",
          "The partner file name has an underscore",
          "The partner reported it four hours later",
        ],
        answer: 0,
        explain: "A straight copy keeps the same size. Growth means the bytes were rewritten.",
      },
      {
        type: 'multi',
        prompt: "How do you copy binary files safely?",
        options: [
          "Pass the payload from download to upload without a text transform",
          "Treat it as application/octet-stream",
          "Compare size and checksum before and after",
          "Set the transform output encoding to ISO-8859-1",
        ],
        answer: [0,1,2],
        explain: "Keep it binary end to end, and check that it arrived the same.",
      },
      {
        type: 'single',
        prompt: "Why was there a transform at all?",
        options: [
          "A developer added it last week to log part of the file",
          "The SFTP connector needs text input to write a file",
          "The blob download returns Base64 that must be decoded",
          "Zip files need a transform to set their MIME type",
        ],
        answer: 0,
        explain: "A debugging step that changes the payload often gets left behind.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove the text transform",
          "Copy the files again for the affected days",
          "Add a size and checksum check after upload",
          "Tell the partner the files are replaced",
          "Review other copy flows",
        ],
        explain: "Fix, recover, verify, inform, then look wider.",
      },
    ],
  },
  description: `
## Symptoms
- A partner reports every zip file from the last week is corrupt.

## Change / Context
- A nightly flow downloads export zips from blob storage and uploads them to the partner SFTP server.
- Last week a developer added a transform to log part of the file.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:01 INFO  [export-copy] Downloaded blob=exports/2026-11-17.zip sizeBytes=4194304
2026-11-18 03:00:02 DEBUG [export-copy] Transform output text/plain encoding=UTF-8
2026-11-18 03:00:03 INFO  [export-copy] Uploaded to partner SFTP sizeBytes=6102544
2026-11-18 07:00:00 WARN  [partner] Archive is corrupt: exports_2026-11-17.zip
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
    "Binary files must stay binary.",
    "Encoding bytes as text changes them.",
    "A size change after a copy is a warning sign.",
    "Compare size and checksum after transfer.",
    "Remove debugging transforms.",
    "Replace the damaged files.",
  ],
  solution: `
**Diagnosis.** A transform turned the zip bytes into UTF-8 text before the SFTP upload. Bytes that are not valid characters were changed, and the archive broke.

**Immediate mitigation.**
- Remove the transform and copy the last week’s files again.

**Root cause.** A logging change also changed the payload.

**Permanent fix.**
- Pass the downloaded stream straight to the SFTP write, as binary.

**Prevention.** Check size and checksum after upload, and never log whole binary payloads.
`,
  followUps: [
    { q: "Why did the file grow?", a: "Invalid bytes are replaced with multi-byte characters when written as UTF-8." },
    { q: "Where do you get a checksum?", a: "Blob storage can keep an MD5 of the content. Compare it with one computed after transfer." },
    { q: "How do you log a binary file?", a: "Log its name, size and checksum, never its content." },
    { q: "Does streaming help?", a: "Yes. Passing the stream through avoids loading the file and avoids accidental changes." },
  ],
}
