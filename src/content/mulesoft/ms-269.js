export default {
  id: 'ms-269',
  category: 'mulesoft',
  title: 'Design Review: Collecting Store Sales and Inventory Files From Azure File Share for the Planning Platform',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'planning-platform', 'architecture', 'cloudhub', 'sftp', 'sales-feed', 'inventory-feed'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each design option to its main trade off.',
      pairs: [
        ['CloudHub app calling the Azure Files REST API', 'No server to run, but the app must poll, page through listings and manage a SAS'],
        ['Mule runtime on a VM that mounts the share over SMB', 'The File connector works, but you patch the server and keep the mount alive'],
        ['An Azure job copies the share into Blob Storage', 'Blob events and connectors become available, but a copy step adds delay and cost'],
        ['Store systems push to an SFTP server instead', 'Mule uses the SFTP listener, but every store system must change'],
      ],
      explain: 'There is no free option. The right one depends on who owns the store systems and where Mule runs.',
    },
    {
      type: 'single',
      prompt: 'Why does the CloudHub option use REST over port 443 and not SMB over port 445?',
      options: [
        'SMB cannot carry files larger than 1 GB across the internet',
        'A CloudHub worker cannot mount a share, and port 445 is often blocked',
        'Azure Files accepts SMB only from virtual machines inside Azure',
        'The File connector reads SMB shares only from Windows hosts',
      ],
      answer: 1,
      explain: 'A CloudHub worker gives no way to mount a network share, and many networks and internet providers block port 445. REST over HTTPS works from anywhere that can reach the storage endpoint, including through a private endpoint.',
    },
    {
      type: 'multi',
      prompt: 'Which parts make the CloudHub design reliable?',
      options: [
        'A processed files table keyed by path, size and last write time',
        'Control files from the stores, so only complete files are read',
        'An archive directory per business date',
        'A check at the cut off time that lists stores whose files never arrived',
        'Reading every file in the share on every run, and letting the target drop repeats',
        'Deleting each file from the share as soon as it is read, before the SFTP send',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A processed files table keyed by path, size and last write time stops a file being sent twice, and still notices a file that was replaced. Control files mean only complete files are read. An archive per business date keeps the history and lets support resend one day. A check at the cut off finds stores whose files never came. Reading everything on each run wastes time and transactions and risks duplicates. Deleting a file before the send succeeds loses it for good if the send then fails.',
    },
    {
      type: 'single',
      prompt: 'Store files arrive between 01:00 and 03:00, and the planning platform loads at 05:00. How should the app poll?',
      options: [
        'Once at 03:00, when all files should be there, and send them together',
        'Every few minutes in the window, plus a missing store check before 05:00',
        'Every few minutes all day, and send whatever has arrived at 05:00',
        'Once at 04:30, so late files from slow stores are included too',
      ],
      answer: 1,
      explain: 'Polling during the window spreads the work. A single late poll leaves no time to react to a missing store. The final check gives people time to chase a missing store before the load.',    },
    {
      type: 'single',
      prompt: 'A store file arrives at 06:30, after the planning load. What is a sound rule?',
      options: [
        'Skip it, since the planning load for that day has already run',
        'Apply a rule agreed with planners, such as next cycle flagged late',
        'Send it at once, because the platform will merge it into the load',
        'Hold it and append its rows to that store’s file for the next day',
      ],
      answer: 1,
      explain: 'Late data is a business decision. A sound rule might send it in the next cycle flagged as late, and log it. Dropping it loses sales, and merging it into another day corrupts both days. The integration applies an agreed rule and makes it visible.',
    },
    {
      type: 'single',
      prompt: 'Which credential would you give the CloudHub app?',
      options: [
        'The storage account key, kept in a secure properties file',
        'A share SAS with only the needed rights, tied to an access policy',
        'An account SAS with read, write and delete on every share',
        'A user delegation SAS signed with the integration lead’s account',
      ],
      answer: 1,
      explain: 'Scope the SAS to the store share and the actions the app performs: read, list and what the archive step needs. Linking it to a stored access policy makes revocation possible, and it should be rotated. An account key or account SAS reaches every share.',
    },
  ],
  description: `
Marrow & Pine Home sends daily data to a supply chain planning platform. The store systems write sales and inventory files to an on premises file server. The company is moving that file server to an Azure file share, and the integration team must decide how Mule collects the files and sends them to the planning platform over SFTP.

Mule runs on CloudHub today. The store systems are owned by another team, which has a long change queue.

**Questions**
1. What options exist, and what does each cost?
2. Which option would you pick and why?
3. What makes the chosen design reliable?
4. How do you handle late and missing store files?
`,
  answerTemplate: `## Options

## Choice

## Reliability

## Late and missing files
`,
  keyPoints: [
    'Options: CloudHub with REST, a VM runtime with an SMB mount, a copy to Blob, or SFTP from stores.',
    'CloudHub cannot mount SMB, so REST over HTTPS is the cloud option.',
    'Keep a processed table, read only complete files, archive by date.',
    'Poll during the arrival window and check for missing stores before the cut off.',
    'Agree a rule for late files with the planning team.',
    'Scope the SAS to one share and rotate it.',
  ],
  solution: `
**1. Options.** A CloudHub app that calls the Azure Files REST API: no servers, but the app polls, pages through listings and manages a SAS. A Mule runtime on an Azure VM that mounts the share: the File connector works, but someone patches the VM and watches the mount. An Azure job that copies the share into Blob Storage: Blob events become available, but the copy adds delay and cost. Changing the store systems to push over SFTP: clean for Mule, but the store team must change every store.

**2. Choice.** Given CloudHub today and a slow store team, the CloudHub app over REST is the best fit. It keeps the store systems untouched and avoids running servers.

**3. Reliability.** Ask the store team for one small change if possible: a control file after each data file. The app lists the store directory page by page, picks data files with a control file whose size and count match, and skips paths already in the processed table. It sends each file to the planning platform over SFTP under a temporary name and renames it when complete. Then it records the file as processed and moves both files to an archive directory for that business date. A scheduled cleanup deletes old archive folders.

**4. Late and missing files.** At a fixed time before the planning load, compare the stores that sent files with the store list and alert on the gaps, so someone can chase them. For files that arrive after the load, apply a rule agreed with the planning team, such as sending them in the next cycle with a late flag, and log each case.
`,
  followUps: [
    {
      q: 'The store team refuses control files. What now?',
      a: 'Fall back to a stable size check over two listings and a minimum file age, and validate any trailer record. Alert on files that never settle.',
    },
    {
      q: 'Why send to the planning platform under a temporary name?',
      a: 'The platform may poll its SFTP folder. A temporary name stops it from loading a file that is still uploading.',
    },
    {
      q: 'How would you test the design before go live?',
      a: 'Run it against a copy of the share with real volumes, include late, empty and duplicate files, and kill the app in the middle of a run to see that it recovers.',
    },
  ],
}
