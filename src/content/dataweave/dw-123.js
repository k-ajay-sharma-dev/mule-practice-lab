export default {
  id: 'dw-123',
  category: 'dataweave',
  title: 'Reformat Product Tags with splitBy and joinBy',
  level: 'BEGINNER',
  tags: ['splitBy', 'joinBy', 'strings', 'arrays', 'json'],
  estMinutes: 10,
  description: `
An online shop stores the tags of a product in one String, separated by semicolons: \`"sale;summer;shoes"\`. The new website needs the tags in two other forms.

Output one object with:

- \`sku\`, copied as it is
- \`tagList\`, the tags as an array of Strings
- \`tagLine\`, the tags in one String, separated by a comma and a space: \`"sale, summer, shoes"\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "sku": "SH-220",
  "tags": "sale;summer;shoes"
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "sku": "SH-220",
  "tagList": ["sale", "summer", "shoes"],
  "tagLine": "sale, summer, shoes"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  sku: payload.sku,
  tagList: payload.tags,
  tagLine: payload.tags
}
`,
  hints: [
    '`splitBy` cuts a String into an array: `"a;b" splitBy ";"` gives `["a", "b"]`.',
    '`joinBy` does the reverse and glues an array into a String: `["a", "b"] joinBy ", "` gives `"a, b"`.',
    'You need the array twice, so keep it in a `var` above the `---` line.',
  ],
  solution: `%dw 2.0
output application/json
var tags = payload.tags splitBy ";"
---
{
  sku: payload.sku,
  tagList: tags,
  tagLine: tags joinBy ", "
}`,
  explanation: `
\`splitBy\` and \`joinBy\` are opposites. \`splitBy\` turns a String into an array and removes the separator. \`joinBy\` turns an array into a String and puts a separator between the items.

Storing the array in a \`var\` means the split is written once and used twice.

The separator you pass to \`joinBy\` is used exactly as you write it. That is why it is \`", "\` with a space. With \`","\` you would get \`sale,summer,shoes\`.
`,
  tests: [
    {
      name: 'A single tag has no separator',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "sku": "HT-010", "tags": "winter" }' }],
      expected: '{ "sku": "HT-010", "tagList": ["winter"], "tagLine": "winter" }',
    },
    {
      name: 'Tags with spaces inside them',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "sku": "BG-004", "tags": "gift idea;new in;bags" }' }],
      expected: '{ "sku": "BG-004", "tagList": ["gift idea", "new in", "bags"], "tagLine": "gift idea, new in, bags" }',
    },
  ],
  followUps: [
    {
      q: 'What does `"" splitBy ";"` return?',
      a: 'An array with one empty String: `[""]`. So a product with no tags looks like it has one tag, unless you filter out empty entries.',
    },
    {
      q: 'Some rows use a semicolon and others a comma. Can one `splitBy` handle both?',
      a: 'Yes. `splitBy` also accepts a regular expression, which is a pattern for matching text: `payload.tags splitBy /[;,]/`.',
    },
    {
      q: 'Can `joinBy` take an array of numbers?',
      a: 'Yes. `[1, 2] joinBy "-"` gives `"1-2"`.',
    },
  ],
}
