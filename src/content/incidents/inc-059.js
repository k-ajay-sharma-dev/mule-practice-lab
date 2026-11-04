export default {
  id: 'inc-059',
  category: 'incidents',
  title: 'Broker Fails Over in Two Seconds, Warehouse Orders Stop for Two Hours',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'activemq', 'jms', 'high-availability', 'reconnection', 'wms'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '02:14:07.900 INFO  [amq-b] Shared store lock acquired, becoming master. Broker amq-b started (tcp://amq-b:61616)', relevant: true, why: 'The standby broker took over within seconds, so the messaging platform itself recovered quickly.' },
      { text: '02:14:05.312 ERROR [wave] JMS:CONNECTIVITY Connection to tcp://amq-a:61616 lost: java.io.EOFException', relevant: true, why: 'The app was connected to amq-a only; when amq-a stopped, its connection died.' },
      { text: '02:14:05.330 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '02:14:05.401 INFO  [config] jms:active-mq-connection brokerUrl=tcp://amq-a:61616 (no reconnection strategy)', relevant: true, why: 'A plain tcp:// URL to one host and no reconnection: the listener does not try again and cannot find the new master.' },
      { text: '02:20:00.000 INFO  [amq-console] amq-b WMS.WAVE.RELEASE pending=3120 consumers=0', relevant: true, why: 'Messages wait on the new master but no consumer is attached.' },
      { text: '02:30:00.200 ERROR [order-out] JMS:CONNECTIVITY Could not publish to WMS.WAVE.RELEASE: Connection refused (amq-a:61616)', relevant: true, why: 'Publishers also keep using the dead host.' },
      { text: '02:30:01.000 INFO  [orders] Order 77120031 allocated to DC-East', relevant: false },
      { text: '04:12:44.000 INFO  [deploy] wms-wave-sapi restarted by on-call engineer', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did the outage last two hours when the broker failed over in seconds?',
        options: [
          'The apps used tcp://amq-a:61616 with no reconnection, so they never reconnected or found amq-b until someone restarted them',
          'ActiveMQ lost the messages during failover',
          'The shared store lock was held too long',
          'The WMS was down for two hours',
        ],
        answer: 0,
        explain: 'The broker pair worked as designed. The clients were hard-wired to one broker and had no reconnection, so they stayed broken until an engineer restarted them with the URL changed to amq-b by hand.',
      },
      {
        type: 'single',
        prompt: 'Which connection setting fixes it for an ActiveMQ Classic master/slave pair?',
        options: [
          'brokerUrl="failover:(tcp://amq-a:61616,tcp://amq-b:61616)" so the client library reconnects to whichever broker is master',
          'brokerUrl="tcp://amq-a:61616?keepAlive=true"',
          'Two separate JMS configs, one per broker, both always active',
          'Increase numberOfConsumers on the listener',
        ],
        answer: 0,
        explain: 'The failover: transport lists both brokers and reconnects automatically. keepAlive does not help when the host is gone, and two active configs would not work because the slave does not accept connections.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and prevention**?',
        options: [
          'Use the failover: transport in every app that talks to the broker pair',
          'Add a reconnection strategy (e.g. reconnect forever) on the JMS connection so listeners recover from connectivity errors',
          'Alert on consumers=0 for queues that should always have a consumer',
          'Run a planned failover test in a lower environment and in production maintenance windows',
          'Point all apps at amq-b permanently',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Clients must know both brokers and keep retrying, and failover must be tested and monitored. Hard-coding the other host just moves the single point of failure.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Confirm the broker failover time and that amq-b is master',
          'See that queues on amq-b have pending messages but no consumers',
          'Point the apps at the live broker and restart them',
          'Confirm wave releases flow to the WMS again and the backlog drains',
          'Roll out failover URLs and reconnection, then test a failover',
        ],
        explain: 'Understand where messages are, restore consumers, verify, then fix and rehearse.',
      },
    ],
  },
  description: `
## Symptoms
- Order allocation publishes wave releases to ActiveMQ queue \`WMS.WAVE.RELEASE\`; \`wms-wave-sapi\` consumes them and calls the WMS.
- At **02:14** the night shift at DC-East stopped receiving new waves. Pickers were idle until **04:15**, when the on-call engineer restarted the Mule apps with the broker URL changed to \`amq-b\`.
- The infrastructure team says the broker failover worked: the standby took over in **2 seconds**.

## Change / Context
- ActiveMQ Classic runs as a **shared-storage master/slave pair** (\`amq-a\`, \`amq-b\`). Only the master accepts connections.
- Patching rebooted \`amq-a\` at 02:14.
- All Mule apps use \`<jms:active-mq-connection>\` with \`brokerUrl="tcp://amq-a:61616"\` and no reconnection strategy.

## Logs
\`\`\`
02:14:05.312 ERROR [wave] JMS:CONNECTIVITY Connection to tcp://amq-a:61616 lost: java.io.EOFException
02:14:07.900 INFO  [amq-b] Shared store lock acquired, becoming master
02:20:00.000 INFO  [amq-console] amq-b WMS.WAVE.RELEASE pending=3120 consumers=0
02:30:00.200 ERROR [order-out] JMS:CONNECTIVITY Could not publish to WMS.WAVE.RELEASE:
  Connection refused (amq-a:61616)
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do **right now**?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The broker pair failed over correctly; the clients were configured for a single broker (tcp://amq-a) and had no reconnection strategy.',
    'Listeners stopped after the connection error; publishers kept failing against the dead host; queues on amq-b had consumers=0.',
    'Immediate: point apps at the live master and restart; verify the backlog drains to the WMS.',
    'Fix: failover:(tcp://amq-a:61616,tcp://amq-b:61616) in all apps plus a reconnection strategy on the JMS connection.',
    'Prevention: alert on consumers=0, rehearse failovers, include client configuration in HA design reviews.',
  ],
  solution: `
**Diagnosis.** The HA broker pair did its job: \`amq-b\` became master two seconds after \`amq-a\` went down. But every Mule app connected with \`tcp://amq-a:61616\`, a single host, and had **no reconnection strategy**. The listener's connection failed with **JMS:CONNECTIVITY** and never came back; publishers kept trying the dead host. Messages waited on \`amq-b\` with **consumers=0** until someone restarted the apps by hand.

**Immediate mitigation.** (Already done at 04:15.) Point the apps at the live master, restart, and confirm \`WMS.WAVE.RELEASE\` drains and DC-East receives waves. Check whether any publish failed between 02:14 and 04:15 and whether those orders need to be re-released.

**Root cause.** High availability was designed on the broker side only. The client side, which must know both brokers and keep trying, was never configured or tested.

**Permanent fix.**
- Use the ActiveMQ **failover transport**: \`brokerUrl="failover:(tcp://amq-a:61616,tcp://amq-b:61616)"\` (optionally with \`randomize=false\` to prefer amq-a). The client library then reconnects to whichever broker is master.
- Add a **reconnection strategy** (for example reconnect forever with a delay) on the JMS connection so the listener recovers from any connectivity error.
- Make publishers handle **JMS:CONNECTIVITY** with retry (Until Successful) and a clear error if it persists.

**Prevention.** Alert when a queue that should always be consumed has **consumers=0** or a growing oldest-message age; rehearse failover regularly; make the client connection URL a reviewed, shared property.
`,
  followUps: [
    { q: 'What happens to in-flight messages with the failover transport?', a: 'The client reconnects transparently; sends may block until reconnected, and unacknowledged consumed messages are redelivered by the new master, so consumers must tolerate duplicates.' },
    { q: 'How is HA different in ActiveMQ Artemis?', a: 'Artemis uses primary/backup pairs (called live/backup in older versions) with replication or shared store, and clients can discover the backup through the cluster topology or a list of connectors, with reconnectAttempts controlling client retries.' },
    { q: 'Why not just use a load balancer in front of the brokers?', a: 'Only the master accepts connections and JMS connections are long-lived and stateful; the failover transport understands that, while a plain TCP load balancer would need health checks tuned to master status and still break sessions.' },
  ],
}
