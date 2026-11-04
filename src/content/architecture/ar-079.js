export default {
  id: 'ar-079',
  category: 'architecture',
  title: 'Highly Available ActiveMQ for Warehouse Messaging and Mule Reconnection',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'activemq', 'artemis', 'jms', 'high-availability', 'reconnection', 'wms'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'In ActiveMQ Classic shared-storage master/slave, what does the slave broker do while the master is healthy?',
      options: [
        'It waits to acquire the lock on the shared store and does not accept client connections',
        'It serves read-only consumers to spread the load',
        'It replicates every message from the master over the network',
        'It accepts producers and forwards their messages to the master',
      ],
      answer: 0,
      explain: 'With a shared store, the broker that holds the lock is master; the other blocks on the lock and only starts its transport connectors when it acquires it after the master fails. It is passive, not a load-sharing node.',
    },
    {
      type: 'match',
      prompt: 'Match each HA option to how it works.',
      pairs: [
        ['ActiveMQ Classic shared file system master/slave', 'Two brokers point at one KahaDB on shared storage; a file lock decides the master'],
        ['ActiveMQ Classic JDBC master/slave', 'Brokers share a database message store; a database lock decides the master'],
        ['Artemis primary/backup with replication', 'The backup receives a copy of the journal over the network; needs quorum thinking to avoid split brain'],
        ['Artemis primary/backup with shared store', 'Primary and backup use the same journal on shared storage; the backup activates when it gets the lock'],
      ],
      explain: 'Shared-storage approaches rely on reliable locks on the shared medium; replication avoids shared storage but must guard against both nodes becoming live after a network partition.',
    },
    {
      type: 'single',
      prompt: 'During a broker failover, Mule apps publishing pick confirmations hung for 4 minutes and HTTP threads piled up. The connection URL is failover:(tcp://amq1:61616,tcp://amq2:61616). What is the most likely cause?',
      options: [
        'The failover transport retries reconnection transparently and blocks sends while disconnected; with no failover timeout, publish calls wait instead of failing fast',
        'The JMS connector does not support failover URLs',
        'The slave broker rejected the messages because they were non-persistent',
        'Mule reconnection strategy was set to reconnect-forever, which disables publishing',
      ],
      answer: 0,
      explain: 'The Classic failover transport hides the outage from the client and, by default, blocks sends until it reconnects. Setting its timeout option makes sends fail after a bounded wait, so Mule can raise a JMS error (e.g. JMS:PUBLISHING or JMS:CONNECTIVITY) and the flow can respond.',
    },
    {
      type: 'multi',
      prompt: 'Which settings make the Mule WMS consumers resilient to a broker failover? (Select all that apply.)',
      options: [
        'A connection URL listing both brokers (failover transport for Classic, or an Artemis HA URL)',
        'A reconnection strategy on the JMS connection so the listener re-establishes consumption',
        'Idempotent processing, because unacknowledged in-flight messages are redelivered after failover',
        'Persistent delivery for messages that must survive a broker restart',
        'ackMode IMMEDIATE so messages are never redelivered after failover',
        'Pointing Mule only at amq1, because the slave never serves clients',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Clients must know both addresses, reconnect, and tolerate redelivery; persistence is what lets the backup see the messages. IMMEDIATE ack would lose in-flight messages, and pointing at one host makes failover impossible.',
    },
    {
      type: 'single',
      prompt: 'The infrastructure team proposes NFSv3 without reliable locking for the shared KahaDB. Why is that dangerous?',
      options: [
        'If locks are not honoured, both brokers can believe they are master and write to the same store, corrupting it',
        'NFS is too slow for any message broker',
        'KahaDB cannot be stored on a network file system at all',
        'The slave will never take over',
      ],
      answer: 0,
      explain: 'Shared-store HA is only as safe as the lock. Use storage with reliable distributed locking (for example NFSv4 or a SAN with proper locking) or a JDBC lock, and test the failover.',
    },
    {
      type: 'order',
      prompt: 'Order what happens when the master broker fails in a shared-store pair with Mule consumers.',
      items: [
        'The master stops and its lock on the shared store is released',
        'The slave acquires the lock, loads the store and starts accepting connections',
        'Mule clients detect the dropped connection and reconnect to the next URL',
        'Unacknowledged messages from before the failure are redelivered (JMSRedelivered = true)',
        'Consumers process them idempotently and normal flow resumes',
      ],
      explain: 'Failover is not instant: lock release and store recovery take time, so clients need retries and timeouts sized for it, and redeliveries are expected.',
    },
  ],
  description: `
A 3PL runs its **WMS ↔ Mule** messaging on a single **ActiveMQ Classic** broker at the main DC: pick confirmations, ship confirmations (to Oracle and the TMS) and wave releases. When the broker VM was patched last Sunday, **warehouse scanners froze for 25 minutes** and 1,800 pick confirmations had to be re-keyed.

You are asked to design high availability for the broker and make the Mule apps (4 apps, on-prem runtime cluster) survive a broker failover without data loss or frozen threads. The team is also considering migrating to **ActiveMQ Artemis**.

**Questions:**
- What HA options exist for ActiveMQ Classic and Artemis, and what does each require from the infrastructure?
- How should Mule connect to an HA pair, and what reconnection behaviour do you want for listeners vs publishers?
- What happens to in-flight messages during a failover, and what must the flows do about it?
- How do you prove the design works before go-live?
`,
  answerTemplate: `## Broker HA options

## Mule connection and reconnection

## In-flight messages and idempotency

## Testing failover
`,
  keyPoints: [
    'Classic offers master/slave with a shared store (shared file system with reliable locks, or JDBC); Artemis offers primary/backup pairs (called live/backup in older versions) with shared store or replication.',
    'Only one broker serves clients at a time; failover takes time (lock acquisition, store recovery), so clients must retry for long enough.',
    'Mule connects with a URL listing both brokers and a reconnection strategy; publishers need bounded timeouts so threads do not hang during failover.',
    'Persistent messages survive; unacknowledged ones are redelivered, so processing must be idempotent.',
    'Prove it with failover drills under load: kill the master, measure recovery time, check for lost or duplicated messages.',
  ],
  solution: `
**Broker HA.**
- **Classic shared file system master/slave:** two brokers on one KahaDB on shared storage; the lock holder is master. Needs storage with reliable locks.
- **Classic JDBC master/slave:** message store in a database (could be Oracle); a database lock elects the master. Simpler storage, lower throughput.
- **Artemis primary/backup** (older docs: live/backup): shared store (same idea as above) or **replication** (backup receives the journal over the network, no shared disk; requires quorum/split-brain protection). Artemis is the strategic product line and generally performs better.

**Mule connection.**
\`\`\`
 Classic: failover:(tcp://amq1:61616,tcp://amq2:61616)?randomize=false&timeout=10000
 Artemis: (tcp://amq1:61616,tcp://amq2:61616)?ha=true&reconnectAttempts=-1
\`\`\`
- **Listeners:** a reconnection strategy on the JMS config (reconnect forever with a sensible frequency) so consumption resumes automatically.
- **Publishers:** bounded send timeout (failover \`timeout\`) so a publish fails with a connectivity error instead of blocking; the calling flow then returns an error to the scanner gateway or buffers locally.

**In-flight messages.** Persistent messages are in the store and visible to the new master. Messages delivered but not acknowledged are redelivered with \`JMSRedelivered\` set and an increasing \`JMSXDeliveryCount\`; flows dedupe on the business key (pick id). Use MANUAL ack or transactions — never ack before processing.

**Testing.** Failover drills in test under realistic load: kill the master process, pull the network, fill the disk. Measure time to recover, count lost/duplicated messages, check thread pools and alerts. Repeat after every broker or storage change.

**Trade-offs:** HA pairs double broker cost and add shared storage or replication; failover still takes seconds to minutes, so the scanners' path needs a short local buffer or a clear "retry" message.
`,
  followUps: [
    { q: 'Would a network of brokers give you HA?', a: 'Not for persisted messages: a network of brokers spreads load and forwards messages, but messages stored on a failed broker are unavailable until it returns. Combine it with master/slave per node if you need both.' },
    { q: 'How long should the listener reconnection keep trying?', a: 'Forever (with a fixed frequency) for listeners, combined with alerting, because a listener that gives up silently stops the warehouse flow; for publishers prefer bounded attempts with a clear error.' },
    { q: 'What do you monitor on the brokers?', a: 'Which node is active, store and memory usage, queue depth and oldest message age, DLQ depth, consumer counts per queue, and failover events.' },
  ],
}
