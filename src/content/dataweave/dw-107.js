import { outputQuestion as out } from '../../quiz/output-question.js'

const pair = '{"a": 1, "b": 2}'

export default {
  id: 'dw-107',
  category: 'dataweave',
  title: 'Read the Output: update, Removing Keys and Dynamic Objects',
  level: 'INTERMEDIATE',
  tags: ['update', 'objects', 'dynamic-keys', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
Changing one field in a large document should not mean rebuilding all of it. These questions cover \`update\`, removing keys and spreading an object into another.

Work out each result before you choose.
`,
  quiz: [
    out({
      payload: pair,
      body: 'payload update {\n  case a at .a -> a + 1\n}',
      right: '{"a": 2, "b": 2}',
      wrong: ['{"a": 2}', '2', '{"a": 1, "b": 2}'],
      explain: '`update` changes only the path you name and keeps the rest. `a at .a` gives the current value a name.',
    }),
    out({
      payload: pair,
      body: 'payload update {\n  case .c -> 9\n}',
      right: '{"a": 1, "b": 2}',
      wrong: ['{"a": 1, "b": 2, "c": 9}', '{"c": 9}', 'null'],
      explain: 'A plain path only updates what already exists. `c` is not there, so nothing changes and no error is raised.',
    }),
    out({
      payload: pair,
      body: 'payload update {\n  case .c! -> 9\n}',
      right: '{"a": 1, "b": 2, "c": 9}',
      wrong: ['{"a": 1, "b": 2}', '{"c": 9}', '{"a": 9, "b": 9, "c": 9}'],
      explain: 'The `!` after the path means update or insert, so the missing field is created.',
    }),
    out({
      payload: pair,
      body: 'payload - "a"',
      right: '{"b": 2}',
      wrong: ['{"a": 1, "b": 2}', '{"a": null, "b": 2}', '[2]'],
      explain: 'On an object, `-` removes the key with that name.',
    }),
    out({
      payload: pair,
      body: '{ (payload), c: 3 }',
      right: '{"a": 1, "b": 2, "c": 3}',
      wrong: ['{"payload": {"a": 1, "b": 2}, "c": 3}', '{"c": 3}', '[{"a": 1, "b": 2}, {"c": 3}]'],
      explain: 'Parentheses around an object inside `{ }` spread its fields into the new object.',
    }),
  ],
  answerTemplate: `## When update beats mapObject

## What happens to a path that does not exist

## How to add and remove fields
`,
  keyPoints: [
    'update changes the named path and keeps the rest.',
    'A plain path does nothing if the field is missing.',
    '! after the path inserts the field.',
    '- removes a key from an object.',
    '( ) spreads an object into a new one.',
  ],
  solution: `
\`update\` suits one change inside a large or deep document, because you don't have to copy every other field.

A plain path changes only what exists and gives no error when the field is missing. Add \`!\` to insert it.

\`payload - "a"\` removes a key, and \`{ (payload), c: 3 }\` copies all fields and adds another. Together they cover most small reshaping jobs.
`,
  followUps: [
    { q: 'Why can a plain update path hide a mistake?', a: 'A mistyped path changes nothing and raises no error, so the old value passes through.' },
    { q: 'When would you still rebuild the whole object?', a: 'When most fields change or the output has a different shape, because explicit mapping is then easier to read.' },
  ],
}
