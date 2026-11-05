import { FAILS, outputQuestion as out } from '../../quiz/output-question.js'

export default {
  id: 'dw-108',
  category: 'dataweave',
  title: 'Read the Output: What Gets Evaluated, try and then',
  level: 'EXPERT',
  tags: ['evaluation', 'try', 'dw::Runtime', 'read-the-output'],
  estMinutes: 12,
  exercise: 'quiz',
  description: `
Expert questions look at how the engine runs a script: which expressions actually run, and how a failure can be caught.

\`fail\` from \`dw::Runtime\` stops the script with a message, so it shows exactly when an expression runs. Work out each result before you choose.
`,
  quiz: [
    out({
      head: 'import fail from dw::Runtime\nfun boom() = fail("stop")',
      body: '{ ok: true }',
      right: '{"ok": true}',
      wrong: [FAILS, 'null', '{"ok": true, "boom": null}'],
      explain: 'A function body runs only when the function is called. Nothing calls `boom`, so `fail` never runs.',
    }),
    out({
      head: 'import fail from dw::Runtime\nvar boom = fail("stop")',
      body: '{ ok: true }',
      right: FAILS,
      wrong: ['{"ok": true}', 'null', '{"ok": true, "boom": null}'],
      error: 'stop',
      explain: 'Unlike a function, this variable is evaluated even though nothing reads it, so `fail` stops the script. Do not count on an unused variable being skipped.',
    }),
    out({
      head: 'import fail from dw::Runtime',
      body: 'if (true) 1 else fail("stop")',
      right: '1',
      wrong: [FAILS, 'null', 'true'],
      explain: 'Only the chosen branch of an `if` runs. The same goes for the right side of `or` when the left is true, and of `and` when the left is false.',
    }),
    out({
      head: 'import try from dw::Runtime',
      body: 'try(() -> "x" as Number).success',
      right: 'false',
      wrong: ['true', 'null', FAILS],
      explain: '`try` takes a function and returns an object describing the result, so the script keeps running. `success` tells you what happened.',
    }),
    out({
      head: 'import try, orElse from dw::Runtime',
      body: 'try(() -> "x" as Number) orElse -1',
      right: '-1',
      wrong: ['null', '"x"', FAILS],
      explain: '`orElse` takes the result of `try` and gives the fallback when it failed. It gives the real value when it succeeded.',
    }),
    out({
      body: '[1, 2, 3] filter ($ > 1) then sizeOf($)',
      right: '2',
      wrong: ['[2, 3]', '3', '[1, 1]'],
      explain: '`then` passes the whole previous result on as `$`, so `sizeOf` gets the filtered array. It is not applied per item.',
    }),
  ],
  answerTemplate: `## What runs and what doesn't

## How to catch a failure

## What then does
`,
  keyPoints: [
    'A function body runs only when it is called.',
    'A variable can fail the script even when nothing reads it.',
    'Only the chosen branch of an if runs.',
    'try takes a function and returns a result object.',
    'orElse supplies a fallback for a failed try.',
    'then passes the whole result to the next step.',
  ],
  solution: `
Wrap risky work in a function if it should only run on some paths. A function body waits until it is called, but a \`var\` can fail the script even when nothing reads it. The branch of an \`if\` that isn't chosen doesn't run either.

\`try\` from \`dw::Runtime\` runs a function and returns an object with \`success\` and either \`result\` or \`error\`, and \`orElse\` is the short form for a fallback.

\`then\` passes one whole result to the next expression, which keeps a chain readable without a variable.

These results come from the engine this site runs on. If evaluation order matters in production, test it on your own Mule runtime version.
`,
  followUps: [
    { q: 'Why does it matter that an if only runs one branch?', a: 'A broken expression in the other branch stays hidden until data reaches it, so tests must cover each branch.' },
    { q: 'When should you use try rather than letting the script fail?', a: 'When one bad record should be reported and the rest should continue. If the whole message is unusable, let it fail and use the flow\'s error handling.' },
  ],
}
