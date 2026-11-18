export default {
  id: 'ms-353',
  category: 'mulesoft',
  title: 'Empty Strings and NULL in Oracle: Why Duplicate Checks and Mappings Go Wrong',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'null', 'duplicate-check', 'staging', 'sql'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'Mule inserts "" into a VARCHAR2 column in Oracle. What is stored?',
      options: ['An empty string', 'NULL', 'A single space', 'An error is raised'],
      answer: 1,
      explain: 'Oracle treats a zero length string in VARCHAR2 as NULL. SQL Server keeps it as an empty string.',
    },
    {
      type: 'single',
      prompt: 'The duplicate check runs WHERE sender_doc_id = :docId. The sender sends an empty doc ID. What does the query find?',
      options: [
        'Every row with an empty doc ID',
        'Nothing, because the parameter becomes NULL and NULL = NULL is not true',
        'An error',
        'The latest row',
      ],
      answer: 1,
      explain: 'So the check says "not a duplicate" every time, and the same document can load again and again.',
    },
    {
      type: 'single',
      prompt: 'What is the right fix for that duplicate check?',
      options: [
        'Use NVL on both sides to turn NULL into a dummy value',
        'Reject messages without a doc ID before the check, since an empty key cannot identify a document',
        'Compare with LIKE',
        'Remove the check',
      ],
      answer: 1,
      explain: 'A dummy value would make every empty message a duplicate of the first one, which is wrong too.',
    },
    {
      type: 'single',
      prompt: 'A query uses WHERE item_id NOT IN (SELECT item_id FROM staged_items). One staged row has NULL item_id. What happens?',
      options: [
        'It works as expected',
        'It returns no rows at all, because a comparison with NULL is unknown',
        'It returns every row',
        'It raises ORA-01400',
      ],
      answer: 1,
      explain: 'Use NOT EXISTS, or filter NULLs in the subquery.',
    },
    {
      type: 'multi',
      prompt: 'Which DataWeave habits help when the target is Oracle?',
      options: [
        'Turn empty or blank strings into null before mapping, so Mule and Oracle agree',
        'Check required fields for null in Mule and send failures to the reject table with a reason',
        'Use default to give a code map a fallback for null codes',
        'Send "" for every missing value',
      ],
      answer: [0, 1, 2],
      explain: 'Sending "" does not help: Oracle stores NULL anyway, and Mule logic may still treat it as a value.',
    },
    {
      type: 'single',
      prompt: 'ORA-01400 appears during a bulk insert. What does it say?',
      options: [
        'Value too large',
        'Cannot insert NULL into a NOT NULL column, which can come from an empty string the sender thought was a value',
        'Unique key clash',
        'Table not found',
      ],
      answer: 1,
      explain: 'The error names the column. Look at the empty strings in the source for it.',
    },
  ],
  description: `
Marrow & Pine Home's product data hub checks each incoming document against Oracle for duplicates, then loads staging tables. Some suppliers send \`""\` for fields they do not have. Support found the same item document loaded four times, a report that returned no rows for no clear reason, and ORA-01400 errors in a bulk insert.

**Questions**
1. How does Oracle store an empty string?
2. Why did the duplicate check let the same document in four times?
3. Why did the report return no rows?
4. What should the mapping and checks do before Oracle sees the data?
`,
  answerTemplate: `## Empty strings in Oracle

## The duplicate check

## The empty report

## Before Oracle sees the data
`,
  keyPoints: [
    'Oracle stores an empty VARCHAR2 string as NULL.',
    'NULL = NULL is not true, so equality checks miss.',
    'Reject messages with no business key before the duplicate check.',
    'NOT IN with a NULL in the list returns nothing.',
    'ORA-01400 can come from empty strings on NOT NULL columns.',
    'Turn blanks into null in DataWeave and check required fields.',
  ],
  solution: `
**1. Empty strings.** In Oracle, a zero length string in a VARCHAR2 column is NULL. Inserting \`""\` stores NULL.

**2. The duplicate check.** The empty doc ID was bound as NULL. \`sender_doc_id = NULL\` is never true, so the lookup found nothing and the document was treated as new each time. A message without a doc ID cannot be checked, so reject it with a reason.

**3. The empty report.** \`NOT IN\` against a list that holds a NULL returns no rows, because each comparison is unknown. Use \`NOT EXISTS\` or filter NULLs out of the subquery.

**4. Before Oracle.** In DataWeave, trim strings and turn blanks into null, so Mule sees what Oracle will store. Check required fields and send failures to the reject table. Give code map lookups a default. ORA-01400 then turns into a clear reject reason instead of a failed block.
`,
  followUps: [
    {
      q: 'Does this also apply to CHAR columns?',
      a: 'An empty string inserted into CHAR becomes NULL as well. Values that are present are padded with spaces, which affects comparisons.',
    },
    {
      q: 'How do you write a duplicate check that treats two NULLs as equal, if the business wants that?',
      a: 'Compare with DECODE(a, b, 1, 0) = 1, which treats two NULLs as a match, but agree first that empty keys should match at all.',
    },
    {
      q: 'Why does the same flow behave differently against SQL Server?',
      a: 'SQL Server keeps an empty string as a value distinct from NULL, so checks that miss in Oracle match there.',
    },
  ],
}
