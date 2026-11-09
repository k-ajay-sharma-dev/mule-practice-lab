import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-089',
  category: 'use-cases',
  title: 'Split-Tender Checkout: Gift Cards, Points and Card in One Payment',
  level: 'EXPERT',
  tags: ['saga', 'payments', 'gift-cards', 'loyalty', 'idempotency', 'compensation', 'e-commerce', 'reconciliation'],
  estMinutes: 45,
  diagram: {
    task: 'draw the split-tender checkout: web and app through the gateway, a saga Process API with an idempotency store and a tender ledger, the loyalty engine, gift card processor and payment provider behind System APIs, a retried reversal queue with a DLQ, and paid orders sent to the OMS asynchronously.',
    checks: [
      { label: 'Web and app reach checkout through the gateway', rule: { type: 'each', of: ['web-app', 'mobile-app'], min: 2, edgeTo: 'api-gateway' } },
      { label: 'Checkout reaches the loyalty engine, gift card processor and card provider', rule: { type: 'path', from: 'experience-api', to: ['saas', 'external-api', 'payment'], min: 3 } },
      { label: 'Every tender system is reached only through a System API', rule: { type: 'only-via', target: ['saas', 'external-api', 'payment'], from: 'system-api' } },
      { label: 'Saga state is kept in a tender ledger', rule: { type: 'path', from: 'process-api', to: 'database' } },
      { label: 'Failed checkouts reverse tenders through a retried queue', rule: { type: 'path', from: 'process-api', via: ['queue', 'cloud-queue'], to: ['external-api', 'saas', 'payment'] } },
      { label: 'Reversals that keep failing go to a dead-letter queue', rule: { type: 'edge', from: ['queue', 'cloud-queue'], to: 'dlq' } },
      { label: 'Repeated checkout clicks are caught by an idempotency store', rule: { type: 'edge', from: ['experience-api', 'process-api'], to: 'cache' } },
      { label: 'Checkout never waits on the OMS', rule: { type: 'no-path', from: 'experience-api', to: 'erp', kind: 'sync' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Website'],
        mob: ['mobile-app', 'Mobile app'],
        gw: ['api-gateway', 'Gateway (client ID, rate limit)'],
        exp: ['experience-api', 'exp-checkout'],
        saga: ['process-api', 'prc-split-tender (saga)'],
        idem: ['cache', 'Checkout idempotency keys'],
        sled: ['system-api', 'sys-tender-ledger'],
        led: ['database', 'Tender ledger (saga state)'],
        sloy: ['system-api', 'sys-loyalty'],
        loy: ['saas', 'Loyalty engine'],
        sgc: ['system-api', 'sys-giftcard'],
        gc: ['external-api', 'Gift card processor'],
        spay: ['system-api', 'sys-payments'],
        pay: ['payment', 'Payment provider'],
        rq: ['queue', 'tender-reversals'],
        rev: ['process-api', 'prc-tender-reversals'],
        rdlq: ['dlq', 'tender-reversals-dlq'],
        oq: ['queue', 'orders-paid'],
        soms: ['system-api', 'sys-oms'],
        oms: ['erp', 'OMS'],
        rec: ['batch-job', 'Daily tender reconciliation'],
        files: ['file-store', 'Settlement files'],
      },
      [
        'web -> gw', 'mob -> gw', 'gw -> exp', 'exp -> saga', 'saga -> idem', 'saga -> sled', 'sled -> led',
        'saga -> sloy', 'sloy -> loy', 'saga -> sgc', 'sgc -> gc', 'saga -> spay', 'spay -> pay',
        'saga ~> rq', 'rq ~> rev', 'rq ~> rdlq', 'rev -> sloy', 'rev -> sgc', 'rev -> spay', 'rev -> sled',
        'saga ~> oq', 'oq ~> soms', 'soms -> oms', 'rec -> files', 'rec -> sled',
      ],
    ),
  },
  description: `
A department store wants customers to pay one online order with a mix of tenders:
- up to **two gift cards**,
- **loyalty points** (100 points = £1),
- a **card** for the rest.

There are **80,000 orders a day** and **18 %** of them are split tender. On peak days checkout runs at **60 orders a second**.

Systems, each with its own API and failure modes:
- **Loyalty engine** (SaaS): reserve points, commit, release. A reservation expires after 30 minutes.
- **Gift card processor** (external API): redeem an amount, reverse a redemption. Accepts an idempotency key; a reversal is possible for 24 hours.
- **Payment provider**: authorise, capture, void, refund. Accepts an idempotency key.
- **OMS**: creates the order once it is paid.

Things that go wrong today with a hand-built checkout:
- A gift card is redeemed, then the card is declined, and the customer's gift card balance is gone for days.
- A timeout on the gift card call leaves nobody sure whether the money was taken.
- Customers double click "Pay" and are charged twice.
- Refunds after a partial return go to the wrong tender.

Business rules:
- Tender order at checkout: points, then gift cards, then card.
- Refunds go back in the reverse order: card first, then gift cards, then points.
- The customer must get an answer within **8 seconds**.

**Questions:**
1. Draw the design.
2. How does the saga run, and what is stored at each step?
3. How do you reverse completed steps when a later one fails, including after a timeout?
4. How do you stop double charges from double clicks and retries?
5. How do you prove at the end of each day that all tenders match?
`,
  answerTemplate: `## Components

## Saga steps and the ledger

## Failure and compensation

## Idempotency

## Order creation

## Refunds

## Reconciliation
`,
  keyPoints: [
    'prc-split-tender is an orchestrated saga: each step is written to the tender ledger before the call and updated after it.',
    'Every tender call carries a key built from checkout ID and step, so retries and reversals act on exactly one operation.',
    'On failure the saga publishes compensations to a reversal queue; a consumer retries them until they succeed, with a DLQ and alerts for the rest.',
    'A timeout is treated as unknown: the step is reversed by key, which is safe whether or not the original call took effect.',
    'Paid orders go to the OMS through a queue; refunds follow the ledger in reverse tender order; a daily job reconciles the ledger with settlement files.',
  ],
  solution: `
\`\`\`
Web / App -> Gateway -> exp-checkout -> prc-split-tender (saga) -> idempotency store
                                                                -> sys-tender-ledger -> ledger DB
                                                                -> sys-loyalty, sys-giftcard, sys-payments
                                                                ~> [tender-reversals] ~> prc-tender-reversals (retry, DLQ)
                                                                ~> [orders-paid] ~> sys-oms -> OMS
Daily reconciliation -> settlement files, ledger
\`\`\`

**Saga steps and the ledger.** The checkout request carries a **checkout ID** generated by the browser. prc-split-tender first checks the **idempotency store**: a known checkout ID returns the stored result, so a double click never starts a second saga. Then it writes a ledger row per planned step: points £8, gift card A £25, gift card B £10, card £42.50, all PLANNED. For each step in order:
1. mark the step PENDING;
2. call the System API with key checkoutID-step;
3. mark it DONE with the reference, or FAILED, or UNKNOWN on a timeout.

**Failure and compensation.** If a step fails, the saga marks the checkout FAILED and publishes one compensation message per DONE or UNKNOWN step to **tender-reversals**: release points, reverse gift card, void card authorisation. The customer gets a clear decline in under 8 seconds. prc-tender-reversals retries each compensation with backoff. Reversing by key is safe for an UNKNOWN step: if the original call never happened, the provider answers "not found" and the step is closed. After 10 tries a message goes to the **DLQ**, and support is alerted, because a customer's money is held.

**Idempotency.** Three layers: the checkout ID in the idempotency store, the step key at every provider, and the ledger state that the saga reads before each call.

**Order creation.** When all steps are DONE, the saga marks the checkout PAID and publishes to **orders-paid**. The OMS is called from the queue consumer, so a slow OMS never holds the customer.

**Refunds.** The ledger knows which tender paid what. A refund of £30 goes back to the card first (up to £42.50), then gift cards, then points, each step with its own key and ledger row.

**Reconciliation.** A daily job loads the gift card and payment settlement files and the loyalty transaction report, and matches them with the ledger by key. Every mismatch, such as a redemption with no ledger row, becomes a case for finance.
`,
  followUps: [
    { q: 'Why orchestration and not choreography for this saga?', a: 'The steps have a fixed order, a deadline of 8 seconds and complex compensation. One orchestrator with a ledger makes the state visible and clear to follow.' },
    { q: 'Why authorise the card last?', a: 'Points and gift cards are the tenders the customer chose to spend first. The card covers what remains, so its amount is only known after the other steps.' },
    { q: 'What if the saga instance crashes halfway?', a: 'The ledger shows PENDING steps. A recovery job picks up checkouts stuck for 2 minutes and compensates them, as for a failure.' },
    { q: 'Why is a timeout treated as unknown instead of failed?', a: 'The provider may have done the work and the reply was lost. Reversing by key covers both cases, while assuming failure would leave money taken.' },
    { q: 'How do you test the compensation paths?', a: 'MUnit mocks each System API to fail, time out or succeed, for every step. The tests assert the ledger states and the compensation messages published.' },
  ],
}
