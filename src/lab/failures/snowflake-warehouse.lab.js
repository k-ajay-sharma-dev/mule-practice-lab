// The guided lab snowflake-warehouse. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, OPS, sawLogs, until } from '../platform-kit.js'
import { asUser, blockerOf, countOf, defaultSnowflakeSystem, ETL_PROPS, ETL_SECRETS, runWorksheet, unloadedFiles } from '../platform-snowflake.js'
import { LOADER, LOADER_FLOW } from './snowflake-warehouse.pkg.js'

const ORDERS = 'HARBOR_DW.RAW.ORDERS'
const STAGE = 'HARBOR_DW.RAW.ORDERS_STAGE'
const QUOTA = 150
const wh = (s) => s.snowflake?.warehouses?.LOAD_WH
const mon = (s) => s.snowflake?.monitors?.LOAD_MONITOR
const suspendsOk = (s) => wh(s)?.autoSuspend > 0 && wh(s).autoSuspend <= 300
const quotaOk = (s) => Boolean(mon(s) && mon(s).quota <= QUOTA && mon(s).quota > mon(s).used && !blockerOf(s.snowflake, 'LOAD_WH'))
const resumeOk = (s) => wh(s)?.autoResume === true

const lab = {
  id: 'p-snowflake-warehouse',
  group: 'Data and cloud',
  title: 'The orders load stopped when the credits ran out',
  minutes: 25,
  scenario: `${LOADER} loads the web shop orders into Snowflake every 15 minutes: it PUTs a CSV file to @ORDERS_STAGE and runs COPY INTO ORDERS on the warehouse LOAD_WH. Since about 03:00 every load fails, and the sales dashboard has stopped at last night. LOAD_WH sits under the resource monitor LOAD_MONITOR. It is Tuesday 08:00. Find out why, get the load running again within the budget, and make sure no order is lost.`,
  start() {
    const y = defaultSnowflakeSystem(at(0))
    // Friday: the warehouse was set to never suspend, so the dashboards would have no wait in the morning
    asUser(y, 'ALTER WAREHOUSE LOAD_WH SET AUTO_SUSPEND = 0', at(-3, 17, 5))
    Object.assign(y.warehouses.LOAD_WH, { state: 'STARTED', startedAt: at(-3, 17, 5), lastUsed: at(0, 23, 50), suspendedBy: null })
    Object.assign(y.monitors.LOAD_MONITOR, { used: 97.3, fired: [80] })
    let s = newPlatform({ clock: at(1, 0), apps: [newApp(LOADER, { props: { ...ETL_PROPS }, secrets: { ...ETL_SECRETS }, store: {} })], snowflake: y })
    s = until(s, at(1, 6, 30))
    // after the mail of the monitor, someone made sure nothing starts the warehouse again
    s.snowflake = structuredClone(s.snowflake)
    asUser(s.snowflake, 'ALTER WAREHOUSE LOAD_WH SET AUTO_RESUME = FALSE', at(1, 6, 30))
    s = until(s, at(1, 7, 50))
    s.mail.push({
      t: at(1, 7, 50),
      to: OPS,
      subject: 'Snowflake credits for November',
      body: `Hello. LOAD_MONITOR has used up its 100 credits for November on day 3. LOAD_WH ran all weekend: since Friday 17:05 it never suspended, and an X-Small warehouse costs 1 credit an hour while it runs. Finance approves a quota of ${QUOTA} credits for November, not more. Please make LOAD_WH stop when it is idle, about a minute, and get the orders load going again without losing orders. Priya turned AUTO_RESUME off this morning to be safe. Harbor finance and data team`,
      source: 'Harbor finance',
    })
    return until(s, at(1, 8))
  },
  steps: [
    { title: 'Read the mail of finance', how: 'Open the Inbox from the menu under Lab tools. There is also the mail of the resource monitor.', done: (s) => Boolean(s.seen.inbox) },
    sawLogs(LOADER),
    {
      title: 'Look at LOAD_WH and its monitor',
      how: 'Snowflake from the console menu, Admin, Warehouses. Compare Status, Auto suspend and Auto resume of LOAD_WH. Then Admin, Resource Monitors: Used against Credit quota of LOAD_MONITOR.',
      done: (s) => Boolean(s.seen['snf:warehouses']),
    },
    ask(
      'Why the credits ran out',
      'The monthly quota of 100 credits was gone by Tuesday 03:00. Why?',
      [
        'The loads became larger',
        'AUTO_SUSPEND = 0 means the warehouse never suspends. LOAD_WH kept running with nothing to do from Friday 17:05, and a running X-Small warehouse bills 1 credit an hour whether it works or not',
        'The resource monitor counts each query as one credit',
        'PUT uses the warehouse and the files were large',
      ],
      1,
      'Snowflake bills a warehouse per second while it is started, with a minimum of 60 seconds each time it resumes. The work done does not matter. With AUTO_SUSPEND = 0 or NULL it never suspends. A short AUTO_SUSPEND, such as 60 seconds, is the usual setting for a load warehouse that works in short bursts.',
    ),
    {
      title: 'Make LOAD_WH suspend when idle',
      how: "Admin, Warehouses, LOAD_WH, Edit: set Auto suspend to 1 minute and Save Warehouse. Or in a Worksheet: ALTER WAREHOUSE LOAD_WH SET AUTO_SUSPEND = 60;",
      done: suspendsOk,
    },
    {
      title: `Raise the quota to the ${QUOTA} credits finance approved`,
      how: `Admin, Resource Monitors, LOAD_MONITOR, Edit: Credit quota ${QUOTA}, Save. Or in a Worksheet with the role ACCOUNTADMIN: ALTER RESOURCE MONITOR LOAD_MONITOR SET CREDIT_QUOTA = ${QUOTA}; Only ACCOUNTADMIN can change a resource monitor.`,
      done: quotaOk,
    },
    ask(
      'The next load still fails',
      `After the new quota the next run of ${LOADER} fails with 000606: No active warehouse selected in the current session. The warehouse exists and LOADER has USAGE on it. What is left?`,
      [
        'The role LOADER lost its grants',
        'AUTO_RESUME is FALSE. A suspended warehouse with AUTO_RESUME off is not started by a query, and Snowflake answers as if the session had no warehouse. Turn it on, or someone must resume it by hand each time',
        'The monitor needs a day to reset',
        'The app must be restarted to read the new quota',
      ],
      1,
      'With AUTO_RESUME = TRUE the first query on a suspended warehouse starts it, which takes a second or two. With FALSE only ALTER WAREHOUSE ... RESUME starts it, and every query fails until then. The quota alone is not enough: a warehouse that the monitor suspended stays suspended until a query or a person resumes it.',
    ),
    {
      title: 'Turn AUTO_RESUME on again',
      how: 'Admin, Warehouses, LOAD_WH, Edit: tick Auto resume and Save Warehouse. Or: ALTER WAREHOUSE LOAD_WH SET AUTO_RESUME = TRUE;',
      done: resumeOk,
    },
    {
      title: 'See the backlog load and nothing lost',
      how: `Runtime Manager, ${LOADER}, Schedules: tick ${LOADER_FLOW} and Run, or move the clock 15 minutes. The PUTs of the failed runs left their files in the stage, so one COPY loads them all. Check Snowflake, Copy History, and in a Worksheet SELECT COUNT(*) FROM ORDERS; against Databases, HARBOR_DW, RAW, ORDERS_STAGE, where no file is left unloaded. Then Admin, Warehouses: LOAD_WH suspends again a minute after the load.`,
      done: (s) => {
        const a = app(s, LOADER)
        const last = a?.schedules.find((x) => x.flow === LOADER_FLOW)?.last
        return suspendsOk(s) && quotaOk(s) && resumeOk(s) && Boolean(last?.ok) && unloadedFiles(s.snowflake, ORDERS, STAGE).length === 0 && countOf(s.snowflake, ORDERS) === 12 + (a.store.made ?? 0)
      },
    },
  ],
  why: 'A warehouse bills credits for every second it runs, busy or not, with 60 seconds as the minimum per resume. AUTO_SUSPEND decides when it stops; 0 or NULL means never, which is how a small warehouse eats a monthly budget over a weekend. A resource monitor with a SUSPEND trigger stops the warehouses it watches when the quota is used, and they cannot resume until the quota is raised or the period resets. AUTO_RESUME = FALSE then hides the real cause behind 000606, No active warehouse selected. Fix the cause (AUTO_SUSPEND 60), then the budget (CREDIT_QUOTA, ACCOUNTADMIN only), then AUTO_RESUME. Files that were PUT but not copied stay in the stage, and the load metadata makes the next COPY load exactly those, so nothing is lost and nothing loads twice. In the lab the clock bills one minute of credits per lab minute.',
  docs: 'https://docs.snowflake.com/en/user-guide/resource-monitors',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `logs:${LOADER}`), 'snf:warehouses')
    s = runWorksheet(s, 'ALTER WAREHOUSE LOAD_WH SET AUTO_SUSPEND = 60').state
    s = runWorksheet(s, `ALTER RESOURCE MONITOR LOAD_MONITOR SET CREDIT_QUOTA = ${QUOTA}`).state
    s = runWorksheet(s, 'ALTER WAREHOUSE LOAD_WH SET AUTO_RESUME = TRUE').state
    return runNow(s, LOADER, LOADER_FLOW)
  },
  answers: { 3: 1, 6: 1 },
}

export const LABS = [lab]
