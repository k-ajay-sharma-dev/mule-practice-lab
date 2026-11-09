export default {
  id: 'rm-098',
  category: 'api-design',
  title: 'Lab Orders API: A Batch with Client References, Per-Item Status and an Atomic Option',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'bulk', 'batch', 'status-codes', 'query-parameters', 'healthcare'],
  estMinutes: 35,
  description: `
A hospital group's order system sends blood test orders to a central lab. A ward round produces up to 200 orders at once, and the lab wants one call per round instead of 200.

Two kinds of callers use the batch:
- The ward system wants every good order placed, even if a few are wrong. It needs a result for each item, so the API answers **207 Multi-Status** with one entry per order.
- The research unit sends orders for a study cohort. Either the whole cohort is ordered or none of it is. It sends \`atomic=true\`. If any item fails, nothing is saved and the API answers **422** with the same per-item results, so the caller can see which items caused it.

The caller has no lab order id until the order exists, so each item carries a \`clientRef\` that the result echoes back. Each result also carries its own HTTP style \`status\`, such as 201 or 422, so callers can reuse the error handling they already have for single calls.

**Requirements**
- Keep the title \`Lab Orders API\` and JSON as the default media type.
- A type \`LabOrderItem\` with required strings \`clientRef\`, \`patientId\` and \`testCode\`.
- A type \`LabOrderBatch\` with a required \`items\` of \`LabOrderItem[]\`, from 1 to 200 items.
- A type \`Error\` with required strings \`code\` and \`message\`.
- A type \`ItemResult\` with a required string \`clientRef\`, a required integer \`status\` from 200 to 599, an optional string \`orderId\` and an optional \`error\` of type \`Error\`.
- A type \`BatchResult\` with a required \`results\` of \`ItemResult[]\`.
- \`POST /lab-orders/batch\` takes a \`LabOrderBatch\` and an optional boolean query parameter \`atomic\` with a default of \`false\`.
- It returns 207 with a \`BatchResult\`. That response has its own example with one item that worked and one that failed.
- It returns 422 with a \`BatchResult\` when \`atomic\` is true and an item failed.
- It returns 400 with an \`Error\` when the batch as a whole is not valid.
`,
  starter: `#%RAML 1.0
title: Lab Orders API
mediaType: application/json

types:

/lab-orders:
  /batch:
    post:
`,
  ramlChecks: [
    {
      label: 'LabOrderItem has required clientRef, patientId and testCode',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'LabOrderItem', prop: 'clientRef', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LabOrderItem', prop: 'patientId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'LabOrderItem', prop: 'testCode', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'LabOrderBatch.items holds 1 to 200 LabOrderItem', rule: { type: 'prop', typeName: 'LabOrderBatch', prop: 'items', want: { type: 'LabOrderItem[]', required: true, minItems: 1, maxItems: 200 } } },
    { label: 'ItemResult echoes a required clientRef', rule: { type: 'prop', typeName: 'ItemResult', prop: 'clientRef', want: { type: 'string', required: true } } },
    { label: 'ItemResult.status is a required integer from 200 to 599', rule: { type: 'prop', typeName: 'ItemResult', prop: 'status', want: { type: 'integer', required: true, minimum: 200, maximum: 599 } } },
    {
      label: 'orderId is optional, and error is an optional Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ItemResult', prop: 'orderId', want: { type: 'string', required: false } },
          { type: 'prop', typeName: 'ItemResult', prop: 'error', want: { type: 'Error', required: false } },
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'BatchResult has a required results list of ItemResult', rule: { type: 'prop', typeName: 'BatchResult', prop: 'results', want: { type: 'ItemResult[]', required: true } } },
    { label: 'atomic is an optional boolean, default false', rule: { type: 'param', path: '/lab-orders/batch', method: 'post', in: 'query', name: 'atomic', want: { type: 'boolean', required: false, default: false } } },
    { label: 'POST /lab-orders/batch takes a LabOrderBatch', rule: { type: 'body', path: '/lab-orders/batch', method: 'post', typeIs: 'LabOrderBatch' } },
    { label: 'It returns 207 with a BatchResult', rule: { type: 'response', path: '/lab-orders/batch', method: 'post', status: '207', typeIs: 'BatchResult' } },
    { label: 'The 207 body has its own example', rule: { type: 'response', path: '/lab-orders/batch', method: 'post', status: '207', example: 'own' } },
    { label: 'It returns 422 with a BatchResult for a failed atomic batch', rule: { type: 'response', path: '/lab-orders/batch', method: 'post', status: '422', typeIs: 'BatchResult' } },
    { label: 'It returns 400 with an Error for a batch that is not valid', rule: { type: 'response', path: '/lab-orders/batch', method: 'post', status: '400', typeIs: 'Error' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Lab Orders API
mediaType: application/json

types:
  LabOrderItem:
    type: object
    properties:
      clientRef: string
      patientId: string
      testCode: string
  LabOrderBatch:
    type: object
    properties:
      items:
        type: LabOrderItem[]
        minItems: 1
        maxItems: 200
  Error:
    type: object
    properties:
      code: string
      message: string
  ItemResult:
    type: object
    properties:
      clientRef: string
      status:
        type: integer
        minimum: 200
        maximum: 599
      orderId?: string
      error?: Error
  BatchResult:
    type: object
    properties:
      results: ItemResult[]

/lab-orders:
  /batch:
    post:
      queryParameters:
        atomic?:
          type: boolean
          default: false
          description: When true, the batch is saved only if every item is valid.
      body:
        type: LabOrderBatch
      responses:
        207:
          body:
            type: BatchResult
            example:
              results:
                - clientRef: WARD7-001
                  status: 201
                  orderId: LO-558120
                - clientRef: WARD7-002
                  status: 422
                  error:
                    code: UNKNOWN_TEST_CODE
                    message: Test code FBX9 is not offered.
        422:
          description: The batch was atomic and at least one item failed. Nothing was saved.
          body:
            type: BatchResult
        400:
          body:
            type: Error
`,
  keyPoints: [
    'A client reference lets the caller match each result to what it sent, before any server id exists.',
    'A per-item status reuses the meaning of HTTP codes that callers already handle.',
    'The atomic option turns partial success into all or nothing for callers who need it.',
    'A failed atomic batch still returns per-item results, so the caller knows what to fix.',
    '400 means the batch itself was refused, such as an empty list or more than 200 items.',
  ],
  solution: `
The batch has two modes and one response shape. In the default mode the lab saves what it can and answers 207. With \`atomic=true\` it validates every item first. If any fails, it saves nothing and answers 422 with the same \`BatchResult\`. The caller parses one structure either way.

\`clientRef\` is the key design point. Without it, a caller would have to rely on the order of the results, which breaks as soon as the server processes items in parallel.

\`orderId\` and \`error\` are both optional, because a success has an id and no error, and a failure has the opposite. The example shows one of each, so the mocking service teaches consumers that partial failure is normal.

In Mule, the default mode fits a parallel for each over the items, collecting a result per item. The atomic mode fits a database transaction around the inserts, after a validation pass.
`,
  followUps: [
    {
      q: 'Why not return 200 when every item in the batch worked?',
      a: 'You can, but then callers need two code paths. Always returning 207 in the default mode keeps one response shape. Document the choice either way.',
    },
    {
      q: 'What if the caller retries a batch after a timeout?',
      a: 'Without protection the good items would be ordered twice. Make clientRef unique per caller and let the server return the earlier result for a reference it has already seen.',
    },
    {
      q: 'When would 202 be better than 207 for this batch?',
      a: 'When processing 200 items takes longer than a normal request timeout. Return 202 with a status resource and put the per-item results there.',
    },
  ],
}
