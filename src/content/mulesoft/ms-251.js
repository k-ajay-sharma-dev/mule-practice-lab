export default {
  id: 'ms-251',
  category: 'mulesoft',
  title: 'Azure Blob Storage Basics for Mule Developers: Accounts, Containers, Blob Types and Naming Rules',
  level: 'BEGINNER',
  tags: ['myproject', 'azure-blob', 'containers', 'blob-types', 'naming', 'fundamentals', 'cloud-storage'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'An old config holds the URL https://penhallowdata.blob.core.windows.net/nightly/eu/stock.csv. A developer moves it into Azure Blob connector settings. Which split is right?',
      options: [
        'Account penhallowdata, container nightly/eu, blob name stock.csv',
        'Account penhallowdata, container nightly, blob name eu/stock.csv',
        'Account penhallowdata, container eu, blob name stock.csv in folder nightly',
        'Account blob, container penhallowdata, blob name nightly/eu/stock.csv',
      ],
      answer: 1,
      explain: 'The storage account is in the host name, then comes the container, then the full blob name, which may contain slashes. A container name cannot contain a slash, so everything after the first segment of the path belongs to the blob name. The word blob in the host is the service, not the account.',
    },
    {
      type: 'multi',
      prompt: 'A flow builds a container name for each partner from a template. Which generated names does Azure accept?',
      options: ['penhallow-invoices-2026', 'Penhallow-Invoices', 'ab', 'erp-exports-eu', 'erp--exports-eu'],
      answer: [0, 3],
      explain: 'Container names use lower case letters, numbers and single hyphens, start with a letter or number, and are 3 to 63 characters long. Upper case letters are refused, two characters is too short, and two hyphens in a row are not allowed.',
    },
    {
      type: 'match',
      prompt: 'Match each blob type to its typical use.',
      pairs: [
        ['Block blob', 'Files such as CSV, JSON, images and backups'],
        ['Append blob', 'Logs that only ever grow at the end'],
        ['Page blob', 'Random read and write access, such as virtual disks'],
      ],
      explain: 'Integration work almost always uses block blobs.',
    },
    {
      type: 'single',
      prompt: 'In a standard account without hierarchical namespace, a flow uploads "orders/2026/11/18/file.json", the only blob under orders/, and later deletes it. What happens to the "orders" folder?',
      options: [
        'It stays as an empty folder until someone deletes it',
        'It disappears, as folders are only prefixes of blob names',
        'The delete fails until the folder is emptied and removed first',
        'It stays, as a folder marker blob was written with the upload',
      ],
      answer: 1,
      explain: 'In a standard account there is no folder object. The slashes are part of the name, and tools show them as folders. Without the hierarchical namespace feature, the namespace is flat. Folders are prefixes of names, which is why they disappear when their last blob is deleted. Empty folders that stay behind belong to file systems, file shares and hierarchical namespace accounts. A plain upload writes no marker blob.',
    },
    {
      type: 'single',
      prompt: 'An old Windows job wrote Report.csv to the container. The new Mule flow checks that report.csv exists before it loads the file. What happens?',
      options: [
        'The check finds it, as blob names ignore case like Windows paths',
        'The call is refused, as blob names must be lower case like containers',
        'The check finds no blob, since blob names are case sensitive',
        'The check finds it, as the connector lower cases names before calls',
      ],
      answer: 2,
      explain: 'Report.csv and report.csv are two different blobs. Container names must be lower case anyway, but blob names may mix cases and keep them. Windows paths ignore case, blob names do not, and the connector sends the name as given.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow uploads a blob with a name that already exists. What usually happens?',
      options: [
        'The upload fails with a conflict error',
        'The new content replaces the old blob',
        'Azure keeps both, and the old one becomes a snapshot',
        'The new content is appended to the end of the old blob',
      ],
      answer: 1,
      explain: 'A plain upload overwrites, unless it uses a condition that stops it. Conditional headers, versioning or soft delete protect against accidental overwrites.',
    },
  ],
  description: `
Penhallow Retail is moving nightly file exchange from an SFTP server to Azure Blob Storage. The integration team has used SFTP for years and asks how the Blob Storage concepts map to what they know.

**Questions**
1. What are a storage account, a container and a blob?
2. Which blob type fits integration files, and why?
3. How do folders work, and what naming rules matter?
4. What happens when you write a blob that already exists?
`,
  answerTemplate: `## Account, container and blob

## Blob types

## Folders and names

## Overwrites
`,
  keyPoints: [
    'A storage account holds containers, and a container holds blobs.',
    'The blob URL has the account in the host, then the container and blob name.',
    'Block blobs suit integration files.',
    'Folders are prefixes in a flat namespace, unless the hierarchical namespace is on.',
    'Container names are lower case letters, numbers and hyphens, 3 to 63 characters.',
    'A plain upload overwrites an existing blob of the same name.',
  ],
  solution: `
**1. Account, container and blob.** A storage account is the top level resource, with its own endpoint, keys and network rules. Inside it, containers group blobs, much like top level directories on the SFTP server, and access can be set per container. A blob is one stored object, addressed as \`https://<account>.blob.core.windows.net/<container>/<blob name>\`.

**2. Blob types.** Block blobs hold whole files, which is what an integration writes and reads. Append blobs only add data at the end, for logs. Page blobs give random access for disks. Use block blobs for CSV, JSON and XML exchange.

**3. Folders and names.** In a standard account the namespace is flat. A name such as \`orders/2026/11/18/file.json\` contains slashes, and tools show them as folders, but there is no folder object. Listing by prefix gives the same effect. Container names must be lower case letters, numbers and single hyphens, 3 to 63 characters, starting with a letter or number. Blob names are case sensitive, so agree on one style, such as lower case.

**4. Overwrites.** A plain upload with an existing name replaces the blob, unlike an SFTP server that might refuse. Protect important data with a condition on the write, blob versioning or soft delete, and build names that are unique per run where repeats are possible.
`,
  followUps: [
    {
      q: 'When would you turn on the hierarchical namespace?',
      a: 'When you need real directories, such as atomic renames of a folder or analytics tools that expect a file system. It is chosen when the account is created.',
    },
    {
      q: 'How would you lay out containers for three partners?',
      a: 'A container per partner, or one container with a prefix per partner. Separate containers make access rules and clean up per partner clearer.',
    },
    {
      q: 'How do you rename a blob?',
      a: 'There is no rename in a flat namespace. Copy the blob to the new name, check the copy, then delete the old one.',
    },
  ],
}
