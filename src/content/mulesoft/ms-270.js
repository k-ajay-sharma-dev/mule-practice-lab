export default {
  id: 'ms-270',
  category: 'mulesoft',
  title: 'Incident: Duplicate and Missing Store Files From an Azure File Share Poller',
  level: 'EXPERT',
  tags: ['myproject', 'azure-file-share', 'incident', 'idempotency', 'pagination', 'planning-platform', 'sales-feed'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'Store 0412 sales were sent to the planning platform twice. The poller moves a file by copying it to the archive and then deleting the original. Logs show a timeout on the delete. What most likely happened?',
      options: [
        'The planning platform loaded the file twice on its own',
        'The copy worked, the delete failed, and the next poll found the file again with no processed record',
        'Azure duplicated the file',
        'The store sent it twice',
      ],
      answer: 1,
      explain: 'A move made of two calls can stop half way. Without a processed record, the leftover file looks new.',
    },
    {
      type: 'single',
      prompt: 'Store 0415 sales never arrived. The directory held 5,300 files that night. What is a likely cause?',
      options: [
        'The file was too large',
        'The poller read only the first page of the listing and ignored the NextMarker',
        'SMB hid the file',
        'The planning platform rejected it',
      ],
      answer: 1,
      explain: 'A list call returns at most 5,000 entries. On a normal night all files fit in one page, so the bug stays hidden.',
    },
    {
      type: 'multi',
      prompt: 'Which fixes stop both problems from coming back?',
      options: [
        'Write a processed record keyed by path, size and last write time before the archive step, and check it on every run',
        'Follow the NextMarker until it is empty',
        'Alert when an expected store has no file by the cut off',
        'Use a single rename call where the API version supports it, instead of copy then delete',
        'Poll less often',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Polling less often changes nothing about either cause.',
    },
    {
      type: 'order',
      prompt: 'Order the recovery steps.',
      items: [
        'Pause the poller',
        'Compare the processed table and archive with what the planning platform received',
        'Tell the planning team which load is duplicated so they can correct it',
        'Deploy the fix',
        'Send the missing store file',
        'Resume the poller and watch the next run',
      ],
      explain: 'Find the full damage first, then fix the data on the target, then the code, then fill the gap.',
    },
    {
      type: 'single',
      prompt: 'How can the target side make duplicates harmless?',
      options: [
        'It cannot',
        'Load by store and business date with replace semantics, so a resent file overwrites the earlier one instead of adding to it',
        'Reject any file seen before by name',
        'Sum all files for a store',
      ],
      answer: 1,
      explain: 'An idempotent load turns a duplicate into a no change event. Ask the planning team whether their load works this way.',
    },
    {
      type: 'single',
      prompt: 'What would have caught the missing file the same night?',
      options: [
        'A bigger worker',
        'A check before the planning load that compares stores received with the active store list',
        'More logging of file content',
        'A longer SAS expiry',
      ],
      answer: 1,
      explain: 'A completeness check against a known list finds silent gaps. Errors only catch failures that throw.',
    },
  ],
  description: `
Larkfield Grocers sends daily store sales to the planning platform. A Mule app polls an Azure file share over REST every ten minutes, sends each new file over SFTP, then archives it with a copy and a delete.

On Monday morning the planners reported that store 0412 showed double sales for Sunday and store 0415 showed no sales at all. Sunday was the busiest day of the year and the inbound directory held more files than usual.

**Questions**
1. What are the likely causes of the duplicate and the missing file?
2. How do you recover the data?
3. What do you change in the poller?
4. What would have caught the problems sooner?
`,
  answerTemplate: `## Causes

## Recovery

## Changes to the poller

## Earlier detection
`,
  keyPoints: [
    'Copy then delete can stop half way and leave a file that looks new.',
    'Ignoring the NextMarker hides files beyond the first page.',
    'Record processed state keyed by path, size and write time, and check it each run.',
    'Use a single rename where possible.',
    'An idempotent load by store and date on the target makes resends safe.',
    'A completeness check against the store list finds silent gaps.',
  ],
  solution: `
**1. Causes.** The duplicate: the archive copy worked, the delete timed out, and the processed record was only implied by the file being gone. The next poll saw the file in the inbound directory and sent it again. The missing file: with more than 5,000 files in the directory, the list call returned a NextMarker that the poller ignored, so files on the second page were never seen.

**2. Recovery.** Pause the poller. Compare the archive, the logs and the planning platform's receipts to find every duplicated and missing store. Tell the planning team which loads to correct. After the fix is deployed, send the missing files and resume, watching the next run closely.

**3. Changes to the poller.** Follow the NextMarker until it is empty. Write a processed record keyed by path, size and last write time once the SFTP send succeeds, and check it before sending anything. Move files with a single rename call where the API version supports it. If copy and delete stay, a failed delete leaves a file that the processed check now skips, and a cleanup step retries the delete. Keep the inbound directory small by archiving into dated folders.

**4. Earlier detection.** Before the planning load, compare the stores that sent files with the active store list and alert on gaps. Alert when a delete or move fails, instead of only logging it. Ask the planning team to load by store and business date with replace semantics, so any future resend is harmless.
`,
  followUps: [
    {
      q: 'Why was the paging bug not found in testing?',
      a: 'Test directories held a few dozen files, so every listing fit in one page. Tests should include a directory larger than one page.',
    },
    {
      q: 'Should the processed record be written before or after the SFTP send?',
      a: 'After the send succeeds. Writing it before means a failed send is recorded as done and the file is lost.',
    },
    {
      q: 'What if the SFTP send succeeds but writing the processed record fails?',
      a: 'The next run sends the file again. That is why an idempotent load on the target matters: the rare resend does no harm.',
    },
  ],
}
