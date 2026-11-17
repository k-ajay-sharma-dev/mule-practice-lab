import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-084',
  category: 'use-cases',
  title: 'Digital Gift Cards Bought Online and Delivered by Email',
  level: 'INTERMEDIATE',
  tags: ['gift-cards', 'retail', 'payments', 'idempotency', 'scheduler', 'notifications', 'security'],
  estMinutes: 25,
  diagram: {
    task: 'draw the e-gift card design: the website through an Experience API, a purchase Process API that takes payment and activates the card, the orders database with delivery dates, the delivery scheduler and queue, the email, and the daily posting to the ERP.',
    checks: [
      { label: 'The website calls an Experience API', rule: { type: 'path', from: 'web-app', to: 'experience-api' } },
      { label: 'Payment is taken in the purchase flow', rule: { type: 'path', from: 'experience-api', to: 'payment' } },
      { label: 'The card is activated at the processor in the purchase flow', rule: { type: 'path', from: 'experience-api', to: 'external-api' } },
      { label: 'Payment provider and gift card processor are reached only through System APIs', rule: { type: 'only-via', target: ['payment', 'external-api'], from: 'system-api' } },
      { label: 'The purchase never sends the recipient email itself', rule: { type: 'no-path', from: 'experience-api', to: 'notification', kind: 'sync' } },
      { label: 'A scheduled job finds due deliveries and queues them', rule: { type: 'edge', from: 'batch-job', to: ['queue', 'topic'], kind: 'async' } },
      { label: 'The gift card liability is posted to the ERP', rule: { type: 'path', from: 'batch-job', to: 'erp' } },
      { label: 'The orders database is reached only through a System API', rule: { type: 'only-via', target: 'database', from: 'system-api' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        exp: ['experience-api', 'exp-gift-checkout'],
        prc: ['process-api', 'prc-egift-purchase'],
        spay: ['system-api', 'sys-payments'],
        pay: ['payment', 'Payment provider'],
        sgc: ['system-api', 'sys-giftcard-processor', { retries: 2 }],
        gc: ['external-api', 'Gift card processor'],
        sdb: ['system-api', 'sys-egift-orders'],
        db: ['database', 'E-gift orders (delivery date, status)'],
        job: ['batch-job', 'Delivery scheduler (every 15 min)'],
        q: ['queue', 'egift-deliveries'],
        snd: ['process-api', 'prc-egift-delivery'],
        snot: ['system-api', 'sys-notifications'],
        mail: ['notification', 'Recipient email'],
        fin: ['batch-job', 'Daily liability posting'],
        serp: ['system-api', 'sys-erp-gl'],
        erp: ['erp', 'ERP general ledger'],
      },
      [
        'web -> exp', 'exp -> prc', 'prc -> spay', 'spay -> pay', 'prc -> sgc', 'sgc -> gc', 'prc -> sdb', 'sdb -> db',
        'job -> sdb', 'job ~> q', 'q ~> snd', 'snd -> snot', 'snot -> mail', 'fin -> sdb', 'fin -> serp', 'serp -> erp',
      ],
    ),
    simulation: {
      systems: [
        { match: 'payment', latencyMs: 1500 },
        { match: 'external-api', latencyMs: 800 },
        { match: 'database', latencyMs: 20 },
        { match: 'notification', latencyMs: 300 },
      ],
      tests: [
        {
          name: 'Christmas morning deliveries',
          about: 'On Christmas morning the scheduler queues 5 deliveries a second while the email service is down for 30 minutes. The emails wait in the queue and go out when it is back, so no card is lost.',
          traffic: [{ name: 'deliveries', from: { type: 'batch-job', label: 'delivery' }, rps: 5, to: 'notification', kind: 'write' }],
          incidents: [{ down: 'notification', at: 5, forMin: 30 }],
          durationMin: 60,
          expect: { answers: [{ minSuccess: 0.99 }], backlog: [{ queue: ['queue', 'topic'], maxEnd: 0 }], lost: { max: 0 } },
        },
        {
          name: 'The processor fails some activations',
          about: 'Buyers send 2 purchases a second, and the gift card processor fails 1 activation in 10. With the idempotency key a retry is safe, so the activations are tried again and almost every purchase completes.',
          traffic: [{ name: 'purchases', from: 'web-app', rps: 2, to: ['payment', 'external-api', 'database'], kind: 'write' }],
          incidents: [{ errors: 'external-api', rate: 0.1 }],
          durationMin: 10,
          expect: { answers: [{ minSuccess: 0.99 }] },
        },
      ],
    },
  },
  description: `
A department store sells **e-gift cards** from £10 to £500 on its website. Sales are about **1,500 a day**, and **25,000 a day** in the week before Christmas.

The buyer chooses:
- the amount, a message and the recipient's email;
- a **delivery date**, today or up to **90 days** ahead (birthdays).

Rules:
- A card must **never be activated without payment**, and the buyer must **never be charged twice**.
- The recipient gets an email on the chosen date (at 08:00 their time) with a link to view the card number and PIN.
- The buyer gets a receipt at once.
- Finance books unspent gift card value as a **liability**: one journal a day in the ERP with cards activated.

Facts:
- The **gift card processor** (external API) activates a card for an amount and returns number and PIN. It accepts an idempotency key.
- The **payment provider** takes card payments and also accepts an idempotency key.
- Card numbers and PINs are sensitive: they must not appear in logs or in the email body.
- On Christmas morning the scheduler sends about **5 deliveries a second**, and the email service can be down for 30 minutes. In the busy week the processor fails about 1 activation in 10 for a while.

**Questions:**
1. In which order do you take payment and activate the card, and what if the second step fails?
2. How do you handle double clicks and retries?
3. How do future-dated deliveries work?
4. How do you protect card numbers and PINs?
`,
  answerTemplate: `## Purchase flow

## Idempotency

## Future-dated delivery

## Protecting card data

## Finance posting
`,
  keyPoints: [
    'prc-egift-purchase captures payment first, then activates the card, both with the order line ID as idempotency key.',
    'If activation fails after payment, the Process API retries activation; if it still fails, it refunds the payment and tells the buyer.',
    'The order is stored with its delivery date; the buyer gets a receipt at once and the recipient email waits for the date.',
    'A scheduler every 15 minutes queues due deliveries; a consumer sends the email with a secure link, never the PIN.',
    'A daily job posts the activated value as a liability journal to the ERP through a System API.',
  ],
  solution: `
**Purchase flow.** exp-gift-checkout calls prc-egift-purchase:
1. Create the order row with status NEW (through sys-egift-orders).
2. **Capture** the payment through sys-payments.
3. **Activate** the card through sys-giftcard-processor for the amount.
4. Store the card reference and set the status to READY with the delivery date.
5. Send the buyer a receipt (no card number).

Payment comes first because an active card without payment is money given away. If activation fails, the Process API retries it three times with backoff. If it still fails, it refunds the payment and marks the order FAILED.

**Idempotency.** The order line ID is the idempotency key for both the payment and the activation. A double click or a retried request returns the stored result of the first one. The processor and the provider both honour the key, so a retry after a timeout never charges or activates twice.

**Future-dated delivery.** The purchase flow does not email the recipient. A Scheduler runs every 15 minutes, selects READY orders whose delivery time has passed and publishes them to **egift-deliveries**. It marks them QUEUED in the same step. prc-egift-delivery sends the email through sys-notifications and marks the order SENT. In Christmas week, 25,000 deliveries spread over the day are no problem for the queue.

**Protecting card data.** Number and PIN stay at the processor; the database keeps only a reference and the last four digits. The email contains a **signed link** that expires after 90 days. The page behind it fetches the card details from the processor when opened. Logging filters mask any field named pin or cardNumber.

**Finance posting.** A daily job reads cards activated yesterday and posts one journal through sys-erp-gl: debit cash clearing, credit gift card liability.
`,
  followUps: [
    { q: 'Why not activate the card on the delivery date instead?', a: 'The buyer has paid already, and the processor might be down on the day. Activating at purchase confirms the card exists before the receipt goes out.' },
    { q: 'What if the recipient email bounces?', a: 'The delivery process marks the order BOUNCED and emails the buyer, who can correct the address and resend from their account.' },
    { q: 'How do you stop the scheduler sending one card twice?', a: 'The job marks orders QUEUED when it publishes them and selects only READY rows. The consumer checks for SENT before emailing.' },
  ],
}
