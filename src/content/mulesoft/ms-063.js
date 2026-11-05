export default {
  id: 'ms-063',
  category: 'mulesoft',
  title: 'Urgent Replenishment and Recall Messages: JMS Message Selectors and Priorities',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'jms', 'activemq', 'message-selector', 'priority', 'recall'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'The West region consumer should only take messages with `region = WEST`. Where can a JMS message selector look?',
      options: [
        'At JMS headers (e.g. JMSPriority, JMSType) and message properties set by the publisher',
        'At any JSON field in the message body',
        'Only at the JMSMessageID',
        'At the HTTP headers of the original request',
      ],
      answer: 0,
      explain: 'Selectors use a SQL-92-like syntax over headers and properties only. The body is never inspected, so the publisher must copy routing values such as region into properties.',
    },
    {
      type: 'single',
      prompt: 'Which publish produces a message the selector `region = \'WEST\' AND msgKind = \'RECALL\'` will match?',
      options: [
        "A jms:publish whose jms:message has properties #[{ region: 'WEST', msgKind: 'RECALL' }]",
        "A payload of { \"region\": \"WEST\", \"msgKind\": \"RECALL\" } with no properties",
        'A destination name of REPLEN.WEST.RECALL',
        'A correlationId of WEST-RECALL',
      ],
      answer: 0,
      explain: 'User properties are what selectors evaluate. The body, destination name and correlation ID are not matched by property names.',
    },
    {
      type: 'single',
      prompt: 'A new region NORTH was added to the publisher, but no consumer has a selector for it. What happens to NORTH messages on the shared queue?',
      options: [
        'They stay on the queue unconsumed, growing the backlog, until a consumer whose selector matches connects',
        'They are discarded automatically',
        'They go to the dead-letter queue immediately',
        'Any consumer receives them because no selector matches',
      ],
      answer: 0,
      explain: 'A selector only filters what a consumer receives; it does not remove anything. Unmatched messages stay on the queue — a common cause of a mysterious backlog.',
    },
    {
      type: 'single',
      prompt: 'A recall notice is published to an ActiveMQ Classic queue with JMS priority 9, behind a large backlog of normal messages at priority 4. Why can it still arrive late?',
      options: [
        'Priority 9 is lower than the default, so normal messages go first',
        'Priority is only a hint, and messages a consumer already buffered go first',
        'Priority applies only to messages published after the backlog has cleared',
        'A priority-9 message bypasses selectors, so it reaches the wrong consumer',
      ],
      answer: 1,
      explain: 'JMS priority ranges from 0 to 9, and 4 is the default. It is advisory and brokers implement it differently. Messages already prefetched or buffered by a consumer can still be processed before a newer priority-9 message. On ActiveMQ Classic, strict priority ordering on a queue needs the `prioritizedMessages` destination policy. Selectors always apply regardless of priority.',
    },
    {
      type: 'single',
      prompt: 'Recalls must reach stores within minutes even when 200,000 replenishment messages are queued. What is the most reliable design?',
      options: [
        'Publish recalls to a separate queue with its own consumer(s)',
        'Rely on priority 9 on the shared queue',
        'Use a selector on JMSMessageID',
        'Lower the replenishment consumer concurrency to 1',
      ],
      answer: 0,
      explain: 'A separate destination gives recalls their own capacity and monitoring and does not depend on broker priority behaviour or prefetch settings.',
    },
  ],
  description: `
A pharmacy and convenience chain sends **replenishment orders** and **product recall notices** from its central planning system to regional distribution apps through one ActiveMQ queue, \`STORE.REPLEN\`. Each regional Mule app (EAST, WEST, CENTRAL) runs a JMS listener with a selector:

\`\`\`xml
<jms:listener config-ref="amq" destination="STORE.REPLEN" selector="region = 'WEST'"/>
\`\`\`

Recall notices (e.g. a contaminated batch of baby formula) are published with \`priority="9"\`; normal replenishment keeps the default priority.

Problems:
- After a promotion, 200,000 replenishment messages were queued and a recall took **40 minutes** to reach the WEST app, despite priority 9.
- A new region NORTH was added to the planning system; the queue depth kept growing and nobody knew why.
- One developer tried a selector on a field inside the JSON body and it never matched.

**Questions**
1. How do message selectors work, and what can they inspect?
2. Why did the queue grow after NORTH was added?
3. What does JMS priority guarantee, and why was the recall slow?
4. How would you redesign the destinations for recalls and regions?
`,
  answerTemplate: `## How selectors work

## The NORTH backlog

## Priority behaviour

## Redesign
`,
  keyPoints: [
    'Selectors (jms:listener and jms:consume selector attribute) use SQL-92-like expressions over JMS headers and user properties — never the body.',
    'The publisher must set routing values as message properties (jms:message properties).',
    'Messages that no selector matches stay on the queue; selectors filter, they never delete or dead-letter.',
    'JMS priority is 0–9 (default 4) and only a hint; prefetch/consumer buffers and broker settings weaken it (Classic needs prioritizedMessages for strict ordering).',
    'For urgent traffic such as recalls, a dedicated destination and consumers are more reliable than priority; per-region destinations or Virtual Topics often beat many selectors on one queue.',
  ],
  solution: `
**1. Selectors.** A selector is a SQL-92-style condition evaluated by the broker against **headers** (JMSPriority, JMSType, JMSCorrelationID…) and **user properties**. The body is never inspected, so the publisher has to set properties:
\`\`\`xml
<jms:publish config-ref="amq" destination="STORE.REPLEN" priority="#[if (vars.kind == 'RECALL') 9 else 4]">
  <jms:message>
    <jms:body>#[payload]</jms:body>
    <jms:properties>#[{ region: vars.region, msgKind: vars.kind }]</jms:properties>
  </jms:message>
</jms:publish>
\`\`\`

**2. NORTH backlog.** Selectors filter what each consumer receives; unmatched messages are not removed. NORTH messages stayed on \`STORE.REPLEN\` forever. Selectors over a large backlog of non-matching messages also cost the broker effort, because it has to skip them to find matches.

**3. Priority.** JMS priority is 0–9 (0–4 normal, 5–9 expedited, default 4) and the spec only asks brokers to "do their best". In practice:
- Consumers prefetch/buffer messages, and messages already buffered are processed first.
- ActiveMQ Classic only orders strictly by priority on a queue with the \`prioritizedMessages\` destination policy (and small prefetch); Artemis orders by priority in the queue, but consumer buffers still matter.
- 200,000 messages ahead of the recall plus prefetch explain the 40 minutes.

**4. Redesign.**
- **Recalls on their own queue** (\`STORE.RECALL\`), consumed by dedicated listeners, with alerting on age of the oldest message.
- **Per-region destinations** (\`STORE.REPLEN.WEST\`…) or a topic with per-region consumers instead of one queue with many selectors — adding a region then creates a new destination that is visible in monitoring.
- If selectors are kept, monitor queue depth per property value and add a catch-all consumer or validation at publish time for unknown regions.
`,
  followUps: [
    {
      q: 'Can you use a selector with jms:consume?',
      a: 'Yes, jms:consume also accepts a selector, which is useful for picking one specific message (for example by correlation ID) from a queue in a request-reply or reprocessing flow.',
    },
    {
      q: 'How would you test that a selector matches what the publisher sends?',
      a: 'In an integration test publish a message with the real properties and assert that the listener receives it; in MUnit you can verify that the publish sets the expected properties.',
    },
    {
      q: 'What other risk do recalls have besides latency?',
      a: 'They must not be lost or expire: use persistent delivery, no time-to-live, and an acknowledgement or receipt from each store so missing confirmations can be chased.',
    },
  ],
}
