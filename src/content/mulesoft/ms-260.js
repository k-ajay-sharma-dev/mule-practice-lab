export default {
  id: 'ms-260',
  category: 'mulesoft',
  title: 'Two Consumers, One Blob: ETags, Conditional Writes, Leases and Marking a File Processed',
  level: 'EXPERT',
  tags: ['myproject', 'azure-blob', 'concurrency', 'etag', 'leases', 'conditional-writes', 'idempotency', 'product-data-hub'],
  estMinutes: 28,
  quiz: [
    {
      type: 'single',
      prompt: 'What is a blob ETag?',
      options: [
        'A tag for searching',
        'A value that changes whenever the blob, its properties or its metadata change, used to detect changes',
        'The blob size',
        'The content type',
      ],
      answer: 1,
      explain: 'Comparing ETags tells a writer whether someone else changed the blob since it was read.',
    },
    {
      type: 'single',
      prompt: 'A flow reads a blob\'s metadata, adds status=PROCESSED, and writes it back with If-Match set to the ETag it read. Another flow changed the metadata in between. What happens?',
      options: [
        'The write succeeds and overwrites the other change',
        'The write fails with a precondition error, and the flow must read again and retry',
        'Both changes are merged',
        'The blob is locked forever',
      ],
      answer: 1,
      explain: 'If-Match makes the write conditional. A failed condition protects the other flow\'s change.',
    },
    {
      type: 'single',
      prompt: 'How can an upload make sure it never overwrites an existing blob?',
      options: [
        'Check with a list call first',
        'Send If-None-Match with the value *, so the write only succeeds when no blob of that name exists',
        'Use a longer name',
        'Upload twice',
      ],
      answer: 1,
      explain: 'A check then write has a race. A conditional write lets the service decide at the moment of the write.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about blob leases are true?',
      options: [
        'A lease gives one holder the right to write or delete the blob for a time',
        'A lease lasts 15 to 60 seconds, or is infinite until released or broken',
        'A lease stops others from reading the blob',
        'Writes on a leased blob must send the lease id',
      ],
      answer: [0, 1, 3],
      explain: 'Leases lock writes and deletes, not reads. A finite lease must be renewed while the work goes on.',
    },
    {
      type: 'single',
      prompt: 'Two hub replicas receive the same notification through a redelivery and both start loading the same blob. Which guard is strongest?',
      options: [
        'A lease on the blob only',
        'The unique constraints on message id and sender document id in Oracle, with the blob lease or ETag as an extra guard on the marking step',
        'Logging both loads',
        'Sleeping a random time first',
      ],
      answer: 1,
      explain: 'The database guards the data itself. Blob side controls protect the file and its marker, but a lease can expire during a long load.',
    },
    {
      type: 'single',
      prompt: 'A load takes 4 minutes and the flow holds a 60 second lease. What must it do?',
      options: [
        'Nothing',
        'Renew the lease before it expires, or accept that another holder may take it',
        'Ask for a longer finite lease, such as 5 minutes',
        'Delete the blob',
      ],
      answer: 1,
      explain: 'Finite leases top out at 60 seconds. Long work renews, or uses an infinite lease with care to release or break it.',
    },
  ],
  description: `
Kestrel Home Supply runs a product data hub with three replicas of the Mule app. Each loads GS1 style files from Azure Blob Storage when a JMS notification arrives, and marks the blob processed by writing its metadata. Last month a blob ended up with metadata from two runs mixed together, and a partner's own metadata vanished. In another case a partner uploaded a corrected file with the same name while the hub was loading the first one.

**Questions**
1. What are ETags, and how do conditional writes help?
2. What are leases, and when would you use one?
3. How do you stop a partner overwrite during a load?
4. Which guard protects the data, and which protects the file?
`,
  answerTemplate: `## ETags and conditional writes

## Leases

## Overwrites during a load

## Guards
`,
  keyPoints: [
    'The ETag changes on any change to content, properties or metadata.',
    'If-Match makes a write fail when the blob changed since it was read.',
    'If-None-Match * stops an upload from overwriting an existing blob.',
    'A lease locks writes and deletes for 15 to 60 seconds or until released.',
    'Long work must renew a finite lease.',
    'Oracle unique constraints guard the data. ETags and leases guard the file and its marker.',
  ],
  solution: `
**1. ETags and conditional writes.** Every blob has an ETag that changes on any write, including properties and metadata. When the hub marks a blob processed, it should read the metadata with its ETag, merge in its entries, and write back with \`If-Match\` set to that ETag. If another run changed the blob in between, the write fails with a precondition error, and the flow reads again and decides. That avoids mixed metadata and lost partner entries.

**2. Leases.** A lease gives one holder the write and delete rights to a blob for 15 to 60 seconds, or without limit until it is released or broken. Writes must then send the lease id. Readers are not blocked. A replica can take a lease before it starts a load, renew it while the load runs, and release it after marking the blob. Another replica that fails to get the lease knows the blob is busy.

**3. Overwrites during a load.** Leasing the blob during the load stops the partner from overwriting it, since their write fails while the lease is held. They retry later. Agree with partners that a corrected file gets a new name or a new sender document id, so the hub treats it as a new document instead of a silent change under the same name. Partners can protect themselves with \`If-None-Match: *\` on uploads.

**4. Guards.** The data is guarded in Oracle: unique constraints on the notification message id and the sender document id stop a second load, whatever happens to leases. The blob controls protect the file and its marker. Both are needed, since a lease can expire during a slow load and an ETag only protects the moment of the write.
`,
  followUps: [
    {
      q: 'A replica crashes while holding an infinite lease. How do you recover?',
      a: 'Another process breaks the lease, after checking the job log shows no live run for that blob. That is why finite, renewed leases are safer for app work.',
    },
    {
      q: 'Would blob versioning help with the partner overwrite?',
      a: 'Yes, every overwrite keeps the old content as a previous version, so nothing is lost. It does not stop the overwrite, so leases or naming rules are still needed.',
    },
    {
      q: 'Is a lease a good general lock for the whole hub?',
      a: 'Only for work tied to one blob. For other shared work, a database row lock or an Object Store lock fits better.',
    },
  ],
}
