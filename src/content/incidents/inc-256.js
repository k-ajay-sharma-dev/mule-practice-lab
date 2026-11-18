export default {
  id: 'inc-256',
  category: 'incidents',
  title: "The Planning Platform Rejects the Location File After a New Store Opens",
  level: 'INTERMEDIATE',
  tags: ["myproject","ftp","blue-yonder","master-data","fixed-width"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [loc-out] Wrote locations_20261118.dat records=612 recordLength=200", relevant: true, why: "Fixed width records of 200 characters." },
      { text: "2026-11-18 02:20:00 ERROR [planning-platform] Record 612 length=207 expected=200", relevant: true, why: "One record is too long." },
      { text: "2026-11-18 02:20:00 INFO  [planning-platform] Record 612 store=S612 name=\"Marrow & Pine Home Riverside Retail Park\"", relevant: true, why: "A long store name overflowed." },
      { text: "2026-11-18 02:21:00 INFO  [planning-platform] File rejected, no locations updated", relevant: true, why: "The whole file is rejected." },
      { text: "2026-11-18 23:59:00 INFO  [loc-out] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the record too long?",
        options: [
          "The store name is longer than its fixed width field and was not cut",
          "The file is corrupt",
          "The platform changed",
          "FTP added bytes",
        ],
        answer: 0,
        explain: "Fixed width fields must be padded or cut to size.",
      },
      {
        type: 'single',
        prompt: "What should the mapping do?",
        options: [
          "Pad or truncate every field to its defined width",
          "Remove long names",
          "Use commas",
          "Send long records separately",
        ],
        answer: 0,
        explain: "Every record must be exactly 200 characters.",
      },
      {
        type: 'multi',
        prompt: "What else protects the file?",
        options: [
          "A check that every record is exactly the right length before upload",
          "A list of fields with widths in the interface spec",
          "A report of truncated values to the business",
          "Hoping names stay short",
        ],
        answer: [0,1,2],
        explain: "Validate before you send.",
      },
      {
        type: 'single',
        prompt: "How can DataWeave write fixed width?",
        options: [
          "With the flat file format and a schema, or by padding strings in the script",
          "Only CSV",
          "It cannot",
          "With XML",
        ],
        answer: 0,
        explain: "Both work. A schema is clearer.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Fix the field width in the mapping",
          "Resend the file",
          "Confirm locations updated",
          "Add a record length check",
          "Report truncated names",
        ],
        explain: "Fix, resend, confirm, guard, report.",
      },
    ],
  },
  description: `
## Symptoms
- Location master data stopped updating after a new store opened.

## Change / Context
- Locations go to the planning platform as a fixed width file over FTP.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [loc-out] Wrote locations_20261118.dat records=612 recordLength=200
2026-11-18 02:20:00 ERROR [planning-platform] Record 612 length=207 expected=200
2026-11-18 02:20:00 INFO  [planning-platform] Record 612 store=S612 name="Marrow & Pine Home Riverside Retail Park"
2026-11-18 02:21:00 INFO  [planning-platform] File rejected, no locations updated
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
    "Fixed width fields must be exact.",
    "Pad or truncate every field.",
    "Validate record length before upload.",
    "Keep widths in the spec.",
    "Report truncation.",
    "One bad record can reject a file.",
  ],
  solution: `
**Diagnosis.** A long store name made one record 207 characters. The platform rejects the whole file.

**Immediate mitigation.**
- Fix the mapping and resend.

**Root cause.** The name field was not truncated to its width.

**Permanent fix.**
- Pad or cut each field to width.

**Prevention.** A record length check before upload.
`,
  followUps: [
    { q: "Why not reject only one record?", a: "That is the receiver’s choice. Many reject the file." },
    { q: "Is truncation safe?", a: "Usually for names. Report it so the business knows." },
    { q: "What about multibyte characters?", a: "Width can mean bytes or characters. Agree which." },
    { q: "How do you test?", a: "Add test data with the longest allowed values." },
  ],
}
