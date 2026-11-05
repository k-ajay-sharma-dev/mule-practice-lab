import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-102',
  category: 'dataweave',
  title: 'Read the Output: Nulls, Coercion and Comparison',
  level: 'INTERMEDIATE',
  tags: ['null-safety', 'coercion', 'comparison', 'read-the-output'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
Some operations pass null along quietly and others stop the script. Knowing which is which helps you find a failing transformation quickly.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: '"12a" as Number',
      right: FAILS,
      wrong: ['12', 'null', '"12a"'],
      error: 'Cannot coerce String',
      explain: '`as Number` needs the whole text to be a number. It does not read the leading digits, and it does not return null.',
    }),
    out({
      body: 'sizeOf(null)',
      right: 'null',
      wrong: ['0', '1', FAILS],
      explain: '`sizeOf` passes null straight through. It does not give 0, so `sizeOf(payload.items) > 0` can still fail on a missing list.',
    }),
    out({
      payload: '{}',
      body: 'payload.qty > 1',
      right: FAILS,
      wrong: ['false', 'null', 'true'],
      error: 'can not be compared',
      explain: 'Selecting a missing field is safe, but ordering null against a number is not. Use `(payload.qty default 0) > 1`.',
    }),
    out({
      body: '[1 ~= "1", 1 == "1"]',
      right: '[true, false]',
      wrong: ['[true, true]', '[false, false]', '[false, true]'],
      explain: '`==` compares type and value, so a Number never equals a String. `~=` converts the values first, so it finds them similar.',
    }),
    out({
      body: '"abc" as Number default 0',
      right: '0',
      wrong: ['null', '"abc"', FAILS],
      explain: 'A failed `as` conversion on the left of `default` gives the fallback. This is convenient, but it can hide bad data. It is not a general catch: `(1 / 0) default 0` still fails.',
    }),
  ],
  answerTemplate: `## Which operations pass null along

## Which operations fail on null

## How to handle bad data on purpose
`,
  keyPoints: [
    'as Number needs the whole text to be numeric.',
    'sizeOf(null) is null, not 0.',
    'Comparing null with > fails, and == does not.',
    '== checks the type too, while ~= converts first.',
    'default catches a failed `as` conversion, but not other errors.',
  ],
  solution: `
Selectors and many functions pass null along. Ordering comparisons such as \`>\` do not, and they stop with an error, so add \`default\` before comparing an optional value.

\`==\` compares type and value, and \`~=\` converts first. A number held as text therefore needs \`~=\` or an explicit conversion.

\`default\` also catches a failed \`as\` conversion, though not other errors such as division by zero. That makes \`value as Number default 0\` short to write, but a bad value then looks like a real 0. Where bad data matters, check it and raise an error instead. Use \`try\` from \`dw::Runtime\` to catch other failures.
`,
  followUps: [
    { q: 'Why might `as Number default 0` be a bad idea for a payment amount?', a: 'A corrupt amount silently becomes 0 and gets processed, when it should be rejected and reported.' },
    { q: 'How do you check safely that a list has items?', a: 'Use !isEmpty(list), because isEmpty(null) is true, whereas comparing sizeOf(null) with a number fails.' },
  ],
}
