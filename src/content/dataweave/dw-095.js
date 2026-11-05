import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-095',
  category: 'dataweave',
  title: 'Read the Output: Strings and Numbers',
  level: 'BEGINNER',
  tags: ['strings', 'numbers', 'read-the-output', 'coercion'],
  estMinutes: 8,
  exercise: 'quiz',
  description: `
Small scripts that join text and do arithmetic look simple, but DataWeave converts some types for you. These questions check whether you know when.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: '"Order-" ++ 42',
      right: '"Order-42"',
      wrong: ['["Order-", 42]', '"Order-"', FAILS],
      explain: 'The left side is a String, so `++` joins strings and the Number 42 is converted to `"42"` automatically.',
    }),
    out({
      body: '"a,b,,c" splitBy ","',
      right: '["a", "b", "", "c"]',
      wrong: ['["a", "b", "c"]', '["a,b,,c"]', '"a b c"'],
      explain: '`splitBy` keeps the empty value between two commas. Forgetting this is a common cause of shifted columns when reading delimited text by hand.',
    }),
    out({
      body: 'upper(trim("  mule  ")) ++ "!"',
      right: '"MULE!"',
      wrong: ['"  MULE  !"', '"MULE !"', '"mule!"'],
      explain: 'The innermost call runs first: `trim` removes the outer spaces, `upper` changes the case, and then `++` adds the mark.',
    }),
    out({
      body: 'sizeOf("DataWeave")',
      right: '9',
      wrong: ['8', '1', FAILS],
      explain: '`sizeOf` on a String returns its number of characters. It also works on arrays and objects.',
    }),
    out({
      body: '"10" + 5',
      right: '15',
      wrong: ['"105"', '105', FAILS],
      explain: 'In DataWeave `+` is not string joining. It needs numbers here, so `"10"` is converted to a Number. Use `++` to join text.',
    }),
  ],
  answerTemplate: `## The difference between + and ++

## When DataWeave converts a type for you

## When you should convert it yourself
`,
  keyPoints: [
    '++ joins strings or arrays, and + adds.',
    'DataWeave converts a value automatically when the operator needs another type and the value can be converted.',
    'splitBy keeps empty values.',
    'sizeOf counts characters, array items or object keys.',
  ],
  solution: `
\`+\` is arithmetic and \`++\` is concatenation, which is the opposite of what people expect coming from Java or JavaScript.

When an operator needs another type, DataWeave converts the value if it can. So \`"10" + 5\` gives \`15\`, and \`"Order-" ++ 42\` gives \`"Order-42"\`.

Automatic conversion is handy, but an explicit \`as Number\` makes the intent clear and fails at the point where the data is wrong.
`,
  followUps: [
    { q: 'What does ++ do with two arrays?', a: 'It joins them into one array, keeping the order.' },
    { q: 'Why might you still write `as Number` when the conversion is automatic?', a: 'It documents the type you expect and makes a bad value fail at that line rather than later.' },
  ],
}
