export default {
  id: 'dw-139',
  category: 'dataweave',
  title: 'Find Double-Booked Meeting Rooms',
  level: 'ADVANCED',
  tags: ['intervals', 'overlap', 'flatMap', 'filter', 'dates', 'min', 'max', 'json'],
  estMinutes: 30,
  description: `
Larchfield Coworking lets members book meeting rooms from two apps. The apps did not lock the rooms against each other, so some rooms are now booked twice. The front desk wants a list of every clash.

Two bookings **clash** when they are for the same room and their times overlap. A booking that ends at 10:00 and one that starts at 10:00 do not clash.

Output one object per clashing pair, with:

- \`room\`
- \`first\` and \`second\`: the ids of the two bookings, the one that starts earlier first
- \`overlapMinutes\`: how many minutes the two share

Sort by \`room\` as text, then by the start of \`first\`, then by the start of \`second\`. List each pair once. Times are always on the whole minute, and no two bookings in one room start at the same time.

Two time ranges overlap when each one starts before the other ends. The shared part runs from the later start to the earlier end.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "BK-103", "room": "Oak", "start": "2026-11-17T10:00:00Z", "end": "2026-11-17T11:00:00Z" },
  { "id": "BK-104", "room": "Elm", "start": "2026-11-17T09:00:00Z", "end": "2026-11-17T12:00:00Z" },
  { "id": "BK-101", "room": "Oak", "start": "2026-11-17T09:00:00Z", "end": "2026-11-17T10:00:00Z" },
  { "id": "BK-107", "room": "Ash", "start": "2026-11-17T09:00:00Z", "end": "2026-11-17T09:30:00Z" },
  { "id": "BK-105", "room": "Elm", "start": "2026-11-17T11:15:00Z", "end": "2026-11-17T12:30:00Z" },
  { "id": "BK-102", "room": "Oak", "start": "2026-11-17T09:40:00Z", "end": "2026-11-17T10:30:00Z" },
  { "id": "BK-106", "room": "Elm", "start": "2026-11-17T12:00:00Z", "end": "2026-11-17T13:00:00Z" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "room": "Elm", "first": "BK-104", "second": "BK-105", "overlapMinutes": 45 },
  { "room": "Elm", "first": "BK-105", "second": "BK-106", "overlapMinutes": 30 },
  { "room": "Oak", "first": "BK-101", "second": "BK-102", "overlapMinutes": 20 },
  { "room": "Oak", "first": "BK-102", "second": "BK-103", "overlapMinutes": 30 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var rooms = (payload map $.room) distinctBy $ orderBy $
---
rooms map (room) -> {
  room: room,
  clashes: payload filter ($.room == room)
}
`,
  hints: [
    'Give each booking its times in seconds: `b ++ { s: b.start as DateTime as Number, e: b.end as DateTime as Number }`. Numbers compare and subtract directly.',
    'For one room, sort its bookings by `s`. Then each booking only needs to be compared with the bookings after it in that list, which lists every pair once with the earlier one first.',
    '`filter` gives the index as a second argument: `list filter ((b, j) -> j > i and ...)`.',
    'The pair overlaps when `b.s < a.e and a.s < b.e`. The shared seconds are `min([a.e, b.e]) - max([a.s, b.s])`.',
  ],
  solution: `%dw 2.0
output application/json
var timed = payload map (b) -> b ++ { s: b.start as DateTime as Number, e: b.end as DateTime as Number }
var rooms = (timed map $.room) distinctBy $ orderBy $

fun clashesIn(room) = do {
  var list = (timed filter ($.room == room)) orderBy $.s
  ---
  list flatMap (a, i) ->
    (list filter ((b, j) -> j > i and b.s < a.e and a.s < b.e)) map (b) -> {
      room: room,
      first: a.id,
      second: b.id,
      overlapMinutes: (min([a.e, b.e]) - max([a.s, b.s])) / 60
    }
}
---
rooms flatMap (room) -> clashesIn(room)`,
  explanation: `
**Seconds, not text.** \`as DateTime as Number\` gives seconds since 1970. Comparing and subtracting numbers is clearer than working with dates, and it handles any time zone offset.

**One room at a time.** Bookings in different rooms can never clash, so the script splits by room first. Taking the rooms from a sorted, distinct list also gives the output its room order.

**Each pair once.** Inside a room, the bookings are sorted by start. Booking \`i\` is compared only with bookings after it (\`j > i\`). So BK-101 meets BK-102, but BK-102 never meets BK-101 again, and \`first\` always starts earlier.

**The overlap rule.** \`b.s < a.e and a.s < b.e\` uses strict less-than, so a booking that ends at 10:00 does not clash with one that starts at 10:00. The shared part runs from the later start to the earlier end, which \`max\` and \`min\` pick out.

**Not only neighbours.** A long booking such as BK-104 can clash with several later ones. Comparing with every later booking, not only the next one, catches all of them.
`,
  tests: [
    {
      name: 'One booking inside another',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "id": "A", "room": "Yew", "start": "2026-11-18T08:00:00Z", "end": "2026-11-18T12:00:00Z" }, { "id": "B", "room": "Yew", "start": "2026-11-18T09:00:00Z", "end": "2026-11-18T09:15:00Z" }, { "id": "C", "room": "Yew", "start": "2026-11-18T10:00:00Z", "end": "2026-11-18T11:00:00Z" }]',
        },
      ],
      expected:
        '[{ "room": "Yew", "first": "A", "second": "B", "overlapMinutes": 15 }, { "room": "Yew", "first": "A", "second": "C", "overlapMinutes": 60 }]',
    },
    {
      name: 'Same times in different rooms',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "id": "A", "room": "Yew", "start": "2026-11-18T08:00:00Z", "end": "2026-11-18T09:00:00Z" }, { "id": "B", "room": "Fir", "start": "2026-11-18T08:00:00Z", "end": "2026-11-18T09:00:00Z" }]',
        },
      ],
      expected: '[]',
    },
    {
      name: 'No bookings',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Two bookings start at the same minute. Which one is first?',
      a: 'The script does not say, because both have the same sort key. If the desk needs a fixed order, sort by start and then by id, for example by taking each distinct start in order and sorting the bookings on it by id.',
    },
    {
      q: 'A room has 5,000 bookings a month. Is comparing every pair a problem?',
      a: 'It can be, since the work grows with the square of the list. After sorting by start, you can stop looking once a later booking starts after the current one ends, because every booking after it starts later still.',
    },
    {
      q: 'How would you stop new clashes instead of finding old ones?',
      a: 'Check for an overlapping booking in the same room before saving a new one, and do the check and the save in one database transaction or with a unique slot table. A report like this one then becomes a safety net.',
    },
  ],
}
