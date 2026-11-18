import { design, flow, handler, route, router, source, step, subFlow } from '../../flow/dsl.js'

const v1 = { eventId: 'PE-1001', memberId: 'M-50117', points: 120, storeId: 'S-014' }
const v2 = { schemaVersion: 2, eventId: 'PE-1002', member: { id: 'M-50242', tier: 'GOLD' }, points: 80, store: { id: 'S-201', country: 'IE' }, earnedAt: '2026-11-13T09:58:12Z' }
const v3 = { schemaVersion: 3, eventId: 'PE-1003', member: { id: 'M-50391' }, award: { points: 40, reason: 'BASKET_BONUS' }, store: { id: 'S-300', country: 'GB' } }
const message = (payload, deliveryCount = 1) => ({ message: { kind: 'mq', destination: 'points-earned', payload, deliveryCount } })

export default {
  id: 'fl-129',
  category: 'flows',
  title: 'Two Event Versions on One Queue: Map v1 and v2 to One Shape, Park the Unknown, Ignore a Repeat',
  level: 'ADVANCED',
  tags: ['myproject', 'anypoint-mq', 'schema-evolution', 'versioning', 'idempotency', 'parking-queue', 'retail', 'loyalty'],
  estMinutes: 40,
  flowChecks: [
    { label: 'A subscriber reads the points-earned queue', rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'points-earned' } } },
    { label: 'A Choice routes each event on its schemaVersion', rule: { type: 'routes', component: 'choice', min: 2, routeWhere: { expression: 'schemaVersion' } } },
    { label: 'Each known version is mapped to one shape inside its own route', rule: { type: 'inside', component: 'transform', within: 'choice', min: 2 } },
    {
      label: 'Points are saved to points_ledger only on the routes for known versions',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'choice', where: { sql: 'points_ledger' } },
          { type: 'absent', component: 'db-insert', within: 'choice', inSlot: 'otherwise' },
        ],
      },
    },
    { label: 'An unknown version goes to the parking queue points-earned-parked', rule: { type: 'inside', component: 'mq-publish', within: 'choice', where: { destination: 'points-earned-parked' } } },
    {
      label: 'A repeated event is caught by an On Error Continue for the database refusing a duplicate',
      rule: { type: 'handler', component: 'on-error-continue', where: { type: 'QUERY_EXECUTION' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          points_ledger: {
            key: 'event_id',
            rows: [{ event_id: 'PE-0990', member_id: 'M-50117', points: 35, store_id: 'S-014', country: null }],
          },
        },
      },
    },
    tests: [
      {
        name: 'A v1 event from an old till',
        about: 'The event has no schemaVersion. It is read as version 1, saved with no country, and acknowledged.',
        trigger: message(v1),
        expect: {
          ack: 'acked',
          notSent: ['points-earned-parked'],
          db: { points_ledger: { count: 2, has: [{ event_id: 'PE-1001', member_id: 'M-50117', points: 120, store_id: 'S-014' }] } },
        },
      },
      {
        name: 'A v2 event from a new till',
        about: 'The member and store are now nested objects, and the store has a country. The same row shape is saved.',
        trigger: message(v2),
        expect: { ack: 'acked', db: { points_ledger: { count: 2, has: [{ event_id: 'PE-1002', member_id: 'M-50242', points: 80, store_id: 'S-201', country: 'IE' }] } } },
      },
      {
        name: 'A v3 event from the pilot store',
        about: 'A pilot store sends version 3 before the consumer knows it. The event is moved unchanged to the parking queue and acknowledged. Nothing is saved, and the queue keeps flowing.',
        trigger: message(v3),
        expect: { ack: 'acked', sent: [{ destination: 'points-earned-parked', count: 1, has: { eventId: 'PE-1003', schemaVersion: 3 } }], db: { points_ledger: { count: 1 } } },
      },
      {
        name: 'The same event delivered twice',
        about: 'The first delivery saved the points but its acknowledgement was lost, so Anypoint MQ delivers it again. The second copy is recognised and acknowledged, and the member gets the points once.',
        triggers: [message(v2), message(v2, 2)],
        expect: { noError: true, ack: ['acked', 'acked'], db: { points_ledger: { count: 2 } } },
      },
      {
        name: 'The ledger database is down',
        about: 'The database does not answer. The error is not swallowed: the message goes back to the queue to be delivered again later.',
        trigger: message(v1),
        overrides: { systems: { db: { fault: true } } },
        expect: { ack: 'returned', notSent: ['points-earned-parked'] },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'points-earned-consumer',
      source('mq-subscriber', { destination: 'points-earned' }),
      [
        router(
          'choice',
          {},
          [
            route({ expression: '#[(payload.schemaVersion default 1) == 1]' }, [
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\n{ eventId: payload.eventId, memberId: payload.memberId, points: payload.points, storeId: payload.storeId, country: null }',
              }),
              step('flow-ref', { name: 'save-points' }),
            ]),
            route({ expression: '#[payload.schemaVersion == 2]' }, [
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\n{ eventId: payload.eventId, memberId: payload.member.id, points: payload.points, storeId: payload.store.id, country: payload.store.country }',
              }),
              step('flow-ref', { name: 'save-points' }),
            ]),
          ],
          {
            otherwise: [
              step('logger', { level: 'WARN', message: '#["Event " ++ (payload.eventId default "?") ++ " has schemaVersion " ++ ((payload.schemaVersion default "?") as String) ++ ", which this consumer does not know. Parked."]' }),
              step('mq-publish', { destination: 'points-earned-parked' }),
            ],
          },
        ),
      ],
      [
        handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "duplicate key"]' }, [
          step('logger', { level: 'INFO', message: '#["Event " ++ payload.eventId ++ " is already in the ledger. Repeat ignored."]' }),
        ]),
      ],
    ),
    subFlow('save-points', [
      step('db-insert', {
        database: 'PostgreSQL',
        sql: 'INSERT INTO points_ledger (event_id, member_id, points, store_id, country) VALUES (:eventId, :memberId, :points, :storeId, :country)',
        inputParameters: '#[payload]',
      }),
    ]),
  ),
  description: `
A supermarket chain's loyalty platform gets a **points earned** event from the tills for every basket with a loyalty card. The tills publish to the Anypoint MQ queue **points-earned**, and one consumer saves the points in the PostgreSQL table \`points_ledger\` (\`event_id\`, \`member_id\`, \`points\`, \`store_id\`, \`country\`). \`event_id\` is the primary key.

The tills are being upgraded store by store over eight months, so the queue carries two versions at once:

**Version 1** (old tills, no version field):
\`\`\`json
{ "eventId": "PE-1001", "memberId": "M-50117", "points": 120, "storeId": "S-014" }
\`\`\`

**Version 2** (new tills):
\`\`\`json
{ "schemaVersion": 2, "eventId": "PE-1002", "member": { "id": "M-50242", "tier": "GOLD" },
  "points": 80, "store": { "id": "S-201", "country": "IE" }, "earnedAt": "2026-11-13T09:58:12Z" }
\`\`\`

Last week a pilot store started sending **version 3** without telling anyone. The consumer failed on every v3 event, Anypoint MQ delivered each one again and again, and the queue backed up for two hours.

**Requirements**
- Save v1 and v2 events as the same row. v1 has no country, so save it empty.
- Move any version the consumer does not know, unchanged, to the queue **points-earned-parked**, and acknowledge it, so the rest of the queue keeps flowing. The loyalty team replays parked events once the consumer knows the new version.
- Anypoint MQ can deliver a message more than once. A member must never get the same points twice. PostgreSQL refuses a second row with the same \`event_id\` with **DB:QUERY_EXECUTION**, and its description contains \`duplicate key value violates unique constraint\`.
- If the database is down, the event must not be lost or parked: it should go back to the queue and be delivered again later.

The subscriber uses the default acknowledgement mode: a message is acknowledged when the flow ends without an error, and goes back to the queue when the flow ends with one.

**Design the flow.** Explain why a parking queue and not the dead-letter queue.
`,
  answerTemplate: `## Telling the versions apart

## One shape for the ledger

## Unknown versions

## A repeated event

## When the database is down
`,
  keyPoints: [
    'Route on the version with a Choice. Treat a missing schemaVersion as version 1, because the old tills never send one.',
    'Map each known version to one internal shape, then save it in one place, such as a sub-flow both routes call.',
    'Park what you do not understand on a queue of its own and acknowledge it. Redelivering it can never succeed and holds up every message behind it.',
    'A parking queue is for messages that are valid but not yet supported, and are replayed later. A DLQ is for messages that failed too many times.',
    'Use the event ID as the primary key. A repeat then fails the insert, and an On Error Continue for that error acknowledges it.',
    'Catch only the duplicate. A database outage must end the flow with an error so the message is delivered again.',
  ],
  solution: `
**Flow: points-earned-consumer**
1. **Anypoint MQ Subscriber** on \`points-earned\`.
2. **Choice**:
   - When \`#[(payload.schemaVersion default 1) == 1]\`: **Transform** to \`{ eventId, memberId, points, storeId, country: null }\`, then **Flow Reference** \`save-points\`.
   - When \`#[payload.schemaVersion == 2]\`: **Transform** with \`memberId: payload.member.id\`, \`storeId: payload.store.id\`, \`country: payload.store.country\`, then **Flow Reference** \`save-points\`.
   - Otherwise: log a WARN with the version, and **Publish** the message unchanged to \`points-earned-parked\`.
3. **On Error Continue**, type \`DB:QUERY_EXECUTION\`, When \`#[error.description contains "duplicate key"]\`: log that the event is already in the ledger.

**Sub-flow: save-points**
- **Database Insert**: \`INSERT INTO points_ledger (event_id, member_id, points, store_id, country) VALUES (:eventId, :memberId, :points, :storeId, :country)\`, Input parameters \`#[payload]\`.

**Why \`default 1\`.** A v1 event has no \`schemaVersion\`, so \`payload.schemaVersion == 1\` is false for every old till. \`default 1\` reads a missing version as 1.

**Parking queue or DLQ.** A DLQ collects messages that failed a number of deliveries. A v3 event would fail the same way every time, so sending it to the DLQ still costs every delivery on the way, and mixes it with real failures. The parking queue takes it at once, and holds only events that need a newer consumer. Once v3 is supported, the team moves them back to \`points-earned\`.

**Repeats.** The second insert of \`PE-1002\` hits the primary key. The handler catches only that error and ends the flow without one, so the copy is acknowledged and the points are counted once.

**Database down.** DB:CONNECTIVITY is not caught. The flow ends with an error, so Anypoint MQ makes the message available again and nothing is lost. Give the queue a DLQ with a redelivery limit high enough to ride out an outage.
`,
  followUps: [
    {
      q: 'Why not let the tills send v2 only and upgrade the consumer in one go?',
      a: 'The tills move over eight months, store by store. Consumers of an event usually have to accept the old and the new version for the whole changeover.',
    },
    {
      q: 'Would a JSON schema check per version help?',
      a: 'Yes. Validate each route against its version\'s schema, and park events that fail it, so a malformed v2 event is not saved with missing fields.',
    },
    {
      q: 'How would you replay the parked events once v3 is supported?',
      a: 'A small flow or a script reads points-earned-parked and publishes each message back to points-earned. The primary key keeps a replay safe if some were already saved.',
    },
  ],
}
