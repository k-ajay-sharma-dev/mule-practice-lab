export default {
  id: 'dw-204',
  category: 'dataweave',
  title: 'Work Out the Missing Byte Ranges of a Resumed Download',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'ranges', 'resume', 'http', 'reduce', 'json'],
  estMinutes: 35,
  description: `
Quayle Freight downloads large archive files over HTTP in chunks with \`Range\` requests, several at a time. When a run is cut off, some chunks have arrived and some have not. To resume, the flow needs the byte ranges still missing and the requests to fetch them.

\`payload\` holds \`totalBytes\`, \`chunkBytes\` and \`received\`, a list of ranges with \`start\` and \`end\` (both included, counted from 0). The ranges come in no order. They may overlap, touch each other, or reach past the end of the file.

Build:

- \`merged\`: the received ranges cut to the file (0 to \`totalBytes - 1\`), sorted and joined where they overlap or touch
- \`missing\`: the gaps, from the start to the end of the file
- \`requests\`: one \`bytes=START-END\` text per request. Split each missing range into pieces of at most \`chunkBytes\`.
- \`receivedBytes\`: the bytes covered by \`merged\`
- \`percent\`: received share of the file, rounded to 1 decimal
- \`complete\`: \`true\` when nothing is missing
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "totalBytes": 1000,
  "chunkBytes": 200,
  "received": [
    { "start": 300, "end": 499 },
    { "start": 0, "end": 99 },
    { "start": 450, "end": 599 },
    { "start": 600, "end": 649 },
    { "start": 900, "end": 1200 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "merged": [
    { "start": 0, "end": 99 },
    { "start": 300, "end": 649 },
    { "start": 900, "end": 999 }
  ],
  "missing": [
    { "start": 100, "end": 299 },
    { "start": 650, "end": 899 }
  ],
  "requests": ["bytes=100-299", "bytes=650-849", "bytes=850-899"],
  "receivedBytes": 550,
  "percent": 55,
  "complete": false
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
{
  merged: payload.received orderBy (r) -> r.start
}
`,
  hints: [
    'Put the `map` in parentheses before the `filter`, or the `filter` becomes part of the lambda body. Cut each range with `max([r.start, 0])` and `min([r.end, total - 1])`, then drop ranges where start is after end.',
    'Merge with `reduce` over the ranges sorted by start. If a range starts after `last.end + 1`, append it. Otherwise widen the last one.',
    'Find gaps with a second `reduce` that carries a cursor: the first byte not yet covered.',
    'On an empty list, `reduce` returns the starting value of the accumulator, so a run with nothing received needs no special case.',
    'For each gap, `ceil(length / chunkBytes)` requests, built with `flatMap` over `0 to n - 1`.',
  ],
  solution: `%dw 2.0
output application/json

var total = payload.totalBytes
var chunk = payload.chunkBytes

var clipped = (payload.received
  map (r) -> { start: max([r.start, 0]), end: min([r.end, total - 1]) })
  filter (r) -> r.start <= r.end

var merged = ((clipped orderBy (r) -> r.start) reduce (r, acc = []) ->
  if (isEmpty(acc) or r.start > acc[-1].end + 1) acc ++ [r]
  else (acc filter (x, i) -> i < sizeOf(acc) - 1)
    ++ [{ start: acc[-1].start, end: max([acc[-1].end, r.end]) }])

var walk = (merged reduce (m, acc = { cursor: 0, gaps: [] }) -> {
  cursor: m.end + 1,
  gaps: if (m.start > acc.cursor) acc.gaps ++ [{ start: acc.cursor, end: m.start - 1 }] else acc.gaps
})

var missing = if (walk.cursor <= total - 1) walk.gaps ++ [{ start: walk.cursor, end: total - 1 }] else walk.gaps

var requests = missing flatMap (g) -> do {
  var n = ceil((g.end - g.start + 1) / chunk)
  ---
  (0 to n - 1) map (k) -> do {
    var s = g.start + k * chunk
    ---
    "bytes=$(s)-$(min([s + chunk - 1, g.end]))"
  }
}

var receivedBytes = sum(merged map (m) -> m.end - m.start + 1)
---
{
  merged: merged,
  missing: missing,
  requests: requests,
  receivedBytes: receivedBytes,
  percent: round(receivedBytes * 1000 / total) / 10,
  complete: isEmpty(missing)
}`,
  explanation: `
**Inclusive ends.** HTTP ranges include both ends, so \`bytes=0-99\` is 100 bytes. Every length is \`end - start + 1\`, and ranges touch when one starts at the other's end plus one.

**Merge before you look for gaps.** Parallel chunks and retries overlap. Sorting by start and joining in one pass gives clean ranges, and the gaps fall out of a second pass with a cursor.

**Cut to the file.** A last chunk request may say it ended past the file size. Cutting keeps the counts right and stops a request for bytes that do not exist.

**Chunk the gaps.** One request for 250 MB would bring back the problem that chunking solved. Each missing range is split into requests no bigger than the chunk size.
`,
  tests: [
    {
      name: 'Nothing received yet',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "totalBytes": 450, "chunkBytes": 200, "received": [] }' }],
      expected:
        '{ "merged": [], "missing": [{ "start": 0, "end": 449 }], "requests": ["bytes=0-199", "bytes=200-399", "bytes=400-449"], "receivedBytes": 0, "percent": 0, "complete": false }',
    },
    {
      name: 'Complete with overlaps',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "totalBytes": 300, "chunkBytes": 100, "received": [{ "start": 100, "end": 199 }, { "start": 150, "end": 299 }, { "start": 0, "end": 120 }] }',
        },
      ],
      expected:
        '{ "merged": [{ "start": 0, "end": 299 }], "missing": [], "requests": [], "receivedBytes": 300, "percent": 100, "complete": true }',
    },
  ],
  followUps: [
    {
      q: 'How do you know the server file did not change between the first run and the resume?',
      a: 'Send the ETag from the first response in an If-Range header. If the file changed, the server returns the whole new file instead of a range.',
    },
    {
      q: 'Where do you keep the received ranges between runs?',
      a: 'In an object store or a table keyed by the file and its ETag, updated after each chunk is safely on disk.',
    },
    {
      q: 'How do you check the assembled file at the end?',
      a: 'Compare its size to the total and its checksum to the one the sender published.',
    },
  ],
}
