export default {
  id: 'inc-083',
  category: 'incidents',
  title: 'Carrier Manifest Rerun Fails With FILE:FILE_ALREADY_EXISTS and FILE:FILE_LOCK',
  level: 'INTERMEDIATE',
  tags: ['file', 'connectors', 'locks', 'error-handling', 'idempotency', 'logistics'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-10-28 22:00:03 INFO  [manifest-job] Run started for 2026-10-28, 4 carriers', relevant: false },
      { text: '2026-10-28 22:04:18 INFO  [manifest-job] Wrote /outbound/manifest-DHX-2026-10-28.csv mode=CREATE_NEW (18,204 lines)', relevant: true, why: 'The first run created this file. The mode means a later write to the same name will fail, and the name is fixed by date.' },
      { text: '2026-10-28 22:06:51 ERROR [manifest-job] DB:CONNECTIVITY Lost connection while reading carrier UPX; run aborted', relevant: true, why: 'The run stopped part-way, so some outputs exist and some do not. This is why a rerun collides.' },
      { text: '2026-10-28 22:30:00 INFO  [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-28 23:10:02 INFO  [manifest-job] Run started for 2026-10-28 (manual rerun), 4 carriers', relevant: false },
      { text: '2026-10-28 23:14:09 ERROR [manifest-job] FILE:FILE_ALREADY_EXISTS Cannot write /outbound/manifest-DHX-2026-10-28.csv', relevant: true, why: 'CREATE_NEW did what it is meant to do: the file is already there, so the write fails.' },
      { text: '2026-10-28 23:20:44 ERROR [manifest-archive] FILE:FILE_ALREADY_EXISTS Cannot copy to /archive/manifest-DHX-2026-10-28.csv', relevant: true, why: 'file:copy has Overwrite false by default, and the archive already has that name from the first run.' },
      { text: '2026-10-28 23:22:15 ERROR [manifest-send] FILE:FILE_LOCK Could not lock /outbound/manifest-FDL-2026-10-28.csv', relevant: true, why: 'The read has lock=true and another party holds the lock. This is a separate cause from the name collision.' },
      { text: '2026-10-28 23:22:16 INFO  [carrier-agent] Uploading manifest-FDL-2026-10-28.csv to carrier gateway (holding file)', relevant: true, why: 'This identifies the lock holder: the carrier upload agent has the file open.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the rerun fail on the write?',
        options: [
          'file:write in CREATE_NEW mode raises FILE:FILE_ALREADY_EXISTS, because the first run left a file with the same name',
          'The disk is full',
          'FILE:FILE_ALREADY_EXISTS means another process has locked the file',
          'CREATE_NEW needs Create Parent Directories to be false',
        ],
        answer: 0,
        explain: 'The file name depends only on the date, so a rerun always targets the same path. CREATE_NEW exists to fail in exactly this case.',
      },
      {
        type: 'single',
        prompt: 'What is the most likely cause of the FILE:FILE_LOCK error?',
        options: [
          'file:read has lock=true, and the carrier agent already holds a lock on the file',
          'file:write cannot lock a file, so the error is from the write',
          'Overwrite is false on the read',
          'The file was removed by the archive copy',
        ],
        answer: 0,
        explain: 'FILE:FILE_LOCK is listed for read only. If another party holds the lock, the connector cannot take it. The agent log shows who has the file.',
      },
      {
        type: 'single',
        prompt: 'An engineer proposes changing every write to OVERWRITE and every move to `overwrite="true"` so that the rerun works tonight. What is the concern?',
        options: [
          'A manifest may already have gone to the carrier. Replacing it blindly can hide a different version of what was sent',
          'OVERWRITE is not a valid write mode',
          'Overwrite only works on SFTP',
          'It would raise FILE:FILE_LOCK on every file',
        ],
        answer: 0,
        explain: 'CREATE_NEW was protecting something. First find out which outputs were complete and sent, and then decide per file.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Write to a temporary name and rename it only when the file is complete',
          'Give the job a run record, so a rerun skips carriers already finished',
          'Add a run id or timestamp to archive names, so a copy does not collide',
          'Handle FILE:FILE_LOCK by trying that file again later, while continuing with others',
          'Delete /outbound before every run',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Make reruns safe by design, and treat a lock as a temporary state. Deleting the folder could destroy files the carrier agent has not yet collected.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery tonight.',
        items: [
          'List which carrier manifests exist, and which were sent, from the run logs and the agent',
          'Check that each existing file is complete, using the expected line count',
          'Generate only the missing manifests',
          'Retry the send for the locked file once the agent has released it',
          'Confirm with each carrier that its manifest arrived before the cut-off',
        ],
        explain: 'Decide file by file. The carrier cut-off drives the order, but sending the wrong manifest is worse than a short delay.',
      },
    ],
  },
  description: `
## Symptoms
- The nightly carrier manifest job aborted at 22:06 after a database error. Its manual rerun at 23:10 also failed.
- Only two of four carriers have a manifest file. The carrier cut-off is **01:00**.
- The rerun reports \`FILE:FILE_ALREADY_EXISTS\`, and a separate send flow reports \`FILE:FILE_LOCK\`.

## Change / Context
- \`manifest-job\` writes \`/outbound/manifest-<carrier>-<date>.csv\` with \`file:write mode="CREATE_NEW"\`, so a sent manifest can never be replaced by accident.
- \`manifest-archive\` copies outputs to \`/archive\` with \`file:copy\`, using default settings.
- \`manifest-send\` reads each file with \`lock="true"\`. A separate carrier upload agent also works on files in \`/outbound\`.

## Logs
\`\`\`
22:04:18 INFO  [manifest-job] Wrote /outbound/manifest-DHX-2026-10-28.csv mode=CREATE_NEW (18,204 lines)
22:06:51 ERROR [manifest-job] DB:CONNECTIVITY Lost connection while reading carrier UPX; run aborted
23:14:09 ERROR [manifest-job] FILE:FILE_ALREADY_EXISTS Cannot write /outbound/manifest-DHX-2026-10-28.csv
23:20:44 ERROR [manifest-archive] FILE:FILE_ALREADY_EXISTS Cannot copy to /archive/manifest-DHX-2026-10-28.csv
23:22:15 ERROR [manifest-send] FILE:FILE_LOCK Could not lock /outbound/manifest-FDL-2026-10-28.csv
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'file:write with CREATE_NEW fails if the file already exists, with FILE:FILE_ALREADY_EXISTS.',
    'file:copy, file:move and file:rename default Overwrite to false and raise the same error on an existing target.',
    'FILE:FILE_LOCK is listed for read only. It occurs when another party holds the lock.',
    'The job is not safe to rerun: it stops part-way, and its file names depend only on the date.',
    'Do not switch everything to overwrite. Check what was already sent, and decide per file.',
    'Fix: temporary names with a rename on completion, a run record, unique archive names, and retry on lock.',
  ],
  solution: `
**Diagnosis.** There are two separate problems.
- **Name collisions:** the first run left complete or partial outputs. The rerun used the same date-based names, so \`file:write\` in **CREATE_NEW** mode failed with \`FILE:FILE_ALREADY_EXISTS\`. \`file:copy\` failed the same way because its **Overwrite** defaults to false.
- **Lock:** \`manifest-send\` reads with \`lock="true"\`. The carrier agent had the file, so the connector could not take the lock and raised \`FILE:FILE_LOCK\`. Lock behaviour depends on the host file system, so confirm it on this mount.

**Immediate mitigation.**
- List what exists and what was sent, and check each file against its expected line count.
- Generate only the missing manifests, by carrier.
- Move any partial file aside, rather than overwriting blindly. A complete file that has been sent must stay as it is.
- Retry the locked file once the agent has released it.
- Confirm arrival with each carrier before 01:00.

**Root cause.** The job was not designed for a rerun. It stops part-way, keeps no record of progress, and uses names that depend only on the date. CREATE_NEW was doing its job.

**Permanent fix.**
- Write to a temporary name, then use \`file:rename\` when the file is complete, so a partial file never carries the final name. The new name must not contain a path separator.
- Keep a run record by carrier, so a rerun only does what is outstanding.
- Add a run id or timestamp to archive names, or set \`overwrite="true"\` on the copy only where replacing the archive copy is intended.
- Catch \`FILE:FILE_LOCK\`, retry that file later, and continue with the others. Agree with the agent's owner who works on files when, for example by giving the agent its own folder.

**Prevention.** Test a rerun after a failure part-way through. Alert on the carrier cut-off. Check the expected output count at the end of each run.
`,
  followUps: [
    { q: 'When is the read lock released?', a: 'When the flow that took it ends or the content has been fully read. A flow that keeps a stream open keeps the lock too.' },
    { q: 'Why not drop the lock altogether?', a: 'Then the send could read a file while the agent is working on it. Keep it if the mount supports it, or separate the folders so the two never touch the same file.' },
    { q: 'Could APPEND have been used instead?', a: 'No. A rerun would add a second copy of the rows to the existing file, which is worse than a clear error.' },
  ],
}
