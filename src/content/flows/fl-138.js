import { design, flow, route, router, source, step } from '../../flow/dsl.js'

const order = { orderId: 'WO-88120', country: 'DE', currency: 'EUR', lines: [{ sku: 'KETTLE-2', amount: 49.9 }, { sku: 'MUG-SET', amount: 18 }] }
const quote = { http: { method: 'POST', path: '/tax/quote', body: order } }
const setFlag = (provider) => ({ http: { method: 'PUT', path: '/admin/flags/tax-provider', body: { provider } } })

export default {
  id: 'fl-138',
  category: 'flows',
  title: 'Switch Tax Providers Without a Redeploy: a Flag in the Object Store Picks the Route on Every Request',
  level: 'INTERMEDIATE',
  tags: ['object-store', 'feature-flag', 'choice', 'http-request', 'migration', 'e-commerce'],
  estMinutes: 30,
  flowChecks: [
    { label: 'The quote API is a POST on /tax/quote', rule: { type: 'source', component: 'http-listener', where: { path: '/tax/quote', allowedMethods: 'POST' } } },
    { label: 'The flag is read from the Object Store on each request, before the Choice', rule: { type: 'before', first: 'os-retrieve', then: 'choice' } },
    { label: 'The new provider is called on its own Choice route', rule: { type: 'inside', component: 'http-request', within: 'choice', where: { path: 'taxnow' } } },
    { label: 'The legacy engine is called on another route', rule: { type: 'inside', component: 'http-request', within: 'choice', where: { path: 'legacy-tax' } } },
    {
      label: 'An admin endpoint stores the flag under the same key the quote reads',
      rule: {
        type: 'all',
        rules: [
          { type: 'source', component: 'http-listener', where: { path: '/admin/flags/tax-provider', allowedMethods: 'PUT' } },
          { type: 'linked', from: { component: 'os-store', key: 'key' }, to: { component: 'os-retrieve', key: 'key' } },
        ],
      },
    },
    { label: 'The flag is stored only after its value is checked', rule: { type: 'inside', component: 'os-store', within: 'choice' } },
  ],
  simulation: {
    systems: {
      http: [
        { method: 'POST', path: '/legacy-tax/calculate', latencyMs: 450, respond: { status: 200, body: { result: { taxTotal: 12.9, engine: 'v7' } } } },
        { method: 'POST', path: '/taxnow/v2/quotes', latencyMs: 90, respond: { status: 200, body: { quoteId: 'TQ-55102', totalTax: 12.9 } } },
      ],
    },
    tests: [
      {
        name: 'No flag has been set yet',
        about: 'On the first day nobody has set the flag. Quotes go to the legacy engine, and the answer has the tax and the provider used.',
        trigger: quote,
        expect: {
          status: 200,
          bodyHas: { orderId: 'WO-88120', tax: 12.9, provider: 'legacy' },
          calls: [{ method: 'POST', path: '/legacy-tax/calculate', count: 1 }, { method: 'POST', path: '/taxnow/v2/quotes', count: 0 }],
        },
      },
      {
        name: 'The flag says new',
        about: 'The flag in the Object Store is "new". The quote goes to the new provider only, and the answer has the same shape.',
        trigger: quote,
        overrides: { systems: { objectStore: { featureFlags: { 'tax-provider': 'new' } } } },
        expect: {
          status: 200,
          bodyHas: { orderId: 'WO-88120', tax: 12.9, provider: 'new' },
          calls: [{ method: 'POST', path: '/taxnow/v2/quotes', count: 1, has: { orderId: 'WO-88120' } }, { method: 'POST', path: '/legacy-tax/calculate', count: 0 }],
        },
      },
      {
        name: 'Switch over with the admin endpoint',
        about: 'Operations set the flag to "new" and the very next quote uses the new provider, with no restart in between.',
        triggers: [setFlag('new'), { ...quote, afterMs: 1000 }],
        expect: { stored: [{ key: 'tax-provider', value: 'new' }], calls: [{ method: 'POST', path: '/taxnow/v2/quotes', count: 1 }], bodyHas: { provider: 'new' } },
      },
      {
        name: 'Switch back after a bad day',
        about: 'The new provider has problems, so operations set the flag back to "legacy". Quotes go to the legacy engine again.',
        overrides: { systems: { objectStore: { featureFlags: { 'tax-provider': 'new' } } } },
        triggers: [setFlag('legacy'), { ...quote, afterMs: 1000 }],
        expect: { stored: [{ key: 'tax-provider', value: 'legacy' }], calls: [{ method: 'POST', path: '/legacy-tax/calculate', count: 1 }, { method: 'POST', path: '/taxnow/v2/quotes', count: 0 }] },
      },
      {
        name: 'A typo in the flag value',
        about: 'Someone sends "nwe". The admin endpoint answers 400 and stores nothing, so quotes do not start failing.',
        trigger: setFlag('nwe'),
        expect: { status: 400, notStored: ['tax-provider'] },
      },
    ],
  },
  referenceFlow: design(
    flow('tax-quote', source('http-listener', { path: '/tax/quote', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'order', value: '#[payload]' }),
      step('os-retrieve', { key: 'tax-provider', defaultValue: 'legacy', objectStore: 'featureFlags' }),
      step('set-variable', { variableName: 'provider', value: '#[payload]' }),
      step('set-payload', { value: '#[vars.order]' }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.provider == "new"]' }, [
            step('http-request', { method: 'POST', path: '/taxnow/v2/quotes', responseTimeout: 2000 }),
            step('set-payload', { value: '#[output application/json --- { orderId: vars.order.orderId, tax: payload.totalTax, provider: "new" }]' }),
          ]),
        ],
        {
          otherwise: [
            step('http-request', { method: 'POST', path: '/legacy-tax/calculate', responseTimeout: 5000 }),
            step('set-payload', { value: '#[output application/json --- { orderId: vars.order.orderId, tax: payload.result.taxTotal, provider: "legacy" }]' }),
          ],
        },
      ),
    ]),
    flow('set-tax-provider', source('http-listener', { path: '/admin/flags/tax-provider', allowedMethods: 'PUT' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[["legacy", "new"] contains payload.provider]' }, [
            step('os-store', { key: 'tax-provider', value: '#[payload.provider]', objectStore: 'featureFlags' }),
            step('set-payload', { value: '#[output application/json --- { taxProvider: payload.provider }]' }),
          ]),
        ],
        {
          otherwise: [
            step('set-variable', { variableName: 'httpStatus', value: '400' }),
            step('set-payload', { value: '#[output application/json --- { message: "provider must be legacy or new" }]' }),
          ],
        },
      ),
    ]),
  ),
  description: `
An online homeware shop is moving from its old **tax engine** to a new tax provider, **TaxNow**. The checkout calls one Mule API for each tax quote.

- Legacy engine: \`POST /legacy-tax/calculate\`, answers \`{ "result": { "taxTotal": 12.90, "engine": "v7" } }\`
- TaxNow: \`POST /taxnow/v2/quotes\`, answers \`{ "quoteId": "TQ-55102", "totalTax": 12.90 }\`

Both take the order as the request body.

The checkout calls \`POST /tax/quote\` with the order and expects \`{ "orderId", "tax", "provider" }\`, whichever provider answered.

**Requirements**
- Operations must be able to **switch providers at any time without a redeploy or a restart**, and switch back the same way if TaxNow has a bad day.
- Until anyone sets the switch, use the **legacy** engine.
- Add an admin endpoint \`PUT /admin/flags/tax-provider\` with \`{ "provider": "new" }\` or \`{ "provider": "legacy" }\`. Any other value gets **400**, and the switch stays as it was.
- The admin endpoint is protected by a policy in API Manager. You do not need to design that.

**Design the flows.**
`,
  answerTemplate: `## Where the switch lives

## The quote flow

## The admin endpoint

## Why not a property
`,
  keyPoints: [
    'Keep the flag in an Object Store and read it on every request. Each quote then follows the latest value.',
    'Give the Retrieve a default value, so the flow works before anyone sets the flag.',
    'Save the order in a variable before the Retrieve, because the Retrieve puts the flag in the payload.',
    'Each provider has its own route, and both routes end with the same answer shape, so the checkout never knows which one answered.',
    'Check the value before storing it. A typo stored as the flag would send every quote down the wrong route.',
    'A property in the app\'s configuration is read when the app starts, so changing it means a restart.',
  ],
  solution: `
**Flow \`tax-quote\`**
1. **HTTP Listener** \`POST /tax/quote\`.
2. **Set Variable** \`order\` = \`#[payload]\`.
3. **Retrieve** key \`tax-provider\` from the \`featureFlags\` Object Store, default value \`legacy\`.
4. **Set Variable** \`provider\` = \`#[payload]\`, then **Set Payload** \`#[vars.order]\`.
5. **Choice**:
   - \`#[vars.provider == "new"]\`: **HTTP Request** \`POST /taxnow/v2/quotes\`, then \`{ orderId, tax: payload.totalTax, provider: "new" }\`.
   - Otherwise: **HTTP Request** \`POST /legacy-tax/calculate\`, then \`{ orderId, tax: payload.result.taxTotal, provider: "legacy" }\`.

**Flow \`set-tax-provider\`**
1. **HTTP Listener** \`PUT /admin/flags/tax-provider\`.
2. **Choice**:
   - \`#[["legacy", "new"] contains payload.provider]\`: **Store** \`tax-provider\` = \`#[payload.provider]\` in \`featureFlags\`, answer \`{ taxProvider }\`.
   - Otherwise: \`httpStatus\` = \`400\` and a message.

**Which Object Store.** Make it persistent, so the flag survives a restart. With several replicas, use a store all replicas share, so they all follow the same flag. On CloudHub that is Object Store v2.

**Why the otherwise branch is the legacy engine.** Anything that is not exactly "new" goes to the engine that is known to work. A lost or odd flag fails safe.
`,
  followUps: [
    {
      q: 'Reading the Object Store adds a call to every quote. Can that be avoided?',
      a: 'Keep the flag in memory for a short time, such as 30 seconds, with a Cache scope around the Retrieve. A switch then takes up to 30 seconds to apply everywhere, which is usually fine.',
    },
    {
      q: 'How would you send only 10% of quotes to TaxNow first?',
      a: 'Store a percentage instead of a name, and route on a stable hash of the order or customer ID, so the same customer always gets the same provider during the trial.',
    },
    {
      q: 'Should the quote fall back to the legacy engine when TaxNow fails?',
      a: 'It can, with an error handler around the TaxNow call. Log every fallback, or a broken TaxNow can hide behind the old engine for weeks.',
    },
  ],
}
