import { diagram } from '../../arch/dsl.js'

export default {
  id: 'uc-117',
  category: 'use-cases',
  title: 'Scatter-Gather Price Comparison across Electronic Component Suppliers',
  level: 'ADVANCED',
  tags: ['scatter-gather', 'aggregation', 'timeouts', 'caching', 'b2b', 'performance'],
  estMinutes: 35,
  diagram: {
    task: 'draw the price comparison: the buyer portal and customer procurement systems, the Experience API, the Process API that fans out with Scatter-Gather, one System API per supplier and its supplier, the quote cache, the FX rates, and the latency monitoring.',
    checks: [
      { label: 'One Process API fans out to at least four supplier System APIs', rule: { type: 'each', of: 'process-api', edgeTo: { type: 'system-api', label: 'supplier' }, count: 4, some: true } },
      { label: 'Each supplier System API calls exactly one supplier', rule: { type: 'each', of: { type: 'system-api', label: 'supplier' }, edgeTo: 'external-api', count: 1, max: 1, min: 4 } },
      { label: 'Suppliers are reached only through System APIs', rule: { type: 'only-via', target: 'external-api', from: 'system-api' } },
      { label: 'The fan-out calls are sync calls with timeouts', rule: { type: 'lines', from: 'process-api', to: 'system-api', kind: 'sync' } },
      { label: 'Supplier quotes are cached', rule: { type: 'edge', from: 'process-api', to: 'cache' } },
      { label: 'Channels call one Experience API and never the suppliers', rule: { type: 'no-path', from: ['web-app', 'partner'], to: ['system-api', 'external-api'], unless: 'process-api' } },
      { label: 'Prices are converted with FX rates', rule: { type: 'path', from: 'process-api', to: { type: ['database', 'cache', 'external-api'], label: ['fx', 'currency', 'exchange rate'] } } },
      { label: 'Supplier latency and timeouts are monitored', rule: { type: 'path', from: 'process-api', to: 'monitoring' } },
    ],
    reference: diagram(
      {
        web: ['web-app', 'Buyer portal'],
        buy: ['partner', 'Customer procurement systems'],
        exp: ['experience-api', 'exp-part-pricing-api'],
        prc: ['process-api', 'prc-price-comparison (Scatter-Gather)'],
        cache: ['cache', 'Quote cache per supplier and part (5 min)'],
        s1: ['system-api', 'sys-supplier-a-api'],
        s2: ['system-api', 'sys-supplier-b-soap-api'],
        s3: ['system-api', 'sys-supplier-c-api'],
        s4: ['system-api', 'sys-supplier-d-api'],
        e1: ['external-api', 'Supplier A (REST)'],
        e2: ['external-api', 'Supplier B (SOAP)'],
        e3: ['external-api', 'Supplier C (REST, 5 req/s)'],
        e4: ['external-api', 'Supplier D (REST, OAuth)'],
        fx: ['system-api', 'sys-fx-rates-api'],
        fxdb: ['database', 'Daily FX rates'],
        mon: ['monitoring', 'Latency and timeouts per supplier'],
      },
      [
        'web -> exp', 'buy -> exp', 'exp -> prc', 'prc -> cache', 'prc -> s1', 'prc -> s2', 'prc -> s3', 'prc -> s4',
        's1 -> e1', 's2 -> e2', 's3 -> e3', 's4 -> e4', 'prc -> fx', 'fx -> fxdb', 'prc ~> mon',
      ],
    ),
  },
  description: `
An electronic components distributor also resells parts from **four franchised suppliers** when its own stock runs out. Buyers want one screen: for a manufacturer part number and quantity, show **price, stock and lead time** from every source, cheapest first.

Facts:
- Callers: the **buyer portal** (people) and **customer procurement systems** that call the API from their own ERP.
- About **200,000 lookups per day**, peaks of 30 per second. The portal needs an answer in **2.5 seconds**.
- Suppliers:
  - A: REST, fast (200 ms), prices in USD.
  - B: SOAP, 600 ms to 3 s, prices in EUR.
  - C: REST, **5 requests per second limit** for the account; HTTP 429 above it.
  - D: REST with OAuth 2.0 client credentials, sometimes down for hours.
- Supplier prices change at most a few times a day; stock changes all the time.
- Quantity breaks: price depends on the quantity (1+, 100+, 1,000+).
- All prices must be shown in the buyer's currency.

**Describe your solution:**
- How does one request fan out and come back together?
- What happens when one supplier is slow, down or rate limited?
- How do you stay inside supplier C's limit at 30 lookups per second?
- How are results normalised and compared?
`,
  answerTemplate: `## Fan-out

## Timeouts and partial results

## Rate limits and caching

## Normalising and ranking

## Monitoring
`,
  keyPoints: [
    'Scatter-Gather in the Process API calls one System API per supplier in parallel, so the total time is the slowest route, not the sum.',
    'Each route has its own timeout (about 2 s) and its own error handling that returns a "supplier unavailable" entry, so one failure never fails the whole answer.',
    'Each supplier System API hides its protocol, auth and units and returns one canonical quote model.',
    'Quotes are cached per supplier and part for a few minutes; supplier C also gets a request limit in its System API so the account limit is never crossed.',
    'Prices are converted with daily FX rates, matched to the requested quantity break, and sorted; the response says which suppliers are missing.',
  ],
  solution: `
\`\`\`
 Buyer portal / procurement systems -> exp-part-pricing-api -> prc-price-comparison
     prc -> quote cache
     prc -> Scatter-Gather: sys-supplier-a / b / c / d (each with its own timeout) -> suppliers
     prc -> sys-fx-rates-api
     prc ~> monitoring
\`\`\`

**Fan-out.** prc-price-comparison first looks in the cache for each supplier. Suppliers with no fresh quote go into a **Scatter-Gather** with one route each. Total time ≈ the slowest route, not 200 + 3,000 + ... ms. A **For Each** in sequence would blow the 2.5 second target on its own.

**Timeouts and partial results.** Scatter-Gather has a \`timeout\`, but if any route fails it raises \`MULE:COMPOSITE_ROUTING\` for the whole scope. So:
- give each HTTP request its own **response timeout** (2 s; B gets the most);
- wrap each route in a **Try** with On Error Continue that returns \`{ supplier: "B", status: "unavailable" }\`;
- the scope then always returns all routes, and the response lists missing suppliers instead of failing.
Supplier D is down for hours: a circuit breaker in sys-supplier-d-api stops calling it and answers "unavailable" at once.

**Rate limits and caching.** A cache per supplier and part (TTL 5 minutes for price, shorter for stock if the business accepts it) removes most repeated calls; popular parts are looked up by many buyers. For supplier C, sys-supplier-c-api applies its own limit (a shared counter in Object Store v2, or a queue in front) at 4 requests per second, and answers "rate limited, try again" for the rest. A 429 from C is never retried in a tight loop.

**Normalising and ranking.** Each System API returns the same model: \`{ supplier, mpn, currency, priceBreaks[], stock, leadTimeDays, status }\`. The Process API converts with the daily FX rates, picks the price break for the requested quantity, adds the distributor margin, and sorts by price, then lead time.

**Monitoring.** Publish per supplier: latency percentiles, timeouts, cache hit rate and share of "unavailable". These numbers are also used with the suppliers in quarterly reviews.
`,
  followUps: [
    { q: 'What happens in a Scatter-Gather when one route fails?', a: 'The whole scope raises a composite routing error. Wrap each route in a Try with On Error Continue so the other results still come back.' },
    { q: 'Why one System API per supplier instead of calling them all from the Process API?', a: 'Each supplier has its own protocol, authentication and units. The System API hides that and gives one canonical quote.' },
    { q: 'Why not retry supplier C when it returns 429?', a: 'Retries add more load against a limit that is already reached. Return the cached quote or mark it unavailable for this lookup.' },
    { q: 'How do you stop a slow supplier from making every lookup slow?', a: 'Give each route its own response timeout. Return a partial answer that names the missing supplier.' },
  ],
}
