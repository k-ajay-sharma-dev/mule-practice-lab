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
      prompt: 'On an on premises SQL Server database with default settings, a Mule extract runs a SELECT while a store update holds an uncommitted change on a row the SELECT needs. What does the SELECT do?',
      options: [
        'It waits until the update commits or rolls back, then reads the committed row',
        'It reads the last committed version of the row from tempdb, without waiting',
        'It reads the uncommitted change, since the default level takes no read locks',
        'It skips the locked row and returns the other rows without waiting',
      ],
      answer: 0,
      explain: 'The default level is read committed, and on premises read committed snapshot is off by default. Readers take short shared locks and wait for writers. Reading the last committed version is what read committed snapshot does, which Azure SQL Database turns on by default. Reading uncommitted data is NOLOCK, and skipping locked rows needs the READPAST hint.',
    },
    {
      type: 'single',
      prompt: 'The DBA turns on READ_COMMITTED_SNAPSHOT. An extract runs two SELECTs in one read committed transaction, and a store update commits between them. What does the extract see?',
      options: [
        'Both SELECTs see the data as of the start of the extract transaction',
        'The first SELECT waited for the update to commit, so both see the new value',
        'Both see the update before it commits, since the setting removes read locks',
        'The second SELECT sees the committed update, as each statement gets its own view',
      ],
      answer: 3,
      explain: 'Under read committed snapshot each statement reads the last committed version of each row as of the start of that statement, from the version store in tempdb. The first SELECT did not wait and saw the old value, and the second sees the new one. Seeing data as of the transaction start is SNAPSHOT isolation. Readers never see uncommitted data under this setting.',
    },
    {
      type: 'multi',
      prompt: 'What can go wrong when an extract uses WITH (NOLOCK)?',
      options: [
        'It can read rows that are later rolled back',
        'It can skip rows or read the same row twice when pages split or move during the scan',
        'It can fail with a data movement error',
        'It can block store updates while the extract runs',
        'It can return row versions from tempdb that are minutes old',
        'It takes a shared lock on the whole table for the length of the scan',
      ],
      answer: [0, 1, 2],
      explain: 'NOLOCK is read uncommitted. It can read rows that are rolled back later, skip or double rows when pages move, and fail with error 601 when data moves under the scan. It takes no shared locks, so it does not block writers and takes no table lock, which is why it was added. Row versions in tempdb belong to snapshot isolation and RCSI, not NOLOCK. For a feed to the planning platform, missing or doubled rows mean wrong stock or sales.',
    },
    {
      type: 'single',
      prompt: 'An extract reads stock and sales in two SELECTs whose totals must agree, while stores keep writing. The extract must not block the store writers. What do you use?',
      options: [
        'Read committed snapshot, which keeps one view for the whole transaction',
        'WITH (NOLOCK) on both SELECTs, so the extract takes no locks at all',
        'SNAPSHOT isolation for the extract, with ALLOW_SNAPSHOT_ISOLATION on',
        'SERIALIZABLE for the extract, which gives one view without blocking writers',
      ],
      answer: 2,
      explain: 'SNAPSHOT keeps one consistent view for the whole transaction, as of its start, and readers do not block writers. Read committed snapshot gives a consistent view per statement only, so the two SELECTs can disagree. NOLOCK can read uncommitted, missing or doubled rows. SERIALIZABLE gives consistency by holding locks, which blocks the writers.',
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
