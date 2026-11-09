export default {
  id: 'rm-072',
  category: 'api-design',
  title: 'Parcel Lockers API: One Header Trait on Every Method',
  level: 'BEGINNER',
  tags: ['raml', 'api-design', 'traits', 'headers', 'correlation-id', 'logistics'],
  estMinutes: 12,
  description: `
A parcel locker network runs 3,500 lockers. A failed pickup crosses the courier app, the locker API and the controller inside the locker. Support can only follow it when every call carries the same \`X-Correlation-ID\` header, so the header must be required on every method.

You will put the header in a trait. A trait can be applied on a method, or on a **resource** with \`is\` written beside the methods. A trait on a resource applies to every method of that resource, so a new method cannot forget it.

**Requirements**
- Title \`Parcel Lockers API\`, with JSON as the default media type.
- A trait \`traced\` with a required string header \`X-Correlation-ID\` that has the pattern \`^[0-9a-f-]{36}$\`.
- \`/lockers\` has \`get\`, which returns 200, and \`post\`, which returns 201.
- \`/lockers/{lockerId}\` has \`get\`, which returns 200 or 404, and \`delete\`, which returns 204 with no body.
- All four methods carry the \`traced\` trait. Applying it on each resource is the cleanest way.
`,
  starter: `#%RAML 1.0
title: Parcel Lockers API
mediaType: application/json

traits:
  traced:

/lockers:
  get:
  post:
  /{lockerId}:
    get:
    delete:
`,
  ramlChecks: [
    { label: 'The traced trait declares the X-Correlation-ID header', rule: { type: 'trait', name: 'traced', has: 'headers.X-Correlation-ID' } },
    {
      label: 'GET /lockers needs X-Correlation-ID as a required string with the id pattern',
      rule: {
        type: 'param',
        path: '/lockers',
        method: 'get',
        in: 'header',
        name: 'X-Correlation-ID',
        want: { type: 'string', required: true, pattern: { accepts: ['3f2b1c9e-8a7d-4e21-9c55-0b6a1d2e3f40'], rejects: ['abc', '3f2b1c9e8a7d4e219c550b6a1d2e3f40'] } },
      },
    },
    { label: 'GET /lockers is traced', rule: { type: 'applied', path: '/lockers', method: 'get', trait: 'traced' } },
    { label: 'POST /lockers is traced and returns 201', rule: { type: 'all', rules: [{ type: 'applied', path: '/lockers', method: 'post', trait: 'traced' }, { type: 'response', path: '/lockers', method: 'post', status: '201' }] } },
    { label: 'GET /lockers/{lockerId} is traced', rule: { type: 'applied', path: '/lockers/{}', method: 'get', trait: 'traced' } },
    { label: 'DELETE /lockers/{lockerId} is traced', rule: { type: 'applied', path: '/lockers/{}', method: 'delete', trait: 'traced' } },
    {
      label: 'GET /lockers returns 200, and GET /lockers/{lockerId} returns 200 or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/lockers', method: 'get', status: '200' },
          { type: 'response', path: '/lockers/{}', method: 'get', status: '200' },
          { type: 'response', path: '/lockers/{}', method: 'get', status: '404' },
        ],
      },
    },
    { label: 'DELETE /lockers/{lockerId} returns 204 with no body', rule: { type: 'response', path: '/lockers/{}', method: 'delete', status: '204', noBody: true } },
  ],
  referenceRaml: `#%RAML 1.0
title: Parcel Lockers API
mediaType: application/json

traits:
  traced:
    usage: Apply to every resource, so every call can be followed across systems.
    headers:
      X-Correlation-ID:
        type: string
        pattern: ^[0-9a-f-]{36}$
        description: The id that ties this call to the rest of the journey.

/lockers:
  is: [ traced ]
  get:
    responses:
      200:
        description: The lockers.
  post:
    responses:
      201:
        description: The locker was registered.
  /{lockerId}:
    is: [ traced ]
    get:
      responses:
        200:
          description: The locker.
        404:
          description: No locker has this id.
    delete:
      responses:
        204:
          description: The locker was removed from service.
`,
  keyPoints: [
    'A header in a trait is required unless it ends in ? or says required: false.',
    'is on a resource applies the trait to every method of that resource.',
    'A nested resource does not inherit is from its parent, so /{lockerId} needs its own.',
    'A pattern on the header lets the APIkit router reject a malformed id with a 400.',
  ],
  solution: `
\`traced\` holds the header once. Writing \`is: [ traced ]\` on \`/lockers\` covers \`get\` and \`post\`, and a \`put\` added next year is covered with no extra work.

Traits on a resource stop at that resource. \`/{lockerId}\` is a resource of its own, so it needs its own \`is: [ traced ]\`. Forgetting it is the most common slip.

Applying the trait on each of the four methods also works. It is longer, and the next method someone adds may miss it.

The \`204\` has no body, since the locker no longer exists and there is nothing to return.
`,
  followUps: [
    {
      q: 'Should the API reject a call with no X-Correlation-ID, or make one up?',
      a: 'For an internal API, rejecting with 400 keeps every caller honest. For a public API, many teams generate an id when it is missing and return it in the response, so tracing never breaks.',
    },
    {
      q: 'How does Mule pass the correlation id on to the next system?',
      a: 'Mule keeps a correlation id for each event. Set it from the header at the start of the flow, then send it as a header on every outbound HTTP request and log it in every logger.',
    },
    {
      q: 'Why use a trait for one header instead of writing it on each method?',
      a: 'The header lives in one place, so changing its pattern is one edit. A new method picks it up from the resource, so nobody has to remember it.',
    },
  ],
}
