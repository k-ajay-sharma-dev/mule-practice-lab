export default {
  id: 'rm-009',
  category: 'api-design',
  title: 'SIM Swap API: A Required Correlation Id Header',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'headers', 'correlation-id', 'telecom'],
  estMinutes: 12,
  description: `
A mobile network runs a chain of APIs behind its customer app. When a SIM swap fails, support staff cannot follow the request through the logs of each system.

A **correlation id** is a value the caller sends with a request. Every system logs it and passes it on, so one search finds the whole journey of that request.

It travels in a **request header**, a named value sent alongside the request. In RAML you list these under \`headers\` on a method. Like parameters, headers are required unless you say otherwise. Note that \`headers\` cannot sit on a resource, so each method needs it. A trait, which you can apply to several methods with \`is\`, is also fine here.

**Requirements**
- \`GET /subscribers/{msisdn}\` requires a string header \`X-Correlation-ID\`. It returns 200, or 404.
- \`POST /subscribers/{msisdn}/sim-swaps\` requires the same header. It returns 202, because the swap finishes later.
- The 200 and the 202 both send \`X-Correlation-ID\` back as a response header, so a caller can match answers to requests.
- \`POST /subscribers/{msisdn}/sim-swaps\` also returns 400 when the header is missing.
`,
  starter: `#%RAML 1.0
title: SIM Swap API
mediaType: application/json

/subscribers:
  /{msisdn}:
    get:
`,
  ramlChecks: [
    {
      label: 'GET /subscribers/{msisdn} requires a string X-Correlation-ID header',
      rule: { type: 'param', path: '/subscribers/{}', method: 'get', in: 'header', name: 'X-Correlation-ID', want: { type: 'string', required: true } },
    },
    {
      label: 'POST /subscribers/{msisdn}/sim-swaps requires a string X-Correlation-ID header',
      rule: { type: 'param', path: '/subscribers/{}/sim-swaps', method: 'post', in: 'header', name: 'X-Correlation-ID', want: { type: 'string', required: true } },
    },
    { label: 'The 200 sends X-Correlation-ID back', rule: { type: 'response', path: '/subscribers/{}', method: 'get', status: '200', header: 'X-Correlation-ID' } },
    { label: 'GET /subscribers/{msisdn} returns 404 for an unknown number', rule: { type: 'response', path: '/subscribers/{}', method: 'get', status: '404' } },
    { label: 'The 202 sends X-Correlation-ID back', rule: { type: 'response', path: '/subscribers/{}/sim-swaps', method: 'post', status: '202', header: 'X-Correlation-ID' } },
    { label: 'POST /subscribers/{msisdn}/sim-swaps returns 400 when the header is missing', rule: { type: 'response', path: '/subscribers/{}/sim-swaps', method: 'post', status: '400' } },
  ],
  referenceRaml: `#%RAML 1.0
title: SIM Swap API
mediaType: application/json

/subscribers:
  /{msisdn}:
    get:
      headers:
        X-Correlation-ID:
          type: string
          description: Identifies this request across all systems.
      responses:
        200:
          description: The subscriber.
          headers:
            X-Correlation-ID:
              type: string
        404:
          description: No subscriber has this number.
    /sim-swaps:
      post:
        headers:
          X-Correlation-ID:
            type: string
            description: Identifies this request across all systems.
        responses:
          202:
            description: The swap was accepted and will finish later.
            headers:
              X-Correlation-ID:
                type: string
          400:
            description: The X-Correlation-ID header is missing.
`,
  keyPoints: [
    'Request headers go under headers on a method. Response headers go under headers in a response.',
    'A header is required unless its name ends with a question mark.',
    'A correlation id lets one search find a request in the logs of every system it touched.',
    '202 means the request was accepted but the work is not finished yet.',
  ],
  solution: `
The header has no question mark, so it is required. Making it optional would defeat the purpose, because the requests you most need to trace are often the ones that left it out.

It appears twice per method, and these are two different things. Under the method it is what the caller must send. Under the response it is what the API promises to send back.

A trait holding the request header would also work, and it would save repeating it as the API grows.
`,
  followUps: [
    {
      q: 'Why use a header and not a query parameter for the correlation id?',
      a: 'It describes the request, not the data being asked for. A header leaves the URL clean, and it works the same way on every method, including a POST with a body.',
    },
    {
      q: 'What should happen if a system in the middle gets a request with no correlation id?',
      a: 'At the edge of your platform you can either refuse it with a 400 or create one. Inside the platform every call passes the same value on, and never makes a new one.',
    },
    {
      q: 'How would you avoid repeating this header on fifty methods?',
      a: 'Put it in a trait and apply the trait with is. A trait can sit on a resource, so it reaches all the methods there, even though headers itself cannot.',
    },
  ],
}
