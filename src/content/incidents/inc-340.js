export default {
  id: 'inc-340',
  category: 'incidents',
  title: "A Large CSV Loads With Shifted Columns After Row 2 Million",
  level: 'INTERMEDIATE',
  tags: ["myproject","large-files","csv","quoting"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:00:00 INFO  [hist-load] Reading history.csv rows=6000000", relevant: false },
      { text: "2026-11-18 01:20:00 WARN  [hist-load] Row 2104411 has 14 fields, expected 12", relevant: true, why: "One row has extra fields." },
      { text: "2026-11-18 01:20:00 INFO  [hist-load] Row content contains a comma inside a description without quotes", relevant: true, why: "A value has an unquoted comma." },
      { text: "2026-11-18 01:21:00 INFO  [hist-load] Rows after 2104411 loaded with shifted columns", relevant: true, why: "The parser lost alignment." },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why did columns shift?",
        options: [
          "A description contains commas but is not quoted, so the row splits wrongly",
          "The file is too big",
          "Encoding",
          "Memory",
        ],
        answer: 0,
        explain: "CSV needs quoting for commas in values.",
      },
      {
        type: 'single',
        prompt: "What should the loader do with such a row?",
        options: [
          "Reject the row with its line number and continue, not load it shifted",
          "Load it shifted",
          "Stop forever",
          "Guess the columns",
        ],
        answer: 0,
        explain: "Bad rows go to rejects.",
      },
      {
        type: 'multi',
        prompt: "What prevents this?",
        options: [
          "The sender quotes text fields",
          "Check the field count on every row",
          "Use a delimiter not found in data, if agreed",
          "Ignore field counts",
        ],
        answer: [0,1,2],
        explain: "Validate structure row by row.",
      },
      {
        type: 'single',
        prompt: "Why did only later rows break?",
        options: [
          "The bad value appeared first at row 2.1 million",
          "Memory ran out",
          "The file changed",
          "Random",
        ],
        answer: 0,
        explain: "Large files hide rare data.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Remove rows loaded after the bad row",
          "Add a field count check",
          "Reload, rejecting bad rows",
          "Report the bad row to the sender",
          "Agree quoting rules",
        ],
        explain: "Clean, guard, reload, report, agree.",
      },
    ],
  },
  description: `
## Symptoms
- History data after row 2.1 million has values in the wrong columns.

## Change / Context
- The sender writes CSV without quoting text fields.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:20:00 WARN  [hist-load] Row 2104411 has 14 fields, expected 12
2026-11-18 01:20:00 INFO  [hist-load] Row content contains a comma inside a description without quotes
2026-11-18 01:21:00 INFO  [hist-load] Rows after 2104411 loaded with shifted columns
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
    "Unquoted commas break CSV.",
    "Check field counts per row.",
    "Reject bad rows with line numbers.",
    "Agree quoting rules.",
    "Rare data hides in big files.",
    "Do not load shifted data.",
  ],
  solution: `
**Diagnosis.** An unquoted comma split one row into 14 fields.

**Immediate mitigation.**
- Clean and reload with a field count check.

**Root cause.** Sender does not quote text fields.

**Permanent fix.**
- Quoting rules and row validation.

**Prevention.** Field count checks on every load.
`,
  followUps: [
    { q: "How does DataWeave read quoted CSV?", a: "It handles quotes by default; the sender must add them." },
    { q: "Why not use pipes?", a: "Pipes can also appear in data. Quoting is safer." },
    { q: "Can you validate while streaming?", a: "Yes, check each row as it is read." },
    { q: "What is RFC 4180?", a: "A common description of the CSV format." },
  ],
}
