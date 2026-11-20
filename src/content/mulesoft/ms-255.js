export default {
  id: 'ms-255',
  category: 'mulesoft',
  title: 'Access Tiers and Archive Rehydration: Hot, Cool, Cold, Archive and Early Deletion',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'azure-blob', 'access-tiers', 'archive', 'rehydration', 'cost', 'banking'],
  estMinutes: 18,
  quiz: [
    {
      type: 'single',
      prompt: 'A Mule flow tries to download a blob in the Archive tier. What happens?',
      options: [
        'It downloads, only more slowly',
        'The read fails until the blob is rehydrated',
        'It downloads from a geo backup copy',
        'It is moved to Hot, then downloaded',
      ],
      answer: 1,
      explain: 'An archived blob is offline. Archive data cannot be read directly. It must first be rehydrated to Hot, Cool or Cold.',
    },
    {
      type: 'multi',
      prompt: 'How can an archived blob be brought back online?',
      options: [
        'Change its tier to Hot, Cool or Cold',
        'Copy it to a new blob in an online tier',
        'Rename it to a name outside the archive prefix',
        'Download it with a rehydrate request header',
      ],
      answer: [0, 1],
      explain: 'Both start a rehydration. A copy keeps the archived original while the new blob comes online.',
    },
    {
      type: 'single',
      prompt: 'How long does rehydration take?',
      options: [
        'A few seconds, like a normal read',
        'Up to many hours at standard priority',
        'Exactly 24 hours, whatever the size',
        'It is instant for Premium accounts',
      ],
      answer: 1,
      explain: 'Standard priority can take many hours. High priority can be faster for small blobs, at a higher price. Plan archive restores as a process with a wait, not as a live read.',
    },
    {
      type: 'match',
      prompt: 'Match each tier to its typical use.',
      pairs: [
        ['Hot', 'Data read or written often'],
        ['Cool', 'Data read now and then, kept for at least a month'],
        ['Cold', 'Data read rarely, kept for at least a few months'],
        ['Archive', 'Data kept for compliance and almost never read'],
      ],
      explain: 'Cooler tiers cost less to store and more to read. Each cool tier has a minimum storage period.',
    },
    {
      type: 'single',
      prompt: 'A blob is moved to Archive and deleted 20 days later. What is the cost effect?',
      options: [
        'No extra cost, as the delete ends billing',
        'An early deletion charge applies',
        'A refund for the unused archive days',
        'The delete is refused until the period ends',
      ],
      answer: 1,
      explain: 'Cool, Cold and Archive each have a minimum period, 180 days for Archive. Leaving earlier costs the rest of that period.',
    },
    {
      type: 'single',
      prompt: 'How should a Mule flow handle a request for a statement that has been archived?',
      options: [
        'Wait in the flow until the blob is online',
        'Start a rehydration and finish the job later',
        'Return an empty file with status 200',
        'Copy every archived blob back to Hot',
      ],
      answer: 1,
      explain: 'Record the request and finish it when the blob is online, for example on an event or a scheduled check. A long wait does not belong in a request thread. Treat it as an asynchronous job and tell the user when it is ready.',
    },
  ],
  description: `
Ashgrove Bank keeps customer statements in Azure Blob Storage for ten years. To cut costs, statements older than a year move to Archive. Now the customer service app, which calls a Mule API, sometimes fails when a customer asks for an old statement.

**Questions**
1. What are the access tiers, and what do they cost?
2. Why does the read of an old statement fail?
3. How does rehydration work, and how long does it take?
4. How should the API and the flows handle archived statements?
`,
  answerTemplate: `## Tiers

## Why the read fails

## Rehydration

## API design
`,
  keyPoints: [
    'Hot, Cool, Cold and Archive trade storage price against read price.',
    'Cool, Cold and Archive have minimum storage periods with early deletion charges.',
    'Archive is offline, so a read fails until the blob is rehydrated.',
    'Rehydrate by changing the tier or copying to an online tier.',
    'Standard priority can take hours. High priority is faster and costs more.',
    'Handle restores as asynchronous jobs, not inside a request.',
  ],
  solution: `
**1. Tiers.** Hot has the highest storage price and the lowest read price. Cool and Cold store for less and charge more to read, and each has a minimum storage period. Archive stores for the least, but data is offline. Moving data out of a cool tier, or deleting it, before its minimum period costs an early deletion charge.

**2. Why the read fails.** An archived blob cannot be read. The API tries a normal download and gets an error, which it passes on as a failure.

**3. Rehydration.** Change the blob tier to Hot, Cool or Cold, or copy it to a new blob in an online tier. Standard priority can take many hours. High priority can be faster for small blobs and costs more. The blob shows a rehydration status while it is in progress.

**4. API design.** Before downloading, read the blob properties and check the tier. If it is archived, start a rehydration, often as a copy to a restore container, record the request and answer with "being prepared" and an estimate. A scheduled flow or an Event Grid event finishes the job and notifies the customer when the copy is online. Clean up restored copies after a few days. Statements that are often asked for, such as the last two years, should stay in Cool rather than Archive.
`,
  followUps: [
    {
      q: 'Why copy to a restore container instead of changing the tier of the original?',
      a: 'The original stays in Archive at the low price, and the copy can be deleted after use. Changing the tier back and forth risks early deletion charges.',
    },
    {
      q: 'How would you pick between Cool and Cold for statements aged one to three years?',
      a: 'Compare storage savings with read costs, using real request counts. If statements in that range are read often, Cool may cost less overall.',
    },
    {
      q: 'Does the default account tier affect blobs you upload?',
      a: 'Yes, blobs without an explicit tier take the account default, Hot or Cool. Set the tier on upload when the default does not fit.',
    },
  ],
}
