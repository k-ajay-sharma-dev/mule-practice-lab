import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const holidays = '{ "2026-12-25": "Christmas Day", "2026-12-26": "Boxing Day", "2027-01-01": "New Year\'s Day" }'
const check = (date) => ({ http: { method: 'GET', path: '/delivery-days/check', query: date === undefined ? {} : { date } } })

export default {
  id: 'fl-142',
  category: 'flows',
  title: 'Is It a Delivery Day? Read a Holiday Calendar Packed With the App Using readUrl, and Answer 400 When No Date Is Given',
  level: 'BEGINNER',
  tags: ['dataweave', 'readUrl', 'classpath', 'reference-data', 'choice', '400', 'delivery'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The API is a GET on /delivery-days/check', rule: { type: 'source', component: 'http-listener', where: { path: '/delivery-days/check', allowedMethods: 'GET' } } },
    {
      label: 'The calendar is read from holidays.json in the app with readUrl',
      rule: {
        type: 'any',
        rules: [
          { type: 'exists', component: 'transform', where: { script: { all: ['readUrl', 'classpath://holidays.json'] } } },
          { type: 'exists', component: ['set-payload', 'set-variable'], where: { value: { all: ['readUrl', 'classpath://holidays.json'] } } },
        ],
      },
    },
    { label: 'A Choice route answers 400 when the date is missing', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '400' } } },
  ],
  simulation: {
    systems: { files: { 'holidays.json': holidays } },
    tests: [
      {
        name: 'An ordinary day',
        about: 'The checkout asks about 18 November 2026. It is not in the calendar, so it is a delivery day.',
        trigger: check('2026-11-18'),
        expect: { status: 200, bodyHas: { date: '2026-11-18', deliveryDay: true } },
      },
      {
        name: 'Christmas Day',
        about: 'The checkout asks about 25 December. It is in the calendar, so it is not a delivery day, and the answer names the holiday.',
        trigger: check('2026-12-25'),
        expect: { status: 200, bodyHas: { date: '2026-12-25', deliveryDay: false, holiday: 'Christmas Day' } },
      },
      {
        name: 'New Year in the next year',
        about: 'The calendar already holds 1 January 2027, so a customer ordering in late December sees it too.',
        trigger: check('2027-01-01'),
        expect: { status: 200, bodyHas: { deliveryDay: false, holiday: "New Year's Day" } },
      },
      {
        name: 'No date given',
        about: 'A call with no date gets 400 and a message, not an answer about no day at all.',
        trigger: check(undefined),
        expect: { status: 400, bodyHas: { message: 'date is required, as yyyy-MM-dd' } },
      },
    ],
  },
  referenceFlow: design(
    flow('delivery-day-check', source('http-listener', { path: '/delivery-days/check', allowedMethods: 'GET' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(attributes.queryParams.date default "")]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { message: "date is required, as yyyy-MM-dd" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('transform', {
              script:
                '%dw 2.0\noutput application/json\nvar holidays = readUrl("classpath://holidays.json", "application/json")\nvar day = attributes.queryParams.date\n---\n{ date: day, deliveryDay: holidays[day] == null, holiday: holidays[day] }',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
A florist delivers every day of the year except **public holidays**. The website checkout asks a Mule API whether a date can be chosen for delivery:

\`GET /delivery-days/check?date=2026-12-25\`

The operations team keeps the holidays in a small JSON file, \`holidays.json\`, which is packed with the Mule app in \`src/main/resources\`:

\`{ "2026-12-25": "Christmas Day", "2026-12-26": "Boxing Day", "2027-01-01": "New Year's Day" }\`

The file changes once a year, when the team adds the next year's holidays and the app is released again.

**Requirements**
- Answer \`{ "date", "deliveryDay": true }\` for a day that is not in the file.
- Answer \`{ "date", "deliveryDay": false, "holiday": "Christmas Day" }\` for a day that is.
- Answer **400** with \`{ "message": "date is required, as yyyy-MM-dd" }\` when no date is given.
- Read the file from the app's resources as \`classpath://holidays.json\`.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flow.**
`,
  answerTemplate: `## Reading the calendar

## Answering for a date

## A missing date
`,
  keyPoints: [
    'readUrl("classpath://holidays.json", "application/json") reads a file packed with the app and parses it as JSON, inside any DataWeave script.',
    'classpath:// looks in the app\'s resources, so the file goes with every deployment and every replica. Nothing outside the app has to be up.',
    'A key lookup, holidays[day], is null when the day is not a holiday. That null is the whole test.',
    'Check the input first. A Choice answers 400 for a missing date before any lookup.',
    'Packing data with the app suits data that changes rarely and with a release. Data that changes every day belongs in a database or an Object Store.',
  ],
  solution: `
1. **HTTP Listener** \`GET /delivery-days/check\`.
2. **Choice**:
   - \`#[isEmpty(attributes.queryParams.date default "")]\`: **Set Variable** \`httpStatus\` = \`400\`, **Set Payload** with the message.
   - Otherwise: **Transform Message**:
     \`\`\`dataweave
     %dw 2.0
     output application/json
     var holidays = readUrl("classpath://holidays.json", "application/json")
     var day = attributes.queryParams.date
     ---
     { date: day, deliveryDay: holidays[day] == null, holiday: holidays[day] }
     \`\`\`

**Where the file lives.** Put \`holidays.json\` in \`src/main/resources\`. Maven packs it into the app, and \`classpath://\` finds it at run time on any server.

**A wrong date format.** A value such as \`25/12/2026\` is not a key in the file, so the answer says it is a delivery day. A stricter design checks the format with a regular expression in the Choice and answers 400 for that too.
`,
  followUps: [
    {
      q: 'The file is read on every request. Is that a problem?',
      a: 'It is small and read from the app itself, so it is fast. For a bigger file, read it once into a Cache scope, or keep it in an Object Store that is filled when the app starts.',
    },
    {
      q: 'The florist opens a second country with other holidays. What changes?',
      a: 'Add a country query parameter and keep one object per country in the file, or one file per country such as holidays-fr.json, chosen by the parameter after it is checked against a list.',
    },
  ],
}
