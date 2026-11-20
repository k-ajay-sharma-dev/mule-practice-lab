export default {
  id: 'ms-302',
  category: 'mulesoft',
  title: 'Reading Oracle Errors in Mule Logs: ORA-00001, ORA-01400, ORA-12899 and ORA-01795',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'errors', 'constraints', 'staging', 'troubleshooting'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'An insert into a staging table fails with ORA-00001. What does it mean?',
      options: [
        'A foreign key points to a parent row that does not exist',
        'A unique or primary key constraint was violated by the row',
        'A check constraint rejected a value in the row',
        'The row was locked by another session during the insert',
      ],
      answer: 1,
      explain: 'A row with the same key is already there. The message names the constraint, such as SCHEMA.UK_ITEM_STAGE. Look up its columns to see which key clashed.',
    },
    {
      type: 'single',
      prompt: 'What does ORA-01400 cannot insert NULL into ("STG"."ITEM_STAGE"."ITEM_DESC") tell you?',
      options: [
        'ITEM_DESC is NOT NULL and the row had no value for it',
        'ITEM_DESC has a default, but the default is NULL',
        'ITEM_DESC is in a unique key that already holds a NULL',
        'ITEM_DESC failed a check constraint on its content',
      ],
      answer: 0,
      explain: 'Note that Oracle stores an empty string as NULL, so an empty value also causes this. Often a mapping sent null for a missing field, or a key name did not match the bind parameter, so the value was null.',
    },
    {
      type: 'single',
      prompt: 'A VARCHAR2(20) column takes "Grün Spülmaschine XL", 20 characters, fine in one database and fails with ORA-12899 in another. Why?',
      options: [
        'The second database trims trailing spaces before it checks length',
        'Length is in bytes by default, and ü takes two bytes in UTF-8',
        'The second database stores VARCHAR2 as UTF-16, two bytes a letter',
        'The driver in the second app pads the value to the column size',
      ],
      answer: 1,
      explain: 'The value is 20 characters but 22 bytes in a UTF-8 database, so it is too long when the column counts bytes. A single byte character set or character length semantics lets it fit. Declaring VARCHAR2(20 CHAR), or NLS_LENGTH_SEMANTICS=CHAR when the table is created, counts characters instead.',
    },
    {
      type: 'single',
      prompt: 'A query with WHERE ITEM_ID IN (...) works for 800 items and fails with ORA-01795 for 1,500. What is the limit?',
      options: [
        'A list in an IN clause can hold at most 1,000 expressions',
        'A statement can have at most 1,000 bind variables',
        'The SQL text is limited to 1,000 lines by the driver',
        'A query can return at most 1,000 rows without paging',
      ],
      answer: 0,
      explain: 'Split the list into chunks of up to 1,000, or load the keys into a staging or temporary table and join.',
    },
    {
      type: 'multi',
      prompt: 'Which errors mean a data problem in a row, so the row should go to a reject table rather than be retried?',
      options: ['ORA-00001', 'ORA-01400', 'ORA-12899', 'ORA-12541 TNS no listener'],
      answer: [0, 1, 2],
      explain: 'ORA-12541 means the listener cannot be reached. That is a connectivity problem, and a retry later may work.',
    },
    {
      type: 'single',
      prompt: 'In Mule, how do you get the ORA code to decide what to do in an error handler?',
      options: [
        'From attributes.statusCode after the Database operation',
        'From the DB:QUERY_EXECUTION error, whose cause holds the ORA code',
        'From a separate error type per ORA code, such as DB:ORA_00001',
        'From the payload, which holds the error row after a failure',
      ],
      answer: 1,
      explain: 'The cause or description holds the SQL exception with its ORA code and vendor code. Match on the error type first, then inspect the description or the vendor error code, for example 1 for ORA-00001.',
    },
  ],
  description: `
Quayle Freight loads shipment lines from a partner into Oracle staging tables each night. Support gets a log with four Oracle errors from one week and asks you what each means and which ones need a fix in the data rather than in the system.

**Questions**
1. What do ORA-00001, ORA-01400 and ORA-12899 mean?
2. Why can ORA-12899 appear for text that looks short enough?
3. What causes ORA-01795, and how do you avoid it?
4. Which errors are row problems and which are system problems?
`,
  answerTemplate: `## Constraint errors

## Byte and character length

## The IN list limit

## Row or system problem
`,
  keyPoints: [
    'ORA-00001: unique key or primary key clash.',
    'ORA-01400: NULL into a NOT NULL column.',
    'ORA-12899: value too large, often bytes vs characters.',
    'ORA-01795: more than 1,000 items in an IN list.',
    'Row errors go to a reject table. Connectivity errors are retried.',
  ],
  solution: `
**1. Constraint errors.** ORA-00001 means a unique constraint or primary key was violated. The message names the constraint, so you can see which key clashed. ORA-01400 means a NOT NULL column got no value. In Mule this often comes from a mapping that sends null for a missing field, or a bind parameter name that does not match the key in the row.

**2. Byte and character length.** ORA-12899 says the value is too large for the column and shows the actual and maximum size. VARCHAR2 lengths count bytes unless the column is declared with CHAR. In a UTF-8 database an accented letter takes two bytes, so a 20 character text can be 22 bytes. Declare columns with CHAR semantics, or trim the value to the byte limit in the mapping and log it.

**3. The IN list limit.** An IN list can hold at most 1,000 expressions. Split the keys into chunks of 1,000 and run one query per chunk, or bulk insert the keys into a staging or global temporary table and join.

**4. Row or system problem.** ORA-00001, ORA-01400 and ORA-12899 depend on the data in the row. Retrying gives the same error, so the row goes to a reject table with the code and message. Errors such as TNS no listener, a closed connection or a lock timeout are about the system, and a retry later may work.
`,
  followUps: [
    {
      q: 'ORA-00942 table or view does not exist appears after a deploy. What do you check?',
      a: 'The schema prefix, whether the app user was granted access, and whether a synonym exists. The table may exist in another schema the user cannot see.',
    },
    {
      q: 'ORA-01017 appears in a new environment. What is it?',
      a: 'Invalid username or password. Check the secure property for that environment and whether the account is locked or expired.',
    },
    {
      q: 'How would you show the failing value without logging personal data?',
      a: 'Log the key, the column name and the length, not the full value. The reject table can hold the row for authorised users.',
    },
  ],
}
