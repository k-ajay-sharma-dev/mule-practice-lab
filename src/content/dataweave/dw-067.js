export default {
  id: 'dw-067',
  category: 'dataweave',
  title: 'Apply the Best Promotion per Line and Allocate a Basket Coupon',
  level: 'EXPERT',
  tags: ['retail', 'promotions', 'pricing', 'reduce', 'rounding', 'allocation', 'json'],
  estMinutes: 45,
  description: `
The omnichannel order service sends a basket to a Mule pricing API before checkout. Implement the promotion calculation.

**Inputs**
- \`payload\` — the basket: \`basketId\` and \`lines\` (\`lineId\`, \`sku\`, \`category\`, \`qty\`, \`unitPrice\`, optional \`clearance\`).
- \`promotions\` — line promotions, in priority order. Three kinds:
  - \`MULTIBUY\` (\`skus\`, \`buy\`, \`pay\`): for every complete group of \`buy\` units of a listed SKU, only \`pay\` are charged. Discount = \`floor(qty / buy) * (buy - pay) * unitPrice\`.
  - \`PERCENT_CATEGORY\` (\`category\`, \`pct\`): discount = \`qty * unitPrice * pct / 100\`.
  - \`AMOUNT_OFF_SKU\` (\`skus\`, \`amount\`): \`amount\` off each unit, never more than the unit price. Discount = \`qty * min(amount, unitPrice)\`.
- \`coupon\` — a basket coupon \`{ code, pctOff, minSpend }\`, or \`null\`.

**Rules**
1. Every discount amount is rounded to 2 decimals (half up) as soon as it is calculated.
2. Lines with \`clearance: true\` get **no** promotion and **no** coupon.
3. Each other line gets **at most one** promotion: the one with the **largest** discount. On a tie, the promotion listed **first** wins. A promotion that gives 0 does not apply.
4. The coupon is not combinable: it applies only to lines that got **no** promotion (and are not clearance). Their gross total is the coupon base. The coupon applies when there is a coupon and the base is \`>= minSpend\` and \`> 0\`.
5. Coupon total = \`base * pctOff / 100\`, rounded to 2 decimals. It is **allocated** to the coupon lines in proportion to their gross (each share rounded to 2 decimals), except the **last** coupon line, which gets the remainder so that the shares add up exactly to the coupon total.

**Output** — \`basketId\`; \`lines\` in input order with \`lineId\`, \`sku\`, \`gross\` (\`qty * unitPrice\`), \`promoId\` (or \`null\`), \`promoDiscount\`, \`couponDiscount\`, \`net\`; \`coupon\` as \`{ code, applied, discount }\` (or \`null\` without coupon); \`totals\` with \`gross\`, \`discount\` (all promo and coupon discounts) and \`net\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "basketId": "B-77120",
  "lines": [
    { "lineId": "L1", "sku": "SOAP-01", "category": "BATH", "qty": 4, "unitPrice": 3.49 },
    { "lineId": "L2", "sku": "TOWEL-07", "category": "BATH", "qty": 2, "unitPrice": 14.99 },
    { "lineId": "L3", "sku": "CANDLE-3", "category": "HOME", "qty": 1, "unitPrice": 24.00 },
    { "lineId": "L4", "sku": "VASE-11", "category": "HOME", "qty": 1, "unitPrice": 17.50 },
    { "lineId": "L5", "sku": "MAT-02", "category": "BATH", "qty": 1, "unitPrice": 9.99, "clearance": true },
    { "lineId": "L6", "sku": "LAMP-5", "category": "HOME", "qty": 2, "unitPrice": 6.33 }
  ]
}`,
    },
    {
      name: 'promotions',
      mime: 'application/json',
      content: `[
  { "id": "P-3FOR2", "kind": "MULTIBUY", "skus": ["SOAP-01"], "buy": 3, "pay": 2 },
  { "id": "P-BATH15", "kind": "PERCENT_CATEGORY", "category": "BATH", "pct": 15 },
  { "id": "P-TOWEL225", "kind": "AMOUNT_OFF_SKU", "skus": ["TOWEL-07", "MAT-02"], "amount": 2.25 }
]`,
    },
    {
      name: 'coupon',
      mime: 'application/json',
      content: `{ "code": "WELCOME10", "pctOff": 10, "minSpend": 40 }`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "basketId": "B-77120",
  "lines": [
    { "lineId": "L1", "sku": "SOAP-01", "gross": 13.96, "promoId": "P-3FOR2", "promoDiscount": 3.49, "couponDiscount": 0, "net": 10.47 },
    { "lineId": "L2", "sku": "TOWEL-07", "gross": 29.98, "promoId": "P-BATH15", "promoDiscount": 4.50, "couponDiscount": 0, "net": 25.48 },
    { "lineId": "L3", "sku": "CANDLE-3", "gross": 24.00, "promoId": null, "promoDiscount": 0, "couponDiscount": 2.40, "net": 21.60 },
    { "lineId": "L4", "sku": "VASE-11", "gross": 17.50, "promoId": null, "promoDiscount": 0, "couponDiscount": 1.75, "net": 15.75 },
    { "lineId": "L5", "sku": "MAT-02", "gross": 9.99, "promoId": null, "promoDiscount": 0, "couponDiscount": 0, "net": 9.99 },
    { "lineId": "L6", "sku": "LAMP-5", "gross": 12.66, "promoId": null, "promoDiscount": 0, "couponDiscount": 1.27, "net": 11.39 }
  ],
  "coupon": { "code": "WELCOME10", "applied": true, "discount": 5.42 },
  "totals": { "gross": 108.09, "discount": 13.41, "net": 94.68 }
}`,
  },
  starterCode: `%dw 2.0
output application/json
fun round2(n) = round(n * 100) / 100
---
payload
`,
  hints: [
    'Write `discountFor(promo, line)` with `match` on `promo.kind`; return `0` when the promotion does not cover the line.',
    'Per line: map every promotion to `{ id, amount }`, drop the zeros, and pick the winner with `reduce (o, acc) -> if (o.amount > acc.amount) o else acc` — strict `>` keeps the earlier one on a tie.',
    'Allocation: map the coupon lines with their index; every line except the last gets `round2(total * gross / base)`; the last gets `total - sum(of the others)`.',
    'Build a `lineId → couponDiscount` object so the final line mapping can look the share up with `shares[l.lineId] default 0`.',
    'L2 is a tie: 15% of 29.98 is 4.497 → 4.50, and 2 × 2.25 is also 4.50.',
  ],
  solution: `%dw 2.0
output application/json
fun round2(n) = round(n * 100) / 100
fun discountFor(p, l) = p.kind match {
  case "MULTIBUY" -> if (p.skus contains l.sku) floor(l.qty / p.buy) * (p.buy - p.pay) * l.unitPrice else 0
  case "PERCENT_CATEGORY" -> if (p.category == l.category) l.qty * l.unitPrice * p.pct / 100 else 0
  case "AMOUNT_OFF_SKU" -> if (p.skus contains l.sku) l.qty * min([p.amount, l.unitPrice]) else 0
  else -> 0
}
var lines = payload.lines map (l) -> do {
  var clearance = l.clearance default false
  var offers = if (clearance) [] else
    ((promotions default []) map (p) -> { id: p.id, amount: round2(discountFor(p, l)) }) filter ($.amount > 0)
  var best = offers reduce (o, acc) -> if (o.amount > acc.amount) o else acc
  ---
  {
    lineId: l.lineId,
    sku: l.sku,
    gross: l.qty * l.unitPrice,
    clearance: clearance,
    promoId: best.id,
    promoDiscount: best.amount default 0
  }
}
var couponLines = lines filter ((not $.clearance) and $.promoId == null)
var base = sum(couponLines map $.gross)
var applies = coupon != null and base > 0 and base >= coupon.minSpend
var couponTotal = if (applies) round2(base * coupon.pctOff / 100) else 0
var lastIndex = sizeOf(couponLines) - 1
var firstShares = if (applies) couponLines map (c, i) -> { id: c.lineId, share: if (i == lastIndex) null else round2(couponTotal * c.gross / base) } else []
var allocated = sum((firstShares filter ($.share != null)) map $.share)
var shares = { (firstShares map (s) -> { (s.id): s.share default (couponTotal - allocated) }) }
var outLines = lines map (l) -> do {
  var c = shares[l.lineId] default 0
  ---
  {
    lineId: l.lineId,
    sku: l.sku,
    gross: l.gross,
    promoId: l.promoId,
    promoDiscount: l.promoDiscount,
    couponDiscount: c,
    net: l.gross - l.promoDiscount - c
  }
}
var totalGross = sum(outLines map $.gross)
var totalDiscount = sum(outLines map ($.promoDiscount + $.couponDiscount))
---
{
  basketId: payload.basketId,
  lines: outLines,
  coupon: if (coupon == null) null else { code: coupon.code, applied: applies, discount: couponTotal },
  totals: { gross: totalGross, discount: totalDiscount, net: totalGross - totalDiscount }
}`,
  explanation: `
**Evaluate, then choose.** Each line is priced against **every** promotion, the zeros are dropped and \`reduce\` picks the largest. Using strict \`>\` means the accumulator (the earlier promotion) survives a tie, which implements "listed first wins" without any sorting. \`reduce\` on an empty list returns \`null\`, so \`best.id\` is \`null\` and \`best.amount default 0\` gives 0 for lines without a promotion.

**Round early, as specified.** Rule 1 rounds each discount immediately: L2's 15% is 4.497 → 4.50, which ties with the 4.50 amount-off. Comparing the unrounded amounts would make P-TOWEL225 the winner instead (4.497 < 4.50) — in pricing, the rounding point is part of the business rule, and it must be identical in the POS, the web shop and the integration, or the receipt and the web basket disagree by a cent.

**Allocation with a remainder line.** The coupon (10% of 54.16 = 5.42) has to be spread over L3, L4 and L6 so that returns and refunds can give back the right share per line. Rounding each share independently can create or lose a cent (two lines of 5.05 with 10% give 0.505 + 0.505 → 0.51 + 0.51 = 1.02 for a 1.01 coupon). Giving the last line the remainder guarantees that the shares add up exactly to the total.

**Building a lookup object.** \`{ (array of single-key objects) }\` merges them into one object (\`{ "L3": 2.40, "L4": 1.75, "L6": 1.27 }\`), so the final pass can find a line's share by key with \`default 0\` for all other lines.

**Totals from the lines.** Totals are summed from the final line values, not recomputed from the inputs, so \`totals.net\` always equals the sum of the line nets.
`,
  tests: [
    {
      name: 'Coupon remainder goes to the last line',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "basketId": "B-2", "lines": [ { "lineId": "A", "sku": "X1", "category": "KITCHEN", "qty": 1, "unitPrice": 5.05 }, { "lineId": "B", "sku": "X2", "category": "KITCHEN", "qty": 1, "unitPrice": 5.05 } ] }',
        },
        { name: 'promotions', mime: 'application/json', content: '[]' },
        { name: 'coupon', mime: 'application/json', content: '{ "code": "TENOFF", "pctOff": 10, "minSpend": 10 }' },
      ],
      expected:
        '{ "basketId": "B-2", "lines": [ { "lineId": "A", "sku": "X1", "gross": 5.05, "promoId": null, "promoDiscount": 0, "couponDiscount": 0.51, "net": 4.54 }, { "lineId": "B", "sku": "X2", "gross": 5.05, "promoId": null, "promoDiscount": 0, "couponDiscount": 0.50, "net": 4.55 } ], "coupon": { "code": "TENOFF", "applied": true, "discount": 1.01 }, "totals": { "gross": 10.10, "discount": 1.01, "net": 9.09 } }',
    },
    {
      name: 'Coupon below minimum spend; amount-off capped at unit price',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "basketId": "B-3", "lines": [ { "lineId": "A", "sku": "PEN-1", "category": "OFFICE", "qty": 5, "unitPrice": 0.80 }, { "lineId": "B", "sku": "PAD-2", "category": "OFFICE", "qty": 2, "unitPrice": 3.00 }, { "lineId": "C", "sku": "INK-3", "category": "OFFICE", "qty": 2, "unitPrice": 4.00 } ] }',
        },
        {
          name: 'promotions',
          mime: 'application/json',
          content:
            '[ { "id": "P-PEN", "kind": "AMOUNT_OFF_SKU", "skus": ["PEN-1"], "amount": 1.00 }, { "id": "P-3FOR2-INK", "kind": "MULTIBUY", "skus": ["INK-3"], "buy": 3, "pay": 2 } ]',
        },
        { name: 'coupon', mime: 'application/json', content: '{ "code": "SPEND20", "pctOff": 5, "minSpend": 20 }' },
      ],
      expected:
        '{ "basketId": "B-3", "lines": [ { "lineId": "A", "sku": "PEN-1", "gross": 4.00, "promoId": "P-PEN", "promoDiscount": 4.00, "couponDiscount": 0, "net": 0 }, { "lineId": "B", "sku": "PAD-2", "gross": 6.00, "promoId": null, "promoDiscount": 0, "couponDiscount": 0, "net": 6.00 }, { "lineId": "C", "sku": "INK-3", "gross": 8.00, "promoId": null, "promoDiscount": 0, "couponDiscount": 0, "net": 8.00 } ], "coupon": { "code": "SPEND20", "applied": false, "discount": 0 }, "totals": { "gross": 18.00, "discount": 4.00, "net": 14.00 } }',
    },
  ],
  followUps: [
    {
      q: 'Why should the pricing API be the single source of truth instead of letting the web shop and the POS calculate promotions themselves?',
      a: 'Two implementations drift: different rounding points, tie-breaks or eligibility rules produce baskets that cost a cent more online than in store, and price-match and refund disputes follow. One pricing service, called by both channels, guarantees identical results.',
    },
    {
      q: 'A customer bought three soaps on the 3-for-2 and returns one. How much do you refund?',
      a: 'That is a business rule to agree up front. A common approach is to recalculate the basket without the returned unit (2 soaps → no multibuy). Then refund the difference between the original and the new net, so the customer cannot keep the free item. Storing the per-line discount allocation makes this possible.',
    },
    {
      q: 'Marketing wants "best combination of promotions" instead of "best single promotion per line". What changes?',
      a: 'It becomes an optimisation problem across lines (e.g. a mix-and-match deal competing with category discounts), usually solved by evaluating combinations or with a dedicated promotion engine. DataWeave can express it, but for more than a few promotions it belongs in a specialised service, not in a mapping.',
    },
  ],
}
