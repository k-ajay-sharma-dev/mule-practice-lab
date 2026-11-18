import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const rows = [
  { customer_id: 'C-20114', name: 'Ama Owusu', email: 'ama.owusu@example.com', tier: 'GOLD' },
  { customer_id: 'C-20387', name: 'Tomasz Nowak', email: 'tomasz.nowak@example.com', tier: 'SILVER' },
  { customer_id: 'C-20502', name: 'Priya Raman', email: 'priya.raman@example.com', tier: 'BRONZE' },
]
const lookup = (email) => ({ http: { method: 'GET', path: '/customers/lookup', query: { email } } })

export default {
  id: 'fl-141',
  category: 'flows',
  title: 'Customer Lookup by Email: Pass the Email as an Input Parameter, Never Join It Into the SQL, and Answer 404 When Nobody Matches',
  level: 'BEGINNER',
  tags: ['myproject', 'database', 'input-parameters', 'sql-injection', 'http-listener', 'choice', '404', 'security'],
  estMinutes: 20,
  flowChecks: [
    { label: 'The API is a GET on /customers/lookup', rule: { type: 'source', component: 'http-listener', where: { path: '/customers/lookup', allowedMethods: 'GET' } } },
    {
      label: 'The Select reads customers with a :email parameter and no text joined into the SQL',
      rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['customers', ':email'], not: '++' } } },
    },
    { label: 'The email reaches the Select through its Input parameters', rule: { type: 'exists', component: 'db-select', where: { inputParameters: 'email' } } },
    { label: 'A Choice route answers 404 when no row comes back', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '404' } } },
  ],
  simulation: {
    systems: { db: { tables: { customers: { key: 'customer_id', rows } } } },
    tests: [
      {
        name: 'A known customer',
        about: 'The support tool looks up ama.owusu@example.com and gets her customer ID and tier.',
        trigger: lookup('ama.owusu@example.com'),
        expect: { status: 200, bodyHas: { customerId: 'C-20114', tier: 'GOLD' } },
      },
      {
        name: 'An email typed with capitals',
        about: 'An agent types Tomasz.Nowak@Example.com. Emails are stored in lower case, so the lookup still finds him.',
        trigger: lookup('Tomasz.Nowak@Example.com'),
        expect: { status: 200, bodyHas: { customerId: 'C-20387' } },
      },
      {
        name: 'Nobody has that email',
        about: 'No customer has the email. The answer is 404 with a short message, not 200 with an empty list.',
        trigger: lookup('nobody@example.com'),
        expect: { status: 404, bodyHas: { message: 'No customer has that email' } },
      },
      {
        name: 'A value written to break the SQL',
        about: "Someone sends x' OR '1'='1 as the email. It is only a value, so nobody matches and the answer is 404. No customer's details come back.",
        trigger: lookup("x' OR '1'='1"),
        expect: { status: 404, bodyHas: { message: 'No customer has that email' }, bodyLacks: { customerId: 'C-20114' } },
      },
    ],
  },
  referenceFlow: design(
    flow('customer-lookup', source('http-listener', { path: '/customers/lookup', allowedMethods: 'GET' }), [
      step('db-select', {
        database: 'PostgreSQL',
        sql: 'SELECT customer_id, name, email, tier FROM customers WHERE email = LOWER(:email)',
        inputParameters: '#[{ email: attributes.queryParams.email default "" }]',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[isEmpty(payload)]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '404' }),
            step('set-payload', { value: '#[output application/json --- { message: "No customer has that email" }]' }),
          ]),
        ],
        {
          otherwise: [step('set-payload', { value: '#[output application/json --- { customerId: payload[0].customer_id, name: payload[0].name, tier: payload[0].tier }]' })],
        },
      ),
    ]),
  ),
  description: `
A furniture retailer's support agents look up customers by email in a small internal tool. The tool calls a Mule API:

\`GET /customers/lookup?email=ama.owusu@example.com\`

Customers are in a PostgreSQL table \`customers\` with the columns \`customer_id\`, \`name\`, \`email\` and \`tier\`. Emails are stored in lower case.

A first version built the SQL by joining the email into the text:

\`#["SELECT * FROM customers WHERE email = '" ++ attributes.queryParams.email ++ "'"]\`

A security review found that an email such as \`x' OR '1'='1\` returned every customer.

**Requirements**
- Answer \`{ "customerId", "name", "tier" }\` for the customer with that email.
- Find the customer whatever case the agent types the email in.
- Answer **404** with \`{ "message": "No customer has that email" }\` when nobody matches.
- No value from the request may ever change the SQL itself.

**Design the flow.**
`,
  answerTemplate: `## The query

## Passing the email

## Nobody matches
`,
  keyPoints: [
    'Write the SQL with a named parameter, :email, and give its value in Input parameters. The database receives the value apart from the statement, so it can never change the statement.',
    'Joining request text into the SQL with ++ is SQL injection. A value with quotes in it becomes part of the query.',
    'LOWER(:email) matches whatever case the agent types, because the stored emails are lower case.',
    'A Select always returns a list. An empty list means nobody matched, so a Choice on isEmpty(payload) answers 404.',
    'Answer with only the fields the tool needs, not the whole row.',
  ],
  solution: `
1. **HTTP Listener** \`GET /customers/lookup\`.
2. **Database Select**:
   \`\`\`sql
   SELECT customer_id, name, email, tier FROM customers WHERE email = LOWER(:email)
   \`\`\`
   Input parameters: \`#[{ email: attributes.queryParams.email default "" }]\`
3. **Choice**:
   - \`#[isEmpty(payload)]\`: **Set Variable** \`httpStatus\` = \`404\`, **Set Payload** \`{ message: "No customer has that email" }\`.
   - Otherwise: **Set Payload** \`{ customerId: payload[0].customer_id, name: payload[0].name, tier: payload[0].tier }\`.

**Why Input parameters are safe.** Mule sends the statement with a placeholder and the value on its own, as a prepared statement. Whatever the value holds, quotes included, it is compared as text.

**What to log.** An email is personal data. Log the customer ID you found, not the email that was searched for.
`,
  followUps: [
    {
      q: 'Can a table name or a sort column be passed as an Input parameter too?',
      a: 'No. Parameters carry values only. If the sort column comes from the request, check it against a fixed list of allowed names before it goes into the SQL.',
    },
    {
      q: 'What if the email query parameter is missing?',
      a: 'The default "" matches nobody, so the answer is 404. A clearer design answers 400 for a missing parameter, or lets APIkit check the query parameters against the API spec.',
    },
    {
      q: 'LOWER on the column, LOWER(email) = LOWER(:email), would also work. Why is it on the parameter here?',
      a: 'A function on the column can stop the database using an index on email, so every lookup reads the whole table. The emails are stored in lower case, so lowering the parameter is enough.',
    },
  ],
}
