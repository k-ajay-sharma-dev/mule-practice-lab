export default {
  id: 'ms-322',
  category: 'mulesoft',
  title: 'Batch Job, For Each or Parallel For Each: Choosing the Right Loop',
  level: 'BEGINNER',
  tags: ['myproject', 'batch', 'for-each', 'parallel-for-each', 'design'],
  estMinutes: 12,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each task to the scope that fits it best.',
      pairs: [
        ['Loop over 20 lines of one order and update a variable', 'For Each'],
        ['Call 5 independent APIs for one request and wait for all results', 'Parallel For Each'],
        ['Load 2 million rows from a nightly file, with errors handled per record', 'Batch Job'],
      ],
      explain: 'For Each is sequential, Parallel For Each runs routes at once and joins, and Batch Job is built for large record sets.',
    },
    {
      type: 'single',
      prompt: 'What is the payload after a For Each scope?',
      options: [
        'The result of the last iteration',
        'The original payload from before the scope',
        'A list of all results',
        'Null',
      ],
      answer: 1,
      explain: 'For Each does not collect results. Store what you need in a variable.',
    },
    {
      type: 'single',
      prompt: 'What is the payload after a Parallel For Each scope?',
      options: [
        'The original payload',
        'A list of the results of every route, in the order of the input',
        'Only the fastest result',
        'The number of routes',
      ],
      answer: 1,
      explain: 'All results are held in memory until the last one finishes, so it is not meant for large lists.',
    },
    {
      type: 'single',
      prompt: 'One element fails inside a For Each with no error handling inside it. What happens?',
      options: [
        'The loop skips the element',
        'The error stops the loop and goes to the flow error handler',
        'The element is retried',
        'Mule logs and continues',
      ],
      answer: 1,
      explain: 'To continue, wrap the inside of the loop in a Try scope with On Error Continue.',
    },
    {
      type: 'multi',
      prompt: 'Why does a Batch Job fit a 2 million row load better than Parallel For Each?',
      options: [
        'It keeps records in queues on disk instead of all results in memory',
        'It handles failures per record and goes on with the rest',
        'It gives counts at the end in On Complete',
        'It always runs faster for small lists',
      ],
      answer: [0, 1, 2],
      explain: 'For a list of ten items, the batch overhead is not worth it.',
    },
    {
      type: 'single',
      prompt: 'A caller waits for a response that needs results from 3 back ends. Which scope fits?',
      options: [
        'Batch Job',
        'Parallel For Each or Scatter-Gather, since the flow must wait for all results',
        'Async',
        'A scheduler',
      ],
      answer: 1,
      explain: 'Batch Job does not return its result to the caller.',
    },
  ],
  description: `
Larkfield Grocers has three new flows. One builds an order response from its lines. One gets prices, stock and promotions from three systems for a store app. One loads a nightly file of 2 million sales rows. A developer used Parallel For Each for all three.

**Questions**
1. What does each scope do with results and errors?
2. Which scope fits each flow, and why?
3. What goes wrong with Parallel For Each on the 2 million row file?
`,
  answerTemplate: `## Results and errors

## The right scope per flow

## Parallel For Each on a large file
`,
  keyPoints: [
    'For Each runs in order and keeps the original payload.',
    'Parallel For Each runs routes at once and returns a list of all results.',
    'Batch Job is asynchronous and built for large record sets.',
    'Batch handles failures per record and reports counts in On Complete.',
    'Parallel For Each holds every result in memory.',
    'A caller that waits for an answer cannot use Batch Job.',
  ],
  solution: `
**1. Results and errors.** For Each runs one element at a time and leaves the payload as it was. An error stops the loop unless a Try scope handles it. Parallel For Each runs elements at the same time, waits for all, and returns a list of results. Batch Job splits records into queues, processes them in blocks, keeps going after failed records and reports counts at the end.

**2. The right scope.** The order lines use For Each, since the list is short and order matters. The store app call uses Parallel For Each or Scatter-Gather, since the caller waits and the three calls do not depend on each other. The nightly load uses a Batch Job.

**3. Parallel For Each on a large file.** It holds every result in memory until the end and starts work for the whole list, with only max concurrency as a brake. With 2 million rows, memory runs out, and one error leaves you without counts or a clear list of what loaded.
`,
  followUps: [
    {
      q: 'When would you use For Each with a batch size?',
      a: 'For a moderate list where you want groups, such as 1,000 rows sent to a bulk API call, without the overhead of a batch job.',
    },
    {
      q: 'Does Parallel For Each have a limit on threads?',
      a: 'Yes, maxConcurrency. Without it, a large list can start many calls at once and overload the target.',
    },
    {
      q: 'Can you call a flow with a Batch Job from an HTTP listener?',
      a: 'Yes, but return 202 Accepted with the job ID, and let the client poll a status endpoint for the result.',
    },
  ],
}
