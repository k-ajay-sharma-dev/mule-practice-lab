export default {
  id: 'cs-091',
  category: 'case-studies',
  title: 'Payments Group Consolidating Four Acquired Payment Gateways Onto One Platform',
  level: 'EXPERT',
  tags: ['payments', 'fintech', 'm-and-a', 'consolidation', 'pci', 'tokenization', 'migration', 'decision-record'],
  estMinutes: 60,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Merchants must not change their integration on day one. Which design lets the group move traffic to the new platform behind the old endpoints?',
      options: [
        'Ask every merchant to switch to the new API before the old gateways are closed',
        'Keep the four legacy API contracts as facade Experience APIs that map to one canonical payment Process API, and route each merchant to the old or new back end by a migration flag',
        'Put a load balancer in front of the four gateways and spread traffic evenly',
        'Copy the code of the largest gateway and run it for all merchants',
      ],
      answer: 1,
      explain: 'Facades keep each acquired contract working while the processing moves underneath. A per-merchant flag lets the group move merchants in waves and roll back one merchant at a time. Forcing 18,000 merchants to re-integrate first would take years.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Stored cards for recurring billing sit in four different token vaults. How should they move to the group vault?',
      options: [
        'Export card numbers to CSV, transfer them over SFTP and import them',
        'Use a PCI DSS compliant vault-to-vault migration with encrypted transfer, keep a mapping from old tokens to new tokens, and translate old tokens at the facade until merchants update',
        'Ask every cardholder to enter their card again',
        'Keep all four vaults forever and call the right one per merchant',
      ],
      answer: 1,
      explain: 'Card data moves only between compliant parties with strong encryption and a documented process. A token mapping lets merchants keep sending the old token while the platform charges the new one. Asking cardholders again loses many recurring payments.',
    },
    {
      type: 'multi',
      prompt: 'Which three criteria matter most when choosing which acquired gateway, if any, becomes the target platform?',
      options: [
        'Ability to meet the group\'s volume and latency targets with headroom',
        'Coverage of the acquirers, payment methods and schemes the group needs',
        'PCI DSS level 1 compliance and the cost of keeping it',
        'Which acquired team is the largest',
        'Which gateway has the most attractive admin screens',
      ],
      answer: [0, 1, 2],
      explain: 'Capacity, payment coverage and compliance cost decide whether a platform can carry the whole group. Team size and screen design are not reasons to choose a payment core.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each risk of the consolidation to its main control.',
      pairs: [
        ['A merchant is charged on both old and new platforms during cut-over', 'Idempotency on the merchant order reference across both platforms'],
        ['Settlement totals differ after moving a merchant', 'Daily reconciliation per merchant of old and new platform settlements'],
        ['A large merchant fails on the new platform at peak', 'Per-merchant routing flag with instant rollback'],
        ['Webhooks change shape for a merchant', 'Facade maps new events back to the old webhook format'],
      ],
      explain: 'Each control targets one failure: duplicate charges, money mismatches, a bad cut-over, and a broken merchant integration.',
    },
    {
      type: 'order',
      prompt: 'Order the main phases of the consolidation.',
      items: [
        'Inventory merchants, contracts, payment methods, volumes and stored tokens per gateway',
        'Decide the target platform and canonical payment model in a decision record',
        'Build facades for the four legacy contracts and the per-merchant routing flag',
        'Migrate token vaults and move a pilot wave of low-risk merchants',
        'Move the remaining merchants in waves by risk, then decommission each old gateway',
      ],
      explain: 'Knowledge first, then the decision, then the facades that make moving safe, then a pilot, then waves. Decommissioning comes last, gateway by gateway.',
    },
    {
      type: 'single',
      prompt: 'Two acquired gateways report payment status with different codes (for example "SETTLED" and "CAPTURED_FINAL"). Where should the mapping to one status model live?',
      options: [
        'In each merchant\'s own code',
        'In the System API for each legacy gateway, mapping to the canonical status, so the Process API and facades see one model',
        'In the data warehouse only',
        'In a shared spreadsheet maintained by operations',
      ],
      answer: 1,
      explain: 'Each System API hides its back end\'s codes. The canonical model stays clean and the facades map it back to each legacy contract when needed.',
    },
  ],
  description: `
**Context.** A payments group bought four payment gateway companies in three years. Together they serve 18,000 online merchants and process 1.1 billion EUR a month.

| Gateway | Merchants | API style | Token vault | Notes |
|---|---|---|---|---|
| A (largest) | 9,000 | REST, JSON | Own vault, 6 million cards | Modern, cloud native |
| B | 5,000 | SOAP | Third-party vault | 15 year old Java platform |
| C | 2,500 | REST | Own vault | Strong in Nordic local methods |
| D | 1,500 | Form post and webhooks | Own vault | Small team, high churn |

**The problem.** Four platforms, four PCI DSS level 1 assessments, four acquirer contracts and four on-call teams. The board wants one platform in 30 months and a 40% lower run cost, without losing merchants.

**Constraints**
- Merchants cannot be forced to re-integrate in the first 18 months; many are small shops on plug-ins.
- Recurring billing depends on 9 million stored cards across the vaults.
- Acquirer and scheme rules must be met at every step; no outage longer than 5 minutes for any merchant.
- Peak 4,000 transactions per second at Black Friday, 99.99% availability.

**Your task.** Answer the questions on the consolidation strategy, token migration and risk controls.
`,
  answerTemplate: `## Choosing the target platform

## Keeping merchant contracts stable

## Token vault migration

## Moving merchants in waves

## Controls during coexistence

## Decommissioning and cost
`,
  keyPoints: [
    'Choose the target by criteria: capacity, payment coverage, compliance cost and operability, recorded in a decision record.',
    'Keep the four legacy contracts as facade Experience APIs over one canonical payment Process API, with a per-merchant routing flag.',
    'Move stored cards vault to vault under PCI DSS controls and translate old tokens to new ones at the facade.',
    'Migrate merchants in waves by risk with idempotency, reconciliation and instant rollback per merchant.',
    'Decommission each gateway when its last merchant has moved, which removes a PCI assessment and an acquirer contract each time.',
  ],
  solution: `
**Target.** Gateway A is likely the base (capacity, cloud native), extended with C's Nordic methods. The decision record compares the four against capacity, coverage, compliance and run cost.

**Facades.** \`exp-gateway-b-soap-api\`, \`exp-gateway-c-api\`, \`exp-gateway-d-forms-api\` keep the old contracts. Each maps to \`prc-payment-api\` (canonical). A routing flag per merchant decides old or new back end.

**Tokens.** Vault-to-vault migration per gateway, token map stored in the target vault, facades translate tokens on the way in.

**Waves.** Pilot 50 small merchants, then by size and risk; large merchants moved outside peak trading.

**Controls.** Idempotency on merchant order reference, daily settlement reconciliation, per-merchant rollback, webhook format mapping, and monitoring of approval rates per merchant before and after the move.
`,
  followUps: [
    { q: 'Why keep the old contracts as facades instead of asking merchants to move?', a: 'Small merchants on plug-ins cannot re-integrate quickly. Facades let the group change the processing first and move contracts later on the merchants\' own timeline.' },
    { q: 'What signal tells you a merchant\'s move went wrong even if nothing errors?', a: 'A drop in approval rate or a change in settlement totals compared with the weeks before. Both are tracked per merchant after each wave.' },
    { q: 'When can you switch off a legacy gateway?', a: 'When no merchant is routed to it, its tokens are migrated, the last settlements are reconciled and its scheme and acquirer obligations are closed.' },
  ],
}
