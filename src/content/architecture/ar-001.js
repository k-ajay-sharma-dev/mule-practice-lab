import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-001',
  category: 'architecture',
  title: 'API-led Design for Order Status',
  level: 'INTERMEDIATE',
  tags: ['api-led', 'layers', 'caching'],
  estMinutes: 20,
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
      { label: 'The mobile app reaches SAP end to end', rule: { type: 'path', from: 'mobile-app', to: 'erp' } },
      { label: 'Reads and writes to a data store are sync calls', rule: { type: 'lines', to: ['database', 'oracle-db', 'sql-server', 'cache'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        mob: ['mobile-app', 'Mobile app'],
        web: ['web-app', 'Web portal'],
        em: ['experience-api', 'exp-mobile-api'],
        ew: ['experience-api', 'exp-web-api'],
        prc: ['process-api', 'prc-order-status-api'],
        cache: ['cache', 'Order status cache (TTL 5 min)'],
        ssap: ['system-api', 'sys-sap-order-api'],
        scar: ['system-api', 'sys-carrier-tracking-api'],
        sap: ['erp', 'SAP (orders)'],
        car: ['external-api', 'Carrier REST API'],
      },
      ['mob -> em', 'web -> ew', 'em -> prc', 'ew -> prc', 'prc -> cache', 'prc -> ssap', 'prc -> scar', 'ssap -> sap', 'scar -> car'],
    ),
  },
  description: `
A retailer wants customers to see order status in a **mobile app** and a **web portal**.

Order data lives in **SAP** (header and lines) and shipment tracking in a **carrier REST API**. SAP calls are slow (1–2 s) and the SAP team limits you to 20 requests/second.

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
- *SAP Order System API* — exposes \`GET /orders/{id}\` in a canonical model, hides BAPI/IDoc details.
- *Carrier Tracking System API* — wraps the carrier API, normalises statuses.

**Process layer**
- *Order Status Process API* — calls both in parallel (Scatter-Gather), merges order and shipment status, applies business rules (e.g. "Delivered" overrides "Shipped").

**Experience layer**
- *Mobile Experience API* — lean payload, pagination.
- *Web Experience API* — richer detail. (One shared API is fine if both channels need the same shape.)

**Protecting SAP**
- Apply a **Rate Limiting / Spike Control** policy on the SAP System API (≤ 20 rps), returning 429 upstream.
- **Cache** order status in the Process API (Object Store, TTL ~5 min); delivered orders can be cached longer.
- Timeouts and a circuit breaker / until-successful with backoff so slow SAP calls do not pile up threads.
`,
}
