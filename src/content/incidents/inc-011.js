export default {
  id: 'inc-011',
  category: 'incidents',
  title: 'Half a File Processed: SFTP Listener Grabs Files Mid-Upload',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'files', 'polling', 'data-integrity'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '05:59:42.010 INFO  [sftp] Partner session opened, upload started: /inbound/stock_20261103.csv', relevant: true, why: 'The partner writes the file directly under its final name, and the upload is still running.' },
      { text: '06:00:00.500 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '06:00:10.022 INFO  [stock-import] New file /inbound/stock_20261103.csv size=12,618,440', relevant: true, why: 'The listener picks the file up at 12.6 MB, well short of the ~30 MB the full file should be.' },
      { text: '06:00:10.517 INFO  [stock-import] Parsed 19,766 stock rows', relevant: true, why: 'The truncated file is still valid CSV, so it parses without error, but the trailer says 48,210 rows.' },
      { text: '06:00:41.903 INFO  [stock-import] Upserted 19,766 rows into inventory DB', relevant: false },
      { text: '06:00:41.920 INFO  [stock-import] Moved file to /archive/stock_20261103.csv', relevant: true, why: 'The file is moved mid-upload, so the archive copy is truncated too.' },
      { text: '06:00:50.031 INFO  [stock-import] Polling /inbound: no new files', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause?',
        options: [
          'The listener reads the file while the partner is still uploading it under its final name',
          'The CSV parser stops at a malformed row',
          'The inventory database rejects rows silently',
          'The SFTP connection drops during the read',
        ],
        answer: 0,
        explain: 'Only large, slow uploads are affected, the size at pickup is too small, and the archive is truncated too. A 10 s poll catches the file before it is finished.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now**?',
        options: [
          'Re-process the archived file',
          'Ask the partner to re-send the file, re-run the import, and check past runs against their records',
          'Increase the polling frequency to 1 s',
          'Nothing, tomorrow’s file will overwrite the stock levels',
        ],
        answer: 1,
        explain: 'The archive copy is truncated, so it cannot be trusted. Faster polling would make the problem worse.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Partner uploads as .tmp (or to /staging) and renames to .csv when complete',
          'Or a separate .done trigger file after the data file',
          'Listener size check (timeBetweenSizeCheck) as a safety net',
          'Validate the TRL row count and route mismatches to an error folder with an alert',
          'Increase the polling interval to 10 minutes',
        ],
        answer: [0, 1, 2, 3],
        explain: 'An agreed completion signal plus a completeness check. A longer interval only makes the race rarer, not impossible.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Compare the trailer count with the processed rows and the file size at pickup',
          'Ask the partner to re-send today’s file',
          'Re-run the import and verify the row count',
          'Agree a rename or done-file convention with the partner',
          'Add trailer validation to the flow',
        ],
        explain: 'Diagnose, recover data, verify, then fix the contract and add a safety net.',
      },
    ],
  },
  description: `
## Symptoms
- \`stock-import\` loads warehouse stock levels from a partner's SFTP server.
- About once a week the import "succeeds" but only part of the file is loaded. Today: the file's trailer says **48,210 rows**, the app processed **19,766**.
- On those days the partner says their upload took longer than usual (large file, slow line). Small files are never affected.
- After processing, the file is gone from \`/inbound\` and the archive copy in \`/archive\` is **also truncated**.

## Change / Context
- SFTP **On New or Updated File** listener on \`/inbound\`, polling every 10 s, \`matcher\` = \`*.csv\`, \`moveToDirectory="/archive"\`.
- The partner uploads directly as \`stock_YYYYMMDD.csv\` (no temporary name). Upload of a 30 MB file can take several minutes.
- The CSV has no checksum; the last line is a trailer \`TRL,<rowcount>\` but the flow ignores it.

## Logs
\`\`\`
06:00:10.022 INFO  [stock-import] New file /inbound/stock_20261103.csv size=12,618,440
06:00:10.517 INFO  [stock-import] Parsed 19,766 stock rows
06:00:41.903 INFO  [stock-import] Upserted 19,766 rows into inventory DB
06:00:41.920 INFO  [stock-import] Moved file to /archive/stock_20261103.csv
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
    'Identifies that the listener picks up the file while it is still being uploaded because the final name appears at the start of the upload and the file matches *.csv immediately.',
    'Explains why only big/slow uploads are affected: the 10 s poll falls inside a long upload window.',
    'Immediate: ask the partner to re-send today\'s file (the archive copy is truncated too) and re-run the import; check other days with the trailer count.',
    'Permanent fix options: partner uploads to a temp name/folder and renames when done (best), or a done/trigger file, plus the listener size check (timeBetweenSizeCheck) as a safety net.',
    'Adds validation: compare the trailer row count (or a checksum) with the rows parsed and fail/alert instead of loading partial data.',
  ],
  solution: `
**Diagnosis.** The partner creates \`stock_YYYYMMDD.csv\` under its **final name** and keeps writing to it for minutes. The listener polls every 10 s, sees a matching \`*.csv\`, and reads whatever bytes exist at that moment (12.6 MB of ~30 MB). The truncated content is still valid CSV, so parsing works and only ~19.7k rows are loaded. Moving the file while it is being written means the archive holds the same partial content (what happens to the rest of the upload depends on the SFTP server). Small files finish uploading before a poll hits them, which is why they're fine.

**Immediate mitigation.** The data in the DB is incomplete and the archive is not trustworthy: ask the partner to **re-send today's file**, re-run the import, and check past runs by comparing processed counts with the partner's records. If stock levels drive sales, flag affected SKUs until the reload finishes.

**Root cause.** No agreed "file is complete" signal between producer and consumer, and no completeness check in the flow.

**Permanent fix.**
- **Best**: partner uploads as \`stock_YYYYMMDD.csv.tmp\` (or to a \`/staging\` folder) and **renames** to \`.csv\` when finished — rename is atomic on the server, and the matcher only accepts \`*.csv\`.
- Alternative: a **trigger/done file** (\`stock_YYYYMMDD.done\`) uploaded after the data file; the flow listens for \`.done\` and then reads the data file.
- Safety net: configure the listener's **size check** (\`timeBetweenSizeCheck\` + unit), so a file is only processed if its size didn't change between two checks. This helps but is not a guarantee if the upload stalls.
- **Validate** the trailer: if \`TRL\` count ≠ rows parsed, or the trailer is missing, move the file to an error folder and alert instead of loading.

**Prevention.** Make "how do we know a file is complete" a mandatory item in every file interface contract (temp name/rename, done file, or checksum), and test with slow, large uploads.
`,
  followUps: [
    { q: 'Why is the size check alone not a full fix?', a: 'It only proves the size did not change during the check interval. If the sender pauses longer than that interval (network hiccup), a partial file still looks stable. It is a safety net, not a contract.' },
    { q: 'How would you have detected this earlier?', a: 'By validating the trailer row count or a checksum on every run and alerting on mismatches, and by monitoring processed row counts against the usual range for that file.' },
    { q: 'What if the partner refuses to change their upload?', a: 'Use the size check with a generous interval, require a minimum file age before processing, validate the trailer, and only then process. Document the residual risk.' },
  ],
}
