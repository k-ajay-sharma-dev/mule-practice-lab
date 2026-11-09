export default {
  id: 'rm-117',
  category: 'api-design',
  title: 'SIM Activation Process API: An Asynchronous Job With a Cancel Window',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'process-api', 'async', 'idempotency', 'resource-types', 'telecom'],
  estMinutes: 35,
  description: `
A mobile operator activates about 25,000 SIM cards a day. They come from its own shops, its website and 40 resellers. An activation touches the SIM inventory, the billing system and the network's subscriber register. It takes 30 to 90 seconds, and up to an hour when a number is being moved from another operator.

You are writing the **Process API** that resellers call. A reseller's till often times out and retries, and a retried activation must never start a second one on the same SIM.

**Brief**
- An ICCID is the number printed on a SIM card: 19 or 20 digits that start with \`89\`.
- An MSISDN is the phone number in international form: a plus sign, a first digit from 1 to 9, then 7 to 14 more digits, such as \`+447700900123\`. A customer who brings no number gets a new one, so it is optional.
- A reseller may give a \`callbackUrl\` to be told when the job ends. It must be HTTPS.
- A pending activation can be cancelled until provisioning starts.

**Requirements**
- Title \`SIM Activation Process API\`, with JSON as the default media type.
- \`ActivationRequest\` has a required \`iccid\` and an optional \`msisdn\`, each with a pattern for the format above, a required string \`planCode\`, and an optional \`callbackUrl\` with a pattern that allows only \`https://\` addresses.
- \`Activation\` inherits from \`ActivationRequest\` and adds a required string \`activationId\` and a required \`status\` that is one of \`PENDING\`, \`PROVISIONING\`, \`ACTIVE\`, \`FAILED\`, \`CANCELLED\`.
- Trait \`idempotent\` has a required string header \`Idempotency-Key\`. \`POST /activations\` uses it.
- \`POST /activations\` takes an \`ActivationRequest\` and returns an \`Activation\` with status 202 and a \`Location\` header. It returns an \`Error\` with 409 when the SIM is already active, and with 422 when the plan is not sold for that kind of SIM.
- Resource type \`job\` takes the job's type as a parameter. Its \`get\` returns that type with status 200, or an \`Error\` with status 404. Its optional \`delete\` returns 204 with no body, or an \`Error\` with status 409.
- \`/activations/{activationId}\` uses \`job\` with \`Activation\`, and it offers \`delete\` for the cancel.
- Callers cannot change an activation: \`/activations/{activationId}\` has no \`put\` or \`patch\`.
`,
  starter: `#%RAML 1.0
title: SIM Activation Process API
mediaType: application/json

types:

traits:

resourceTypes:

/activations:
`,
  ramlChecks: [
    { label: 'The title is SIM Activation Process API and JSON is the default', rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'SIM Activation Process API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] } },
    {
      label: 'iccid is 19 or 20 digits starting with 89',
      rule: { type: 'prop', typeName: 'ActivationRequest', prop: 'iccid', want: { required: true, pattern: { accepts: ['8944110012345678901', '89441100123456789012'], rejects: ['8844110012345678901', '894411001234567890', '894411001234567890123', '89441100123456789A1'] } } },
    },
    {
      label: 'msisdn is optional and in international form',
      rule: { type: 'prop', typeName: 'ActivationRequest', prop: 'msisdn', want: { required: false, pattern: { accepts: ['+447700900123', '+12025550143'], rejects: ['07700900123', '+0447700900123', '+44 7700 900123', '+4477'] } } },
    },
    {
      label: 'callbackUrl is optional and HTTPS only',
      rule: { type: 'prop', typeName: 'ActivationRequest', prop: 'callbackUrl', want: { required: false, pattern: { accepts: ['https://reseller.example.com/hooks/sim'], rejects: ['http://reseller.example.com/hooks/sim', 'ftp://reseller.example.com', 'reseller.example.com'] } } },
    },
    {
      label: 'Activation inherits the request and adds activationId and status',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Activation', extends: 'ActivationRequest' },
          { type: 'prop', typeName: 'Activation', prop: 'activationId', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Activation', prop: 'status', want: { required: true, enum: { exactly: ['PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED', 'CANCELLED'] } } },
        ],
      },
    },
    {
      label: 'POST /activations uses idempotent, with a required Idempotency-Key',
      rule: {
        type: 'all',
        rules: [
          { type: 'applied', path: '/activations', method: 'post', trait: 'idempotent' },
          { type: 'param', path: '/activations', method: 'post', in: 'header', name: 'Idempotency-Key', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'POST /activations returns an Activation with 202 and Location',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/activations', method: 'post', typeIs: 'ActivationRequest' },
          { type: 'response', path: '/activations', method: 'post', status: '202', typeIs: 'Activation', header: 'Location' },
        ],
      },
    },
    {
      label: 'POST /activations returns an Error with 409 and with 422',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/activations', method: 'post', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/activations', method: 'post', status: '422', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'GET /activations/{activationId} comes from job and returns an Activation, or an Error with 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'typed', path: '/activations/{}', resourceType: 'job', provides: ['get.responses.200', 'get.responses.404'] },
          { type: 'response', path: '/activations/{}', method: 'get', status: '200', typeIs: 'Activation' },
          { type: 'response', path: '/activations/{}', method: 'get', status: '404', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'job has an optional delete, and the activation offers it with 204 and 409',
      rule: {
        type: 'all',
        rules: [
          { type: 'resourceType', name: 'job', has: ['delete?'] },
          { type: 'typed', path: '/activations/{}', resourceType: 'job', provides: ['delete.responses.204'] },
          { type: 'response', path: '/activations/{}', method: 'delete', status: '204', noBody: true },
          { type: 'response', path: '/activations/{}', method: 'delete', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'An activation cannot be changed by callers',
      rule: {
        type: 'all',
        rules: [
          { type: 'resource', path: '/activations/{}' },
          { type: 'noMethod', path: '/activations/{}', method: 'put' },
          { type: 'noMethod', path: '/activations/{}', method: 'patch' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: SIM Activation Process API
version: v1
baseUri: https://api.example.com/sim/{version}
mediaType: application/json

types:
  ActivationRequest:
    type: object
    properties:
      iccid:
        type: string
        pattern: ^89[0-9]{17,18}$
      msisdn?:
        type: string
        pattern: ^\\+[1-9][0-9]{7,14}$
      planCode: string
      callbackUrl?:
        type: string
        pattern: ^https://
  Activation:
    type: ActivationRequest
    properties:
      activationId: string
      status:
        type: string
        enum: [ PENDING, PROVISIONING, ACTIVE, FAILED, CANCELLED ]
    example:
      activationId: ACT-5521980
      iccid: '8944110012345678901'
      msisdn: '+447700900123'
      planCode: UNL-30
      callbackUrl: https://reseller.example.com/hooks/sim
      status: PENDING
  Error:
    type: object
    properties:
      code: string
      message: string

traits:
  idempotent:
    headers:
      Idempotency-Key:
        type: string
        minLength: 16

resourceTypes:
  job:
    get:
      responses:
        200:
          body:
            type: <<jobType>>
        404:
          body:
            type: Error
    delete?:
      description: Cancel the <<resourcePathName | !singularize>> while it is still pending.
      responses:
        204:
          description: The job is cancelled.
        409:
          description: The job has started or finished and cannot be cancelled.
          body:
            type: Error

/activations:
  post:
    is: [ idempotent ]
    body:
      type: ActivationRequest
    responses:
      202:
        headers:
          Location:
            type: string
        body:
          type: Activation
      409:
        description: This SIM is already active.
        body:
          type: Error
      422:
        description: This plan is not sold for this kind of SIM.
        body:
          type: Error
  /{activationId}:
    type: { job: { jobType: Activation } }
    delete:
`,
  keyPoints: [
    'An activation that takes up to an hour is a job: 202 on create, then a resource to poll.',
    'An Idempotency-Key makes a retried POST return the first job and never start a second one.',
    'A resource type describes the job shape once. delete? lets each job opt in to cancelling.',
    'Status moves only through the network. Leaving out put and patch stops callers setting ACTIVE themselves.',
    'Patterns on ICCID and MSISDN reject typing mistakes before any network system is touched.',
  ],
  solution: `
The POST starts a job and returns at once with \`PENDING\` and a \`Location\`. The reseller polls that URL, or waits for its \`callbackUrl\`. The \`Idempotency-Key\` trait is what makes the till's retries safe: the second call with the same key returns the first activation.

\`job\` is a resource type because the operator has other long jobs, such as number ports and eSIM downloads. Each gets the same \`get\` shape and the same cancel rules. \`delete?\` is optional so a job that cannot be stopped does not offer it. \`/activations/{activationId}\` opts in by writing \`delete:\` with nothing under it, and everything else comes from the resource type.

The 409 on \`delete\` covers the window closing: once provisioning has begun on the network, cancelling would leave the SIM half set up.

Two patterns need care. \`^\\+[1-9]\` escapes the plus sign, which otherwise means "one or more". \`^https://\` only checks the start, which is enough to refuse plain HTTP.
`,
  followUps: [
    {
      q: 'Why not a PATCH that sets status to CANCELLED?',
      a: 'A PATCH invites callers to set any status, such as ACTIVE. DELETE on the job says exactly one thing, cancel it, and the 409 handles the case when that is no longer possible.',
    },
    {
      q: 'How should the API call the reseller callbackUrl safely?',
      a: 'Sign each callback, for example with an HMAC header, so the reseller can trust it. Retry with backoff when the reseller is down, and allow only HTTPS hosts registered for that reseller to avoid server-side request forgery.',
    },
    {
      q: 'Where would you keep the idempotency keys in Mule?',
      a: 'In a persistent Object Store with a time to live of about 24 hours, keyed by client id and key. The Idempotent Message Validator or a lookup before the flow returns the stored response.',
    },
    {
      q: 'What does the reseller see if the network rejects the SIM after 60 seconds?',
      a: 'The POST already returned 202. The job moves to FAILED with a reason, and the reseller sees it on the next poll or in the callback.',
    },
  ],
}
