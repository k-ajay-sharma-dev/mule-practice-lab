export default {
  id: 'rm-110',
  category: 'api-design',
  title: 'Ticket Refunds API: Fix the Status Codes',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'debugging', 'status-codes', 'async', 'errors', 'ticketing'],
  estMinutes: 20,
  description: `
A ticketing company sells 2.5 million concert tickets a year. When a show is cancelled, fans ask for refunds through a partner app. A refund is not instant: the card processor pays out in a nightly batch, so the money arrives up to 48 hours later.

The partner app team complains that they cannot tell outcomes apart. Their logs show a 200 when a refund was only queued, a 404 when the request body was wrong, and a 500 when a ticket had already been refunded, so their alerts fire for the customer's own mistakes. Fix the status codes so each outcome has the right one.

**Requirements**
- \`POST /refunds\` takes a \`RefundRequest\`. The refund is queued, not done, so it returns a \`Refund\` with status 202 and a \`Location\` header that points at the refund.
- A body that fails validation returns an \`Error\` with status 400.
- A ticket that was already refunded returns an \`Error\` with status 409.
- A refund asked for more than 30 days after the event breaks a business rule. It returns an \`Error\` with status 422.
- When the card processor cannot be reached, \`POST /refunds\` returns an \`Error\` with status 503 and a \`Retry-After\` header.
- \`GET /refunds/{refundId}\` returns a \`Refund\` with status 200, or an \`Error\` with status 404.
- \`Refund\` has a required \`status\` that is one of \`PENDING\`, \`PAID\`, \`FAILED\`.
`,
  starter: `#%RAML 1.0
title: Ticket Refunds API
version: v1
baseUri: https://api.example.com/tickets/{version}
mediaType: application/json

types:
  RefundRequest:
    type: object
    properties:
      ticketId:
        type: string
        pattern: ^TK-[0-9]{8}$
      reason:
        type: string
        enum: [ EVENT_CANCELLED, EVENT_MOVED, DUPLICATE_PURCHASE ]
  Refund:
    type: object
    properties:
      refundId: string
      ticketId: string
      amount:
        type: number
        minimum: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
      status:
        type: string
        enum: [ PENDING, PAID, FAILED ]
    example:
      refundId: RF-30018842
      ticketId: TK-00918273
      amount: 84.50
      currency: EUR
      status: PENDING
  Error:
    type: object
    properties:
      code: string
      message: string

/refunds:
  post:
    body:
      type: RefundRequest
    responses:
      200:
        body:
          type: Refund
      404:
        description: The body failed validation.
        body:
          type: Error
      500:
        description: The ticket was already refunded.
        body:
          type: Error
      Unprocessable:
        description: The refund window of 30 days after the event has closed.
        body:
          type: Error
      502:
        description: The card processor cannot be reached.
        header:
          Retry-After:
            type: integer
        body:
          type: Error
  /{refundId}:
    get:
      responses:
        200:
          body:
            type: Refund
        204:
          description: No refund has this id.
`,
  ramlChecks: [
    { label: 'POST /refunds takes a RefundRequest', rule: { type: 'body', path: '/refunds', method: 'post', typeIs: 'RefundRequest' } },
    {
      label: 'POST /refunds returns a Refund with 202 and a Location header',
      rule: { type: 'response', path: '/refunds', method: 'post', status: '202', typeIs: 'Refund', header: 'Location' },
    },
    { label: 'A body that fails validation returns an Error with 400', rule: { type: 'response', path: '/refunds', method: 'post', status: '400', typeIs: 'Error' } },
    { label: 'An already refunded ticket returns an Error with 409', rule: { type: 'response', path: '/refunds', method: 'post', status: '409', typeIs: 'Error' } },
    { label: 'A refund after the 30 day window returns an Error with 422', rule: { type: 'response', path: '/refunds', method: 'post', status: '422', typeIs: 'Error' } },
    {
      label: 'An unreachable card processor returns an Error with 503 and Retry-After',
      rule: { type: 'response', path: '/refunds', method: 'post', status: '503', typeIs: 'Error', header: 'Retry-After' },
    },
    {
      label: 'GET /refunds/{refundId} returns a Refund, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/refunds/{}', method: 'get', status: '200', typeIs: 'Refund' },
          { type: 'response', path: '/refunds/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    { label: 'Refund status is one of PENDING, PAID and FAILED', rule: { type: 'prop', typeName: 'Refund', prop: 'status', want: { required: true, enum: { exactly: ['PENDING', 'PAID', 'FAILED'] } } } },
  ],
  referenceRaml: `#%RAML 1.0
title: Ticket Refunds API
version: v1
baseUri: https://api.example.com/tickets/{version}
mediaType: application/json

types:
  RefundRequest:
    type: object
    properties:
      ticketId:
        type: string
        pattern: ^TK-[0-9]{8}$
      reason:
        type: string
        enum: [ EVENT_CANCELLED, EVENT_MOVED, DUPLICATE_PURCHASE ]
  Refund:
    type: object
    properties:
      refundId: string
      ticketId: string
      amount:
        type: number
        minimum: 0.01
      currency:
        type: string
        pattern: ^[A-Z]{3}$
      status:
        type: string
        enum: [ PENDING, PAID, FAILED ]
    example:
      refundId: RF-30018842
      ticketId: TK-00918273
      amount: 84.50
      currency: EUR
      status: PENDING
  Error:
    type: object
    properties:
      code: string
      message: string

/refunds:
  post:
    body:
      type: RefundRequest
    responses:
      202:
        description: The refund is queued. The money arrives after the nightly payout.
        headers:
          Location:
            type: string
            description: The URL of the refund, for checking its status.
        body:
          type: Refund
      400:
        description: The body failed validation.
        body:
          type: Error
      409:
        description: The ticket was already refunded.
        body:
          type: Error
      422:
        description: The refund window of 30 days after the event has closed.
        body:
          type: Error
      503:
        description: The card processor cannot be reached.
        headers:
          Retry-After:
            type: integer
            description: Seconds to wait before trying again.
        body:
          type: Error
  /{refundId}:
    get:
      responses:
        200:
          body:
            type: Refund
        404:
          description: No refund has this id.
          body:
            type: Error
`,
  keyPoints: [
    '202 Accepted means the work is queued, not done. A Location header tells the caller where to check.',
    '4xx codes are the caller\'s problem and 5xx codes are the server\'s. Alerts on 5xx should not fire for a bad request.',
    '400 is a malformed or invalid body. 422 is a well formed request that breaks a business rule.',
    '409 is a clash with the current state, such as a ticket that was already refunded.',
    '503 with Retry-After says the outage is temporary. 502 means a gateway got a bad answer, and 204 means success with no body.',
  ],
  solution: `
Each code now says what happened.
- **200 to 202.** The refund is queued for the nightly batch. A 200 told the app the money was sent. The \`Location\` header lets the app poll \`GET /refunds/{refundId}\` until the status is \`PAID\` or \`FAILED\`.
- **404 to 400.** A 404 means the URL points at nothing, and \`/refunds\` exists. A bad body is a 400.
- **500 to 409.** An earlier refund is a conflict with the ticket's state. A 500 blamed the server for the caller's repeat.
- **Unprocessable to 422.** Response keys must be numbers. 422 fits a body that is valid but breaks the 30 day rule.
- **502 to 503, and header to headers.** The API is unavailable for a while, so 503 with \`Retry-After\`. The key \`header\` was a typo, so the header was never part of the contract.
- **204 to 404 on GET.** A 204 is a success. A missing refund is a 404 with an \`Error\` body.
`,
  followUps: [
    {
      q: 'Why is 202 better than 200 for a queued refund?',
      a: 'A 200 says the work is finished, so the app would tell the fan the money is on its way. A 202 says it is accepted and the outcome comes later, and the app polls the Location URL to learn it.',
    },
    {
      q: 'How do you choose between 400 and 422?',
      a: 'Use 400 when the body breaks the contract, such as a missing ticketId or a bad pattern. Use 422 when the body is valid but a business rule says no, such as a closed refund window.',
    },
    {
      q: 'Why does it matter for monitoring that a repeat refund is 409 and not 500?',
      a: 'Teams alert on the rate of 5xx responses, because those are failures of the service. Caller mistakes reported as 500 page the support team at night for problems they cannot fix.',
    },
    {
      q: 'How would you stop a fan getting two refunds if the app retries the POST?',
      a: 'Make the POST idempotent with an Idempotency-Key header, or treat the ticketId as the natural key. The second call then returns the first refund or a 409, and no money moves twice.',
    },
  ],
}
