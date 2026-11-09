import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-082',
  category: 'use-cases',
  title: 'Click and Collect through Parcel Lockers',
  level: 'INTERMEDIATE',
  tags: ['click-and-collect', 'retail', 'webhooks', 'caching', 'notifications', 'refunds', 'api-led'],
  estMinutes: 25,
  diagram: {
    task: 'draw the locker design: web and app through a checkout Experience API, the locker search with a cache, the locker provider and the OMS behind System APIs, provider webhooks into a queue, the pickup code to the customer, and refunds for parcels not collected.',
    checks: [
      { label: 'Web and app call the checkout Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Locker searches are cached to stay under the provider rate limit', rule: { type: 'edge', from: ['process-api', 'experience-api', 'system-api'], to: 'cache' } },
      { label: 'The locker provider is called only through a System API', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'Locker events arrive on a webhook API you expose', rule: { type: 'edge', from: 'external-api', to: ['experience-api', 'api-gateway'] } },
      { label: 'Locker events are queued before processing', rule: { type: 'path', from: 'external-api', via: ['queue', 'cloud-queue'], to: 'process-api' } },
      { label: 'The customer receives the pickup code', rule: { type: 'path', from: 'external-api', to: 'notification' } },
      { label: 'Refunds for parcels not collected go through a System API', rule: { type: 'only-via', target: 'payment', from: 'system-api' } },
      { label: 'Locker events never reach the OMS or the customer in one sync chain', rule: { type: 'no-path', from: 'external-api', to: ['erp', 'notification'], kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website checkout'],
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-checkout'],
        prc: ['process-api', 'prc-locker-delivery'],
        cache: ['cache', 'Locker search cache (5 min, by postcode)'],
        slk: ['system-api', 'sys-locker-provider'],
        lk: ['external-api', 'Parcel locker provider'],
        soms: ['system-api', 'sys-oms'],
        oms: ['erp', 'OMS'],
        wh: ['experience-api', 'exp-locker-webhooks'],
        q: ['queue', 'locker-events'],
        ev: ['process-api', 'prc-locker-events'],
        snot: ['system-api', 'sys-notifications'],
        msg: ['notification', 'SMS and email'],
        spay: ['system-api', 'sys-payments'],
        pay: ['payment', 'Payment provider'],
      },
      [
        'web -> exp', 'mob -> exp', 'exp -> prc', 'prc -> cache', 'prc -> slk', 'slk -> lk', 'prc -> soms', 'soms -> oms',
        'lk -> wh', 'wh ~> q', 'q ~> ev', 'ev -> soms', 'ev -> snot', 'snot -> msg', 'ev -> spay', 'spay -> pay',
      ],
    ),
  },
  description: `
An online book and electronics retailer adds **parcel lockers** as a delivery option. A locker company runs **1,200 lockers** across the country.

How it works:
1. At checkout the customer enters a postcode and sees the nearest lockers with a free compartment.
2. The retailer **reserves a compartment** with the provider when the order is placed.
3. The DC ships the parcel to the locker. When the courier puts it in, the provider sends a **webhook** with a **pickup code**.
4. The customer gets the code by **SMS and email**. A reminder goes out after **48 hours**.
5. Not collected within **72 hours**: the provider takes the parcel back (another webhook) and the retailer **refunds** the customer.

Facts:
- The provider API: search lockers by postcode (200 ms), reserve, cancel. Limit **20 calls a second** for the retailer.
- Checkout traffic peaks at **150 locker searches a second** on Black Friday.
- Provider webhooks are signed and retried for 24 hours. Events: delivered_to_locker, collected, expired, returned.
- About **9,000 locker orders a day** at peak.

**Questions:**
1. How do you show lockers at checkout without breaking the provider limit?
2. When and how do you reserve the compartment?
3. How do locker events reach the OMS and the customer?
4. What happens when a parcel is not collected?
`,
  answerTemplate: `## Locker search

## Reservation at order

## Locker events

## Pickup code and reminders

## Expiry and refund
`,
  keyPoints: [
    'Locker search results are cached by postcode area for 5 minutes, so 150 searches a second become a few provider calls.',
    'The compartment is reserved once at order placement; a failed reservation offers another locker or home delivery.',
    'Provider webhooks land on exp-locker-webhooks, which checks the signature and queues them.',
    'prc-locker-events updates the OMS, sends the pickup code by SMS and email, and schedules the 48 hour reminder.',
    'An expired event triggers a refund through sys-payments with the order ID as idempotency key.',
  ],
  solution: `
**Locker search.** exp-checkout calls prc-locker-delivery with the postcode. The Process API rounds it to the postcode district and looks in a **cache** first (5 minute TTL). On a miss it calls sys-locker-provider. Black Friday traffic hits a few hundred districts, so 150 searches a second become one or two provider calls a second. The page says "availability is confirmed when you order", because the cache can be up to 5 minutes old.

**Reservation.** When the order is placed, prc-locker-delivery reserves the compartment through sys-locker-provider, then creates the order in the OMS with the locker ID and reservation ID. If the locker is full, the customer is offered the next nearest locker or home delivery. If the OMS call fails, the reservation is cancelled.

**Locker events.** The provider calls **exp-locker-webhooks**. It checks the signature, publishes the event to **locker-events** and replies 200. prc-locker-events consumes the queue:
- delivered_to_locker: update the OMS status, send the pickup code;
- collected: complete the order in the OMS;
- expired: start the refund;
- returned: tell the OMS the parcel is back with the provider for return to the DC.
Events carry an event ID; processed IDs are kept for 7 days, so a retried webhook does nothing twice.

**Pickup code and reminders.** sys-notifications sends the code by SMS and email, with the locker address and opening hours. The reminder at 48 hours is a scheduled check on orders still in "in locker" status.

**Expiry and refund.** On expired, prc-locker-events calls sys-payments to refund the order total. The order ID is the idempotency key, so a retried event never refunds twice. The customer gets an email saying the refund is on its way.
`,
  followUps: [
    { q: 'Why cache by postcode district and not by full postcode?', a: 'Full postcodes are too many to repeat often, so the hit rate would be low. Districts are few and nearby lockers are the same for a whole district.' },
    { q: 'What if the webhook API is down for an hour?', a: 'The provider retries for 24 hours, so events arrive late but arrive. Customers get their code late, so the webhook API runs with two replicas.' },
    { q: 'Why does the customer not get the code at order time?', a: 'The code only exists when the courier fills the compartment. Sending earlier would send customers to an empty locker.' },
  ],
}
