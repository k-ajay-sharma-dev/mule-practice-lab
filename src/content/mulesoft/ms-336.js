export default {
  id: 'ms-336',
  category: 'mulesoft',
  title: 'Writing Split Part Files and a Control File to the Planning Platform Safely',
  level: 'ADVANCED',
  tags: ['myproject', 'large-files', 'planning-platform', 'split-files', 'control-file', 'sftp'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Why split a 4 GB daily sales extract into parts for the planning platform?',
      options: [
        'Smaller files compress better, so the transfer takes less time',
        'The receiver often limits size or rows per file, and parts are retried one by one',
        'SFTP cannot send a single file larger than 2 GB',
        'Each part can then be encrypted with a different key',
      ],
      answer: 1,
      explain: 'Parts can be sent, retried and loaded one by one. A failed 4 GB upload starts again from zero. A failed part is retried alone.',
    },
    {
      type: 'single',
      prompt: 'The platform picks up any file in the folder. How do you stop it reading a part that is half written?',
      options: [
        'Write each part in one fast call, so the reader has no time to see it',
        'Write each part under a temporary name or folder, then rename it when complete',
        'Send the control file first, so the platform knows what is coming',
        'Set each file to read only as soon as the write has started',
      ],
      answer: 1,
      explain: 'A rename on the same server is quick and the reader sees only finished files.',
    },
    {
      type: 'single',
      prompt: 'When do you write the control file?',
      options: [
        'Before the parts, so the receiver knows how many to expect',
        'After every part is written and renamed, as the signal the set is complete',
        'After the first part, so the receiver can start loading early',
        'Never, since the part names show how many parts there are',
      ],
      answer: 1,
      explain: 'The receiver waits for the control file before it loads anything.',
    },
    {
      type: 'multi',
      prompt: 'What belongs in the control file?',
      options: [
        'The list of part file names',
        'Rows and bytes per part and in total',
        'A checksum per part',
        'The SFTP user and password used to write the parts, for audit',
      ],
      answer: [0, 1, 2],
      explain: 'Credentials never go in files.',
    },
    {
      type: 'single',
      prompt: 'The flow crashes after writing 3 of 5 parts. What should the rerun do?',
      options: [
        'Write parts 4 and 5 only, since parts 1 to 3 are complete',
        'Write all parts again with the same names, then the control file',
        'Send a control file that lists the 3 parts already written',
        'Nothing, since the platform loads the 3 parts and waits for more',
      ],
      answer: 1,
      explain: 'Without the control file the platform ignored the half set. Writing all parts again is the clear rule, unless you keep per part checksums and can prove parts 1 to 3 match.',
    },
    {
      type: 'single',
      prompt: 'How do you write parts without loading the whole extract into memory?',
      options: [
        'Read all rows into a list, then split it with DataWeave',
        'Stream rows from the source and start a new part at the planned row count',
        'Move to a larger worker so the whole extract fits in memory',
        'Send one file and ask the platform to split it on arrival',
      ],
      answer: 1,
      explain: 'Plan the part sizes first, from a row count, so each part can be written in one pass.',
    },
  ],
  description: `
Brindle Outdoor sends daily store sales to the planning platform over SFTP. The extract is about 4 GB. The upload often failed near the end, and twice the platform loaded a file while it was still being written, which gave half a day of sales to the planners.

**Questions**
1. Why split the extract into parts?
2. How do you stop the platform reading unfinished files?
3. What does the control file hold, and when is it written?
4. What happens on a crash and rerun?
`,
  answerTemplate: `## Why split

## Unfinished files

## The control file

## Crash and rerun
`,
  keyPoints: [
    'Parts respect the platform limits and can be retried alone.',
    'Write under a temporary name, then rename when complete.',
    'The control file lists parts with rows, bytes and checksums.',
    'Write the control file last, as the completion signal.',
    'A rerun writes all parts and the control file again.',
    'Stream rows into parts, planned from a row count.',
  ],
  solution: `
**1. Why split.** The platform has limits per file, and a 4 GB upload that fails near the end starts over. Parts of a planned size are retried alone, and the platform can load them in parallel.

**2. Unfinished files.** Write each part to a temporary name, such as a \`.tmp\` suffix or a staging folder, and rename it to the final name when the write completes. The platform only picks up final names.

**3. The control file.** It lists each part with rows, bytes and a checksum, plus totals, the feed name and the business date. Write it last, after every part is renamed. Its presence says the set is complete, and the platform checks the parts against it.

**4. Crash and rerun.** Without a control file, the platform ignores the half set. The rerun deletes leftover temporary files, writes all parts again with the same names, then the control file. Stream rows from the source and start a new part when the planned row count is reached, so memory stays flat.
`,
  followUps: [
    {
      q: 'What if the platform deletes files after loading?',
      a: 'Keep your own archive copy of each part and the control file, named by run, for replays and audits.',
    },
    {
      q: 'Does a rename on SFTP always replace an existing file?',
      a: 'Not on every server. Some refuse when the target exists, so delete the old final file first or use a new name per run.',
    },
    {
      q: 'How do you tell the platform team about a resend?',
      a: 'Agree on a rule, such as a newer control file for the same business date replacing the old set.',
    },
  ],
}
