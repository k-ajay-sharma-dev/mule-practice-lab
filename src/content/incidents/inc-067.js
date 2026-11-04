export default {
  id: 'inc-067',
  category: 'incidents',
  title: 'Store End-of-Day Sales Counted Two and Three Times',
  level: 'ADVANCED',
  tags: ['retail', 'sftp', 'oracle', 'idempotency', 'pos', 'files'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '23:30:00.000 INFO  [storage] Change CHG-4471: /pos/eod/archive moved to new NAS volume, owner sftp-archive:retail', relevant: true, why: 'The archive folder was recreated with different ownership just before the end-of-day files arrived.' },
      { text: '23:41:05.220 INFO  [eod] Picked up /pos/eod/in/EOD_0412_20261102.csv (2 310 lines)', relevant: false },
      { text: '23:41:09.880 INFO  [eod] db:bulk-insert STORE_SALES_DAILY rows=2310 store=0412 date=2026-11-02', relevant: true, why: 'The data is committed to Oracle before the file is moved.' },
      { text: '23:41:09.950 ERROR [eod] Could not move file to /pos/eod/archive/EOD_0412_20261102.csv: Permission denied', relevant: true, why: 'The post-processing move fails, so the file stays in the input folder.' },
      { text: '23:46:05.300 INFO  [eod] Picked up /pos/eod/in/EOD_0412_20261102.csv (2 310 lines)', relevant: true, why: 'Next poll, same file again: it will be inserted a second time.' },
      { text: '23:46:06.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '23:50:12.400 INFO  [eod] Picked up /pos/eod/in/EOD_0118_20261102.csv (1 902 lines)', relevant: false },
      { text: '06:10:00.000 INFO  [finance] Daily sales report: total 18.4 M (forecast 6.2 M)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why are sales counted several times?',
        options: [
          'The archive move fails with Permission denied, so each file stays in the input folder and is processed again at every poll, and the inserts are not idempotent',
          'The stores sent their files three times',
          'The SFTP listener reads files while they are still being uploaded',
          'Two replicas are polling the same folder',
        ],
        answer: 0,
        explain: 'The same file name is picked up every 5 minutes right after a move error. The data is already in Oracle, and nothing prevents a second insert of the same store/date.',
      },
      {
        type: 'single',
        prompt: 'What do you do **first**?',
        options: [
          'Stop the listener (or the app), fix the archive folder permissions, then remove duplicate rows per store/date before finance publishes figures',
          'Delete all of yesterday\'s sales and wait for stores to resend',
          'Restart the app so it forgets the files',
          'Increase the polling interval to 1 hour',
        ],
        answer: 0,
        explain: 'Stop more duplicates, fix the cause, then repair the data. A restart re-reads the same files; a longer interval only slows the duplication.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'A unique key on (store, business date, file ID/checksum) or a load control table so a file can only be loaded once',
          'Load each file with replace semantics (delete + insert for store/date in one transaction, or MERGE)',
          'An idempotency check on file name + checksum with a persistent object store before processing',
          'Alert on post-processing move failures and on files older than N minutes in the input folder',
          'Rely on the move succeeding because it normally does',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Make the load idempotent in the database, detect already-processed files, and alert on stuck files. The move is a housekeeping step, not a guarantee.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Stop the SFTP listener to prevent further duplicates',
          'Fix ownership/permissions on the archive folder with the storage team',
          'Identify duplicated store/date loads and remove the extra rows in one reviewed script',
          'Move processed files to the archive and restart the listener',
          'Tell finance the corrected totals and rerun the daily report',
          'Add a load control table and move-failure alerts',
        ],
        explain: 'Contain, fix the cause, repair data, resume, inform the business, then make it idempotent.',
      },
    ],
  },
  description: `
## Symptoms
- Every store uploads an end-of-day sales file (\`EOD_<store>_<date>.csv\`) to SFTP. Mule app \`pos-eod-loader\` polls \`/pos/eod/in\` every 5 minutes, bulk-inserts the lines into Oracle \`STORE_SALES_DAILY\`, and then the listener moves the file to \`/pos/eod/archive\`.
- This morning's finance report shows **18.4 M** in sales against a forecast of 6.2 M. Some stores appear two times, some three or more.

## Change / Context
- At 23:30 the storage team moved the archive folder to a new NAS volume (change CHG-4471). The new folder belongs to a different group.
- The SFTP listener uses \`moveToDirectory="/pos/eod/archive"\`. \`STORE_SALES_DAILY\` has a surrogate primary key only.

## Logs
\`\`\`
23:41:09.880 INFO  [eod] db:bulk-insert STORE_SALES_DAILY rows=2310 store=0412 date=2026-11-02
23:41:09.950 ERROR [eod] Could not move file to /pos/eod/archive/EOD_0412_20261102.csv: Permission denied
23:46:05.300 INFO  [eod] Picked up /pos/eod/in/EOD_0412_20261102.csv (2 310 lines)
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
    'The listener moves the file only after the flow has processed it; the move fails with Permission denied after the archive folder change.',
    'The file stays in the input folder and is picked up again on every poll; each pass inserts all lines again.',
    'The load is not idempotent: no unique business key per store/date/file.',
    'Immediate: stop the listener, fix permissions, de-duplicate per store/date with a reviewed script, archive files, restart, tell finance.',
    'Fix: load control table / unique key, replace or MERGE semantics, file checksum idempotency check, alerts on move failures and stuck files; include integrations in storage change reviews.',
  ],
  solution: `
**Diagnosis.** The SFTP listener processes the file, the flow **bulk-inserts** all lines into Oracle, and only then does the listener try to move the file to the archive. Since change CHG-4471 the Mule SFTP user has no write permission on the new archive folder, so the move fails and the file **stays in /pos/eod/in**. Five minutes later the listener picks it up again and inserts the same lines again. Nothing in \`STORE_SALES_DAILY\` stops a second load of the same store and date, so totals grow every poll until the morning.

**Immediate mitigation.** Stop the listener (stop the flow or the app) to prevent more duplicates. Ask the storage team to grant the SFTP user write access to the archive. Identify duplicate loads per store/date (e.g. same file name loaded several times in the audit columns) and delete the extra rows in one reviewed script. Move processed files manually, restart the listener, and give finance corrected totals and a rerun of the report.

**Root cause.** The design relied on a housekeeping step (the move) to guarantee "process once", and the database had no way to reject a repeated load. An infrastructure change broke the housekeeping step.

**Permanent fix.**
- A **load control table** \`EOD_FILE_LOAD(store, business_date, file_name, checksum, status)\` with a unique key; insert into it in the same transaction as the sales lines and skip files already loaded.
- Or replace semantics: delete + insert for the store/date in one transaction (or MERGE), so reloading a file produces the same result.
- Optionally an Idempotent Message Validator on file name + checksum with a persistent object store.

**Prevention.** Alert on move/delete failures and on files older than 15 minutes in the input folder; include integration owners in storage change reviews; a daily sanity check of totals vs. forecast before reports go out.
`,
  followUps: [
    { q: 'Why not move the file first and process it afterwards?', a: 'Moving to a processing folder first is a good pattern (claim the file), but if the flow then fails you need a way to retry from that folder. Either way the database load should still be idempotent.' },
    { q: 'How does a checksum help if a store legitimately resends a corrected file?', a: 'A corrected file has a different checksum, so it is not treated as a duplicate; with replace semantics per store/date the corrected data simply replaces the old load.' },
    { q: 'Why would watermarking on the SFTP listener not be enough?', a: 'Watermarking skips files whose timestamp is not newer than the last one processed, which can also skip legitimately late or resent files and does not protect the database from a replay.' },
  ],
}
