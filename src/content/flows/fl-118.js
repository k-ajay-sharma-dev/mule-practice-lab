import { handlerStatus } from '../../flow/rules.js'
import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-118',
  category: 'flows',
  title: 'Store Locator Geocoding with First Successful: Fall Back on Outages, Not on an Unknown Address',
  level: 'INTERMEDIATE',
  tags: ['first-successful', 'routers', 'fallback', 'http-request', 'http-status', 'error-handling', 'retail'],
  estMinutes: 25,
  flowChecks: [
    { label: 'An HTTP Listener accepts GET requests', rule: { type: 'source', component: 'http-listener', where: { allowedMethods: 'GET' } } },
    {
      label: 'First Successful has two routes: the primary provider first, then the backup',
      rule: {
        type: 'all',
        rules: [
          { type: 'routes', component: 'first-successful', min: 2 },
          { type: 'inside', component: 'http-request', within: 'first-successful', where: { path: 'primary' } },
          { type: 'inside', component: 'http-request', within: 'first-successful', where: { path: 'backup' } },
          { type: 'before', first: 'http-request', firstWhere: { path: 'primary' }, then: 'http-request', thenWhere: { path: 'backup' } },
        ],
      },
    },
    {
      label: 'The primary call times out within 2 seconds, so the backup still has time',
      rule: { type: 'exists', component: 'http-request', where: { path: 'primary', responseTimeout: { gte: 1, lte: 2000 } } },
    },
    {
      label: 'A 404 (HTTP:NOT_FOUND) is caught inside the routes, so an unknown address does not fall through to the backup',
      rule: { type: 'inside', component: 'on-error-continue', within: 'first-successful', where: { type: 'NOT_FOUND' }, min: 2 },
    },
    {
      label: 'No catch-all or timeout handler inside the routes, so outages still move on to the next route',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'http-request', within: 'first-successful' },
          {
            type: 'absent',
            component: 'on-error-continue',
            within: 'first-successful',
            where: { type: { oneOf: ['ANY', 'TIMEOUT', 'CONNECTIVITY', 'SERVICE_UNAVAILABLE'] } },
          },
        ],
      },
    },
    {
      label: 'An unknown address returns 404 from a Choice after the router',
      rule: {
        type: 'all',
        rules: [
          { type: 'before', first: 'first-successful', then: 'choice', outside: true },
          { type: 'inside', component: 'set-variable', within: 'choice', where: { value: '404' } },
        ],
      },
    },
    { label: 'When both providers fail, the API returns 503', rule: handlerStatus('ANY', '503') },
  ],
  referenceFlow: design(
    flow(
      'geocode-api',
      source('http-listener', { path: '/geocode', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'address', value: '#[attributes.queryParams.address]' }),
        router('first-successful', {}, [
          route({}, [
            scope('try', {}, [step('http-request', { method: 'GET', path: '/primary-geo/v1/geocode', responseTimeout: 1500 })], {
              errorHandlers: [handler('on-error-continue', { type: 'HTTP:NOT_FOUND' }, [step('set-payload', { value: '#[{ found: false }]' })])],
            }),
            step('set-variable', { variableName: 'provider', value: 'primary' }),
          ]),
          route({}, [
            scope('try', {}, [step('http-request', { method: 'GET', path: '/backup-geo/v2/search', responseTimeout: 3000 })], {
              errorHandlers: [handler('on-error-continue', { type: 'HTTP:NOT_FOUND' }, [step('set-payload', { value: '#[{ found: false }]' })])],
            }),
            step('set-variable', { variableName: 'provider', value: 'backup' }),
          ]),
        ]),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.found == false]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '404' }),
              step('set-payload', { value: '#[{ error: "ADDRESS_NOT_FOUND", address: vars.address }]' }),
            ]),
          ],
          {
            otherwise: [
              step('transform', {
                script: '%dw 2.0\noutput application/json\n---\n{ lat: payload.lat default payload.location.latitude, lon: payload.lon default payload.location.longitude, provider: vars.provider }',
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'ANY' }, [
          step('logger', { level: 'ERROR', message: '#["Both geocoding providers failed: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[{ error: "GEOCODING_UNAVAILABLE" }]' }),
        ]),
      ],
    ),
  ),
  description: `
A home improvement chain has a store locator. The website calls \`GET /geocode?address=...\` and then shows the nearest stores.

Two geocoding providers are under contract:
- **Primary:** \`GET /primary-geo/v1/geocode\`. Cheap, answers in about 300 ms, but has a few short outages each week.
- **Backup:** \`GET /backup-geo/v2/search\`. Costs **8 times more** per call and answers in about 900 ms.

Both answer **404** when they cannot find the address.

The website gives the locator **5 seconds** in total.

Last month finance found that the backup bill had tripled. The cause: the flow used **First Successful**, and every misspelt address got a 404 from the primary. First Successful treated the 404 as a failure and tried the backup, which also returned 404.

**First Successful** tries its routes in order. A route counts as failed when it raises an error. The router stops at the first route that ends without an error.

**Requirements**
- Use the backup only when the primary is down, slow or failing.
- An unknown address returns **404** to the website with \`ADDRESS_NOT_FOUND\`, and costs at most one primary call.
- Return \`lat\`, \`lon\` and which provider answered.
- If both providers fail, return **503**.

**Design the flow.**
`,
  answerTemplate: `## Trigger

## The two routes

## Why a 404 must not fall through

## Timeouts

## Responses: 200, 404 and 503
`,
  keyPoints: [
    'First Successful moves to the next route on any error, including a business answer such as 404.',
    'Catch HTTP:NOT_FOUND inside each route with a Try and On Error Continue, so the route succeeds with found: false.',
    'Do not catch timeouts, connectivity errors or ANY inside the routes, or the backup will never be used.',
    'A short timeout on the primary leaves time for the backup inside the 5 second budget: 1.5 plus 3 seconds is 4.5 seconds.',
    'After the router, a Choice turns found: false into a 404 response.',
    'When every route fails, First Successful raises an error. A flow handler maps it to 503.',
  ],
  solution: `
1. **HTTP Listener**, path \`/geocode\`, method \`GET\`. **Set Variable** \`address\` from the query parameter.
2. **First Successful** with two routes:
   - **Route 1:** **Try** around **HTTP Request** \`GET /primary-geo/v1/geocode\`, response timeout 1500 ms. **On Error Continue** for \`HTTP:NOT_FOUND\` sets the payload to \`{ found: false }\`. Then **Set Variable** \`provider\` = \`primary\`.
   - **Route 2:** the same for \`GET /backup-geo/v2/search\`, timeout 3000 ms, \`provider\` = \`backup\`.
3. **Choice** after the router:
   - \`payload.found == false\`: set \`httpStatus\` to 404 and the body \`{ error: "ADDRESS_NOT_FOUND" }\`.
   - Otherwise: **Transform** to \`{ lat, lon, provider }\`. The two providers use different field names, so the mapping reads both shapes.
4. **On Error Propagate** for \`ANY\` on the flow: log, set \`httpStatus\` to 503 and the body \`{ error: "GEOCODING_UNAVAILABLE" }\`.

**How each case runs**
| Case | Primary | Backup | Answer |
|---|---|---|---|
| Normal | 200 | not called | 200, provider primary |
| Unknown address | 404, caught | not called | 404 |
| Primary down or slow | error | 200 | 200, provider backup |
| Both down | error | error | 503 |

The HTTP Listener response uses \`vars.httpStatus default 200\` as the status code.
`,
  followUps: [
    {
      q: 'The primary sometimes answers 200 with an empty result list during heavy load. How do you send that to the backup?',
      a: 'Add a Validation step after the primary call that fails when the list is empty. The validation error makes the route fail, so First Successful tries the backup.',
    },
    {
      q: 'Why not use Scatter-Gather and take the faster answer?',
      a: 'Scatter-Gather calls both providers every time and waits for both. That pays for the expensive backup on every request.',
    },
    {
      q: 'Which error type does First Successful raise when all routes fail?',
      a: 'The docs only say that it raises an error. Catch ANY on the flow, or confirm the type in an MUnit test before naming it.',
    },
    {
      q: 'The primary is down for an hour. Every request still waits 1.5 seconds first. How do you avoid that?',
      a: 'Add a circuit breaker. After several failures, store a flag in the Object Store with a time to live, and skip the primary route while it is set.',
    },
  ],
}
