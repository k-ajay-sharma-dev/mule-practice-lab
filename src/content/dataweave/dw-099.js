import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-099',
  category: 'dataweave',
  title: 'Read the Output: reduce',
  level: 'INTERMEDIATE',
  tags: ['reduce', 'read-the-output', 'accumulators'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
\`reduce\` is the function candidates trace wrongly most often, because the item comes first and the accumulator second.

Trace each script one step at a time before you choose.
`,
  quiz: [
    out({
      body: '[1, 2, 3] reduce ((n, acc) -> acc + n)',
      right: '6',
      wrong: ['3', '[1, 3, 6]', FAILS],
      explain: 'With no starting value, the accumulator begins as the first item, so the steps are 1+2 and then 3+3. Only the final value is returned.',
    }),
    out({
      body: '[2, 3] reduce ((n, acc = 10) -> acc * n)',
      right: '60',
      wrong: ['6', '15', '30'],
      explain: 'A starting value goes on the accumulator parameter. The steps are 10*2 and then 20*3.',
    }),
    out({
      body: '["a", "b", "c"] reduce ($ ++ $$)',
      right: '"cba"',
      wrong: ['"abc"', '["a", "b", "c"]', FAILS],
      explain: 'In `reduce`, `$` is the item and `$$` is the accumulator, so each new item goes in front: `"b" ++ "a"`, then `"c" ++ "ba"`.',
    }),
    out({
      body: '[] reduce ($ + $$)',
      right: 'null',
      wrong: ['0', '[]', FAILS],
      explain: 'An empty array with no starting value has nothing to return, so the result is null. Give the accumulator a starting value when the list can be empty.',
    }),
    out({
      body: '[{k: "a", v: 1}, {k: "b", v: 2}] reduce ((e, acc = {}) -> acc ++ { (e.k): e.v })',
      right: '{"a": 1, "b": 2}',
      wrong: ['[{"a": 1}, {"b": 2}]', '{"k": "b", "v": 2}', '{"a": 2}'],
      explain: 'Starting from an empty object, each step appends one key. This is a common way to turn a list into a lookup object.',
    }),
  ],
  answerTemplate: `## The order of the reduce arguments

## What happens without a starting value

## A good use for reduce
`,
  keyPoints: [
    'The lambda takes the item first and the accumulator second.',
    'The starting value is set on the accumulator parameter.',
    'Without one, the accumulator starts as the first item.',
    'An empty array without a starting value gives null.',
  ],
  solution: `
\`reduce\` walks the array and carries one value along. The parameters are \`(item, accumulator)\`, so in shorthand \`$\` is the item and \`$$\` the accumulator, the reverse of what many people expect.

Set the starting value with \`acc = ...\`. Without one, the first item is the starting value, and an empty array returns \`null\`.

Reach for \`sum\`, \`groupBy\` or \`flatten\` first when one fits. Use \`reduce\` when each step depends on the result so far.
`,
  followUps: [
    { q: 'Why give a starting value even when the list is rarely empty?', a: 'It fixes the result type and stops an empty list returning null to the next step.' },
    { q: 'What can make reduce slow on a large list?', a: 'Rebuilding a growing array or object on every step copies more each time. Prefer groupBy or a built-in function when one fits.' },
  ],
}
