import { design, flow, route, router, scope, source, step } from '../../flow/dsl.js'

const created = (id, blob) => ({
  id,
  eventType: 'Microsoft.Storage.BlobCreated',
  subject: `/blobServices/default/containers/supplier-drops/blobs/${blob}`,
  eventTime: '2026-11-13T09:58:12Z',
  data: { api: 'PutBlob', contentType: 'application/json', url: `https://example.blob.core.windows.net/supplier-drops/${blob}` },
})
const post = (events, type = 'Notification') => ({ http: { method: 'POST', path: '/events/blob-created', headers: { 'aeg-event-type': type }, body: events } })
const validation = [{ id: 'v-1', eventType: 'Microsoft.EventGrid.SubscriptionValidationEvent', data: { validationCode: '512d38b6-c7b8-40c8-89fe-f46f9e9622b6' } }]
const seen = { event_id: 'evt-0042', blob_name: 'feeds/halden-2026-11-12.json' }

export default {
  id: 'fl-174',
  category: 'flows',
  title: 'React to New Blobs With Event Grid Instead of Listing Every Minute: Answer the Handshake, Hand Each Event to a VM Queue, Ignore Repeats',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'event-grid', 'webhook', 'vm-queue', 'idempotency', 'http', 'retail'],
  estMinutes: 50,
  flowChecks: [
    { label: 'Event Grid posts to POST /events/blob-created', rule: { type: 'source', component: 'http-listener', where: { path: '/events/blob-created', allowedMethods: 'POST' } } },
    {
      label: 'The subscription handshake is answered with the validation code',
      rule: { type: 'inside', component: 'set-payload', within: 'choice', where: { value: 'validationResponse' } },
    },
    { label: 'Each BlobCreated event is handed to a VM queue, not processed while Event Grid waits', rule: { type: 'linked', from: { component: 'vm-publish', key: 'queueName' }, to: { component: 'vm-listener', key: 'queueName' } } },
    {
      label: 'The worker records the event ID first and skips one it has seen',
      rule: { type: 'before', first: 'db-insert', firstWhere: { sql: 'processed_blob_events' }, then: 'azure-download-blob' },
    },
    { label: 'The new blob is downloaded from supplier-drops and sent to the catalogue import', rule: { type: 'before', first: 'azure-download-blob', firstWhere: { container: 'supplier-drops' }, then: 'http-request' } },
  ],
  simulation: {
    systems: {
      db: { tables: { processed_blob_events: { key: 'event_id', rows: [seen] } } },
      calls: { 'azure-download-blob': { payload: { supplierId: 'HALDEN-PAINTS', items: [{ supplierItemId: 'SI-1', costPrice: 4.1 }] } } },
      http: [{ method: 'POST', path: '/catalog/v1/imports', respond: { status: 202, body: { importId: 'IMP-1' } } }],
    },
    tests: [
      {
        name: 'Event Grid checks the endpoint',
        about: 'When the subscription is created, Event Grid sends a validation event. The endpoint answers with the code, and nothing else happens.',
        trigger: post(validation, 'SubscriptionValidation'),
        expect: { status: 200, body: { validationResponse: '512d38b6-c7b8-40c8-89fe-f46f9e9622b6' }, connector: [{ type: 'azure-download-blob', count: 0 }] },
      },
      {
        name: 'A supplier drops a new feed',
        about: 'A BlobCreated event arrives. Event Grid gets 200 at once, and the worker downloads feeds/halden-2026-11-13.json and sends it to the catalogue import.',
        trigger: post([created('evt-0051', 'feeds/halden-2026-11-13.json')]),
        expect: {
          status: 200,
          maxMs: 500,
          connector: [{ type: 'azure-download-blob', settings: { container: 'supplier-drops', fileName: 'feeds/halden-2026-11-13.json' }, count: 1 }],
          calls: [{ method: 'POST', path: '/catalog/v1/imports', count: 1, has: { supplierId: 'HALDEN-PAINTS' } }],
          db: { processed_blob_events: { count: 2 } },
        },
      },
      {
        name: 'The same event delivered again',
        about: 'Event Grid did not hear the first 200 in time and sends evt-0042 again. It is answered, and the feed is not imported twice.',
        trigger: post([created('evt-0042', 'feeds/halden-2026-11-12.json')]),
        expect: { status: 200, connector: [{ type: 'azure-download-blob', count: 0 }], calls: [{ method: 'POST', path: '/catalog/v1/imports', count: 0 }] },
      },
      {
        name: 'A blob is deleted',
        about: 'The subscription also sends BlobDeleted events. They are accepted and ignored.',
        trigger: post([{ ...created('evt-0052', 'feeds/old.json'), eventType: 'Microsoft.Storage.BlobDeleted' }]),
        expect: { status: 200, connector: [{ type: 'azure-download-blob', count: 0 }], db: { processed_blob_events: { count: 1 } } },
      },
    ],
  },
  referenceFlow: design(
    flow('receive-blob-events', source('http-listener', { path: '/events/blob-created', allowedMethods: 'POST' }), [
      router(
        'choice',
        {},
        [
          route({ expression: '#[attributes.headers."aeg-event-type" == "SubscriptionValidation"]' }, [
            step('set-payload', { value: '#[output application/json --- { validationResponse: payload[0].data.validationCode }]' }),
          ]),
        ],
        {
          otherwise: [
            scope('foreach', { collection: '#[payload filter ((e) -> e.eventType == "Microsoft.Storage.BlobCreated")]' }, [
              step('set-payload', { value: '#[output application/json --- { eventId: payload.id, blobName: (payload.subject splitBy "/blobs/")[1] }]' }),
              step('vm-publish', { queueName: 'blob-created-events' }),
            ]),
            step('set-payload', { value: '#[output application/json --- { received: true }]' }),
          ],
        },
      ),
    ]),
    flow('import-new-blob', source('vm-listener', { queueName: 'blob-created-events' }), [
      step('set-variable', { variableName: 'event', value: '#[payload]' }),
      step('db-insert', {
        database: 'PostgreSQL',
        sql: 'INSERT INTO processed_blob_events (event_id, blob_name) VALUES (:eventId, :blobName) ON CONFLICT (event_id) DO NOTHING',
        inputParameters: '#[{ eventId: vars.event.eventId, blobName: vars.event.blobName }]',
        target: 'recorded',
      }),
      router(
        'choice',
        {},
        [
          route({ expression: '#[vars.recorded.affectedRows == 1]' }, [
            step('azure-download-blob', { container: 'supplier-drops', fileName: '#[vars.event.blobName]' }),
            step('http-request', { method: 'POST', path: '/catalog/v1/imports' }),
          ]),
        ],
        { otherwise: [step('logger', { level: 'INFO', message: '#["Event " ++ vars.event.eventId ++ " seen before, skipped"]' })] },
      ),
    ]),
  ),
  description: `
Copperline Home Supply (fictional) lets suppliers drop price and item feeds in the Azure Blob Storage container \`supplier-drops\`. A Mule flow listed the container every minute, which meant up to a minute of delay, many empty listings, and a watermark that once skipped files.

The platform team has set up **Azure Event Grid** on the storage account. It posts events to \`POST /events/blob-created\` as a JSON array. A BlobCreated event looks like:

\`{ "id": "evt-0051", "eventType": "Microsoft.Storage.BlobCreated", "subject": "/blobServices/default/containers/supplier-drops/blobs/feeds/halden-2026-11-13.json", "data": { "url": "..." } }\`

Two facts about Event Grid that matter here:
- When the subscription is created, Event Grid sends a **validation** event with the header \`aeg-event-type: SubscriptionValidation\` and a \`data.validationCode\`. The endpoint must answer \`{ "validationResponse": "<code>" }\`.
- Event Grid retries an event it did not get a success answer for in time, so the same event can arrive more than once.

**Requirements**
- Answer the validation handshake.
- For every \`BlobCreated\` event, hand \`{ eventId, blobName }\` to a second flow over a VM queue, and answer 200 at once. Ignore other event types.
- The second flow records the event in \`processed_blob_events\` (\`event_id\`, \`blob_name\`) and skips one already recorded. For a new one, it downloads the blob from \`supplier-drops\` and posts it to \`POST /catalog/v1/imports\`.

**Facts**
- \`eventId\` is the event's \`id\`. \`blobName\` is the part of \`subject\` after \`/blobs/\`, such as \`feeds/halden-2026-11-13.json\`.
- \`processed_blob_events\` is a PostgreSQL table with a primary key on \`event_id\`. Record the event before the download.
- Post the downloaded feed as it is to the import.
- Answer Event Grid within half a second.

**What each system sends back**
- An \`INSERT ... ON CONFLICT (event_id) DO NOTHING\` answers \`{ "affectedRows": n }\`: 1 for a new event, 0 for one already recorded.
- Download Blob replaces the payload with the feed, for example \`{ "supplierId": "HALDEN-PAINTS", "items": [ { "supplierItemId": "SI-1", "costPrice": 4.1 } ] }\`.
- The catalogue import answers **202** with \`{ "importId": "IMP-1" }\`.

**Design the flows.**
`,
  answerTemplate: `## The handshake

## Answering Event Grid fast

## The worker and repeats
`,
  keyPoints: [
    'Event Grid pushes an event when a blob is created, so work starts in seconds and nothing is listed for nothing.',
    'The validation handshake proves the endpoint belongs to whoever created the subscription. Echo the code back in validationResponse.',
    'Answer the webhook quickly and do the work behind a queue. A slow answer makes Event Grid retry, which makes repeats.',
    'The blob name is the part of the subject after /blobs/. Folders in the name are kept.',
    'INSERT ... ON CONFLICT DO NOTHING both records the event and tells whether it was new: affectedRows is 1 for a new event and 0 for a repeat.',
    'A VM queue lives inside one Mule app. Make it persistent, or use Anypoint MQ, if an event accepted with 200 must survive a restart.',
  ],
  solution: `
**Flow \`receive-blob-events\`**
1. **HTTP Listener** \`POST /events/blob-created\`.
2. **Choice**:
   - \`#[attributes.headers."aeg-event-type" == "SubscriptionValidation"]\`: **Set Payload** \`{ validationResponse: payload[0].data.validationCode }\`.
   - Otherwise: **For Each** over the BlobCreated events: **Set Payload** \`{ eventId: payload.id, blobName: (payload.subject splitBy "/blobs/")[1] }\`, **VM Publish** to \`blob-created-events\`. Then answer \`{ received: true }\`.

**Flow \`import-new-blob\`**
1. **VM Listener** on \`blob-created-events\`. **Set Variable** \`event\`.
2. **Database Insert** \`... ON CONFLICT (event_id) DO NOTHING\`, Target \`recorded\`.
3. **Choice** \`#[vars.recorded.affectedRows == 1]\`: **Download Blob** from \`supplier-drops\`, **HTTP Request** \`POST /catalog/v1/imports\`. Otherwise an INFO log.

**Securing the endpoint.** Anyone could post fake events. Protect it, for example with a secret in the subscription's endpoint address checked by a gateway policy, or with Microsoft Entra authentication for webhook delivery.

**A safety net.** Keep a daily listing job that finds blobs with no processed event, in case an event was lost.
`,
  followUps: [
    {
      q: 'Why record the event before downloading, not after the import?',
      a: 'A repeat that arrives while the first is still importing would otherwise pass. The cost: if the import fails, the event is recorded but not done, so failures must be retried by the worker itself or from the safety net job.',
    },
    {
      q: 'Could Event Grid deliver to a queue instead of Mule?',
      a: 'Yes. It can deliver to an Azure Storage queue or a Service Bus queue, and Mule consumes from there. Then nothing is lost while Mule is down, which is often the better design.',
    },
  ],
}
