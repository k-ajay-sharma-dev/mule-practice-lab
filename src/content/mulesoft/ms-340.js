export default {
  id: 'ms-340',
  category: 'mulesoft',
  title: 'Inbound Plan Files From the Planning Platform: Wait, Verify, Load and Reconcile',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'planning-platform', 'control-file', 'batch', 'reconciliation'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The planning platform writes replenishment plan parts to SFTP, then a control file. When should the flow start?',
      options: [
        'When the first part appears, so the load can start early',
        'When the control file appears and every part it lists is present',
        'At a fixed time each night, when the parts are usually there',
        'When the folder holds as many files as it did the day before',
      ],
      answer: 1,
      explain: 'Each listed part must also have the right size. The control file is the signal that the set is complete.',
    },
    {
      type: 'order',
      prompt: 'Put the steps of the inbound flow in order.',
      items: [
        'Pick up the control file and claim the set by moving it to a processing folder',
        'Check every listed part is present, with the right size and checksum',
        'Load the parts with streaming reads into staging, with rejects to a reject table',
        'Reconcile row counts per part and in total against the control file',
        'Mark the run complete so the ERP job can pick up the plan',
      ],
      explain: 'Nothing reaches the ERP until the counts match.',
    },
    {
      type: 'single',
      prompt: 'Part 3 of 6 is missing an hour after the control file arrived. What do you do?',
      options: [
        'Load the 5 parts now, then load part 3 on its own when it arrives',
        'Do not load, alert the platform team, and keep checking until a cut off',
        'Load yesterday’s part 3 in its place so the plan is whole',
        'Delete the control file, so the platform sees the gap and sends the set again',
      ],
      answer: 1,
      explain: 'The alert names the missing part. Half a plan is worse than a late plan. Stores would order from wrong numbers.',
    },
    {
      type: 'multi',
      prompt: 'Why load into staging first and not straight into the ERP tables?',
      options: [
        'A failed load can be removed by run ID without touching live data',
        'Counts can be reconciled before anything is used',
        'Rejects can be reviewed while good rows wait',
        'The ERP tables then need no unique keys, since staging removes duplicates',
        'Staging is truncated each night, so no run ID is needed to remove a failed load',
        'The ERP sees rows as they arrive, so planners can start before the file is done',
      ],
      answer: [0, 1, 2],
      explain: 'Staging keeps live data safe: a failed load is removed by run ID, counts are reconciled first, and rejects are reviewed while good rows wait. The ERP still needs its own unique keys, since a rerun or another source can still send a duplicate. A nightly truncate loses the run boundary as soon as two runs overlap or one is rerun, so keep the run ID. Staging does the opposite of showing rows early: it lets the ERP pick up the whole plan at once.',
    },
    {
      type: 'single',
      prompt: 'Staging plus rejects holds 1,999,950 rows. The control file says 2,000,000. What now?',
      options: [
        'Load it, since 50 rows in 2 million is within tolerance',
        'Mark the run failed, find the short part from per part counts, and reload',
        'Insert 50 placeholder rows so the totals match and the plan can load',
        'Update the control file count to match what was loaded',
      ],
      answer: 1,
      explain: 'Per part counts point straight at the part with the gap.',
    },
    {
      type: 'single',
      prompt: 'The platform resends the same plan an hour later with a new control file. How do you avoid a double load?',
      options: [
        'Load both, since the newer rows overwrite the older ones',
        'Key the run by plan date and version, so a newer version replaces the old',
        'Load whichever set has more rows, since it is more complete',
        'Ignore every resend, since the first plan of the day wins',
      ],
      answer: 1,
      explain: 'Take the plan date and version from the control file. A newer version replaces the older run in staging. The same version is skipped as a duplicate. Agree on the resend rule with the platform team and write it down.',
    },
  ],
  description: `
Larkfield Grocers gets replenishment plans back from the planning platform each night: up to 8 part files of 500 MB each and a control file, on SFTP. The plan is loaded into Oracle for the ERP to create store orders. Last month the flow started on the first part before the rest arrived, and stores received orders for a third of the plan.

**Questions**
1. When should the flow start, and how does it claim the set?
2. What does it check before loading?
3. How does it load and reconcile?
4. How does it handle a missing part, a short count and a resend?
`,
  answerTemplate: `## Starting and claiming

## Checks before loading

## Loading and reconciling

## Missing parts, short counts and resends
`,
  keyPoints: [
    'Trigger on the control file, not on part files.',
    'Claim the set by moving it to a processing folder.',
    'Check every part is present with the right size and checksum.',
    'Stream parts into staging with a run ID and rejects to a reject table.',
    'Reconcile counts per part and in total before the ERP sees anything.',
    'Key runs by plan date and version to handle resends.',
  ],
  solution: `
**1. Starting and claiming.** Listen for the control file only. When it arrives, move it and its parts to a processing folder named by run, so a second poll or worker does not take the same set.

**2. Checks before loading.** Read the control file. Check every listed part is present, with the size and checksum it lists, and no stray parts. If a part is missing, wait and check again until a cut off time, then alert the platform team with the missing names. Do not load a partial set.

**3. Loading and reconciling.** Read each part with a streaming CSV reader and load it with a batch job or bulk inserts into staging, with the run ID. Bad rows go to a reject table with the reason. Write job log rows per part. Then compare staging plus rejects per part and in total against the control file. Only when they match, mark the run complete so the ERP job picks it up.

**4. Missing parts, short counts and resends.** A missing part stops the run with an alert. A short count marks the run failed, the per part counts show which part, and the run is reloaded after removing its rows by run ID. A resend with a newer version replaces the older run in staging. The same version is skipped as a duplicate.
`,
  followUps: [
    {
      q: 'Where do processed files go?',
      a: 'To an archive folder or blob named by run, kept for an agreed time, for replays and audits.',
    },
    {
      q: 'How do the stores get any plan if tonight fails?',
      a: 'Agree on a fallback with the business, such as reusing yesterday’s plan, and make it a clear manual decision.',
    },
    {
      q: 'Why reconcile per part and not only in total?',
      a: 'Totals tell you something is wrong. Per part counts tell you where, which speeds up the fix.',
    },
  ],
}
