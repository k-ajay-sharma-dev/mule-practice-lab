import { design, flow, handler, scope, source, step } from '../../flow/dsl.js'

const blobs = [{ name: 'new/clm-0001.json' }, { name: 'new/clm-0002.json' }, { name: 'new/clm-0003.json' }]
const claim = (id) => ({ payload: { claimRef: id, policyNo: 'MP-77120', amount: 640 } })
const api = { method: 'POST', path: '/claims/v1/claims', respond: { status: 201, body: { claimId: 'C-1' } } }

export default {
  id: 'fl-172',
  category: 'flows',
  title: 'Partner Claim Files in Azure Blob Storage: Move a Refused File to an Error Container With Its Reason, and Leave the Rest When the API Is Down',
  level: 'ADVANCED',
  tags: ['myproject', 'azure-blob', 'error-container', 'scheduler', 'foreach', 'error-handling', 'insurance'],
  estMinutes: 40,
  flowChecks: [
    { label: 'Partner files are listed under new/ in claims-inbound', rule: { type: 'exists', component: 'azure-list-blobs', where: { containerName: 'claims-inbound', blobPath: 'new/' } } },
    { label: 'Each file is downloaded and sent in its own Try inside the loop', rule: { type: 'inside', component: 'http-request', within: 'try', where: { path: '/claims/v1/claims' } } },
    { label: 'A file the API accepted is deleted from claims-inbound', rule: { type: 'before', first: 'http-request', then: 'azure-delete-blob', outside: true } },
    {
      label: 'A file the API refuses goes to claims-errors with its reason, then leaves claims-inbound',
      rule: {
        type: 'all',
        rules: [
          { type: 'inside', component: 'azure-upload-blob', within: 'on-error-continue', withinWhere: { type: 'BAD_REQUEST' }, where: { container: 'claims-errors' } },
          { type: 'inside', component: 'azure-delete-blob', within: 'on-error-continue', withinWhere: { type: 'BAD_REQUEST' } },
        ],
      },
    },
    {
      label: 'An API outage leaves the files where they are for the next run',
      rule: {
        type: 'all',
        rules: [
          { type: 'handler', component: 'on-error-continue', where: { type: { oneOf: ['SERVICE_UNAVAILABLE', 'CONNECTIVITY'] } } },
          { type: 'absent', component: 'azure-delete-blob', within: 'on-error-continue', withinWhere: { type: { oneOf: ['SERVICE_UNAVAILABLE', 'CONNECTIVITY'] } } },
        ],
      },
    },
  ],
  simulation: {
    systems: {
      http: [api],
      calls: { 'azure-list-blobs': { payload: blobs }, 'azure-download-blob': [claim('MP-C-1'), claim('MP-C-2'), claim('MP-C-3')], 'azure-upload-blob': { payload: true }, 'azure-delete-blob': { payload: true } },
    },
    tests: [
      {
        name: 'One file is refused',
        about: 'The second claim has an amount the API refuses with 400. It is written to claims-errors with the API\'s reason and removed from claims-inbound. The other two are sent and removed.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ ...api, respond: undefined, responses: [{ status: 201, body: {} }, { status: 400, body: { message: 'amount must not exceed the policy limit' } }, { status: 201, body: {} }] }] } },
        expect: {
          noError: true,
          connector: [
            { type: 'azure-delete-blob', settings: { container: 'claims-inbound' }, count: 3 },
            { type: 'azure-upload-blob', settings: { container: 'claims-errors', fileName: 'new/clm-0002.json' }, count: 1 },
          ],
          calls: [
            { method: 'POST', path: '/claims/v1/claims', count: 3 },
            { method: 'POST', path: '/claims/v1/claims', count: 1, has: { claimRef: 'MP-C-1', policyNo: 'MP-77120' } },
          ],
        },
      },
      {
        name: 'The claims API is down',
        about: 'Every call gets 503. Nothing is deleted and nothing goes to claims-errors: the next run sends them, and a WARN says why.',
        trigger: { schedule: {} },
        overrides: { systems: { http: [{ ...api, respond: { status: 503, body: {} } }] } },
        expect: { noError: true, connector: [{ type: 'azure-delete-blob', count: 0 }, { type: 'azure-upload-blob', count: 0 }], logs: [{ level: 'WARN' }] },
      },
    ],
  },
  referenceFlow: design(
    flow('send-partner-claim-files', source('scheduler', { strategy: 'fixed-frequency', frequency: 5, timeUnit: 'MINUTES' }), [
      step('azure-list-blobs', { containerName: 'claims-inbound', blobPath: 'new/' }),
      scope('foreach', { collection: '#[payload]' }, [
        step('set-variable', { variableName: 'blobName', value: '#[payload.name]' }),
        scope(
          'try',
          {},
          [
            step('azure-download-blob', { container: 'claims-inbound', fileName: '#[vars.blobName]' }),
            step('set-variable', { variableName: 'claim', value: '#[payload]' }),
            step('http-request', { method: 'POST', path: '/claims/v1/claims' }),
            step('azure-delete-blob', { container: 'claims-inbound', fileName: '#[vars.blobName]' }),
          ],
          {
            errorHandlers: [
              handler('on-error-continue', { type: 'HTTP:BAD_REQUEST' }, [
                step('set-payload', { value: '#[output application/json --- { blobName: vars.blobName, reason: error.errorMessage.payload.message default error.description, claim: vars.claim }]' }),
                step('azure-upload-blob', { container: 'claims-errors', fileName: '#[vars.blobName]', fileStream: '#[payload]', contentType: 'application/json' }),
                step('azure-delete-blob', { container: 'claims-inbound', fileName: '#[vars.blobName]' }),
                step('logger', { level: 'WARN', message: '#["Claim file " ++ vars.blobName ++ " refused and moved to claims-errors"]' }),
              ]),
              handler('on-error-continue', { type: 'HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY, HTTP:TIMEOUT' }, [
                step('logger', { level: 'WARN', message: '#["Claims API unavailable, " ++ vars.blobName ++ " left for the next run"]' }),
              ]),
            ],
          },
        ),
      ]),
    ]),
  ),
  description: `
Mintbridge Motor Insurance (fictional) receives claims from repair partners. Each partner uploads one JSON file per claim to the Azure Blob Storage container \`claims-inbound\`, under \`new/\`. Mule sends each one to the claims system with \`POST /claims/v1/claims\`.

Two things go wrong today:
- A file the claims API refuses with **400** stays in \`new/\` and is sent, and refused, every 5 minutes for ever. The partner never hears about it.
- When the claims API is down, the flow stops at the first file.

**Requirements**
- Every 5 minutes, list \`new/\` in \`claims-inbound\` and handle each file on its own.
- Accepted (2xx): delete the file from \`claims-inbound\`.
- Refused (400): write \`{ blobName, reason, claim }\` to the container \`claims-errors\` under the same blob name, using the \`message\` from the API's answer as the reason. Then delete the file from \`claims-inbound\`. The partner team reads \`claims-errors\` each morning.
- API unavailable (503, connection refused, timeout): leave the file where it is, log a WARN and go on. The next run tries again.

**Facts**
- Send the downloaded file as it is as the body of the POST.
- A 400 raises **HTTP:BAD_REQUEST**, and the API's answer is in \`error.errorMessage.payload\`. A 503 raises **HTTP:SERVICE_UNAVAILABLE**, a refused connection **HTTP:CONNECTIVITY** and a timeout **HTTP:TIMEOUT**.
- The run itself must end without an error in both cases.

**Design the flow.**
`,
  answerTemplate: `## Listing and the loop

## Accepted files

## Refused files

## When the API is down
`,
  keyPoints: [
    'A file that can never succeed must leave the inbound area, or it is retried for ever and hides real problems.',
    'Tell a refusal (400: the content is wrong) from an outage (503 or no answer: try later). Only the first moves to the error container.',
    'The error blob holds the original claim and the reason, so the partner team can act without digging in logs.',
    'Write the error blob first, delete the original second. A failure in between leaves a copy in both places, never in neither.',
    'A Try per file inside the For Each keeps one bad file from stopping the rest.',
    'The download sits inside the Try too, so a file that disappears between the list and the download is skipped, not fatal.',
  ],
  solution: `
1. **Scheduler** every 5 minutes.
2. **List Blobs** \`claims-inbound\`, folder \`new/\`.
3. **For Each** blob: \`blobName\` = \`#[payload.name]\`, then a **Try**:
   - **Download Blob**, keep the claim in \`claim\`, **HTTP Request** \`POST /claims/v1/claims\`, **Delete Blob** from \`claims-inbound\`.
   - **On Error Continue** \`HTTP:BAD_REQUEST\`: build \`{ blobName, reason: error.errorMessage.payload.message, claim }\`, **Upload Blob** to \`claims-errors\`, **Delete Blob** from \`claims-inbound\`, WARN.
   - **On Error Continue** \`HTTP:SERVICE_UNAVAILABLE, HTTP:CONNECTIVITY, HTTP:TIMEOUT\`: WARN only.

**Stopping early in an outage.** With hundreds of files, each waits for its own 503. Stop the loop on the first outage error, as an On Error Propagate inside the loop and a Try around it, so the run ends at once.

**Two workers.** In a cluster the Scheduler runs on the primary node only, so two runs never pick up the same file.
`,
  followUps: [
    {
      q: 'A partner fixes a refused claim. How does it get back in?',
      a: 'They upload the corrected file to new/ under a new name. The error blob stays in claims-errors as a record, with a lifecycle rule that deletes it after some months.',
    },
    {
      q: 'Why not use a dead letter queue instead of a container?',
      a: 'The work here starts from blobs, so a container is the natural place for refused ones, and partners can already read storage. A queue fits when the work arrives as messages.',
    },
  ],
}
