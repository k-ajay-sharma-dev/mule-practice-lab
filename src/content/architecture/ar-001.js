import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-001',
  category: 'architecture',
  title: 'API-led Design for Order Status',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'layers', 'caching'],
  estMinutes: 30,
  diagram: {
    task: 'draw the application network: both channels, the Experience, Process and System APIs, the backends, and how SAP is protected from load.',
    checks: [
      { label: 'Both the mobile app and the web portal call an Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Experience APIs go through a Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'A Process API orchestrates at least two System APIs (orders and tracking)', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 2 } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'SAP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The carrier API is reached only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Order status is cached to cut SAP calls', rule: { type: 'edge', from: ['process-api', 'system-api', 'experience-api'], to: 'cache' } },
      { label: 'The mobile app gets order status from SAP over sync calls', rule: { type: 'path', from: 'mobile-app', to: 'erp', kind: 'sync' } },
      { label: 'The web portal gets order status from SAP over sync calls', rule: { type: 'path', from: 'web-app', to: 'erp', kind: 'sync' } },
      { label: 'Every System API is called by a Process API', rule: { type: 'each', of: 'system-api', edgeFrom: 'process-api' } },
      { label: 'Every System API connects to its backend', rule: { type: 'each', of: 'system-api', edgeTo: ['erp', 'external-api', 'saas', 'legacy', 'database'] } },
      { label: 'APIs call each other with sync calls. Async work goes through a broker', rule: { type: 'lines', from: ['mobile-app', 'web-app', 'experience-api', 'process-api'], to: ['experience-api', 'process-api', 'system-api'], kind: 'sync' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        web: ['web-app', 'Web portal'],
        em: ['experience-api', 'exp-mobile-api', { vCores: '0.5' }],
        ew: ['experience-api', 'exp-web-api'],
        prc: ['process-api', 'prc-order-status-api', { vCores: '0.5', calls: 'in parallel', onFailure: 'partial answer', timeoutMs: 3000 }],
        cache: ['cache', 'Order status cache (TTL 5 min)'],
        ssap: ['system-api', 'sys-sap-order-api', { rateLimit: 20 }],
        scar: ['system-api', 'sys-carrier-tracking-api'],
        sap: ['erp', 'SAP (orders)'],
        car: ['external-api', 'Carrier REST API'],
      },
      ['mob -> em', 'web -> ew', 'em -> prc', 'ew -> prc', 'prc -> cache', 'prc -> ssap', 'prc -> scar', 'ssap -> sap', 'scar -> car'],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 1500, maxRps: 20 },
        { match: 'external-api', latencyMs: 300 },
      ],
      cache: { hitRatio: 0.8 },
      tests: [
        {
          name: 'Peak traffic from both channels',
          about: 'The mobile app sends 30 order status requests a second and the web portal 20, for ten minutes. SAP must stay under its 20 a second.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 30, to: ['erp', 'external-api'] },
            { name: 'web', from: 'web-app', rps: 20, to: ['erp', 'external-api'] },
          ],
          expect: { answers: [{ minSuccess: 0.99, maxDegraded: 0.01, maxMs: 800 }], peakRps: [{ node: 'erp', max: 20 }], vCores: { max: 2 } },
        },
        {
          name: 'A marketing push brings a spike',
          about: 'For two minutes the mobile app sends 200 requests a second. The rate limit on the SAP System API keeps SAP safe, and most customers still get an answer.',
          traffic: [
            { name: 'mobile', from: 'mobile-app', rps: 30, to: ['erp', 'external-api'], spikes: [{ at: 4, forMin: 2, rps: 200 }] },
            { name: 'web', from: 'web-app', rps: 20, to: ['erp', 'external-api'] },
          ],
          expect: { answers: [{ flow: 'mobile', minSuccess: 0.85 }, { flow: 'web', minSuccess: 0.9 }], peakRps: [{ node: 'erp', max: 20 }] },
        },
        {
          name: 'The carrier API is down',
          about: 'The carrier API fails for the whole run. Customers still see their order status, without the tracking part.',
          traffic: [{ name: 'mobile', from: 'mobile-app', rps: 30, to: ['erp', 'external-api'] }],
          incidents: [{ down: 'external-api' }],
          expect: { answers: [{ minSuccess: 0.99, minDegraded: 0.1 }] },
        },
      ],
    },
  },
  description: `
A retailer wants customers to see order status in a **mobile app** and a **web portal**.

Order data lives in **SAP** (header and lines) and shipment tracking in a **carrier REST API**. SAP calls are slow (1 to 2 s) and the SAP team limits you to 20 requests/second.

At peak the mobile app sends 30 order status requests a second and the web portal 20. Customers check the same orders again and again, and a status a few minutes old is fine. Answers should take under 0.8 s on average. Marketing pushes can bring short spikes of 200 a second. The carrier API has outages, and customers should still see their order status when it is down. The budget for the APIs is 2 vCores.

**Design the APIs** using API-led connectivity:
- Which Experience, Process and System APIs do you create?
- What does each one own?
- How do you protect SAP from load?
`,
  answerTemplate: `## Experience layer

## Process layer

## System layer

## Protecting SAP
`,
  keyPoints: [
    'System APIs: SAP Order System API and Carrier Tracking System API, each hiding its backend.',
    'Process API: Order Status, orchestrating both System APIs and merging the result.',
    'Experience APIs: per channel (mobile, web) or one shared if needs are identical.',
    'Rate limiting / spike control policy on the SAP System API (≤ 20 rps).',
    'Caching (e.g. Object Store with TTL) for order status to cut SAP calls.',
  ],
  solution: `
**System layer**
- *SAP Order System API*: exposes \`GET /orders/{id}\` in a canonical model, hides BAPI/IDoc details.
- *Carrier Tracking System API*: wraps the carrier API, normalises statuses.

**Process layer**
- *Order Status Process API*: calls both in parallel (Scatter-Gather), merges order and shipment status, applies business rules (e.g. "Delivered" overrides "Shipped").

**Experience layer**
- *Mobile Experience API*: lean payload, pagination.
- *Web Experience API*: richer detail. (One shared API is fine if both channels need the same shape.)

**Protecting SAP**
- Apply a **Rate Limiting / Spike Control** policy on the SAP System API (≤ 20 rps), returning 429 upstream.
- **Cache** order status in the Process API (Object Store, TTL ~5 min); delivered orders can be cached longer.
- Timeouts and a circuit breaker / until-successful with backoff so slow SAP calls do not pile up threads.

**When the carrier API is down**
- The Process API answers with the order status and leaves out the tracking (a partial answer), instead of failing the whole request.

**Sizing**
- At 50 requests a second the Process API needs more than 0.1 vCore. 0.5 vCore for it and for the mobile Experience API keeps the total at 1.3 vCores, inside the budget.
`,
}
