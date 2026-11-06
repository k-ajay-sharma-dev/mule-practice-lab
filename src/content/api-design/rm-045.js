export default {
  id: 'rm-045',
  category: 'api-design',
  title: 'Flight Status API: Rate Limits in a Trait',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'rate-limiting', 'traits', 'headers', 'status-codes', 'airline'],
  estMinutes: 20,
  description: `
An airline offers flight status to travel partners. One partner polled every second and slowed the service for everyone, so the gateway now applies a **rate limit**, a cap on how many calls a client can make in a period.

When a client goes over the limit, the API answers with status **429 Too Many Requests**. Good clients need to know what to do next, so the response carries two headers:
- \`Retry-After\`: how many seconds to wait before calling again. This is a standard HTTP header.
- \`X-RateLimit-Remaining\`: how many calls the client has left in the current period. This one is a common convention, not a standard.

Every method can return this response, so it belongs in a **trait**, a reusable block of method parts that a method applies with \`is\`.

**Requirements**
- A type \`RateLimitError\` has the required strings \`code\` and \`message\`.
- A type \`Flight\` has the required strings \`flightNumber\` and \`status\`.
- A trait \`rateLimited\` declares a 429 response with the \`Retry-After\` and \`X-RateLimit-Remaining\` response headers, and a \`RateLimitError\` body.
- \`GET /flights\` returns \`Flight[]\` with status 200 and uses \`rateLimited\`.
- \`GET /flights/{flightNumber}\` returns a \`Flight\` with status 200, or 404, and uses \`rateLimited\`.
`,
  starter: `#%RAML 1.0
title: Flight Status API
mediaType: application/json

types:

traits:

/flights:
`,
  ramlChecks: [
    {
      label: 'RateLimitError has a required code and message',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RateLimitError', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'RateLimitError', prop: 'message', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Flight has a required flightNumber and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Flight', prop: 'flightNumber', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Flight', prop: 'status', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'The rateLimited trait holds the 429 response and its headers', rule: { type: 'trait', name: 'rateLimited', has: 'responses.429.headers' } },
    { label: 'The 429 response has a Retry-After header', rule: { type: 'response', path: '/flights', method: 'get', status: '429', header: 'Retry-After' } },
    { label: 'The 429 response has an X-RateLimit-Remaining header', rule: { type: 'response', path: '/flights', method: 'get', status: '429', header: 'X-RateLimit-Remaining' } },
    { label: 'The 429 response returns a RateLimitError', rule: { type: 'response', path: '/flights', method: 'get', status: '429', typeIs: 'RateLimitError' } },
    { label: 'GET /flights returns Flight[]', rule: { type: 'response', path: '/flights', method: 'get', status: '200', typeIs: 'Flight[]' } },
    { label: 'GET /flights uses rateLimited', rule: { type: 'applied', path: '/flights', method: 'get', trait: 'rateLimited' } },
    {
      label: 'GET /flights/{flightNumber} returns a Flight, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/flights/{}', method: 'get', status: '200', typeIs: 'Flight' },
          { type: 'response', path: '/flights/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'GET /flights/{flightNumber} uses rateLimited', rule: { type: 'applied', path: '/flights/{}', method: 'get', trait: 'rateLimited' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Flight Status API
mediaType: application/json

types:
  RateLimitError:
    type: object
    properties:
      code: string
      message: string
  Flight:
    type: object
    properties:
      flightNumber: string
      status: string

traits:
  rateLimited:
    responses:
      429:
        description: Too many calls. Wait before calling again.
        headers:
          Retry-After:
            type: integer
            description: Seconds to wait before the next call.
          X-RateLimit-Remaining:
            type: integer
            description: Calls left in the current period.
        body:
          type: RateLimitError

/flights:
  get:
    is: [ rateLimited ]
    responses:
      200:
        body:
          type: Flight[]
  /{flightNumber}:
    get:
      is: [ rateLimited ]
      responses:
        200:
          body:
            type: Flight
        404:
          description: No flight has this number.
`,
  keyPoints: [
    '429 Too Many Requests is the status for a client that went over its limit.',
    'Retry-After tells a client when to try again, so it does not retry at once and make things worse.',
    'A response header sits under headers inside the response, not on the method. A header on the method is a request header.',
    'A trait can hold whole responses, so one change reaches every method that uses it.',
  ],
  solution: `
The 429 is the same on every method, so it lives once in \`rateLimited\`. Each method applies it with \`is\`, and its own 200 or 404 merges with what the trait brings.

The headers sit inside the 429 response. A \`headers\` key directly on the trait would describe headers the client must send, which is the wrong direction.

\`Retry-After\` is what turns a hard failure into a pause. A client that reads it waits the right time, and one that ignores it keeps hitting the limit.
`,
  followUps: [
    {
      q: 'Who enforces the limit, the RAML or something else?',
      a: 'The RAML only describes it. In Anypoint, a Rate Limiting or Spike Control policy on API Manager enforces the limit at the gateway.',
    },
    {
      q: 'Why not return 503 when a client is over its limit?',
      a: '503 says the service has a problem. 429 says this client sent too much, so the client knows that the fix is on its own side.',
    },
    {
      q: 'What should a client do when it receives a 429?',
      a: 'Stop calling, wait for the Retry-After period, then try again. Adding backoff with a little random delay stops many clients returning at the same moment.',
    },
  ],
}
