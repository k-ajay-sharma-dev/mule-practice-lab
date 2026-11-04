export default {
  id: 'inc-071',
  category: 'incidents',
  title: 'Nightly Stock Load Truncated: SFTP Listener Picks Up a Half-Uploaded CSV',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'listener', 'large-files', 'csv', 'data-quality', 'retail', 'inventory'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '2026-11-02 01:58:12 INFO  [sftp-audit] User whs_north started upload STOCK_NORTH_20261102.csv', relevant: true, why: 'The warehouse begins uploading a large file under its final name.' },
      { text: '2026-11-02 02:00:00 INFO  [stock-intake] [sftp-listener] Picked up /inbound/STOCK_NORTH_20261102.csv (size 61,442,048 bytes)', relevant: true, why: 'The listener picks up the file under two minutes into the upload, at about 60 MB.' },
      { text: '2026-11-02 02:00:01 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-11-02 02:03:40 INFO  [stock-intake] Loaded 214,906 rows into Oracle STOCK_LEVELS for warehouse NORTH', relevant: true, why: 'Only part of the expected ~880,000 rows were loaded, and the load was reported as a success.' },
      { text: '2026-11-02 02:03:41 INFO  [stock-intake] Post-action: moved to /archive/STOCK_NORTH_20261102.csv', relevant: false },
      { text: '2026-11-02 02:09:55 INFO  [sftp-audit] User whs_north completed upload STOCK_NORTH_20261102.csv (251,723,776 bytes)', relevant: true, why: 'The upload completed about 12 minutes after it started: the real file is four times larger than what was read.' },
      { text: '2026-11-02 02:15:00 INFO  [stock-intake] [sftp-listener] Picked up /inbound/STOCK_SOUTH_20261102.csv (size 233,105,920 bytes)', relevant: false },
      { text: '2026-11-02 07:30:12 WARN  [ecom-availability] 3,412 SKUs at NORTH show 0 stock (yesterday: 41)', relevant: true, why: 'The business symptom: rows that never reached Oracle make stocked items look sold out.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why were only 214,906 of ~880,000 rows loaded?',
        options: [
          'The listener picked up the file while it was still being uploaded under its final name, read the part that existed, and treated it as complete',
          'Oracle rejected the remaining rows silently',
          'The CSV reader stops at 60 MB',
          'The file was corrupted by the archive post-action',
        ],
        answer: 0,
        explain: 'Upload started 01:58, pickup at 02:00 with 61 MB, upload finished 02:09 with 251 MB. Nothing told the listener to wait for a complete file, and no row-count check caught it.',
      },
      {
        type: 'single',
        prompt: 'What do you do first, before stores open at 08:00?',
        options: [
          'Reload the NORTH stock from the complete file (the archived copy is truncated, so get the full file from the SFTP source or the warehouse) and verify the row count against the warehouse system',
          'Reload from /archive, which holds the file',
          'Set all NORTH SKUs to their stock of yesterday',
          'Wait for tomorrow night\'s file',
        ],
        answer: 0,
        explain: 'The archived file is only what was read before the upload ended, so it may be incomplete. Get the complete file and verify counts before re-running the load.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Set timeBetweenSizeCheck (and its unit) on the listener so a file is only processed once its size stops changing',
          'Agree an upload contract: write as .tmp and rename when complete; the matcher only accepts *.csv',
          'Validate completeness: trailer record or control file with the row count, compare before committing the load',
          'Load into a staging table and switch to the new stock only when the load is complete and validated',
          'Poll less often, every 30 minutes',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Wait for stable files, make completion explicit, verify counts, and publish only validated data. Polling less often only changes the odds.',
      },
      {
        type: 'order',
        prompt: 'Put the target processing steps in order.',
        items: [
          'Warehouse uploads STOCK_NORTH_20261102.csv.tmp',
          'Warehouse renames the file to .csv after the upload completes',
          'Listener matches *.csv, size check confirms the file is stable',
          'Flow loads rows into a staging table and compares the count with the trailer',
          'Staging data is published to STOCK_LEVELS and the file archived',
        ],
        explain: 'Each step removes one way a partial file can reach the live table.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 07:30: the e-commerce site shows **3,412 products as out of stock** for the NORTH warehouse; store staff confirm the shelves are full.
- The nightly job reported success.

## Change / Context
- Warehouses upload a full stock snapshot nightly to SFTP \`/inbound\` (~250 MB, ~880,000 rows). The NORTH warehouse moved to a new site with a slower WAN link last week: uploads now take ~12 minutes instead of 2.
- \`stock-intake\` uses an SFTP listener polling every 15 minutes with \`moveToDirectory="/archive"\`, and a CSV-to-Oracle load that replaces the warehouse's rows in \`STOCK_LEVELS\`.
- There is no size check, no temporary file name, and no row-count validation.

## Logs
\`\`\`
01:58:12 INFO  [sftp-audit] User whs_north started upload STOCK_NORTH_20261102.csv
02:00:00 INFO  [stock-intake] Picked up /inbound/STOCK_NORTH_20261102.csv (size 61,442,048 bytes)
02:03:40 INFO  [stock-intake] Loaded 214,906 rows into STOCK_LEVELS for warehouse NORTH
02:09:55 INFO  [sftp-audit] User whs_north completed upload STOCK_NORTH_20261102.csv (251,723,776 bytes)
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
    'The listener picked up the file mid-upload because it appears under its final name and nothing checks that it is complete.',
    'The slower WAN link made the upload longer than the gap to the next poll — a latent bug became visible.',
    'Immediate: reload from the complete file (not the possibly truncated archive), verify counts, then confirm availability on the site.',
    'Fix: timeBetweenSizeCheck on the listener, .tmp-then-rename contract, trailer/control-file row counts, staging table before publishing.',
    'Prevention: completeness checks and anomaly alerts (sudden row-count drop, many zero-stock SKUs) before data goes live.',
  ],
  solution: `
**Diagnosis.** The upload started at 01:58 and finished at 02:09. The 02:00 poll found the file under its final name at 61 MB and read what existed; the CSV parser reached the end of the available data and the load "succeeded" with 214,906 rows. Because the load replaces the warehouse's rows, the missing products dropped to 0.

**Immediate mitigation.**
- Retrieve the **complete** file: the archive may hold only the partial copy, so check its size against the upload audit, or ask the warehouse to resend.
- Reload NORTH and compare the row count with the warehouse system; confirm the site shows correct availability before 08:00.

**Root cause.** The listener has no way to know when a file is complete, and the job has no completeness validation. The new slow link turned a theoretical race into a nightly one.

**Permanent fix.**
\`\`\`xml
<sftp:listener config-ref="whsSftp" directory="/inbound" moveToDirectory="/archive"
               timeBetweenSizeCheck="30" timeBetweenSizeCheckUnit="SECONDS">
  <scheduling-strategy><fixed-frequency frequency="5" timeUnit="MINUTES"/></scheduling-strategy>
  <sftp:matcher filenamePattern="STOCK_*.csv"/>
</sftp:listener>
\`\`\`
- Contract with warehouses: upload as \`.tmp\`, rename on completion (the rename is atomic on the server).
- Trailer record (or \`.done\` control file) with the row count; compare before committing.
- Load into a staging table; swap/publish only after validation, so a bad file never empties live stock.

**Prevention.** Alert when a warehouse's row count drops more than e.g. 10% day-on-day or zero-stock SKUs spike; test the intake with a slowly written file.
`,
  followUps: [
    { q: 'Is the size check enough on its own?', a: 'It helps, but a stalled upload can look stable for the check interval. The rename contract plus a row-count check make completeness explicit.' },
    { q: 'Why load into staging rather than directly into STOCK_LEVELS?', a: 'A full replace is destructive: a partial file wipes good data. Staging lets you validate and then switch in one step, keeping yesterday\'s data if today\'s file is bad.' },
    { q: 'How could the job know the expected row count without a trailer?', a: 'Ask for a control file with count and checksum, or compare with a reasonable range from previous days as a fallback anomaly check.' },
  ],
}
