export default {
  id: 'rm-100',
  category: 'api-design',
  title: 'Drug Formulary API: Conditional GET, Cache Headers and a Guarded DELETE',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'caching', 'etag', 'concurrency', 'headers', 'pharmacy'],
  estMinutes: 30,
  description: `
A pharmacy chain keeps a formulary of about 9,000 drugs. Each of its 1,400 stores downloads the full list every 5 minutes, which is 3 MB each time, yet the list changes only a few times a day. The network team asks for **conditional requests**, so a store only downloads the list when it has changed.

The list response carries three headers:
- \`ETag\`, a tag for this version of the list.
- \`Last-Modified\`, when the list last changed.
- \`Cache-Control\`, how long a store or proxy may reuse it without asking, such as \`max-age=300\`.

On the next poll, the store sends \`If-None-Match\` with the tag it holds, or \`If-Modified-Since\` with the date. If nothing changed, the API answers **304 Not Modified** with no body. A 304 still repeats the \`ETag\`, so caches can refresh their entry.

Removing a drug from the formulary is a write, so it is guarded the other way. The pharmacist's tool must send \`If-Match\` with the tag of the drug it showed. If another pharmacist changed that drug in the meantime, the delete fails with **412 Precondition Failed**.

**Requirements**
- Keep the title \`Drug Formulary API\` and JSON as the default media type.
- A type \`Drug\` with required strings \`ndc\` and \`name\`, and a required integer \`tier\` from 1 to 4.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`GET /drugs\` takes an optional string header \`If-None-Match\`, and an optional header \`If-Modified-Since\` of type \`datetime\` with \`format: rfc2616\`, the HTTP date format.
- It returns 200 with \`Drug[]\` and the headers \`ETag\`, \`Last-Modified\` and \`Cache-Control\`.
- It returns 304 with an \`ETag\` header and no body.
- \`DELETE /drugs/{ndc}\` takes a required string header \`If-Match\`.
- It returns 204 with no body, 404 for an unknown drug, or 412 with an \`Error\` when the tag is out of date.
`,
  starter: `#%RAML 1.0
title: Drug Formulary API
mediaType: application/json

types:
  Drug:
    type: object
    properties:
      ndc: string
      name: string
      tier: integer

/drugs:
  get:
    responses:
      200:
        body:
          type: Drug[]
  /{ndc}:
    delete:
      responses:
        204:
          description: The drug was removed from the formulary.
`,
  ramlChecks: [
    {
      label: 'Drug has required ndc and name, and a tier from 1 to 4',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Drug', prop: 'ndc', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Drug', prop: 'name', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Drug', prop: 'tier', want: { type: 'integer', required: true, minimum: 1, maximum: 4 } },
        ],
      },
    },
    { label: 'GET /drugs takes an optional If-None-Match header', rule: { type: 'param', path: '/drugs', method: 'get', in: 'header', name: 'If-None-Match', want: { type: 'string', required: false } } },
    {
      label: 'GET /drugs takes an optional If-Modified-Since header as an rfc2616 datetime',
      rule: { type: 'param', path: '/drugs', method: 'get', in: 'header', name: 'If-Modified-Since', want: { type: 'datetime', required: false, format: 'rfc2616' } },
    },
    { label: 'The 200 returns Drug[] with an ETag header', rule: { type: 'response', path: '/drugs', method: 'get', status: '200', typeIs: 'Drug[]', header: 'ETag' } },
    {
      label: 'The 200 also has Last-Modified and Cache-Control headers',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/drugs', method: 'get', status: '200', header: 'Last-Modified' },
          { type: 'response', path: '/drugs', method: 'get', status: '200', header: 'Cache-Control' },
        ],
      },
    },
    { label: 'GET /drugs returns 304 with no body', rule: { type: 'response', path: '/drugs', method: 'get', status: '304', noBody: true } },
    { label: 'The 304 repeats the ETag header', rule: { type: 'response', path: '/drugs', method: 'get', status: '304', header: 'ETag' } },
    { label: 'DELETE /drugs/{ndc} needs a required If-Match header', rule: { type: 'param', path: '/drugs/{}', method: 'delete', in: 'header', name: 'If-Match', want: { type: 'string', required: true } } },
    { label: 'DELETE returns 204 with no body', rule: { type: 'response', path: '/drugs/{}', method: 'delete', status: '204', noBody: true } },
    { label: 'DELETE returns 404 for an unknown drug', rule: { type: 'response', path: '/drugs/{}', method: 'delete', status: '404' } },
    {
      label: 'DELETE returns 412 with an Error when the tag is out of date',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'response', path: '/drugs/{}', method: 'delete', status: '412', typeIs: 'Error' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Drug Formulary API
mediaType: application/json

types:
  Drug:
    type: object
    properties:
      ndc: string
      name: string
      tier:
        type: integer
        minimum: 1
        maximum: 4
  Error:
    type: object
    properties:
      code: string
      message: string

/drugs:
  get:
    headers:
      If-None-Match?:
        type: string
        description: The ETag the store already holds.
      If-Modified-Since?:
        type: datetime
        format: rfc2616
    responses:
      200:
        headers:
          ETag:
            type: string
          Last-Modified:
            type: datetime
            format: rfc2616
          Cache-Control:
            type: string
            example: max-age=300
        body:
          type: Drug[]
      304:
        description: The list has not changed since the version the store holds.
        headers:
          ETag:
            type: string
  /{ndc}:
    delete:
      headers:
        If-Match:
          type: string
          description: The ETag of the drug the pharmacist was shown.
      responses:
        204:
          description: The drug was removed from the formulary.
        404:
          description: No drug has this NDC.
        412:
          body:
            type: Error
`,
  keyPoints: [
    'If-None-Match and If-Modified-Since make a read conditional, and 304 means nothing changed.',
    'A 304 has no body but repeats the ETag, so caches can refresh their entry.',
    'Cache-Control lets a client or proxy reuse a response for a time without asking at all.',
    'If-Match makes a write conditional, and 412 means the tag is out of date.',
    'HTTP dates use the rfc2616 format, which RAML states with format on a datetime.',
  ],
  solution: `
Reads and writes use tags in opposite ways. On a read, \`If-None-Match\` says send the list only if it differs from my copy. On a write, \`If-Match\` says apply this only if the drug is still the version I saw.

\`Cache-Control: max-age=300\` means a store can reuse the list for 5 minutes without any call. After that it asks with \`If-None-Match\`. Most polls then end in a 304 of a few hundred bytes instead of a 3 MB download.

\`If-Modified-Since\` and \`Last-Modified\` use the HTTP date format, such as \`Sun, 08 Nov 2026 09:00:00 GMT\`. In RAML that is \`datetime\` with \`format: rfc2616\`. Without the format, the contract would expect an ISO date that no HTTP client sends.

The delete returns 204 with no body, since there is nothing left to show.
`,
  followUps: [
    {
      q: 'If a client sends both If-None-Match and If-Modified-Since, which wins?',
      a: 'If-None-Match wins, and the server ignores the date. A tag is exact, while a date has only one second of precision.',
    },
    {
      q: 'What is the difference between a strong and a weak ETag?',
      a: 'A strong tag changes whenever any byte changes. A weak tag, written W/ in front, only promises the same meaning. Weak tags are fine for 304 on reads but must not guard writes with If-Match.',
    },
    {
      q: 'Could the HTTP Caching policy in API Manager help here?',
      a: 'Yes. It can cache the GET response at the gateway, so repeated polls do not reach the Mule application. The ETag logic still matters for the stores themselves.',
    },
    {
      q: 'How would the Mule application compute the ETag for the list?',
      a: 'Keep a version number or a last change time for the formulary and hash it. Computing a hash of the full 3 MB body on every call would cost more than it saves.',
    },
  ],
}
