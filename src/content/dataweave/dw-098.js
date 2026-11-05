import { outputQuestion as out } from '../../quiz/output-question.js'

const lines = '[{"sku": "A", "region": "EU", "qty": 2}, {"sku": "B", "region": "US", "qty": 5}, {"sku": "C", "region": "EU", "qty": 1}]'

export default {
  id: 'dw-098',
  category: 'dataweave',
  title: 'Read the Output: groupBy, orderBy and distinctBy',
  level: 'INTERMEDIATE',
  tags: ['groupBy', 'orderBy', 'distinctBy', 'read-the-output'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
Grouping, sorting and removing duplicates come up in most reporting transformations. These questions check the type and the order you get back.

Work out each result before you choose.
`,
  quiz: [
    out({
      payload: lines,
      body: '(payload groupBy $.region) mapObject ((v, k) -> { (k): sizeOf(v) })',
      right: '{"EU": 2, "US": 1}',
      wrong: ['[{"EU": 2}, {"US": 1}]', '{"EU": 3, "US": 5}', '{"EU": 1, "US": 1}'],
      explain: 'Each group is an array of the matching records, so `sizeOf` counts records. It does not add up `qty`.',
    }),
    out({
      body: '["b", "C", "a"] orderBy $',
      right: '["C", "a", "b"]',
      wrong: ['["a", "b", "C"]', '["b", "C", "a"]', '["a", "C", "b"]'],
      explain: 'Text sorts by character code and uppercase letters come first, so `C` is ahead of `a`. Sort on `lower($)` to ignore case.',
    }),
    out({
      payload: lines,
      body: '(payload orderBy -$.qty).sku',
      right: '["B", "A", "C"]',
      wrong: ['["C", "A", "B"]', '["A", "B", "C"]', '[5, 2, 1]'],
      explain: '`orderBy` sorts from low to high. Negating a number reverses that, so the largest `qty` comes first.',
    }),
    out({
      payload: lines,
      body: '(payload distinctBy $.region).sku',
      right: '["A", "B"]',
      wrong: ['["B", "C"]', '["EU", "US"]', '["A", "B", "C"]'],
      explain: '`distinctBy` keeps the first record for each value, so `C` is dropped as a second EU record.',
    }),
    out({
      payload: lines,
      body: 'typeOf(payload groupBy $.region) as String',
      right: '"Object"',
      wrong: ['"Array"', '"Key"', '"Null"'],
      explain: '`groupBy` on an array returns an object, with one key per group. That is why you continue with `mapObject` or `pluck` and not `map`.',
    }),
  ],
  answerTemplate: `## What groupBy returns

## How orderBy sorts

## Which record distinctBy keeps
`,
  keyPoints: [
    'groupBy on an array returns an object of arrays.',
    'orderBy sorts ascending, and text sorts by character code.',
    'Negate a number to sort descending, or reverse the result with [-1 to 0].',
    'distinctBy keeps the first record it meets.',
  ],
  solution: `
\`groupBy\` returns an object: each key is a group value and each value is an array of records. Continue with \`mapObject\` or \`pluck\`.

\`orderBy\` is ascending. Negate numbers to reverse them, and sort on \`lower($)\` when case shouldn't matter.

\`distinctBy\` keeps the first record for each value, so sort first when you need a particular one, such as the latest version of a record.
`,
  followUps: [
    { q: 'How do you keep the newest record per customer?', a: 'Sort newest first with orderBy, then use distinctBy on the customer ID so the first one kept is the newest.' },
    { q: 'How do you add up quantity per group?', a: 'Use mapObject on the groups and call sum on each group\'s qty values.' },
  ],
}
