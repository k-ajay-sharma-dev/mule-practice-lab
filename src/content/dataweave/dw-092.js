export default {
  id: 'dw-092',
  category: 'dataweave',
  title: 'Pseudonymise Customer Records for Analytics with Salted SHA-256 Keys',
  level: 'INTERMEDIATE',
  tags: ['security', 'pii', 'hashing', 'dw::Crypto', 'gdpr', 'masking', 'distinctBy'],
  estMinutes: 20,
  description: `
A retailer exports customer records to an analytics warehouse. Masking is not enough here: analysts must still **join** records from different extracts and count **distinct people**, but must never see who those people are.

\`payload\` is an array of customers. \`vars.salt\` is a secret value, the same for the whole export.

**Output one record per customer, with only these fields:**
- \`customerKey\`: the pseudonym of \`customerId\`.
- \`emailKey\`: the pseudonym of \`email\`.
- \`birthYear\`: the year of \`dateOfBirth\`, as a Number.
- \`postcodeArea\`: the first 3 characters of \`postcode\` after removing spaces.
- \`segment\` and \`lifetimeValue\`: unchanged.

\`name\` must not appear in the output.

**Pseudonym:** SHA-256 of \`<salt>:<value>\`, with the value trimmed and lower-cased first, encoded as UTF-8, as **lower-case hex**.

**Also return** \`distinctEmails\`: the number of different \`emailKey\` values. The same address typed in a different case, or with spaces around it, must count as one person.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "customerId": "C-1001", "name": "Asha Rao", "email": "asha.rao@example.com", "dateOfBirth": "1988-03-14", "postcode": "SW1A 2AA", "segment": "GOLD", "lifetimeValue": 4120.5 },
  { "customerId": "c-1002", "name": "A. Rao", "email": "  Asha.Rao@Example.com ", "dateOfBirth": "1988-03-14", "postcode": "SW1A 2AA", "segment": "SILVER", "lifetimeValue": 310 },
  { "customerId": "C-1003", "name": "Tomas Novak", "email": "tomas.novak@example.com", "dateOfBirth": "1975-11-02", "postcode": "EC2M 7PY", "segment": "GOLD", "lifetimeValue": 2875 }
]`,
    },
    { name: 'vars', mime: 'application/json', content: '{ "salt": "q3-2026-analytics" }' },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "records": [
    {
      "customerKey": "95b027cbe8f94259092675f1a6a3e9584f42c341f9f649021c227c7cc41e639b",
      "emailKey": "6f32ba536632425a427a59a983af99618e477abaed8d17d2f68fecd75c7cfce0",
      "birthYear": 1988,
      "postcodeArea": "SW1",
      "segment": "GOLD",
      "lifetimeValue": 4120.5
    },
    {
      "customerKey": "78e2b66289a45e072371060f9a6091ec8d12f22cd76ff77370d89cd7c2db4c5f",
      "emailKey": "6f32ba536632425a427a59a983af99618e477abaed8d17d2f68fecd75c7cfce0",
      "birthYear": 1988,
      "postcodeArea": "SW1",
      "segment": "SILVER",
      "lifetimeValue": 310
    },
    {
      "customerKey": "601df2c1f92ec3e2a0afb66c3486066aa02efb2e11c244dd442ff7d2947b2422",
      "emailKey": "3f7c1eb7f225e5f58da9b37d7044ef568e3dbb29d114e2d29a1ef30990db9349",
      "birthYear": 1975,
      "postcodeArea": "EC2",
      "segment": "GOLD",
      "lifetimeValue": 2875
    }
  ],
  "distinctEmails": 2
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`hashWith(content, "SHA-256")` from `dw::Crypto` returns **Binary**, not text. The default algorithm is SHA-1, so name the one you want.',
    '`toHex` from `dw::core::Binaries` turns that Binary into text. Apply `lower` to be sure of the case.',
    '`(c.dateOfBirth as Date).year` gives the year. `records.emailKey distinctBy $` removes repeated keys.',
  ],
  solution: `%dw 2.0
import hashWith from dw::Crypto
import toHex from dw::core::Binaries
output application/json

fun pseudonym(value: String): String =
  lower(toHex(hashWith((vars.salt ++ ":" ++ lower(trim(value))) as Binary {encoding: "UTF-8"}, "SHA-256")))

var records = payload map (c) -> {
  customerKey: pseudonym(c.customerId),
  emailKey: pseudonym(c.email),
  birthYear: (c.dateOfBirth as Date).year,
  postcodeArea: (c.postcode replace " " with "")[0 to 2],
  segment: c.segment,
  lifetimeValue: c.lifetimeValue
}
---
{
  records: records,
  distinctEmails: sizeOf(records.emailKey distinctBy $)
}`,
  explanation: `
**Hashing or masking.** A mask such as \`****.com\` destroys the link between records. A deterministic hash keeps it, because the same input always gives the same output, so analysts can join and count without seeing the value.

**Why normalise first.** Hashes change completely with one different character. Without \`trim\` and \`lower\`, the two Asha records would look like two people.

**Why salt.** Email addresses and customer numbers are guessable, so an unsalted hash can be reversed by hashing a list of candidates and comparing. The salt must be kept secret, in a secure property, and kept away from the analytics team.

**This is pseudonymisation, not anonymisation.** Whoever holds the salt can recompute the keys, so under GDPR the output is still treated as personal data. Birth year and postcode area together can also narrow down a person in small populations.

**Function notes.** \`MD5\` and \`SHA1\` in \`dw::Crypto\` return hex Strings, while \`hashWith\` returns Binary. SHA-256 needs \`hashWith\`.
`,
  tests: [
    {
      name: 'Another batch with a non-ASCII address',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "customerId": " C-2001 ", "name": "Jürgen Weiss", "email": "JÜRGEN@example.de", "dateOfBirth": "2001-12-31", "postcode": "10115", "segment": "BRONZE", "lifetimeValue": 0 }]',
        },
        { name: 'vars', mime: 'application/json', content: '{ "salt": "q3-2026-analytics" }' },
      ],
      expected: `{
  "records": [
    {
      "customerKey": "68d90c4e30f680c0ae2a8831a0ead4af61f80906d3fe96ad7c66bf92dab3f66a",
      "emailKey": "9fa3a6effc4a5098388c635f64862f777cef14cf1ab48ed4f714c58f6017a26f",
      "birthYear": 2001,
      "postcodeArea": "101",
      "segment": "BRONZE",
      "lifetimeValue": 0
    }
  ],
  "distinctEmails": 1
}`,
    },
  ],
}
