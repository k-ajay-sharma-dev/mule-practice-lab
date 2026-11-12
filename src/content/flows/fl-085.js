import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-085',
  category: 'flows',
  title: 'Airport Flight Events on an ActiveMQ Topic: Priority, Time to Live and Consumer Selectors',
  level: 'ADVANCED',
  tags: ['activemq', 'jms', 'aviation', 'priority', 'time-to-live', 'message-selector', 'topic'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Events enter through an HTTP Listener and are validated', rule: { type: 'before', first: 'json-validate', then: 'jms-publish' } },
    { label: 'Publishing is chosen by event kind (Choice with at least two conditions)', rule: { type: 'routes', component: 'choice', min: 2 } },
    { label: 'Events are published to a TOPIC', rule: { type: 'exists', component: 'jms-publish', where: { destinationType: 'TOPIC' } } },
    {
      label: 'Safety notices are published with a high priority, persistent delivery and no time to live',
      rule: {
        type: 'inside',
        component: 'jms-publish',
        where: { priority: { gte: 7 }, persistentDelivery: 'true', timeToLive: { lte: 0 } },
        within: 'choice',
        routeWhere: { expression: 'SAFETY' },
      },
    },
    {
      label: 'Gate changes expire after about 30 minutes',
      rule: {
        type: 'inside',
        component: 'jms-publish',
        where: { timeToLive: { gte: 900000, lte: 2700000 } },
        within: 'choice',
        routeWhere: { expression: 'GATE_CHANGE' },
      },
    },
    {
      label: 'Position updates expire after about 2 minutes, so an offline app does not get a stale backlog',
      rule: { type: 'exists', component: 'jms-publish', where: { timeToLive: { gte: 30000, lte: 300000 } } },
    },
    {
      label: 'Topic listeners use one consumer, because a subscription allows only one on JMS 1.1',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'jms-listener' },
          { type: 'absent', component: 'jms-listener', where: { numberOfConsumers: { gte: 2 } } },
        ],
      },
    },
    {
      label: 'Consumers filter with a selector on the published property',
      rule: { type: 'source', component: 'jms-listener', where: { selector: 'eventKind' } },
    },
    {
      label: 'A consumer also filters by hub, so each app receives only what it needs',
      rule: { type: 'source', component: 'jms-listener', where: { selector: 'hub' } },
    },
    {
      label: 'The safety alert listener has a named durable subscription, so it gets notices sent while it was offline',
      rule: {
        type: 'source',
        component: 'jms-listener',
        where: { selector: 'SAFETY', durable: { is: 'true' }, subscriptionName: { set: true } },
      },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'flight-event-publisher',
      why: 'Answering 400 for an invalid event and 503 when the broker is down is good practice, but this scenario is about how events are published and consumed.',
    },
  ],
  referenceFlow: design(
    flow(
      'flight-event-publisher',
      source('http-listener', { path: '/api/v1/flight-events', allowedMethods: 'POST' }),
      [
        step('json-validate', { schema: 'schemas/flight-event-v1.json', content: '#[payload]' }),
        // Every publish below sets jms:properties to #[{ eventKind: payload.kind, hub: payload.hub }]. Selectors read these, never the body.
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.kind == "SAFETY"]' }, [
              // No time to live: this notice stays valid until it is withdrawn.
              step('jms-publish', { destination: 'OPS.FLIGHT.EVENTS', destinationType: 'TOPIC', persistentDelivery: 'true', priority: 9, timeToLive: 0 }),
            ]),
            route({ expression: '#[payload.kind == "GATE_CHANGE"]' }, [
              step('jms-publish', { destination: 'OPS.FLIGHT.EVENTS', destinationType: 'TOPIC', persistentDelivery: 'true', priority: 6, timeToLive: 1800000 }),
            ]),
          ],
          {
            otherwise: [
              // Position and ETA updates: a newer one follows within a minute.
              step('jms-publish', { destination: 'OPS.FLIGHT.EVENTS', destinationType: 'TOPIC', persistentDelivery: 'false', priority: 2, timeToLive: 120000 }),
            ],
          },
        ),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ status: "ACCEPTED", correlationId: correlationId }' }),
      ],
      [
        handler('on-error-propagate', { type: 'JSON:SCHEMA_NOT_HONOURED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[400]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INVALID_EVENT", message: error.description }' }),
        ]),
        handler('on-error-propagate', { type: 'JMS:PUBLISHING, JMS:CONNECTIVITY, JMS:RETRY_EXHAUSTED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('logger', { level: 'ERROR', message: '#["Broker unavailable: " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "BROKER_UNAVAILABLE", message: "Please retry" }' }),
        ]),
      ],
    ),
    flow(
      'gate-displays-fra',
      // Topic consumer. One consumer per subscription on JMS 1.1, so numberOfConsumers is 1, not the default 4.
      source('jms-listener', { destination: 'OPS.FLIGHT.EVENTS', ackMode: 'AUTO', numberOfConsumers: 1, selector: "hub = 'FRA' AND eventKind IN ('GATE_CHANGE', 'POSITION')" }),
      [step('http-request', { method: 'POST', path: '/displays/fra/events', responseTimeout: 3000 })],
    ),
    flow(
      'duty-manager-alerts',
      // Durable subscription: safety notices published while this app is down are held for it.
      source('jms-listener', {
        destination: 'OPS.FLIGHT.EVENTS',
        ackMode: 'AUTO',
        numberOfConsumers: 1,
        selector: "eventKind = 'SAFETY'",
        durable: 'true',
        subscriptionName: 'duty-manager-alerts',
      }),
      [step('email-send', { toAddresses: 'duty-managers@company.example', subject: 'Flight safety notice', content: '#[write(payload, "application/json")]', contentType: 'text/plain' })],
    ),
  ),
  description: `
An airline's operations control system sends flight events to a new **Flight Events API** (\`POST /api/v1/flight-events\`) with a body such as \`{ "kind": "GATE_CHANGE", "hub": "FRA", "flight": "XY204", ... }\`. On a busy day there are about **400,000 events**, most of them position and ETA updates.

Three kinds of event have very different value over time:

| Kind | Volume | Stays useful for |
|---|---|---|
| \`SAFETY\` | A few per day | Until withdrawn, must not be lost |
| \`GATE_CHANGE\` | About 3,000 per day | 30 minutes |
| \`POSITION\` | The rest | 2 minutes, a newer one follows |

Several applications need the events through **ActiveMQ**: gate displays at each hub, a passenger notification app, and an alert app for duty managers. New consumers are expected, so the publisher should not know about them.

The current design sends everything with default settings. When the Frankfurt display app, which has a durable subscription, was down for an hour, it came back to a backlog of position updates that were already useless, and the screens showed old data for 20 minutes.

**Facts**
- Each published message carries two JMS properties: \`eventKind\` (the event kind) and \`hub\` (the hub code).

**Requirements**
- Publish once. Each application receives its own copy.
- Each app sees only the kinds and hubs it needs.
- Stale events should not be delivered to an app that was offline.
- Safety notices must survive a broker restart and reach the alert app even if it was offline.

**Design the publisher and two consumers.** State what priority and time to live do and do not guarantee.
`,
  answerTemplate: `## Topic or queue

## Message properties

## Priority per kind

## Time to live per kind

## Persistent delivery

## Consumers and selectors

## What priority does not guarantee
`,
  keyPoints: [
    'A topic gives each subscriber its own copy, so new consumers need no change in the publisher.',
    'Selectors work on JMS headers and message properties, never on the body, so the publisher sets eventKind and hub as properties with a DataWeave map.',
    'Time to live is set per kind: 0 for safety notices, 30 minutes for gate changes, 2 minutes for position updates. This is the actual fix for the stale backlog.',
    'Priority and time to live solve different problems. Priority orders what is waiting, and time to live removes what has stopped being useful.',
    'Persistent Delivery defaults to false on the config, so it must be set for events that have to survive a broker restart. It is not worth the cost for position updates.',
    'A subscriber only receives messages published while it is offline with a durable subscription. Otherwise the safety requirement is not met.',
    'Set Number Of Consumers to 1 on a topic listener unless the subscription is shared: the default is 4, and JMS 1.1 allows one consumer per subscription.',
  ],
  solution: `
**Topic.** \`OPS.FLIGHT.EVENTS\` with Destination Type \`TOPIC\`. Each subscriber receives its own copy, and adding one needs no publisher change. A single queue with selectors would give each message to one consumer only.

**Publisher.**
1. **HTTP Listener**, then **JSON Validate Schema**.
2. **Choice** on \`payload.kind\`, because each kind has its own settings:

| Kind | Priority | Time to live | Persistent |
|---|---|---|---|
| \`SAFETY\` | 9 | 0 (does not expire) | true |
| \`GATE_CHANGE\` | 6 | 30 minutes | true |
| \`POSITION\` | 2 | 2 minutes | false |

3. **JMS Publish** in each branch, with properties set in the message:
\`\`\`xml
<jms:publish config-ref="amq" destination="OPS.FLIGHT.EVENTS" destinationType="TOPIC"
             priority="9" persistentDelivery="true">
  <jms:message>
    <jms:body>#[payload]</jms:body>
    <jms:properties>#[{ eventKind: payload.kind, hub: payload.hub }]</jms:properties>
  </jms:message>
</jms:publish>
\`\`\`
The config defaults are priority 4, time to live 0 and non-persistent, which is how the backlog of old position updates built up.

**Consumers.**
- \`gate-displays-fra\`: selector \`hub = 'FRA' AND eventKind IN ('GATE_CHANGE', 'POSITION')\`. It can stay durable, because the time to live now keeps old events from being delivered after an outage. Dropping to a non-durable subscription is also an option if displays can rebuild from the next events.
- \`duty-manager-alerts\`: selector \`eventKind = 'SAFETY'\` on a **durable subscription**, so the JMS provider holds messages published while it is offline. Set the consumer type to Topic consumer on both.

Use one consumer per topic listener. Under JMS 1.1 a subscription cannot have more than one consumer at a time, and shared subscriptions need a JMS 2.0 connection. Confirm which your broker supports.

**What the settings do not guarantee.**
- **Priority is a hint**, not a contract. It only matters while messages wait, and buffered messages can still go first. It cannot make a slow consumer fast.
- **Time to live** starts when the message is sent. An expired message is simply not delivered. It is not a report: if a business process needs to know about expired events, build that yourself. Check on your broker what happens to expired messages and whether clocks are in sync.
- **A durable subscriber with a selector** still accumulates its matching messages while offline, so monitor it and remove subscriptions that are no longer used.
`,
  followUps: [
    {
      q: 'Why three Publish steps instead of one with expressions?',
      a: 'One publish with expressions for priority and time to live also works, and it reads better when there are many kinds. Three branches are clearer when the kinds also differ in persistence and need to be reviewed side by side.',
    },
    {
      q: 'Can you select on the value of a JSON field in the body?',
      a: 'No. Selectors only see headers and properties. That is why the publisher copies the kind and hub into properties, and it makes those properties part of the contract with consumers.',
    },
    {
      q: 'The display app should show only urgent events during an incident. Could it use JMSPriority in a selector?',
      a: 'Yes, the standard selector language can use JMSPriority, for example JMSPriority >= 6. Selecting on a business property is usually clearer, because it does not break if someone later adjusts priorities.',
    },
    {
      q: 'How do you scale a consumer that cannot keep up with the topic?',
      a: 'With JMS 2.0 shared subscriptions, or with an ActiveMQ Virtual Topic where each app reads its own queue and can run several consumers. Either way the publisher does not change.',
    },
  ],
}
