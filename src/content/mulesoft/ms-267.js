export default {
  id: 'ms-267',
  category: 'mulesoft',
  title: 'Half Written Store Files on a Share: SMB Locks, File Leases and Control Files',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'file-locks', 'leases', 'control-files', 'planning-platform', 'inventory-feed'],
  estMinutes: 24,
  quiz: [
    {
      type: 'single',
      prompt: 'A store system writes a 40 MB inventory file over SMB. The Mule poller lists the share and reads the file over REST, and gets only 12 MB. Why?',
      options: [
        'The REST GET returns at most 12 MB unless a Range header is sent',
        'The file is listed as soon as it exists, while it is still being written',
        'The SMB client caches the file locally and uploads it after closing',
        'The share quota cut the file off when the poller started to read it',
      ],
      answer: 1,
      explain: 'Nothing in a listing says a file is complete. The reader needs a signal from the writer.',
    },
    {
      type: 'single',
      prompt: 'An SMB client holds a file open and does not share write access. A REST call tries to delete it. What can happen?',
      options: [
        'The delete is queued and runs when the SMB client closes the file',
        'The call fails with a conflict, reported as a sharing violation',
        'The REST call wins and the SMB client loses its open handle',
        'The file is marked for deletion and hidden from new listings',
      ],
      answer: 1,
      explain: 'SMB open handles and share modes are respected by the REST API. Treat this error as "try later", not as a hard failure.',
    },
    {
      type: 'single',
      prompt: 'A Mule flow takes a lease on an export file over REST, then crashes before releasing it. An hour later the next run tries to write the same file. What happens?',
      options: [
        'The write works, since the lease timed out 60 seconds after the crash',
        'The write works, since a lease blocks only SMB clients, not REST calls',
        'The write fails until someone breaks the lease, which never expires alone',
        'The write works, since the lease ended with the crashed app connection',
      ],
      answer: 2,
      explain: 'A file lease blocks other writes and deletes until it is released or broken, and file leases have no duration. The 60 second limit belongs to blob leases. The lease is not tied to a connection, and it applies to REST callers too. The next run must break the lease, or the flow must release it in its error handler.',
    },
    {
      type: 'multi',
      prompt: 'Which signals can tell the reader that a store file is complete?',
      options: [
        'A control file written after the data file',
        'A rename from a temporary name to the final name',
        'A trailer record with the record count',
        'The same size and write time in two listings a few minutes apart',
        'The file creation time, set by the writer on the share',
        'A file size above zero in the listing',
      ],
      answer: [0, 1, 2, 3],
      explain: 'A control file sent last, a rename to the final name and a trailer with the record count are agreed signals from the writer. The same size and write time in two listings a few minutes apart is a weaker check, but it shows the writer has stopped. The creation time says when writing started, not when it ended. A size above zero only shows that writing has begun, since a half written file has a size too. Agreed signals from the writer are stronger than size checks.',
    },
    {
      type: 'single',
      prompt: 'The reader finds a control file. What should it check before processing the data file?',
      options: [
        'Nothing more, since the control file is written after the data file',
        'That the data file size and record count match the control file',
        'That the control file was written in the last 24 hours',
        'That the data file is older than the control file in the listing',
      ],
      answer: 1,
      explain: 'A control file with the size and count lets the reader catch a file that was cut short or replaced.',
    },
    {
      type: 'order',
      prompt: 'Order the reader steps for a store file with a control file.',
      items: [
        'Find a control file in the listing',
        'Find its data file and compare size and record count',
        'Process the data file and send it to the planning platform',
        'Move both files to the archive directory',
      ],
      explain: 'The control file starts the work. Both files move together, so the next run does not see a lonely control file.',
    },
  ],
  description: `
Larkfield Grocers has 300 stores. Each store system writes a nightly inventory snapshot to an Azure file share over SMB. A Mule app polls the share over REST and sends the snapshots to the planning platform. Several times a month the planning platform gets a snapshot that stops in the middle, and the store then shows as out of stock for most items.

**Questions**
1. Why does the reader see half written files?
2. What do SMB locks and file leases do here?
3. What signals can the writer give, and which is best?
4. What should the reader check before it sends a file on?
`,
  answerTemplate: `## Why half written files appear

## Locks and leases

## Signals from the writer

## Checks before sending
`,
  keyPoints: [
    'A file appears in listings while it is still being written.',
    'SMB open handles can block REST writes and deletes with a conflict error.',
    'A file lease is an exclusive write and delete lock with no automatic expiry.',
    'Best signals: temporary name then rename, or a control file written last.',
    'Check size and record count against the control file or trailer.',
    'Archive the data and control files together.',
  ],
  solution: `
**1. Why half written files appear.** The store system creates the file and writes it over several seconds or minutes. A REST listing shows it at once, and a GET returns whatever is there. Nothing in Azure marks the file as finished.

**2. Locks and leases.** An SMB writer holds an open handle. If it does not share write or delete access, REST calls that change the file fail with a conflict, often called a sharing violation. That stops the reader from moving the file, but it does not stop a read of partial content. A file lease is the REST side lock: it blocks other writes and deletes until it is released or broken, and it does not expire on its own. Leases help two REST writers, not an SMB writer and a REST reader.

**3. Signals from the writer.** The strongest are agreed with the store team: write under a temporary name and rename at the end, or write a small control file after the data file, holding the size, record count and business date. A trailer record with a count is a good second check. As a last resort, wait until size and write time stay the same across two listings.

**4. Checks before sending.** Start from the control file, find the data file, and compare its size and record count. On a mismatch, wait and retry a few times, then alert. After sending to the planning platform, move both files to the archive directory.
`,
  followUps: [
    {
      q: 'The store systems cannot be changed. What can the reader do?',
      a: 'Use the stable size check over two listings, plus a minimum age, and check any trailer the format has. It is weaker, so add an alert when a file stays unstable too long.',
    },
    {
      q: 'Why not take a lease before reading?',
      a: 'A lease blocks other REST writers but not the SMB writer that is still filling the file, and a crashed reader leaves a lock behind.',
    },
    {
      q: 'What happens if a control file arrives with no data file?',
      a: 'Keep it for a grace period, then raise an alert. It usually means the data upload failed or the files were written in the wrong order.',
    },
  ],
}
