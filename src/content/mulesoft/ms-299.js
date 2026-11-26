export default {
  id: 'ms-299',
  category: 'mulesoft',
  title: 'Delta Extracts From SQL Server for the Planning Platform: Watermarks, Rowversion, Change Tracking and CDC',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'planning-platform', 'delta', 'change-tracking', 'cdc', 'watermark'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The database runs read committed snapshot. At 02:00 an extract reads LastModified > 01:00, then stores 02:00 as the watermark. A store transaction set LastModified to 01:59:58 on a row and committed at 02:00:05. What happens to that row?',
      options: [
        'It is picked up by the next run, since it committed after 02:00',
        'The extract waited for the commit, so it read the row at 02:00:05',
        'It is never extracted, since the next run looks only after 02:00',
        'It is extracted twice, since datetime rounding puts it on both sides',
      ],
      answer: 2,
      explain: 'The time is set when the row is written, not when it commits. At 02:00 the change was not committed, so the extract read the old version without waiting, and the next run looks only for times after 02:00. Under read committed snapshot readers do not wait for writers. Overlapping windows or a commit based marker fix this.',
    },
    {
      type: 'single',
      prompt: 'Under read committed snapshot, an extract reads rows with rowversion above the last watermark and stores the highest value it read, 5010. A long transaction gave its row rowversion 5000 and commits after that read. What goes wrong, and what fixes it?',
      options: [
        'Nothing, since a rowversion is given at commit, so the row gets a value above 5010',
        'The row with 5000 is skipped, so read only below MIN_ACTIVE_ROWVERSION and store that',
        'The row with 5000 is skipped, so store the highest value plus one to cover it',
        'Nothing, since reading a rowversion column waits for open transactions on the table',
      ],
      answer: 1,
      explain: 'A rowversion is set when the row is written, so a long open transaction can still commit a lower value after you read. The next run looks above 5010 and never sees it. MIN_ACTIVE_ROWVERSION is the lowest value still in use by an open transaction, so reading below it is safe. Adding one to the high value moves the watermark further away from the missed row. Rowversion does not show deletes either.',
    },
    {
      type: 'single',
      prompt: 'The planning platform needs the old and the new quantity of each changed plan line, and deletes too. The DBA offers Change Tracking. Is it enough?',
      options: [
        'Yes, CHANGETABLE returns the old and new value of each changed column',
        'No, it reports inserts and updates, but it cannot report deletes',
        'Yes, as long as the agent job that reads the log keeps the column history',
        'No, it gives changed keys with I, U or D but no old values, so use CDC',
      ],
      answer: 3,
      explain: 'Change Tracking returns the keys of rows changed since a version, with the operation and the latest version. Join to the table for current values. Deleted rows come back with only their keys. It is light and synchronous and keeps no old values. CDC reads the log with an agent job and keeps old and new values in change tables.',
    },
    {
      type: 'single',
      prompt: 'The DBA turns on CDC for PlanLine, but SQL Server Agent is stopped on that server for a week. What happens to the changes in that week?',
      options: [
        'They stay in the log and reach the change tables only when the capture job runs, so the log grows',
        'They are written to the change tables inside each user transaction, so nothing is held back',
        'Only their keys are kept, as in Change Tracking, until the capture job starts again',
        'They are lost, since CDC needs the capture job running at the moment each change commits',
      ],
      answer: 0,
      explain: 'CDC is asynchronous: an agent job reads changes from the transaction log into change tables. While the job is stopped, the log cannot be truncated past changes not yet captured, so it grows, and the changes appear once the job runs again. CDC never writes inside the user transaction, and it keeps full rows, not keys only. It suits history and auditing, and depends on the capture job running.',
    },
    {
      type: 'multi',
      prompt: 'What must a Change Tracking based extract check each run?',
      options: [
        'That the stored version is not older than the minimum valid version',
        'That it reads the current version first, and stores it after the send',
        'That deletes are sent to the platform as deletes',
        'That the table has a rowversion column to compare with the watermark',
        'That the SQL Server Agent capture job for the table is running',
      ],
      answer: [0, 1, 2],
      explain: 'Compare with CHANGE_TRACKING_MIN_VALID_VERSION, and do a full reload when the stored version is older. Retention cleanup can remove old versions, so an old watermark means changes were lost. Store the current version only after the send succeeds. Deletes must reach the platform, or deleted rows live on there. Change Tracking needs a primary key, not a rowversion column. The Agent capture job belongs to CDC. Change Tracking needs no Agent job.',
    },
    {
      type: 'single',
      prompt: 'The send to the planning platform fails after the extract ran. What happens to the watermark?',
      options: [
        'Move it forward, and resend the failed changes from the logs',
        'Keep the old value, so the next run extracts the same changes',
        'Reset it to zero, so the next run does a full reload',
        'Move it forward, and the next run picks up only later changes',
      ],
      answer: 1,
      explain: 'Keep the old value and make the platform load idempotent. Move the watermark only after the target confirms. Sending a change twice is safe when loads are upserts.',
    },
  ],
  description: `
Brindle Outdoor sends item, location and on hand stock changes from SQL Server to the planning platform every hour. Today the extract uses \`LastModified > @lastRun\`. The platform team found items whose changes never arrived, deleted items that are still active in the platform, and once a full day was missing after the job was paused for a week.

**Questions**
1. Why does the time based delta miss changes?
2. What options does SQL Server offer for deltas?
3. How do you handle deletes?
4. How do you store and move the watermark safely?
5. What happens after a long pause?
`,
  answerTemplate: `## Why changes are missed

## Delta options

## Deletes

## The watermark

## After a long pause
`,
  keyPoints: [
    'Time based deltas miss late commits and never see deletes.',
    'Rowversion gives a reliable increasing marker, but no deletes.',
    'Change Tracking gives changed keys with I, U or D, light and synchronous.',
    'CDC gives full change history from the log with an agent job.',
    'Read the current version first, store it only after the send succeeds.',
    'Check the minimum valid version and fall back to a full reload.',
  ],
  solution: `
**1. Why changes are missed.** \`LastModified\` is set when the row is written. A transaction that writes at 10:59 and commits at 11:01 is not visible to an 11:00 extract, and the next run looks only after 11:00, so the change is lost. Deletes leave no row to find, so they are never sent.

**2. Delta options.** A rowversion column gives a database wide counter per change, and reading up to \`MIN_ACTIVE_ROWVERSION()\` avoids the late commit gap. Change Tracking records the keys of changed rows with the operation and a version, and the extract joins back for current values. CDC reads the log and keeps full before and after values in change tables, at a higher cost. For a planning feed that needs current state, Change Tracking is often enough.

**3. Deletes.** Change Tracking returns deleted keys with operation D. Map them to the platform's delete or deactivate format. A soft delete flag in the source also works with a time or rowversion delta.

**4. The watermark.** Read \`CHANGE_TRACKING_CURRENT_VERSION()\` first, then read changes since the stored version, ideally in a snapshot transaction. Send to the platform. Only after the platform confirms, store the new version in a watermark table. A failed run keeps the old value and sends the same changes again, which upserts on the platform side handle.

**5. After a long pause.** Retention cleanup removes old change records. If the stored version is below \`CHANGE_TRACKING_MIN_VALID_VERSION\`, the delta is no longer complete. Run a full extract, then continue with deltas from the version read before it.
`,
  followUps: [
    {
      q: 'Why read changes in a snapshot transaction?',
      a: 'So the current version and the change rows are consistent with each other. Microsoft recommends snapshot isolation for Change Tracking reads.',
    },
    {
      q: 'Where would you keep the watermark?',
      a: 'In a small table in the database, or in a persistent Object Store, with the feed name, the value and when it was stored.',
    },
    {
      q: 'How would you replay a day for the platform?',
      a: 'Set the watermark back to a stored value from that day, if it is still above the minimum valid version, or run a full extract.',
    },
  ],
}
