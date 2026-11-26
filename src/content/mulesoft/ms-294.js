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
        'The target has two rows with the same key, so one source row matches both',
        'The source has two rows with the same key, matching one target row',
        'A trigger on the target updated the row again after the MERGE',
        'The ON clause joins on a column that has no unique index',
      ],
      answer: 1,
      explain: 'MERGE refuses to apply two source rows to one target row. Remove duplicates from the source first, for example keep the latest version per key.',
    },
    {
      type: 'single',
      prompt: 'Two Mule workers run the same MERGE for new keys at the same time. One fails with a primary key violation. Why?',
      options: [
        'MERGE takes a table lock, and the second worker times out on it',
        'Both see no match and insert, since MERGE holds no range lock by default',
        'The two workers share one pooled connection, which mixes the statements',
        'MERGE retries the insert on a deadlock and inserts the row twice',
      ],
      answer: 1,
      explain: 'A HOLDLOCK hint on the target, which means serializable for that table, keeps the check and the insert together.',
    },
    {
      type: 'single',
      prompt: 'A nightly MERGE syncs PlanLine from a staging table and has WHEN NOT MATCHED BY SOURCE THEN DELETE. Tonight staging holds only store 12, because the files of the other stores were late. What happens?',
      options: [
        'Nothing is deleted for other stores, since the delete covers only stores in the source',
        'Every PlanLine row of the other stores is deleted, since none of them is in the source',
        'Staging rows of store 12 that have no match in PlanLine are deleted from staging',
        'The MERGE fails, since a source with far fewer rows than the target is rejected',
      ],
      answer: 1,
      explain: 'NOT MATCHED BY SOURCE means target rows with no matching source row, and MERGE does not know that the source covers only one store. So every target row outside store 12 is deleted. Only use it when the source is the complete set for the scope, and limit the delete to that scope, for example with AND t.StoreId IN the source stores. It never deletes source rows, and MERGE has no row count check.',
    },
    {
      type: 'multi',
      prompt: 'A review of a MERGE for store 12 finds no semicolon at the end, ON t.PlanKey = s.PlanKey AND t.StoreId = 12, and no counts in the log. Which changes are right?',
      options: [
        'Keep t.StoreId = 12 in ON, since it makes fewer target rows take part',
        'End the MERGE with a semicolon, which the statement requires',
        'Move t.StoreId = 12 out of ON, and filter the source or a target CTE instead',
        'Add WITH (NOLOCK) on the target, so the MERGE does not block readers',
        'Add OUTPUT $action to count inserts, updates and deletes',
      ],
      answer: [1, 2, 4],
      explain: 'MERGE must end with a semicolon. Filters on the target in ON change which rows count as not matched and can cause wrong inserts or deletes, so filter the source or a CTE over the target instead. OUTPUT $action tells you what each row did. NOLOCK is not allowed on the target of a MERGE.',
    },
    {
      type: 'single',
      prompt: 'How do you pass 20,000 plan rows from Mule into one MERGE?',
      options: [
        'Build one SQL string with all 20,000 rows in a VALUES list',
        'Bulk insert into a staging table, then one MERGE from staging',
        'Run a single row MERGE 20,000 times in a For Each loop',
        'Pass the list of maps as one parameter, which the driver turns into rows',
      ],
      answer: 1,
      explain: 'Bulk insert is fast and parameterized. One set based MERGE from staging is far faster than many single row statements.',
    },
    {
      type: 'single',
      prompt: 'Why do some teams use UPDATE then INSERT instead of MERGE?',
      options: [
        'MERGE plans are compiled again on each run, while plain statements reuse theirs',
        'Two plain statements are clearer to tune and avoid known MERGE issues',
        'UPDATE then INSERT takes fewer locks, so it needs no hints under concurrency',
        'MERGE scans the whole target, while UPDATE then INSERT can seek on the key',
      ],
      answer: 1,
      explain: 'Separate statements are clearer to read and tune, and they avoid the known MERGE bugs. The cost is two passes over the data. MERGE plans are cached like other plans, and MERGE can seek on an indexed key. Both forms need protection against concurrency, such as HOLDLOCK or a unique key with a retry. Both work. Choose one, protect it against concurrency and test it with duplicates and empty sources.',
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
