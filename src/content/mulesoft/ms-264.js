export default {
  id: 'ms-264',
  category: 'mulesoft',
  title: 'Polling an Azure File Share Directory: List Calls, Markers and a Processed Files Table',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-file-share', 'list-directory', 'pagination', 'polling', 'idempotency'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A directory holds 12,000 files. One List Directories and Files call returns 5,000 entries and a NextMarker. What must the poller do?',
      options: [
        'Process the 5,000 and stop',
        'Call the list again with the marker until NextMarker comes back empty',
        'Raise maxresults to 12,000',
        'Delete files until fewer than 5,000 remain',
      ],
      answer: 1,
      explain: 'Each call returns one page. A poller that ignores the marker never sees the later files.',
    },
    {
      type: 'single',
      prompt: 'How does a Mule poller know which files on a share are new?',
      options: [
        'Azure Files publishes an event for each new file',
        'It compares the listing with its own processed table, or it moves each file away after processing',
        'The listing marks new files with a flag',
        'Files are deleted by Azure after one read',
      ],
      answer: 1,
      explain: 'Azure Files does not publish BlobCreated style events. The poller must keep its own state.',
    },
    {
      type: 'multi',
      prompt: 'What can a directory listing return?',
      options: [
        'File names and sizes',
        'Sub directory names',
        'A NextMarker when more entries remain',
        'The content of each file',
      ],
      answer: [0, 1, 2],
      explain: 'Content needs a separate GET per file. Newer API versions can add timestamps and other properties to the listing on request.',
    },
    {
      type: 'single',
      prompt: 'The poller passes prefix=SALES_ on the list call. Which files come back?',
      options: [
        'Every file in the share whose name starts with SALES_',
        'Files and directories in that one directory whose names start with SALES_',
        'Every file whose path contains SALES_',
        'Only directories named SALES_',
      ],
      answer: 1,
      explain: 'A list call covers one directory, not its children. To walk sub directories, list each one.',
    },
    {
      type: 'order',
      prompt: 'Order the steps of one polling run.',
      items: [
        'List a page of the directory',
        'Filter by name pattern and size',
        'Skip entries already in the processed table',
        'Read and process each remaining file',
        'Record each file as processed',
        'Repeat with the next marker until it is empty',
      ],
      explain: 'The processed record is written after the work succeeds, so a crash leads to a retry, not a lost file.',
    },
    {
      type: 'single',
      prompt: 'The app runs on two replicas and both poll the same directory every minute. What goes wrong, and what is a fix?',
      options: [
        'Nothing, Azure hands each file to one reader',
        'Both can pick the same file. Poll from one replica only, or claim each file with a lock before reading it.',
        'The share locks itself',
        'The second replica gets an error and stops',
      ],
      answer: 1,
      explain: 'A list call has no idea of consumers. Use a scheduler that runs on one node, or a lock in Object Store keyed by the file path.',
    },
  ],
  description: `
Ostrander Clinics gets lab result files on an Azure file share from an old system that writes over SMB. A Mule app on CloudHub polls the share every five minutes over the REST API. On busy days the directory holds over ten thousand files, and the team suspects some are never picked up.

**Questions**
1. How does a list call return entries, and how does the poller get all of them?
2. How does the poller tell new files from old ones?
3. What do prefix and directory scope mean for the listing?
4. What changes when the app runs on more than one replica?
`,
  answerTemplate: `## Pages and markers

## New or old

## Prefix and scope

## More than one replica
`,
  keyPoints: [
    'List calls return pages with a NextMarker. Loop until it is empty.',
    'There are no file created events, so keep a processed table or move files away.',
    'A prefix filters names within one directory. Listing is not recursive.',
    'Record processed only after the work succeeds.',
    'Several replicas need one poller or a lock per file.',
  ],
  solution: `
**1. Pages and markers.** List Directories and Files returns up to maxresults entries, at most 5,000, and a NextMarker when more remain. The poller calls again with that marker until the marker is empty. Ignoring it is a classic bug: on a quiet day every file fits in one page, and on a busy day files go missing.

**2. New or old.** Azure Files does not offer BlobCreated style events, so the poller keeps state. Two common ways: move each processed file to an archive directory, so the inbound directory only holds new work, or keep a processed table keyed by path with the size and last write time. Many teams do both.

**3. Prefix and scope.** A list call covers one directory. The prefix keeps entries whose names start with that text. Sub directories show up as directory entries, and the poller lists them separately if it needs to go deeper.

**4. More than one replica.** Every replica sees the same listing, so two can read the same file. Run the poll on one replica only, for example with a scheduler that runs on the primary node, or claim each file first with an Object Store lock keyed by its path, or by renaming it into a processing directory.
`,
  followUps: [
    {
      q: 'Why keep the size and last write time in the processed table, and not only the name?',
      a: 'A store may resend a corrected file under the same name. A changed size or write time tells the poller it is a new version to review.',
    },
    {
      q: 'The directory has 200,000 old files. What do you change?',
      a: 'Move processed files to dated archive directories. Listing a huge directory every few minutes is slow and costs transactions.',
    },
    {
      q: 'How long should one page be?',
      a: 'A moderate size such as 1,000 keeps each response small, and the loop gets the rest. The upper bound per call is 5,000.',
    },
  ],
}
