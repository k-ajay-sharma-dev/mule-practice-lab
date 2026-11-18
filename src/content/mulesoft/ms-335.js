export default {
  id: 'ms-335',
  category: 'mulesoft',
  title: 'Claim Check: A Small Queue Message That Points to a Large Blob',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'large-files', 'claim-check', 'azure-blob', 'jms', 'idempotency'],
  estMinutes: 20,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the claim check pattern?',
      options: [
        'A check that the sender paid',
        'Store the large content in a store such as blob storage, and send only a small message with a reference to it',
        'Compress every message',
        'Split a message into many',
      ],
      answer: 1,
      explain: 'The queue carries the claim ticket. The blob store keeps the content.',
    },
    {
      type: 'multi',
      prompt: 'Why use it for 200 MB item files over JMS?',
      options: [
        'Brokers handle small messages much better than very large ones',
        'The queue stays fast and its storage stays small',
        'The consumer can stream the blob instead of getting it all in memory',
        'It removes the need for error handling',
      ],
      answer: [0, 1, 2],
      explain: 'Error handling is still needed, now for two systems.',
    },
    {
      type: 'single',
      prompt: 'What should the notification message contain?',
      options: [
        'The file content in Base64',
        'A message ID, the message type, the blob path, its size and a checksum',
        'The storage account key',
        'Only the blob path',
      ],
      answer: 1,
      explain: 'Never put storage keys in a message. The consumer has its own access.',
    },
    {
      type: 'order',
      prompt: 'Put the consumer steps in order.',
      items: [
        'Validate the notification against its schema',
        'Check the message ID is not a duplicate',
        'Check the blob exists and send a received acknowledgement',
        'Download and validate the blob, then process it',
        'Mark the blob as done and send the final acknowledgement',
      ],
      explain: 'Cheap checks first. The large download comes only when the message looks right.',
    },
    {
      type: 'single',
      prompt: 'The notification arrives, but the blob is not there yet. What do you do?',
      options: [
        'Fail the message for good',
        'Retry a few times with a delay, since the upload may lag, then send it to the failure queue with a clear reason',
        'Process an empty file',
        'Delete the notification',
      ],
      answer: 1,
      explain: 'The sender should upload first and notify after. Still, plan for a short gap.',
    },
    {
      type: 'single',
      prompt: 'How do you stop old blobs from filling the storage?',
      options: [
        'Never delete them',
        'Move or tag processed blobs, and use a lifecycle rule that deletes or archives them after a retention period',
        'Delete them before processing',
        'Keep them in the queue',
      ],
      answer: 1,
      explain: 'Keep them long enough for a replay or an audit, then let the rule clean up.',
    },
  ],
  description: `
Marrow & Pine Home receives large item and barcode files from a partner. The partner once put the full file content in each JMS message. The broker slowed down and ran out of storage. The new design uploads each file to blob storage and sends a small notification on the queue.

**Questions**
1. What is a claim check, and why does it help here?
2. What goes in the notification?
3. What does the consumer check, and in which order?
4. How do you handle a missing blob and old blobs?
`,
  answerTemplate: `## Claim check

## The notification

## Consumer steps

## Missing and old blobs
`,
  keyPoints: [
    'Large content goes to blob storage, a small reference goes on the queue.',
    'The notification has message ID, type, blob path, size and checksum.',
    'No keys or secrets in the message.',
    'Cheap checks first: schema, duplicate, blob exists.',
    'Retry a missing blob briefly, then fail with a reason.',
    'Mark processed blobs and clean up with a lifecycle rule.',
  ],
  solution: `
**1. Claim check.** The file goes to blob storage and the queue carries a small message that points to it. Brokers work best with small messages. The consumer can stream the blob from storage.

**2. The notification.** Message ID, message type, sender, blob container and path, size and checksum, and a time. No storage keys. The consumer uses its own managed access.

**3. Consumer steps.** Validate the notification schema. Check the message ID against the job log for duplicates. Check the blob exists and send a received acknowledgement. Download the blob as a stream, validate it, check the sender document ID for duplicates, and process. Then mark the blob done and send the final acknowledgement.

**4. Missing and old blobs.** If the blob is missing, retry a few times with a delay, then send the message to the failure queue with the reason. Mark processed blobs by moving or tagging them. A lifecycle rule deletes or archives them after the retention period.
`,
  followUps: [
    {
      q: 'Why check the size and checksum after the download?',
      a: 'They prove the blob is the one the sender meant and was not cut off or changed.',
    },
    {
      q: 'Who owns the blob container?',
      a: 'Agree on it. Often the receiver owns it and gives the sender write access to an upload folder only.',
    },
    {
      q: 'How does a restart app use the claim check?',
      a: 'It replays only the small notification. The blob is still in storage, so nothing large moves again through the queue.',
    },
  ],
}
