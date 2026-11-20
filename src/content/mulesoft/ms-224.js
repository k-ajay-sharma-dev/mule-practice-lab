export default {
  id: 'ms-224',
  category: 'mulesoft',
  title: 'Building an HTTP Request: URI Parameters, Query Parameters, Headers and the Response',
  level: 'INTERMEDIATE',
  tags: ['http-request', 'http', 'uri-params', 'query-params', 'headers', 'error-handling', 'telecom'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'The request path is `/customers/{customerId}/sims`. Where does the value for `customerId` go?',
      options: [
        'In `http:uri-params`, as a map',
        'In `http:query-params`, as a map',
        'In `http:headers`, as a map',
        'In the payload, as a field',
      ],
      answer: 0,
      explain: 'A name in curly brackets in the path is a URI parameter, set for example with `#[{ customerId: vars.customerId }]`. The connector puts the value into the path and encodes it.',
    },
    {
      type: 'single',
      prompt: 'A developer builds the path as `#["/sims?status=" ++ vars.status ++ "&plan=" ++ vars.plan]`. A plan is called `Family & Friends`. What goes wrong?',
      options: [
        'Nothing, because the connector encodes the whole path',
        'The connector sends the query string as the request body',
        'The `&` splits the value, so the server sees an extra parameter',
        'The connector rejects the path, and the app fails to start',
      ],
      answer: 2,
      explain: 'Text joined by hand is not encoded, so the server sees a plan called `Family ` and a stray parameter. Put the values in `http:query-params` as a map, and the connector encodes each value for you.',
    },
    {
      type: 'single',
      prompt: 'With the default settings, the server answers 404. What does the HTTP Request operation do?',
      options: [
        'Sets the payload to the 404 body and goes on',
        'Raises `HTTP:NOT_FOUND`',
        'Retries three times, then goes on',
        'Raises `HTTP:CONNECTIVITY`',
      ],
      answer: 1,
      explain: 'By default, status codes from 200 to 399 count as success. Others raise an error that matches the status, such as `HTTP:NOT_FOUND`.',
    },
    {
      type: 'single',
      prompt: 'For a SIM lookup, 404 is a normal answer that means "no such SIM". What is a clean way to handle it?',
      options: [
        'Catch every error with an On Error Continue',
        'Wrap the call in Until Successful so 404 is retried',
        'Change the method to HEAD so no body comes back',
        'Add 404 to the success codes and branch on the status',
      ],
      answer: 3,
      explain: 'A response validator such as `values="200..299,404"` makes 404 a success. A Choice on `attributes.statusCode` then handles it, and other errors still raise.',
    },
    {
      type: 'single',
      prompt: 'After the request, where is the status code of the response?',
      options: ['`attributes.statusCode`', '`payload.statusCode`', '`vars.statusCode`', '`error.statusCode`'],
      answer: 0,
      explain: 'The response body becomes the payload. The status code and headers sit in the attributes.',
    },
    {
      type: 'match',
      prompt: 'Match each value to where it belongs on the request.',
      pairs: [
        ['The customer id in /customers/{customerId}', 'URI parameter'],
        ['status=ACTIVE to filter the list', 'Query parameter'],
        ['An x-correlation-id for tracing', 'Header'],
      ],
      explain: 'The path names the resource, the query filters it, and headers carry data about the call itself.',
    },
  ],
  description: `
Corvid Mobile is a phone network. Its Process API for the customer app calls a SIM System API to list a customer's SIMs, with filters for status and plan. The first version had three faults:

- Plans with an \`&\` or a space in their name returned the wrong SIMs.
- A customer with no SIMs got a 500, because the System API answers 404 and the flow did not expect an error.
- The correlation id was lost, so the two apps' logs could not be joined.

**Questions**
1. How do you set URI parameters, query parameters and headers on an HTTP Request?
2. Why should you not join query strings by hand?
3. What does the request do with each kind of status code by default, and how do you treat 404 as a normal answer?
4. Where are the body, status code and headers after the call, and what happens to the old payload?
`,
  answerTemplate: `## Parameters and headers

## Why not join strings

## Status codes

## After the call
`,
  keyPoints: [
    'http:uri-params fills the {names} in the path. http:query-params and http:headers take DataWeave maps.',
    'The connector encodes parameter values. Text joined by hand is not encoded.',
    'By default, 200 to 399 is success. Other codes raise errors such as HTTP:NOT_FOUND.',
    'A success status code validator can make 404 a normal answer. Then branch on attributes.statusCode.',
    'The response body replaces the payload. Status and headers are in the attributes.',
    'Pass the correlation id on as a header so logs can be joined across apps.',
  ],
  solution: `
**1. Parameters and headers.** The path is \`/customers/{customerId}/sims\`. The request has three maps:
- \`http:uri-params\`: \`#[{ customerId: vars.customerId }]\`
- \`http:query-params\`: \`#[{ status: attributes.queryParams.status, plan: attributes.queryParams.plan }]\`
- \`http:headers\`: \`#[{ 'x-correlation-id': correlationId }]\`

**2. Joining by hand.** The connector encodes each parameter value, so \`Family & Friends\` arrives as one value. A string built with \`++\` is sent as written, so the \`&\` starts a new parameter. Maps also read more clearly in review, and a null value can be left out with a conditional key.

**3. Status codes.** With the default validator, 200 to 399 is success. Anything else raises an error named after the status, such as \`HTTP:NOT_FOUND\` or \`HTTP:SERVICE_UNAVAILABLE\`. A timeout raises \`HTTP:TIMEOUT\`, and a refused connection \`HTTP:CONNECTIVITY\`. For this call, a 404 means "no SIMs", so a success status code validator with \`200..299,404\` makes it a normal answer. A Choice on \`attributes.statusCode\` returns an empty list for 404. A 500 from the System API still raises and is handled as a real failure.

**4. After the call.** The response body is the new payload, and \`attributes.statusCode\` and \`attributes.headers\` describe the response. The old payload is gone. If the flow still needs it, put the response in a target variable instead.
`,
  followUps: [
    {
      q: 'A filter is optional. How do you leave it out when the caller did not send it?',
      a: 'Use a conditional key in the map: `(plan: attributes.queryParams.plan) if (attributes.queryParams.plan != null)`. The connector then sends no `plan` parameter at all.',
    },
    {
      q: 'Where do the host, port and base path go?',
      a: 'In the HTTP Request configuration, filled from property placeholders per environment. The operation keeps only the path relative to that base, so the same flow works in every environment.',
    },
    {
      q: 'How would you test the 404 path in MUnit?',
      a: 'Mock the HTTP Request to return an empty body with a status code of 404 in its attributes, then assert that the flow returns an empty list and a 200 to the app.',
    },
  ],
}
