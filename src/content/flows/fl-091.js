import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-091',
  category: 'flows',
  title: 'Create SAP Sales Orders with a BAPI Inside a Transaction and Check the RETURN Table',
  level: 'ADVANCED',
  tags: ['sap', 'bapi', 'transactions', 'try-scope', 'http', 'error-handling', 'order-management'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Orders arrive through an HTTP Listener', rule: { type: 'source', component: 'http-listener', where: { path: 'sales-orders' } } },
    { label: 'The request is mapped to the BAPI structure before the call', rule: { type: 'before', first: 'transform', then: 'sap-sync-rfc' } },
    { label: 'The BAPI is called with Synchronous Remote Function Call', rule: { type: 'exists', component: 'sap-sync-rfc', where: { key: 'BAPI_SALESORDER_CREATEFROMDAT2' } } },
    { label: 'The call runs in a Try that begins a transaction', rule: { type: 'exists', component: 'try', where: { transactionalAction: 'ALWAYS_BEGIN' } } },
    { label: 'The BAPI call is inside the Try', rule: { type: 'inside', component: 'sap-sync-rfc', within: 'try' } },
    {
      label: 'A business error in the RETURN table raises an error inside the Try, after the BAPI call',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'raise-error', within: 'try', where: { type: 'SAP-ORDER' } },
          { type: 'before', first: 'sap-sync-rfc', then: 'raise-error', thenWhere: { type: 'SAP-ORDER' } },
        ],
      },
    },
    {
      label: 'No On Error Continue sits on the Try, so a rejected order leaves the Try and is not committed',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'sap-sync-rfc', within: 'try' },
          { type: 'absent', component: 'on-error-continue', within: 'try' },
        ],
      },
    },
    {
      label: 'A rejected order gets a 422 from its own handler',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'APP:SAP-ORDER-REJECTED' },
          handlerStatus('SAP-ORDER-REJECTED', '422'),
        ],
      },
    },
    {
      label: 'SAP being unreachable is mapped to a 503',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'SAP:CONNECTIVITY' },
          handlerStatus('SAP:CONNECTIVITY', '503'),
        ],
      },
    },
    {
      label: 'SAP timing out or being busy is also handled (SAP:TIMEOUT, SAP:SYSTEM_BUSY)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'SAP:TIMEOUT' },
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'SAP:SYSTEM_BUSY' },
        ],
      },
    },
    {
      // An error handler overrides the status, so the main path may set it at any point.
      label: 'A saved order returns 201, set on the main path and not in an error handler',
      rule: { type: 'before', first: 'http-listener', then: 'set-variable', thenWhere: { value: '201' }, outside: true },
    },
  ],
  referenceFlow: design(
    flow(
      'create-sales-order',
      source('http-listener', { path: '/api/v1/sales-orders', allowedMethods: 'POST' }),
      [
        step('transform', {
          script:
            '%dw 2.0\noutput application/xml\n---\n{\n  BAPI_SALESORDER_CREATEFROMDAT2: {\n    "import": {\n      ORDER_HEADER_IN: {\n        DOC_TYPE: "TA",\n        SALES_ORG: payload.salesOrg,\n        DISTR_CHAN: payload.channel,\n        DIVISION: payload.division,\n        PURCH_NO_C: payload.portalRef\n      }\n    },\n    tables: {\n      ORDER_PARTNERS: { row: { PARTN_ROLE: "AG", PARTN_NUMB: payload.customerNo } },\n      ORDER_ITEMS_IN: { (payload.items map (i, idx) -> { row: { ITM_NUMBER: (idx + 1) * 10, MATERIAL: i.material, TARGET_QTY: i.quantity } }) }\n    }\n  }\n}',
        }),
        // Without an open transaction the change does not impact SAP.
        scope('try', { transactionalAction: 'ALWAYS_BEGIN' }, [
          step('sap-sync-rfc', { key: 'BAPI_SALESORDER_CREATEFROMDAT2' }),
          // The docs' examples select on payload directly after the call. read() would fail on a payload that is already parsed.
          step('set-variable', { variableName: 'bapi', value: "#[if (payload is Binary) read(payload, 'application/xml') else payload]" }),
          step('set-variable', {
            variableName: 'bapiErrors',
            value: '#[(vars.bapi..*row default []) filter (["E", "A"] contains $."TYPE") map $."MESSAGE"]',
          }),
          router(
            'choice',
            {},
            [
              route({ expression: '#[!isEmpty(vars.bapiErrors)]' }, [
                step('raise-error', { type: 'APP:SAP-ORDER-REJECTED', description: "#[vars.bapiErrors joinBy '; ']" }),
              ]),
            ],
            { otherwise: [step('logger', { level: 'INFO', message: '#["Sales order created for " ++ correlationId]' })] },
          ),
        ]),
        step('set-variable', { variableName: 'httpStatus', value: '#[201]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ orderNumber: vars.bapi..SALESDOCUMENT[0] as String, correlationId: correlationId }',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'APP:SAP-ORDER-REJECTED' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[422]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "ORDER_REJECTED", message: error.description, correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'SAP:CONNECTIVITY, SAP:TIMEOUT, SAP:SYSTEM_BUSY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[503]' }),
          step('logger', { level: 'ERROR', message: '#["SAP unavailable: " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "SAP_UNAVAILABLE", message: "Please retry later", correlationId: correlationId }' }),
        ]),
      ],
    ),
  ),
  description: `
A customer portal submits about **6,000 orders per day**. A System API must create each order in **SAP S/4HANA** with \`BAPI_SALESORDER_CREATEFROMDAT2\` and return the SAP order number while the customer waits.

**Requirements**
- \`POST /api/v1/sales-orders\` returns **201** with the order number when SAP has saved the order.
- The order must really be saved in SAP. A previous team built a flow that returned numbers for orders that did not exist (see inc-085).
- SAP reports business problems, such as a blocked customer or unknown material, in the BAPI's \`RETURN\` table. Those must become a **422** with the SAP message text. The app reports them with its own error type \`APP:SAP-ORDER-REJECTED\`.
- When SAP cannot be reached, is busy or times out, the portal must get a **503** so that it can retry.
- Use the current operation, not the deprecated \`sap:sync-rfc\`. The app uses JCo 3.1.x.

**Design the flow.** Explain where the transaction starts and ends, and why the RETURN check is inside it.
`,
  answerTemplate: `## Mapping the request

## The transaction

## Reading the RETURN table

## Error mapping

## Retries
`,
  keyPoints: [
    'Synchronous Remote Function Call executes the BAPI over sRFC. It works only with JCo 3.1.x and needs authorization for RFC_METADATA_GET.',
    'A function that changes data must be inside a Try with an open transaction (transactionalAction="ALWAYS_BEGIN"), otherwise the change does not impact SAP.',
    'The BAPI XML has import, export and tables sections, as in the connector examples.',
    'Business errors come back in RETURN with type E or A, and they do not automatically fail the operation. Check them and raise your own error.',
    'Raising the error inside the Try means the transaction does not complete normally.',
    'Documented errors include SAP:CONNECTIVITY, SAP:TIMEOUT and SAP:SYSTEM_BUSY. These map to 503.',
    'Retries must not create a second order: use the portal reference as an idempotency key.',
  ],
  solution: `
1. **HTTP Listener** \`POST /api/v1/sales-orders\`.
2. **Transform Message** to the BAPI XML with \`import\` and \`tables\`, as in the docs example \`{ BAPI_BANK_GETLIST: { "import": { ... } } }\`. Check the exact row structure against the function's metadata.
3. **Try** with \`transactionalAction="ALWAYS_BEGIN"\`:
   - **Synchronous Remote Function Call** with \`BAPI_SALESORDER_CREATEFROMDAT2\`.
   - Read the response as XML and collect \`RETURN\` rows of type \`E\` or \`A\`.
   - **Choice**: if there are errors, **Raise Error** \`APP:SAP-ORDER-REJECTED\` with the messages.
4. Outside the Try: status **201** with \`SALESDOCUMENT\`.

**Why the check is inside the Try.** A Mule transaction commits when the Try finishes normally and rolls back when an error leaves it. Raising the error inside means a rejected order does not end in a commit. The connector docs do not describe the commit in detail, so test both paths against an SAP test system and read the order back.

**Errors.**
- \`APP:SAP-ORDER-REJECTED\`: 422 with the SAP message text.
- \`SAP:CONNECTIVITY\`, \`SAP:TIMEOUT\`, \`SAP:SYSTEM_BUSY\`: 503.

**Retries.** A timeout does not tell you whether the order was saved, so a retry could create a second order. Put the portal reference in \`PURCH_NO_C\`, and check for it before retrying, or have SAP reject duplicate references.
`,
  followUps: [
    {
      q: 'How would you test that the Try is really needed?',
      a: 'Create an order against an SAP test system and read it back with a separate call. A mock cannot show this, because a mock has no database to save to.',
    },
    {
      q: 'What is the Evaluate Response flag for?',
      a: 'It sets whether an error response throws an exception or lets you handle it with another result. Check what it does with this BAPI in your version, and keep the RETURN check either way.',
    },
    {
      q: 'Would you use the asynchronous operation here?',
      a: 'No. The customer waits for the order number, and asynchronous calls do not expect a response. Use it when the caller does not need a result, with Start SAP Transaction and Confirm Transaction.',
    },
  ],
}
