export default {
  id: 'inc-233',
  category: 'incidents',
  title: "The Poll Takes Longer Every Week Until It Overlaps the Next Run",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","listing","performance"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 01:04:31 INFO  [vendor-poll] List directory=/vendor-in entries=184220 durationMs=271000", relevant: true, why: "Listing takes over four minutes." },
      { text: "2026-11-18 01:04:31 INFO  [vendor-poll] New files=6", relevant: true, why: "Only six are new." },
      { text: "2026-11-18 01:05:00 WARN  [vendor-poll] Previous run still active, skipping", relevant: true, why: "Runs overlap." },
      { text: "2026-11-18 01:10:00 INFO  [ops] /vendor-in contains processed files from 2024 onwards", relevant: true, why: "Processed files are never moved." },
      { text: "2026-11-18 23:59:00 INFO  [vendor-poll] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why is the poll slow?",
        options: [
          "It lists every file ever received, as processed files stay in /vendor-in",
          "It downloads all 184,220 files to compare their content with the list",
          "The share throttles the app because the poll runs every 5 minutes",
          "The processed name list is too large for the worker’s heap",
        ],
        answer: 0,
        explain: "184,220 entries for 6 new files.",
      },
      {
        type: 'single',
        prompt: "What fixes it?",
        options: [
          "Move processed files to a dated archive so /vendor-in stays small",
          "Poll every 15 minutes so each run has time to finish the listing",
          "Move the app to a larger worker so the listing runs faster",
          "Keep the processed name list in a database instead of in memory",
        ],
        answer: 0,
        explain: "A small inbound folder makes listing fast.",
      },
      {
        type: 'multi',
        prompt: "What else helps?",
        options: [
          "Archive by date folders such as archive/2026/11/18",
          "Move old archives to cheaper storage",
          "Alert when the inbound folder holds more than a set count",
          "Run two pollers, each listing half the files",
        ],
        answer: [0,1,2],
        explain: "Structure and limits keep listings quick.",
      },
      {
        type: 'single',
        prompt: "Why skip when a run is still active?",
        options: [
          "Two overlapping runs could pick the same file",
          "The share allows only one list call at a time",
          "A second run would reset the first run’s listing",
          "It keeps the processed name list from growing",
        ],
        answer: 0,
        explain: "Overlap prevention is right. The real issue is the slow listing.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Move processed files to an archive folder",
          "Confirm the poll time drops",
          "Change the flow to move each file after processing",
          "Add a folder size alert",
          "Agree retention for the archive",
        ],
        explain: "Clean, prove, fix, watch, retain.",
      },
    ],
  },
  description: `
## Symptoms
- The vendor poll now takes over four minutes and skips runs.

## Change / Context
- The poll starts every 5 minutes and skips a start while the previous run is still active.
- The flow reads new files by comparing names with a list of processed names. Files stay in /vendor-in.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 01:04:31 INFO  [vendor-poll] List directory=/vendor-in entries=184220 durationMs=271000
2026-11-18 01:04:31 INFO  [vendor-poll] New files=6
2026-11-18 01:05:00 WARN  [vendor-poll] Previous run still active, skipping
2026-11-18 01:10:00 INFO  [ops] /vendor-in contains processed files from 2024 onwards
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
    "Listing time grows with folder size.",
    "Move processed files out of inbound.",
    "Archive by date.",
    "Keep a retention rule.",
    "Alert on folder size.",
    "Prevent overlapping runs.",
  ],
  solution: `
**Diagnosis.** Processed files are never moved, so each poll lists about 184,000 entries.

**Immediate mitigation.**
- Move processed files to archive folders.

**Root cause.** The design tracks processed names instead of moving files.

**Permanent fix.**
- Move each file to a dated archive after processing.

**Prevention.** Folder size alert and archive retention.
`,
  followUps: [
    { q: "Why not track names in a database?", a: "You can, but listing still reads every entry. Moving files is cheaper." },
    { q: "What about very busy partners?", a: "Give each partner its own folder." },
    { q: "Does the REST list call page?", a: "Yes, it returns markers for large directories, which adds calls." },
    { q: "How long should archives stay?", a: "As long as the business and audit rules say, then delete or tier." },
  ],
}
