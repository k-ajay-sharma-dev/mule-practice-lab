export default {
  id: 'rm-023',
  category: 'api-design',
  title: 'Billing Run API: A Long-Running Job with 202 and a Status Resource',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'async', 'long-running', 'status-codes', 'energy'],
  estMinutes: 30,
  description: `
An energy supplier runs billing once a month. A run works through four million meters and takes about 40 minutes. The first version of the API held the HTTP call open, and every client timed out long before the run finished.

A long job needs a different contract. The API accepts the request, replies at once, and gives the caller somewhere to check progress. The caller then **polls**, meaning it asks again every so often.

Status **202 Accepted** means the request was taken but the work is not finished. The \`Location\` header tells the caller the URL of the new **status resource**. The \`Retry-After\` header tells it how many seconds to wait before asking again.

**Requirements**
- Title \`Billing Run API\`, with JSON as the default media type.
- A type \`BillingRunRequest\` with a required string \`period\`.
- A type \`BillingRun\` with a required string \`runId\` and a required \`status\` that is one of \`QUEUED\`, \`RUNNING\`, \`COMPLETED\`, \`FAILED\`.
- \`BillingRun\` also has an optional integer \`percentComplete\` (minimum 0, maximum 100) and an optional string \`failureReason\`.
- \`POST /billing-runs\` takes a \`BillingRunRequest\` and returns 202 with a \`BillingRun\` body and a \`Location\` header.
- \`POST /billing-runs\` returns 409 when a run for that period already exists.
- \`GET /billing-runs/{runId}\` is the status resource. It returns a \`BillingRun\` with status 200 and a \`Retry-After\` header, or 404.
- \`GET /billing-runs/{runId}/invoices\` gives the finished result with status 200. It returns 409 while the run has not completed.
`,
  starter: `#%RAML 1.0
title: Billing Run API
mediaType: application/json

types:

/billing-runs:
  post:
`,
  ramlChecks: [
    {
      label: 'The title is Billing Run API and JSON is the default media type',
      rule: {
        type: 'all',
        rules: [
          { type: 'root', key: 'title', want: 'Billing Run API' },
          { type: 'root', key: 'mediaType', want: 'application/json' },
        ],
      },
    },
    { label: 'BillingRunRequest has a required string period', rule: { type: 'prop', typeName: 'BillingRunRequest', prop: 'period', want: { type: 'string', required: true } } },
    { label: 'BillingRun has a required string runId', rule: { type: 'prop', typeName: 'BillingRun', prop: 'runId', want: { type: 'string', required: true } } },
    {
      label: 'status is required and has the four job states',
      rule: { type: 'prop', typeName: 'BillingRun', prop: 'status', want: { required: true, enum: { exactly: ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] } } },
    },
    {
      label: 'percentComplete is an optional integer from 0 to 100',
      rule: { type: 'prop', typeName: 'BillingRun', prop: 'percentComplete', want: { type: 'integer', required: false, minimum: 0, maximum: 100 } },
    },
    { label: 'failureReason is an optional string', rule: { type: 'prop', typeName: 'BillingRun', prop: 'failureReason', want: { type: 'string', required: false } } },
    { label: 'POST /billing-runs takes a BillingRunRequest', rule: { type: 'body', path: '/billing-runs', method: 'post', typeIs: 'BillingRunRequest' } },
    {
      label: 'POST /billing-runs returns 202 with a BillingRun and a Location header',
      rule: { type: 'response', path: '/billing-runs', method: 'post', status: '202', typeIs: 'BillingRun', header: 'Location' },
    },
    { label: 'POST /billing-runs returns 409 for a period that already has a run', rule: { type: 'response', path: '/billing-runs', method: 'post', status: '409' } },
    {
      label: 'The status resource returns a BillingRun and a Retry-After header',
      rule: { type: 'response', path: '/billing-runs/{}', method: 'get', status: '200', typeIs: 'BillingRun', header: 'Retry-After' },
    },
    { label: 'The status resource returns 404 for an unknown run', rule: { type: 'response', path: '/billing-runs/{}', method: 'get', status: '404' } },
    {
      label: 'The invoices resource returns 200, or 409 before the run completes',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/billing-runs/{}/invoices', method: 'get', status: '200' },
          { type: 'response', path: '/billing-runs/{}/invoices', method: 'get', status: '409' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Billing Run API
mediaType: application/json

types:
  BillingRunRequest:
    type: object
    properties:
      period: string
  BillingRun:
    type: object
    properties:
      runId: string
      status:
        type: string
        enum: [ QUEUED, RUNNING, COMPLETED, FAILED ]
      percentComplete?:
        type: integer
        minimum: 0
        maximum: 100
      failureReason?: string
    example:
      runId: BR-2026-10
      status: RUNNING
      percentComplete: 35

/billing-runs:
  post:
    body:
      type: BillingRunRequest
    responses:
      202:
        description: The run was accepted and has not finished.
        headers:
          Location:
            description: The URL of the status resource.
            type: string
        body:
          type: BillingRun
      409:
        description: A run for this period already exists.
  /{runId}:
    get:
      responses:
        200:
          headers:
            Retry-After:
              description: Seconds to wait before asking again.
              type: integer
          body:
            type: BillingRun
        404:
          description: No run has this id.
    /invoices:
      get:
        responses:
          200:
            description: The invoices from the finished run.
          409:
            description: The run has not completed yet.
`,
  keyPoints: [
    '202 means accepted, not done. 201 would claim the work is already complete.',
    'Location gives the status URL, so the caller does not have to build it.',
    'Retry-After tells callers how long to wait, which keeps polling under control.',
    'A job status enum should include failure, and a failure should say why.',
    'The status resource is a real resource, so it has its own 404.',
  ],
  solution: `
\`POST\` returns in milliseconds, because all it does is record the job. The caller follows \`Location\` and polls until \`status\` is \`COMPLETED\` or \`FAILED\`.

A failed job still returns 200 from the status resource. The HTTP call worked, and it is the job that failed. That is why \`FAILED\` is a value in the body and \`failureReason\` exists.

The result lives apart from the status. A status call stays small however large the run is. The \`409\` on \`/invoices\` tells a caller it came too early.
`,
  followUps: [
    {
      q: 'What would you add so that callers do not have to poll?',
      a: 'A webhook. The caller registers a URL and the API calls it when the job ends. Polling still works as a fallback, and it needs nothing from the caller beyond outbound calls.',
    },
    {
      q: 'How would you implement the job in Mule?',
      a: 'The POST flow saves the job and puts a message on a queue such as Anypoint MQ, then returns 202. A separate flow takes the message, does the work and updates the status in a store.',
    },
    {
      q: 'Why is the 409 on POST important here?',
      a: 'A timeout or a double click could otherwise start a second billing run, and customers would be billed twice. One run per period is a business rule the contract can state.',
    },
  ],
}
