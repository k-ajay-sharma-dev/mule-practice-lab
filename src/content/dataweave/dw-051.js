export default {
  id: 'dw-051',
  category: 'dataweave',
  title: 'Stitch Cursor-Paginated API Pages into One Result',
  level: 'EXPERT',
  tags: ['pagination', 'recursion', 'lookup', 'distinctBy', 'resilience'],
  estMinutes: 35,
  description: `
A CRM API returns customers in **cursor-paginated** pages. To speed things up, your Mule flow prefetched pages in parallel and collected every response into one array. This has two effects:
- The pages arrive in **random order**.
- A stale page left over from an earlier run can be mixed in.

Each page looks like this:

\`\`\`json
{ "self": "/v1/customers?cursor=c1", "prev": "/v1/customers?cursor=c0", "next": "/v1/customers?cursor=c2", "data": [ ... ] }
\`\`\`

Reassemble the result by **following the links**:

1. The **start page** is the page whose \`prev\` is \`null\` (there is exactly one).
2. From the current page, the next page is the page whose \`self\` equals the current page's \`next\`.
3. Stop when
   - \`next\` is \`null\` → \`stopReason\` \`"END"\`;
   - \`next\` points to a page that was **already followed** → \`"LOOP"\`;
   - no page in the input has that \`self\` → \`"MISSING_PAGE"\`.

**Output**

| Field | Value |
|---|---|
| \`pagesFollowed\` | number of pages in the chain (start page included) |
| \`stopReason\` | \`END\`, \`LOOP\` or \`MISSING_PAGE\` |
| \`brokenLink\` | the \`next\` URL that could not be followed (\`null\` when \`END\`) |
| \`records\` | the \`data\` items of the followed pages, in chain order, **deduplicated by \`id\` keeping the first occurrence** (records can shift between pages while you page) |
| \`unvisitedPages\` | the \`self\` of every input page that was not followed, in input order |
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  {
    "self": "/v1/customers?cursor=c2", "prev": "/v1/customers?cursor=c1", "next": null,
    "data": [ { "id": 5, "name": "Eva" } ]
  },
  {
    "self": "/v1/customers?cursor=x9", "prev": "/v1/customers?cursor=x8", "next": null,
    "data": [ { "id": 99, "name": "Stale" } ]
  },
  {
    "self": "/v1/customers?cursor=c0", "prev": null, "next": "/v1/customers?cursor=c1",
    "data": [ { "id": 1, "name": "Ann" }, { "id": 2, "name": "Bob" }, { "id": 3, "name": "Cem" } ]
  },
  {
    "self": "/v1/customers?cursor=c1", "prev": "/v1/customers?cursor=c0", "next": "/v1/customers?cursor=c2",
    "data": [ { "id": 3, "name": "Cem (moved)" }, { "id": 4, "name": "Dia" } ]
  }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "pagesFollowed": 3,
  "stopReason": "END",
  "brokenLink": null,
  "records": [
    { "id": 1, "name": "Ann" },
    { "id": 2, "name": "Bob" },
    { "id": 3, "name": "Cem" },
    { "id": 4, "name": "Dia" },
    { "id": 5, "name": "Eva" }
  ],
  "unvisitedPages": ["/v1/customers?cursor=x9"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Build a lookup object once: `var bySelf = { (payload map (p) -> { (p.self): p }) }`. Then `bySelf[url]` finds a page in constant time (and is `null` when absent).',
    'Write a recursive function `walk(page, visited)` that appends `page.self` to `visited` and either returns `{ path, reason, link }` or calls itself with the next page. Check the three stop conditions in the order END, LOOP, MISSING_PAGE.',
    'After the walk: `path flatMap (url) -> bySelf[url].data` gives the records in chain order, and `distinctBy $.id` keeps the first occurrence. `unvisitedPages` is a `filter` with `not (path contains p.self)`.',
  ],
  solution: `%dw 2.0
output application/json

var bySelf = { (payload map (p) -> { (p.self): p }) }

fun walk(page, visited: Array<String>) = do {
  var path = visited << page.self
  ---
  if (page.next == null)
    { path: path, reason: "END", link: null }
  else if (path contains page.next)
    { path: path, reason: "LOOP", link: page.next }
  else if (bySelf[page.next] == null)
    { path: path, reason: "MISSING_PAGE", link: page.next }
  else
    walk(bySelf[page.next], path)
}

var start = (payload filter ($.prev == null))[0]
var chain = walk(start, [])
---
{
  pagesFollowed: sizeOf(chain.path),
  stopReason: chain.reason,
  brokenLink: chain.link,
  records: (chain.path flatMap (url) -> bySelf[url].data) distinctBy $.id,
  unvisitedPages: (payload filter (p) -> not (chain.path contains p.self)) map $.self
}`,
  explanation: `
Two ideas make this clean:

1. **Index, then walk.** \`{ (payload map (p) -> { (p.self): p }) }\` turns the array into an object keyed by URL (DataWeave 2.12 has no \`indexBy\`, and this spread-of-objects idiom is the standard replacement). Each hop is then a key lookup instead of a \`filter\` over all pages.
2. **Recursion with an accumulator.** \`walk\` carries the list of URLs visited so far. That list is the result (\`path\`) *and* the loop detector: if \`next\` is already in it, following it would never end.

The loop check must happen **before** the recursive call: the target of a loop is a page that exists in \`bySelf\`, so the lookup alone would happily follow it again and again.

\`distinctBy\` keeps the **first** element for each id, so concatenating pages in chain order before deduplicating gives exactly "first occurrence wins". Deduplicating per page, or before ordering the pages, gives the wrong version of a moved record.

Common traps:
- Concatenating \`payload.data\` in input order: the parallel prefetch scrambled it, and the stale page leaks in.
- No loop detection: a buggy API that links back to an earlier cursor makes the recursion run until a stack overflow.
- \`payload filter (p) -> not ... map $.self\` without parentheses: the lambda body swallows the \`map\`, so you get an array of booleans or an error. Wrap the \`filter\` in parentheses before mapping.
`,
  tests: [
    {
      name: 'Loop back to an earlier cursor',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "self": "/c?cursor=b", "prev": "/c?cursor=a", "next": "/c?cursor=c", "data": [ { "id": 2 } ] }, { "self": "/c?cursor=c", "prev": "/c?cursor=b", "next": "/c?cursor=b", "data": [ { "id": 3 }, { "id": 2 } ] }, { "self": "/c?cursor=a", "prev": null, "next": "/c?cursor=b", "data": [ { "id": 1 } ] } ]',
        },
      ],
      expected:
        '{ "pagesFollowed": 3, "stopReason": "LOOP", "brokenLink": "/c?cursor=b", "records": [ { "id": 1 }, { "id": 2 }, { "id": 3 } ], "unvisitedPages": [] }',
    },
    {
      name: 'Missing page and two leftovers',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "self": "/c?cursor=z", "prev": "/c?cursor=y", "next": null, "data": [ { "id": 26 } ] }, { "self": "/c?cursor=a", "prev": null, "next": "/c?cursor=b", "data": [ { "id": 1 }, { "id": 1 } ] }, { "self": "/c?cursor=c", "prev": "/c?cursor=b", "next": null, "data": [ { "id": 3 } ] } ]',
        },
      ],
      expected:
        '{ "pagesFollowed": 1, "stopReason": "MISSING_PAGE", "brokenLink": "/c?cursor=b", "records": [ { "id": 1 } ], "unvisitedPages": ["/c?cursor=z", "/c?cursor=c"] }',
    },
  ],
  followUps: [
    {
      q: 'How would you fetch the pages in Mule in the first place?',
      a: 'For cursor pagination the next URL is only known after the previous call, so the fetch is sequential: a flow that calls the API and recurses via Flow Reference (or a loop with a variable holding `next`) until `next` is null. Only offset/page-number APIs can be fetched in parallel, e.g. with Parallel For Each over computed page numbers.',
    },
    {
      q: 'What is the risk of collecting all pages before transforming?',
      a: 'Memory: all pages are held at once. For large exports, process and write each page as it arrives (append to a file, publish to a queue, or use Batch). Keep only the dedup keys or a watermark between pages.',
    },
    {
      q: 'Does DataWeave optimize this recursion?',
      a: 'DataWeave can optimize tail calls: when the recursive call is the last thing the function does (as in `walk`), long chains do not grow the stack. Non-tail recursion (e.g. `1 + walk(...)`) is limited by the stack depth, so keep accumulators in parameters.',
    },
  ],
}
