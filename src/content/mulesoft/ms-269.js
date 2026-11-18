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
        'SMB is slower than REST',
        'A CloudHub worker cannot mount a share, and SMB across networks is often blocked anyway',
        'REST is the only protocol Azure supports',
        'Port 445 is for email',
      ],
      answer: 1,
      explain: 'REST over HTTPS works from anywhere that can reach the storage endpoint, including through a private endpoint.',
    },
    {
      type: 'multi',
      prompt: 'Which parts make the CloudHub design reliable?',
      options: [
        'A processed files table keyed by path, size and last write time',
        'Control files from the stores, so only complete files are read',
        'An archive directory per business date',
        'A check at the cut off time that lists stores whose files never arrived',
        'Reading every file in the share on every run',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Reading everything on each run wastes time and transactions and risks duplicates. State, signals and a missing file check do the work.',
    },
    {
      type: 'single',
      prompt: 'Store files arrive between 01:00 and 03:00, and the planning platform loads at 05:00. How should the app poll?',
      options: [
        'Once at 04:59',
        'Every few minutes during the window, plus a check at a fixed time before the cut off that alerts on missing stores',
        'Every second all day',
        'Once a week',
      ],
      answer: 1,
      explain: 'Polling during the window spreads the work. The final check gives people time to chase a missing store before the load.',
    },
    {
      type: 'single',
      prompt: 'A store file arrives at 06:30, after the planning load. What is a sound rule?',
      options: [
        'Drop it',
        'Agree a rule with the planning team, for example send it in the next cycle flagged as late, and log it',
        'Send it at once and ask the platform to reload',
        'Overwrite the next day file with it',
      ],
      answer: 1,
      explain: 'Late data is a business decision. The integration applies an agreed rule and makes it visible.',
    },
    {
      type: 'single',
      prompt: 'Which credential would you give the CloudHub app?',
      options: [
        'The account key',
        'A SAS on the store share only, with read, list and the rights the archive step needs, linked to a stored access policy and rotated',
        'An account SAS with all rights',
        'A personal user password',
      ],
      answer: 1,
      explain: 'Scope the SAS to one share and the actions the app performs. The policy makes revocation possible.',
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
