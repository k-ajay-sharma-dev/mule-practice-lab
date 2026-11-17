export default {
  id: 'rm-128',
  category: 'api-design',
  title: 'Job Applications API: Links That Show the Next Step',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'hypermedia', 'links', 'paging', 'data-types', 'hr'],
  estMinutes: 20,
  description: `
Tidewater Recruitment runs a job board. Candidates track their applications in an app. Today the app holds the rules for what a candidate may do next: it shows a Withdraw button for some statuses and a Book Interview button for others. Each time the rules change, a new app version must ship.

The new contract sends **links** with each application. The server adds a \`withdraw\` link only when withdrawing is allowed, and an \`interview\` link only when an interview slot can be booked. The app shows a button when the link is there. This style puts links under a \`_links\` object, a convention borrowed from HAL.

Lists get links too: \`self\` for this page, and \`next\` and \`prev\` when there is such a page.

**Requirements**
- Title \`Job Applications API\`, with JSON as the default media type.
- A type \`Link\` with a required string \`href\`.
- A type \`ApplicationLinks\` with a required \`self\` of type \`Link\`, and optional \`withdraw\` and \`interview\` of type \`Link\`.
- A type \`JobApplication\` with required strings \`applicationId\` and \`jobId\`, a required \`status\` that is one of \`SUBMITTED\`, \`SHORTLISTED\`, \`WITHDRAWN\`, \`REJECTED\`, and a required \`_links\` of type \`ApplicationLinks\`.
- A type \`PageLinks\` with a required \`self\` and optional \`next\` and \`prev\`, all of type \`Link\`.
- A type \`ApplicationPage\` with a required \`items\` array of \`JobApplication\` and a required \`_links\` of type \`PageLinks\`.
- \`GET /applications\` has an optional string query parameter \`cursor\` and returns an \`ApplicationPage\` with 200.
- \`GET /applications/{applicationId}\` returns a \`JobApplication\` with 200 and its own example, or 404.
`,
  starter: `#%RAML 1.0
title: Job Applications API
mediaType: application/json

types:
  JobApplication:
    type: object
    properties:
      applicationId: string
      jobId: string
      status: string
      canWithdraw: boolean
      canBookInterview: boolean

/applications:
  get:
    responses:
      200:
        body:
          type: JobApplication[]
`,
  ramlChecks: [
    {
      label: 'The title is Job Applications API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Job Applications API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    { label: 'Link has a required href', rule: { type: 'prop', typeName: 'Link', prop: 'href', want: { type: 'string', required: true } } },
    {
      label: 'ApplicationLinks has a required self and optional withdraw and interview links',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ApplicationLinks', prop: 'self', want: { type: 'Link', required: true } },
          { type: 'prop', typeName: 'ApplicationLinks', prop: 'withdraw', want: { type: 'Link', required: false } },
          { type: 'prop', typeName: 'ApplicationLinks', prop: 'interview', want: { type: 'Link', required: false } },
        ],
      },
    },
    {
      label: 'JobApplication has its ids, a status from the list and required _links',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'JobApplication', prop: 'applicationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'JobApplication', prop: 'jobId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'JobApplication', prop: 'status', want: { required: true, enum: { exactly: ['SUBMITTED', 'SHORTLISTED', 'WITHDRAWN', 'REJECTED'] } } },
          { type: 'prop', typeName: 'JobApplication', prop: '_links', want: { type: 'ApplicationLinks', required: true } },
        ],
      },
    },
    {
      label: 'The app no longer decides: JobApplication has no canWithdraw or canBookInterview flags',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'JobApplication' },
          { type: 'noProp', typeName: 'JobApplication', prop: 'canWithdraw' },
          { type: 'noProp', typeName: 'JobApplication', prop: 'canBookInterview' },
        ],
      },
    },
    {
      label: 'PageLinks has a required self and optional next and prev',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'PageLinks', prop: 'self', want: { type: 'Link', required: true } },
          { type: 'prop', typeName: 'PageLinks', prop: 'next', want: { type: 'Link', required: false } },
          { type: 'prop', typeName: 'PageLinks', prop: 'prev', want: { type: 'Link', required: false } },
        ],
      },
    },
    {
      label: 'ApplicationPage has items and _links',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'ApplicationPage', prop: 'items', want: { type: 'JobApplication[]', required: true } },
          { type: 'prop', typeName: 'ApplicationPage', prop: '_links', want: { type: 'PageLinks', required: true } },
        ],
      },
    },
    {
      label: 'GET /applications takes an optional cursor and returns an ApplicationPage',
      rule: {
        type: 'all',
        rules: [
          { type: 'param', path: '/applications', method: 'get', in: 'query', name: 'cursor', want: { type: 'string', required: false } },
          { type: 'response', path: '/applications', method: 'get', status: '200', typeIs: 'ApplicationPage' },
        ],
      },
    },
    {
      label: 'GET /applications/{applicationId} returns a JobApplication with its own example, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/applications/{}', method: 'get', status: '200', typeIs: 'JobApplication', example: 'own' },
          { type: 'response', path: '/applications/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Job Applications API
mediaType: application/json

types:
  Link:
    type: object
    properties:
      href: string
  ApplicationLinks:
    type: object
    properties:
      self: Link
      withdraw?: Link
      interview?: Link
  JobApplication:
    type: object
    properties:
      applicationId: string
      jobId: string
      status:
        type: string
        enum: [ SUBMITTED, SHORTLISTED, WITHDRAWN, REJECTED ]
      _links: ApplicationLinks
  PageLinks:
    type: object
    properties:
      self: Link
      next?: Link
      prev?: Link
  ApplicationPage:
    type: object
    properties:
      items: JobApplication[]
      _links: PageLinks

/applications:
  get:
    queryParameters:
      cursor?:
        type: string
        description: Copy it from the href of a next or prev link. Do not build it yourself.
    responses:
      200:
        body:
          type: ApplicationPage
  /{applicationId}:
    get:
      responses:
        200:
          body:
            type: JobApplication
            example:
              applicationId: APP-30552
              jobId: JOB-1184
              status: SHORTLISTED
              _links:
                self:
                  href: /applications/APP-30552
                withdraw:
                  href: /applications/APP-30552/withdrawal
                interview:
                  href: /applications/APP-30552/interview-slots
        404:
          description: No application has this id, or it belongs to another candidate.
`,
  keyPoints: [
    'Links in the response tell the client what it may do next, so the rules live on the server.',
    'An optional link that is present means the action is allowed. A missing link means it is not.',
    'A Link type used everywhere keeps every link the same shape.',
    'Paging links such as next and prev let the client follow pages without building URLs.',
    'Removing flags such as canWithdraw stops two places from holding the same rule.',
  ],
  solution: `
**Why links.** With flags such as \`canWithdraw\`, the server still had to decide, and the app also needed to know which URL to call. A \`withdraw\` link carries both facts: the action is allowed, and here is where to do it. When the rules change, for example no withdrawing after an offer, only the server changes.

**Optional means conditional.** \`withdraw?\` and \`interview?\` are optional because they appear only when the action is possible. \`self\` is always there.

**The example.** A shortlisted application can be withdrawn and can book an interview, so its example shows both links. A rejected one would show only \`self\`.

**Paging.** \`next\` is missing on the last page, which is how the app knows to stop. The \`cursor\` is opaque: the app copies the link and never builds one.
`,
  followUps: [
    {
      q: 'Should a link also say which HTTP method to use?',
      a: 'It can. Some teams add a method to the Link type, or document it once per link name, such as withdraw always being a POST. Pick one way and keep it the same in every API.',
    },
    {
      q: 'Does the app still need to check the status?',
      a: 'For display, yes, such as the label on the screen. For what the candidate may do, it should only look at the links. The server must still check the rule when the action is called, because a link can be out of date.',
    },
    {
      q: 'Why are the hrefs relative?',
      a: 'They resolve against the API base URL, so the same response works in test and production and through a gateway. Absolute URLs are fine too, as long as the server builds them from the host the client called.',
    },
  ],
}
