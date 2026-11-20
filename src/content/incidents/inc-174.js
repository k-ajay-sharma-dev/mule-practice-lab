export default {
  id: 'inc-174',
  category: 'incidents',
  title: 'Customers See Another Customer\'s Prices: A Cache Scope Keyed on the Empty Payload of a GET',
  level: 'ADVANCED',
  tags: ['cache', 'security', 'data-leak', 'performance'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '2026-11-02 10:00:01 INFO  [price-api] GET /prices?customer=TRD-104 received, payload empty', relevant: true, why: 'A GET has no body, so the payload is empty for every request.' },
      { text: '2026-11-02 10:00:01 INFO  [price-api] Cache miss, calling pricing-sys for TRD-104', relevant: true, why: 'The first request fills the cache.' },
      { text: '2026-11-02 10:00:04 INFO  [price-api] GET /prices?customer=TRD-388 received, payload empty', relevant: false },
      { text: '2026-11-02 10:00:04 INFO  [price-api] Cache hit', relevant: true, why: 'A different customer gets a hit, because the key is built from the same empty payload.' },
      { text: '2026-11-02 10:00:04 INFO  [price-api] Response 200, priceList=TRD-104', relevant: true, why: 'Customer TRD-388 received the contract prices of TRD-104.' },
      { text: '2026-11-02 10:05:00 INFO  [price-api] Cache entry expired', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why do different customers get the same cached prices?',
        options: [
          'With no key expression, the key comes from the payload, which every GET leaves empty',
          'The default key uses the request path only, and every request uses `/prices`',
          'The pricing system returns the last price list it built to every caller for five minutes',
          'The default key uses the client IP, and all customers reach the API through one proxy',
        ],
        answer: 0,
        explain: 'By default the Cache scope builds the key as a digest of the payload. Every GET here has an empty payload, so every customer maps to one key and receives whatever was stored first.',
      },
      {
        type: 'single',
        prompt: 'What key should this cache use?',
        options: [
          'A key expression built from the `customer` query parameter',
          'A key expression built from the request time, rounded to the minute',
          'A key expression built from the caller’s session id, from a header',
          'The default key, with the time to live cut from five minutes to one',
        ],
        answer: 0,
        explain: 'The key must include everything the answer depends on. Here that is the customer, and any other input that changes the price list.',
      },
      {
        type: 'multi',
        prompt: 'What should happen right away?',
        options: [
          'Turn the cache off or clear it, so no more wrong prices are served',
          'Treat it as a data leak and tell the security and privacy teams',
          'Cut the time to live to one minute, so wrong prices clear sooner',
          'Wait for the next expiry and check whether the problem returns',
        ],
        answer: [0, 1],
        explain: 'Stop serving wrong data first. Contract prices are confidential, so customers saw data that was not theirs, which is a reportable incident in many companies.',
      },
      {
        type: 'single',
        prompt: 'Which test would have caught this before release?',
        options: [
          'Two requests for different customers in a row, checking each gets its own prices',
          'One request repeated twice, checking the second is faster',
          'A load test with a single customer and many threads',
          'A test that the cache entry expires after five minutes',
        ],
        answer: 0,
        explain: 'Repeating one customer only proves the cache hits. Two different customers prove the key separates them.',
      },
      {
        type: 'order',
        prompt: 'Order the response to this incident.',
        items: [
          'Turn the cache off and confirm answers are correct again',
          'Report the exposure to security and privacy',
          'Find which customers received other prices, from the logs',
          'Add a key expression with the customer and any other inputs',
          'Test with several customers and turn the cache back on',
        ],
        explain: 'Stop the leak, report it, measure it, then fix the key and prove it before caching again.',
      },
    ],
  },
  description: `
## Symptoms
- A wholesaler's B2B portal shows each trade customer its contract prices through \`price-api\` (\`GET /prices?customer=...\`).
- After this morning's release, customers phone to say the portal shows prices that are not theirs.
- The prices come from one customer's contract, and they change about every five minutes.

## Change / Context
- To cut load on the pricing system, a developer wrapped the call in a **Cache scope** with a five minute time to live.
- The scope uses the default caching strategy. No key expression was set.
- It was tested by calling one customer twice and checking the second call was faster.

## Logs
These lines are illustrative and were written for this scenario. Real log formats differ.
\`\`\`
2026-11-02 10:00:01 INFO  [price-api] GET /prices?customer=TRD-104 received, payload empty
2026-11-02 10:00:01 INFO  [price-api] Cache miss, calling pricing-sys for TRD-104
2026-11-02 10:00:04 INFO  [price-api] GET /prices?customer=TRD-388 received, payload empty
2026-11-02 10:00:04 INFO  [price-api] Cache hit
2026-11-02 10:00:04 INFO  [price-api] Response 200, priceList=TRD-104
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
    'Without a key expression, the Cache scope keys on a digest of the payload.',
    'A GET has an empty payload, so every request shares one key.',
    'The cache key must include every input the answer depends on.',
    'Serving one customer\'s contract prices to another is a data leak.',
    'Stop the cache first, then report, then fix the key.',
    'Test caching with different callers, not one caller twice.',
  ],
  solution: `
**Diagnosis.** The Cache scope has no key expression, so it keys on a **digest of the payload**. Every \`GET /prices\` has an empty payload, so all customers share one key. The first customer after each expiry fills the cache, and everyone else gets those prices for five minutes.

**Immediate mitigation.**
- Turn the cache off, or roll back the release, and confirm each customer sees its own prices.
- Treat it as a data exposure. Tell security and privacy, and use the logs to find which customers received which price list.

**Root cause.** The default key suits flows where the payload carries the request, such as a POST body. Here the input is in a query parameter, so the default key ignores it.

**Permanent fix.**
- Set a key expression built from the customer, and any other input that changes the answer, such as currency or channel.
- Keep the five minute time to live only if prices may be that stale.

**Prevention.** For every cache, write down what the answer depends on and check the key covers it. Add a test that calls two customers in a row and checks the answers differ.
`,
  followUps: [
    {
      q: 'When is the default payload key fine?',
      a: 'When the payload holds all the inputs, for example a POST body that fully describes the request.',
    },
    {
      q: 'What else can make a cache key too broad?',
      a: 'Leaving out an input such as language, currency or the caller\'s permissions, so callers with different answers share an entry.',
    },
    {
      q: 'Why was the release test not enough?',
      a: 'It called one customer twice, which proves the cache hits but not that customers are kept apart.',
    },
    {
      q: 'Where else could you cache instead?',
      a: 'An HTTP caching policy on the API gateway can cache responses too. The same rule applies: the key must include every input that changes the answer.',
    },
  ],
}
