export default {
  id: 'ms-259',
  category: 'mulesoft',
  title: 'New Blob, Now What? Event Grid BlobCreated Events, Partner JMS Notifications and Sweeps in a Claim Check Hub',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'event-grid', 'claim-check', 'jms', 'webhooks', 'event-driven', 'product-data-hub'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner uploads a 3 GB file with Put Block calls and then Put Block List. The hub subscribes to Microsoft.Storage.BlobCreated. When does the event fire?',
      options: ['Once for each Put Block, so the hub must wait for the last one', 'When the first block is staged, so the hub may read a partial file', 'Once, after Put Block List commits, so the file is complete', 'Twice, once for the first block and once at commit'],
      answer: 2,
      explain: 'Blob Storage publishes BlobCreated and BlobDeleted events, among others, through an Event Grid system topic for the account. BlobCreated fires when a blob is created or replaced, which for a block upload is the Put Block List commit. Staged blocks are not part of the blob yet, so they raise no event. That is why the event cannot point to a half written file, unlike a notification sent too early.',
    },
    {
      type: 'single',
      prompt: 'A Mule HTTP listener is set as an Event Grid webhook endpoint. Event Grid first sends a SubscriptionValidationEvent. What must the flow do?',
      options: [
        'Ignore it and return 200',
        'Answer with the validation code it received',
        'Answer with the subscription name header value',
        'Forward it to the JMS queue like other events',
      ],
      answer: 1,
      explain: 'Answering with the code tells Event Grid the endpoint agrees to receive events. The validation handshake proves the endpoint owner wants the events. Without the right answer, the subscription is not created.',
    },
    {
      type: 'multi',
      prompt: 'The hub adds an Event Grid webhook for BlobCreated. A partner uploads a file, then replaces it a minute later. Which must the hub flow be ready for?',
      options: [
        'The same event arriving twice, as delivery is at least once',
        'The event for the replacement arriving before the one for the first upload',
        'Retries for a while if the listener is down, then dead lettering to a storage container if configured',
        'Reading the file from the event data, as the event carries the blob content',
        'Events waiting on the topic until the hub acks them, as on a JMS queue',
      ],
      answer: [0, 1, 2],
      explain: 'Delivery is at least once, and events are not promised to arrive in order. Events point to the blob, much like a claim check. The consumer reads the blob itself and must handle repeats and order changes. Event Grid retries for a limited time, then drops the event or dead letters it; it is not a queue that keeps events until someone reads them.',
    },
    {
      type: 'single',
      prompt: 'How can an Event Grid subscription receive only events for JSON files in the inbound container?',
      options: [
        'Filter in the Mule flow after each event arrives',
        'Use subject filters on the path and .json',
        'Create the system topic on the inbound container',
        'Pick BlobCreated as the only event type for inbound',
      ],
      answer: 1,
      explain: 'Use subject begins with the inbound container path and subject ends with .json. The event subject holds the container and blob path, so begins with and ends with filters narrow the stream at the source. Filtering in the flow works, but every event is still delivered to it.',
    },
    {
      type: 'match',
      prompt: 'Match each trigger to its main weakness.',
      pairs: [
        ['Partner JMS notification', 'Can arrive before the upload is committed, or be lost on the partner side'],
        ['Event Grid to a webhook', 'Needs a reachable endpoint and handling of repeats and order'],
        ['Scheduled listing of the container', 'Slower to react and costly on large containers'],
        ['Event Grid to a queue in Azure', 'Adds another queue product for Mule to consume'],
      ],
      explain: 'No trigger is perfect, which is why hubs often combine a fast trigger with a slow safety sweep.',
    },
    {
      type: 'single',
      prompt: 'The hub keeps partner JMS notifications as the main trigger. What is the best use of storage side signals?',
      options: [
        'A second trigger that loads each blob when its event arrives',
        'A safety net for blobs with no notification',
        'Replace the notifications with events at once',
        'A check that waits for both signals before each load',
      ],
      answer: 1,
      explain: 'A sweep or BlobCreated events find files with no matching notification after a while, and raise an alert or a recovery. The notification carries agreed ids and the message type. Storage signals cover the case where the notification never comes. Loading on both signals runs each file twice, and waiting for both makes every load depend on an event that may come late.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Partners upload GS1 style JSON files to an Azure Blob container and then send a JMS notification on ActiveMQ. Twice this year a partner's notification was lost, and the files sat unloaded for days. Another partner sometimes notifies before its upload has finished.

An architect proposes Azure Event Grid BlobCreated events. The team must decide whether to replace the notifications, add events, or add a sweep.

**Questions**
1. How do Event Grid blob events work, and how would Mule receive them?
2. What delivery rules do the events follow?
3. What are the weaknesses of each trigger?
4. What design would you recommend for the hub?
`,
  answerTemplate: `## Event Grid blob events

## Delivery rules

## Weaknesses

## Recommendation
`,
  keyPoints: [
    'Blob Storage publishes BlobCreated events through an Event Grid system topic.',
    'A webhook endpoint must pass the validation handshake.',
    'Delivery is at least once, without an order promise, with retries and optional dead lettering.',
    'Subject filters narrow events to a container path and file extension.',
    'Partner notifications can be early or lost. Storage signals can be the safety net.',
    'Keep the duplicate checks, since every trigger can repeat.',
  ],
  solution: `
**1. Event Grid blob events.** The storage account publishes events such as \`Microsoft.Storage.BlobCreated\` to an Event Grid system topic. A subscription sends them to a handler: a webhook, such as a Mule HTTP listener, or an Azure queue that Mule reads. For a webhook, Event Grid first sends a \`SubscriptionValidationEvent\`, and the flow must answer with the validation code. Subject filters, such as begins with the inbound container path and ends with \`.json\`, keep other events out. A BlobCreated event is raised once the upload is committed, so it does not point to a half written file.

**2. Delivery rules.** Delivery is at least once and order is not promised. Failed deliveries are retried for a while and can be dead lettered to a storage container if that is set up. The event carries the blob URL and some properties, not the content.

**3. Weaknesses.** Partner notifications carry the agreed message id, message type and sender document id, but can arrive early or be lost on the partner side. Events need a reachable endpoint, from Azure to CloudHub, or an extra queue, and they do not carry the business ids. A scheduled listing reacts slowly and costs more as the container grows.

**4. Recommendation.** Keep the partner notification as the main trigger, since the hub depends on its ids. Add a safety net: either a BlobCreated subscription that records each new blob, or a sweep of blobs not marked processed. If no notification matches a blob after a grace period, alert support or trigger a recovery that builds a notification. For early notifications, retry the blob exists check a few times with a delay. Keep the duplicate checks on message id and sender document id, since both paths can repeat.
`,
  followUps: [
    {
      q: 'How would the hub match a BlobCreated event to a notification?',
      a: 'By the blob name, which both carry. Store each event in a table, and a scheduled check finds names with no notification after the grace period.',
    },
    {
      q: 'Why not let BlobCreated start the load directly?',
      a: 'The event lacks the message id and sender details the hub records and returns in ACKs. The hub would have to read them from the file, changing the partner contract.',
    },
    {
      q: 'How do you secure the webhook endpoint?',
      a: 'Use HTTPS, validate the handshake, and add a secret in the endpoint URL or an Entra ID protected delivery, plus an API policy that only allows expected callers.',
    },
  ],
}
