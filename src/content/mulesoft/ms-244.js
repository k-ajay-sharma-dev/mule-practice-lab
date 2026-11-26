export default {
  id: 'ms-244',
  category: 'mulesoft',
  title: 'Claim Check With JMS and Azure Blob: Small Notifications, Message Size, TTL and First Checks',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'queues', 'claim-check', 'jms', 'activemq', 'azure-blob', 'ttl', 'json-schema', 'product-data-hub'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'A partner sends 40 MB ReceivingAdvice files as JMS message bodies, and the ActiveMQ broker struggles. The team moves to a claim check. What should the JMS message carry?',
      options: [
        'The file, compressed with gzip so it stays under the broker limit',
        'The blob name only, since the hub can work out the rest from it',
        'The file plus a pointer to the blob, so the hub can skip the download',
        'A small notification with a message id, the message type and the blob location',
      ],
      answer: 3,
      explain: 'The large payload goes to storage such as Azure Blob. The queue carries a small message with an id, the message type and a pointer that says where to find the file. Compression only delays the problem as files grow. A bare name gives no id for duplicate checks and no type for routing. Sending the file as well puts the size back on the broker.',
    },
    {
      type: 'multi',
      prompt: 'On a shared ActiveMQ broker, one partner starts sending files of tens of megabytes as message bodies. Which effects should the team expect?',
      options: [
        'Messages above the broker or transport size limit are refused on send',
        'Broker memory and disk fill faster, which slows the queues of other partners too',
        'Large messages cannot be acknowledged, so they are redelivered forever',
        'Each redelivery after a failure moves the whole file over the network again',
        'Consumers with a prefetch of 1 remove the storage cost on the broker',
      ],
      answer: [0, 1, 3],
      explain: 'Big messages strain the broker and make every retry expensive. Large messages can still be acknowledged. A small prefetch limits what a consumer holds, but the broker still stores every large message until it is consumed.',
    },
    {
      type: 'single',
      prompt: 'The sender writes the blob and sends the notification. In which order should it do this?',
      options: [
        'Notification first, so the hub starts early',
        'Blob first, notification after the upload ends',
        'Notification first, with a delivery delay of one minute',
        'Either order, since the hub retries the check',
      ],
      answer: 1,
      explain: 'A notification for a blob that does not exist yet fails the existence check. Writing the blob first means the pointer is valid when it arrives.',
    },
    {
      type: 'order',
      prompt: 'Order the first checks the hub runs when a notification arrives.',
      items: [
        'Validate the notification against its JSON schema',
        'Check its message id is not already recorded in Oracle',
        'Check the blob it points to exists',
        'Publish a "received" ACK on the reply queue',
      ],
      explain: 'Cheap checks come first. The received ACK is sent only once the hub knows it can work on the message.',
    },
    {
      type: 'single',
      prompt: 'A notification is published with a JMS time to live of one hour, and the hub is down for two hours. What can happen?',
      options: [
        'The message waits on the queue until the hub returns',
        'The message expires, but the blob stays in storage',
        'The blob is deleted along with the message',
        'The broker extends the TTL while no one consumes',
      ],
      answer: 1,
      explain: 'Depending on broker settings, the expired message is dropped or moved to a dead letter queue. TTL applies to the message, not to the blob. An expired notification can leave an orphan file, so either avoid short TTLs or sweep storage for files never processed.',
    },
    {
      type: 'single',
      prompt: 'To save storage, the hub deletes each blob right after it downloads it, before the Oracle load. A load fails and the notification is redelivered. What happens?',
      options: [
        'The retry finds no blob, so it fails again and the data is lost',
        'The retry reads the file from the copy kept in the JMS message',
        'The retry works, as Azure keeps a blob until its lease ends',
        'The retry waits on the queue until the partner uploads the file again',
      ],
      answer: 0,
      explain: 'A redelivered notification or a restart needs the file. Deleting early turns a retry into a lost message. Keep the blob until it is processed, and longer for replays or audit. The notification holds only a pointer. A lease controls writes, it does not delay a delete that already happened. The broker does not wait for a new upload; the retry fails its blob check.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub. Partners send GS1 style messages such as Item, SupplierItem, ReceivingAdvice and TransferOrder. Some files are tens of megabytes. Each partner uploads the JSON file to Azure Blob Storage and sends a small notification on an ActiveMQ queue. A Mule JMS listener reads the notification and starts the load.

**Questions**
1. What is the claim check pattern, and why use it here?
2. What should the notification contain?
3. Which checks run before the hub sends its "received" ACK?
4. What do message TTL and blob retention have to do with each other?
`,
  answerTemplate: `## Claim check

## The notification

## First checks

## TTL and retention
`,
  keyPoints: [
    'The large file goes to blob storage. The queue carries a small pointer message.',
    'This avoids broker size limits and keeps retries cheap.',
    'The notification holds a message id, the message type, the sender document id and the blob name.',
    'The sender uploads the blob first and notifies after the upload completes.',
    'Checks: schema, duplicate message id in Oracle, blob exists, then the received ACK.',
    'An expired notification can leave an orphan blob, so retention and a sweep matter.',
  ],
  solution: `
**1. Claim check.** The file is stored somewhere built for large data, here Azure Blob Storage, and the queue carries a small "claim ticket" that points to it. Brokers have size limits, and big messages use broker memory and disk and slow other queues. A failed delivery of a small notification is cheap to repeat, while the file stays where it is.

**2. The notification.** A message id that is unique per notification, the message type so the hub can route it, the sender document id from the business document, the sender, and the container and blob name. A size or checksum lets the hub confirm it read the whole file. No business data is needed in the notification.

**3. First checks.** Validate the notification against a JSON schema, since a broken pointer cannot be used. Check the message id against the Oracle table of received messages, to drop a redelivery. Check that the blob exists. Only then publish the "received" ACK on the reply queue, so the sender knows the hub accepted the work. If the blob is missing, the sender may have notified too early: retry the check a few times with a delay before rejecting.

**4. TTL and retention.** A JMS time to live makes the broker drop an old notification, or move it to a dead letter queue, depending on its settings. The blob does not expire with it, so a lost notification leaves an orphan file. Avoid short TTLs on these notifications, keep blobs until they are marked processed and beyond for audit, and run a sweep that finds blobs never marked processed.
`,
  followUps: [
    {
      q: 'The partner sends the notification before the upload finishes. How does the hub cope?',
      a: 'The existence check fails or finds a partial file. Retry the check a few times with a delay, and agree with the partner that they notify only after the upload is committed.',
    },
    {
      q: 'Why check the message id before downloading the file?',
      a: 'It is cheap and stops a redelivered notification early. Downloading and validating a large file only to find a duplicate wastes time and bandwidth.',
    },
    {
      q: 'Who should be allowed to write to the inbound container?',
      a: 'Only the partners, each with a narrow SAS or role for their own path, and the hub with read and metadata rights. Wide write access lets anyone plant files the hub will load.',
    },
  ],
}
