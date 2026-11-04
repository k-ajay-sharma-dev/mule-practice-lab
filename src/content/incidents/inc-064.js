export default {
  id: 'inc-064',
  category: 'incidents',
  title: 'Nightly Replenishment Dies at Store 300 With ORA-01000',
  level: 'ADVANCED',
  tags: ['supply-chain', 'retail', 'oracle', 'stored-procedures', 'cursors', 'replenishment'],
  estMinutes: 35,
  investigation: {
    logs: [
      { text: '01:00:00.010 INFO  [replen] Starting replenishment run for 612 stores (For Each, one flow execution)', relevant: true, why: 'All 612 calls happen inside one long flow execution, so anything left open per iteration accumulates.' },
      { text: '01:00:00.402 INFO  [replen] {call PKG_REPLEN.CALC_STORE_NEED(:p_store, :p_lines, :p_status)} store=0001 p_status=NO_ORDER', relevant: true, why: 'The procedure opens the p_lines REF CURSOR, but since v4.2 the flow reads it only when p_status=ORDER.' },
      { text: '01:00:00.950 INFO  [replen] store=0002 p_status=ORDER lines=37 -> published to REPLEN.ORDERS', relevant: false },
      { text: '01:02:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '01:03:41.330 ERROR [replen] DB:QUERY_EXECUTION ORA-01000: maximum open cursors exceeded store=0301', relevant: true, why: 'The session has hit OPEN_CURSORS (300): one unread cursor per store that did not need an order.' },
      { text: '01:03:41.400 INFO  [dba] v$open_cursor for SID 1422 (program=replen-papi): 300 rows, sql_text=SELECT ... FROM REPLEN_NEED_V', relevant: true, why: 'All open cursors belong to the Mule session and are the procedure\'s p_lines query.' },
      { text: '01:03:42.000 INFO  [replen] Run aborted, 0 of 612 stores confirmed', relevant: false },
      { text: '01:04:00.000 INFO  [metrics] cpu=11% heap=44%', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is causing ORA-01000?',
        options: [
          'Each procedure call opens a REF CURSOR that the flow no longer reads for NO_ORDER stores, so cursors stay open on the session until it exceeds OPEN_CURSORS',
          'The REPLEN_NEED_V view is too slow',
          'Too many connections are open in the pool',
          'The database ran out of tablespace',
        ],
        answer: 0,
        explain: 'v$open_cursor shows 300 open cursors on the Mule session, all from the p_lines query, and the failure arrives at about store 300, which matches OPEN_CURSORS=300.',
      },
      {
        type: 'single',
        prompt: 'What gets tonight\'s orders out **now**?',
        options: [
          'Raise OPEN_CURSORS to 100 000 permanently',
          'Roll back to v4.1 (which read every cursor) or hot-fix the flow to always consume p_lines, then rerun the replenishment for all stores',
          'Run the job twice',
          'Restart the database',
        ],
        answer: 1,
        explain: 'Restore the behaviour that closed the cursors and rerun before the DC cut-off. A temporary OPEN_CURSORS increase by the DBA can be a stop-gap, but not a fix.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix**?',
        options: [
          'Always fully consume (or explicitly handle) every REF CURSOR OUT parameter returned to Mule',
          'Change the procedure so it does not open p_lines when there is nothing to order (or returns lines only in a separate call)',
          'Process stores in separate, smaller executions (e.g. a VM queue or batch job) so resources are released per store',
          'Monitor open cursors per session for integration users',
          'Catch ORA-01000 and retry the same store',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Close what you open, do not open what you do not need, and avoid one huge execution holding resources. Retrying on the same session just hits the limit again.',
      },
    ],
  },
  description: `
## Symptoms
- The nightly replenishment run (\`replen-papi\`) calculates store needs and publishes replenishment orders to the DC by 03:00.
- Since Tuesday the run fails after about **300 of 612 stores** with ORA-01000, and no store orders are confirmed. DC planners are building waves by hand.

## Change / Context
- The flow loops over stores with **For Each** in a single execution and calls \`db:stored-procedure\` \`{call PKG_REPLEN.CALC_STORE_NEED(:p_store, :p_lines, :p_status)}\`; \`p_lines\` is an OUT **SYS_REFCURSOR**.
- Release **v4.2** (Monday) added an optimisation: "only read p_lines when p_status = 'ORDER'". Around half the stores return \`NO_ORDER\`.
- Oracle \`OPEN_CURSORS = 300\`.

## Logs
\`\`\`
01:00:00.402 INFO  [replen] {call PKG_REPLEN.CALC_STORE_NEED(:p_store, :p_lines, :p_status)}
  store=0001 p_status=NO_ORDER
01:03:41.330 ERROR [replen] DB:QUERY_EXECUTION ORA-01000: maximum open cursors exceeded store=0301
01:03:41.400 INFO  [dba] v$open_cursor for SID 1422 (program=replen-papi): 300 rows,
  sql_text=SELECT ... FROM REPLEN_NEED_V
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'ORA-01000 = a session has more open cursors than OPEN_CURSORS (300).',
    'The procedure opens the p_lines REF CURSOR on every call; since v4.2 the flow does not read it for NO_ORDER stores, so it stays open.',
    'All 612 calls run in one long execution on the same pooled session, so unread cursors accumulate until the limit.',
    'Immediate: roll back to v4.1 or hot-fix to always consume p_lines, rerun before the DC cut-off; a temporary OPEN_CURSORS increase is only a stop-gap.',
    'Fix: always consume/handle cursor outputs, do not open unneeded cursors in PL/SQL, split work into smaller executions, monitor open cursors.',
  ],
  solution: `
**Diagnosis.** \`PKG_REPLEN.CALC_STORE_NEED\` always opens the \`p_lines\` REF CURSOR. Before v4.2 the flow read every cursor to the end, which let the connector close it. Since the "optimisation", cursors for \`NO_ORDER\` stores are never read, so they stay open. The whole loop runs in **one flow execution** on the same pooled session, and resources held by unread result streams are only released when they are fully read or the execution that opened them ends. At ~300 unread cursors the session exceeds \`OPEN_CURSORS\` and Oracle raises **ORA-01000: maximum open cursors exceeded** (surfaced as **DB:QUERY_EXECUTION**). \`v$open_cursor\` confirms 300 cursors of the same query on the Mule session.

**Immediate mitigation.** Roll back to v4.1, or hot-fix the flow to always consume \`p_lines\` (for example map it to an array even when it is not used). Rerun the replenishment before the 03:00 DC cut-off and confirm orders arrive in the WMS. If needed, the DBA can raise \`OPEN_CURSORS\` temporarily so tonight's run completes.

**Root cause.** A performance change that skipped reading a cursor output, without understanding that an unread cursor stays open, inside a long-running loop that never released its session.

**Permanent fix.**
- Treat every REF CURSOR output as a resource: always consume it, or change the contract.
- Change the procedure to open \`p_lines\` only when \`p_status = 'ORDER'\` (or split into a status call and a lines call).
- Process stores as separate units of work (publish one message per store to a VM or JMS queue, or a Batch Job), so each store's resources are released and one bad store does not abort all 612.

**Prevention.** Alert on open cursors per session for integration users; test long loops with production-sized store counts; include the DBA in reviews of stored-procedure contract changes.
`,
  followUps: [
    { q: 'Why did the old version not hit the limit?', a: 'It read every cursor to the end, and a fully read result set is closed by the connector, so only a few cursors were open at a time.' },
    { q: 'Is raising OPEN_CURSORS a fix?', a: 'No. It only moves the limit; a leak grows with the number of stores, and each open cursor uses memory on the database server.' },
    { q: 'How do you call a procedure with a REF CURSOR OUT parameter in Mule 4?', a: 'Use db:stored-procedure and declare the parameter as an output parameter with the cursor type supported by the Oracle driver; its value in the result map is a streamed list of rows that you must read (or deliberately handle).' },
  ],
}
