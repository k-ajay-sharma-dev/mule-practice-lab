import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-005',
  category: 'flows',
  title: 'Customer 360 with Scatter-Gather and Timeouts',
  level: 'ADVANCED',
  tags: ['scatter-gather', 'aggregation', 'timeout', 'error-handling', 'dataweave'],
  estMinutes: 30,
  flowChecks: [
    {
      label: 'The 360 endpoint is a GET on an HTTP Listener',
      rule: { type: 'source', component: 'http-listener', where: { path: '360', allowedMethods: 'GET' } },
    },
    {
      label: 'Salesforce, SAP and Zendesk are called in parallel (Scatter-Gather with 3 routes)',
      rule: { type: 'routes', component: 'scatter-gather', min: 3 },
    },
    {
      label: 'The Scatter-Gather timeout is set within the 2 s SLA',
      rule: { type: 'exists', component: 'scatter-gather', where: { timeout: { gte: 1, lte: 2000 } } },
    },
    {
      label: 'The calls inside the gather have their own response timeouts',
      rule: { type: 'inside', component: 'http-request', within: 'scatter-gather', where: { responseTimeout: { gte: 1, lte: 2000 } }, min: 2 },
    },
    {
      label: 'Both optional routes catch their own errors (Try + On Error Continue) inside the gather',
      rule: { type: 'inside', component: 'on-error-continue', within: 'scatter-gather', min: 2 },
    },
    {
      label: 'Route results are merged with DataWeave after the gather, not inside it',
      rule: { type: 'before', first: 'scatter-gather', then: 'transform', outside: true },
    },
    {
      label: 'A mandatory (Salesforce) failure surfacing as MULE:COMPOSITE_ROUTING returns 502',
      rule: handlerStatus('COMPOSITE_ROUTING', '502'),
    },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'GET', path: '/salesforce/accounts/{id}', latencyMs: 300, respond: { status: 200, body: { Id: '0015g00000XyZAB', Name: 'Northwind Traders', Segment__c: 'Gold' } } },
        {
          method: 'GET',
          path: '/sap/customers/{id}/finance',
          latencyMs: 800,
          respond: { status: 200, body: { invoices: [{ number: '9000123', amount: 1840.5, dueDate: '2026-11-30' }], creditLimit: 25000 } },
        },
        {
          method: 'GET',
          path: '/zendesk/users/{id}/tickets',
          latencyMs: 500,
          respond: { status: 200, body: { tickets: [{ id: 48211, subject: 'Late delivery', status: 'open' }] } },
        },
      ],
    },
    tests: [
      {
        name: 'All three systems answer',
        about: 'The profile, invoices and tickets come back together within the 2 second SLA.',
        trigger: { http: { method: 'GET', path: '/customers/0015g00000XyZAB/360' } },
        expect: { status: 200, bodyHas: { customerId: '0015g00000XyZAB' }, maxMs: 2000 },
      },
      {
        name: 'SAP hangs',
        about: 'SAP takes 30 seconds. The agent still gets the profile and tickets within 2 seconds.',
        trigger: { http: { method: 'GET', path: '/customers/0015g00000XyZAB/360' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sap/customers/{id}/finance', latencyMs: 30000, respond: { status: 200, body: { invoices: [], creditLimit: 0 } } }] } },
        expect: { status: 200, bodyHas: { customerId: '0015g00000XyZAB' }, maxMs: 2000 },
      },
      {
        name: 'Zendesk returns 500',
        about: 'The ticket system fails. The call still succeeds with the profile and finance data.',
        trigger: { http: { method: 'GET', path: '/customers/0015g00000XyZAB/360' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/zendesk/users/{id}/tickets', respond: { status: 500, body: { error: 'Internal Server Error' } } }] } },
        expect: { status: 200, bodyHas: { customerId: '0015g00000XyZAB' }, maxMs: 2000 },
      },
      {
        name: 'Salesforce is down',
        about: 'The mandatory profile cannot be read, so the answer is 502.',
        trigger: { http: { method: 'GET', path: '/customers/0015g00000XyZAB/360' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/salesforce/accounts/{id}', respond: { fault: 'CONNECTIVITY' } }] } },
        expect: { status: 502, bodyLacks: { customerId: '0015g00000XyZAB' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'customer-360',
      source('http-listener', { path: '/customers/{id}/360', allowedMethods: 'GET' }),
      [
        router('scatter-gather', { timeout: 1800, maxConcurrency: 3 }, [
          route({}, [
            step('http-request', { method: 'GET', path: '/salesforce/accounts/{id}', responseTimeout: 1500 }),
          ]),
          route({}, [
            scope('try', {}, [
              step('http-request', { method: 'GET', path: '/sap/customers/{id}/finance', responseTimeout: 1500 }),
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\n{ available: true, invoices: payload.invoices, creditLimit: payload.creditLimit }',
              }),
            ], {
              errorHandlers: [
                handler('on-error-continue', { type: 'HTTP:TIMEOUT, HTTP:CONNECTIVITY, HTTP:SERVICE_UNAVAILABLE, HTTP:INTERNAL_SERVER_ERROR' }, [
                  step('set-payload', { value: '#[output application/json --- { available: false, reason: error.errorType.identifier }]' }),
                ]),
              ],
            }),
          ]),
          route({}, [
            scope('try', {}, [
              step('http-request', { method: 'GET', path: '/zendesk/users/{id}/tickets?limit=10', responseTimeout: 1200 }),
              step('transform', {
                script: '%dw 2.0\noutput application/java\n---\n{ available: true, tickets: payload.tickets }',
              }),
            ], {
              errorHandlers: [
                handler('on-error-continue', { type: 'ANY' }, [
                  step('set-payload', { value: '#[output application/json --- { available: false, reason: error.errorType.identifier }]' }),
                ]),
              ],
            }),
          ]),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\nvar sf = payload."0".payload\nvar sap = payload."1".payload\nvar zd = payload."2".payload\n---\n{\n  customerId: sf.Id,\n  profile: { name: sf.Name, segment: sf.Segment__c },\n  finance: if (sap.available == false) { available: false } else { available: true, invoices: sap.invoices, creditLimit: sap.creditLimit },\n  tickets: if (zd.available == false) { available: false } else { available: true, items: zd.tickets },\n  partial: (sap.available == false) or (zd.available == false)\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'MULE:COMPOSITE_ROUTING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '502' }),
          step('transform', {
            script: '%dw 2.0\noutput application/json\n---\n{ code: "UPSTREAM_PROFILE_UNAVAILABLE", correlationId: correlationId }',
          }),
        ]),
      ],
    ),
  ),
  description: `
A **Customer 360 Process API** (\`GET /customers/{id}/360\`) serves the call-centre UI. It must combine:

| System | Call | Data | Typical latency | Notes |
|---|---|---|---|---|
| Salesforce | \`GET /salesforce/accounts/{id}\` | profile, segment | 300 ms | **mandatory** |
| SAP (via SAP System API) | \`GET /sap/customers/{id}/finance\` | open invoices, credit limit | 800 ms, p99 4 s | optional |
| Zendesk | \`GET /zendesk/users/{id}/tickets\` | last 10 tickets | 500 ms | optional, flaky |

**SLA:** respond within **2 seconds** with JSON that includes \`customerId\` (the Salesforce \`Id\`). If an optional system is slow or down, return what you have and flag the missing section. If Salesforce fails, return **502**.

**What each system sends back**
- Salesforce: \`{ "Id": "0015g00000XyZAB", "Name": "Northwind Traders", "Segment__c": "Gold" }\`
- SAP: \`{ "invoices": [ { "number": "9000123", "amount": 1840.5, "dueDate": "2026-11-30" } ], "creditLimit": 25000 }\`
- Zendesk: \`{ "tickets": [ { "id": 48211, "subject": "Late delivery", "status": "open" } ] }\`

**What failures look like**
- SAP hangs for 30 s: the HTTP Request raises \`HTTP:TIMEOUT\` once its response timeout passes.
- Zendesk answers 500: the HTTP Request raises \`HTTP:INTERNAL_SERVER_ERROR\`.
- Salesforce cannot be reached: the HTTP Request raises \`HTTP:CONNECTIVITY\`.
- An error that a route does not catch makes the Scatter-Gather raise \`MULE:COMPOSITE_ROUTING\` after all routes finish. Set the status in an On Error Propagate with the variable \`httpStatus\`. The HTTP Listener answers with \`vars.httpStatus\`.

The first version used a Scatter-Gather with no timeouts; when SAP hangs, agents wait 30+ seconds, and when Zendesk returns 500, the whole call fails.

**Design the flow:**
- Scatter-Gather configuration (timeout, concurrency) and per-route HTTP timeouts.
- What is the Scatter-Gather output and how do you merge it with DataWeave?
- How does Scatter-Gather report errors, and how do you get partial results instead of a total failure?
- How do you distinguish "mandatory failed" from "optional failed"?
`,
  answerTemplate: `## Scatter-Gather configuration

## Route design

## Output and merge

## Error handling and partial results

## Response codes
`,
  keyPoints: [
    'Scatter-Gather runs routes concurrently; the result is an object keyed by route index ("0", "1", "2") with a Message (payload + attributes) per route.',
    'If any route fails (including timeouts), Scatter-Gather raises MULE:COMPOSITE_ROUTING after all routes finish, with successes and failures in the error.',
    'Per-route HTTP Request responseTimeout (e.g. ~1.5 s) plus a Scatter-Gather timeout keep the overall call within the 2 s SLA.',
    'Optional routes wrapped in Try + On Error Continue return a fallback ({ available: false }) so the gather succeeds with partial data.',
    'Mandatory Salesforce route is not wrapped (or re-raises), so its failure propagates and is mapped to 502.',
    'DataWeave merges payload."0".payload, payload."1".payload, payload."2".payload into one response with section-level status flags.',
  ],
  solution: `
**Configuration**
- \`<scatter-gather timeout="1800" maxConcurrency="3">\`. The gather-level timeout caps total wait; routes that don't finish in time are treated as failed.
- Each HTTP Request gets its own \`responseTimeout\` (Salesforce 1500 ms, SAP 1500 ms, Zendesk 1200 ms), so a slow system fails fast *inside* its route where it can be handled.

**Routes**
- **Route 0, Salesforce (mandatory):** query the Account/Contact; no Try, so errors propagate.
- **Route 1, SAP (optional):** Try { HTTP Request to SAP System API → Transform } On Error Continue (\`HTTP:TIMEOUT\`, \`HTTP:CONNECTIVITY\`, \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:INTERNAL_SERVER_ERROR\`, or \`ANY\`) → payload \`{ available: false, reason: error.errorType.identifier }\`.
- **Route 2, Zendesk (optional):** same Try/On Error Continue pattern.

**Output and merge**
The gather's payload is an object: \`{ "0": Message, "1": Message, "2": Message }\`. DataWeave:

\`\`\`
%dw 2.0
output application/json
var sf = payload."0".payload
var sap = payload."1".payload
var zd = payload."2".payload
---
{
  customerId: sf.Id,
  profile: { name: sf.Name, segment: sf.Segment__c },
  finance: if (sap.available == false) { available: false } else { available: true, invoices: sap.invoices, creditLimit: sap.creditLimit },
  tickets: if (zd.available == false) { available: false } else { available: true, items: zd.tickets },
  partial: (sap.available == false) or (zd.available == false)
}
\`\`\`

**Errors:** if any route still fails, Scatter-Gather raises \`MULE:COMPOSITE_ROUTING\`; the error message contains the successful results and the failures per route. With optional routes self-handled, the only way to reach this is a Salesforce failure (or the gather timeout hitting route 0).

**Response codes**
- Flow error handler: On Error Propagate for \`MULE:COMPOSITE_ROUTING\` → 502 with \`{ code: "UPSTREAM_PROFILE_UNAVAILABLE", correlationId }\`.
- Partial data → **200** with \`partial: true\` (the UI greys out missing sections). Some teams prefer 206, but 206 is meant for range requests, so 200 + flag is the common choice.
- Consider caching the Salesforce profile briefly (Cache scope / Object Store) to reduce SLA risk.
`,
}
