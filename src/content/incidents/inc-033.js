export default {
  id: 'inc-033',
  category: 'incidents',
  title: 'Large Claim Uploads Rejected With 413 Before Reaching Mule',
  level: 'INTERMEDIATE',
  tags: ['http', 'gateway', 'payload-size', 'load-balancer', 'api-design'],
  estMinutes: 20,
  investigation: {
    logs: [
      { text: '10:14:02 ingress POST /api/claims 201 512 req_bytes=2100331 upstream=claims-eapi', relevant: true, why: 'Small claims pass through to claims-eapi, so the route and the app work.' },
      { text: '10:14:05 ingress GET /api/claims/C-88120 200 1840 upstream=claims-eapi', relevant: false },
      { text: '10:14:09 ingress POST /api/claims 413 0 "client body too large" req_bytes=31457280 upstream=-', relevant: true, why: 'upstream=- : the ingress rejected the 30 MB body itself and never forwarded it, which is why Mule has no trace.' },
      { text: '10:14:09.300 INFO  [claims-eapi] POST /api/claims 201 claimId=CL-4471 corrId=be21', relevant: false },
      { text: '10:14:10.000 INFO  [health] GET /health 200 (3 ms)', relevant: false },
      { text: '10:14:12 ingress POST /api/claims 413 0 "client body too large" req_bytes=38010880 upstream=-', relevant: true, why: 'Another large claim (10 photos, base64 adds about a third) rejected at the ingress body limit.' },
      { text: '10:14:20 mobile-app v5.2.0 rollout 60%: photo limit raised from 3 to 10 per claim', relevant: true, why: 'The client change that increased payload sizes past the platform limit.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Where is the request rejected and why?',
        options: [
          'At the ingress/gateway: the body exceeds its configured size limit, so it is never forwarded to Mule',
          'In claims-eapi: the HTTP Listener rejects large bodies',
          'In claims-sapi: the document store returns 413',
          'On the mobile device: the OS blocks large uploads',
        ],
        answer: 0,
        explain: 'The ingress log shows 413 with **upstream=-** and Mule logs nothing, so the proxy layer rejected the body before it reached Mule.',
      },
      {
        type: 'single',
        prompt: 'What is a sensible quick mitigation?',
        options: [
          'Remove the body size limit on the ingress for all routes',
          'Raise the limit on /api/claims only, after checking every hop can handle it, or have the app resize/cap photos for now',
          'Increase the vCores of claims-eapi',
          'Tell users to submit fewer photos via a support article',
        ],
        answer: 1,
        explain: 'A targeted, verified limit change (or a client-side cap) restores service without opening every route to huge bodies.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **long-term design and prevention**?',
        options: [
          'Upload photos directly to object storage with pre-signed URLs and send only references in the claim JSON',
          'If Mule must carry binaries, stream them (no DataWeave over base64 blobs, no payload logging)',
          'Document the max request size in the API spec and add boundary tests to the client release checklist',
          'Keep base64 photos in JSON but compress the JSON with gzip so no limits apply',
        ],
        answer: [0, 1, 2],
        explain: 'Separate binaries from metadata, stream when needed, and make limits part of the contract. Compression does not remove memory cost once the body is decoded.',
      },
      {
        type: 'order',
        prompt: 'Put the response in order.',
        items: [
          'Notice Mule has no logs for the failures and check the ingress access log',
          'Confirm the 413s with upstream=- correlate with the new mobile release',
          'Raise the limit on the claims route only (or cap photos in the app)',
          'Redesign uploads to use object storage references',
          'Document size limits and monitor ingress 4xx per route',
        ],
        explain: 'Follow the request path to the layer that rejects it, mitigate narrowly, then fix the design.',
      },
    ],
  },
  description: `
## Symptoms
- The insurance claims portal posts claims (JSON with base64-encoded photos) to \`claims-eapi\`.
- Since the mobile app release that allows **up to 10 photos**, some users get **HTTP 413 Payload Too Large**.
- The Mule app logs show **no trace** of the failing requests — no correlation IDs, nothing.
- Small claims work fine.

## Change / Context
- Traffic path: mobile app → corporate API gateway / ingress (reverse proxy) → CloudHub 2.0 \`claims-eapi\` → \`claims-sapi\` → document store.
- Typical new claims are **15–40 MB** after base64 encoding (base64 adds ~33%).
- The ingress has a request body limit configured; nobody remembers the value.

## Logs
\`\`\`
# claims-eapi: nothing for the failing requests
# ingress access log:
POST /api/claims 413 0 "client body too large" req_bytes=31457280 upstream=-
POST /api/claims 201 512 req_bytes=2100331 upstream=claims-eapi
\`\`\`

## Your tasks
1. Where is the request being rejected and why?
2. What can you do quickly?
3. What is the better long-term design?
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'No Mule log entry + upstream=- in the ingress log shows the request is rejected at the gateway/ingress before reaching Mule.',
    '413 is caused by the body size limit on the proxy layer; base64 inflates image sizes by about a third.',
    'Immediate: raise the limit carefully on that route only (and check every hop: ingress, gateway, Mule, downstream) or restrict photo count/size in the app.',
    'Better design: upload binaries directly to object storage via pre-signed URLs or multipart/binary uploads, and send only references in the JSON claim.',
    'Large JSON bodies with base64 inflate memory use in Mule (repeatable streams, DataWeave) and should be avoided.',
    'Prevention: document size limits in the API spec (RAML/OAS) and test payload size boundaries before releasing client changes.',
  ],
  solution: `
## Diagnosis
The ingress log shows \`413 ... client body too large\` with **no upstream** — the reverse proxy rejected the request before it reached \`claims-eapi\`, so Mule has nothing to log. The new mobile release allows bigger claims; with base64's ~33% overhead, 10 photos easily exceed the configured body limit.

## Immediate mitigation
- Raise the body size limit **for the \`/api/claims\` route only**, to a value you've verified every hop can handle (gateway, Mule app memory, \`claims-sapi\`, document store).
- Or ask the mobile team to compress/resize photos or cap the count until the design is fixed.

## Root cause
A client change increased payload sizes without checking platform limits, and the API design embeds large binaries in JSON.

## Permanent fix
- Split metadata from binaries: the claim JSON holds references; photos go to object storage via **pre-signed URLs** or a dedicated binary/multipart upload endpoint that streams.
- If Mule must pass binaries, stream them (no DataWeave over base64 blobs, no logging of payloads) and size replicas for it.

## Prevention
- Document max request size in the API spec and developer portal; return a clear 413 message.
- Include boundary tests (just under/over the limit) in the release checklist for client apps.
- Monitor ingress 4xx by route so a jump in 413s is visible.
`,
  followUps: [
    { q: 'Why does base64 increase size?', a: 'It encodes every 3 bytes as 4 ASCII characters, so payloads grow by about 33%, plus JSON escaping overhead.' },
    { q: 'Why is a big JSON body expensive in Mule?', a: 'Parsing JSON in DataWeave can require the whole document in memory, and repeatable streams buffer it, so many concurrent 40 MB requests can exhaust heap.' },
  ],
}
