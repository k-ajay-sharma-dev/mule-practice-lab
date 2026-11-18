import { design, flow, route, router, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-121',
  category: 'flows',
  title: 'Delete a Saved Address: 204 When It Is Gone, 404 When There Was Nothing to Delete',
  level: 'BEGINNER',
  tags: ['myproject', 'http', 'database', 'delete', 'http-status', 'choice', 'retail'],
  estMinutes: 15,
  flowChecks: [
    {
      label: 'The API is a DELETE on /customers/{customerId}/addresses/{addressId}',
      rule: { type: 'source', component: 'http-listener', where: { path: { all: ['/customers/{customerId}', '/addresses/{addressId}'] }, allowedMethods: 'DELETE' } },
    },
    {
      label: 'One Database Delete removes the row, matching both the address ID and the customer ID',
      rule: { type: 'exists', component: 'db-delete', where: { sql: { all: ['delete from', 'customer_addresses', 'address_id', 'customer_id'] } } },
    },
    {
      label: 'A Choice reads affectedRows from the delete result',
      rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'affectedRows' } },
    },
    {
      label: 'The Choice comes after the delete',
      rule: { type: 'before', first: 'db-delete', then: 'choice' },
    },
    {
      label: 'When no row was deleted, vars.httpStatus is set to 404 inside the Choice',
      rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '404' } },
    },
    {
      label: 'When the row was deleted, vars.httpStatus is set to 204',
      rule: { type: 'exists', component: 'set-variable', where: { variableName: 'httpStatus', value: '204' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          customer_addresses: {
            key: 'address_id',
            rows: [
              { address_id: 'A-2001', customer_id: 'C-1001', label: 'Home', line1: '14 Elm Street', city: 'Leeds' },
              { address_id: 'A-2002', customer_id: 'C-1001', label: 'Work', line1: '2 Mill Lane', city: 'Leeds' },
              { address_id: 'A-3001', customer_id: 'C-2002', label: 'Home', line1: '9 Quay Road', city: 'Hull' },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'A customer deletes one of their addresses',
        about: 'Customer C-1001 removes the work address. The row is gone and the answer is 204.',
        trigger: { http: { method: 'DELETE', path: '/customers/C-1001/addresses/A-2002' } },
        expect: { status: 204, db: { customer_addresses: { count: 2, lacks: [{ address_id: 'A-2002' }], has: [{ address_id: 'A-2001' }] } } },
      },
      {
        name: 'The address does not exist',
        about: 'The app sends an address ID that was never saved. Nothing is deleted and the answer is 404.',
        trigger: { http: { method: 'DELETE', path: '/customers/C-1001/addresses/A-9999' } },
        expect: { status: 404, bodyHas: { code: 'NOT_FOUND' }, db: { customer_addresses: { count: 3 } } },
      },
      {
        name: 'The address belongs to another customer',
        about: 'Customer C-1001 asks to delete address A-3001, which belongs to C-2002. It must stay, and the answer is 404.',
        trigger: { http: { method: 'DELETE', path: '/customers/C-1001/addresses/A-3001' } },
        expect: { status: 404, bodyHas: { code: 'NOT_FOUND' }, db: { customer_addresses: { count: 3, has: [{ address_id: 'A-3001', customer_id: 'C-2002' }] } } },
      },
      {
        name: 'The app sends the same delete twice',
        about: 'A weak mobile signal makes the app send the request again. The first call answers 204 and the second 404, and nothing else changes.',
        triggers: [
          { http: { method: 'DELETE', path: '/customers/C-1001/addresses/A-2001' } },
          { http: { method: 'DELETE', path: '/customers/C-1001/addresses/A-2001' }, afterMs: 2000 },
        ],
        expect: { status: 404, db: { customer_addresses: { count: 2, lacks: [{ address_id: 'A-2001' }] } } },
      },
    ],
  },
  referenceFlow: design(
    flow('delete-customer-address', source('http-listener', { path: '/customers/{customerId}/addresses/{addressId}', allowedMethods: 'DELETE' }), [
      step('db-delete', {
        database: 'MySQL',
        sql: 'DELETE FROM customer_addresses WHERE address_id = :addressId AND customer_id = :customerId',
        inputParameters: '#[{ addressId: attributes.uriParams.addressId, customerId: attributes.uriParams.customerId }]',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[payload.affectedRows == 0]' }, [
            step('set-variable', { variableName: 'httpStatus', value: '404' }),
            step('set-payload', { value: '#[output application/json --- { code: "NOT_FOUND", message: "No such address for this customer." }]' }),
          ]),
        ],
        {
          otherwise: [
            step('set-variable', { variableName: 'httpStatus', value: '204' }),
            step('set-payload', { value: '#[null]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
A furniture retailer keeps its customers' saved delivery addresses in a MySQL table \`customer_addresses\`, with the columns \`address_id\`, \`customer_id\`, \`label\`, \`line1\` and \`city\`. The mobile app lets a customer remove an address they no longer use.

The app calls:

\`DELETE /customers/{customerId}/addresses/{addressId}\`

The API gateway has already checked that the caller is the customer in the path.

**Requirements**
- Delete the address only if it belongs to the customer in the path. A customer must never remove another customer's address by guessing an ID.
- Return **204 No Content** when the address was deleted.
- Return **404** with the JSON body \`{ "code": "NOT_FOUND", "message": "..." }\` when there was nothing to delete: the address does not exist, belongs to someone else, or was already deleted.
- Use one database statement. Do not read the row first.

A Database **Delete** operation returns an object such as \`{ "affectedRows": 1 }\`: the number of rows the statement removed.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`.

**Design the flow.**
`,
  answerTemplate: `## The endpoint

## The delete statement

## Deciding the answer

## What the app sees
`,
  keyPoints: [
    'Put both IDs in the WHERE clause. The statement itself makes sure a customer can only delete their own address.',
    'The Delete operation returns affectedRows. 0 means nothing matched, 1 means the row is gone.',
    'A Choice on affectedRows turns the result into 204 or 404, so no SELECT is needed first.',
    'One statement has no gap between a read and a delete, where another request could change the row.',
    'Returning 404 for an address of another customer does not reveal that the address exists.',
    'A repeated DELETE is safe: the second call deletes nothing and answers 404, and the data is the same as after the first.',
  ],
  solution: `
1. **HTTP Listener**: \`DELETE /customers/{customerId}/addresses/{addressId}\`.
2. **Database Delete** (MySQL):
   \`\`\`sql
   DELETE FROM customer_addresses
   WHERE address_id = :addressId AND customer_id = :customerId
   \`\`\`
   Input parameters: \`#[{ addressId: attributes.uriParams.addressId, customerId: attributes.uriParams.customerId }]\`.
3. **Choice**:
   - When \`#[payload.affectedRows == 0]\`: **Set Variable** \`httpStatus\` = \`404\`, and **Set Payload** to \`{ "code": "NOT_FOUND", "message": "No such address for this customer." }\`.
   - Otherwise: **Set Variable** \`httpStatus\` = \`204\`, and **Set Payload** to \`null\`. A 204 answer has no body.

**Why both IDs in one statement.** With only \`address_id\` in the WHERE clause, any customer could delete any address by changing the ID in the URL. With both, the database removes the row only when it belongs to that customer.

**Why no SELECT first.** Reading the row and then deleting it takes two calls, and the row can change in between. The delete already tells you, through \`affectedRows\`, whether there was a row to remove.
`,
  followUps: [
    {
      q: 'Some teams return 204 even when nothing was deleted. Is that wrong?',
      a: 'Both are used. DELETE is idempotent either way, because the data ends up the same. This scenario asks for 404 so the app can tell the customer the address was already gone.',
    },
    {
      q: 'Why 404 and not 403 for another customer\'s address?',
      a: '403 would confirm that the address ID exists. 404 tells the caller nothing about other customers\' data.',
    },
    {
      q: 'What if the business wants to keep deleted addresses for a year for audit?',
      a: 'Use a soft delete: an UPDATE that sets a deleted_at column, with the same two IDs in the WHERE clause and deleted_at IS NULL. affectedRows works the same way.',
    },
  ],
}
