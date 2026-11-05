import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-048',
  category: 'use-cases',
  title: 'API-Led: "Where Is My Order?" for Web, Mobile and Call Centre',
  level: 'BEGINNER',
  tags: ['api-led', 'application-network', 'retail', 'order-tracking', 'decomposition'],
  estMinutes: 20,
  diagram: {
    task: 'draw the API-led application network for "where is my order?": the three channels and their Experience APIs, the order-status Process API, one System API per back end, and how the carrier rate limit is protected.',
    checks: [
      { label: 'Website, mobile app and call-centre desktop each call an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app', 'internal-app'], min: 3, edgeTo: 'experience-api' } },
      { label: 'Each channel has its own Experience API (agent fields only in the agent one)', rule: { type: 'node', match: 'experience-api', min: 3 } },
      { label: 'Every Experience API goes through the Process API', rule: { type: 'each', of: 'experience-api', edgeTo: 'process-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
      { label: 'The Process API composes OMS, WMS and carrier System APIs', rule: { type: 'edge', from: 'process-api', to: 'system-api', min: 3 } },
      { label: 'OMS, WMS and the carrier aggregator are reached only through System APIs', rule: { type: 'only-via', target: ['erp', 'legacy', 'saas', 'external-api', 'database'], from: 'system-api' } },
      { label: 'Tracking responses are cached to respect the 20 req/s carrier limit', rule: { type: 'edge', from: ['system-api', 'process-api'], to: 'cache' } },
      { label: 'The agent desktop reaches the carrier data end to end', rule: { type: 'path', from: 'internal-app', to: ['external-api', 'saas'] } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'E-commerce website'],
        mob: ['mobile-app', 'Mobile app'],
        agent: ['internal-app', 'Call-centre desktop (Service Cloud)'],
        ew: ['experience-api', 'exp-web-orders'],
        em: ['experience-api', 'exp-mobile-orders'],
        ea: ['experience-api', 'exp-agent-orders'],
        prc: ['process-api', 'prc-order-status'],
        soms: ['system-api', 'sys-oms-orders'],
        swms: ['system-api', 'sys-wms-shipments'],
        scar: ['system-api', 'sys-carrier-tracking'],
        cache: ['cache', 'Tracking cache (TTL 5–10 min)'],
        oms: ['erp', 'Order management system'],
        wms: ['legacy', 'WMS (SOAP)'],
        car: ['external-api', 'Carrier aggregator (20 req/s)'],
      },
      [
        'web -> ew', 'mob -> em', 'agent -> ea', 'ew -> prc', 'em -> prc', 'ea -> prc',
        'prc -> soms', 'prc -> swms', 'prc -> scar', 'scar -> cache', 'soms -> oms', 'swms -> wms', 'scar -> car',
      ],
    ),
  },
  description: `
A fashion retailer receives ~40% of its contact-centre calls asking **"where is my order?" (WISMO)**. It wants one order-status capability used by three channels.

| Channel | Users | Needs |
|---|---|---|
| **E-commerce website** (React SPA) | Logged-in customers, or guests with order number + email | Order status, items, delivery estimate, tracking link |
| **Mobile app** | Logged-in customers | Same plus push-friendly compact status |
| **Call-centre desktop** (Salesforce Service Cloud) | 300 agents | Any customer's order, plus internal details (warehouse, carrier events, refund status) |

| System | Holds | Interface |
|---|---|---|
| **Order management system (OMS)**, Manhattan or similar | Orders, lines, fulfilment status | REST |
| **Warehouse management system (WMS)** | Pick/pack/ship status per shipment | SOAP |
| **Carrier aggregator** (e.g. a multi-carrier tracking SaaS) | Carrier tracking events | REST, rate-limited 20 req/s |

Facts:
- ~15,000 WISMO lookups/hour at peak (Black Friday 3×).
- Target **< 1 s p95** for web and app.
- Guests must not be able to enumerate other people's orders.
- Agents need extra fields customers must **not** see.

**Questions:**
1. Name the APIs per layer with resources.
2. Show the sequence for a guest lookup on the website.
3. Explain how the agent-only fields are handled.
`,
  answerTemplate: `## Experience APIs

## Process APIs

## System APIs

## Interactions & sequence (guest lookup)

## Agent-only data

## Reuse

## NFRs
`,
  keyPoints: [
    'System APIs per back end: sys-oms-orders, sys-wms-shipments, sys-carrier-tracking — each hiding protocol (REST/SOAP) and vendor model.',
    'One Process API prc-order-status composes the order, shipments and tracking events into a canonical OrderStatus model.',
    'Experience APIs per channel: exp-web-orders, exp-mobile-orders, exp-agent-orders; the agent one exposes internal fields, customer ones filter them.',
    'Guest lookup requires order number + email match (verified in the Process API) plus rate limiting to stop enumeration.',
    'Tracking events are cached (minutes) to respect the carrier aggregator\'s rate limit and survive Black Friday.',
  ],
  solution: `
**API inventory**

| Layer | API | Key resources | Responsibility | Consumers |
|---|---|---|---|---|
| Experience | **exp-web-orders** | \`GET /orders/{orderNo}?email=\` (guest), \`GET /me/orders\` | Web payload, guest verification inputs | Website |
| Experience | **exp-mobile-orders** | \`GET /me/orders\`, \`GET /me/orders/{orderNo}\` | Compact status for app/push | Mobile app |
| Experience | **exp-agent-orders** | \`GET /customers/{id}/orders\`, \`GET /orders/{orderNo}\` | Full detail incl. warehouse, carrier raw events, refund state | Service Cloud (via Named Credential) |
| Process | **prc-order-status** | \`GET /orders/{orderNo}/status\`, \`GET /customers/{id}/orders\` | Compose OMS + WMS + carrier into canonical OrderStatus, derive "customer-friendly" status and ETA, ownership/guest check | All three Experience APIs |
| System | **sys-oms-orders** | \`GET /orders/{orderNo}\`, \`GET /orders?customerId=\` | Wrap OMS REST | prc-order-status, later returns/refunds |
| System | **sys-wms-shipments** | \`GET /shipments?orderNo=\` | Wrap WMS SOAP, return JSON | prc-order-status |
| System | **sys-carrier-tracking** | \`GET /trackings/{trackingNo}\` | Wrap carrier aggregator, throttle to 20 req/s, cache | prc-order-status |

\`\`\`
 [Website]        [Mobile app]       [Service Cloud]
     |                 |                    |
 exp-web-orders  exp-mobile-orders   exp-agent-orders     Experience
     |                 |                    |
     +-----------------+--------------------+
                       v
               prc-order-status                           Process
          /            |              \\
 sys-oms-orders  sys-wms-shipments  sys-carrier-tracking  System
      |                |                  |
    [OMS]            [WMS]        [Carrier aggregator]
\`\`\`

**Sequence — guest lookup on the website**
1. Browser → exp-web-orders \`GET /orders/A12345?email=...\` (client ID enforcement + Rate Limiting per IP/client).
2. exp-web-orders → prc-order-status \`GET /orders/A12345/status\` passing the email as a verification header/parameter.
3. prc-order-status → sys-oms-orders: get the order. If the order's email doesn't match → return **404** (not 403, to avoid confirming existence).
4. In parallel: sys-wms-shipments (shipments + tracking numbers) and then sys-carrier-tracking per tracking number.
5. prc-order-status derives a single customer status (e.g. *Dispatched — arriving Thursday*) and returns canonical OrderStatus with an \`internal\` section.
6. exp-web-orders maps to the web model and **drops** the internal section.

**Agent-only data.** The Process API returns one canonical model including internal fields; each Experience API decides what to expose. exp-agent-orders is only callable by the Service Cloud client application (client ID + OAuth scope \`orders:agent\`), so customer channels can never reach it.

**Reuse.** sys-oms-orders becomes the foundation for the upcoming **returns** project; sys-carrier-tracking for proactive delivery notifications. Publishing all of them in Exchange with RAML/OAS specs and examples is what makes that reuse happen.

**Error handling and NFRs**
- Carrier aggregator down → return OMS/WMS status with \`trackingAvailable: false\`.
- Cache tracking responses (Object Store, TTL ~5–10 min) and OMS order headers (TTL ~1 min) for Black Friday peaks.
- Guest endpoint: rate limit per IP and lock out after repeated mismatches.
- Correlation ID propagated through all three layers for tracing a failing lookup.
`,
  followUps: [
    { q: 'Why return 404 rather than 403 when the email does not match?', a: 'A 403 confirms that the order number exists, which helps attackers enumerate orders. A 404 reveals nothing.' },
    { q: 'Could Service Cloud call prc-order-status directly instead of an Experience API?', a: 'It is sometimes accepted for internal consumers, but a dedicated Experience API keeps Salesforce-specific shaping and security out of the Process API and lets the agent screen change independently.' },
    { q: 'Where would proactive "your parcel is delayed" notifications fit?', a: 'An event-driven process (carrier webhooks into a Process API or Anypoint MQ) reusing sys-carrier-tracking and sys-oms-orders, publishing to a notification System API — no change to the WISMO Experience APIs.' },
  ],
}
