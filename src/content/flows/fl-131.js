import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const pay = (staffId, amount) => ({ http: { method: 'POST', path: `/wallets/${staffId}/payments`, body: { amount, till: 'T-2' } } })

export default {
  id: 'fl-131',
  category: 'flows',
  title: 'Staff Canteen Wallet: Raise a Business Error When the Balance Is Too Low, and Answer 422',
  level: 'BEGINNER',
  tags: ['http', 'database', 'raise-error', 'choice', 'http-status', 'error-handling'],
  estMinutes: 20,
  flowChecks: [
    {
      label: 'The API is a POST on /wallets/{staffId}/payments',
      rule: { type: 'source', component: 'http-listener', where: { path: { all: ['/wallets/{staffId}', '/payments'] }, allowedMethods: 'POST' } },
    },
    {
      label: 'The wallet is read from the wallets table before anything is decided',
      rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['wallets', 'staff_id'] } } },
    },
    {
      label: 'A Raise Error with a type for a low balance sits inside the Choice',
      rule: { type: 'inside', component: 'raise-error', within: 'choice', where: { type: 'INSUFFICIENT_FUNDS' } },
    },
    {
      label: 'An error handler names the low balance error and answers 422',
      rule: {
        type: 'linked',
        as: 'errorType',
        from: { component: 'raise-error', where: { type: 'INSUFFICIENT_FUNDS' }, key: 'type' },
        to: { component: ['on-error-propagate', 'on-error-continue'], key: 'type', holding: { component: 'set-variable', where: { variableName: 'httpStatus', value: '422' } } },
      },
    },
    {
      label: 'An unknown staff number raises its own error, which answers 404',
      rule: {
        type: 'linked',
        as: 'errorType',
        from: { component: 'raise-error', where: { type: 'NOT_FOUND' }, key: 'type' },
        to: { component: ['on-error-propagate', 'on-error-continue'], key: 'type', holding: { component: 'set-variable', where: { variableName: 'httpStatus', value: '404' } } },
      },
    },
    {
      label: 'The balance is changed only in the otherwise branch, once both checks have passed',
      rule: { type: 'inside', component: 'db-update', within: 'choice', inSlot: 'otherwise', where: { sql: { all: ['wallets', 'balance'] } } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          wallets: {
            key: 'staff_id',
            rows: [
              { staff_id: 'S-1001', name: 'Priya Nair', balance: 20 },
              { staff_id: 'S-1002', name: 'Dan Okoro', balance: 4 },
              { staff_id: 'S-1003', name: 'Mia Lund', balance: 6.5 },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'A lunch the wallet can pay for',
        about: 'Priya has 20.00 and pays 6.50. The answer is 200 with her new balance of 13.50, and the table says the same.',
        trigger: pay('S-1001', 6.5),
        expect: { status: 200, bodyHas: { staffId: 'S-1001', paid: 6.5, balance: 13.5 }, db: { wallets: { has: [{ staff_id: 'S-1001', balance: 13.5 }] } } },
      },
      {
        name: 'Not enough on the wallet',
        about: 'Dan has 4.00 and tries to pay 6.50. The answer is 422 with the code INSUFFICIENT_FUNDS, and his balance is not touched.',
        trigger: pay('S-1002', 6.5),
        expect: { status: 422, bodyHas: { code: 'INSUFFICIENT_FUNDS' }, db: { wallets: { has: [{ staff_id: 'S-1002', balance: 4 }] } } },
      },
      {
        name: 'The exact balance',
        about: 'Mia has 6.50 and pays 6.50. That is allowed: the answer is 200 and her balance is 0.',
        trigger: pay('S-1003', 6.5),
        expect: { status: 200, bodyHas: { balance: 0 }, db: { wallets: { has: [{ staff_id: 'S-1003', balance: 0 }] } } },
      },
      {
        name: 'A staff number with no wallet',
        about: 'The till sends a staff number that has no wallet. The answer is 404 with the code WALLET_NOT_FOUND, not 422.',
        trigger: pay('S-9999', 3),
        expect: { status: 404, bodyHas: { code: 'WALLET_NOT_FOUND' }, bodyLacks: { code: 'INSUFFICIENT_FUNDS' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'pay-from-wallet',
      source('http-listener', { path: '/wallets/{staffId}/payments', allowedMethods: 'POST' }),
      [
        step('db-select', {
          database: 'PostgreSQL',
          sql: 'SELECT staff_id, balance FROM wallets WHERE staff_id = :staffId',
          inputParameters: '#[{ staffId: attributes.uriParams.staffId }]',
          target: 'wallet',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[isEmpty(vars.wallet)]' }, [step('raise-error', { type: 'APP:WALLET_NOT_FOUND', description: 'No wallet for this staff number' })]),
            route({ expression: '#[vars.wallet[0].balance < payload.amount]' }, [step('raise-error', { type: 'APP:INSUFFICIENT_FUNDS', description: 'The balance is lower than the amount' })]),
          ],
          {
            otherwise: [
              step('db-update', {
                database: 'PostgreSQL',
                sql: 'UPDATE wallets SET balance = :newBalance WHERE staff_id = :staffId',
                inputParameters: '#[{ newBalance: vars.wallet[0].balance - payload.amount, staffId: attributes.uriParams.staffId }]',
                target: 'updated',
              }),
            ],
          },
        ),
        step('set-payload', { value: '#[output application/json --- { staffId: vars.wallet[0].staff_id, paid: payload.amount, balance: vars.wallet[0].balance - payload.amount }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:INSUFFICIENT_FUNDS' }, [
          step('set-variable', { variableName: 'httpStatus', value: '422' }),
          step('set-payload', { value: '#[output application/json --- { code: "INSUFFICIENT_FUNDS", message: "Not enough on the wallet. Please top up or pay by card.", balance: vars.wallet[0].balance }]' }),
        ]),
        handler('on-error-propagate', { type: 'APP:WALLET_NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('set-payload', { value: '#[output application/json --- { code: "WALLET_NOT_FOUND", message: "There is no wallet for this staff number." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A company canteen lets staff pay for lunch from a prepaid **wallet**. The tills call one API. Wallets are in a PostgreSQL table \`wallets\` with the columns \`staff_id\`, \`name\` and \`balance\`.

The till calls:

\`POST /wallets/{staffId}/payments\` with a body such as \`{ "amount": 6.50, "till": "T-2" }\`

**Requirements**
- If the wallet holds enough, take the amount off the balance and answer **200** with \`{ "staffId", "paid", "balance" }\`, where balance is the new balance.
- Paying the exact balance is allowed. The balance then becomes 0.
- If the balance is lower than the amount, answer **422** with \`{ "code": "INSUFFICIENT_FUNDS", ... }\` and change nothing.
- If there is no wallet for the staff number, answer **404** with \`{ "code": "WALLET_NOT_FOUND", ... }\`.

The team wants these business rules to show up as **errors with their own types**, so they are logged and counted like other errors, and each type maps to one status in one place.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, also when an error handler built the answer.

**Design the flow.**
`,
  answerTemplate: `## The endpoint

## Reading the wallet

## The business rules as errors

## Mapping each error to a status
`,
  keyPoints: [
    'Raise Error throws an error with a type you choose, such as APP:INSUFFICIENT_FUNDS. The flow stops there and goes to the error handlers.',
    'An error handler that names that type maps it to one status. Here a low balance is 422 and a missing wallet is 404.',
    'Put each rule on its own Choice route, and the update in the otherwise branch, so nothing changes when a rule fails.',
    'Read the wallet into a Target variable, so the payload is still the request body with the amount.',
    '422 Unprocessable Content says the request is well formed but breaks a business rule. 400 is for a request that is malformed.',
    'Keep the test strict: a balance lower than the amount fails, an equal balance pays.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /wallets/{staffId}/payments\`.
2. **Database Select**, Target \`wallet\`:
   \`\`\`sql
   SELECT staff_id, balance FROM wallets WHERE staff_id = :staffId
   \`\`\`
3. **Choice**:
   - \`#[isEmpty(vars.wallet)]\`: **Raise Error** \`APP:WALLET_NOT_FOUND\`.
   - \`#[vars.wallet[0].balance < payload.amount]\`: **Raise Error** \`APP:INSUFFICIENT_FUNDS\`.
   - Otherwise: **Database Update** \`UPDATE wallets SET balance = :newBalance WHERE staff_id = :staffId\`, with \`newBalance\` = \`vars.wallet[0].balance - payload.amount\`.
4. **Set Payload**: \`{ staffId, paid, balance }\`.
5. **Error handling**:
   - **On Error Propagate** for \`APP:INSUFFICIENT_FUNDS\`: \`httpStatus\` = \`422\`, body \`{ "code": "INSUFFICIENT_FUNDS" }\`.
   - **On Error Propagate** for \`APP:WALLET_NOT_FOUND\`: \`httpStatus\` = \`404\`, body \`{ "code": "WALLET_NOT_FOUND" }\`.

**Why Raise Error and not a Set Payload in the route.** A route that sets a 422 body and carries on would reach the Set Payload after the Choice and send a success body. Raise Error ends the main path for certain. It also gives the outcome a name that monitoring can count.

**Why the order of the routes matters.** Choice takes the first route that is true. The missing wallet must come first, because \`vars.wallet[0].balance\` is null when there is no row.
`,
  followUps: [
    {
      q: 'Two tills charge the same wallet at the same moment. What can go wrong?',
      a: 'Both read 20.00 and both write their own new balance, so one payment is lost. A safer update is UPDATE wallets SET balance = balance - :amount WHERE staff_id = :staffId AND balance >= :amount, then a check that one row changed.',
    },
    {
      q: 'Why not On Error Continue?',
      a: 'Either can answer with vars.httpStatus here. Propagate keeps the event marked as failed, so dashboards count the refusals. Continue would hide them as successes.',
    },
    {
      q: 'What error namespace should a team use?',
      a: 'Any name that is not one of Mule\'s own, such as APP or WALLET. Keep it the same across the team\'s APIs, so a shared handler can map the common ones.',
    },
  ],
}
