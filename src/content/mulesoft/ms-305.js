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
      prompt: 'What does an Oracle DATE column hold?',
      options: [
        'Only the day',
        'The day and a time down to the second, with no time zone',
        'The day, time and time zone',
        'A number of days since 1970',
      ],
      answer: 1,
      explain: 'A DATE always has a time part. A filter on DATE = a day misses rows with a time unless you use TRUNC or a range.',
    },
    {
      type: 'single',
      prompt: 'An insert binds the string "18-11-2026" to a DATE column. It works in test and fails in production with ORA-01861. Why?',
      options: [
        'Production has no DATE type',
        'The string is turned into a date with the session NLS_DATE_FORMAT, which differs between the environments',
        'The column is too small',
        'The driver is different',
      ],
      answer: 1,
      explain: 'Never rely on the session format. Bind a real date value, or use TO_DATE with an explicit mask.',
    },
    {
      type: 'single',
      prompt: 'Which column type keeps the offset the value was written with?',
      options: ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE', 'TIMESTAMP WITH LOCAL TIME ZONE'],
      answer: 2,
      explain: 'WITH LOCAL TIME ZONE stores the value in the database time zone and shows it in the session time zone, without the original offset.',
    },
    {
      type: 'single',
      prompt: 'A Mule app on a UTC worker writes now() to a TIMESTAMP column, and a report in Europe shows times one hour off. What happened?',
      options: [
        'Oracle is wrong',
        'TIMESTAMP has no zone, so the column holds UTC wall time while the report assumes local time',
        'The network added an hour',
        'DataWeave rounds times',
      ],
      answer: 1,
      explain: 'Agree one rule per column: always UTC, or always a named zone. Or use TIMESTAMP WITH TIME ZONE.',
    },
    {
      type: 'multi',
      prompt: 'Which are safe ways to send a business date from DataWeave to an Oracle DATE column?',
      options: [
        'Send a Date value from DataWeave and let the driver bind it',
        'Send "2026-11-18" and write TO_DATE(:bizDate, \'YYYY-MM-DD\') in the SQL',
        'Send "18/11/26" and hope the session format matches',
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
        'WHERE TO_CHAR(CREATED_AT) = :day',
        'Add ORDER BY',
        'Use LIKE',
      ],
      answer: 0,
      explain: 'A function on the column stops a plain index on CREATED_AT from being used. A range keeps the column bare.',
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
