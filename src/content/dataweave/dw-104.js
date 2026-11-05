import { outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-104',
  category: 'dataweave',
  title: 'Read the Output: Functions, Overloads and Scope',
  level: 'ADVANCED',
  tags: ['functions', 'recursion', 'lambdas', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
Senior interviews move past built-in functions to the language itself: default arguments, recursion, overloads, scope and functions passed as values.

Work out each result before you choose.
`,
  quiz: [
    out({
      head: 'fun add(a, b = 10) = a + b',
      body: '[add(1), add(1, 2)]',
      right: '[11, 3]',
      wrong: ['[1, 3]', '[11, 12]', '[null, 3]'],
      explain: 'A default applies only when the argument is left out, so the second call uses the 2 it was given.',
    }),
    out({
      head: 'fun fact(n) = if (n <= 1) 1 else n * fact(n - 1)',
      body: 'fact(4)',
      right: '24',
      wrong: ['10', '4', '6'],
      explain: 'The calls unwind as 4 * 3 * 2 * 1. The check for `n <= 1` is what stops the recursion.',
    }),
    out({
      head: 'fun describe(x: String) = "text"\nfun describe(x: Number) = "number"\nfun describe(x: Any) = "any"',
      body: '[describe(1), describe("a"), describe(true)]',
      right: '["number", "text", "any"]',
      wrong: ['["any", "any", "any"]', '["text", "text", "any"]', '["number", "text", "text"]'],
      explain: 'Functions can share a name when their parameter types differ. DataWeave picks the version that fits the argument.',
    }),
    out({
      head: 'var rate = 2\nfun scale(list) = list map ($ * rate)',
      body: 'do {\n  var rate = 5\n  ---\n  scale([1, 2])\n}',
      right: '[2, 4]',
      wrong: ['[5, 10]', '[1, 2]', '[7, 9]'],
      explain: 'A function uses the variables visible where it was written, not where it is called. So the inner `rate` has no effect on `scale`.',
    }),
    out({
      head: 'var inc = (n) -> n + 1\nfun twice(f, x) = f(f(x))',
      body: 'twice(inc, 1)',
      right: '3',
      wrong: ['2', '4', '1'],
      explain: 'A lambda is a value, so it can be stored in a variable and passed in. `inc` runs twice: 1 to 2, then 2 to 3.',
    }),
  ],
  answerTemplate: `## How arguments and defaults work

## How DataWeave chooses an overload

## What scope a function sees
`,
  keyPoints: [
    'A default argument is used only when the argument is left out.',
    'Recursion needs a stopping case.',
    'Overloads are chosen from the argument type.',
    'Functions see the variables where they were written.',
    'Lambdas are values you can pass around.',
  ],
  solution: `
Functions take default arguments and can be overloaded by parameter type, so one name can handle several shapes of input.

Scope is lexical: a function uses the variables visible where it was defined. A \`do\` block can declare a variable with the same name, and that won't change the function's behaviour.

Lambdas are values. That is what lets you write helpers that take a function, the same way \`map\` and \`filter\` do.
`,
  followUps: [
    { q: 'Why does the order of overloads with a type like Any need care?', a: 'A broad type also fits more specific values, so check on the real engine that specific versions are chosen as you expect.' },
    { q: 'What is the risk with deep recursion, and what helps?', a: 'Very deep recursion can overflow the stack. A tail-recursive function, where the recursive call is the last step, avoids that.' },
  ],
}
