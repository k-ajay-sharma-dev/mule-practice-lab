export default {
  id: 'ms-298',
  category: 'mulesoft',
  title: 'Calling SQL Server Procedures From Mule: Output Parameters, Result Sets, Table Inputs and Parameter Sniffing',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'stored-procedures', 'output-parameters', 'tvp', 'parameter-sniffing'],
  estMinutes: 24,
  quiz: [
    {
      type: 'single',
      prompt: 'A procedure returns a run id as an OUTPUT parameter and also a result set of rejected rows. How does the Mule stored procedure operation expose them?',
      options: [
        'Only the result set, so the run id needs a second query',
        'Both come back in the operation result, read by name in DataWeave',
        'Only the output parameter, as the payload of the operation',
        'The output parameter goes to attributes and the result set to payload',
      ],
      answer: 1,
      explain: 'Declare the output parameter with its type in the operation. The result then holds the output values and the result sets.',
    },
    {
      type: 'single',
      prompt: 'A procedure inserts audit rows, updates a run row, then selects the rejected rows. Called from Mule, the rejects result set is missing from the result, though SSMS shows it. What is the likely fix?',
      options: [
        'Add SET NOCOUNT ON, so row counts do not come back as extra results first',
        'Move the audit insert to a trigger, since inserts in a procedure hide its selects',
        'Add WITH RESULT SETS to the EXEC call, so the driver learns the columns',
        'Turn on streaming in the Mule operation, so the driver reads past the first result',
      ],
      answer: 0,
      explain: 'Without SET NOCOUNT ON, each INSERT or UPDATE sends a row count message, and JDBC drivers can return these as extra results ahead of the result set. The client then has to step through them, and the real result can be hidden. SSMS shows counts as messages, so it looks fine there. Inserts do not hide selects, WITH RESULT SETS only renames or retypes columns, and streaming changes how rows are read, not which results come back.',
    },
    {
      type: 'single',
      prompt: 'A procedure is fast for most stores but takes minutes for the largest one, or the other way round, depending on which ran first after a restart. What is this?',
      options: [
        'Blocking from the other stores that load at the same time',
        'Parameter sniffing: a plan built for the first values is reused',
        'Stale statistics: they are rebuilt only when the instance restarts',
        'A cold buffer cache, which fills only after the first run',
      ],
      answer: 1,
      explain: 'The plan is compiled for the first parameter values and reused for very different ones. A plan built for a small store may use loops and seeks that are slow for a large one.',
    },
    {
      type: 'multi',
      prompt: 'Which are known fixes for parameter sniffing?',
      options: [
        'OPTION (RECOMPILE) on the affected statement',
        'OPTIMIZE FOR a typical value, or OPTIMIZE FOR UNKNOWN',
        'Better indexes and up to date statistics',
        'Adding WITH (NOLOCK) to the slow queries',
        'Running DBCC FREEPROCCACHE on the server every night',
        'Raising the query timeout on the Mule Stored procedure operation',
      ],
      answer: [0, 1, 2],
      explain: 'Each right fix has a cost. RECOMPILE uses CPU per call. OPTIMIZE FOR picks one plan for all. Better indexes and fresh statistics make plans less sensitive to the value. Query Store can also force a known good plan. NOLOCK changes locking, not the plan. Clearing the plan cache only lets the next call sniff again, maybe with a bad value, and it hurts every other query. A longer timeout hides the slow plan.',
    },
    {
      type: 'single',
      prompt: 'You need to pass 5,000 rows to a procedure in one call. What are the usual options?',
      options: [
        'A bulk call that runs the procedure once for each row',
        'A table valued parameter, or a JSON string read with OPENJSON',
        'A cursor input parameter that Mule opens and the procedure reads',
        'An array parameter, which SQL Server maps to a table',
      ],
      answer: 1,
      explain: 'A TVP is typed and fast but needs driver and connector support. JSON with OPENJSON works with a plain string parameter on SQL Server 2016 and later.',
    },
    {
      type: 'single',
      prompt: 'Why can a RAISERROR or THROW inside the procedure be missed by the caller?',
      options: [
        'Errors below severity 16 reach the client only as info messages, not as errors',
        'After a result set, the driver may raise it only once that set is read',
        'THROW inside a procedure only writes to the SQL Server error log',
        'The Database connector maps SQL errors to warnings by default',
      ],
      answer: 1,
      explain: 'Read all results, or raise errors before returning data. Test the error path, not only the happy path.',
    },
  ],
  description: `
Marrow & Pine Home loads plans from the planning platform into SQL Server through a procedure \`usp_LoadPlan\`. Mule passes the plan rows, and the procedure returns a run id as an output parameter and a result set of rejected rows. Some nights the procedure takes 20 minutes instead of one. Once, an error raised inside the procedure never reached Mule, and the job reported success.

**Questions**
1. How do you call the procedure and read both outputs in Mule?
2. How do you pass thousands of rows?
3. Why is it sometimes slow?
4. Why was the error missed, and how do you fix that?
`,
  answerTemplate: `## Calling the procedure

## Passing many rows

## Sometimes slow

## The missed error
`,
  keyPoints: [
    'Use the stored procedure operation with typed input and output parameters.',
    'Read output values and result sets by name in DataWeave.',
    'Add SET NOCOUNT ON.',
    'Pass rows as a TVP or as JSON read with OPENJSON.',
    'Parameter sniffing reuses a plan built for other values.',
    'Raise errors before returning results, and read all results.',
  ],
  solution: `
**1. Calling the procedure.** Use the Database stored procedure operation with \`{call usp_LoadPlan(:planJson, :runId)}\`, an input parameter for the data and an output parameter of the right JDBC type for the run id. The result holds the output values and the result sets, which DataWeave reads by name. Add \`SET NOCOUNT ON\` to the procedure so row count messages do not get in the way.

**2. Passing many rows.** A table valued parameter is typed and efficient, if your driver and connector version support it. A common alternative is one JSON string parameter, unpacked with \`OPENJSON ... WITH (...)\` into a temp table inside the procedure. For very large sets, bulk insert into a staging table and pass only the run id.

**3. Sometimes slow.** The plan is compiled for the parameter values of the first call after a restart or recompile. A plan built for a small plan set uses nested loops that crawl on the largest one. Fix with \`OPTION (RECOMPILE)\` on the heavy statement, \`OPTIMIZE FOR\`, better indexes and statistics, or a forced plan in Query Store.

**4. The missed error.** The procedure returned the rejected rows and then raised the error. The driver only reports it when the client moves past the first result. Raise errors before any result set, use \`THROW\` in a \`TRY...CATCH\` that rolls back, and test that Mule fails the flow when the procedure fails.
`,
  followUps: [
    {
      q: 'Why does a temp table with OPENJSON help the plan?',
      a: 'A temp table has statistics, so the optimizer knows how many rows it has. A direct OPENJSON or table variable can give poor estimates.',
    },
    {
      q: 'How do you check which plan ran?',
      a: 'Query Store shows the plans per query with their duration, and lets the DBA force a good one.',
    },
    {
      q: 'Should the procedure commit, or Mule?',
      a: 'Pick one owner. A procedure that manages its own transaction is clearer when Mule makes one call. Inside a Mule transaction, let Mule commit.',
    },
  ],
}
