export default {
  id: 'dw-044',
  category: 'dataweave',
  title: 'Explode Salesforce Accounts and Contacts into a Flat CSV',
  level: 'INTERMEDIATE',
  tags: ['csv', 'salesforce', 'flatMap', 'nested-arrays', 'null-handling'],
  estMinutes: 20,
  description: `
A nightly job runs this SOQL query with the Salesforce connector. It sends the result to a data-warehouse loader that only accepts a **flat CSV**.

\`\`\`sql
SELECT Id, Name, BillingCountry, (SELECT Id, FirstName, LastName, Email FROM Contacts) FROM Account
\`\`\`

The input is the raw REST-style query result. Note the Salesforce quirks:
- Every record carries an \`attributes\` object.
- The child relationship \`Contacts\` is itself a query result with its own \`records\`.
- An account **without** contacts has \`"Contacts": null\` (not an empty list).

**Rules**
- One CSV row **per contact**, accounts in input order, contacts in input order within each account.
- An account with **no** contacts still produces **one** row, with the three contact columns empty.
- Columns, in this order, with this header: \`AccountId,AccountName,Country,ContactId,ContactName,Email\`.
- \`ContactName\` is \`FirstName + " " + LastName\`. When \`FirstName\` is null it is \`LastName\` alone.
- The loader parses strict RFC 4180:
  - **Every value** is wrapped in double quotes (the header row is **not**).
  - A double quote inside a value is doubled (\`""\`).
  - A null value is written as an empty quoted field \`""\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "totalSize": 3,
  "done": true,
  "records": [
    {
      "attributes": { "type": "Account", "url": "/services/data/v60.0/sobjects/Account/001A" },
      "Id": "001A",
      "Name": "Acme, Inc",
      "BillingCountry": "NL",
      "Contacts": {
        "totalSize": 2,
        "done": true,
        "records": [
          { "attributes": { "type": "Contact" }, "Id": "003A1", "FirstName": "Eva", "LastName": "Jansen", "Email": "eva@acme.example" },
          { "attributes": { "type": "Contact" }, "Id": "003A2", "FirstName": null, "LastName": "Bakker", "Email": null }
        ]
      }
    },
    {
      "attributes": { "type": "Account", "url": "/services/data/v60.0/sobjects/Account/001B" },
      "Id": "001B",
      "Name": "Globex",
      "BillingCountry": null,
      "Contacts": null
    },
    {
      "attributes": { "type": "Account", "url": "/services/data/v60.0/sobjects/Account/001C" },
      "Id": "001C",
      "Name": "Initech",
      "BillingCountry": "DE",
      "Contacts": {
        "totalSize": 1,
        "done": true,
        "records": [
          { "attributes": { "type": "Contact" }, "Id": "003C1", "FirstName": "Lena", "LastName": "Vogel", "Email": "lena@initech.example" }
        ]
      }
    }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/csv',
    content: `AccountId,AccountName,Country,ContactId,ContactName,Email
"001A","Acme, Inc","NL","003A1","Eva Jansen","eva@acme.example"
"001A","Acme, Inc","NL","003A2","Bakker",""
"001B","Globex","","","",""
"001C","Initech","DE","003C1","Lena Vogel","lena@initech.example"`,
  },
  starterCode: `%dw 2.0
output application/csv
---
payload
`,
  hints: [
    'You need "one input record → many output rows", then one flat list: that is `flatMap` over `payload.records`.',
    '`acc.Contacts.records` is `null` when `Contacts` is null — normalize with `default []` and branch on `isEmpty(...)` to emit a single row with nulls.',
    'Quoting is a writer property on the output directive: `quoteValues=true`. The escape character defaults to a backslash, so also set `escape="\\""` to get doubled quotes. Build the name with `if (c.FirstName == null) c.LastName else c.FirstName ++ " " ++ c.LastName` — `++` with a null operand fails.',
  ],
  solution: `%dw 2.0
output application/csv quoteValues=true, escape="\\""
---
payload.records flatMap (acc) -> do {
  var contacts = acc.Contacts.records default []
  var base = {
    AccountId: acc.Id,
    AccountName: acc.Name,
    Country: acc.BillingCountry
  }
  ---
  if (isEmpty(contacts))
    [ base ++ { ContactId: null, ContactName: null, Email: null } ]
  else
    contacts map (c) -> base ++ {
      ContactId: c.Id,
      ContactName: if (c.FirstName == null) c.LastName else c.FirstName ++ " " ++ c.LastName,
      Email: c.Email
    }
}`,
  explanation: `
\`flatMap\` is \`map\` followed by \`flatten\`: each account returns an **array** of rows (one per contact, or exactly one), and the arrays are concatenated in order.

Why the explicit empty-contacts branch? \`[] map ...\` returns \`[]\`, so an account without contacts would silently disappear from the export — a classic "LEFT JOIN turned into INNER JOIN" bug.

Why keep the null keys (\`ContactId: null\`) instead of leaving them out? The CSV writer takes its header from the **first** row and writes values by position. Every row must have the same keys in the same order, otherwise columns shift.

Other traps:
- Salesforce returns \`null\` for an empty child relationship, not \`{ "records": [] }\`. Selecting \`.records\` on null is fine (it gives null), but mapping over null is not what you want — normalize with \`default []\`.
- With the default writer settings, \`Acme, Inc\` is written as \`Acme\\, Inc\` — the writer **escapes** the separator with a backslash instead of quoting it, which an RFC 4180 parser reads as two columns. \`quoteValues=true\` wraps every value in quotes (the header stays unquoted unless you add \`quoteHeader=true\`).
- The escape character also defaults to a backslash, so \`The "Best" Shop\` would become \`"The \\"Best\\" Shop"\`. \`escape="\\""\` makes it \`"The ""Best"" Shop"\`.
- Do not concatenate quote characters yourself: the writer would then escape them again.
`,
  tests: [
    {
      name: 'Only accounts without contacts',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "totalSize": 2, "done": true, "records": [ { "attributes": { "type": "Account" }, "Id": "001X", "Name": "Solo", "BillingCountry": "FR", "Contacts": null }, { "attributes": { "type": "Account" }, "Id": "001Y", "Name": "Duo", "BillingCountry": "BE", "Contacts": null } ] }',
        },
      ],
      expected: `AccountId,AccountName,Country,ContactId,ContactName,Email
"001X","Solo","FR","","",""
"001Y","Duo","BE","","",""`,
    },
    {
      name: 'Comma and embedded quotes',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "totalSize": 1, "done": true, "records": [ { "attributes": { "type": "Account" }, "Id": "001Z", "Name": "The \\"Best\\" Shop", "BillingCountry": "US", "Contacts": { "totalSize": 1, "done": true, "records": [ { "attributes": { "type": "Contact" }, "Id": "003Z", "FirstName": "Al", "LastName": "Smith, Jr", "Email": "al@u.example" } ] } } ] }',
        },
      ],
      expected: `AccountId,AccountName,Country,ContactId,ContactName,Email
"001Z","The ""Best"" Shop","US","003Z","Al Smith, Jr","al@u.example"`,
    },
  ],
  followUps: [
    {
      q: 'What changes if the account has more than 200 contacts?',
      a: 'Salesforce pages child relationships too: `Contacts.done` is `false` and a `nextRecordsUrl` must be followed. The Salesforce connector handles paging of the top-level query (streaming), but large child lists are better queried separately (`SELECT ... FROM Contact WHERE AccountId IN ...`) and joined.',
    },
    {
      q: 'How do you read such a file back with DataWeave?',
      a: 'Use the same properties on the reader: `input payload application/csv escape="\\""` (quote already defaults to `"`). Without the escape setting, `""` inside a quoted value is not read as one literal quote.',
    },
    {
      q: 'How would you stream a million accounts into this CSV without running out of memory?',
      a: 'Use the connector\'s streaming query output and keep the script a single forward pass (one `flatMap`, no `sizeOf`/`orderBy` over the whole payload); the CSV writer then writes rows as they are produced.',
    },
  ],
}
