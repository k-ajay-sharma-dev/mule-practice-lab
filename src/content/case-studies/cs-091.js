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
        'Repoint each old gateway’s DNS name to the new platform’s API on its migration day',
        'Keep each old contract as a facade API, with a per-merchant routing flag',
        'Put a load balancer in front of the four gateways to spread traffic evenly',
        'Keep the four gateways for current merchants, and onboard only new merchants on the new platform',
      ],
      answer: 1,
      explain: 'Facade Experience APIs keep each acquired contract working while they map to one canonical payment Process API underneath. A per-merchant flag lets the group move merchants in waves and roll back one merchant at a time. A DNS switch moves every merchant of a gateway at once, and the new API does not speak the old contract, so their calls fail. A load balancer cannot send one contract to a different gateway. Serving only new merchants never moves the existing traffic, so the old gateways never close.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Stored cards for recurring billing sit in four different token vaults. How should they move to the group vault?',
      options: [
        'Detokenise in each old vault and retokenise in the group vault through a Mule batch job',
        'Run a compliant vault-to-vault move and map old tokens to new ones',
        'Move each card to the group vault on its next successful charge through the old vault',
        'Keep all four vaults and call the right one for each merchant',
      ],
      answer: 1,
      explain: 'Card data moves only between compliant parties with strong encryption and a documented process. A token mapping lets merchants keep sending the old token while the facade translates it and the platform charges the new one. A Mule batch job that detokenises puts card numbers through the integration layer, which pulls it into PCI scope. Moving cards on their next charge keeps the old vaults alive for as long as the slowest billing cycle, and cards that never charge again never move. Keeping four vaults keeps four PCI scopes and their cost.',
    },
    {
      type: 'multi',
      prompt: 'Which three criteria matter most when choosing which acquired gateway, if any, becomes the target platform?',
      options: [
        'Ability to meet the group\'s volume and latency targets with headroom',
        'Coverage of the acquirers, payment methods and schemes the group needs',
        'PCI DSS level 1 compliance and the cost of keeping it',
        'Which platform the most of the group’s engineers already know',
        'Which gateway has the most complete merchant admin screens and reports',
      ],
      answer: [0, 1, 2],
      explain: 'Capacity, payment coverage and compliance cost decide whether a platform can carry the whole group. Familiarity and admin screens help, but neither decides whether a payment core can carry the group’s volume, methods and compliance.',
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
        'In each merchant’s own code, as merchants handle the codes today',
        'In each legacy gateway’s System API, mapping to the canonical status',
        'In the data warehouse, where the reports join the codes together',
        'In each facade Experience API, so every contract keeps its own codes',
      ],
      answer: 1,
      explain: 'Each System API hides its back end’s codes, so the Process API and facades see one model. The facades then map the canonical status back to each legacy contract when needed. Merchant code and the warehouse are too late, and mapping only in the facades leaves the Process API with four sets of codes.',
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
