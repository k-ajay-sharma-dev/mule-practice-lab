// How a flow problem describes its run scenario: the `simulation` key of a problem in src/content/flows.
//
// simulation: {
//   properties: { 'sap.host': 'sap.example.com' },      for ${...} placeholders and p('...')
//   systems: {
//     http: [                                            endpoints an HTTP Request can call
//       { method: 'POST', path: '/core-banking/transfers', latencyMs: 120, respond: { status: 200, body: { transferId: 'T-1001' } } },
//       { method: 'GET', path: '/employees/{id}/manager', respond: (req) => ({ status: 200, body: { email: `m-${req.params.id}@x.com` } }) },
//       { path: '/flaky', responses: [{ fault: 'CONNECTIVITY' }, { status: 200, body: 'ok' }] },   one answer per call, the last repeats
//     ],
//     A respond or response is { status, body, headers, latencyMs } or { fault: 'CONNECTIVITY' }. A latency above the
//     HTTP Request's Response timeout (10 s when it is 0) raises HTTP:TIMEOUT. A status of 400 or more raises the
//     HTTP error for that status, with the body in error.errorMessage.payload. A path no endpoint has answers 404.
//
//     db: { tables: { products: { key: 'sku', rows: [{ sku: 'P-1', category: 'tools' }] } }, latencyMs: 8, fault: 'CONNECTIVITY' },
//     A :name in SQL takes its value from vars.name, then payload.name, then the URI and query parameters.
//     snake_case names also look for the camelCase name (:order_id finds orderId).
//
//     queues: { 'orders-dlq': { fault: true } },         a publish to this destination fails with <NS>:CONNECTIVITY
//     files: { '/data/in/orders.csv': 'id,total\n1,20' },  files the File, FTP and SFTP operations see
//     objectStore: { 'watermarks': { last: '2026-11-12T00:00:00Z' } },
//     email: { fault: true },                            the mail server is down
//     calls: { 'sf-upsert': { payload: {...} } | [{ fault: { type: 'SALESFORCE:CONNECTIVITY', description: '...' } }, { payload }] },
//       Salesforce, SAP, Workday, SOAP and other connectors answer from here, by component type or by operation.
//   },
//   tests: [
//     {
//       name: 'A transfer goes through',                 short, plain words; shown as "Run: <name>" in the checks
//       about: 'Core banking accepts the transfer.',     optional, one line under the name in the Run tab
//       trigger: { http: { method: 'POST', path: '/transfers', body: {...}, headers: {...}, query: {...} } },
//         or { message: { kind: 'mq' | 'jms' | 'vm' | 'kafka' | 'sqs', destination, payload, properties, deliveryCount } }
//         or { schedule: {} } or { schedule: { flow: 'nightly-export' } }
//         or { file: { path: '/data/in/orders.csv', content: '...' } }
//         or { source: 'sf-listener', payload, attributes }   any other source, by its component type
//       triggers: [ ... ]                                several in a row (a duplicate, a cache hit); each may have afterMs
//       overrides: { systems: { http: [{ method, path, respond: { fault: 'CONNECTIVITY' } }] } },
//         changes the scenario for this test only: an endpoint with the same method and path is replaced, and a
//         file set to null is not there
//       expect: { ... }                                  see src/sim/expect.js for every key
//     },
//   ],
// }
//
// Writing good tests:
// - One test for the normal path, then one for each failure the problem talks about (a system down, a timeout,
//   a bad request, a duplicate, an empty result). The failure tests are what make a design prove itself.
// - Expect what the scenario asks for, not how the reference builds it: the status and the body (or bodyHas), the
//   rows written, the messages sent, the log level. A different but correct design must pass too.
// - Prefer bodyHas over body when the problem does not fix every field.
export {}
