export default {
  id: 'ms-305',
  category: 'mulesoft',
  title: 'Dates and Time Zones Between Mule and Oracle: DATE, TIMESTAMP and NLS Settings',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'oracle', 'dates', 'time-zones', 'nls', 'timestamp'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A Select with WHERE SHIP_DATE = TO_DATE(:day, \'YYYY-MM-DD\') on a DATE column returns no rows for a day that had 300 shipments. Why?',
      options: [
        'DATE keeps milliseconds, and the bound value has none, so no time can match',
        'TO_DATE returns a TIMESTAMP, and Oracle never finds a TIMESTAMP equal to a DATE',
        'SHIP_DATE also holds a time to the second, so only rows at exactly midnight match',
        'DATE is stored in the database time zone, so the bound day is shifted by the offset',
      ],
      answer: 2,
      explain: 'A DATE always has a time part to the second, with no zone and no fractions. TO_DATE with a day mask gives midnight, so the filter matches only rows stamped 00:00:00. Use a range from the day to the next day. TO_DATE returns a DATE, not a TIMESTAMP. Milliseconds and a time zone belong to the TIMESTAMP types.',
    },
    {
      type: 'single',
      prompt: 'An insert binds the string "18-11-2026" to a DATE column. It works in test and fails in production with ORA-01861. Why?',
      options: [
        'Production runs in another time zone, so the day is out of range',
        'The string is read with the session NLS_DATE_FORMAT, which differs',
        'Production uses a newer driver that rejects strings for DATE binds',
        'The production database character set cannot read the dashes',
      ],
      answer: 1,
      explain: 'The session NLS_DATE_FORMAT differs between the environments. Never rely on the session format. Bind a real date value, or use TO_DATE with an explicit mask.',
    },
    {
      type: 'single',
      prompt: 'Orders from shops in three time zones arrive as 2026-11-18T09:30:00+01:00. Support must later see each order in the shop local time with its offset. Which column type fits?',
      options: ['TIMESTAMP WITH LOCAL TIME ZONE', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP', 'DATE'],
      answer: 1,
      explain: 'TIMESTAMP WITH TIME ZONE stores the offset or region with the value, so +01:00 comes back as written. WITH LOCAL TIME ZONE stores the value in the database time zone and shows it in the session time zone, without the original offset. TIMESTAMP and DATE keep no zone at all, so the offset is lost.',
    },
    {
      type: 'single',
      prompt: 'A Mule app on a UTC worker writes now() to a TIMESTAMP column, and a report in Europe shows times one hour off. What happened?',
      options: [
        'Oracle converted the value to the database time zone on insert',
        'TIMESTAMP has no zone, so it holds UTC time read as local time',
        'The driver applied daylight saving time twice to the value',
        'DataWeave now() returns local time on the worker, not UTC',
      ],
      answer: 1,
      explain: 'The column holds UTC wall time while the report assumes local time. Agree one rule per column: always UTC, or always a named zone. Or use TIMESTAMP WITH TIME ZONE.',
    },
    {
      type: 'multi',
      prompt: 'Which are safe ways to send a business date from DataWeave to an Oracle DATE column?',
      options: [
        'Send a Date value from DataWeave and let the driver bind it',
        'Send "2026-11-18" and write TO_DATE(:bizDate, \'YYYY-MM-DD\') in the SQL',
        'Send "18/11/26", which matches the current session format',
        'Send "2026-11-18" with TO_DATE and no mask',
      ],
      answer: [0, 1],
      explain: 'TO_DATE without a mask falls back to the session format again.',
    },
    {
      type: 'single',
      prompt: 'A query uses WHERE TRUNC(CREATED_AT) = :day and is slow on a large table. What is a better form?',
      options: [
        'WHERE CREATED_AT >= :day AND CREATED_AT < :day + 1',
        'WHERE TO_CHAR(CREATED_AT, \'YYYY-MM-DD\') = :day',
        'WHERE TRUNC(CREATED_AT) = TRUNC(:day)',
        'WHERE CREATED_AT BETWEEN :day AND :day + 1',
      ],
      answer: 0,
      explain: 'A function on the column stops a plain index on CREATED_AT from being used. A range keeps the column bare. BETWEEN includes both ends, so it also picks rows at exactly midnight of the next day.',
    },
  ],
  description: `
Quayle Freight writes shipment events from many countries into Oracle. Some events carry a local time with an offset, some a business date. A new environment rejected business dates with ORA-01861, and a report showed delivery times one hour off after the clocks changed.

**Questions**
1. What do DATE, TIMESTAMP and TIMESTAMP WITH TIME ZONE store?
2. Why did ORA-01861 appear in one environment only?
3. How should Mule send dates and times to Oracle?
4. How do you avoid the one hour error in reports?
`,
  answerTemplate: `## The column types

## The ORA-01861 error

## Sending dates from Mule

## Time zones in reports
`,
  keyPoints: [
    'DATE has a time part to the second and no zone.',
    'TIMESTAMP adds fractions of a second. WITH TIME ZONE keeps the offset.',
    'Strings become dates through NLS_DATE_FORMAT unless you give a mask.',
    'Bind real date values or use TO_DATE with an explicit mask.',
    'Pick one zone rule per column and write it down.',
    'Filter on ranges, not TRUNC on the column.',
  ],
  solution: `
**1. The column types.** DATE holds a date and a time to the second. TIMESTAMP adds fractions of a second. Neither holds a zone. TIMESTAMP WITH TIME ZONE stores the offset or region with the value. TIMESTAMP WITH LOCAL TIME ZONE converts to the database zone on write and to the session zone on read.

**2. The ORA-01861 error.** A string bound to a DATE is converted with the session NLS_DATE_FORMAT. That setting comes from the database, the client locale or a logon trigger, so it can differ by environment. The string matched the format in test and not in the new environment.

**3. Sending dates from Mule.** Send a DataWeave Date or DateTime so the driver binds a real date. If you must send text, write \`TO_DATE(:d, 'YYYY-MM-DD')\` or \`TO_TIMESTAMP_TZ\` with a full mask in the SQL. For events with an offset, keep the offset with TIMESTAMP WITH TIME ZONE, or convert to UTC in DataWeave before writing a plain TIMESTAMP.

**4. Time zones in reports.** Decide one rule per column, such as "UTC always", and name the column so it is clear, like \`EVENT_TS_UTC\`. The report then converts to local time for display. Mixed rules are what create the one hour error around clock changes.
`,
  followUps: [
    {
      q: 'What does SYSDATE return, and what about SYSTIMESTAMP?',
      a: 'Both use the database server clock and zone. SYSTIMESTAMP includes fractions and the offset. Do not assume the server runs in UTC.',
    },
    {
      q: 'How does DataWeave read an Oracle DATE column?',
      a: 'The driver returns a timestamp value, which DataWeave sees as a date time. Format it with an explicit pattern before writing it to a file.',
    },
    {
      q: 'Could you set NLS_DATE_FORMAT from Mule?',
      a: 'You could run ALTER SESSION on each connection, but pooled connections make that fragile. Explicit masks are clearer.',
    },
  ],
}
