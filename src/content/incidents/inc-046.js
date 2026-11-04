export default {
  id: 'inc-046',
  category: 'incidents',
  title: 'Price Enrichment Transform Grows From 2 Minutes to 3 Hours',
  level: 'EXPERT',
  tags: ['dataweave', 'performance', 'algorithms', 'memory', 'big-data'],
  estMinutes: 40,
  investigation: {
    logs: [
      { text: '01:00:00.004 INFO  [catalog-enrichment] Starting enrichment products=150212 prices=451870', relevant: true, why: 'Both inputs grew ~7x; with a nested scan the work grows with their product (~50x).' },
      { text: '01:00:02.310 INFO  [catalog-enrichment] Files loaded', relevant: true, why: 'Loading takes 2 s, so I/O is not the bottleneck; the time goes into the transform.' },
      { text: '01:15:00.000 INFO  [metrics] cpu=100% gc.time=38% heap=91%', relevant: true, why: 'CPU-bound comparisons plus GC churn from the intermediate arrays each filter creates.' },
      { text: '01:30:00.000 INFO  [health] GET /health 200 (12 ms)', relevant: false },
      { text: '03:58:41.902 INFO  [catalog-enrichment] Transform finished in 10719 s', relevant: true, why: 'Almost 3 hours spent in a transform that is O(products x prices), and filtered twice.' },
      { text: '03:59:10.115 INFO  [catalog-enrichment] Published catalog.json size=612MB', relevant: false },
      { text: '04:00:00.000 INFO  [sftp] Connection to partner-sftp closed', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did runtime explode when data only grew ~7x?',
        options: [
          'Each product filters all prices, twice: the work is O(products x prices), so 7x more of each is ~50x more work',
          'The SFTP server became slow',
          'JSON output is slower than CSV',
          'The worker was downsized',
        ],
        answer: 0,
        explain: '150k x 450k x 2 is about 1.35 x 10^11 comparisons. Quadratic joins look fine on small data and explode with growth.',
      },
      {
        type: 'single',
        prompt: 'What is the best option **tonight**?',
        options: [
          'Upscale to 4 vCores',
          'Deploy the groupBy-indexed transform after diffing its output against last night on a copy of the files',
          'Split the job into two runs',
          'Increase the heap only',
        ],
        answer: 1,
        explain: 'The fix is small and low risk and removes the quadratic work. More vCores barely help a mostly single-threaded, algorithmic problem.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the **rewritten transform / redesign**?',
        options: [
          'Index prices once with `payload groupBy ((pr) -> pr.sku)` and look up per product',
          'Compute the per-product list once (do block / variable) and derive bestPrice from it',
          'Stream the output (deferred) or chunk the catalog; for larger volumes, a sorted merge join or a DB join',
          'Replace `filter` with `firstWith` inside the map, which makes it linear',
        ],
        answer: [0, 1, 2],
        explain: 'Index first, avoid duplicate scans, manage memory. `firstWith` inside map is still a scan per product (and returns only one price).',
      },
      {
        type: 'multi',
        prompt: 'Which belong in **prevention**?',
        options: [
          'Performance tests with 2-3x projected volumes',
          'Review rule: no filter/firstWith over a large collection inside map',
          'Alert when job duration trends towards the 06:00 SLA',
          'Only check functional correctness of the output',
        ],
        answer: [0, 1, 2],
        explain: 'The output was correct all along; only volume tests, complexity review and duration trends catch this.',
      },
    ],
  },
  description: `
## Symptoms
- The nightly \`catalog-enrichment\` job joins a **products** JSON file with a **prices** JSON file and publishes the result for the web shop by 06:00.
- A year ago it took 2 minutes. Last month 40 minutes. This week it takes **~3 hours**, missed the 06:00 deadline twice, and the worker is at **100% CPU** with high GC activity during the transform.
- No functional errors — the output is correct.

## Change / Context
- Data growth: products went from 20,000 to **150,000**, prices from 60,000 to **450,000** (several price lists per product).
- The transform (simplified):
\`\`\`
%dw 2.0
output application/json
---
vars.products map (p) -> p ++ {
  prices: payload filter ((pr) -> pr.sku == p.sku),
  bestPrice: min((payload filter ((pr) -> pr.sku == p.sku)).amount)
}
\`\`\`
- Both files are read fully into memory (\`vars.products\` from a File Read, \`payload\` from an SFTP read). Worker size: 1 vCore.

## Logs
\`\`\`
01:00:00.004 INFO  [catalog-enrichment] Starting enrichment products=150212 prices=451870
01:00:02.310 INFO  [catalog-enrichment] Files loaded
03:58:41.902 INFO  [catalog-enrichment] Transform finished in 10719 s
03:59:10.115 INFO  [catalog-enrichment] Published catalog.json size=612MB
\`\`\`

## Your tasks
1. Why did the runtime explode, when data only grew ~7x?
2. What can you do tonight to hit the deadline?
3. Rewrite the transform / redesign the job.
4. How do you prevent this?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'The transform is O(n x m): every product scans all prices — twice. 150k x 450k x 2 ≈ 135 billion comparisons, so runtime grows with the product of both sizes.',
    'Fix the algorithm: index prices once with groupBy (sku → list), then look up per product — O(n + m).',
    'Compute the filtered list once per product (variable / do block) instead of repeating the filter for bestPrice.',
    'Memory: reading both large files fully plus a 600 MB output needs heap; consider streaming the output, splitting work, or pre-sorted merge.',
    'Immediate: deploy the groupBy fix (low risk, same output) — verify with a diff of output on yesterday\'s files; scaling vCores alone barely helps.',
    'Prevention: performance tests with projected volumes, complexity review of DataWeave (no filter inside map over large data), and runtime trend alerts.',
  ],
  solution: `
## Diagnosis
For each of 150k products, the script filters **all** 450k prices — and does it **twice** (once for \`prices\`, once for \`bestPrice\`). That's about 150,000 × 450,000 × 2 ≈ **1.35 × 10^11** comparisons. Work grows with **products × prices**, so ~7x more products and ~7.5x more prices means ~50x more work — matching 2 min → hours. CPU is at 100% doing comparisons; GC is busy with intermediate arrays created by each filter.

## Immediate mitigation
The algorithmic fix is small and low risk, so it is the best "tonight" option: deploy the indexed version below, after diffing its output against last night's output on a copy of the files. Upscaling the worker helps very little because the transform is CPU-bound on mostly one thread and the complexity is the issue. If the fix cannot ship, run the job earlier and publish yesterday's catalog as a fallback.

## Root cause
A nested filter-inside-map join (quadratic) that was fine at small volumes, with no performance tests against expected growth.

## Permanent fix
\`\`\`
%dw 2.0
output application/json
var pricesBySku = payload groupBy ((pr) -> pr.sku)
---
vars.products map (p) -> do {
  var ps = pricesBySku[p.sku] default []
  ---
  p ++ { prices: ps, bestPrice: if (isEmpty(ps)) null else min(ps.amount) }
}
\`\`\`
- \`groupBy\` builds the index once (O(m)); each lookup is cheap, so total work is ~O(n + m).
- For memory: write the output with streaming where possible (\`deferred=true\` output for JSON), avoid keeping several copies in variables, or split the catalog into chunks/pages. For even larger volumes, sort both inputs by SKU and do a merge join, or push the join into a database.

## Prevention
- Performance test data jobs with 2–3x projected volumes.
- Code review rule: no \`filter\`/\`firstWith\` over a large collection inside \`map\` — index first.
- Track job duration over time and alert when it trends towards the SLA.
`,
  followUps: [
    { q: 'Why would adding vCores not fix this?', a: 'The cost is quadratic; doubling CPU halves at best a runtime that grows with the product of both inputs, and a single DataWeave transform does not parallelise this work automatically.' },
    { q: 'What does groupBy return in DataWeave?', a: 'An object whose keys are the grouping values and whose values are arrays of the matching items, so pricesBySku["SKU-1"] gives that SKU\'s prices.' },
    { q: 'What is deferred output in DataWeave?', a: 'With output application/json deferred=true, DataWeave streams the result to the consumer as it is produced instead of building the whole output in memory first, when the script allows it.' },
  ],
}
