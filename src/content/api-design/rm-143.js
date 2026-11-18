export default {
  id: 'rm-143',
  category: 'api-design',
  title: 'Order History API: A Read-Only Audit Trail as a Sub-Resource',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'audit', 'nested-resources', 'read-only', 'union-types', 'nil', 'wholesale'],
  estMinutes: 20,
  description: `
Wexcombe Wholesale changes orders after they are placed: staff fix delivery dates, customer service changes quantities, and the warehouse sets the status. When a customer disputes an invoice, nobody can say who changed what and when.

The order system now writes one history entry per changed field. A new API shows that trail to the customer service tool. History is evidence, so the contract must make it **read-only**: no caller may add, change or remove an entry through the API.

**Requirements**
- Title \`Order History API\`, with JSON as the default media type.
- A type \`Order\` with a required \`orderId\` (\`SO-\` and six digits) and a required \`status\`, one of \`PLACED\`, \`PICKED\`, \`SHIPPED\`, \`CANCELLED\`.
- A type \`HistoryEntry\` with:
  - \`entryId\`: a required string
  - \`changedAt\`: a required \`datetime\`
  - \`changedBy\`: a required string, the user or system that made the change
  - \`field\`: a required string, such as \`deliveryDate\`
  - \`oldValue\` and \`newValue\`: required, each a string or \`null\`. \`oldValue\` is \`null\` when a field is set for the first time.
- A type \`Error\` with a required string \`message\`.
- \`GET /orders/{orderId}\` returns an \`Order\` with 200 and an \`Error\` with 404.
- \`GET /orders/{orderId}/history\` returns a list of \`HistoryEntry\` with 200 and an \`Error\` with 404. It takes an optional \`since\` query parameter, a \`datetime\`.
- \`/orders/{orderId}/history\` offers no \`post\`, \`put\`, \`patch\` or \`delete\`.
`,
  starter: `#%RAML 1.0
title: Order History API
mediaType: application/json

types:
  HistoryEntry:
    type: object
    properties:
      changedAt: string
      field: string
      oldValue: string
      newValue: string

/orders/{orderId}:
  get:
    responses:
      200:
        body:
          type: object
  /history:
    get:
      responses:
        200:
          body:
            type: HistoryEntry[]
    post:
      body:
        type: HistoryEntry
      responses:
        201:
`,
  ramlChecks: [
    {
      label: 'The title is Order History API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Order History API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'Order has an orderId of SO- and six digits and a status from the list',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Order', prop: 'orderId', want: { required: true, pattern: { accepts: ['SO-208114', 'SO-000001'], rejects: ['SO-20811', 'so-208114', 'SO-2081140', 'SO208114', 'XSO-208114'] } } },
          { type: 'prop', typeName: 'Order', prop: 'status', want: { required: true, enum: { exactly: ['PLACED', 'PICKED', 'SHIPPED', 'CANCELLED'] } } },
        ],
      },
    },
    {
      label: 'HistoryEntry has entryId, a changedAt datetime, changedBy and field',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'HistoryEntry', prop: 'entryId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'HistoryEntry', prop: 'changedAt', want: { type: 'datetime', required: true } },
          { type: 'prop', typeName: 'HistoryEntry', prop: 'changedBy', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'HistoryEntry', prop: 'field', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'oldValue and newValue are required and may be null',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'HistoryEntry', prop: 'oldValue', want: { required: true, type: { oneOf: ['nil'] } } },
          { type: 'prop', typeName: 'HistoryEntry', prop: 'newValue', want: { required: true, type: { oneOf: ['nil'] } } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'GET /orders/{orderId} returns an Order with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/orders/{}', method: 'get', status: '200', typeIs: 'Order' },
          { type: 'response', path: '/orders/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /orders/{orderId}/history takes an optional since datetime and returns HistoryEntry items or a 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/orders/{}/history', method: 'get', in: 'query', name: 'since', want: { type: 'datetime', required: false } },
          { type: 'response', path: '/orders/{}/history', method: 'get', status: '200', typeIs: 'HistoryEntry[]' },
          { type: 'response', path: '/orders/{}/history', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'The history offers no post, put, patch or delete',
      rule: {
        type: 'all',
        rules: [
          { type: 'method', path: '/orders/{}/history', method: 'get' },
          { type: 'noMethod', path: '/orders/{}/history', method: 'post' },
          { type: 'noMethod', path: '/orders/{}/history', method: 'put' },
          { type: 'noMethod', path: '/orders/{}/history', method: 'patch' },
          { type: 'noMethod', path: '/orders/{}/history', method: 'delete' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Order History API
version: v1
baseUri: https://api.example.com/order-history/{version}
mediaType: application/json

types:
  Order:
    type: object
    properties:
      orderId:
        type: string
        pattern: ^SO-[0-9]{6}$
      status:
        type: string
        enum: [ PLACED, PICKED, SHIPPED, CANCELLED ]
  HistoryEntry:
    type: object
    properties:
      entryId: string
      changedAt: datetime
      changedBy:
        type: string
        description: The user id or the name of the system that made the change.
      field: string
      oldValue:
        type: string | nil
        description: null when the field is set for the first time.
      newValue: string | nil
    example:
      entryId: HE-5520193
      changedAt: 2026-11-12T10:41:07Z
      changedBy: cs.agent.214
      field: deliveryDate
      oldValue: '2026-11-14'
      newValue: '2026-11-17'
  Error:
    type: object
    properties:
      message: string

/orders/{orderId}:
  get:
    responses:
      200:
        body:
          type: Order
      404:
        body:
          type: Error
  /history:
    description: Read-only. Entries are written by the order system as changes happen and are never edited.
    get:
      queryParameters:
        since:
          type: datetime
          required: false
          description: Only entries changed at or after this time.
      responses:
        200:
          description: Oldest change first.
          body:
            type: HistoryEntry[]
        404:
          description: No order has this id.
          body:
            type: Error
`,
  keyPoints: [
    'An audit trail is read-only, so the history resource offers only GET.',
    'Methods left out of the contract get a 405 from the error handling that APIkit scaffolds.',
    'One entry per changed field records who, what, when, the old value and the new value.',
    'A union with nil lets oldValue be null when a field is set for the first time.',
    'History hangs under the order it belongs to, as a sub-resource.',
    'A since parameter lets a tool fetch only new entries.',
  ],
  solution: `
**A sub-resource.** History belongs to one order, so it sits at \`/orders/{orderId}/history\`. The 404 for an unknown order tells the caller the order does not exist, while an order with no changes answers 200 with an empty list.

**Read-only by omission.** The contract lists only \`get\` on the history. For any other method, the APIkit router raises a method not allowed error, which the scaffolded error handler turns into 405, so no caller can add or remove evidence through the API. The order system writes entries itself, inside the same change.

**What an entry holds.** Who (\`changedBy\`), when (\`changedAt\`), what (\`field\`) and the values before and after. With the old and the new value in one entry, a reader does not have to replay the history to see a single change.

**Null is a value here.** \`string | nil\` makes \`oldValue\` required but allows \`null\`. That is different from an optional property: the key is always there, and \`null\` says "there was no value before".

**since.** The customer service tool can ask only for changes since its last call, which keeps the response small for long-running orders.
`,
  followUps: [
    {
      q: 'Values such as quantity are numbers, not strings. Why store them as strings?',
      a: 'One entry type then covers every field. The field name tells the reader how to read the value, and the tool shows it as text anyway. A typed value per field would need a union of many types.',
    },
    {
      q: 'Who may read the history?',
      a: 'Usually fewer people than may read the order, since it shows staff ids. Give it its own scope, such as orders:audit, so the contract can secure it apart from the order.',
    },
    {
      q: 'A mistake was written into the history. How is it corrected?',
      a: 'With a new entry that changes the value back, never by editing the old one. The trail then shows the mistake and the fix, which is what auditors expect.',
    },
  ],
}
