export default {
  id: 'dw-083',
  category: 'dataweave',
  title: 'Clean Insurance Policy XML with Optional Elements and Mixed Attributes',
  level: 'INTERMEDIATE',
  tags: ['xml', 'json', 'data-formats', 'attributes', 'multi-value-selector', 'conditional-keys'],
  estMinutes: 25,
  description: `
An insurer is replacing a policy administration system in stages, and its nightly XML export now contains records written by both the old and the new modules. Older policies carry the premium as an **attribute**, newer ones as a **child element**, and many elements are optional or repeat. The customer portal API wants clean JSON: predictable arrays, real numbers and booleans, and no placeholder keys for data that does not exist.

**Output: an array with one object per \`policy\`, in document order** (\`[]\` when there are none)

- \`policyNumber\` and \`status\` from the attributes of \`policy\`.
- \`premium\`: a number, from the \`premium\` attribute of \`policy\` or otherwise from the \`premium\` child element. **Leave the key out** when neither exists.
- \`holder\`:
  - \`id\` (attribute) and \`name\` (element).
  - \`vip\`: a boolean from the \`vip\` attribute, \`false\` when the attribute is absent.
  - \`emails\`: always an array of \`{ address, type }\`. \`type\` comes from the \`type\` attribute and is \`"personal"\` when absent. No emails gives \`[]\`.
- \`covers\`: always an array of \`{ code, limit, currency }\` with \`limit\` a number. Add \`excess\` (a number) **only** for covers that have the attribute.
- \`endorsements\`: an array of \`{ date, text }\`. **Leave the key out** when the policy has none.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<policies>
  <policy number="PL-5001" status="ACTIVE" premium="412.50">
    <holder id="H-88" vip="true">
      <name>Marit Olsen</name>
      <email>marit.olsen@example.com</email>
      <email type="work">m.olsen@norfjord.example</email>
    </holder>
    <cover code="FIRE" limit="250000" currency="EUR"/>
    <cover code="THEFT" limit="50000" currency="EUR" excess="250"/>
    <endorsement date="2026-03-01">Garden shed added</endorsement>
    <endorsement date="2026-07-15">Alarm discount applied</endorsement>
  </policy>
  <policy number="PL-5002" status="LAPSED">
    <holder id="H-91">
      <name>Tomas Berg</name>
    </holder>
    <premium>98.00</premium>
  </policy>
  <policy number="PL-5003" status="ACTIVE">
    <holder id="H-92" vip="false">
      <name>Ines Costa</name>
      <email type="work">ines@costa.example</email>
    </holder>
    <cover code="FIRE" limit="100000" currency="EUR"/>
  </policy>
</policies>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "policyNumber": "PL-5001",
    "status": "ACTIVE",
    "premium": 412.50,
    "holder": {
      "id": "H-88",
      "name": "Marit Olsen",
      "vip": true,
      "emails": [
        { "address": "marit.olsen@example.com", "type": "personal" },
        { "address": "m.olsen@norfjord.example", "type": "work" }
      ]
    },
    "covers": [
      { "code": "FIRE", "limit": 250000, "currency": "EUR" },
      { "code": "THEFT", "limit": 50000, "currency": "EUR", "excess": 250 }
    ],
    "endorsements": [
      { "date": "2026-03-01", "text": "Garden shed added" },
      { "date": "2026-07-15", "text": "Alarm discount applied" }
    ]
  },
  {
    "policyNumber": "PL-5002",
    "status": "LAPSED",
    "premium": 98.00,
    "holder": { "id": "H-91", "name": "Tomas Berg", "vip": false, "emails": [] },
    "covers": []
  },
  {
    "policyNumber": "PL-5003",
    "status": "ACTIVE",
    "holder": {
      "id": "H-92",
      "name": "Ines Costa",
      "vip": false,
      "emails": [ { "address": "ines@costa.example", "type": "work" } ]
    },
    "covers": [
      { "code": "FIRE", "limit": 100000, "currency": "EUR" }
    ]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.policies.*policy map (p) -> {
  policyNumber: p.@number
}
`,
  hints: [
    'Use the multi-value selector for anything that can repeat: `p.*cover`, `p.holder.*email`. It returns `null` when nothing matches, so add `default []`.',
    'A missing attribute selects as `null`, which makes the fallback short: `p.@premium default p.premium`.',
    'A key that exists only sometimes is a conditional key: `(excess: c.@excess as Number) if (c.@excess != null)`.',
    'An element with text and attributes gives you both: inside `map`, the value itself is the text and `.@"type"` reads the attribute of that same element. The quotes are required here: `e.@type` does not compile, because `type` is a reserved word.',
  ],
  solution: `%dw 2.0
output application/json
---
(payload.policies.*policy default []) map (p) -> do {
  var premium = p.@premium default p.premium
  var endorsements = p.*endorsement default []
  ---
  {
    policyNumber: p.@number,
    status: p.@status,
    (premium: premium as Number) if (premium != null),
    holder: {
      id: p.holder.@id,
      name: p.holder.name,
      vip: (p.holder.@vip default "false") as Boolean,
      emails: (p.holder.*email default []) map (e) -> {
        address: e,
        "type": e.@"type" default "personal"
      }
    },
    covers: (p.*cover default []) map (c) -> {
      code: c.@code,
      limit: c.@limit as Number,
      currency: c.@currency,
      (excess: c.@excess as Number) if (c.@excess != null)
    },
    (endorsements: endorsements map (e) -> { date: e.@date, text: e }) if (not isEmpty(endorsements))
  }
}`,
  explanation: `
**Three kinds of absence.** The specification treats missing data in three different ways, and each has its own tool:
- *Always an array*: \`emails\` and \`covers\` use \`.*\` with \`default []\`, so the consumer can loop without a check.
- *A default value*: \`vip\` and \`type\` use \`default\`.
- *No key at all*: \`premium\`, \`excess\` and \`endorsements\` use a conditional key, written as \`(key: value) if (condition)\` in parentheses.

**One value, two sources.** \`p.@premium default p.premium\` hides the difference between the old and the new module in one line. When the old module is switched off, only this line changes.

**Attributes are text.** \`vip="true"\` is the string \`"true"\`, so it needs \`as Boolean\`. Applying the default **before** the conversion keeps it simple: the missing case and the present case go through the same \`as Boolean\`.

**Text and attributes on one element.** \`email\` has both. Inside the \`map\`, \`e\` is the element's text, and \`e.@"type"\` reads its attribute. The attribute name has to be quoted because \`type\` is a reserved word in DataWeave: without the quotes the script does not compile.

**Why not a generic converter?** A generic XML to JSON conversion turns repeating elements into duplicate keys and single elements into objects, so the shape would change with the data. An explicit mapping gives the portal a stable contract.
`,
  tests: [
    {
      name: 'A single policy with one of everything',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<policies><policy number="PL-6001" status="ACTIVE"><premium>1200</premium><holder id="H-1" vip="true"><name>Sara Lind</name><email>sara@lind.example</email></holder><cover code="FLOOD" limit="75000.50" currency="SEK" excess="0"/><endorsement date="2026-10-10">Cover increased</endorsement></policy></policies>',
        },
      ],
      expected:
        '[ { "policyNumber": "PL-6001", "status": "ACTIVE", "premium": 1200, "holder": { "id": "H-1", "name": "Sara Lind", "vip": true, "emails": [ { "address": "sara@lind.example", "type": "personal" } ] }, "covers": [ { "code": "FLOOD", "limit": 75000.50, "currency": "SEK", "excess": 0 } ], "endorsements": [ { "date": "2026-10-10", "text": "Cover increased" } ] } ]',
    },
    {
      name: 'An empty export',
      inputs: [{ name: 'payload', mime: 'application/xml', content: '<policies></policies>' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'What is the practical difference for the consumer between a missing key and a null value?',
      a: 'A missing key says the concept does not apply, while null says it applies but has no value. Strict JSON schemas also treat them differently: a field may be optional without being nullable. The contract should choose one, and the mapping should apply it consistently.',
    },
    {
      q: 'The attribute and the child element are both present and disagree. What does this mapping do, and is that acceptable?',
      a: 'It uses the attribute, because `default` only falls back when the left side is null. That is a silent choice. If the two can really disagree, agree a precedence with the source owners or report the conflict rather than picking one.',
    },
  ],
}
