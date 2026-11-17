import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const row = (appointment_id, owner_phone, pet_name, appointment_date, starts_at, reminder_status = 'PENDING') => ({ appointment_id, clinic: 'Northgate', pet_name, owner_phone, appointment_date, starts_at, reminder_status })
const appointments = {
  key: 'appointment_id',
  rows: [
    row('APT-501', '+44 7700 900999', 'Biscuit', '2026-11-14', '09:30'),
    row('APT-502', '+44 7700 900123', 'Luna', '2026-11-14', '11:00'),
    row('APT-503', '+44 7700 900456', 'Pepper', '2026-11-13', '15:00'),
    row('APT-504', '+44 7700 900789', 'Milo', '2026-11-14', '16:20', 'SENT'),
    row('APT-505', '+44 7700 900321', 'Rex', '2026-11-14', '17:40'),
  ],
}
// the SMS provider refuses the first owner's number: it is a landline
const sms = (fault) => ({
  method: 'POST',
  path: '/sms/messages',
  latencyMs: 300,
  respond: (req) => (fault ? { fault } : req.body?.to === '+44 7700 900999' ? { status: 400, body: { error: 'INVALID_NUMBER' } } : { status: 201, body: { messageId: `SM-${req.body?.to?.slice(-3)}` } }),
})

export default {
  id: 'fl-127',
  category: 'flows',
  title: 'Appointment Reminders by Text: One Bad Number Must Not Stop the Rest, and Nobody Gets Two Texts',
  level: 'INTERMEDIATE',
  tags: ['scheduler', 'foreach', 'try', 'on-error-continue', 'database', 'sms', 'healthcare'],
  estMinutes: 30,
  flowChecks: [
    { label: 'A Scheduler starts the reminder run', rule: { type: 'source', component: 'scheduler' } },
    {
      label: 'Only appointments that still need a reminder are read',
      rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['appointments', 'reminder_status', 'pending'] } } },
    },
    { label: 'Each appointment is texted inside a For Each', rule: { type: 'inside', component: 'http-request', within: 'foreach', where: { method: 'POST' } } },
    {
      label: 'Each text is wrapped in a Try inside the For Each, so one failure does not end the loop',
      rule: { type: 'all', rules: [{ type: 'inside', component: 'http-request', within: 'try' }, { type: 'inside', component: 'try', within: 'foreach' }] },
    },
    { label: 'The Try handles its errors with On Error Continue', rule: { type: 'handler', component: 'on-error-continue', within: 'try' } },
    {
      label: 'An appointment is marked SENT only after its text was accepted',
      rule: { type: 'before', first: 'http-request', then: 'db-update', thenWhere: { sql: "'SENT'" }, outside: true },
    },
    {
      label: 'A number the provider rejects is marked BAD_NUMBER, so it is not texted every hour',
      rule: { type: 'inside', component: 'db-update', within: 'on-error-continue', withinWhere: { type: 'BAD_REQUEST' }, where: { sql: 'BAD_NUMBER' } },
    },
  ],
  simulation: {
    systems: {
      db: { tables: { appointments } },
      http: [sms()],
    },
    tests: [
      {
        name: 'Tomorrow has four appointments',
        about: 'Four appointments tomorrow, one already reminded. Two owners get a text, the landline is marked BAD_NUMBER, and today\'s appointment is left alone.',
        trigger: { schedule: {} },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/sms/messages', count: 3 }, { method: 'POST', path: '/sms/messages', has: { to: '+44 7700 900789' }, count: 0 }],
          db: {
            appointments: {
              has: [
                { appointment_id: 'APT-501', reminder_status: 'BAD_NUMBER' },
                { appointment_id: 'APT-502', reminder_status: 'SENT' },
                { appointment_id: 'APT-503', reminder_status: 'PENDING' },
                { appointment_id: 'APT-505', reminder_status: 'SENT' },
              ],
            },
          },
        },
      },
      {
        name: 'The next hourly run',
        about: 'The job runs again an hour later. Every owner who got a text, and the bad number, are skipped. No one gets a second text.',
        triggers: [{ schedule: {} }, { schedule: {}, afterMs: 3600000 }],
        expect: { noError: true, calls: [{ method: 'POST', path: '/sms/messages', count: 3 }] },
      },
      {
        name: 'The SMS provider is down',
        about: 'Every call fails to connect. Each appointment is tried once, a warning is logged, the run ends without an error, and every row stays PENDING for the next run.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [sms('CONNECTIVITY')] } },
        expect: {
          noError: true,
          logs: [{ level: 'WARN' }],
          calls: [{ method: 'POST', path: '/sms/messages', count: 3 }],
          db: { appointments: { has: [{ appointment_id: 'APT-502', reminder_status: 'PENDING' }, { appointment_id: 'APT-505', reminder_status: 'PENDING' }] } },
        },
      },
      {
        name: 'The provider is back for the next run',
        about: 'The 14:00 run finds the provider down. At 15:00 it is back, and the owners still waiting get their texts once.',
        triggers: [{ schedule: {} }, { schedule: {}, afterMs: 3600000 }],
        overrides: {
          systems: {
            http: [{ method: 'POST', path: '/sms/messages', latencyMs: 300, responses: [{ fault: 'CONNECTIVITY' }, { fault: 'CONNECTIVITY' }, { fault: 'CONNECTIVITY' }, { status: 400, body: { error: 'INVALID_NUMBER' } }, { status: 201, body: { messageId: 'SM-1' } }] }],
          },
        },
        expect: {
          noError: true,
          calls: [{ method: 'POST', path: '/sms/messages', count: 6 }],
          db: { appointments: { has: [{ appointment_id: 'APT-502', reminder_status: 'SENT' }, { appointment_id: 'APT-505', reminder_status: 'SENT' }] } },
        },
      },
    ],
  },
  referenceFlow: design(
    flow('appointment-reminders', source('scheduler', { strategy: 'cron', expression: '0 0 9-19 * * ?' }), [
      step('set-variable', { variableName: 'tomorrow', value: '#[(now() + |P1D|) as String {format: "yyyy-MM-dd"}]' }),
      step('db-select', {
        database: 'PostgreSQL',
        sql: "SELECT appointment_id, pet_name, owner_phone, starts_at FROM appointments WHERE appointment_date = :tomorrow AND reminder_status = 'PENDING'",
        inputParameters: '#[{ tomorrow: vars.tomorrow }]',
      }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'appointmentId', value: '#[payload.appointment_id]' }),
        scope(
          'try',
          {},
          [
            step('set-payload', { value: '#[output application/json --- { to: payload.owner_phone, text: "Northgate Vets: " ++ payload.pet_name ++ " is booked in tomorrow at " ++ payload.starts_at ++ ". Reply C to cancel." }]' }),
            step('http-request', { method: 'POST', path: '/sms/messages', responseTimeout: 5000 }),
            step('db-update', {
              database: 'PostgreSQL',
              sql: "UPDATE appointments SET reminder_status = 'SENT' WHERE appointment_id = :appointmentId",
              inputParameters: '#[{ appointmentId: vars.appointmentId }]',
            }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, [
                step('db-update', {
                  database: 'PostgreSQL',
                  sql: "UPDATE appointments SET reminder_status = 'BAD_NUMBER' WHERE appointment_id = :appointmentId",
                  inputParameters: '#[{ appointmentId: vars.appointmentId }]',
                }),
                step('logger', { level: 'WARN', message: '#["Reminder for " ++ vars.appointmentId ++ " refused: the number is not valid"]' }),
              ]),
              handler('on-error-continue', { type: 'ANY' }, [
                step('logger', { level: 'WARN', message: '#["Reminder for " ++ vars.appointmentId ++ " not sent, left for the next run: " ++ error.description]' }),
              ]),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
A group of veterinary clinics texts each pet owner the day before an appointment. Appointments are in a PostgreSQL table \`appointments\`:

| column | meaning |
|---|---|
| \`appointment_id\` | such as APT-502 |
| \`pet_name\`, \`owner_phone\` | for the text |
| \`appointment_date\`, \`starts_at\` | such as 2026-11-14 and 11:00 |
| \`reminder_status\` | PENDING, SENT or BAD_NUMBER |

Texts go out through an SMS provider: \`POST /sms/messages\` with \`{ "to": "...", "text": "..." }\`. It answers **201** when it accepts a text and **400** when the number cannot take texts, such as a landline.

The old job sent all of tomorrow's reminders in one loop. Last Tuesday the third owner's number was a landline. The 400 stopped the loop, and 140 owners got no reminder. Two days later the provider timed out half way through a run, the whole run was started again by hand, and 60 owners got two texts.

**Requirements**
- Run every hour from 09:00 to 19:00, so a reminder that failed can go out on a later run the same day.
- Each run texts tomorrow's appointments that are still **PENDING**.
- A text that fails for one owner must not stop the others.
- Mark an appointment **SENT** only once the provider has accepted its text, so no owner is texted twice.
- A number the provider rejects with 400 will never work. Mark it **BAD_NUMBER**, so the job stops trying and the clinic can call the owner.
- Any other failure (the provider down or slow) leaves the appointment PENDING for the next run.

**Design the flow.**
`,
  answerTemplate: `## Starting the run

## Choosing the appointments

## The loop

## Errors for one appointment

## Why nobody gets two texts
`,
  keyPoints: [
    'An error inside a For Each ends the whole loop unless it is handled inside the loop. Wrap the work for one item in a Try.',
    'On Error Continue in that Try ends only that item. The For Each goes on with the next one.',
    'Mark each row SENT right after its text is accepted, not once at the end of the run. A run that stops half way then knows what is done.',
    'Read only PENDING rows. A run started again, by the schedule or by hand, skips what is already done.',
    'Tell errors apart: a 400 for a landline will never succeed, so mark it BAD_NUMBER. A connection failure may pass, so leave the row for the next run.',
    'Keep the appointment ID in a variable before the HTTP call, because the call replaces the payload.',
  ],
  solution: `
**Flow: appointment-reminders**
1. **Scheduler**, cron \`0 0 9-19 * * ?\`: on the hour from 09:00 to 19:00.
2. **Set Variable** \`tomorrow\` = \`#[(now() + |P1D|) as String {format: "yyyy-MM-dd"}]\`.
3. **Database Select**:
   \`\`\`sql
   SELECT appointment_id, pet_name, owner_phone, starts_at
   FROM appointments
   WHERE appointment_date = :tomorrow AND reminder_status = 'PENDING'
   \`\`\`
4. **For Each** over the rows:
   - **Set Variable** \`appointmentId\` = \`#[payload.appointment_id]\`.
   - **Try**:
     - **Set Payload** to \`{ to: payload.owner_phone, text: "Northgate Vets: Luna is booked in tomorrow at 11:00..." }\`.
     - **HTTP Request** \`POST /sms/messages\`, Response timeout 5000 ms.
     - **Database Update** \`SET reminder_status = 'SENT' WHERE appointment_id = :appointmentId\`.
     - **On Error Continue** for \`HTTP:BAD_REQUEST\`: **Database Update** \`SET reminder_status = 'BAD_NUMBER'\`, and log a WARN.
     - **On Error Continue** for \`ANY\`: log a WARN and leave the row PENDING.

**Why the loop goes on.** The error from one owner's call is caught by the Try around that call. On Error Continue ends the Try as if it had succeeded, so the For Each moves on. Without the Try, the error would leave the For Each and end the flow.

**Why nobody gets two texts.** A row becomes SENT straight after its own text. If the run stops at owner 60, rows 1 to 59 are SENT and the next run starts at 60. The only gap left is a crash between the provider's 201 and the UPDATE, which can cause one repeat. That is far better than repeating a whole run.

**The hourly schedule.** Once a row is SENT or BAD_NUMBER, the SELECT never returns it again. The later runs in the day only pick up rows that failed for a reason that may pass.
`,
  followUps: [
    {
      q: 'Why not Until Successful around the SMS call?',
      a: 'It suits failures that clear in seconds. A provider that is down for half an hour would hold the run, and a landline would be tried again for nothing. The next hourly run is a better retry here.',
    },
    {
      q: 'Could a Batch Job do this instead?',
      a: 'Yes, and it would track failed records for you. For a few hundred rows a day a For Each with a Try is enough and easier to follow.',
    },
    {
      q: 'What if the clinic group runs two Mule servers that are not clustered?',
      a: 'Both would run the Scheduler and text everyone twice. Run the job on one server, use a cluster, or claim each row with an UPDATE before sending.',
    },
  ],
}
