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
      prompt: 'Without pooling, a job opens a new SQL Server connection, with encrypt=true, for each of 50,000 single row lookups. Each query takes 2 ms on the server, yet the job is slow. What does a connection pool change?',
      options: [
        'The pool keeps compiled plans on the client, so the server skips compiling them',
        'The pool keeps the result sets in memory, so repeated lookups skip the server',
        'The lookups share one open transaction, so they commit together and run faster',
        'Lookups reuse open connections, so login and TLS are paid once per connection',
      ],
      answer: 3,
      explain: 'Opening a connection costs a TCP connect, a TLS handshake and a login, far more than a 2 ms query. A pool keeps connections open and lends them out again. Plan caching happens on the server, not in the pool. A pool does not cache results, and each borrowed connection still runs its own transactions.',
    },
    {
      type: 'single',
      prompt: 'Flows wait and then fail to get a connection, while SQL Server shows few active queries. What is a likely cause?',
      options: [
        'The pool is so large that SQL Server refuses the extra logins',
        'Connections are held and not returned, such as by unread streams',
        'SQL Server is blocking queries, so they wait on locks',
        'The DNS lookup for the server is slow at month end',
      ],
      answer: 1,
      explain: 'Typical causes are a streamed result set that is never fully read, or long transactions. Blocked queries would show as active on the server. A select with streaming keeps its connection until the stream is consumed or closed. Unread streams leak connections.',
    },
    {
      type: 'multi',
      prompt: 'A job runs 16 parallel flows per worker against a pool of 5. At month end flows hang for minutes waiting for a connection, then fail. Which pooling profile changes help?',
      options: [
        'Raise maxPoolSize toward the real concurrency, within what the DBA allows',
        'Raise minPoolSize to 16, which raises the maximum to match',
        'Set maxWait, so a flow fails clearly instead of hanging for minutes',
        'Set maxIdleTime to 0, so idle connections go back to the flows at once',
      ],
      answer: [0, 2],
      explain: 'Size the pool for concurrent work, and set a wait so a busy pool fails clearly rather than hanging. minPoolSize only sets how many connections stay open, it never raises the maximum. A maxIdleTime of 0 means idle connections never expire, and it does not hand connections out any faster.',
    },
    {
      type: 'single',
      prompt: 'An app has max concurrency 32 on its listener, a pool of 5, and runs on 4 workers. How many connections can SQL Server see from it?',
      options: ['5', '20', '32', '128'],
      answer: 1,
      explain: 'Each worker has its own pool of five, so 4 times 5 is 20. The other 27 concurrent events per worker wait for a connection.',
    },
    {
      type: 'single',
      prompt: 'A month end MERGE gets a bad plan and runs for 40 minutes, holding its connection and locks, while other flows queue behind those locks. Which setting would have stopped it early?',
      options: [
        'maxWait on the pooling profile of the Database config',
        'A login timeout on the SQL Server connection',
        'A query timeout on the Database operation',
        'A reconnection strategy on the Database config',
      ],
      answer: 2,
      explain: 'A query timeout cancels a statement that runs too long, which frees its connection and its locks. maxWait limits how long a flow waits for a free connection, and the login timeout limits how long a connect takes. A reconnection strategy acts on lost connections, not on a slow query.',
    },
    {
      type: 'single',
      prompt: 'Why can a pool fill with broken connections after a database failover?',
      options: [
        'Failover resets the SQL logins, so pooled sessions lose their rights',
        'Pooled connections still point to the old server and fail on use',
        'The pool closes all connections at failover and opens none again',
        'The new server rejects connections opened before the failover time',
      ],
      answer: 1,
      explain: 'They fail on first use unless they are tested or the app reconnects. A validation query on borrow, or a reconnection strategy, replaces dead connections.',
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
