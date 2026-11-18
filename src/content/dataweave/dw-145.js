export default {
  id: 'dw-145',
  category: 'dataweave',
  title: 'Build Postal Address Lines and Skip the Empty Parts',
  level: 'BEGINNER',
  tags: ['strings', 'filter', 'joinBy', 'trim', 'null-handling', 'address', 'json'],
  estMinutes: 10,
  description: `
Larkspur Mail Order prints parcel labels from its customer records. The label printer wants each address as a list of lines. Some records have no company, and many have an empty second street line. Today the labels show blank lines and stray commas.

Output one object per customer, in input order, with:

- \`customerId\`: copied from the input
- \`lines\`: the parts in this order, \`name\`, \`company\`, \`street1\`, \`street2\`, \`town\`, \`postcode\`, \`country\`, with spaces trimmed from each part
- \`singleLine\`: the same lines joined with \`", "\`, for the email that confirms the order

Leave out any part that is missing, \`null\`, empty, or only spaces.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "customerId": "C-1001", "name": "Ana Ruiz", "company": "", "street1": "14 Mill Lane", "street2": null, "town": "Ashford", "postcode": "TN24 8QA", "country": "United Kingdom" },
  { "customerId": "C-1002", "name": "Tom Hale", "company": "Hale Joinery Ltd", "street1": "Unit 3", "street2": "Riverside Park", "town": "Leeds", "postcode": "LS10 1AB", "country": "United Kingdom" },
  { "customerId": "C-1003", "name": "Priya Nair", "street1": "  7 Elm Road ", "street2": "   ", "town": "Bath", "postcode": "BA1 2CD", "country": "United Kingdom" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "customerId": "C-1001", "lines": ["Ana Ruiz", "14 Mill Lane", "Ashford", "TN24 8QA", "United Kingdom"], "singleLine": "Ana Ruiz, 14 Mill Lane, Ashford, TN24 8QA, United Kingdom" },
  { "customerId": "C-1002", "lines": ["Tom Hale", "Hale Joinery Ltd", "Unit 3", "Riverside Park", "Leeds", "LS10 1AB", "United Kingdom"], "singleLine": "Tom Hale, Hale Joinery Ltd, Unit 3, Riverside Park, Leeds, LS10 1AB, United Kingdom" },
  { "customerId": "C-1003", "lines": ["Priya Nair", "7 Elm Road", "Bath", "BA1 2CD", "United Kingdom"], "singleLine": "Priya Nair, 7 Elm Road, Bath, BA1 2CD, United Kingdom" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (c) -> {
  customerId: c.customerId,
  lines: [c.name, c.company, c.street1, c.street2, c.town, c.postcode, c.country],
  singleLine: ""
}
`,
  hints: [
    'Put the parts in a list in the right order first. A missing key such as `company` on C-1003 gives `null` in that list.',
    '`trim(s default "")` turns `null` into an empty string and removes spaces at both ends. A part is worth keeping when that result is not `""`.',
    'Clean every part with `map`, then keep only the parts that are not empty with `filter ($ != "")`.',
    'Join the clean lines with `joinBy ", "` for `singleLine`.',
  ],
  solution: `%dw 2.0
output application/json
fun clean(s) = trim(s default "")
---
payload map (c) -> do {
  var parts = [c.name, c.company, c.street1, c.street2, c.town, c.postcode, c.country]
  var lines = (parts map clean($)) filter ($ != "")
  ---
  {
    customerId: c.customerId,
    lines: lines,
    singleLine: lines joinBy ", "
  }
}`,
  explanation: `
**One list in a fixed order.** Writing the parts as a list keeps the order the printer needs. A key that is not there, such as \`company\` on C-1003, gives \`null\` in the list.

**One clean step.** \`clean\` turns \`null\` into \`""\` with \`default\`, then removes the spaces at both ends with \`trim\`. After that, a missing part, an empty part and a part of only spaces all look the same: \`""\`.

**Filter, then join.** \`filter ($ != "")\` drops the empty parts. \`joinBy ", "\` puts a comma only between lines that are left, so there are no doubled commas.

**do for local values.** The \`do\` block lets each customer have its own \`lines\` value, used twice without working it out twice.
`,
  tests: [
    {
      name: 'Only a name, a town and a country',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "customerId": "C-2001", "name": "Lee Park", "street1": "", "town": " York ", "country": "United Kingdom" }]' }],
      expected: '[{ "customerId": "C-2001", "lines": ["Lee Park", "York", "United Kingdom"], "singleLine": "Lee Park, York, United Kingdom" }]',
    },
    {
      name: 'No customers',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Some countries put the postcode before the town. How would you handle that?',
      a: 'Keep a small lookup of line orders per country code and pick the order from it. The clean, filter and join steps stay the same.',
    },
    {
      q: 'Why trim before the test and not after?',
      a: 'A part made only of spaces must count as empty. Trimming first turns it into an empty string, so the filter drops it.',
    },
    {
      q: 'The printer allows at most 35 characters per line. What would you add?',
      a: 'Check the length of each line with `sizeOf`. Cut long lines or send the record to a review list, since a cut address may not be delivered.',
    },
  ],
}
