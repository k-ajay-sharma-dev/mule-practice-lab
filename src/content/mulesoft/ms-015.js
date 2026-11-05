export default {
  id: 'ms-015',
  category: 'mulesoft',
  title: 'SFTP Polling: Matchers, Half-Written Files and Post-Processing',
  level: 'INTERMEDIATE',
  tags: ['sftp', 'file', 'polling', 'matchers', 'idempotency'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you make the SFTP listener ignore `.tmp` and `README.txt` files?',
      options: [
        'An `sftp:matcher` with `filenamePattern="PAY_*.csv"` referenced by the listener',
        'A Choice router at the start of the flow that drops other files',
        'A separate folder per file type configured on the SFTP server',
        'Setting `autoDelete="true"` on the listener',
      ],
      answer: 0,
      explain: 'The matcher filters files **before** they become events. A Choice in the flow would still read the unwanted files.',
    },
    {
      type: 'single',
      prompt: 'Which option to avoid half-written files is the most reliable to agree with the partner?',
      options: [
        'Partner uploads with a temporary name and renames to `.csv` when complete (or sends a `.done` file)',
        '`timeBetweenSizeCheck` of 10 seconds',
        'Matcher `notUpdatedInTheLast` of 60 seconds',
        'An SFTP file lock',
      ],
      answer: 0,
      explain: 'Size and time checks are heuristics — a slow or paused upload can still pass them. A rename is atomic on the server. SFTP has no reliable cross-client lock.',
    },
    {
      type: 'single',
      prompt: 'A Mule app on CloudHub 2.0 with 2 replicas reads payment files with an SFTP listener. Some files are processed twice, because both replicas poll the same folder. What stops this?',
      options: [
        'Set `timeBetweenSizeCheck` on the listener',
        'Add a matcher with a `filenamePattern` for payment files',
        'Set `notUpdatedInTheLast` on the matcher',
        'Enable clustering and set Primary Node Only on the listener',
      ],
      answer: 3,
      explain: 'With clustering and Primary Node Only, the listener runs on the primary node only, so one poller sees the folder. Size checks and `notUpdatedInTheLast` deal with half-written files, and `filenamePattern` deals with unwanted files. Duplicates also come from late moves: a file not moved before the next poll can be picked up again. Listener watermarking and an idempotency key (file name + size + timestamp) in a persistent Object Store close that gap.',
    },
    {
      type: 'single',
      prompt: 'Processed files must go to `/archive` and failed ones to `/error`. How do you implement this?',
      options: [
        'No listener post-action; `sftp:move` to `/archive` at the end of the success path and to `/error` in the error handler',
        'Listener `moveToDirectory="/archive"` with `applyPostActionWhenFailed="true"`',
        'Listener `autoDelete="true"` and write a copy to both folders',
        'Listener `moveToDirectory="/error"` — successful files are moved automatically',
      ],
      answer: 0,
      explain: 'Listener post-actions apply the **same** action regardless of outcome, so different destinations must be explicit moves in the flow and its error handler.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Files can be 300 MB. What should the flow avoid?',
      options: [
        'Loading the whole CSV into memory (e.g. converting it to a Java list or logging it)',
        'Using repeatable file-store streaming',
        'Using DataWeave to parse CSV',
        'Moving the file after processing',
      ],
      answer: 0,
      explain: 'Process the file as a stream. The default repeatable file-store strategy keeps large content on disk rather than heap.',
    },
  ],
  description: `
A bank partner uploads payment files to your SFTP folder \`/inbound/payments\`:

- Files are named \`PAY_YYYYMMDD_NNN.csv\` and can be **up to 300 MB**; uploads take several minutes.
- The partner sometimes also drops \`.tmp\` and \`README.txt\` files in the same folder.
- Each payment file must be processed **exactly once**; processed files must be moved to \`/archive\`, failed ones to \`/error\`.
- The app runs on **CloudHub 2.0 with 2 replicas**.

Current problems: some files are processed while still being uploaded (truncated CSV → missing payments), and some files are processed **twice**.

**Questions**
1. How do you configure the SFTP listener to pick up only \`PAY_*.csv\` files?
2. What options does Mule give you to avoid reading a half-written file? Which would you agree with the partner?
3. Why are some files processed twice, and how do you guarantee once-only processing?
4. How do you move files to \`/archive\` or \`/error\` depending on the outcome?
`,
  answerTemplate: `## Matcher

## Half-written files

## Processed twice

## Archive vs error
`,
  keyPoints: [
    'Use a file matcher (sftp:matcher) with filenamePattern (e.g. glob PAY_*.csv) and regularFiles to ignore other files.',
    'Half-written files: timeBetweenSizeCheck (size must stay stable between checks), notUpdatedInTheLast on the matcher, or — best — the partner uploads with a temp name and renames when complete.',
    'Duplicates come from both replicas polling the same folder and/or the file not being moved before the next poll; enable clustering and Primary Node Only so the listener runs on the primary only.',
    'The listener\'s autoDelete / moveToDirectory post-actions or explicit move operations in the flow; with watermarking or idempotency (persistent Object Store keyed by file name + size/time) as a safety net.',
    'Moving on success vs error is done explicitly in the flow / error handler when different destinations are needed.',
  ],
  solution: `
**Matcher**
\`\`\`xml
<sftp:matcher name="paymentFiles" filenamePattern="PAY_*.csv"
    regularFiles="REQUIRE" directories="EXCLUDE"
    notUpdatedInTheLast="60" timeUnit="SECONDS"/>

<sftp:listener config-ref="partnerSftp" directory="/inbound/payments"
    matcher="paymentFiles" timeBetweenSizeCheck="10"
    timeBetweenSizeCheckUnit="SECONDS">
  <scheduling-strategy><fixed-frequency frequency="1" timeUnit="MINUTES"/></scheduling-strategy>
</sftp:listener>
\`\`\`
The \`filenamePattern\` (glob, or \`regex:\` prefix) excludes \`.tmp\` and \`README.txt\`.

**Half-written files** — options, from weakest to strongest:
- \`timeBetweenSizeCheck\`: Mule checks the size twice and skips the file if it changed.
- Matcher \`notUpdatedInTheLast\`: ignore files modified in the last N seconds.
- **Agreed protocol** (best): the partner uploads as \`PAY_...csv.tmp\` and **renames** to \`.csv\` when complete (rename is atomic on the server), or sends a \`.done\`/trigger file after the data file. Time-based checks are heuristics; a slow or paused upload can still pass them.
SFTP has no reliable cross-client file lock, so don't rely on locking.

**Processed twice**
- On CloudHub 2.0 without clustering, **each replica polls the folder** and both pick up the same file. Enable **clustering** and set Primary Node Only on the listener, so it runs on the primary node only.
- A file not moved/deleted quickly (e.g. move happens at the end of a long flow) can be seen again by the next poll. Use the listener's \`watermarkEnabled\` or an idempotency check: store \`fileName + size + timestamp\` in a **persistent Object Store** (or Idempotent Message Validator) before processing.

**Archive vs error:** the listener's post-actions (\`autoDelete\`, \`moveToDirectory\`, \`renameTo\`, \`applyPostActionWhenFailed\`) apply the same action regardless of outcome. For different destinations, set no post-action and do it in the flow: \`sftp:move\` to \`/archive\` at the end of the success path and \`sftp:move\` to \`/error\` in the error handler (consider adding a timestamp to the target name to avoid overwrite conflicts). Make sure processing is streaming (300 MB) — don't load the CSV fully into memory.
`,
  followUps: [
    {
      q: 'Is a .done trigger file better than renaming?',
      a: 'Both are fine if the partner follows them. A trigger file can carry a checksum or record count, which lets you also verify completeness before processing.',
    },
    {
      q: 'How would you validate that the file is complete and not truncated?',
      a: 'Agree on a trailer record with a row count/total amount or a checksum in a companion file, and compare it while processing. Reject the file to /error if it doesn\'t match.',
    },
    {
      q: 'The partner wants you to push files to them instead. What changes?',
      a: 'You write with sftp:write, ideally using a temp name and then sftp:rename, so they never read your half-written file — the same protocol in reverse.',
    },
  ],
}
