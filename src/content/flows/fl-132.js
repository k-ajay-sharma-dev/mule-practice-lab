import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const stock = { 'SKU-100': 12, 'SKU-220': 1, 'SKU-310': 4, 'SKU-415': 0, 'SKU-502': 30 }
const stockService = { method: 'GET', path: '/stock/{sku}', latencyMs: 120, respond: (req) => ({ status: 200, body: { sku: req.params.sku, available: stock[req.params.sku] ?? 0 } }) }
const check = (lines) => ({ http: { method: 'POST', path: '/baskets/check', body: { basketId: 'B-7781', lines } } })

export default {
  id: 'fl-132',
  category: 'flows',
  title: 'Basket Stock Check: Collect Each Line\'s Answer in a Variable, Because For Each Hands Back the Basket',
  level: 'INTERMEDIATE',
  tags: ['foreach', 'variables', 'http-request', 'choice', 'aggregation', 'retail'],
  estMinutes: 25,
  flowChecks: [
    { label: 'The API is a POST on /baskets/check', rule: { type: 'source', component: 'http-listener', where: { path: '/baskets/check', allowedMethods: 'POST' } } },
    {
      label: 'The list of short lines starts empty before the For Each',
      rule: { type: 'before', first: 'set-variable', firstWhere: { variableName: 'shortLines' }, then: 'foreach', outside: true },
    },
    { label: 'The stock of each line is asked inside a For Each', rule: { type: 'inside', component: 'http-request', within: 'foreach', where: { method: 'GET', path: 'stock' } } },
    {
      label: 'A short line is added to the list inside the loop',
      rule: { type: 'inside', component: 'set-variable', within: 'foreach', where: { variableName: 'shortLines', value: '++' } },
    },
    {
      label: 'The answer is built after the loop from the variable',
      rule: { type: 'before', first: 'foreach', then: 'set-payload', thenWhere: { value: 'vars.shortLines' }, outside: true },
    },
  ],
  simulation: {
    systems: { http: [stockService] },
    tests: [
      {
        name: 'Everything is in stock',
        about: 'Three lines, all with enough stock. The basket is ready and the list of short lines is empty.',
        trigger: check([{ sku: 'SKU-100', qty: 2 }, { sku: 'SKU-310', qty: 1 }, { sku: 'SKU-502', qty: 10 }]),
        expect: { status: 200, body: { basketId: 'B-7781', ready: true, shortLines: [] }, calls: [{ method: 'GET', path: '/stock/{sku}', count: 3 }] },
      },
      {
        name: 'One line is short',
        about: 'The customer wants 3 of SKU-220 and only 1 is left. That line comes back with what was wanted and what is there.',
        trigger: check([{ sku: 'SKU-100', qty: 1 }, { sku: 'SKU-220', qty: 3 }]),
        expect: { status: 200, body: { basketId: 'B-7781', ready: false, shortLines: [{ sku: 'SKU-220', wanted: 3, available: 1 }] } },
      },
      {
        name: 'Two short lines in a basket of five',
        about: 'Five lines, two of them short. Each line is asked once, and both short lines are in the answer.',
        trigger: check([{ sku: 'SKU-100', qty: 1 }, { sku: 'SKU-220', qty: 2 }, { sku: 'SKU-310', qty: 4 }, { sku: 'SKU-415', qty: 1 }, { sku: 'SKU-502', qty: 5 }]),
        expect: {
          status: 200,
          body: { basketId: 'B-7781', ready: false, shortLines: [{ sku: 'SKU-220', wanted: 2, available: 1 }, { sku: 'SKU-415', wanted: 1, available: 0 }] },
          calls: [{ method: 'GET', path: '/stock/{sku}', count: 5 }],
        },
      },
      {
        name: 'A line takes the last of the stock',
        about: 'The customer wants all 4 of SKU-310. That is not short: exactly enough is enough.',
        trigger: check([{ sku: 'SKU-310', qty: 4 }]),
        expect: { status: 200, body: { basketId: 'B-7781', ready: true, shortLines: [] } },
      },
    ],
  },
  referenceFlow: design(
    flow('check-basket-stock', source('http-listener', { path: '/baskets/check', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'shortLines', value: '#[[]]' }),
      scope('foreach', { collection: '#[payload.lines]' }, [
        step('set-variable', { variableName: 'line', value: '#[payload]' }),
        step('http-request', { method: 'GET', path: '#["/stock/" ++ payload.sku]', responseTimeout: 2000 }),
        router('choice', {}, [
          route({ expression: '#[payload.available < vars.line.qty]' }, [
            step('set-variable', { variableName: 'shortLines', value: '#[vars.shortLines ++ [{ sku: vars.line.sku, wanted: vars.line.qty, available: payload.available }]]' }),
          ]),
        ]),
      ]),
      step('set-payload', { value: '#[output application/json --- { basketId: payload.basketId, ready: isEmpty(vars.shortLines), shortLines: vars.shortLines }]' }),
    ]),
  ),
  description: `
A home goods retailer checks a basket before checkout. The web shop calls:

\`POST /baskets/check\` with \`{ "basketId": "B-7781", "lines": [ { "sku": "SKU-220", "qty": 3 }, ... ] }\`

Stock comes from a stock service, one SKU at a time: \`GET /stock/{sku}\` answers \`{ "sku": "SKU-220", "available": 1 }\`.

**Requirements**
- Ask the stock service about every line in the basket.
- Answer **200** with \`{ "basketId", "ready", "shortLines" }\`.
- \`shortLines\` lists every line where the stock is lower than the quantity wanted, as \`{ "sku", "wanted", "available" }\`. It is \`[]\` when everything is in stock.
- \`ready\` is true when no line is short.
- Taking the last items is fine: a line that wants exactly what is left is not short.

A developer's first try put the HTTP Request in a For Each and a Set Payload after it. Every answer came back with the basket the web shop had sent, not the stock.

**Design the flow**, and explain why the first try returned the basket.
`,
  answerTemplate: `## The endpoint

## Why the first try returned the basket

## Collecting the short lines

## The answer
`,
  keyPoints: [
    'For Each gives back the payload it started with. Whatever the steps inside it set as payload is gone when the loop ends.',
    'Keep the results in a variable. Variables set inside a For Each are still there after it.',
    'Start the variable as an empty list before the loop, then add to it with ++ inside.',
    'Keep the current line in a variable before the HTTP Request, because the call replaces the payload with the stock answer.',
    'Compare with < so a line that takes the last items is not reported as short.',
    'Parallel For Each is no help here: changes to variables made inside it are not visible after it. It gives back a list of the results instead.',
  ],
  solution: `
1. **HTTP Listener**: \`POST /baskets/check\`.
2. **Set Variable** \`shortLines\` = \`#[[]]\`.
3. **For Each** over \`#[payload.lines]\`:
   - **Set Variable** \`line\` = \`#[payload]\`.
   - **HTTP Request** \`GET\` \`#["/stock/" ++ payload.sku]\`.
   - **Choice**, route \`#[payload.available < vars.line.qty]\`: **Set Variable** \`shortLines\` = \`#[vars.shortLines ++ [{ sku: vars.line.sku, wanted: vars.line.qty, available: payload.available }]]\`.
4. **Set Payload**:
   \`\`\`dataweave
   output application/json
   ---
   { basketId: payload.basketId, ready: isEmpty(vars.shortLines), shortLines: vars.shortLines }
   \`\`\`
   After the For Each the payload is the basket again, so \`payload.basketId\` works.

**Why the first try returned the basket.** For Each runs its steps once per item, then puts back the payload it had before the loop. That is by design: a loop that writes records should not lose the message it was given. Anything you want to keep from the loop has to go into a variable.

**Why the line goes in a variable.** The HTTP Request replaces the payload with the stock answer, so after it \`payload.qty\` is gone. \`vars.line\` keeps the SKU and quantity for the comparison.
`,
  followUps: [
    {
      q: 'A basket can have 60 lines. Is one call per line a problem?',
      a: 'It adds up: 60 calls of 120 ms is more than 7 seconds one after another. Ask whether the stock service takes a list of SKUs. If it does not, Parallel For Each with a limit on concurrency cuts the time, and you build the short lines from the list of results it gives back.',
    },
    {
      q: 'Could the answer be built with one DataWeave expression instead of the Choice?',
      a: 'Yes. Set the variable on every line to an if and else expression that adds the line only when it is short. The Choice is clearer for a reader new to DataWeave.',
    },
    {
      q: 'What should happen if the stock service is down?',
      a: 'The stock check cannot answer, so return 503 and let the web shop try again. Do not report the basket as ready.',
    },
  ],
}
