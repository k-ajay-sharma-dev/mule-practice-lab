export default {
  id: 'inc-229',
  category: 'incidents',
  title: "The Move to the Processed Folder Fails Because Another Program Has the File Open",
  level: 'INTERMEDIATE',
  tags: ["myproject","azure-file-share","locks","smb"],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: "2026-11-18 09:10:00 INFO  [ops] Desktop sync tool connected to share plans as user store-reports", relevant: true, why: "A desktop tool keeps files open." },
      { text: "2026-11-18 09:15:02 INFO  [plan-import] Loaded file=plan_store_0412.txt rows=880", relevant: true, why: "The load worked." },
      { text: "2026-11-18 09:15:02 ERROR [plan-import] Move failed file=plan_store_0412.txt status=409 code=SharingViolation", relevant: true, why: "Another handle holds the file." },
      { text: "2026-11-18 09:20:02 INFO  [plan-import] Loaded file=plan_store_0412.txt rows=880", relevant: true, why: "Because the move failed, the file is loaded again." },
      { text: "2026-11-18 23:59:00 INFO  [plan-import] GET /health 200", relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: "Why does the move fail?",
        options: [
          "The desktop sync tool has the file open, so it is locked",
          "The importer still has the file open from its own load",
          "The processed folder already holds a file with that name",
          "The importer’s SAS token allows reads but not deletes",
        ],
        answer: 0,
        explain: "SharingViolation means another handle blocks the operation.",
      },
      {
        type: 'single',
        prompt: "What is the worst effect?",
        options: [
          "Each poll loads the file again and adds duplicate plan rows",
          "The processed folder fills with partial copies of the file",
          "The desktop users see an old copy of the file in their sync",
          "The importer stops polling until someone clears the error",
        ],
        answer: 0,
        explain: "A failed move leaves the file where the poller sees it.",
      },
      {
        type: 'multi',
        prompt: "Which fixes stop the duplicates?",
        options: [
          "Record loaded file names and checksums, and skip ones already loaded",
          "Make the load an upsert on a natural key",
          "Keep desktop tools away from the inbound folder",
          "Retry the move three times before the next poll",
        ],
        answer: [0,1,2],
        explain: "Idempotent loads and a clean inbound folder both help.",
      },
      {
        type: 'single',
        prompt: "Can you see who holds the handle?",
        options: [
          "Yes, the share lists open handles, and an admin can close them",
          "No, SMB handles are visible only on the client that opened them",
          "Only from the storage account’s monthly usage report",
          "Only by restarting the storage account, which drops all handles",
        ],
        answer: 0,
        explain: "Azure Files can list and force close handles.",
      },
      {
        type: 'order',
        prompt: "Order the response.",
        items: [
          "Stop the importer",
          "Remove the duplicate plan rows",
          "Close or stop the desktop sync on the folder",
          "Add a loaded file check",
          "Restart the importer",
        ],
        explain: "Contain, clean, remove the cause, harden, resume.",
      },
    ],
  },
  description: `
## Symptoms
- Store 412 has the same plan rows loaded several times.

## Change / Context
- After loading, the importer moves each file to processed. A team installed a desktop tool that syncs the plans folder to their PCs.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-18 09:10:00 INFO  [ops] Desktop sync tool connected to share plans as user store-reports
2026-11-18 09:15:02 INFO  [plan-import] Loaded file=plan_store_0412.txt rows=880
2026-11-18 09:15:02 ERROR [plan-import] Move failed file=plan_store_0412.txt status=409 code=SharingViolation
2026-11-18 09:20:02 INFO  [plan-import] Loaded file=plan_store_0412.txt rows=880
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
    "SMB clients can hold locks on files.",
    "A failed move can cause repeat loads.",
    "Track loaded files to be idempotent.",
    "Upserts protect against repeats.",
    "Keep inbound folders for the integration only.",
    "Admins can list and close open handles.",
  ],
  solution: `
**Diagnosis.** A desktop sync tool holds the file open. The move fails, the file stays, and every poll loads it again.

**Immediate mitigation.**
- Stop the importer, remove duplicates, close the handles.

**Root cause.** The load is not idempotent, and another program uses the inbound folder.

**Permanent fix.**
- Keep a table of loaded file names and checksums, and load with upserts.

**Prevention.** Inbound folders are only for the integration. Alert on move failures.
`,
  followUps: [
    { q: "Why not move first and load after?", a: "Move to a working folder first, then load, then to processed. A crash leaves a clear state." },
    { q: "What is a checksum for?", a: "It detects the same content arriving under a new name." },
    { q: "Should the move error stop the flow?", a: "It should be logged and alerted, and must not lead to a reload." },
    { q: "How do you give the team their copy?", a: "Copy processed files to a reports folder they can sync." },
  ],
}
