import { design, flow, handler, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-074',
  category: 'flows',
  title: 'Nightly Oracle Stored Procedure and Settlement File to SFTP',
  level: 'BEGINNER',
  tags: ['oracle', 'stored-procedure', 'sftp', 'scheduler', 'csv', 'batch-file'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The job runs nightly on a cron Scheduler', rule: { type: 'source', component: 'scheduler', where: { strategy: 'cron' } } },
    {
      label: 'The settlement is prepared by calling the Oracle stored procedure',
      rule: { type: 'exists', component: 'db-stored-procedure', where: { database: 'Oracle' } },
    },
    { label: 'The prepared rows are selected after the procedure has run', rule: { type: 'before', first: 'db-stored-procedure', then: 'db-select' } },
    { label: 'The rows are turned into the file format before writing', rule: { type: 'before', first: 'transform', then: 'sftp-write' } },
    {
      label: 'The file is written under a temporary name and renamed when complete',
      rule: { type: 'before', first: 'sftp-write', then: 'sftp-rename' },
    },
    {
      label: 'Operations are notified by email when the job fails',
      rule: { type: 'inside', component: 'email-send', within: ['on-error-propagate', 'on-error-continue'] },
    },
  ],
  referenceFlow: design(
    flow(
      'nightly-settlement-export',
      source('scheduler', { strategy: 'cron', expression: '0 30 2 * * ?' }),
      [
        step('set-variable', { variableName: 'businessDate', value: '#[(now() - |P1D|) as Date]' }),
        // IN p_business_date, OUT p_batch_id, OUT p_row_count (output parameters land in payload)
        step('db-stored-procedure', {
          database: 'Oracle',
          sql: '{ call PKG_SETTLEMENT.PREPARE_DAILY(:p_business_date, :p_batch_id, :p_row_count) }',
        }),
        step('set-variable', { variableName: 'batchId', value: '#[payload.p_batch_id]' }),
        step('db-select', {
          database: 'Oracle',
          sql: 'SELECT MERCHANT_ID, TERMINAL_ID, TXN_COUNT, GROSS_AMOUNT, FEE_AMOUNT, NET_AMOUNT, CURRENCY\nFROM SETTLEMENT_EXPORT\nWHERE BATCH_ID = :batchId\nORDER BY MERCHANT_ID, TERMINAL_ID',
        }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/csv separator=";", header=true\n---\npayload map {\n  merchant: $.MERCHANT_ID,\n  terminal: $.TERMINAL_ID,\n  count: $.TXN_COUNT,\n  gross: $.GROSS_AMOUNT as String {format: "0.00"},\n  fee: $.FEE_AMOUNT as String {format: "0.00"},\n  net: $.NET_AMOUNT as String {format: "0.00"},\n  currency: $.CURRENCY\n}',
        }),
        step('set-variable', { variableName: 'fileName', value: '#["SETTLEMENT_" ++ (vars.businessDate as String {format: "yyyyMMdd"}) ++ ".csv"]' }),
        step('sftp-write', { path: '#["/inbound/settlement/" ++ vars.fileName ++ ".tmp"]', mode: 'OVERWRITE' }),
        step('sftp-rename', { path: '#["/inbound/settlement/" ++ vars.fileName ++ ".tmp"]', to: '#[vars.fileName]' }),
        step('db-update', {
          database: 'Oracle',
          sql: "UPDATE SETTLEMENT_BATCH SET STATUS = 'EXPORTED', EXPORTED_AT = SYSTIMESTAMP, FILE_NAME = :fileName WHERE BATCH_ID = :batchId",
        }),
        step('logger', { level: 'INFO', message: '#["Settlement " ++ vars.fileName ++ " delivered for batch " ++ (vars.batchId as String)]' }),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Settlement export failed: " ++ error.description]' }),
          step('email-send', { toAddresses: 'payments-ops@example.com', subject: 'Nightly settlement export FAILED' }),
        ]),
      ],
    ),
  ),
  description: `
A payment processor settles card transactions with its **acquiring bank** every night.

The settlement logic already exists in **Oracle** as this stored procedure:

\`PKG_SETTLEMENT.PREPARE_DAILY(p_business_date IN DATE, p_batch_id OUT NUMBER, p_row_count OUT NUMBER)\`

It aggregates the previous day's transactions (~2 million) into \`SETTLEMENT_EXPORT\` rows (~12,000 merchants/terminals) for a new batch.

The bank collects a semicolon-separated file \`SETTLEMENT_yyyyMMdd.csv\` from its **SFTP server** (\`/inbound/settlement\`) at **04:00**.

**Requirements**
- Run at **02:30** every night for the previous business date.
- The bank must never pick up an **incomplete file**.
- Mark the batch as exported in Oracle.
- The payments operations team must be emailed when the export fails, so they can rerun it before 04:00.

**Design the flow.** What do you need in the project to connect to Oracle?
`,
  answerTemplate: `## Trigger

## Calling the stored procedure

## Building the file

## Delivering the file safely

## Failure notification

## Oracle connection setup
`,
  keyPoints: [
    'Scheduler with a cron expression (0 30 2 * * ?) and an explicit time zone.',
    'Database Stored Procedure with { call PKG_SETTLEMENT.PREPARE_DAILY(:p_business_date, :p_batch_id, :p_row_count) }: input parameter for the date, output parameters for the batch ID and row count.',
    'Heavy aggregation stays in Oracle; Mule only selects the prepared rows (parameterised by batch ID) and formats them as CSV with DataWeave.',
    'Write the file as .tmp and rename it when complete, so the bank never reads a half-written file.',
    'On Error Propagate logs and emails operations; the batch is only marked EXPORTED after the rename succeeded.',
    'Oracle config: db:oracle-connection (host, port 1521, service name or instance, user, password from secure properties) and the ojdbc driver as a dependency.',
  ],
  solution: `
1. **Scheduler** cron \`0 30 2 * * ?\` (time zone of the business, e.g. \`Europe/Amsterdam\`).
2. **Set Variable** \`businessDate\` = yesterday.
3. **Database Stored Procedure** (Oracle config): \`{ call PKG_SETTLEMENT.PREPARE_DAILY(:p_business_date, :p_batch_id, :p_row_count) }\` with \`p_business_date\` as an **input parameter** and \`p_batch_id\`, \`p_row_count\` declared as **output parameters** (NUMERIC). The output values are in the result payload; keep \`batchId\`.
4. **Database Select** the export rows for that batch, parameterised (\`:batchId\`), ordered.
5. **Transform** to CSV (\`separator=";"\`, header, amounts formatted with two decimals).
6. **SFTP Write** \`SETTLEMENT_yyyyMMdd.csv.tmp\` (OVERWRITE, so a rerun replaces a broken attempt) → **SFTP Rename** to \`SETTLEMENT_yyyyMMdd.csv\`. The bank only collects the final name, so it sees no file under that name until the write has finished. The connector docs do not call rename atomic, so that part depends on the bank's SFTP server.
7. **Database Update** \`SETTLEMENT_BATCH\` → EXPORTED with the file name. Log the result.
8. **On Error Propagate** (ANY) → log + **Email Send** to payments operations with the error description.

**Oracle setup:** \`db:config\` with \`db:oracle-connection\` (host, port 1521, service name, user, password in secure properties), the **ojdbc** driver added as a dependency/shared library, and a pooling profile sized for a nightly job (small).
`,
  followUps: [
    {
      q: 'The procedure takes 40 minutes on month-end. What should you check?',
      a: 'The query timeout on the Stored Procedure operation and any network/idle timeouts between Mule and Oracle, and whether the 04:00 deadline still holds. Alternatively let Oracle run it via DBMS_SCHEDULER and have Mule export once the batch status is READY.',
    },
    {
      q: 'How would you handle a rerun if the file was already renamed but the database update failed?',
      a: 'Make the run idempotent: the procedure should reuse an existing batch for the same business date, and the write uses OVERWRITE on the .tmp name followed by a rename with overwrite, so rerunning produces the same file again.',
    },
    {
      q: 'What if the procedure returned the rows as a REF CURSOR instead?',
      a: 'Declare the cursor as an output parameter and transform the result directly, which saves the separate Select. The docs do not mention REF CURSOR by name: they say result sets from a procedure stream automatically when the JDBC driver supports multiple open results, so test it with the ojdbc driver.',
    },
  ],
}
