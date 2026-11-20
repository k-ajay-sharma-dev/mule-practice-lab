export default {
  id: 'inc-231',
  category: 'incidents',
  title: "Item Names With Accents Arrive Broken in the Planning Platform",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","master-data","encoding"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-17 16:00:00 INFO  [deploy] item-export 2.4.0 changed writer from ISO-8859-1 to UTF-8", relevant: true, why: "A recent release changed the encoding." },
      { text: "2026-11-18 03:00:12 INFO  [item-export] Wrote file=items_20261118.txt encoding=UTF-8 rows=58210", relevant: true, why: "The export writes UTF-8." },
      { text: "2026-11-18 03:20:00 WARN  [planning-platform] Item description contains invalid characters item=ITM-88120 value=\"CrÃ¨me\"", relevant: true, why: "The reader read UTF-8 bytes as another charset." },
      { text: "2026-11-18 03:20:00 INFO  [planning-platform] Inbound file spec charset=ISO-8859-1", relevant: true, why: "The receiver expects Latin 1." },
      { text: "2026-11-18 23:59:00 INFO  [item-export] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are the names broken?",
        options: [
          "The export now writes UTF-8, but the receiver reads ISO-8859-1",
          "The file share converts text files to its own charset on write",
          "The source system stores the names with broken characters",
          "The export writes ISO-8859-1, but the receiver now reads UTF-8",
        ],
        answer: 0,
        explain: "UTF-8 bytes read as Latin 1 show as two odd characters.",
      },
      {
        type: 'single',
        prompt: "What is the quick fix?",
        options: [
          "Write the file in the receiver’s charset and send it again",
          "Strip accents from item names in the export transform",
          "Add a UTF-8 byte order mark to the start of the file",
          "Ask the receiver to skip rows with invalid characters",
        ],
        answer: 0,
        explain: "Match the agreed interface spec.",
      },
      {
        type: 'multi',
        prompt: "How do you prevent this?",
        options: [
          "State the encoding in the interface spec",
          "Test with names that have accents",
          "Review encoding in release changes",
          "Default every new export to UTF-8",
        ],
        answer: [0,1,2],
        explain: "Encoding is part of the contract.",
      },
      {
        type: 'single',
        prompt: "Where do you set the output encoding in DataWeave?",
        options: [
          "In the output directive, with the encoding writer property",
          "In the input directive, with the encoding reader property",
          "In the file name, as a suffix such as .latin1.txt",
          "Only in the JVM file.encoding setting of the runtime",
        ],
        answer: 0,
        explain: "For example output application/csv encoding=\"ISO-8859-1\".",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Confirm the receiver charset",
          "Set the export encoding back",
          "Resend the item file",
          "Check items in the platform",
          "Add an accent test case",
        ],
        explain: "Confirm, fix, resend, check, prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Item names such as Crème show odd characters in the planning platform.

## Change / Context
- Master data is exported nightly to the share, then picked up by the planning platform.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-17 16:00:00 INFO  [deploy] item-export 2.4.0 changed writer from ISO-8859-1 to UTF-8
2026-11-18 03:00:12 INFO  [item-export] Wrote file=items_20261118.txt encoding=UTF-8 rows=58210
2026-11-18 03:20:00 WARN  [planning-platform] Item description contains invalid characters item=ITM-88120 value="CrÃ¨me"
2026-11-18 03:20:00 INFO  [planning-platform] Inbound file spec charset=ISO-8859-1
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
    "Encoding is part of a file contract.",
    "UTF-8 read as Latin 1 makes two odd characters.",
    "Set encoding in the DataWeave output.",
    "Test with special characters.",
    "Release notes should flag format changes.",
    "Resend after fixing.",
  ],
  solution: `
**Diagnosis.** Release 2.4.0 switched the export to UTF-8. The receiver reads Latin 1.

**Immediate mitigation.**
- Write with ISO-8859-1 and resend.

**Root cause.** An interface change was made without agreeing it with the receiver.

**Permanent fix.**
- Pin the encoding in the writer to the spec.

**Prevention.** Contract tests with special characters, and change review for interfaces.
`,
  followUps: [
    { q: "Should everyone move to UTF-8?", a: "Often a good goal, but agree it with the receiver first." },
    { q: "What about characters Latin 1 cannot hold?", a: "Agree a replacement rule, and report them." },
    { q: "How does the receiver know the encoding?", a: "Only from the spec, or a BOM if both sides agree." },
    { q: "Can DataWeave read a Latin 1 file?", a: "Yes, set the encoding reader property." },
  ],
}
