export default {
  id: 'dw-073',
  category: 'dataweave',
  title: 'Prepare SQL Server Bulk Insert Parameters from JSON',
  level: 'INTERMEDIATE',
  tags: ['json', 'database', 'sql-server', 'bulk-insert', 'dates', 'timezones', 'null-handling'],
  estMinutes: 25,
  description: `
A CRM pushes new customers to a Mule API in batches. The flow stores them in SQL Server with one \`db:bulk-insert\`:

\`\`\`sql
INSERT INTO dbo.CUSTOMER_STAGING
  (CUSTOMER_ID, FIRST_NAME, LAST_NAME, EMAIL, BIRTH_DATE, CREATED_UTC, IS_ACTIVE, LOYALTY_TIER, BATCH_ID)
VALUES
  (:customerId, :firstName, :lastName, :email, :birthDate, :createdUtc, :isActive, :loyaltyTier, :batchId)
\`\`\`

Bulk insert takes an **array of objects**, one per row, whose keys are the \`:parameter\` names. Write the transformation that builds this array (here shown as JSON; in the flow it would be \`output application/java\`).

**Rules**
- **Every** object must contain **all nine** keys, also when the value is \`null\`.
- \`customerId\` — the CRM id in uppercase.
- \`firstName\`, \`lastName\` — trimmed.
- \`email\` — trimmed and lowercase; missing or blank → \`null\`.
- \`birthDate\` — the CRM sends \`dd-MM-yyyy\`; the column is \`DATE\`, send \`yyyy-MM-dd\`. Missing or blank → \`null\`.
- \`createdUtc\` — \`createdAt\` has a UTC offset; the column is \`DATETIME2\` in **UTC**: send \`yyyy-MM-dd HH:mm:ss\` converted to UTC.
- \`isActive\` — \`BIT\` column: \`1\` or \`0\` (missing → \`0\`).
- \`loyaltyTier\` — trimmed; missing or blank → \`"STANDARD"\`.
- \`batchId\` — from the batch envelope.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "batchId": "CRM-20261102-01",
  "customers": [
    {
      "id": "c-7781",
      "name": { "first": "Sanne", "last": "Mulder " },
      "email": "  Sanne.Mulder@Example.NL ",
      "birthDate": "14-03-1988",
      "createdAt": "2026-11-02T09:30:00+01:00",
      "active": true,
      "loyaltyTier": "GOLD"
    },
    {
      "id": "c-7782",
      "name": { "first": "Daan", "last": "Bos" },
      "email": "",
      "birthDate": null,
      "createdAt": "2026-11-02T10:05:12+01:00",
      "active": false
    },
    {
      "id": "c-7783",
      "name": { "first": " Fleur", "last": "van Dijk" },
      "birthDate": "02-11-1979",
      "createdAt": "2026-07-01T00:30:00+02:00",
      "active": true,
      "loyaltyTier": "  "
    }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "customerId": "C-7781", "firstName": "Sanne", "lastName": "Mulder",
    "email": "sanne.mulder@example.nl", "birthDate": "1988-03-14",
    "createdUtc": "2026-11-02 08:30:00", "isActive": 1, "loyaltyTier": "GOLD", "batchId": "CRM-20261102-01"
  },
  {
    "customerId": "C-7782", "firstName": "Daan", "lastName": "Bos",
    "email": null, "birthDate": null,
    "createdUtc": "2026-11-02 09:05:12", "isActive": 0, "loyaltyTier": "STANDARD", "batchId": "CRM-20261102-01"
  },
  {
    "customerId": "C-7783", "firstName": "Fleur", "lastName": "van Dijk",
    "email": null, "birthDate": "1979-11-02",
    "createdUtc": "2026-06-30 22:30:00", "isActive": 1, "loyaltyTier": "STANDARD", "batchId": "CRM-20261102-01"
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload.customers map (c) -> {
  customerId: c.id
}
`,
  hints: [
    '`isBlank` is `true` for `null`, `""` and whitespace-only strings — one check covers missing, empty and blank.',
    'Parse with an input format and write with an output format: `(s as Date { format: "dd-MM-yyyy" }) as String { format: "yyyy-MM-dd" }`.',
    'Shift a DateTime to another time zone with `>>`: `(c.createdAt as DateTime) >> "UTC"`.',
    'Do not use `skipNullOn` or conditional fields here: a missing key is not the same as a `null` parameter for a bulk insert.',
  ],
  solution: `%dw 2.0
output application/json
fun clean(s) = if (isBlank(s)) null else trim(s)
---
payload.customers map (c) -> {
  customerId: upper(c.id),
  firstName: trim(c.name.first),
  lastName: trim(c.name.last),
  email: lower(clean(c.email)),
  birthDate: if (isBlank(c.birthDate)) null
             else (c.birthDate as Date { format: "dd-MM-yyyy" }) as String { format: "yyyy-MM-dd" },
  createdUtc: ((c.createdAt as DateTime) >> "UTC") as String { format: "yyyy-MM-dd HH:mm:ss" },
  isActive: if (c.active default false) 1 else 0,
  loyaltyTier: clean(c.loyaltyTier) default "STANDARD",
  batchId: payload.batchId
}`,
  explanation: `
**Parameter names are the contract.** \`db:bulk-insert\` binds each object's values to the \`:name\` placeholders of a prepared statement and sends the rows in JDBC batches. Every row needs every parameter: a row without the \`email\` key is not the same as \`email: null\`: the placeholder has no value to bind and the operation fails instead of inserting \`NULL\`. That is why the script always writes all nine keys and never uses conditional fields.

**Blank → null.** Source systems send "no value" as a missing field, \`null\`, \`""\` or spaces. Storing \`""\` in a nullable column leads to queries like \`WHERE EMAIL IS NULL\` missing rows. \`isBlank\` normalises all four cases in one call.

**Dates.** The CRM's \`dd-MM-yyyy\` is parsed with an explicit format and written as ISO \`yyyy-MM-dd\`, which SQL Server converts to \`DATE\` regardless of the session's language or date format settings.

**Time zones.** \`DATETIME2\` has no offset, so the value must be normalised first. \`>> "UTC"\` shifts the instant to UTC: \`2026-07-01T00:30+02:00\` becomes \`2026-06-30 22:30:00\` — a different **day**, which matters for daily reports. (Alternatively use a \`DATETIMEOFFSET\` column and keep the offset.)

**BIT.** Sending \`1\`/\`0\` avoids depending on how the driver maps booleans.
`,
  tests: [
    {
      name: 'Single customer, negative offset, missing flags',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "batchId": "CRM-20261103-07", "customers": [ { "id": "us-0042", "name": { "first": "Mia", "last": "Hall" }, "email": "MIA.HALL@EXAMPLE.COM", "birthDate": " ", "createdAt": "2026-11-02T21:15:00-05:00", "loyaltyTier": " silver " } ] }',
        },
      ],
      expected:
        '[ { "customerId": "US-0042", "firstName": "Mia", "lastName": "Hall", "email": "mia.hall@example.com", "birthDate": null, "createdUtc": "2026-11-03 02:15:00", "isActive": 0, "loyaltyTier": "silver", "batchId": "CRM-20261103-07" } ]',
    },
  ],
  followUps: [
    {
      q: 'One row in the batch violates the primary key (error 2627). What happens and how would you design around it?',
      a: 'The batch fails with a DB:QUERY_EXECUTION error and, depending on transaction settings, earlier rows may or may not be committed. Common designs: insert into a staging table without constraints and MERGE into the target in SQL, or wrap the operation in a transaction and fall back to row-by-row inserts to isolate bad rows.',
    },
    {
      q: 'Why not build one INSERT statement string with all values in DataWeave?',
      a: 'String concatenation exposes the database to SQL injection, breaks on quotes in names (e.g. O\'Brien), prevents statement caching and loses type handling for dates and numbers. Parameterised bulk insert solves all of these.',
    },
  ],
}
