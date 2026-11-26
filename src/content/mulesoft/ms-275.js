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
      prompt: 'The SFTP listener has a time between size check of 5 seconds. A partner client uploads half a file, stalls for 20 seconds on a slow link, then goes on. What can happen?',
      options: [
        'Mule keeps checking until the size holds for 20 seconds, so it waits it out',
        'Mule skips the file for good, since its size changed once during a check',
        'The SFTP server hides the file until the upload ends, so the stall is harmless',
        'Both size checks fall in the stall and match, so Mule can pick a partial file',
      ],
      answer: 3,
      explain: 'The listener reads the file size, waits the given time, reads it again, and skips the file on this poll only if the size changed. A stall longer than the wait gives two equal sizes, so the partial file passes. A skipped file is checked again on a later poll. SFTP servers show files while they are written, which is why temporary names or control files are safer.',
    },
    {
      type: 'single',
      prompt: 'A team sets the time between size check to 60 seconds to be safe, on a folder where partners drop up to 500 files at once. What is the trade off?',
      options: [
        'None, because the wait runs in the background between polls',
        'Each file waits that long, so polls slow down when many files arrive',
        'The SFTP session times out if the wait is longer than ten seconds',
        'Files that change during the wait are deleted by the listener',
      ],
      answer: 1,
      explain: 'Each candidate file waits that long before processing, so a big burst takes much longer to work through. A few seconds is common. A longer wait still gives no full guarantee, since a writer can pause longer than any wait. Files that change are skipped on that poll, never deleted.',
    },
    {
      type: 'single',
      prompt: 'Mule sends daily sales to the planning platform, which polls its SFTP folder for *.csv. Why write sales.csv.tmp first and rename it at the end?',
      options: [
        'The SFTP server locks .tmp files so other clients cannot read them',
        'The platform matches only the final name, so it never reads a partial file',
        'A rename makes the server check the file for transfer errors',
        'The SFTP connector refuses to overwrite a file with a final name',
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
        'Taking an exclusive lock on the file before reading it',
        'Picking only files whose size is above zero',
      ],
      answer: [0, 1, 2],
      explain: 'A matcher that skips files updated in the last minute leaves files that are still growing. A control file sent last tells the reader the data file is done. A trailer record count shows whether every record arrived. SFTP has no events, so the reader polls and relies on time, names or agreed markers. SFTP gives the reader no file lock it can rely on, so a lock request does not stop a writer. A half written file already has a size above zero.',
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
        'Nothing, because the client holds a lock until the rename',
        'The pattern also matches .filepart, so Mule can pick a partial upload',
        'The pattern misses report.csv, which has nothing after .csv',
        'The rename fails because Mule holds the file open while reading',
      ],
      answer: 1,
      explain: 'Match exactly *.csv. Make the pattern match only final names. Ask partners which temporary names their tools use.',
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
