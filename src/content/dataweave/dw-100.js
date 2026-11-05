import { outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-100',
  category: 'dataweave',
  title: 'Read the Output: flatten, flatMap, zip and Ranges',
  level: 'INTERMEDIATE',
  tags: ['flatten', 'flatMap', 'zip', 'arrays', 'read-the-output'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
Reshaping arrays is a daily job in DataWeave. These questions check how deep each function goes and how arrays of different lengths behave.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: 'flatten([[1, [2]], [3]])',
      right: '[1, [2], 3]',
      wrong: ['[1, 2, 3]', '[[1, [2]], [3]]', '[[1], [2], [3]]'],
      explain: '`flatten` removes one level only, so the inner `[2]` stays an array.',
    }),
    out({
      body: '[1, 2] flatMap ((n) -> [n, n * 10])',
      right: '[1, 10, 2, 20]',
      wrong: ['[[1, 10], [2, 20]]', '[10, 20]', '[1, 2, 10, 20]'],
      explain: '`flatMap` is `map` followed by `flatten`, so each pair is joined into one array in order.',
    }),
    out({
      body: '[1, 2, 2, 3] -- [2]',
      right: '[1, 3]',
      wrong: ['[1, 2, 3]', '[1, 2, 2, 3]', '[3]'],
      explain: '`--` removes every element equal to one on the right, not just the first match.',
    }),
    out({
      body: '[1, 2, 3, 4, 5][1 to 3]',
      right: '[2, 3, 4]',
      wrong: ['[1, 2, 3]', '[2, 3]', '[1, 2, 3, 4]'],
      explain: 'Indexes start at 0 and both ends of the range are included, so this takes indexes 1, 2 and 3.',
    }),
    out({
      body: '[1, 2] zip ["a", "b", "c"]',
      right: '[[1, "a"], [2, "b"]]',
      wrong: ['[[1, "a"], [2, "b"], [null, "c"]]', '[1, "a", 2, "b", "c"]', '{"1": "a", "2": "b"}'],
      explain: '`zip` pairs items by position and stops at the shorter array, so `"c"` is dropped without any warning.',
    }),
  ],
  answerTemplate: `## How deep flatten goes

## Why use flatMap

## What zip does with uneven arrays
`,
  keyPoints: [
    'flatten removes exactly one level.',
    'flatMap is map then flatten.',
    'Ranges include both ends.',
    'zip stops at the shorter array and drops the rest.',
  ],
  solution: `
\`flatten\` removes one level. Call it again, or use recursion, for deeper nesting.

\`flatMap\` suits one-to-many steps, such as turning each order into its lines.

A range such as \`[1 to 3]\` includes both ends, and \`[-1 to 0]\` reads an array backwards.

\`zip\` stops at the shorter array and gives no warning, so compare lengths first when a missing pair would be a data problem.
`,
  followUps: [
    { q: 'How do you reverse an array without a helper function?', a: 'Use the range [-1 to 0], which reads from the last index to the first.' },
    { q: 'Why can zip hide a data problem?', a: 'If one list is short, the extra items disappear without an error, so a mismatch between two sources goes unnoticed.' },
  ],
}
