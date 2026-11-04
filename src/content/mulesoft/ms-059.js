export default {
  id: 'ms-059',
  category: 'mulesoft',
  title: 'Store Price Updates over ActiveMQ: Queues, Topics, Durable and Shared Subscriptions',
  level: 'BEGINNER',
  tags: ['retail', 'jms', 'activemq', 'topics', 'durable-subscription', 'pricing'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'The pricing engine publishes each price change once. Three independent apps (store sync, e-commerce, analytics) must **each** receive every change. Which destination fits?',
      options: [
        'A topic, with one subscription per consuming app',
        'One queue shared by the three apps',
        'Three queues, and the pricing engine loops over them',
        'A queue with a message selector per app',
      ],
      answer: 0,
      explain: 'A topic delivers a copy to every subscription (publish-subscribe). On one shared queue the three apps would be **competing consumers** and each change would reach only one of them.',
    },
    {
      type: 'single',
      prompt: 'The e-commerce app subscribes to the topic with a **non-durable** subscription. It is redeployed for 10 minutes during a promotion launch. What happens to price changes published in those 10 minutes?',
      options: [
        'They are lost for that app — a non-durable subscription only exists while the subscriber is connected',
        'They wait on the topic and are delivered when the app reconnects',
        'They are moved to ActiveMQ.DLQ',
        'The publisher receives an error until the subscriber is back',
      ],
      answer: 0,
      explain: 'Only a **durable** subscription keeps messages for an offline subscriber. A non-durable subscriber simply misses what was published while it was away; the publisher is not affected.',
    },
    {
      type: 'single',
      prompt: 'The store-sync app runs on **2 replicas**, each with a durable topic subscription. Every price change is now pushed to the stores twice. What is the cleanest fix with a JMS 2.0 broker such as Artemis?',
      options: [
        'A shared durable subscription — both replicas consume from the same subscription name, so each message goes to only one of them',
        'Scale the app down to one replica',
        'Give each replica a different client ID',
        'Switch the replicas to non-durable subscriptions',
      ],
      answer: 0,
      explain: 'Two separate durable subscriptions are two copies. A **shared** subscription (JMS 2.0) load-balances one subscription across several consumers. Different client IDs would still create two subscriptions, so the duplicates remain.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the destination style.',
      pairs: [
        ['Every app gets every price change, even after downtime', 'Topic with a durable subscription per app'],
        ['One replica of the app processes each message, replicas share the work', 'Queue with competing consumers (or a shared subscription)'],
        ['A live dashboard that only cares about changes while it is open', 'Topic with a non-durable subscription'],
      ],
      explain: 'Topics give fan-out, durability decides whether offline subscribers keep their messages, and queues (or shared subscriptions) give load-balancing between instances of the same app.',
    },
    {
      type: 'multi',
      prompt: 'On ActiveMQ **Classic**, the team uses a Virtual Topic `VirtualTopic.PriceChanged` with consumer queues `Consumer.STORESYNC.VirtualTopic.PriceChanged` and `Consumer.ECOM.VirtualTopic.PriceChanged`. Which statements are true?',
      options: [
        'The publisher still sends to one topic and the broker copies each message into every consumer queue',
        'Each consuming app reads from its own queue, so several replicas of one app compete for messages',
        'Messages wait in the consumer queue while that app is down, like a durable subscription',
        'Each replica needs a unique client ID to read its consumer queue',
      ],
      answer: [0, 1, 2],
      explain: 'Virtual Topics combine topic fan-out with queue semantics: the copies land in normal queues, so you get persistence and load-balancing without client IDs or durable subscribers.',
    },
  ],
  description: `
A grocery chain with **420 stores** is moving price distribution onto **ActiveMQ**. The central pricing engine publishes a \`PriceChanged\` message (SKU, store cluster, new price, effective time) whenever a price or promotion changes — around 80,000 messages on a busy Monday morning.

Three Mule applications consume these messages:
- **store-price-sync** (2 replicas on CloudHub 2.0) pushes prices to the store POS servers.
- **ecom-price-sync** updates the e-commerce catalogue.
- **pricing-analytics** loads every change into a reporting database.

A first prototype used one queue \`PRICE.CHANGES\`, and the business noticed that the website and the stores disagreed on prices. A second prototype used a topic, but after a redeploy the e-commerce site missed a whole promotion, and the stores sometimes received the same change twice.

**Questions**
1. Why did the single queue cause the website and stores to disagree?
2. Explain topics with non-durable vs durable subscriptions, and why the promotion was missed.
3. Why did the stores receive duplicates, and how do shared subscriptions (JMS 2.0) or ActiveMQ Classic Virtual Topics fix it?
4. Which design do you recommend for each of the three apps?
`,
  answerTemplate: `## Why the single queue failed

## Durable vs non-durable subscriptions

## Duplicates with several replicas

## Recommended design per app
`,
  keyPoints: [
    'A queue is point-to-point: competing consumers each get different messages, so one queue cannot fan out to several apps.',
    'A topic gives a copy to every subscription; a non-durable subscription only exists while connected, a durable one keeps messages for an offline subscriber.',
    'Each replica with its own durable subscription is a separate subscription, which means duplicates; a JMS 2.0 shared subscription load-balances one subscription across replicas.',
    'On ActiveMQ Classic, Virtual Topics give fan-out into per-app queues, which then behave like normal queues (persistent, load-balanced).',
    'Make consumers idempotent anyway (e.g. SKU + store cluster + effective time as a key), because redelivery can still produce duplicates.',
  ],
  solution: `
**1. The single queue.** A queue is point-to-point. The three apps were **competing consumers**: each message went to whichever consumer took it first, so some changes reached only the stores and others only the website.

**2. Topics.** A topic copies each message to every **subscription**.
- **Non-durable**: the subscription exists only while the consumer is connected. During the 10-minute redeploy the e-commerce app had no subscription, so the promotion messages were never kept for it.
- **Durable**: the broker keeps messages for the named subscription while the subscriber is offline and delivers them on reconnect. In JMS 1.1 a durable subscription is identified by **client ID + subscription name**.

**3. Duplicates.** Each \`store-price-sync\` replica created its own subscription, so the broker gave each replica its own copy. Options:
- **Shared durable subscription (JMS 2.0)** — e.g. on Artemis with the JMS connector set to \`JMS_2_0\`; both replicas attach to the same subscription name and the broker gives each message to one of them:
\`\`\`xml
<jms:listener config-ref="artemis" destination="PRICE.CHANGED">
  <jms:consumer-type>
    <jms:topic-consumer durable="true" shared="true" subscriptionName="store-price-sync"/>
  </jms:consumer-type>
</jms:listener>
\`\`\`
- **Virtual Topics (ActiveMQ Classic)** — publish to \`VirtualTopic.PriceChanged\`, consume from \`Consumer.STORESYNC.VirtualTopic.PriceChanged\`. The broker copies each message into each consumer queue; replicas of one app compete on their queue. (Artemis gets the same effect with a multicast address and one queue per app.)

**4. Recommendation.** Topic fan-out with one durable (shared) subscription or one Virtual Topic consumer queue **per app**: store-price-sync and ecom-price-sync must not miss anything; pricing-analytics too. Add idempotency on the consumer side (latest effective time wins per SKU and store cluster), since redelivery can still duplicate a message and order across replicas is not guaranteed.
`,
  followUps: [
    {
      q: 'Does a topic guarantee ordering of price changes for the same SKU?',
      a: 'Within a single consumer, messages from one producer arrive in order, but once replicas share a subscription two changes for the same SKU can be processed in parallel. Compare effective timestamps (or use message groups) so an older price never overwrites a newer one.',
    },
    {
      q: 'Why not just publish to three queues from the pricing engine?',
      a: 'It couples the publisher to its consumers: every new consumer means a change in the pricing engine. Topic fan-out (or Virtual Topics) lets new subscribers join without touching the publisher.',
    },
    {
      q: 'What happens to a durable subscription that nobody uses any more?',
      a: 'The broker keeps accumulating messages for it, which fills the store. Unsubscribe removed consumers explicitly and monitor pending message counts per subscription.',
    },
  ],
}
