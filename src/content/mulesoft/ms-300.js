export default {
  id: 'ms-300',
  category: 'mulesoft',
  title: 'Mule and SQL Server Always On: The Listener, Failover, Read Only Routing and Safe Retries',
  level: 'EXPERT',
  tags: ['myproject', 'sql-server', 'always-on', 'failover', 'high-availability', 'idempotency', 'architecture'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Which host name should the Mule connection use for an Always On availability group?',
      options: [
        'The name of the current primary server',
        'The availability group listener name, which always points to the current primary',
        'Any secondary',
        'The cluster IP of the Mule workers',
      ],
      answer: 1,
      explain: 'The listener moves with the primary. A server name breaks at the first failover.',
    },
    {
      type: 'single',
      prompt: 'The listener has addresses in two subnets. What connection setting helps the driver reconnect fast after a failover?',
      options: [
        'encrypt=false',
        'multiSubnetFailover=true, so the driver tries all listener addresses in parallel',
        'A larger pool',
        'applicationIntent=ReadWrite',
      ],
      answer: 1,
      explain: 'Without it, the driver may try an address that is offline and wait for a timeout before the next one.',
    },
    {
      type: 'single',
      prompt: 'What happens to a Mule transaction that is open on the primary when a failover starts?',
      options: [
        'It moves to the new primary',
        'It is rolled back, the connection breaks, and the app gets an error and must retry the whole unit',
        'It commits automatically',
        'It waits until the old primary returns',
      ],
      answer: 1,
      explain: 'Open transactions do not survive a failover. Committed ones on a synchronous replica do.',
    },
    {
      type: 'single',
      prompt: 'A commit was sent, then the connection dropped before the reply. Did the row get written?',
      options: [
        'Always yes',
        'Unknown. The retry must be idempotent, for example a MERGE on a business key or a check of a run id',
        'Always no',
        'Only on Mondays',
      ],
      answer: 1,
      explain: 'This is the classic unknown outcome. Design writes so that running them twice gives the same result.',
    },
    {
      type: 'multi',
      prompt: 'How can a heavy planning extract avoid loading the primary?',
      options: [
        'Connect through the listener with applicationIntent=ReadOnly, with read only routing set up by the DBA',
        'Accept that a secondary may lag slightly behind the primary',
        'Use a separate connection config for reads and writes',
        'Point the writes at a secondary',
      ],
      answer: [0, 1, 2],
      explain: 'Secondaries are read only. An asynchronous secondary can lag, so check that the extract can live with that.',
    },
    {
      type: 'single',
      prompt: 'Why can a failover to an asynchronous commit replica lose data?',
      options: [
        'It cannot',
        'Transactions committed on the old primary may not have reached the asynchronous replica yet',
        'Asynchronous replicas have no logs',
        'Mule deletes data on failover',
      ],
      answer: 1,
      explain: 'Synchronous commit replicas are used for automatic failover without loss. Asynchronous ones trade possible loss for distance.',
    },
  ],
  description: `
Larkfield Grocers moves its planning database to a SQL Server Always On availability group with two replicas in the main data center and one asynchronous replica in another region. Mule apps write plans from the planning platform into it every 15 minutes and run a large nightly extract of sales and stock. During a failover test, writes failed for 40 seconds, one plan batch was loaded twice, and the extract slowed the primary.

**Questions**
1. How should the Mule connection be configured?
2. What happens to in flight work during a failover?
3. How do you make retries safe?
4. How do you keep the extract off the primary?
5. What do you agree with the DBA team?
`,
  answerTemplate: `## Connection configuration

## In flight work

## Safe retries

## Extract off the primary

## Agreements
`,
  keyPoints: [
    'Connect to the availability group listener, never a server name.',
    'Set multiSubnetFailover=true when the listener spans subnets.',
    'Open transactions roll back. A commit with no reply has an unknown outcome.',
    'Use reconnection and a bounded retry of the whole unit.',
    'Make writes idempotent with MERGE on business keys or a run id check.',
    'Send reads to a secondary with applicationIntent=ReadOnly.',
  ],
  solution: `
**1. Connection configuration.** Use the listener name and port. Set \`multiSubnetFailover=true\` if the listener has addresses in more than one subnet. Set a login timeout that covers a normal failover, a reconnection strategy, and a pool that tests or replaces broken connections.

**2. In flight work.** When the primary changes, open transactions roll back and all connections break. Statements fail with connection errors until the new primary is online. A commit sent right before the break may or may not have happened.

**3. Safe retries.** Wrap each load in a retry of the whole unit with a delay that covers the failover time and a limit. Make the load idempotent. Write each plan batch with its run id, check the run id before loading, and use MERGE on store, item and week so a repeat updates instead of duplicating. That fixes the double load.

**4. Extract off the primary.** Use a second connection config with \`applicationIntent=ReadOnly\` through the listener. With read only routing set by the DBA, it lands on a secondary. Agree that a few seconds of lag is fine for the nightly extract, and read the watermark from the same replica.

**5. Agreements.** Which replicas are synchronous and fail over automatically. The expected failover time, so timeouts and retries match it. When test failovers happen, so alerts expect them. That writes never go to the asynchronous region except in a declared disaster.
`,
  followUps: [
    {
      q: 'What error do you see in Mule during the failover?',
      a: 'Connectivity errors from the Database connector, such as connection reset or login failures while the database comes online. Retry those, not data errors.',
    },
    {
      q: 'Why read the watermark from the same replica as the extract?',
      a: 'A secondary may lag. A watermark read from the primary can be ahead of the data on the secondary, and the extract would miss changes.',
    },
    {
      q: 'Does Mule need to know which replica is primary?',
      a: 'No. The listener and read only routing hide that. The app only needs the right intent and safe retries.',
    },
  ],
}
