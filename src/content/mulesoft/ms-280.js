export default {
  id: 'ms-280',
  category: 'mulesoft',
  title: 'Designing a Multi Partner SFTP Hub for Planning Files: Folders, Duplicates, Zero Byte Files and Audit',
  level: 'EXPERT',
  tags: ['myproject', 'sftp', 'planning-platform', 'architecture', 'partner-folders', 'idempotency', 'audit'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How would you lay out folders on the hub SFTP server for each partner?',
      options: [
        'One shared in and out folder, with the partner code in each file name',
        'Per partner in, out, archive and error, each account kept to its area',
        'One folder per file type, shared by every partner that sends it',
        'Per partner folders, with one shared account the hub controls',
      ],
      answer: 1,
      explain: 'Use per partner folders such as in, out, archive and error, with each partner account limited to its own area. Per partner folders and accounts keep one partner from reading or deleting another partner\'s files, and make audit clear.',
    },
    {
      type: 'single',
      prompt: 'A distribution center sends a zero byte receipts file. What should the hub do?',
      options: [
        'Treat it as a day with no receipts, since it arrived on time',
        'Move it to error and alert, unless empty was agreed to mean no data',
        'Send it on, so the planning platform decides what to do with it',
        'Leave it for the next poll, in case it was still being written',
      ],
      answer: 1,
      explain: 'An empty file is often a failed export. A file still being written is the job of a size or age check, not a reason to leave an empty file waiting. A better convention for "no data" is a file with a header and a trailer count of zero.',
    },
    {
      type: 'single',
      prompt: 'Which key best detects a resent duplicate file?',
      options: [
        'The partner and the file name',
        'The partner, a content hash and the header batch id',
        'The partner, the file size and the arrival date',
        'The file name and the last modified time',
      ],
      answer: 1,
      explain: 'Names get reused and sizes match by chance. A content hash plus the business batch id is reliable.',
    },
    {
      type: 'multi',
      prompt: 'Which parts make the hub configuration driven, so a new partner needs no new code?',
      options: [
        'A partner table or property set with folder, file pattern, target and schedule',
        'A flag per partner for PGP, with key references',
        'One generic intake flow that reads this configuration',
        'A copy of the app per partner, built from a shared template',
        'One app with a separate flow per partner, sharing common subflows',
        'Partner settings kept in a DataWeave lookup object inside the intake flow',
      ],
      answer: [0, 1, 2],
      explain: 'A partner table or property set holds folder, file pattern, target and schedule. A PGP flag with key references covers partners that encrypt. One generic intake flow reads this configuration, so a new partner is a new row. Copies of the app drift apart and multiply fixes. A flow per partner in one app still means new code and a release for each partner. Settings kept in a DataWeave object inside the flow are code too, so each change needs a release.',
    },
    {
      type: 'match',
      prompt: 'Match each folder to its role.',
      pairs: [
        ['in', 'The partner drops files here for the hub to collect'],
        ['out', 'The hub places files here for the partner to collect'],
        ['archive', 'Processed files kept for a set period'],
        ['error', 'Files that failed checks, kept for review'],
      ],
      explain: 'Clear roles make support work and cleanup rules simple.',
    },
    {
      type: 'single',
      prompt: 'What should the file audit log record for each file?',
      options: [
        'File name, received time and status, with the rest in app logs',
        'Partner, name, size, hash, time, records, status and correlation id',
        'Name, size, hash and status, with the partner read from the file name',
        'Partner, name, size, time and status, with a hash only for failed files',
      ],
      answer: 1,
      explain: 'The correlation id links the record to the run. The partner should come from the account or folder, since a file name can be wrong. A hash on every file is what spots a resent duplicate. This answers "did you get our file and what happened to it" in one query, without opening logs or files.',
    },
  ],
  description: `
Larkfield Grocers exchanges files with a supply chain planning platform, three distribution centers and an ERP. Master data and daily sales go to the platform, receipts and stock come in from the distribution centers, and plans come back from the platform for the ERP and the warehouse systems. Today each feed is a separate Mule app with its own rules, and support cannot answer "did you get our file?" without searching logs.

The team wants one SFTP hub design for all partners.

**Questions**
1. How would you lay out folders and accounts?
2. How do you handle zero byte and duplicate files?
3. How do you add partners without new code?
4. What do you record for audit and support?
`,
  answerTemplate: `## Folders and accounts

## Zero byte and duplicate files

## Configuration driven partners

## Audit and support
`,
  keyPoints: [
    'Per partner folders: in, out, archive, error, with an account limited to its own area.',
    'Zero byte files go to error with an alert, unless agreed as "no data".',
    'Detect duplicates by partner, content hash and batch id.',
    'One generic flow with a partner configuration table.',
    'A file audit log with size, hash, records, status and correlation id.',
    'Cleanup rules per folder and alerts on missing expected files.',
  ],
  solution: `
**1. Folders and accounts.** Give each partner an area with in, out, archive and error folders, and an account that can only reach its own area. Partners drop files in their in folder and collect from out. The hub moves processed files to archive and failed ones to error. Each partner has its own key, so access can be revoked one partner at a time.

**2. Zero byte and duplicate files.** An empty file usually means a failed export. Move it to error and alert, unless the partner has agreed that empty means no data. Better still, agree that no data is a file with a header and a trailer count of zero. For duplicates, hash the content and read the batch id from the header, and check both against the audit log for that partner. A repeat goes to archive marked as a duplicate, with no second load. A file with a known batch id but different content goes to error for review.

**3. Configuration driven partners.** Keep a partner table with the folder, file name pattern, expected schedule, PGP settings and key references, the format and the target, such as the planning platform over SFTP or the ERP database. One generic intake flow lists each partner's in folder, applies the common checks and routes by configuration to a small transform per feed. A new partner is a configuration row and a transform, not a new app.

**4. Audit and support.** Record each file: partner, name, size, hash, received time, records, status, target and a correlation id that links to the run logs. Alert when an expected file has not arrived by its time. Clean archive and error folders after an agreed retention, keeping your own copy if audit needs it.
`,
  followUps: [
    {
      q: 'Why hash the content instead of comparing names?',
      a: 'Partners reuse names, such as a fixed daily name, and a corrected resend keeps the old name. The hash tells a true repeat from new content.',
    },
    {
      q: 'Where would the checks run, on the listener or after it?',
      a: 'The listener matcher does cheap checks like name pattern and minimum age. Hash, header, trailer and duplicate checks run in the flow, before any load.',
    },
    {
      q: 'How do you handle a partner that sends late every week?',
      a: 'Show it in the audit report and alert on the expected arrival time, then agree a new schedule or a cut off rule with the business owner.',
    },
  ],
}
