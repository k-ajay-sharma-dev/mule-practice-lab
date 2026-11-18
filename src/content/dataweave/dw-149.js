export default {
  id: 'dw-149',
  category: 'dataweave',
  title: 'Parse key=value Log Lines into JSON Records',
  level: 'INTERMEDIATE',
  tags: ['text/plain', 'regex', 'scan', 'dynamic-keys', 'logs', 'coercion', 'json'],
  estMinutes: 20,
  description: `
Fairmont Rail Freight runs an older tracking service that writes its logs as \`key=value\` pairs, one event per line. The operations team wants these events in its log search tool, which only takes JSON.

A line looks like this:

\`ts=2026-11-20T09:15:02Z level=INFO flow=orders-api msg="order saved" orderId=SO-88120 durationMs=142\`

Rules:

- A key is letters, digits or underscores. It is followed by \`=\` and a value.
- A value in double quotes may hold spaces and commas. Drop the quotes in the output.
- A value without quotes runs to the next space. If it is made only of digits, output it as a number. Otherwise keep it as text.
- Skip blank lines.

Output one object per line, with the keys in the order they appear.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'text/plain',
      content: `ts=2026-11-20T09:15:02Z level=INFO flow=orders-api msg="order saved" orderId=SO-88120 durationMs=142
ts=2026-11-20T09:15:04Z level=WARN flow=orders-api msg="stock low" sku=TB-200 qty=3

ts=2026-11-20T09:15:09Z level=ERROR flow=payments-api msg="card declined, code 51" orderId=SO-88121 durationMs=980`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "ts": "2026-11-20T09:15:02Z", "level": "INFO", "flow": "orders-api", "msg": "order saved", "orderId": "SO-88120", "durationMs": 142 },
  { "ts": "2026-11-20T09:15:04Z", "level": "WARN", "flow": "orders-api", "msg": "stock low", "sku": "TB-200", "qty": 3 },
  { "ts": "2026-11-20T09:15:09Z", "level": "ERROR", "flow": "payments-api", "msg": "card declined, code 51", "orderId": "SO-88121", "durationMs": 980 }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
(payload splitBy "\\n") map (line) -> line splitBy " "
`,
  hints: [
    'Splitting on spaces breaks `msg="order saved"` in two. A regular expression that knows about quotes works better.',
    '`line scan /(\\w+)=("[^"]*"|\\S+)/` returns one match per pair. Each match is a list: the whole text, then the key, then the value.',
    'Build the object from the matches with dynamic keys: `{ (pairs map (m) -> { (m[1]): value(m[2]) }) }`.',
    'In `value`, a quoted value starts with `\'"\'`. Remove the quotes with `replace /^"|"$/ with ""`. An unquoted value that `matches /\\d+/` becomes `as Number`.',
    'Filter out blank lines with `trim($) != ""` before you scan.',
  ],
  solution: `%dw 2.0
output application/json

fun value(raw) =
  if (raw startsWith '"') raw replace /^"|"$/ with ""
  else if (raw matches /\\d+/) raw as Number
  else raw

fun parseLine(line) = do {
  var pairs = line scan /(\\w+)=("[^"]*"|\\S+)/
  ---
  { (pairs map (m) -> { (m[1]): value(m[2]) }) }
}
---
((payload splitBy "\\n") filter (trim($) != "")) map parseLine($)`,
  explanation: `
**Why not split on spaces.** A quoted value such as \`"card declined, code 51"\` holds spaces and a comma. Splitting on either breaks it apart. A regular expression can match a whole quoted value as one piece.

**The pattern.** \`(\\w+)=\` captures the key. The value is either \`"[^"]*"\`, a quote, anything that is not a quote, and a closing quote, or \`\\S+\`, a run of characters that are not spaces. The quoted form comes first, so it wins when a value starts with a quote.

**scan returns every match.** Each match is a list. \`m[0]\` is the whole \`key=value\`, \`m[1]\` the key and \`m[2]\` the value.

**Dynamic keys.** \`{ (list of objects) }\` merges a list of one-key objects into one object, keeping their order. The key comes from the log line, so the script does not need to know the field names.

**Types.** \`matches\` tests the whole value, so \`142\` becomes a number but \`SO-88120\` stays text. A quoted value always stays text, even when it looks like a number.
`,
  tests: [
    {
      name: 'An empty quoted value and a zero',
      inputs: [{ name: 'payload', mime: 'text/plain', content: 'level=DEBUG retries=0 msg=""' }],
      expected: '[{ "level": "DEBUG", "retries": 0, "msg": "" }]',
    },
    {
      name: 'A quoted number stays text',
      inputs: [{ name: 'payload', mime: 'text/plain', content: 'code="0042" depot=D7' }],
      expected: '[{ "code": "0042", "depot": "D7" }]',
    },
  ],
  followUps: [
    {
      q: 'A value contains an escaped quote, such as msg="say \\"hi\\"". Does the pattern cope?',
      a: 'No. The value ends at the first inner quote. Extend the pattern to allow a backslash followed by any character inside the quotes, and then unescape the result.',
    },
    {
      q: 'A file has 2 million lines. What do you watch for?',
      a: 'Keep the work streaming and avoid steps that hold the whole file, such as logging the payload. Process the file in chunks if the target takes batches, and test with a large sample first.',
    },
    {
      q: 'The log search tool wants the time as a real date field. What would you add?',
      a: 'Convert `ts` with `as DateTime` after parsing, and decide what to do with a line where the conversion fails, for example keep the text and add a parse error flag.',
    },
  ],
}
