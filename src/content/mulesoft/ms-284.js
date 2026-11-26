export default {
  id: 'ms-284',
  category: 'mulesoft',
  title: 'The Mule FTP Connector: Connection Settings, Operations and the New File Listener',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'ftp', 'ftp-connector', 'listener', 'operations', 'mule4'],
  estMinutes: 18,
  quiz: [
    {
      type: 'multi',
      prompt: 'After each load, a flow must archive the source file, create the dated archive folder if missing, leave a .done marker and verify the file against the SHA-256 in a control file. Which steps does a Mule 4 FTP connector operation cover directly?',
      options: [
        'Move the file to the archive folder after the load',
        'Ask the server for the SHA-256 of the file before the load',
        'Create the dated archive folder when it is missing',
        'Write an empty .done marker file next to the data',
        'Compare the record count of the file with the count in the control file',
      ],
      answer: [0, 2, 3],
      explain: 'The FTP connector has list, read, write, copy, move, rename, delete and createDirectory. Move archives the file, createDirectory makes the dated folder, and write with empty content leaves the .done marker. It has no checksum operation, so the flow must read the file and compute the hash itself, then compare it with the control file. Counting records is the same: the connector reads the files, and DataWeave in the flow counts and compares.',
    },
    {
      type: 'single',
      prompt: 'A partner drops 40 CSV files at 06:00. The FTP listener polls every 60 seconds with a matcher on *.csv. What happens?',
      options: [
        'At 06:00 the server notifies the listener as each file is closed, and a flow starts for it',
        'At the next poll only the newest file starts a flow, and the rest wait for later polls',
        'At the next poll one flow starts, with all 40 files in the payload as a list',
        'At the next poll the listing finds them, and one flow starts per matching file',
      ],
      answer: 3,
      explain: 'FTP has no events, so the listener is a scheduled list operation with a matcher and, optionally, a watermark on the file time. Each poll lists the folder and starts a separate flow for every new or updated file that passes the matcher. It does not pick only the newest file, and it does not batch the files into one message.',
    },
    {
      type: 'single',
      prompt: 'A flow writes PLAN_20261118.csv to a partner folder. After a failed run, yesterday\'s file with that name may still be there, not yet collected. The flow must never replace a file the partner has not picked up. What do you use?',
      options: [
        'Write mode CREATE_NEW, so the write fails while the old file is still there',
        'Write mode APPEND, so the new rows are added after the rows of the old file',
        'Write mode OVERWRITE, since a file with the same name holds the same data',
        'A list call first, then OVERWRITE only when the list shows no such file',
      ],
      answer: 0,
      explain: 'CREATE_NEW makes the write itself fail when the target exists, so an uncollected file is never lost and the error shows the missed load. A list then OVERWRITE leaves a gap between the check and the write, so a file can still be replaced. APPEND mixes two days of data in one file. OVERWRITE replaces the file the partner has not read.',
    },
    {
      type: 'single',
      prompt: 'The listener has autoDelete false and no moveToDirectory or watermark. What happens on each poll?',
      options: [
        'Each file is picked once, because the listener remembers names',
        'The same files are picked again on every poll',
        'The listener fails to start, because one of the three is required',
        'Each file is picked again only if its size has changed',
      ],
      answer: 1,
      explain: 'With nothing to remove or skip a file, it is processed many times. The listener needs a way to forget a file: delete it, move it, rename it, or enable the watermark.',
    },
    {
      type: 'match',
      prompt: 'Match each setting to what it controls.',
      pairs: [
        ['passive', 'Whether the client opens the data connections, the usual choice'],
        ['transferMode', 'Binary or ASCII copying of bytes'],
        ['workingDir', 'The base folder that relative paths start from'],
        ['timeBetweenSizeCheck', 'How long the listener waits to see that the file size stopped changing'],
      ],
      explain: 'Wrong values here cause most FTP support tickets: hanging listings, broken files, wrong folders and half read files.',
    },
    {
      type: 'single',
      prompt: 'The flow reads files from the listener and the app runs on two cluster nodes. What should you set?',
      options: [
        'Nothing, because the FTP server locks a file once a client reads it',
        'Run the listener on the primary node only',
        'Enable the watermark, which keeps the nodes from reading the same file',
        'Give each node a different polling frequency so they do not overlap',
      ],
      answer: 1,
      explain: 'With primary node only, the two nodes do not pick the same file. Polling sources in a cluster should run on the primary node. Check that your runtime and deployment model support this setting.',
    },
  ],
  description: `
Brindle Outdoor receives weekly purchase plans from the planning platform as CSV files on an FTP server. A Mule app must pick each new file, load it into the ERP staging database, and move it to an archive folder. In test, some files are processed twice and one file was read while it was still arriving.

**Questions**
1. Which connection settings matter?
2. Which operations and source would you use?
3. Why are files processed twice, and how do you stop it?
4. How do you avoid reading a file that is still being written?
`,
  answerTemplate: `## Connection settings

## Operations and source

## Files processed twice

## Files still arriving
`,
  keyPoints: [
    'Set passive mode, binary transfer and the working directory on the connection.',
    'The listener polls and lists, it is not an event.',
    'Use a matcher for the file pattern.',
    'Move, rename, delete or watermark each file so it is picked once.',
    'Use timeBetweenSizeCheck, or a temp name and rename from the sender.',
    'In a cluster, poll on the primary node only.',
  ],
  solution: `
**1. Connection settings.** Host, port, user and a password from a secure property. Passive mode for firewalls and NAT. Binary transfer so the bytes are not changed. A working directory, so the flow uses short relative paths. Connection and response timeouts, and a reconnection strategy.

**2. Operations and source.** Use the On New or Updated File listener on the inbound folder, with a matcher for the name pattern such as \`PLAN_*.csv\` and regular files only. After a successful load, use move to put the file in archive. The connector also offers list, read, write, copy, rename, delete and createDirectory for scheduled jobs or error handling.

**3. Files processed twice.** The listener lists the folder on every poll. Without autoDelete, moveToDirectory, renameTo or the watermark, the same file is picked each time. Two cluster nodes polling the same folder also cause doubles, so run the source on the primary node. Keep an idempotency check, such as file name and hash in the database, for resends.

**4. Files still arriving.** Set timeBetweenSizeCheck so the listener reads a file only when its size stays the same between two checks. Better, agree that the sender writes under a temporary name and renames when done, and match only the final name.
`,
  followUps: [
    {
      q: 'Why is the watermark alone risky on FTP?',
      a: 'It compares file times, and FTP listings can show times in the server time zone, with low precision. A file with an older time copied in late can be skipped.',
    },
    {
      q: 'Where would you move a file that fails to load?',
      a: 'To an error folder with the reason in the audit log, so the next poll does not pick it again and support can replay it.',
    },
    {
      q: 'Should the archive move happen before or after the database commit?',
      a: 'After. If the move happens first and the load fails, the file is out of the inbound folder and nobody retries it.',
    },
  ],
}
