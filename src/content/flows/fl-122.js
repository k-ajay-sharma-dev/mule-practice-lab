import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

const workOrder = { status: 'IN_PROGRESS', assignedTo: 'tech-118', notes: 'Boiler part ordered' }

export default {
  id: 'fl-122',
  category: 'flows',
  title: 'Work Order Updates Without Lost Changes: a Version Check With If-Match, 412 and 428',
  level: 'INTERMEDIATE',
  tags: ['optimistic-locking', 'concurrency', 'http-status', 'database', 'etag', 'postgresql'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The API is a PUT on /work-orders/{workOrderId}',
      rule: { type: 'source', component: 'http-listener', where: { path: '/work-orders/{workOrderId}', allowedMethods: 'PUT' } },
    },
    {
      label: 'The UPDATE raises the version by one',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['update work_orders', 'version + 1'] } } },
    },
    {
      label: 'The UPDATE only matches the row when its version is the one the client read',
      rule: { type: 'exists', component: 'db-update', where: { sql: { all: ['work_order_id'], oneOf: ['and version =', 'where version =', 'and version=', 'where version='] } } },
    },
    {
      label: 'A request without If-Match is stopped before the UPDATE',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: 'validation', firstWhere: { expression: 'if-match' }, then: 'db-update' },
          { type: 'routes', component: 'choice', routeWhere: { expression: 'if-match' } },
        ],
      },
    },
    {
      label: 'A request without If-Match gets status 428',
      rule: { type: 'exists', component: 'set-variable', where: { variableName: 'httpStatus', value: '428' } },
    },
    {
      label: 'A Choice reads affectedRows from the UPDATE result',
      rule: { type: 'routes', component: 'choice', routeWhere: { expression: 'affectedRows' } },
    },
    {
      label: 'Only after an UPDATE that changed nothing is the row read, to tell a conflict from a missing work order',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'db-update', then: 'db-select', every: true },
          { type: 'inside', component: 'db-select', within: 'choice' },
        ],
      },
    },
    {
      label: 'A version conflict sets status 412 inside the Choice',
      rule: { type: 'inside', component: 'set-variable', within: 'choice', where: { variableName: 'httpStatus', value: '412' } },
    },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          work_orders: {
            key: 'work_order_id',
            rows: [
              { work_order_id: 'WO-5521', site: 'Riverside Court', status: 'OPEN', assigned_to: 'tech-104', notes: 'No hot water in flat 12', version: 7 },
              { work_order_id: 'WO-5530', site: 'Hill House', status: 'OPEN', assigned_to: null, notes: 'Lift alarm', version: 2 },
            ],
          },
        },
      },
    },
    tests: [
      {
        name: 'An update with the current version',
        about: 'The dispatcher read version 7 and sends If-Match "7". The row is changed, its version becomes 8, and the answer gives the new version.',
        trigger: { http: { method: 'PUT', path: '/work-orders/WO-5521', headers: { 'if-match': '"7"' }, body: workOrder } },
        expect: {
          status: 200,
          bodyHas: { version: 8 },
          db: { work_orders: { has: [{ work_order_id: 'WO-5521', status: 'IN_PROGRESS', assigned_to: 'tech-118', version: 8 }] } },
        },
      },
      {
        name: 'An update with an old version',
        about: 'The technician read version 6, before someone else saved a change. Nothing is overwritten, and the answer is 412 with the current version.',
        trigger: { http: { method: 'PUT', path: '/work-orders/WO-5521', headers: { 'if-match': '"6"' }, body: workOrder } },
        expect: {
          status: 412,
          bodyHas: { currentVersion: 7 },
          db: { work_orders: { has: [{ work_order_id: 'WO-5521', status: 'OPEN', assigned_to: 'tech-104', version: 7 }] } },
        },
      },
      {
        name: 'Two people save the same version',
        about: 'The dispatcher and the technician both read version 7. The first save wins. The second gets 412, and the first change is still there.',
        triggers: [
          { http: { method: 'PUT', path: '/work-orders/WO-5521', headers: { 'if-match': '"7"' }, body: workOrder } },
          { http: { method: 'PUT', path: '/work-orders/WO-5521', headers: { 'if-match': '"7"' }, body: { status: 'ON_HOLD', assignedTo: 'tech-104', notes: 'Tenant away' } }, afterMs: 3000 },
        ],
        expect: {
          status: 412,
          db: { work_orders: { has: [{ work_order_id: 'WO-5521', status: 'IN_PROGRESS', version: 8 }], lacks: [{ work_order_id: 'WO-5521', status: 'ON_HOLD' }] } },
        },
      },
      {
        name: 'No If-Match header',
        about: 'An old client sends the update with no version. It is refused with 428 and the row is not touched.',
        trigger: { http: { method: 'PUT', path: '/work-orders/WO-5521', body: workOrder } },
        expect: { status: 428, db: { work_orders: { has: [{ work_order_id: 'WO-5521', status: 'OPEN', version: 7 }] } } },
      },
      {
        name: 'The work order does not exist',
        about: 'The client sends an ID that is not in the table. The answer is 404, not a version conflict.',
        trigger: { http: { method: 'PUT', path: '/work-orders/WO-9999', headers: { 'if-match': '"1"' }, body: workOrder } },
        expect: { status: 404, bodyHas: { code: 'NOT_FOUND' }, db: { work_orders: { count: 2 } } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'update-work-order',
      source('http-listener', { path: '/work-orders/{workOrderId}', allowedMethods: 'PUT' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: "#[attributes.headers['if-match']]", message: 'The If-Match header is required.' }),
        step('set-variable', { variableName: 'expectedVersion', value: "#[(attributes.headers['if-match'] replace /\\D/ with '') as Number]" }),
        step('set-variable', { variableName: 'workOrderId', value: '#[attributes.uriParams.workOrderId]' }),
        step('db-update', {
          database: 'PostgreSQL',
          sql: 'UPDATE work_orders SET status = :status, assigned_to = :assignedTo, notes = :notes, version = version + 1 WHERE work_order_id = :workOrderId AND version = :expectedVersion',
          inputParameters: '#[{ status: payload.status, assignedTo: payload.assignedTo, notes: payload.notes, workOrderId: vars.workOrderId, expectedVersion: vars.expectedVersion }]',
          target: 'updated',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[vars.updated.affectedRows == 1]' }, [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ workOrderId: vars.workOrderId, status: payload.status, version: vars.expectedVersion + 1 }',
              }),
            ]),
          ],
          {
            otherwise: [
              step('db-select', { database: 'PostgreSQL', sql: 'SELECT version FROM work_orders WHERE work_order_id = :workOrderId', inputParameters: '#[{ workOrderId: vars.workOrderId }]' }),
              router(
                'choice',
                {},
                [
                  route({ expression: '#[isEmpty(payload)]' }, [
                    step('set-variable', { variableName: 'httpStatus', value: '404' }),
                    step('set-payload', { value: '#[output application/json --- { code: "NOT_FOUND", message: "No work order " ++ vars.workOrderId }]' }),
                  ]),
                ],
                {
                  otherwise: [
                    step('set-variable', { variableName: 'httpStatus', value: '412' }),
                    step('set-payload', {
                      value: '#[output application/json --- { code: "VERSION_CONFLICT", message: "The work order was changed by someone else. Reload it and try again.", currentVersion: payload[0].version }]',
                    }),
                  ],
                },
              ),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '428' }),
          step('set-payload', { value: '#[output application/json --- { code: "PRECONDITION_REQUIRED", message: "Send the version you read in the If-Match header." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A property management company runs a **work order** API on Mule. Dispatchers in the office and technicians on site both edit the same work orders. The data lives in a PostgreSQL table \`work_orders\` with the columns \`work_order_id\`, \`site\`, \`status\`, \`assigned_to\`, \`notes\` and \`version\`.

The update call is:

\`PUT /work-orders/{workOrderId}\` with a body such as \`{ "status": "IN_PROGRESS", "assignedTo": "tech-118", "notes": "Boiler part ordered" }\`

Today the flow runs \`UPDATE work_orders SET ... WHERE work_order_id = :id\`. Last month a technician closed a job on a tablet that had been open since the morning, and wiped out the dispatcher's reassignment from an hour before. Nobody noticed for two days.

Each \`GET\` already returns the row's \`version\` in the body and in an \`ETag\` header such as \`"7"\`. The clients will send it back in an **If-Match** header on every update.

**Requirements**
- An update only succeeds if the row still has the version the client read. A successful update raises the version by one, and the answer gives the new \`version\`.
- If someone changed the row in between, nothing is overwritten. Answer **412 Precondition Failed** with a JSON body that includes \`currentVersion\`.
- A request without If-Match is refused with **428 Precondition Required**, before anything is changed.
- An unknown work order is **404** with \`{ "code": "NOT_FOUND" }\` in the body, not 412.
- Two requests can arrive at the same moment on two Mule workers, so the check must be safe without any lock in Mule.

**How the status gets out:** assume the listener's response and error response both use \`#[vars.httpStatus default 200]\` for the status and \`#[payload]\` for the body.

**Design the flow.**
`,
  answerTemplate: `## Why changes were lost

## Reading If-Match

## The UPDATE

## Telling 412 from 404

## What each client sees
`,
  keyPoints: [
    'Optimistic locking: put the version the client read into the WHERE clause, and raise the version in the same UPDATE.',
    'The database applies the check and the change in one statement, so two workers cannot both win. No lock in Mule is needed.',
    'affectedRows 1 means the update won. 0 means the row changed or does not exist.',
    'Read the row only after an update that changed nothing, to choose between 412 and 404. The normal path stays one statement.',
    '428 makes clients send If-Match. Without it the API would fall back to "last write wins".',
    'The If-Match value is quoted, such as "7". Strip the quotes before you compare it with the number in the table.',
    'Return the new version, and the new ETag, so the client can save again without reading first.',
  ],
  solution: `
**Why changes were lost.** \`WHERE work_order_id = :id\` matches whatever is in the row now. The tablet sent the whole work order as it was in the morning, so its UPDATE wrote back the old \`assigned_to\` value.

**Flow: update-work-order**
1. **HTTP Listener** \`PUT /work-orders/{workOrderId}\`.
2. **Validation** \`is-not-blank-string\` on \`attributes.headers['if-match']\`. It raises \`VALIDATION:BLANK_STRING\` when the header is missing.
3. **Set Variable** \`expectedVersion\` = \`(attributes.headers['if-match'] replace /\\D/ with "") as Number\`, and \`workOrderId\` from the URI.
4. **Database Update** with Target \`updated\`, so the request body stays the payload:
   \`\`\`sql
   UPDATE work_orders
   SET status = :status, assigned_to = :assignedTo, notes = :notes, version = version + 1
   WHERE work_order_id = :workOrderId AND version = :expectedVersion
   \`\`\`
5. **Choice**:
   - \`vars.updated.affectedRows == 1\`: **Transform** \`{ workOrderId, status, version: vars.expectedVersion + 1 }\`. Set the \`ETag\` response header on the listener to the same version.
   - Otherwise: **Database Select** \`SELECT version FROM work_orders WHERE work_order_id = :workOrderId\`, then a second **Choice**:
     - no row: \`httpStatus\` 404 and a NOT_FOUND body;
     - a row: \`httpStatus\` 412 and \`{ code: "VERSION_CONFLICT", currentVersion: payload[0].version }\`.
6. **On Error Propagate** for \`VALIDATION:BLANK_STRING\`: \`httpStatus\` 428 and a short JSON body.

**Two saves at once.** Both requests carry version 7. PostgreSQL runs the two UPDATEs one after the other on that row. The first matches \`version = 7\` and sets it to 8. The second then finds version 8, matches nothing, and gets 412. This holds on any number of Mule workers, because the decision is made by the database.

**What the client does with 412.** Show the user the current work order, let them apply their change again, and send it with the new version.
`,
  followUps: [
    {
      q: 'Why not SELECT the version first, compare it in Mule, and then UPDATE?',
      a: 'Another request can change the row between the SELECT and the UPDATE. Both requests would pass the check and the second would still overwrite the first.',
    },
    {
      q: 'Could you use a last_updated timestamp in place of a version number?',
      a: 'Yes, if it changes on every update and has enough precision. Two updates in the same millisecond, or clocks that differ, make a counter the safer choice.',
    },
    {
      q: 'Why 428 and not 400 for a missing If-Match?',
      a: '428 Precondition Required says exactly what is missing: a condition on the request. A client can react to it in code.',
    },
    {
      q: 'Is SELECT ... FOR UPDATE a better fix?',
      a: 'It locks the row for the length of a transaction, which needs the read and the write in one transaction. The tablet may hold its copy for hours, so a lock cannot cover that time. A version check can.',
    },
  ],
}
