import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-002',
  category: 'flows',
  title: 'For Each vs Parallel For Each for Order Lines',
  level: 'INTERMEDIATE',
  tags: ['for-each', 'parallel-for-each', 'performance'],
  estMinutes: 15,
  flowChecks: [
    { label: 'The Quote API is exposed through an HTTP Listener', rule: { type: 'source', component: 'http-listener' } },
    { label: 'Order lines are priced concurrently with a Parallel For Each', rule: { type: 'exists', component: 'parallel-foreach' } },
    {
      label: 'Concurrency is raised toward, but not above, the Pricing API limit of 20',
      rule: { type: 'exists', component: 'parallel-foreach', where: { maxConcurrency: { gte: 10, lte: 20 } } },
    },
    {
      label: 'Each parallel route has a timeout, so one hung call cannot hold the quote open',
      rule: { type: 'exists', component: 'parallel-foreach', where: { timeout: { gte: 1 } } },
    },
    { label: 'The Pricing API call runs inside the loop', rule: { type: 'inside', component: 'http-request', within: 'parallel-foreach' } },
    {
      label: 'A failing Pricing call is handled per line (Try + On Error Continue) for a partial quote',
      rule: { type: 'handler', component: 'on-error-continue', within: 'try' },
    },
    {
      label: 'Results are flattened and the total calculated in DataWeave after the loop',
      rule: { type: 'before', first: 'parallel-foreach', then: 'transform' },
    },
  ],
  referenceFlow: design(
    flow('quote-api', source('http-listener', { path: '/quotes', allowedMethods: 'POST' }), [
      scope('parallel-foreach', { collection: '#[payload.lines]', maxConcurrency: 20, timeout: 3000 }, [
        step('set-variable', { variableName: 'line', value: '#[payload]' }),
        scope('try', {}, [
          step('http-request', { method: 'GET', path: '/prices/{sku}', responseTimeout: 2000 }),
          step('transform', {
            script: '%dw 2.0\noutput application/java\n---\nvars.line ++ { price: payload.price }',
          }),
        ], {
          errorHandlers: [
            handler('on-error-continue', { type: 'HTTP:CONNECTIVITY, HTTP:TIMEOUT, HTTP:NOT_FOUND' }, [
              step('set-payload', { value: '#[vars.line ++ { price: null, error: "PRICE_UNAVAILABLE" }]' }),
            ]),
          ],
        }),
      ]),
      step('transform', {
        script:
          '%dw 2.0\noutput application/json\nvar lines = payload map $.payload\n---\n{ lines: lines, total: sum(lines filter ($.price != null) map ($.price * $.quantity)) }',
      }),
    ], [
      handler('on-error-propagate', { type: 'MULE:COMPOSITE_ROUTING' }, [
        step('logger', { level: 'ERROR', message: '#[error.description]' }),
      ]),
    ]),
  ),
  description: `
A **Quote API** receives an order with up to **300 lines**. It must return the quote with the price on every line.

**Facts**
- For each line, the API calls the **Pricing API**: \`GET /prices/{sku}\`.
- Each call takes ~400 ms.
- The Pricing API allows 20 concurrent requests.
- The lines must stay **in the original line order**.
- Target response time: **under 10 seconds**.

**What is wrong now**

The current implementation uses a **For Each** and sets \`vars.total\` inside the loop. The developer is surprised that:
- the call takes ~2 minutes for 300 lines, and
- after the loop the \`payload\` is the original order again, not the priced lines.

**Design the flow:**
- For Each or Parallel For Each: which one, and why? Show the numbers.
- How do you collect the results, keep the order, and calculate the total?
- What happens when one Pricing call fails in each option?
`,
  answerTemplate: `## Choice and reasoning

## Collecting results and total

## Error behaviour
`,
  keyPoints: [
    'For Each is sequential: 300 × 400 ms ≈ 120 s, far over the 10 s target.',
    'Parallel For Each with maxConcurrency ≈ 20 (respecting the Pricing API limit): ~15 rounds × 400 ms ≈ 6 s.',
    'For Each restores the original payload after the loop; results must be collected in a variable. Parallel For Each outputs a collection of the route results in input order.',
    'Variables set inside Parallel For Each are not visible after it — compute the total afterwards with DataWeave over the collected results.',
    'Parallel For Each aggregates errors into MULE:COMPOSITE_ROUTING after all routes finish; For Each stops at the first error unless the body has a Try/On Error Continue.',
  ],
  solution: `
**Choice:** **Parallel For Each** with \`maxConcurrency="20"\` (the Pricing API's limit) and a \`timeout\`. The \`timeout\` applies to each route, not to the whole scope, so size it for one Pricing call.
- For Each: 300 × 0.4 s ≈ **120 s**.
- Parallel For Each: 300 / 20 = 15 waves × 0.4 s ≈ **6 s** (+ overhead) — within 10 s.
Parallel For Each holds all results in memory, which is fine for 300 small price objects.

**Flow**
1. HTTP Listener → \`collection="#[payload.lines]"\` on Parallel For Each.
2. Inside: HTTP Request \`GET /prices/{sku}\` with \`uriParams\` from \`payload.sku\`, then a Transform that merges the line and price.
3. After the scope, the payload is an **array of messages in input order**; map it: \`payload map $.payload\`.
4. Total in DataWeave afterwards: \`sum(lines map ($.price * $.quantity))\` — not via \`vars.total\` inside the loop, because variable changes inside Parallel For Each routes are not propagated out.

(For Each would need \`vars.priced\` appended on each iteration, since For Each always restores the original payload when it finishes; variables set inside it *are* visible afterwards.)

**Errors**
- **For Each:** the first failing call stops the loop and goes to the flow's error handler (unless wrapped in Try + On Error Continue).
- **Parallel For Each:** all routes run; if any fail, \`MULE:COMPOSITE_ROUTING\` is raised with successful and failed results in the error. To return a partial quote, wrap the call in a Try with On Error Continue that returns \`{ sku, price: null, error: "PRICE_UNAVAILABLE" }\`.
`,
}
