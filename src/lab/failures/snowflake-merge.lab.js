// The guided lab snowflake-merge. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, OPS, sawLogs, until } from '../platform-kit.js'
import { ADMIN_USER, defaultSnowflakeSystem, ETL_PROPS, ETL_SECRETS, rowsOf, runWorksheet, script, tableAt, viewAt } from '../platform-snowflake.js'
import { CRM_MERGE, MERGE_FLOW } from './snowflake-merge.pkg.js'

const CUSTOMERS = 'HARBOR_DW.RAW.CUSTOMERS'
const STAGING = 'HARBOR_DW.RAW.CUSTOMER_CHANGES'
const VIEW = 'HARBOR_DW.RAW.CUSTOMER_CHANGES_V'
const COLS = 'CUSTOMER_ID VARCHAR(20), NAME VARCHAR(100), EMAIL VARCHAR(100), TIER VARCHAR(10), UPDATED_AT TIMESTAMP_NTZ'
const y = (s) => s.snowflake
const customers = (s) => rowsOf(y(s), CUSTOMERS)
const unique = (rows) => new Set(rows.map((r) => r.CUSTOMER_ID)).size === rows.length

// the view is right when it gives one row per customer, the latest, for staging rows with the same key twice
const TEST = [
  ['C-9001', 'Test One', 'one@test.example', 'SILVER', '2026-11-03 08:00:00'],
  ['C-9001', 'Test One', 'one@test.example', 'GOLD', '2026-11-03 09:00:00'],
  ['C-9002', 'Test Two', 'two@test.example', 'BRONZE', '2026-11-03 08:30:00'],
]
function viewDedupes(s) {
  if (!viewAt(y(s), VIEW) || !tableAt(y(s), STAGING)) return false
  const x = structuredClone(y(s))
  tableAt(x, STAGING).rows = TEST.map((r) => [...r])
  try {
    const r = script(x, `SELECT * FROM ${VIEW}`)
    const rows = r.rows.map((v) => Object.fromEntries(r.cols.map((c, i) => [c, v[i]])))
    return rows.length === 2 && rows.find((o) => o.CUSTOMER_ID === 'C-9001')?.TIER === 'GOLD' && ['NAME', 'EMAIL', 'TIER', 'UPDATED_AT'].every((c) => r.cols.includes(c))
  } catch {
    return false
  }
}

function account(now) {
  const x = defaultSnowflakeSystem(now)
  script(
    x,
    `CREATE TABLE HARBOR_DW.RAW.CUSTOMERS (${COLS}); CREATE TABLE HARBOR_DW.RAW.CUSTOMER_CHANGES (${COLS});
    INSERT INTO HARBOR_DW.RAW.CUSTOMERS VALUES
      ('C-1001', 'Quay Deli', 'buying@quaydeli.example', 'SILVER', '2026-10-12 10:00:00'),
      ('C-1002', 'Pier Cafe', 'info@piercafe.example', 'BRONZE', '2026-10-20 15:30:00'),
      ('C-1003', 'Harbor Fish Market', 'office@fishmarket.example', 'GOLD', '2026-09-01 09:00:00'),
      ('C-1004', 'Lighthouse Inn', 'desk@lighthouse.example', 'SILVER', '2026-10-02 11:15:00'),
      ('C-1005', 'Dock 7 Coffee', 'beans@dock7.example', 'BRONZE', '2026-10-30 08:20:00'),
      ('C-1006', 'Seawall Grocers', 'shop@seawall.example', 'SILVER', '2026-10-25 17:45:00');
    CREATE VIEW HARBOR_DW.RAW.CUSTOMER_CHANGES_V AS SELECT * FROM HARBOR_DW.RAW.CUSTOMER_CHANGES;
    CREATE FILE FORMAT HARBOR_DW.RAW.CSV_CUSTOMERS TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"';
    CREATE STAGE HARBOR_DW.RAW.CUSTOMER_STAGE FILE_FORMAT = (FORMAT_NAME = 'HARBOR_DW.RAW.CSV_CUSTOMERS');
    GRANT SELECT, INSERT, UPDATE ON TABLE HARBOR_DW.RAW.CUSTOMERS TO ROLE LOADER;
    GRANT SELECT, INSERT, TRUNCATE ON TABLE HARBOR_DW.RAW.CUSTOMER_CHANGES TO ROLE LOADER;
    GRANT SELECT ON VIEW HARBOR_DW.RAW.CUSTOMER_CHANGES_V TO ROLE LOADER;
    GRANT READ, WRITE ON STAGE HARBOR_DW.RAW.CUSTOMER_STAGE TO ROLE LOADER; GRANT USAGE ON FILE FORMAT HARBOR_DW.RAW.CSV_CUSTOMERS TO ROLE LOADER;`,
    now,
  )
  return x
}

const lab = {
  id: 'p-snowflake-merge',
  group: 'Data and cloud',
  title: 'A new customer twice, and then the merge fails',
  minutes: 25,
  scenario: `${CRM_MERGE} keeps CUSTOMERS in Snowflake in step with the CRM. Every 30 minutes it loads the changes into the staging table CUSTOMER_CHANGES and runs a MERGE from the view CUSTOMER_CHANGES_V into CUSTOMERS. Since this morning the dashboard shows the new customer C-5003 twice, and the 09:30 run failed. It is Tuesday 09:40. Find the cause, fix the merge so it cannot happen again, and clean up CUSTOMERS.`,
  start() {
    const schedules = [{ flow: MERGE_FLOW, type: 'fixed', value: '30', unit: 'minutes', enabled: true, at: at(1, 9), busyUntil: 0, last: null }]
    let s = newPlatform({ clock: at(1, 8, 30), apps: [newApp(CRM_MERGE, { props: { ...ETL_PROPS }, secrets: { ...ETL_SECRETS }, store: {}, schedules })], snowflake: account(at(0)) })
    s = until(s, at(1, 9, 35))
    s.mail.push({
      t: at(1, 9, 35),
      to: OPS,
      subject: 'C-5003 is in the customer dashboard twice',
      body: 'Hello. New Pier Bakery, C-5003, was created in the CRM at 08:41 and moved to GOLD at 08:52. The dashboard now counts it twice, once SILVER and once GOLD, so the GOLD totals are off. And Pier Cafe, C-1002, changed twice this morning but Snowflake still shows the old data. Harbor CRM analytics',
      source: 'Harbor CRM analytics',
    })
    return until(s, at(1, 9, 40))
  },
  steps: [
    { title: 'Read the mail of CRM analytics', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(CRM_MERGE),
    {
      title: 'Find the keys that are there twice',
      how: 'Snowflake, Worksheets: SELECT CUSTOMER_ID, COUNT(*) FROM CUSTOMERS GROUP BY CUSTOMER_ID HAVING COUNT(*) > 1; Run the same on CUSTOMER_CHANGES, the batch the 09:30 run left behind.',
      done: (s) => (y(s)?.queries ?? []).some((q) => q.ok && q.user === ADMIN_USER && /HAVING/i.test(q.sql) && /COUNT/i.test(q.sql) && q.rows >= 1),
    },
    ask(
      'One cause, two symptoms',
      'At 09:00 C-5003 came twice in one batch and was inserted twice. At 09:30 C-1002 came twice and the MERGE failed with 100090 Duplicate row detected during DML action. Why the different outcome?',
      [
        'C-1002 is locked by the dashboard',
        'MERGE matches each source row against the target as it was before the statement. C-5003 was not in CUSTOMERS, so both source rows were NOT MATCHED and both were inserted. C-1002 was there, so one target row joined two source rows, and with ERROR_ON_NONDETERMINISTIC_MERGE = TRUE, the default, Snowflake refuses to pick one',
        'The second run used another warehouse',
        'Snowflake has a primary key on CUSTOMER_ID that stopped the second run',
      ],
      1,
      'A MERGE source must have at most one row per key. Snowflake does not enforce primary keys, so nothing stops two inserts of the same new key. For an existing key the update is nondeterministic, and the default ERROR_ON_NONDETERMINISTIC_MERGE = TRUE turns that into error 100090 instead of a random winner.',
    ),
    {
      title: 'Make the view give one row per customer',
      how: 'In the worksheet: CREATE OR REPLACE VIEW CUSTOMER_CHANGES_V COPY GRANTS AS SELECT * FROM CUSTOMER_CHANGES QUALIFY ROW_NUMBER() OVER (PARTITION BY CUSTOMER_ID ORDER BY UPDATED_AT DESC) = 1; QUALIFY filters on the window function, so only the latest change of each customer is left. COPY GRANTS keeps the SELECT grant of LOADER; without it the role loses the view.',
      done: viewDedupes,
    },
    {
      title: 'Remove the extra C-5003 row',
      how: "Keep the latest row of C-5003: DELETE FROM CUSTOMERS WHERE CUSTOMER_ID = 'C-5003' AND TIER = 'SILVER'; Then the HAVING query on CUSTOMERS returns no rows.",
      done: (s) => {
        const rows = customers(s)
        const c = rows.filter((r) => r.CUSTOMER_ID === 'C-5003')
        return unique(rows) && c.length === 1 && c[0].TIER === 'GOLD'
      },
    },
    {
      title: 'Run the merge again',
      how: `Runtime Manager, ${CRM_MERGE}, Schedules: tick ${MERGE_FLOW} and Run. The batch of 09:30 is still in CUSTOMER_CHANGES, so this run merges it: C-1002 gets the change of 09:20. Check it in the worksheet: SELECT * FROM CUSTOMERS WHERE CUSTOMER_ID = 'C-1002';`,
      done: (s) => {
        const v = viewAt(y(s), VIEW)
        const last = app(s, CRM_MERGE)?.schedules.find((x) => x.flow === MERGE_FLOW)?.last
        const c = customers(s).find((r) => r.CUSTOMER_ID === 'C-1002')
        return Boolean(v && last?.ok && last.t >= v.created && c?.TIER === 'GOLD' && c.UPDATED_AT === '2026-11-03 09:20:00') && unique(customers(s))
      },
    },
    ask(
      'A quicker fix',
      'A colleague suggests ALTER SESSION SET ERROR_ON_NONDETERMINISTIC_MERGE = FALSE in the app instead. Good idea?',
      [
        'Yes, it is the fix Snowflake recommends',
        'No. The error goes away, but Snowflake then updates C-1002 with any one of its source rows, maybe the older one, and the duplicate inserts of new keys stay. Deduplicate the source on the key, keeping the latest change',
        'Yes, if the warehouse is larger',
        'No, because the parameter does not exist',
      ],
      1,
      'Make the source deterministic: one row per key, chosen by a rule such as the latest UPDATED_AT. QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY ts DESC) = 1 is the usual pattern, in the view, in a subquery in USING, or in the load into staging.',
    ),
  ],
  why: 'MERGE needs a source with one row per key. Snowflake does not enforce primary keys, and NOT MATCHED is decided against the target as it was before the statement, so two rows of a new key are both inserted. Two rows of an existing key make the update nondeterministic, and the default ERROR_ON_NONDETERMINISTIC_MERGE = TRUE fails the MERGE with 100090 Duplicate row detected during DML action. Deduplicate the source with QUALIFY ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated DESC) = 1, keep the grants with COPY GRANTS when you replace a view, clean up the rows already doubled, and let a failed batch stay in staging so the next run merges it.',
  docs: 'https://docs.snowflake.com/en/sql-reference/sql/merge',
  solve(start) {
    let s = mark(mark(start, 'inbox'), `logs:${CRM_MERGE}`)
    s = runWorksheet(s, 'SELECT CUSTOMER_ID, COUNT(*) FROM CUSTOMERS GROUP BY CUSTOMER_ID HAVING COUNT(*) > 1').state
    s = runWorksheet(s, 'CREATE OR REPLACE VIEW CUSTOMER_CHANGES_V COPY GRANTS AS SELECT * FROM CUSTOMER_CHANGES QUALIFY ROW_NUMBER() OVER (PARTITION BY CUSTOMER_ID ORDER BY UPDATED_AT DESC) = 1').state
    s = runWorksheet(s, "DELETE FROM CUSTOMERS WHERE CUSTOMER_ID = 'C-5003' AND TIER = 'SILVER'").state
    return runNow(s, CRM_MERGE, MERGE_FLOW)
  },
  answers: { 3: 1, 7: 1 },
}

export const LABS = [lab]
