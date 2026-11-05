export default {
  id: 'ms-068',
  category: 'mulesoft',
  title: 'Calling an Oracle Allocation Package: Stored Procedures with IN, OUT, IN OUT and REF CURSOR',
  level: 'ADVANCED',
  tags: ['supply-chain', 'oracle', 'database', 'stored-procedure', 'ref-cursor', 'allocation'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'How do you call `ALLOC_PKG.ALLOCATE_ORDER(p_order_id IN, p_dc_code IN OUT, p_status OUT, p_lines OUT SYS_REFCURSOR)` from Mule?',
      options: [
        'db:stored-procedure with {call ALLOC_PKG.ALLOCATE_ORDER(:p_order_id, :p_dc_code, :p_status, :p_lines)} and input, in-out and output parameter declarations',
        'db:select with SELECT ALLOC_PKG.ALLOCATE_ORDER(...) FROM dual',
        'db:execute-script with the procedure name only',
        'db:update with EXEC ALLOC_PKG.ALLOCATE_ORDER',
      ],
      answer: 0,
      explain: 'Procedures with OUT parameters need db:stored-procedure, which registers OUT/IN OUT parameters with the driver. SELECT ... FROM dual only works for functions without OUT parameters; EXEC is a SQL*Plus command, not SQL.',
    },
    {
      type: 'match',
      prompt: 'Match each procedure parameter to the Mule declaration.',
      pairs: [
        ['p_order_id IN NUMBER', 'db:input-parameters'],
        ['p_dc_code IN OUT VARCHAR2', 'db:in-out-parameters'],
        ['p_status OUT VARCHAR2', 'db:output-parameters with a VARCHAR type'],
      ],
      explain: 'Input values are bound as inputs, IN OUT parameters need both a value and registration as output, and OUT parameters only need a type so the driver can return them.',
    },
    {
      type: 'single',
      prompt: 'After the call, where do you find `p_status`?',
      options: [
        'In the payload map under the output parameter key, e.g. payload.p_status',
        'In attributes.outputParameters',
        'In vars.p_status automatically',
        'It is only written to the Mule log',
      ],
      answer: 0,
      explain: 'db:stored-procedure returns a map whose entries include each OUT and IN OUT parameter by its key (plus result sets and update counts when present).',
    },
    {
      type: 'multi',
      prompt: 'The REF CURSOR `p_lines` returns the allocated lines. Which statements are true?',
      options: [
        'The cursor is a result set read from the open database connection, so it should be consumed (e.g. transformed) within the flow, not stored for later',
        'Large cursors can be streamed and iterated instead of loading every row first',
        'A REF CURSOR is returned as a JSON string by Oracle',
        'You must close the connection manually after reading the cursor',
      ],
      answer: [0, 1],
      explain: 'A REF CURSOR is a pointer to a server-side result set; it is read row by row while the statement and connection are open. Mule manages the connection and closes it once the stream is consumed or the event completes.',
    },
    {
      type: 'single',
      prompt: 'The procedure has a parameter of PL/SQL type `BOOLEAN` and another of a PL/SQL `RECORD` type. What is the usual approach?',
      options: [
        'Ask the DB team for a wrapper procedure that exposes SQL-compatible types (NUMBER/VARCHAR2, or object types), and call the wrapper',
        'Pass "true" as a string and Oracle converts it',
        'Use db:select instead',
        'Declare the parameter type as BOOLEAN in Mule and it always works',
      ],
      answer: 0,
      explain: 'PL/SQL-only types such as BOOLEAN and RECORD have traditionally not been bindable from JDBC; a thin wrapper with SQL types is the robust, version-independent approach.',
    },
    {
      type: 'single',
      prompt: 'The procedure COMMITs internally, and the Mule flow later fails on the HTTP call to the WMS. What is the consequence?',
      options: [
        'The allocation stays committed in Oracle even though the flow failed, so you need a compensation (de-allocation) or an idempotent retry',
        'Mule rolls back the procedure automatically',
        'On Error Propagate rolls back the procedure',
        'The procedure is re-executed until the HTTP call succeeds',
      ],
      answer: 0,
      explain: 'A COMMIT inside the procedure ends the database transaction regardless of Mule; HTTP is not transactional either. Design compensation or make the allocation idempotent per order.',
    },
  ],
  description: `
A beverage distributor allocates scarce stock (e.g. seasonal products) to customer orders with an **Oracle PL/SQL package** owned by the ERP team:

\`\`\`sql
PROCEDURE ALLOCATE_ORDER(
  p_order_id  IN     NUMBER,
  p_dc_code   IN OUT VARCHAR2,      -- preferred DC in, chosen DC out
  p_status    OUT    VARCHAR2,      -- ALLOCATED / PARTIAL / BACKORDER
  p_lines     OUT    SYS_REFCURSOR  -- sku, qty_requested, qty_allocated, lot_no
);
\`\`\`

For each order received from the order management system, a Mule **Allocation System API** must:
1. Call the procedure.
2. Return the result as JSON.
3. Send the allocated lines to the **WMS** for picking.

The first attempts failed:
- \`db:select\` with \`SELECT ALLOC_PKG.ALLOCATE_ORDER(...) FROM dual\` threw errors.
- A later version returned an empty \`p_lines\`.

The ERP team also mentions a new version of the procedure that takes a PL/SQL \`BOOLEAN p_allow_substitutes\`.

**Questions**
1. Configure \`db:stored-procedure\` for IN, IN OUT, OUT and REF CURSOR parameters.
2. How do you read the outputs and transform the cursor to JSON?
3. What are the pitfalls with REF CURSORs, PL/SQL-only types and commits inside the procedure?
4. How do you test this without the ERP database?
`,
  answerTemplate: `## Stored procedure configuration

## Reading outputs and the cursor

## Pitfalls

## Testing
`,
  keyPoints: [
    'Use db:stored-procedure with JDBC call syntax {call PKG.PROC(:a, :b, ...)} and declare input, in-out and output parameters.',
    'OUT and IN OUT values come back in the payload map under their keys; a REF CURSOR comes back as an iterable result set.',
    'Consume the cursor while the connection is open (transform it in the flow); large cursors can be streamed.',
    'PL/SQL-only types (BOOLEAN, RECORD, associative arrays) need a wrapper with SQL types.',
    'A COMMIT inside the procedure is outside Mule control; plan compensation or idempotency for later failures (e.g. WMS call).',
    'Test with MUnit mocks of db:stored-procedure returning a realistic map, plus an integration test against a dev schema.',
  ],
  solution: `
**1. Configuration.**
\`\`\`xml
<db:stored-procedure config-ref="oracleErp">
  <db:sql>{call ALLOC_PKG.ALLOCATE_ORDER(:p_order_id, :p_dc_code, :p_status, :p_lines)}</db:sql>
  <db:input-parameters>#[{ p_order_id: payload.orderId }]</db:input-parameters>
  <db:in-out-parameters>
    <db:in-out-parameter key="p_dc_code" value="#[payload.preferredDc]"/>
  </db:in-out-parameters>
  <db:output-parameters>
    <db:output-parameter key="p_status" type="VARCHAR"/>
    <db:output-parameter key="p_lines" type="REF_CURSOR"/>  <!-- REF_CURSOR is in the connector's type list; needs a JDBC 4.2 driver (ojdbc8+) -->
  </db:output-parameters>
</db:stored-procedure>
\`\`\`
Every placeholder must be declared exactly once as input, in-out or output. A function call in \`SELECT ... FROM dual\` cannot return OUT parameters, which is why the first attempt failed.

**2. Reading outputs.** The result is a map, e.g. \`payload.p_status\`, \`payload.p_dc_code\`, \`payload.p_lines\`. The cursor is an iterable of rows:
\`\`\`dataweave
%dw 2.0
output application/json
---
{
  orderId: vars.orderId,
  status: payload.p_status,
  dc: payload.p_dc_code,
  lines: payload.p_lines map {
    sku: $.SKU,
    requested: $.QTY_REQUESTED,
    allocated: $.QTY_ALLOCATED,
    lot: $.LOT_NO
  }
}
\`\`\`
Transform it immediately after the call.

**3. Pitfalls.**
- **Empty cursor**: usually the cursor was not declared as an output parameter, the procedure opened it on a different query path, or it was read after the connection had been released. Read it right after the call.
- **Column names** come back in upper case unless aliased with quotes.
- **PL/SQL-only types** (BOOLEAN, RECORD, associative arrays): ask for a wrapper procedure with NUMBER/VARCHAR2 or SQL object types, e.g. \`p_allow_substitutes IN VARCHAR2 -- 'Y'/'N'\`.
- **Commits inside the procedure**: the allocation is committed regardless of Mule. If the WMS call fails, either retry the WMS call idempotently or call a \`DEALLOCATE_ORDER\` compensation. For the retry, allocation already exists for the order, so the procedure should return the existing allocation on a repeated call.
- **Errors**: \`RAISE_APPLICATION_ERROR\` surfaces as \`DB:QUERY_EXECUTION\` with the ORA code in the description; map business codes (e.g. ORA-20001 order not found) to APP errors and 4xx responses.

**4. Testing.** MUnit: mock \`db:stored-procedure\` to return a map with \`p_status\`, \`p_dc_code\` and an array for \`p_lines\`; test PARTIAL/BACKORDER branches and error mapping. Plus an integration test against a dev schema in CI to catch signature changes.
`,
  followUps: [
    {
      q: 'Why use {call ...} instead of a BEGIN ... END; block?',
      a: 'The JDBC escape syntax lets the driver register OUT parameters cleanly. An anonymous PL/SQL block also works with bind variables but is harder to read and maintain.',
    },
    {
      q: 'What if the procedure returns 50,000 lines?',
      a: 'Stream the cursor and write it out incrementally (e.g. deferred output to a file or chunks to the WMS) instead of building one big JSON in memory, and set a sensible fetch size.',
    },
    {
      q: 'How do you protect the ERP from too many concurrent allocation calls?',
      a: 'Limit flow maxConcurrency and the DB pool size for this config, and agree on an SLA with the ERP team; if needed queue requests and process them at a controlled rate.',
    },
  ],
}
