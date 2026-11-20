import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const get = (storeId) => ({ http: { method: 'GET', path: `/stores/${storeId}/open-orders` } })
const order = (id, created, lines) => ({ ORDER_ID: id, CREATED_AT: created, LINE_COUNT: lines, STATUS: 'OPEN' })
const openOrders = {
  '0101': [order('SO-88102', '2026-11-12T09:14:00', 3), order('SO-88117', '2026-11-12T15:40:00', 1)],
  '0102': [],
}
const procedures = {
  'ORDERS_PKG.GET_OPEN_ORDERS': (args) =>
    args.p_store_id in openOrders ? { p_status: 'OK', p_orders: openOrders[args.p_store_id] } : { p_status: 'NO_SUCH_STORE', p_orders: [] },
}

export default {
  id: 'fl-228',
  category: 'flows',
  title: 'Open Orders From an Oracle Procedure With a Ref Cursor: Pass the Store ID as a Parameter, Read the Cursor and the Status, and Answer 404 for an Unknown Store',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'stored-procedure', 'ref-cursor', 'http', 'out-parameters'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The API answers GET /stores/{storeId}/open-orders', rule: { type: 'source', component: 'http-listener', where: { path: '/stores/{storeId}/open-orders', allowedMethods: 'GET' } } },
    {
      label: 'The orders come from ORDERS_PKG.GET_OPEN_ORDERS, with the store ID as a bound parameter',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'db-stored-procedure', where: { sql: { all: ['ORDERS_PKG.GET_OPEN_ORDERS', ':p_store_id'], not: '++' } } },
          { type: 'absent', component: 'db-select' },
        ],
      },
    },
    { label: 'A NO_SUCH_STORE status gets 404', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '404' } } },
  ],
  simulation: {
    systems: { db: { tables: {}, procedures } },
    tests: [
      {
        name: 'A store with two open orders',
        about: 'The cursor holds two rows. The answer is 200 with both orders, in the API\'s own field names.',
        trigger: get('0101'),
        expect: { status: 200, bodyHas: [{ orderId: 'SO-88102', lineCount: 3 }, { orderId: 'SO-88117', lineCount: 1 }] },
      },
      {
        name: 'A store with none',
        about: 'The store exists but has no open orders. The answer is 200 with an empty list, not 404.',
        trigger: get('0102'),
        expect: { status: 200, body: [] },
      },
      {
        name: 'A store that does not exist',
        about: 'The procedure says NO_SUCH_STORE. The answer is 404 with a message.',
        trigger: get('9999'),
        expect: { status: 404, bodyHas: { message: 'Store 9999 not found' } },
      },
    ],
  },
  referenceFlow: design(
    flow('store-open-orders-api', source('http-listener', { path: '/stores/{storeId}/open-orders', allowedMethods: 'GET' }), [
      step('set-variable', { variableName: 'storeId', value: '#[attributes.uriParams.storeId]' }),
      step('db-stored-procedure', {
        database: 'Oracle',
        sql: '{ call ORDERS_PKG.GET_OPEN_ORDERS(:p_store_id, :p_status, :p_orders) }',
        inputParameters: '#[{ p_store_id: vars.storeId }]',
        target: 'result',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.result.p_status == "NO_SUCH_STORE"]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '404' }),
            step('set-payload', { value: '#[output application/json --- { message: "Store " ++ vars.storeId ++ " not found" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('transform', {
              script: '%dw 2.0\noutput application/json\n---\n(vars.result.p_orders default []) map ((o) -> { orderId: o.ORDER_ID, createdAt: o.CREATED_AT, lineCount: o.LINE_COUNT })',
            }),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, keeps store orders in Oracle. The DBA team does not allow apps to query the order tables directly. Instead they offer a PL/SQL procedure:

\`\`\`sql
ORDERS_PKG.GET_OPEN_ORDERS(
  p_store_id IN  VARCHAR2,
  p_status   OUT VARCHAR2,      -- 'OK' or 'NO_SUCH_STORE'
  p_orders   OUT SYS_REFCURSOR  -- ORDER_ID, CREATED_AT, LINE_COUNT, STATUS
)
\`\`\`

The store app needs **GET /stores/{storeId}/open-orders**, answering a list of \`{ orderId, createdAt, lineCount }\`.

A first draft built the call by joining the store ID into the SQL text. Security review rejected it.

**Requirements**
- Call the procedure with the store ID as a bound parameter, never joined into the SQL.
- \`NO_SUCH_STORE\` answers **404** \`{ message: "Store <id> not found" }\`.
- A store with no open orders answers **200** with \`[]\`.
- Otherwise answer **200** with the orders, in the API's field names.

**Facts**
- Name the parameters as the procedure does: \`p_store_id\` in, \`p_status\` and \`p_orders\` out. The result holds each output under its name, and the cursor is a list of rows with upper case column names.
- Put the status code in the variable \`httpStatus\`. The listener answers with it, 200 when it is not set.

**Design the flow.**
`,
  answerTemplate: `## Calling the procedure

## The status and the cursor

## The answer
`,
  keyPoints: [
    'Bind the store ID as an input parameter. Joining it into the SQL text opens the door to SQL injection and stops Oracle from reusing the parsed statement.',
    'Declare p_status and p_orders as output parameters in the Stored Procedure operation; the ref cursor comes back as a list of rows under its name.',
    'Read the cursor inside the flow. It is tied to the connection, so it cannot be kept for later.',
    'An unknown store and a store with no orders are different answers: 404 and an empty 200. The status parameter lets the procedure say which.',
    'Map Oracle\'s upper case column names to the API\'s own names, so a column rename in Oracle does not reach the store app.',
  ],
  solution: `
1. **HTTP Listener** \`GET /stores/{storeId}/open-orders\`.
2. **Set Variable** \`storeId\` from the URI.
3. **Database Stored Procedure** \`{ call ORDERS_PKG.GET_OPEN_ORDERS(:p_store_id, :p_status, :p_orders) }\`, input \`p_store_id\`, output \`p_status\` (VARCHAR) and \`p_orders\` (CURSOR), Target \`result\`.
4. **Choice**:
   - \`vars.result.p_status == "NO_SUCH_STORE"\`: \`httpStatus\` 404 and a message.
   - Otherwise **Transform** \`p_orders\` to \`{ orderId, createdAt, lineCount }\`.

**A big cursor.** A store with thousands of open orders makes a big answer. Add paging parameters to the procedure, or a limit agreed with the store app.
`,
  followUps: [
    {
      q: 'Why do DBA teams like procedures for app access?',
      a: 'They can change tables and indexes behind a fixed contract, grant execute on the package only, and tune the one query the app runs.',
    },
    {
      q: 'The procedure raises ORA-20001 for a bad store ID instead of a status. What changes?',
      a: 'The call fails with DB:QUERY_EXECUTION. Catch it with On Error Continue, check that the description holds ORA-20001, and answer 404. Other errors still answer 500.',
    },
  ],
}
