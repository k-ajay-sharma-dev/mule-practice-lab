export default {
  id: 'inc-260',
  category: 'incidents',
  title: "During Cutover Two Systems Send Inventory to the Planning Platform",
  level: 'EXPERT',
  tags: ["myproject","ftp","blue-yonder","cutover","database"],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: "2026-11-18 02:00:00 INFO  [legacy-job] Uploaded inv_20261118.dat via FTP", relevant: true, why: "The old job still runs." },
      { text: "2026-11-18 02:05:00 INFO  [mule-inv] Uploaded inv_20261118.dat via FTP", relevant: true, why: "The new Mule flow also runs." },
      { text: "2026-11-18 02:05:00 INFO  [ftp-server] Overwrite inv_20261118.dat", relevant: true, why: "The second file replaced the first." },
      { text: "2026-11-18 03:00:00 WARN  [planning-platform] Stock values differ from yesterday by 18 percent", relevant: true, why: "The two sources differ." },
      { text: "2026-11-18 23:59:00 INFO  [legacy-job] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What went wrong?",
        options: [
          "The old job was not switched off, so two systems wrote the same file name",
          "FTP lost data",
          "The platform is broken",
          "The database changed",
        ],
        answer: 0,
        explain: "Both writers ran.",
      },
      {
        type: 'single',
        prompt: "What is a safe cutover pattern?",
        options: [
          "Run the new flow in parallel to a separate folder, compare, then switch the target and stop the old job together",
          "Switch both on",
          "Turn off the old job a week later",
          "No testing",
        ],
        answer: 0,
        explain: "Parallel run with comparison, then one switch.",
      },
      {
        type: 'multi',
        prompt: "Why do the values differ?",
        options: [
          "The two extracts may use different rules or cut off times",
          "One may include closed stores",
          "Rounding may differ",
          "FTP changes numbers",
        ],
        answer: [0,1,2],
        explain: "Compare to find the rule differences.",
      },
      {
        type: 'single',
        prompt: "Who decides which values are right?",
        options: [
          "The business owner of inventory, with the comparison report",
          "The FTP server",
          "Whoever deployed last",
          "Nobody",
        ],
        answer: 0,
        explain: "Data ownership decides.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop one of the jobs",
          "Resend the agreed file",
          "Compare both extracts",
          "Fix rule differences",
          "Plan a proper cutover",
        ],
        explain: "Stop, correct, compare, fix, plan.",
      },
    ],
  },
  description: `
## Symptoms
- Inventory in the planning platform jumped by 18 percent overnight.

## Change / Context
- A new Mule flow replaces a legacy job. Both ran last night.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 02:00:00 INFO  [legacy-job] Uploaded inv_20261118.dat via FTP
2026-11-18 02:05:00 INFO  [mule-inv] Uploaded inv_20261118.dat via FTP
2026-11-18 02:05:00 INFO  [ftp-server] Overwrite inv_20261118.dat
2026-11-18 03:00:00 WARN  [planning-platform] Stock values differ from yesterday by 18 percent
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
    "Two writers to one file name cause silent overwrites.",
    "Run in parallel to a separate target.",
    "Compare outputs before switching.",
    "Switch and stop together.",
    "Business owners decide on differences.",
    "Plan cutover steps.",
  ],
  solution: `
**Diagnosis.** Both the legacy job and the new flow sent inventory. The new file overwrote the old one, and values differ.

**Immediate mitigation.**
- Stop one job and resend agreed data.

**Root cause.** No cutover plan.

**Permanent fix.**
- Parallel run, compare, then switch.

**Prevention.** A cutover checklist with owners.
`,
  followUps: [
    { q: "How long to run in parallel?", a: "Long enough to cover normal and peak days." },
    { q: "How do you compare?", a: "Load both into tables and compare keys and values." },
    { q: "What about rollback?", a: "Keep the old job ready until sign off." },
    { q: "Who signs off?", a: "The business owner of the data." },
  ],
}
