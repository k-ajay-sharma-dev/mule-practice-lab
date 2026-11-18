export default {
  id: 'ms-294',
  category: 'mulesoft',
  title: 'Upserting Plans With MERGE in SQL Server: Duplicate Sources, HOLDLOCK and NOT MATCHED BY SOURCE',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'planning-platform', 'merge', 'upsert', 'concurrency'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'MERGE fails with an error that it tried to update the same row more than once. What is the cause?',
      options: [
        'The target table has no index',
        'The source has two or more rows with the same key, so one target row matches several source rows',
        'The connection timed out',
        'The statement has no semicolon',
      ],
      answer: 1,
      explain: 'MERGE refuses to apply two source rows to one target row. Remove duplicates from the source first, for example keep the latest version per key.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers run the same MERGE for new keys at the same time. One fails with a primary key violation. Why?',
      options: [
        'MERGE is not allowed twice',
        'Both see no match and both insert, because MERGE does not hold a range lock by default',
        'The pool is too small',
        'The source is empty',
      ],
      answer: 1,
      explain: 'A HOLDLOCK hint on the target, which means serializable for that table, keeps the check and the insert together.',
    },
    {
      type: 'single',
      prompt: 'What is the risk of WHEN NOT MATCHED BY SOURCE THEN DELETE?',
      options: [
        'None',
        'If the source holds only part of the data, for example one store or one partial file, every target row not in it is deleted',
        'It deletes the source',
        'It cannot be used with OUTPUT',
      ],
      answer: 1,
      explain: 'Only use it when the source is the complete set for the scope, and limit the delete to that scope.',
    },
    {
      type: 'multi',
      prompt: 'Which are good practices with MERGE?',
      options: [
        'End the statement with a semicolon',
        'Keep only the join columns in the ON clause and put other filters in the source or the WHEN conditions',
        'Use OUTPUT $action to count inserts and updates',
        'Put target filters in the ON clause to save time',
      ],
      answer: [0, 1, 2],
      explain: 'Filters on the target in ON change which rows count as not matched and can cause wrong inserts.',
    },
    {
      type: 'single',
      prompt: 'How do you pass 20,000 plan rows from Mule into one MERGE?',
      options: [
        'Build a SQL string with the values in it',
        'Bulk insert into a staging table, then run one MERGE from staging into the target',
        'Run 20,000 MERGE statements one at a time without batching',
        'Send a CSV file to the DBA',
      ],
      answer: 1,
      explain: 'Bulk insert is fast and parameterized. One set based MERGE from staging is far faster than many single row statements.',
    },
    {
      type: 'single',
      prompt: 'Why do some teams use UPDATE then INSERT instead of MERGE?',
      options: [
        'MERGE does not exist in SQL Server',
        'Two plain statements are clearer to read and tune, and avoid some known MERGE issues, at the cost of two passes',
        'INSERT is always faster',
        'UPDATE cannot use joins',
      ],
      answer: 1,
      explain: 'Both work. Choose one, protect it against concurrency and test it with duplicates and empty sources.',
    },
  ],
  description: `
Larkfield Grocers receives weekly replenishment plans from the planning platform. Mule loads them into a SQL Server \`PlanLine\` table keyed by store, item and week. A new plan version should update the line, a new key should insert it. The first version used a MERGE per row and took two hours. The second version, a set based MERGE, fails some nights with a duplicate row error, and once deleted all lines for stores that were not in a partial file.

**Questions**
1. How should the plan rows reach the MERGE?
2. Why does the duplicate row error appear?
3. What caused the mass delete?
4. How do you make the MERGE safe when two runs overlap?
`,
  answerTemplate: `## Getting rows to the MERGE

## Duplicate row error

## The mass delete

## Overlapping runs
`,
  keyPoints: [
    'Bulk insert into staging, then one set based MERGE.',
    'Remove duplicate keys in the source first, keeping the latest version.',
    'NOT MATCHED BY SOURCE THEN DELETE deletes everything missing from a partial source.',
    'Use HOLDLOCK on the target, or run one load at a time.',
    'Keep only join columns in ON and end with a semicolon.',
    'Use OUTPUT $action to log counts.',
  ],
  solution: `
**1. Getting rows to the MERGE.** Bulk insert the plan file into a staging table with a run id, in blocks from Mule. Then call one MERGE, or a procedure that runs it, from staging into \`PlanLine\` for that run. One set based statement replaces thousands of round trips.

**2. Duplicate row error.** The file sometimes holds two versions of the same store, item and week. Two source rows match one target row, which MERGE rejects. Remove duplicates in DataWeave or in the source query, keeping the highest plan version, and log the dropped rows.

**3. The mass delete.** The MERGE had \`WHEN NOT MATCHED BY SOURCE THEN DELETE\`. A partial file meant missing stores counted as not in the source, so their lines were deleted. Either drop that branch, or limit it to the stores and weeks the run covers, and only after the file passed its trailer checks.

**4. Overlapping runs.** Add \`WITH (HOLDLOCK)\` on the target so the match check and insert are serialized, or make the scheduler run one load at a time. Keep only join columns in the \`ON\` clause, end with a semicolon, and use \`OUTPUT $action\` to log inserted and updated counts in the job log.
`,
  followUps: [
    {
      q: 'What index does the target need?',
      a: 'A unique index on the merge key, store, item and week. It makes the match fast and stops duplicates if the logic goes wrong.',
    },
    {
      q: 'How would you update only lines whose values changed?',
      a: 'Add a condition to WHEN MATCHED that compares the columns, so unchanged rows are not rewritten and fewer log records are written.',
    },
    {
      q: 'A team replaced a plain insert with MERGE to stop unique key clashes. Why does that help?',
      a: 'A plain insert fails when the key exists. MERGE updates the existing row instead, so a resend no longer breaks the load.',
    },
  ],
}
