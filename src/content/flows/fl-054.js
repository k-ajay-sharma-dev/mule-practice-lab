import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-054',
  category: 'flows',
  title: 'Resilient Layers: Retries in the System API, Fallback in the Process API',
  level: 'ADVANCED',
  tags: ['api-led', 'resilience', 'until-successful', 'first-successful', 'fallback'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'Each rate provider is unlocked by its own System API (two /sys-... listeners)',
      rule: { type: 'exists', component: 'http-listener', where: { path: 'sys-' }, min: 2 },
    },
    {
      label: 'Transient provider errors are retried inside the System API (Until Successful), and in no other layer',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'until-successful' },
          { type: 'before', first: 'http-listener', firstWhere: { path: 'sys-' }, then: 'until-successful' },
          {
            type: 'absent',
            component: 'until-successful',
            inFlowWith: { component: 'http-listener', where: { path: { oneOf: ['prc-', 'exp-'] } } },
          },
        ],
      },
    },
    {
      label: 'The retry budget is small enough to fit the caller timeout (≤ 3 retries, ≤ 2 s apart)',
      rule: { type: 'exists', component: 'until-successful', where: { maxRetries: { lte: 3 }, millisBetweenRetries: { lte: 2000 } } },
    },
    {
      label: 'The Process API falls back between providers with First Successful',
      rule: {
        type: 'all',
        rules: [
          { type: 'routes', component: 'first-successful', min: 2 },
          { type: 'before', first: 'http-listener', firstWhere: { path: 'prc-' }, then: 'first-successful' },
        ],
      },
    },
    {
      label: 'The fallback routes call the System APIs over HTTP Request',
      rule: { type: 'inside', component: 'http-request', within: 'first-successful', where: { path: 'sys-' } },
    },
    {
      label: 'A last-known-good rate is the final fallback route, tried only after both providers',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'os-retrieve', within: 'first-successful' },
          { type: 'before', first: 'http-request', firstWhere: { path: 'sys-' }, then: 'os-retrieve', every: true },
        ],
      },
    },
    {
      label: 'Fresh rates refresh the last-known-good copy',
      rule: { type: 'before', first: 'first-successful', then: 'os-store', outside: true },
    },
    {
      label: 'When every route fails, the Process API returns a clear 503 (MULE:ROUTING or ANY)',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: ['on-error-propagate', 'on-error-continue'], errorType: 'MULE:ROUTING' },
          {
            type: 'before',
            first: 'http-listener',
            firstWhere: { path: 'prc-' },
            then: 'set-variable',
            thenWhere: { value: '503' },
          },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [
        {
          method: 'GET',
          path: '/sys-fx-primary/v1/rates',
          latencyMs: 180,
          respond: { status: 200, body: { base: 'EUR', asOf: '2026-11-13T09:59:30Z', rates: { USD: 1.0842, GBP: 0.8571, JPY: 163.42 } } },
        },
        {
          method: 'GET',
          path: '/sys-fx-secondary/v1/rates',
          latencyMs: 220,
          respond: { status: 200, body: { base: 'EUR', asOf: '2026-11-12', rates: { USD: 1.0815, GBP: 0.8563, JPY: 162.9 } } },
        },
        {
          method: 'GET',
          path: '/marketdata/v2/spot',
          latencyMs: 140,
          respond: {
            status: 200,
            body: {
              baseCcy: 'EUR',
              timestamp: '2026-11-13T09:59:30Z',
              quotes: [
                { ccy: 'USD', bid: 1.0841, ask: 1.0843, mid: 1.0842 },
                { ccy: 'GBP', bid: 0.857, ask: 0.8572, mid: 0.8571 },
              ],
            },
          },
        },
      ],
    },
    tests: [
      {
        name: 'The primary answers',
        about: 'The vendor rate comes back and the secondary is never called.',
        trigger: { http: { method: 'GET', path: '/prc-fx/v1/rates?base=EUR' } },
        expect: {
          status: 200,
          bodyHas: { rates: { USD: 1.0842, GBP: 0.8571 } },
          calls: [
            { method: 'GET', path: '/sys-fx-primary/v1/rates', count: 1 },
            { method: 'GET', path: '/sys-fx-secondary/v1/rates', count: 0 },
          ],
        },
      },
      {
        name: 'The primary is down',
        about: 'The vendor System API answers 503 after its retries, so the Process API falls back to the central bank.',
        trigger: { http: { method: 'GET', path: '/prc-fx/v1/rates?base=EUR' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/sys-fx-primary/v1/rates', latencyMs: 2400, respond: { status: 503, body: { code: 'PROVIDER_UNAVAILABLE' } } }] } },
        expect: {
          status: 200,
          bodyHas: { rates: { USD: 1.0815 } },
          calls: [{ method: 'GET', path: '/sys-fx-secondary/v1/rates', count: 1 }],
          maxMs: 5000,
        },
      },
      {
        name: 'Both providers go down',
        about: 'A first call is served fresh. When both providers fail on the next call, the last rate served comes back instead of an error.',
        triggers: [
          { http: { method: 'GET', path: '/prc-fx/v1/rates?base=EUR' } },
          { afterMs: 60000, http: { method: 'GET', path: '/prc-fx/v1/rates?base=EUR' } },
        ],
        overrides: {
          systems: {
            http: [
              {
                method: 'GET',
                path: '/sys-fx-primary/v1/rates',
                latencyMs: 180,
                responses: [{ status: 200, body: { base: 'EUR', asOf: '2026-11-13T09:59:30Z', rates: { USD: 1.0842, GBP: 0.8571, JPY: 163.42 } } }, { fault: 'CONNECTIVITY' }],
              },
              { method: 'GET', path: '/sys-fx-secondary/v1/rates', respond: { fault: 'CONNECTIVITY' } },
            ],
          },
        },
        expect: { status: 200, bodyHas: { rates: { USD: 1.0842, GBP: 0.8571 } }, calls: [{ method: 'GET', path: '/sys-fx-secondary/v1/rates', count: 1 }] },
      },
      {
        name: 'The vendor blips once',
        about: 'The vendor answers 502 once. The primary System API retries and returns the rate.',
        trigger: { http: { method: 'GET', path: '/sys-fx-primary/v1/rates?base=EUR' } },
        overrides: {
          systems: {
            http: [
              {
                method: 'GET',
                path: '/marketdata/v2/spot',
                latencyMs: 140,
                responses: [
                  { status: 502, body: { message: 'Bad gateway' } },
                  { status: 200, body: { baseCcy: 'EUR', timestamp: '2026-11-13T10:00:01Z', quotes: [{ ccy: 'USD', bid: 1.0843, ask: 1.0845, mid: 1.0844 }] } },
                ],
              },
            ],
          },
        },
        expect: { status: 200, bodyHas: { rates: { USD: 1.0844 } }, calls: [{ method: 'GET', path: '/marketdata/v2/spot', count: 2 }] },
      },
      {
        name: 'The vendor stays down',
        about: 'Every vendor call times out. The System API gives up after a few quick retries instead of retrying for minutes.',
        trigger: { http: { method: 'GET', path: '/sys-fx-primary/v1/rates?base=EUR' } },
        overrides: { systems: { http: [{ method: 'GET', path: '/marketdata/v2/spot', latencyMs: 30000, respond: { status: 200, body: {} } }] } },
        expect: { error: 'MULE:RETRY_EXHAUSTED', calls: [{ method: 'GET', path: '/marketdata/v2/spot', min: 2, max: 4 }] },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'exp-treasury-portal-rates',
      why: 'The Process API already answers with a clear 503 when every source fails. Keeping that status in the Experience API is a good extra.',
    },
    {
      type: 'on-error-propagate',
      flow: 'sys-fx-primary',
      why: 'First Successful moves to the next route on any error, so the status a System API returns does not change the fallback. Clear status codes are still good practice.',
    },
    {
      type: 'on-error-propagate',
      flow: 'sys-fx-secondary',
      why: 'First Successful moves to the next route on any error, so the status a System API returns does not change the fallback. Clear status codes are still good practice.',
    },
  ],
  referenceFlow: design(
    flow(
      'exp-treasury-portal-rates',
      source('http-listener', { path: '/exp-treasury/v1/rates', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/prc-fx/v1/rates?base={base}', responseTimeout: 6000 }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ base: payload.base, rates: payload.rates, asOf: payload.asOf, warning: if (payload.stale) "Rates may be out of date" else null }',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })])],
    ),
    flow(
      'prc-fx-rates',
      source('http-listener', { path: '/prc-fx/v1/rates', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'base', value: '#[attributes.queryParams.base default "EUR"]' }),
        router('first-successful', {}, [
          route({}, [
            step('http-request', { method: 'GET', path: '/sys-fx-primary/v1/rates?base={base}', responseTimeout: 2500 }),
            step('set-variable', { variableName: 'source', value: 'primary' }),
          ]),
          route({}, [
            step('http-request', { method: 'GET', path: '/sys-fx-secondary/v1/rates?base={base}', responseTimeout: 2000 }),
            step('set-variable', { variableName: 'source', value: 'secondary' }),
          ]),
          route({}, [
            step('os-retrieve', { key: '#["fx-" ++ vars.base]', objectStore: 'fx-last-known-good' }),
            step('set-variable', { variableName: 'source', value: 'last-known-good' }),
          ]),
        ]),
        router(
          'choice',
          {},
          [route({ expression: '#[vars.source != "last-known-good"]' }, [step('os-store', { key: '#["fx-" ++ vars.base]', value: '#[payload]', objectStore: 'fx-last-known-good' })])],
        ),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  base: payload.base,\n  rates: payload.rates,\n  asOf: payload.asOf,\n  source: vars.source,\n  stale: vars.source == "last-known-good"\n}',
        }),
      ],
      [
        // The docs say First Successful "throws an error" but do not name its type, so catch broadly here.
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { code: "RATES_UNAVAILABLE", message: "No FX rate source is available" }]' }),
        ]),
      ],
    ),
    flow(
      'sys-fx-primary',
      source('http-listener', { path: '/sys-fx-primary/v1/rates', allowedMethods: 'GET' }),
      [
        scope('until-successful', { maxRetries: 2, millisBetweenRetries: 300 }, [
          step('http-request', { method: 'GET', path: '/marketdata/v2/spot?base={base}', responseTimeout: 600 }),
        ]),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  base: payload.baseCcy,\n  asOf: payload.timestamp,\n  rates: payload.quotes reduce ((q, acc = {}) -> acc ++ { (q.ccy): q.mid })\n}',
        }),
      ],
      [
        handler('on-error-propagate', { type: 'MULE:RETRY_EXHAUSTED' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })]),
        handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '502' })]),
      ],
    ),
    flow(
      'sys-fx-secondary',
      source('http-listener', { path: '/sys-fx-secondary/v1/rates', allowedMethods: 'GET' }),
      [
        step('http-request', { method: 'GET', path: '/stats/eurofxref-daily.xml', responseTimeout: 1500 }),
        step('transform', {
          script:
            '%dw 2.0\noutput application/json\n---\n{\n  base: "EUR",\n  asOf: payload.Envelope.Cube.Cube.@time,\n  rates: { (payload.Envelope.Cube.Cube.*Cube map { ($.@currency): $.@rate as Number }) }\n}',
        }),
      ],
      [handler('on-error-propagate', { type: 'ANY' }, [step('set-variable', { variableName: 'httpStatus', value: '503' })])],
    ),
  ),
  description: `
A bank's treasury portal and payment engines need **FX spot rates**. Sources:

- **Primary**: a commercial market-data vendor (REST, intraday, **flaky**: brief 502/timeouts several times an hour, usually gone within a second).
- **Secondary**: a central-bank daily reference feed (XML, very reliable, only daily rates, EUR base).
- If both are down, the business accepts the **last rate we successfully served**, clearly flagged as stale, rather than an error.

SLA: the Process API must answer within **5 s**; ~30 req/s. Callers must be able to tell where a rate came from.

**Facts**
- The treasury portal calls \`GET /exp-treasury/v1/rates?base=EUR\`. The Process API is \`GET /prc-fx/v1/rates?base=EUR\` and answers \`{ base, asOf, rates, source, stale }\`, with \`rates\` such as \`{ "USD": 1.0842 }\`. If no source and no stored rate is available, it answers **503**.
- The two System APIs are \`GET /sys-fx-primary/v1/rates?base=...\` and \`GET /sys-fx-secondary/v1/rates?base=...\`. Both answer \`{ base, asOf, rates }\`.
- The vendor API is \`GET /marketdata/v2/spot?base=...\`. It answers \`{ baseCcy, timestamp, quotes: [{ ccy, bid, ask, mid }] }\`; use the \`mid\` rate.
- The central bank publishes \`GET /stats/eurofxref-daily.xml\`: \`Envelope/Cube/Cube\` with a \`time\` attribute holds one \`Cube\` per currency, with \`currency\` and \`rate\` attributes.
- When the vendor stays down, the primary System API must give up after a few quick retries and answer 503, so the Process API still has time for its fallbacks.

**What each system sends back**
- The vendor answers **200** with:
\`\`\`json
{ "baseCcy": "EUR", "timestamp": "2026-11-13T09:59:30Z",
  "quotes": [ { "ccy": "USD", "bid": 1.0841, "ask": 1.0843, "mid": 1.0842 }, { "ccy": "GBP", "bid": 0.857, "ask": 0.8572, "mid": 0.8571 } ] }
\`\`\`
- The central bank answers XML in this shape:
\`\`\`xml
<Envelope><Cube><Cube time="2026-11-12"><Cube currency="USD" rate="1.0815"/><Cube currency="GBP" rate="0.8563"/></Cube></Cube></Envelope>
\`\`\`
- Each System API answers **200** with \`{ "base": "EUR", "asOf": "2026-11-13T09:59:30Z", "rates": { "USD": 1.0842, "GBP": 0.8571 } }\`.

**What failures look like**
- A vendor blip: it answers **502** (\`HTTP:BAD_GATEWAY\`) or does not answer within the response timeout (\`HTTP:TIMEOUT\`). Until Successful retries it; when every retry fails it raises \`MULE:RETRY_EXHAUSTED\`, which the primary System API answers with **503**.
- In the Process API, a System API that answers **503** raises \`HTTP:SERVICE_UNAVAILABLE\`, and one that is down raises \`HTTP:CONNECTIVITY\`. First Successful then tries the next route.
- Object Store Retrieve with no stored rate (and no default) raises \`OS:KEY_NOT_FOUND\`, so the last route fails too. When every route fails, First Successful raises an error; answer **503** \`{ "code": "RATES_UNAVAILABLE" }\`.

**Convention for API-led problems:** one canvas holds the whole application network. Draw each API as a separate flow whose name starts with its layer prefix (\`exp-\`, \`prc-\`, \`sys-\`), give it an HTTP Listener whose path shows the API (e.g. \`/sys-fx-primary/v1/rates\`), and let layers call each other with HTTP Request pointing at the lower API's path.

**Design the flow(s):** which layer retries, which layer falls back, how the timeouts add up, how the last-known-good value is kept, and what happens when everything fails. (Connector reconnection strategies are configuration, not canvas components: mention them in your answer.)
`,
  answerTemplate: `## Layers and responsibilities

## Retries (system layer)

## Fallback chain (process layer)

## Last-known-good

## Timeout budget

## Everything down
`,
  keyPoints: [
    'Retry where the failure is understood: the System API knows its vendor has short blips, so it retries a few times quickly (Until Successful + reconnection strategy on the connector config).',
    'Fallback is a business decision ("secondary or stale is acceptable"), so it belongs in the Process API: First Successful tries primary, then secondary, then last-known-good.',
    'Timeout budget must add up. Primary is first call + 2 retries = 3 × 600 ms, plus 2 × 300 ms waits ≈ 2.4 s. Primary + secondary 2 s + cache lookup stays under the 5 s SLA. Default retry settings (5 × 60 s) would blow it.',
    'Every fresh answer refreshes a last-known-good copy in Object Store; the response says source and stale so callers can decide.',
    'When all routes fail, First Successful throws an error, which is mapped to 503. The docs do not name its type (MULE:ROUTING is the generic routing error), so catch ANY or confirm the type in a test. Never retry at every layer, or retries multiply.',
  ],
  solution: `
\`\`\`
  exp-treasury-portal-rates                          EXPERIENCE (6 s)
             |  GET /prc-fx/v1/rates
             v
 +------------------------------------------------------------+
 | prc-fx-rates                                     PROCESS   |
 |  First Successful                                          |
 |    1. GET /sys-fx-primary/v1/rates     (2.5 s)             |
 |    2. GET /sys-fx-secondary/v1/rates   (2 s)               |
 |    3. Object Store "fx-<base>"  (last-known-good, stale)   |
 |  fresh -> Object Store store                               |
 |  all routes failed -> 503                                  |
 +------------------------------------------------------------+
           |                               |
 +----------------------------+   +----------------------------+
 | sys-fx-primary    SYSTEM   |   | sys-fx-secondary  SYSTEM   |
 | Until Successful 2 x 300ms |   | central-bank XML -> JSON   |
 |  vendor call 600 ms        |   +----------------------------+
 | RETRY_EXHAUSTED -> 503     |
 +----------------------------+
\`\`\`

**sys-fx-primary**: Until Successful (\`maxRetries 2\`, \`300 ms\`) around the vendor call (600 ms timeout); the HTTP Requester config also has a reconnection strategy for socket-level failures. \`MULE:RETRY_EXHAUSTED\` → 503. The vendor model is mapped to a canonical \`{ base, asOf, rates }\`.

**sys-fx-secondary**: maps the central-bank XML to the same canonical shape.

**prc-fx-rates**: **First Successful** with three routes; each route sets \`vars.source\`. A Choice stores fresh results as last-known-good. Transform adds \`source\` and \`stale\`. All routes failing → First Successful throws an error → 503 \`RATES_UNAVAILABLE\`.

**Why not retry in the Process API too?** Retries at several layers multiply (3 × 3 × 3 attempts) and destroy the timeout budget. Retry once, in the layer closest to the cause.
`,
  followUps: [
    {
      q: 'The primary returns HTTP 400 for an unsupported currency. Should Until Successful retry it?',
      a: 'No. A 4xx will not succeed on retry. Only retry transient errors: either map 4xx to a non-retried outcome inside the scope (e.g. treat it as a response and validate after the scope) or configure the requester so only connectivity/5xx raise errors.',
    },
    {
      q: 'Should the secondary be tried when the primary returns 404 "no rate for this currency pair"?',
      a: 'Only if the secondary could actually have the pair. Otherwise propagate a 404 from the Process API; First Successful falls back on any error, so business "not found" errors must be handled before they reach it (e.g. a Choice on the System API response).',
    },
    {
      q: 'How long may a last-known-good rate be served?',
      a: 'That is a business rule: store asOf with the value and reject (or warn louder) beyond a threshold such as 24 hours. Give the Object Store entry a TTL matching that limit.',
    },
  ],
}
