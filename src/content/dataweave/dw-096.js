import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-096',
  category: 'dataweave',
  title: 'Read the Output: default and Conditions',
  level: 'BEGINNER',
  tags: ['default', 'conditional-logic', 'read-the-output', 'null-safety'],
  estMinutes: 8,
  exercise: 'quiz',
  description: `
Optional fields are everywhere in integration work. These questions check exactly when \`default\` applies and how a conditional field behaves.

Work out each result before you choose.
`,
  quiz: [
    out({
      payload: '{"discount": null}',
      body: 'payload.discount default 0',
      right: '0',
      wrong: ['null', '""', FAILS],
      explain: '`default` gives the right side when the left side is null, and a JSON null counts the same as a missing field.',
    }),
    out({
      payload: '{"flag": false}',
      body: 'payload.flag default true',
      right: 'false',
      wrong: ['true', 'null', FAILS],
      explain: '`default` reacts to null, not to false. The value false is present, so it is kept.',
    }),
    out({
      body: '{ a: 1, (b: 2) if false, c: null }',
      right: '{"a": 1, "c": null}',
      wrong: ['{"a": 1, "b": 2, "c": null}', '{"a": 1}', '{"a": 1, "b": null, "c": null}'],
      explain: 'A field written as `(key: value) if condition` is left out completely when the condition is false. A field set to null stays in the output.',
    }),
    out({
      payload: '{"qty": 5}',
      body: 'if (payload.qty > 5) "big" else "small"',
      right: '"small"',
      wrong: ['"big"', 'true', 'null'],
      explain: '5 is not greater than 5, so the else branch runs. `if` is an expression, so it returns a value and always needs an `else`.',
    }),
    out({
      payload: '{}',
      body: 'payload.a == payload.b',
      right: 'true',
      wrong: ['false', 'null', FAILS],
      explain: 'Both fields are missing, so this compares null with null, which is true. Two absent values can look like a match when you compare records.',
    }),
  ],
  answerTemplate: `## When default applies

## How to leave a field out of the output

## A mistake this can cause
`,
  keyPoints: [
    'default applies to null, and a missing field is null.',
    'false, 0 and an empty string are real values, so default keeps them.',
    '(key: value) if condition removes the field when false.',
    'if is an expression and needs an else.',
  ],
  solution: `
\`default\` replaces null. A missing field reads as null, so it covers both, but \`false\`, \`0\` and \`""\` are real values and are kept.

To leave a field out entirely, wrap it: \`(status: payload.status) if payload.status != null\`. Setting a field to null keeps the key in the output, and some APIs treat that differently from a missing key.

Comparing two fields needs care, because two missing values are equal.
`,
  followUps: [
    { q: 'Why might a target API care about null versus a missing key?', a: 'Many APIs read null as "clear this value" and a missing key as "leave it unchanged".' },
    { q: 'How do you stop two missing IDs counting as a match?', a: 'Check that the value is not null before comparing, or filter out records without an ID first.' },
  ],
}
