import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

const order = '{"order": {"id": 7, "items": [{"sku": "A", "qty": 2}, {"sku": "B", "qty": 5}]}}'

export default {
  id: 'dw-093',
  category: 'dataweave',
  title: 'Read the Output: Selectors and Missing Fields',
  level: 'BEGINNER',
  tags: ['selectors', 'read-the-output', 'null-safety'],
  estMinutes: 8,
  exercise: 'quiz',
  description: `
Interviewers often show a short script and ask what it prints. Work each answer out in your head before you choose.

These questions cover the selectors you use most: \`.\`, \`.*\`, \`..\` and array indexes, and what you get back when a field isn't there.
`,
  quiz: [
    out({
      payload: order,
      body: 'payload.order.items.sku',
      right: '["A", "B"]',
      wrong: ['"A"', 'null', FAILS],
      explain: 'A single-value selector on an array is applied to each element, so `.sku` collects one value per item.',
    }),
    out({
      payload: order,
      body: 'payload.order.items[-1].qty',
      right: '5',
      wrong: ['2', '[5]', 'null'],
      explain: 'A negative index counts from the end, so `[-1]` is the last item. Selecting one element gives its value, not an array.',
    }),
    out({
      payload: order,
      body: 'payload.order.customer.name',
      right: 'null',
      wrong: ['""', '{}', FAILS],
      explain: 'A missing field gives `null`, and selecting from `null` gives `null` again. DataWeave selectors do not throw on a missing path.',
    }),
    out({
      payload: order,
      body: 'payload..qty',
      right: '[2, 5]',
      wrong: ['2', 'null', '[[2, 5]]'],
      explain: 'The descendants selector `..` searches every level and returns all matches in one flat array.',
    }),
    out({
      payload: '{"a": 1, "a": 2}',
      body: 'payload.*a',
      right: '[1, 2]',
      wrong: ['1', '2', '[2]'],
      explain: 'DataWeave objects can hold repeated keys. `.a` returns only the first value, and the multi-value selector `.*a` returns them all.',
    }),
  ],
  answerTemplate: `## What each selector returns

## What happens when a field is missing

## An example from a real flow
`,
  keyPoints: [
    '`.` returns one value, and on an array it is applied to each element.',
    '`.*` returns every value for a repeated key.',
    '`..` searches all levels and returns a flat array.',
    'A missing field gives null rather than an error, and that null carries through the rest of the path.',
  ],
  solution: `
\`.\` picks one value. On an array it runs against each element, which is why \`payload.items.sku\` gives a list.

\`.*\` picks every value for a key, which matters for XML and for objects with repeated keys. \`..\` looks at every level and flattens what it finds.

Selectors never fail on a missing path. They return \`null\`, so a mistyped field name goes unnoticed until something downstream needs the value. Add \`default\` where a value is optional, and validate the fields that are required.
`,
  followUps: [
    { q: 'Why can a mistyped field name be hard to spot?', a: 'The selector returns null instead of failing, so the script still runs and the bad value only shows up later.' },
    { q: 'When do you need `.*` rather than `.`?', a: 'When a key can repeat, most often with XML elements. `.` returns only the first one.' },
  ],
}
