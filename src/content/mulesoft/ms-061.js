export default {
  id: 'ms-061',
  category: 'mulesoft',
  title: 'JMS Connector Config for ActiveMQ Classic vs Artemis: Connection Factory, Caching and Client ID',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'jms', 'activemq', 'artemis', 'connector-config'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'Which JMS connector connection type is designed for **ActiveMQ Classic** (5.x)?',
      options: [
        '`jms:active-mq-connection` with a `jms:factory-configuration brokerUrl="..."`',
        '`jms:generic-connection` only — there is no ActiveMQ-specific connection',
        '`jms:artemis-connection`',
        'The Anypoint MQ connector',
      ],
      answer: 0,
      explain: 'The ActiveMQ connection builds the ActiveMQ Classic connection factory for you from `brokerUrl` and redelivery settings. For other providers (including Artemis with its own client) you use a generic connection that references a connection factory bean.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The warehouse is moving to **ActiveMQ Artemis** and the team wants to use the Artemis JMS client and JMS 2.0 features. How is that usually configured?',
      options: [
        'A `jms:generic-connection` referencing an Artemis `ActiveMQConnectionFactory` bean, with specification JMS_2_0',
        'Keep `jms:active-mq-connection` and change the URL to `artemis://`',
        'Artemis cannot be used from Mule 4',
        'An HTTP Request to the Artemis console REST API',
      ],
      answer: 0,
      explain: 'Artemis is a different broker with its own client library; the generic connection takes any `javax.jms.ConnectionFactory`. (Artemis also accepts OpenWire, so an existing Classic-style connection can keep working during migration, but then you stay on the Classic client.)',
    },
    {
      type: 'single',
      prompt: 'Why would you set a fixed **client ID** on the JMS connection?',
      options: [
        'A JMS 1.1 durable topic subscription is identified by client ID + subscription name',
        'It is required for every queue consumer',
        'It sets the JMSCorrelationID of published messages',
        'It is the username used for broker authentication',
      ],
      answer: 0,
      explain: 'The broker remembers a durable subscription under client ID + subscription name. Queue consumers do not need a client ID, and the client ID has nothing to do with correlation or authentication.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'The same app with a hard-coded client ID is scaled to 2 replicas. What do you expect?',
      options: [
        'The second connection is rejected (or the subscription conflicts), because a client ID may be used by only one connection at a time',
        'Both replicas share the durable subscription automatically',
        'The broker appends the replica number to the client ID',
        'Nothing — client IDs are only informational',
      ],
      answer: 0,
      explain: 'Client IDs must be unique per active connection. For several replicas on one subscription use a JMS 2.0 **shared** subscription, or a queue-based design such as Virtual Topics.',
    },
    {
      type: 'match',
      prompt: 'Match each JMS connector setting to what it controls.',
      pairs: [
        ['brokerUrl "failover:(tcp://amq1:61616,tcp://amq2:61616)"', 'ActiveMQ Classic client reconnects to the other broker'],
        ['Caching strategy (default caching vs no caching)', 'Whether sessions and producers are reused between operations'],
        ['specification JMS_1_1 / JMS_2_0', 'Which JMS API features (e.g. shared subscriptions) are available'],
        ['Reconnection strategy on the connection', 'How Mule retries when it cannot connect at startup or after a drop'],
      ],
      explain: 'The failover transport is a Classic client feature; caching affects how much each publish costs; the spec version gates JMS 2.0 features; Mule reconnection is separate from the broker client failover.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The connection factory bean is already a **pooled** factory. What caching setting is usually recommended in Mule?',
      options: [
        'No caching, so you do not pool on top of a pool',
        'Default caching with the largest session cache',
        'Caching must always stay at default',
        'Disable the pooled factory and use caching instead — both together are not allowed',
      ],
      answer: 0,
      explain: 'Double pooling hides leaks and makes resource limits hard to reason about. Use one layer: either the pooled factory with no caching, or a plain factory with the connector caching.',
    },
  ],
  description: `
A 3PL operator runs warehouse events (pick confirmations, putaways, inventory adjustments) through **ActiveMQ Classic 5.18** today. The infrastructure team will migrate to **ActiveMQ Artemis** next year. You are setting up the Mule 4 **JMS connector** for a new **WMS Events System API**.

Requirements:
- Two Classic brokers in a primary/standby pair; the app must reconnect automatically.
- One flow consumes a durable topic subscription for \`WMS.INVENTORY.ADJUSTED\`.
- A publishing flow sends ~200 messages/s to \`WMS.PICK.CONFIRMED\`.
- The same project should be easy to switch to Artemis.

**Questions**
1. How do you configure the JMS connector for ActiveMQ Classic, including failover?
2. How do you configure it for ActiveMQ Artemis, and what changes?
3. What is the caching strategy and when would you disable it?
4. What is the client ID for, and what happens to it when the app runs on two replicas?
`,
  answerTemplate: `## ActiveMQ Classic config

## Artemis config

## Caching strategy

## Client ID and replicas
`,
  keyPoints: [
    'ActiveMQ Classic: jms:active-mq-connection with jms:factory-configuration (brokerUrl, redelivery settings); add the ActiveMQ client library to the project.',
    'Classic failover is in the URL: failover:(tcp://a:61616,tcp://b:61616); Mule reconnection strategy is a separate, outer retry.',
    'Artemis: jms:generic-connection referencing an Artemis ActiveMQConnectionFactory bean (Artemis client), specification JMS_2_0 for shared subscriptions.',
    'The connector caching strategy reuses sessions/producers for publishing; use no caching when the factory is already pooled.',
    'A client ID identifies a JMS 1.1 durable subscription and must be unique per connection, so it does not scale to several replicas; use shared subscriptions or queues.',
  ],
  solution: `
**1. ActiveMQ Classic**
\`\`\`xml
<jms:config name="amqClassic">
  <jms:active-mq-connection username="\${amq.user}" password="\${secure::amq.password}" clientId="wms-events-\${env}">
    <reconnection><reconnect-forever frequency="5000"/></reconnection>
    <jms:factory-configuration brokerUrl="failover:(tcp://amq1:61616,tcp://amq2:61616)?randomize=false"/>
  </jms:active-mq-connection>
</jms:config>
\`\`\`
The ActiveMQ client library must be added to the project (Studio prompts for it). The **failover transport** makes the Classic client switch brokers itself; Mule's reconnection strategy covers the case where no connection can be made at all (e.g. at startup).

**2. Artemis** — use the Artemis client through a generic connection:
\`\`\`xml
<spring:bean id="artemisCf" class="org.apache.activemq.artemis.jms.client.ActiveMQConnectionFactory">
  <spring:constructor-arg value="(tcp://art1:61616,tcp://art2:61616)?ha=true&amp;reconnectAttempts=-1"/>
</spring:bean>
<jms:config name="artemis">
  <jms:generic-connection connectionFactory="artemisCf" specification="JMS_2_0"/>
</jms:config>
\`\`\`
(The bean is defined through the Spring module or a custom connection-factory class.) Flows stay the same because they reference the config. Artemis also accepts OpenWire, so the Classic config can keep working during a transition, but you only get JMS 2.0 features such as shared subscriptions with a JMS 2.0 client. Redelivery and DLQ move from the Classic client policy to Artemis address settings (\`max-delivery-attempts\`, \`dead-letter-address\`).

**3. Caching.** By default the connector caches JMS sessions and producers so a publish does not create them each time — important at 200 msg/s. If the referenced factory is already pooled (e.g. a pooled connection factory), set \`<jms:no-caching/>\` to avoid pooling twice.

**4. Client ID.** A JMS 1.1 durable subscription is keyed by **client ID + subscription name**, so the consumer needs a stable client ID. A client ID can only be used by **one connection at a time**, so on 2 replicas the second one fails or conflicts. Options: a JMS 2.0 **shared durable subscription** (no client ID needed), a Classic **Virtual Topic** consumer queue, or a separate single-replica app just for the subscription.
`,
  followUps: [
    {
      q: 'Where do you configure Classic redelivery for a Mule consumer?',
      a: 'Classic redelivery is a client-side policy; in the ActiveMQ factory configuration you set maxRedelivery, redeliveryDelay and initialRedeliveryDelay. Note the connector\'s maxRedelivery default is 0 (no redelivery), not the plain Classic client default of 6, so set it explicitly. After the limit the message goes to the DLQ (ActiveMQ.DLQ by default).',
    },
    {
      q: 'How would you make the broker switch configurable per environment?',
      a: 'Keep two config files (classic and artemis) or a property that selects which config-ref flows use, and keep destination names in properties so flows do not change.',
    },
    {
      q: 'Why use persistent delivery for warehouse events?',
      a: 'Persistent messages are written to the broker store before the publish is confirmed, so a broker restart does not lose pick confirmations. Non-persistent is faster but can lose messages.',
    },
  ],
}
