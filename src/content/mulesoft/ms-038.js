export default {
  id: 'ms-038',
  category: 'mulesoft',
  title: 'Who Handles the Error? Propagation Across Flow References, Sub-flows and Try',
  level: 'ADVANCED',
  tags: ['error-handling', 'flow-reference', 'sub-flow', 'try-scope'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'The `validate` **sub-flow** raises `APP:INVALID`. Which handler runs and what does the client get?',
      options: [
        '`globalHandler`, then 500',
        '`main`\'s On Error Propagate `APP:INVALID` → 400',
        'The sub-flow\'s default handler, then 400',
        'Nothing — sub-flow errors are ignored, 200',
      ],
      answer: 1,
      explain: 'A sub-flow has no handler; its processors behave as if inlined, so the error lands directly in `main`. The global default handler does not apply to sub-flows.',
    },
    {
      type: 'order',
      prompt: 'The HTTP request in `enrich` **times out**. Put what happens in order.',
      items: [
        '`enrich` On Error Propagate `HTTP:TIMEOUT` logs "enrich timeout"',
        'The error is re-thrown at the Flow Reference in `main`',
        '`main` On Error Propagate `ANY` sets httpStatus 500',
        'The client receives 500',
      ],
      explain: 'Propagate means "I handled it, but my caller must still see the error" — so two handlers run, the called flow\'s first.',
    },
    {
      type: 'single',
      prompt: 'The HTTP request in `enrich` returns **404**. What does the client receive?',
      options: [
        '404',
        '500 from `main`\'s ANY handler',
        'A normal success response — `enrich` On Error Continue sets the default customer and `main` continues',
        '400',
      ],
      answer: 2,
      explain: 'On Error Continue ends the error: the Flow Reference returns successfully with the handler\'s result.',
    },
    {
      type: 'match',
      prompt: 'Match each failure to the outcome. (`persist` has no handler of its own.)',
      pairs: [
        ['DB:CONNECTIVITY in `persist`', 'globalHandler propagates → Try On Error Continue → main continues'],
        ['DB:QUERY_EXECUTION in `persist`', 'globalHandler propagates → no Try match → main ANY → 500'],
        ['HTTP:NOT_FOUND in `enrich`', 'enrich On Error Continue → main continues with the default customer'],
      ],
      explain: 'Every flow has a handler — the default applies when none is declared, and it propagates. The Try then matches (or not) at the flow-ref position.',
    },
    {
      type: 'single',
      prompt: 'The HTTP request in the async `notify` flow fails. What does the client receive?',
      options: [
        '500, because `main`\'s ANY handler catches it',
        'Nothing changes — Async runs on a copy of the event and its errors never reach `main`; only notify\'s default handler runs',
        '202, because async errors downgrade the status',
        'The request hangs until notify finishes',
      ],
      answer: 1,
      explain: 'Async errors are invisible to the caller. If the notification matters, log/alert or use a reliable queue.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about `defaultErrorHandler-ref="globalHandler"` are true?',
      options: [
        'It replaces the built-in default for every flow that declares no handler of its own',
        'It does not override handlers declared in a flow',
        'It applies to sub-flows',
        'It can point at any flow, not only at a global error handler',
      ],
      answer: [0, 1],
      explain: 'It is the fallback for flows with no handler of their own, and it must reference a global error handler. Sub-flows never have a handler.',
    },
  ],
  description: `
Consider this application (pseudo-XML):

\`\`\`xml
<configuration defaultErrorHandler-ref="globalHandler"/>   <!-- globalHandler logs and propagates -->

<flow name="main">                       <!-- HTTP Listener -->
  <flow-ref name="validate"/>            <!-- sub-flow -->
  <flow-ref name="enrich"/>              <!-- private flow -->
  <try>
    <flow-ref name="persist"/>           <!-- private flow -->
    <error-handler>
      <on-error-continue type="DB:CONNECTIVITY"> ... </on-error-continue>
    </error-handler>
  </try>
  <async><flow-ref name="notify"/></async>
  <error-handler>
    <on-error-propagate type="APP:INVALID"> set vars.httpStatus = 400 </on-error-propagate>
    <on-error-propagate type="ANY">         set vars.httpStatus = 500 </on-error-propagate>
  </error-handler>
</flow>

<sub-flow name="validate"> raise APP:INVALID if bad </sub-flow>

<flow name="enrich">
  <http:request .../>
  <error-handler>
    <on-error-propagate type="HTTP:TIMEOUT"> log "enrich timeout" </on-error-propagate>
    <on-error-continue type="HTTP:NOT_FOUND"> set payload = default customer </on-error-continue>
  </error-handler>
</flow>

<flow name="persist"> <db:insert .../> </flow>   <!-- no handler -->
<flow name="notify"> <http:request .../> </flow> <!-- no handler -->
\`\`\`

**Questions**
For each failure, state **which handlers run, in what order**, and **what the client receives**:

1. \`validate\` raises \`APP:INVALID\`.
2. The HTTP request in \`enrich\` times out.
3. The HTTP request in \`enrich\` returns 404.
4. The DB insert in \`persist\` fails with \`DB:CONNECTIVITY\`.
5. The DB insert fails with \`DB:QUERY_EXECUTION\`.
6. The HTTP request in \`notify\` fails.
7. What role does \`globalHandler\` play here?
`,
  answerTemplate: `## 1. APP:INVALID in the sub-flow

## 2. Timeout in enrich

## 3. 404 in enrich

## 4. DB:CONNECTIVITY in persist

## 5. DB:QUERY_EXECUTION in persist

## 6. Failure in async notify

## 7. Role of the default handler
`,
  keyPoints: [
    'A sub-flow has no handler: its errors go straight to the enclosing scope (the caller\'s Try or flow handler).',
    'A flow called via Flow Reference handles the error first; On Error Propagate re-throws it at the Flow Reference, so the caller\'s handler runs next.',
    'On Error Continue in the called flow ends the error: the caller continues after the Flow Reference with the handler\'s result.',
    'A flow with no handler uses the default error handler (the global one if configured via defaultErrorHandler-ref, otherwise the built-in one), which propagates here; an error that no On-Error in a declared handler matches is re-thrown.',
    'Errors inside Async never reach the caller; the client response is unaffected.',
  ],
  solution: `
| # | Handlers that run (in order) | Client receives |
|---|---|---|
| 1 | \`main\` → On Error Propagate \`APP:INVALID\` | **400** via error-response builder |
| 2 | \`enrich\` On Error Propagate \`HTTP:TIMEOUT\` (logs) → re-thrown at the flow-ref → \`main\` On Error Propagate \`ANY\` | **500** |
| 3 | \`enrich\` On Error Continue \`HTTP:NOT_FOUND\` → \`main\` continues with default customer | normal success response |
| 4 | \`persist\` has no handler → its **default handler** (\`globalHandler\`) runs and propagates → Try's On Error Continue \`DB:CONNECTIVITY\` → \`main\` continues after the Try | success (unless later steps fail) |
| 5 | \`persist\` default handler propagates → Try has no match → propagates → \`main\` On Error Propagate \`ANY\` | **500** |
| 6 | \`notify\` default handler (\`globalHandler\`) only | unaffected — response already decided by \`main\` |

**Why**
- **Sub-flow (1):** processors behave as if inlined, so the error lands directly in \`main\`'s handler.
- **Flow with handler (2, 3):** the called flow's handler runs first. *Propagate* means "I handled it (e.g. logged) but my caller must still see the error" — so two handlers run. *Continue* means "the error ends here" and the Flow Reference returns successfully.
- **Flow without handler (4, 5):** every flow has an error handler — if none is declared, the default applies. It propagates, so the error reaches the Try at the flow-ref position. Try's handler matching works like a flow's.
- **Async (6):** runs on another thread with a copy of the event after the main flow moves on; its errors never reach \`main\`. Log/alert them or use a reliable queue if the notification matters.

**7 — globalHandler:** \`<configuration defaultErrorHandler-ref="globalHandler"/>\` replaces the built-in default for every flow that declares **no** handler of its own (\`persist\`, \`notify\`). It does not override handlers declared in a flow, and it does not apply to sub-flows (they never have a handler). If a flow declares a handler but none of its strategies matches the error, the error is not caught there and propagates to the caller — as in case 5 for the Try. Keep the global handler simple (log + propagate) so you don't accidentally swallow errors from flows that are expected to fail upward.
`,
  followUps: [
    {
      q: 'What happens if an error occurs inside an error handler?',
      a: 'The new error propagates out of the handler to the next level (caller or source). It is not handled by the same handler again, so keep handler logic simple and wrap risky steps in a Try.',
    },
    {
      q: 'Does On Error Continue inside a Try commit or roll back a transaction started by that Try?',
      a: 'On Error Continue treats the scope as successful, so the transaction commits; On Error Propagate rolls it back.',
    },
    {
      q: 'Why do some teams avoid On Error Continue inside reusable private flows?',
      a: 'It hides failures from callers, who may then continue with incomplete data. Reusable flows usually log/enrich and propagate, leaving the decision to the caller.',
    },
  ],
}
