import { outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-101',
  category: 'dataweave',
  title: 'Read the Output: Dates, Periods and Time Zones',
  level: 'INTERMEDIATE',
  tags: ['dates', 'periods', 'time-zones', 'read-the-output'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
Date handling causes real production incidents, particularly around month ends and time zones. These questions use fixed dates, so each one has one exact answer.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: '|2024-01-31| + |P1M|',
      right: '"2024-02-29"',
      wrong: ['"2024-03-02"', '"2024-02-31"', '"2024-03-01"'],
      explain: 'Adding a month keeps the day where it can and otherwise uses the last day of the month. February 2024 has 29 days.',
    }),
    out({
      body: '|2024-03-15| as String {format: "dd/MM/yyyy"}',
      right: '"15/03/2024"',
      wrong: ['"03/15/2024"', '"2024-03-15"', '"15/3/2024"'],
      explain: 'The format is a pattern, and `MM` always gives two digits. Lowercase `mm` means minutes, so the case matters.',
    }),
    out({
      body: '"03/15/2024" as Date {format: "MM/dd/yyyy"}',
      right: '"03/15/2024"',
      wrong: ['"2024-03-15"', '"2024-15-03"', 'null'],
      explain: 'The result is a real Date, but it keeps the format it was read with, and the writer uses that format. To change the layout, add `as String {format: "yyyy-MM-dd"}`.',
    }),
    out({
      body: '|2024-03-15T10:00:00Z| >> "+05:30"',
      right: '"2024-03-15T15:30:00+05:30"',
      wrong: ['"2024-03-15T10:00:00+05:30"', '"2024-03-15T04:30:00+05:30"', '"2024-03-15T15:30:00Z"'],
      explain: '`>>` shifts to another time zone and keeps the same moment, so the clock time changes. Writing the new offset by hand would change the moment.',
    }),
    out({
      body: 'daysBetween(|2024-02-01|, |2024-03-01|)',
      right: '29',
      wrong: ['28', '30', '1'],
      explain: '2024 is a leap year, so February has 29 days. `daysBetween` counts the days from the first date to the second, so the same date twice gives 0.',
    }),
  ],
  answerTemplate: `## How month arithmetic behaves

## The difference between reading and writing a format

## How to change a time zone safely
`,
  keyPoints: [
    'Adding a month falls back to the last valid day.',
    'Format patterns are case sensitive: MM is month and mm is minutes.',
    'A format on `as Date` reads text, and the Date keeps that format when written out.',
    'Use `as String {format: ...}` to choose the layout you write.',
    '>> keeps the same moment and changes the offset.',
  ],
  solution: `
Periods follow the calendar. \`|2024-01-31| + |P1M|\` gives the last day of February, not an overflow into March.

\`as Date {format: ...}\` reads a date, and the value keeps that format when it is written out, so a US date stays in US order. \`as String {format: ...}\` sets the layout you want. Patterns are case sensitive, and \`mm\` for \`MM\` is a classic bug.

\`>>\` converts a DateTime to another zone and keeps the same moment. Use a named zone such as \`"Asia/Kolkata"\` rather than a fixed offset for zones with daylight saving.
`,
  followUps: [
    { q: 'Why prefer a named zone to a fixed offset?', a: 'A named zone follows daylight saving changes, and a fixed offset is wrong for part of the year.' },
    { q: 'What happens if you add a month to January 31 and then subtract a month?', a: 'You get January 29 in 2024, not January 31, so month arithmetic does not always reverse.' },
  ],
}
