export default {
  id: 'dw-040',
  category: 'dataweave',
  title: 'Sanitize an Account Export with Selectors and Key Removal',
  level: 'ADVANCED',
  tags: ['selectors', 'descendants', 'filter-selector', 'minus-operator', 'xml'],
  estMinutes: 25,
  description: `
A legacy identity system exports user accounts as XML. Before the record is published to the customer-360 Experience API, it must be reduced to a safe JSON summary — and the reviewer wants it done with **selectors**, not long chains of \`map\` and \`filter\`.

Return:

| Field | Content |
|---|---|
| \`id\` | the \`id\` attribute of \`account\` |
| \`attributes\` | all attributes of \`account\` **except** \`internalRef\` |
| \`profile\` | the \`profile\` element as an object, **without** \`passwordHash\` and \`taxNumber\` |
| \`activeRoles\` | text of every \`role\` whose \`active\` attribute is \`"true"\`, in document order |
| \`contactTypes\` | the \`type\` attribute of every \`contact\`, in document order |
| \`allEmails\` | every \`email\` element **anywhere** in the document, lower-cased, duplicates removed, sorted A→Z |

**Rules**
- Elements with no matches give \`[]\` (e.g. an account with no \`roles\` or no \`contacts\` element).
- Keep the remaining \`profile\` and \`attributes\` keys in their original order.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<account id="U-77" status="ACTIVE" internalRef="db-7781" tenant="eu-1">
  <profile>
    <name>Lena Park</name>
    <email>Lena.Park@Example.com</email>
    <passwordHash>9f86d081884c7d65</passwordHash>
    <taxNumber>T-55-0192</taxNumber>
    <locale>en-GB</locale>
  </profile>
  <roles>
    <role active="true">admin</role>
    <role active="false">billing</role>
    <role active="true">support</role>
  </roles>
  <contacts>
    <contact type="work">
      <email>lena@corp.example</email>
      <phone>+44 20 7946 0001</phone>
    </contact>
    <contact type="home">
      <email>LENA.PARK@example.com</email>
    </contact>
  </contacts>
</account>`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "id": "U-77",
  "attributes": { "id": "U-77", "status": "ACTIVE", "tenant": "eu-1" },
  "profile": { "name": "Lena Park", "email": "Lena.Park@Example.com", "locale": "en-GB" },
  "activeRoles": ["admin", "support"],
  "contactTypes": ["work", "home"],
  "allEmails": ["lena.park@example.com", "lena@corp.example"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Selector cheat-sheet: `.@id` one attribute, `.@` all attributes, `.*role` every repeated `role`, `..*email` every `email` at any depth, `[?(cond)]` keep matching items.',
    'Remove one key with `obj - "key"` and several with `obj -- ["a", "b"]`. `type` is a reserved word, so select it as `.@"type"`.',
    'A multi-value selector on a missing element returns `null`, not `[]` — add `default []`. Sorting is `orderBy $`.',
  ],
  solution: `%dw 2.0
output application/json

var acc = payload.account
---
{
  id: acc.@id,
  attributes: acc.@ - "internalRef",
  profile: acc.profile -- ["passwordHash", "taxNumber"],
  activeRoles: acc.roles.*role[?($.@active == "true")] default [],
  contactTypes: acc.contacts.*contact.@"type" default [],
  allEmails: ((payload..*email default []) map lower($) distinctBy $) orderBy $
}`,
  explanation: `
**Selectors do the walking.**

| Selector | Meaning here |
|---|---|
| \`.@id\` / \`.@\` | one attribute / all attributes as an object |
| \`.*role\` | **all** \`role\` children (\`.role\` would return only the first) |
| \`[?($.@active == "true")]\` | filter selector — keep items where the condition holds |
| \`.*contact.@"type"\` | a selector applied to an array is applied to each item |
| \`..*email\` | descendant selector — every \`email\` at any depth (\`..email\` takes only the first per parent) |

**Removing keys.** \`-\` removes one key, \`--\` removes a list of keys; both work on attribute objects too (\`acc.@ - "internalRef"\`). This is cleaner and safer than rebuilding the object field by field, because new harmless fields keep flowing through.

**Traps**
- \`.role\` vs \`.*role\`: the single-value selector silently drops repeated elements.
- No \`roles\` element → \`.*role\` is \`null\`, and so is everything chained after it. \`default []\` restores the documented empty list.
- Attribute values are strings: compare with \`"true"\`, not \`true\`.
- \`type\` is a keyword in DataWeave, so \`.@type\` does not parse — quote it.
`,
  tests: [
    {
      name: 'No active roles, no contacts element',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content: `<account id="U-2" internalRef="x">
  <profile><name>Sam</name><passwordHash>h</passwordHash><email>SAM@ex.com</email></profile>
  <roles><role active="false">viewer</role></roles>
</account>`,
        },
      ],
      expected:
        '{ "id": "U-2", "attributes": { "id": "U-2" }, "profile": { "name": "Sam", "email": "SAM@ex.com" }, "activeRoles": [], "contactTypes": [], "allEmails": ["sam@ex.com"] }',
    },
    {
      name: 'No roles element, repeated emails in one contact',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<account id="U-3" status="LOCKED"><profile><name>Kim</name></profile><contacts><contact type="work"><email>a@x.io</email><email>B@x.io</email></contact></contacts></account>',
        },
      ],
      expected:
        '{ "id": "U-3", "attributes": { "id": "U-3", "status": "LOCKED" }, "profile": { "name": "Kim" }, "activeRoles": [], "contactTypes": ["work"], "allEmails": ["a@x.io", "b@x.io"] }',
    },
  ],
  followUps: [
    {
      q: 'What is the difference between `-` and `--` on objects?',
      a: '`-` removes a single key (`obj - "a"`); `--` removes every key in a list (`obj -- ["a", "b"]`). On arrays, `-` removes an element and `--` removes all elements of another array.',
    },
    {
      q: 'How would you remove `passwordHash` wherever it appears, at any depth?',
      a: 'Selectors cannot delete, so write a small recursive function that `mapObject`s objects, skips the key and recurses into values — or, for one known location, use the `update` operator. The descendant selector only reads.',
    },
    {
      q: 'Why `..*email` instead of `..email`?',
      a: '`..email` returns only the first `email` under each parent, so a contact with two email elements would lose one. `..*email` collects every occurrence at every depth.',
    },
  ],
}
