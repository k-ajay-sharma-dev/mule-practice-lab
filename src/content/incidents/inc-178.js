export default {
  id: 'inc-178',
  category: 'incidents',
  title: 'Stock Levels Never Reach the Response: For Each Gives Back the Original List',
  level: 'BEGINNER',
  tags: ['for-each', 'payload', 'dataweave', 'variables'],
  estMinutes: 15,
  investigation: {
    logs: [
      { text: '2026-11-10 09:15:02 INFO  [catalog-api] GET /products?category=garden received, 3 products', relevant: false },
      { text: '2026-11-10 09:15:02 INFO  [catalog-api] For Each: product P-101 stock=14', relevant: true, why: 'Inside the loop the stock call works and the payload holds the stock.' },
      { text: '2026-11-10 09:15:02 INFO  [catalog-api] For Each: product P-102 stock=0', relevant: true, why: 'Each pass gets its stock correctly.' },
      { text: '2026-11-10 09:15:03 INFO  [catalog-api] For Each: product P-103 stock=7', relevant: false },
      { text: '2026-11-10 09:15:03 INFO  [catalog-api] After For Each: payload=[{"id":"P-101"},{"id":"P-102"},{"id":"P-103"}]', relevant: true, why: 'After the loop the payload is the original list again, without the stock values.' },
      { text: '2026-11-10 09:15:03 INFO  [catalog-api] Response 200', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the response not contain the stock values?',
        options: [
          'After For Each, the payload goes back to the collection it started with',
          'For Each keeps only the payload of the last pass, which held one product',
          'The Transform inside the loop writes to a variable, not to the payload',
          'For Each runs its passes in parallel, and their payloads overwrite each other',
        ],
        answer: 0,
        explain: 'For Each processes each element, but when the scope ends the payload is set back to what it was before the loop. Changes to the payload inside the loop are not collected.',
      },
      {
        type: 'single',
        prompt: 'What is a correct way to keep each product with its stock?',
        options: [
          'Append each result to a variable in the loop, and build the response from it',
          'Set the payload inside the loop to the full list with the current product updated',
          'Set the For Each `collection` to `#[payload]`, so that the loop updates the payload',
          'Set `batchSize` on the For Each to the list size, so that it returns one result',
        ],
        answer: 0,
        explain: 'Variables set inside For Each are kept after the scope. Append each enriched product to a variable, then use it after the loop.',
      },
      {
        type: 'multi',
        prompt: 'Which other designs also give back the enriched list?',
        options: [
          'Parallel For Each, which returns the results of all its routes as a list',
          'A batch call to the stock API with all product IDs, then a DataWeave join',
          'For Each with `counter` set, so that each result is stored under its index',
          'Until Successful around the stock call, so that its result is kept after the loop',
        ],
        answer: [0, 1],
        explain: 'Parallel For Each collects results by design. One call for all IDs and a join is often the best choice, as it saves round trips. The `counter` attribute only names the index variable, and Until Successful only retries a step.',
      },
      {
        type: 'single',
        prompt: 'Which test would have caught this?',
        options: [
          'A test that checks the stock field for each product in the response',
          'A test that checks the response status is 200 for a known category',
          'A test that checks the stock call is made once for each product',
          'A test that checks the response has the same number of products',
        ],
        answer: 0,
        explain: 'The loop worked and the status was 200. Only a check on the response body shows the stock is missing.',
      },
      {
        type: 'order',
        prompt: 'Order the fix.',
        items: [
          'Confirm in the logs that the payload after the loop is the original list',
          'Collect each product and stock into a variable inside the loop',
          'Build the response from the variable after the loop',
          'Add a test that checks the stock field for each product',
        ],
        explain: 'Prove the cause, change where the results are kept, use them, and guard the behaviour with a test.',
      },
    ],
  },
  description: `
## Symptoms
- \`catalog-api\` should return each product with its current stock.
- Since the new release, products come back without any stock field.
- No errors appear and the status is 200.

## Change / Context
- A developer added a **For Each** over the product list. Inside it, an HTTP Request gets the stock and a Transform Message sets the payload to the product with its stock.
- The response is built from the payload after the loop.
- The unit test only checked the status code.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-10 09:15:02 INFO  [catalog-api] For Each: product P-101 stock=14
2026-11-10 09:15:03 INFO  [catalog-api] After For Each: payload=[{"id":"P-101"},{"id":"P-102"},{"id":"P-103"}]
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'After For Each, the payload is the original collection again.',
    'Changes to the payload inside the loop are not collected.',
    'Variables set inside the loop are kept after it.',
    'Parallel For Each returns the results of its routes as a list.',
    'One bulk call and a DataWeave join can replace the loop.',
    'Tests must check the body, not only the status.',
  ],
  solution: `
**Diagnosis.** For Each does not return the work done inside it. When the scope ends, the payload goes back to the original list, so the stock values set inside the loop are lost.

**Immediate mitigation.** Roll back to the previous release if stock on the page matters to customers, or show stock as unknown until the fix ships.

**Root cause.** The developer expected For Each to work like a map that returns new values. It is a loop for side effects, such as calling a system per element.

**Permanent fix.** Pick one:
- Inside the loop, append each product with its stock to a variable, and build the response from that variable after the loop.
- Use **Parallel For Each**, which collects the results of each route into a list.
- Better, if the stock API allows it, ask for all product IDs in one call and join the answers to the products in DataWeave.

**Prevention.** Add a test that checks the stock field for every product, and include For Each behaviour in the team's review checklist.
`,
  followUps: [
    { q: 'Why is a bulk call often better than a loop?', a: 'It makes one round trip instead of one per product, which is faster and puts less load on the stock system.' },
    { q: 'What happens to a variable set inside For Each?', a: 'It keeps its value after the loop, so it can carry results out.' },
    { q: 'When is For Each the right choice?', a: 'When each element needs a side effect in order, such as one call or one insert per record, and the payload after the loop is not needed.' },
    { q: 'How does Parallel For Each differ in what it gives back?', a: 'It returns a list with the result of each route, and it runs the routes at the same time.' },
  ],
}
