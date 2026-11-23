import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const post = (body) => ({ http: { method: 'POST', path: '/store-returns', body } })
const ret = (sku, qty) => ({ storeId: '0412', sku, qty, reason: 'DAMAGED' })
const db = () => ({ tables: { store_returns: { key: 'return_id', columns: ['return_id', 'store_id', 'sku', 'qty', 'reason', 'status'], rows: [] } }, sequences: { RETURN_SEQ: 70000 } })

export default {
  id: 'fl-224',
  category: 'flows',
  title: 'Store Returns in Oracle: Take Each Return ID From a Sequence, Not From MAX Plus One',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'sequence', 'http', 'database', 'keys'],
  estMinutes: 20,
  flowChecks: [
    { label: 'Returns are accepted on POST /store-returns', rule: { type: 'source', component: 'http-listener', where: { path: '/store-returns', allowedMethods: 'POST' } } },
    { label: 'The return ID comes from RETURN_SEQ.NEXTVAL', rule: { type: 'exists', component: 'db-select', where: { sql: { all: ['RETURN_SEQ', 'NEXTVAL'] } } } },
    { label: 'The ID is taken before the return is inserted', rule: { type: 'before', first: 'db-select', firstWhere: { sql: 'NEXTVAL' }, then: 'db-insert', thenWhere: { sql: 'store_returns' } } },
    { label: 'A quantity that is not above zero gets 400', rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '400' } } },
  ],
  simulation: {
    systems: { db: db() },
    tests: [
      {
        name: 'Two returns from one store',
        about: 'Each return gets the next number from the sequence, 70001 and then 70002, and the answer is 201 with that ID.',
        triggers: [post(ret('BRD-SOUR-800', 2)), post(ret('MLK-WHL-2L', 1))],
        expect: {
          status: 201,
          bodyHas: { returnId: 70002 },
          db: { store_returns: { count: 2, has: [{ return_id: 70001, sku: 'BRD-SOUR-800', status: 'OPEN' }, { return_id: 70002, sku: 'MLK-WHL-2L' }] } },
        },
      },
      {
        name: 'A return with no quantity',
        about: 'A quantity of 0 is refused with 400. Nothing is written.',
        trigger: post(ret('EGG-FR-12', 0)),
        expect: { status: 400, db: { store_returns: { count: 0 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('store-returns-api', source('http-listener', { path: '/store-returns', allowedMethods: 'POST' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[(payload.qty default 0) <= 0]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { message: "qty must be above 0" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('set-variable', { variableName: 'ret', value: '#[payload]' }),
            step('db-select', { database: 'Oracle', sql: 'SELECT RETURN_SEQ.NEXTVAL AS return_id FROM dual', target: 'seq' }),
            step('set-variable', { variableName: 'returnId', value: '#[vars.seq[0].return_id]' }),
            step('db-insert', {
              database: 'Oracle',
              sql: "INSERT INTO store_returns (return_id, store_id, sku, qty, reason, status) VALUES (:returnId, :storeId, :sku, :qty, :reason, 'OPEN')",
              inputParameters: '#[{ returnId: vars.returnId, storeId: vars.ret.storeId, sku: vars.ret.sku, qty: vars.ret.qty, reason: vars.ret.reason }]',
              target: 'inserted',
            }),
            step('set-variable', { variableName: 'httpStatus', value: '201' }),
            step('set-payload', { value: '#[output application/json --- { returnId: vars.returnId, status: "OPEN" }]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
Larkfield Grocers, a fictional grocery chain, records store returns (damaged or out of date stock sent back to the depot) in Oracle. The till app posts each return:

\`\`\`json
POST /store-returns
{ "storeId": "0412", "sku": "BRD-SOUR-800", "qty": 2, "reason": "DAMAGED" }
\`\`\`

Table \`store_returns\` (\`return_id\` primary key, \`store_id\`, \`sku\`, \`qty\`, \`reason\`, \`status\`). The DBA has created the sequence \`RETURN_SEQ\` for the IDs.

The first version took \`SELECT MAX(return_id) + 1\`. On busy evenings two tills got the same number, and one return failed with ORA-00001.

**Requirements**
- A \`qty\` that is not above 0 gets **400** and nothing is written.
- Take the ID from \`RETURN_SEQ.NEXTVAL\`, insert the return with status \`OPEN\`, and answer **201** \`{ returnId, status: "OPEN" }\`.

**Facts**
- Put the status code in the variable \`httpStatus\`. The listener answers with it.
- Read the next value with \`SELECT RETURN_SEQ.NEXTVAL AS return_id FROM dual\`. \`returnId\` is that number.

**What the database sends back**
- The sequence select answers a list with one row: \`[ { "return_id": 70001 } ]\`. Keep it in a target variable and read \`[0].return_id\`, so the payload stays the request.
- The insert answers a count of affected rows, not the row. Build the 201 answer from your variables.

**Design the flow.**
`,
  answerTemplate: `## Checking the request

## Taking the next ID

## Inserting and answering
`,
  keyPoints: [
    'A sequence hands each caller its own number, even when many ask at the same moment. MAX plus one reads the same maximum twice.',
    'Read the ID with SELECT RETURN_SEQ.NEXTVAL FROM dual, keep it in a variable, and use it in the insert and the answer.',
    'A sequence can leave gaps: a rolled back insert or a cached range lost on restart skips numbers. IDs are unique, not gapless.',
    'If the business needs gapless numbers (some invoice rules do), that needs a locked counter row, which is slower. Ask before promising it.',
  ],
  solution: `
1. **HTTP Listener** \`POST /store-returns\`.
2. **Choice**: \`qty <= 0\` sets \`httpStatus\` 400 and a message.
3. Otherwise:
   - **Set Variable** \`ret\`.
   - **Database Select** \`SELECT RETURN_SEQ.NEXTVAL AS return_id FROM dual\`, Target \`seq\`. **Set Variable** \`returnId\`.
   - **Database Insert** with status \`OPEN\`, Target \`inserted\`.
   - \`httpStatus\` 201 and \`{ returnId, status }\`.

**One trip instead of two.** \`INSERT ... VALUES (RETURN_SEQ.NEXTVAL, ...)\` also works. Then read the key back with Auto generated keys, or with \`RETURN_SEQ.CURRVAL\` in the same session. The separate select is clearer to follow.
`,
  followUps: [
    {
      q: 'Why can a sequence skip numbers?',
      a: 'Oracle caches a range of values in memory for speed. A restart loses the cached ones, and a rolled back insert does not give its number back.',
    },
    {
      q: 'Would an identity column be better?',
      a: 'On Oracle 12c and later it is a sequence managed by the table, so it works the same way. Use what the DBA team prefers.',
    },
  ],
}
