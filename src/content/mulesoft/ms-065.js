export default {
  id: 'ms-065',
  category: 'mulesoft',
  title: 'Store Sales Across Time Zones: Oracle DATE, TIMESTAMP and TIMESTAMP WITH TIME ZONE in DataWeave',
  level: 'INTERMEDIATE',
  tags: ['retail', 'oracle', 'database', 'dataweave', 'time-zones', 'pos'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each Oracle type to what it stores.',
      pairs: [
        ['DATE', 'Date and time to the second, no fractional seconds, no time zone'],
        ['TIMESTAMP', 'Date and time with fractional seconds, no time zone'],
        ['TIMESTAMP WITH TIME ZONE', 'Date, time, fractional seconds and the time zone offset or region'],
        ['TIMESTAMP WITH LOCAL TIME ZONE', 'Normalised to the database time zone and shown in the session time zone'],
      ],
      explain: 'Only the WITH TIME ZONE variants carry zone information. DATE in Oracle always includes a time part, which surprises people coming from other databases.',
    },
    {
      type: 'single',
      prompt: 'POS sales are stored in a `DATE` column as **store local time**. The Mule app runs on CloudHub with the JVM in UTC. A Chicago sale at 21:30 local time is read and sent to the ERP as `21:30Z`. What went wrong?',
      options: [
        'The DATE had no zone, so it was interpreted in the JVM time zone (UTC), not the store zone',
        'Oracle converted the time to UTC when storing it',
        'DataWeave always formats dates in UTC',
        'The JDBC driver rounded the time',
      ],
      answer: 0,
      explain: 'A zone-less value is read as a timestamp in the runtime JVM time zone. For a store-local value you must attach the store time zone yourself (or store UTC/WITH TIME ZONE in the first place).',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'In DataWeave, how do you correctly turn the store-local value into an instant for the Chicago store?',
      options: [
        'Take the local date-time (as LocalDateTime) and append the store zone: (row.SALE_TS as LocalDateTime) ++ ("America/Chicago" as TimeZone)',
        "row.SALE_TS >> 'America/Chicago'",
        "row.SALE_TS as String {format: 'yyyy-MM-dd HH:mm'}",
        'now() ++ ("America/Chicago" as TimeZone)',
      ],
      answer: 0,
      explain: '`++` attaches a zone to a LocalDateTime without moving the wall-clock time. `>>` **shifts** an instant to another zone (same instant, different wall clock), which would move 21:30 to 16:30 or similar. A zone region must be coerced from a string: `|America/Chicago|` does not parse, although an offset literal such as `|-06:00|` does.',
    },
    {
      type: 'single',
      prompt: 'What does `|2026-11-03T03:30:00Z| >> "America/Chicago"` return?',
      options: [
        'The same instant expressed in Chicago time: 2026-11-02T21:30:00-06:00',
        '2026-11-03T03:30:00-06:00 — the zone is replaced and the time kept',
        'A LocalDateTime without a zone',
        'An error, >> only works on Dates',
      ],
      answer: 0,
      explain: 'The `>>` operator changes the zone while keeping the instant, so the wall-clock time changes. After 1 Nov 2026 Chicago is on CST (UTC-6).',
    },
    {
      type: 'single',
      prompt: 'A retailer has stores in several time zones. An end-of-day sales feed groups sales by business date. How should the business date of a sale be derived?',
      options: [
        'From the sale time in the store time zone',
        'From the UTC date of the sale',
        'From the server time zone of the runtime that processes it',
        'From Oracle `SYSDATE` at the time of the extract',
      ],
      answer: 0,
      explain: 'A 21:30 sale in Los Angeles is 05:30Z the next day, so its UTC date is the next business date. Relying on the runtime time zone makes results depend on where the app happens to run, and `SYSDATE` depends on the DB server settings. Unambiguous storage plus explicit conversion at the edges avoids drift: store event times as UTC (or TIMESTAMP WITH TIME ZONE), keep the store time zone on the store master, and pass dates to Oracle as bound DateTime parameters rather than formatted strings in the SQL.',
    },
  ],
  description: `
A sporting-goods retailer has **600 stores across 4 US time zones**. Each night a Mule app reads the day's POS sales from Oracle and posts **end-of-day store sales** to SAP S/4HANA, grouped by **business date**.

\`\`\`sql
POS_SALES (STORE_ID VARCHAR2(6), TXN_ID VARCHAR2(30), SALE_TS DATE,            -- store local time
           SETTLED_AT TIMESTAMP WITH TIME ZONE, AMOUNT NUMBER(12,2))
STORES    (STORE_ID VARCHAR2(6), TZ VARCHAR2(40))                             -- e.g. 'America/Chicago'
\`\`\`

The app was moved from an on-prem server (JVM time zone America/New_York) to **CloudHub 2.0** (JVM in UTC). Since then:
- Sales at 21:30 in Chicago are sent to SAP as \`21:30Z\` — six hours off — so hourly sales reports show the evening peak in mid-afternoon.
- Finance also asks why some late-evening West Coast sales were booked to the **next** business date when the team tried to "fix" it by converting to UTC first.
- The extract query \`WHERE SALE_TS >= :fromDate\` sometimes misses or double-counts the last hour.
- Around the November daylight-saving change, totals for one hour looked doubled.

**Questions**
1. Explain the differences between Oracle DATE, TIMESTAMP, TIMESTAMP WITH TIME ZONE and WITH LOCAL TIME ZONE.
2. Why did moving to CloudHub change the times, and how does a zone-less value become a DataWeave DateTime?
3. Write the DataWeave to attach the store zone, convert to UTC, and compute the business date.
4. How do you bind date parameters, and what would you change in the data model?
`,
  answerTemplate: `## Oracle date and time types

## Why the times moved

## DataWeave conversions

## Parameters and data model
`,
  keyPoints: [
    'Oracle DATE has a time part to the second but no zone; TIMESTAMP adds fractions; WITH TIME ZONE stores the zone; WITH LOCAL TIME ZONE normalises to the DB zone.',
    'Zone-less values are interpreted in the runtime JVM time zone when read through JDBC, so moving to a UTC runtime changes the meaning of local times.',
    'In DataWeave, ++ attaches a zone to a LocalDateTime (same wall clock); >> shifts a DateTime to another zone (same instant).',
    'Compute the business date in the store zone from the store master, not from the UTC date or the server zone.',
    'Bind dates as parameters, store instants in UTC or WITH TIME ZONE, and beware ambiguous local times during DST changes.',
  ],
  solution: `
**1. Types.** \`DATE\` = date + time to the second, no zone. \`TIMESTAMP\` = plus fractional seconds, no zone. \`TIMESTAMP WITH TIME ZONE\` = keeps an offset or region. \`TIMESTAMP WITH LOCAL TIME ZONE\` = stored normalised to the DB time zone and presented in the session time zone.

**2. Why the times moved.** \`SALE_TS\` has no zone. JDBC hands it to Mule as a timestamp, and it becomes a DateTime in the **JVM default time zone**. On-prem the value was read as New York time and written back out as New York wall-clock text, so the mistake stayed invisible; on CloudHub the JVM is in UTC, so 21:30 local became \`21:30Z\` — which is 15:30 in Chicago. The attempted fix (convert to UTC, then take the date) is also wrong: a 21:30 sale in Los Angeles is 05:30Z the next day, so its UTC date is the next business date.

**3. DataWeave.**
\`\`\`dataweave
%dw 2.0
output application/json
---
payload map (row) -> do {
  var tz = vars.storeZones[row.STORE_ID]                       // 'America/Chicago'
  var localTs = row.SALE_TS as LocalDateTime                   // drop the JVM zone, keep 21:30
  var instant = localTs ++ (tz as TimeZone)                    // 21:30-05:00 / -06:00
  ---
  {
    storeId: row.STORE_ID,
    txnId: row.TXN_ID,
    saleUtc: (instant >> "UTC") as String { format: "yyyy-MM-dd'T'HH:mm:ss'Z'" },
    businessDate: instant as String { format: "yyyy-MM-dd" },            // date in the store zone
    amount: row.AMOUNT
  }
}
\`\`\`
\`++\` attaches a zone without changing the wall clock; \`>>\` keeps the instant and changes the zone. The business date is taken **before** converting to UTC.

**4. Parameters and model.**
- Bind the extract window as parameters (\`:fromTs\`, \`:toTs\`) built in DataWeave per time zone, rather than formatting strings into SQL; use half-open windows (\`>= from AND < to\`) to avoid double counting.
- Store new events as UTC (\`TIMESTAMP\` in UTC by convention) or \`TIMESTAMP WITH TIME ZONE\`, and keep the store zone on the store master.
- During the "fall back" hour local times repeat (01:00–01:59 occurs twice), so a DATE in local time is **ambiguous** — another reason to store instants.
- Do not depend on the JVM time zone; if legacy data must be read, convert explicitly as above.
`,
  followUps: [
    {
      q: 'Could you just set the JVM time zone of the CloudHub app to America/Chicago?',
      a: 'It would hide the problem for one zone only; stores are in four zones. Explicit conversion with the store time zone is correct everywhere and independent of where the app runs.',
    },
    {
      q: 'What does Oracle SYSDATE return in this situation?',
      a: 'SYSDATE returns the database server operating-system date and time with no zone, so it depends on the DB server settings. SYSTIMESTAMP includes the offset, and SYS_EXTRACT_UTC can convert a WITH TIME ZONE value to UTC.',
    },
    {
      q: 'How would you test DST handling?',
      a: 'Write MUnit/DataWeave tests with fixed sales at 00:30, 01:30 and 02:30 on the DST change dates for each store zone, and assert UTC values and business dates explicitly.',
    },
  ],
}
