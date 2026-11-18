export default {
  id: 'ms-292',
  category: 'mulesoft',
  title: 'Getting New Keys Back From SQL Server: OUTPUT INSERTED, SCOPE_IDENTITY and @@IDENTITY',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'identity', 'output-clause', 'insert', 'database-connector'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'An insert adds one row to a table with an IDENTITY column. Which function returns the new value from the same scope?',
      options: ['@@IDENTITY', 'SCOPE_IDENTITY()', 'IDENT_CURRENT(\'table\')', 'NEWID()'],
      answer: 1,
      explain: 'SCOPE_IDENTITY returns the last identity value made in the current scope and session.',
    },
    {
      type: 'single',
      prompt: 'Why can @@IDENTITY return the wrong value?',
      options: [
        'It returns null always',
        'It returns the last identity made in the session in any scope, so a trigger that inserts into an audit table changes it',
        'It only works in stored procedures',
        'It returns a GUID',
      ],
      answer: 1,
      explain: 'A trigger runs in another scope. @@IDENTITY picks up its insert, SCOPE_IDENTITY does not.',
    },
    {
      type: 'single',
      prompt: 'Why is IDENT_CURRENT a poor choice in an integration?',
      options: [
        'It is slow',
        'It returns the last identity for the table from any session, so another app inserting at the same time can give you its key',
        'It needs admin rights',
        'It does not exist',
      ],
      answer: 1,
      explain: 'Under concurrent load this returns keys that belong to other sessions.',
    },
    {
      type: 'single',
      prompt: 'An insert adds 500 rows at once. How do you get every new key?',
      options: [
        'Call SCOPE_IDENTITY 500 times',
        'Use OUTPUT INSERTED.id, together with a business key, in the INSERT statement',
        'Read MAX(id) after the insert',
        'Use @@ROWCOUNT',
      ],
      answer: 1,
      explain: 'OUTPUT returns a row for every inserted row. Returning a business key with it lets you match keys to source rows.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about OUTPUT INSERTED are true?',
      options: [
        'It works with INSERT, UPDATE, DELETE and MERGE',
        'UPDATE can return both DELETED and INSERTED values',
        'It returns a result set the Mule app can read',
        'It needs a separate SELECT afterwards',
      ],
      answer: [0, 1, 2],
      explain: 'OUTPUT gives back old and new values in the same statement, without a second round trip.',
    },
    {
      type: 'single',
      prompt: 'With OUTPUT on a table that has an enabled trigger, what must you change?',
      options: [
        'Nothing',
        'Use OUTPUT INTO a table variable and select from it, because a plain OUTPUT is not allowed on a table with enabled triggers',
        'Drop the trigger',
        'Use @@IDENTITY',
      ],
      answer: 1,
      explain: 'SQL Server rejects OUTPUT without INTO when the target has enabled triggers. OUTPUT INTO a table variable works.',
    },
  ],
  description: `
Larkfield Grocers writes each plan run it gets from the planning platform into a \`PlanRun\` header table with an IDENTITY key, then writes the plan lines with that key. Sometimes the lines end up linked to the wrong run. The code reads \`@@IDENTITY\` after the insert, and the table has an audit trigger.

**Questions**
1. What are the ways to get a new identity value?
2. Why does @@IDENTITY give the wrong run here?
3. How do you get keys for many rows at once?
4. What would you change in the Mule flow?
`,
  answerTemplate: `## Ways to get the key

## Why @@IDENTITY failed

## Many rows

## The Mule flow
`,
  keyPoints: [
    'SCOPE_IDENTITY: the current scope and session.',
    '@@IDENTITY: any scope, so triggers change it.',
    'IDENT_CURRENT: any session, wrong under concurrent load.',
    'OUTPUT INSERTED returns keys for every row in one statement.',
    'Use OUTPUT INTO a table variable when the table has triggers.',
  ],
  solution: `
**1. Ways to get the key.** \`SCOPE_IDENTITY()\` returns the last identity from the current scope and session. \`@@IDENTITY\` returns the last identity from the session in any scope. \`IDENT_CURRENT('table')\` returns the last identity for a table from any session. The \`OUTPUT\` clause returns values from the affected rows as part of the statement.

**2. Why @@IDENTITY failed.** The audit trigger inserts into an audit table with its own identity. \`@@IDENTITY\` then returns the audit row's key, so plan lines point to a run id that is not theirs.

**3. Many rows.** Use \`OUTPUT INSERTED.RunId, INSERTED.SourceRef\` in the insert. Each inserted row comes back with its new key and a business key, so the app can match them. With a trigger on the table, use \`OUTPUT ... INTO @keys\` and then select from the table variable.

**4. The Mule flow.** Run the insert of the header with \`OUTPUT INSERTED.RunId\` in one Database operation that returns a result set, or call a stored procedure that returns the key as an output parameter. Then insert the lines with that key, in the same transaction so a failure leaves no orphan header.
`,
  followUps: [
    {
      q: 'Can the Database connector insert operation return generated keys?',
      a: 'The insert operation has an auto generated keys option that asks the driver for them. With SQL Server, many teams prefer OUTPUT in a select or a procedure, which is explicit and works for many rows.',
    },
    {
      q: 'Would a SEQUENCE help?',
      a: 'Yes. With NEXT VALUE FOR you get the key before the insert, so header and lines can be built together. Many integrations fetch technical keys this way.',
    },
    {
      q: 'Why not use MAX(id) + 1?',
      a: 'Two sessions can read the same MAX and clash. Identity and sequences are safe under concurrency.',
    },
  ],
}
