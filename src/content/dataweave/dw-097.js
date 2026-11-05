import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

const pair = '{"a": 1, "b": 2}'

export default {
  id: 'dw-097',
  category: 'dataweave',
  title: 'Read the Output: mapObject, pluck and filterObject',
  level: 'INTERMEDIATE',
  tags: ['mapObject', 'pluck', 'filterObject', 'read-the-output', 'objects'],
  estMinutes: 10,
  exercise: 'quiz',
  description: `
Objects have their own functions, and choosing the wrong one is a frequent mistake. These questions check what type each one returns.

Work out each result before you choose.
`,
  quiz: [
    out({
      payload: pair,
      body: 'payload mapObject ((v, k) -> { (upper(k)): v * 10 })',
      right: '{"A": 10, "B": 20}',
      wrong: ['[{"A": 10}, {"B": 20}]', '{"a": 10, "b": 20}', FAILS],
      explain: '`mapObject` returns one object, built from the objects your lambda returns. The value comes first in the lambda, then the key.',
    }),
    out({
      payload: pair,
      body: 'payload pluck ((v, k) -> k)',
      right: '["a", "b"]',
      wrong: ['[1, 2]', '{"a": "a", "b": "b"}', '"a"'],
      explain: '`pluck` turns an object into an array. This lambda returns the key, so the result is the list of keys.',
    }),
    out({
      payload: pair,
      body: 'payload filterObject ((v) -> v > 1)',
      right: '{"b": 2}',
      wrong: ['[2]', '{"a": false, "b": true}', '2'],
      explain: '`filterObject` keeps the matching key and value pairs and still returns an object.',
    }),
    out({
      payload: pair,
      body: 'payload map ($ + 1)',
      right: FAILS,
      wrong: ['[2, 3]', '{"a": 2, "b": 3}', 'null'],
      error: "You called the function 'map'",
      explain: '`map` takes an array, or null, and an object is neither. Use `mapObject` to get an object back or `pluck` to get an array.',
    }),
    out({
      payload: pair,
      body: 'sizeOf(payload ++ { b: 9 })',
      right: '3',
      wrong: ['2', '1', FAILS],
      explain: '`++` on objects appends and does not replace, so the result holds `b` twice. Use `mergeWith` from `dw::core::Objects` when the right side should win.',
    }),
  ],
  answerTemplate: `## Which function returns which type

## The order of the lambda arguments

## How to merge two objects
`,
  keyPoints: [
    'mapObject and filterObject return an object, and pluck returns an array.',
    'The lambda receives the value first, then the key, then the index.',
    'map does not accept an object.',
    '++ on objects can leave repeated keys.',
  ],
  solution: `
Choose by the result you want: \`mapObject\` and \`filterObject\` return an object, \`pluck\` returns an array.

All three pass the value, then the key, then the index. In shorthand that is \`$\`, \`$$\` and \`$$$\`, so \`$\` is the value here too.

\`++\` keeps both copies of a repeated key. JSON writers then output the key twice, and many consumers silently keep only one of them. Use \`mergeWith\` to overwrite.
`,
  followUps: [
    { q: 'What type is the key in the lambda?', a: 'It is a Key, not a String. It converts when needed, but use `k as String` when calling something that expects text.' },
    { q: 'How do you turn an object into a list of name and value records?', a: 'Use pluck and return an object from the lambda, such as `{ name: k as String, value: v }`.' },
  ],
}
