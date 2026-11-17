export default {
  id: 'dw-134',
  category: 'dataweave',
  title: 'Split a Clickstream into Visitor Sessions with a 30-Minute Gap',
  level: 'ADVANCED',
  tags: ['reduce', 'accumulator', 'dates', 'groupBy', 'sessions', 'retail', 'json'],
  estMinutes: 30,
  description: `
Moorgate Books runs an online shop. Its analytics feed sends page views from many visitors, mixed together and not in time order. The marketing team wants the views split into **sessions**.

A session is a run of one visitor's page views where each view comes no more than 30 minutes after the one before. A gap of more than 30 minutes starts a new session. A gap of exactly 30 minutes stays in the same session.

Output one object per visitor, sorted by \`visitor\`, with a \`sessions\` list in time order. Each session has:

- \`start\` and \`end\`: the \`at\` values of its first and last view, as they arrived
- \`pages\`: how many views it holds
- \`minutes\`: whole minutes from \`start\` to \`end\`

A DateTime turns into epoch seconds with \`as Number\`, which makes gaps a matter of subtraction.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "visitor": "v-ben", "at": "2026-11-17T14:30:00Z", "page": "/search" },
  { "visitor": "v-ana", "at": "2026-11-17T09:10:00Z", "page": "/book/1187" },
  { "visitor": "v-ana", "at": "2026-11-17T10:20:00Z", "page": "/home" },
  { "visitor": "v-ben", "at": "2026-11-17T14:00:00Z", "page": "/home" },
  { "visitor": "v-ana", "at": "2026-11-17T09:00:00Z", "page": "/home" },
  { "visitor": "v-ana", "at": "2026-11-17T09:35:00Z", "page": "/basket" },
  { "visitor": "v-ben", "at": "2026-11-17T15:01:00Z", "page": "/home" },
  { "visitor": "v-ana", "at": "2026-11-17T10:22:00Z", "page": "/checkout" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "visitor": "v-ana",
    "sessions": [
      { "start": "2026-11-17T09:00:00Z", "end": "2026-11-17T09:35:00Z", "pages": 3, "minutes": 35 },
      { "start": "2026-11-17T10:20:00Z", "end": "2026-11-17T10:22:00Z", "pages": 2, "minutes": 2 }
    ]
  },
  {
    "visitor": "v-ben",
    "sessions": [
      { "start": "2026-11-17T14:00:00Z", "end": "2026-11-17T14:30:00Z", "pages": 2, "minutes": 30 },
      { "start": "2026-11-17T15:01:00Z", "end": "2026-11-17T15:01:00Z", "pages": 1, "minutes": 0 }
    ]
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var byVisitor = payload groupBy $.visitor
---
(namesOf(byVisitor) orderBy $) map (visitor) -> {
  visitor: visitor,
  sessions: []
}
`,
  hints: [
    'Give each view its time in seconds first: `views map (v) -> v ++ { secs: v.at as DateTime as Number }`, then sort with `orderBy $.secs`.',
    'Use an accumulator with two parts: `{ done: [], current: null }`. `current` is the session being built, and `done` holds the finished ones.',
    'For each view: if there is no `current`, start one. If the gap from `current.lastSecs` is more than 1800 seconds, move `current` into `done` and start a new one. Otherwise, extend `current`.',
    'After the reduce, the last session is still in `current`. Add it to `done`, then shape each session for the output.',
  ],
  solution: `%dw 2.0
output application/json
var gapSeconds = 30 * 60
var byVisitor = payload groupBy $.visitor

fun begin(view) = { start: view.at, end: view.at, firstSecs: view.secs, lastSecs: view.secs, pages: 1 }

fun sessionsOf(views) = do {
  var timed = (views map (v) -> v ++ { secs: v.at as DateTime as Number }) orderBy $.secs
  var built = timed reduce ((view, acc = { done: [], current: null }) ->
    if (acc.current == null) { done: acc.done, current: begin(view) }
    else if ((view.secs - acc.current.lastSecs) > gapSeconds) { done: acc.done ++ [acc.current], current: begin(view) }
    else {
      done: acc.done,
      current: {
        start: acc.current.start,
        end: view.at,
        firstSecs: acc.current.firstSecs,
        lastSecs: view.secs,
        pages: acc.current.pages + 1
      }
    }
  )
  ---
  (built.done ++ [built.current]) map (s) -> {
    start: s.start,
    end: s.end,
    pages: s.pages,
    minutes: (s.lastSecs - s.firstSecs) / 60
  }
}
---
(namesOf(byVisitor) orderBy $) map (visitor) -> {
  visitor: visitor,
  sessions: sessionsOf(byVisitor[visitor])
}`,
  explanation: `
**Group, then sort.** Sessions belong to one visitor, so \`groupBy $.visitor\` comes first. Inside each group, the views are sorted by their time in seconds, because the feed mixes them up.

**Why reduce.** Whether a view starts a new session depends on the view before it. \`reduce\` carries that state from one view to the next. The accumulator keeps the finished sessions in \`done\` and the open one in \`current\`.

**The gap rule.** \`view.secs - acc.current.lastSecs\` is the gap in seconds. Only a gap of **more than** 1800 seconds starts a new session, so v-ben's views at 14:00 and 14:30 stay together, while 14:30 to 15:01 is 31 minutes and splits.

**Closing the last session.** \`reduce\` ends with a session still open in \`current\`. Adding it to \`done\` after the reduce is the step people often forget, and the last visit of every visitor would be lost without it.

**Shaping.** The working fields \`firstSecs\` and \`lastSecs\` help with the maths. The output keeps only what the brief asks for.
`,
  tests: [
    {
      name: 'One visitor, one view',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "visitor": "v-cy", "at": "2026-11-17T08:00:00Z", "page": "/home" }]' }],
      expected: '[{ "visitor": "v-cy", "sessions": [{ "start": "2026-11-17T08:00:00Z", "end": "2026-11-17T08:00:00Z", "pages": 1, "minutes": 0 }] }]',
    },
    {
      name: 'Views across midnight stay in one session',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[{ "visitor": "v-di", "at": "2026-11-18T00:10:00Z", "page": "/basket" }, { "visitor": "v-di", "at": "2026-11-17T23:50:00Z", "page": "/home" }, { "visitor": "v-di", "at": "2026-11-18T00:30:00Z", "page": "/checkout" }]',
        },
      ],
      expected: '[{ "visitor": "v-di", "sessions": [{ "start": "2026-11-17T23:50:00Z", "end": "2026-11-18T00:30:00Z", "pages": 3, "minutes": 40 }] }]',
    },
    {
      name: 'No views',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[]' }],
      expected: '[]',
    },
  ],
  followUps: [
    {
      q: 'Why sort by seconds and not by the `at` text?',
      a: 'Text sorts correctly only when every time has the same format and offset. A view sent as `10:20:00+01:00` would sort after `09:30:00Z` although it is earlier. Seconds since the epoch compare moments, whatever the offset.',
    },
    {
      q: 'The feed arrives every hour. A session can start in one file and go on in the next. How would you handle that?',
      a: 'Keep the open session of each visitor between runs, for example in an Object Store with a time to live a little over 30 minutes. Start the next run with that session as `current` instead of `null`.',
    },
    {
      q: 'How would you also list the pages of each session?',
      a: 'Add a `pages` list to the accumulator session and append `view.page` with `++ [view.page]` when the session grows. The count is then `sizeOf` of that list.',
    },
  ],
}
