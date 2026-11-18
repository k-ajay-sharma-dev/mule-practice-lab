export default {
  id: 'dw-168',
  category: 'dataweave',
  title: 'Plan the Put Range Calls That Upload a Large File to Azure File Share',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-file-share', 'put-range', 'large-files', 'ranges', 'do-block', 'json'],
  estMinutes: 25,
  description: `
Marrow & Pine Home uploads large catalog exports to an Azure file share over the REST API. After Create File reserves the full size, the content goes up in Put Range calls. One call may write at most 4 MiB, which is 4,194,304 bytes.

The input has \`fileName\`, \`sizeBytes\` and the \`chunkBytes\` the team asked for. Build the plan:

- \`fileName\`: copied
- \`createLength\`: the size, for the Create File call
- \`chunkBytes\`: the chunk size used, which is the requested size but never more than 4,194,304
- \`callCount\`: how many Put Range calls are needed. An empty file needs none.
- \`calls\`: one entry per call, in order, with:
  - \`seq\`: 1, 2, 3 and so on
  - \`length\`: the bytes in this call. The last call may be shorter.
  - \`headers\`: \`x-ms-range\` as \`bytes=FIRST-LAST\`, where both ends are included and counted from 0, and \`x-ms-write\` set to \`update\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: '{ "fileName": "CATALOG_20261118.csv", "sizeBytes": 10000000, "chunkBytes": 4194304 }',
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "fileName": "CATALOG_20261118.csv",
  "createLength": 10000000,
  "chunkBytes": 4194304,
  "callCount": 3,
  "calls": [
    { "seq": 1, "length": 4194304, "headers": { "x-ms-range": "bytes=0-4194303", "x-ms-write": "update" } },
    { "seq": 2, "length": 4194304, "headers": { "x-ms-range": "bytes=4194304-8388607", "x-ms-write": "update" } },
    { "seq": 3, "length": 1611392, "headers": { "x-ms-range": "bytes=8388608-9999999", "x-ms-write": "update" } }
  ]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var size = payload.sizeBytes
var chunk = payload.chunkBytes
---
{
  fileName: payload.fileName,
  callCount: size / chunk
}
`,
  hints: [
    'Cap the chunk with `min([payload.chunkBytes, 4194304])`.',
    'The number of calls is `ceil(size / chunk)`, and 0 for an empty file.',
    'Loop over the call numbers with `(0 to (count - 1)) map (i) -> ...`. Guard the empty case first, since `0 to -1` counts down and is not empty.',
    'In a `do` block, work out `first = i * chunk` and `lastByte = min([first + chunk, size]) - 1`. The length is `lastByte - first + 1`.',
  ],
  solution: `%dw 2.0
output application/json
var maxRange = 4194304
var size = payload.sizeBytes
var chunk = min([payload.chunkBytes, maxRange])
var count = if (size == 0) 0 else ceil(size / chunk)
---
{
  fileName: payload.fileName,
  createLength: size,
  chunkBytes: chunk,
  callCount: count,
  calls: if (count == 0) [] else ((0 to (count - 1)) map (i) -> do {
    var first = i * chunk
    var lastByte = min([first + chunk, size]) - 1
    ---
    {
      seq: i + 1,
      length: lastByte - first + 1,
      headers: {
        "x-ms-range": "bytes=$(first)-$(lastByte)",
        "x-ms-write": "update"
      }
    }
  })
}`,
  explanation: `
**Inclusive ranges.** \`bytes=0-4194303\` covers 4,194,304 bytes, because both ends count. An off by one here writes a byte twice or leaves a zero byte gap, and the service may reject a range larger than the limit.

**The last call.** Each call starts at \`i * chunk\`. The end is the smaller of the next boundary and the file size, minus one. Only the last call is shorter.

**The cap.** A team may ask for 8 MiB chunks to save calls. The service accepts at most 4 MiB in one Put Range, so the plan caps the size instead of failing later.

**The empty file.** \`0 to -1\` in DataWeave counts down and gives two numbers, not an empty list. The \`if\` keeps an empty file at zero calls. Create File alone makes a valid empty file.

**Why plan first.** A plan with numbered calls makes retries simple. If call 2 fails, the flow repeats call 2 with the same headers. A checkpoint of the last finished \`seq\` lets a restarted flow continue.
`,
  tests: [
    {
      name: 'An empty file',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "fileName": "EMPTY.csv", "sizeBytes": 0, "chunkBytes": 1048576 }' }],
      expected: '{ "fileName": "EMPTY.csv", "createLength": 0, "chunkBytes": 1048576, "callCount": 0, "calls": [] }',
    },
    {
      name: 'Requested chunk too large',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "fileName": "BIG.csv", "sizeBytes": 5000000, "chunkBytes": 8388608 }' }],
      expected:
        '{ "fileName": "BIG.csv", "createLength": 5000000, "chunkBytes": 4194304, "callCount": 2, "calls": [{ "seq": 1, "length": 4194304, "headers": { "x-ms-range": "bytes=0-4194303", "x-ms-write": "update" } }, { "seq": 2, "length": 805696, "headers": { "x-ms-range": "bytes=4194304-4999999", "x-ms-write": "update" } }] }',
    },
    {
      name: 'Size is an exact multiple of the chunk',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "fileName": "EVEN.csv", "sizeBytes": 2097152, "chunkBytes": 1048576 }' }],
      expected:
        '{ "fileName": "EVEN.csv", "createLength": 2097152, "chunkBytes": 1048576, "callCount": 2, "calls": [{ "seq": 1, "length": 1048576, "headers": { "x-ms-range": "bytes=0-1048575", "x-ms-write": "update" } }, { "seq": 2, "length": 1048576, "headers": { "x-ms-range": "bytes=1048576-2097151", "x-ms-write": "update" } }] }',
    },
  ],
  followUps: [
    {
      q: 'How does the flow send only the bytes of one call?',
      a: 'Read the source as a stream and take each slice in turn, or read a byte range from the source if it supports it. Holding the whole file to slice it would defeat the purpose.',
    },
    {
      q: 'Could the calls run in parallel?',
      a: 'Yes, the ranges do not overlap. Use a parallel for each with a small limit to avoid throttling, and retry failed calls by seq.',
    },
    {
      q: 'Why not use a smaller chunk such as 64 KB?',
      a: 'More calls mean more requests, more latency and more transaction cost. Larger chunks up to the limit are usually faster, at the cost of more memory per call.',
    },
  ],
}
