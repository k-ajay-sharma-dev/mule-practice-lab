import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-078',
  category: 'use-cases',
  title: 'Abandoned Cart Reminders with Consent Checks',
  level: 'INTERMEDIATE',
  tags: ['e-commerce', 'event-driven', 'notifications', 'consent', 'scheduler', 'marketing'],
  estMinutes: 25,
  diagram: {
    task: 'draw the reminder design: cart events from web and app through an Experience API onto a queue, the tracker that keeps cart state, order events that close carts, the scan job, the consent check in the CRM, and the email and push providers.',
    checks: [
      { label: 'Website and app send cart changes through an Experience API', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Cart events are published asynchronously', rule: { type: 'edge', from: 'experience-api', to: ['queue', 'topic', 'event-stream'], kind: 'async' } },
      { label: 'The storefront never waits on the CRM or the email service', rule: { type: 'no-path', from: 'experience-api', to: ['crm', 'notification'], kind: 'sync' } },
      { label: 'Order placed events reach the cart tracker, so paid carts are not chased', rule: { type: 'path', from: 'erp', via: ['queue', 'topic', 'event-stream'], to: 'process-api' } },
      { label: 'Cart state (last change, reminders sent) is kept in a store', rule: { type: 'edge', from: 'process-api', to: ['cache', 'database'] } },
      { label: 'A scheduled scan finds carts idle for one hour', rule: { type: 'edge', from: 'batch-job', to: ['cache', 'database'] } },
      { label: 'Consent is checked in the CRM before a reminder', rule: { type: 'path', from: 'batch-job', to: 'crm' } },
      { label: 'CRM and email are reached only through System APIs', rule: { type: 'only-via', target: ['crm', 'notification'], from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        mob: ['mobile-app', 'Mobile app'],
        exp: ['experience-api', 'exp-storefront'],
        oms: ['erp', 'OMS (order placed events)'],
        q: ['queue', 'cart-events (Anypoint MQ)'],
        trk: ['process-api', 'prc-cart-tracker'],
        carts: ['cache', 'Open carts (last change, reminders sent)'],
        job: ['batch-job', 'Reminder scan (every 5 min)'],
        scrm: ['system-api', 'sys-crm-consent'],
        crm: ['crm', 'Salesforce (consent, loyalty tier)'],
        snot: ['system-api', 'sys-notifications'],
        mail: ['notification', 'Email and app push'],
      },
      [
        'web -> exp', 'mob -> exp', 'exp ~> q', 'oms ~> q', 'q ~> trk', 'trk -> carts',
        'job -> carts', 'job -> scrm', 'scrm -> crm', 'job -> snot', 'snot -> mail',
      ],
    ),
  },
  description: `
A fashion retailer sees **60,000 carts a day**, and about **70 % are abandoned**. Marketing wants reminders:
- **1 hour** after the last change to a cart with no order: an email, or an app push if the shopper uses the app and allowed push.
- **24 hours** later, a second email with a **10 % voucher**, for loyalty members only.
- Never remind after the order is placed, even if the order came from another device.
- At most **one reminder per shopper every 3 days**, and no sends between **21:00 and 08:00** local time.
- Only shoppers with **marketing consent** in Salesforce may get a reminder (a GDPR requirement).

Facts:
- The storefront (web and app) calls exp-storefront for every cart change today.
- The OMS publishes an event for every order placed.
- Salesforce holds consent and loyalty tier; its API allows about **100,000 calls a day** for this integration.
- The storefront answers in under 200 ms and must not get slower.

**Questions:**
1. How do cart changes reach the reminder logic without slowing the storefront?
2. How do you know a cart is idle for an hour, and that no order was placed?
3. Where and when do you check consent, and how do you stay within the Salesforce limit?
4. How do you enforce the frequency cap and the quiet hours?
`,
  answerTemplate: `## Capturing cart events

## Cart state

## Finding idle carts

## Consent and channel

## Caps, quiet hours and vouchers
`,
  keyPoints: [
    'exp-storefront publishes cart events to Anypoint MQ after answering the shopper, so the storefront is never slowed.',
    'prc-cart-tracker keeps one record per shopper: last change, cart value, reminders sent; order placed events from the OMS close the record.',
    'A scan job every 5 minutes selects carts idle for more than 1 hour and not yet reminded; it does not rely on timers in memory.',
    'Consent is checked only for carts due a reminder (a few thousand a day), not for every cart change, which keeps Salesforce calls low.',
    'The frequency cap and quiet hours are checked from the cart record and the shopper time zone; due reminders in quiet hours wait until 08:00.',
  ],
  solution: `
**Capturing cart events.** exp-storefront already handles every cart change. After it answers the shopper, it publishes a small event to **cart-events**: shopper ID, cart ID, items, value, time. The publish is async, so the storefront stays under 200 ms. The OMS publishes **order placed** events to the same queue.

**Cart state.** prc-cart-tracker consumes the queue and keeps one record per shopper in a persistent store (Object Store or a small database):
- last change time and cart value;
- reminders sent, with times;
- closed flag.
An order placed event closes the record, whatever device the order came from, because both events carry the shopper ID. Events can arrive out of order, so the tracker keeps the newest time and ignores older updates.

**Finding idle carts.** A Scheduler runs **every 5 minutes**. It selects records that are open, last changed more than 1 hour ago, and without a first reminder. It also selects records that had a first reminder 24 hours ago and no second one. Polling the store is safer than in-memory timers, which are lost on a restart or a redeploy.

**Consent and channel.** For each due cart, the job calls sys-crm-consent. About 40,000 carts are abandoned, but only shoppers who are known and not capped are checked, a few thousand calls a day. Results are cached for 1 hour. No consent means no reminder, and the record is marked so it is not checked again. The channel is push when the shopper has the app with push allowed, otherwise email.

**Caps, quiet hours and vouchers.**
- Cap: skip the shopper when any reminder was sent in the last 3 days.
- Quiet hours: the job computes local time from the shopper country. Due reminders in 21:00 to 08:00 stay due until the 08:00 scan.
- Voucher: the second reminder is sent only when the CRM says loyalty member; the voucher code is single use and created by the promotion engine.
sys-notifications sends the email or push with the cart items and a deep link that restores the cart.
`,
  followUps: [
    { q: 'Why not start a one-hour timer for each cart?', a: 'Timers held in memory are lost when the app restarts or scales. A stored record and a periodic scan survive restarts and can be inspected at any time.' },
    { q: 'What if the shopper is anonymous?', a: 'There is no email and no consent, so no reminder. The cart record can be joined to the shopper later if they log in.' },
    { q: 'How do you measure whether reminders work?', a: 'Tag each reminder link with a campaign code. Compare recovered orders against a small control group that gets no reminder.' },
    { q: 'Why check consent at send time and not when the cart is created?', a: 'Consent can change in between. Checking right before sending honours the latest choice and avoids calls for carts that are bought anyway.' },
  ],
}
