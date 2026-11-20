export default {
  id: 'inc-251',
  category: 'incidents',
  title: "Zip Files From the FTP Server Arrive Broken",
  level: 'BEGINNER',
  tags: ["myproject","ftp","transfer-mode","binary"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 03:00:00 INFO  [ftp-server] prices.zip sizeBytes=4101118", relevant: true, why: "Sizes differ by over a thousand bytes." },
      { text: "2026-11-18 03:00:02 INFO  [price-in] Read /out/prices.zip transferMode=ASCII sizeBytes=4102330", relevant: true, why: "The zip is read in text mode." },
      { text: "2026-11-18 03:00:03 ERROR [price-in] Unzip failed invalid CEN header", relevant: true, why: "The archive is damaged." },
      { text: "2026-11-18 03:00:03 INFO  [price-in] Previous run used transferMode=BINARY", relevant: true, why: "A config change switched the mode." },
      { text: "2026-11-18 23:59:00 INFO  [price-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the zip broken?",
        options: [
          "ASCII mode changed line ending bytes in a binary file",
          "The server wrote a broken zip file at 03:00",
          "The read started before the server upload ended",
          "The zip is now password protected by the sender",
        ],
        answer: 0,
        explain: "ASCII mode rewrites line endings. Binary files must not be touched.",
      },
      {
        type: 'single',
        prompt: "What is the fix?",
        options: [
          "Use binary mode for this transfer",
          "Read the file again in ASCII mode",
          "Ask the server owner to rezip it",
          "Use passive mode for the transfer",
        ],
        answer: 0,
        explain: "Binary copies bytes as they are.",
      },
      {
        type: 'multi',
        prompt: "When is ASCII mode ever used?",
        options: [
          "Plain text between systems with other line endings",
          "Legacy mainframe text transfers",
          "Never for zip, PDF or images",
          "Large zip files sent over slow network links",
        ],
        answer: [0,1,2],
        explain: "Use binary unless you need line ending conversion.",
      },
      {
        type: 'single',
        prompt: "What is the clue in the logs?",
        options: [
          "The size read differs from the size on the server",
          "The read ran two seconds after the file appeared",
          "The unzip error came one second after the read",
          "The path /out/prices.zip is an outbound folder",
        ],
        answer: 0,
        explain: "A byte for byte copy has the same size.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Set binary mode",
          "Read the file again",
          "Load prices",
          "Compare sizes after each transfer",
          "Review the config change",
        ],
        explain: "Fix, recover, check, learn.",
      },
    ],
  },
  description: `
## Symptoms
- The nightly price load fails with an unzip error.

## Change / Context
- A config file was tidied yesterday.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 03:00:00 INFO  [ftp-server] prices.zip sizeBytes=4101118
2026-11-18 03:00:02 INFO  [price-in] Read /out/prices.zip transferMode=ASCII sizeBytes=4102330
2026-11-18 03:00:03 ERROR [price-in] Unzip failed invalid CEN header
2026-11-18 03:00:03 INFO  [price-in] Previous run used transferMode=BINARY
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
    "ASCII mode converts line endings.",
    "Binary mode copies bytes exactly.",
    "Use binary for archives and documents.",
    "Compare sizes to detect changes.",
    "Config tidy ups can change behaviour.",
    "Test after config changes.",
  ],
  solution: `
**Diagnosis.** The transfer mode changed to ASCII, which corrupted the zip.

**Immediate mitigation.**
- Set binary and reread.

**Root cause.** A config change set the wrong mode.

**Permanent fix.**
- Binary mode for every non text file.

**Prevention.** Size checks and config review.
`,
  followUps: [
    { q: "Does SFTP have ASCII mode?", a: "No. SFTP always copies bytes as they are." },
    { q: "Why compare sizes?", a: "A changed size is a quick sign the content changed." },
    { q: "What about checksums?", a: "Better still, if the server provides them." },
    { q: "Should text files use ASCII?", a: "Only if you need line endings converted. Otherwise binary is safer." },
  ],
}
