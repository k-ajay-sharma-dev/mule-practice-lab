export default {
  id: 'ms-272',
  category: 'mulesoft',
  title: 'The Mule SFTP Connector: Operations, the Listener and File Attributes',
  level: 'BEGINNER',
  tags: ['myproject', 'sftp', 'sftp-connector', 'listener', 'file-attributes', 'write-mode'],
  estMinutes: 14,
  quiz: [
    {
      type: 'single',
      prompt: 'An SFTP On New or Updated File source polls /inbound every minute. Ten new files land between two polls. How does the flow run?',
      options: [
        'Once, with a list of the ten files as the payload',
        'Once for the newest file, and the rest on the next polls',
        'Once per file, each event with that file as payload and its attributes',
        'Once per poll, with the ten files joined into one stream',
      ],
      answer: 2,
      explain: 'The source polls a directory on a schedule and starts the flow once for each new or changed file. Each event carries one file and its attributes. A list of files is what the List operation returns, not the source. Nothing joins files, and all matching files of a poll are picked.',
    },
    {
      type: 'multi',
      prompt: 'After a partner file is processed, it must end up in /archive with the business date in its name, and leave /inbound. Which SFTP connector steps can do this?',
      options: [
        'Move to /archive, with renameTo set to a name that holds the date',
        'Rename, with /archive/plan-2026-11-18.csv as the new name',
        'Copy to /archive with a dated renameTo, then Delete the original',
        'Write to /archive in MOVE mode, which removes the original',
        'Run a remote mv command, which the connector passes to the server',
      ],
      answer: [0, 2],
      explain: 'Move and Copy both take a target directory and an optional renameTo. Rename only changes the name inside the same directory, so its new name cannot hold a path. Write has no MOVE mode, and the connector does not run shell commands on the server.',
    },
    {
      type: 'single',
      prompt: 'A flow starts from the SFTP listener, transforms the file, posts it with an HTTP Request, then moves the original to /archive using attributes.fileName. The Move fails. Why, and what helps?',
      options: [
        'The Transform Message replaced the attributes, so read the name before it',
        'SFTP attributes hold only the path, so cut the name out of attributes.path',
        'The HTTP Request replaced the attributes, so save the name in a variable first',
        'Attributes are cleared once the source hands the event on, so use a header',
      ],
      answer: 2,
      explain: 'The SFTP attributes hold details such as the file name, path, size and timestamp. An operation that returns a message, such as an HTTP Request without a target, replaces both payload and attributes. A Transform Message changes the payload and leaves the attributes. Store the name in a variable at the start, or give the request a target.',
    },
    {
      type: 'single',
      prompt: 'Mule writes orders.csv to a partner /in folder every hour. Sometimes the partner has not collected the last file yet. Each file must stay a separate file and none may be lost. Which Write setup fits?',
      options: [
        'OVERWRITE, since the partner wants the newest orders anyway',
        'APPEND, so the new orders join the file not yet collected',
        'CREATE_NEW, which adds a counter to the name when it is taken',
        'CREATE_NEW, and handle FILE_ALREADY_EXISTS by waiting or alerting',
      ],
      answer: 3,
      explain: 'CREATE_NEW protects against overwriting a file the partner has not collected yet: the write fails with SFTP:FILE_ALREADY_EXISTS. It does not rename anything, so the flow must handle that error. OVERWRITE replaces the old file and loses its orders. APPEND adds to it, so two hours end up in one file.',
    },
    {
      type: 'single',
      prompt: 'The connection sets a working directory of /home/brindle. The Write operation uses the path outbound/sales.csv. Where does the file go?',
      options: [
        '/outbound/sales.csv',
        '/home/brindle/outbound/sales.csv',
        '/home/sftpuser/outbound/sales.csv',
        '/home/brindle/sales.csv',
      ],
      answer: 1,
      explain: 'Relative paths are resolved against the working directory. Absolute paths start with a slash.',
    },
    {
      type: 'single',
      prompt: 'A flow writes to /outbound/2026/11/18/sales.csv and the dated folders do not exist yet. What helps?',
      options: [
        'Set the Write mode to CREATE_NEW, which builds missing folders',
        'Create parent directories on Write, or a Create directory call first',
        'Write in APPEND mode, which creates the path if it is missing',
        'Set the working directory to the dated folder on the connection',
      ],
      answer: 1,
      explain: 'With the createParentDirectories option on, which is the default, the connector creates missing folders. The user still needs rights to create them on the server.',
    },
  ],
  description: `
Larkfield Grocers is building its first Mule flows with the SFTP connector: one sends daily sales to the planning platform, and one picks up order plans that come back. The team wants a quick tour of the connector.

**Questions**
1. Which source and operations does the connector offer?
2. What information comes with each file?
3. What do the Write modes do?
4. How are paths and folders handled?
`,
  answerTemplate: `## Source and operations

## File attributes

## Write modes

## Paths and folders
`,
  keyPoints: [
    'The On New or Updated File source polls a directory.',
    'Operations: list, read, write, copy, move, rename, delete, create directory.',
    'Attributes give the file name, path, size and timestamp.',
    'Write modes: OVERWRITE, APPEND, CREATE_NEW.',
    'Relative paths use the working directory. Parent folders can be created on write.',
  ],
  solution: `
**1. Source and operations.** The On New or Updated File source polls a directory on a schedule and starts the flow once per file, with options to delete, move or rename the file afterwards and a matcher to filter files. Operations include List, Read, Write, Copy, Move, Rename, Delete and Create directory. Read pulls one file by path. List returns entries of a directory, optionally recursive and filtered by a matcher.

**2. File attributes.** Each file comes with attributes such as the name, path, size and timestamp, and flags for directory and regular file. Flows use them for logging, archive names, and size checks.

**3. Write modes.** OVERWRITE replaces an existing file, APPEND adds to its end, and CREATE_NEW fails if the file exists. CREATE_NEW is a good guard for an outbound folder where an old file not yet collected should not be replaced silently.

**4. Paths and folders.** The connection has a working directory, and relative paths start from there. The Write operation can create missing parent folders, which suits dated folders, as long as the SFTP user may create them.
`,
  followUps: [
    {
      q: 'Why would you use List and Read in a scheduled flow instead of the listener?',
      a: 'When you need to control the batch: read all files of a run together, order them, or stop at a cut off. The listener handles one file per flow run.',
    },
    {
      q: 'What error do you expect when CREATE_NEW meets an existing file?',
      a: 'A file already exists error from the connector. Catch it and alert, since it often means the partner did not collect the last file.',
    },
    {
      q: 'Where do you put host, user and key paths?',
      a: 'In properties per environment, with secrets in secure properties. The flow only refers to the connection config.',
    },
  ],
}
