export default {
  id: 'ms-074',
  category: 'mulesoft',
  title: 'File-Based Listeners in Production: Matchers, Watermarks, Post-Actions and Half-Written Files',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'ftp', 'file', 'listener', 'cluster', 'idempotency', 'production'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'An SFTP listener has `watermarkEnabled="false"` and no post-action. The flow finishes successfully. What happens on the next poll?',
      options: [
        'The same file is processed again on every poll',
        'Mule remembers the file name in memory and skips it',
        'The listener deletes the file automatically on success',
        'The listener renames the file with a .processed suffix',
      ],
      answer: 0,
      explain: 'It is picked up again until something removes or moves it. Without a watermark or a post-action (autoDelete, moveToDirectory, renameTo) nothing marks the file as done, so every poll finds it again.',
    },
    {
      type: 'match',
      prompt: 'Match each listener option to its effect.',
      pairs: [
        ['autoDelete="true"', 'Deletes the file after it has been processed'],
        ['moveToDirectory="/archive"', 'Moves the processed file to another directory, keeping it for audit'],
        ['watermarkEnabled="true"', 'Only picks up files whose timestamp is newer than the last one processed'],
        ['matcher with filenamePattern', 'Selects which files the listener considers at all'],
      ],
      explain: 'Post-actions and the watermark are the two ways to stop re-processing; the matcher decides which files are candidates in the first place.',
    },
    {
      type: 'single',
      prompt: 'Partners upload 300 MB CSV files over a slow link. Some loads contain only part of the rows. Which listener setting addresses this directly?',
      options: [
        'timeBetweenSizeCheck, so only files that stopped growing are read',
        'recursive="false", so files in upload folders are ignored',
        'applyPostActionWhenFailed="false", so partial loads are kept',
        'A longer polling interval, so uploads have time to finish',
      ],
      answer: 0,
      explain: 'With timeBetweenSizeCheck (and its unit) the listener checks the size twice. The size check waits the configured time and compares sizes; a file still being written is skipped until a later poll. A slower poll only lowers the odds. The more robust contract is upload-as-.tmp-then-rename, with the matcher ignoring .tmp.',
    },
    {
      type: 'single',
      prompt: 'An app with an FTP listener runs in a two-node Mule cluster. Both nodes process the same files. What is the standard fix?',
      options: [
        'Set primaryNodeOnly="true" so only the primary node polls',
        'Give each node a different polling frequency',
        'Set lock="true" on the FTP read inside the flow',
        'Enable watermarking so both nodes share the last timestamp',
      ],
      answer: 0,
      explain: 'File, FTP and SFTP listeners should run on the primary node only in a cluster; another node takes over if the primary fails. Different poll frequencies only make collisions less frequent; a watermark does not stop two nodes from picking up the same new file concurrently.',
    },
    {
      type: 'multi',
      prompt: 'A failed file must not be lost or retried forever. Which choices help?',
      options: [
        'Move the file to an error directory in the error handler, and alert',
        'Set applyPostActionWhenFailed (default true) on purpose',
        'Record a processed-file key in a persistent object store',
        'Set autoDelete="true" and rely on the logs to recover files',
      ],
      answer: [0, 1, 2],
      explain: 'Use sftp:move in the error handler. Decide whether the post-action should also run when the flow fails. A key such as name + size + timestamp detects duplicates. Keep failed files somewhere visible and decide deliberately what the post-action does on failure. Deleting failed files and hoping the logs are enough loses data.',
    },
    {
      type: 'order',
      prompt: 'Put the safe production pattern for an inbound partner file in order.',
      items: [
        'Partner uploads the file as name.csv.tmp',
        'Partner renames it to name.csv when the upload is complete',
        'Listener (primary node only) matches *.csv and picks it up',
        'Flow validates header/row count and loads the data',
        'Post-action moves the file to /archive (or the error handler moves it to /error)',
      ],
      explain: 'The rename is atomic on the server, so the listener only ever sees complete files; archiving or moving to error makes the outcome visible and stops re-processing.',
    },
  ],
  description: `
A distributor receives **price lists, orders and stock files** from 60 suppliers on an SFTP server, about 4,000 files per day, from 2 KB to 400 MB. The current listener:

\`\`\`xml
<sftp:listener config-ref="partnerSftp" directory="/inbound" recursive="true">
  <scheduling-strategy><fixed-frequency frequency="10" timeUnit="SECONDS"/></scheduling-strategy>
</sftp:listener>
\`\`\`

The app is moving from a single on-prem runtime to a **two-node Mule cluster**. In testing:
- Every file is processed again every 10 seconds.
- After adding \`autoDelete="true"\` the repeats stopped, but a 400 MB stock file arrived with only 30% of its rows.
- In the cluster, some orders were created twice.
- A malformed file disappeared with no trace.

**Questions**
1. Why is every file processed repeatedly, and what are the options to stop it?
2. Why did a half-written file get loaded, and how do you prevent it?
3. Why are files processed twice in the cluster?
4. Design the production configuration, including failures and audit.
`,
  answerTemplate: `## Repeated processing

## Half-written files

## Duplicates in the cluster

## Production configuration
`,
  keyPoints: [
    'Without watermark or post-action, the listener picks up the same file on every poll.',
    'Post-actions: autoDelete, moveToDirectory, renameTo; applyPostActionWhenFailed (default true) controls whether they run when the flow fails.',
    'Watermark (default off) picks up only files newer than the last processed timestamp, useful when you cannot move or delete files.',
    'timeBetweenSizeCheck waits until a file stops growing; the most robust contract is upload as .tmp then rename, with a matcher on the final extension.',
    'In a cluster, run file/FTP/SFTP listeners with primaryNodeOnly="true" to avoid double processing.',
    'Keep failed files (move to /error), alert, and add an idempotency check for business-level duplicates.',
  ],
  solution: `
**1. Repeats.** With \`watermarkEnabled\` false (the default) and no post-action, nothing records that a file was handled, so each poll finds it again. Options: \`autoDelete\`, \`moveToDirectory\` (keeps an archive), \`renameTo\`, or \`watermarkEnabled="true"\` when the folder is read-only for you.

**2. Half-written files.** The listener saw the file while the supplier was still uploading it. Use \`timeBetweenSizeCheck\` + \`timeBetweenSizeCheckUnit\` so a file is only processed once its size is stable, and agree a contract: upload as \`.tmp\`, rename when complete, and the matcher only accepts final names. For critical feeds add a trailer/control record with the row count and validate it.

**3. Cluster duplicates.** Both nodes poll the same directory and can read the same file before either has moved it. Set \`primaryNodeOnly="true"\` on the listener; if the primary node fails another takes over. Add an idempotency check (file name + size + modification time, or a business key) as a safety net.

**4. Production configuration.**
\`\`\`xml
<sftp:listener config-ref="partnerSftp" directory="/inbound" recursive="false"
               primaryNodeOnly="true" moveToDirectory="/archive" applyPostActionWhenFailed="false"
               timeBetweenSizeCheck="5" timeBetweenSizeCheckUnit="SECONDS">
  <scheduling-strategy><fixed-frequency frequency="30" timeUnit="SECONDS"/></scheduling-strategy>
  <sftp:matcher filenamePattern="*.csv"/>
</sftp:listener>
<!-- error handler: sftp:move the file to /error, log a correlation id, alert support -->
\`\`\`
- Archive on success, move to \`/error\` on failure, so nothing disappears silently.
- Dashboard of files received vs expected per supplier; alert on missing or failed files.
- Housekeeping job to purge \`/archive\` after the retention period.
`,
  followUps: [
    {
      q: 'When would you prefer the watermark over a post-action?',
      a: 'When the integration has read-only access to the directory (it cannot move or delete files), or other consumers also read the same files. Then the watermark skips files older than the last one processed.',
    },
    {
      q: 'Why set applyPostActionWhenFailed to false in this design?',
      a: 'So a failed file is not moved to /archive as if it succeeded; the error handler moves it to /error instead, which makes failures visible and ready to replay.',
    },
    {
      q: 'Does primaryNodeOnly help on CloudHub with two independent workers or replicas?',
      a: 'Only if the replicas run as a Mule cluster. Independent workers do not know about each other, so each one polls; then run the listener in a single-instance app or claim files (move to a processing folder) before processing.',
    },
  ],
}
