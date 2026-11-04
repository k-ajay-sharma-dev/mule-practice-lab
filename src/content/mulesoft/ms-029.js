export default {
  id: 'ms-029',
  category: 'mulesoft',
  title: 'Flow vs Sub-flow vs Private Flow and the Flow Reference',
  level: 'BEGINNER',
  tags: ['flows', 'sub-flow', 'flow-reference', 'reuse'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A sub-flow called with Flow Reference raises \`HTTP:CONNECTIVITY\`. Which error handler deals with it?',
      options: [
        "The sub-flow's own error handler",
        'The error handler of the flow (or Try scope) that called the sub-flow',
        "The application's default error handler, always",
        'None — sub-flow errors are swallowed',
      ],
      answer: 1,
      explain: 'A sub-flow has **no error handler** of its own. It behaves as if its processors were inline in the caller, so the calling flow or the enclosing Try scope handles the error.',
    },
    {
      type: 'match',
      prompt: 'Match each piece of the Invoice API to the best construct.',
      pairs: [
        ['validate-invoice — 6 reusable validation steps', 'Sub-flow'],
        ['enrich-customer — needs its own fallback when the CRM is down', 'Private flow with an error handler'],
        ['Entry point for POST /invoices', 'Flow with an HTTP Listener'],
      ],
      explain: 'Use a sub-flow for plain reusable steps, a private flow when the reused logic needs its **own** error handling, and a flow with a source for an entry point.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Flow Reference are true?',
      options: [
        'It passes the whole event: payload, attributes and variables',
        'Changes the target makes to payload and vars are visible to the caller afterwards',
        'It sends only a copy of the payload, like an Async scope',
        'The flow name can be a DataWeave expression',
      ],
      answer: [0, 1, 3],
      explain: 'Flow Reference is synchronous for the caller and shares the same event, so changes come back. Dynamic names (\`#[...]\`) work, but Studio cannot validate them. It is the **Async** scope that works on a copy.',
    },
    {
      type: 'single',
      prompt: 'A teammate says "make everything a sub-flow — they are faster". What is the best reply?',
      options: [
        'Agreed, sub-flows avoid thread switches so they are always the right choice',
        'The performance difference is negligible; choose by error handling and configuration needs',
        'Sub-flows are slower because they create a new event',
        'Sub-flows cannot be reused across flows, so they are a bad choice',
      ],
      answer: 1,
      explain: 'Speed is not a meaningful reason. Pick a sub-flow when the caller should handle errors, and a private flow when the logic needs its own error handler or flow-level settings.',
    },
    {
      type: 'single',
      prompt: '\`enrich-customer\` is a private flow with **On Error Continue** that sets a default customer. The CRM is down. What does the calling flow see?',
      options: [
        'An error, so its own error handler runs',
        'A successful Flow Reference that returns the default customer, and processing continues',
        'The flow stops silently with an empty payload',
        'A MULE:UNKNOWN error',
      ],
      answer: 1,
      explain: 'On Error Continue completes the private flow successfully with whatever the handler produced, so the caller just carries on — its error handler never runs.',
    },
  ],
  description: `
An **Invoice Process API** has grown to a single 400-line flow. You are asked to split it:

- \`validate-invoice\` — 6 validation steps, reused by 3 APIs in the same app.
- \`enrich-customer\` — calls the CRM and must have **its own** error handling (return a default customer if CRM is down).
- \`post-to-erp\` — must be callable from an HTTP flow **and** from a Scheduler-driven retry flow.

A teammate proposes: "Make everything a sub-flow — they are faster."

**Questions**
1. What are the structural differences between a flow, a private flow (flow without a source) and a sub-flow?
2. Which type would you choose for each of the three pieces, and why?
3. How does the Flow Reference pass data, and does it change threads?
4. Can a flow name in a Flow Reference be dynamic? What are the trade-offs?
`,
  answerTemplate: `## Flow vs private flow vs sub-flow

## Choice for each piece

## Flow Reference behaviour

## Dynamic flow references
`,
  keyPoints: [
    'A flow can have a source, its own error handler and settings such as maxConcurrency; a private flow is a flow without a source.',
    'A sub-flow has no source and no error handler; errors inside it are handled by the caller (flow or Try scope).',
    'Flow Reference passes the whole event (payload, attributes, vars) synchronously and returns the resulting event to the caller.',
    'Use a sub-flow for simple reusable steps, a private flow when the reused logic needs its own error handling.',
    'Flow Reference names can be expressions, but static references are easier to read, validate and test.',
  ],
  solution: `
**Structural differences**
| | Flow | Private flow | Sub-flow |
|---|---|---|---|
| Event source | Yes | No | No |
| Own error handler | Yes | Yes | **No** |
| maxConcurrency / flow-level settings | Yes | Yes | No |
| Called via | Its source, or Flow Reference | Flow Reference | Flow Reference |

A sub-flow behaves as if its processors were pasted inline into the caller — errors are handled by whatever scope called it.

**Choices**
- \`validate-invoice\` → **sub-flow**. Pure reusable steps; any validation error should surface to the caller's error handler anyway.
- \`enrich-customer\` → **private flow** with an error handler: \`On Error Continue type="HTTP:CONNECTIVITY, HTTP:TIMEOUT"\` sets a default customer. (A sub-flow wrapping a Try scope would also work.)
- \`post-to-erp\` → **private flow** (or sub-flow) referenced from both the HTTP flow and the Scheduler flow — a flow with a source cannot be "called" through its source by another flow, so keep the reusable logic sourceless.

"Sub-flows are faster" is not a meaningful design argument; the difference is negligible. Choose based on error handling and configuration needs.

**Flow Reference:** passes the **same event** — payload, attributes and vars — and the target's resulting event comes back to the caller, so changes to payload and vars are visible afterwards. It is synchronous from the caller's perspective; the runtime may run the work on different threads depending on the processors, but you do not manage that.

**Dynamic names**: \`<flow-ref name="#['process-' ++ vars.invoiceType]"/>\` works and replaces a long Choice. Downsides: Studio cannot validate the target, typos appear only at runtime, and coverage/navigation tooling is weaker. Prefer static references unless the variants are numerous and stable.
`,
  followUps: [
    {
      q: 'If a private flow uses On Error Continue, what does the caller see?',
      a: 'The caller sees a successful Flow Reference and continues with the event produced by the error handler (e.g. the default payload). The caller\'s error handler does not run.',
    },
    {
      q: 'Can a sub-flow be called from an Async scope?',
      a: 'Yes. Async takes a copy of the event, so changes made inside it (including in a referenced sub-flow) are not visible to the main flow.',
    },
    {
      q: 'What is the DataWeave lookup() function?',
      a: 'lookup("flowName", payload) calls a flow (not a sub-flow) from DataWeave and returns its payload. It is handy occasionally, but it hides the call from the visual flow, so use it sparingly.',
    },
  ],
}
