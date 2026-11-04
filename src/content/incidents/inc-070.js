export default {
  id: 'inc-070',
  category: 'incidents',
  title: 'Purchase Orders Created Twice After Scaling the FTP Intake App to Two Replicas',
  level: 'ADVANCED',
  tags: ['ftp', 'listener', 'cluster', 'primary-node', 'idempotency', 'duplicates', 'cloudhub'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '2026-10-13 18:00:00 INFO  [deploy] po-intake v2.3.0 deployed: replicas 1 -> 2, Runtime Cluster Mode enabled (CloudHub 2.0)', relevant: true, why: 'The duplicates start right after the app went from one to two replicas.' },
      { text: '2026-10-14 08:00:04 INFO  [replica-0] [ftp-listener] Picked up /outbound/PO_20261014_0800.csv (1,180 lines)', relevant: true, why: 'Replica 0 picks up the file...' },
      { text: '2026-10-14 08:00:04 INFO  [replica-1] [ftp-listener] Picked up /outbound/PO_20261014_0800.csv (1,180 lines)', relevant: true, why: '...and replica 1 picks up the same file in the same poll: both nodes run the listener.' },
      { text: '2026-10-14 08:00:05 INFO  [replica-0] [health] GET /api/health 200 (2 ms)', relevant: false },
      { text: '2026-10-14 08:01:37 INFO  [replica-0] [po-load] 1,180 purchase order lines inserted into SQL Server (batch 7731)', relevant: false },
      { text: '2026-10-14 08:01:39 INFO  [replica-1] [po-load] 1,180 purchase order lines inserted into SQL Server (batch 7732)', relevant: true, why: 'The second insert succeeds: nothing in the database rejects the duplicate file.' },
      { text: '2026-10-14 08:01:40 ERROR [replica-1] [po-intake] ftp:delete failed: /outbound/PO_20261014_0800.csv does not exist', relevant: true, why: 'The flow deletes the file only at the end, so the window for a second pickup is the whole processing time; the loser finds it already gone.' },
      { text: '2026-10-14 08:05:00 INFO  [replica-1] [scheduler] Token refresh for supplier portal completed', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the duplicate purchase orders?',
        options: [
          'Both replicas run the FTP listener (it is not primary-node-only) and the file is only deleted at the end of the flow, so both pick up and load the same file',
          'The ERP sends every file twice',
          'SQL Server replication duplicates the rows',
          'The FTP server is in active mode',
        ],
        answer: 0,
        explain: 'Two "Picked up" lines for the same file at the same second on two replicas, two successful inserts, then a failed delete on the slower node.',
      },
      {
        type: 'single',
        prompt: 'What is the quickest safe mitigation while the fix is prepared?',
        options: [
          'Scale back to one replica (or stop the listener on one node) and remove the duplicate batch 7732 and the other duplicate batches after confirming with purchasing',
          'Increase the polling frequency to every second',
          'Delete all purchase orders loaded since the deployment',
          'Ignore it; the suppliers will notice duplicates',
        ],
        answer: 0,
        explain: 'One running listener stops new duplicates immediately; duplicate batches are identified by file name and removed in coordination with the business (some suppliers may already have received POs).',
      },
      {
        type: 'multi',
        prompt: 'Which changes belong in the permanent fix?',
        options: [
          'Set primaryNodeOnly="true" on the FTP listener so only the cluster primary polls',
          'Use a listener post-action (moveToDirectory to /archive) instead of a manual delete at the end, and a separate /error directory for failures',
          'Make the load idempotent: unique constraint on the source file name (or PO number + line) so a repeat load is rejected',
          'Give the two replicas different polling frequencies',
          'Add lock="true" to the listener so the FTP server prevents concurrent reads',
        ],
        answer: [0, 1, 2],
        explain: 'Run one poller, mark files as processed with a post-action, and keep an idempotency guard in the database. Staggered polling only makes duplicates rarer, and FTP servers do not offer reliable locking.',
      },
      {
        type: 'match',
        prompt: 'Match each safeguard to the failure it prevents.',
        pairs: [
          ['primaryNodeOnly="true"', 'Two nodes polling the same directory'],
          ['moveToDirectory post-action', 'The same file being picked up again on the next poll'],
          ['Unique constraint on file name in a load-control table', 'A file reprocessed for any other reason (replay, manual re-drop)'],
        ],
        explain: 'Defence in depth: each layer covers a different way the same file can be processed twice.',
      },
    ],
  },
  description: `
## Symptoms
- Since Tuesday 14 October, purchasing reports **duplicate purchase orders** in the procurement system (SQL Server). About 40% of files were loaded twice; some suppliers received the same PO twice.
- The \`po-intake\` app also logs occasional errors from \`ftp:delete\`.

## Change / Context
- The ERP drops purchase order files every 15 minutes into \`/outbound\` on an internal **FTP** server.
- On Monday evening \`po-intake\` was scaled from **1 to 2 replicas** on CloudHub 2.0 with Runtime Cluster Mode enabled, "for high availability".
- The listener has no post-action and no watermark; the flow inserts the lines and then deletes the file with \`ftp:delete\` as its last step. The listener configuration was copied from a template and contains \`primaryNodeOnly="false"\`.

## Logs
\`\`\`
08:00:04 INFO  [replica-0] [ftp-listener] Picked up /outbound/PO_20261014_0800.csv (1,180 lines)
08:00:04 INFO  [replica-1] [ftp-listener] Picked up /outbound/PO_20261014_0800.csv (1,180 lines)
08:01:37 INFO  [replica-0] [po-load] 1,180 purchase order lines inserted (batch 7731)
08:01:39 INFO  [replica-1] [po-load] 1,180 purchase order lines inserted (batch 7732)
08:01:40 ERROR [replica-1] [po-intake] ftp:delete failed: /outbound/PO_20261014_0800.csv does not exist
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
    'Both replicas run the FTP listener and poll the same directory; the file is deleted only at the end of the flow, so both nodes pick it up.',
    'In a cluster, file/FTP/SFTP listeners must run with primaryNodeOnly="true".',
    'Use listener post-actions (moveToDirectory / autoDelete) and an /error directory instead of a manual delete as the last step.',
    'Add an idempotency guard in the target (unique file name or business key) so any repeat load is rejected.',
    'Immediate: back to one active poller, identify duplicate batches by file name, clean up with the business.',
  ],
  solution: `
**Diagnosis.** After scaling to two replicas, both run the FTP listener. At 08:00:04 both picked up the same file; both loaded it (batches 7731 and 7732); the slower one then failed to delete a file that was already gone. Nothing in the database prevents a second load.

**Immediate mitigation.**
- Scale back to one replica (or deploy with the listener disabled on one node) to stop new duplicates.
- Find duplicate batches: same source file name loaded twice since Monday 18:00; with purchasing, cancel the duplicate POs and inform affected suppliers.

**Root cause.** A polling file listener was scaled horizontally without running it on the primary node only, combined with a "delete at the end" pattern that leaves the file visible for the whole processing time and no idempotency in the load.

**Permanent fix.**
\`\`\`xml
<ftp:listener config-ref="erpFtp" directory="/outbound" primaryNodeOnly="true"
              moveToDirectory="/archive" applyPostActionWhenFailed="false">
  <scheduling-strategy><fixed-frequency frequency="60" timeUnit="SECONDS"/></scheduling-strategy>
  <ftp:matcher filenamePattern="PO_*.csv"/>
</ftp:listener>
\`\`\`
- Error handler moves failed files to \`/error\` and alerts.
- Load-control table with a **unique constraint on the file name**: insert it first in the same transaction as the lines, so a repeated file fails with error 2627 and is logged as a duplicate instead of loaded.

**Prevention.** Review checklist for scaling: "does this app have polling sources (file, FTP, SFTP, scheduler)?"; template listener configuration with \`primaryNodeOnly="true"\`; a test that drops the same file twice and expects one load.
`,
  followUps: [
    { q: 'If the replicas were not in cluster mode, would primaryNodeOnly help?', a: 'No. Without a cluster there is no primary node; each replica is independent and polls. Then run the listener in a single-replica app, or have each replica claim a file by moving it to a processing folder first (only one move succeeds).' },
    { q: 'Why not only rely on the unique constraint?', a: 'It prevents duplicate data, but both nodes still read and transform every file and one always fails, creating noise and load. Fix the polling and keep the constraint as a safety net.' },
    { q: 'Does the post-action shorten the double-pickup window?', a: 'Post-actions run after the flow, so on their own they do not stop two nodes reading the same new file; that is what primaryNodeOnly is for. The post-action stops the same node re-reading the file on later polls.' },
  ],
}
