// The guided lab db-console-plan. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, until } from '../platform-kit.js'
import { dbCtx, defaultDatabases, planForApp, runSql, serverOf, showPlan } from '../platform-db.js'
import { cfgOf, DB, FLOW, NAME, paramsAt, SLOW_SQL } from './db-console-plan.pkg.js'

const TABLE = 'dbo.order_lines'
const ROWS = 60480000
const props = (s) => ({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const running = (s) => app(s, NAME)?.status === 'Running'
const srv = (s) => serverOf(s, DB)
const dayIndex = (s) => srv(s)?.tables[TABLE]?.indexes.find((x) => x.columns[0] === 'shipped_at')
const seekOnDay = (p) => p && p.table === TABLE && p.access.kind === 'seek' && p.access.seekCol === 'shipped_at'
// the plan of the query of the job, with the parameters of the next run
const jobPlan = (s) => planForApp(s, DB, String(props(s)['settlement.sql'] ?? ''), paramsAt(s.clock))
// the rows the query of the job returns now, on a copy of the database, so a rewrite that loses rows is caught
const jobRows = (s, sql) => {
  const copy = { clock: s.clock, apps: [], databases: structuredClone(s.databases) }
  const r = dbCtx(copy, { name: 'lab-check', env: 'Sandbox', config: 0 }).select(DB, cfgOf(props(s)), sql, paramsAt(s.clock))
  return r.ok ? r.rows.map((x) => x.line_id).sort().join(',') : null
}

const lab = {
  id: 'p-db-console-plan',
  group: 'Databases and queues',
  title: 'The nightly query that went from 2 seconds to 4 minutes',
  minutes: 20,
  scenario:
    `${NAME} reads the order lines shipped the day before from SQL Server at 02:00 and writes the settlement file for finance. For a year it took about 2 seconds. On Monday the lines of the northern region, 60 million rows since 2024, were moved into dbo.order_lines. Last night the same job took 4 minutes and the file was late. Nothing in the app changed. Find out why in the execution plan, fix it, and prove the fix in the plan.`,
  start() {
    const databases = defaultDatabases(at(0, 12), { full: true })
    const t = databases.servers[DB].tables[TABLE]
    Object.assign(t, { count: ROWS, distinct: { ...t.distinct, order_id: 54000000 } })
    const s = newPlatform({
      clock: at(0, 12),
      apps: [
        newApp(NAME, {
          props: { 'db.host': 'sql.harbor.lab', 'db.port': '1433', 'db.database': 'HarborOrders', 'db.user': 'mule_etl', 'db.pool.max': '2', 'db.queryTimeout': '0', 'db.fetchSize': '500', 'settlement.sql': SLOW_SQL },
          secrets: { 'db.password': 'Etl-Lab-2026' },
          store: {},
          logs: [
            { t: at(-1, 2), level: 'INFO', text: `Read 590 order lines in 2.2 s (Clustered Index Scan on PK_order_lines, 540,000 rows read)`, logger: 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor', config: 1 },
            { t: at(0, 2), level: 'INFO', text: `Read 602 order lines in 2.2 s (Clustered Index Scan on PK_order_lines, 540,000 rows read)`, logger: 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor', config: 1 },
          ],
        }),
      ],
      databases,
    })
    return until(s, at(1, 9))
  },
  steps: [
    {
      title: 'Show the plan of the nightly query',
      how: `Read settlement.sql in Runtime Manager, ${NAME}, Settings, Properties. Then Databases from the console menu, ${DB}, New Query. Paste the query with a date in place of the parameter, such as '2026-11-02' for :day, and choose Display Estimated Execution Plan.`,
      done: (s) => Boolean(s.seen[`db-plan:${DB}`]) && (srv(s)?.plans ?? []).some((p) => p.table === TABLE),
    },
    ask(
      'Read the plan',
      'What does the plan show?',
      [
        'An Index Seek on IX_order_lines_order_id',
        `A Clustered Index Scan of PK_order_lines that reads all ${ROWS.toLocaleString('en-US')} rows to keep the lines of one day. It always scanned; the table is now 110 times larger, so the scan is too`,
        'A deadlock between the job and the order API',
        'A Key Lookup for every row',
      ],
      1,
      'Click the scan in the plan: Estimated Number of Rows to be Read is the whole table, Estimated Number of Rows is one day. With 540,000 rows a full scan took 2 seconds and nobody noticed. The plan did not change. The data did.',
    ),
    {
      title: 'Create an index on shipped_at',
      how: `In the query window: CREATE INDEX IX_order_lines_shipped_at ON dbo.order_lines (shipped_at) INCLUDE (order_id, sku, qty, amount). The INCLUDE columns let the index answer the query alone, without a Key Lookup per row. Execute, then show the plan of the nightly query again.`,
      done: (s) => Boolean(dayIndex(s)),
    },
    ask(
      'The plan still scans',
      'With the new index the plan of the nightly query is still a scan. Why?',
      [
        'SQL Server needs a restart to use a new index',
        'The WHERE wraps the column in CONVERT(varchar(10), shipped_at, 23). The server must compute that for every row before it can compare, so it cannot seek the index on shipped_at. The predicate is not sargable',
        'The index is on the wrong table',
        'Indexes are only used for ORDER BY',
      ],
      1,
      'An index is sorted by the column value. A function on the column hides that order. Compare the column itself with a range: shipped_at >= :day AND shipped_at < :nextDay. SQL Server makes one exception: CAST(shipped_at AS date) = :day can still seek. A string conversion, YEAR(), UPPER() or DATEDIFF() on the column cannot.',
    ),
    {
      title: 'Make the WHERE sargable',
      how: `Runtime Manager, ${NAME}, Settings, Properties. Change settlement.sql to SELECT line_id, order_id, sku, qty, amount FROM dbo.order_lines WHERE shipped_at >= :day AND shipped_at < :nextDay and Apply Changes. The job binds :nextDay as the day after :day.`,
      done: (s) => running(s) && seekOnDay(jobPlan(s)) && jobRows(s, props(s)['settlement.sql']) === jobRows(s, SLOW_SQL) && jobRows(s, SLOW_SQL) !== null,
    },
    {
      title: 'Verify the fix in the plan',
      how: `Show the estimated plan of the new query in the query window, with the dates in place of :day and :nextDay. It is now an Index Seek on the new index. The rows read drop from the whole table to the lines of one day, and the estimated time in the lab drops from minutes to milliseconds.`,
      done: (s) => (srv(s)?.plans ?? []).some((p) => seekOnDay(p) && p.t >= (dayIndex(s)?.created ?? Infinity)),
    },
    {
      title: 'Run the job',
      how: `Runtime Manager, ${NAME}, Schedules, ${FLOW}, Run. The log shows the Index Seek and a few seconds instead of 4 minutes.`,
      done: (s) => {
        const last = app(s, NAME)?.store?.last
        return Boolean(last?.ok) && last.t >= app(s, NAME).updated && last.access === 'seek' && last.ms < 10000 && last.lines === 4
      },
    },
    ask(
      'Why a parameter',
      'A teammate builds the WHERE as a string: "... WHERE shipped_at >= \'" ++ vars.day ++ "\'". The job uses :day as an input parameter of the Select instead. Why?',
      [
        'Input parameters are only a style choice',
        'The value is sent apart from the SQL, so it cannot change the statement (no SQL injection), and the text of the query stays the same each night, so the server reuses one cached plan',
        'Strings are slower to send',
        'The Database connector does not accept a string query',
      ],
      1,
      'The Database connector sends a prepared statement with the input parameters bound. The value can never become SQL, and every run has the same statement text, so the plan cache keeps one entry for it. A string built each night is a new statement every time and an open door for injection.',
    ),
    ask(
      'Parameter sniffing',
      'One plan is cached for the parameterised query and reused. When can that hurt?',
      [
        'Never, a cached plan is always best',
        'The plan is compiled for the parameter values of the first run. If that run was a day with very few lines and a later day has millions, the reused plan can be bad for it. OPTION (RECOMPILE), OPTIMIZE FOR or a plan forced in Query Store are the usual fixes',
        'Only when the table has no index',
        'Only on Oracle',
      ],
      1,
      'This is parameter sniffing: SQL Server looks at the values of the first call when it compiles the plan. It is good for typical values and can be poor for unusual ones. Oracle has the same effect with bind peeking and answers it with adaptive cursor sharing.',
    ),
  ],
  why: 'A query that scans is fast on a small table and slow on a large one, so data growth turns a hidden scan into an outage. Read the execution plan: a Clustered Index Scan or Table Access Full with many rows read and few rows returned is the sign. Make the predicate sargable, which means comparing the bare column with a value or a range so an index can seek it, and give that column an index. INCLUDE columns make the index cover the query, which removes the Key Lookups. Then verify in the plan and with the real job. Keep queries parameterised for safety and plan reuse, and know that one cached plan per query can suffer from parameter sniffing. In the lab the time of a plan comes from fixed costs per row read.',
  docs: 'https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide',
  solve(start) {
    const day = paramsAt(start.clock)
    const literal = (sql) => sql.replace(':day', `'${day.day}'`).replace(':nextDay', `'${day.nextDay}'`)
    let s = mark(showPlan(start, DB, literal(SLOW_SQL)).state, `db-plan:${DB}`)
    s = runSql(s, DB, 'CREATE INDEX IX_order_lines_shipped_at ON dbo.order_lines (shipped_at) INCLUDE (order_id, sku, qty, amount)').state
    const fixed = 'SELECT line_id, order_id, sku, qty, amount FROM dbo.order_lines WHERE shipped_at >= :day AND shipped_at < :nextDay'
    s = change(s, NAME, { props: { ...app(s, NAME).props, 'settlement.sql': fixed } })
    s = showPlan(s, DB, literal(fixed)).state
    return runNow(s, NAME, FLOW)
  },
  answers: { 1: 1, 3: 1, 7: 1, 8: 1 },
}

export const LABS = [lab]
