export default {
  id: 'ms-122',
  category: 'mulesoft',
  title: 'CloudHub 1.0 Persistent Queues and Object Store: What Survives a Restart and What Can Arrive Twice',
  level: 'INTERMEDIATE',
  tags: ['cloudhub', 'deployment', 'persistent-queues', 'object-store', 'vm', 'high-availability'],
  estMinutes: 30,
  quiz: [
    {
      type: 'multi',
      prompt: 'Persistent queues are enabled for `shipment-events` on CloudHub 1.0. Which queues does the persistent queue manager now cover?',
      options: [
        'VM connector queues configured as persistent in the app',
        'VM connector queues configured as non-persistent in the app',
        'Internal Batch component queues',
        'Internal SEDA queues',
        'Anypoint MQ queues the app consumes',
      ],
      answer: [0, 1, 2, 3],
      explain: 'CloudHub replaces the default queue manager, which then persists all queues regardless of in-app configuration. Anypoint MQ is a separate service and not part of this list.',
    },
    {
      type: 'single',
      prompt: 'Downstream, a duplicate shipment label costs real money. What do the docs say about persistent queues and duplicates?',
      options: [
        'They do not guarantee one-time-only delivery, so duplicates may be sent; if that is critical for the use case, do not enable them',
        'They deliver every message exactly once as long as there are two workers',
        'Duplicates are possible only with data-at-rest encryption enabled',
        'Duplicates are removed automatically by the Queues tab',
      ],
      answer: 0,
      explain: 'Zero message loss and exactly-once are different promises. Persistent queues give the first, so a consumer that uses them must tolerate a repeated message, for example with an idempotent write.',
    },
    {
      type: 'single',
      prompt: 'The carrier API is down for five days during a dispute and messages wait on a persistent queue. What is the concern?',
      options: [
        'Message retention in a persistent queue is up to 4 days, so messages can expire before the carrier returns',
        'The queue is limited to 100,000 messages',
        'Each message is limited to 1 MB',
        'Nothing, because retention has no limit',
      ],
      answer: 0,
      explain: 'Retention is up to 4 days, while message size and message count have no limit. A longer outage needs a plan that does not depend on the queue alone.',
    },
    {
      type: 'single',
      prompt: 'On the Queues tab, a queue shows 0 Queued and 3 In-Flight. What does In-Flight mean?',
      options: [
        'Messages being processed in the flow after the queue; they stay on the queue until processing completes, then they are deleted',
        'Messages already removed from the queue and acknowledged',
        'Messages travelling between two regions',
        'Messages that failed and wait for the operator to clear them',
      ],
      answer: 0,
      explain: 'The Queued and In-Flight columns update every five seconds, and the Processed Messages graph every five minutes. Clearing a queue is for cases such as an app stuck on one message.',
    },
    {
      type: 'single',
      prompt: 'An older app keeps its last-sync timestamp in Object Store v1 with `persistent="true"`. After a redeploy, the sync restarts from the beginning. Why?',
      options: [
        'CloudHub clears local disk storage on restart or redeploy; Object Store v1 writes to local disk, so data is not kept even with persistent="true"',
        'Object Store v1 keys expire after one hour',
        'The redeploy changed the application name',
        'The object store must be cleared by the app at shutdown',
      ],
      answer: 0,
      explain: 'Studio and standalone Mule keep their local file system, which hides this problem until deployment. The docs direct you to Object Store v2 to persist data across restarts.',
    },
    {
      type: 'match',
      prompt: 'Match each documented limit to the store.',
      pairs: [
        ['Maximum of 100,000 keys per application', 'Object Store v1'],
        ['Values up to 10 MB', 'Object Store v2'],
        ['1 MB value size and 1 GB of data per application', 'Object Store v1 storage'],
        ['Keys persist for up to 30 days', 'Object Store v2 key lifetime'],
      ],
      explain: 'Object Store v2 also has an unlimited number of keys per application, with 10 TPS at trial level and 100 TPS at premium level.',
    },
    {
      type: 'single',
      prompt: 'A quarterly reconciliation wants to read a value written 90 days earlier from Object Store v2. What is the right design decision?',
      options: [
        'Keep it in a durable store such as a database, because Object Store v2 keys persist for up to 30 days',
        'Keep it in Object Store v2 and set `persistent="true"`',
        'Keep it in a persistent VM queue',
        'Keep it on the local disk of a 2 vCore worker',
      ],
      answer: 0,
      explain: 'A 30-day key lifetime and a 4-day queue retention rule out both options, and local disk is cleared on restart. State that lasts for months belongs in a system of record.',
    },
  ],
  description: `
A parcel carrier runs \`shipment-events\` on **CloudHub 1.0** with two 1 vCore workers. An HTTP flow accepts events and places them on a VM queue. A second flow calls the carrier booking API and prints labels. A nightly sync job in another app tracks its progress in an object store.

During a review, the team asks:
- Will messages on the VM queue survive a worker failure, and will both workers share the load?
- Can a label be printed twice?
- How long can messages wait if the booking API is down?
- Why did a redeploy of the older sync app restart it from the beginning?
- Where should a value needed at the end of the quarter live?

**Questions**
1. What does enabling persistent queues change?
2. What are its guarantees and limits?
3. How do Object Store v1 and v2 differ on CloudHub, and what do you use for sync state?
4. What would you recommend for each question above?
`,
  answerTemplate: `## Effect of persistent queues

## Guarantees and limits

## Object Store v1 and v2

## Recommendations
`,
  keyPoints: [
    'Enabling persistent queues replaces the queue manager: VM queues (persistent or not), Batch and SEDA queues are all persisted.',
    'They spread work across workers and protect messages if workers or data centres fail.',
    'They do not guarantee one-time-only delivery, so consumers must tolerate duplicates.',
    'Retention is up to 4 days, with no limit on message size or count; the queue is in the region of the worker.',
    'Data-at-rest encryption is optional, and the Queues tab shows Queued and In-Flight and can clear queues.',
    'CloudHub workers use volatile disk: Object Store v1 data is not preserved on restart or redeploy, even with persistent="true".',
    'Object Store v2 stores data externally: values up to 10 MB, keys for up to 30 days.',
  ],
  solution: `
**1. What changes.** On the deployment settings tick **Persistent queues**. CloudHub replaces the default queue manager with a persistent one. It persists VM queues whether or not they are configured as persistent, plus internal Batch and SEDA queues. With more than one worker, the queue also distributes work between them.

**2. Guarantees and limits.**
- Messages survive the failure of workers or data centres.
- Delivery is not one-time-only: duplicates may be sent.
- Retention is up to **4 days**. There is no limit on message size or number of messages.
- Data-at-rest encryption can be enabled for persistent queues.

**3. Object stores.** CloudHub clears local disk when an app restarts or redeploys, so Object Store v1 loses its data even with \`persistent="true"\`, although the same app keeps it in Studio. Object Store v1 data is also handled in the US-East zone whatever the deployment region.

| | Object Store v1 | Object Store v2 |
|---|---|---|
| Keys | 100,000 per app | Unlimited |
| Value size | 1 MB | Up to 10 MB |
| Key size / total | 768 bytes / 1 GB per app | |
| Lifetime | Lost on restart or redeploy | Keys persist for up to 30 days |
| Rate | | 10 TPS trial, 100 TPS premium |

**4. Recommendations.**
- Enable persistent queues for \`shipment-events\`.
- Make label printing idempotent, for example with a key on the shipment id checked before printing.
- For a booking outage beyond 4 days, have a plan such as parking events in a database.
- Move the sync app to Object Store v2.
- Keep the quarterly value in a database, not in any of these stores.
`,
  followUps: [
    { q: 'Do persistent queues replace an external broker?', a: 'They cover queues inside one application. When several applications must exchange messages, or you need features such as dead-letter queues, that is a job for a message broker such as Anypoint MQ.' },
    { q: 'Can you see or clear a queue without changing the app?', a: 'Yes. The Queues tab shows Queued, In-Flight and a 24-hour throughput snapshot, and it can clear a selected queue. Clearing flushes both the waiting and the in-flight messages. It is useful when an app is stuck on a message.' },
    { q: 'What replaces persistent queues on CloudHub 2.0?', a: 'CloudHub 2.0 does not support CloudHub persistent VM queues. The migration guide says to replace them with Anypoint MQ, which is separately licensed and has a 10 MB maximum message size. For persistent batch jobs on CloudHub 2.0, the docs name Object Store v2 as the main solution. Clustering and Object Store v2 together route all Object Store access to the cloud service, which can add metered usage.' },
  ],
}
