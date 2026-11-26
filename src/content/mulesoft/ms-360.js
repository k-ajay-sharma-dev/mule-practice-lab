export default {
  id: 'ms-360',
  category: 'mulesoft',
  title: 'Large Payloads Across Scatter Gather, Async and Variables: Designing the Store and Load Step of a Hub',
  level: 'EXPERT',
  tags: ['myproject', 'large-files', 'scatter-gather', 'async', 'claim-check', 'design'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The process flow keeps the transformed 600 MB JSON in a variable, then a Scatter Gather stores it to blob and runs a batch load from it. What is the main risk?',
      options: [
        'Scatter Gather runs the routes one after another, so the step takes twice as long',
        'The full 600 MB stays in memory all flow, and routes may buffer their own copies',
        'Routes cannot read flow variables, so the store route writes an empty blob',
        'The variable is dropped when the routes start, so the batch load reads nothing',
      ],
      answer: 1,
      explain: 'Variables live as long as the event. A large value in one keeps that memory busy.',
    },
    {
      type: 'single',
      prompt: 'What is a better design for that step?',
      options: [
        'Raise the worker size so the variable and the route copies fit in memory',
        'Stream the output once to blob storage, then load from that copy by its path',
        'Put the variable in an Object Store and read it back inside each route',
        'Replace the Scatter Gather with two Async scopes, so each route runs alone',
      ],
      answer: 1,
      explain: 'Store first, then load. The stored copy is also the record of what was loaded.',
    },
    {
      type: 'multi',
      prompt: 'Store and load run as two routes of a Scatter Gather. The store route fails and the load succeeds. What follows?',
      options: [
        'The Scatter Gather raises a composite error that holds the result of each route',
        'The data is in staging, but no stored copy exists for audit or replay',
        'The error handler must decide whether to roll back the run by run ID or retry the store',
        'The load route is rolled back too, since the routes share one transaction',
        'The Scatter Gather retries the failed store route by itself before it raises an error',
        'The result of the load route is lost, so the handler cannot tell the load worked',
      ],
      answer: [0, 1, 2],
      explain: 'The Scatter Gather raises a composite error that holds the result of each route, so the handler can see the load worked and the store failed. The data now sits in staging with no stored copy, and the handler must choose to roll back by run ID or retry the store. Routes of a Scatter Gather are not one transaction, so nothing rolls back by itself. It does not retry a route either; wrap the store in Until Successful if you want retries. Plan the compensation.',
    },
    {
      type: 'single',
      prompt: 'The notification email at the end runs in an Async scope and attaches the payload. What problem does that cause?',
      options: [
        'Async sends the mail on the flow thread, so the flow waits until the mail server answers',
        'The large payload stays in memory until the mail is sent, and the mail server may reject its size',
        'Async drops a streamed payload, so the mail goes out with an empty attachment file',
        'Async sees the payload as it was before the Scatter Gather, so it attaches the wrong file',
      ],
      answer: 1,
      explain: 'The Async scope gets a copy of the event and runs on another thread. Set the payload to a small summary before the Async scope.',
    },
    {
      type: 'single',
      prompt: 'Why can a target variable on a large download be a trap?',
      options: [
        'Target variables cannot hold a stream, so the download fails',
        'The content stays in the variable after use, holding memory until the flow ends',
        'The content is also copied to the payload, so it is held twice',
        'Target variables are logged at DEBUG level, so the content fills the logs',
      ],
      answer: 1,
      explain: 'Remove large variables when done, or keep only a reference.',
    },
    {
      type: 'order',
      prompt: 'Put a memory safe store and load step in order.',
      items: [
        'Stream the transformed output to the blob store and keep only its path, size and checksum',
        'Write a job log row with that path and the run ID',
        'Run the batch load reading the stored copy with a streaming reader',
        'In On Complete, record counts, then mark the blob as processed',
        'Set a small summary as payload and send the notification in an Async scope',
      ],
      explain: 'Each step carries a reference, never the content.',
    },
  ],
  description: `
Quayle Freight's product data hub process flow transforms a message, keeps the result in a variable, and runs a Scatter Gather with two routes: store the JSON to blob storage, and run a common batch flow into Oracle staging. At the end it sends an email in an Async scope with the payload attached. It works for 50 MB messages. A new supplier sends 600 MB messages and the workers run out of memory.

**Questions**
1. Where does the memory go in today's design?
2. How do you redesign the store and load step?
3. What happens when one route of the Scatter Gather fails?
4. How do you handle the email and the variables?
`,
  answerTemplate: `## Where the memory goes

## Redesigning store and load

## When one route fails

## Email and variables
`,
  keyPoints: [
    'Large values in variables stay in memory as long as the event.',
    'Scatter Gather routes may each need the content.',
    'Store once as a stream, then load from the stored copy.',
    'Scatter Gather routes are not one transaction.',
    'Async scopes copy the event, so shrink the payload first.',
    'Pass paths, sizes and checksums, not content.',
  ],
  solution: `
**1. Where the memory goes.** The variable holds the full transformed JSON for the whole flow. The Scatter Gather gives each route the content, so it may be buffered more than once. The Async email copies the event and attaches the payload. Peak memory is several times the message.

**2. Redesign.** Stream the transformed output once to blob storage and keep only the path, size and checksum. Write a job log row with them. Then run the batch load from the stored copy with a streaming reader. Storing first also gives an audit copy before any row is loaded.

**3. When a route fails.** The Scatter Gather raises a composite error with each route's result. If the load ran without a stored copy, there is nothing to replay. Sequencing store then load avoids that case. If both stay parallel, the handler must retry the store or remove the run's rows by run ID.

**4. Email and variables.** Set the payload to a small summary before the Async scope and link to the report instead of attaching data. Remove large variables after use, or never put content in them.
`,
  followUps: [
    {
      q: 'Is the parallel store and load ever worth it?',
      a: 'For small messages it saves a little time. For large ones the memory and the failure cases cost more than the time saved.',
    },
    {
      q: 'How do you stream DataWeave output to blob storage?',
      a: 'Use deferred output so the transform writes as it goes, and an upload operation that accepts a stream. Check that the connector does not buffer it all first.',
    },
    {
      q: 'How do you size the worker after the redesign?',
      a: 'Test with the largest expected message, watch peak heap, and leave headroom for parallel runs.',
    },
  ],
}
