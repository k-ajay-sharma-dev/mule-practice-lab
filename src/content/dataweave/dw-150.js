export default {
  id: 'dw-150',
  category: 'dataweave',
  title: 'Generate Every Variant SKU from Product Option Lists',
  level: 'ADVANCED',
  tags: ['cartesian-product', 'reduce', 'flatMap', 'dynamic-keys', 'some', 'every', 'arrays-module', 'retail', 'json'],
  estMinutes: 25,
  description: `
Holmfirth Apparel sets up new products in its product system with a list of options, such as colour and size. The online shop needs one **variant** for every mix of option values, each with its own SKU.

Build the variants:

- The SKU is the \`baseSku\`, then the code of each option value in option order, joined with \`-\`. For example \`TEE-410-NVY-M\`.
- \`attributes\` maps each option name to the label of the chosen value.
- The first option changes slowest: all navy sizes come before all white sizes.
- \`unavailable\` lists mixes the supplier does not make. Each entry names one or more options by name with a value code. Drop a variant when **every** option named in an entry matches it.

The number of options is not fixed. A product may have one option, three, or none. A product with no options has one variant, with the base SKU and empty attributes.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "baseSku": "TEE-410",
  "options": [
    { "name": "colour", "values": [{ "code": "NVY", "label": "Navy" }, { "code": "WHT", "label": "White" }] },
    { "name": "size", "values": [{ "code": "M", "label": "Medium" }, { "code": "L", "label": "Large" }, { "code": "XL", "label": "Extra large" }] }
  ],
  "unavailable": [{ "colour": "WHT", "size": "XL" }]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "sku": "TEE-410-NVY-M", "attributes": { "colour": "Navy", "size": "Medium" } },
  { "sku": "TEE-410-NVY-L", "attributes": { "colour": "Navy", "size": "Large" } },
  { "sku": "TEE-410-NVY-XL", "attributes": { "colour": "Navy", "size": "Extra large" } },
  { "sku": "TEE-410-WHT-M", "attributes": { "colour": "White", "size": "Medium" } },
  { "sku": "TEE-410-WHT-L", "attributes": { "colour": "White", "size": "Large" } }
]`,
  },
  starterCode: `%dw 2.0
output application/json
import some, every from dw::core::Arrays
---
payload.options[0].values flatMap (c) ->
  payload.options[1].values map (s) -> {
    sku: payload.baseSku ++ "-" ++ c.code ++ "-" ++ s.code
  }
`,
  hints: [
    'Two nested loops only work for exactly two options. Build the mixes one option at a time with `reduce` instead.',
    'Start the accumulator with one empty mix: `acc = [[]]`. For each option, every mix so far is extended with each of its values: `acc flatMap (mix) -> opt.values map (v) -> mix ++ [...]`.',
    'Keep the option name, code and label in each step of a mix, so the SKU and the attributes can both be built from it.',
    'For the check, turn a mix into codes by name: `{ (mix map (s) -> { (s.name): s.code }) }`. An entry blocks the mix when `namesOf(u) every (k) -> codes[k] == u[k]`.',
    'With no options, `reduce` returns the starting value `[[]]`, which gives one variant with the base SKU.',
  ],
  solution: `%dw 2.0
output application/json
import some, every from dw::core::Arrays

var mixes = payload.options reduce ((opt, acc = [[]]) ->
  acc flatMap (mix) ->
    opt.values map (v) -> mix ++ [{ name: opt.name, code: v.code, label: v.label }]
)

fun codesOf(mix) = { (mix map (s) -> { (s.name): s.code }) }

fun blocked(mix) = do {
  var codes = codesOf(mix)
  ---
  (payload.unavailable default []) some (u) -> namesOf(u) every (k) -> codes[k] == u[k]
}
---
(mixes filter (mix) -> not blocked(mix)) map (mix) -> {
  sku: ([payload.baseSku] ++ (mix map $.code)) joinBy "-",
  attributes: { (mix map (s) -> { (s.name): s.label }) }
}`,
  explanation: `
**A cartesian product of any size.** Two options need two loops and three need three. \`reduce\` removes that problem: it starts from one empty mix and, for each option, replaces every mix with one copy per value. After colour there are 2 mixes, after size there are 6.

**Why start with \`[[]]\`.** The accumulator is a list of mixes. One empty mix means "nothing chosen yet". Starting with \`[]\` would give no mixes at all, because \`flatMap\` over an empty list returns nothing.

**Order.** \`flatMap\` keeps each existing mix in place and adds the new values behind it, so the first option changes slowest.

**Unavailable mixes.** \`codesOf\` turns a mix into an object such as \`{ colour: "WHT", size: "XL" }\`. An entry blocks the mix when every key it names has the same code, which is \`every\`. A mix is dropped when \`some\` entry blocks it. An entry with only \`colour: "WHT"\` blocks every white variant.

**Two outputs from one mix.** Each step keeps the name, code and label, so the SKU uses the codes and \`attributes\` uses the labels without a second lookup.
`,
  tests: [
    {
      name: 'No options gives one variant',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "baseSku": "MUG-100", "options": [] }' }],
      expected: '[{ "sku": "MUG-100", "attributes": {} }]',
    },
    {
      name: 'Three options and a rule that names one option',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "baseSku": "BAG-20", "options": [{ "name": "colour", "values": [{ "code": "RED", "label": "Red" }, { "code": "BLU", "label": "Blue" }] }, { "name": "size", "values": [{ "code": "S", "label": "Small" }] }, { "name": "strap", "values": [{ "code": "LTH", "label": "Leather" }, { "code": "CNV", "label": "Canvas" }] }], "unavailable": [{ "colour": "RED" }] }',
        },
      ],
      expected:
        '[{ "sku": "BAG-20-BLU-S-LTH", "attributes": { "colour": "Blue", "size": "Small", "strap": "Leather" } }, { "sku": "BAG-20-BLU-S-CNV", "attributes": { "colour": "Blue", "size": "Small", "strap": "Canvas" } }]',
    },
  ],
  followUps: [
    {
      q: 'A product has 5 options with 10 values each. What is the risk?',
      a: 'That is 100,000 variants. Count the mixes first by multiplying the value counts, and reject or flag a product above an agreed limit before you build them.',
    },
    {
      q: 'Why keep the codes in the SKU and not the labels?',
      a: 'Labels change and may hold spaces or other languages. Short fixed codes keep the SKU stable and safe for systems that limit its length.',
    },
    {
      q: 'The shop already has some of these variants. How do you send only new ones?',
      a: 'Read the existing SKUs, put them in a lookup object, and filter out every generated SKU found in it before sending.',
    },
  ],
}
