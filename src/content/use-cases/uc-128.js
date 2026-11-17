import { diagram } from '../../arch/dsl.js'

const store = { type: 'database', label: 'substitution' }
const offers = { name: 'substitution offers', from: 'internal-app', rps: 30, to: 'notification', kind: 'write' }
const decisions = { name: 'customer decisions', from: 'mobile-app', rps: 25, to: 'erp', kind: 'write' }

export default {
  id: 'uc-128',
  category: 'use-cases',
  title: 'Grocery Pickers Offer Substitutions: Customers Answer in the App, Silence Means the Default, and Nobody Waits on the Order System',
  level: 'ADVANCED',
  tags: ['anypoint-mq', 'timeouts', 'state-store', 'push-notifications', 'scheduled-job', 'retail'],
  estMinutes: 40,
  diagram: {
    task: 'draw the substitution flow: the picker handhelds call a picking Experience API and the grocery app calls a customer Experience API, both reaching one substitutions Process API. It keeps every offer in a substitution store, puts each offer on a queue (with a DLQ) for a notifier that sends a push message, and records the customer\'s decision in the order management system through a System API. A timeout job applies the default to offers nobody answered.',
    checks: [
      { label: 'Pickers and customers each have their own Experience API', rule: { type: 'each', of: 'experience-api', min: 2, edgeFrom: ['internal-app', 'mobile-app'], max: 1 } },
      { label: 'One substitutions Process API serves both', rule: { type: 'each', of: 'process-api', edgeFrom: 'experience-api', count: 2, some: true } },
      { label: 'Every offer and decision is kept in the substitution store', rule: { type: 'edge', from: 'process-api', to: store } },
      { label: 'Offers reach the customer through a queue', rule: { type: 'path', from: 'process-api', via: 'queue', to: 'notification' } },
      { label: 'A picker never waits on the push service', rule: { type: 'no-path', from: 'internal-app', to: 'notification', kind: 'sync' } },
      { label: 'A timeout job applies the default in the order system', rule: { type: 'path', from: 'batch-job', via: 'system-api', to: 'erp' } },
      { label: 'The timeout job reads the substitution store', rule: { type: 'edge', from: 'batch-job', to: store } },
      { label: 'The order management system is reached only through a System API', rule: { type: 'only-via', target: 'erp', from: 'system-api' } },
      { label: 'The offer queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        pick: ['internal-app', 'Picker handhelds'],
        app: ['mobile-app', 'Grocery app'],
        expP: ['experience-api', 'exp-picking', { vCores: '0.2' }],
        expC: ['experience-api', 'exp-customer-orders', { vCores: '0.2' }],
        prc: ['process-api', 'prc-substitutions', { vCores: '0.5' }],
        st: ['database', 'Substitution store (offers and decisions)'],
        q: ['queue', 'substitution-offers', { maxRedelivery: 30 }],
        dlq: ['dlq', 'substitution-offers DLQ'],
        note: ['process-api', 'prc-offer-notifier', { vCores: '0.2' }],
        push: ['notification', 'Customer push notifications'],
        sys: ['system-api', 'sys-oms-orders', { timeoutMs: 2000 }],
        oms: ['erp', 'Order management system (OMS)'],
        job: ['batch-job', 'Substitution timeout job (every minute)'],
      },
      [
        'pick -> expP', 'app -> expC', 'expP -> prc', 'expC -> prc', 'prc -> st', 'prc ~> q', 'q ~> note', 'q ~> dlq', 'note -> push',
        'prc -> sys', 'sys -> oms', 'job -> st', 'job -> sys',
      ],
    ),
    simulation: {
      systems: [
        { match: 'erp', latencyMs: 250, maxRps: 80 },
        { match: 'notification', latencyMs: 150 },
        { match: 'database', latencyMs: 5 },
      ],
      tests: [
        {
          name: 'Saturday morning picking',
          about: 'Pickers offer 30 substitutions a second and customers answer 25 a second. Pickers get an answer at once, every offer reaches a phone, and every decision reaches the order system.',
          traffic: [offers, decisions],
          durationMin: 30,
          expect: {
            answers: [{ minSuccess: 0.99 }, { flow: 'substitution offers', maxMs: 300 }],
            delivered: [{ flow: 'substitution offers', to: 'notification', min: 0.99 }, { flow: 'customer decisions', to: 'erp', min: 0.99 }],
          },
        },
        {
          name: 'The push service is down for 15 minutes',
          about: 'The push provider has an outage. Pickers carry on, offers wait on the queue, none is lost or sent to the DLQ, and they go out once the provider is back.',
          traffic: [offers, decisions],
          incidents: [{ down: 'notification', at: 5, forMin: 15 }],
          durationMin: 40,
          expect: { answers: [{ flow: 'substitution offers', minSuccess: 0.99 }], lost: { max: 0 }, dlq: { max: 0 }, backlog: [{ queue: 'queue', maxEnd: 0 }] },
        },
        {
          name: 'The order system is slow for 10 minutes',
          about: 'The order system takes 6 seconds to answer while it reindexes. Customer decisions fail fast at the System API timeout and the app asks them to try again, and pickers are not slowed down.',
          traffic: [offers, decisions],
          incidents: [{ slow: 'erp', latencyMs: 6000, at: 5, forMin: 10 }],
          durationMin: 20,
          expect: { answers: [{ flow: 'substitution offers', minSuccess: 0.99, maxMs: 300 }] },
        },
      ],
    },
  },
  description: `
An online grocer's pickers walk the aisles with **handhelds**. When an item is out of stock, the picker scans a replacement, and the customer should be asked in the **grocery app**: accept or refuse. The van leaves on time whatever happens, so if the customer has not answered within **10 minutes**, the default applies: refuse for items the customer marked "no substitutes", accept for the rest.

The decision has to reach the **order management system (OMS)**, which works out the final bill.

Today the handheld calls the OMS and the push provider before it lets the picker move on. On busy Saturdays the OMS slows down and pickers stand in the aisle waiting.

Facts:
- At peak, pickers offer about **30 substitutions a second**, and customers answer about **25 a second**.
- The OMS answers in about **250 ms** and takes up to **80 requests a second**. Once a week it reindexes for 10 minutes and takes about 6 seconds per call.
- The push provider has short outages a few times a month.

**Questions:**
- Draw a design where the picker never waits for the customer, the push provider or the OMS.
- Where does the state of each offer live, and why there?
- How does "silence means the default" work?
- How do you stop a slow OMS from slowing the pickers?
`,
  answerTemplate: `## Design

## The state of an offer

## Silence means the default

## When the OMS is slow

## When the push provider is down
`,
  keyPoints: [
    'An offer is a small process that lasts minutes: offered, then accepted, refused or timed out. Keep its state in a store, not in a waiting request.',
    'The picker\'s call only records the offer and queues the push. It answers in milliseconds.',
    'A scheduled job finds offers older than 10 minutes with no answer, applies the default and sends it to the OMS.',
    'Pickers and customers use different Experience APIs but share one Process API, so the substitution rules live in one place.',
    'The shared Process API waits on the OMS for customer decisions. A short timeout in the OMS System API stops a slow OMS from holding the threads pickers need.',
    'A customer who answers after the default was applied gets a clear message. The store records which came first.',
  ],
  solution: `
**Design**
\`\`\`
Picker handhelds ─► exp-picking ─────────┐
Grocery app      ─► exp-customer-orders ─┴─► prc-substitutions ─┬─► Substitution store
                                                                ├~► substitution-offers ~► prc-offer-notifier ─► Push
                                                                │          ~► DLQ
                                                                └─► sys-oms-orders ─► OMS
Substitution timeout job (every minute) ─► Substitution store, and ─► sys-oms-orders
\`\`\`

**The state of an offer.** \`prc-substitutions\` writes each offer to the substitution store as OFFERED with the time and the default. A customer decision changes it to ACCEPTED or REFUSED, but only while it is still OFFERED. The store is the one place that says what happened, which support needs when a customer disputes a bill.

**Silence means the default.** Every minute the timeout job selects offers still OFFERED after 10 minutes, sets them to DEFAULT_ACCEPTED or DEFAULT_REFUSED in the same conditional update, and sends the result to the OMS. If the customer answers in the same second, only one of the two updates finds the offer still OFFERED, so there is never a double decision.

**When the OMS is slow.** Customer decisions go through \`sys-oms-orders\`, which has a 2 second timeout. During the reindex, decisions fail fast and the app asks the customer to try again; the store still holds the offer, so nothing is lost. Without the timeout, each decision would hold a thread of \`prc-substitutions\` for 6 seconds, and the offers from pickers would queue behind them.

**When the push provider is down.** Offers wait on \`substitution-offers\`. The limit of 30 deliveries rides out a short outage. Give the notifier room to catch up: about 27,000 offers build up in 15 minutes, and on the smallest size it would still be sending them 20 minutes later. If an offer cannot be sent before its 10 minutes are up, the default applies anyway, which is the rule customers signed up to.
`,
  followUps: [
    {
      q: 'Why not let the app poll for offers instead of sending a push?',
      a: 'The app is closed most of the time while the customer waits for a delivery. A push reaches them; polling only works while the app is open.',
    },
    {
      q: 'Should the timeout job call the OMS for each offer, or in bulk?',
      a: 'Per order is simplest, since the OMS bills per order. If many offers on one order time out together, send them in one call.',
    },
    {
      q: 'What if the OMS is down when the timeout job runs?',
      a: 'Keep the offer in a state such as DEFAULT_PENDING_OMS and let the next run send it again. The decision is already made; only the OMS update is waiting.',
    },
  ],
}
