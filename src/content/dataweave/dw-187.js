export default {
  id: 'dw-187',
  category: 'dataweave',
  title: 'Shipment Event Times for Oracle: UTC Timestamps and Local Business Dates',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'dates', 'time-zones', 'timestamp', 'json'],
  estMinutes: 20,
  description: `
Quayle Freight writes shipment events from many countries into an Oracle table. The DBA asks for two columns:

- \`EVENT_TS_UTC\`: a TIMESTAMP holding the event time in UTC, sent as text \`yyyy-MM-dd HH:mm:ss\` for \`TO_TIMESTAMP(:ts, 'YYYY-MM-DD HH24:MI:SS')\`
- \`BUSINESS_DATE\`: the date where the event happened, in its own local time, as \`yyyy-MM-dd\`

Each event time is ISO text. Most have an offset, such as \`Z\` or \`-05:00\`. A time without an offset cannot be placed in UTC, so it goes to \`rejects\` with \`shipmentId\`, \`eventTime\` and the reason \`"No time zone offset"\`.

Each row has \`SHIPMENT_ID\`, \`EVENT_CODE\` (the event type in upper case), \`EVENT_TS_UTC\` and \`BUSINESS_DATE\`. Sort the rows by \`EVENT_TS_UTC\`. Keep rejects in input order. Return an object with \`rows\` and \`rejects\`; both are empty lists when there is nothing for them.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "events": [
    { "shipmentId": "QF-1001", "eventType": "picked_up", "eventTime": "2026-11-18T08:05:00Z" },
    { "shipmentId": "QF-1002", "eventType": "delivered", "eventTime": "2026-11-18T23:30:00-05:00" },
    { "shipmentId": "QF-1003", "eventType": "delivered", "eventTime": "2026-11-19T00:15:00+01:00" },
    { "shipmentId": "QF-1004", "eventType": "delivered", "eventTime": "2026-11-18T14:00:00" }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "rows": [
    { "SHIPMENT_ID": "QF-1001", "EVENT_CODE": "PICKED_UP", "EVENT_TS_UTC": "2026-11-18 08:05:00", "BUSINESS_DATE": "2026-11-18" },
    { "SHIPMENT_ID": "QF-1003", "EVENT_CODE": "DELIVERED", "EVENT_TS_UTC": "2026-11-18 23:15:00", "BUSINESS_DATE": "2026-11-19" },
    { "SHIPMENT_ID": "QF-1002", "EVENT_CODE": "DELIVERED", "EVENT_TS_UTC": "2026-11-19 04:30:00", "BUSINESS_DATE": "2026-11-18" }
  ],
  "rejects": [
    { "shipmentId": "QF-1004", "eventTime": "2026-11-18T14:00:00", "reason": "No time zone offset" }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  rows: payload.events map (e) -> {
    SHIPMENT_ID: e.shipmentId,
    EVENT_TS_UTC: e.eventTime
  }
}
`,
  hints: [
    'Check for an offset with `matches /.*(Z|[+-]\\d{2}:\\d{2})$/`.',
    'Read the text with `as DateTime`. Shift it to UTC with `>> "UTC"`, then format it.',
    'Formatting the original DateTime with `"yyyy-MM-dd"` gives the date in its own offset, which is the local business date.',
    'The UTC text sorts in time order, so `orderBy $.EVENT_TS_UTC` works.',
  ],
  solution: `%dw 2.0
output application/json

fun hasOffset(t) = (t default "") matches /.*(Z|[+-]\\d{2}:\\d{2})$/

var good = payload.events filter (e) -> hasOffset(e.eventTime)
var bad = payload.events filter (e) -> not hasOffset(e.eventTime)
---
{
  rows: (good map (e) -> do {
    var t = e.eventTime as DateTime
    ---
    {
      SHIPMENT_ID: e.shipmentId,
      EVENT_CODE: upper(e.eventType),
      EVENT_TS_UTC: (t >> "UTC") as String {format: "yyyy-MM-dd HH:mm:ss"},
      BUSINESS_DATE: t as String {format: "yyyy-MM-dd"}
    }
  }) orderBy (r) -> r.EVENT_TS_UTC,
  rejects: bad map (e) -> {
    shipmentId: e.shipmentId,
    eventTime: e.eventTime,
    reason: "No time zone offset"
  }
}`,
  explanation: `
**Two questions, two columns.** "When did it happen?" needs one time line, so the timestamp is stored in UTC. "Which day does it count for?" needs the local calendar, so the business date uses the event's own offset. QF-1002 shows why: 23:30 in New York is already the next day in UTC.

**The shift operator.** \`>> "UTC"\` keeps the instant and changes the zone, so the formatted text is UTC wall time. Formatting the original value keeps its own offset.

**No offset, no guess.** A time without an offset could be any zone. Guessing the server zone is how one hour errors appear. Rejecting it makes the sender fix the feed.

**Text with an explicit mask.** Sending \`yyyy-MM-dd HH:mm:ss\` with a matching \`TO_TIMESTAMP\` mask in the SQL avoids the session NLS settings. A column named \`_UTC\` tells every reader the rule.
`,
  tests: [
    {
      name: 'Half hour offset east of UTC',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "events": [{ "shipmentId": "QF-2001", "eventType": "arrived", "eventTime": "2026-11-18T03:00:00+05:30" }] }',
        },
      ],
      expected:
        '{ "rows": [{ "SHIPMENT_ID": "QF-2001", "EVENT_CODE": "ARRIVED", "EVENT_TS_UTC": "2026-11-17 21:30:00", "BUSINESS_DATE": "2026-11-18" }], "rejects": [] }',
    },
    {
      name: 'No events',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "events": [] }' }],
      expected: '{ "rows": [], "rejects": [] }',
    },
  ],
  followUps: [
    {
      q: 'Why not use a TIMESTAMP WITH TIME ZONE column instead?',
      a: 'That keeps the offset with the value and is a good choice. Some teams still prefer a UTC column for simple range queries and a separate business date.',
    },
    {
      q: 'Could you bind a DateTime instead of text?',
      a: 'Yes, the driver can bind it. Check how the driver maps the zone for a plain TIMESTAMP column, since the result can depend on the JVM zone.',
    },
    {
      q: 'The sender sends times with a zone name, such as Europe/Paris. What changes?',
      a: 'A zone name handles daylight saving rules. DataWeave can read it with the right format, and the offset check must accept it.',
    },
  ],
}
