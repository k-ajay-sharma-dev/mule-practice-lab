export default {
  id: 'inc-292',
  category: 'incidents',
  title: "CSV Attachments Open With Broken Characters in Spreadsheet Apps",
  level: 'INTERMEDIATE',
  tags: ["myproject","email","encoding","attachments"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [price-report] Attachment prices.csv encoding=UTF-8 bom=false", relevant: true, why: "UTF-8 without a BOM." },
      { text: "2026-11-18 06:00:00 INFO  [price-report] contentType=text/csv", relevant: true, why: "No charset on the content type." },
      { text: "2026-11-18 06:30:00 WARN  [buyers] Names show as CafÃ© in the spreadsheet", relevant: true, why: "The app guessed the wrong encoding." },
      { text: "2026-11-18 06:31:00 INFO  [buyers] Opening via import wizard with UTF-8 works", relevant: true, why: "The data is right." },
      { text: "2026-11-18 23:59:00 INFO  [price-report] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do names look broken?",
        options: [
          "The spreadsheet app guesses a legacy encoding for UTF-8 without a BOM",
          "The price data was stored with broken characters",
          "The mail server re-encoded the attachment in transit",
          "DataWeave wrote the CSV in a legacy single byte encoding",
        ],
        answer: 0,
        explain: "The bytes are fine.",
      },
      {
        type: 'single',
        prompt: "What helps?",
        options: [
          "Add a UTF-8 BOM and charset in the content type",
          "Strip accents from names before writing the CSV",
          "Write the CSV in ASCII and drop other characters",
          "Send the report as a PDF only from now on",
        ],
        answer: 0,
        explain: "Give the app a hint.",
      },
      {
        type: 'multi',
        prompt: "What else is good practice?",
        options: [
          "Agree the format with the recipients",
          "Test with accented names",
          "Offer a link to the file in storage",
          "Assume every app reads UTF-8",
        ],
        answer: [0,1,2],
        explain: "Test with real data.",
      },
      {
        type: 'single',
        prompt: "How do you add a BOM in DataWeave?",
        options: [
          "Put the BOM character in front of the CSV text",
          "It is not possible in DataWeave",
          "With a header row that holds the BOM text",
          "By quoting every field in the CSV output",
        ],
        answer: 0,
        explain: "The CSV writer has no bom property. Write the CSV to text and add the BOM in front: \"\\uFEFF\" ++ write(rows, \"application/csv\").",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Tell buyers how to open today’s file",
          "Add BOM and charset",
          "Resend",
          "Add an accent test",
          "Document the format",
        ],
        explain: "Help, fix, resend, test, document.",
      },
    ],
  },
  description: `
## Symptoms
- Buyers see broken characters in the daily price report.

## Change / Context
- Reports are CSV attachments.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 INFO  [price-report] Attachment prices.csv encoding=UTF-8 bom=false
2026-11-18 06:00:00 INFO  [price-report] contentType=text/csv
2026-11-18 06:30:00 WARN  [buyers] Names show as CafÃ© in the spreadsheet
2026-11-18 06:31:00 INFO  [buyers] Opening via import wizard with UTF-8 works
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
    "Apps may guess encodings.",
    "A BOM helps some apps.",
    "Set charset on the content type.",
    "Test with accents.",
    "Agree formats.",
    "Bytes may be fine.",
  ],
  solution: `
**Diagnosis.** The spreadsheet app does not detect UTF-8 without a BOM.

**Immediate mitigation.**
- Explain the import option.

**Root cause.** No encoding hint in the file.

**Permanent fix.**
- BOM and charset.

**Prevention.** Accent tests.
`,
  followUps: [
    { q: "Is a BOM always good?", a: "Some systems dislike it. Agree per recipient." },
    { q: "What is charset?", a: "A parameter on the content type that names the encoding." },
    { q: "Why not Excel files?", a: "Possible, but CSV is lighter to produce and read in systems." },
    { q: "What about the email body?", a: "Set its charset too." },
  ],
}
