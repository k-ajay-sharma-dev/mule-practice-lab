export default {
  id: 'ms-330',
  category: 'mulesoft',
  title: 'Designing a Restartable Large Load: Run IDs, Block Checkpoints and Reconciliation',
  level: 'EXPERT',
  tags: ['myproject', 'batch', 'checkpoint', 'staging', 'reconciliation', 'oracle'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Why tag every staging row and reject row with a run ID?',
      options: [
        'So rows can be sorted in the order the runs arrived',
        'So one run can be counted, checked, cleaned up or reloaded on its own',
        'Oracle needs a run column to partition a staging table',
        'So the staging table can do without a primary key',
      ],
      answer: 1,
      explain: 'Other runs are not touched. A DELETE by run ID undoes a bad run in one statement.',
    },
    {
      type: 'single',
      prompt: 'Each block commits in its own transaction. What does a block checkpoint row record?',
      options: [
        'The full block data, so the block can be reloaded from it',
        'Run ID, block number, line range, status and row count',
        'Only the time the block started, to measure its speed',
        'The first and last record payloads of the block',
      ],
      answer: 1,
      explain: 'A restart reads these rows to decide which blocks to run again.',
    },
    {
      type: 'single',
      prompt: 'The runtime crashed. The last checkpoint row for block 7 says STARTED. Why is that the risky case?',
      options: [
        'It is not risky, since STARTED means no rows were written',
        'The commit may have ended before the crash but before COMMITTED was written',
        'The block is lost, since its records were held only in memory',
        'STARTED means Oracle rolled the block back, so a rerun is safe',
      ],
      answer: 1,
      explain: 'So rows of the block may exist. Delete the rows of that block by run ID and line range before running it again, or write the checkpoint in the same transaction.',
    },
    {
      type: 'single',
      prompt: 'How can the checkpoint and the rows never disagree?',
      options: [
        'Write the checkpoint to a separate system, such as an object store',
        'Write the checkpoint row in the same transaction as the block rows',
        'Write the checkpoint before the block, then update it after',
        'Write the checkpoint to a log file that the restart reads',
      ],
      answer: 1,
      explain: 'Then COMMITTED and the rows commit together, or neither does.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of a restart in order.',
      items: [
        'Read the checkpoint rows for the run',
        'Work out which blocks are done and which need a rerun',
        'Delete rows of blocks that may be half done',
        'Rerun the blocks from the same file',
        'Reconcile counts against the file and update the job log',
      ],
      explain: 'Reconciliation at the end proves the restart did not lose or double rows.',
    },
    {
      type: 'multi',
      prompt: 'What does the final reconciliation compare?',
      options: [
        'Rows in the file against staging rows plus reject rows for the run',
        'Sums of key amounts, such as quantity, between file and staging',
        'Distinct business keys, to catch duplicates',
        'The file name against the file name of the last run',
      ],
      answer: [0, 1, 2],
      explain: 'Counts catch lost rows, sums catch changed values, and distinct keys catch doubles.',
    },
  ],
  description: `
Larkfield Grocers loads a 6 million row inventory file each night into Oracle staging. The batch job takes 90 minutes. Last month the runtime crashed at minute 70. The team reloaded the whole file, missed the cut off for the stores, and found duplicate rows in staging the next day.

**Questions**
1. How do run IDs help a large load?
2. Design block checkpoints that let a run resume.
3. Which crash case is risky, and how do you handle it?
4. How do you prove the result is right?
`,
  answerTemplate: `## Run IDs

## Block checkpoints

## The risky case

## Proving the result
`,
  keyPoints: [
    'Every staging and reject row carries the run ID.',
    'A checkpoint row per block records range, status and count.',
    'Resume reruns only blocks that are not done.',
    'STARTED blocks may have committed rows, so delete them first.',
    'A checkpoint in the same transaction as the rows removes the gap.',
    'Reconcile counts, sums and distinct keys at the end.',
  ],
  solution: `
**1. Run IDs.** A run ID on every staging and reject row lets you count a run, delete it, or compare it with the file. Downstream jobs pick up only complete runs.

**2. Block checkpoints.** Split the file into numbered blocks of a fixed size. For each block write a checkpoint row: run ID, block number, line range, status and row count. Commit each block in its own transaction. On restart, read the checkpoints and rerun only blocks that are missing, FAILED, STARTED or have the wrong count. The file and block size must stay the same.

**3. The risky case.** A block whose last checkpoint is STARTED may have committed before the crash. Delete its rows by run ID and line range before rerunning it. Writing the checkpoint in the same transaction as the rows removes this case. MERGE on a business key also makes a second write harmless.

**4. Proving the result.** Compare the file row count with staging plus rejects for the run, compare sums of key amounts, and count distinct business keys to catch duplicates. Write the result to the job log and mark the run complete only when it matches.
`,
  followUps: [
    {
      q: 'Why not one transaction for the whole file?',
      a: 'It holds locks and undo for 90 minutes, and a crash at minute 70 rolls everything back.',
    },
    {
      q: 'Where does the restart get the same file?',
      a: 'From an archive folder or blob kept for the run. Never from the source folder, where a newer file may have arrived.',
    },
    {
      q: 'How do downstream jobs avoid reading a half loaded run?',
      a: 'They read only runs whose job log status is complete, or the load swaps a view to the new run at the end.',
    },
  ],
}
