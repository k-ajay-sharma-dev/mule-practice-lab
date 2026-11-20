import { diagram } from '../../arch/dsl.js'

export default {
  id: 'ar-141',
  category: 'architecture',
  title: 'Lease Contract PDFs That Take 30 Seconds: 202 Accepted, a Job Queue, a Status Store and a Callback',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'async-request-reply', 'long-running', 'anypoint-mq', 'callbacks', 'timeouts', 'partners'],
  estMinutes: 35,
  diagram: {
    task: 'draw the contract document service: dealers calling through the API gateway, an Experience API that records each request in a database named status store and puts it on a queue, a worker Process API that takes requests from the queue and calls the document generator through a System API, the file store for the finished PDFs, a dead-letter queue, and the callback from the worker to the dealer.',
    checks: [
      { label: 'Dealers come in through the API gateway', rule: { type: 'path', from: 'partner', via: 'api-gateway', to: 'experience-api' } },
      { label: 'The Experience API hands each request to a queue as an async message', rule: { type: 'edge', from: 'experience-api', to: 'queue', kind: 'async' } },
      {
        label: 'No chain of sync calls from the Experience API to the document generator, so the dealer never waits for a PDF',
        rule: { type: 'no-path', from: 'experience-api', to: 'saas', kind: 'sync' },
      },
      { label: 'A worker Process API takes the requests from the queue', rule: { type: 'edge', from: 'queue', to: 'process-api', kind: 'async' } },
      { label: 'The document generator is reached only through a System API', rule: { type: 'only-via', target: 'saas', from: 'system-api' } },
      { label: 'The Experience API reads job status from a status store', rule: { type: 'edge', from: 'experience-api', to: { type: ['database', 'cache'], label: ['status', 'job'] } } },
      { label: 'The worker writes its progress to the same status store', rule: { type: 'edge', from: 'process-api', to: { type: ['database', 'cache'], label: ['status', 'job'] } } },
      { label: 'The worker saves the finished PDF in file storage', rule: { type: 'edge', from: 'process-api', to: ['file-store', 's3-bucket', 'azure-blob'] } },
      { label: 'The worker calls the dealer back when the PDF is ready', rule: { type: 'edge', from: 'process-api', to: 'partner' } },
      { label: 'The request queue has a dead-letter queue', rule: { type: 'each', of: 'queue', edgeTo: 'dlq' } },
      { label: 'Every line to or from a queue is an async message', rule: { type: 'lines', touching: ['queue', 'dlq'], kind: 'async' } },
    ],
    reference: diagram(
      {
        dlr: ['partner', 'Dealer portals'],
        gw: ['api-gateway', 'API gateway (client ID, rate limit)', { auth: 'client-id' }],
        exp: ['experience-api', 'exp-dealer-documents-api'],
        status: ['database', 'Document job status store'],
        q: ['queue', 'contract-document-requests', { maxRedelivery: 60 }],
        dlq: ['dlq', 'contract-document-requests DLQ'],
        wrk: ['process-api', 'prc-contract-document-worker', { timeoutMs: 60000 }],
        sys: ['system-api', 'sys-docgen-api', { timeoutMs: 45000 }],
        gen: ['saas', 'Document generator (SaaS)'],
        files: ['s3-bucket', 'Contract PDFs bucket'],
      },
      ['dlr -> gw', 'gw -> exp', 'exp -> status', 'exp ~> q', 'q ~> wrk', 'q ~> dlq', 'wrk -> sys', 'sys -> gen', 'wrk -> files', 'wrk -> status', 'wrk -> dlr'],
    ),
    simulation: {
      systems: [
        { match: 'saas', latencyMs: 30000, maxRps: 2 },
        { match: 'database', latencyMs: 10 },
      ],
      tests: [
        {
          name: 'Month end',
          about: 'Dealers ask for 3 contracts a second for 20 minutes, more than the generator can make. Every request is accepted at once, the queue holds the rest, and every PDF is made within the hour.',
          traffic: [{ name: 'contract requests', from: 'partner', rps: 3, forMin: 20, to: 'saas', kind: 'write' }],
          durationMin: 60,
          expect: {
            answers: [{ minSuccess: 0.99, maxMs: 500 }],
            delivered: [{ to: 'saas', min: 0.99 }],
            backlog: [{ queue: 'queue', maxEnd: 50 }],
            lost: { max: 0 },
          },
        },
        {
          name: 'The generator is down for 30 minutes',
          about: 'Dealers ask for 1 contract a second. The document generator is down from minute 5 to minute 35. Requests are still accepted, they wait in the queue, and they are all made once the generator is back.',
          traffic: [{ name: 'contract requests', from: 'partner', rps: 1, to: 'saas', kind: 'write' }],
          incidents: [{ down: 'saas', at: 5, forMin: 30 }],
          durationMin: 90,
          expect: {
            answers: [{ minSuccess: 0.99 }],
            delivered: [{ to: 'saas', min: 0.99 }],
            dlq: { max: 0 },
            lost: { max: 0 },
          },
        },
      ],
    },
  },
  description: `
A car leasing company lets its dealers download the **lease contract PDF** for each deal through a partner API. The PDF comes from a SaaS **document generator** that fills a template with the deal, the customer and 40 pages of terms.

Today the call is synchronous: \`POST /deals/{dealId}/contract\` waits for the generator and returns the PDF.

Facts:
- The generator takes **20 to 40 seconds** per contract, about 30 on average, and makes at most **2 a second**.
- Dealer portals time out after **30 seconds**, so about half of the calls fail even when the PDF is made. Dealers then click again and start a second PDF.
- On the last days of the month dealers ask for up to **3 contracts a second** for long stretches.
- The generator vendor has a maintenance window once a month of about 30 minutes, with no warning.
- Dealer portals can receive a **callback**: an HTTPS call to a URL they register, with the result.
- A Mule HTTP call gives up after 10 seconds by default, unless you set a longer timeout.
- A message that fails is redelivered from the queue about once a minute. The redelivery limit must cover the maintenance window, so that good requests do not end up in the dead-letter queue.

**Questions:**
- Draw a design where a dealer never waits for the generator.
- What does the dealer get back at once, and how does it learn the PDF is ready?
- Where do the PDFs and the progress of each request live?
- What happens during month end and during the maintenance window?
`,
  answerTemplate: `## Design

## What the dealer gets at once

## Status and callback

## Where the PDFs live

## Month end and the maintenance window
`,
  keyPoints: [
    'Work that takes longer than the caller can wait becomes a job: accept it, answer 202 Accepted with a job ID, and do the work later.',
    'The queue absorbs month end. The dealer is answered in milliseconds while the generator works at its own 2 a second.',
    'A status store shared by the Experience API and the worker lets a dealer ask GET /document-jobs/{jobId} at any time.',
    'A callback tells the dealer when the PDF is ready, so it does not have to poll. Polling stays as the fallback.',
    'The worker has no user waiting, so its timeouts can be longer than the generator\'s slowest PDF. The Experience API keeps short ones.',
    'The queue must keep requests through a 30 minute outage, so the redelivery limit must be higher than the retries an outage causes. Poison requests still reach the DLQ.',
    'Store PDFs in object storage and hand out a time-limited download link. Large files do not belong in a queue or a status table.',
    'Use the deal ID as the job key, so a dealer clicking twice gets the same job, not a second PDF.',
  ],
  solution: `
**Design**
\`\`\`
Dealer portals ─► API gateway ─► exp-dealer-documents-api ─► Document job status store
                                          ~► contract-document-requests ~► prc-contract-document-worker
                                                       ~► DLQ                 ─► sys-docgen-api ─► Document generator
                                                                              ─► Contract PDFs bucket
                                                                              ─► status store
                                                                              ─► dealer callback URL
\`\`\`

**What the dealer gets at once.** \`POST /deals/{dealId}/contract\` writes a job row (\`QUEUED\`) and publishes a message, then answers **202 Accepted** with \`{ "jobId": "...", "status": "QUEUED" }\` and a \`Location\` header for \`GET /document-jobs/{jobId}\`. This takes milliseconds, whatever the generator is doing. If a job for that deal is already queued or running, the API returns the same job.

**Status and callback.** The worker sets the job to \`RUNNING\`, calls the generator through \`sys-docgen-api\`, saves the PDF to the bucket, sets the job to \`DONE\` with the file key, and calls the dealer's registered callback URL with the job ID. \`GET /document-jobs/{jobId}\` reads the status store and, when the job is done, returns a download link that expires after a short time.

**Timeouts.** \`sys-docgen-api\` waits up to 45 seconds and the worker up to 60. Nobody is waiting on these calls, so a long timeout costs only a thread in the worker. The Experience API keeps short timeouts on the status store.

**Month end.** 3 requests a second arrive and 2 a second are made. The queue grows by about one a second for the busy stretch and empties within the hour. Every dealer is answered at once, and no PDF is made twice because dealers no longer click again.

**Maintenance window.** The worker's calls fail, so each message goes back to the queue and is tried again. The redelivery limit of 60 tries outlasts a 30 minute outage, so good requests are not sent to the DLQ. A request that fails for its own reason, such as a deal with missing data, still reaches the DLQ after 60 tries, and the job is marked \`FAILED\` for the dealer.
`,
  followUps: [
    {
      q: 'Why not keep the synchronous API and raise the dealer timeout to 60 seconds?',
      a: 'Each call then holds a thread in three APIs for 30 seconds, and month end needs about 90 at once. The generator still only makes 2 a second, so the extra calls fail anyway. Dealers also cannot change their portal timeouts quickly.',
    },
    {
      q: 'What if a dealer\'s callback URL is down?',
      a: 'The PDF is safe in the bucket and the job is DONE, so the dealer can still poll. Retry the callback a few times with a delay, then stop. The callback is a convenience, not the only way to learn the result.',
    },
    {
      q: 'Why not put the PDF itself on the queue or in the status table?',
      a: 'A 40 page PDF can be several megabytes. Queues have message size limits, and a status table full of files is slow to back up and query. Keep the file in object storage and pass its key.',
    },
  ],
}
