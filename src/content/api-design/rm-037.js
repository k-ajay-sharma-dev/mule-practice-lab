export default {
  id: 'rm-037',
  category: 'api-design',
  title: 'Vaccination Clinic API: Choosing Date and Time Types',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'data-types', 'dates', 'healthcare'],
  estMinutes: 15,
  description: `
A vaccination clinic takes bookings online. Last year a time zone bug moved appointments by an hour, because every date was stored as a plain string. This time the contract must say what each value means.

RAML has four date and time types:
- \`date-only\`: a calendar day, such as \`2026-03-14\`.
- \`time-only\`: a time of day, such as \`09:30:00\`.
- \`datetime-only\`: a day and a time with no offset from UTC, such as \`2026-03-14T09:30:00\`. It is the time on the local clock.
- \`datetime\`: a day and a time with an offset, such as \`2026-03-14T09:30:00+01:00\`, or \`Z\` at the end for UTC. It is one exact moment anywhere in the world.

Choose the type that fits each value.

**Requirements**
- A type \`Appointment\` has these required properties:
  - \`appointmentId\`: a string.
  - \`clinicDay\`: the day of the visit, with no time.
  - \`doorsOpen\`: the time the clinic opens, which is the same on every day.
  - \`localStart\`: the start of the visit as shown on the clock in the clinic, wherever the reader happens to be.
  - \`bookedAt\`: the exact moment the booking was made, kept for audit across time zones.
- \`Appointment\` has an example that fits it.
- \`POST /appointments\` takes an \`Appointment\` body and returns 201.
- \`GET /appointments\` has a required query parameter \`day\`, which is a calendar day, and returns \`Appointment[]\` with status 200.
`,
  starter: `#%RAML 1.0
title: Vaccination Clinic API
mediaType: application/json

types:
  Appointment:
    type: object
    properties:
      appointmentId: string

/appointments:
`,
  ramlChecks: [
    { label: 'appointmentId is a required string', rule: { type: 'prop', typeName: 'Appointment', prop: 'appointmentId', want: { type: 'string', required: true } } },
    { label: 'clinicDay is a required date-only', rule: { type: 'prop', typeName: 'Appointment', prop: 'clinicDay', want: { type: 'date-only', required: true } } },
    { label: 'doorsOpen is a required time-only', rule: { type: 'prop', typeName: 'Appointment', prop: 'doorsOpen', want: { type: 'time-only', required: true } } },
    { label: 'localStart is a required datetime-only', rule: { type: 'prop', typeName: 'Appointment', prop: 'localStart', want: { type: 'datetime-only', required: true } } },
    { label: 'bookedAt is a required datetime', rule: { type: 'prop', typeName: 'Appointment', prop: 'bookedAt', want: { type: 'datetime', required: true } } },
    {
      label: 'Appointment has an example',
      rule: {
        type: 'any',
        rules: [
          { type: 'typeDecl', name: 'Appointment', want: { example: { set: true } } },
          { type: 'typeDecl', name: 'Appointment', want: { examples: { set: true } } },
        ],
      },
    },
    {
      label: 'POST /appointments takes an Appointment and returns 201',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/appointments', method: 'post', typeIs: 'Appointment' },
          { type: 'response', path: '/appointments', method: 'post', status: '201' },
        ],
      },
    },
    { label: 'The day query parameter is a required date-only', rule: { type: 'param', path: '/appointments', method: 'get', in: 'query', name: 'day', want: { type: 'date-only', required: true } } },
    { label: 'GET /appointments returns Appointment[]', rule: { type: 'response', path: '/appointments', method: 'get', status: '200', typeIs: 'Appointment[]' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Vaccination Clinic API
mediaType: application/json

types:
  Appointment:
    type: object
    properties:
      appointmentId: string
      clinicDay: date-only
      doorsOpen: time-only
      localStart: datetime-only
      bookedAt: datetime
    example:
      appointmentId: A-5512
      clinicDay: 2026-03-14
      doorsOpen: 08:00:00
      localStart: 2026-03-14T09:30:00
      bookedAt: 2026-02-20T17:45:10+01:00

/appointments:
  get:
    queryParameters:
      day: date-only
    responses:
      200:
        body:
          type: Appointment[]
  post:
    body:
      type: Appointment
    responses:
      201:
        description: The appointment was booked.
`,
  keyPoints: [
    'date-only is a calendar day and time-only is a time of day. Neither has a time zone.',
    'datetime-only is the time on a local clock, with no offset.',
    'datetime is one exact moment, so it carries an offset or Z.',
    'Pick the type from what the value means. An audit time needs an exact moment, and a visit at a clinic needs the local clock.',
  ],
  solution: `
Each type matches what the value means:
- \`clinicDay\` is a day on a calendar, so \`date-only\`.
- \`doorsOpen\` repeats every day, so \`time-only\`.
- \`localStart\` must read 09:30 for everyone. An offset would invite software to convert it, which is how last year's bug happened. So \`datetime-only\`.
- \`bookedAt\` must compare correctly across time zones, so \`datetime\`.

The \`day\` parameter is a \`date-only\` too, because a caller asks for a day and not a moment.
`,
  followUps: [
    {
      q: 'Why not use datetime for everything?',
      a: 'An offset says the value is an exact global moment. For a local appointment that invites conversion, and the visit can appear at the wrong hour in another zone.',
    },
    {
      q: 'What does the format facet do on datetime?',
      a: 'It chooses the layout. The default is rfc3339, as in 2026-03-14T09:30:00Z, and rfc2616 gives the HTTP header layout, as in Sun, 28 Feb 2016 16:41:41 GMT.',
    },
    {
      q: 'What goes wrong if dates are typed as string?',
      a: 'Any text passes, so 14/03/2026 and 03/14/2026 both get through and mean different days. A proper type refuses the wrong layout at the edge.',
    },
  ],
}
