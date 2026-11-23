import { design, flow, handler, source, step } from '../../flow/dsl.js'

const slots = { slots: [{ date: '2026-11-24', window: 'AM' }, { date: '2026-11-25', window: 'PM' }, { date: '2026-11-27', window: 'AM' }] }
const carrier = (respond, latencyMs = 400) => ({ method: 'GET', path: '/carrier/slots/{postcode}', latencyMs, respond })
const ask = (postcode = 'LS14AP') => ({ http: { method: 'GET', path: `/delivery-dates/${postcode}` } })

export default {
  id: 'fl-133',
  category: 'flows',
  title: 'Delivery Dates From a Slow Carrier: 504 After Three Seconds, 502 When the Carrier Fails, 404 for an Unknown Postcode',
  level: 'INTERMEDIATE',
  tags: ['http-request', 'timeout', 'http-status', 'error-handling', 'gateway', 'retail'],
  estMinutes: 25,
  flowChecks: [
    {
      label: 'The API is a GET on /delivery-dates/{postcode}',
      rule: { type: 'source', component: 'http-listener', where: { path: '/delivery-dates/{postcode}', allowedMethods: 'GET' } },
    },
    {
      label: 'The carrier call gives up after at most 3 seconds',
      rule: { type: 'exists', component: 'http-request', where: { path: 'slots', responseTimeout: { gte: 500, lte: 3000 } } },
    },
    {
      label: 'A carrier timeout answers 504',
      rule: { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'TIMEOUT' }, where: { variableName: 'httpStatus', value: '504' } },
    },
    {
      label: 'A carrier that cannot be reached answers 502',
      rule: { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'CONNECTIVITY' }, where: { variableName: 'httpStatus', value: '502' } },
    },
    {
      label: 'A postcode the carrier does not serve answers 404, not 502',
      rule: { type: 'inside', component: 'set-variable', within: ['on-error-propagate', 'on-error-continue'], withinWhere: { type: 'NOT_FOUND' }, where: { variableName: 'httpStatus', value: '404' } },
    },
  ],
  simulation: {
    systems: { http: [carrier({ status: 200, body: slots })] },
    tests: [
      {
        name: 'A postcode with delivery slots',
        about: 'The carrier answers in 400 ms. The shop gets 200 with the three dates.',
        trigger: ask(),
        expect: { status: 200, bodyHas: { postcode: 'LS14AP', dates: ['2026-11-24', '2026-11-25', '2026-11-27'] } },
      },
      {
        name: 'The carrier takes 8 seconds',
        about: 'The carrier is overloaded. After 3 seconds the shop gets 504 with the code CARRIER_TIMEOUT, and the checkout page can show its fallback text.',
        trigger: ask(),
        overrides: { systems: { http: [carrier({ status: 200, body: slots }, 8000)] } },
        expect: { status: 504, bodyHas: { code: 'CARRIER_TIMEOUT' }, maxMs: 3500 },
      },
      {
        name: 'The carrier is down',
        about: 'The connection is refused. The shop gets 502 with the code CARRIER_UNAVAILABLE.',
        trigger: ask(),
        overrides: { systems: { http: [carrier({ fault: 'CONNECTIVITY' })] } },
        expect: { status: 502, bodyHas: { code: 'CARRIER_UNAVAILABLE' } },
      },
      {
        name: 'The carrier answers 500',
        about: 'The carrier has an internal error. That is still the carrier failing, so the shop gets 502, not 500.',
        trigger: ask(),
        overrides: { systems: { http: [carrier({ status: 500, body: { error: 'internal' } })] } },
        expect: { status: 502, bodyHas: { code: 'CARRIER_UNAVAILABLE' } },
      },
      {
        name: 'A postcode the carrier does not serve',
        about: 'The carrier answers 404 for an island postcode. The shop gets 404 with the code POSTCODE_NOT_SERVED, so the page can offer collection instead.',
        trigger: ask('ZE29XY'),
        overrides: { systems: { http: [carrier({ status: 404, body: { error: 'unknown postcode' } })] } },
        expect: { status: 404, bodyHas: { code: 'POSTCODE_NOT_SERVED' } },
      },
    ],
  },
  referenceFlow: design(
    flow(
      'delivery-dates',
      source('http-listener', { path: '/delivery-dates/{postcode}', allowedMethods: 'GET' }),
      [
        step('set-variable', { variableName: 'postcode', value: '#[attributes.uriParams.postcode]' }),
        step('http-request', { method: 'GET', path: '#["/carrier/slots/" ++ vars.postcode]', responseTimeout: 3000 }),
        step('set-payload', { value: '#[output application/json --- { postcode: vars.postcode, dates: payload.slots map $.date }]' }),
      ],
      [
        handler('on-error-propagate', { type: 'HTTP:TIMEOUT' }, [
          step('set-variable', { variableName: 'httpStatus', value: '504' }),
          step('set-payload', { value: '#[output application/json --- { code: "CARRIER_TIMEOUT", message: "Delivery dates are not available right now." }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:NOT_FOUND' }, [
          step('set-variable', { variableName: 'httpStatus', value: '404' }),
          step('set-payload', { value: '#[output application/json --- { code: "POSTCODE_NOT_SERVED", message: "We cannot deliver to this postcode." }]' }),
        ]),
        handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE' }, [
          step('set-variable', { variableName: 'httpStatus', value: '502' }),
          step('set-payload', { value: '#[output application/json --- { code: "CARRIER_UNAVAILABLE", message: "Delivery dates are not available right now." }]' }),
        ]),
      ],
    ),
  ),
  description: `
A furniture retailer shows delivery dates on the checkout page. The page calls one API:

\`GET /delivery-dates/{postcode}\`, such as \`/delivery-dates/LS14AP\`

The dates come from the delivery carrier: \`GET /carrier/slots/{postcode}\` answers \`{ "slots": [ { "date": "2026-11-24", "window": "AM" }, ... ] }\`. It answers **404** for a postcode it does not deliver to.

Last Black Friday the carrier slowed to 20 seconds an answer. The checkout page waited, shoppers gave up, and the API logged every failure as a 500, so nobody could tell a slow carrier from a bug in the API.

**Requirements**
- Answer **200** with \`{ "postcode", "dates": [ ... ] }\`.
- Wait for the carrier **3 seconds** at most. A timeout answers **504** with \`{ "code": "CARRIER_TIMEOUT" }\`.
- A carrier that refuses the connection, or answers with a 5xx error, answers **502** with \`{ "code": "CARRIER_UNAVAILABLE" }\`.
- A postcode the carrier does not serve answers **404** with \`{ "code": "POSTCODE_NOT_SERVED" }\`.
- A 500 from this API should mean a fault in this API, nothing else.

**How the status gets out:** assume the listener's response status is \`#[vars.httpStatus default 200]\` and its body is \`#[payload]\`, also when an error handler built the answer.

**Design the flow.** Explain the difference between 502 and 504.

**What failures look like**
- No answer within the response timeout: the HTTP Request raises \`HTTP:TIMEOUT\`.
- The connection is refused: \`HTTP:CONNECTIVITY\`. The carrier answers **500**: \`HTTP:INTERNAL_SERVER_ERROR\` (a 503 would be \`HTTP:SERVICE_UNAVAILABLE\`).
- The carrier answers **404** \`{ "error": "unknown postcode" }\`: \`HTTP:NOT_FOUND\`.
`,
  answerTemplate: `## The endpoint and the carrier call

## The timeout

## Mapping the carrier's failures

## 502 or 504
`,
  keyPoints: [
    'Set the Response timeout on the HTTP Request. Without it the call waits for the default timeout, which is longer than a shopper will wait.',
    'A call that runs out of time raises HTTP:TIMEOUT. Map it to 504 Gateway Timeout.',
    'A refused connection raises HTTP:CONNECTIVITY, and a 5xx answer raises an error such as HTTP:INTERNAL_SERVER_ERROR. Map those to 502 Bad Gateway.',
    'A 404 from the carrier means something real about the postcode, so pass it on as a 404 with a clear code.',
    '502 and 504 tell the caller, and the monitoring, that the fault is upstream. A 500 is left for faults in this API.',
    'Keep the postcode in a variable, because the HTTP Request replaces the attributes and the payload.',
  ],
  solution: `
1. **HTTP Listener**: \`GET /delivery-dates/{postcode}\`.
2. **Set Variable** \`postcode\` = \`#[attributes.uriParams.postcode]\`.
3. **HTTP Request** \`GET\` \`#["/carrier/slots/" ++ vars.postcode]\`, **Response timeout** \`3000\`.
4. **Set Payload**: \`{ postcode: vars.postcode, dates: payload.slots map $.date }\`.
5. **Error handling**:
   - **On Error Propagate** \`HTTP:TIMEOUT\`: \`httpStatus\` = \`504\`, code \`CARRIER_TIMEOUT\`.
   - **On Error Propagate** \`HTTP:NOT_FOUND\`: \`httpStatus\` = \`404\`, code \`POSTCODE_NOT_SERVED\`.
   - **On Error Propagate** \`HTTP:CONNECTIVITY, HTTP:INTERNAL_SERVER_ERROR, HTTP:SERVICE_UNAVAILABLE\`: \`httpStatus\` = \`502\`, code \`CARRIER_UNAVAILABLE\`.

**502 or 504.** Both say "the system behind me failed". 504 Gateway Timeout says it did not answer in time. 502 Bad Gateway says it answered badly or could not be reached. The checkout page treats both the same way, but the team looking at the dashboard on Black Friday knows at once whether the carrier is slow or broken.

**Why not one handler for ANY.** A single handler would turn the unknown postcode into a 502, and a shopper on an island would be told to try again later for ever.
`,
  followUps: [
    {
      q: 'Should the API retry the carrier once before answering 504?',
      a: 'Not inside a 3 second budget. A second try of a call that already took 3 seconds doubles the wait. A short cache of recent answers per postcode helps more.',
    },
    {
      q: 'Where else does a timeout need setting?',
      a: 'At every hop. If the web shop gives up after 2 seconds, a 3 second timeout here holds a thread for an answer nobody will read. Each caller should wait a little longer than what it calls.',
    },
  ],
}
