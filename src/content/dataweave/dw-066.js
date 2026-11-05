export default {
  id: 'dw-066',
  category: 'dataweave',
  title: 'Shopify Order to an SAP ORDERS05 IDoc',
  level: 'ADVANCED',
  tags: ['retail', 'e-commerce', 'shopify', 'sap', 'idoc', 'xml', 'dates', 'number-formatting'],
  estMinutes: 35,
  description: `
Web orders from a Shopify-style store arrive by webhook. The SAP team expects them as an **ORDERS05 IDoc in XML** (sent through the SAP connector / an IDoc-XML port). They gave you this simplified mapping spec — write it in DataWeave.

**Structure** (every segment element carries the attribute \`SEGMENT="1"\`; the root is \`ORDERS05\` containing one \`IDOC\` with \`BEGIN="1"\`), segments in this order:
1. \`EDI_DC40\` — control record: \`IDOCTYP\` \`ORDERS05\`, \`MESTYP\` \`ORDERS\`, \`SNDPRN\` \`SHOPIFY\`, \`RCVPRN\` \`S4HCLNT100\`.
2. \`E1EDK01\` — \`CURCY\` = order \`currency\`.
3. \`E1EDK14\` — \`QUALF\` \`012\` (order type), \`ORGID\` \`ZWEB\`.
4. \`E1EDK03\` — \`IDDAT\` \`022\` (purchase order date), \`DATUM\` = date of \`created_at\` as \`yyyyMMdd\`, **in the shop's local time as given in the timestamp** (do not convert to UTC).
5. \`E1EDK05\` — shipping charge: \`ALCKZ\` \`+\`, \`KSCHL\` \`ZFRT\`, \`BETRG\` = sum of \`shipping_lines[].price\`, two decimals. **Omit** the segment when the sum is 0.
6. \`E1EDKA1\` sold-to: \`PARVW\` \`AG\`, \`PARTN\` = \`customer.id\`, or \`WEBGUEST\` when \`customer\` is null.
7. \`E1EDKA1\` ship-to: \`PARVW\` \`WE\`, \`NAME1\` = first + space + last name, \`STRAS\` = \`address1\` **cut to 35 characters**, \`ORT01\` = city, \`PSTLZ\` = zip, \`LAND1\` = \`country_code\`. **Omit** the segment when \`shipping_address\` is null (click-and-collect).
8. \`E1EDK02\` — \`QUALF\` \`001\` (customer order number), \`BELNR\` = \`name\` without the \`#\`.
9. One \`E1EDP01\` per line item, **excluding gift cards** (\`gift_card: true\` — they are fulfilled by the gift-card platform):
   - \`POSEX\` — item number 10, 20, 30 … over the **included** lines, zero-padded to 6 digits
   - \`MENGE\` — quantity with three decimals (\`2.000\`)
   - \`VPREI\` — net unit price: \`(price * quantity - sum of discount_allocations amounts) / quantity\`, two decimals
   - a nested \`E1EDP19\` with \`QUALF\` \`002\` and \`IDTNR\` = \`sku\`

Note: like the real Shopify REST API, money values are **strings** (\`"19.99"\`).
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "id": 5873320411234,
  "name": "#1042",
  "created_at": "2025-11-02T00:31:07+01:00",
  "currency": "EUR",
  "financial_status": "paid",
  "customer": { "id": 7712093, "first_name": "Sanne", "last_name": "de Vries" },
  "shipping_address": {
    "first_name": "Sanne",
    "last_name": "de Vries",
    "address1": "Prinsengracht 263, Achterhuis, 2e verdieping",
    "city": "Amsterdam",
    "zip": "1016 GV",
    "country_code": "NL"
  },
  "line_items": [
    { "id": 1, "sku": "TEE-100-NAV-M", "title": "Organic Cotton Tee", "quantity": 2, "price": "19.99", "gift_card": false,
      "discount_allocations": [ { "amount": "4.00" } ] },
    { "id": 2, "sku": "GC-25", "title": "Gift Card", "quantity": 1, "price": "25.00", "gift_card": true,
      "discount_allocations": [] },
    { "id": 3, "sku": "MUG-200", "title": "Enamel Camp Mug", "quantity": 3, "price": "12.00", "gift_card": false,
      "discount_allocations": [ { "amount": "0.60" }, { "amount": "0.40" } ] }
  ],
  "shipping_lines": [ { "code": "Standard", "price": "4.95" } ]
}`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<ORDERS05>
  <IDOC BEGIN="1">
    <EDI_DC40 SEGMENT="1">
      <IDOCTYP>ORDERS05</IDOCTYP>
      <MESTYP>ORDERS</MESTYP>
      <SNDPRN>SHOPIFY</SNDPRN>
      <RCVPRN>S4HCLNT100</RCVPRN>
    </EDI_DC40>
    <E1EDK01 SEGMENT="1">
      <CURCY>EUR</CURCY>
    </E1EDK01>
    <E1EDK14 SEGMENT="1">
      <QUALF>012</QUALF>
      <ORGID>ZWEB</ORGID>
    </E1EDK14>
    <E1EDK03 SEGMENT="1">
      <IDDAT>022</IDDAT>
      <DATUM>20251102</DATUM>
    </E1EDK03>
    <E1EDK05 SEGMENT="1">
      <ALCKZ>+</ALCKZ>
      <KSCHL>ZFRT</KSCHL>
      <BETRG>4.95</BETRG>
    </E1EDK05>
    <E1EDKA1 SEGMENT="1">
      <PARVW>AG</PARVW>
      <PARTN>7712093</PARTN>
    </E1EDKA1>
    <E1EDKA1 SEGMENT="1">
      <PARVW>WE</PARVW>
      <NAME1>Sanne de Vries</NAME1>
      <STRAS>Prinsengracht 263, Achterhuis, 2e v</STRAS>
      <ORT01>Amsterdam</ORT01>
      <PSTLZ>1016 GV</PSTLZ>
      <LAND1>NL</LAND1>
    </E1EDKA1>
    <E1EDK02 SEGMENT="1">
      <QUALF>001</QUALF>
      <BELNR>1042</BELNR>
    </E1EDK02>
    <E1EDP01 SEGMENT="1">
      <POSEX>000010</POSEX>
      <MENGE>2.000</MENGE>
      <VPREI>17.99</VPREI>
      <E1EDP19 SEGMENT="1">
        <QUALF>002</QUALF>
        <IDTNR>TEE-100-NAV-M</IDTNR>
      </E1EDP19>
    </E1EDP01>
    <E1EDP01 SEGMENT="1">
      <POSEX>000020</POSEX>
      <MENGE>3.000</MENGE>
      <VPREI>11.67</VPREI>
      <E1EDP19 SEGMENT="1">
        <QUALF>002</QUALF>
        <IDTNR>MUG-200</IDTNR>
      </E1EDP19>
    </E1EDP01>
  </IDOC>
</ORDERS05>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
{
  ORDERS05: {
    IDOC @(BEGIN: "1"): {
      EDI_DC40 @(SEGMENT: "1"): {
        IDOCTYP: "ORDERS05"
      }
    }
  }
}
`,
  hints: [
    'Repeated and optional segments go into the object with dynamic elements: `(if (cond) { E1EDK05 @(SEGMENT: "1"): {...} } else {})` and `(lines map (l, i) -> { E1EDP01 @(SEGMENT: "1"): {...} })`.',
    'Filter out the gift cards **before** numbering, then use the map index: `((i + 1) * 10) as String {format: "000000"}`.',
    'Money comes as strings: `l.price as Number`. `sum([])` is `0`, so items without discounts need no special case.',
    '`created_at as DateTime` keeps the `+01:00` offset; formatting it with `{format: "yyyyMMdd"}` gives the local date. Shifting it to UTC first (`>> "UTC"`) would give the previous day.',
    'Cut a string safely: `if (sizeOf(s) > 35) s[0 to 34] else s`.',
  ],
  solution: `%dw 2.0
output application/xml
fun money(n) = n as String {format: "0.00"}
fun cut(s, n) = if (s == null or sizeOf(s) <= n) s else s[0 to n - 1]
var order = payload
var items = (order.line_items default []) filter ($.gift_card != true)
var shipping = sum((order.shipping_lines default []) map ($.price as Number))
var ship = order.shipping_address
---
{
  ORDERS05: {
    IDOC @(BEGIN: "1"): {
      EDI_DC40 @(SEGMENT: "1"): {
        IDOCTYP: "ORDERS05",
        MESTYP: "ORDERS",
        SNDPRN: "SHOPIFY",
        RCVPRN: "S4HCLNT100"
      },
      E1EDK01 @(SEGMENT: "1"): {
        CURCY: order.currency
      },
      E1EDK14 @(SEGMENT: "1"): {
        QUALF: "012",
        ORGID: "ZWEB"
      },
      E1EDK03 @(SEGMENT: "1"): {
        IDDAT: "022",
        DATUM: (order.created_at as DateTime) as String {format: "yyyyMMdd"}
      },
      (if (shipping > 0) {
        E1EDK05 @(SEGMENT: "1"): {
          ALCKZ: "+",
          KSCHL: "ZFRT",
          BETRG: money(shipping)
        }
      } else {}),
      E1EDKA1 @(SEGMENT: "1"): {
        PARVW: "AG",
        PARTN: if (order.customer == null) "WEBGUEST" else order.customer.id as String
      },
      (if (ship != null) {
        E1EDKA1 @(SEGMENT: "1"): {
          PARVW: "WE",
          NAME1: ship.first_name ++ " " ++ ship.last_name,
          STRAS: cut(ship.address1, 35),
          ORT01: ship.city,
          PSTLZ: ship.zip,
          LAND1: ship.country_code
        }
      } else {}),
      E1EDK02 @(SEGMENT: "1"): {
        QUALF: "001",
        BELNR: order.name replace "#" with ""
      },
      (items map (l, i) -> do {
        var qty = l.quantity as Number
        var discount = sum((l.discount_allocations default []) map ($.amount as Number))
        ---
        {
          E1EDP01 @(SEGMENT: "1"): {
            POSEX: ((i + 1) * 10) as String {format: "000000"},
            MENGE: qty as String {format: "0.000"},
            VPREI: money(((l.price as Number) * qty - discount) / qty),
            E1EDP19 @(SEGMENT: "1"): {
              QUALF: "002",
              IDTNR: l.sku
            }
          }
        }
      })
    }
  }
}`,
  explanation: `
**Repeated keys build repeated elements.** An XML output object may contain the same key several times (\`E1EDKA1\` twice). Dynamic elements \`( ... )\` splice in zero, one or many key/value pairs: an \`if\` returning \`{}\` produces nothing (optional segment), a \`map\` returning an array of objects produces one element per item. This is how segment order is kept exactly as the spec lists it, which matters: the IDoc XML parser validates segments against the IDoc type definition.

**Attributes.** \`E1EDP01 @(SEGMENT: "1"): {...}\` writes the attribute on the element. In real IDoc XML every segment carries \`SEGMENT="1"\`.

**Numbering after filtering.** POSEX is computed from the index of the **filtered** list. Numbering the original lines and filtering afterwards would give 10 and 30 — SAP accepts it, but it breaks the "10, 20, 30" convention the spec asks for and confuses order-change messages later.

**Strings to numbers.** Shopify sends money as strings to avoid floating-point issues; converting with \`as Number\` gives DataWeave decimals. \`(36 - 1) / 3\` is \`11.666…\` and \`{format: "0.00"}\` rounds HALF_UP to \`11.67\`.

**Dates and time zones.** \`2025-11-02T00:31:07+01:00\` is 2025-11-01 in UTC. The order was placed on Nov 2 in the shop's time zone, which is what the business expects in SAP. \`as DateTime\` keeps the offset, and formatting does not shift it.

**Safe substring.** \`s[0 to 34]\` on a shorter string fails, so \`cut\` checks the length first. SAP fields have fixed maximum lengths; silently truncating is acceptable here only because the spec says so — often the full address is sent in additional fields (\`STRS2\`) instead.
`,
  tests: [
    {
      name: 'Guest click-and-collect order without shipping',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "id": 1, "name": "#2001", "created_at": "2025-11-03T23:59:00-05:00", "currency": "USD", "customer": null, "shipping_address": null, "line_items": [ { "id": 9, "sku": "LAMP-5", "title": "Desk Lamp", "quantity": 1, "price": "34.50", "gift_card": false, "discount_allocations": [] } ], "shipping_lines": [] }',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<ORDERS05><IDOC BEGIN="1">
<EDI_DC40 SEGMENT="1"><IDOCTYP>ORDERS05</IDOCTYP><MESTYP>ORDERS</MESTYP><SNDPRN>SHOPIFY</SNDPRN><RCVPRN>S4HCLNT100</RCVPRN></EDI_DC40>
<E1EDK01 SEGMENT="1"><CURCY>USD</CURCY></E1EDK01>
<E1EDK14 SEGMENT="1"><QUALF>012</QUALF><ORGID>ZWEB</ORGID></E1EDK14>
<E1EDK03 SEGMENT="1"><IDDAT>022</IDDAT><DATUM>20251103</DATUM></E1EDK03>
<E1EDKA1 SEGMENT="1"><PARVW>AG</PARVW><PARTN>WEBGUEST</PARTN></E1EDKA1>
<E1EDK02 SEGMENT="1"><QUALF>001</QUALF><BELNR>2001</BELNR></E1EDK02>
<E1EDP01 SEGMENT="1"><POSEX>000010</POSEX><MENGE>1.000</MENGE><VPREI>34.50</VPREI><E1EDP19 SEGMENT="1"><QUALF>002</QUALF><IDTNR>LAMP-5</IDTNR></E1EDP19></E1EDP01>
</IDOC></ORDERS05>`,
    },
  ],
  followUps: [
    {
      q: 'How does the IDoc actually reach SAP from Mule?',
      a: 'With the SAP connector: either send the IDoc or call a BAPI such as a sales-order create BAPI. The connector converts the XML to the IDoc format and transmits it via tRFC/qRFC, usually with a transaction ID for exactly-once processing. SAP then processes the inbound IDoc with its configured process code.',
    },
    {
      q: 'Shopify retries the webhook if you do not answer within a few seconds. How do you design for that?',
      a: 'Acknowledge fast: validate the HMAC, publish the raw order to a persistent queue (ActiveMQ/Anypoint MQ) and return 200. A separate consumer maps and sends to SAP, deduplicating on the Shopify order id, so retries and SAP downtime do not create duplicate sales orders.',
    },
    {
      q: 'Why send a net unit price instead of the gross price plus a discount condition?',
      a: 'It is the simpler mapping, but SAP then cannot report the discount. If finance needs promotions visible, send the gross price and the discount as item conditions (E1EDP05) so SAP pricing records both; the spec must say which approach the SD team configured.',
    },
  ],
}
