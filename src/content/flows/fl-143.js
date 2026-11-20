import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const rows = [
  { member_id: 'M-3301', email: 'leo.martin@example.com', phone: '07700 900111', marketing_opt_in: true },
  { member_id: 'M-3302', email: 'sara.ali@example.com', phone: '07700 900222', marketing_opt_in: false },
]
const patch = (memberId, body) => ({ http: { method: 'PATCH', path: `/members/${memberId}`, body } })

export default {
  id: 'fl-143',
  category: 'flows',
  title: 'PATCH a Member: Change Only the Fields Sent, Keep the Rest as They Are, 404 for an Unknown Member and 400 for an Empty Body',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'patch', 'rest', 'database', 'coalesce', 'partial-update', '404', '400'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The API is a PATCH on /members/{memberId}', rule: { type: 'source', component: 'http-listener', where: { path: '/members/{memberId}', allowedMethods: 'PATCH' } } },
    {
      label: 'One Update keeps each column as it is when its field is not sent',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['members', 'coalesce', 'member_id'] } } },
    },
    { label: 'A body with none of the fields gets 400 before anything is written', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '400' } } },
    {
      label: 'No row updated means 404, decided after the Update',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '404' } },
          { type: 'before', first: 'db-update', then: 'set-variable', thenWhere: { variableName: 'httpStatus', value: '404' } },
        ],
      },
    },
  ],
  simulation: {
    systems: { db: { tables: { members: { key: 'member_id', rows } } } },
    tests: [
      {
        name: 'A new phone number only',
        about: 'The app sends only the phone. The phone changes, and the email and the marketing choice stay as they were.',
        trigger: patch('M-3301', { phone: '07700 900999' }),
        expect: {
          status: 200,
          bodyHas: { memberId: 'M-3301', phone: '07700 900999', email: 'leo.martin@example.com' },
          db: { members: { has: [{ member_id: 'M-3301', phone: '07700 900999', email: 'leo.martin@example.com', marketing_opt_in: true }] } },
        },
      },
      {
        name: 'Opting out of marketing',
        about: 'The member turns marketing off. false is a value, not a missing field, so it is saved.',
        trigger: patch('M-3301', { marketingOptIn: false }),
        expect: { status: 200, db: { members: { has: [{ member_id: 'M-3301', marketing_opt_in: false, phone: '07700 900111' }] } } },
      },
      {
        name: 'Two fields at once',
        about: 'The member changes email and phone in one request. Both are saved.',
        trigger: patch('M-3302', { email: 'sara.ali@example.org', phone: '07700 900333' }),
        expect: { status: 200, db: { members: { has: [{ member_id: 'M-3302', email: 'sara.ali@example.org', phone: '07700 900333', marketing_opt_in: false }] } } },
      },
      {
        name: 'An unknown member',
        about: 'No member M-9999 exists. The answer is 404, and no row is added or changed.',
        trigger: patch('M-9999', { phone: '07700 900444' }),
        expect: { status: 404, bodyHas: { message: 'No member M-9999' }, db: { members: { count: 2, lacks: [{ phone: '07700 900444' }] } } },
      },
      {
        name: 'An empty body',
        about: 'The app sends {}. Nothing would change, so the answer is 400 and the database is not touched.',
        trigger: patch('M-3301', {}),
        expect: { status: 400, bodyHas: { message: 'Send at least one of email, phone, marketingOptIn' } },
      },
    ],
  },
  referenceFlow: design(
    flow('patch-member', source('http-listener', { path: '/members/{memberId}', allowedMethods: 'PATCH' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[payload.email == null and payload.phone == null and payload.marketingOptIn == null]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { message: "Send at least one of email, phone, marketingOptIn" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('db-update', {
              database: 'PostgreSQL',
              sql: 'UPDATE members SET email = COALESCE(:email, email), phone = COALESCE(:phone, phone), marketing_opt_in = COALESCE(:optIn, marketing_opt_in) WHERE member_id = :memberId',
              inputParameters: '#[{ memberId: attributes.uriParams.memberId, email: payload.email, phone: payload.phone, optIn: payload.marketingOptIn }]',
              target: 'updated',
            }),
            router(
              'choice',
              {},
              [
                route({ expression: '#[vars.updated.affectedRows == 0]' }, [
                  step('set-variable', { variableName: 'httpStatus', value: '404' }),
                  step('set-payload', { value: '#[output application/json --- { message: "No member " ++ attributes.uriParams.memberId }]' }),
                ]),
              ],
              {
                otherwise: [
                  step('db-select', {
                    database: 'PostgreSQL',
                    sql: 'SELECT member_id, email, phone, marketing_opt_in FROM members WHERE member_id = :memberId',
                    inputParameters: '#[{ memberId: attributes.uriParams.memberId }]',
                  }),
                  step('set-payload', {
                    value: '#[output application/json --- { memberId: payload[0].member_id, email: payload[0].email, phone: payload[0].phone, marketingOptIn: payload[0].marketing_opt_in }]',
                  }),
                ],
              },
            ),
          ],
        },
      ),
    ]),
  ),
  description: `
A chain of gyms lets members change their contact details in its app. The app calls:

\`PATCH /members/M-3301\` with any of \`{ "email", "phone", "marketingOptIn" }\`

The app sends **only the fields the member changed**. Members are in a PostgreSQL table \`members\` with the columns \`member_id\`, \`email\`, \`phone\` and \`marketing_opt_in\`.

A first version ran \`UPDATE members SET email = :email, phone = :phone, marketing_opt_in = :optIn\`. When a member changed only the phone, the email and the marketing choice were wiped.

**Requirements**
- Change the fields that are sent and **leave every other column as it is**.
- \`"marketingOptIn": false\` is a real choice and must be saved.
- Answer **200** with the member as it is now: \`{ "memberId", "email", "phone", "marketingOptIn" }\`.
- Answer **404** with \`{ "message": "No member M-9999" }\` for an unknown member.
- Answer **400** with \`{ "message": "Send at least one of email, phone, marketingOptIn" }\` when none of the fields is sent.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flow.**
`,
  answerTemplate: `## PATCH and PUT

## The update statement

## Unknown members and empty bodies

## The answer
`,
  keyPoints: [
    'PATCH changes part of a resource. A field that is not sent means "leave it", not "clear it". PUT replaces the whole resource.',
    'COALESCE(:phone, phone) keeps the stored value when the parameter is null. One statement covers every mix of fields.',
    'false and 0 are values, not missing fields. COALESCE only skips null, so an opt out is saved.',
    'The Update tells you how many rows it changed. 0 means no member has that ID, so answer 404 after the Update instead of reading first.',
    'Check for an empty body before the Update, so a request that changes nothing gets 400.',
    'Read the row after the Update and answer with it, so the app shows what is stored, not what it sent.',
  ],
  solution: `
1. **HTTP Listener** \`PATCH /members/{memberId}\`.
2. **Choice**:
   - \`#[payload.email == null and payload.phone == null and payload.marketingOptIn == null]\`: \`httpStatus\` = \`400\` and the message.
   - Otherwise:
     - **Database Update**, Target \`updated\`:
       \`\`\`sql
       UPDATE members
       SET email = COALESCE(:email, email),
           phone = COALESCE(:phone, phone),
           marketing_opt_in = COALESCE(:optIn, marketing_opt_in)
       WHERE member_id = :memberId
       \`\`\`
       Input parameters: \`#[{ memberId: attributes.uriParams.memberId, email: payload.email, phone: payload.phone, optIn: payload.marketingOptIn }]\`
     - **Choice**:
       - \`#[vars.updated.affectedRows == 0]\`: \`httpStatus\` = \`404\` and the message.
       - Otherwise: **Database Select** the member, then **Set Payload** with the four fields.

**Why not read, merge in DataWeave, then write.** It works, but it is two statements where one is enough, and another request can change the row between the read and the write. The single Update merges inside the database.

**Checking the values.** A real API also checks the email format and the phone number before the Update, and answers 400 with what is wrong.
`,
  followUps: [
    {
      q: 'How can a member remove their phone number with this design?',
      a: 'They cannot: null means "not sent". Either use a separate DELETE /members/{id}/phone, or use JSON Merge Patch rules, where a field sent as null means "clear it", and tell a missing field from a null one in DataWeave before building the parameters.',
    },
    {
      q: 'Two devices send a PATCH for the same member at the same moment. What happens?',
      a: 'Each Update is atomic, so each field ends up with one of the two values. If one change must not overwrite another, add a version column and an If-Match header, and answer 412 when the version has moved on.',
    },
  ],
}
