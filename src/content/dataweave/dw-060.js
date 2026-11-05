export default {
  id: 'dw-060',
  category: 'dataweave',
  title: 'Loyalty Points for a POS Receipt with Tier Bonuses',
  level: 'INTERMEDIATE',
  tags: ['retail', 'loyalty', 'pos', 'filter', 'floor', 'null-handling', 'json'],
  estMinutes: 15,
  description: `
When a till closes a receipt, the POS publishes it to a JMS queue and a Mule flow calls the loyalty platform to credit points. Write the transformation that calculates the points for one receipt.

**Rules**
- **Eligible spend** is the sum of \`qty * unitPrice\` over all lines **except** those in category \`GIFT_CARD\` or \`FEES\` (gift cards and bag fees never earn points).
- \`basePoints\` = eligible spend rounded **down** to a whole number (1 point per whole currency unit).
- Tier bonus multipliers: \`BASIC\` 1, \`SILVER\` 1.25, \`GOLD\` 1.5. A tier not in this list counts as \`BASIC\`.
- \`bonusPoints\` = \`basePoints * (multiplier - 1)\`, rounded **down**.
- \`totalPoints\` = \`basePoints + bonusPoints\`.
- A guest receipt has \`"member": null\`: \`memberId\` and \`tier\` are \`null\` and all three point fields are \`0\` — but \`eligibleSpend\` is still reported (the store dashboards use it to show "points you could have earned").

Output one object: \`receiptId\`, \`memberId\`, \`tier\`, \`eligibleSpend\`, \`basePoints\`, \`bonusPoints\`, \`totalPoints\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "receiptId": "R-S014-02-1001",
  "storeId": "S014",
  "member": { "id": "M-5521", "tier": "GOLD" },
  "lines": [
    { "sku": "TSHIRT-01", "category": "APPAREL", "qty": 2, "unitPrice": 12.99 },
    { "sku": "GC-50", "category": "GIFT_CARD", "qty": 1, "unitPrice": 50 },
    { "sku": "JEANS-07", "category": "APPAREL", "qty": 1, "unitPrice": 49.95 },
    { "sku": "BAG-PLASTIC", "category": "FEES", "qty": 1, "unitPrice": 0.10 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "receiptId": "R-S014-02-1001",
  "memberId": "M-5521",
  "tier": "GOLD",
  "eligibleSpend": 75.93,
  "basePoints": 75,
  "bonusPoints": 37,
  "totalPoints": 112
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Filter the lines with `!(["GIFT_CARD", "FEES"] contains $.category)`, map each to `$.qty * $.unitPrice` and `sum` the result.',
    '`floor(n)` rounds down; `floor(75 * 0.5)` is `37`.',
    'Keep the multipliers in an object and look them up with a dynamic selector: `multipliers[tier] default 1` handles unknown tiers.',
    'Selecting `.id` on a `null` member gives `null`, so `payload.member.id` needs no special case — but the points do.',
  ],
  solution: `%dw 2.0
output application/json
var multipliers = { BASIC: 1, SILVER: 1.25, GOLD: 1.5 }
var excluded = ["GIFT_CARD", "FEES"]
var member = payload.member
var eligible = sum((payload.lines default []) filter (!(excluded contains $.category)) map ($.qty * $.unitPrice))
var multiplier = multipliers[member.tier default "BASIC"] default 1
var base = if (member == null) 0 else floor(eligible)
var bonus = if (member == null) 0 else floor(base * (multiplier - 1))
---
{
  receiptId: payload.receiptId,
  memberId: member.id,
  tier: member.tier,
  eligibleSpend: eligible,
  basePoints: base,
  bonusPoints: bonus,
  totalPoints: base + bonus
}`,
  explanation: `
**Eligible spend.** \`filter\` then \`map\` then \`sum\` is the standard "total of some lines" pattern. \`sum([])\` is \`0\`, so a receipt that only sells a gift card simply earns nothing. DataWeave numbers are decimals, so \`2 * 12.99 + 49.95\` is exactly \`75.93\` — no floating-point drift like \`75.93000000000001\`.

**Rounding.** Loyalty programmes almost always round **down** (never give away a fraction of a point). Rounding happens twice: once for the base, once for the bonus. Computing \`floor(eligible * 1.5)\` in one step would give \`113\` instead of \`112\` — a different rule, which is why the rule must be written down precisely and agreed with the loyalty team.

**Lookup with a default.** \`multipliers[member.tier default "BASIC"]\` is a dynamic key selector; an unknown tier returns \`null\`, and \`default 1\` turns it into the BASIC multiplier.

**Guests.** \`member.id\` on a \`null\` member is \`null\` (null-safe selectors), so the object shape stays the same for guests and members — the consumer never has to check whether a key exists.
`,
  tests: [
    {
      name: 'Guest receipt',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "receiptId": "R-9", "storeId": "S001", "member": null, "lines": [ { "sku": "A", "category": "HOME", "qty": 1, "unitPrice": 30.5 }, { "sku": "GC", "category": "GIFT_CARD", "qty": 1, "unitPrice": 20 } ] }',
        },
      ],
      expected:
        '{ "receiptId": "R-9", "memberId": null, "tier": null, "eligibleSpend": 30.5, "basePoints": 0, "bonusPoints": 0, "totalPoints": 0 }',
    },
    {
      name: 'Silver member with a fee line',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "receiptId": "R-10", "storeId": "S001", "member": { "id": "M-1", "tier": "SILVER" }, "lines": [ { "sku": "B", "category": "BEAUTY", "qty": 3, "unitPrice": 9.99 }, { "sku": "FEE", "category": "FEES", "qty": 2, "unitPrice": 0.25 } ] }',
        },
      ],
      expected:
        '{ "receiptId": "R-10", "memberId": "M-1", "tier": "SILVER", "eligibleSpend": 29.97, "basePoints": 29, "bonusPoints": 7, "totalPoints": 36 }',
    },
  ],
  followUps: [
    {
      q: 'The receipt arrives on an ActiveMQ queue and the loyalty API call times out. How do you avoid crediting points twice on redelivery?',
      a: 'Send the `receiptId` as an idempotency key to the loyalty API (or check it in an idempotent-message-validator / Object Store before calling). Redelivery of the JMS message is then harmless: the second attempt is recognised as a duplicate.',
    },
    {
      q: 'How would you handle a return of an item that earned points?',
      a: 'Treat the return as a negative receipt referencing the original: recompute the points on the returned lines with the same rules and post a debit. Storing the points per original receipt line makes partial returns exact.',
    },
    {
      q: 'Where would you keep the tier multipliers so marketing can change them without a redeploy?',
      a: 'In configuration (a properties file per environment or a lookup table/API), loaded into a variable and passed to the script, e.g. as `vars.multipliers`. The DataWeave logic stays the same; only the data changes.',
    },
  ],
}
