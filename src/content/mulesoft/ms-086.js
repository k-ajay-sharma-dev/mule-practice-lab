export default {
  id: 'ms-086',
  category: 'mulesoft',
  title: 'JMS Delivery Settings with ActiveMQ: Persistence, Priority, Time To Live, Reply Patterns and the Factory',
  level: 'INTERMEDIATE',
  tags: ['jms', 'activemq', 'messaging', 'redelivery', 'request-reply', 'connectors'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'Trade confirmations are published with `jms:publish` and the config uses its defaults. Operations expects them to survive a broker restart. What should you check first?',
      options: [
        'Persistent Delivery, because the connector config default is false',
        'Time To Live, because the default expires messages after 10 seconds',
        'Priority, because the default is 0',
        'Cache Producers, because caching drops messages',
      ],
      answer: 0,
      explain: 'Persistent Delivery defaults to false on the connector config. In JMS, a non-persistent message can be lost if the broker fails, so set it to true for messages that must survive.',
    },
    {
      type: 'match',
      detail: true,
      needsScenario: true,
      prompt: 'Match each publish setting to its connector config default.',
      pairs: [
        ['Persistent Delivery', 'false'],
        ['Priority', '4'],
        ['Time To Live', '0'],
      ],
      explain: 'A JMS time to live of 0 means the message does not expire. So a stale market price needs an explicit value.',
    },
    {
      type: 'single',
      prompt: 'A market price update is worthless after 30 seconds, and thousands queue up when a consumer is slow. Which setting addresses that?',
      options: [
        'A Time To Live of 30 seconds on jms:publish',
        'Priority 9 on jms:publish',
        'Persistent Delivery set to true',
        'Maximum Wait of 30 seconds on jms:listener',
      ],
      answer: 0,
      explain: 'Time To Live limits how long a message remains valid. Priority changes which message goes first, not whether a stale one is still delivered.',
    },
    {
      type: 'single',
      prompt: 'Every settlement event must reach three independent subscribers, each receiving its own copy. Which Destination Type do you set on `jms:publish`?',
      options: [
        'TOPIC',
        'QUEUE',
        'QUEUE, with three listeners on the same queue',
        'TOPIC with Priority 9',
      ],
      answer: 0,
      explain: 'A topic gives each subscriber a copy. Several consumers on one queue compete, so each message reaches only one of them.',
    },
    {
      type: 'match',
      prompt: 'Match each `jms:publish-consume` Request-Reply Pattern to how the reply is found.',
      pairs: [
        ['CORRELATION_ID (default)', 'A selector expects a message with the same correlation ID'],
        ['MESSAGE_ID', 'Expects a reply with the same value as the request message ID'],
        ['NONE', 'Consumes from the reply queue with no selector'],
      ],
      explain: 'NONE fits a temporary queue that holds only one message. On a shared reply queue it could take a reply meant for another request.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Consuming a Java `ObjectMessage` on ActiveMQ 5.15 fails after an upgrade. What is the right fix on the ActiveMQ factory?',
      options: [
        'List the needed packages in trustedPackages',
        'Set trustAllPackages to true in production',
        'Raise maxRedelivery',
        'Change the destination type to TOPIC',
      ],
      answer: 0,
      explain: 'trustedPackages is needed for ObjectMessage on ActiveMQ 5.12.2+ and 5.13.0+. trustAllPackages is documented as unsafe, so name only the packages you need.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about redelivery settings on the ActiveMQ factory are correct?',
      options: [
        '`maxRedelivery` defaults to 0, which means no redelivery',
        '`maxRedelivery` of -1 means unlimited',
        '`initialRedeliveryDelay` and `redeliveryDelay` both default to 1000',
        'Max Redelivery on the jms:listener overrides the factory value',
      ],
      answer: [0, 1, 2],
      explain: 'Max Redelivery on the listener or config is documented as having no effect. Redelivery is configured on the factory.',
    },
  ],
  description: `
A brokerage connects Mule apps to ActiveMQ for four message flows:

- **Trade confirmations:** must survive a broker restart.
- **Market price updates:** about 5,000 a minute, and useless after 30 seconds.
- **Settlement events:** must reach three independent systems.
- **Margin checks:** a Mule API asks a risk engine for an answer, waits up to 10 seconds and returns the result.

An older risk service sends Java \`ObjectMessage\` bodies, and these failed after a broker upgrade. Operations also wants failed confirmations retried three times.

**Questions**
1. Which delivery settings would you use for confirmations and for price updates?
2. Which destination type fits settlement events?
3. How would you design the margin check, and which reply pattern fits?
4. Which ActiveMQ factory settings solve the \`ObjectMessage\` and retry needs?
`,
  answerTemplate: `## Delivery settings

## Destination type

## Margin check request-reply

## ActiveMQ factory settings
`,
  keyPoints: [
    'jms:publish config defaults: Persistent Delivery false, Priority 4, Time To Live 0.',
    'Set Persistent Delivery to true for messages that must survive a broker restart.',
    'Destination Type is QUEUE or TOPIC: a queue has competing consumers, a topic gives each subscriber a copy.',
    'jms:publish-consume patterns: CORRELATION_ID (default), MESSAGE_ID and NONE. Maximum Wait is 10000 ms, then JMS:TIMEOUT.',
    'trustedPackages is needed for ObjectMessage on ActiveMQ 5.12.2+ and 5.13.0+. trustAllPackages is false by default and unsafe.',
    'maxRedelivery on the factory: 0 means no redelivery and -1 means unlimited. Max Redelivery on the listener or config has no effect.',
  ],
  solution: `
**1. Delivery settings.**
| Flow | Persistent Delivery | Time To Live | Priority |
|---|---|---|---|
| Trade confirmations | **true** (default false) | 0, no expiry | Default 4 |
| Market price updates | false is acceptable | **30 seconds** | Default 4 |

Persistence protects the message and costs some throughput, so use it where a loss matters. A price update has a short useful life, so Time To Live does the work. JMS priority runs from 0 to 9. It changes what goes first and does not clear a backlog.

**2. Destination type.** Settlement events go to a **TOPIC**, so each of the three systems gets its own copy. A queue would split the events between them. If a subscriber must not miss events while it is offline, plan durable subscriptions.

**3. Margin check.** Use \`jms:publish-consume\`, which publishes the request and waits for the reply.
- **CORRELATION_ID** (the default) suits a shared reply queue, because a selector matches the reply to the request.
- **MESSAGE_ID** suits a responder that returns the request's message ID.
- **NONE** uses no selector, so it fits only a temporary queue holding one message.

Maximum Wait defaults to 10000 ms, which matches the requirement. Handle \`JMS:TIMEOUT\` with a clear response to the API caller.

**4. ActiveMQ factory.**
- **ObjectMessage:** list the needed packages in \`trustedPackages\`. Leave \`trustAllPackages\` at false, because it is unsafe.
- **Retries:** set \`maxRedelivery\` on the factory to 3. The default of 0 means no redelivery, and -1 means unlimited. \`initialRedeliveryDelay\` and \`redeliveryDelay\` default to 1000. Max Redelivery on the listener or config has no effect, so do not set it there.

The longer-term fix for \`ObjectMessage\` is to send JSON or XML, which removes Java deserialisation from the path.
`,
  followUps: [
    {
      q: 'What caching does the connector use by default?',
      a: 'Cache Producers and Cache Consumers are both true by default.',
    },
    {
      q: 'Why is trustAllPackages unsafe?',
      a: 'It lets the client deserialise any Java class in an ObjectMessage, so a crafted message can reach classes you never intended to load. A short trusted list limits that.',
    },
    {
      q: 'Which connector errors would you look at first for a failed publish?',
      a: 'The connector error list includes JMS:PUBLISHING, JMS:CONNECTIVITY, JMS:DESTINATION_NOT_FOUND, JMS:ILLEGAL_BODY and JMS:SECURITY. Separate connectivity problems from body problems in the handler.',
    },
  ],
}
