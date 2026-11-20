export default {
  id: 'inc-255',
  category: 'incidents',
  title: "Files Are Ignored for Five Hours After Each Upload",
  level: 'INTERMEDIATE',
  tags: ["myproject","ftp","time-zone","file-age"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 09:00:00 INFO  [vendor-in] Poll found=1 skipped=1 reason=too new minAgeMs=60000", relevant: true, why: "The file looks too new." },
      { text: "2026-11-18 09:00:00 INFO  [vendor-in] File modified=2026-11-18T13:58:00 now=2026-11-18T09:00:00", relevant: true, why: "The file time is in the future." },
      { text: "2026-11-18 09:00:00 INFO  [ftp-server] Server time zone UTC, client time zone UTC-5", relevant: true, why: "Time zones differ." },
      { text: "2026-11-18 14:00:00 INFO  [vendor-in] Processed vendor_20261118.csv", relevant: true, why: "Five hours late." },
      { text: "2026-11-18 23:59:00 INFO  [vendor-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are files skipped?",
        options: [
          "Mule reads the server’s UTC file times as local time",
          "The vendor’s clock runs five hours fast",
          "The upload takes five hours to finish",
          "The age check uses minutes, not milliseconds",
        ],
        answer: 0,
        explain: "A future time never passes the age check.",
      },
      {
        type: 'single',
        prompt: "What fixes it?",
        options: [
          "Treat the server’s file times as UTC and compare in UTC",
          "Lower the minimum age from one minute to ten seconds",
          "Turn off the age check for this vendor’s files",
          "Ask the server owner to move its clock back five hours",
        ],
        answer: 0,
        explain: "Compare like with like.",
      },
      {
        type: 'multi',
        prompt: "Where else do time zones bite?",
        options: [
          "Watermarks",
          "Archive folder dates",
          "Cut off checks",
          "File size checks",
        ],
        answer: [0,1,2],
        explain: "Any logic that uses file times.",
      },
      {
        type: 'single',
        prompt: "Why keep an age check?",
        options: [
          "It avoids reading files still being written",
          "It stops two nodes reading one file",
          "It keeps polls from timing out",
          "It skips files that are empty",
        ],
        answer: 0,
        explain: "Keep it, but compare times correctly.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Process waiting files",
          "Set the time zone handling",
          "Test with a fresh file",
          "Review other time based checks",
          "Document the server time zone",
        ],
        explain: "Recover, fix, test, review, record.",
      },
    ],
  },
  description: `
## Symptoms
- Vendor files are processed five hours after they arrive.

## Change / Context
- The flow skips files younger than one minute.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:00:00 INFO  [vendor-in] Poll found=1 skipped=1 reason=too new minAgeMs=60000
2026-11-18 09:00:00 INFO  [vendor-in] File modified=2026-11-18T13:58:00 now=2026-11-18T09:00:00
2026-11-18 09:00:00 INFO  [ftp-server] Server time zone UTC, client time zone UTC-5
2026-11-18 14:00:00 INFO  [vendor-in] Processed vendor_20261118.csv
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
    "FTP servers may report times in UTC or local time.",
    "Mismatched zones break age checks.",
    "Compare in UTC.",
    "Watermarks and cut offs are affected too.",
    "Keep age checks.",
    "Record the server time zone.",
  ],
  solution: `
**Diagnosis.** File times are UTC but read as local, so new files look like they are from the future.

**Immediate mitigation.**
- Process waiting files.

**Root cause.** The flow read the server’s UTC file times as local time.

**Permanent fix.**
- Treat server file times as UTC and compare in UTC.

**Prevention.** Test time based logic across zones.
`,
  followUps: [
    { q: "Why five hours?", a: "The client is UTC minus five." },
    { q: "Does daylight saving matter?", a: "Yes, the gap changes twice a year if local times are used." },
    { q: "How do you prove the fix?", a: "Upload a file and see it processed after one minute." },
    { q: "Should servers use UTC?", a: "UTC avoids daylight saving problems." },
  ],
}
