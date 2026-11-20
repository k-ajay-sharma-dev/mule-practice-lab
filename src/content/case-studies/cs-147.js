export default {
  id: 'cs-147',
  category: 'case-studies',
  title: 'Online Retailer Adding Buy Now Pay Later With Three Providers at Checkout',
  level: 'ADVANCED',
  tags: ['payments', 'checkout', 'adapters', 'webhooks', 'reconciliation'],
  estMinutes: 45,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Three providers have different APIs. How should checkout talk to them?',
      options: [
        'Through one payment API with a common model and an adapter per provider',
        'Checkout calls each provider’s API directly, chosen by country',
        'The order system calls the providers and checkout reads the result',
        'One checkout page per provider, each built for that provider’s API',
      ],
      answer: 0,
      explain: 'Checkout stays the same for every country. Adding or removing a provider changes only an adapter, while direct calls or one page per provider spread three sets of rules across the front end.',
    },
    {
      type: 'single',
      prompt: 'The customer is sent to the provider to approve, and comes back. How do you know the result?',
      options: [
        'Confirm with the provider by API or a signed webhook',
        'Read the status from the return URL parameters',
        'Treat the customer returning to the retailer as approval',
        'Read the status the provider page stored in a browser cookie',
      ],
      answer: 0,
      explain: 'Anything in the browser, such as a return URL or a cookie, can be changed by the customer. A server-side check or a signed webhook is the real answer.',
    },
    {
      type: 'multi',
      prompt: 'Which three events must the order system hear about after checkout?',
      options: [
        'Payment captured when the order ships',
        'Refunds, full or partial',
        'The provider cancelling the plan',
        'Each instalment the customer pays to the provider',
      ],
      answer: [0, 1, 2],
      explain: 'The order and the money must stay in step after checkout too. Instalments are between the customer and the provider, who pays the retailer in full, so the order system does not need them.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'A webhook says "approved", but the order was already cancelled for timing out. What do you do?',
      options: [
        'Void the approval with the provider, and record why',
        'Reopen the cancelled order and ship it, as payment is approved',
        'Ignore the webhook, because the order is already cancelled',
        'Store the approval and leave it for finance to find in reconciliation',
      ],
      answer: 0,
      explain: 'Late events happen. The rule must say what wins, and the money must be put back. Ignoring the approval leaves the customer with a plan for an order that will never ship.',
    },
    {
      type: 'match',
      prompt: 'Match each step to the common operation.',
      pairs: [
        ['Customer chooses pay later', 'Create a payment session'],
        ['Customer returns from the provider', 'Confirm the session'],
        ['Order ships', 'Capture'],
        ['Item returned', 'Refund'],
      ],
      explain: 'Four common operations cover every provider.',
    },
    {
      type: 'order',
      prompt: 'Order the build.',
      items: [
        'Design the common payment model and states',
        'Build the first provider adapter with sessions, capture and refund',
        'Add webhook handling with signature checks and idempotency',
        'Add the second and third providers',
        'Reconcile each weekly provider settlement against orders',
      ],
      explain: 'Model first, prove it with one provider, add events, then more providers, then reconciliation.',
    },
  ],
  description: `
**Context.** An online homeware retailer wants to offer **buy now pay later** through **three providers**, chosen by country.

**Facts gathered so far**
- Each provider sends the customer to its own page to approve, then back to the retailer.
- Providers confirm by API and send webhooks for approvals, captures, refunds and cancellations.
- Orders are paid when they ship, which can be days after checkout.
- Partial returns are common.
- Providers settle money weekly with a report.

**Opinions**
- E-commerce lead: "Checkout must stay fast and look the same."
- Finance: "Every euro must match an order."
- Security: "Do not trust anything that comes back in the browser."

**Your task.** Design the integration between checkout, the order system and the three providers.
`,
  answerTemplate: `## Decision

## Common payment model

## Provider adapters

## Approval and confirmation

## Webhooks

## After checkout

## Reconciliation

## Risks
`,
  keyPoints: [
    'One payment API with a common model and one adapter per provider.',
    'Confirm approval server side, never from the return URL alone.',
    'Check webhook signatures and process each event once.',
    'Capture on shipping and refund on returns, including partial ones.',
    'Rules for late events, such as approval after cancellation.',
    'Reconcile weekly settlements against orders.',
  ],
  solution: `
**Decision.** A Payments API with a common model. Adapters per provider handle sessions, confirmation, capture and refund. A webhook endpoint per provider feeds the same model.

**Common payment model.** Session, approved, captured, refunded, cancelled, with amounts and the order ID.

**Approval and confirmation.** The return URL only tells checkout to check. The API asks the provider for the real status.

**Webhooks.** Signatures checked, events stored by provider event ID so repeats are ignored, and states moved only forward.

**After checkout.** The order system asks for capture on shipping and refund on return. A late approval for a cancelled order is voided.

**Reconciliation.** Each weekly provider settlement report is imported when it arrives and matched to captures and refunds, with gaps sent to finance.

**Risks.** Provider API changes, webhooks out of order, and partial refunds rounded differently.
`,
  followUps: [
    { q: 'Why not let checkout call providers?', a: 'Checkout would hold three sets of rules. The API keeps them in one place.' },
    { q: 'What if a webhook arrives before the customer returns?', a: 'Store it. The confirmation step then finds the payment already approved.' },
    { q: 'How do you process a webhook only once?', a: 'Store the provider event ID and skip any you have seen.' },
    { q: 'How do you add a fourth provider?', a: 'Write one adapter and one webhook mapping. Checkout and orders do not change.' },
  ],
}
