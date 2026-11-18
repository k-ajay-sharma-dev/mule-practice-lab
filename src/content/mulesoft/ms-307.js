export default {
  id: 'ms-307',
  category: 'mulesoft',
  title: 'Calling Oracle Packages From Mule: Out Parameters, Ref Cursors and Long Running Procedures',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'stored-procedures', 'packages', 'ref-cursor', 'async'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'What is an Oracle package?',
      options: [
        'A zip file of SQL scripts',
        'A named group of procedures, functions and types with a public spec and a private body',
        'A table space',
        'A JDBC driver',
      ],
      answer: 1,
      explain: 'You call a member as PACKAGE.PROCEDURE. The spec is the contract, so the body can change without breaking callers.',
    },
    {
      type: 'single',
      prompt: 'How do you call a procedure with an IN and an OUT parameter from the Mule Stored procedure operation?',
      options: [
        'SELECT PKG.PROC FROM DUAL',
        '{call PKG_OUTBOUND.START_RUN(:p_msg_type, :p_run_id)} with p_msg_type as an input parameter and p_run_id declared as an output parameter',
        'EXEC PKG_OUTBOUND.START_RUN',
        'INSERT INTO PKG_OUTBOUND',
      ],
      answer: 1,
      explain: 'The output parameter needs a declared type. Its value comes back in the operation result under its name.',
    },
    {
      type: 'single',
      prompt: 'A procedure returns a SYS_REFCURSOR with 200,000 rows. What should the flow do?',
      options: [
        'Load it all into memory and log it',
        'Declare it as a cursor output, and stream through the rows, for example into a file or batch, before the connection goes back to the pool',
        'Call it once per row',
        'Convert it to a string',
      ],
      answer: 1,
      explain: 'A ref cursor is a pointer to an open result set on the server. It is read row by row while the connection stays open.',
    },
    {
      type: 'single',
      prompt: 'An HTTP endpoint starts an outbound generation procedure that runs for 20 minutes. Callers time out. What is a better design?',
      options: [
        'Raise all timeouts to 30 minutes',
        'Insert a job row, return 202 with the job ID, and run the procedure in an Async scope or a database job, with status in the job table',
        'Call the procedure twice',
        'Remove the transaction',
      ],
      answer: 1,
      explain: 'The caller can poll the job ID. The job row also shows support what ran and when.',
    },
    {
      type: 'multi',
      prompt: 'What are risks of running the procedure in a Mule Async scope?',
      options: [
        'An error in the Async scope does not reach the caller, so it must be logged and written to the job row',
        'If the app restarts, work in flight is lost, so the job row stays in RUNNING until something checks it',
        'Async scopes always run in the database',
        'Many requests at once can start many long runs, so limit concurrency or reject a second run of the same type',
      ],
      answer: [0, 1, 3],
      explain: 'A database job with DBMS_SCHEDULER survives a Mule restart. A watchdog can mark old RUNNING rows as failed.',
    },
    {
      type: 'single',
      prompt: 'After a package is recompiled, the next call fails with ORA-04068, existing state of packages has been discarded. Why, and what helps?',
      options: [
        'The package was dropped',
        'The session held package state from the old version. A retry on a fresh call usually works, and packages without global state avoid it',
        'The password changed',
        'The cursor was closed',
      ],
      answer: 1,
      explain: 'Pooled sessions keep package state, so a deploy can hit several connections. A single retry for this code is common.',
    },
  ],
  description: `
Fenwick Supply generates outbound item and transfer messages in Oracle. A package builds the messages into outbound tables, which can take many minutes. Mule exposes a scheduler and an HTTP endpoint per message type that start a run, then another flow reads the generated rows through a ref cursor and sends them on.

**Questions**
1. How do you call a package procedure with in and out parameters from Mule?
2. How do you read a ref cursor with many rows?
3. How do you start a long procedure without making callers wait?
4. What can go wrong, and how do you see it?
`,
  answerTemplate: `## Calling the procedure

## Reading a ref cursor

## Starting a long run

## Risks and monitoring
`,
  keyPoints: [
    'Use {call PKG.PROC(:in, :out)} with typed output parameters.',
    'A ref cursor is read as a stream while the connection is open.',
    'Insert a job row, return 202 with the job ID, run the work in the background.',
    'Async errors do not reach the caller: write them to the job row.',
    'Limit concurrent runs per message type.',
    'Retry once on ORA-04068 after a package deploy.',
  ],
  solution: `
**1. Calling the procedure.** Use the Stored procedure operation with \`{call PKG_OUTBOUND.START_RUN(:p_msg_type, :p_run_id)}\`. Put \`p_msg_type\` in the input parameters and declare \`p_run_id\` as an output parameter with its type. The result holds the output by name.

**2. Reading a ref cursor.** Declare the cursor parameter as an output of a cursor type. Mule returns its rows as an iterable that streams from the server. Write them to a file, send them to a batch job or map them in a streaming way. Avoid logging the whole result or reading it twice. The connection stays busy until the rows are consumed.

**3. Starting a long run.** The HTTP flow inserts a job row with status STARTED and returns 202 with the job ID. An Async scope then calls the procedure and updates the job row to DONE or FAILED with counts and the error text. The scheduler flow does the same without the HTTP response. A second request for a type that is already running returns 409 or the existing job ID.

**4. Risks and monitoring.** Errors in Async never reach the caller, so the error handler inside it must update the job row and log. A restart loses the run, so a watchdog marks RUNNING rows older than a limit as failed. If runs must survive restarts, the procedure can be started as a DBMS_SCHEDULER job instead. After a package deploy, pooled sessions can raise ORA-04068 once, so a single retry is reasonable.
`,
  followUps: [
    {
      q: 'Where does the transaction boundary sit for the procedure?',
      a: 'Usually inside the procedure, which commits its own work. Mule then does not wrap it in a long XA transaction.',
    },
    {
      q: 'How would a caller learn the result?',
      a: 'GET on a job status resource that reads the job row, or an event or email when the job ends.',
    },
    {
      q: 'Why can a function in a SELECT be a poor fit for large work?',
      a: 'It runs per row and cannot do DML in a query unless it is autonomous. A procedure fits set based work better.',
    },
  ],
}
