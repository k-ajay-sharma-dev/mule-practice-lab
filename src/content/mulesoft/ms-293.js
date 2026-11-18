export default {
  id: 'ms-293',
  category: 'mulesoft',
  title: 'Connection Pools for SQL Server in Mule: Pool Size, Waits, Timeouts and Leaks',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'sql-server', 'connection-pool', 'database-connector', 'timeouts', 'performance'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'Why does the Database connector use a connection pool?',
      options: [
        'To encrypt queries',
        'Opening a SQL Server connection with login and TLS is slow, so connections are kept and reused',
        'To store results',
        'To cache query plans',
      ],
      answer: 1,
      explain: 'A pool saves the cost of a new connection per query. Plan caching happens on the server, not in the pool.',
    },
    {
      type: 'single',
      prompt: 'Flows wait and then fail to get a connection, while SQL Server shows few active queries. What is a likely cause?',
      options: [
        'The pool is too large',
        'Connections are held and not returned, for example a streamed result set that is never fully read, or long transactions',
        'The disk is full',
        'Binary mode',
      ],
      answer: 1,
      explain: 'A select with streaming keeps its connection until the stream is consumed or closed. Unread streams leak connections.',
    },
    {
      type: 'multi',
      prompt: 'Which pooling settings matter most?',
      options: [
        'Maximum pool size',
        'Minimum pool size',
        'How long a flow waits for a free connection',
        'The color of the connector in Studio',
      ],
      answer: [0, 1, 2],
      explain: 'Size the pool for concurrent work, and set a wait so a busy pool fails clearly rather than hanging.',
    },
    {
      type: 'single',
      prompt: 'An app has max concurrency 32 on its listener, a pool of 5, and runs on 4 workers. How many connections can SQL Server see from it?',
      options: ['5', '20, five per worker', '32', '128'],
      answer: 1,
      explain: 'Each worker has its own pool. The other 27 concurrent events per worker wait for a connection.',
    },
    {
      type: 'single',
      prompt: 'What does a query timeout on the Database operation protect against?',
      options: [
        'Slow logins',
        'A query that runs too long holding a connection and locks, for example after a bad plan or a blocking chain',
        'Wrong passwords',
        'Large result sets',
      ],
      answer: 1,
      explain: 'Without a query timeout, one stuck query can hold a connection and its locks for a long time.',
    },
    {
      type: 'single',
      prompt: 'Why can a pool fill with broken connections after a database failover?',
      options: [
        'Failover changes passwords',
        'Pooled connections point to the old server and fail on first use, unless they are tested or the app reconnects',
        'Pools cannot hold more than 10',
        'Failover deletes the database',
      ],
      answer: 1,
      explain: 'A validation query on borrow, or a reconnection strategy, replaces dead connections.',
    },
  ],
  description: `
Brindle Outdoor runs a Mule app that writes store sales into SQL Server for the planning extract. It has an HTTP listener and a scheduler, and runs on four workers. At month end, requests start failing with errors about waiting for a connection, yet the DBA sees few active queries.

**Questions**
1. Why does Mule pool connections, and how does the pool work?
2. How do you size the pool?
3. What causes connections to run out when the server is quiet?
4. Which timeouts would you set?
`,
  answerTemplate: `## Why pool

## Sizing

## Running out with a quiet server

## Timeouts
`,
  keyPoints: [
    'A pool reuses connections because new ones are slow.',
    'Each worker or replica has its own pool.',
    'Size for real concurrency and the server limit across all workers.',
    'Unread streams and long transactions hold connections.',
    'Set a wait time for the pool and a query timeout.',
    'Validate or reconnect after failover.',
  ],
  solution: `
**1. Why pool.** Opening a connection means a network round trip, TLS and a login. The Database connector keeps a pool per configuration on each worker, lends a connection to an operation and takes it back when the operation and any result stream are done.

**2. Sizing.** Count the concurrent operations that really need the database, per worker, and multiply by workers to check against what the DBA allows. A bigger pool is not always better, because the server then runs more queries at once and they compete for locks and CPU.

**3. Running out with a quiet server.** Connections are borrowed but not used. Common causes are select results streamed and never fully read, transactions left open while the flow calls slow HTTP services, and Async scopes that hold connections. Find them with the connector debug logs and SQL Server session views, which show sleeping sessions with open transactions.

**4. Timeouts.** A maximum wait for a pooled connection, so a flow fails fast with a clear error. A query timeout on each operation. A login timeout on the connection. A reconnection strategy and a validation step for failovers.
`,
  followUps: [
    {
      q: 'How do you read a large select without holding the connection too long?',
      a: 'Page it with OFFSET and FETCH or a key range, or stream it and make sure the flow consumes the whole stream promptly.',
    },
    {
      q: 'Why should a transaction not include an HTTP call?',
      a: 'The transaction holds a connection and locks while waiting for a remote service. A slow partner then blocks the database.',
    },
    {
      q: 'What does the DBA see when the pool is too large?',
      a: 'Many sessions, more blocking and waits, and higher CPU. Throughput can drop even though more queries run.',
    },
  ],
}
