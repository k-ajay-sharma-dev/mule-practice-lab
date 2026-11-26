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
      prompt: 'The DBA fixes a bug by replacing only the body of PKG_OUTBOUND. The spec and its parameters are unchanged, and the package keeps no global state. What must change in the Mule app that calls PKG_OUTBOUND.START_RUN?',
      options: [
        'Nothing, since callers depend on the spec and the body can change behind it',
        'The app must be redeployed, so the Stored procedure operation reads the new body',
        'The call must name the new body, such as PKG_OUTBOUND_BODY.START_RUN',
        'The EXECUTE grant must be given again, since replacing the body drops it',
      ],
      answer: 0,
      explain: 'The spec is the public contract and the body is private. You call a member as PACKAGE.PROCEDURE, and the body can change without touching callers. The next call runs the new body, with no redeploy. A body has no name of its own to call. Replacing a body keeps the grants on the package.',
    },
    {
      type: 'single',
      prompt: 'How do you call a procedure with an IN and an OUT parameter from the Mule Stored procedure operation?',
      options: [
        'SELECT PKG_OUTBOUND.START_RUN(:p_msg_type) FROM DUAL in a Select operation',
        '{call PKG_OUTBOUND.START_RUN(:p_msg_type, :p_run_id)} with p_run_id as an output parameter',
        'EXEC PKG_OUTBOUND.START_RUN(:p_msg_type, :p_run_id) with both as input parameters',
        '{call PKG_OUTBOUND.START_RUN(:p_msg_type, :p_run_id)} with both as input parameters',
      ],
      answer: 1,
      explain: 'p_msg_type goes in the input parameters. A procedure cannot be called from a SELECT. The output parameter needs a declared type. Its value comes back in the operation result under its name.',
    },
    {
      type: 'single',
      prompt: 'A procedure returns a SYS_REFCURSOR with 200,000 rows. What should the flow do?',
      options: [
        'Map it into a list with DataWeave, then write the list to a file in one go',
        'Declare it as a cursor output and stream the rows into a file or a batch job',
        'Set the fetch size to 200,000, so all rows come back in one round trip',
        'Convert the cursor to a JSON string first so the connection can be released',
      ],
      answer: 1,
      explain: 'A ref cursor is a pointer to an open result set on the server. It is read row by row while the connection stays open, so stream it and consume it before the connection goes back to the pool. Mapping it into one list, or a fetch size of 200,000, puts every row in memory at once. Converting it to one JSON string builds the same full copy in memory.',
    },
    {
      type: 'single',
      prompt: 'An HTTP endpoint starts an outbound generation procedure that runs for 20 minutes. Callers time out. What is a better design?',
      options: [
        'Raise the HTTP listener, requester and database timeouts to 30 minutes',
        'Insert a job row, return 202 with the job ID, and run the procedure in the background',
        'Wrap the call in an Until Successful scope so the caller is retried on timeout',
        'Wrap the call in a Cache scope so repeat callers get the earlier result',
      ],
      answer: 1,
      explain: 'The background run can be an Async scope or a database job, with its status in the job table. The caller can poll the job ID. The job row also shows support what ran and when.',
    },
    {
      type: 'multi',
      prompt: 'What are risks of running the procedure in a Mule Async scope?',
      options: [
        'An error in the Async scope does not reach the caller, so it must be logged and written to the job row',
        'If the app restarts, work in flight is lost, so the job row stays in RUNNING until something checks it',
        'The Async scope keeps the HTTP response open until the procedure ends, so callers still time out',
        'Many requests at once can start many long runs, so limit concurrency or reject a second run of the same type',
        'The procedure joins the transaction of the calling flow, so a later error rolls it back',
        'The Async work is kept in a persistent queue, so a restart runs the procedure twice',
      ],
      answer: [0, 1, 3],
      explain: 'Errors in an Async scope never reach the caller, work in flight is lost on a restart, and parallel requests can start many long runs. The HTTP response goes back at once, which is why Async is used. An Async scope cannot join the caller transaction. Its work is held in memory, not a persistent queue, so a restart loses it rather than repeating it. A database job with DBMS_SCHEDULER survives a Mule restart. A watchdog can mark old RUNNING rows as failed.',
    },
    {
      type: 'single',
      prompt: 'After a package is recompiled, the next call fails with ORA-04068, existing state of packages has been discarded. Why, and what helps?',
      options: [
        'The recompile removed the grants, so the Mule user lost EXECUTE on the package',
        'The session held state from the old package version. A retry usually works',
        'The recompile closed the open ref cursors, so the next fetch on them fails',
        'The package body stays invalid after a recompile until a DBA compiles it again',
      ],
      answer: 1,
      explain: 'Packages without global state avoid it. Pooled sessions keep package state, so a deploy can hit several connections. A single retry for this code is common.',
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
