import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-007',
  category: 'flows',
  title: 'Choosing a Router: Choice, Scatter-Gather, First Successful, Round Robin',
  level: 'BEGINNER',
  tags: ['routers', 'choice', 'first-successful', 'round-robin', 'scatter-gather'],
  estMinutes: 35,
  flowChecks: [
    {
      label: 'Carrier selection uses a Choice router with US and EU conditions',
      rule: { type: 'routes', component: 'choice', min: 2 },
    },
    {
      label: 'One Choice route has a condition on US orders',
      rule: { type: 'inside', component: ['http-request', 'flow-ref'], within: 'choice', routeWhere: { expression: 'US' } },
    },
    {
      label: 'Rate quotes call the three carriers in parallel (Scatter-Gather)',
      rule: { type: 'routes', component: 'scatter-gather', min: 3 },
    },
    {
      label: 'The rate Scatter-Gather is capped at the UI wait of 3 s',
      rule: { type: 'exists', component: 'scatter-gather', where: { timeout: { gte: 1, lte: 3000 } } },
    },
    {
      label: 'One failing carrier does not fail the rate screen (On Error Continue in every gather route)',
      rule: { type: 'inside', component: 'on-error-continue', within: 'scatter-gather', min: 3 },
    },
    {
      label: 'The gathered quotes are flattened into one list after the Scatter-Gather',
      rule: { type: 'before', first: 'scatter-gather', then: 'transform', outside: true },
    },
    {
      label: 'Address validation tries primary then backup vendor (First Successful)',
      rule: { type: 'routes', component: 'first-successful', min: 2 },
    },
    {
      label: 'When both vendors fail the address is accepted unvalidated (First Successful inside a Try)',
      rule: { type: 'inside', component: 'first-successful', within: 'try' },
    },
    {
      label: 'The fallback is On Error Continue and flags the address as not validated',
      rule: {
        type: 'any',
        rules: [
          { type: 'inside', component: 'transform', where: { script: 'validated' }, within: 'on-error-continue' },
          { type: 'inside', component: 'set-payload', where: { value: 'validated' }, within: 'on-error-continue' },
          { type: 'inside', component: 'set-variable', where: { variableName: 'validated' }, within: 'on-error-continue' },
        ],
      },
    },
    {
      label: 'Label printing rotates over three print servers (Round Robin)',
      rule: { type: 'routes', component: 'round-robin', min: 3 },
    },
  ],
  referenceFlow: design(
    flow('select-carrier', source('http-listener', { path: '/shipments', allowedMethods: 'POST' }), [
      router('choice', {}, [
        route({ expression: "#[payload.shipTo.country == 'US']" }, [
          step('http-request', { method: 'POST', path: '/fedex/shipments' }),
        ]),
        route({ expression: "#[['DE', 'FR', 'NL', 'BE', 'IT', 'ES'] contains payload.shipTo.country]" }, [
          step('http-request', { method: 'POST', path: '/dhl/shipments' }),
        ]),
      ], { otherwise: [step('http-request', { method: 'POST', path: '/freight/shipments' })] }),
    ]),
    flow('get-rate-quotes', source('http-listener', { path: '/rates', allowedMethods: 'GET' }), [
      router('scatter-gather', { timeout: 3000, maxConcurrency: 3 }, [
        route({}, [
          scope('try', {}, [step('http-request', { method: 'GET', path: '/fedex/rates', responseTimeout: 2500 })], {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [step('set-payload', { value: '#[output application/json --- { carrier: "FedEx", error: "unavailable" }]' })]),
            ],
          }),
        ]),
        route({}, [
          scope('try', {}, [step('http-request', { method: 'GET', path: '/dhl/rates', responseTimeout: 2500 })], {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [step('set-payload', { value: '#[output application/json --- { carrier: "DHL", error: "unavailable" }]' })]),
            ],
          }),
        ]),
        route({}, [
          scope('try', {}, [step('http-request', { method: 'GET', path: '/ups/rates', responseTimeout: 2500 })], {
            errorHandlers: [
              handler('on-error-continue', { type: 'ANY' }, [step('set-payload', { value: '#[output application/json --- { carrier: "UPS", error: "unavailable" }]' })]),
            ],
          }),
        ]),
      ]),
      step('transform', {
        script: '%dw 2.0\noutput application/json\n---\n(payload pluck $.payload) orderBy ($.price default 999999)',
      }),
    ]),
    flow('validate-address', source('http-listener', { path: '/addresses/validate', allowedMethods: 'POST' }), [
      step('set-variable', { variableName: 'address', value: '#[payload]' }),
      scope('try', {}, [
        router('first-successful', {}, [
          route({}, [step('http-request', { method: 'POST', path: '/primary-vendor/validate', responseTimeout: 2000 })]),
          route({}, [step('http-request', { method: 'POST', path: '/backup-vendor/validate', responseTimeout: 2000 })]),
        ]),
      ], {
        errorHandlers: [
          handler('on-error-continue', { type: 'ANY' }, [
            step('transform', { script: '%dw 2.0\noutput application/json\n---\nvars.address ++ { validated: false }' }),
          ]),
        ],
      }),
    ]),
    flow('print-label', source('http-listener', { path: '/labels', allowedMethods: 'POST' }), [
      router('round-robin', {}, [
        route({}, [step('http-request', { method: 'POST', path: '/print-server-1/labels' })]),
        route({}, [step('http-request', { method: 'POST', path: '/print-server-2/labels' })]),
        route({}, [step('http-request', { method: 'POST', path: '/print-server-3/labels' })]),
      ]),
    ]),
  ),
  description: `
You are building a **Shipping Process API**. Four separate requirements arrived from the business in the same sprint:

1. **Carrier selection:** orders to the US go to the FedEx System API, orders to the EU go to DHL, everything else goes to a generic freight API.
2. **Rate quotes:** for a "best price" screen, call **FedEx, DHL and UPS rate APIs at the same time** and return all three quotes (UI waits at most 3 s).
3. **Address validation:** use the primary address-validation vendor; if it fails, try a backup vendor; if both fail, accept the address unvalidated and flag it.
4. **Label printing:** spread label-print requests evenly over **three on-prem print servers** that have no load balancer in front of them.

**Design the flow(s):** for each requirement pick the Mule 4 router (Choice, Scatter-Gather, First Successful, Round Robin), explain why, and describe what the payload looks like after the router and how errors behave.
`,
  answerTemplate: `## 1. Carrier selection

## 2. Rate quotes

## 3. Address validation

## 4. Label printing

## Error behaviour of each router
`,
  keyPoints: [
    'Carrier selection uses a Choice router with DataWeave conditions on the country and an otherwise branch for the generic freight API.',
    'Rate quotes use Scatter-Gather (routes run concurrently, timeout set, result is an object keyed by route index that DataWeave flattens).',
    'Scatter-Gather raises MULE:COMPOSITE_ROUTING if any route fails, so each route is wrapped in a Try (On Error Continue) to still return partial quotes.',
    'Address validation uses First Successful: routes are tried in order until one succeeds; if all fail it raises an error that is caught to mark the address unvalidated.',
    'Label printing uses Round Robin, which sends each successive message to the next route in turn (no health checking or failover).',
  ],
  solution: `
1. **Carrier selection – Choice router**
   - \`<choice>\` with \`<when expression="#[payload.shipTo.country == 'US']">\` → flow-ref to FedEx request; a second \`when\` for an EU country list (\`#[['DE','FR','NL'] contains payload.shipTo.country]\` or a lookup from config); \`<otherwise>\` → generic freight.
   - Only the **first** matching branch runs; payload after the router is whatever that branch produced.

2. **Rate quotes – Scatter-Gather**
   - Three routes, each an HTTP Request to a carrier rate API, executed **in parallel**. Set the Scatter-Gather \`timeout\` (e.g. 3000 ms) and HTTP response timeouts slightly lower.
   - Output is an object \`{ "0": Message, "1": Message, "2": Message }\`; a Transform Message (DataWeave) maps \`payload pluck $.payload\` into a single quotes array sorted by price.
   - Wrap each route in a **Try with On Error Continue** that returns \`{ carrier: "UPS", error: "unavailable" }\`, otherwise one failing carrier causes \`MULE:COMPOSITE_ROUTING\` and the whole screen fails.

3. **Address validation – First Successful**
   - \`<first-successful>\` with route 1 = primary vendor, route 2 = backup vendor. A route "fails" when it throws an error, so make sure HTTP status validation treats vendor errors as errors.
   - If every route fails, First Successful throws an error; wrap the router in a Try with **On Error Continue** that sets \`validated: false\` and continues.

4. **Label printing – Round Robin**
   - \`<round-robin>\` with three routes, each an HTTP Request to one print server. Each new event goes to the next route in rotation.
   - Round Robin does **not** skip a dead server; if failover is needed, nest it (e.g. Round Robin inside a Try that falls back) or put a real load balancer in front.

**Where DataWeave is used:** Choice conditions, merging Scatter-Gather results, building the "unvalidated" fallback payload.
`,
  followUps: [
    { q: 'What is the difference between Scatter-Gather and Parallel For Each?', a: 'Scatter-Gather runs a fixed set of different routes on the same payload; Parallel For Each runs the same processors once per element of a collection. Both aggregate results, and both fail with a composite error if any route/element fails.' },
    { q: 'In a Choice router, what happens if two when conditions are both true?', a: 'Only the first matching when (top to bottom) executes. If none match and there is no otherwise, the event continues unchanged.' },
    { q: 'Why not use Scatter-Gather for address validation?', a: 'It would call both vendors every time, doubling cost and load. First Successful only calls the backup when the primary fails.' },
  ],
}
