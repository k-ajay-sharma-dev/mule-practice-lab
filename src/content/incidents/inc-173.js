export default {
  id: 'inc-173',
  category: 'incidents',
  title: 'The Connectivity Error Handler Never Fires Inside a Scatter-Gather: Route Errors Arrive as MULE:COMPOSITE_ROUTING',
  level: 'INTERMEDIATE',
  tags: ['scatter-gather', 'error-handling', 'composite-routing'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '2026-09-03 08:15:20 INFO  [customer-360-api] GET /customers/C-2210 received', relevant: false },
      { text: '2026-09-03 08:15:21 ERROR [customer-360-api] Route 1 of Scatter-Gather failed: HTTP:CONNECTIVITY loyalty-sys unreachable', relevant: true, why: 'One route failed with a connectivity error, which the team expected their handler to catch.' },
      { text: '2026-09-03 08:15:21 ERROR [customer-360-api] Error type: MULE:COMPOSITE_ROUTING', relevant: true, why: 'Scatter-Gather raises one composite error that wraps the route errors. That is the type the handlers see.' },
      { text: '2026-09-03 08:15:21 INFO  [customer-360-api] On Error Continue (HTTP:CONNECTIVITY) not matched', relevant: true, why: 'Illustrative line: the handler type does not match MULE:COMPOSITE_ROUTING, so it is skipped.' },
      { text: '2026-09-03 08:15:21 ERROR [customer-360-api] Response 500 sent for GET /customers/C-2210', relevant: true, why: 'With no matching handler the default error handler answers 500, and the profile is lost.' },
      { text: '2026-09-03 08:15:30 INFO  [orders-sys] 128 orders synced', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'The flow has On Error Continue for HTTP:CONNECTIVITY, yet a loyalty outage still gives clients a 500. Why?',
        options: [
          'A failed route makes Scatter-Gather raise MULE:COMPOSITE_ROUTING, which the handler type does not match',
          'On Error Continue never runs for errors raised in a Scatter-Gather',
          'HTTP:CONNECTIVITY errors are always handled by the default handler first',
          'The handler only catches errors raised by the HTTP Listener of the flow',
        ],
        answer: 0,
        explain: 'When any route fails, Scatter-Gather finishes the other routes and then raises MULE:COMPOSITE_ROUTING. The error handler matches on that type, so a handler for HTTP:CONNECTIVITY does not match it.',
      },
      {
        type: 'single',
        prompt: 'The team wants the profile returned with an empty loyalty section when loyalty is down. Which change does that?',
        options: [
          'Wrap the loyalty call inside its route in a Try with On Error Continue that sets a default value',
          'Change the flow handler to catch HTTP:CONNECTIVITY twice',
          'Raise the loyalty call timeout so the route never fails',
          'Move the loyalty call after the Scatter-Gather so it runs alone',
        ],
        answer: 0,
        explain: 'A Try inside the route handles the error there, so the route succeeds with a default value and the Scatter-Gather does not fail. The other parts of the profile are kept.',
      },
      {
        type: 'multi',
        prompt: 'Which two statements about MULE:COMPOSITE_ROUTING are true?',
        options: [
          'Its error message holds the results of the routes that succeeded and the errors of those that failed',
          'The other routes still run to the end before the composite error is raised',
          'It is raised only when every route fails',
          'It replaces the payload with an empty array before the handler runs',
        ],
        answer: [0, 1],
        explain: 'Scatter-Gather waits for all routes. If one or more fail, it raises MULE:COMPOSITE_ROUTING, and its error details list the successful results and the failures. One failed route is enough.',
      },
      {
        type: 'single',
        prompt: 'Where would a handler that catches only this situation at flow level be matched?',
        options: [
          'On Error Continue with type MULE:COMPOSITE_ROUTING',
          'On Error Continue with type MULE:ROUTING_ERROR',
          'On Error Continue with type HTTP:ANY',
          'On Error Propagate with no type, placed after the others',
        ],
        answer: 0,
        explain: 'The flow handler sees the composite type. Catching MULE:COMPOSITE_ROUTING at flow level works, but the whole Scatter-Gather result is then in the error, so a Try inside each route is usually cleaner.',
      },
      {
        type: 'order',
        prompt: 'Order the steps to fix and prove the change.',
        items: [
          'Reproduce with the loyalty system down and read the error type',
          'Decide what each route should return when its system fails',
          'Add a Try with On Error Continue inside each route that may fail',
          'Return the partial profile with a flag for missing parts',
          'Add tests that fail each route in turn',
        ],
        explain: 'Read the real error type first, then decide the fallback per route, add it inside the routes, and test each failure on its own.',
      },
    ],
  },
  description: `
## Symptoms
- A bank's \`customer-360-api\` builds a customer profile from three systems at once with **Scatter-Gather**: core banking, cards and loyalty.
- When the loyalty system is down, every profile request returns **500**, even though core banking and cards answer.
- The flow has an **On Error Continue** for \`HTTP:CONNECTIVITY\` that should return a profile without loyalty. It never runs.

## Change / Context
- The error handler was added after a loyalty outage last month and was tested only with a single HTTP Request, not inside the Scatter-Gather.
- The logs show the type \`MULE:COMPOSITE_ROUTING\` on the failed requests.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-09-03 08:15:21 ERROR [customer-360-api] Route 1 of Scatter-Gather failed: HTTP:CONNECTIVITY loyalty-sys unreachable
2026-09-03 08:15:21 ERROR [customer-360-api] Error type: MULE:COMPOSITE_ROUTING
2026-09-03 08:15:21 ERROR [customer-360-api] Response 500 sent for GET /customers/C-2210
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Scatter-Gather runs every route to the end, then raises MULE:COMPOSITE_ROUTING if any route failed.',
    'Error handlers match the composite type, not the route error inside it.',
    'A handler for HTTP:CONNECTIVITY at flow level does not match a composite routing error.',
    'A Try with On Error Continue inside a route handles the failure there, so the route succeeds.',
    'The composite error holds both the successful results and the failures.',
    'Decide per route what a missing system should look like in the answer.',
    'Test error handling where the call really sits, not on a call in isolation.',
  ],
  solution: `
**Diagnosis.** The loyalty route fails with \`HTTP:CONNECTIVITY\`. Scatter-Gather lets the other routes finish, then raises **\`MULE:COMPOSITE_ROUTING\`**. The flow's handler is typed \`HTTP:CONNECTIVITY\`, so it does not match, and the default handler returns 500.

**Immediate mitigation.**
- Add a Try with On Error Continue around the loyalty call inside its route, returning an empty loyalty section. Deploy it, and the profiles come back while loyalty is down.

**Root cause.** The handler was written for the error of a single call. Inside a Scatter-Gather, route errors are wrapped in one composite error with its own type.

**Permanent fix.**
- Give every route that may fail its own Try with a fallback value.
- Mark the answer so clients know a part is missing, for example \`"loyalty": null\` and a list of missing parts.
- Keep a flow level handler for \`MULE:COMPOSITE_ROUTING\` as a safety net, for routes that still fail.

**Prevention.** Test error handling in the real flow, with each backend failed in turn. Add this case to the team's review notes for Scatter-Gather.
`,
  followUps: [
    {
      q: 'Does Scatter-Gather stop the other routes when one fails?',
      a: 'No. It waits for all routes, then raises MULE:COMPOSITE_ROUTING if any failed.',
    },
    {
      q: 'How do you read which route failed in a flow level handler?',
      a: 'The composite error carries the results and the failures of the routes, so the handler can read which ones failed and what succeeded.',
    },
    {
      q: 'Would a timeout on the Scatter-Gather change this?',
      a: 'A route that runs past the timeout fails too, and the same composite error is raised. A Try inside the route still decides what to return.',
    },
    {
      q: 'When is a 500 the right answer here?',
      a: 'When the missing part is essential, such as core banking for an account view. Then fail clearly instead of returning a partial profile.',
    },
  ],
}
