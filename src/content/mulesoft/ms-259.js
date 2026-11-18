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
      prompt: 'Which Event Grid event type tells you a blob was created or replaced?',
      options: ['Microsoft.Storage.BlobCreated', 'Microsoft.Storage.FileUploaded', 'Azure.Blob.New', 'Microsoft.EventGrid.BlobWritten'],
      answer: 0,
      explain: 'Blob Storage publishes BlobCreated and BlobDeleted events, among others, through an Event Grid system topic for the account.',
    },
    {
      type: 'single',
      prompt: 'A Mule HTTP listener is set as an Event Grid webhook endpoint. Event Grid first sends a SubscriptionValidationEvent. What must the flow do?',
      options: [
        'Ignore it',
        'Answer with the validation code it received, so Event Grid knows the endpoint agrees to receive events',
        'Return 404',
        'Forward it to the JMS queue',
      ],
      answer: 1,
      explain: 'The validation handshake proves the endpoint owner wants the events. Without the right answer, the subscription is not created.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about Event Grid delivery are true?',
      options: [
        'Delivery is at least once, so the same event can arrive twice',
        'Events are not promised to arrive in order',
        'Failed deliveries are retried for a while, and can be dead lettered to a storage container if configured',
        'An event carries the full blob content',
      ],
      answer: [0, 1, 2],
      explain: 'Events point to the blob, much like a claim check. The consumer reads the blob itself and must handle repeats and order changes.',
    },
    {
      type: 'single',
      prompt: 'How can an Event Grid subscription receive only events for JSON files in the inbound container?',
      options: [
        'Filter in Mule only',
        'Use subject filters, such as subject begins with the inbound container path and ends with .json',
        'Create one storage account per container',
        'It cannot be filtered',
      ],
      answer: 1,
      explain: 'The event subject holds the container and blob path, so begins with and ends with filters narrow the stream at the source.',
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
        'None',
        'A safety net: a sweep or BlobCreated events that find files with no matching notification after a while, and raise an alert or a recovery',
        'Replace the notification at once',
        'Delete blobs that have no notification at once',
      ],
      answer: 1,
      explain: 'The notification carries agreed ids and the message type. Storage signals cover the case where the notification never comes.',
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
