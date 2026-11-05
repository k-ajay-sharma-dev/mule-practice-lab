import { outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-105',
  category: 'dataweave',
  title: 'Read the Output: Arrays, Strings and Objects Modules',
  level: 'ADVANCED',
  tags: ['dw::core::Arrays', 'dw::core::Strings', 'dw::core::Objects', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
The core modules save you from writing helpers by hand, so knowing them is a sign of experience. These functions must be imported before use.

Work out each result before you choose.
`,
  quiz: [
    out({
      head: 'import countBy from dw::core::Arrays',
      body: '[1, 2, 3, 4] countBy ($ > 2)',
      right: '2',
      wrong: ['[3, 4]', '4', '{"true": 2, "false": 2}'],
      explain: '`countBy` returns how many items pass the condition, as a single number.',
    }),
    out({
      head: 'import divideBy from dw::core::Arrays',
      body: '[1, 2, 3, 4, 5] divideBy 2',
      right: '[[1, 2], [3, 4], [5]]',
      wrong: ['[[1, 2], [3, 4]]', '[[1, 2, 3], [4, 5]]', '[0.5, 1, 1.5, 2, 2.5]'],
      explain: '`divideBy` splits an array into chunks of that size, and the last chunk can be shorter. It is handy for building batches for an API.',
    }),
    out({
      head: 'import camelize, capitalize from dw::core::Strings',
      body: '[camelize("order_line_item"), capitalize("order_line_item")]',
      right: '["orderLineItem", "Order Line Item"]',
      wrong: ['["OrderLineItem", "Order_line_item"]', '["orderLineItem", "Order_line_item"]', '["order_line_item", "ORDER_LINE_ITEM"]'],
      explain: '`camelize` removes the underscores and leaves the first letter lowercase. `capitalize` splits the words and capitalizes each one.',
    }),
    out({
      head: 'import substringBefore, substringAfterLast from dw::core::Strings',
      body: '[substringBefore("a.b.c", "."), substringAfterLast("a.b.c", ".")]',
      right: '["a", "c"]',
      wrong: ['["a.b", "c"]', '["a", "b.c"]', '["a.b", "b.c"]'],
      explain: '`substringBefore` stops at the first separator, and `substringAfterLast` starts after the last one.',
    }),
    out({
      head: 'import mergeWith from dw::core::Objects',
      body: '{a: 1, b: 2} mergeWith {b: 9, c: 3}',
      right: '{"a": 1, "b": 9, "c": 3}',
      wrong: ['{"a": 1, "b": 2, "c": 3}', '{"b": 9, "c": 3}', '{"a": 1, "c": 3}'],
      explain: '`mergeWith` overwrites matching keys with the right side and keeps everything else, which `++` does not do.',
    }),
  ],
  answerTemplate: `## How to import a module function

## The module functions you use most

## When a module beats writing your own
`,
  keyPoints: [
    'Module functions need an import in the script header.',
    'divideBy makes batches, and the last one may be shorter.',
    'countBy returns a number.',
    'mergeWith lets the right side win.',
  ],
  solution: `
\`dw::core::Arrays\`, \`Strings\` and \`Objects\` hold tested helpers that you import in the header.

The useful ones are \`divideBy\` for batches, \`countBy\` and \`sumBy\` for totals, \`substringBefore\` and \`substringAfterLast\` for parsing, and \`mergeWith\` for combining objects with the right side winning.

Using these keeps a script shorter and easier to review than a hand-written \`reduce\`.
`,
  followUps: [
    { q: 'Where would you use divideBy in a Mule app?', a: 'To split records into chunks that respect a target API\'s batch limit before calling it.' },
    { q: 'What is the difference between `import x from module` and `import * from module`?', a: 'The first brings in only what you name, which makes it clear where a function comes from. The second brings in everything.' },
  ],
}
