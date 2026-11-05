import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-094',
  category: 'dataweave',
  title: 'Read the Output: map and filter',
  level: 'BEGINNER',
  tags: ['map', 'filter', 'read-the-output', 'lambdas'],
  estMinutes: 8,
  exercise: 'quiz',
  description: `
\`map\` and \`filter\` appear in nearly every DataWeave script, and interviewers use them to check that you know what \`$\` and \`$$\` hold.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: '[10, 20, 30] map ($ + $$)',
      right: '[10, 21, 32]',
      wrong: ['[11, 22, 33]', '[10, 20, 30]', '[0, 1, 2]'],
      explain: 'In `map`, `$` is the item and `$$` is its index, which starts at 0. So the sums are 10+0, 20+1 and 30+2.',
    }),
    out({
      body: '[1, 2, 3, 4] filter (($ mod 2) == 0)',
      right: '[2, 4]',
      wrong: ['[1, 3]', '[false, true, false, true]', '2'],
      explain: '`filter` keeps the items where the condition is true and returns those items. The inner brackets are needed: without them, `$ mod 2 == 0` reads as `$ mod (2 == 0)` and the script fails.',
    }),
    out({
      body: '[1, 2, 3] map ($ > 1)',
      right: '[false, true, true]',
      wrong: ['[2, 3]', '[1, 2, 3]', 'true'],
      explain: '`map` always returns one result per item. Here each result is the Boolean from the comparison, so nothing is removed.',
    }),
    out({
      body: '["a", "b"] map { ($): $$ }',
      right: '[{"a": 0}, {"b": 1}]',
      wrong: ['{"a": 0, "b": 1}', '[{"$": 0}, {"$": 1}]', FAILS],
      explain: 'Parentheses around a key make it dynamic, so `($)` uses the item as the key. `map` still returns an array, with one object per item.',
    }),
    out({
      body: 'null map ($ + 1)',
      right: 'null',
      wrong: ['[]', '[1]', FAILS],
      explain: '`map` has a version that accepts null and returns null, so a missing list does not stop the script. Add `default []` if the next step needs an array.',
    }),
  ],
  answerTemplate: `## What map returns

## What filter returns

## What $ and $$ hold
`,
  keyPoints: [
    'map returns exactly one result per item, so the array keeps its length.',
    'filter keeps or drops items and never changes them.',
    'In both, $ is the item and $$ is the zero-based index.',
    'map on null returns null rather than failing.',
  ],
  solution: `
\`map\` turns each item into a new value and keeps the array's length. \`filter\` keeps the items where the condition is true and leaves them unchanged.

Both give the lambda the item and its index, and \`$\` and \`$$\` are shorthand for those two. Named parameters such as \`(item, index) ->\` read better once a lambda has more than one step.

Passing \`null\` to \`map\` returns \`null\`, so a missing list passes through without an error.
`,
  followUps: [
    { q: 'How do you remove items and change the rest?', a: 'Run filter first, then map, so the lambda in map only sees the items you keep.' },
    { q: 'When would you use named parameters rather than $ and $$?', a: 'When lambdas are nested or longer than a line, because inner $ hides the outer one and names are easier to read.' },
  ],
}
