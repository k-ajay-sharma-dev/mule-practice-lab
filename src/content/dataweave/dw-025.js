export default {
  id: 'dw-025',
  category: 'dataweave',
  title: 'Patch a Nested Order with the update Operator',
  level: 'INTERMEDIATE',
  tags: ['update', 'nested', 'objects', 'json'],
  estMinutes: 15,
  description: `
Before an order is sent to the ERP, the Order Process API has to fix a few fields **deep inside** the payload and leave everything else exactly as it is (the ERP adapter rejects unknown changes).

**Rules**
- \`status\` becomes \`"SUBMITTED"\`.
- \`customer.email\` is trimmed and lower-cased.
- \`customer.address.country\` is upper-cased.
- Every item in \`lines\` gets an extra field \`lineTotal\` = \`qty * unitPrice\`.
- \`meta.source\` is set to \`"WEB"\` **only if it is missing**. An existing value is kept. If \`meta\` itself is missing, it is created.
- Every other field stays unchanged.

Every order has \`customer.email\` and \`customer.address.country\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "orderId": "ORD-5001",
  "status": "DRAFT",
  "customer": {
    "id": "C-77",
    "email": "  Asha.Rao@Example.COM ",
    "address": { "city": "Utrecht", "country": "nl" }
  },
  "lines": [
    { "sku": "A-1", "qty": 2, "unitPrice": 10 },
    { "sku": "B-7", "qty": 1, "unitPrice": 4.5 }
  ],
  "meta": { "createdBy": "checkout-ui" }
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "orderId": "ORD-5001",
  "status": "SUBMITTED",
  "customer": {
    "id": "C-77",
    "email": "asha.rao@example.com",
    "address": { "city": "Utrecht", "country": "NL" }
  },
  "lines": [
    { "sku": "A-1", "qty": 2, "unitPrice": 10, "lineTotal": 20 },
    { "sku": "B-7", "qty": 1, "unitPrice": 4.5, "lineTotal": 4.5 }
  ],
  "meta": { "createdBy": "checkout-ui", "source": "WEB" }
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`payload update { case e at .customer.email -> ... }` replaces just that value and copies the rest of the object for you.',
    'You can list several `case ... at ...` lines inside one `update` block. For `lines`, the matched value is the whole array, so `map` over it.',
    'A trailing `!` on the path (`.meta.source!`) creates the field when it does not exist — then the matched value is `null`, so `default` keeps an existing value.',
  ],
  solution: `%dw 2.0
output application/json
---
payload update {
  case .status -> "SUBMITTED"
  case e at .customer.email -> lower(trim(e))
  case c at .customer.address.country -> upper(c)
  case lines at .lines -> lines map (l) -> l ++ { lineTotal: l.qty * l.unitPrice }
  case s at .meta.source! -> s default "WEB"
}`,
  explanation: `
Without \`update\` you would rebuild every level by hand — \`payload - "customer" ++ { customer: payload.customer - "address" ++ { ... } }\` — which is long and easy to break (and changes key order).

\`update\` walks to each path, replaces only the matched value and copies everything else.

- \`case .status -> "SUBMITTED"\` — the \`name at\` part is optional when you do not need the old value.
- \`case s at .meta.source!\` — the \`!\` means "create this path if it is missing" (including the parent \`meta\` object). Without \`!\`, a missing field is simply not matched and nothing is added.

The trap: writing \`case s at .meta.source -> s default "WEB"\` (no \`!\`). It passes when \`meta.source\` exists but silently does nothing when it does not.
`,
  tests: [
    {
      name: 'Existing source is kept, empty lines',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "orderId": "O-1", "status": "DRAFT", "customer": { "email": "A@B.IO", "address": { "country": "de" } }, "lines": [], "meta": { "source": "MOBILE" } }',
        },
      ],
      expected:
        '{ "orderId": "O-1", "status": "SUBMITTED", "customer": { "email": "a@b.io", "address": { "country": "DE" } }, "lines": [], "meta": { "source": "MOBILE" } }',
    },
    {
      name: 'Missing meta object is created',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "orderId": "O-2", "status": "DRAFT", "customer": { "email": "x@y.io", "address": { "country": "Fr" } }, "lines": [{ "sku": "Z", "qty": 3, "unitPrice": 2 }] }',
        },
      ],
      expected:
        '{ "orderId": "O-2", "status": "SUBMITTED", "customer": { "email": "x@y.io", "address": { "country": "FR" } }, "lines": [{ "sku": "Z", "qty": 3, "unitPrice": 2, "lineTotal": 6 }], "meta": { "source": "WEB" } }',
    },
  ],
  followUps: [
    {
      q: 'How would you apply the same patch to an array of orders?',
      a: '`update` paths start at the value it is applied to, so map first: `payload map ($ update { ... })`.',
    },
    {
      q: 'How would you change only some lines, e.g. those with qty > 10?',
      a: '`update` paths address fixed positions (e.g. `.lines[0]`), not "every element matching a condition", so keep the `map` over `lines` and use `if (l.qty > 10) ... else l` inside it.',
    },
    {
      q: 'Which DataWeave version introduced `update`?',
      a: 'DataWeave 2.3 (Mule 4.3). On older runtimes you have to rebuild the object with `mapObject` or `-` and `++`.',
    },
  ],
}
