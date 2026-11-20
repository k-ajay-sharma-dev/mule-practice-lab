export default {
  id: 'inc-254',
  category: 'incidents',
  title: "A New FTP Server Returns a Different Listing Format and No Files Are Found",
  level: 'INTERMEDIATE',
  tags: ["myproject","ftp","listing","parser"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 05:00:00 INFO  [inv-in] Connected host=ftp2.dc.example system=Windows_NT", relevant: true, why: "The new server is a Windows FTP server." },
      { text: "2026-11-18 05:00:01 INFO  [inv-in] Listed entries=0", relevant: true, why: "No entries parsed." },
      { text: "2026-11-18 05:00:01 DEBUG [inv-in] Raw LIST line: 11-18-26  04:55AM   812004 inv_20261118.csv", relevant: true, why: "A DOS style line, not Unix style." },
      { text: "2026-11-18 05:05:00 WARN  [planning-export] Inventory file missing", relevant: true, why: "Downstream is waiting." },
      { text: "2026-11-18 23:59:00 INFO  [inv-in] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why are no files found?",
        options: [
          "The client cannot parse the listing format",
          "The file was uploaded after the listing",
          "The FTP user cannot read the folder",
          "The working folder path is wrong",
        ],
        answer: 0,
        explain: "The raw line shows a file that was not parsed.",
      },
      {
        type: 'single',
        prompt: "What can fix it?",
        options: [
          "Have the server send machine readable MLSD listings",
          "Ask the server owner to rename files to upper case",
          "Poll at 05:30 so the file has time to settle",
          "Switch the transfer to ASCII mode for the listing",
        ],
        answer: 0,
        explain: "MLSD listings follow a standard format that clients parse reliably.",
      },
      {
        type: 'multi',
        prompt: "What should a migration test cover?",
        options: [
          "Listing and parsing names, sizes and times",
          "Upload, download, rename and delete",
          "Time zone of file times",
          "Login only, since the rest is unchanged",
        ],
        answer: [0,1,2],
        explain: "Test every operation the flow uses.",
      },
      {
        type: 'single',
        prompt: "Why log the raw line at DEBUG?",
        options: [
          "It shows the format without flooding normal logs",
          "DEBUG lines are kept longer than INFO lines",
          "The FTP connector can log raw lines only at DEBUG",
          "DEBUG lines are hidden from the support team",
        ],
        answer: 0,
        explain: "Turn it on when you need it.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Copy today’s file by hand to unblock",
          "Configure listing support for the server",
          "Test list, read and move",
          "Check file time zones",
          "Add a zero files alert",
        ],
        explain: "Unblock, fix, test, check, watch.",
      },
    ],
  },
  description: `
## Symptoms
- After moving to a new FTP server, the inventory job finds no files.

## Change / Context
- The old server was Linux. The new one is Windows.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 05:00:00 INFO  [inv-in] Connected host=ftp2.dc.example system=Windows_NT
2026-11-18 05:00:01 INFO  [inv-in] Listed entries=0
2026-11-18 05:00:01 DEBUG [inv-in] Raw LIST line: 11-18-26  04:55AM   812004 inv_20261118.csv
2026-11-18 05:05:00 WARN  [planning-export] Inventory file missing
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
    "FTP LIST output is not standard.",
    "MLSD gives machine readable listings.",
    "Test every operation after a server move.",
    "File times may be in another time zone.",
    "Log raw lines at DEBUG.",
    "Alert on zero files.",
  ],
  solution: `
**Diagnosis.** The new server returns DOS style listings the client does not parse.

**Immediate mitigation.**
- Copy the file by hand and load it.

**Root cause.** The migration was tested with login only.

**Permanent fix.**
- Enable MLSD on the new server so the client gets machine readable listings.

**Prevention.** A full operation test for server changes.
`,
  followUps: [
    { q: "What is MLSD?", a: "A command that returns listings in a fixed machine readable format." },
    { q: "Why do time zones matter?", a: "Watermarks and age checks compare file times." },
    { q: "Does SFTP have this problem?", a: "Less, because SFTP returns structured attributes." },
    { q: "What does zero files usually mean?", a: "Either no data or a broken listing. Alert and check." },
  ],
}
