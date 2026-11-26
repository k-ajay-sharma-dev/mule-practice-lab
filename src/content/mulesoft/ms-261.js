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
      prompt: 'A developer moves the path https://larkfieldstore.file.core.windows.net/drops/store042/sales.csv into Mule connector settings. Which split is right?',
      options: [
        'Account larkfieldstore, container drops, blob name store042/sales.csv',
        'Account larkfieldstore, share drops/store042, file sales.csv',
        'Account larkfieldstore, share drops, file store042/sales.csv at the root',
        'Account larkfieldstore, share drops, directory store042, file sales.csv',
      ],
      answer: 3,
      explain: 'A storage account holds shares. A share holds directories and files, and directories can nest. The file host name marks Azure Files, so there is no container or blob. A share name has no slash, and store042 is a real directory, not part of a file name.',
    },
    {
      type: 'single',
      prompt: 'A store server on the office network fails to map the share as a drive, while a Mule app reads the same share over HTTPS without trouble. What is the likely cause?',
      options: ['The server must use SFTP on port 22 for file shares', 'The share allows SMB only after it is turned on per file', 'The network blocks outbound port 445, which SMB needs', 'The account key works over HTTPS but not for a mount'],
      answer: 2,
      explain: 'Azure Files speaks SMB, so a server can map it like a normal network drive, and SMB uses port 445, which many networks block outbound. Programs can also use the REST API over HTTPS, which is why the Mule app works. SFTP is a Blob Storage feature, not a file share one. The account key can be used for an SMB mount too.',
    },
    {
      type: 'multi',
      prompt: 'The store programs lock files while they write and keep one folder per store. An architect suggests moving them from the file share to Blob Storage. Which statements are true?',
      options: [
        'Directories in a file share are real objects. Folders in Blob Storage are only parts of blob names.',
        'The store servers can keep mapping a drive to the file share over SMB',
        'Blob Storage can also be mapped as a Windows drive over SMB',
        'SMB clients get file locking behaviour on a share, as on a normal network drive',
        'Blob Storage gives the same file locks to programs that write over HTTPS',
      ],
      answer: [0, 1, 3],
      explain: 'Azure Files behaves like a network drive. Blob Storage is object storage reached over HTTP, and it holds very large objects too. Blob leases guard writes to one blob, but they are not the file locks that SMB programs expect. (A storage account with hierarchical namespace, used for Data Lake Storage Gen2, does have real blob directories, but plain Blob Storage does not.)',
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
        'The service creates the missing parent directories in the same call, then writes the file',
        'The call fails because the parent directory is not found, so you create each directory first',
        'The file is created at the root of the share, and the path is kept only as metadata',
        'The call works and the name keeps the slashes, as a blob name would in a flat namespace',
      ],
      answer: 1,
      explain: 'Unlike blob names, file paths need real parent directories. A writer creates them one level at a time, and treats "already exists" as fine.',
    },
    {
      type: 'single',
      prompt: 'An architect wants the store drop folder moved from the file share to Blob Storage, to get BlobCreated events. The store systems are old Windows programs that write to a mapped drive and cannot be changed. What should the team decide?',
      options: [
        'Move to Blob Storage, and map the container as a drive on each store server',
        'Keep the file share, and subscribe to BlobCreated events for it',
        'Keep the file share, as the programs need a drive, and read it from Mule',
        'Move to Blob Storage with its SFTP endpoint, so the stores keep their drive',
      ],
      answer: 2,
      explain: 'Azure Files fits lift and shift cases where programs expect a drive. Blob Storage fits cloud native apps, large volumes and event driven work. A container cannot be mapped as an SMB drive, and SFTP is not a drive, so both would need program changes. BlobCreated events come from Blob Storage, not from file shares, so Mule polls or lists the share instead.',
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
