import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

const events = [
  { event_id: 'EV-301', title: 'Winter Choir Concert', seats_left: 10 },
  { event_id: 'EV-302', title: 'Puppet Theatre Matinee', seats_left: 2 },
  { event_id: 'EV-303', title: 'Jazz Night', seats_left: 1 },
]
const tables = { events: { key: 'event_id', rows: events }, reservations: { key: 'reservation_id', rows: [] } }
const reserve = (eventId, customerId, seats) => ({ http: { method: 'POST', path: `/events/${eventId}/reservations`, body: { customerId, seats } } })

export default {
  id: 'fl-146',
  category: 'flows',
  title: 'The Last Seat at a Concert: Take Seats With One Conditional UPDATE, 409 When Too Few Are Left, and Never Read the Count First',
  level: 'ADVANCED',
  tags: ['myproject', 'concurrency', 'database', 'conditional-update', 'transactions', '409', 'ticketing'],
  estMinutes: 40,
  flowChecks: [
    { label: 'The API is a POST on /events/{eventId}/reservations', rule: { type: 'source', component: 'http-listener', where: { path: '/events/{eventId}/reservations', allowedMethods: 'POST' } } },
    {
      label: 'One Update takes the seats only while enough are left',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['events', 'seats_left -', 'seats_left >='] } } },
    },
    { label: 'No Select of the count comes before that Update', rule: { type: 'before', first: 'db-update', then: 'db-select', every: true } },
    {
      label: 'Taking the seats and saving the reservation sit in one transaction',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'db-update', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' } },
          { type: 'inside', component: 'db-insert', within: 'try', withinWhere: { transactionalAction: 'ALWAYS_BEGIN' }, where: { sql: 'reservations' } },
        ],
      },
    },
    { label: 'A Choice route answers 409 when too few seats are left', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '409' } } },
  ],
  simulation: {
    systems: { db: { tables } },
    tests: [
      {
        name: 'Two seats for the choir',
        about: 'Ten seats are left. The customer gets 201 with a reservation, and eight seats are left.',
        trigger: reserve('EV-301', 'C-118', 2),
        expect: {
          status: 201,
          bodyHas: { eventId: 'EV-301', seats: 2 },
          db: { events: { has: [{ event_id: 'EV-301', seats_left: 8 }] }, reservations: { count: 1, has: [{ event_id: 'EV-301', customer_id: 'C-118', seats: 2 }] } },
        },
      },
      {
        name: 'Two buyers for the last seat',
        about: 'One seat is left for Jazz Night and two customers ask for it. The first gets it. The second gets 409, and the count never goes below zero.',
        triggers: [reserve('EV-303', 'C-201', 1), reserve('EV-303', 'C-202', 1)],
        expect: { status: 409, bodyHas: { message: 'Not enough seats left' }, db: { events: { has: [{ event_id: 'EV-303', seats_left: 0 }] }, reservations: { count: 1, has: [{ customer_id: 'C-201' }] } } },
      },
      {
        name: 'More seats than are left',
        about: 'Two seats are left for the matinee and a family asks for three. The answer is 409 and both seats stay free.',
        trigger: reserve('EV-302', 'C-305', 3),
        expect: { status: 409, db: { events: { has: [{ event_id: 'EV-302', seats_left: 2 }] }, reservations: { count: 0 } } },
      },
      {
        name: 'An event that does not exist',
        about: 'The app asks for EV-999. The answer is 404, not 409, so the app does not say "sold out".',
        trigger: reserve('EV-999', 'C-118', 1),
        expect: { status: 404, bodyHas: { message: 'No event EV-999' }, db: { reservations: { count: 0 } } },
      },
      {
        name: 'The reservation cannot be saved',
        about: 'The seats are taken, then saving the reservation fails. The seats come back, so nobody loses a seat to a failed booking, and an ERROR is logged.',
        trigger: reserve('EV-301', 'C-118', 2),
        overrides: { systems: { db: { failWhen: [{ match: 'INSERT INTO reservations', fault: 'CONNECTIVITY' }] } } },
        expect: { error: 'DB:CONNECTIVITY', logs: [{ level: 'ERROR' }], db: { events: { has: [{ event_id: 'EV-301', seats_left: 10 }] }, reservations: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('reserve-seats', source('http-listener', { path: '/events/{eventId}/reservations', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'reservationId', value: '#[uuid()]' }),
      scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
        step('db-update', {
          database: 'PostgreSQL',
          sql: 'UPDATE events SET seats_left = seats_left - :seats WHERE event_id = :eventId AND seats_left >= :seats',
          inputParameters: '#[{ eventId: attributes.uriParams.eventId, seats: payload.seats }]',
          target: 'taken',
        }),
        router('choice', {}, [
          route({ expression: '#[vars.taken.affectedRows == 1]' }, [
            step('db-insert', {
              database: 'PostgreSQL',
              sql: 'INSERT INTO reservations (reservation_id, event_id, customer_id, seats) VALUES (:reservationId, :eventId, :customerId, :seats)',
              inputParameters: '#[{ reservationId: vars.reservationId, eventId: attributes.uriParams.eventId, customerId: payload.customerId, seats: payload.seats }]',
              target: 'saved',
            }),
          ]),
        ]),
      ]),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.taken.affectedRows == 1]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '201' }),
            step('set-payload', { value: '#[output application/json --- { reservationId: vars.reservationId, eventId: attributes.uriParams.eventId, seats: payload.seats }]' }),
          ]),
        ],
        {
          otherwise: [
            step('db-select', { database: 'PostgreSQL', sql: 'SELECT event_id FROM events WHERE event_id = :eventId', inputParameters: '#[{ eventId: attributes.uriParams.eventId }]', target: 'event' }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[isEmpty(vars.event)]' }, [
                  step('set-variable', { variableName: 'httpStatus', value: '404' }),
                  step('set-payload', { value: '#[output application/json --- { message: "No event " ++ attributes.uriParams.eventId }]' }),
                ]),
              ],
              {
                otherwise: [
                  step('set-variable', { variableName: 'httpStatus', value: '409' }),
                  step('set-payload', { value: '#[output application/json --- { message: "Not enough seats left" }]' }),
                ],
              },
            ),
          ],
        },
      ),
    ], [handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [step('logger', { level: 'ERROR', message: '#["Reservation " ++ vars.reservationId ++ " failed, seats given back: " ++ error.description]' })])]),
  ),
  description: `
A town's arts centre sells seats for its events through an app. The app calls:

\`POST /events/EV-303/reservations\` with \`{ "customerId": "C-201", "seats": 1 }\`

PostgreSQL holds \`events\` (\`event_id\`, \`title\`, \`seats_left\`) and \`reservations\` (\`reservation_id\`, \`event_id\`, \`customer_id\`, \`seats\`).

Today the flow reads \`seats_left\`, checks it in a Choice, then writes \`seats_left - :seats\`. The API runs on two replicas. When a popular concert went on sale, two customers often read "1 left" at the same moment, both were told yes, and the hall was oversold by 14 seats.

**Requirements**
- Answer **201** with \`{ "reservationId", "eventId", "seats" }\` when the seats are taken.
- Answer **409** with \`{ "message": "Not enough seats left" }\` when fewer seats are left than asked for. Never take part of a request.
- Answer **404** with \`{ "message": "No event EV-999" }\` for an unknown event.
- \`seats_left\` must never go below zero, whatever the timing of two requests.
- If the reservation cannot be saved, the seats must not stay taken, and an ERROR is logged.

**Facts**
- Make \`reservation_id\` a new UUID in the flow.
- A database that fails raises **DB:CONNECTIVITY**. Log it and let the error propagate, so the caller gets an error answer.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flow.**
`,
  answerTemplate: `## Why read then write oversells

## Taking the seats

## 404 or 409

## When saving fails
`,
  keyPoints: [
    'Read, check, then write is a race. Two requests can both read "1 left" before either writes, and both pass the check.',
    'Put the check inside the write: UPDATE ... SET seats_left = seats_left - :seats WHERE event_id = :eventId AND seats_left >= :seats. The database runs it as one step per row, so only one of two requests can take the last seat.',
    'The Update says how many rows it changed. 1 means the seats are yours, 0 means they were not.',
    'An Update of 0 rows has two causes. Read the event only then, to tell 404 from 409. That read decides nothing about the seats.',
    'Taking the seats and saving the reservation go in one transactional Try, so a failed insert gives the seats back.',
  ],
  solution: `
1. **HTTP Listener** \`POST /events/{eventId}/reservations\`. **Set Variable** \`reservationId\` = \`#[uuid()]\`.
2. **Try**, Transactional action \`ALWAYS_BEGIN\`:
   - **Database Update**, Target \`taken\`:
     \`\`\`sql
     UPDATE events SET seats_left = seats_left - :seats
     WHERE event_id = :eventId AND seats_left >= :seats
     \`\`\`
   - **Choice** \`#[vars.taken.affectedRows == 1]\`: **Database Insert** into \`reservations\`.
3. **Choice**:
   - \`#[vars.taken.affectedRows == 1]\`: \`httpStatus\` = \`201\` and the reservation.
   - Otherwise: **Database Select** the event, then a **Choice**: no row means \`404\`, a row means \`409\`.
4. **On Error Propagate** for \`DB:CONNECTIVITY\`: log at ERROR. The transaction is rolled back, so the seats are back.

**Why this holds on two replicas.** The row lock that PostgreSQL takes for the Update makes the second request wait for the first. When it runs, \`seats_left >= :seats\` is checked against the new value, so it changes 0 rows.

**A constraint as a second guard.** \`CHECK (seats_left >= 0)\` on the table makes an oversell impossible even if another program writes the table badly.
`,
  followUps: [
    {
      q: 'Why not lock the row with SELECT ... FOR UPDATE, then check and write?',
      a: 'That works too, inside one transaction. It holds the lock for longer and needs two statements and a Choice inside the transaction. The conditional Update is shorter and does the same job.',
    },
    {
      q: 'The app sends the same request twice after a timeout. What happens?',
      a: 'Two reservations are made. Add an idempotency key from the app, stored with a unique constraint on the reservation, so a repeat returns the first reservation instead of taking more seats.',
    },
    {
      q: 'Seats have numbers, such as row F seat 12. Does the same idea work?',
      a: 'Yes, per seat: UPDATE seats SET status = \'HELD\', held_by = :customer WHERE seat_id IN (...) AND status = \'FREE\', and check that the rows changed equal the seats asked for, inside a transaction that rolls back otherwise.',
    },
  ],
}
