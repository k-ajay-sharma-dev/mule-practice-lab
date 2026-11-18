export default {
  id: 'inc-330',
  category: 'incidents',
  title: "Files With Spaces and Accents in Their Names Are Skipped on FTP",
  level: 'INTERMEDIATE',
  tags: ["myproject","ftp","file-names","encoding"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 06:00:00 INFO  [supplier-in] Listed files=14 matched=11", relevant: true, why: "Three files did not match." },
      { text: "2026-11-18 06:00:00 DEBUG [supplier-in] Unmatched: \"Price List FranÃ§ais.csv\", \"Promo week 47.csv\", \"Stock (2).csv\"", relevant: true, why: "Names have spaces, brackets and accents." },
      { text: "2026-11-18 06:00:00 INFO  [supplier-in] Matcher regex=^[A-Za-z0-9_]+\\.csv$", relevant: true, why: "The pattern allows only simple names." },
      { text: "2026-11-18 06:00:00 INFO  [supplier-in] Control encoding=ISO-8859-1, server sends UTF-8 names", relevant: true, why: "Names are decoded wrongly too." },
      { text: "2026-11-18 23:59:00 INFO  [supplier-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why were three files skipped?",
        options: [
          "The name pattern does not allow spaces or brackets, and accents are decoded wrongly",
          "They are empty",
          "They are locked",
          "The FTP server hid them",
        ],
        answer: 0,
        explain: "The matcher and encoding both reject them.",
      },
      {
        type: 'single',
        prompt: "What is the best long term fix?",
        options: [
          "Agree a file naming rule with the supplier and log unmatched files as warnings",
          "Accept any name silently",
          "Rename on the server by hand daily",
          "Ignore them",
        ],
        answer: 0,
        explain: "Agree names, and make skips visible.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Set the control channel encoding to match the server",
          "Alert when files are left unmatched",
          "Test with real supplier names",
          "Use a stricter regex",
        ],
        answer: [0,1,2],
        explain: "Visibility and correct decoding.",
      },
      {
        type: 'single',
        prompt: "Why were the skips silent?",
        options: [
          "Unmatched files are logged only at DEBUG",
          "They were not",
          "FTP hides them",
          "No reason",
        ],
        answer: 0,
        explain: "Skips should be visible.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Process the three files",
          "Fix the encoding",
          "Agree naming with the supplier",
          "Warn on unmatched files",
          "Add real names to tests",
        ],
        explain: "Recover, fix, agree, watch, test.",
      },
    ],
  },
  description: `
## Symptoms
- Some supplier price files never load.

## Change / Context
- A new supplier contact started naming files by hand.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 06:00:00 INFO  [supplier-in] Listed files=14 matched=11
2026-11-18 06:00:00 DEBUG [supplier-in] Unmatched: "Price List FranÃ§ais.csv", "Promo week 47.csv", "Stock (2).csv"
2026-11-18 06:00:00 INFO  [supplier-in] Matcher regex=^[A-Za-z0-9_]+\\.csv$
2026-11-18 06:00:00 INFO  [supplier-in] Control encoding=ISO-8859-1, server sends UTF-8 names
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
    "Name matchers can skip files silently.",
    "FTP name encoding matters.",
    "Agree naming rules.",
    "Warn on unmatched files.",
    "Test with real names.",
    "Process skipped files.",
  ],
  solution: `
**Diagnosis.** The matcher rejects names with spaces and brackets, and accented names are misread.

**Immediate mitigation.**
- Process the three files.

**Root cause.** No agreed naming and silent skips.

**Permanent fix.**
- Correct encoding, naming rule, warnings.

**Prevention.** Tests with real names.
`,
  followUps: [
    { q: "What is the FTP control encoding?", a: "The character set used for commands and names on the control channel." },
    { q: "Should you accept any name?", a: "Accept what is agreed and warn about the rest." },
    { q: "Do spaces break FTP?", a: "They are allowed, but some scripts and patterns mishandle them." },
    { q: "Who agrees names?", a: "The integration team with the supplier." },
  ],
}
