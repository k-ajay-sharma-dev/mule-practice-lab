import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-074',
  category: 'case-studies',
  title: 'Online Grocer Dispatching Orders to Its Own Fleet and Two Last-Mile Delivery Partners',
  level: 'ADVANCED',
  tags: ['e-commerce', 'retail', 'logistics', 'partners', 'webhooks', 'canonical-model', 'events', 'tms'],
  estMinutes: 55,
  diagram: {
    task: 'draw the dispatch and tracking design: orders ready for dispatch queued for one dispatch Process API that picks a carrier from a rules store and books through a System API per carrier; carrier status webhooks entering through the gateway into an Experience API that queues them; a status Process API that normalises them, updates a tracking store and publishes one status event for notifications; and the customer app reading tracking without touching the carriers.',
    checks: [
      { label: 'Orders ready for dispatch reach the dispatch Process API through a queue', rule: { type: 'path', from: 'saas', to: { type: 'process-api', label: 'dispatch' }, via: 'queue' } },
      { label: 'The dispatch Process API picks the carrier from a rules store', rule: { type: 'edge', from: { type: 'process-api', label: 'dispatch' }, to: { type: ['database', 'cache'], label: ['rule', 'config', 'zone'] } } },
      { label: 'All three carriers are drawn: two partners and the own fleet TMS', rule: { type: 'node', match: ['external-api', 'tms'], min: 3 } },
      { label: 'No System API talks to more than one carrier', rule: { type: 'each', of: 'system-api', edgeTo: ['external-api', 'tms'], count: 0, max: 1 } },
      { label: 'Carriers are reached only through System APIs', rule: { type: 'only-via', target: ['external-api', 'tms'], from: 'system-api' } },
      { label: 'Carrier webhooks enter through the API gateway', rule: { type: 'each', of: 'partner', edgeTo: 'api-gateway' } },
      { label: 'The webhook Experience API acknowledges and queues each status update', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      { label: 'A status Process API normalises updates into one status event', rule: { type: 'path', from: 'queue', to: 'topic', via: { type: 'process-api', label: 'status' } } },
      { label: 'Customer notifications are driven by the status event', rule: { type: 'path', from: 'topic', to: 'notification', via: 'process-api' } },
      { label: 'The customer app never reaches a carrier', rule: { type: 'no-path', from: 'mobile-app', to: ['external-api', 'tms'] } },
      { label: 'The customer app reads delivery status from the tracking store', rule: { type: 'path', from: 'mobile-app', to: 'database', via: 'experience-api' } },
    ],
    reference: diagram(
      {
        oms: ['saas', 'Order management (OMS)'],
        rq: ['queue', 'orders-ready-for-dispatch'],
        pd: ['process-api', 'prc-dispatch'],
        rules: ['database', 'Dispatch rules (zones, costs, SLAs)'],
        sa: ['system-api', 'sys-carrier-a-api'],
        sb: ['system-api', 'sys-carrier-b-api'],
        st: ['system-api', 'sys-fleet-tms-api'],
        ca: ['external-api', 'Carrier A (rapid delivery)'],
        cb: ['external-api', 'Carrier B (rapid delivery)'],
        tms: ['tms', 'Own fleet TMS'],
        cp: ['partner', 'Carrier status webhooks'],
        gw: ['api-gateway', 'API gateway (signature check, IP allowlist)'],
        ewh: ['experience-api', 'exp-carrier-webhooks-api'],
        sq: ['queue', 'carrier-status-raw'],
        ps: ['process-api', 'prc-delivery-status'],
        stk: ['system-api', 'sys-tracking-api'],
        trk: ['database', 'Delivery tracking store'],
        tp: ['topic', 'delivery-status-changed'],
        pn: ['process-api', 'prc-customer-notifications'],
        nt: ['notification', 'Push and SMS'],
        app: ['mobile-app', 'Customer app'],
        etr: ['experience-api', 'exp-order-tracking-api'],
      },
      [
        'oms ~> rq', 'rq ~> pd', 'pd -> rules', 'pd -> sa', 'pd -> sb', 'pd -> st', 'sa -> ca', 'sb -> cb', 'st -> tms',
        'cp -> gw', 'gw -> ewh', 'ewh ~> sq', 'sq ~> ps', 'ps -> stk', 'stk -> trk', 'ps ~> tp', 'tp ~> pn', 'pn -> nt',
        'app -> etr', 'etr -> stk',
      ],
    ),
  },
  description: `
**Context.** An online grocer delivers 60,000 orders a day in 14 cities. Most orders go out in its own vans, planned by a TMS. For rapid deliveries (under 2 hours) and overflow at peak, it now uses two last-mile partners, called Carrier A and Carrier B here.

**How the partners work**
| | Carrier A | Carrier B |
|---|---|---|
| Booking | REST API, quote then book | REST API, book only; rejects outside its zones |
| Status | Webhooks with 14 status codes | Webhooks with 9 status codes, sometimes out of order |
| Limits | 50 bookings per second | 20 bookings per second |
| Security | Signed webhooks (HMAC) | Fixed IP range, API key |

**The own fleet TMS** books into van routes until 22:00 the night before, then only for same-day rescue.

**Problems with the pilot**
- The pilot hard-coded Carrier A in the OMS. Adding Carrier B would mean a second change to the OMS, and the OMS vendor charges for every change.
- Customers saw "Out for delivery" after "Delivered" because Carrier B sends updates out of order.
- On a busy Saturday, Carrier A's webhook calls timed out against a slow tracking update, and Carrier A stopped sending for 2 hours.

**Goals**
- Choose the carrier per order by rules (zone, promised time, cost, partner capacity), changeable by operations without a release.
- One customer-facing tracking status whatever the carrier.
- Add a third partner next year in weeks, not months.

**Your task.** Design the dispatch and delivery tracking integration.
`,
  answerTemplate: `## Dispatch: choosing and booking a carrier

## Carrier adapters (System APIs)

## Receiving carrier webhooks safely

## One canonical delivery status

## Customer tracking and notifications

## Adding a new carrier
`,
  keyPoints: [
    'The OMS publishes orders ready for dispatch to a queue; one dispatch Process API chooses the carrier from a rules store that operations can change.',
    'One System API per carrier hides its booking API, security and limits; adding a carrier means adding a System API and a rule.',
    'Carrier webhooks enter through the gateway, are checked and acknowledged at once, and are queued, so slow processing never times out the carrier.',
    'A status Process API maps each carrier code to a canonical status, ignores out-of-order updates by timestamp, updates the tracking store and publishes one status event.',
    'The customer app reads the tracking store through an Experience API; notifications are driven by the status event.',
  ],
  solution: `
**Dispatch.** The OMS publishes \`orders-ready-for-dispatch\` to a queue (one change to the OMS, made once). \`prc-dispatch\`:
1. reads the order (zone, promised window, basket size)
2. reads the dispatch rules from the rules store, which operations edits in an admin page
3. books through the right System API, falling back to the next carrier if one rejects

The order then gets the carrier and its tracking ID.

**Carrier System APIs.** \`sys-carrier-a-api\`, \`sys-carrier-b-api\` and \`sys-fleet-tms-api\` each take a canonical booking and handle that carrier's format, credentials and rate limits.

**Webhooks.** Carriers call the gateway, which checks the HMAC signature or the source IP. \`exp-carrier-webhooks-api\` answers 200 within 100 ms and puts the raw update on \`carrier-status-raw\`. Slow downstream work can no longer make a carrier stop sending.

**Status.** \`prc-delivery-status\` maps each code to a canonical status: booked, collected, out for delivery, delivered, failed, returned. It keeps the latest event time per delivery and ignores older updates, then updates the tracking store and publishes \`delivery-status-changed\`.

**Customers.** The app calls \`exp-order-tracking-api\`, which reads the tracking store. \`prc-customer-notifications\` sends push and SMS on key status changes.

**New carrier.** Write its System API and its status code map, add it to the rules. No OMS or app change.
`,
  followUps: [
    { q: 'Why acknowledge webhooks before processing them?', a: 'Carriers retry or stop sending when their calls time out. Answering quickly and queuing the update keeps the carrier happy while processing runs at its own pace.' },
    { q: 'How do you handle Carrier B sending updates out of order?', a: 'Store the latest event time per delivery and ignore any update older than it. Also refuse status moves that go backwards, such as delivered back to out for delivery.' },
    { q: 'Why keep the carrier choice out of the OMS?', a: 'Every OMS change costs money and time. Rules in a store that operations edits let the business change carriers without a release.' },
    { q: 'What happens if a carrier rejects a booking?', a: 'The dispatch Process API tries the next carrier allowed by the rules. If none accepts, the order goes to a dead-letter queue and the operations team is alerted.' },
  ],
}
