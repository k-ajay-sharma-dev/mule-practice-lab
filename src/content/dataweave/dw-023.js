export default {
  id: 'dw-023',
  category: 'dataweave',
  title: 'Derive Field Names and Labels from Attribute Codes',
  level: 'BEGINNER',
  tags: ['strings', 'dw::core::Strings', 'camelize', 'dasherize', 'capitalize'],
  estMinutes: 10,
  description: `
The Product Information Management (PIM) system exposes attribute codes written either in \`snake_case\` or \`camelCase\`. The storefront team needs three spellings of every code:

| Field | Style | Example for \`shipping_weight_kg\` |
|---|---|---|
| \`apiField\` | camelCase | \`shippingWeightKg\` |
| \`cssClass\` | kebab-case (all lower case, words joined by \`-\`) | \`shipping-weight-kg\` |
| \`label\` | every word capitalized, joined by a space | \`Shipping Weight Kg\` |

**Rules**
- A new word starts after an underscore or at a lower-case → upper-case boundary (\`unitPrice\` → \`unit\`, \`Price\`). Digits stay with the word before them (\`ean13Code\` → \`ean13\`, \`Code\`).
- If \`required\` is \`true\`, append \`" *"\` to the label. A missing \`required\` counts as not required.
- Output one object per attribute with \`code\`, \`apiField\`, \`cssClass\`, \`label\` — in the input order.

Use the functions in \`dw::core::Strings\` rather than writing your own string splitting.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "code": "shipping_weight_kg", "required": true },
  { "code": "unitPrice", "required": false },
  { "code": "is_hazmat", "required": false }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "code": "shipping_weight_kg", "apiField": "shippingWeightKg", "cssClass": "shipping-weight-kg", "label": "Shipping Weight Kg *" },
  { "code": "unitPrice", "apiField": "unitPrice", "cssClass": "unit-price", "label": "Unit Price" },
  { "code": "is_hazmat", "apiField": "isHazmat", "cssClass": "is-hazmat", "label": "Is Hazmat" }
]`,
  },
  starterCode: `%dw 2.0
import * from dw::core::Strings
output application/json
---
payload
`,
  hints: [
    '`dw::core::Strings` has `camelize`, `dasherize` and `capitalize`. Import them with `import * from dw::core::Strings` (or by name).',
    'Try each one on `"unitPrice"` and `"is_hazmat"` in the editor to see what it does with both styles.',
    'Append the marker with `++` inside an `if/else`: `label ++ (if (a.required == true) " *" else "")`.',
  ],
  solution: `%dw 2.0
import camelize, dasherize, capitalize from dw::core::Strings
output application/json
---
payload map (a) -> {
  code: a.code,
  apiField: camelize(a.code),
  cssClass: dasherize(a.code),
  label: capitalize(a.code) ++ (if (a.required == true) " *" else "")
}`,
  explanation: `
- \`camelize\` removes underscores and capitalizes the following letter; a string that is already camelCase is returned unchanged.
- \`dasherize\` splits on underscores, spaces **and** case changes, lower-cases everything and joins with \`-\`.
- \`capitalize\` splits the same way and capitalizes each word, joining with spaces.

A common trap is checking \`if (a.required)\` when the field can be missing: \`if (null)\` fails because the condition must be a Boolean. Comparing with \`a.required == true\` is safe for missing values. Wrapping the \`if\` in parentheses is not required here, but it makes the concatenation easier to read.

Also note that \`camelize\` only understands underscores — it leaves \`max-order-qty\` untouched — which is why the rules limit the input to snake_case and camelCase.
`,
  tests: [
    {
      name: 'Digits inside a camelCase code',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '[{ "code": "ean13Code", "required": true }, { "code": "sku" }]',
        },
      ],
      expected:
        '[{ "code": "ean13Code", "apiField": "ean13Code", "cssClass": "ean13-code", "label": "Ean13 Code *" }, { "code": "sku", "apiField": "sku", "cssClass": "sku", "label": "Sku" }]',
    },
  ],
  followUps: [
    {
      q: 'How would you produce snake_case from these codes?',
      a: '`underscore` from `dw::core::Strings` does that: `underscore("unitPrice")` returns `"unit_price"`.',
    },
    {
      q: 'What would `camelize("HTTPStatus")` return, and why does it matter?',
      a: 'It returns `"hTTPStatus"` — it only lower-cases the first character. Acronyms break naive case conversion, so agree on naming rules with the source system or post-process known acronyms.',
    },
    {
      q: 'Why import functions by name instead of `import *`?',
      a: 'Naming the imports documents exactly which functions the script depends on and avoids name clashes with your own functions or variables.',
    },
  ],
}
