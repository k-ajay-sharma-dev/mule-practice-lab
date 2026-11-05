export default {
  id: 'dw-043',
  category: 'dataweave',
  title: 'Parse a Form-Encoded Payment Gateway Callback',
  level: 'BEGINNER',
  tags: ['x-www-form-urlencoded', 'multi-value-selector', 'coercion', 'default', 'webhooks'],
  estMinutes: 15,
  description: `
A legacy payment gateway calls your Mule HTTP Listener when a payment finishes.

**The callback**
- It does **not** send JSON. The body is \`application/x-www-form-urlencoded\`, exactly like an HTML form post.
- Every value therefore arrives as a **string**.
- The \`item\` field is **repeated** once per purchased SKU.

Turn the callback into the JSON event your order service expects:

| Output field | Rule |
|---|---|
| \`orderId\` | from \`order_id\` |
| \`amount\` | \`amount\` as a **number** |
| \`currency\` | \`currency\` upper-cased |
| \`paid\` | \`true\` only when \`status\` is exactly \`PAID\` |
| \`testMode\` | \`test_mode\` as a **boolean** (\`"true"\`/\`"false"\`) |
| \`note\` | the decoded \`note\`; \`null\` when the field is missing **or** empty |
| \`items\` | an array with **every** \`item\` value, in order; \`[]\` when there are none |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/x-www-form-urlencoded',
      content: 'order_id=SO-1001&amount=49.90&currency=eur&status=PAID&test_mode=false&note=Gift+wrap+%26+card&item=A-1&item=B-2&item=C-3',
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "SO-1001",
  "amount": 49.90,
  "currency": "EUR",
  "paid": true,
  "testMode": false,
  "note": "Gift wrap & card",
  "items": ["A-1", "B-2", "C-3"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Run `payload` alone first: the reader already URL-decodes values (`+` becomes a space, `%26` becomes `&`) and gives you an object whose keys can repeat.',
    '`payload.item` returns only the **first** `item`. The multi-value selector `payload.*item` returns all of them — but it returns `null` (not `[]`) when there is no `item` key at all.',
    'For the note, treat empty like missing: `if (isEmpty(payload.note)) null else payload.note`.',
  ],
  solution: `%dw 2.0
output application/json
---
{
  orderId: payload.order_id,
  amount: payload.amount as Number,
  currency: upper(payload.currency),
  paid: payload.status == "PAID",
  testMode: payload.test_mode as Boolean,
  note: if (isEmpty(payload.note)) null else payload.note,
  items: payload.*item default []
}`,
  explanation: `
The \`application/x-www-form-urlencoded\` reader turns \`a=1&b=2\` into an object and **decodes** each value, so you never call \`decodeURIComponent\` yourself. Because a form can repeat a field, the object can contain the same key several times — the same situation as repeated XML elements.

- \`payload.item\` (single-value selector) gives the first match only → \`"A-1"\`.
- \`payload.*item\` (multi-value selector) gives every match → \`["A-1", "B-2", "C-3"]\`, or \`null\` when there are none, hence \`default []\`.
- Everything is a String: \`"false"\` is truthy-looking text, so coerce with \`as Boolean\`; \`"49.90"\` needs \`as Number\`.
- \`isEmpty\` is \`true\` for both \`null\` and \`""\`, which covers \`note=\` as well as a missing note.

Common trap: writing \`testMode: payload.test_mode\` — the JSON then contains the string \`"false"\`, and a consumer doing \`if (testMode)\` treats it as true.
`,
  tests: [
    {
      name: 'No items, empty note, failed test payment',
      inputs: [
        {
          name: 'payload',
          mime: 'application/x-www-form-urlencoded',
          content: 'order_id=SO-2002&amount=0.5&currency=Usd&status=FAILED&test_mode=true&note=',
        },
      ],
      expected:
        '{ "orderId": "SO-2002", "amount": 0.5, "currency": "USD", "paid": false, "testMode": true, "note": null, "items": [] }',
    },
    {
      name: 'Single item, note missing',
      inputs: [
        {
          name: 'payload',
          mime: 'application/x-www-form-urlencoded',
          content: 'item=Z%2F9&status=paid&amount=12&currency=gbp&test_mode=false&order_id=SO-3003',
        },
      ],
      expected:
        '{ "orderId": "SO-3003", "amount": 12, "currency": "GBP", "paid": false, "testMode": false, "note": null, "items": ["Z/9"] }',
    },
  ],
  followUps: [
    {
      q: 'How do you send a form-encoded body to an API from Mule?',
      a: 'Build an object and write it with `output application/x-www-form-urlencoded`; the writer encodes the values. To repeat a field, put the same key twice in the object, e.g. `{ (items map (i) -> { item: i }) }`.',
    },
    {
      q: 'Where would the query parameters of a GET request be, and how are they different?',
      a: 'They are in `attributes.queryParams` on the HTTP Listener, already decoded, not in the payload. Repeated parameters are available as a multi-map, so `attributes.queryParams.*item` also works there.',
    },
    {
      q: 'Why not compare `status` case-insensitively?',
      a: 'The gateway contract says the code is upper-case `PAID`; normalizing unknown values silently can turn a `paid_pending` or a typo into a success. If the contract allows mixed case, compare `upper(payload.status) == "PAID"` and document it.',
    },
  ],
}
