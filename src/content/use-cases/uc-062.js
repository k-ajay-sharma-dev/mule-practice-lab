import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-062',
  category: 'use-cases',
  title: 'Carrier Tracking Events into the Customer App',
  level: 'BEGINNER',
  tags: ['supply-chain', 'retail', 'carrier', 'webhooks', 'activemq', 'oracle', 'notifications', 'canonical-model'],
  estMinutes: 20,
  diagram: {
    task: 'draw how carrier webhooks become tracking updates: the gateway and webhook Experience API, an ActiveMQ topic, the tracking Process API, the Oracle tracking store behind a System API, customer notifications, and the mobile app reading status.',
    checks: [
      { label: 'Carrier webhooks pass through the gateway before reaching an Experience API', rule: { type: 'path', from: 'partner', to: 'experience-api', via: 'api-gateway' } },
      { label: 'The webhook API publishes events asynchronously instead of processing inline', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'A Process API consumes the tracking events', rule: { type: 'edge', from: ['queue', 'topic', 'event-stream'], to: 'process-api', kind: 'async' } },
      { label: 'The Oracle tracking store is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
      { label: 'Customers are notified through a notification System API', rule: { type: 'only-via', target: 'notification', from: 'system-api' } },
      { label: 'The mobile app calls an Experience API', rule: { type: 'each', of: 'mobile-app', edgeTo: 'experience-api' } },
      { label: 'Experience APIs never call System APIs directly', rule: { type: 'no-edge', from: 'experience-api', to: 'system-api' } },
    ],
    reference: diagram(
      {
        car: ['partner', 'Carriers (5 webhooks)'],
        mob: ['mobile-app', 'Customer app'],
        gw: ['api-gateway', 'Gateway (HMAC / IP allow-list)'],
        exph: ['experience-api', 'exp-carrier-webhooks'],
        expm: ['experience-api', 'exp-mobile-tracking'],
        t: ['topic', 'TRACKING.EVENTS (ActiveMQ)'],
        prc: ['process-api', 'prc-tracking-events'],
        prcq: ['process-api', 'prc-shipment-status'],
        stk: ['system-api', 'sys-tracking-store'],
        snot: ['system-api', 'sys-notifications'],
        db: ['database', 'Oracle SHIPMENT_TRACKING'],
        push: ['notification', 'Push / SMS provider'],
      },
      [
        'car -> gw', 'gw -> exph', 'exph ~> t', 't ~> prc', 'prc -> stk', 'prc -> snot', 'stk -> db', 'snot -> push',
        'mob -> expm', 'expm -> prcq', 'prcq -> stk',
      ],
    ),
  },
  description: `
An online furniture retailer ships through **five carriers** (two parcel, three two-man furniture carriers). Each carrier can call a **webhook** on every scan, but each uses its own JSON format and status codes ("OFD", "Out for delivery", "DLV-ATT"…).

The business wants:
- the **customer app** to show a simple timeline: *Shipped → In transit → Out for delivery → Delivered* (or *Delivery problem*), and
- a **push notification** when the parcel is out for delivery or there is a problem.

Facts:
- ~40,000 tracking events/day, bursts of **50 events/second** in the morning when vans are loaded.
- Carriers retry a webhook if they do not get a **2xx within 5 seconds**, and the same event may arrive twice.
- Events can arrive out of order (a "Delivered" before the last "In transit").
- Orders and shipments are already in an **Oracle** database owned by the order team.

**Questions:** describe the APIs, how you normalise statuses, how you deal with duplicates and out-of-order events, and how the app gets the status.
`,
  answerTemplate: `## Receiving webhooks

## Normalising carrier statuses

## Storing and ordering events

## Notifications

## App read path
`,
  keyPoints: [
    'One webhook Experience API behind the gateway: validate signature/allow-list, publish to an ActiveMQ topic and return 202 within milliseconds.',
    'A per-carrier mapping table (DataWeave lookup) converts carrier codes into a small canonical status set.',
    'Events are stored with the carrier event timestamp; the "current status" only moves forward, so a late In-transit never overwrites Delivered.',
    'Duplicates are ignored using a unique key (carrier + tracking number + event code + event time).',
    'Notifications are sent only on meaningful status changes, through a notification System API.',
  ],
  solution: `
\`\`\`
 Carriers -> Gateway -> exp-carrier-webhooks ~> [TRACKING.EVENTS] ~> prc-tracking-events -> sys-tracking-store -> Oracle
                                                                                     \\-> sys-notifications -> push/SMS
 Customer app -> exp-mobile-tracking -> prc-shipment-status -> sys-tracking-store
\`\`\`

**Receiving.** API Manager policies on the gateway check the carrier's IP allow-list and HMAC header. The Experience API validates the payload is JSON, adds the carrier name and a correlation ID, \`jms:publish\`es it to the topic and returns **202**. No database work happens inline, so the 5-second carrier timeout is never at risk.

**Normalising.** The Process API (a durable subscriber — or a queue fed by a virtual topic) maps each carrier event with a lookup table: \`(carrier, code) → canonicalStatus\`, e.g. \`OFD\` and \`Out for delivery\` → OUT_FOR_DELIVERY. Unknown codes map to IN_TRANSIT and are logged for the team to add.

**Storing and ordering.**
- Insert into \`SHIPMENT_TRACKING_EVENT\` with a unique key on (carrier, tracking number, event code, event time) — a duplicate raises a constraint error that is caught and ignored.
- Update the shipment's current status only if the new status ranks higher (or has a later event time); Delivered is final.
- Use bind parameters in every \`db:insert\` / \`db:update\` and store event time as TIMESTAMP WITH TIME ZONE — carriers send different time zones.

**Notifications.** If the current status changed to OUT_FOR_DELIVERY, DELIVERED or EXCEPTION, the Process API calls **sys-notifications** with the template and customer ID; the System API hides the push/SMS provider.

**App read path.** The app calls \`GET /orders/{id}/tracking\` on exp-mobile-tracking → prc-shipment-status → sys-tracking-store, which returns the timeline. Short caching (30 s) protects Oracle.

**Errors.** Database down → the listener rolls back and the message is redelivered; after the limit it lands in the DLQ. Bursts of 50/s are absorbed by the topic/queue.
`,
  followUps: [
    { q: 'Why return 202 rather than 200 from the webhook?', a: '202 Accepted says "received, will process later", which is exactly what happens. Either is fine for most carriers — what matters is answering fast.' },
    { q: 'Why an ActiveMQ topic rather than a queue?', a: 'Other consumers (analytics, the customer-service tool) will want the same events. A topic — or a virtual topic with one queue per consumer — lets them subscribe without changing the publisher.' },
    { q: 'What if a carrier cannot send webhooks?', a: 'Add a scheduled poller that calls that carrier\'s tracking API and publishes the same canonical event to the topic — the rest of the flow is unchanged.' },
  ],
}
