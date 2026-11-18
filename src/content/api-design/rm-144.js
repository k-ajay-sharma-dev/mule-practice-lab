export default {
  id: 'rm-144',
  category: 'api-design',
  title: 'Customer Lookup API: Find by Email Without Putting It in the URL',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'privacy', 'pii', 'search', 'request-body', 'headers', 'energy'],
  estMinutes: 20,
  description: `
Glenmoor Energy's call centre finds customers by email address. The first version of the API was \`GET /customers?email=ana.ruiz@example.com\`. A privacy review found those addresses in the API gateway access logs, the load balancer logs and the monitoring tool, because full URLs are logged in many places by default.

The new contract moves the email into a **request body**, which those tools do not log by default, and tells caches not to keep the answer.

**Requirements**
- Title \`Customer Lookup API\`, with JSON as the default media type.
- A type \`LookupRequest\` with a required string \`email\`. Give it a pattern that needs one \`@\` with text on both sides and no spaces.
- A type \`Customer\` with a required \`customerId\` (\`CU-\` and seven digits), a required string \`name\` and a required string \`email\`.
- A type \`Error\` with a required string \`message\`.
- \`POST /customers/lookup\` takes a \`LookupRequest\`. It returns a \`Customer\` with 200 and a \`Cache-Control\` response header, and an \`Error\` with 404 when no customer has that email.
- \`GET /customers/{customerId}\` returns a \`Customer\` with 200 and an \`Error\` with 404. A customer id is not personal data in the same way, so it may stay in the URL.
- \`/customers\` itself offers no \`get\`, so the old search by query string is gone.
`,
  starter: `#%RAML 1.0
title: Customer Lookup API
mediaType: application/json

types:
  Customer:
    type: object
    properties:
      customerId: string
      name: string
      email: string

/customers:
  get:
    queryParameters:
      email: string
    responses:
      200:
        body:
          type: Customer
`,
  ramlChecks: [
    {
      label: 'The title is Customer Lookup API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Customer Lookup API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'LookupRequest has a required email with a pattern that needs an @',
      rule: {
        type: 'prop',
        typeName: 'LookupRequest',
        prop: 'email',
        want: { type: 'string', required: true, pattern: { accepts: ['ana.ruiz@example.com', 'j.smith@mail.example.co.uk'], rejects: ['ana.ruiz.example.com', 'ana ruiz@example.com', '@example.com'] } },
      },
    },
    {
      label: 'Customer has a customerId of CU- and seven digits, a name and an email',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Customer', prop: 'customerId', want: { required: true, pattern: { accepts: ['CU-0042817', 'CU-9999999'], rejects: ['CU-042817', 'cu-0042817', 'CU-00428170', 'CU0042817', 'XCU-0042817'] } } },
          { type: 'prop', typeName: 'Customer', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Customer', prop: 'email', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'Error has a required string message',
      rule: { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
    },
    {
      label: 'POST /customers/lookup takes a LookupRequest and returns a Customer with Cache-Control, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/customers/lookup', method: 'post', typeIs: 'LookupRequest' },
          { type: 'response', path: '/customers/lookup', method: 'post', status: '200', typeIs: 'Customer', header: 'Cache-Control' },
          { type: 'response', path: '/customers/lookup', method: 'post', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /customers/{customerId} returns a Customer with 200 and an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/customers/{}', method: 'get', status: '200', typeIs: 'Customer' },
          { type: 'response', path: '/customers/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /customers with an email in the query string is gone',
      rule: { type: 'all', rules: [{ type: 'method', path: '/customers/lookup', method: 'post' }, { type: 'noMethod', path: '/customers', method: 'get' }] },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Customer Lookup API
version: v1
baseUri: https://api.example.com/customer-lookup/{version}
mediaType: application/json

types:
  LookupRequest:
    type: object
    properties:
      email:
        type: string
        pattern: ^[^@\\s]+@[^@\\s]+$
        maxLength: 254
    example:
      email: ana.ruiz@example.com
  Customer:
    type: object
    properties:
      customerId:
        type: string
        pattern: ^CU-[0-9]{7}$
      name: string
      email: string
    example:
      customerId: CU-0042817
      name: Ana Ruiz
      email: ana.ruiz@example.com
  Error:
    type: object
    properties:
      message: string

/customers:
  /lookup:
    post:
      description: Finds a customer by email. The email travels in the body so it stays out of URLs and access logs.
      body:
        type: LookupRequest
      responses:
        200:
          headers:
            Cache-Control:
              type: string
              example: no-store
          body:
            type: Customer
        404:
          description: No customer has this email.
          body:
            type: Error
  /{customerId}:
    get:
      responses:
        200:
          body:
            type: Customer
        404:
          body:
            type: Error
`,
  keyPoints: [
    'Full URLs, query strings included, are written to many logs by default.',
    'Personal data such as an email belongs in the body, not the URL.',
    'POST for a lookup is a choice made for privacy. The call still changes nothing.',
    'Cache-Control: no-store tells caches not to keep a response with personal data.',
    'An internal id such as a customer id can stay in the URL.',
    'Removing GET /customers stops the old search from coming back.',
  ],
  solution: `
**Where URLs end up.** The gateway, the load balancer, monitoring tools and browser history often record the full URL, query string included. Each copy is personal data that must be protected and deleted on request. Request bodies are usually not logged unless someone turns that on.

**POST for a read.** A lookup changes nothing, so GET would be the usual choice. Here POST is a deliberate trade: the email moves into the body. The description says the call is safe to repeat, so clients and reviewers do not mistake it for a create.

**No caching.** A response holding a name and an email should not sit in a shared cache. \`Cache-Control: no-store\` says so. POST responses are rarely cached anyway, but the header makes the rule explicit.

**What stays in the URL.** \`CU-0042817\` is an internal id. It means nothing outside Glenmoor, so \`GET /customers/{customerId}\` is fine once the tool has found the customer.

**The email pattern.** \`^[^@\\s]+@[^@\\s]+$\` only checks the shape. Full email validation is famously hard. The real test is whether a customer has that address.
`,
  followUps: [
    {
      q: 'Does HTTPS not already hide the query string?',
      a: 'It hides it on the network, but the URL is decrypted at the gateway and the server, which are the places that write logs.',
    },
    {
      q: 'Could the API log the request body by mistake?',
      a: 'Yes, a Logger that prints the whole payload undoes the design. Log the customer id that was found, or a masked email, never the full payload.',
    },
    {
      q: 'Someone could try many emails to find out who is a customer. How do you limit that?',
      a: 'Apply rate limiting per client, require a token for the call centre tool only, and alert on unusual volumes of 404 answers.',
    },
  ],
}
