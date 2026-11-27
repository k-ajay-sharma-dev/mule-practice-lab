// The guided lab snowflake-copy. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, OPS, sawLogs, until, withProp } from '../platform-kit.js'
import { ADMIN_USER, addFile, defaultSnowflakeSystem, ETL_PROPS, ETL_SECRETS, rowsOf, runWorksheet, script, unloadedFiles } from '../platform-snowflake.js'
import { POS_COPY, POS_FLOW, posCsv } from './snowflake-copy.pkg.js'

const TABLE = 'BRIGHTMART_DW.RAW.POS_SALES'
const STAGE = 'BRIGHTMART_DW.RAW.POS_STAGE'
const FILES = [
  ['store_101_20261102.csv', 101, 8, 0],
  ['store_102_20261102.csv', 102, 8, 6],
  ['store_103_20261102.csv', 103, 7, 0],
]
const TOTAL = 23
const y = (s) => s.snowflake
const sales = (s) => rowsOf(y(s), TABLE)
const unique = (rows) => new Set(rows.map((r) => r.RECEIPT_ID)).size === rows.length
const adminRan = (s, re, rows = 0) => (y(s)?.queries ?? []).some((q) => q.ok && q.user === ADMIN_USER && re.test(q.sql) && q.rows >= rows)
const onError = (s) => String(app(s, POS_COPY)?.props['snowflake.copy.onError'] ?? '').trim().toUpperCase()

function account(now) {
  const x = defaultSnowflakeSystem(now)
  script(
    x,
    `CREATE TABLE BRIGHTMART_DW.RAW.POS_SALES (RECEIPT_ID VARCHAR(20), STORE VARCHAR(10), SOLD_AT TIMESTAMP_NTZ, SKU VARCHAR(20), QTY NUMBER(6,0), AMOUNT NUMBER(10,2));
    CREATE FILE FORMAT BRIGHTMART_DW.RAW.CSV_POS TYPE = CSV SKIP_HEADER = 1;
    CREATE STAGE BRIGHTMART_DW.RAW.POS_STAGE URL = 's3://brightmart-pos-exports/sales/' STORAGE_INTEGRATION = BRIGHTMART_S3_INT FILE_FORMAT = (FORMAT_NAME = 'BRIGHTMART_DW.RAW.CSV_POS');
    GRANT SELECT, INSERT ON TABLE BRIGHTMART_DW.RAW.POS_SALES TO ROLE LOADER; GRANT USAGE ON STAGE BRIGHTMART_DW.RAW.POS_STAGE TO ROLE LOADER;
    GRANT USAGE ON FILE FORMAT BRIGHTMART_DW.RAW.CSV_POS TO ROLE LOADER;`,
    now,
  )
  // the stores write their files to S3 at the end of the day (lab-made: the files of the external stage live in the lab)
  for (const [name, store, n, bad] of FILES) addFile(x, STAGE, name, posCsv(store, '2026-11-02', n, bad), at(0, 22, store - 100))
  return x
}

const lab = {
  id: 'p-snowflake-copy',
  group: 'Data and cloud',
  title: 'One bad till line keeps a whole night out of Snowflake',
  minutes: 25,
  scenario: `The Brightmart stores write their till lines of the day to S3, and at 02:00 ${POS_COPY} runs COPY INTO POS_SALES from the external stage @POS_STAGE. This morning POS_SALES has nothing for Monday, and the store dashboards are empty. It is Tuesday 09:00. Find why, load the night without losing a row, and get the one broken line in with the value the store gives you.`,
  start() {
    let s = newPlatform({ clock: at(1, 1, 50), apps: [newApp(POS_COPY, { props: { ...ETL_PROPS }, secrets: { ...ETL_SECRETS }, store: {} })], snowflake: account(at(0)) })
    s = until(s, at(1, 8, 50))
    s.mail.push({
      t: at(1, 8, 50),
      to: OPS,
      subject: 'No store sales for Monday in Snowflake',
      body: 'Hello. POS_SALES has no rows for Monday 2 November, so the store dashboards are empty. We spoke to the stores. Store 102 says the till crashed at 14:05 and one line was written with the amount N/A: receipt R-102-0006, one H-2000, the amount was 12.50. They cannot write the file again today. Please load the night and keep every line. Brightmart finance',
      source: 'Brightmart finance',
    })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the mail of finance', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(POS_COPY),
    {
      title: 'Check the files without loading them',
      how: "Snowflake, Worksheets. With the context BRIGHTMART_DW.RAW run: COPY INTO POS_SALES FROM @POS_STAGE VALIDATION_MODE = RETURN_ERRORS; It parses every file, loads nothing, and returns each bad row with its file, line, column and the whole rejected record.",
      done: (s) => adminRan(s, /POS_SALES[\s\S]*VALIDATION_MODE/i),
    },
    ask(
      'Which ON_ERROR',
      'The 02:00 COPY uses the default ON_ERROR = ABORT_STATEMENT. One line of 23 is bad. Which setting loads the night and loses nothing?',
      [
        'SKIP_FILE: the bad file of store 102 is left out',
        'CONTINUE: every good row loads, the bad row is rejected and stays visible to VALIDATE with the query ID of the load, so you can fix it and insert it',
        'ABORT_STATEMENT with FORCE = TRUE',
        'ERROR_ON_COLUMN_COUNT_MISMATCH = FALSE',
      ],
      1,
      'ABORT_STATEMENT, the default for COPY, loads nothing when any row fails, across all files of the statement. SKIP_FILE drops the whole file of store 102, 7 good lines with it. CONTINUE loads the good rows, marks the file PARTIALLY_LOADED, and keeps the rejected rows for VALIDATE. Only CONTINUE needs a step after it: someone must look at the rejected rows, or they are lost quietly.',
    ),
    {
      title: 'Set ON_ERROR = CONTINUE in the app',
      how: `Runtime Manager, ${POS_COPY}, Settings, Properties. Add snowflake.copy.onError with the value CONTINUE and Apply Changes.`,
      done: (s) => app(s, POS_COPY)?.status === 'Running' && onError(s) === 'CONTINUE',
    },
    {
      title: 'Load the night',
      how: `Runtime Manager, ${POS_COPY}, Schedules: tick ${POS_FLOW} and Run. The logs show store_102 PARTIALLY_LOADED and the query ID of the load. Snowflake, Copy History shows the three files.`,
      done: (s) => sales(s).length >= TOTAL - 1 && unique(sales(s)) && unloadedFiles(y(s), TABLE, STAGE).length === 0,
    },
    {
      title: 'Find the rejected row',
      how: `Snowflake, Worksheets: SELECT * FROM TABLE(VALIDATE(POS_SALES, JOB_ID => 'the query ID from the log')); JOB_ID => '_last' works only in the session that ran the COPY, and that was the app, not your worksheet. Query History has the ID too.`,
      done: (s) => adminRan(s, /VALIDATE\s*\(/i, 1),
    },
    {
      title: 'Insert the corrected line',
      how: "In the worksheet, with the values of REJECTED_RECORD and the amount from the mail: INSERT INTO POS_SALES VALUES ('R-102-0006', '102', '2026-11-02 14:05:00', 'H-2000', 1, 12.50); Then SELECT COUNT(*) FROM POS_SALES; gives 23.",
      done: (s) => {
        const rows = sales(s)
        const fixed = rows.filter((r) => r.RECEIPT_ID === 'R-102-0006')
        return rows.length === TOTAL && unique(rows) && fixed.length === 1 && fixed[0].AMOUNT === 12.5
      },
    },
    ask(
      'When the store sends a fixed file',
      'Tomorrow store 102 uploads a corrected store_102_20261102.csv with the same name. What happens at 02:00, and what should you do?',
      [
        'Nothing loads, because the file name is in the load metadata',
        'The checksum changed, so COPY sees a new file and loads all 8 lines again: 7 duplicates and a second R-102-0006. Ask the store not to send it, or delete those rows first, or load it into a staging table and MERGE on RECEIPT_ID',
        'COPY replaces the old rows of the file',
        'COPY fails with a duplicate error',
      ],
      1,
      'The load metadata keeps the name and the checksum (ETag or MD5) of each loaded file for 64 days. Same name and same checksum: skipped. A changed file is a new file to COPY, and COPY only appends. Snowflake has no primary key that stops duplicates, so an idempotent load needs a MERGE on the business key.',
    ),
  ],
  why: 'COPY INTO uses ON_ERROR = ABORT_STATEMENT by default, so one bad value stops every file of the statement. Check first with VALIDATION_MODE = RETURN_ERRORS, which loads nothing and lists each bad row. Choose ON_ERROR by what you can afford to lose: CONTINUE loads the good rows and keeps the rejected ones for VALIDATE(table, JOB_ID => query ID), SKIP_FILE or SKIP_FILE_n drop whole files. With CONTINUE someone must read the rejects, so log the query ID, alert on PARTIALLY_LOADED, and fix and insert the rows. In the lab the files of the external S3 stage live in the lab itself.',
  docs: 'https://docs.snowflake.com/en/sql-reference/sql/copy-into-table',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${POS_COPY}`)
    s = runWorksheet(s, 'COPY INTO POS_SALES FROM @POS_STAGE VALIDATION_MODE = RETURN_ERRORS').state
    s = withProp(s, POS_COPY, 'snowflake.copy.onError', 'CONTINUE')
    s = runNow(s, POS_COPY, POS_FLOW)
    s = runWorksheet(s, `SELECT * FROM TABLE(VALIDATE(POS_SALES, JOB_ID => '${s.snowflake.rejects[TABLE].qid}'))`).state
    return runWorksheet(s, "INSERT INTO POS_SALES VALUES ('R-102-0006', '102', '2026-11-02 14:05:00', 'H-2000', 1, 12.50)").state
  },
  answers: { 3: 1, 8: 1 },
}

export const LABS = [lab]
