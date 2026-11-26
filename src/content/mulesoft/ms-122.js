export default {
  id: 'ms-122',
  category: 'mulesoft',
  title: 'CloudHub 1.0 Persistent Queues and Object Store: What Survives a Restart and What Can Arrive Twice',
  level: 'INTERMEDIATE',
  tags: ['cloudhub', 'deployment', 'persistent-queues', 'object-store', 'vm', 'high-availability'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A CloudHub 1.0 app has the Persistent queues deployment setting enabled. One of its VM queues is configured as non-persistent in the app. What happens to that queue?',
      options: [
        'It is persisted too, because the setting covers VM queues of both kinds',
        'It stays in memory, because the setting in the app takes priority',
        'It moves to Anypoint MQ, because CloudHub hands it over to that service',
        'It stops the deployment until the queue is configured as persistent',
      ],
      answer: 0,
      explain: 'CloudHub replaces the default queue manager, which then persists all queues regardless of in-app configuration. That covers VM queues configured as persistent or non-persistent, plus internal Batch and SEDA queues. Anypoint MQ is a separate service and not part of this list.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Downstream, a duplicate shipment label costs real money. What do the docs say about persistent queues and duplicates?',
      options: [
        'They do not guarantee one-time-only delivery, so duplicates can occur',
        'They deliver every message exactly once as long as there are two workers',
        'Duplicates are possible only with data-at-rest encryption enabled',
        'A redelivered message is skipped, because the queue tracks message IDs',
      ],
      answer: 0,
      explain: 'If one-time delivery is critical for the use case, the docs say not to enable them. Zero message loss and exactly-once are different promises. Persistent queues give the first, so a consumer that uses them must tolerate a repeated message, for example with an idempotent write.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'The carrier API is down for five days during a dispute and messages wait on a persistent queue. What is the concern?',
      options: [
        'Messages are kept for up to 4 days, so they can expire first',
        'The queue holds at most 100,000 messages, so it fills up',
        'Each message is limited to 1 MB, so large ones are dropped',
        'Nothing, because a persistent queue has no retention limit',
      ],
      answer: 0,
      explain: 'Retention is up to 4 days, while message size and message count have no limit. A longer outage needs a plan that does not depend on the queue alone.',
    },
    {
      type: 'single',
      prompt: '`shipment-events` runs on two workers with persistent queues. The Queues tab shows 0 Queued and 3 In-Flight when one worker fails in the middle of processing. What happens to those 3 messages?',
      options: [
        'They are lost, because In-Flight messages have already left the queue',
        'They stay on the queue until processed, so they can run again, perhaps twice',
        'They wait in In-Flight until an operator clears them on the Queues tab',
        'They are sent again from a replica of the queue in another region',
      ],
      answer: 1,
      explain: 'In-Flight messages are being processed and stay on the queue until processing completes, and only then are they deleted. Persistent queues protect messages when a worker fails, and they do not guarantee one-time delivery, so a message can be processed twice. Clearing a queue is a manual step for cases such as an app stuck on one message. The queue is in the region of the worker. The Queued and In-Flight columns update every five seconds.',
    },
    {
      type: 'single',
      prompt: 'An older app keeps its last-sync timestamp in Object Store v1 with `persistent="true"`. After a redeploy, the sync restarts from the beginning. Why?',
      options: [
        'This store writes to local disk, which CloudHub clears on redeploy',
        'Object Store v1 needs `entryTtl` set, or its keys are dropped on redeploy',
        'The redeploy changed the application name and its store',
        'The app cleared the object store itself during shutdown',
      ],
      answer: 0,
      explain: 'The data is not kept even with persistent="true". Studio and standalone Mule keep their local file system, which hides this problem until deployment. The docs direct you to Object Store v2 to persist data across restarts.',
    },
    {
      type: 'match',
      detail: true,
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
      detail: true,
      prompt: 'A quarterly reconciliation wants to read a value written 90 days earlier from Object Store v2. What is the right design decision?',
      options: [
        'Keep it in a database, because Object Store v2 keys last 30 days',
        'Keep it in Object Store v2 with `persistent="true"`, so it does not expire',
        'Keep it on a persistent VM queue, which holds it until the next quarter',
        'Keep it in Object Store v1, which has no key lifetime on CloudHub',
      ],
      answer: 0,
      explain: 'Object Store v2 keys persist for up to 30 days. A 30-day key lifetime and a 4-day queue retention rule out both options, and local disk is cleared on restart. State that lasts for months belongs in a system of record.',
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
