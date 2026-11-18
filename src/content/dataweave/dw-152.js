export default {
  id: 'dw-152',
  category: 'dataweave',
  title: 'Bill Message Volumes Through Progressive Price Tiers',
  level: 'ADVANCED',
  tags: ['tiered-pricing', 'reduce', 'accumulator', 'min', 'max', 'round', 'billing', 'json'],
  estMinutes: 25,
  description: `
Tidewater Messaging sends text messages for its business customers and bills them each month. The price falls as volume grows, but each tier only applies to the messages **inside** it, the way income tax bands work:

| Tier | Messages | Price per message |
|---|---|---|
| 1 | 1 to 1,000 | 0.50 |
| 2 | 1,001 to 5,000 | 0.40 |
| 3 | above 5,000 | 0.25 |

A customer who sends 3,200 messages pays 1,000 at 0.50 and 2,200 at 0.40.

The tiers come in the payload, ordered by \`upTo\`. The last tier has \`upTo: null\`, which means no upper limit.

Output one object per customer with:

- \`customer\` and \`messages\`: copied from the input
- \`bands\`: one entry per tier the customer reached, with \`upTo\`, \`units\`, \`price\` and \`charge\`. Leave out tiers with no units.
- \`total\`: the sum of the charges

Round each charge and the total to 2 decimal places.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "tiers": [
    { "upTo": 1000, "price": 0.50 },
    { "upTo": 5000, "price": 0.40 },
    { "upTo": null, "price": 0.25 }
  ],
  "usage": [
    { "customer": "Harbour Taxis", "messages": 640 },
    { "customer": "Northgate Couriers", "messages": 3200 },
    { "customer": "Quayside Pharmacy", "messages": 7450 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "customer": "Harbour Taxis", "messages": 640, "bands": [{ "upTo": 1000, "units": 640, "price": 0.50, "charge": 320 }], "total": 320 },
  { "customer": "Northgate Couriers", "messages": 3200, "bands": [{ "upTo": 1000, "units": 1000, "price": 0.50, "charge": 500 }, { "upTo": 5000, "units": 2200, "price": 0.40, "charge": 880 }], "total": 1380 },
  { "customer": "Quayside Pharmacy", "messages": 7450, "bands": [{ "upTo": 1000, "units": 1000, "price": 0.50, "charge": 500 }, { "upTo": 5000, "units": 4000, "price": 0.40, "charge": 1600 }, { "upTo": null, "units": 2450, "price": 0.25, "charge": 612.5 }], "total": 2712.5 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
fun money(n) = round(n * 100) / 100
---
payload.usage map (u) -> {
  customer: u.customer,
  messages: u.messages,
  total: money(u.messages * payload.tiers[0].price)
}
`,
  hints: [
    'Each tier needs to know where the previous one ended. A `reduce` over the tiers can carry that start point.',
    'Use an accumulator such as `{ from: 0, bands: [] }`. For a tier, the top of the band is `min([t.upTo, messages])`, or `messages` when `upTo` is null.',
    'The units in the band are `max([top - acc.from, 0])`. Once the messages run out, later tiers get 0 units.',
    'Add a band only when it has units, and move `from` up to `t.upTo` for the next tier.',
    'Round each charge with `money`, then add the rounded charges with `sum` and round the total once more.',
  ],
  solution: `%dw 2.0
output application/json
fun money(n) = round(n * 100) / 100

fun bandsFor(messages) = (payload.tiers reduce ((t, acc = { from: 0, bands: [] }) -> do {
  var top = if (t.upTo == null) messages else min([t.upTo, messages])
  var units = max([top - acc.from, 0])
  ---
  {
    from: if (t.upTo == null) acc.from else t.upTo,
    bands: acc.bands ++ (if (units > 0) [{ upTo: t.upTo, units: units, price: t.price, charge: money(units * t.price) }] else [])
  }
})).bands
---
payload.usage map (u) -> do {
  var bands = bandsFor(u.messages)
  ---
  {
    customer: u.customer,
    messages: u.messages,
    bands: bands,
    total: money(sum(bands map $.charge))
  }
}`,
  explanation: `
**Progressive, not flat.** A flat tier would charge all 3,200 messages at 0.40. A progressive tier charges each message at the price of the band it falls in, so the first 1,000 always cost 0.50. This is how tax bands and many usage plans work.

**reduce carries the start of the band.** Each tier covers the messages from the end of the last tier up to its own \`upTo\`. The accumulator keeps that start point in \`from\` and the bands built so far.

**min and max do the cutting.** \`min([t.upTo, messages])\` stops the band at the customer's volume. \`max([top - from, 0])\` stops the units going below zero when the volume ended in an earlier tier.

**The open tier.** \`upTo: null\` means no limit, so the top is the volume itself.

**Rounding.** Charges are rounded to cents per band, because that is what an invoice line shows. The total adds the rounded lines, so the invoice always adds up.
`,
  tests: [
    {
      name: 'Exactly on a tier edge',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "tiers": [{ "upTo": 1000, "price": 0.50 }, { "upTo": 5000, "price": 0.40 }, { "upTo": null, "price": 0.25 }], "usage": [{ "customer": "Elm Dental", "messages": 1000 }, { "customer": "Pier Cafe", "messages": 1001 }] }',
        },
      ],
      expected:
        '[{ "customer": "Elm Dental", "messages": 1000, "bands": [{ "upTo": 1000, "units": 1000, "price": 0.50, "charge": 500 }], "total": 500 }, { "customer": "Pier Cafe", "messages": 1001, "bands": [{ "upTo": 1000, "units": 1000, "price": 0.50, "charge": 500 }, { "upTo": 5000, "units": 1, "price": 0.40, "charge": 0.4 }], "total": 500.4 }]',
    },
    {
      name: 'No messages',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "tiers": [{ "upTo": 1000, "price": 0.50 }, { "upTo": null, "price": 0.25 }], "usage": [{ "customer": "Old Mill Hotel", "messages": 0 }] }',
        },
      ],
      expected: '[{ "customer": "Old Mill Hotel", "messages": 0, "bands": [], "total": 0 }]',
    },
  ],
  followUps: [
    {
      q: 'The sales team offers one customer a different tier table. Where does that fit?',
      a: 'Look up the tiers per customer, with the standard table as the default. The bandsFor function then takes the tiers as a parameter instead of reading payload.tiers.',
    },
    {
      q: 'Why round each band and not only the total?',
      a: 'The invoice shows each band as a line. If the lines are rounded but the total is not, the printed lines may not add up to the printed total.',
    },
    {
      q: 'How would you test the tier edges?',
      a: 'Add cases at each limit and one above it, such as 1000, 1001, 5000 and 5001 messages, plus zero. Off by one mistakes show up at these edges.',
    },
  ],
}
