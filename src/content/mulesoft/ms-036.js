export default {
  id: 'ms-036',
  category: 'mulesoft',
  title: 'Scatter-Gather, Parallel For Each and For Each',
  level: 'INTERMEDIATE',
  tags: ['scatter-gather', 'parallel-for-each', 'for-each', 'routers'],
  estMinutes: 20,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each part of the Customer 360 API to the best construct.',
      pairs: [
        ['CRM, Billing and Loyalty calls — three different sources', 'Scatter-Gather'],
        ['Fetch details for each of N orders', 'Parallel For Each with maxConcurrency'],
        ['Loop where each step depends on the previous one and vars must persist', 'For Each'],
      ],
      explain: 'Scatter-Gather runs a fixed set of **different** routes in parallel; Parallel For Each runs the **same** steps for each element; For Each is sequential and keeps variable changes.',
    },
    {
      type: 'single',
      prompt: 'Which DataWeave expression reads the Billing result (route 2 of 3) after Scatter-Gather?',
      options: ['`payload[1]`', '`payload."1".payload`', '`payload.billing`', '`vars.route1`'],
      answer: 1,
      explain: 'Scatter-Gather returns an object keyed by route index ("0", "1", ...), and each value is a message with `payload` and `attributes`.',
    },
    {
      type: 'single',
      prompt: 'The Loyalty route fails and nothing special is configured. What happens?',
      options: [
        'Scatter-Gather returns the other two results and `loyalty` is null',
        'Scatter-Gather waits for all routes, then raises MULE:COMPOSITE_ROUTING',
        'Scatter-Gather cancels the other routes immediately and raises HTTP:CONNECTIVITY',
        'The Loyalty route is retried automatically',
      ],
      answer: 1,
      explain: 'By default any route failure makes the whole router fail with COMPOSITE_ROUTING. For an optional source, wrap that route in a Try with On Error Continue that sets a null payload.',
    },
    {
      type: 'single',
      prompt: 'Why set `maxConcurrency` on the Parallel For Each over 50 orders?',
      options: [
        'Without it the orders are processed sequentially',
        'To avoid 50 simultaneous calls that can exhaust the HTTP connection pool or overload the Order API',
        'It is required for the output to keep the input order',
        'It sets the timeout per order',
      ],
      answer: 1,
      explain: 'Unbounded parallelism protects nobody. Latency for the order part then is roughly ceil(N / concurrency) × 150 ms.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about **For Each** (not Parallel For Each) are true?',
      options: [
        'It restores the original payload after the loop',
        'Variables set inside are visible after the loop',
        'It supports `maxConcurrency`',
        'It stops at the first failure',
        'Its output is a list of result messages',
      ],
      answer: [0, 1, 3],
      explain: 'For Each is sequential, has no `maxConcurrency`, and gives back the original payload — collect results in a variable. Parallel For Each is the one that outputs a list of messages.',
    },
    {
      type: 'single',
      prompt: 'Inside Parallel For Each you set `vars.total`. What does the flow see after the router?',
      options: [
        'The value from the last element',
        'The sum of all elements',
        'The change is not propagated back — return data via the payload',
        'A list of all values',
      ],
      answer: 2,
      explain: 'Variables set inside Parallel For Each are not propagated back; return what you need through the payload, e.g. `payload map $.payload`.',
    },
  ],
  description: `
A **Customer 360 Experience API** must return in under 1.5 s. For one customer it needs:

| Source | Avg latency |
|---|---|
| CRM System API | 400 ms |
| Billing System API | 600 ms |
| Loyalty System API | 300 ms (often down) |

It must also fetch details for each of the customer's **N orders** (N up to 50) from the Order System API, 150 ms each.

The first version runs everything sequentially and takes 1.3 s + N × 150 ms. A teammate swapped the order loop to **For Each** "with maxConcurrency" — which does not exist there.

**Questions**
1. Which router fits the three different sources and which fits the N order calls?
2. What does the payload look like after Scatter-Gather and after Parallel For Each? Write the DataWeave to merge the Scatter-Gather result.
3. What happens when the Loyalty route fails? How do you return a partial response?
4. Why limit \`maxConcurrency\`, and what does \`timeout\` do?
5. How do For Each and Parallel For Each differ in payload and variable behaviour?
`,
  answerTemplate: `## Choosing the router

## Output shape and merge

## Partial failure

## maxConcurrency and timeout

## For Each vs Parallel For Each
`,
  keyPoints: [
    'Scatter-Gather sends a copy of the event to a fixed set of different routes in parallel; Parallel For Each runs the same steps for each element of a collection in parallel.',
    'Scatter-Gather output is an object keyed by route index ("0", "1", ...) whose values are messages with payload and attributes.',
    'Parallel For Each output is a list of messages in the original order; map $.payload to get the results.',
    'If any route fails, MULE:COMPOSITE_ROUTING is raised; wrap risky routes in a Try with On Error Continue to allow partial results.',
    'For Each is sequential, restores the original payload after the loop, and keeps variable changes; use maxConcurrency on parallel routers to protect downstream systems.',
  ],
  solution: `
**Choice:** three *different* calls → **Scatter-Gather**. Same call per order → **Parallel For Each** with \`maxConcurrency\`. Latency becomes roughly max(400, 600, 300) + ceil(N / concurrency) × 150 ms.

**Output shapes**
- Scatter-Gather: \`{ "0": Message, "1": Message, "2": Message }\` — each value has \`payload\` and \`attributes\`.
- Parallel For Each: \`[ Message, Message, ... ]\` in the input order.

\`\`\`dataweave
%dw 2.0
output application/json
---
{
  profile: payload."0".payload,
  billing: payload."1".payload,
  loyalty: payload."2".payload default null
}
\`\`\`
For orders: \`payload map $.payload\`.

**Partial failure:** by default, if any route fails Scatter-Gather waits for all routes, then raises \`MULE:COMPOSITE_ROUTING\` (with the successful results and the failures available in the error). For an optional source, make the route itself resilient:
\`\`\`xml
<route>
  <try>
    <http:request config-ref="loyaltyApi" path="/loyalty/{id}"/>
    <error-handler>
      <on-error-continue type="ANY">
        <set-payload value="#[null]"/>
      </on-error-continue>
    </error-handler>
  </try>
</route>
\`\`\`
Then the router succeeds and \`loyalty\` is null. Required routes (CRM) should still fail the whole request.

**maxConcurrency and timeout:** without a limit, 50 orders means 50 simultaneous calls — which can exhaust the HTTP connection pool or overload the Order API (and its rate limits). \`maxConcurrency\` caps parallel routes. \`timeout\` bounds how long the router waits; routes still running are treated as failed.

**For Each vs Parallel For Each**
| | For Each | Parallel For Each |
|---|---|---|
| Execution | Sequential | Parallel (bounded by maxConcurrency) |
| Payload after | **Original payload restored** | List of result messages |
| Vars set inside | Visible after the loop | Not propagated back — return data via payload |
| Batch size | \`batchSize\` groups elements | n/a |
| Error | Stops at first failure | Collects into COMPOSITE_ROUTING |
`,
  followUps: [
    {
      q: 'Can you use Scatter-Gather inside a transaction?',
      a: 'Yes, but it does not run in parallel: inside a transaction the routes run one after another, because a transaction is bound to one thread. Parallel For Each likewise behaves like For Each. Error handling is unchanged.',
    },
    {
      q: 'How would you collect results inside a For Each?',
      a: 'Append to a variable on each iteration (e.g. vars.results ++ [payload]) because the payload is restored after the loop; for large collections prefer a transform or Parallel For Each to avoid repeated array copies.',
    },
    {
      q: 'When would you choose Batch instead of Parallel For Each?',
      a: 'For large data sets (thousands to millions of records) where you need persistence of progress, per-record error handling and aggregation — Parallel For Each keeps everything in memory for one event.',
    },
  ],
}
