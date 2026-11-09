import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-063',
  category: 'case-studies',
  title: 'Furniture Retailer Showing Home Delivery Slots at Checkout',
  level: 'BEGINNER',
  tags: ['retail', 'e-commerce', 'api-led', 'caching', 'tms', 'experience-api', 'system-api'],
  estMinutes: 30,
  diagram: {
    task: 'draw the delivery slot design: the web shop and mobile app calling a checkout Experience API, one delivery-slots Process API that caches answers, and System APIs in front of the route planning TMS and the ERP.',
    checks: [
      { label: 'Both channels call the checkout Experience API (directly or through a gateway)', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: ['experience-api', 'api-gateway'] } },
      { label: 'The Experience API calls one delivery-slots Process API', rule: { type: 'edge', from: 'experience-api', to: { type: 'process-api', label: ['slot', 'deliver'] }, kind: 'sync' } },
      { label: 'Every route from a channel to the TMS passes through the slots Process API', rule: { type: 'no-path', from: ['web-app', 'mobile-app'], to: 'tms', unless: { type: 'process-api', label: ['slot', 'deliver'] } } },
      { label: 'The TMS is reached only through a System API', rule: { type: 'only-via', target: 'tms', from: 'system-api' } },
      { label: 'The ERP is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'Slot answers are cached so the TMS is not asked on every page view', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'The slots Process API gets stock dates from the ERP', rule: { type: 'path', from: { type: 'process-api', label: ['slot', 'deliver'] }, to: 'erp', via: 'system-api' } },
      { label: 'Checkout calls are synchronous request and reply', rule: { type: 'lines', touching: 'experience-api', kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Web shop'],
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-checkout-api'],
        prc: ['process-api', 'prc-delivery-slots'],
        cache: ['cache', 'Slot cache (Object Store, 60 s)'],
        stms: ['system-api', 'sys-tms-api'],
        tms: ['tms', 'Route planning TMS (on-premises)'],
        serp: ['system-api', 'sys-erp-stock-api'],
        erp: ['erp', 'Oracle EBS (stock and lead times)'],
      },
      ['web -> exp', 'mob -> exp', 'exp -> prc', 'prc -> cache', 'prc -> stms', 'stms -> tms', 'prc -> serp', 'serp -> erp'],
    ),
  },
  description: `
**Context.** A furniture retailer sells sofas, beds and wardrobes online and in 85 showrooms. Large items go out on the retailer's own 2-person delivery vans from 6 regional hubs. Today the checkout offers "we will call you to book a date", and 1 in 4 customers phone the contact centre to ask when their order will come.

**Goal.** Show real delivery slots (date and a 4-hour window) at checkout, based on:
- the free capacity on the vans for the customer's postcode, held in the route planning TMS
- the date the items will be in stock at the hub, held in Oracle E-Business Suite (EBS)

**Systems**
| System | Notes |
|---|---|
| Web shop | Adobe Commerce, 1.4 million visits a week |
| Mobile app | Native iOS and Android, 20% of orders |
| Route planning TMS | On-premises, SOAP API, slow (1 to 3 s per call), licence allows 20 calls per second |
| Oracle EBS | Stock on hand and purchase order due dates per hub |

**Numbers.** About 12,000 slot lookups an hour at the evening peak, 3,500 orders a day. The slot list for one postcode and basket changes only a few times an hour.

**Constraints**
- The TMS team will not let the web shop or app call the TMS directly.
- A second sales channel (showroom tablets) is planned for next year and must reuse the same logic.

**Your task.** Design the integration that returns delivery slots at checkout and books the chosen slot.
`,
  answerTemplate: `## APIs and layers

## Where the slot logic lives

## Protecting the TMS (caching, limits)

## Booking the chosen slot

## Errors and fallbacks
`,
  keyPoints: [
    'Channels call one checkout Experience API; the slot logic lives in one delivery-slots Process API that the showroom tablets can reuse later.',
    'System APIs hide the TMS (SOAP, slow, rate limited) and Oracle EBS, so channel code never knows about them.',
    'Cache slot answers by postcode area, hub and stock date for about a minute, so 12,000 lookups an hour become a few hundred TMS calls.',
    'Booking calls the TMS without the cache and handles "slot already taken" by returning fresh slots.',
    'If the TMS is down, fall back to "we will call you" instead of failing checkout.',
  ],
  solution: `
**Layers**
- \`exp-checkout-api\`: one resource \`GET /delivery-slots?postcode=&basketId=\` and \`POST /delivery-bookings\`. Web and mobile use the same API; the tablets will too.
- \`prc-delivery-slots\`: finds the hub for the postcode, asks \`sys-erp-stock-api\` for the earliest date all items are at that hub, then asks \`sys-tms-api\` for free windows from that date.
- \`sys-tms-api\`: turns the TMS SOAP calls into REST and JSON. A rate limit of 20 calls per second protects the licence.
- \`sys-erp-stock-api\`: stock and purchase order due dates by item and hub.

**Caching.** The Process API caches the slot list in Object Store with a 60 second time to live. The key is postcode district + hub + earliest stock date. Many shoppers in the same district share one TMS call.

**Booking.** \`POST /delivery-bookings\` goes straight to the TMS (never from cache). If the TMS says the window is full, the API returns 409 with a fresh slot list so the page can ask the shopper to pick again.

**Fallback.** On a TMS timeout (3 s) the Process API returns an empty list with a flag, and the checkout shows "we will call you to book a date". Orders are never lost because of the TMS.
`,
  followUps: [
    { q: 'Why not let the web shop call the TMS System API directly?', a: 'The slot logic would then live in the web shop and be copied into the app and the tablets. A Process API keeps one copy of the rules and lets you add caching in one place.' },
    { q: 'What do you cache, and for how long?', a: 'The slot list per postcode district, hub and stock date, for about 60 seconds. The booking itself is never served from cache.' },
    { q: 'What happens if two customers book the last slot at the same time?', a: 'The TMS accepts the first booking and rejects the second. The API returns a conflict with fresh slots so the second customer chooses again.' },
    { q: 'How do you protect the TMS licence limit at peak?', a: 'A rate limiting policy on the TMS System API, plus the cache in the Process API, keeps calls under 20 per second.' },
  ],
}
