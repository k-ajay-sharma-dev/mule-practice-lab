import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-103',
  category: 'dataweave',
  title: 'Read the Output: match and Regular Expressions',
  level: 'ADVANCED',
  tags: ['pattern-matching', 'regex', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
\`match\` replaces long if and else chains, and regular expressions come with their own return shapes. These questions check both.

Work out each result before you choose.
`,
  quiz: [
    out({
      body: '"ORD-42" match {\n  case id if id startsWith "ORD" -> "order"\n  else -> "other"\n}',
      right: '"order"',
      wrong: ['"other"', 'true', '"ORD-42"'],
      explain: 'A `case name if condition` binds the value to a name and then tests it. The first case that passes wins.',
    }),
    out({
      body: '"ORD-42" match {\n  case m matches /([A-Z]+)-(\\d+)/ -> m[2]\n  else -> "none"\n}',
      right: '"42"',
      wrong: ['"ORD"', '42', '"-"'],
      explain: 'With `matches`, the name holds an array: index 0 is the whole match and each capture group follows. Captures are always text, so this is the String `"42"`.',
    }),
    out({
      body: '42 match {\n  case is String -> "text"\n  case is Number -> "number"\n  else -> "other"\n}',
      right: '"number"',
      wrong: ['"text"', '"other"', '42'],
      explain: '`case is Type` tests the type of the value, which is useful when a field can hold different shapes.',
    }),
    out({
      body: '"b" match {\n  case "a" -> 1\n}',
      right: FAILS,
      wrong: ['null', '"b"', '1'],
      error: 'None of the match cases matched',
      explain: 'With no `else`, a value that matches nothing raises an error at runtime. It does not return null.',
    }),
    out({
      body: '"a1b22" scan /\\d+/',
      right: '[["1"], ["22"]]',
      wrong: ['["1", "22"]', '"122"', '[1, 22]'],
      explain: '`scan` returns one array per match, and each holds the match followed by any capture groups. That is why the result is nested.',
    }),
  ],
  answerTemplate: `## When to use match rather than if

## What a regular expression match gives you

## What happens with no else
`,
  keyPoints: [
    'Cases are tried in order and the first match wins.',
    'case is Type tests the type.',
    'With matches, index 0 is the whole match and captures follow.',
    'A match with no else fails when nothing matches.',
    'scan returns an array of arrays.',
  ],
  solution: `
\`match\` tries each case in order. A case can test a value, a condition, a type or a regular expression.

With \`matches\`, the bound name is an array: index 0 is the whole match and capture groups follow. \`scan\` returns that same shape for every match, so its result is an array of arrays.

Always include \`else\` unless you want an unknown value to stop the script. Sometimes you do, because it reports a value nobody planned for.
`,
  followUps: [
    { q: 'When is leaving out else the right choice?', a: 'When an unknown value is a real error, such as an unexpected status code, and failing is better than guessing.' },
    { q: 'How do you get a plain list from scan?', a: 'Map each match to its first element, for example `scan(text, regex) map $[0]`.' },
  ],
}
