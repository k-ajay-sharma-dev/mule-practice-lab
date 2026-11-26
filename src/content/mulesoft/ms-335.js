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
      prompt: 'Item files of 200 MB must reach 3 consumers over JMS. The broker handles messages of a few MB well. Which design fits the claim check pattern?',
      options: [
        'Raise the broker message size limit to 256 MB, so each file fits in one message',
        'Compress each file before publishing, so it fits under the broker size limit',
        'Split each file into 2 MB messages, and let each consumer join them in arrival order',
        'Store the file in blob storage and publish a small message that points to it',
      ],
      answer: 3,
      explain: 'The queue carries the claim ticket. The blob store keeps the content. A higher limit treats the symptom: the broker still stores and moves 200 MB per message. Compression rarely takes 200 MB down to a few MB. Arrival order is not a safe way to join parts, and one lost part breaks the file.',
    },
    {
      type: 'multi',
      prompt: 'Why use it for 200 MB item files over JMS?',
      options: [
        'Brokers handle small messages much better than very large ones',
        'The queue stays fast and its storage stays small',
        'The consumer can stream the blob instead of getting it all in memory',
        'It removes the need for error handling, since the blob store retries failed reads',
        'Duplicate checks are no longer needed, since each blob is written only once',
        'A failed message needs no dead letter queue, since the blob can be read again',
      ],
      answer: [0, 1, 2],
      explain: 'Brokers are built for many small messages, so a small pointer keeps the queue fast and its storage small, and the consumer can stream the blob. Error handling is still needed, now for two systems. The queue still delivers at least once, so the consumer still needs a duplicate check. A message that keeps failing still needs a dead letter queue, or it blocks or loops.',
    },
    {
      type: 'single',
      prompt: 'What should the notification message contain?',
      options: [
        'The file content in base64, so the consumer has it at once',
        'A message ID, the message type, the blob path, its size and a checksum',
        'The message ID, the blob path and a SAS token for the blob, so the consumer needs no storage login',
        'Only the blob path, since the blob itself holds everything else',
      ],
      answer: 1,
      explain: 'The ID, type, path, size and checksum let the consumer find the blob, check the download and skip duplicates. A SAS token in the message gives access to anyone who can read the queue, and it may expire before a replay; the consumer has its own access. Base64 content makes the message as large as the file. A bare path gives no way to check the download or spot a duplicate.',
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
        'Send it to the failure queue at once, so the sender team sees the gap',
        'Retry a few times with a delay, then send it to the failure queue with a reason',
        'Hold the message and poll for the blob every minute until it appears',
        'Acknowledge it and log a warning, since the sender resends missing files',
      ],
      answer: 1,
      explain: 'The upload may lag behind the notification. The sender should upload first and notify after. Still, plan for a short gap. Sending it to the failure queue at once turns a normal lag into manual work. Polling with no limit holds the message and a thread for good if the blob never comes. Acknowledging drops the work, and nothing says the sender will resend.',
    },
    {
      type: 'single',
      prompt: 'How do you stop old blobs from filling the storage?',
      options: [
        'Move each blob to the Archive tier once read, so it costs little and stays for audit',
        'Tag processed blobs, and let a lifecycle rule delete or archive them later',
        'Delete each blob as soon as a consumer has downloaded it',
        'Let the last of the 3 consumers delete the blob once it has read it',
      ],
      answer: 1,
      explain: 'The rule acts after a retention period. Keep them long enough for a replay or an audit, then let the rule clean up. Archive costs less but still grows without end, and a replay or a slow consumer then waits hours for rehydration. With 3 consumers, the first download is not the last read. No consumer knows it is the last, and a replay needs the blob after that.',
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
