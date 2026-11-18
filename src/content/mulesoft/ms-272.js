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
      prompt: 'Which SFTP connector source starts a flow when a file appears?',
      options: ['On New or Updated File', 'Scheduler', 'On Table Row', 'Listener on port 22'],
      answer: 0,
      explain: 'The source polls a directory on a schedule and starts the flow once for each new or changed file.',
    },
    {
      type: 'multi',
      prompt: 'Which operations does the SFTP connector offer?',
      options: ['List', 'Read', 'Write', 'Move and Rename', 'Run a remote shell command'],
      answer: [0, 1, 2, 3],
      explain: 'It also has Copy, Delete and Create directory. It does not run shell commands on the server.',
    },
    {
      type: 'single',
      prompt: 'What do the attributes of a file read by the SFTP connector hold?',
      options: [
        'Only the content type',
        'Details such as the file name, path, size and timestamp',
        'The SSH private key',
        'The number of records',
      ],
      answer: 1,
      explain: 'Flows use these attributes to build archive names, log the file and check its size.',
    },
    {
      type: 'single',
      prompt: 'Which Write mode fails when the target file already exists?',
      options: ['OVERWRITE', 'APPEND', 'CREATE_NEW', 'REPLACE'],
      answer: 2,
      explain: 'CREATE_NEW protects against overwriting a file the partner has not collected yet. OVERWRITE replaces it, APPEND adds to it.',
    },
    {
      type: 'single',
      prompt: 'The connection sets a working directory of /home/brindle. The Write operation uses the path outbound/sales.csv. Where does the file go?',
      options: [
        '/outbound/sales.csv',
        '/home/brindle/outbound/sales.csv',
        'The root of the server',
        'The Mule worker disk',
      ],
      answer: 1,
      explain: 'Relative paths are resolved against the working directory. Absolute paths start with a slash.',
    },
    {
      type: 'single',
      prompt: 'A flow writes to /outbound/2026/11/18/sales.csv and the dated folders do not exist yet. What helps?',
      options: [
        'Nothing, SFTP cannot create folders',
        'The Write option to create parent directories, or a Create directory call first',
        'Write to the root instead',
        'Use APPEND mode',
      ],
      answer: 1,
      explain: 'With the option on, the connector creates missing folders. The user still needs rights to create them on the server.',
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
