export default {
  id: 'ms-306',
  category: 'mulesoft',
  title: 'Batch Aggregator Bulk Insert Into Oracle Staging With a Row by Row Fallback',
  level: 'ADVANCED',
  tags: ['myproject', 'oracle', 'batch', 'bulk-insert', 'staging', 'rejects'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'Why use a batch aggregator in front of a Database Bulk insert?',
      options: [
        'To sort records',
        'It collects records into blocks of a set size, so each bulk insert sends many rows in one batched call',
        'It validates records',
        'It commits the batch job',
      ],
      answer: 1,
      explain: 'One round trip per block instead of per record cuts load time a lot on large files.',
    },
    {
      type: 'single',
      prompt: 'What does a JDBC bulk insert do with the rows you pass?',
      options: [
        'Builds one huge INSERT text',
        'Prepares one INSERT and binds each row as a batch entry, sent together to the database',
        'Runs one insert per row with a commit each',
        'Writes a file for SQL*Loader',
      ],
      answer: 1,
      explain: 'This is array binding. The SQL is parsed once and the values travel in a batch.',
    },
    {
      type: 'single',
      prompt: 'One row in a block of 500 is too long for its column. What happens to the block?',
      options: [
        'Only that row fails and the rest are stored',
        'The bulk call fails, and you cannot always tell from the error which rows were written and which was bad, so treat the block as failed',
        'Oracle trims the value',
        'The batch job stops',
      ],
      answer: 1,
      explain: 'Drivers report batch failures in different ways. A clear rule is: if the block fails, roll it back and retry row by row.',
    },
    {
      type: 'multi',
      prompt: 'What does a row by row fallback after a failed block give you?',
      options: [
        'Good rows in the block are still loaded',
        'Each bad row is found with its own ORA error, which goes to a reject table',
        'The load is as fast as a bulk insert',
        'Counts of loaded and failed rows per block',
      ],
      answer: [0, 1, 3],
      explain: 'The fallback is slow, so it runs only for failed blocks. Most blocks still go in bulk.',
    },
    {
      type: 'single',
      prompt: 'The fallback inserts rows that the failed bulk call had already written. How do you avoid duplicates?',
      options: [
        'Ignore it',
        'Run the bulk insert in a transaction for the block and roll it back on failure, or make the row insert a MERGE on the key',
        'Delete the whole staging table',
        'Use a smaller block',
      ],
      answer: 1,
      explain: 'A Try scope with a transaction around the bulk insert makes the block all or nothing.',
    },
    {
      type: 'single',
      prompt: 'Where should the counts of loaded and failed records be written at the end?',
      options: [
        'Only in the console log',
        'In the On Complete phase, from the batch job result, into the job log table and the log',
        'In each step for each record',
        'Nowhere',
      ],
      answer: 1,
      explain: 'On Complete sees totals for the job. Add your own counts for rows that the fallback rejected.',
    },
  ],
  description: `
Larkfield Grocers loads item and barcode messages into Oracle staging tables. Large files go through a batch job. A batch aggregator collects records and a Bulk insert writes them, with the block size from a property. When one row is bad, the whole block fails, and good rows in that block are lost. The team wants good rows loaded and bad rows in a reject table with the reason.

**Questions**
1. Why use an aggregator with Bulk insert, and how do you pick the size?
2. What happens when one row in a block is bad?
3. Design a fallback that loads the good rows and rejects the bad ones.
4. How do you report counts at the end?
`,
  answerTemplate: `## Aggregator and bulk insert

## A bad row in a block

## The fallback

## Counts
`,
  keyPoints: [
    'The aggregator builds blocks. Bulk insert binds each block in one batched call.',
    'Make the block size a property and tune it.',
    'A failed block is treated as failed as a whole.',
    'Roll back the block, then insert rows one by one to isolate bad ones.',
    'Bad rows go to a reject table with the ORA code and message.',
    'On Complete writes loaded, failed and total counts to the job log.',
  ],
  solution: `
**1. Aggregator and bulk insert.** The aggregator collects records into a list of a set size. The Bulk insert operation prepares one INSERT and binds each row as a batch entry, so the block travels in one call. Keep the size in a property, start near 500 to 2,000 rows, and tune it from tests. Larger blocks use more memory and make a failure cost more.

**2. A bad row in a block.** One ORA-12899 or ORA-01400 fails the bulk call. Drivers differ in what they report about which rows were written. The safe rule is that the block failed.

**3. The fallback.** Put the bulk insert in a Try scope with a transaction, so a failure rolls back the whole block. In the error handler, loop over the block with For Each and insert each row in its own Try. A row that fails goes to the reject list with its key, ORA code and message. Bulk insert the reject list into the reject table at the end of the block. Log the block number and staging table name, so support can find it.

**4. Counts.** Count loaded and rejected rows per block in variables you can sum, or write them per block to a job log table. In On Complete, read the batch job result totals and the reject counts, write them to the job log row for the run and log one summary line.
`,
  followUps: [
    {
      q: 'Oracle has DML error logging. How would it help?',
      a: 'With a table made by DBMS_ERRLOG.CREATE_ERROR_LOG, an INSERT ... LOG ERRORS INTO the error table REJECT LIMIT UNLIMITED keeps good rows and writes bad ones to it. It is set based, so check with the DBA that it fits the load.',
    },
    {
      q: 'Why not use a block size of 50,000?',
      a: 'The block sits in memory, a failure means a slow row by row pass over many rows, and a long transaction holds locks and undo.',
    },
    {
      q: 'Why commit per block and not once at the end?',
      a: 'A single transaction for a whole large file grows undo and holds locks for a long time. Per block commits with a run ID let you clean up a failed run by deleting its rows.',
    },
  ],
}
