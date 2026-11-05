export default {
  id: 'inc-005',
  category: 'incidents',
  title: 'OutOfMemoryError While Processing a Large Price File',
  level: 'ADVANCED',
  tags: ['memory', 'streaming', 'batch', 'dataweave', 'files'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '01:00:00.912 INFO  [runtime] price-sync started, heap max 3.8 GB', relevant: false },
      { text: '01:00:03.114 INFO  [price-sync] New file prices_full_20261102.csv (2,148,532,113 bytes)', relevant: true, why: 'The file is 2.1 GB, about 25 times the usual 80 MB.' },
      { text: '01:02:15.400 INFO  [health] GET /health 200 (40 ms)', relevant: false },
      { text: '01:04:51.870 WARN  [GC] Pause Full (Allocation Failure) 3742M->3739M, 6.2 s', relevant: true, why: 'A full GC frees almost nothing: the heap is full of live data that the flow keeps in memory.' },
      { text: '01:05:20.402 ERROR [price-sync] java.lang.OutOfMemoryError: Java heap space at org.mule.weave.v2...', relevant: true, why: 'The heap runs out inside DataWeave, where groupBy and Java output build the whole file in memory.' },
      { text: '01:05:22.003 INFO  [runtime] Worker restarted (application crashed)', relevant: false },
      { text: '01:06:10.551 INFO  [price-sync] New file prices_full_20261102.csv (2,148,532,113 bytes)', relevant: true, why: 'The same file is picked up again after restart because it is only moved to /archive on success: a crash loop.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the most likely root cause of the crash?',
        options: [
          'The flow holds the whole file in memory (groupBy, Java output, sizeOf, one bulk update), which cannot fit a 2.1 GB file',
          'A memory leak in the Mule runtime',
          'The SFTP connector buffers every file fully regardless of settings',
          'The database is too slow, so records pile up in memory',
        ],
        answer: 0,
        explain: 'groupBy needs all rows at once, Java output builds a full list of objects, and sizeOf walks it again. With 14 M rows that exceeds the heap. Nothing was deployed, so a new leak is unlikely.',
      },
      {
        type: 'single',
        prompt: 'What do you do **right now** to restore service?',
        options: [
          'Keep restarting until the file goes through',
          'Stop the listener, move the 2.1 GB file to a quarantine folder and restart, then load it in a controlled way',
          'Delete the file from SFTP and tell nobody',
          'Increase the worker to 4 vCores permanently and leave the flow as it is',
        ],
        answer: 1,
        explain: 'Break the crash loop first so normal nightly files work, then load the big file deliberately (split into smaller files or on a temporary larger worker). Only a bigger worker postpones the problem.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Read the CSV with streaming and avoid operations that need the whole input (groupBy, orderBy, sizeOf)',
          'Process in chunks, e.g. a Batch Job with an aggregator doing bulk upserts of about 1,000 records',
          'Move the file to /processing at the start, and to /archive or /error at the end, never retrying it forever',
          'Increase millisBetweenRetries on the SFTP listener',
        ],
        answer: [0, 1, 2],
        explain: 'Streaming plus chunking keeps memory flat whatever the file size, and explicit file states stop a bad file from causing a crash loop.',
      },
      {
        type: 'order',
        prompt: 'Put the incident response in order.',
        items: [
          'Link the OOM and restarts to the 2.1 GB file',
          'Stop the app and quarantine the file to break the crash loop',
          'Restart so normal nightly files process',
          'Load the large file in smaller pieces in a controlled way',
          'Redesign the flow for streaming and chunked batch processing, with a size check',
        ],
        explain: 'Diagnose, contain, restore normal operation, recover the data, then fix the design.',
      },
    ],
  },
  description: `
## Symptoms
- \`price-sync\` picks up a nightly CSV of supplier prices from SFTP and upserts them into the product database.
- It worked for months with files of ~80 MB. Last night the supplier sent the **full catalogue: 2.1 GB, ~14 million rows**.
- The app crashed, restarted automatically, picked up the **same file again**, and crashed again — three times before someone disabled it.
- Runtime Manager shows the worker restarting; memory graph climbs to 100% within minutes of each start.
- Worker size: 1 vCore (CloudHub). Nothing was deployed recently.

## Flow (simplified)
\`\`\`
<sftp:listener directory="/inbound/prices" ... />   (default streaming)
<ee:transform>
  %dw 2.0
  output application/java
  ---
  (payload groupBy $.supplierSku) pluck (rows, sku) -> { sku: sku, price: rows[-1].price }
</ee:transform>
<logger message="#['Rows: ' ++ sizeOf(payload)]" />
<db:bulk-update ...>  (all records in one call)
<sftp:move ... to="/archive" />
\`\`\`

## Logs
\`\`\`
01:00:03.114 INFO  [price-sync] New file prices_full_20261102.csv (2,148,532,113 bytes)
01:04:51.870 WARN  [GC] Pause Full (Allocation Failure) 3742M->3739M, 6.2 s
01:05:20.402 ERROR [price-sync] java.lang.OutOfMemoryError: Java heap space
    at java.util.Arrays.copyOf(...)
    at org.mule.weave.v2...
01:05:22.003 INFO  [runtime] Worker restarted (application crashed)
01:06:10.551 INFO  [price-sync] New file prices_full_20261102.csv (2,148,532,113 bytes)
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now** to restore service?
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
    'Identifies that the flow loads the whole file into heap: groupBy needs all rows at once, output application/java materialises everything, sizeOf forces another full pass, and the bulk update is one giant list.',
    'Explains the crash loop: the file is moved to /archive only at the end, so after each crash the listener picks the same file up again.',
    'Immediate: stop/disable the poller, move the big file to a quarantine folder, restore normal processing; process the big file separately (split it or on a temporarily larger worker).',
    'Permanent fix: stream the file (CSV reader streaming, deferred output or Batch Job / For Each over a stream) and write in fixed-size chunks/blocks instead of one bulk call.',
    'Replaces the groupBy de-duplication with a streaming-friendly approach (e.g. upsert where last write wins, or de-dup in the database / staging table).',
    'Prevention: file size guard (reject/route files above a threshold), move/lock the file at start to avoid reprocessing loops, memory alerts, and load tests with worst-case file sizes.',
  ],
  solution: `
**Diagnosis.** The flow was built for small files and keeps **everything in memory**:
- \`groupBy\` needs all 14 M rows at once to build the groups, so DataWeave cannot stream.
- \`output application/java\` produces a full in-memory list of objects (far bigger than the 2.1 GB of text).
- \`sizeOf(payload)\` in the logger walks the whole thing again.
- \`db:bulk-update\` receives one huge list.

The heap fills, GC runs back-to-back (\`Pause Full ... 3742M->3739M\` — almost nothing freed), then \`OutOfMemoryError: Java heap space\`.

**Crash loop.** The file is only moved to \`/archive\` **after** success. A crash means it stays in \`/inbound\`, the restarted app picks it up again and dies again.

**Immediate mitigation.**
1. Stop the app (or the listener), move the 2.1 GB file to a \`/quarantine\` folder, and restart so normal nightly files work.
2. Confirm with the supplier whether a full catalogue is expected from now on.
3. Load the big file once in a controlled way: split it into smaller files (e.g. 500k rows) and drop them in one by one, or run on a temporarily larger worker.

**Root cause.** Non-streaming design (group-by in memory, Java output, single bulk write) plus no guard on input size, and file handling that reprocesses a file after a crash.

**Permanent fix.**
- **Stream**: read the CSV with streaming enabled (e.g. \`application/csv; streaming=true\` as the reader setting) and avoid operations that need the whole input (\`groupBy\`, \`orderBy\`, \`sizeOf\`, indexing from the end).
- Process in **chunks**: a **Batch Job** (records streamed into the job, a Batch Aggregator of e.g. 1,000 records doing the DB bulk upsert) or a For Each with \`batchSize\` over a streamed payload.
- **De-dup** differently: upsert by SKU so the last row wins, or load into a staging table and de-dup with SQL.
- **File handling**: move the file to a \`/processing\` folder at the start; on completion move it to \`/archive\`, on failure to \`/error\` — never retry the same file automatically forever.
- Log a row count **at the end** from the batch job result, not \`sizeOf(payload)\`.

**Prevention.** Add a size check before processing (alert and route files above a threshold). Set memory and restart alerts in Anypoint Monitoring. Run performance tests with a worst-case file. Make an agreement with the supplier about file size/format changes.
`,
}
