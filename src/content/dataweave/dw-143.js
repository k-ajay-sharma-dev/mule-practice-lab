export default {
  id: 'dw-143',
  category: 'dataweave',
  title: 'Check Balanced Brackets in Message Templates',
  level: 'ADVANCED',
  tags: ['reduce', 'stack', 'strings', 'validation', 'accumulator', 'interview-classic', 'json'],
  estMinutes: 30,
  description: `
Brightwater Energy sends text messages to customers from templates such as \`Dear {name}, your bill (ref [B12]) is ready.\` Staff edit the templates in a web form. A broken bracket makes the message engine fail at send time, so an integration now checks every template when it is saved.

Brackets are \`( )\`, \`[ ]\` and \`{ }\`. A template is **balanced** when each closing bracket matches the last bracket still open, and nothing is left open at the end.

Output one object per template, in input order, with:

- \`id\`: copied from the input
- \`balanced\`: \`true\` or \`false\`
- \`error\`: \`null\` when balanced. Otherwise one of:
  - \`"unexpected X at N"\` for the first closing bracket that does not match, where \`N\` is its position counting the first character as 1
  - \`"unclosed X at N"\` when the text ends with brackets still open. Report the one opened last.

This is the classic stack question. A \`reduce\` can carry the stack from one character to the next.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "id": "T1", "template": "Dear {name}, your bill (ref [B12]) is ready." },
  { "id": "T2", "template": "Total: {amount)" },
  { "id": "T3", "template": "Hello {first} (VIP" },
  { "id": "T4", "template": "Items: [x]]" },
  { "id": "T5", "template": "No brackets here" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  { "id": "T1", "balanced": true, "error": null },
  { "id": "T2", "balanced": false, "error": "unexpected ) at 15" },
  { "id": "T3", "balanced": false, "error": "unclosed ( at 15" },
  { "id": "T4", "balanced": false, "error": "unexpected ] at 11" },
  { "id": "T5", "balanced": true, "error": null }
]`,
  },
  starterCode: `%dw 2.0
output application/json
var openFor = { ")": "(", "]": "[", "}": "{" }
---
payload map (t) -> {
  id: t.id,
  balanced: true,
  error: null
}
`,
  hints: [
    'Split the text into characters and keep each position: `(text splitBy "") map (c, i) -> { c: c, pos: i + 1 }`.',
    'Start the `reduce` with `{ stack: [], error: null }`. Once `error` is set, return the accumulator unchanged for the rest of the text.',
    'Keep the newest open bracket at the front of the stack. Push with `[ch] ++ acc.stack`, read the top with `acc.stack[0]`, and pop with `acc.stack filter ((x, j) -> j > 0)`.',
    'A closing bracket is fine when the stack is not empty and `acc.stack[0].c == openFor[ch.c]`. Otherwise set the error with its position.',
    'After the `reduce`, an empty stack and no error means balanced. A stack that is not empty means `acc.stack[0]` was never closed.',
  ],
  solution: `%dw 2.0
output application/json
var openFor = { ")": "(", "]": "[", "}": "{" }
var openers = ["(", "[", "{"]

fun step(acc, ch) =
  if (acc.error != null) acc
  else if (sizeOf(openers filter ($ == ch.c)) > 0)
    { stack: [ch] ++ acc.stack, error: null }
  else if (openFor[ch.c] != null)
    if (sizeOf(acc.stack) > 0 and acc.stack[0].c == openFor[ch.c])
      { stack: acc.stack filter ((x, j) -> j > 0), error: null }
    else
      { stack: acc.stack, error: "unexpected $(ch.c) at $(ch.pos)" }
  else acc

fun check(text) = do {
  var chars = (text splitBy "") map (c, i) -> { c: c, pos: i + 1 }
  var result = chars reduce ((ch, acc = { stack: [], error: null }) -> step(acc, ch))
  ---
  if (result.error != null) { balanced: false, error: result.error }
  else if (sizeOf(result.stack) > 0) { balanced: false, error: "unclosed $(result.stack[0].c) at $(result.stack[0].pos)" }
  else { balanced: true, error: null }
}
---
payload map (t) -> { id: t.id } ++ check(t.template)`,
  explanation: `
**Why a stack.** The rule is about the **last** bracket still open. Pushing each opener on top and taking from the top when a closer arrives matches that rule exactly. Counting brackets is not enough, because \`(]\` has one of each and is still wrong.

**reduce carries state.** DataWeave has no loop with a changing variable. \`reduce\` passes an accumulator from one character to the next, so the stack and the first error travel along the text. The \`step\` function holds the rules, which keeps the \`reduce\` line short.

**Stop at the first error.** Once \`error\` is set, \`step\` returns the accumulator as it is. Later characters cannot hide or replace the first problem.

**Positions.** The characters are paired with \`i + 1\` before the \`reduce\`, because \`reduce\` itself gives no index. People count from 1, so T2 reports position 15 for the \`)\` at the end of \`Total: {amount)\`.

**Two kinds of failure.** A wrong closer is found during the \`reduce\`. An unclosed opener can only be found at the end, when the stack is not empty. The front of the stack is the opener added last, which is the one T3 reports.
`,
  tests: [
    {
      name: 'Nested brackets of every kind',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "id": "N1", "template": "{[()]} and ({x}[y])" }]' }],
      expected: '[{ "id": "N1", "balanced": true, "error": null }]',
    },
    {
      name: 'Wrong kind of closer',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "id": "W1", "template": "(]" }]' }],
      expected: '[{ "id": "W1", "balanced": false, "error": "unexpected ] at 2" }]',
    },
    {
      name: 'Two left open reports the one opened last',
      inputs: [{ name: 'payload', mime: 'application/json', content: '[{ "id": "U1", "template": "a(b[c" }]' }],
      expected: '[{ "id": "U1", "balanced": false, "error": "unclosed [ at 4" }]',
    },
  ],
  followUps: [
    {
      q: 'Why not count the opening and closing brackets and compare the totals?',
      a: 'Equal totals do not mean the order is right. `)(` and `(]` both have the same number of openers and closers, and both are broken.',
    },
    {
      q: 'Templates may contain a literal bracket written as `\\{`. How would you allow it?',
      a: 'Remove the escaped brackets before the check, for example with `replace /\\\\[(){}\\[\\]]/ with ""`, or mark the character after a backslash as skipped inside the reduce.',
    },
    {
      q: 'Where would this check run in a Mule app?',
      a: 'In the flow that saves a template, before the database write. A failed check returns 400 to the web form with the error text, so the editor sees the position at once.',
    },
  ],
}
