// The guided lab snowflake-load-history. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, OPS, until, withProp } from '../platform-kit.js'
import { addFile, asUser, ETL_PROPS, ETL_SECRETS, brightmartOrders, newSnowflake, ordersCsv, rowsOf, runWorksheet, script } from '../platform-snowflake.js'
import { NIGHTLY, NIGHTLY_FLOW } from './snowflake-load-history.pkg.js'

const ORDERS = 'BRIGHTMART_DW.RAW.ORDERS'
const DAYS = [
  ['orders_20261031.csv', 60101, '2026-10-31', at(-1, 1)],
  ['orders_20261101.csv', 60201, '2026-11-01', at(0, 1)],
  ['orders_20261102.csv', 60301, '2026-11-02', at(1, 1)],
]
const PER_DAY = 6
const TOTAL = DAYS.length * PER_DAY
const orders = (s) => rowsOf(s.snowflake, ORDERS)
const clean = (s) => {
  const rows = orders(s)
  return rows.length === TOTAL && new Set(rows.map((r) => r.ORDER_ID)).size === TOTAL
}
// DELETE keeps the load metadata of ORDERS; whether INSERT OVERWRITE does is not documented, so the lab avoids it
const DEDUP_SQL = 'CREATE TABLE ORDERS_DEDUP AS SELECT DISTINCT * FROM ORDERS; DELETE FROM ORDERS; INSERT INTO ORDERS SELECT * FROM ORDERS_DEDUP; DROP TABLE ORDERS_DEDUP;'
const forceOff =(s) => app(s, NIGHTLY)?.status === 'Running' && String(app(s, NIGHTLY)?.props['snowflake.copy.force'] ?? '').trim().toUpperCase() !== 'TRUE'

function account() {
  const y = brightmartOrders(newSnowflake(at(-2)), at(-2))
  // the order system drops one file a night at 01:00 and the 02:00 COPY loads it
  for (const [name, first, date, t] of DAYS) {
    addFile(y, 'BRIGHTMART_DW.RAW.ORDERS_STAGE', name, ordersCsv(first, date, PER_DAY), t)
    script(y, `COPY INTO BRIGHTMART_DW.RAW.ORDERS FROM @BRIGHTMART_DW.RAW.ORDERS_STAGE PATTERN = '.*orders_.*[.]csv'`, t + 60 * 60000, { user: 'MULE_ETL', role: 'LOADER' })
  }
  return y
}

const lab = {
  id: 'p-snowflake-load-history',
  group: 'Data and cloud',
  title: 'The reload that loaded nothing, then everything twice',
  minutes: 25,
  scenario: `Each night at 02:00 ${NIGHTLY} copies the new orders file from @ORDERS_STAGE into ORDERS. This morning Monday's orders were deleted from ORDERS by mistake. Ops ran the nightly load again, and nothing loaded. Then a colleague set FORCE to TRUE and ran it once more: Monday is back, but Saturday and Sunday are now doubled. It is Tuesday 09:00. Put ORDERS right and make the nightly load safe again.`,
  start() {
    let s = newPlatform({ clock: at(1, 7, 50), apps: [newApp(NIGHTLY, { props: { ...ETL_PROPS }, secrets: { ...ETL_SECRETS }, store: {} })], snowflake: account() })
    s = until(s, at(1, 8, 10))
    s.snowflake = structuredClone(s.snowflake)
    // meant for the test rows of 2 October
    asUser(s.snowflake, "DELETE FROM ORDERS WHERE ORDER_DATE = '2026-11-02'", at(1, 8, 10))
    s = until(s, at(1, 8, 30))
    s = runNow(s, NIGHTLY, NIGHTLY_FLOW)
    s = until(s, at(1, 8, 45))
    s = withProp(s, NIGHTLY, 'snowflake.copy.force', 'TRUE')
    s = runNow(s, NIGHTLY, NIGHTLY_FLOW)
    s = until(s, at(1, 8, 55))
    s.mail.push({
      t: at(1, 8, 55),
      to: OPS,
      subject: 'Weekend sales doubled in the dashboard',
      body: `Hello. Monday's orders were missing this morning, now they are back, but Saturday 31 October and Sunday 1 November show twice the orders and twice the revenue. ORDERS should have ${PER_DAY} orders per day for those three days. We close the month on these numbers, please fix it before noon. Brightmart finance`,
      source: 'Brightmart finance',
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Read the copy history of ORDERS',
      how: 'Snowflake from the console menu, Copy History. Each file of the stage was loaded in its night, and again at 08:45 by the forced run. The run at 08:30 is not there: it loaded no file.',
      done: (s) => Boolean(s.seen['snf:copy-history']),
    },
    {
      title: 'Find what removed Monday',
      how: `Snowflake, Query History. Filter on the user PRIYA_DATA: the DELETE at 08:10. Then the COPY of ${NIGHTLY} at 08:30 with the result Copy executed with 0 files processed.`,
      done: (s) => Boolean(s.seen['snf:query-history']),
    },
    ask(
      'Why the first reload did nothing',
      'At 08:30 the COPY ran without an error and loaded nothing, although Monday was gone from the table. Why?',
      [
        'The warehouse was suspended',
        'COPY keeps load metadata per table for 64 days: the name and checksum of each file it loaded. orders_20261102.csv was loaded at 02:00, so COPY skipped it, whatever happened to the rows since. A DELETE does not change the load metadata',
        'The file was removed from the stage after the load',
        'COPY only loads files newer than the last load',
      ],
      1,
      'The load metadata is what makes COPY safe to run again and again: files already loaded are skipped without a word, and the result is Copy executed with 0 files processed. It belongs to the table, not to the rows. TRUNCATE TABLE clears it; DELETE and UPDATE do not.',
    ),
    ask(
      'What FORCE did',
      'Then FORCE = TRUE ran. What did it load?',
      [
        'Only orders_20261102.csv, because only its rows were missing',
        'Every file the PATTERN matches, ignoring the load metadata: Monday came back, and Saturday and Sunday were loaded a second time',
        'Nothing, FORCE only works with PURGE',
        'It replaced the rows of each file',
      ],
      1,
      'FORCE = TRUE loads all matching files again, even unchanged ones that were loaded before. COPY appends; it never replaces rows. FORCE in a scheduled job doubles every file still in the stage on each run.',
    ),
    {
      title: 'Turn FORCE off in the nightly job',
      how: `Runtime Manager, ${NIGHTLY}, Settings, Properties. Set snowflake.copy.force to FALSE, or remove it, and Apply Changes.`,
      done: forceOff,
    },
    {
      title: 'Remove the doubled rows',
      how: `Snowflake, Worksheets, in one run: ${DEDUP_SQL} DELETE and INSERT keep the table, its grants and its load metadata. CREATE OR REPLACE TABLE ORDERS AS SELECT DISTINCT ... would give a new table without the grants of LOADER and without load metadata, so the next night would load every file again; TRUNCATE TABLE clears the metadata too. Check: SELECT ORDER_DATE, COUNT(*) FROM ORDERS GROUP BY ORDER_DATE;`,
      done: clean,
    },
    {
      title: 'Prove the nightly load is safe again',
      how: `Runtime Manager, ${NIGHTLY}, Schedules: tick ${NIGHTLY_FLOW} and Run. The logs say Copy executed with 0 files processed, and ORDERS still has ${TOTAL} orders.`,
      done: (s) => {
        const a = app(s, NIGHTLY)
        const last = a?.schedules.find((x) => x.flow === NIGHTLY_FLOW)?.last
        return forceOff(s) && clean(s) && Boolean(last?.ok) && last.t > a.updated
      },
    },
    ask(
      'The right way to reload one file',
      'Next time a day of rows is lost and must be loaded again from its file. What is the safe way?',
      [
        'Set FORCE = TRUE in the job for one night',
        "Delete what is left of that day, then run once from a worksheet: COPY INTO ORDERS FROM @ORDERS_STAGE FILES = ('orders_20261102.csv') FORCE = TRUE; or load the file into a staging table and MERGE on ORDER_ID",
        'TRUNCATE TABLE ORDERS and wait for the night',
        'Rename the file in the stage',
      ],
      1,
      'FILES = (...) with FORCE = TRUE reloads exactly that file and nothing else. A MERGE on the business key is the idempotent way: it never doubles. TRUNCATE clears the load metadata, so the next COPY reloads every file still in the stage, which is only right when all of them are wanted.',
    ),
  ],
  why: 'COPY INTO keeps load metadata for each table for 64 days: the files it loaded, by name and checksum. That is why a COPY can run any number of times and load each file once, and why a reload after a DELETE quietly loads nothing. FORCE = TRUE ignores the metadata and loads every matching file again, so in a scheduled job it doubles data. TRUNCATE clears the metadata, CREATE OR REPLACE TABLE gives a table with none (and without its grants), DELETE keeps it. To reload one file, use FILES = (...) with FORCE once, or a staging table and MERGE. To remove exact doubles, copy the distinct rows to a scratch table, DELETE from the table and INSERT them back: the table keeps its grants and its load metadata.',
  docs: 'https://docs.snowflake.com/en/user-guide/data-load-considerations-load',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), 'snf:copy-history'), 'snf:query-history')
    s = withProp(s, NIGHTLY, 'snowflake.copy.force', 'FALSE')
    s = runWorksheet(s, DEDUP_SQL).state
    return runNow(s, NIGHTLY, NIGHTLY_FLOW)
  },
  answers: { 3: 1, 4: 1, 8: 1 },
}

export const LABS = [lab]
