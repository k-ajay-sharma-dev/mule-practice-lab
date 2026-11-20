export default {
  id: 'inc-062',
  category: 'incidents',
  title: 'ORA-00001 on Every New Purchase Order After a Database Migration',
  level: 'BEGINNER',
  tags: ['myproject', 'supply-chain', 'oracle', 'database', 'sequences', 'purchase-orders'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: 'Sun 23:58:10 INFO  [dba] Migration to new Oracle 19c host complete; sequences recreated from DDL script', relevant: true, why: 'Recreating a sequence from a DDL script resets it to its START WITH value unless the current value is carried over.' },
      { text: 'Mon 07:02:14.118 INFO  [po-sapi] POST /purchase-orders supplier=SUP-118 lines=14', relevant: false },
      { text: 'Mon 07:02:14.402 ERROR [po-sapi] DB:QUERY_EXECUTION ORA-00001: unique constraint (SCM.PK_PO_HEADER) violated', relevant: true, why: 'The new PO ID already exists: the sequence is handing out IDs that were used before the migration.' },
      { text: 'Mon 07:02:14.405 ERROR [po-sapi] Returning 500 for POST /purchase-orders corrId=e118', relevant: false },
      { text: 'Mon 07:05:00.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: 'Mon 07:10:22.700 INFO  [dba-query] SELECT PO_SEQ.NEXTVAL -> 1021 ; SELECT MAX(po_id) FROM PO_HEADER -> 118990', relevant: true, why: 'The sequence is far below the highest existing ID. IDs from 1000 upwards are already taken, so every insert collides until it passes 118990.' },
      { text: 'Mon 07:11:00.000 INFO  [po-sapi] GET /purchase-orders/118811 200 (35 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the root cause of the ORA-00001 errors?',
        options: [
          'PO_SEQ was recreated at 1000, so new IDs collide with existing POs',
          'Buyers submit each PO twice because the first attempt returns 500',
          'The primary key index was not rebuilt after the data copy',
          'po-sapi retries each insert, and the retry collides with the first',
        ],
        answer: 0,
        explain: 'NEXTVAL (1021) is far below MAX(po_id). Every ID the sequence hands out was already used, so the primary key rejects it.',
      },
      {
        type: 'single',
        prompt: 'What is the correct **immediate** fix?',
        options: [
          'Disable the primary key constraint until the DBA has checked the data',
          'Have the DBA move PO_SEQ above MAX(po_id), then retry the failed POs',
          'Rebuild the PK_PO_HEADER index online and resubmit the failed POs',
          'Generate po_id in DataWeave from a timestamp plus a random suffix',
        ],
        answer: 1,
        explain: 'The sequence must start above the highest existing value (with some margin). Disabling the key would create real duplicate POs. The index is not broken; it correctly rejects IDs that exist. IDs made in the app bypass the sequence and can still collide.',
      },
      {
        type: 'multi',
        prompt: 'What should **prevent** this next time?',
        options: [
          'A post-migration check comparing every sequence with MAX of the column it feeds',
          'Migrating sequences with their current values, not from the original DDL',
          'A smoke test that creates a test PO after any database change',
          'A read-only smoke test that fetches a few known POs after the migration',
        ],
        answer: [0, 1, 2],
        explain: 'Verify sequences and run a real write test after migrations. Reads worked all along, so a read-only test would have passed.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 07:00, buyers cannot create purchase orders: every \`POST /purchase-orders\` to \`po-sapi\` returns 500.
- Reading existing POs works fine.

## Change / Context
- Over the weekend the DBA team migrated the SCM schema to a new Oracle 19c server. Data was copied, and **sequences were recreated from the original DDL script** (\`CREATE SEQUENCE PO_SEQ START WITH 1000 ...\`).
- \`po-sapi\` inserts with \`INSERT INTO PO_HEADER (po_id, ...) VALUES (PO_SEQ.NEXTVAL, ...)\`.

## Logs
\`\`\`
07:02:14.118 INFO  [po-sapi] POST /purchase-orders supplier=SUP-118 lines=14
07:02:14.402 ERROR [po-sapi] DB:QUERY_EXECUTION ORA-00001: unique constraint (SCM.PK_PO_HEADER) violated
07:02:14.405 ERROR [po-sapi] Returning 500 for POST /purchase-orders corrId=e118
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
    'ORA-00001 on the primary key means the generated ID already exists.',
    'PO_SEQ was recreated from DDL during the migration, so it restarted at 1000 while existing IDs run from 1000 up to 118990.',
    'Immediate: set the sequence above MAX(po_id) with margin, then replay the failed PO requests; reads were never affected.',
    'Do not disable constraints or delete data.',
    'Prevention: migrate sequences with their current values, check sequence vs MAX(column) after migrations, run a write smoke test.',
  ],
  solution: `
**Diagnosis.** \`ORA-00001: unique constraint (SCM.PK_PO_HEADER) violated\` means the new \`po_id\` already exists. The migration recreated \`PO_SEQ\` from the original DDL, so it restarted at 1000, while existing purchase orders use every ID from 1000 up to **118990**. Every NEXTVAL collides with an old PO. Reads work because they do not use the sequence.

**Immediate mitigation.** The DBA moves the sequence above the current maximum, for example \`ALTER SEQUENCE PO_SEQ RESTART START WITH 120000\` (Oracle 18c and later) or drop and recreate with that START WITH (re-granting privileges). Then the buyers (or a replay from the logs) resubmit the failed POs. Check the other sequences in the schema the same way.

**Root cause.** The migration plan treated sequences as DDL objects instead of data with a current value, and there was no write test after the migration.

**Permanent fix.** All sequences aligned with their tables; the migration runbook updated to export sequences with their current values (Data Pump does this) or to reset them from \`MAX(column)\`.

**Prevention.** A post-migration script that compares each sequence's value with the max of the column it feeds; a smoke test that creates (and cancels) a test PO after any DB change; alert on spikes of **DB:QUERY_EXECUTION** errors.
`,
  followUps: [
    { q: 'Why not use an identity column instead of a sequence?', a: 'Oracle 12c+ identity columns are backed by a sequence too, so a migration can still reset them; the real fix is to carry over or verify the current value.' },
    { q: 'How would you tell this apart from a genuine duplicate request?', a: 'A duplicate request would collide on a business key such as supplier + external PO number, not on a sequence-generated primary key, and it would affect only some requests, not every insert.' },
    { q: 'Can the Mule app recover from ORA-00001 by itself?', a: 'Retrying would only fetch the next colliding value. The app should fail clearly; the data problem must be fixed in the database.' },
  ],
}
