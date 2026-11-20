export default {
  id: 'ms-290',
  category: 'mulesoft',
  title: 'Designing FTP Feeds to and From the Planning Platform: Large Inventory Files, Restarts and Audit',
  level: 'EXPERT',
  tags: ['myproject', 'ftp', 'planning-platform', 'architecture', 'large-files', 'streaming', 'idempotency'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A 3 GB nightly inventory file comes from a distribution center FTP server. How should Mule read it?',
      options: [
        'Read it into a String, then split it into lines with DataWeave',
        'Stream it and process records in chunks or a batch job',
        'Read it with an in memory repeatable stream for faster access',
        'Read it once into a variable, then For Each over the records',
      ],
      answer: 1,
      explain: 'Streaming with repeatable file store streams or a batch job keeps memory under control. A full in memory read can run the worker out of heap.',
    },
    {
      type: 'single',
      prompt: 'The load fails at record 1.8 million. What makes a rerun safe?',
      options: [
        'Load again from the start, and let the target ignore duplicate keys',
        'Load into staging by run id, and publish only when the file is checked',
        'Resume at record 1.8 million, using the count logged before the error',
        'Commit every 10,000 records, so a rerun loses one batch at most',
      ],
      answer: 1,
      explain: 'Load into a staging table tied to a file run id, and publish to the target only when the whole file is loaded and checked. Resuming from a logged count or partial commits leaves half a snapshot visible. Staging plus a final switch or MERGE makes the load all or nothing per file. A rerun clears the staging rows for that run and starts again.',
    },
    {
      type: 'multi',
      prompt: 'Which checks belong before inventory is sent to the planning platform?',
      options: [
        'Trailer count and totals match the detail lines',
        'The snapshot date in the header is the expected business date',
        'Every store and item exists in the master data, with unknown ones in a reject list',
        'The file is smaller than yesterday',
      ],
      answer: [0, 1, 2],
      explain: 'A smaller file can be normal. Counts, dates and master data checks catch real problems.',
    },
    {
      type: 'single',
      prompt: 'Plans come back from the platform as several files that must be applied together. How do you avoid loading half a set?',
      options: [
        'Load each file as it appears, and roll back if a later one fails',
        'Wait for a control file or a full set by name and count, then load',
        'Wait 30 minutes after the first file, then load whatever is there',
        'Load the files in name order, so the header file always goes first',
      ],
      answer: 1,
      explain: 'A control file or a manifest with the expected names and counts marks the set as complete.',
    },
    {
      type: 'match',
      prompt: 'Match each concern to a design choice.',
      pairs: [
        ['Memory', 'Streaming and batch processing'],
        ['Duplicates', 'An audit table with file name, hash and status'],
        ['Partial loads', 'Staging tables and a final publish step'],
        ['Missing files', 'An alert when an expected file has not arrived by its cut off'],
      ],
      explain: 'Each of these maps to a question support will ask on a bad night.',
    },
    {
      type: 'single',
      prompt: 'The FTP server is in a store network and only reachable through a VPN that drops sometimes. Where does the file go first?',
      options: [
        'Straight into the transform, streaming from the FTP server',
        'To a landing area you control, such as a storage share',
        'Into a Mule variable, so a VPN drop cannot cut the stream',
        'Into an Object Store entry, keyed by the file name',
      ],
      answer: 1,
      explain: 'Copy it to the landing area, then process it from there. Separating collection from processing means a VPN drop affects only the copy step, and the copy can be retried on its own.',
    },
  ],
  description: `
Brindle Outdoor sends nightly on hand inventory from three distribution centers to the planning platform. Each center writes a fixed width file of up to 3 GB to its own FTP server, reachable through a VPN. The platform sends replenishment plans back as a set of files on its FTP server, which Mule loads into the ERP database. Last month a VPN drop left a half loaded inventory snapshot, and the platform planned with wrong stock.

**Questions**
1. How would you collect and read the large inventory files?
2. How do you make a failed load safe to rerun?
3. What checks run before sending to the platform?
4. How do you handle the plan files coming back?
5. What do you record for audit and support?
`,
  answerTemplate: `## Collect and read

## Safe reruns

## Checks before sending

## Plan files coming back

## Audit and support
`,
  keyPoints: [
    'Copy files to a landing area first, then process from there.',
    'Stream large files and process in chunks or a batch job.',
    'Load into staging per file run, publish only when complete.',
    'Check trailer counts, business date and master data before sending.',
    'Load plan sets only when a control file or manifest says they are complete.',
    'Keep an audit table with name, hash, counts, status and correlation id.',
  ],
  solution: `
**1. Collect and read.** A first flow lists each center's FTP folder, copies new files under a temp name to a landing area under your control, renames them, and records them in the audit table. A second flow reads from the landing area. It streams the fixed width file and processes it in chunks or a batch job, so a 3 GB file never sits in memory.

**2. Safe reruns.** Load each file into a staging table with a run id. Only when all records are in and the checks pass does a final step publish the snapshot, for example a MERGE into the target table or a switch of the current run id. A failed run deletes its staging rows and starts again. The source file stays in the landing area until the publish succeeds.

**3. Checks before sending.** Trailer count and totals against the detail lines, the header date against the expected business date, and every store and item against master data. Unknown items go to a reject list with reasons. A failed check holds the snapshot and alerts, because a partial snapshot drives wrong plans.

**4. Plan files coming back.** The platform writes a set of files and a control file or manifest last. Mule waits for the manifest, checks that every listed file is present with the right count, and loads the set in one run inside a transaction or through staging. Processed files move to archive on the platform side.

**5. Audit and support.** Record each file with source, name, size, hash, record counts, status, timings and a correlation id. Alert when an expected file is late. Show the last successful snapshot per center on a dashboard.
`,
  followUps: [
    {
      q: 'Why not load straight from the FTP stream into the database?',
      a: 'A VPN drop then fails the load in the middle. Copying first separates the fragile network step from the load, and each can be retried alone.',
    },
    {
      q: 'What if one center is late but the others are on time?',
      a: 'Agree with the business whether to send what is ready with last night\'s data for the late center, or to wait until a cut off. Make it a rule, not a decision at 3 am.',
    },
    {
      q: 'How would you size the batch block size?',
      a: 'Start from the bulk insert size the database handles well, such as a few thousand rows, then test with production sized files and watch memory and duration.',
    },
  ],
}
