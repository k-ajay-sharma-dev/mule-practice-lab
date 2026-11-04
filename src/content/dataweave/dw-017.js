export default {
  id: 'dw-017',
  category: 'dataweave',
  title: 'Deduplicate Merged Contacts by Email',
  level: 'INTERMEDIATE',
  tags: ['distinctBy', 'strings', 'filter', 'null-handling', 'json'],
  estMinutes: 15,
  description: `
Contacts from the CRM, the ERP and the website form have been concatenated into one array before loading them into the marketing tool. The marketing tool rejects duplicate emails.

Each contact has \`source\`, \`name\` and \`email\` (which may be missing, \`null\` or blank).

**Rules**
1. Normalize the email: trim surrounding whitespace and lower-case it.
2. Drop contacts whose normalized email is empty (missing, \`null\`, or only whitespace).
3. Two contacts are duplicates when their **normalized** emails are equal. Keep only the **first** occurrence in input order.
4. Output each kept contact as \`{ "name", "email", "source" }\` with the **normalized** email, in input order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "source": "CRM", "name": "Asha Rao", "email": "Asha.Rao@Example.com " },
  { "source": "ERP", "name": "A. Rao", "email": "asha.rao@example.com" },
  { "source": "CRM", "name": "Ben Ortiz", "email": null },
  { "source": "ERP", "name": "Chen Li", "email": "chen@example.org" },
  { "source": "WEB", "name": "Ben O.", "email": "   " },
  { "source": "WEB", "name": "Chen L.", "email": "CHEN@example.org" },
  { "source": "WEB", "name": "Dana" },
  { "source": "WEB", "name": "Eve", "email": "eve@example.com" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "name": "Asha Rao", "email": "asha.rao@example.com", "source": "CRM" },
  { "name": "Chen Li", "email": "chen@example.org", "source": "ERP" },
  { "name": "Eve", "email": "eve@example.com", "source": "WEB" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Normalize first: `lower(trim(c.email default ""))` turns missing and null into `""`.',
    'Filter out the empty emails **before** deduplicating, otherwise all blank contacts collapse into one "duplicate" and the first of them survives.',
    '`distinctBy $.email` keeps the first item for each distinct value, preserving order.',
  ],
  solution: `%dw 2.0
output application/json
---
(payload map (c) -> {
  name: c.name,
  email: lower(trim(c.email default "")),
  source: c.source
})
  filter ($.email != "")
  distinctBy $.email`,
  explanation: `
The order of operations is the whole exercise: **normalize → filter → deduplicate**.

- Deduplicating on the raw email misses \`"Asha.Rao@Example.com "\` vs \`"asha.rao@example.com"\`.
- Deduplicating before filtering keeps one blank contact (it is "distinct" from the real emails) — and if a blank record came first, it would be the one kept.

\`distinctBy\` keeps the first occurrence and the original order, so no sorting is needed.

**Syntax trap:** the parentheses around \`payload map (c) -> {...}\` are required. A lambda body extends as far right as possible, so without them \`filter\` would be applied inside the lambda to each single object — and fail.
`,
  tests: [
    {
      name: 'No usable emails',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '[{ "source": "WEB", "name": "X", "email": "" }, { "source": "CRM", "name": "Y" }]' },
      ],
      expected: '[]',
    },
    {
      name: 'Blank first, real email later',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "source": "WEB", "name": "Blank", "email": " " }, { "source": "ERP", "name": "Zed", "email": " ZED@x.io" }, { "source": "CRM", "name": "Zed 2", "email": "zed@X.IO" }]',
        },
      ],
      expected: '[{ "name": "Zed", "email": "zed@x.io", "source": "ERP" }]',
    },
  ],
  followUps: [
    {
      q: 'The business now wants to keep the CRM record when duplicates exist, whatever the order. How?',
      a: 'Sort by source priority first (e.g. `orderBy (if ($.source == "CRM") 0 else 1)`), then `distinctBy`. Or `groupBy $.email` and pick the preferred record from each group.',
    },
    {
      q: 'How is `distinctBy` different from `distinctBy $` on a whole object?',
      a: '`distinctBy $` compares entire items, so two records with the same email but different names are both kept. Using a key expression like `$.email` defines what "duplicate" means.',
    },
  ],
}
