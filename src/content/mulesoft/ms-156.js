export default {
  id: 'ms-156',
  category: 'mulesoft',
  title: 'Object Store v2 Limits in Practice: Rolling and Static TTL, TPS, Billing Units, Value Size and Regions',
  level: 'ADVANCED',
  tags: ['cloudhub-2', 'cloudhub', 'deployment', 'object-store', 'limits', 'ttl', 'cost'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'On Mule 4.2.1 or later, what decides whether a key has a rolling or a static TTL?',
      options: [
        'If **Entry ttl** is empty the TTL is rolling; if it has a value the TTL is static',
        'Rolling TTL is chosen in Runtime Manager for each app',
        'The Store operation always uses static TTL, and Retrieve always uses rolling TTL',
        'Partitions are rolling and keys are static',
      ],
      answer: 0,
      explain: 'Older Mule versions use a static TTL of 30 days by default. Also set **Expiration interval** to a positive value less than Entry ttl: if it is blank or not positive, Object Store v2 ignores Entry ttl.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A returns team sets `entryTtl` to 90 days on an idempotency store, so that duplicate returns are rejected for a whole quarter. What happens?',
      options: [
        'The TTL is set to the maximum of 2592000 seconds (30 days) with no error, so keys can expire before the window ends',
        'The deployment fails with a validation error',
        'The value is honoured, because premium subscriptions have no maximum',
        'The keys never expire',
      ],
      answer: 0,
      explain: 'A value below one second or above 30 days silently becomes 30 days. A silent cap on a compliance window is dangerous, which is why anything longer belongs in a database.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'With rolling TTL, which Object Store Connector operations extend the TTL of a key?',
      options: ['Retrieve', 'Retrieve All', 'Retrieve All Keys', 'Store', 'Contains', 'Remove'],
      answer: [0, 1, 2, 3],
      explain: 'Contains, Clear and Remove do not extend TTL. A dedupe flow that only calls Contains is not keeping its keys alive. Rolling TTL applies per key, and access in the last seven days of the 30-day window extends it for another 30 days. The docs conflict on how far that can go: the rolling TTL section says unlimited, and the overview states a maximum persistence of 30 days from creation.',
    },
    {
      type: 'single',
      prompt: 'An app on the base subscription receives 15 messages per second, and calls Contains and then Store for each message. Most keys do not exist yet. What should the team expect?',
      options: [
        'About 30 requests per second against a limit of 10 TPS per app, so requests get HTTP 429. Requests that return `OS:KEY_NOT_FOUND` also count',
        'No throttling, because only successful Store calls count toward TPS',
        'No throttling, because Contains is served from a local cache',
        'Throttling only after 26 million requests in a month',
      ],
      answer: 0,
      explain: 'Every API request counts, and Object Store v2 performs I/O for each read and write. The options are the premium add-on, at 100 TPS per app, or sending requests more slowly.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'One app uses two object stores, `case-obj-store` and `ticket-obj-store`, on the premium subscription. What does the example on the rate-limiting page say about its limit?',
      options: [
        '100 TPS across both stores together, because rate limiting is applied per application',
        '100 TPS for each store',
        '100 TPS per replica',
        '10 TPS for the second store',
      ],
      answer: 0,
      explain: 'Each application has a single Object Store allocation, and the page text and the FAQ apply the limit per app, although the table on the same page labels it per store. Plan on the stricter per-app reading. Note also that with **Use Object Store V2** on, connectors, modules and policies that rely on Object Store use it too, and count.',
    },
    {
      type: 'match',
      detail: true,
      needsScenario: true,
      prompt: 'Match each operation to its billable units.',
      pairs: [
        ['Retrieve one key with a 500 KB payload', '5 units'],
        ['Store one item of 101 KB', '2 units'],
        ['Delete a store that has two partitions', '3 units'],
        ['A request rejected with HTTP 429', '0 units'],
      ],
      explain: 'TPS and billing are calculated separately. Each 100 KB counts as a unit, and only successful (2xx) effective requests count toward billing. For a store delete, the call is one unit and each partition adds one.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A nightly job calls **Retrieve All Keys** on a partition of large values, only to count the keys. Why is finance surprised by the bill?',
      options: [
        'Billable units for Retrieve All and Retrieve All Keys are based on the size of all key-value pairs in the partition, not just the keys',
        'Retrieve All Keys is charged per key at a fixed rate of 1 unit per 25 keys, with no regard to size',
        'All read operations are free, so the job must be doing something else',
        'Each key is billed as a separate month of storage',
      ],
      answer: 0,
      explain: 'Retrieval is paged, with at most 25 keys per GET. The rate-limiting page gives an example: 1500 keys with a page size of 25 are throttled over 6 seconds on the base subscription.',
    },
    {
      type: 'multi',
      detail: true,
      needsScenario: true,
      prompt: 'Which statements about values, keys and regions are correct?',
      options: [
        'The overview gives a limit of 10 MB when Base64 encoded, and its example converts a 7.5 MB payload to 10.24 MB',
        'A key can be up to 1024 bytes in UTF-8, pipe characters are not supported, and spaces are converted to plus characters',
        'The store stays in the region of the first deployment, even if the app is moved to another region',
        'An app deployed to a different region cannot access it, and there is no region failover',
        'If `persistent="false"` is set in the XML, the app still uses Object Store v2',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The FAQ says only that each value is limited to 10 MB, with no mention of encoding, so plan for the stricter Base64 reading. To use Object Store v2, the Persistent option must be selected for the object store configuration. To move both app and store, delete and upload the app in the new region, which loses the data.',
    },
  ],
  description: `
A telecom operator uses **Object Store v2** in four ways on CloudHub, and an architecture review has raised questions about each.

| Use | Details |
|---|---|
| Return deduplication | Business wants duplicates rejected for 90 days, \`entryTtl\` is 90 days |
| Order event deduplication | Peaks of 15 messages per second, Contains then Store for each message, base subscription |
| Document cache | Values between 1 MB and 9 MB, read many times per day |
| Reconciliation | Nightly job uses Retrieve All Keys to count entries |

The operator also plans to deploy the same apps to a second region. Finance has a question about a monthly report of effective API requests, and developers ask whether a read refreshes a key.

**Questions**
1. Explain rolling and static TTL, and review the return deduplication design.
2. Calculate the load of the order deduplication flow, and say what happens.
3. How is usage billed, and what is unusual about the nightly job?
4. What are the limits on keys and values?
5. What happens to the store when apps are deployed to a second region?
6. When should you stop using Object Store v2 and use something else?
`,
  answerTemplate: `## TTL

## Throughput

## Billing

## Keys and values

## Regions

## When to use something else
`,
  keyPoints: [
    'Empty Entry ttl gives rolling TTL on Mule 4.2.1 and later; a value gives static TTL.',
    'The maximum static TTL is 2592000 seconds; values outside the allowed range become 30 days without an error.',
    'Retrieve, Retrieve All, Retrieve All Keys and Store extend a rolling TTL. Contains, Clear and Remove do not.',
    'The limit is 10 TPS on the base subscription and 100 TPS on the premium add-on. The page text and the FAQ apply it per app, across all stores in the app, though the rate-limiting table says per store. Every request counts, including OS:KEY_NOT_FOUND.',
    'Exceeding the limit returns HTTP 429; those requests are not billed.',
    'Billing: one unit per 100 KB of payload, and Retrieve All and Retrieve All Keys are based on the size of all key-value pairs in the partition.',
    'Values up to 10 MB (the overview says when Base64 encoded, the FAQ does not mention encoding), keys up to 1024 bytes, no pipe characters, spaces become plus characters.',
    'Object Store v2 is regional, has no region failover, and stays in its original region if the app moves.',
    'Distributed locking is not available with Object Store v2 in CloudHub, so simultaneous updates from several workers can clash.',
  ],
  solution: `
**1. TTL.** With Entry ttl empty, a key has rolling TTL: access during the last seven days of a 30-day window extends it by 30 days, and each key tracks its own window. With a value, the TTL is static and evicts at that time. Setting 90 days gives 30 days, with no error. A 90-day business rule therefore needs a database. The docs are also not fully consistent here: the overview notes a maximum persistence of 30 days from creation, while the rolling TTL section says the maximum is unlimited if data keeps being accessed. Do not depend on rolling extension for records you must keep.

**2. Throughput.** Two requests per message at 15 messages per second is about 30 TPS, so the base limit of 10 TPS returns HTTP 429. Cutting to one call per message still gives 15 TPS, which is over the base limit, so upgrade to premium, slow the flow down, or move the idempotency check into a database. Check what else uses the store: enabling Object Store v2 means policies such as Rate Limiting and connectors such as Salesforce use it too.

**3. Billing.** Units follow payload size. A 9 MB read is about 90 units, so the document cache is costly if it is read many times a day. Retrieve All Keys is billed on the size of all key-value pairs in the partition, so the nightly count pays for every value. Keep your own counter, or use a partition with small values. If usage exceeds the licence, Object Store v2 continues to work and MuleSoft notifies your account team.

**4. Keys and values.** The overview applies the 10 MB limit to the Base64 form and shows 7.5 MB of raw data converting to 10.24 MB. The FAQ says only that each value is limited to 10 MB. Plan for the stricter reading, under which the 9 MB documents in the cache do not fit, so keep them in file or object storage and cache only a reference. Keys are up to 1024 bytes.

**5. Regions.** A store lives in the region of the first deployment. Apps in a second region get their own store and cannot read the first. Caches and tokens cannot be transferred to a secondary region. For cross-region state, bring your own external store.

**6. Alternatives.** Use a database for retention beyond 30 days and for system-of-record data, an external store such as Redis for cross-region state, and Anypoint MQ between apps. The FAQ says Object Store v2 is not designed for app-to-app communication.
`,
  followUps: [
    { q: 'Why might two workers both update the same key incorrectly?', a: 'The docs warn that the Distributed Locking feature is not available in CloudHub and CloudHub 2.0 when working with Object Store v2, so simultaneous updates can fail or clash. They suggest a distributed key-value store as a lock.' },
    { q: 'Why do values show as [binary value] in Runtime Manager?', a: 'Mule 4 wraps values in a Mule object and serializes them, and the UI cannot deserialize them. To read a value, use a retrieve flow in the app.' },
    { q: 'Do I lose data if I disable and later reenable Use Object Store v2?', a: 'The FAQ says the original key-value pairs persist as long as their TTL has not expired.' },
    { q: 'What is the monthly transaction allowance?', a: 'The rate-limiting page lists 26 million API requests per month on the base subscription and 100 million per premium add-on. If usage exceeds the licence, the service keeps working and your account team is notified.' },
  ],
}
