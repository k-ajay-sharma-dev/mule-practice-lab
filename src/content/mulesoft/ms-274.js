export default {
  id: 'ms-274',
  category: 'mulesoft',
  title: 'Listening for Plan Files on SFTP: Polling, Watermarks, Matchers, autoDelete and moveToDirectory',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'listener', 'watermark', 'matcher', 'planning-platform', 'replenishment-plans'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'The listener has the watermark on. A partner uploads a corrected copy of last week\'s plan under a new name, and its client keeps the original modified time. Newer files have arrived since. What does the listener do?',
      options: [
        'Picks it, since the watermark tracks file names and this name is new',
        'Picks it, since the watermark stores a content hash and this one is new',
        'Picks it, since any upload counts as an update for the watermark',
        'Skips it, since its timestamp is older than the stored watermark',
      ],
      answer: 3,
      explain: 'The watermark remembers the latest file timestamp seen, and only files newer than the stored value are picked. It keeps no names and no hashes. A file whose modified time is older than the watermark is skipped, whatever its name. Ask the partner to upload with the current time, or replay the file by hand.',
    },
    {
      type: 'single',
      prompt: 'Support asks to reprocess the plan file from last Tuesday, which the ERP loaded wrong. The listener uses autoDelete. What does the team face?',
      options: [
        'The file sits in a recycle folder on the SFTP server for 30 days',
        'The file is still in /inbound, since autoDelete waits for a retention time',
        'The file is gone from the server, so the partner must send it again',
        'The file is in the object store, since the watermark keeps a copy',
      ],
      answer: 2,
      explain: 'autoDelete removes the file once the flow has processed it, and SFTP has no recycle folder. The watermark stores a timestamp, not content. With moveToDirectory the file would sit in an archive folder, ready to be checked or replayed, with a cleanup after a retention period.',
    },
    {
      type: 'single',
      prompt: 'The plan file name is the same every day, and moveToDirectory finds yesterday\'s file in the archive. What can happen, and what helps?',
      options: [
        'The move overwrites yesterday’s file, so the archive keeps only one',
        'The move can fail on the name clash, so use renameTo or dated folders',
        'The connector adds a counter to the name, such as plan(1).csv',
        'The move is skipped and the file stays in the inbound folder silently',
      ],
      answer: 1,
      explain: 'Give the archived file a unique name with renameTo, or keep dated archive folders. Ask the partner for dated file names, or add a date or timestamp to the archived name.',
    },
    {
      type: 'multi',
      prompt: 'Partners sometimes upload empty plan files, files still being written, and .tmp files before the final name, and some send files with no header row. Which of these can a matcher on the listener keep out?',
      options: [
        'Empty files, with a minimum size of 1 byte',
        'Files with no header row, with a rule on the first line',
        'Files changed in the last minute, with a not updated in the last rule',
        'Files a client still holds open, with a rule on open handles',
        '.tmp files, with a file name pattern that matches only final names',
      ],
      answer: [0, 2, 4],
      explain: 'Matchers filter by name, path, size, timestamps and file type. A minimum size of 1 byte keeps empty files out, and a not updated in the last rule skips files still growing. Matchers do not read the content, and SFTP does not tell a client which files are open elsewhere.',
    },
    {
      type: 'single',
      prompt: 'Plan files arrive once a day around 04:00 and must reach the ERP by 06:00. How often should the listener poll?',
      options: [
        'Every second, so the plan reaches the ERP as fast as possible',
        'Every few minutes, which costs one listing per poll',
        'Once a day at 04:00, when the partner sends the file',
        'Once at 05:30, so all files are there before the 06:00 deadline',
      ],
      answer: 1,
      explain: 'Polling once at an exact time misses a late file. A few minutes keeps the delay small with little load on the server.',
    },
    {
      type: 'single',
      prompt: 'The watermark is kept in an object store. After it is cleared, what can happen?',
      options: [
        'The listener fails to start until the watermark is set again',
        'Files still in the folder may be picked again as repeats',
        'Only files that arrive after the clear are picked from then on',
        'Nothing, because the listener rebuilds it from the archive folder',
      ],
      answer: 1,
      explain: 'With no stored value, every file in the folder counts as new, so the flow must cope with repeats. That is one more reason to move processed files out of the folder and to make the target load safe to repeat.',
    },
  ],
  description: `
Brindle Outdoor gets replenishment plans back from the planning platform. Each morning the platform drops a pipe delimited plan file in an SFTP folder. A Mule flow with the On New or Updated File source must pick it up, transform it, and load it into the ERP before 06:00.

**Questions**
1. How does the listener decide which files to pick?
2. What should happen to a file after it is processed?
3. Which matcher rules would you add?
4. How often should it poll, and what about repeats?
`,
  answerTemplate: `## Picking files

## After processing

## Matcher rules

## Polling and repeats
`,
  keyPoints: [
    'The source polls on a schedule and can keep a watermark of the latest timestamp.',
    'moveToDirectory keeps an archive. autoDelete removes the file.',
    'Name clashes in the archive need unique names or dated folders.',
    'Matchers filter by name pattern, size and time since last update.',
    'Poll every few minutes. Design the load to handle repeats.',
  ],
  solution: `
**1. Picking files.** The source lists the folder on each poll, applies the matcher, and starts the flow for each file that passes. With the watermark on, it also remembers the newest timestamp seen and skips older files, so files left in the folder are not processed again.

**2. After processing.** autoDelete removes the file once the flow has handled it. moveToDirectory moves it to another folder, such as an archive, and renameTo can give it a new name on the way. Prefer the archive: support can check what arrived and replay it. If the platform uses the same name every day, add a date to the archived name or move it into a dated folder, so the move does not clash with an older file.

**3. Matcher rules.** A file name pattern for plan files only, so temporary names and other files are ignored. A minimum size of one byte to keep empty files out, with an alert for them elsewhere. A rule that the file was not updated in the last minute or so, to skip files still being written.

**4. Polling and repeats.** Every few minutes is enough for a daily file, and each poll costs only a listing. The watermark lives in an object store. If it is lost or a file is touched again, the file can come back, so the ERP load should be safe to run twice, for example by plan id and date.
`,
  followUps: [
    {
      q: 'The flow fails half way. Is the file moved to the archive?',
      a: 'Test this on your connector version before relying on it. Many teams move the file explicitly at the end of a successful flow, and to an error folder in the error handler.',
    },
    {
      q: 'Why not use a Scheduler with List and Read instead?',
      a: 'That works too and gives more control, such as processing a day of files in order. The listener is less code for one file at a time.',
    },
    {
      q: 'Who cleans the archive folder on the partner server?',
      a: 'Agree it with the partner. Usually a cleanup job deletes files older than a set number of days, and your own copy is kept elsewhere for audit.',
    },
  ],
}
