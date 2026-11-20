import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const event = (eventId, eventType) => ({
  message: { kind: 'jms', destination: 'FLEET.EVENTS', payload: { eventId, eventType, unitId: 'EMU-317', station: 'Ashford Vale', at: '2026-11-13T06:12:00Z' } },
})

export default {
  id: 'fl-157',
  category: 'flows',
  title: 'Fleet Events on a JMS Topic: A Durable Subscription So the Reporting Service Misses Nothing Overnight',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'jms', 'topic', 'durable-subscription', 'database', 'rail'],
  estMinutes: 20,
  flowChecks: [
    {
      label: 'The reporting flow listens on the topic FLEET.EVENTS',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'FLEET.EVENTS' } },
    },
    {
      label: 'The subscription is durable and has a fixed name',
      rule: { type: 'source', component: 'jms-listener', where: { durable: 'true', subscriptionName: { set: true } } },
    },
    { label: 'One consumer on the topic subscription, so each event is stored once', rule: { type: 'source', component: 'jms-listener', where: { numberOfConsumers: 1 } } },
    { label: 'Only departures and arrivals are stored', rule: { type: 'inside', component: 'db-insert', within: 'choice', where: { sql: 'fleet_movements' } } },
  ],
  simulation: {
    systems: { db: { tables: { fleet_movements: { key: 'event_id', rows: [] } } } },
    tests: [
      {
        name: 'A train departs',
        about: 'A DEPARTED event is stored in fleet_movements.',
        trigger: event('FE-660101', 'DEPARTED'),
        expect: { ack: 'acked', db: { fleet_movements: { count: 1, has: [{ event_id: 'FE-660101', event_type: 'DEPARTED', unit_id: 'EMU-317' }] } } },
      },
      {
        name: 'A door fault',
        about: 'The engineering team needs DOOR_FAULT events, reporting does not. It is acknowledged and not stored.',
        trigger: event('FE-660102', 'DOOR_FAULT'),
        expect: { ack: 'acked', db: { fleet_movements: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'store-fleet-movements',
      source('jms-listener', { destination: 'FLEET.EVENTS', ackMode: 'AUTO', durable: 'true', subscriptionName: 'fleet-reporting', numberOfConsumers: 1 }),
      [
        router(
          'choice',
          {},
          [
            route({ expression: '#[["DEPARTED", "ARRIVED"] contains payload.eventType]' }, [
              step('db-insert', {
                database: 'PostgreSQL',
                sql: 'INSERT INTO fleet_movements (event_id, event_type, unit_id, station, event_at) VALUES (:eventId, :eventType, :unitId, :station, :at)',
                inputParameters: '#[{ eventId: payload.eventId, eventType: payload.eventType, unitId: payload.unitId, station: payload.station, at: payload.at }]',
              }),
            ]),
          ],
          { otherwise: [step('logger', { level: 'DEBUG', message: '#["Ignored " ++ payload.eventType]' })] },
        ),
      ],
    ),
  ),
  description: `
Corrib Rail, a fictional train operator, publishes every fleet event to the ActiveMQ **topic** \`FLEET.EVENTS\`. Engineering, the passenger app and the reporting service each subscribe.

\`{ "eventId": "FE-660101", "eventType": "DEPARTED", "unitId": "EMU-317", "station": "Ashford Vale", "at": "..." }\`

The reporting service stores departures and arrivals in the table \`fleet_movements\` (\`event_id\`, \`event_type\`, \`unit_id\`, \`station\`, \`event_at\`). It is stopped every night from 01:00 to 01:30 for patching. The first trains leave at 01:10, and those movements are missing from every morning report.

**Requirements**
- Subscribe to \`FLEET.EVENTS\` so that events published while the reporting app is stopped are kept for it and delivered when it starts again.
- Store only \`DEPARTED\` and \`ARRIVED\` events. Acknowledge the rest without storing them.
- Each event must be stored once.

**Facts**
- \`event_at\` holds the event's \`at\`. The other columns take the fields of the same name.
- Choose any subscription name, but keep it fixed. Set the number of consumers on the listener yourself.

**Design the flow.**
`,
  answerTemplate: `## Why events go missing

## The subscription

## Which events are stored
`,
  keyPoints: [
    'A plain topic subscription only gets messages while the subscriber is connected. Anything published while it is down is gone for that subscriber.',
    'A durable subscription is kept by the broker under its name. Messages published while the subscriber is away wait for it.',
    'The subscription name must stay the same across restarts and deploys. A new name is a new subscription that starts empty.',
    'On a JMS 1.1 durable subscription only one consumer can be active, so keep the number of consumers at 1. JMS 2.0 shared subscriptions are the way to spread the load.',
    'Unwanted event types are acknowledged and dropped by the flow. A selector on the subscription could do the same at the broker.',
  ],
  solution: `
1. **JMS On New Message** on \`FLEET.EVENTS\` as a topic: **Durable** \`true\`, **Subscription name** \`fleet-reporting\`, **Number of consumers** \`1\`.
2. **Choice**: \`#[["DEPARTED", "ARRIVED"] contains payload.eventType]\`: **Database Insert** into \`fleet_movements\`. Otherwise a DEBUG log.

**Client ID.** The broker keys a durable subscription on the connection's client ID and the subscription name, so set a fixed client ID on the JMS connection as well.

**Clean up.** A durable subscription nobody reads keeps growing. When the reporting service is retired, unsubscribe it on the broker.

**A primary key.** Put a key on \`event_id\`, so an event redelivered after a crash cannot be stored twice.
`,
  followUps: [
    {
      q: 'Why not change the publisher to send to a queue for reporting?',
      a: 'Then the publisher must know every consumer. With a topic, a new subscriber joins without touching the publisher. Durable subscriptions give each one the safety of a queue.',
    },
    {
      q: 'Reporting is down for three days. What happens on the broker?',
      a: 'The durable subscription keeps collecting events, which uses broker storage. Set limits and alerts on it, or a stuck subscriber can fill the broker for everyone.',
    },
  ],
}
