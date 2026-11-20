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
      prompt: 'Why can a delta extract on LastModified > last run time miss rows?',
      options: [
        'datetime rounds to about 3 ms, so rows near the boundary repeat',
        'A row written before the read but committed after it gets skipped',
        'The server clock and the Mule clock differ by a few seconds',
        'A datetime2 column cannot be compared with a datetime parameter',
      ],
      answer: 1,
      explain: 'A transaction that started before the run but commits after the extract read has an older time, so the next run skips it. The time is set when the row is written, not when it commits. Overlapping windows or a commit based marker fix this.',
    },
    {
      type: 'single',
      prompt: 'What does a rowversion column give you?',
      options: [
        'The date and time of the last change, at a higher precision',
        'A database wide number that rises on each insert or update of the row',
        'A per table counter of how many times each row has changed',
        'A number that also records deletes, so deleted keys can be found',
      ],
      answer: 1,
      explain: 'It makes a useful watermark. Rowversion does not show deletes, and a long open transaction can still commit a lower value after you read, so read up to MIN_ACTIVE_ROWVERSION.',
    },
    {
      type: 'single',
      prompt: 'What does Change Tracking return for a table?',
      options: [
        'Every change with old and new values of each column',
        'Keys changed since a version, with I, U or D, but no old values',
        'Keys and current values of rows inserted or updated, but no deletes',
        'Each change as a row read from the transaction log by an agent job',
      ],
      answer: 1,
      explain: 'It returns the keys of rows changed since a version, with the operation and the latest version. Change Tracking is light and synchronous. Join to the table for current values. Deleted rows come back with only their keys.',
    },
    {
      type: 'single',
      prompt: 'How does CDC differ from Change Tracking?',
      options: [
        'CDC records changes synchronously, inside the user transaction',
        'CDC reads the log with an agent job and keeps old and new values',
        'CDC keeps only the keys of changed rows, like Change Tracking',
        'CDC writes each change to a queue that Mule can listen to',
      ],
      answer: 1,
      explain: 'CDC keeps every change in change tables. CDC suits history and auditing. It costs more storage and depends on the capture job running.',
    },
    {
      type: 'multi',
      prompt: 'What must a Change Tracking based extract check each run?',
      options: [
        'That the stored version is not older than the minimum valid version',
        'That it reads the current version first, and stores it after the send',
        'That deletes are sent to the platform as deletes',
        'That the change table has been cleaned since the last run',
      ],
      answer: [0, 1, 2],
      explain: 'Compare with CHANGE_TRACKING_MIN_VALID_VERSION, and do a full reload when the stored version is older. Store the current version only after the send succeeds. Cleanup is automatic and is the risk, not a check to make. Change Tracking needs a primary key. Retention cleanup can remove old versions, so an old watermark means changes were lost.',
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
