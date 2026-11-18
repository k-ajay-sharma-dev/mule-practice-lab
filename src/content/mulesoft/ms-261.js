export default {
  id: 'ms-261',
  category: 'mulesoft',
  title: 'Azure File Share Basics: Shares, Directories, Files and How They Differ From Blob Storage',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-file-share', 'smb', 'rest-api', 'azure-blob', 'storage-basics'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the hierarchy of Azure Files?',
      options: [
        'Storage account, then container, then blobs',
        'Storage account, then share, then directories, then files',
        'Subscription, then share, then files with no directories',
        'Storage account, then queue, then files',
      ],
      answer: 1,
      explain: 'A storage account holds shares. A share holds directories and files, and directories can nest.',
    },
    {
      type: 'single',
      prompt: 'Which protocol does a Windows server use to mount an Azure file share as a drive?',
      options: ['FTP on port 21', 'SMB, which uses port 445', 'SFTP on port 22', 'AMQP on port 5671'],
      answer: 1,
      explain: 'Azure Files speaks SMB, so a server can map it like a normal network drive. Programs can also use the REST API over HTTPS.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Azure Files compared with Blob Storage are true?',
      options: [
        'Directories in a file share are real objects. Folders in Blob Storage are only parts of blob names.',
        'A file share can be mounted over SMB by servers and desktops',
        'Blob Storage cannot hold files larger than 1 MB',
        'SMB clients get file locking behaviour on a share, as on a normal network drive',
      ],
      answer: [0, 1, 3],
      explain: 'Azure Files behaves like a network drive. Blob Storage is object storage reached over HTTP, and it holds very large objects too.',
    },
    {
      type: 'match',
      prompt: 'Match each Azure Files term to its meaning.',
      pairs: [
        ['Share', 'Top level unit inside the account, with its own size quota'],
        ['Directory', 'A real folder that must exist before files are created in it'],
        ['File', 'Bytes plus properties, with a size set when it is created'],
        ['Share snapshot', 'A read only copy of the whole share at one point in time'],
      ],
      explain: 'These four terms come up in every design talk about Azure Files.',
    },
    {
      type: 'single',
      prompt: 'Over the REST API, you create the file exports/2026/11/sales.csv, but the directory exports/2026/11 does not exist. What happens?',
      options: [
        'The service creates the missing directories',
        'The call fails because the parent directory is not found, so you create each directory first',
        'The file is created at the root of the share',
        'The file name keeps the slashes, as in Blob Storage',
      ],
      answer: 1,
      explain: 'Unlike blob names, file paths need real parent directories. A writer creates them one level at a time, and treats "already exists" as fine.',
    },
    {
      type: 'single',
      prompt: 'When is Azure Files a better choice than Blob Storage?',
      options: [
        'When you store billions of images for a website',
        'When existing servers or users need a shared drive path, for example store systems that already write to a network folder',
        'When you need the cheapest storage for archives',
        'When you need events for every new object',
      ],
      answer: 1,
      explain: 'Azure Files fits lift and shift cases where programs expect a drive. Blob Storage fits cloud native apps, large volumes and event driven work.',
    },
  ],
  description: `
Larkfield Grocers moved the network drive where its store systems drop files into an Azure file share. The integration team now has to read and write files there from Mule, and a new developer asks what Azure Files really is.

**Questions**
1. How is Azure Files organised?
2. How do clients reach a share?
3. How does it differ from Blob Storage?
4. When would you pick one over the other?
`,
  answerTemplate: `## Organisation

## Access

## Compared with Blob Storage

## When to use which
`,
  keyPoints: [
    'Storage account, share, directories, files.',
    'SMB on port 445 for mounted drives, and a REST API over HTTPS for programs.',
    'Directories are real. Parent directories must exist before a file is created.',
    'A share has a quota. Snapshots copy the whole share.',
    'Blob Storage has virtual folders and suits large cloud native volumes and events.',
    'Azure Files suits programs and people that expect a network drive.',
  ],
  solution: `
**1. Organisation.** A storage account holds one or more shares. A share holds directories and files, and directories can nest. Each share has a quota, the most it may hold.

**2. Access.** Servers and desktops mount a share over SMB, which uses port 445. Programs, such as a Mule app, can use the REST API over HTTPS at the account's file endpoint. The REST API offers calls to list a directory, create a file, write ranges, read and delete.

**3. Compared with Blob Storage.** A share has real directories, and a file can only be created in a directory that exists. Blob Storage is flat: a blob name can hold slashes, but folders are only shared beginnings of names. SMB clients get locking behaviour, as on a normal drive. Blob Storage offers features that Azure Files lacks, such as BlobCreated events and lifecycle rules.

**4. When to use which.** Pick Azure Files when existing systems need a drive path, as with store back office systems that already write to a folder. Pick Blob Storage for new cloud apps, very large volumes, archives and event driven flows.
`,
  followUps: [
    {
      q: 'Can a Mule app on CloudHub mount the share?',
      a: 'No. CloudHub workers cannot mount an SMB drive. The app calls the REST API over HTTPS instead, or a runtime on a server that mounts the share reads it with the File connector.',
    },
    {
      q: 'What is a share snapshot good for in an integration?',
      a: 'Recovery. If a bad run overwrites or deletes files, you can copy the old version back from a snapshot taken before the run.',
    },
    {
      q: 'Why does the REST writer need to create directories first?',
      a: 'Directories are real objects in a share. A create file call into a missing directory fails, so the writer creates each level and ignores the error that it already exists.',
    },
  ],
}
