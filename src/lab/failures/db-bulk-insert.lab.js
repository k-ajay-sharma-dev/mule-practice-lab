// The guided lab db-bulk-insert. See platform-labs.js for the shape of a lab.
import { advance, at, HOUR, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, sawLogs, until } from '../platform-kit.js'
import { FLOW, ROWS, settingsOf } from './db-bulk-insert.pkg.js'

const NAME = 'price-file-import'
const PROPS = { 'db.host': 'sql04.harbor.lab', 'insert.mode': 'single', 'bulk.size': '1000', 'tx.scope': 'none', 'bulk.fallback': 'none' }
const running = (s) => app(s, NAME)?.status === 'Running'
const set = (s) => settingsOf({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const last = (s) => app(s, NAME)?.store?.last
const sized = (x) => x.mode === 'bulk' && x.size >= 200 && x.size <= 5000
// the last run used the fixed settings and loaded every good row
const right = (x) => Boolean(x) && x.ok && sized(x) && x.tx === 'per-block' && x.fallback === 'row-by-row' && x.inserted === ROWS - 1 && x.rejected === 1 && x.ms < 10 * 60000

const lab = {
  id: 'p-db-bulk-insert',
  group: 'Databases and queues',
  title: 'An import of 50,000 rows takes an hour',
  minutes: 15,
  scenario:
    'Every night at 01:00 price-file-import empties a staging table on SQL Server and loads the new price file of Harbor Hardware, 50,000 rows. The pricing job reads the table at 02:00. The import now takes almost an hour and last night it finished late. The file also has one bad row most nights.',
  start: () => until(newPlatform({ clock: at(0, 12), apps: [newApp(NAME, { props: { ...PROPS } })] }), at(1, 9)),
  steps: [
    sawLogs(NAME),
    ask(
      'Why an hour',
      'The log says 49,999 rows inserted one at a time in 58 minutes. Where does the time go?',
      ['SQL Server is slow to store prices', 'Each row is its own Insert: a statement, a round trip over the network and a commit, 50,000 times', 'The file is read too slowly', 'The connection pool is too small'],
      1,
      'About 70 ms a row is mostly waiting for the network and the commit. A Bulk insert runs one JDBC batch: the same statement with many sets of values, sent together, so that cost is paid once per block instead of once per row.',
    ),
    {
      title: 'Switch to Bulk insert',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Set insert.mode to bulk and keep bulk.size at 1000, then Apply Changes. The For Each now has batchSize 1000 and passes each list of 1000 rows to the Bulk insert operation. Bulk insert has no batch size of its own: the size of the list you give it is the block.`,
      done: (s) => running(s) && sized(set(s)),
    },
    { title: 'Run it once', how: `Schedules, ${FLOW}, Run. Then read the log of the run.`, done: (s) => Boolean(app(s, NAME)?.store?.triedBulk) },
    ask(
      'Read the result',
      'The run took about half a minute. What happened to the block with the bad row?',
      ['Every row was inserted', 'The bad row was skipped and the rest of its block went in', 'The block failed with a duplicate key. Part of it was written and the rest was not, and the error names the block, not the row number', 'The whole file was rolled back'],
      2,
      'One Bulk insert raised one error for the whole block. Without a transaction this driver kept the rows before the bad one and lost the rest. The JDBC specification lets each driver decide whether a failed batch stops at the bad row or goes on with the rest, so do not count on either.',
    ),
    ask(
      'Transaction size',
      'Which transaction fits this import?',
      ['None, it is faster', 'One transaction per block, so a bad row rolls back only its own block and locks are held for a short time', 'One transaction around the whole file, so it is all or nothing', 'One transaction per row'],
      1,
      'Per block, a failure leaves a known state: the block is in or out. Around the whole file, one bad row throws away 49,999 good rows and holds locks and transaction log for the whole run. Per row is the slow import again.',
    ),
    { title: 'One transaction per block', how: 'Set tx.scope to per-block and Apply Changes. In the app, a Try scope with transactionalAction ALWAYS_BEGIN sits inside the For Each, around the Bulk insert. Its handler is On Error Propagate, which rolls the block back. An On Error Continue on that same Try would commit the transaction, with the rows written before the bad one.', done: (s) => running(s) && set(s).tx === 'per-block' },
    {
      title: 'Find the bad row',
      how: `Set bulk.fallback to row-by-row and Apply Changes. When a block fails, an On Error Continue on an outer Try, after the rollback, inserts the rows of that block one at a time, and only the bad row is rejected with its row number. Then Schedules, ${FLOW}, Run.`,
      done: (s) => right(last(s)),
    },
    ask(
      'Which row',
      'Read the log of the last run. Which row was rejected, and why?',
      ['Row 32,000, a price below zero', 'Row 31,207, sku H-2231, a duplicate key', 'Row 1, the header', 'No row, all 50,000 went in'],
      1,
      'The fallback names the row. Send it to the team that owns the file; the other 49,999 prices are in the table.',
    ),
    ask(
      'Why the transaction matters for the fallback',
      'Suppose you turn on the fallback but leave tx.scope at none. With bulk.size 1000 the fallback would reject 207 rows of block 32, not 1. Why?',
      ['The fallback is broken', 'The 206 rows that were written before the bad row were inserted again, and failed as duplicates of themselves', 'SQL Server rejects every row after an error'],
      1,
      'A retry of a block is only clean if the failed block left nothing behind. The rollback of the block gives that; the fallback then starts from a known state.',
    ),
    {
      title: 'Prove it at 01:00',
      how: 'Move the clock to the next run at 01:00. It must finish in a few minutes on its own, with 49,999 rows inserted and 1 rejected.',
      done: (s) => {
        const run = app(s, NAME)?.schedules.find((x) => x.flow === FLOW)?.last
        return running(s) && right(last(s)) && Boolean(run?.ok) && !run.manual
      },
    },
  ],
  why: 'Row by row inserts pay a round trip and a commit for every row. Bulk insert sends one statement for a list of rows, so group the rows with For Each batchSize or a Batch Aggregator and pass each list to it. Give each block its own transaction: a bad row then rolls back one block, and a row by row fallback for that block finds the bad row without duplicates. A transaction around the whole file turns one bad row into an empty table. The lab models a driver that stops at the bad row; the JDBC specification lets drivers differ.',
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-execute-bulk',
  solve(start) {
    let s = mark(start, `logs:${NAME}`)
    const props = () => app(s, NAME).props
    s = runNow(change(s, NAME, { props: { ...props(), 'insert.mode': 'bulk', 'bulk.size': '1000' } }), NAME, FLOW)
    s = change(s, NAME, { props: { ...props(), 'tx.scope': 'per-block', 'bulk.fallback': 'row-by-row' } })
    s = runNow(s, NAME, FLOW)
    return until(s, at(2, 1) + HOUR / 60)
  },
  answers: { 1: 1, 4: 2, 5: 1, 8: 1, 9: 1 },
}

export const LABS = [lab]
