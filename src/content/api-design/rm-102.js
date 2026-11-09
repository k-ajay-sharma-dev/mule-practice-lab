export default {
  id: 'rm-102',
  category: 'api-design',
  title: 'Smart Home Events API: Webhook Subscriptions with Callback URLs',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'webhooks', 'events', 'inheritance', 'iot'],
  estMinutes: 35,
  description: `
A smart home platform has 2.3 million devices. Security companies and insurers want to hear at once when an alarm fires or a smoke detector battery runs low. Today they poll every minute, which is 40 million calls a day for very few events.

The platform will push events instead. A partner **subscribes** by telling the API where to send events, its **callback URL**, and which event types it wants. The platform then posts each matching event to that URL.

Points the contract must get right:
- Events carry home data, so the callback URL must start with \`https://\`.
- Each event is signed with a secret, so a partner can prove an event came from the platform. The secret is returned **once**, in the response that creates the subscription. A later read must never show it.
- A partner needs to check its endpoint works without waiting for a real alarm, so it can ask for a test event.

**Requirements**
- Keep the title \`Smart Home Events API\` and JSON as the default media type.
- A type \`EventType\`, a string that is exactly one of \`device.offline\`, \`alarm.triggered\`, \`battery.low\`.
- A type \`SubscriptionRequest\` with a required string \`callbackUrl\` with a pattern that only allows \`https://\` URLs, and a required \`events\` of \`EventType[]\` with at least 1 item and \`uniqueItems: true\`.
- A type \`Subscription\` that has everything in \`SubscriptionRequest\`, plus a required string \`subscriptionId\` and a required \`status\` that is one of \`ACTIVE\`, \`FAILING\`. It has no \`signingSecret\`.
- A type \`SubscriptionCreated\` that has everything in \`Subscription\`, plus a required string \`signingSecret\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`POST /webhook-subscriptions\` takes a \`SubscriptionRequest\` and returns 201 with a \`SubscriptionCreated\` and a \`Location\` header, or 422 with an \`Error\` when the callback URL cannot be reached.
- \`GET /webhook-subscriptions\` returns 200 with \`Subscription[]\`.
- \`GET /webhook-subscriptions/{subscriptionId}\` returns 200 with a \`Subscription\`, or 404.
- \`DELETE /webhook-subscriptions/{subscriptionId}\` returns 204 with no body, or 404.
- \`POST /webhook-subscriptions/{subscriptionId}/test\` returns 202.
`,
  starter: `#%RAML 1.0
title: Smart Home Events API
mediaType: application/json

types:

/webhook-subscriptions:
  /{subscriptionId}:
`,
  ramlChecks: [
    { label: 'EventType has exactly the three event names', rule: { type: 'typeDecl', name: 'EventType', want: { type: 'string', enum: { exactly: ['device.offline', 'alarm.triggered', 'battery.low'] } } } },
    {
      label: 'callbackUrl is required and only allows https:// URLs',
      rule: {
        type: 'prop',
        typeName: 'SubscriptionRequest',
        prop: 'callbackUrl',
        want: { type: 'string', required: true, pattern: { accepts: ['https://hooks.example.com/smart-home', 'https://a.example.org/x?y=1'], rejects: ['http://hooks.example.com/smart-home', 'ftp://hooks.example.com', 'hooks.example.com', 'see https://hooks.example.com'] } },
      },
    },
    { label: 'events is a required EventType[] of unique items, at least 1', rule: { type: 'prop', typeName: 'SubscriptionRequest', prop: 'events', want: { type: 'EventType[]', required: true, minItems: 1, uniqueItems: true } } },
    {
      label: 'Subscription has the request fields, a subscriptionId and a status of ACTIVE or FAILING',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Subscription', prop: 'callbackUrl', want: { required: true } },
          { type: 'prop', typeName: 'Subscription', prop: 'events', want: { required: true } },
          { type: 'prop', typeName: 'Subscription', prop: 'subscriptionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Subscription', prop: 'status', want: { required: true, enum: { exactly: ['ACTIVE', 'FAILING'] } } },
        ],
      },
    },
    {
      label: 'Subscription never shows the signingSecret',
      rule: { type: 'all', rules: [{ type: 'typeDecl', name: 'Subscription' }, { type: 'noProp', typeName: 'Subscription', prop: 'signingSecret' }] },
    },
    {
      label: 'SubscriptionCreated adds a required signingSecret to a Subscription',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'SubscriptionCreated', prop: 'subscriptionId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'SubscriptionCreated', prop: 'signingSecret', want: { type: 'string', required: true } },
        ],
      },
    },
    { label: 'POST takes a SubscriptionRequest', rule: { type: 'body', path: '/webhook-subscriptions', method: 'post', typeIs: 'SubscriptionRequest' } },
    { label: 'POST returns 201 with a SubscriptionCreated and a Location header', rule: { type: 'response', path: '/webhook-subscriptions', method: 'post', status: '201', typeIs: 'SubscriptionCreated', header: 'Location' } },
    {
      label: 'POST returns 422 with an Error for a callback that cannot be reached',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'response', path: '/webhook-subscriptions', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'Reads return Subscription, never SubscriptionCreated',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/webhook-subscriptions', method: 'get', status: '200', typeIs: 'Subscription[]' },
          { type: 'response', path: '/webhook-subscriptions/{}', method: 'get', status: '200', typeIs: 'Subscription' },
          { type: 'response', path: '/webhook-subscriptions/{}', method: 'get', status: '404' },
        ],
      },
    },
    {
      label: 'DELETE returns 204 with no body, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/webhook-subscriptions/{}', method: 'delete', status: '204', noBody: true },
          { type: 'response', path: '/webhook-subscriptions/{}', method: 'delete', status: '404' },
        ],
      },
    },
    { label: 'POST /webhook-subscriptions/{subscriptionId}/test returns 202', rule: { type: 'response', path: '/webhook-subscriptions/{}/test', method: 'post', status: '202' } },
  ],
  referenceRaml: `#%RAML 1.0
title: Smart Home Events API
mediaType: application/json

types:
  EventType:
    type: string
    enum: [ device.offline, alarm.triggered, battery.low ]
  SubscriptionRequest:
    type: object
    properties:
      callbackUrl:
        type: string
        pattern: ^https://
      events:
        type: EventType[]
        minItems: 1
        uniqueItems: true
  Subscription:
    type: SubscriptionRequest
    properties:
      subscriptionId: string
      status:
        type: string
        enum: [ ACTIVE, FAILING ]
  SubscriptionCreated:
    type: Subscription
    properties:
      signingSecret:
        type: string
        description: Shown only in this response. Store it to check the signature on each event.
  Error:
    type: object
    properties:
      code: string
      message: string

/webhook-subscriptions:
  post:
    body:
      type: SubscriptionRequest
    responses:
      201:
        headers:
          Location:
            type: string
        body:
          type: SubscriptionCreated
      422:
        description: The callback URL did not answer the verification call.
        body:
          type: Error
  get:
    responses:
      200:
        body:
          type: Subscription[]
  /{subscriptionId}:
    get:
      responses:
        200:
          body:
            type: Subscription
        404:
          description: No subscription has this id.
    delete:
      responses:
        204:
          description: The subscription was removed. No more events are sent.
        404:
          description: No subscription has this id.
    /test:
      post:
        responses:
          202:
            description: A test event will be sent to the callback URL.
`,
  keyPoints: [
    'A subscription is a resource like any other, so partners create, list and delete it with normal methods.',
    'The callback URL must be https, which a pattern anchored at the start enforces.',
    'A secret is shown once on creation, so the read type must not hold it.',
    'Inheritance gives three related types without repeating fields: request, stored, and created.',
    'A test endpoint lets a partner check its receiver without waiting for a real event.',
  ],
  solution: `
The three types build on each other. \`SubscriptionRequest\` is what a partner sends. \`Subscription\` adds what the server owns, \`subscriptionId\` and \`status\`. \`SubscriptionCreated\` adds the secret, and only the 201 uses it. Because a subtype never counts as its parent here, every read is declared with \`Subscription\` and cannot leak the secret by accident.

\`uniqueItems: true\` stops a partner from subscribing to \`alarm.triggered\` twice in one list and getting each alarm twice.

\`status: FAILING\` tells a partner that deliveries are failing, for example after their endpoint returned errors for an hour. That is far more useful than events vanishing in silence.

The 422 comes from a verification call. Before saving, the platform posts a small challenge to the callback URL. If nothing answers, the subscription is refused at once, rather than failing on the first real alarm.
`,
  followUps: [
    {
      q: 'How does a partner check that an event really came from the platform?',
      a: 'The platform signs the event body with the shared secret using HMAC SHA-256 and sends the signature in a header. The partner computes the same signature and compares. A timestamp in the signed data stops replays.',
    },
    {
      q: 'What should the platform do when a callback keeps failing?',
      a: 'Retry with growing delays for a stated period, such as 24 hours, and mark the subscription FAILING. After that, park the events or disable the subscription and tell the partner.',
    },
    {
      q: 'How would you rotate the signing secret without losing events?',
      a: 'Add an endpoint that issues a new secret and sign with both secrets for a short overlap. The partner switches to the new secret, then the old one is dropped.',
    },
    {
      q: 'Which Anypoint pieces fit the delivery side?',
      a: 'Publish events to Anypoint MQ, and let a delivery flow read the queue and call each subscriber with retries. A dead letter queue keeps events that could not be delivered.',
    },
  ],
}
