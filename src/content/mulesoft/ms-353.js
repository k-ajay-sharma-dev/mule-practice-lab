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
      prompt: 'A supplier sends middle_name as "". The flow inserts it into a nullable VARCHAR2 column. A report then counts rows WHERE middle_name = \'\'. What does it find?',
      options: [
        'Each row where the supplier sent "", since Oracle keeps the empty string',
        'Each row with an empty or NULL name, since the two are the same in Oracle',
        'Zero rows, since Oracle stored NULL and a comparison with \'\' is never true',
        'An ORA-01400 error, since the column cannot take an empty value on insert',
      ],
      answer: 2,
      explain: 'Oracle treats a zero length string in VARCHAR2 as NULL, both when it stores it and in the WHERE clause. So the test becomes a comparison with NULL, which is unknown, and no row matches. Use IS NULL instead. SQL Server keeps "" as an empty string, which is why the first option feels right. ORA-01400 comes only from NOT NULL columns.',
    },
    {
      type: 'single',
      prompt: 'The duplicate check runs WHERE sender_doc_id = :docId. The sender sends an empty doc ID. What does the query find?',
      options: [
        'Every earlier row that was sent with an empty doc ID',
        'Nothing, because the empty value is NULL and never equals NULL',
        'An ORA-01400 error, because the bind value is NULL',
        'Every row in the table, because NULL matches any value',
      ],
      answer: 1,
      explain: 'The empty string is bound as NULL, and NULL = NULL is not true. So the check says "not a duplicate" every time, and the same document can load again and again. ORA-01400 comes only from inserts into NOT NULL columns.',
    },
    {
      type: 'single',
      prompt: 'What is the right fix for that duplicate check?',
      options: [
        'Use NVL on both sides to turn NULL into a dummy value',
        'Reject messages with no doc ID before the query runs',
        'Send a single space instead of "" so Oracle keeps a value',
        'Add OR sender_doc_id IS NULL to the WHERE clause',
      ],
      answer: 1,
      explain: 'An empty key cannot identify a document. A dummy value, a space or an IS NULL branch would make every empty message a duplicate of the first one, which is wrong too.',
    },
    {
      type: 'single',
      prompt: 'A query uses WHERE item_id NOT IN (SELECT item_id FROM staged_items). One staged row has NULL item_id. What happens?',
      options: [
        'It works, and the NULL row is skipped',
        'It returns no rows, since a comparison with NULL is unknown',
        'It returns every row, since NULL matches nothing',
        'It raises an error about the NULL in the subquery',
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
        'Send "" for missing values so Oracle keeps them apart from NULL',
        'Find missing values in Oracle with a WHERE clause that compares the column to \'\'',
      ],
      answer: [0, 1, 2],
      explain: 'Turning blanks into null, checking required fields in Mule and giving code maps a fallback make Mule agree with how Oracle stores the data. Sending "" does not help: Oracle stores NULL anyway, and Mule logic may still treat it as a value. Comparing a column to \'\' is never true in Oracle, since the empty string is NULL. Use IS NULL.',
    },
    {
      type: 'single',
      prompt: 'A bulk insert fails with ORA-01400: cannot insert NULL into STG_ITEMS.BARCODE. The mapping always sets barcode, and every source row has a barcode key. What is the likely cause?',
      options: [
        'Some barcodes are longer than the column, and Oracle stores the overflow as NULL',
        'The mapping sends barcode as a number, and Oracle turns a bad type into NULL',
        'Two rows in the same block share a barcode, and Oracle nulls the second one',
        'Some source rows send barcode as "", which Oracle stores as NULL',
      ],
      answer: 3,
      explain: 'ORA-01400 means NULL went into a NOT NULL column. The key is there, but an empty string the sender thought was a value becomes NULL in Oracle. The error names the column, so look at the empty strings in the source for it. A value that is too long gives ORA-12899, a duplicate key gives ORA-00001, and a bad number raises a conversion error. Oracle never turns these into NULL.',
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
