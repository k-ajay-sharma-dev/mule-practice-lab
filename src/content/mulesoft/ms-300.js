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
        'The name of the current primary replica server',
        'The availability group listener name',
        'The Windows failover cluster name',
        'A DNS alias that the DBA repoints after each failover',
      ],
      answer: 1,
      explain: 'The listener always points to the current primary and moves with it. A server name breaks at the first failover, and a manual DNS alias adds delay and a step someone can forget. A server name breaks at the first failover.',
    },
    {
      type: 'single',
      prompt: 'The listener has addresses in two subnets. What connection setting helps the driver reconnect fast after a failover?',
      options: [
        'failoverPartner set to the second subnet address',
        'multiSubnetFailover=true',
        'applicationIntent=ReadWrite',
        'loginTimeout=5, so each address is given up on sooner',
      ],
      answer: 1,
      explain: 'With multiSubnetFailover=true the driver tries all listener addresses in parallel. failoverPartner is for database mirroring, not availability groups. Without it, the driver may try an address that is offline and wait for a timeout before the next one.',
    },
    {
      type: 'single',
      prompt: 'What happens to a Mule transaction that is open on the primary when a failover starts?',
      options: [
        'It moves to the new primary and carries on there',
        'It is rolled back, and the app must retry the whole unit',
        'It is committed on the old primary before the role switch',
        'It is held, and resumes once the listener moves',
      ],
      answer: 1,
      explain: 'The connection breaks and the app gets an error. Open transactions do not survive a failover. Committed ones on a synchronous replica do.',
    },
    {
      type: 'single',
      prompt: 'A commit was sent, then the connection dropped before the reply. Did the row get written?',
      options: [
        'Yes, because a commit that was sent always completes',
        'Unknown, so the retry must be idempotent',
        'No, because a commit without a reply is rolled back',
        'Yes, if the replica that took over used synchronous commit',
      ],
      answer: 1,
      explain: 'Make the retry idempotent, for example a MERGE on a business key or a check of a run id. This is the classic unknown outcome. Design writes so that running them twice gives the same result.',
    },
    {
      type: 'multi',
      prompt: 'How can a heavy planning extract avoid loading the primary?',
      options: [
        'Connect through the listener with applicationIntent=ReadOnly, with read only routing set up by the DBA',
        'Accept that a secondary may lag slightly behind the primary',
        'Use a separate connection config for reads and writes',
        'Send the writes to a secondary too, to spread the load',
      ],
      answer: [0, 1, 2],
      explain: 'Secondaries are read only. An asynchronous secondary can lag, so check that the extract can live with that.',
    },
    {
      type: 'single',
      prompt: 'Why can a failover to an asynchronous commit replica lose data?',
      options: [
        'It cannot, because the listener waits until the replica catches up',
        'Commits on the old primary may not have reached the replica yet',
        'Asynchronous replicas keep no transaction log of their own',
        'The asynchronous replica drops open transactions it was sent',
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
