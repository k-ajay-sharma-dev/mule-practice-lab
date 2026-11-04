export default {
  id: 'inc-058',
  category: 'incidents',
  title: 'Stores Miss Price Updates After a "Harmless" Client ID Rename',
  level: 'INTERMEDIATE',
  tags: ['retail', 'activemq', 'jms', 'topics', 'durable-subscriptions', 'pricing'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '21:00:03.010 INFO  [deploy] store-price-sync v3.0.0 started, connection clientId=store-price-sync-prod-v3', relevant: true, why: 'The client ID changed in this release. A durable subscription is identified by clientId plus subscription name, so this is a NEW subscription.' },
      { text: '21:00:03.402 INFO  [jms] Durable subscriber created: clientId=store-price-sync-prod-v3 subscriptionName=price-sync topic=PRICE.UPDATES', relevant: true, why: 'The new subscription only receives messages published after it was created.' },
      { text: '21:00:04.000 INFO  [health] GET /health 200 (2 ms)', relevant: false },
      { text: '21:05:00.000 INFO  [amq-console] Durable subscriber clientId=store-price-sync-prod subscriptionName=price-sync active=false pending=18420', relevant: true, why: 'The old subscription still exists, is offline and keeps collecting every price update, including the ones published during the deploy window.' },
      { text: '21:05:00.010 INFO  [amq-console] PRICE.UPDATES enqueued=+2400 since 20:40', relevant: false },
      { text: '21:06:11.200 INFO  [price] Sent 312 price changes to POS store=0107', relevant: false },
      { text: '20:41:00.000 INFO  [pricing-engine] Published weekly price batch W45 (2 400 messages) to PRICE.UPDATES', relevant: true, why: 'The weekly batch was published between the old app stopping (20:40) and the new subscription starting (21:00).' },
      { text: '21:07:30.000 INFO  [metrics] amq.store.percentUsage=61 (was 22 last week)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did stores miss the W45 price batch?',
        options: [
          'Changing the clientId created a new durable subscription that did not exist when the batch was published; the batch went to the old, now orphaned subscription',
          'Topics never keep messages, so durable subscriptions do not work on ActiveMQ',
          'The pricing engine published to the wrong topic',
          'The POS systems rejected the prices',
        ],
        answer: 0,
        explain: 'A durable subscription is keyed by clientId + subscription name. The renamed client got a fresh subscription; the 2,400 messages sit in the old one, which nobody consumes any more.',
      },
      {
        type: 'single',
        prompt: 'What is the best **immediate** recovery?',
        options: [
          'Ask the pricing team to republish the W45 batch (or replay it from the pricing database), then confirm the stores have it',
          'Delete the new subscription',
          'Restart every POS',
          'Wait; the stores will receive the batch next week',
        ],
        answer: 0,
        explain: 'Get the missing prices to the stores quickly from the source of truth. Alternatively, temporarily start a consumer with the old clientId to drain the old subscription, but republishing is simpler and verifiable.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **permanent fix and clean-up**?',
        options: [
          'Treat clientId and subscriptionName as a fixed contract, documented and not derived from version numbers',
          'Remove the orphaned durable subscription after its content is no longer needed, so it stops filling the broker store',
          'Monitor inactive durable subscribers and their pending counts',
          'Consider virtual topics (or Artemis queues bound to the address) so each consumer reads a queue that does not depend on a clientId',
          'Use a non-durable subscriber to avoid the problem',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Stable identity, clean-up of orphans, monitoring, and queue-based fan-out. A non-durable subscriber loses everything published while the app is down.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Compare store prices with the W45 batch to confirm what is missing',
          'Find the old and new durable subscriptions in the broker console',
          'Republish the W45 batch and confirm stores apply it',
          'Restore a stable clientId and remove the orphaned subscription',
          'Add alerts on inactive durable subscribers with pending messages',
        ],
        explain: 'Confirm the impact, find the cause, recover the business data, then fix and monitor.',
      },
    ],
  },
  description: `
## Symptoms
- The central pricing engine publishes price changes to the ActiveMQ Classic topic \`PRICE.UPDATES\`. Mule app \`store-price-sync\` holds a **durable subscription** and pushes prices to 600 stores' POS.
- Monday morning, stores show **last week's prices** for about 2,400 items. Price changes published since Sunday 21:00 do arrive.
- Broker store usage has jumped from 22% to 61%.

## Change / Context
- Sunday 20:40–21:00, v3.0.0 of \`store-price-sync\` was deployed. A refactor moved the \`clientId\` of the JMS connection to a property \`$\{app.name}-$\{env}-$\{app.major}\`, which now resolves to \`store-price-sync-prod-v3\` (it was \`store-price-sync-prod\`).
- The subscription name \`price-sync\` was unchanged.
- The pricing engine published the weekly batch W45 at **20:41**.

## Logs
\`\`\`
20:41:00.000 INFO  [pricing-engine] Published weekly price batch W45 (2 400 messages) to PRICE.UPDATES
21:00:03.402 INFO  [jms] Durable subscriber created: clientId=store-price-sync-prod-v3
  subscriptionName=price-sync topic=PRICE.UPDATES
21:05:00.000 INFO  [amq-console] Durable subscriber clientId=store-price-sync-prod
  subscriptionName=price-sync active=false pending=18420
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
    'A durable subscription is identified by clientId + subscription name; changing the clientId creates a new subscription.',
    'The new subscription only receives messages published after it is created, so the W45 batch (published during the deploy) never reached it.',
    'The old subscription is offline but still retains every message, which is why broker store usage is rising.',
    'Immediate: republish/replay the W45 batch and verify store prices; optionally drain the old subscription with the old clientId.',
    'Fix: stable documented clientId, remove orphaned subscriptions, monitor inactive durable subscribers, consider virtual topics / queue-based fan-out.',
  ],
  solution: `
**Diagnosis.** On a topic, a durable subscription is identified by **clientId + subscription name**. Changing the clientId from \`store-price-sync-prod\` to \`store-price-sync-prod-v3\` created a **brand-new** subscription at 21:00. Messages published before that moment (the W45 batch at 20:41) were stored only for the **old** subscription, which is now inactive and still collecting every price update (18,420 pending), so broker store usage climbs.

**Immediate mitigation.** Ask the pricing team to **republish W45** (or replay it from the pricing tables) and spot-check prices in a few stores. If republishing is not possible, start a temporary consumer with the old clientId to drain and forward the old subscription, filtering out messages already delivered by the new one. Inform store operations which items were wrong and since when.

**Root cause.** The clientId was treated as a cosmetic setting and derived from the version number, although it is part of the subscription's identity. There was no check for inactive durable subscribers.

**Permanent fix.**
- Fix the clientId back to a stable, documented value (and keep it the same across versions); keep \`subscriptionName\` stable too.
- After recovery, **remove the orphaned subscription** so it stops filling the store.
- Consider **virtual topics** in ActiveMQ Classic (consumers read \`Consumer.<name>.VirtualTopic.PRICE\` queues) or, on Artemis, a named queue on the address; queues do not depend on a clientId and scale to several consumers.

**Prevention.** Alert on durable subscribers that are inactive with pending messages and on store usage growth; a deployment checklist item for JMS identities; a price reconciliation between the pricing engine and stores after each weekly batch.
`,
  followUps: [
    { q: 'Why can only one connection use a given clientId at a time?', a: 'The JMS spec requires the clientId to be unique per active connection, so two replicas with the same clientId and durable subscription conflict. That is another reason to prefer virtual topics or shared subscriptions when scaling.' },
    { q: 'Why did broker store usage rise?', a: 'Every message on the topic is kept for each durable subscription until that subscriber acknowledges it. The orphaned subscription never acknowledges, so messages accumulate.' },
    { q: 'What is a virtual topic in ActiveMQ Classic?', a: 'Producers publish to a topic named VirtualTopic.X and the broker copies each message into queues named Consumer.<name>.VirtualTopic.X, so each consuming application reads its own queue with normal queue semantics.' },
  ],
}
