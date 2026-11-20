export default {
  id: 'inc-276',
  category: 'incidents',
  title: "Job IDs Jump by Twenty After Every Restart",
  level: 'BEGINNER',
  tags: ["myproject","oracle","sequence","cache"],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 INFO  [job-log] New job id=4021", relevant: true, why: "The last ID before the restart." },
      { text: "2026-11-18 09:30:00 INFO  [dba] Database restarted for patching", relevant: true, why: "A restart happened." },
      { text: "2026-11-18 09:40:00 INFO  [job-log] New job id=4041", relevant: true, why: "IDs jumped by 20." },
      { text: "2026-11-18 09:40:00 INFO  [dba] Sequence JOB_SEQ cache=20", relevant: true, why: "The sequence caches 20 values." },
      { text: "2026-11-18 23:59:00 INFO  [job-log] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why do IDs jump?",
        options: [
          "Cached sequence values are lost on a restart",
          "Jobs 4022 to 4040 were deleted by a purge",
          "Another app used the same sequence at 09:30",
          "The patch changed the sequence step to 20",
        ],
        answer: 0,
        explain: "Cached values in memory are discarded.",
      },
      {
        type: 'single',
        prompt: "Is this a problem?",
        options: [
          "No, sequences are unique but not gap free",
          "Yes, jobs 4022 to 4040 were lost",
          "Yes, old IDs will be used again",
          "Yes, foreign keys to jobs now break",
        ],
        answer: 0,
        explain: "Gaps are normal.",
      },
      {
        type: 'multi',
        prompt: "When are gaps normal?",
        options: [
          "After a restart with a cache",
          "After a rollback",
          "With RAC nodes using their own caches",
          "Only when the sequence is NOCACHE",
        ],
        answer: [0,1,2],
        explain: "Sequences never promise no gaps.",
      },
      {
        type: 'single',
        prompt: "What if the business needs gap free numbers?",
        options: [
          "Use a numbering table locked per use, with slower inserts",
          "Set the sequence to NOCACHE so no number is ever skipped",
          "Use SELECT MAX(id) plus 1 with no lock on the table",
          "Use a bigger cache so restarts lose fewer numbers",
        ],
        answer: 0,
        explain: "Gap free needs serialisation.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Explain to the business that gaps are normal",
          "Confirm no rows are missing",
          "Agree whether gap free is needed",
          "Document the behaviour",
          "Close the ticket",
        ],
        explain: "Explain, check, agree, document.",
      },
    ],
  },
  description: `
## Symptoms
- A report shows missing job IDs.

## Change / Context
- Job IDs come from an Oracle sequence.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 INFO  [job-log] New job id=4021
2026-11-18 09:30:00 INFO  [dba] Database restarted for patching
2026-11-18 09:40:00 INFO  [job-log] New job id=4041
2026-11-18 09:40:00 INFO  [dba] Sequence JOB_SEQ cache=20
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
    "Sequences give unique numbers, not gap free ones.",
    "Caches lose values on restart.",
    "Rollbacks leave gaps.",
    "RAC nodes cache separately.",
    "Gap free needs a locked table.",
    "Check for missing rows separately.",
  ],
  solution: `
**Diagnosis.** The restart discarded cached sequence values.

**Immediate mitigation.**
- Explain and confirm no data is missing.

**Root cause.** Expected behaviour of cached sequences.

**Permanent fix.**
- None needed unless gap free numbers are required.

**Prevention.** Document sequence behaviour.
`,
  followUps: [
    { q: "Why cache at all?", a: "It speeds up inserts." },
    { q: "Does NOCACHE remove gaps?", a: "No, rollbacks still leave gaps." },
    { q: "What about ordering on RAC?", a: "Use ORDER if strict order matters, at some cost." },
    { q: "Can Mule MAX plus 1?", a: "No, that is unsafe under concurrency." },
  ],
}
