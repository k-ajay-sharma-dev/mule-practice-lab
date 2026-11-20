export default {
  id: 'ms-297',
  category: 'mulesoft',
  title: 'Isolation Levels in SQL Server: Read Committed, Snapshot, Serializable and the Risks of NOLOCK',
  level: 'ADVANCED',
  tags: ['myproject', 'sql-server', 'isolation-levels', 'rcsi', 'nolock', 'consistency'],
  estMinutes: 22,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the default isolation level in SQL Server?',
      options: ['Read uncommitted', 'Read committed', 'Repeatable read', 'Serializable'],
      answer: 1,
      explain: 'Under plain read committed, readers take short shared locks and wait for writers. Azure SQL Database turns on read committed snapshot by default.',
    },
    {
      type: 'single',
      prompt: 'What does READ_COMMITTED_SNAPSHOT ON change?',
      options: [
        'Readers under read committed skip locked rows instead of waiting',
        'Readers see the last committed row version instead of waiting',
        'Read committed behaves like read uncommitted, with no read locks',
        'Each transaction sees data as of its start, for all its statements',
      ],
      answer: 1,
      explain: 'Readers under read committed get the last committed version of each row from the version store in tempdb. Seeing data as of the transaction start is SNAPSHOT isolation. Readers stop blocking on writers and writers stop blocking on readers. The cost is row versions kept in tempdb.',
    },
    {
      type: 'multi',
      prompt: 'What can go wrong when an extract uses WITH (NOLOCK)?',
      options: [
        'It can read rows that are later rolled back',
        'It can skip rows or read the same row twice when pages split or move during the scan',
        'It can fail with a data movement error',
        'It can block store updates while the extract runs',
      ],
      answer: [0, 1, 2],
      explain: 'NOLOCK is read uncommitted. It takes no shared locks, so it does not block writers, which is why it was added. For a feed to the planning platform, missing or doubled rows mean wrong stock or sales.',
    },
    {
      type: 'single',
      prompt: 'What does SNAPSHOT isolation give that read committed snapshot does not?',
      options: [
        'Readers that never wait for writers, unlike read committed snapshot',
        'One consistent view for the whole transaction, as of its start',
        'Row versions kept in memory instead of in tempdb',
        'Writers that never block other writers on the same row',
      ],
      answer: 1,
      explain: 'Read committed snapshot gives a consistent view per statement. SNAPSHOT keeps it for the whole transaction, and needs ALLOW_SNAPSHOT_ISOLATION on.',
    },
    {
      type: 'single',
      prompt: 'Under SNAPSHOT isolation, two transactions update the same row. What happens to the second one?',
      options: [
        'It overwrites the first, and the last write wins',
        'It fails with an update conflict and must be retried',
        'It waits, then updates the new version of the row',
        'It is chosen as a deadlock victim with error 1205',
      ],
      answer: 1,
      explain: 'This is error 3960. It waits for the first to finish, and fails if the first commits. Snapshot detects the conflict instead of losing an update. The app must handle the error with a retry.',
    },
    {
      type: 'match',
      prompt: 'Match each level to its behaviour.',
      pairs: [
        ['Read uncommitted', 'Reads changes that are not committed yet'],
        ['Read committed', 'Reads only committed data, each statement on its own'],
        ['Repeatable read', 'Rows read stay locked until the end, but new rows can appear'],
        ['Serializable', 'Ranges are locked, so no new rows appear in what was read'],
      ],
      explain: 'Higher levels give more consistency at the cost of more locking and blocking.',
    },
  ],
  description: `
Larkfield Grocers extracts daily sales and on hand stock from SQL Server for the planning platform. The extract blocked store updates, so a developer added \`WITH (NOLOCK)\` to every query. Since then, the platform sometimes reports sales totals that do not match the store system, and once a store had two rows for the same item.

**Questions**
1. What isolation level is in play, and why did the extract block?
2. What does NOLOCK do, and why are the totals wrong?
3. What would you use instead?
4. How do you get one consistent view across several queries?
`,
  answerTemplate: `## Default behaviour and blocking

## What NOLOCK does

## A better option

## One consistent view
`,
  keyPoints: [
    'The default is read committed with shared locks, unless RCSI is on.',
    'NOLOCK reads uncommitted data and can skip or double rows.',
    'Read committed snapshot stops readers and writers blocking each other.',
    'RCSI costs tempdb space for row versions.',
    'SNAPSHOT gives one view for the whole transaction.',
    'Snapshot update conflicts need a retry.',
  ],
  solution: `
**1. Default behaviour and blocking.** The database ran plain read committed. The long extract took shared locks and waited for writers, and writers waited for it.

**2. What NOLOCK does.** It runs the read as read uncommitted. It can return rows that are later rolled back, and while it scans, page splits can make it skip rows or read a row twice. That explains the totals that did not match and the doubled item.

**3. A better option.** Turn on \`READ_COMMITTED_SNAPSHOT\` for the database, after the DBA checks tempdb capacity and tests the main apps. Readers then see the last committed row version and do not block or get blocked by writers. Then remove the NOLOCK hints.

**4. One consistent view.** If the extract runs several queries that must match, such as sales lines and their totals, enable \`ALLOW_SNAPSHOT_ISOLATION\` and run them in one transaction with \`SET TRANSACTION ISOLATION LEVEL SNAPSHOT\`. All queries then see the data as it was at the start of that transaction.
`,
  followUps: [
    {
      q: 'Does RCSI change how writers behave?',
      a: 'Writers still lock rows and block other writers. Code that relied on readers waiting for writers may need review.',
    },
    {
      q: 'How would you set the isolation level from Mule?',
      a: 'In a transactional scope you can set the isolation level, or run SET TRANSACTION ISOLATION LEVEL in a procedure. Check what your connector version supports.',
    },
    {
      q: 'Is NOLOCK ever acceptable?',
      a: 'For rough monitoring queries where an approximate count is fine. Never for data that feeds orders, stock or money.',
    },
  ],
}
