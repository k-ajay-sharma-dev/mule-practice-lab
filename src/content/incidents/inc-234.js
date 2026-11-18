export default {
  id: 'inc-234',
  category: 'incidents',
  title: "Stores Receive Last Week’s Replenishment Plan Because the Control File Arrived First",
  level: 'ADVANCED',
  tags: ["myproject","azure-file-share","planning-platform","plans","control-file"],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [plan-inbound] Control file found plans_20261118.ctl expectedFiles=12", relevant: true, why: "The control file says 12 plan files." },
      { text: "2026-11-18 05:00:01 INFO  [plan-inbound] Plan files present=7 of 12", relevant: true, why: "Only 7 are on the share yet." },
      { text: "2026-11-18 05:00:01 INFO  [plan-inbound] Loaded plans region=1..7, regions 8..12 kept previous plan", relevant: true, why: "The flow loaded a mix of new and old." },
      { text: "2026-11-18 05:20:00 INFO  [planning-platform] Upload complete files=12", relevant: true, why: "The rest arrived later." },
      { text: "2026-11-18 23:59:00 INFO  [plan-inbound] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "What went wrong?",
        options: [
          "The flow trusted the control file before all plan files had arrived and loaded part of the set",
          "The plans were wrong",
          "The share lost files",
          "The regions are misconfigured",
        ],
        answer: 0,
        explain: "The control file was written first, not last.",
      },
      {
        type: 'single',
        prompt: "What should the flow do when files are missing?",
        options: [
          "Wait and check again, and alert if the set is not complete by a cut off",
          "Load what is there",
          "Delete the control file",
          "Use last week’s plans for all",
        ],
        answer: 0,
        explain: "Load the set only when it is complete.",
      },
      {
        type: 'multi',
        prompt: "Which checks make a set complete?",
        options: [
          "Every file named in the control file is present",
          "Row counts match the control file",
          "Each file has a valid trailer",
          "The control file exists",
        ],
        answer: [0,1,2],
        explain: "The control file alone proves nothing until its contents match.",
      },
      {
        type: 'single',
        prompt: "What should the platform team change?",
        options: [
          "Write the control file last, after every plan file",
          "Write the control file first",
          "Stop sending a control file",
          "Send one big file",
        ],
        answer: 0,
        explain: "Last means complete.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop stores using today’s plan",
          "Load the full set of 12",
          "Tell stores the plan is corrected",
          "Add the completeness checks",
          "Agree control file last with the platform team",
        ],
        explain: "Contain, recover, tell, then prevent.",
      },
    ],
  },
  description: `
## Symptoms
- Five regions got last week’s replenishment quantities.

## Change / Context
- The planning platform drops 12 regional plan files and a control file on the share each morning.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [plan-inbound] Control file found plans_20261118.ctl expectedFiles=12
2026-11-18 05:00:01 INFO  [plan-inbound] Plan files present=7 of 12
2026-11-18 05:00:01 INFO  [plan-inbound] Loaded plans region=1..7, regions 8..12 kept previous plan
2026-11-18 05:20:00 INFO  [planning-platform] Upload complete files=12
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
    "A control file should be written last.",
    "Check every listed file is present.",
    "Match counts with the control file.",
    "Load a set all together or not at all.",
    "Alert at a cut off time.",
    "Agree the order with the sender.",
  ],
  solution: `
**Diagnosis.** The control file arrived before the plan files. The flow loaded 7 new and kept 5 old.

**Immediate mitigation.**
- Load all 12 once present and tell stores.

**Root cause.** The flow assumed the control file means the set is complete.

**Permanent fix.**
- Check names and counts against the control file and load the set in one transaction.

**Prevention.** Control file last, and an alert when a set is incomplete by the cut off.
`,
  followUps: [
    { q: "Why load in one transaction?", a: "So stores never see a mix of old and new plans." },
    { q: "What if one file never comes?", a: "Alert at the cut off and let the business decide." },
    { q: "How long should the flow wait?", a: "Until the agreed cut off, checking on each poll." },
    { q: "Where do the counts come from?", a: "The control file lists each file and its row count." },
  ],
}
