export default {
  id: 'dw-085',
  category: 'dataweave',
  title: 'Regroup Delivery Orders XML into a Route Dispatch Plan',
  level: 'ADVANCED',
  tags: ['xml', 'data-formats', 'groupBy', 'orderBy', 'attributes', 'restructure'],
  estMinutes: 30,
  description: `
The order system exports the next day's home deliveries as one flat XML list, about 3,000 orders in order of entry. The transport planning tool needs the same data the other way around: per **route**, with stops in delivery sequence. Both sides use XML, but with different structures.

**Input**: \`orders\` holds \`order\` elements with the attributes \`id\`, \`route\`, \`window\` (\`HH:mm\`) and \`status\`, and the child elements \`customer\`, \`city\`, \`weightKg\` and an optional \`note\`.

**Output**: root \`dispatchPlan\` with one \`route\` element per route.

- Orders with \`status="CANCELLED"\` are left out completely. A route with only cancelled orders does not appear.
- \`route\` elements are sorted by route code ascending.
- \`route\` attributes: \`code\`, \`stops\` (number of stops), \`totalKg\` (sum of the weights, exactly 2 decimals).
- Inside a route, one \`stop\` per order, sorted by \`window\` ascending and then by order \`id\` ascending.
- \`stop\` attributes: \`seq\` (1, 2, 3 within the route), \`orderId\`, \`window\`.
- \`stop\` children, in this order: \`customer\`, \`city\`, and \`note\` **only** when the order has one.
- With nothing to deliver, the result is an empty \`dispatchPlan\`.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/xml',
      content: `<orders>
  <order id="D-1007" route="R2" window="10:00" status="PLANNED">
    <customer>K. Jansen</customer>
    <city>Leiden</city>
    <weightKg>12.5</weightKg>
  </order>
  <order id="D-1003" route="R1" window="14:00" status="PLANNED">
    <customer>Bakkerij Vos</customer>
    <city>Delft</city>
    <weightKg>40</weightKg>
    <note>Use the rear entrance</note>
  </order>
  <order id="D-1005" route="R1" window="09:30" status="PLANNED">
    <customer>M. de Wit</customer>
    <city>Rijswijk</city>
    <weightKg>3.25</weightKg>
  </order>
  <order id="D-1001" route="R1" window="09:30" status="PLANNED">
    <customer>Hotel Zeezicht</customer>
    <city>Den Haag</city>
    <weightKg>18</weightKg>
  </order>
  <order id="D-1002" route="R2" window="08:00" status="CANCELLED">
    <customer>P. Smit</customer>
    <city>Leiden</city>
    <weightKg>7</weightKg>
  </order>
  <order id="D-1009" route="R3" window="11:00" status="CANCELLED">
    <customer>A. Meijer</customer>
    <city>Gouda</city>
    <weightKg>2</weightKg>
  </order>
</orders>`,
    },
  ],
  expected: {
    mime: 'application/xml',
    content: `<?xml version='1.0' encoding='UTF-8'?>
<dispatchPlan>
  <route code="R1" stops="3" totalKg="61.25">
    <stop seq="1" orderId="D-1001" window="09:30">
      <customer>Hotel Zeezicht</customer>
      <city>Den Haag</city>
    </stop>
    <stop seq="2" orderId="D-1005" window="09:30">
      <customer>M. de Wit</customer>
      <city>Rijswijk</city>
    </stop>
    <stop seq="3" orderId="D-1003" window="14:00">
      <customer>Bakkerij Vos</customer>
      <city>Delft</city>
      <note>Use the rear entrance</note>
    </stop>
  </route>
  <route code="R2" stops="1" totalKg="12.50">
    <stop seq="1" orderId="D-1007" window="10:00">
      <customer>K. Jansen</customer>
      <city>Leiden</city>
    </stop>
  </route>
</dispatchPlan>`,
  },
  starterCode: `%dw 2.0
output application/xml
---
{
  dispatchPlan: {
  }
}
`,
  hints: [
    'Start with the list: `(payload.orders.*order default []) filter ((o) -> o.@status != "CANCELLED")`, and then `groupBy ((o) -> o.@route)`.',
    '`groupBy` returns an object keyed by route. `namesOf(groups) orderBy ((c) -> c)` gives the sorted codes, and `groups[code]` gives the orders of one route.',
    'Sort on a composite text key. `HH:mm` sorts correctly as text: `orderBy ((o) -> o.@window ++ "|" ++ o.@id)`.',
    'XML repeats elements through repeated keys, so spread lists into the parent: `{ (list map ((x) -> { stop @(...): { ... } })) }`.',
    'The attribute value can be any expression: `totalKg: sum(stops map ((o) -> o.weightKg as Number)) as String { format: "0.00" }`.',
  ],
  solution: `%dw 2.0
output application/xml

var active = (payload.orders.*order default []) filter ((o) -> o.@status != "CANCELLED")
var routes = active groupBy ((o) -> o.@route)

fun stopElement(o, seq: Number) = {
  stop @(seq: seq, orderId: o.@id, window: o.@window): {
    customer: o.customer,
    city: o.city,
    (note: o.note) if (o.note != null)
  }
}

fun routeElement(code: String) = do {
  var stops = routes[code] orderBy ((o) -> o.@window ++ "|" ++ o.@id)
  var totalKg = sum(stops map ((o) -> o.weightKg as Number))
  ---
  {
    route @(code: code, stops: sizeOf(stops), totalKg: totalKg as String { format: "0.00" }): {
      (stops map ((o, i) -> stopElement(o, i + 1)))
    }
  }
}
---
{
  dispatchPlan: {
    ((namesOf(routes) orderBy ((c) -> c)) map ((code) -> routeElement(code)))
  }
}`,
  explanation: `
**Filter, group, sort, build.** Each step works on plain DataWeave values, and XML only returns at the very end. Thinking of it as "read into lists, reshape, write out" is simpler than thinking of it as moving elements around in a tree.

**Filter before grouping.** Because cancelled orders are removed first, route \`R3\` never comes into existence, and the counts and weights need no special cases. Filtering after the grouping would leave an empty \`R3\`.

**Object keys are not sorted.** \`groupBy\` returns keys in order of first appearance, here \`R2\` first. \`namesOf\` plus \`orderBy\` gives the planned order, and the object is then built in that order.

**Composite sort key.** \`09:30|D-1001\` sorts before \`09:30|D-1005\`, which handles the tie-break in one step. This works on text because \`HH:mm\` is zero padded and has a fixed width. A value such as \`9:30\` would break it.

**\`seq\` after sorting.** The sequence number is the index of the *sorted* list, plus one, so it restarts for each route. Assigning it before sorting would give numbers that follow the entry order.

**Optional children and repeated elements.** \`(note: o.note) if (o.note != null)\` writes the element only when it exists, and the outer parentheses in \`{ (list) }\` spread each single-key object into its parent, which produces repeated \`stop\` and \`route\` elements.
`,
  tests: [
    {
      name: 'All orders cancelled',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<orders><order id="D-2001" route="R9" window="08:00" status="CANCELLED"><customer>X</customer><city>Y</city><weightKg>1</weightKg></order></orders>',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<dispatchPlan/>`,
    },
    {
      name: 'Text escaping, a single order and route codes in reverse order',
      inputs: [
        {
          name: 'payload',
          mime: 'application/xml',
          content:
            '<orders><order id="D-3002" route="R7" window="16:15" status="PLANNED"><customer>Smit &amp; Zn</customer><city>Breda</city><weightKg>0.5</weightKg><note>Call first</note></order><order id="D-3001" route="R10" window="07:45" status="LOADED"><customer>Kok BV</customer><city>Tilburg</city><weightKg>100</weightKg></order></orders>',
        },
      ],
      expected: `<?xml version='1.0' encoding='UTF-8'?>
<dispatchPlan>
  <route code="R10" stops="1" totalKg="100.00">
    <stop seq="1" orderId="D-3001" window="07:45">
      <customer>Kok BV</customer>
      <city>Tilburg</city>
    </stop>
  </route>
  <route code="R7" stops="1" totalKg="0.50">
    <stop seq="1" orderId="D-3002" window="16:15">
      <customer>Smit &amp; Zn</customer>
      <city>Breda</city>
      <note>Call first</note>
    </stop>
  </route>
</dispatchPlan>`,
    },
  ],
  followUps: [
    {
      q: 'In the last test R10 comes before R7. Is that correct, and what would you do if planners object?',
      a: 'It follows the rule, because route codes are sorted as text and "1" comes before "7". If planners expect numeric order, sort on the number inside the code, for example by removing the letter prefix and converting to Number, and state that in the specification.',
    },
    {
      q: 'Why can this mapping not start writing until all input has been read?',
      a: '`groupBy` and `orderBy` need every order before they can produce the first group, so the whole document is in memory while it runs. For a very large input, have the source deliver it per route, or sort upstream.',
    },
  ],
}
