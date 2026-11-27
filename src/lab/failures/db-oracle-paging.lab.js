// The guided lab db-oracle-paging. See platform-labs.js for the shape of a lab.
import { at, mark, newApp, newPlatform, runNow } from '../platform.js'
import { app, ask, change, sawLogs, until } from '../platform-kit.js'
import { settingsOf } from './db-oracle-paging.pkg.js'

const NAME = 'customer-export-nightly'
const FLOW = 'customer-export-flow'
const PROPS = { 'db.host': 'ora02.harbor.lab', 'export.mode': 'single', 'page.size': '5000', 'db.fetchSize': '10', 'db.query.timeout': '60' }
const running = (s) => app(s, NAME)?.status === 'Running'
const set = (s) => settingsOf({ ...app(s, NAME)?.props, ...app(s, NAME)?.secrets })
const last = (s) => app(s, NAME)?.store?.last
const good = (s) => ['keyset', 'stream'].includes(set(s).mode) && (set(s).mode === 'stream' || (set(s).page >= 1000 && set(s).page <= 20000))

const lab = {
  id: 'p-db-oracle-paging',
  group: 'Databases and queues',
  title: 'The nightly Oracle export runs out of memory',
  minutes: 15,
  scenario:
    'customer-export-nightly writes every customer of Harbor Retail from Oracle to a CSV file at 02:00. The reports read that file at 06:00. The table passed 4 million rows last month, and last night the replica restarted during the export. The budget stays at 0.1 vCores.',
  start: () => until(newPlatform({ clock: at(0, 12), apps: [newApp(NAME, { props: { ...PROPS } })] }), at(1, 9)),
  steps: [
    sawLogs(NAME),
    ask(
      'Read the error',
      'Which line explains the restart?',
      ['DB:CONNECTIVITY, ORA-12541: TNS:no listener', 'java.lang.OutOfMemoryError: Java heap space, while the rows were read for the Build CSV transform', 'DB:QUERY_EXECUTION, the query has timed out', 'FILE:ACCESS_DENIED on the share'],
      1,
      'The heap filled up, the JVM ended and the platform started the replica again. The stack shows the CSV writer of DataWeave growing its buffer while it writes the whole result.',
    ),
    { title: 'Check the heap in Monitoring', how: `Monitoring, Built-in dashboards, ${NAME}, JVM tab. Choose a time range that has 02:00 in it.`, done: (s) => Boolean(s.seen[`dash:${NAME}:JVM`]) },
    ask(
      'Find the cause',
      'The Database connector streams the rows of a Select. Why did the heap still fill up?',
      ['Oracle sent the rows too fast', 'The Transform after the Select builds one CSV of all 4 million rows, so every row ends up in the heap at the same time', 'The fetch size was too large', 'The replica has too many threads'],
      1,
      'Streaming only helps if the rows that follow are handled piece by piece. A Transform that writes the whole result in one go, or a variable that holds it, reads the stream to the end and keeps everything in memory.',
    ),
    {
      title: 'Try pages with OFFSET',
      how: `A teammate proposes pages. Settings, Properties: export.mode is offset and page.size is 5000. Apply Changes, then Schedules, ${FLOW}, Run. Each page runs SELECT ... ORDER BY customer_id OFFSET n ROWS FETCH NEXT 5000 ROWS ONLY. Read the page times in the log.`,
      done: (s) => Boolean(app(s, NAME)?.store?.triedOffset),
    },
    ask(
      'Why deep pages are slow',
      'Page 1 took about 1.4 seconds. Page 400 took about 51 seconds, and a later page passed the 60 second query timeout. Why?',
      ['Oracle caches the first pages only', 'To reach OFFSET 2,000,000 Oracle still reads the 2 million rows before the page and throws them away, so every page costs more than the one before', 'The fetch size gets smaller on each page', 'The network slows down at night'],
      1,
      'OFFSET says how many rows to skip, and skipping still means finding them in sort order. The work grows with the depth of the page, so the whole export grows with the square of the table size.',
    ),
    ask(
      'ORDER BY',
      'Why must a paged query have an ORDER BY on a unique key such as customer_id?',
      ['It makes the query faster', 'Without a fixed order the database may return rows in a different order on each query, so pages can repeat some rows and miss others', 'Oracle refuses FETCH NEXT without it'],
      1,
      'The Oracle SQL reference says to add an ORDER BY for consistent results. Each page is a separate query, and only a deterministic order on a unique key makes the pages fit together.',
    ),
    ask(
      'ROWNUM on an older database',
      'OFFSET and FETCH NEXT came with Oracle 12c. On an older database a teammate writes SELECT ... FROM harbor.customers WHERE ROWNUM <= 5000 ORDER BY customer_id. What does it return?',
      [
        'The 5000 lowest customer IDs',
        'Any 5000 rows, sorted afterwards. Oracle assigns ROWNUM before the ORDER BY runs, so sort in an inline view first: SELECT * FROM (SELECT ... ORDER BY customer_id) WHERE ROWNUM <= 5000',
        'An error, ROWNUM cannot be used with ORDER BY',
      ],
      1,
      'ROWNUM numbers the rows as the query finds them, before the sort. A page of the old style needs the ORDER BY in an inner query and ROWNUM outside it, and for a later page one more outer query that keeps the rows whose saved row number is above the rows to skip. That has the same deep page cost as OFFSET, so keyset paging is still the better choice on any version.',
    ),
    {
      title: 'Page by key instead',
      how: 'Set export.mode to keyset and keep page.size at 5000, then Apply Changes. Each page is SELECT ... WHERE customer_id > :lastId ORDER BY customer_id FETCH NEXT 5000 ROWS ONLY, where lastId is the last ID of the page before. The index on customer_id goes straight to the first row of the page, so every page costs the same. export.mode stream, one ordered Select read as a stream in a For Each with batchSize, is another good fix.',
      done: (s) => running(s) && good(s),
    },
    ask(
      'Fetch size',
      'What does db.fetchSize, the fetchSize of the Select, change?',
      ['The total number of rows the query returns', 'How many rows the driver brings from Oracle in one round trip; with 10, 4 million rows take 400,000 round trips', 'The size of the CSV file', 'The number of pages'],
      1,
      'Fetch size is how many rows the driver reads from the database in one round trip. The Oracle JDBC driver reads 10 rows at a time unless you set it. Max rows is the setting that caps the total.',
    ),
    {
      title: 'Raise the fetch size',
      how: 'Set db.fetchSize to 1000 and Apply Changes. Fewer round trips make each page faster, and 1000 rows of a few columns are a small piece of the heap.',
      done: (s) => running(s) && set(s).fetch >= 100 && set(s).fetch <= 10000,
    },
    {
      title: 'Run the export',
      how: `Schedules, ${FLOW}, Run. The log shows every page with the same time, the export ends long before 06:00, and on the JVM tab the heap stays low.`,
      done: (s) => running(s) && good(s) && last(s)?.ok === true && ['keyset', 'stream'].includes(last(s).mode) && last(s).fetch >= 100 && !last(s).late,
    },
  ],
  why: 'A large export needs the rows to move through the app in pieces: stream the Select and process it in a For Each or a Batch Job, or read pages by key. OFFSET pages are correct with an ORDER BY on a unique key while no rows are added or removed during the run, yet each deeper page costs more because the skipped rows are still read. Keyset pages use the index and cost the same at any depth. Fetch size sets the rows per round trip. The lab models the time of a page and the size of the heap with fixed numbers per row.',
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-select',
  solve(start) {
    let s = mark(mark(start, `logs:${NAME}`), `dash:${NAME}:JVM`)
    const props = () => app(s, NAME).props
    s = runNow(change(s, NAME, { props: { ...props(), 'export.mode': 'offset', 'page.size': '5000' } }), NAME, FLOW)
    s = change(s, NAME, { props: { ...props(), 'export.mode': 'keyset', 'db.fetchSize': '1000' } })
    return runNow(s, NAME, FLOW)
  },
  answers: { 1: 1, 3: 1, 5: 1, 6: 1, 7: 1, 9: 1 },
}

export const LABS = [lab]
