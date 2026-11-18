export default {
  id: 'ms-275',
  category: 'mulesoft',
  title: 'Half Written Files on SFTP: Size Checks, File Age and Temporary Names Then Rename',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sftp', 'half-written-files', 'size-check', 'rename', 'planning-platform', 'sales-feed'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'What does the time between size check setting on the SFTP listener do?',
      options: [
        'Limits how big a file may be',
        'Reads the file size, waits the given time, reads it again, and skips the file on this poll if the size changed',
        'Splits the file into chunks',
        'Checks the server disk space',
      ],
      answer: 1,
      explain: 'A file still growing changes size between the two checks. It is picked on a later poll once it is stable.',
    },
    {
      type: 'single',
      prompt: 'What is the cost of a long size check wait?',
      options: [
        'None',
        'Each candidate file waits that long before processing, so polls take longer when many files arrive',
        'Files are deleted',
        'It uses more SSH keys',
      ],
      answer: 1,
      explain: 'A few seconds is common. A writer that pauses longer than the wait can still slip through, so it is not a full guarantee.',
    },
    {
      type: 'single',
      prompt: 'Mule sends daily sales to the planning platform, which polls its SFTP folder for *.csv. Why write sales.csv.tmp first and rename it at the end?',
      options: [
        'Temporary names upload faster',
        'The platform only matches the final name, so it never loads a file that is still uploading',
        'SFTP requires it',
        'To save disk space',
      ],
      answer: 1,
      explain: 'On most servers a rename in the same folder is quick and atomic. The reader sees either no file or the whole file.',
    },
    {
      type: 'multi',
      prompt: 'Which ways can a reader avoid half written files?',
      options: [
        'A matcher rule that the file was not updated in the last minute',
        'Waiting for a control file that the writer sends last',
        'Checking a trailer record count',
        'Waiting for the SFTP server to send a file closed event',
      ],
      answer: [0, 1, 2],
      explain: 'SFTP has no events. The reader polls, so it relies on time, names or agreed markers.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of a safe outbound write.',
      items: [
        'Write the content to SALES_20261118_0001.csv.tmp',
        'Check the size or record count of what was written',
        'Rename it to SALES_20261118_0001.csv',
        'Write the control file SALES_20261118_0001.ctl',
        'Log the file name, size and count',
      ],
      explain: 'The control file comes last, because some readers start on it.',
    },
    {
      type: 'single',
      prompt: 'A partner uploads with a desktop client that writes report.csv.filepart and renames it at the end. The Mule listener matches *.csv*. What goes wrong?',
      options: [
        'Nothing',
        'The pattern also matches the .filepart name, so Mule can pick a partial upload. Match exactly *.csv.',
        'The client blocks Mule',
        'Mule cannot read .filepart files',
      ],
      answer: 1,
      explain: 'Make the pattern match only final names. Ask partners which temporary names their tools use.',
    },
  ],
  description: `
Larkfield Grocers sends daily sales and inventory files to the planning platform over SFTP, and reads order plans that come back. Twice last month the planning platform loaded a sales file that was cut short, and once Mule read a plan file that was still uploading.

**Questions**
1. Why do half written files happen on SFTP?
2. What can the reader do?
3. What should the writer do?
4. How does Mule support each side?
`,
  answerTemplate: `## Why it happens

## The reader side

## The writer side

## Mule settings
`,
  keyPoints: [
    'A file is visible on the server while it is being written. SFTP has no file closed event.',
    'Reader: size check, minimum age, control file, trailer count, strict name pattern.',
    'Writer: temporary name then rename, control file last.',
    'Mule: time between size check, matcher rules, Write then Rename operations.',
    'Agree the convention with each partner.',
  ],
  solution: `
**1. Why it happens.** An upload writes a file over seconds or minutes. A reader listing the folder sees the file at once, with whatever size it has reached. SFTP has no event that says a file is closed, so a polling reader can grab it too early.

**2. The reader side.** Use a strict name pattern that matches only final names. Use the size check, which reads the size twice with a pause and skips a growing file. Add a matcher rule that the file was not updated in the last minute. Best of all, agree a marker: a control file written last, or a trailer record with a count to check after reading.

**3. The writer side.** Write to a temporary name such as SALES_20261118_0001.csv.tmp, check what was written, then rename to the final name. A rename in the same folder is quick and, on most servers, atomic. Write a control file last if the partner asks for one.

**4. Mule settings.** On the listener: time between size check, a matcher with a file name pattern, a minimum size and a not updated in the last setting. For writing: the Write operation to the temporary name, then the Rename operation. Log names and sizes on both sides so a short file can be traced.
`,
  followUps: [
    {
      q: 'The rename fails because a file with the final name exists. What does it mean?',
      a: 'The partner has not collected the last file, or this is a resend. Stop and alert rather than overwrite, unless the agreement says to replace it.',
    },
    {
      q: 'Is the size check enough on its own?',
      a: 'No. A writer that pauses longer than the wait looks stable. Combine it with a minimum age or a marker the writer sends.',
    },
    {
      q: 'Why put the temporary file in a separate folder sometimes?',
      a: 'Some partner pollers read every file in the folder whatever the name. A separate staging folder on the same file system keeps it out of their view, and the move is still quick.',
    },
  ],
}
