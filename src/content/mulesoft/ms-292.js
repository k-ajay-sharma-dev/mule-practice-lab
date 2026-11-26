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
      prompt: 'PlanRun has an IDENTITY key and an audit trigger that inserts into PlanRunAudit, which has its own IDENTITY. Two other apps insert into PlanRun at the same time. After the insert, SELECT @@IDENTITY gives 88213, but the new PlanRun id is 4127. What returns 4127 reliably?',
      options: [
        'SELECT @@IDENTITY again, once the audit trigger has finished',
        'SELECT IDENT_CURRENT(\'PlanRun\') right after the insert',
        'SELECT SCOPE_IDENTITY() in the same batch as the insert',
        'SELECT MAX(id) FROM PlanRun inside the same transaction',
      ],
      answer: 2,
      explain: 'SCOPE_IDENTITY returns the last identity made in the current scope and session, so the trigger insert does not change it. @@IDENTITY is per session but covers every scope, so it picks up the PlanRunAudit insert made by the trigger. IDENT_CURRENT and MAX(id) look at the table across all sessions, so the other apps can give you their key.',
    },
    {
      type: 'single',
      prompt: 'Inside a transactional scope, so both run on one connection, a flow runs a parameterized INSERT in one Database operation and SELECT SCOPE_IDENTITY() in the next. The select returns NULL. Why?',
      options: [
        'SCOPE_IDENTITY returns NULL whenever a trigger fired on the insert',
        'The pool gave the second operation another connection, so another session',
        'The insert has not been committed yet, so its new value is not visible',
        'The second operation is a separate batch, so it runs in a new scope',
      ],
      answer: 3,
      explain: 'A scope is a procedure, trigger, function or batch. Each Database operation sends its own batch, and a parameterized insert runs in its own nested scope too, so the next batch has no identity value in its scope. A trigger does not make it NULL, and the session sees its own uncommitted insert. The transactional scope keeps one connection. Return the key in the same statement with OUTPUT INSERTED.id instead.',
    },
    {
      type: 'single',
      prompt: 'In a load test, three Mule workers insert plan runs at once. Each reads IDENT_CURRENT(\'PlanRun\') after its insert, and some plan lines end up under another worker\'s run. Why?',
      options: [
        'It returns the last identity made in the table by any session',
        'It returns the session’s last identity in any scope, including triggers',
        'It returns the next value to be issued, not the one your insert used',
        'It reads the value before the insert commits, so it lags one behind',
      ],
      answer: 0,
      explain: 'IDENT_CURRENT is per table, not per session. When another worker inserts between your insert and your read, you get its key. Any scope including triggers describes @@IDENTITY. IDENT_CURRENT gives the last value issued, not the next one, and it does not wait for commits.',
    },
    {
      type: 'single',
      prompt: 'An insert adds 500 rows at once. How do you get every new key?',
      options: [
        'Read SCOPE_IDENTITY, then count back 500 values from it',
        'Use OUTPUT INSERTED.id with a business key in the INSERT',
        'Read MAX(id) after the insert, and the 499 values below it',
        'Read @@ROWCOUNT and IDENT_CURRENT to work out the range',
      ],
      answer: 1,
      explain: 'OUTPUT returns a row for every inserted row. Returning a business key with it lets you match keys to source rows. Identity values from one insert are not guaranteed to be a gap free range, and other sessions can insert at the same time.',
    },
    {
      type: 'multi',
      prompt: 'A plan change must update Qty on 2,000 lines and log the old and new Qty of each line, in one round trip from Mule. Which statements hold?',
      options: [
        'UPDATE with OUTPUT DELETED.Qty, INSERTED.Qty returns the old and new value per row',
        'OUTPUT on an UPDATE gives only new values, so the old ones need a SELECT first',
        'The OUTPUT rows come back as a result set that the Mule app can read',
        'OUTPUT returns values only for the first row that the statement changed',
        'The same OUTPUT clause also works on INSERT, DELETE and MERGE',
      ],
      answer: [0, 2, 4],
      explain: 'OUTPUT gives back old and new values in the same statement, without a second round trip. In an UPDATE, DELETED holds the values before the change and INSERTED the values after it. It returns one row for every changed row, and works with INSERT, UPDATE, DELETE and MERGE.',
    },
    {
      type: 'single',
      prompt: 'With OUTPUT on a table that has an enabled trigger, what must you change?',
      options: [
        'Nothing, because OUTPUT runs before the trigger fires',
        'Use OUTPUT INTO a table variable, then select from it',
        'Disable the trigger for the insert, then enable it again',
        'Switch to OUTPUT DELETED, which triggers do not affect',
      ],
      answer: 1,
      explain: 'A plain OUTPUT is not allowed on a table with enabled triggers. SQL Server rejects OUTPUT without INTO when the target has enabled triggers. OUTPUT INTO a table variable works.',
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
