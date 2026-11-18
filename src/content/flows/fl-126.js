import { design, flow, handler, source, step } from '../../flow/dsl.js'

const book = (slotStart, bookedBy = 'amira.khan', title = 'Sprint review') => ({ http: { method: 'POST', path: '/rooms/R-101/bookings', body: { slotStart, bookedBy, title } } })

export default {
  id: 'fl-126',
  category: 'flows',
  title: 'Book a Meeting Room: 201 Created, 409 When the Slot Is Taken, and Let the Primary Key Decide',
  level: 'BEGINNER',
  tags: ['myproject', 'http', 'database', 'insert', 'http-status', 'error-handling', 'conflict'],
  estMinutes: 20,
  flowChecks: [
    {
      label: 'The API is a POST on /rooms/{roomId}/bookings',
      rule: { type: 'source', component: 'http-listener', where: { path: { all: ['/rooms/{roomId}', '/bookings'] }, allowedMethods: 'POST' } },
    },
    {
      label: 'One Database Insert adds the booking to room_bookings with the room and the slot',
      rule: { type: 'exists', component: 'db-insert', where: { sql: { all: ['insert into', 'room_bookings', 'room_id', 'slot_start'] } } },
    },
    {
      label: 'No SELECT checks the slot first: the primary key decides',
      rule: { type: 'all', rules: [{ type: 'exists', component: 'db-insert' }, { type: 'absent', component: 'db-select' }] },
    },
    {
      label: 'A new booking answers 201, set after the insert on the main path',
      rule: { type: 'before', first: 'db-insert', then: 'set-variable', thenWhere: { variableName: 'httpStatus', value: '201' }, outside: true },
    },
    {
      label: 'A taken slot answers 409 from an error handler for DB:QUERY_EXECUTION',
      rule: {
        type: 'inside',
        component: 'set-variable',
        within: ['on-error-propagate', 'on-error-continue'],
        withinWhere: { type: 'QUERY_EXECUTION' },
        where: { variableName: 'httpStatus', value: '409' },
      },
    },
    {
      label: 'A database that cannot be reached answers 503, never 409',
      rule: {
        type: 'inside',
        component: 'set-variable',
        within: ['on-error-propagate', 'on-error-continue'],
        withinWhere: { type: 'CONNECTIVITY' },
        where: { variableName: 'httpStatus', value: '503' },
      },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          room_bookings: {
            key: ['room_id', 'slot_start'],
            rows: [
              { room_id: 'R-101', slot_start: '2026-11-20T09:00', booked_by: 'li.wei', title: 'Supplier call' },
              { room_id: 'R-102', slot_start: '2026-11-20T10:00', booked_by: 'tom.reyes', title: 'Interview' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'A free slot is booked',
        about: 'Room R-101 is free at 10:00. The booking is saved and the answer is 201 with the booking.',
        trigger: book('2026-11-20T10:00'),
        expect: {
          status: 201,
          bodyHas: { roomId: 'R-101', slotStart: '2026-11-20T10:00', status: 'BOOKED' },
          db: { room_bookings: { count: 3, has: [{ room_id: 'R-101', slot_start: '2026-11-20T10:00', booked_by: 'amira.khan' }] } },
        },
      },
      {
        name: 'The slot is already taken',
        about: 'Room R-101 is booked at 09:00. Nothing is saved and the answer is 409 with the code SLOT_TAKEN.',
        trigger: book('2026-11-20T09:00'),
        expect: { status: 409, bodyHas: { code: 'SLOT_TAKEN' }, db: { room_bookings: { count: 2, has: [{ slot_start: '2026-11-20T09:00', booked_by: 'li.wei' }] } } },
      },
      {
        name: 'Two people book the same slot',
        about: 'Two colleagues press Book for R-101 at 11:00 a moment apart. The first gets 201, the second gets 409, and the room is booked once.',
        triggers: [book('2026-11-20T11:00', 'amira.khan'), { ...book('2026-11-20T11:00', 'sam.okafor', 'Team lunch'), afterMs: 50 }],
        expect: { status: 409, db: { room_bookings: { count: 3, has: [{ slot_start: '2026-11-20T11:00', booked_by: 'amira.khan' }], lacks: [{ booked_by: 'sam.okafor' }] } } },
      },
      {
        name: 'The database is down',
        about: 'The booking database does not answer. The caller gets 503 and is never told that the room is taken.',
        trigger: book('2026-11-20T12:00'),
        overrides: { systems: { db: { fault: true } } },
        expect: { status: 503, bodyLacks: { code: 'SLOT_TAKEN' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'book-meeting-room',
      source('http-listener', { path: '/rooms/{roomId}/bookings', allowedMethods: 'POST' }),
      [
        step('db-insert', {
          database: 'PostgreSQL',
          sql: 'INSERT INTO room_bookings (room_id, slot_start, booked_by, title) VALUES (:roomId, :slotStart, :bookedBy, :title)',
          inputParameters: '#[{ roomId: attributes.uriParams.roomId, slotStart: payload.slotStart, bookedBy: payload.bookedBy, title: payload.title }]',
          target: 'inserted',
        }),
        step('set-variable', { variableName: 'httpStatus', value: '201' }),
        step('set-payload', { value: '#[output application/json --- { roomId: attributes.uriParams.roomId, slotStart: payload.slotStart, bookedBy: payload.bookedBy, status: "BOOKED" }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION', when: '#[error.description contains "duplicate key"]' }, [
          step('set-variable', { variableName: 'httpStatus', value: '409' }),
          step('set-payload', { value: '#[output application/json --- { code: "SLOT_TAKEN", message: "This room is already booked for that time." }]' }),
        ]),
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "TRY_AGAIN", message: "Bookings are not available right now." }]' }),
        ]),
      ],
    ),
  ),
  description: `
An architecture firm lets staff book meeting rooms from an intranet page. Bookings live in a PostgreSQL table \`room_bookings\` with the columns \`room_id\`, \`slot_start\`, \`booked_by\` and \`title\`. Each slot is one hour.

The DBA has made **(room_id, slot_start)** the primary key of the table, so the database refuses a second row for the same room and hour.

The page calls:

\`POST /rooms/{roomId}/bookings\` with a body such as \`{ "slotStart": "2026-11-20T10:00", "bookedBy": "amira.khan", "title": "Sprint review" }\`

**Requirements**
- Save the booking and return **201** with \`{ "roomId", "slotStart", "bookedBy", "status": "BOOKED" }\`.
- If the room is already booked for that hour, return **409** with \`{ "code": "SLOT_TAKEN", "message": "..." }\`.
- If the database cannot be reached, return **503**. Never tell someone the room is taken when you do not know.
- Two people often press Book for the same popular room within a second of each other. Only one may get it.

When PostgreSQL refuses a row because of the primary key, the Database Insert raises **DB:QUERY_EXECUTION** with a description that contains \`duplicate key value violates unique constraint\`. A database that does not answer raises **DB:CONNECTIVITY**.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, also when an error handler built the answer.

**Design the flow.** Explain why checking the slot with a SELECT first is not enough.
`,
  answerTemplate: `## The endpoint

## Saving the booking

## Why not SELECT first

## The error handlers

## What the page sees
`,
  keyPoints: [
    'Let the primary key on (room_id, slot_start) decide. The database checks and saves in one step, so two requests can never both win.',
    'A SELECT then an INSERT leaves a gap. Two requests can both read "free" and then both try to insert.',
    'A refused duplicate raises DB:QUERY_EXECUTION. Map it to 409 Conflict in an error handler.',
    'Check the error description for "duplicate key", so another SQL error is not reported as a taken slot.',
    'DB:CONNECTIVITY is a different answer: 503, try again later. The room may well be free.',
    'Keep the request body with a Target variable on the insert, so the 201 answer can echo the booking.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /rooms/{roomId}/bookings\`.
2. **Database Insert** (PostgreSQL), Target \`inserted\` so the payload stays the request body:
   \`\`\`sql
   INSERT INTO room_bookings (room_id, slot_start, booked_by, title)
   VALUES (:roomId, :slotStart, :bookedBy, :title)
   \`\`\`
   Input parameters: \`#[{ roomId: attributes.uriParams.roomId, slotStart: payload.slotStart, bookedBy: payload.bookedBy, title: payload.title }]\`.
3. **Set Variable** \`httpStatus\` = \`201\`, then **Set Payload** to \`{ roomId, slotStart, bookedBy, status: "BOOKED" }\`.
4. **Error handling**:
   - **On Error Propagate**, type \`DB:QUERY_EXECUTION\`, When \`#[error.description contains "duplicate key"]\`: \`httpStatus\` = \`409\`, body \`{ "code": "SLOT_TAKEN" }\`.
   - **On Error Propagate**, type \`DB:CONNECTIVITY\`: \`httpStatus\` = \`503\`, body \`{ "code": "TRY_AGAIN" }\`.

**Why not SELECT first.** Two colleagues press Book at 10:59:59. Both SELECTs run before either INSERT, both see a free room, and both INSERTs follow. Without the primary key you get a double booking. With it, the second INSERT fails anyway, so the SELECT only added a call. The key on the table is the one place where the check and the write happen together.

**Why the When condition.** DB:QUERY_EXECUTION covers every statement the database refuses: a value too long for a column, a missing column after a release. Those are not taken rooms. The condition sends only the duplicate to 409. Anything else falls through to the default answer, a 500, which is what it is.
`,
  followUps: [
    {
      q: 'Is 409 the right status for a taken slot?',
      a: 'Yes. 409 Conflict says the request is valid but clashes with the current state of the resource. The caller can pick another hour and try again.',
    },
    {
      q: 'Why On Error Propagate and not On Error Continue?',
      a: 'Both give the caller the status from vars.httpStatus here. Propagate keeps the flow marked as failed, so monitoring counts it as an error. For an expected outcome such as a taken slot, some teams prefer Continue so it is not counted. Either is fine if the answer is right.',
    },
    {
      q: 'What if the table had no primary key on room and slot?',
      a: 'Ask for one, or a unique index. Without it no flow design is safe against two requests at once, because the check and the write are never one step.',
    },
  ],
}
