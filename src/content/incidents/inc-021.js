export default {
  id: 'inc-021',
  category: 'incidents',
  title: 'Two-Week-Old Invoices Suddenly Re-Processed',
  level: 'ADVANCED',
  tags: ['object-store', 'idempotency', 'sftp', 'ttl', 'duplicates'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-11-03 07:00:00.002 INFO  [invoices] Poll /invoices: 2,014 files listed (retention 90 days, autoDelete=false)', relevant: true, why: 'All files stay on the server, so the listener sees every old file on every poll; only the validator prevents re-processing.' },
      { text: '2026-11-03 07:00:12.004 DEBUG [invoices] Duplicate message, ignoring INV_ACME_20261103_001.xml', relevant: false },
      { text: '2026-11-03 07:00:12.311 INFO  [invoices] Processing INV_ACME_20261019_004.xml corrId=1c3e', relevant: true, why: 'A file from 15 days ago is treated as new: its key in processedFiles expired after the 14-day TTL.' },
      { text: '2026-11-03 07:00:13.020 INFO  [invoices] Posted to SAP doc=5100088123 corrId=1c3e', relevant: true, why: 'SAP has no duplicate check, so the old invoice is posted again.' },
      { text: '2026-11-03 07:00:13.442 INFO  [invoices] Processing INV_ACME_20261019_005.xml corrId=8e7a', relevant: false },
      { text: '2026-11-03 07:05:00.003 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '2026-11-03 07:20:41.900 INFO  [invoices] Run finished: 1,912 files processed (daily average 14)', relevant: true, why: 'About 130 times the normal volume: an alert on this would have stopped the run early.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why were 14-15 day old invoices processed again today?',
        options: [
          'The idempotency keys expire after 14 days, but the files stay on the SFTP server for 90 days',
          'The supplier re-uploaded old files',
          'The Object Store was wiped by a restart',
          'The SFTP listener watermark was reset',
        ],
        answer: 0,
        explain: 'No restart or deployment happened. Day 15 after go-live is the first day the oldest keys expired. It will happen every day for files up to 90 days old.',
      },
      {
        type: 'single',
        prompt: 'What is the **first** thing to do?',
        options: [
          'Stop the listener flow before the next poll creates more duplicates',
          'Delete all files from the supplier folder',
          'Clear the processedFiles store',
          'Wait and see whether it happens again tomorrow',
        ],
        answer: 0,
        explain: 'Tomorrow’s keys expire too, so every day creates new duplicates. Clearing the store would make every file look new. Deleting files breaks the 90-day agreement.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'A watermark on the listener, or a durable processed-files table kept longer than 90 days',
          'Agree with the supplier to move processed files to /processed',
          'Business idempotency: check supplier and invoice number before posting to SAP',
          'Ask "what happens on day TTL + 1?" for every TTL and test it with a short TTL',
          'Shorten the TTL to 7 days so the store stays smaller',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The dedup window must cover the time the input can be re-delivered. A shorter TTL makes it worse.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Stop the listener flow',
          'Identify the duplicate SAP documents from today’s logs',
          'Reverse them with accounts payable before the payment run',
          'Re-seed a durable store with all current filenames, retained beyond 90 days',
          'Switch to a watermark or durable table and add a volume alert',
        ],
        explain: 'Contain, find the damage, reverse it before money leaves, then restart safely and fix the design.',
      },
    ],
  },
  description: `
## Symptoms
- This morning the accounts-payable team found **~1,900 duplicate supplier invoices** in SAP, all originally received **14–15 days ago**.
- Each day since go-live (15 days ago) the app has processed only that day's new files; today it suddenly processed today's files **plus** all files from day 1.
- No deployment or restart happened in the last week.

## Change / Context
- \`supplier-invoices\` uses an SFTP **On New or Updated File** listener on the supplier's \`/invoices\` folder. The supplier requires that files stay in place for 90 days, so \`autoDelete="false"\` and no move.
- To avoid processing a file twice, the flow starts with an **Idempotent Message Validator** using \`#[attributes.fileName]\` as id and the object store \`processedFiles\`:
  \`<os:object-store name="processedFiles" persistent="true" entryTtl="14" entryTtlUnit="DAYS"/>\`
  The 14-day TTL was added in code review "to stop the store growing forever".
- SAP accepts the same invoice number twice (no duplicate check on that document type).

## Logs
\`\`\`
2026-11-03 07:00:12.004 DEBUG [invoices] Duplicate message, ignoring INV_ACME_20261103_001.xml
2026-11-03 07:00:12.311 INFO  [invoices] Processing INV_ACME_20261019_004.xml corrId=1c3e
2026-11-03 07:00:13.020 INFO  [invoices] Posted to SAP doc=5100088123 corrId=1c3e
2026-11-03 07:00:13.442 INFO  [invoices] Processing INV_ACME_20261019_005.xml corrId=8e7a
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
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
    'Identifies that the idempotency keys expire after 14 days while the source files stay on the server for 90 days, so the listener sees the old files again and the validator no longer recognises them.',
    'Explains why it happened "suddenly": day 15 is the first day keys from go-live expire; from now on, it will repeat every day for older files.',
    'Immediate: stop the flow/listener, prevent tomorrow\'s re-run (e.g. re-seed processedFiles with all filenames still on the server, or raise TTL beyond 90 days), and reverse the ~1,900 duplicate SAP documents with AP.',
    'Permanent fix: dedup retention must be at least as long as the source keeps the data, or don\'t depend on it — use the listener watermark, a durable processed-files table, or move files to a processed folder if allowed.',
    'Adds a business-level idempotency check: SAP/receiver rejects duplicate supplier + invoice number.',
    'Prevention: test/plan for TTL expiry ("what happens on day TTL+1"), and alert on spikes in files processed per run.',
  ],
  solution: `
**Diagnosis.** Files remain on the SFTP server for **90 days**, and the listener sees them on every poll. The only thing preventing re-processing is the **Idempotent Message Validator**, whose keys expire after **14 days**. Day 15 after go-live is the first day the oldest keys expired, so those files looked brand new and were posted to SAP again. Nothing changed in the app — this is a **time bomb** set in code review, and it will go off again every day for the next 75 days' worth of files.

**Immediate mitigation.**
1. **Stop** the listener flow now (Runtime Manager → stop the flow / app) to prevent tomorrow's batch of duplicates.
2. Make the store recognise all existing files: either redeploy with a TTL > 90 days and **re-seed** \`processedFiles\` with every filename currently on the server (a one-off flow that lists the folder and stores the names), or switch on the permanent fix first. A TTL above 90 days is not possible on Object Store v2, whose maximum TTL is 30 days: there, go straight to a database table.
3. With accounts payable: identify the duplicates (logs give file names and SAP doc numbers from today) and **reverse/cancel** them before payment runs.

**Root cause.** The idempotency window (14 days) was shorter than the time the same input can be re-delivered (90 days). Deduplication was the only protection, and the receiver (SAP) had no duplicate check.

**Permanent fix.**
- Choose a mechanism whose retention matches the source:
  - **Listener watermark** (\`watermarkEnabled="true"\`) so only files with a newer timestamp are picked up — no per-file keys needed (watch for files uploaded with old timestamps).
  - Or a **durable processed-files table** in a DB (filename + checksum + processed date), purged only after the source deletes the file (> 90 days).
  - Or agree with the supplier to **move** processed files to a \`/processed\` folder.
- **Business idempotency** downstream: check supplier id + invoice number before posting to SAP (or enable SAP's duplicate invoice check).

**Prevention.** For every dedup/TTL: write down *"what happens on day TTL + 1?"* and test it with a shortened TTL; alert when a run processes far more files than usual (here: ~130x normal) — the run could have been stopped after the first few documents.
`,
  followUps: [
    { q: 'Is a persistent Object Store on CloudHub enough for long-term dedup?', a: 'Object Store v2 has a retention limit (the maximum TTL is 30 days) and it is not meant as a permanent record store. For long retention, use a database table you control.' },
    { q: 'Why was the code reviewer\'s concern about growth valid?', a: 'An unbounded store does grow forever. The right answer is to size retention to the business window (here at least 90 days) or purge keys when the source file is deleted, not to pick an arbitrary short TTL.' },
    { q: 'How would you have detected this earlier?', a: 'Monitoring files processed per run and SAP documents created per day, with an alert on unusual spikes; also a test that fast-forwards past the TTL in a lower environment.' },
  ],
}
