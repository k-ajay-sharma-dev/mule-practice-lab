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
      prompt: 'What does the watermark do on the SFTP On New or Updated File source?',
      options: [
        'Adds a stamp to each file',
        'Remembers the latest file timestamp seen, so older files are not picked again on the next poll',
        'Encrypts the file',
        'Limits the file size',
      ],
      answer: 1,
      explain: 'With the watermark on, only files newer than the stored value are picked. A file changed later is picked again.',
    },
    {
      type: 'single',
      prompt: 'Why choose moveToDirectory over autoDelete for plan files?',
      options: [
        'It is faster',
        'The file stays on the server in an archive folder, so it can be checked or replayed later',
        'autoDelete does not exist',
        'Moving encrypts the file',
      ],
      answer: 1,
      explain: 'Deleting loses the evidence. An archive folder, with a cleanup after a retention period, helps support and audits.',
    },
    {
      type: 'single',
      prompt: 'The plan file name is the same every day, and moveToDirectory finds yesterday\'s file in the archive. What can happen, and what helps?',
      options: [
        'Nothing, the archive merges them',
        'The move can fail on the name clash, so give the archived file a unique name with renameTo or keep dated archive folders',
        'The new file is deleted',
        'The server renames it on its own',
      ],
      answer: 1,
      explain: 'Ask the partner for dated file names, or add a date or timestamp to the archived name.',
    },
    {
      type: 'multi',
      prompt: 'Which conditions can a matcher on the listener check?',
      options: [
        'A file name pattern',
        'A minimum or maximum size',
        'That the file was not updated in the last few seconds or minutes',
        'The email address of the file owner',
      ],
      answer: [0, 1, 2],
      explain: 'Matchers filter by name, size, timestamps and file type. A minimum size of 1 byte keeps empty files out.',
    },
    {
      type: 'single',
      prompt: 'Plan files arrive once a day around 04:00 and must reach the ERP by 06:00. How often should the listener poll?',
      options: [
        'Every 100 milliseconds',
        'Every few minutes, which is fast enough and costs one directory listing per poll',
        'Once a day at 04:00 exactly',
        'Once a week',
      ],
      answer: 1,
      explain: 'Polling once at an exact time misses a late file. A few minutes keeps the delay small with little load on the server.',
    },
    {
      type: 'single',
      prompt: 'The watermark is kept in an object store. After it is cleared, what can happen?',
      options: [
        'The listener stops',
        'Files still in the folder may be picked again, so the flow must cope with repeats',
        'Every file on the server is deleted',
        'Nothing at all',
      ],
      answer: 1,
      explain: 'That is one more reason to move processed files out of the folder and to make the target load safe to repeat.',
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
