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
  simulation: {
    systems: {
      http: [
        { method: 'POST', path: '/fedex/shipments', latencyMs: 350, respond: { status: 201, body: { carrier: 'FedEx', trackingNumber: '7712 3456 7890' } } },
        { method: 'POST', path: '/dhl/shipments', latencyMs: 400, respond: { status: 201, body: { carrier: 'DHL', trackingNumber: 'JD014600003829' } } },
        { method: 'POST', path: '/freight/shipments', latencyMs: 500, respond: { status: 201, body: { carrier: 'Freight', trackingNumber: 'FRT-55120' } } },
        { method: 'GET', path: '/fedex/rates', latencyMs: 700, respond: { status: 200, body: { carrier: 'FedEx', price: 42.5, days: 2 } } },
        { method: 'GET', path: '/dhl/rates', latencyMs: 900, respond: { status: 200, body: { carrier: 'DHL', price: 38.9, days: 3 } } },
        { method: 'GET', path: '/ups/rates', latencyMs: 800, respond: { status: 200, body: { carrier: 'UPS', price: 40.1, days: 2 } } },
        { method: 'POST', path: '/primary-vendor/validate', latencyMs: 300, respond: { status: 200, body: { street: 'Invalidenstrasse 116', city: 'Berlin', postcode: '10115', country: 'DE', validated: true } } },
        { method: 'POST', path: '/backup-vendor/validate', latencyMs: 450, respond: { status: 200, body: { street: 'Invalidenstrasse 116', city: 'Berlin', postcode: '10115', country: 'DE', validated: true } } },
        { method: 'POST', path: '/print-server-1/labels', latencyMs: 200, respond: { status: 200, body: { printed: true, server: 1 } } },
        { method: 'POST', path: '/print-server-2/labels', latencyMs: 200, respond: { status: 200, body: { printed: true, server: 2 } } },
        { method: 'POST', path: '/print-server-3/labels', latencyMs: 200, respond: { status: 200, body: { printed: true, server: 3 } } },
      ],
    },
    tests: [
      {
        name: 'Each shipment goes to its carrier',
        about: 'A US order goes to FedEx, a French order to DHL, and a Japanese order to the freight API.',
        triggers: [
          { http: { method: 'POST', path: '/shipments', body: { orderId: 'SO-1001', shipTo: { name: 'J. Smith', city: 'Denver', country: 'US' } } } },
          { http: { method: 'POST', path: '/shipments', body: { orderId: 'SO-1002', shipTo: { name: 'C. Martin', city: 'Lyon', country: 'FR' } } } },
          { http: { method: 'POST', path: '/shipments', body: { orderId: 'SO-1003', shipTo: { name: 'K. Sato', city: 'Osaka', country: 'JP' } } } },
        ],
        expect: {
          calls: [
            { method: 'POST', path: '/fedex/shipments', count: 1 },
            { method: 'POST', path: '/dhl/shipments', count: 1 },
            { method: 'POST', path: '/freight/shipments', count: 1 },
          ],
        },
      },
      {
        name: 'One carrier is down and one is slow',
        about: 'UPS refuses the connection and DHL takes 8 seconds. The screen still gets one list within 3 seconds, with UPS and DHL marked as unavailable.',
        trigger: { http: { method: 'GET', path: '/rates' } },
        overrides: {
          systems: {
            http: [
              { method: 'GET', path: '/ups/rates', respond: { fault: 'CONNECTIVITY' } },
              { method: 'GET', path: '/dhl/rates', latencyMs: 8000, respond: { status: 200, body: { carrier: 'DHL', price: 38.9, days: 3 } } },
            ],
          },
        },
        expect: { status: 200, bodyHas: [{ carrier: 'FedEx', price: 42.5 }, { carrier: 'DHL' }, { carrier: 'UPS' }], bodyLacks: [{ carrier: 'DHL', price: 38.9 }], maxMs: 3000 },
      },
      {
        name: 'The primary vendor fails',
        about: 'The primary address vendor is down, so the backup vendor validates the address.',
        trigger: { http: { method: 'POST', path: '/addresses/validate', body: { street: 'Invalidenstrasse 116', city: 'Berlin', postcode: '10115', country: 'DE' } } },
        overrides: { systems: { http: [{ method: 'POST', path: '/primary-vendor/validate', respond: { status: 503, body: { message: 'Service Unavailable' } } }] } },
        expect: { status: 200, bodyHas: { postcode: '10115' }, bodyLacks: { validated: false }, calls: [{ method: 'POST', path: '/backup-vendor/validate', count: 1 }] },
      },
      {
        name: 'Both address vendors fail',
        about: 'Neither vendor answers. The address is accepted with validated set to false.',
        trigger: { http: { method: 'POST', path: '/addresses/validate', body: { street: 'Invalidenstrasse 116', city: 'Berlin', postcode: '10115', country: 'DE' } } },
        overrides: {
          systems: {
            http: [
              { method: 'POST', path: '/primary-vendor/validate', respond: { fault: 'CONNECTIVITY' } },
              { method: 'POST', path: '/backup-vendor/validate', respond: { status: 500, body: { message: 'Internal error' } } },
            ],
          },
        },
        expect: { status: 200, bodyHas: { postcode: '10115', validated: false } },
      },
      {
        name: 'Labels are spread over the print servers',
        about: 'Three labels in a row go to three different print servers.',
        triggers: [
          { http: { method: 'POST', path: '/labels', body: { shipmentId: 'SH-1', format: 'ZPL' } } },
          { http: { method: 'POST', path: '/labels', body: { shipmentId: 'SH-2', format: 'ZPL' } } },
          { http: { method: 'POST', path: '/labels', body: { shipmentId: 'SH-3', format: 'ZPL' } } },
        ],
        expect: {
          calls: [
            { method: 'POST', path: '/print-server-1/labels', count: 1 },
            { method: 'POST', path: '/print-server-2/labels', count: 1 },
            { method: 'POST', path: '/print-server-3/labels', count: 1 },
          ],
        },
      },
    ],
  },
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

**Facts**

- Each requirement is its own endpoint on the Shipping Process API: \`POST /shipments\`, \`GET /rates\`, \`POST /addresses/validate\` and \`POST /labels\`.
- A shipment carries the destination as \`payload.shipTo.country\`, an ISO code such as \`US\`, \`DE\` or \`FR\`. The EU countries you ship to are \`DE\`, \`FR\`, \`NL\`, \`BE\`, \`IT\` and \`ES\`.
- The carriers are System APIs reached over HTTP. Shipments are created with \`POST /fedex/shipments\`, \`POST /dhl/shipments\` and \`POST /freight/shipments\`. Rates come from \`GET /fedex/rates\`, \`GET /dhl/rates\` and \`GET /ups/rates\`, each answering \`{ carrier, price, days }\`.
- The address vendors are \`POST /primary-vendor/validate\` and \`POST /backup-vendor/validate\`. The print servers are \`POST /print-server-1/labels\`, \`POST /print-server-2/labels\` and \`POST /print-server-3/labels\`.
- **Rate quotes:** if one carrier is down or slow, the screen still shows the quotes it has. It returns **one list of quotes sorted by price**, and a carrier that failed appears in the list as \`{ carrier, error: "unavailable" }\` with no price.
- **Address validation:** when both vendors fail, return the address with the field \`validated: false\` so the order team can check it later.
- The print servers are equal. None of them is a backup for another.

**What each system sends back**
- A rate API answers 200 with \`{ "carrier": "FedEx", "price": 42.5, "days": 2 }\`.
- A carrier shipment API answers 201 with \`{ "carrier": "FedEx", "trackingNumber": "7712 3456 7890" }\`.
- An address vendor answers 200 with the checked address: \`{ "street": "Invalidenstrasse 116", "city": "Berlin", "postcode": "10115", "country": "DE", "validated": true }\`. Return it as it is.
- A print server answers 200 with \`{ "printed": true, "server": 1 }\`.

**What failures look like**
- A carrier that refuses the connection makes the HTTP Request raise \`HTTP:CONNECTIVITY\`. A carrier slower than the response timeout raises \`HTTP:TIMEOUT\`. Either way the quote list shows that carrier as unavailable.
- An address vendor answering 503 raises \`HTTP:SERVICE_UNAVAILABLE\`, and one answering 500 raises \`HTTP:INTERNAL_SERVER_ERROR\`. First Successful then tries the next route. When every route fails, First Successful raises an error of its own.

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
1. **Carrier selection: Choice router**
   - \`<choice>\` with \`<when expression="#[payload.shipTo.country == 'US']">\` calls the FedEx System API. A second \`when\` checks the EU country list (\`#[['DE','FR','NL','BE','IT','ES'] contains payload.shipTo.country]\`, or a list from config). \`<otherwise>\` calls the generic freight API.
   - Only the **first** matching branch runs; payload after the router is whatever that branch produced.

2. **Rate quotes: Scatter-Gather**
   - Three routes, each an HTTP Request to a carrier rate API, executed **in parallel**. Set the Scatter-Gather \`timeout\` (e.g. 3000 ms) and HTTP response timeouts slightly lower.
   - Output is an object \`{ "0": Message, "1": Message, "2": Message }\`; a Transform Message (DataWeave) maps \`payload pluck $.payload\` into a single quotes array sorted by price.
   - Wrap each route in a **Try with On Error Continue** that returns \`{ carrier: "UPS", error: "unavailable" }\`, otherwise one failing carrier causes \`MULE:COMPOSITE_ROUTING\` and the whole screen fails.

3. **Address validation: First Successful**
   - \`<first-successful>\` with route 1 = primary vendor, route 2 = backup vendor. A route "fails" when it throws an error, so make sure HTTP status validation treats vendor errors as errors.
   - If every route fails, First Successful throws an error; wrap the router in a Try with **On Error Continue** that sets \`validated: false\` and continues.

4. **Label printing: Round Robin**
   - \`<round-robin>\` with three routes, each an HTTP Request to one print server. Each new event goes to the next route in rotation.
   - Round Robin does **not** skip a dead server; if failover is needed, nest it (e.g. Round Robin inside a Try that falls back) or put a real load balancer in front.

**Where DataWeave is used:** Choice conditions, merging Scatter-Gather results, building the "unvalidated" fallback payload.
`,
  followUps: [
    { q: 'What is the difference between Scatter-Gather and Parallel For Each?', a: 'Scatter-Gather runs a fixed set of different routes on the same payload; Parallel For Each runs the same processors once per element of a collection. Both gather the results, and both fail with a composite error if any route or element fails.' },
    { q: 'In a Choice router, what happens if two when conditions are both true?', a: 'Only the first matching when (top to bottom) executes. If none match and there is no otherwise, the event continues unchanged.' },
    { q: 'Why not use Scatter-Gather for address validation?', a: 'It would call both vendors every time, doubling cost and load. First Successful only calls the backup when the primary fails.' },
  ],
}
