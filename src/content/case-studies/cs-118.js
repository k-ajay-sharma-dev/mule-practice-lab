import { diagram } from '../../arch/dsl.js'

export default {
  id: 'cs-118',
  category: 'case-studies',
  title: 'Streaming Service Moving 30 Million Subscriptions From Home-Grown Billing to Zuora',
  level: 'EXPERT',
  tags: ['media', 'subscriptions', 'billing', 'migration', 'events', 'reconciliation', 'payments', 'pci'],
  estMinutes: 60,
  diagram: {
    task: 'draw the dual-run period: channels on one subscription API whose Process API routes each customer by migration cohort to Zuora or legacy billing, both platforms publishing one canonical subscription event (with app store events), entitlements driven from that event, and migration and reconciliation batches working against both platforms.',
    checks: [
      { label: 'The apps and the website each call the subscription Experience API', rule: { type: 'each', of: ['mobile-app', 'web-app'], min: 2, edgeTo: 'experience-api' } },
      { label: 'Channels never choose the billing platform: every route to a billing platform passes the subscription Process API', rule: { type: 'no-path', from: ['mobile-app', 'web-app'], to: ['saas', 'legacy'], unless: 'process-api' } },
      { label: 'The Process API looks up each customer’s migration cohort', rule: { type: 'edge', from: 'process-api', to: { type: ['cache', 'database'], label: 'cohort' } } },
      { label: 'Migrated cohorts go to Zuora through its System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: { type: 'saas', label: 'zuora' } } },
      { label: 'Cohorts not yet migrated stay on legacy billing through its System API', rule: { type: 'path', from: 'process-api', via: 'system-api', to: { type: 'legacy', label: 'billing' } } },
      { label: 'Zuora and legacy billing are reached only through System APIs', rule: { type: 'only-via', target: ['saas', 'legacy'], from: 'system-api' } },
      { label: 'Card data never passes through Mule: only the billing platforms talk to the payment provider', rule: { type: 'only-via', target: 'payment', from: ['saas', 'legacy'] } },
      { label: 'Both billing System APIs publish the same canonical subscription event', rule: { type: 'edge', from: 'system-api', to: ['topic', 'event-stream'], kind: 'async', min: 2 } },
      { label: 'App store subscriptions join the same event flow', rule: { type: 'path', from: 'external-api', to: ['topic', 'event-stream'] } },
      { label: 'Entitlements are updated from subscription events through a System API', rule: { type: 'path', from: ['topic', 'event-stream'], via: 'system-api', to: { type: 'database', label: 'entitle' } } },
      { label: 'The subscription Process API never updates entitlements with a synchronous call', rule: { type: 'no-path', from: 'process-api', to: { type: 'database', label: 'entitle' }, kind: 'sync' } },
      { label: 'Migration and reconciliation batches work against both billing System APIs', rule: { type: 'each', of: 'batch-job', min: 2, edgeTo: 'system-api', count: 2 } },
      { label: 'Entitlement updates that keep failing go to a dead-letter queue', rule: { type: 'edge', to: 'dlq' } },
    ],
    reference: diagram(
      {
        app: ['mobile-app', 'TV and mobile apps'],
        web: ['web-app', 'Website sign-up and account'],
        exp: ['experience-api', 'exp-subscription-api'],
        prc: ['process-api', 'prc-subscription-api'],
        map: ['cache', 'Cohort map (customer to billing platform)'],
        sz: ['system-api', 'sys-zuora-api'],
        z: ['saas', 'Zuora Billing'],
        sl: ['system-api', 'sys-legacy-billing-api'],
        l: ['legacy', 'Legacy billing (Oracle, Java)'],
        pay: ['payment', 'Payment provider (tokens)'],
        stores: ['external-api', 'Apple and Google app stores'],
        es: ['experience-api', 'exp-app-store-notifications-api'],
        tp: ['topic', 'subscription-changed'],
        qent: ['queue', 'entitlement-updates'],
        sent: ['system-api', 'sys-entitlement-api'],
        ent: ['database', 'Entitlements store'],
        dw: ['data-warehouse', 'Revenue reporting'],
        dlq: ['dlq', 'entitlement-updates DLQ'],
        mig: ['batch-job', 'cohort-migration'],
        rec: ['batch-job', 'billing-reconciliation'],
      },
      [
        'app -> exp', 'web -> exp', 'exp -> prc', 'prc -> map', 'prc -> sz', 'prc -> sl', 'sz -> z', 'sl -> l', 'z -> pay',
        'l -> pay', 'sz ~> tp', 'sl ~> tp', 'stores -> es', 'es ~> tp', 'tp ~> qent', 'qent ~> sent', 'sent -> ent',
        'qent ~> dlq', 'tp ~> dw', 'mig -> sl', 'mig -> sz', 'rec -> sl', 'rec -> sz',
      ],
    ),
  },
  description: `
**Context.** A video streaming service has **30 million paying subscribers in 22 countries**. Subscriptions are billed by a home-grown platform (Java on Oracle) built 11 years ago. It renews about 1 million subscriptions a day, charges cards through a payment provider using stored tokens, and handles 14 currencies and local tax rules badly. The company has signed for **Zuora Billing** and wants the legacy platform gone in 18 months.

**Other subscription sources.** 22% of subscribers pay through the Apple App Store or Google Play. Those stores bill the customer and send server notifications; they stay as they are.

**What depends on billing today**
- **Entitlements**: whether a customer may watch, and at which quality and number of screens, is read by every playback request (40,000 per second at peak). The entitlement store is updated by the legacy platform writing into its tables directly.
- Revenue reporting reads legacy tables nightly.
- Customer care looks up billing history in the legacy UI.

**Hard rules**
- No customer is charged twice, and no paying customer loses access, at any point.
- No card numbers may pass through the integration layer (PCI DSS scope must not grow). The payment provider can make the legacy tokens usable by Zuora.
- A customer belongs to exactly one billing platform at a time.
- Finance must sign off each country after comparing legacy and Zuora totals for one full billing cycle.

**Proposed by the vendor.** Export all subscriptions over one weekend and switch.

**Your task.** Design the migration architecture and approach, and explain why you accept or reject the vendor's proposal.
`,
  answerTemplate: `## Response to the big-bang proposal

## Cohorts and routing

## One subscription event for everyone downstream

## Entitlements

## Migrating a cohort

## Reconciliation and country sign-off

## Payments and PCI
`,
  keyPoints: [
    'Reject the weekend big bang: 30 million subscribers, 22 countries and a finance sign-off per billing cycle need a cohort-by-cohort migration with rollback.',
    'A subscription Process API routes every change by cohort (customer to platform map), so channels never know which billing platform serves a customer.',
    'Both billing platforms and the app stores publish one canonical subscription event; entitlements, reporting and care consume it, removing the direct table writes into the entitlement store.',
    'A cohort migrates between renewal dates: freeze changes for that cohort briefly, create subscriptions in Zuora with tokens moved by the payment provider, flip the cohort map, and cancel future renewals in legacy.',
    'Reconciliation compares charges, renewal dates and totals per cohort across both platforms; finance signs off each country after one full cycle.',
    'Card data stays between billing platforms and the payment provider; Mule only handles token references and subscription data.',
  ],
  solution: `
**Big bang rejected.** A weekend export gives no rollback, puts a whole billing cycle at risk in 22 countries at once, and gives finance no chance to compare. Instead: pilot with 50,000 employees and friendly customers in one country, then country cohorts ordered by size and tax complexity.

**Routing.** \`exp-subscription-api\` (sign-up, change plan, cancel, update payment method) calls \`prc-subscription-api\`. The Process API reads the cohort map (Object Store backed by a table) and calls \`sys-zuora-api\` or \`sys-legacy-billing-api\`. New sign-ups in a migrated country go straight to Zuora.

**Canonical event.** \`SubscriptionChanged\` (customer, plan, status, entitlement level, period end, source platform). \`sys-zuora-api\` turns Zuora notifications into it; \`sys-legacy-billing-api\` publishes from an outbox table added to the legacy platform; \`exp-app-store-notifications-api\` verifies and maps store notifications. All go to \`subscription-changed\`.

**Entitlements.** \`sys-entitlement-api\` consumes \`entitlement-updates\` and is the only writer of the entitlement store. Updates are idempotent and ordered by event time per customer; failures retry and then go to a DLQ with a page to the on-call team, because a lost update means a paying customer without access. The direct legacy table writes are switched off once the event path is proven.

**Migrating a cohort.** \`cohort-migration\`:
1. Picks customers whose next renewal is at least 3 days away.
2. Blocks plan changes for them for minutes (the Process API answers "try again shortly").
3. Asks the payment provider to make the tokens available to Zuora (provider-side, no card data in Mule).
4. Creates account and subscription in Zuora with the same period end, then flips the cohort map.
5. Stops future renewals for those customers in legacy.
Rollback for a cohort is the same steps in reverse before its first Zuora renewal.

**Reconciliation.** \`billing-reconciliation\` compares, per customer, active status, plan, next renewal date and amount across both platforms, and finds customers active in both or neither. Daily totals per country go to finance; a country is signed off after one full cycle.
`,
  followUps: [
    { q: 'How do you guarantee nobody is charged twice during the move?', a: 'A customer has exactly one active renewal: legacy renewals are stopped in the same step that flips the cohort map. Reconciliation checks every day for customers active in both platforms and alerts before the next billing run.' },
    { q: 'Why not let both billing platforms write the entitlement store directly?', a: 'Two writers with different logic would disagree about access. One System API fed by canonical events applies the same rules for Zuora, legacy and app store customers.' },
    { q: 'Why migrate customers between renewals?', a: 'Moving a customer close to a renewal risks a charge on both sides or none. A gap of several days leaves time to verify and roll back before money moves.' },
    { q: 'How does the design keep PCI scope from growing?', a: 'Card numbers stay with the payment provider and the billing platforms. Mule only carries subscription data and token references, and token migration happens provider-side.' },
    { q: 'What would make you pause the migration?', a: 'Reconciliation differences above an agreed threshold, rising entitlement DLQ volume, or a spike in care contacts about access or charges in the migrated cohort.' },
  ],
}
