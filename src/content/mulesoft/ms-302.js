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
      prompt: 'A load into ITEM_STAGE dies halfway with a connection error. The rerun of the same file then fails with ORA-00001 unique constraint (STG.UK_ITEM_STAGE) violated. What is the most likely cause?',
      options: [
        'The barcode rows point to item headers that the rerun has not loaded yet',
        'A check constraint on ITEM_STAGE rejects a value that the first run wrote',
        'Rows the first run committed are still there, and the rerun inserts their keys again',
        'A key value is longer than its column, so Oracle cuts it and two keys become equal',
      ],
      answer: 2,
      explain: 'ORA-00001 means a unique or primary key clash, and the message names the constraint. The first run committed some blocks, so a plain rerun inserts those keys again. Clear the run first, or make the load a MERGE. A missing parent row is ORA-02291 and a check constraint is ORA-02290, not ORA-00001. Oracle never cuts a value to fit: a value that is too long fails with ORA-12899.',
    },
    {
      type: 'single',
      prompt: 'A load fails with ORA-01400 cannot insert NULL into ("STG"."ITEM_STAGE"."ITEM_DESC"). The mapping log shows itemDesc: "" for that row, not null. What explains it?',
      options: [
        'ITEM_DESC has a DEFAULT, and Oracle put the default in place of the empty string',
        'ITEM_DESC is in a unique key, and another row already holds a NULL in that key',
        'Oracle stores an empty string as NULL, so the empty description counts as no value',
        'Another NOT NULL column was null, and Oracle reports the first column of the table',
      ],
      answer: 2,
      explain: 'In Oracle an empty string is NULL, so "" fails a NOT NULL column the same way a missing value does. Map empty text to a real value or reject the row. A DEFAULT applies only when the column is left out of the insert, not when a value is bound. A unique key allows many NULLs, and a clash would be ORA-00001. The message names the column that actually got the NULL.',
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
      prompt: 'A Select with WHERE ITEM_ID IN (...) built from a list works for 800 items and fails with ORA-01795 for 1,500. Which change fixes it?',
      options: [
        'Raise the fetch size on the Select operation so that all 1,500 keys fit in one call',
        'Move the query into a PL/SQL procedure, where an IN list has no such limit',
        'Ask the DBA to raise OPEN_CURSORS for the app user so the statement can run',
        'Split the keys into chunks of up to 1,000, or join a temporary table of keys',
      ],
      answer: 3,
      explain: 'ORA-01795 means an IN list has more than 1,000 expressions. Chunks of up to 1,000, or a join to a staging or temporary table of keys, stay under it. The limit is part of SQL, so the same statement inside PL/SQL fails too. Fetch size controls how many result rows come back per round trip, and OPEN_CURSORS limits open cursors per session. Neither changes the list limit.',
    },
    {
      type: 'multi',
      prompt: 'Which errors mean a data problem in a row, so the row should go to a reject table rather than be retried?',
      options: [
        'ORA-00001 unique constraint violated',
        'ORA-01400 cannot insert NULL',
        'ORA-12899 value too large for column',
        'ORA-12541 TNS no listener',
        'ORA-00060 deadlock detected while waiting for resource',
        'ORA-01795 maximum number of expressions in a list is 1000',
      ],
      answer: [0, 1, 2],
      explain: 'A duplicate key, a missing required value and a value too long are all about the row itself, so a retry fails the same way. ORA-12541 means the listener cannot be reached. That is a connectivity problem, and a retry later may work. ORA-00060 is a lock clash with another session, and a retry usually works. ORA-01795 comes from a query with an IN list over 1,000 values. It is a code problem, so fix the query, not the row.',
    },
    {
      type: 'single',
      prompt: 'An error handler must send rows that fail with ORA-00001 to a reject table and let every other database error propagate. How does it tell them apart?',
      options: [
        'Read attributes.statusCode, which the Database operation sets to the ORA code',
        'Catch DB:QUERY_EXECUTION, then check the SQL exception in the cause for ORA-00001',
        'Add an On Error Continue for type DB:ORA_00001, which the connector raises per code',
        'Read the payload, which holds the failed row and its ORA code after the error',
      ],
      answer: 1,
      explain: 'The Database connector raises DB:QUERY_EXECUTION for a failed statement, and the cause or description holds the SQL exception with its ORA code and vendor code, for example 1 for ORA-00001. Match on the type, then check the code. There is no error type per ORA code. attributes.statusCode belongs to HTTP responses, and after an error the payload is still what it was before the operation.',
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
