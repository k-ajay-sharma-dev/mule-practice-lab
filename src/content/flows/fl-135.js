import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const event = (vehicleId, seq, status, odometerKm) => ({ vehicleId, seq, status, odometerKm, sentAt: `2026-11-17T08:${String(seq % 60).padStart(2, '0')}:00Z` })
const message = (payload, deliveryCount = 1) => ({ message: { kind: 'mq', destination: 'vehicle-status', payload, deliveryCount } })

export default {
  id: 'fl-135',
  category: 'flows',
  title: 'Van Status Events Arrive Out of Order: Apply Only a Newer One, Insert the First, Drop the Stale, Never Lose One to an Outage',
  level: 'EXPERT',
  tags: ['myproject', 'anypoint-mq', 'manual-ack', 'ordering', 'idempotency', 'database', 'upsert', 'logistics'],
  estMinutes: 45,
  flowChecks: [
    {
      label: 'A subscriber reads vehicle-status with manual acknowledgement',
      rule: { type: 'source', component: 'mq-subscriber', where: { destination: 'vehicle-status', acknowledgementMode: 'MANUAL' } },
    },
    {
      label: 'The update changes a row only when the event is newer than what is stored',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'db-update', where: { sql: { all: ['vehicle_status', 'event_seq <'] } } },
          { type: 'exists', component: 'db-update', where: { sql: { all: ['vehicle_status', '> event_seq'] } } },
        ],
      },
    },
    {
      label: 'A van with no row yet is inserted, inside a Choice that runs when the update changed nothing',
      rule: { type: 'inside', component: 'db-insert', within: 'choice', where: { sql: 'vehicle_status' } },
    },
    {
      label: 'The insert sits in a Try whose On Error Continue treats a duplicate as a stale event',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-insert', within: 'try' },
          { type: 'inside', component: 'on-error-continue', within: 'try', where: { type: 'QUERY_EXECUTION' } },
        ],
      },
    },
    {
      label: 'On a duplicate, the same conditional update runs once more, so a newer event that lost the insert race still wins',
      rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', withinWhere: { type: 'QUERY_EXECUTION' }, where: { sql: { all: ['vehicle_status', 'event_seq'] } } },
    },
    {
      label: 'Each message is acknowledged on the main path, after the database work',
      rule: { type: 'before', first: 'db-update', then: 'mq-ack', outside: true },
    },
    {
      label: 'A database outage sends the message back with a Nack',
      rule: { type: 'inside', component: 'mq-nack', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'CONNECTIVITY' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          vehicle_status: {
            key: 'vehicle_id',
            rows: [
              { vehicle_id: 'V-12', status: 'ON_ROUTE', odometer_km: 48210, event_seq: 40 },
              { vehicle_id: 'V-17', status: 'AT_DEPOT', odometer_km: 91002, event_seq: 7 },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'A newer event for a known van',
        about: 'V-12 is at sequence 40 and event 41 arrives. The row takes the new status, mileage and sequence, and the message is acknowledged.',
        trigger: message(event('V-12', 41, 'DELIVERING', 48236)),
        expect: { ack: 'acked', db: { vehicle_status: { count: 2, has: [{ vehicle_id: 'V-12', status: 'DELIVERING', odometer_km: 48236, event_seq: 41 }] } } },
      },
      {
        name: 'An old event arrives late',
        about: 'Event 38 for V-12 was stuck on a phone with no signal and arrives after 40. It must not take the van back in time. It is acknowledged and dropped.',
        trigger: message(event('V-12', 38, 'LOADING', 48190)),
        expect: { ack: 'acked', db: { vehicle_status: { count: 2, has: [{ vehicle_id: 'V-12', status: 'ON_ROUTE', event_seq: 40 }] } } },
      },
      {
        name: 'The first event for a new van',
        about: 'V-30 joined the fleet today and has no row. The event is inserted and acknowledged.',
        trigger: message(event('V-30', 1, 'AT_DEPOT', 12)),
        expect: { ack: 'acked', db: { vehicle_status: { count: 3, has: [{ vehicle_id: 'V-30', status: 'AT_DEPOT', event_seq: 1 }] } } },
      },
      {
        name: 'Two events for one van in the wrong order',
        about: 'Event 9 for V-17 arrives, then event 8. The van ends at event 9, and both messages are acknowledged.',
        triggers: [message(event('V-17', 9, 'ON_ROUTE', 91040)), message(event('V-17', 8, 'LOADING', 91003))],
        expect: { ack: ['acked', 'acked'], db: { vehicle_status: { has: [{ vehicle_id: 'V-17', status: 'ON_ROUTE', event_seq: 9 }] } } },
      },
      {
        name: 'The same event delivered twice',
        about: 'The acknowledgement for event 41 was lost and the broker sends it again. The second copy changes nothing and is acknowledged.',
        triggers: [message(event('V-12', 41, 'DELIVERING', 48236)), message(event('V-12', 41, 'DELIVERING', 48236), 2)],
        expect: { noError: true, ack: ['acked', 'acked'], db: { vehicle_status: { count: 2, has: [{ vehicle_id: 'V-12', event_seq: 41 }] } } },
      },
      {
        name: 'The database is down',
        about: 'The status database does not answer. The message goes back to the queue to be delivered again, and nothing is lost.',
        trigger: message(event('V-12', 42, 'RETURNING', 48300)),
        overrides: { systems: { db: { fault: true } } },
        expect: { ack: 'returned' },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'vehicle-status-consumer',
      source('mq-subscriber', { destination: 'vehicle-status', acknowledgementMode: 'MANUAL' }),
      [
        step('set-variable', { variableName: 'ackToken', value: '#[attributes.ackToken]' }),
        step('db-update', {
          database: 'PostgreSQL',
          sql: 'UPDATE vehicle_status SET status = :status, odometer_km = :odometerKm, event_seq = :seq WHERE vehicle_id = :vehicleId AND event_seq < :seq',
          inputParameters: '#[{ status: payload.status, odometerKm: payload.odometerKm, seq: payload.seq, vehicleId: payload.vehicleId }]',
          target: 'applied',
        }),
        router('choice', {}, [
          route({ expression: '#[vars.applied.affectedRows == 0]' }, [
            scope(
              'try',
              {},
              [
                step('db-insert', {
                  database: 'PostgreSQL',
                  sql: 'INSERT INTO vehicle_status (vehicle_id, status, odometer_km, event_seq) VALUES (:vehicleId, :status, :odometerKm, :seq)',
                  inputParameters: '#[{ vehicleId: payload.vehicleId, status: payload.status, odometerKm: payload.odometerKm, seq: payload.seq }]',
                  target: 'inserted',
                }),
              ],
              {
                errorHandlers: [
                  handler('on-error-continue', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "duplicate key"]' }, [
                    step('db-update', {
                      database: 'PostgreSQL',
                      sql: 'UPDATE vehicle_status SET status = :status, odometer_km = :odometerKm, event_seq = :seq WHERE vehicle_id = :vehicleId AND event_seq < :seq',
                      inputParameters: '#[{ status: payload.status, odometerKm: payload.odometerKm, seq: payload.seq, vehicleId: payload.vehicleId }]',
                      target: 'retried',
                    }),
                    step('logger', { level: 'INFO', message: '#["Event " ++ (payload.seq as String) ++ " for " ++ payload.vehicleId ++ ": the van was stored by another delivery first. Applied only if newer."]' }),
                  ]),
                ],
              },
            ),
          ]),
        ]),
        step('mq-ack', { ackToken: '#[vars.ackToken]' }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('logger', { level: 'WARN', message: '#["Status database not reachable. Event for " ++ payload.vehicleId ++ " sent back to the queue."]' }),
          step('mq-nack', { ackToken: '#[vars.ackToken]' }),
        ]),
      ],
    ),
  ),
  description: `
A parcel company's 400 delivery vans send a **status event** from the driver's phone whenever something changes: loading, on route, delivering, back at the depot. The events go to the Anypoint MQ queue **vehicle-status**. One consumer keeps the latest state of each van in the PostgreSQL table \`vehicle_status\`:

| column | meaning |
|---|---|
| \`vehicle_id\` | primary key, such as V-12 |
| \`status\`, \`odometer_km\` | the latest state |
| \`event_seq\` | the sequence number of the event that set it |

Each van numbers its own events: 1, 2, 3 and so on. An event looks like \`{ "vehicleId": "V-12", "seq": 41, "status": "DELIVERING", "odometerKm": 48236, "sentAt": "..." }\`.

The queue is a **standard queue**, not FIFO, and the consumer runs on two replicas. Phones also lose signal and send a batch of old events when they reconnect. So events for one van can arrive **out of order**, and now and then **twice**. Last week the depot screen showed a van as "loading" an hour after it had left, because a late event overwrote a newer one.

**Requirements**
- Store an event only if its \`seq\` is higher than the one stored for that van.
- The first event for a new van creates its row.
- An older or repeated event changes nothing, is acknowledged, and is not an error.
- Two replicas may handle the first two events of a new van at the same moment. The table must still end with the newer one, and no event may fail for it.
- If the database cannot be reached, the message must go back to the queue, not be lost.

**Facts**
- Store \`seq\` in \`event_seq\` and \`odometerKm\` in \`odometer_km\`.
- Use **manual** acknowledgement on the subscriber: Ack each message once its database work is done, and Nack it when the database cannot be reached (**DB:CONNECTIVITY**).
- When PostgreSQL refuses a second row for the same \`vehicle_id\`, the Database Insert raises **DB:QUERY_EXECUTION** with a description that contains \`duplicate key value violates unique constraint\`.

**Design the flow.** Explain why the check and the write must be one statement.

**What each system sends back**
- The subscriber puts the message in the payload and its acknowledgement token in \`attributes.ackToken\`. Keep the token in a variable: Ack and Nack need it.
- A Database **Update** answers \`{ "affectedRows": 1 }\` when it changed the row, and \`{ "affectedRows": 0 }\` when no row matched: a new van, or an event that is not newer. Store it in a target variable, so the payload still holds the event.

**What failures look like**
- The database is down: the update or insert raises \`DB:CONNECTIVITY\`. Nack the message, so it goes back to the queue.
`,
  answerTemplate: `## Reading the queue

## Applying only a newer event

## A van with no row yet

## Stale and repeated events

## When the database is down
`,
  keyPoints: [
    'Put the version check in the UPDATE itself: WHERE vehicle_id = :vehicleId AND event_seq < :seq. The database checks and writes in one step.',
    'Read affectedRows. One row changed means the event was newer. Zero means the van is new, or the event is old.',
    'On zero, try an INSERT. If the primary key refuses it, another delivery stored the van first. Catch that in On Error Continue and run the conditional UPDATE once more.',
    'A SELECT then an UPDATE leaves a gap where another replica can write in between.',
    'Use manual acknowledgement. Ack on the main path once the database work is done, and Nack in the handler for DB:CONNECTIVITY so the message comes back.',
    'Keep the ack token in a variable at the start, before any step can replace the attributes.',
  ],
  solution: `
**Flow: vehicle-status-consumer**
1. **Anypoint MQ Subscriber** on \`vehicle-status\`, Acknowledgement mode **MANUAL**.
2. **Set Variable** \`ackToken\` = \`#[attributes.ackToken]\`.
3. **Database Update**, Target \`applied\`:
   \`\`\`sql
   UPDATE vehicle_status
   SET status = :status, odometer_km = :odometerKm, event_seq = :seq
   WHERE vehicle_id = :vehicleId AND event_seq < :seq
   \`\`\`
4. **Choice**, route \`#[vars.applied.affectedRows == 0]\`:
   - **Try** with a **Database Insert** of the van's row.
   - **On Error Continue** for \`DB:QUERY_EXECUTION\`, When \`#[error.description contains "duplicate key"]\`: run the same conditional **Database Update** once more, and log at INFO.
5. **Anypoint MQ Ack** with \`#[vars.ackToken]\`.
6. **On Error Propagate** for \`DB:CONNECTIVITY\`: log a WARN and **Anypoint MQ Nack** with \`#[vars.ackToken]\`.

**Why one statement.** If the flow read the row first and compared in DataWeave, two replicas could both read sequence 40, and the one holding event 41 could write after the one holding event 42. The UPDATE with \`event_seq < :seq\` cannot be beaten that way: the database locks the row while it checks and writes.

**The new van race.** Events 1 and 2 for V-30 arrive at two replicas together. Both UPDATEs change nothing. Both try to INSERT. One wins. The other gets a duplicate key, which here means "someone stored this van first". Its handler runs the conditional UPDATE again. If event 1 won the insert, event 2 now updates the row. If event 2 won, event 1's second UPDATE changes nothing. Either way the van ends at event 2, and both messages are acknowledged. A late or repeated event takes the same path and changes nothing.

**Why ack at the end.** With MANUAL mode nothing is acknowledged until the flow says so. An error before the ack leaves the message to come back, and the Nack in the handler sends it back at once.
`,
  followUps: [
    {
      q: 'Would a FIFO queue remove the need for the sequence check?',
      a: 'Not fully. It keeps order on the broker, but the phones themselves send late events after a signal gap. The check against the stored sequence is still needed.',
    },
    {
      q: 'Could the database do the insert and the update in one statement?',
      a: 'PostgreSQL has INSERT ... ON CONFLICT (vehicle_id) DO UPDATE with a WHERE on the stored sequence. That removes the Choice and the Try. The flow then depends on that dialect, which is a fair trade if the team owns the database.',
    },
    {
      q: 'What if a phone is reset and its sequence starts again at 1?',
      a: 'Every event after the reset looks stale. Send a boot or session number with the sequence and compare the pair, or let the depot reset a van\'s stored sequence when its phone is replaced.',
    },
  ],
}
