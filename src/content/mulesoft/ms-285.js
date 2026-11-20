export default {
  id: 'ms-285',
  category: 'mulesoft',
  title: 'Writing to FTP Without Half Files: Temporary Names, Rename on Completion and Control Files',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'planning-platform', 'temp-rename', 'control-file', 'file-handoff'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'Why write an outbound file as SALES_20261118.txt.tmp and then rename it?',
      options: [
        'The FTP server locks .tmp files until the client closes them',
        'The receiver matches only the final name, so it skips partial files',
        'A rename makes the server check the file against its size',
        'ASCII mode leaves .tmp files alone, so the bytes stay exact',
      ],
      answer: 1,
      explain: 'A rename on the same server is quick and complete. The final name appears only when every byte is there.',
    },
    {
      type: 'single',
      prompt: 'The rename fails with 550 because yesterday\'s file with the same name is still there. What is the safest design?',
      options: [
        'Delete the old file before each rename, so the rename always works',
        'Use dated unique names, and treat an existing name as an error',
        'Write straight to the final name with OVERWRITE and skip the rename',
        'Retry the rename every minute until the receiver collects the old file',
      ],
      answer: 1,
      explain: 'Use unique names with a date and sequence, and investigate when a name already exists. An old file still there may mean the receiver did not collect it. Overwriting it hides a missed load.',
    },
    {
      type: 'multi',
      prompt: 'What can a control file, sent after the data file, contain?',
      options: ['The data file name', 'The record count', 'A hash of the data file', 'The full content of the data file, for a cross check'],
      answer: [0, 1, 2],
      explain: 'The receiver waits for the control file, then checks the data file against it. A copy of the content doubles the transfer and proves nothing a hash does not.',
    },
    {
      type: 'single',
      prompt: 'The receiver does not support a rename convention. What else tells it that a file is complete?',
      options: [
        'Nothing, so the receiver must wait a fixed hour after the window',
        'A trailer count, a control file, or a stable size check before reading',
        'A 226 reply from the server, which the receiver can see in its listing',
        'The file creation time, which shows when the upload finished',
      ],
      answer: 1,
      explain: 'Without a rename, the receiver needs a content check or a stable size check. A trailer also catches a file cut short.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of a safe outbound file handoff in order.',
      items: [
        'Build the file content and its record count',
        'Write it under a temporary name',
        'Check the remote size matches the bytes written',
        'Rename it to the final name',
        'Write the control file, if one is agreed',
        'Record the file in the audit log',
      ],
      explain: 'The rename is the commit point. The control file goes last, because the receiver may start when it sees it.',
    },
    {
      type: 'single',
      prompt: 'The Mule app crashes after writing the temp file but before the rename. What should the next run do?',
      options: [
        'Leave the temp file, since the receiver never matches that name',
        'Delete leftover temp files and write the file again from source',
        'Rename the leftover temp file, since the write had finished',
        'Append the rest of the data to the temp file and then rename it',
      ],
      answer: 1,
      explain: 'Find leftover temp files, delete them, and write the file again from the source data. A leftover temp file may be partial. Unless the size is checked against the expected size, rewrite it from the source.',
    },
  ],
  description: `
Marrow & Pine Home sends a nightly store sales file to the planning platform over FTP. Twice last month the platform loaded a partial file: it picked the file while Mule was still writing it. The platform team asks for a reliable handoff.

**Questions**
1. Why does the platform see partial files?
2. How do a temporary name and a rename help?
3. What other signals tell the receiver a file is complete?
4. What do you do after a crash between write and rename?
`,
  answerTemplate: `## Why partial files appear

## Temporary name and rename

## Other completeness signals

## After a crash
`,
  keyPoints: [
    'A receiver polling by name can see a file while it is being written.',
    'Write under a temporary name, then rename to the final name.',
    'The receiver matches only the final name.',
    'A trailer count, a control file or a stable size check also help.',
    'Unique names stop overwrites of uncollected files.',
    'Clean up leftover temp files and rewrite from source.',
  ],
  solution: `
**1. Why partial files appear.** FTP shows a file in the listing as soon as the upload starts. A receiver that polls the folder for \`SALES_*.txt\` can read it while the bytes are still arriving and load only part of it.

**2. Temporary name and rename.** Mule writes \`SALES_20261118.txt.tmp\`, then renames it to \`SALES_20261118.txt\`. The receiver matches only \`.txt\`. A rename on the same server is quick and complete, so the final name only exists when the file is whole.

**3. Other completeness signals.** A trailer with the record count lets the receiver detect a short file. A control file, written after the data file, can hold the name, count and a hash. If the receiver cannot use those, it can wait until the size is stable between two checks, which is weaker.

**4. After a crash.** The next run lists the folder for leftover \`.tmp\` files, deletes them and writes the file again from the source data. Unique names with a date and a sequence stop a rewrite from replacing a file the platform has not collected.
`,
  followUps: [
    {
      q: 'Why not write to another folder and move the file instead of renaming?',
      a: 'That works too. On most servers a move within the same file system is a rename. Check that the receiver cannot see the staging folder.',
    },
    {
      q: 'What if the receiver deletes files after reading them?',
      a: 'Then a missing file on the next listing is normal. Use the audit log, not the remote folder, as the record of what was sent.',
    },
    {
      q: 'How would you test the handoff?',
      a: 'Write a large file slowly in test and let the receiver poll during the write. It must not pick the temp name.',
    },
  ],
}
