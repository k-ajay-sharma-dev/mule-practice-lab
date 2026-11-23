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
    {
      label: 'The Pricing API call (GET /prices) runs inside the parallel loop',
      rule: { type: 'inside', component: 'http-request', where: { method: 'GET', path: 'prices' }, within: 'parallel-foreach' },
    },
    {
      label: 'No Pricing call runs in a sequential For Each',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'http-request' },
          { type: 'absent', component: 'http-request', within: 'foreach' },
        ],
      },
    },
    {
      label: 'A failing Pricing call is handled per line (Try + On Error Continue) for a partial quote',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', within: 'try' },
          { type: 'inside', component: 'on-error-continue', within: 'parallel-foreach' },
        ],
      },
    },
    {
      label: 'The total is not kept in a variable inside the loop, where it is lost',
      rule: {
        type: 'all',
        rules: [
          { type: 'exists', component: 'parallel-foreach' },
          { type: 'absent', component: 'set-variable', where: { variableName: 'total' }, within: ['parallel-foreach', 'foreach'] },
        ],
      },
    },
    {
      label: 'Results are flattened and the total calculated in DataWeave after the loop',
      rule: { type: 'before', first: 'parallel-foreach', then: 'transform', outside: true },
    },
  ],
  simulation: {
    systems: {
      http: [
        {
          method: 'GET',
          path: '/prices/{sku}',
          latencyMs: 400,
          respond: (req) => {
            const prices = { 'TENT-2P': 120, 'MAT-FOAM': 15, 'STOVE-GAS': 45 }
            const sku = req.params.sku
            return sku in prices ? { status: 200, body: { sku, price: prices[sku], currency: 'EUR' } } : { status: 200, body: { sku, price: 10, currency: 'EUR' } }
          },
        },
      ],
    },
    tests: [
      {
        name: 'Every line gets a price',
        about: 'Three lines are priced and the total is quantity times price over all lines.',
        trigger: {
          http: {
            method: 'POST',
            path: '/quotes',
            body: {
              quoteId: 'Q-7001',
              lines: [
                { lineNo: 1, sku: 'TENT-2P', quantity: 1 },
                { lineNo: 2, sku: 'MAT-FOAM', quantity: 2 },
                { lineNo: 3, sku: 'STOVE-GAS', quantity: 1 },
              ],
            },
          },
        },
        expect: {
          status: 200,
          bodyHas: {
            lines: [
              { sku: 'TENT-2P', price: 120 },
              { sku: 'MAT-FOAM', price: 15 },
              { sku: 'STOVE-GAS', price: 45 },
            ],
            total: 195,
          },
          calls: [{ method: 'GET', path: '/prices/{sku}', count: 3 }],
        },
      },
      {
        name: 'One price lookup fails',
        about: 'The Pricing API cannot be reached for one SKU. The quote still comes back with the other lines priced.',
        trigger: {
          http: {
            method: 'POST',
            path: '/quotes',
            body: {
              quoteId: 'Q-7002',
              lines: [
                { lineNo: 1, sku: 'TENT-2P', quantity: 1 },
                { lineNo: 2, sku: 'STOVE-GAS', quantity: 1 },
              ],
            },
          },
        },
        overrides: {
          systems: {
            http: [
              {
                method: 'GET',
                path: '/prices/{sku}',
                latencyMs: 400,
                respond: (req) => (req.params.sku === 'STOVE-GAS' ? { fault: 'CONNECTIVITY' } : { status: 200, body: { sku: req.params.sku, price: 120, currency: 'EUR' } }),
              },
            ],
          },
        },
        expect: { status: 200, bodyHas: { lines: [{ sku: 'TENT-2P', price: 120 }, { sku: 'STOVE-GAS' }], total: 120 } },
      },
      {
        name: 'A 300 line order answers in time',
        about: 'Each price call takes 400 ms. One after the other would take two minutes, and the target is under 10 seconds.',
        trigger: {
          http: {
            method: 'POST',
            path: '/quotes',
            body: { quoteId: 'Q-7003', lines: Array.from({ length: 300 }, (_, i) => ({ lineNo: i + 1, sku: `SKU-${i + 1}`, quantity: 1 })) },
          },
        },
        expect: { status: 200, bodyHas: { total: 3000 }, maxMs: 10000 },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'quote-api',
      why: 'This handler only logs the error and passes it on, which Mule does by default. The partial quote comes from the Try inside the loop.',
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
A **Quote API** (\`POST /quotes\`) receives an order with up to **300 lines**. The body has \`quoteId\` and \`lines\`, and each line has \`lineNo\`, \`sku\` and \`quantity\`. It must return the quote as JSON: \`lines\` (each line with its \`price\`) and \`total\` (the sum of price times quantity).

**Facts**
- For each line, the API calls the **Pricing API**: \`GET /prices/{sku}\`. It returns \`{ sku, price, currency }\`.
- Each call takes ~400 ms.
- The Pricing API allows 20 concurrent requests.
- The lines must stay **in the original line order**.
- Target response time: **under 10 seconds**. One hung Pricing call must not hold the whole quote open.
- If one Pricing call fails, still return the quote: that line gets \`price: null\` and the total covers the priced lines.

**What the Pricing API sends back**

\`GET /prices/TENT-2P\` answers 200 with:
\`\`\`json
{ "sku": "TENT-2P", "price": 120, "currency": "EUR" }
\`\`\`

**What failures look like**
- When the Pricing API cannot be reached, the HTTP Request raises \`HTTP:CONNECTIVITY\`. When it does not answer within the response timeout, it raises \`HTTP:TIMEOUT\`. Catch these for the one line so the rest of the quote still comes back.
- Inside a Parallel For Each, an error that is not caught in its route ends the whole scope with \`MULE:COMPOSITE_ROUTING\` after all routes finish.

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
    'Variables set inside Parallel For Each are not visible after it. Compute the total afterwards with DataWeave over the collected results.',
    'Parallel For Each aggregates errors into MULE:COMPOSITE_ROUTING after all routes finish; For Each stops at the first error unless the body has a Try/On Error Continue.',
  ],
  solution: `
**Choice:** **Parallel For Each** with \`maxConcurrency="20"\` (the Pricing API's limit) and a \`timeout\`. The \`timeout\` applies to each route, not to the whole scope, so size it for one Pricing call.
- For Each: 300 × 0.4 s ≈ **120 s**.
- Parallel For Each: 300 / 20 = 15 waves × 0.4 s ≈ **6 s** (+ overhead), within 10 s.
Parallel For Each holds all results in memory, which is fine for 300 small price objects.

**Flow**
1. HTTP Listener → \`collection="#[payload.lines]"\` on Parallel For Each.
2. Inside: HTTP Request \`GET /prices/{sku}\` with \`uriParams\` from \`payload.sku\`, then a Transform that merges the line and price.
3. After the scope, the payload is an **array of messages in input order**; map it: \`payload map $.payload\`.
4. Total in DataWeave afterwards: \`sum(lines map ($.price * $.quantity))\`, not via \`vars.total\` inside the loop, because variable changes inside Parallel For Each routes are not propagated out.

(For Each would need \`vars.priced\` appended on each iteration, since For Each always restores the original payload when it finishes; variables set inside it *are* visible afterwards.)

**Errors**
- **For Each:** the first failing call stops the loop and goes to the flow's error handler (unless wrapped in Try + On Error Continue).
- **Parallel For Each:** all routes run; if any fail, \`MULE:COMPOSITE_ROUTING\` is raised with successful and failed results in the error. To return a partial quote, wrap the call in a Try with On Error Continue that returns \`{ sku, price: null, error: "PRICE_UNAVAILABLE" }\`.
`,
}
