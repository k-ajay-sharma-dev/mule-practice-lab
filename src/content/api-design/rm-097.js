export default {
  id: 'rm-097',
  category: 'api-design',
  title: 'Video Transcoding API: 202, a Job Monitor and 303 to the Result',
  level: 'ADVANCED',
  tags: ['raml', 'api-design', 'async', 'long-running', 'status-codes', 'headers', 'media'],
  estMinutes: 30,
  description: `
A streaming service sends about 1,200 new videos a day to a transcoding farm. One 90 minute film takes up to 40 minutes to turn into 1080p, 720p and 480p versions. No caller can hold an HTTP connection open that long, and CloudHub load balancers close idle connections long before that.

So the API follows the **long-running operation** pattern:
- \`POST /transcode-jobs\` accepts the work and answers **202 Accepted** at once. The \`Location\` header points to a job monitor resource.
- The caller polls \`GET /transcode-jobs/{jobId}\`. While the job runs it answers 200 with the job and a \`Retry-After\` header, so callers do not poll every second.
- When the job has succeeded, the monitor answers **303 See Other** with a \`Location\` header that points to the finished rendition. An HTTP client follows it to the result.
- \`DELETE\` on the monitor asks to cancel. Cancelling also takes time, so it answers 202. A job that already finished cannot be cancelled, which is a 409.

**Requirements**
- Keep the title \`Video Transcoding API\` and JSON as the default media type.
- A type \`Profile\` that is a string, one of \`1080p\`, \`720p\`, \`480p\`.
- A type \`TranscodeRequest\` with a required string \`sourceUrl\` and a required \`profiles\` of \`Profile[]\` with at least 1 item.
- A type \`TranscodeJob\` with a required string \`jobId\`, a required \`status\` that is exactly one of \`QUEUED\`, \`PROCESSING\`, \`SUCCEEDED\`, \`FAILED\`, \`CANCELLED\`, and an optional integer \`percentComplete\` from 0 to 100.
- A type \`Rendition\` with required strings \`renditionId\` and \`manifestUrl\`.
- A type \`Error\` with required strings \`code\` and \`message\`.
- \`POST /transcode-jobs\` takes a \`TranscodeRequest\` and returns 202 with a \`TranscodeJob\` and a \`Location\` header, or 400 with an \`Error\`.
- \`GET /transcode-jobs/{jobId}\` returns 200 with a \`TranscodeJob\` and a \`Retry-After\` header, 303 with a \`Location\` header, or 404.
- \`DELETE /transcode-jobs/{jobId}\` returns 202, 409 with an \`Error\`, or 404.
- \`GET /renditions/{renditionId}\` returns 200 with a \`Rendition\`, or 404.
`,
  starter: `#%RAML 1.0
title: Video Transcoding API
mediaType: application/json

types:

/transcode-jobs:
  /{jobId}:

/renditions:
  /{renditionId}:
`,
  ramlChecks: [
    { label: 'Profile only allows 1080p, 720p and 480p', rule: { type: 'typeDecl', name: 'Profile', want: { type: 'string', enum: { exactly: ['1080p', '720p', '480p'] } } } },
    {
      label: 'TranscodeRequest has a required sourceUrl and at least one Profile',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'TranscodeRequest', prop: 'sourceUrl', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'TranscodeRequest', prop: 'profiles', want: { type: 'Profile[]', required: true, minItems: 1 } },
        ],
      },
    },
    { label: 'TranscodeJob.status has exactly the five job states', rule: { type: 'prop', typeName: 'TranscodeJob', prop: 'status', want: { required: true, enum: { exactly: ['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'] } } } },
    { label: 'percentComplete is an optional integer from 0 to 100', rule: { type: 'prop', typeName: 'TranscodeJob', prop: 'percentComplete', want: { type: 'integer', required: false, minimum: 0, maximum: 100 } } },
    { label: 'POST /transcode-jobs takes a TranscodeRequest', rule: { type: 'body', path: '/transcode-jobs', method: 'post', typeIs: 'TranscodeRequest' } },
    { label: 'POST returns 202 with a TranscodeJob and a Location header', rule: { type: 'response', path: '/transcode-jobs', method: 'post', status: '202', typeIs: 'TranscodeJob', header: 'Location' } },
    {
      label: 'POST returns 400 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Error', prop: 'code', want: { type: 'string', required: true } },
          { type: 'prop', typeName: 'Error', prop: 'message', want: { type: 'string', required: true } },
          { type: 'response', path: '/transcode-jobs', method: 'post', status: '400', typeIs: 'Error' },
        ],
      },
    },
    { label: 'The job monitor returns 200 with a TranscodeJob and a Retry-After header', rule: { type: 'response', path: '/transcode-jobs/{}', method: 'get', status: '200', typeIs: 'TranscodeJob', header: 'Retry-After' } },
    { label: 'The job monitor returns 303 with a Location header for a finished job', rule: { type: 'response', path: '/transcode-jobs/{}', method: 'get', status: '303', header: 'Location' } },
    { label: 'The job monitor returns 404 for an unknown job', rule: { type: 'response', path: '/transcode-jobs/{}', method: 'get', status: '404' } },
    {
      label: 'DELETE on the job returns 202, 409 with an Error, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/transcode-jobs/{}', method: 'delete', status: '202' },
          { type: 'response', path: '/transcode-jobs/{}', method: 'delete', status: '409', typeIs: 'Error' },
          { type: 'response', path: '/transcode-jobs/{}', method: 'delete', status: '404' },
        ],
      },
    },
    {
      label: 'GET /renditions/{renditionId} returns a Rendition, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'Rendition', prop: 'manifestUrl', want: { type: 'string', required: true } },
          { type: 'response', path: '/renditions/{}', method: 'get', status: '200', typeIs: 'Rendition' },
          { type: 'response', path: '/renditions/{}', method: 'get', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Video Transcoding API
mediaType: application/json

types:
  Profile:
    type: string
    enum: [ 1080p, 720p, 480p ]
  TranscodeRequest:
    type: object
    properties:
      sourceUrl: string
      profiles:
        type: Profile[]
        minItems: 1
  TranscodeJob:
    type: object
    properties:
      jobId: string
      status:
        type: string
        enum: [ QUEUED, PROCESSING, SUCCEEDED, FAILED, CANCELLED ]
      percentComplete?:
        type: integer
        minimum: 0
        maximum: 100
  Rendition:
    type: object
    properties:
      renditionId: string
      manifestUrl: string
  Error:
    type: object
    properties:
      code: string
      message: string

/transcode-jobs:
  post:
    body:
      type: TranscodeRequest
    responses:
      202:
        headers:
          Location:
            type: string
            description: The URL of the job monitor.
        body:
          type: TranscodeJob
      400:
        body:
          type: Error
  /{jobId}:
    get:
      responses:
        200:
          description: The job is still queued, running, failed or cancelled.
          headers:
            Retry-After:
              type: integer
              description: Seconds to wait before polling again.
          body:
            type: TranscodeJob
        303:
          description: The job succeeded. Follow Location to the rendition.
          headers:
            Location:
              type: string
        404:
          description: No job has this id.
    delete:
      responses:
        202:
          description: The cancel request was accepted.
        409:
          body:
            type: Error
        404:
          description: No job has this id.

/renditions:
  /{renditionId}:
    get:
      responses:
        200:
          body:
            type: Rendition
        404:
          description: No rendition has this id.
`,
  keyPoints: [
    '202 Accepted means the work was taken on, not that it is done.',
    'The Location header on the 202 points to a job monitor the caller can poll.',
    'Retry-After tells callers how long to wait, which keeps polling traffic down.',
    '303 See Other sends the caller from the finished job to its result.',
    'Cancelling a long job is also asynchronous, so DELETE can answer 202.',
  ],
  solution: `
The design separates three things: the request to do work, the job that tracks it, and the result. Each has its own resource, so each can be cached, secured and logged on its own.

The job monitor answers 200 while the job is not finished, with \`Retry-After\` set from the expected remaining time. Once it succeeds, it answers 303 with \`Location\` set to \`/renditions/{renditionId}\`. A failed or cancelled job keeps answering 200, and \`status\` says why there is no result.

\`DELETE\` answers 202 because the farm must stop a running encoder, which is not instant. If the job already reached \`SUCCEEDED\` or \`FAILED\`, there is nothing to cancel, so the answer is 409 with an \`Error\`.

In Mule, the POST flow validates the request, publishes a message to an Anypoint MQ queue, saves the job as \`QUEUED\` and returns at once. A worker flow takes the message and updates the job as it goes.
`,
  followUps: [
    {
      q: 'Why 303 and not 302 or 301 from the job monitor?',
      a: '303 says the result lives at another URL and must be fetched with GET. 301 would claim the monitor itself moved for good. 302 is vague about the method on older clients.',
    },
    {
      q: 'Polling is wasteful. What could the caller use instead?',
      a: 'Offer a webhook or a callback URL in the request, and post the result when the job ends. Keep the job monitor as well, because webhooks can be lost.',
    },
    {
      q: 'How long should finished jobs stay readable?',
      a: 'Keep them for a stated period, such as 7 days, and document it. After that the monitor can answer 404 or 410 Gone.',
    },
    {
      q: 'Where would you store job state in a Mule application on CloudHub 2.0?',
      a: 'Not in memory, because replicas restart and do not share memory. Use a database table or Object Store v2, so every replica can answer a poll for any job.',
    },
  ],
}
