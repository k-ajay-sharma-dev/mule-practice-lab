export default {
  id: 'dw-053',
  category: 'dataweave',
  title: 'Map Oracle Shipment Rows to a Canonical JSON Model',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'oracle', 'database', 'skipNullOn', 'dates', 'lookup'],
  estMinutes: 15,
  description: `
A \`db:select\` against an Oracle shipment table returns rows exactly as the database names them. Map each row to the canonical shipment model used by the tracking API.

The rows have:
- **UPPERCASE** column names
- \`CHAR(10)\` carrier codes padded with spaces
- timestamps without a time zone
- plenty of \`NULL\`s

(The input is shown here as JSON; at runtime it would be the connector's result.)

| Canonical field | Source | Rule |
|---|---|---|
| \`shipmentId\` | \`SHIPMENT_ID\` | as a **string** |
| \`orderNumber\` | \`ORDER_NO\` | as is |
| \`carrier\` | \`CARRIER_CODE\` | trimmed; blank counts as no value |
| \`shippedAt\` | \`SHIP_TS\` | \`yyyy-MM-dd HH:mm:ss\` in **UTC** → ISO 8601, e.g. \`2026-11-02T14:05:31Z\` |
| \`deliveredAt\` | \`DELIVERED_TS\` | same as \`shippedAt\` |
| \`weightKg\` | \`WEIGHT_KG\` | as is |
| \`status\` | \`STATUS_CD\` | \`CR\` → \`CREATED\`, \`IT\` → \`IN_TRANSIT\`, \`DL\` → \`DELIVERED\`, anything else (or null) → \`UNKNOWN\` |

The canonical API **omits** fields that have no value. Never send \`null\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "SHIPMENT_ID": 880101, "ORDER_NO": "SO-55120", "CARRIER_CODE": "UPS       ", "SHIP_TS": "2026-11-02 14:05:31", "DELIVERED_TS": null, "WEIGHT_KG": 12.5, "STATUS_CD": "IT" },
  { "SHIPMENT_ID": 880102, "ORDER_NO": "SO-55121", "CARRIER_CODE": "DHL       ", "SHIP_TS": "2026-11-01 09:00:00", "DELIVERED_TS": "2026-11-02 16:45:10", "WEIGHT_KG": null, "STATUS_CD": "DL" },
  { "SHIPMENT_ID": 880103, "ORDER_NO": "SO-55122", "CARRIER_CODE": null, "SHIP_TS": null, "DELIVERED_TS": null, "WEIGHT_KG": 3, "STATUS_CD": "XX" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "shipmentId": "880101", "orderNumber": "SO-55120", "carrier": "UPS", "shippedAt": "2026-11-02T14:05:31Z", "weightKg": 12.5, "status": "IN_TRANSIT" },
  { "shipmentId": "880102", "orderNumber": "SO-55121", "carrier": "DHL", "shippedAt": "2026-11-01T09:00:00Z", "deliveredAt": "2026-11-02T16:45:10Z", "status": "DELIVERED" },
  { "shipmentId": "880103", "orderNumber": "SO-55122", "weightKg": 3, "status": "UNKNOWN" }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload map (row) -> {
  shipmentId: row.SHIPMENT_ID
}
`,
  hints: [
    'A lookup object replaces a chain of `if`s: `var statuses = { CR: "CREATED", IT: "IN_TRANSIT", DL: "DELIVERED" }`, then `statuses[row.STATUS_CD] default "UNKNOWN"`.',
    'Parse with `ts as LocalDateTime {format: "yyyy-MM-dd HH:mm:ss"}` and add the zone with `++ |Z|` to get a `DateTime`. Guard against `null` first.',
    'The JSON writer can drop nulls for you: `output application/json skipNullOn="everywhere"`.',
  ],
  solution: `%dw 2.0
output application/json skipNullOn="everywhere"

var statuses = { CR: "CREATED", IT: "IN_TRANSIT", DL: "DELIVERED" }

fun utc(ts: String | Null) =
  if (ts == null) null
  else (ts as LocalDateTime {format: "yyyy-MM-dd HH:mm:ss"}) ++ |Z|

fun clean(s: String | Null) = if (isEmpty(trim(s))) null else trim(s)
---
payload map (row) -> {
  shipmentId: row.SHIPMENT_ID as String,
  orderNumber: row.ORDER_NO,
  carrier: clean(row.CARRIER_CODE),
  shippedAt: utc(row.SHIP_TS),
  deliveredAt: utc(row.DELIVERED_TS),
  weightKg: row.WEIGHT_KG,
  status: statuses[row.STATUS_CD] default "UNKNOWN"
}`,
  explanation: `
- **Timestamps**: an Oracle \`TIMESTAMP\` column has no zone. Parsing it as \`LocalDateTime\` and appending \`|Z|\` states the agreed fact "the database stores UTC" and yields a real \`DateTime\`, which the JSON writer prints in ISO 8601. Parsing it directly as \`DateTime\` would fail because the text carries no offset.
- **CHAR padding**: \`CHAR(10)\` columns come back right-padded with spaces; \`trim\` removes them. \`trim(null)\` is \`null\` and \`isEmpty\` is true for both \`null\` and \`""\`, so an all-space or missing code becomes \`null\` and then disappears.
- **Nulls**: \`skipNullOn="everywhere"\` drops every null-valued field (and null array items) at write time, so the mapping can stay a plain one-to-one list of fields.
- **Lookup**: \`statuses[null]\` and \`statuses["XX"]\` are both \`null\`, so one \`default\` covers unknown and missing codes.

Common traps:
- \`null as LocalDateTime {...}\` throws — the null check must come first.
- Forgetting \`as String\` on the id: \`880101\` and \`"880101"\` are different JSON values for the consuming API.
`,
  tests: [
    {
      name: 'Blank carrier code and null status',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "SHIPMENT_ID": 7, "ORDER_NO": null, "CARRIER_CODE": "          ", "SHIP_TS": "2026-01-31 23:59:59", "DELIVERED_TS": null, "WEIGHT_KG": null, "STATUS_CD": null }]',
        },
      ],
      expected: '[{ "shipmentId": "7", "shippedAt": "2026-01-31T23:59:59Z", "status": "UNKNOWN" }]',
    },
  ],
  followUps: [
    {
      q: 'Could you convert the timestamp in SQL instead?',
      a: 'Yes, for example `TO_CHAR(SYS_EXTRACT_UTC(ship_ts), \'YYYY-MM-DD"T"HH24:MI:SS"Z"\')` or `FROM_TZ` for plain `TIMESTAMP` columns. Doing it in SQL keeps the mapping simple, but it hides the zone assumption in the query; either way the assumption (UTC vs database session time zone) must be documented.',
    },
    {
      q: 'Why do the column names come back in UPPERCASE?',
      a: 'Oracle stores unquoted identifiers in upper case, and the Database connector uses the column label from the JDBC metadata as the key. Aliasing with quoted identifiers (`AS "shipmentId"`) changes the keys, but most teams keep SQL plain and rename in DataWeave.',
    },
    {
      q: 'The table has 2 million rows. Is `db:select` plus `map` fine?',
      a: 'The Database connector streams the result by default, and `map` can consume it as a stream if nothing forces the whole array into memory (sorting or `sizeOf` would). For really large extracts, page with a watermark or use `db:listener`, and write out in batches.',
    },
  ],
}
