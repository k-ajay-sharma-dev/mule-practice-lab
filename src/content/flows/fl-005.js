import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-005',
  category: 'flows',
  title: 'Customer 360 with Scatter-Gather and Timeouts',
  level: 'ADVANCED',
  tags: ['scatter-gather', 'aggregation', 'timeout', 'error-handling', 'dataweave'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The 360 endpoint is an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    {
      label: 'Salesforce, SAP and Zendesk are called in parallel (Scatter-Gather with 3 routes)',
      rule: { type: 'routes', component: 'scatter-gather', min: 3 },
    },
    {
      label: 'The Scatter-Gather timeout is set within the 2 s SLA',
      rule: { type: 'exists', component: 'scatter-gather', where: { timeout: { gte: 1, lte: 2000 } } },
    },
    {
      label: 'Optional HTTP calls have their own response timeouts',
      rule: { type: 'exists', component: 'http-request', where: { responseTimeout: { gte: 1, lte: 2000 } }, min: 2 },
    },
    {
      label: 'Optional routes catch their own errors (Try + On Error Continue) inside the gather',
      rule: { type: 'handler', component: 'on-error-continue', within: 'scatter-gather' },
    },
    {
      label: 'Route results are merged with DataWeave after the gather',
      rule: { type: 'before', first: 'scatter-gather', then: 'transform' },
    },
    {
      label: 'A mandatory (Salesforce) failure surfacing as MULE:COMPOSITE_ROUTING returns 502',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'COMPOSITE_ROUTING' } },
    },
  ],
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
                  step('set-payload', { value: '#[{ available: false, reason: error.errorType.identifier }]' }),
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
                  step('set-payload', { value: '#[{ available: false, reason: error.errorType.identifier }]' }),
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

| System | Data | Typical latency | Notes |
|---|---|---|---|
| Salesforce | profile, segment | 300 ms | **mandatory** |
| SAP (via SAP System API) | open invoices, credit limit | 800 ms, p99 4 s | optional |
| Zendesk | last 10 tickets | 500 ms | optional, flaky |

**SLA:** respond within **2 seconds**. If an optional system is slow or down, return what you have and flag the missing section. If Salesforce fails, return **502**.

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
- \`<scatter-gather timeout="1800" maxConcurrency="3">\` — the gather-level timeout caps total wait; routes that don't finish in time are treated as failed.
- Each HTTP Request gets its own \`responseTimeout\` (Salesforce 1500 ms, SAP 1500 ms, Zendesk 1200 ms), so a slow system fails fast *inside* its route where it can be handled.

**Routes**
- **Route 0 – Salesforce (mandatory):** query the Account/Contact; no Try, so errors propagate.
- **Route 1 – SAP (optional):** Try { HTTP Request to SAP System API → Transform } On Error Continue (\`HTTP:TIMEOUT\`, \`HTTP:CONNECTIVITY\`, \`HTTP:SERVICE_UNAVAILABLE\`, \`HTTP:INTERNAL_SERVER_ERROR\`, or \`ANY\`) → payload \`{ available: false, reason: error.errorType.identifier }\`.
- **Route 2 – Zendesk (optional):** same Try/On Error Continue pattern.

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
