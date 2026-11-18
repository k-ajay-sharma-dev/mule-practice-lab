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
      prompt: 'Which operations does the Mule 4 FTP connector offer?',
      options: ['list', 'read', 'write', 'rename and move', 'executeSql'],
      answer: [0, 1, 2, 3],
      explain: 'The FTP connector also has copy, delete and createDirectory. SQL belongs to the Database connector.',
    },
    {
      type: 'single',
      prompt: 'What does the FTP listener, On New or Updated File, do under the hood?',
      options: [
        'The server pushes a message to Mule',
        'It polls the directory on a schedule, lists it and starts a flow for each new or updated file that passes the matcher',
        'It keeps the data connection open',
        'It reads only the newest file',
      ],
      answer: 1,
      explain: 'FTP has no events. The listener is a scheduled list operation with a matcher and, optionally, a watermark on the file time.',
    },
    {
      type: 'single',
      prompt: 'Which write mode fails when the target file already exists?',
      options: ['OVERWRITE', 'APPEND', 'CREATE_NEW', 'REPLACE'],
      answer: 2,
      explain: 'CREATE_NEW protects against overwriting a file the partner has not collected yet. OVERWRITE replaces it, APPEND adds to it.',
    },
    {
      type: 'single',
      prompt: 'The listener has autoDelete false and no moveToDirectory or watermark. What happens on each poll?',
      options: [
        'Each file is picked once',
        'The same files are picked again on every poll, so they are processed many times',
        'The listener stops',
        'Files are deleted anyway',
      ],
      answer: 1,
      explain: 'The listener needs a way to forget a file: delete it, move it, rename it, or enable the watermark.',
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
        'Nothing, FTP prevents double reads',
        'Run the listener on the primary node only, so both nodes do not pick the same file',
        'Use APPEND mode',
        'Set transferMode to ASCII',
      ],
      answer: 1,
      explain: 'Polling sources in a cluster should run on the primary node. Check that your runtime and deployment model support this setting.',
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
